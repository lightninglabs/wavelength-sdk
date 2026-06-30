// Shared PascalCase -> camelCase logic, used by BOTH the type generator
// (scripts/gen-types.mts, at build time) and the runtime response mapping
// (packages/web, at request time). One implementation guarantees the generated
// types and the values the client returns always agree.

// ACRONYM_OVERRIDES holds field names where a plain lowercase-first-letter would
// read wrong. Extend this when a new acronym-led field appears (a stale entry is
// harmless -- the name just falls back to lowercase-first).
export const ACRONYM_OVERRIDES: Record<string, string> = {
  ID: 'id',
  VTXOs: 'vtxos',
  SendIntentID: 'sendIntentId',
};

// camelKey converts one Go/PascalCase field name to camelCase. Most names just
// lowercase the first letter; ACRONYM_OVERRIDES covers the few that need more.
export function camelKey(name: string): string {
  if (Object.prototype.hasOwnProperty.call(ACRONYM_OVERRIDES, name)) {
    return ACRONYM_OVERRIDES[name];
  }

  if (!name) {
    return name;
  }

  return name.charAt(0).toLowerCase() + name.slice(1);
}

// camelizeKeys recursively rewrites object keys to camelCase via camelKey.
// Arrays are walked; primitives pass through unchanged. This maps the daemon's
// PascalCase JSON responses onto the SDK's camelCase public shapes.
export function camelizeKeys<T = unknown>(value: unknown): T {
  return camelize(value) as T;
}

function camelize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(camelize);
  }

  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      out[camelKey(key)] = camelize(val);
    }
    return out;
  }

  return value;
}
