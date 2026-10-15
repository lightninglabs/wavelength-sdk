import { WavelengthError } from '@lightninglabs/wavelength-core';
import type { RuntimeConfig } from '@lightninglabs/wavelength-core';
import { RUNTIME_ASSET_DIGESTS } from './runtime-manifest.ts';

/**
 * A digest table keyed by runtime asset filename, each value an SRI-format
 * `sha256-<base64>` digest. RUNTIME_ASSET_DIGESTS is the pinned instance.
 */
export type RuntimeDigests = Readonly<Record<string, string>>;

/**
 * Computes the SRI-format SHA-256 digest (`sha256-<base64>`) of the given
 * bytes. Requires crypto.subtle, which exists only in secure contexts. That
 * is not otherwise guaranteed here: worker mode does not require a secure
 * context the way OPFS persistence does, and a missing Web Locks API only
 * degrades cross-tab detection to a warning rather than failing closed. So a
 * plain-HTTP host reaches this function with no crypto.subtle, and the guard
 * exists to fail with an actionable message instead of an opaque undefined
 * access. The worker mirrors this guard and its reasoning in
 * wavewalletdk-worker.js; keep the two in sync.
 */
export async function sha256Sri(bytes: ArrayBuffer): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new WavelengthError(
      'Wavelength runtime integrity verification requires crypto.subtle, ' +
        'which is only available in secure contexts (https or localhost).',
    );
  }

  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  let binary = '';
  for (const byte of new Uint8Array(digest)) {
    binary += String.fromCharCode(byte);
  }

  return `sha256-${btoa(binary)}`;
}

/**
 * Builds the failure for a runtime asset whose bytes did not match the pinned
 * digest. The phrase "failed integrity verification" is the wording of record
 * for {@link isRuntimeIntegrityMessage}: the worker raises the same text
 * inside its own scope (it cannot import this module), so keep the literal in
 * wavewalletdk-worker.js in sync with this one.
 */
export function assetIntegrityError(
  url: string,
  detail: string,
): WavelengthError {
  return new WavelengthError(
    `Wavelength runtime asset at ${url} failed integrity verification ` +
      `(${detail}). The hosted asset set most likely does not match the ` +
      'daemon release this SDK version is pinned to ' +
      '(RUNTIME_MANIFEST_VERSION); redeploy the matching release assets.',
    'asset_integrity_failed',
  );
}

/**
 * Reports whether a failure message came from {@link assetIntegrityError}.
 * Mirrors the isRuntimeAssetMessage pattern: the worker cannot send an error
 * code across postMessage, so the client recovers the classification from
 * the text. The two phrases are deliberately disjoint so a message can never
 * match both.
 */
export function isRuntimeIntegrityMessage(message: string): boolean {
  return /failed integrity verification/i.test(message);
}

/**
 * Verifies fetched asset bytes against the pinned digest for `name`,
 * throwing {@link assetIntegrityError} on mismatch. A missing table entry
 * fails closed: an asset the table does not know is treated as unverifiable,
 * not as exempt.
 */
export async function verifyAssetBytes(
  bytes: ArrayBuffer,
  name: string,
  url: string,
  digests: RuntimeDigests,
): Promise<void> {
  const expected = digests[name];
  if (!expected) {
    throw assetIntegrityError(url, `no digest pinned for ${name}`);
  }

  const actual = await sha256Sri(bytes);
  if (actual !== expected) {
    throw assetIntegrityError(url, `expected ${expected}`);
  }
}

let warnedDisabled = false;

/**
 * Maps the runtimeIntegrity option onto the digest table the loaders use:
 * the pinned table when on (the default), or null when explicitly disabled.
 * Disabling logs a one-time console warning so the switch is never silently
 * left off in production.
 */
export function resolveIntegrityDigests(
  runtimeIntegrity: boolean | undefined,
): RuntimeDigests | null {
  if (runtimeIntegrity === false) {
    if (!warnedDisabled) {
      warnedDisabled = true;
      console.warn(
        'Wavelength runtime integrity verification is disabled ' +
          '(runtimeIntegrity: false). Runtime assets will be executed ' +
          'without digest checks; do not ship this to production.',
      );
    }

    return null;
  }

  return RUNTIME_ASSET_DIGESTS;
}

/**
 * Refuses a mainnet start while runtime integrity verification is disabled,
 * with the same invalid_config error the other runtime config checks use.
 * Other networks keep the one-time warning from {@link resolveIntegrityDigests}.
 */
export function assertIntegrityForNetwork(
  config: RuntimeConfig,
  digests: RuntimeDigests | null,
): void {
  if (digests === null && config.network === 'mainnet') {
    throw new WavelengthError(
      'mainnet requires runtime integrity verification; remove ' +
        'runtimeIntegrity: false',
      'invalid_config',
    );
  }
}

/**
 * Resets the one-time disabled warning. Test-only: lets each test observe
 * the warning independently within a single process.
 */
export function resetIntegrityDisabledWarning(): void {
  warnedDisabled = false;
}
