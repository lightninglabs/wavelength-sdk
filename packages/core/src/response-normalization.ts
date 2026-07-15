import { camelizeKeys } from './casing.ts';
import type { FacadeMethod } from './facade.ts';
import type { Entry } from './generated.ts';
import { normalizeInfo } from './state.ts';

type ObjectValue = Record<string, unknown>;

function object(value: unknown): ObjectValue | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as ObjectValue
    : undefined;
}

function nilPointer(value: unknown): unknown {
  return value === null ? undefined : value;
}

function nilSlice(value: unknown): unknown[] | unknown {
  return value === null ? [] : value;
}

function mapEntries(value: unknown): unknown {
  const entries = nilSlice(value);
  return Array.isArray(entries) ? entries.map(normalizeEntry) : entries;
}

function normalizeOptionalObject(
  value: unknown,
  transform: (value: ObjectValue) => ObjectValue,
): unknown {
  if (value === null) return undefined;
  const record = object(value);
  return record ? transform(record) : value;
}

export function normalizeEntry(raw: unknown): Entry {
  const camel = camelizeKeys(raw);
  const entry = object(camel);
  if (!entry) return camel as Entry;
  return {
    ...entry,
    progress: nilPointer(entry.progress),
    request: nilPointer(entry.request),
  } as Entry;
}

export function normalizeFacadeResult<T = unknown>(
  method: FacadeMethod,
  raw: unknown,
): T {
  const camel = camelizeKeys(raw);
  if (method === 'getInfo') return normalizeInfo(camel) as T;
  const result = object(camel);
  if (!result) return camel as T;

  switch (method) {
  case 'createWallet':
  case 'openWalletFromPasskey':
    return { ...result, mnemonic: nilSlice(result.mnemonic) } as T;
  case 'prepareSend':
    return {
      ...result,
      selectedOutpoints: nilSlice(result.selectedOutpoints),
      creditPreview: nilPointer(result.creditPreview),
    } as T;
  case 'list': {
    const normalized = { ...result };
    if (Object.hasOwn(result, 'activity')) {
      normalized.activity = normalizeOptionalObject(result.activity, (activity) => ({
        ...activity,
        entries: mapEntries(activity.entries),
      }));
    }
    if (Object.hasOwn(result, 'vtxos')) {
      normalized.vtxos = normalizeOptionalObject(result.vtxos, (inventory) => ({
        ...inventory,
        vtxos: nilSlice(inventory.vtxos),
      }));
    }
    if (Object.hasOwn(result, 'onchain')) {
      normalized.onchain = normalizeOptionalObject(result.onchain, (history) => ({
        ...history,
        txs: nilSlice(history.txs),
      }));
    }
    return normalized as T;
  }
  case 'exit':
    return { ...result, queuedOutpoints: nilSlice(result.queuedOutpoints) } as T;
  case 'exitStatus':
    return {
      ...result,
      progress: nilPointer(result.progress),
      cSV: nilPointer(result.cSV),
      fees: nilPointer(result.fees),
    } as T;
  case 'exitSummary':
    return { ...result, exits: nilSlice(result.exits) } as T;
  case 'getExitPlan':
    return { ...result, plans: nilSlice(result.plans) } as T;
  case 'sweepWallet':
    return { ...result, inputs: nilSlice(result.inputs) } as T;
  case 'deposit':
  case 'receive':
  case 'sendPrepared':
    return {
      ...result,
      entry: result.entry === undefined
        ? undefined
        : normalizeEntry(result.entry),
    } as T;
  default:
    return result as T;
  }
}
