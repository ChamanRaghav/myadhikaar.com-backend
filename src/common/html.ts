export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Escapes every string inside a value, keeping its shape. */
export function escapeDeep<T>(value: T): T {
  if (typeof value === 'string') return escapeHtml(value) as T;
  if (Array.isArray(value)) return value.map(escapeDeep) as T;
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, escapeDeep(v)])) as T;
  }
  return value;
}
