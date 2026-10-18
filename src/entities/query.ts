import { BadRequestException, Logger } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';

export type FieldType = 'String' | 'Float' | 'Int' | 'Boolean' | 'Json' | 'DateTime';
export type Where = Record<string, unknown>;

export interface EntityMeta {
  name: string;
  fields: Map<string, FieldType>;
  /** Prisma delegate, e.g. prisma.wallet */
  delegate: any;
}

/** Managed by the server: readable and filterable, never written by clients. */
export const SYSTEM_FIELDS = new Set(['id', 'created_date', 'updated_date', 'created_by', 'created_by_id']);
const NON_NULL_FIELDS = SYSTEM_FIELDS;
const MAX_DEPTH = 6;

export const isEmailField = (field: string) => field === 'email' || field.endsWith('_email');

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date);

const isOperatorObject = (v: unknown): v is Record<string, unknown> =>
  isPlainObject(v) && Object.keys(v).length > 0 && Object.keys(v).every((k) => k.startsWith('$'));

/** Translates a Base44 (MongoDB-style) filter into a Prisma where clause. */
export function buildWhere(meta: EntityMeta, filter: unknown, depth = 0): Where {
  if (filter === undefined || filter === null) return {};
  if (!isPlainObject(filter)) throw new BadRequestException('Filter must be an object');
  if (depth > MAX_DEPTH) throw new BadRequestException('Filter is nested too deeply');
  const parts: Where[] = [];
  for (const [key, value] of Object.entries(filter)) {
    if (key === '$and' || key === '$or') {
      if (!Array.isArray(value)) throw new BadRequestException(`${key} must be an array`);
      const sub = value.map((v) => buildWhere(meta, v, depth + 1));
      parts.push(key === '$and' ? { AND: sub } : { OR: sub });
      continue;
    }
    const type = meta.fields.get(key);
    if (!type) throw new BadRequestException(`Unknown field "${key}" on ${meta.name}`);
    if (isOperatorObject(value)) {
      for (const [op, arg] of Object.entries(value)) parts.push(operator(key, type, op, arg));
    } else {
      parts.push(equals(key, type, value));
    }
  }
  return parts.length === 1 ? parts[0] : { AND: parts };
}

function equals(field: string, type: FieldType, value: unknown): Where {
  if (value === null) return { [field]: type === 'Json' ? { equals: Prisma.AnyNull } : null };
  if (type === 'Json') {
    if (typeof value === 'object') return { [field]: { equals: value } };
    // Like MongoDB, a single value also matches an array field that contains it
    return { OR: [{ [field]: { equals: value } }, { [field]: { array_contains: [value] } }] };
  }
  return { [field]: { equals: coerceFilterValue(type, value) } };
}

const orNull = (field: string, type: FieldType, where: Where): Where =>
  NON_NULL_FIELDS.has(field) ? where : { OR: [where, equals(field, type, null)] };

function operator(field: string, type: FieldType, op: string, arg: unknown): Where {
  switch (op) {
    case '$eq':
      return equals(field, type, arg);
    case '$ne':
      // MongoDB's $ne also matches documents where the field is missing
      return arg === null ? { NOT: equals(field, type, null) } : orNull(field, type, { NOT: equals(field, type, arg) });
    case '$in': {
      if (!Array.isArray(arg)) throw new BadRequestException(`$in on "${field}" needs an array`);
      if (type === 'Json' || arg.includes(null)) return { OR: arg.map((v) => equals(field, type, v)) };
      return { [field]: { in: arg.map((v) => coerceFilterValue(type, v)) } };
    }
    case '$nin':
      return orNull(field, type, { NOT: operator(field, type, '$in', arg) });
    case '$gt':
    case '$gte':
    case '$lt':
    case '$lte':
      if (type === 'Json' || type === 'Boolean') throw new BadRequestException(`${op} is not supported on "${field}"`);
      return { [field]: { [op.slice(1)]: coerceFilterValue(type, arg) } };
    case '$exists':
      return arg ? { NOT: equals(field, type, null) } : equals(field, type, null);
    default:
      throw new BadRequestException(`Unsupported operator ${op}`);
  }
}

function coerceFilterValue(type: FieldType, value: unknown): unknown {
  if (type === 'DateTime' && (typeof value === 'string' || typeof value === 'number')) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) throw new BadRequestException(`Invalid date: ${value}`);
    return date;
  }
  if (type === 'String' && typeof value === 'number') return String(value);
  return value;
}

/** "-created_date" or "name,-rating" → Prisma orderBy; nulls sort like MongoDB (lowest). */
export function buildOrderBy(meta: EntityMeta, sort?: string): Where[] {
  const parts = (sort ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const order: Where[] = parts.map((part) => {
    const desc = part.startsWith('-');
    const field = desc ? part.slice(1) : part.replace(/^\+/, '');
    const type = meta.fields.get(field);
    if (!type) throw new BadRequestException(`Unknown sort field "${field}" on ${meta.name}`);
    if (type === 'Json') throw new BadRequestException(`Can't sort by "${field}"`);
    const dir = desc ? 'desc' : 'asc';
    return { [field]: NON_NULL_FIELDS.has(field) ? dir : { sort: dir, nulls: desc ? 'last' : 'first' } };
  });
  if (!parts.length) order.push({ created_date: 'asc' });
  order.push({ id: 'asc' });
  return order;
}

/**
 * Prepares client data for a write: drops system and unknown fields (logged), lowercases
 * emails, and coerces form-style strings the way Base44 accepted them.
 */
export function cleanData(meta: EntityMeta, data: unknown, logger?: Logger): Record<string, unknown> {
  if (!isPlainObject(data)) throw new BadRequestException('Request body must be an object');
  const out: Record<string, unknown> = {};
  const unknown: string[] = [];
  for (const [field, value] of Object.entries(data)) {
    if (SYSTEM_FIELDS.has(field) || value === undefined) continue;
    const type = meta.fields.get(field);
    if (!type) {
      unknown.push(field);
      continue;
    }
    out[field] = coerceWriteValue(field, type, value);
  }
  if (unknown.length) logger?.warn(`Ignored unknown fields on ${meta.name}: ${unknown.join(', ')}`);
  return out;
}

function coerceWriteValue(field: string, type: FieldType, value: unknown): unknown {
  if (value === null) return type === 'Json' ? Prisma.DbNull : null;
  switch (type) {
    case 'String':
      if (typeof value === 'number' || typeof value === 'boolean') value = String(value);
      if (typeof value !== 'string') throw new BadRequestException(`"${field}" must be text`);
      return isEmailField(field) ? value.trim().toLowerCase() : value;
    case 'Float':
    case 'Int': {
      if (value === '') return null;
      const n = typeof value === 'string' ? Number(value) : value;
      if (typeof n !== 'number' || !Number.isFinite(n)) throw new BadRequestException(`"${field}" must be a number`);
      return type === 'Int' ? Math.trunc(n) : n;
    }
    case 'Boolean':
      if (value === 'true') return true;
      if (value === 'false') return false;
      if (typeof value !== 'boolean') throw new BadRequestException(`"${field}" must be true or false`);
      return value;
    case 'DateTime': {
      const date = new Date(value as string);
      if (Number.isNaN(date.getTime())) throw new BadRequestException(`"${field}" must be a date`);
      return date;
    }
    default:
      return value;
  }
}

/** Response shape: unset (null) fields are omitted, as Base44 did. */
export function serialize(row: Record<string, unknown>, hidden?: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (v === null || hidden?.includes(k)) continue;
    out[k] = v;
  }
  return out;
}

export function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}
