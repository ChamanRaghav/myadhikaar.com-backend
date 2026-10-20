import type { User } from '../generated/prisma/client.js';

const PRIVATE = new Set(['google_sub', 'disabled', 'data']);

/** The user object the frontend sees (same shape Base44's auth.me() returned). */
export function userView(user: User, extra: Record<string, unknown> = {}): Record<string, unknown> {
  const carried = user.data && typeof user.data === 'object' && !Array.isArray(user.data) ? user.data : {};
  const fields = Object.fromEntries(Object.entries(user).filter(([k, v]) => !PRIVATE.has(k) && v !== null));
  return { ...carried, ...fields, ...extra };
}
