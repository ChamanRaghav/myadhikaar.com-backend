import Anthropic from '@anthropic-ai/sdk';
import {
  BadGatewayException, BadRequestException, Injectable, Logger, ServiceUnavailableException, UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.js';
import { toStrictSchema } from './json-schema.js';

export const DEFAULT_MODEL = 'claude-opus-5-5';
/** Server-side fallback: a request declined by safety classifiers is retried on a recommended model. */
export const FALLBACK_BETA = 'server-side-fallback-2026-07-01';
/** Files we've already stored (our bucket, and Base44's storage for migrated links). */
const LEGACY_FILE_HOSTS = ['qtrypzzcjebvfcihiynt.supabase.co'];
const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const;

export interface InvokeOptions {
  prompt: string;
  response_json_schema?: Record<string, unknown>;
  file_urls?: string[];
  add_context_from_internet?: boolean;
}

type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly client?: Anthropic;

  constructor(private readonly config: ConfigService<Env, true>) {
    const apiKey = config.get('ANTHROPIC_API_KEY', { infer: true });
    if (apiKey) this.client = new Anthropic({ apiKey });
  }

  get model(): string {
    return this.config.get('ANTHROPIC_MODEL', { infer: true }) || DEFAULT_MODEL;
  }

  get anthropic(): Anthropic {
    if (!this.client) throw new ServiceUnavailableException('AI is not configured');
    return this.client;
  }

  /**
   * Base44's InvokeLLM: answers a prompt, optionally with attached files, web search, and
   * a JSON schema. Returns text, or the parsed object when a schema is given.
   */
  async invoke(opts: InvokeOptions, effort: Effort = 'medium'): Promise<unknown> {
    if (!opts.prompt?.trim()) throw new BadRequestException('prompt is required');
    const content: Anthropic.Beta.BetaContentBlockParam[] = [
      ...(await this.attachments(opts.file_urls ?? [])),
      { type: 'text', text: opts.prompt },
    ];
    const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: 'user', content }];
    const schema = opts.response_json_schema;
    const tools: Anthropic.Beta.BetaToolUnion[] | undefined = opts.add_context_from_internet
      ? [{ type: 'web_search_20260209', name: 'web_search', max_uses: 5 }]
      : undefined;

    // Web search can pause a long turn; resume it a few times
    for (let attempt = 0; attempt < 4; attempt++) {
      const message = await this.anthropic.beta.messages
        .stream({
          model: this.model,
          max_tokens: 32000,
          betas: [FALLBACK_BETA],
          fallbacks: 'default',
          output_config: { effort, ...(schema ? { format: { type: 'json_schema', schema: toStrictSchema(schema) } } : {}) },
          ...(tools ? { tools } : {}),
          messages,
        })
        .finalMessage();

      if (message.stop_reason === 'refusal') throw new UnprocessableEntityException('The AI declined this request');
      if (message.stop_reason === 'pause_turn') {
        messages.push({ role: 'assistant', content: message.content as Anthropic.Beta.BetaContentBlockParam[] });
        continue;
      }
      const text = message.content
        .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('');
      if (!schema) return text;
      if (message.stop_reason === 'max_tokens') throw new BadGatewayException('The AI response was cut off');
      try {
        return JSON.parse(text);
      } catch {
        this.logger.warn('Structured output was not valid JSON');
        throw new BadGatewayException('The AI returned an invalid response');
      }
    }
    throw new BadGatewayException('The AI did not finish');
  }

  /** PDFs and images from our own storage, sent inline so private bucket URLs work too. */
  private async attachments(urls: string[]): Promise<Anthropic.Beta.BetaContentBlockParam[]> {
    if (urls.length > 5) throw new BadRequestException('At most 5 files');
    const blocks: Anthropic.Beta.BetaContentBlockParam[] = [];
    for (const raw of urls) {
      const url = this.allowedFileUrl(raw);
      const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
      if (!res.ok) throw new BadRequestException(`Could not read file ${url.pathname.split('/').pop()}`);
      const type = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
      const bytes = Buffer.from(await res.arrayBuffer());
      if (bytes.length > MAX_ATTACHMENT_BYTES) throw new BadRequestException('File is larger than 20 MB');
      const data = bytes.toString('base64');
      if (type === 'application/pdf' || url.pathname.toLowerCase().endsWith('.pdf')) {
        blocks.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } });
      } else if ((IMAGE_TYPES as readonly string[]).includes(type)) {
        blocks.push({ type: 'image', source: { type: 'base64', media_type: type as (typeof IMAGE_TYPES)[number], data } });
      } else {
        throw new BadRequestException('Only PDF and image files can be analysed');
      }
    }
    return blocks;
  }

  /** Only fetch from our own file hosts, never arbitrary URLs (SSRF). */
  allowedFileUrl(raw: string): URL {
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      throw new BadRequestException('Invalid file URL');
    }
    const publicUrl = this.config.get('S3_PUBLIC_URL', { infer: true });
    const hosts = [...LEGACY_FILE_HOSTS, ...(publicUrl ? [new URL(publicUrl).host] : [])];
    if (url.protocol !== 'https:' || !hosts.includes(url.host)) throw new BadRequestException('Files must be uploaded to MyAdhikaar first');
    return url;
  }
}
