// Compile-time contract test for WebWalletEngineOptions, mirroring
// packages/core/src/engine/optionsAssertions.ts. This module has no
// meaningful runtime behavior: it exists so `pnpm typecheck` enforces that
// autoStart: true still requires config once WalletEngineOptions is combined
// with WebClientOptions through DistributiveOmit. It is a plain .ts file
// under src/, so it is picked up by tsconfig's "src" include (only
// src/**/*.test.ts is excluded) and typechecked on every run.

import type { WebClientOptions, WebWalletEngineOptions } from './index.ts';

// autoStart: true without config is rejected.
// @ts-expect-error autoStart: true requires config.
const missingConfig: WebWalletEngineOptions = { autoStart: true };

// Valid combinations all compile.
const withAutoStart: WebWalletEngineOptions = {
  config: { network: 'regtest' },
  autoStart: true,
};
const configOnly: WebWalletEngineOptions = { config: { network: 'regtest' } };
const neither: WebWalletEngineOptions = {};
const autoStartFalseAlone: WebWalletEngineOptions = { autoStart: false };

void missingConfig;
void withAutoStart;
void configOnly;
void neither;
void autoStartFalseAlone;

export {};

// createWebWalletEngine forwards client options to createWebClient by naming
// each one, because the rest has to stay spreadable for createWalletEngine. A
// field added to WebClientOptions but not to those lists is silently dropped:
// the engine builds, the option typechecks at the call site, and it simply
// never reaches the client. That shipped once, so the keys are pinned here.
// Add the new field to both lists in createWebWalletEngine and to this union.
type ForwardedClientOptionKey =
  | 'workerURL'
  | 'runtimeBaseUrl'
  | 'runtimeThread'
  | 'debug'
  | 'runtimeCache'
  | 'onPerformance';

// Resolves to never while every key is forwarded. When one is missing it
// resolves to that key's name, and the assignment below fails typecheck with
// the offending field in the message.
type UnforwardedClientOptionKey = Exclude<
  keyof WebClientOptions,
  ForwardedClientOptionKey
>;

const everyClientOptionIsForwarded: UnforwardedClientOptionKey extends never
  ? true
  : UnforwardedClientOptionKey = true;

void everyClientOptionIsForwarded;
