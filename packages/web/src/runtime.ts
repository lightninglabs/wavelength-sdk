import { WalletDKError } from '@lightninglabs/wavelength-core';
import { RUNTIME_ASSETS } from './runtime-manifest';
import { errorMessage } from './util';

/**
 * Resolves a runtime asset name against an optional base URL. With no base the
 * bare name is returned so it resolves relative to the page; otherwise the name
 * is resolved against the base (a trailing slash is added when missing).
 */
export function resolveRuntimeAsset(
  base: string | undefined,
  name: string,
): string {
  if (!base) {
    return name;
  }

  return new URL(name, base.endsWith('/') ? base : base + '/').href;
}

/**
 * Builds an actionable failure for a runtime binary that could not be loaded: it
 * names the URL that failed and points at runtimeBaseUrl, which is almost always
 * the cause (assets not hosted, or the base set wrong). The daemon binaries to
 * host are listed in RUNTIME_ASSET_FILES.
 */
export function runtimeAssetError(url: string): WalletDKError {
  return new WalletDKError(
    `walletdk runtime asset could not be loaded from ${url}. Host the daemon ` +
      'runtime assets (RUNTIME_ASSET_FILES) and point runtimeBaseUrl at them.',
    'asset_load_failed',
  );
}

/**
 * Injects a `<script>` tag for the given source and resolves once it loads. A
 * second call for an already-present src resolves immediately, so the same asset
 * is never loaded twice.
 */
export function loadScript(src: string): Promise<void> {
  const existing = document.querySelector(`script[src="${src}"]`);
  if (existing) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = false;
    script.onload = () => resolve();
    script.onerror = () => reject(runtimeAssetError(src));
    document.head.append(script);
  });
}

/**
 * Resolves once the wasm runtime is ready, either immediately when the global
 * walletdkCall hook is already installed or on the next 'walletdk-ready' event.
 */
export function waitForReadyEvent(): Promise<void> {
  if (typeof walletdkCall() === 'function') {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    globalThis.addEventListener('walletdk-ready', () => resolve(), {
      once: true,
    });
  });
}

/**
 * Returns the global walletdkCall hook the wasm runtime installs, or undefined
 * before the runtime has booted.
 */
export function walletdkCall() {
  return (
    globalThis as typeof globalThis & {
      walletdkCall?: (method: string, params?: unknown) => Promise<unknown>;
    }
  ).walletdkCall;
}

/**
 * Instantiates the wasm module, preferring the gzip-compressed binary when the
 * browser supports DecompressionStream and falling back to the raw binary
 * (logging a warning) if the compressed path fails.
 */
export async function instantiateWasm(
  importObject: WebAssembly.Imports,
  base: string | undefined,
) {
  if ('DecompressionStream' in globalThis) {
    try {
      return await instantiateCompressedWasm(importObject, base);
    } catch (err) {
      console.warn(`compressed wasm load failed: ${errorMessage(err)}`);
    }
  }

  return instantiateRawWasm(importObject, base);
}

/**
 * Fetches the gzip-compressed wasm binary, inflates it through a
 * DecompressionStream, and instantiates the resulting bytes.
 */
export async function instantiateCompressedWasm(
  importObject: WebAssembly.Imports,
  base: string | undefined,
) {
  const url = resolveRuntimeAsset(base, RUNTIME_ASSETS.wasmGz);
  const response = await fetch(url);
  if (!response.ok) {
    throw runtimeAssetError(url);
  }

  const body = response.body;
  if (!body) {
    throw new WalletDKError('walletdk compressed wasm response is empty');
  }

  const stream = body.pipeThrough(new DecompressionStream('gzip'));
  const bytes = await new Response(stream).arrayBuffer();

  return WebAssembly.instantiate(bytes, importObject);
}

/**
 * Fetches the uncompressed wasm binary and instantiates it via streaming
 * compilation.
 */
export async function instantiateRawWasm(
  importObject: WebAssembly.Imports,
  base: string | undefined,
) {
  const url = resolveRuntimeAsset(base, RUNTIME_ASSETS.wasm);
  const response = await fetch(url);
  if (!response.ok) {
    throw runtimeAssetError(url);
  }

  try {
    return await WebAssembly.instantiateStreaming(response, importObject);
  } catch {
    // instantiateStreaming requires the host to serve the wasm as
    // application/wasm; fall back to ArrayBuffer instantiation so a
    // misconfigured MIME type does not break self-hosted runtimes.
    const retry = await fetch(url);
    if (!retry.ok) {
      throw runtimeAssetError(url);
    }
    const bytes = await retry.arrayBuffer();
    return WebAssembly.instantiate(bytes, importObject);
  }
}

/**
 * The base the worker resolves daemon assets against when the consumer leaves
 * runtimeBaseUrl unset. The worker resolves bare asset names against its own
 * bundled URL rather than the page, so to match main-thread mode (which resolves
 * page-relative) we hand it the document's directory. Falls back to '' off the
 * main thread, where the worker cannot run.
 */
export function defaultWorkerRuntimeBaseUrl(): string {
  if (typeof document !== 'undefined' && document.baseURI) {
    return new URL('.', document.baseURI).href;
  }

  return '';
}
