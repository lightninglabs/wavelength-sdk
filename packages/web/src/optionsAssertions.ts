// Compile-time contract test for WebWalletEngineOptions, mirroring
// packages/core/src/engine/optionsAssertions.ts. This module has no
// meaningful runtime behavior: it exists so `pnpm typecheck` enforces that
// autoStart: true still requires config once WalletEngineOptions is combined
// with WebClientOptions through DistributiveOmit. It is a plain .ts file
// under src/, so it is picked up by tsconfig's "src" include (only
// src/**/*.test.ts is excluded) and typechecked on every run.

import type { WebWalletEngineOptions } from './index.ts';

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
