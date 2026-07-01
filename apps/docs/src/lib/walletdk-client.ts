// The single seam between the docs harness and the SDK transport. Phase B (once
// the RFC refactor lands) replaces the body of createDemoClient with:
//
//   import { createWebClient } from '@lightninglabs/walletdk-web';
//   import { defaultConfig } from '@lightninglabs/walletdk-core';
//   export function createDemoClient() {
//     return { status: 'live', client: createWebClient(), config: defaultConfig('signet') };
//   }
//
// Until then it returns a stub so the harness renders end-to-end without the
// (not-yet-existing) createWebClient API. Keeping this in one file means Phase B
// touches exactly one place.
export type DemoClientHandle = {
  status: 'stub';
  message: string;
};

export function createDemoClient(): DemoClientHandle {
  return {
    status: 'stub',
    message:
      'Live wallet pending the SDK API refactor (createWebClient). The harness, ' +
      'layout, and boot gate are in place; the signet-backed wallet drops in here.',
  };
}
