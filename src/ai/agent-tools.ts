import type Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import type { AuthUser } from '../common/auth-user.js';
import type { EntitiesService } from '../entities/entities.service.js';
import { SERVICE_CATALOG } from '../payments/service-catalog.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { ratePerMinute } from '../sessions/sessions.service.js';

/** Tools the legal assistant can use. They act as the signed-in user, through the same access policies. */

const text = (v: unknown) => String(v ?? '').toLowerCase();
const matches = (query: string | undefined, ...fields: unknown[]) =>
  !query || query.toLowerCase().split(/\s+/).filter(Boolean).some((word) => fields.some((f) => text(Array.isArray(f) ? f.join(' ') : f).includes(word)));

const schemas = {
  search_lawyers: z.object({ query: z.string().max(200).optional(), city: z.string().max(80).optional(), limit: z.number().int().min(1).max(10).optional() }),
  list_legal_services: z.object({ query: z.string().max(200).optional() }),
  search_blogs: z.object({ query: z.string().max(200) }),
  create_service_request: z.object({
    service_title: z.string().min(1).max(200),
    description: z.string().min(1).max(4000),
    client_name: z.string().max(120).optional(),
    client_phone: z.string().max(20).optional(),
  }),
  schedule_consultation: z.object({
    lawyer_id: z.string().min(1).max(40),
    mode: z.enum(['audio', 'video', 'chat']),
    scheduled_date: z.string().max(40).optional(),
    notes: z.string().max(2000).optional(),
  }),
  my_bookings: z.object({}),
};

export type ToolName = keyof typeof schemas;

const string = (description: string) => ({ type: 'string', description });

export const AGENT_TOOLS: Anthropic.Beta.BetaToolUnion[] = [
  {
    name: 'search_lawyers',
    description:
      "Find verified, active advocates. Returns each lawyer's id, name, city, specializations, languages, rating, experience, per-minute call and chat rates, and whether they're online now. Use before recommending or booking a lawyer.",
    input_schema: {
      type: 'object',
      properties: {
        query: string('Legal issue or practice area, e.g. "bail", "divorce", "property dispute"'),
        city: string('City to prefer, if the user mentioned one'),
        limit: { type: 'integer', description: 'How many lawyers to return (1-10, default 5)' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'list_legal_services',
    description: 'List legal services MyAdhikaar offers (registrations, filings, notices…) with their package prices in ₹.',
    input_schema: { type: 'object', properties: { query: string('Optional keyword, e.g. "GST" or "trademark"') }, additionalProperties: false },
  },
  {
    name: 'search_blogs',
    description: 'Search published MyAdhikaar legal guides and articles. Returns title, link and summary.',
    input_schema: { type: 'object', properties: { query: string('What to look for') }, required: ['query'], additionalProperties: false },
  },
  {
    name: 'create_service_request',
    description:
      "Submit a request for a legal service (or a scheduled callback) for the signed-in user. The team contacts them; services are paid separately on the website. Only call after the user has confirmed.",
    input_schema: {
      type: 'object',
      properties: {
        service_title: string('Service name, e.g. "GST Registration" or "Scheduled call with Adv. Rao"'),
        description: string('What the user needs, including preferred mode and time for calls'),
        client_name: string("User's name if they gave it"),
        client_phone: string("User's phone number if they gave it"),
      },
      required: ['service_title', 'description'],
      additionalProperties: false,
    },
  },
  {
    name: 'schedule_consultation',
    description:
      'Book a consultation with a lawyer for the signed-in user. lawyer_id must come from search_lawyers. Calls are billed per minute from the wallet when they happen. Only call after the user has chosen the lawyer and mode.',
    input_schema: {
      type: 'object',
      properties: {
        lawyer_id: string('The lawyer id from search_lawyers'),
        mode: { type: 'string', enum: ['audio', 'video', 'chat'], description: 'How the user wants to talk' },
        scheduled_date: string('ISO 8601 date-time in India time (+05:30), if the user asked for a specific time'),
        notes: string('Short summary of the legal issue for the lawyer'),
      },
      required: ['lawyer_id', 'mode'],
      additionalProperties: false,
    },
  },
  {
    name: 'my_bookings',
    description: "The signed-in user's recent consultations and service requests.",
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
].map((tool) => ({ ...tool, eager_input_streaming: true })) as Anthropic.Beta.BetaToolUnion[];

export interface ToolContext {
  user?: AuthUser;
  prisma: PrismaService;
  entities: EntitiesService;
  appUrl: string;
}

const LOGIN_REQUIRED = 'The user is not signed in. Ask them to log in to MyAdhikaar first, then try again.';

/** Runs one tool call; returns the tool_result content and whether it failed. */
export async function runTool(name: string, rawInput: unknown, ctx: ToolContext): Promise<{ content: string; is_error?: boolean }> {
  const schema = schemas[name as ToolName];
  if (!schema) return { content: `Unknown tool ${name}`, is_error: true };
  // Streamed tool input isn't validated by the API, so check it here
  const parsed = schema.safeParse(rawInput);
  if (!parsed.success) return { content: `Invalid input: ${JSON.stringify(rawInput)}`, is_error: true };
  const input = parsed.data as Record<string, any>;

  switch (name as ToolName) {
    case 'search_lawyers': {
      const lawyers = await ctx.prisma.lawyer.findMany({ where: { status: 'active' }, orderBy: [{ is_online: { sort: 'desc', nulls: 'last' } }, { rating: { sort: 'desc', nulls: 'last' } }], take: 300 });
      const found = lawyers
        .filter((l) => matches(input.query, l.specializations, l.bio, l.full_name, l.court_of_practice))
        .sort((a, b) => Number(text(b.city) === text(input.city)) - Number(text(a.city) === text(input.city)))
        .slice(0, input.limit ?? 5)
        .map((l) => ({
          id: l.id,
          name: l.full_name,
          city: l.city,
          specializations: l.specializations,
          languages: l.languages,
          rating: l.rating,
          years_of_practice: l.years_of_practice,
          call_rate_per_min: ratePerMinute(l, 'call'),
          chat_rate_per_min: ratePerMinute(l, 'chat'),
          online_now: !!l.is_online,
          profile: `${ctx.appUrl}/lawyer/${l.id}`,
        }));
      return { content: JSON.stringify(found.length ? found : 'No matching lawyers found.') };
    }
    case 'list_legal_services': {
      const services = Object.entries(SERVICE_CATALOG)
        .filter(([slug, s]) => matches(input.query, s.title, slug))
        .map(([slug, s]) => ({ title: s.title, link: `${ctx.appUrl}/ServicePage?slug=${slug}`, packages: s.packages }));
      return { content: JSON.stringify(services.length ? services : 'No matching services found.') };
    }
    case 'search_blogs': {
      const posts = await ctx.prisma.blog.findMany({ where: { is_published: true }, orderBy: { created_date: 'desc' }, take: 500 });
      const found = posts
        .filter((p) => matches(input.query, p.title, p.excerpt, p.tags, p.focus_keyword))
        .slice(0, 5)
        .map((p) => ({ title: p.title, link: `${ctx.appUrl}/Blog/${p.slug || p.id}`, summary: p.excerpt }));
      return { content: JSON.stringify(found.length ? found : 'No matching articles found.') };
    }
    case 'create_service_request': {
      if (!ctx.user) return { content: LOGIN_REQUIRED, is_error: true };
      const sr = await ctx.entities.create('ServiceRequest', ctx.user, {
        service_title: input.service_title,
        description: input.description,
        client_name: input.client_name || ctx.user.full_name,
        client_phone: input.client_phone,
        category: 'ai_assistant',
      });
      return { content: JSON.stringify({ created: true, request_id: sr.id, status: sr.status }) };
    }
    case 'schedule_consultation': {
      if (!ctx.user) return { content: LOGIN_REQUIRED, is_error: true };
      const when = input.scheduled_date ? new Date(input.scheduled_date) : null;
      if (when && Number.isNaN(when.getTime())) return { content: 'scheduled_date is not a valid date', is_error: true };
      const consultation = await ctx.entities.create('Consultation', ctx.user, {
        lawyer_id: input.lawyer_id,
        consultation_type: input.mode === 'video' ? 'video' : 'audio',
        scheduled_date: (when ?? new Date()).toISOString(),
        notes: [input.mode === 'chat' ? 'Mode: chat' : '', input.notes].filter(Boolean).join(' — '),
        client_name: ctx.user.full_name,
      });
      return { content: JSON.stringify({ booked: true, consultation_id: consultation.id, lawyer: consultation.lawyer_name, when: consultation.scheduled_date }) };
    }
    case 'my_bookings': {
      if (!ctx.user) return { content: LOGIN_REQUIRED, is_error: true };
      const [consultations, requests] = await Promise.all([
        ctx.entities.list('Consultation', ctx.user, { sort: '-created_date', limit: 5 }),
        ctx.entities.list('ServiceRequest', ctx.user, { sort: '-created_date', limit: 5 }),
      ]);
      return {
        content: JSON.stringify({
          consultations: consultations.map((c) => ({ lawyer: c.lawyer_name, status: c.status, when: c.scheduled_date, type: c.consultation_type })),
          service_requests: requests.map((r) => ({ service: r.service_title, status: r.status, payment: r.payment_status })),
        }),
      };
    }
  }
}
