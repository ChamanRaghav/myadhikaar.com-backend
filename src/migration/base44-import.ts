import type { PrismaClient } from '../generated/prisma/client.js';
import { isEmailField, SYSTEM_FIELDS, type FieldType } from '../entities/query.js';

/** Every entity in the Base44 app (base44/entities in the frontend repo), in import order. */
export const BASE44_ENTITIES = [
  'User', 'Lawyer', 'LawyerApplication', 'Wallet', 'WalletTransaction', 'Consultation', 'Session', 'ChatMessage',
  'Message', 'Case', 'CaseDocument', 'Hearing', 'Dispute', 'Escalation', 'WithdrawalRequest', 'ServiceRequest',
  'ServiceCase', 'LegalService', 'PromoCode', 'Blog', 'HeroBanner', 'JobOpening', 'JobApplication', 'FleetOwner',
  'FleetVehicle', 'FleetDriver', 'FleetInvoice', 'RGLAdvocate', 'RGLCase', 'RGLReferral', 'RGLSubscription',
  'RGLWithdrawal', 'LGClient', 'LGCase', 'LGBeneficiary', 'LGCompliance', 'LGDocument', 'LGHearing', 'LGInvoice',
  'LGTask', 'LGTransaction',
] as const;

type Base44Record = Record<string, unknown>;

/** Reads one page of an entity; `cursor` is null for the first page. */
export type PageReader = (entity: string, cursor: string | null) => Promise<{ items: Base44Record[]; next_cursor: string | null }>;

export interface ImportOptions {
  dryRun?: boolean;
  /** Delete existing rows of each imported table first (for a clean re-run at cutover) */
  replace?: boolean;
  only?: string[];
  log?: (line: string) => void;
}

export interface EntityReport {
  entity: string;
  read: number;
  inserted: number;
  updated: number;
  skipped: number;
  droppedFields: Record<string, number>;
}

const USER_COLUMNS = new Set(['email', 'full_name', 'role', 'phone', 'city', 'notifications_enabled', 'avatar_url']);
const BATCH = 500;

/** Base44 REST API with an app admin's access token (localStorage "base44_access_token"). */
export function base44Reader(opts: { appId: string; token: string; serverUrl?: string; pageSize?: number }): PageReader {
  const base = `${opts.serverUrl ?? 'https://base44.app'}/api/apps/${opts.appId}/entities`;
  return async (entity, cursor) => {
    const params = new URLSearchParams({ limit: String(opts.pageSize ?? 1000), sort: 'created_date' });
    if (cursor) params.set('cursor', cursor);
    for (let attempt = 1; ; attempt++) {
      const res = await fetch(`${base}/${entity}/v2/list?${params}`, {
        headers: { Authorization: `Bearer ${opts.token}`, 'X-App-Id': opts.appId },
      });
      if (res.ok) return (await res.json()) as { items: Base44Record[]; next_cursor: string | null };
      if (attempt >= 4 || (res.status < 500 && res.status !== 429)) {
        throw new Error(`Base44 ${entity}: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
      }
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
    }
  };
}

/** Copies Base44 records into Postgres with the same ids and timestamps. Safe to re-run. */
export async function importFromBase44(prisma: PrismaClient, read: PageReader, opts: ImportOptions = {}): Promise<EntityReport[]> {
  const log = opts.log ?? console.log;
  const models = (prisma as unknown as { _runtimeDataModel: { models: Record<string, { dbName: string | null; fields: { name: string; kind: string; type: string }[] }> } })
    ._runtimeDataModel.models;
  const reports: EntityReport[] = [];

  for (const entity of BASE44_ENTITIES.filter((e) => !opts.only?.length || opts.only.includes(e))) {
    const model = models[entity];
    if (!model) throw new Error(`No Prisma model for ${entity}`);
    const fields = new Map(model.fields.filter((f) => f.kind === 'scalar').map((f) => [f.name, f.type as FieldType]));
    const delegate = (prisma as unknown as Record<string, { createMany: (a: object) => Promise<{ count: number }>; deleteMany: () => Promise<unknown> }>)[
      entity.charAt(0).toLowerCase() + entity.slice(1)
    ];
    const report: EntityReport = { entity, read: 0, inserted: 0, updated: 0, skipped: 0, droppedFields: {} };

    const rows: Record<string, unknown>[] = [];
    let cursor: string | null = null;
    do {
      const page = await read(entity, cursor);
      for (const record of page.items) {
        report.read++;
        const row = entity === 'User' ? convertUser(record, fields) : convert(record, fields, report);
        if (row) rows.push(row);
        else report.skipped++;
      }
      cursor = page.next_cursor;
    } while (cursor);

    if (!opts.dryRun) {
      if (opts.replace && entity !== 'User') await delegate.deleteMany();
      for (let i = 0; i < rows.length; i += BATCH) {
        // Existing ids are left alone, so a re-run only adds records created since
        const { count } = await delegate.createMany({ data: rows.slice(i, i + BATCH), skipDuplicates: true });
        report.inserted += count;
      }
      if (entity === 'User' && opts.replace) report.updated = await refreshUsers(prisma, rows);
    }
    const dropped = Object.entries(report.droppedFields).map(([f, n]) => `${f}×${n}`).join(', ');
    log(`${entity.padEnd(18)} read ${report.read}, ${opts.dryRun ? 'would insert' : 'inserted'} ${opts.dryRun ? rows.length : report.inserted}${report.skipped ? `, skipped ${report.skipped}` : ''}${dropped ? ` (unknown fields dropped: ${dropped})` : ''}`);
    reports.push(report);
  }
  return reports;
}

function convert(record: Base44Record, fields: Map<string, FieldType>, report: EntityReport): Record<string, unknown> | null {
  if (typeof record.id !== 'string') return null;
  const row: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    const type = fields.get(key);
    if (!type) {
      if (value !== null && value !== undefined) report.droppedFields[key] = (report.droppedFields[key] ?? 0) + 1;
      continue;
    }
    const converted = convertValue(key, value, type);
    if (converted !== undefined) row[key] = converted;
  }
  return row;
}

/** Users keep their id; profile fields become columns and the rest goes into `data`. */
function convertUser(record: Base44Record, fields: Map<string, FieldType>): Record<string, unknown> | null {
  const email = typeof record.email === 'string' ? record.email.trim().toLowerCase() : '';
  if (typeof record.id !== 'string' || !email) return null;
  const row: Record<string, unknown> = { id: record.id, email };
  const data: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (key === 'id' || key === 'email' || value === null || value === undefined) continue;
    if (USER_COLUMNS.has(key) || key === 'created_date' || key === 'updated_date') {
      const converted = convertValue(key, value, fields.get(key)!);
      if (converted !== undefined) row[key] = converted;
    } else if (!SYSTEM_FIELDS.has(key) && !key.startsWith('_') && key !== 'disabled') {
      data[key] = value;
    }
  }
  if (row.role !== 'admin') row.role = 'user';
  if (record.disabled === true) row.disabled = true;
  if (Object.keys(data).length) row.data = data;
  // Existing users already got their welcome email
  row.last_login_at = row.updated_date ?? row.created_date ?? new Date();
  return row;
}

function convertValue(key: string, value: unknown, type: FieldType): unknown {
  if (value === null || value === undefined) return undefined;
  switch (type) {
    case 'DateTime': {
      // Base44 timestamps are UTC, often without a zone suffix
      const text = String(value);
      const date = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(text) ? text : `${text}Z`);
      return Number.isNaN(date.getTime()) ? undefined : date;
    }
    case 'Float':
    case 'Int': {
      const n = typeof value === 'number' ? value : Number(value);
      if (!Number.isFinite(n) || (typeof value === 'string' && !value.trim())) return undefined;
      return type === 'Int' ? Math.round(n) : n;
    }
    case 'Boolean':
      return typeof value === 'boolean' ? value : value === 'true' ? true : value === 'false' ? false : undefined;
    case 'Json':
      return value;
    case 'String': {
      const text = typeof value === 'string' ? value : typeof value === 'object' ? JSON.stringify(value) : String(value);
      return isEmailField(key) ? text.trim().toLowerCase() : text;
    }
  }
}

/** Users aren't deleted by --replace (they hold logins), so existing ones are updated instead. */
async function refreshUsers(prisma: PrismaClient, rows: Record<string, unknown>[]): Promise<number> {
  let updated = 0;
  for (const { id, email, last_login_at: _, ...profile } of rows) {
    const { count } = await prisma.user.updateMany({ where: { id: id as string, email: email as string }, data: profile as never });
    updated += count;
  }
  return updated;
}
