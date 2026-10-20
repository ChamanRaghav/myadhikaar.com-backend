/**
 * Structured outputs accept a subset of JSON Schema: every object needs
 * additionalProperties: false, and numeric/length constraints aren't supported.
 * Schemas arrive from the frontend at runtime, so they are normalized here.
 */
const DROPPED = new Set([
  'minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf',
  'minLength', 'maxLength', 'pattern', 'minItems', 'maxItems', 'uniqueItems',
  'minProperties', 'maxProperties', 'default', 'examples', '$schema',
]);
const FORMATS = new Set(['date-time', 'time', 'date', 'duration', 'email', 'hostname', 'uri', 'ipv4', 'ipv6', 'uuid']);
const NESTED = new Set(['items', 'anyOf', 'allOf', 'not']);

export function toStrictSchema(schema: unknown): Record<string, unknown> {
  return normalize(schema) as Record<string, unknown>;
}

function normalize(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(normalize);
  if (!node || typeof node !== 'object') return node;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node)) {
    if (DROPPED.has(key)) continue;
    if (key === 'format' && !FORMATS.has(String(value))) continue;
    if (key === 'oneOf') out.anyOf = normalize(value);
    else if (key === 'properties' || key === '$defs' || key === 'definitions') {
      out[key] = Object.fromEntries(Object.entries(value as object).map(([k, v]) => [k, normalize(v)]));
    } else if (NESTED.has(key)) out[key] = normalize(value);
    else out[key] = value;
  }
  if (out.type === 'object' || out.properties) {
    out.properties ??= {};
    out.additionalProperties = false;
  }
  return out;
}
