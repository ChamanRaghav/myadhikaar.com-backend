import Anthropic from '@anthropic-ai/sdk';
import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter } from 'node:events';
import type { AuthUser } from '../common/auth-user.js';
import { newId } from '../common/ids.js';
import type { Env } from '../config/env.js';
import { EntitiesService } from '../entities/entities.service.js';
import type { AgentConversation, Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AGENT_TOOLS, runTool } from './agent-tools.js';
import { AiService, FALLBACK_BETA } from './ai.service.js';

const AGENTS = new Set(['legal_assistant']);
const MAX_TOOL_ROUNDS = 8;
const MAX_MESSAGE_CHARS = 8000;

const SYSTEM_PROMPT = `You are MyAdhikaar's AI legal assistant for people in India. You act on the user's behalf, not just advise them.

How to help:
1. Understand the legal problem. Ask at most one clarifying question, and only if you really need it.
2. Find matching advocates with search_lawyers, and legal services (registrations, filings, notices) with list_legal_services.
3. Present numbered options and ask which advocate or service the user wants.
4. When they pick an advocate, ask how they'd like to connect: 1) Chat 2) Audio call 3) Video call 4) Schedule a call.
5. When they choose, book it with schedule_consultation, or use create_service_request for services and callbacks, then confirm exactly what you did.
Do the work yourself with the tools instead of sending the user to other pages; share profile or service links when they help.

Format lawyers like this:
**1. Full Name** — [profile](link)
- City: … | Rating: … | Call ₹…/min · Chat ₹…/min
- Specializations: …

Format services like this:
**1. Title** — from ₹…

After listing options, end with: "Who would you like to connect with? Just reply with the number."

If a tool says the user isn't signed in, ask them to log in, then continue.
Only use lawyer ids returned by search_lawyers, and never invent lawyers, prices or bookings.
Give general legal information freely, but say when a question needs an advocate's advice on the specifics of the case.
Tone: warm, quick and action-oriented, without jargon. Reply in the user's language (Hindi or English).`;

export interface DisplayMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  file_urls?: string[];
  created_date: string;
}

type ApiMessage = Anthropic.Beta.BetaMessageParam;

@Injectable()
export class AgentsService {
  private readonly logger = new Logger(AgentsService.name);
  /** Live updates for conversations replying on this instance */
  private readonly updates = new EventEmitter().setMaxListeners(0);
  private readonly running = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
    private readonly entities: EntitiesService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async create(user: AuthUser | undefined, body: { agent_name?: string; metadata?: Record<string, unknown> }) {
    if (!body.agent_name || !AGENTS.has(body.agent_name)) throw new NotFoundException('Unknown agent');
    const conversation = await this.prisma.agentConversation.create({
      data: {
        agent_name: body.agent_name,
        user_email: user?.email ?? null,
        metadata: (body.metadata ?? {}) as Prisma.InputJsonValue,
      },
    });
    return this.view(conversation);
  }

  async get(user: AuthUser | undefined, id: string) {
    return this.view(await this.load(user, id));
  }

  /** Adds the user's message and starts the reply in the background (it arrives via subscribe). */
  async addMessage(user: AuthUser | undefined, id: string, body: { role?: string; content?: string; file_urls?: string[] }) {
    const content = body.content?.trim();
    if ((body.role ?? 'user') !== 'user' || !content) throw new BadRequestException('Send a user message with content');
    if (content.length > MAX_MESSAGE_CHARS) throw new BadRequestException('Message is too long');
    const fileUrls = (body.file_urls ?? []).map((u) => this.ai.allowedFileUrl(u).toString());
    if (fileUrls.length > 3) throw new BadRequestException('At most 3 files per message');

    const conversation = await this.load(user, id);
    if (this.running.has(id)) throw new ConflictException('Still replying to your previous message');

    const display: DisplayMessage = {
      id: newId(),
      role: 'user',
      content,
      ...(fileUrls.length ? { file_urls: fileUrls } : {}),
      created_date: new Date().toISOString(),
    };
    const saved = await this.save(id, {
      messages: [...this.displayOf(conversation), display],
      history: [...this.historyOf(conversation), { role: 'user', content: [...fileUrls.map(fileBlock), { type: 'text', text: content }] }],
    });
    this.running.add(id);
    void this.reply(saved, user).finally(() => this.running.delete(id));
    return this.view(saved);
  }

  /** Server-Sent Events: the conversation now, then every change. */
  subscribe(user: AuthUser | undefined, id: string, send: (data: unknown) => void, onClose: (cleanup: () => void) => void): Promise<void> {
    return this.load(user, id).then((conversation) => {
      send(this.view(conversation));
      const listener = (data: unknown) => send(data);
      this.updates.on(id, listener);
      // Another instance may be replying: re-read now and then as a fallback
      let lastUpdate = conversation.updated_date.getTime();
      const poll = setInterval(async () => {
        const latest = await this.prisma.agentConversation.findUnique({ where: { id } }).catch(() => null);
        if (latest && latest.updated_date.getTime() > lastUpdate && !this.running.has(id)) {
          lastUpdate = latest.updated_date.getTime();
          send(this.view(latest));
        }
      }, 3000);
      onClose(() => {
        clearInterval(poll);
        this.updates.off(id, listener);
      });
    });
  }

  private async reply(conversation: AgentConversation, user: AuthUser | undefined): Promise<void> {
    const id = conversation.id;
    const display = this.displayOf(conversation);
    const history = this.historyOf(conversation);
    const answer: DisplayMessage = { id: newId(), role: 'assistant', content: '', created_date: new Date().toISOString() };
    let lastPublish = 0;
    const publish = () => {
      if (Date.now() - lastPublish < 120) return;
      lastPublish = Date.now();
      // The chat shows a typing indicator until the first words arrive
      const messages = answer.content ? [...display, answer] : display;
      this.updates.emit(id, { ...this.view(conversation), messages });
    };

    try {
      for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        if (answer.content && !answer.content.endsWith('\n')) answer.content += '\n\n';
        const stream = this.ai.anthropic.beta.messages.stream({
          model: this.ai.model,
          max_tokens: 16000,
          betas: [FALLBACK_BETA],
          fallbacks: 'default',
          output_config: { effort: 'medium' },
          system: [
            { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
            { type: 'text', text: this.contextLine(user) },
          ],
          tools: AGENT_TOOLS,
          messages: history,
        });
        stream.on('text', (delta) => {
          answer.content += delta;
          publish();
        });
        const message = await stream.finalMessage();
        history.push({ role: 'assistant', content: echoable(message.content) });

        if (message.stop_reason === 'refusal') {
          if (!answer.content.trim()) answer.content = "Sorry, I can't help with that request.";
          break;
        }
        if (message.stop_reason === 'pause_turn') continue;
        const calls = message.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use');
        if (message.stop_reason !== 'tool_use' || !calls.length) break;

        const results = await Promise.all(
          calls.map(async (call) => {
            const result = await runTool(call.name, call.input, {
              user,
              prisma: this.prisma,
              entities: this.entities,
              appUrl: this.config.get('APP_URL', { infer: true }),
            }).catch((err: Error) => ({ content: `Tool failed: ${err.message}`, is_error: true }));
            return { type: 'tool_result' as const, tool_use_id: call.id, ...result };
          }),
        );
        history.push({ role: 'user', content: results });
      }
      if (!answer.content.trim()) answer.content = 'Sorry, I could not finish that. Please try again.';
    } catch (err) {
      this.logger.error(`Agent reply failed for ${id}: ${(err as Error).message}`);
      answer.content = (answer.content ? answer.content + '\n\n' : '') + 'Sorry, something went wrong. Please try again.';
    }

    answer.content = answer.content.trim();
    const saved = await this.save(id, { messages: [...display, answer], history });
    this.updates.emit(id, this.view(saved));
  }

  private contextLine(user: AuthUser | undefined): string {
    const today = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'full', timeStyle: 'short' });
    return `Now: ${today} (India time). ${user ? `The user is signed in as ${user.full_name || 'a client'}.` : 'The user is not signed in.'}`;
  }

  private async load(user: AuthUser | undefined, id: string): Promise<AgentConversation> {
    const conversation = await this.prisma.agentConversation.findUnique({ where: { id } });
    // A guest conversation's unguessable id is its key; a user's is theirs alone
    if (!conversation || (conversation.user_email && conversation.user_email !== user?.email && user?.role !== 'admin')) {
      throw new NotFoundException('Conversation not found');
    }
    return conversation;
  }

  private save(id: string, data: { messages: DisplayMessage[]; history: ApiMessage[] }) {
    return this.prisma.agentConversation.update({
      where: { id },
      data: { messages: data.messages as unknown as Prisma.InputJsonValue, history: data.history as unknown as Prisma.InputJsonValue },
    });
  }

  private displayOf(c: AgentConversation): DisplayMessage[] {
    return (c.messages as unknown as DisplayMessage[]) ?? [];
  }

  private historyOf(c: AgentConversation): ApiMessage[] {
    return (c.history as unknown as ApiMessage[]) ?? [];
  }

  private view(c: AgentConversation) {
    return { id: c.id, agent_name: c.agent_name, metadata: c.metadata, messages: this.displayOf(c), created_date: c.created_date };
  }
}

/** Uploaded files go to Claude by URL (our bucket is public), keeping stored history small. */
function fileBlock(url: string): Anthropic.Beta.BetaContentBlockParam {
  const path = new URL(url).pathname.toLowerCase();
  if (path.endsWith('.pdf')) return { type: 'document', source: { type: 'url', url } };
  if (/\.(png|jpe?g|gif|webp)$/.test(path)) return { type: 'image', source: { type: 'url', url } };
  return { type: 'text', text: `(The user attached a file in a format that can't be read here: ${url})` };
}

/**
 * Content to send back on the next turn. After a fallback mid-answer, blocks from the
 * declined attempt (before the last `fallback` marker) are dropped except text and paired
 * server-tool blocks; everything else is replayed unchanged.
 */
export function echoable(content: Anthropic.Beta.BetaContentBlock[]): Anthropic.Beta.BetaContentBlockParam[] {
  const boundary = content.map((b) => b.type).lastIndexOf('fallback');
  if (boundary < 0) return content as unknown as Anthropic.Beta.BetaContentBlockParam[];
  const resultIds = new Set(
    content.filter((b) => b.type === 'web_search_tool_result').map((b) => (b as { tool_use_id: string }).tool_use_id),
  );
  return content.filter((b, i) => {
    if (i >= boundary) return true;
    if (b.type === 'text' || b.type === 'web_search_tool_result') return true;
    if (b.type === 'server_tool_use') return resultIds.has(b.id);
    return false;
  }) as unknown as Anthropic.Beta.BetaContentBlockParam[];
}
