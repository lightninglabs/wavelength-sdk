import { createElement, useState } from 'react';
import { createDemoClient, type DemoClientHandle } from '../lib/walletdk-client';

// LiveExample is the on-demand boot gate. It renders a "Launch live wallet"
// button and only creates the client on click (Stripe's "Run" pattern) so pages
// stay fast and at most one daemon boots at a time. The client is produced by
// the SDK seam (src/lib/walletdk-client.ts); today that seam returns a stub.
export default function LiveExample() {
  return createElement(LiveExampleInner);
}

function LiveExampleInner() {
  const [handle, setHandle] = useState<DemoClientHandle | null>(null);

  if (!handle) {
    return (
      <button
        type="button"
        className="live-example__launch"
        onClick={() => setHandle(createDemoClient())}
      >
        Launch live wallet
      </button>
    );
  }

  return (
    <div className="live-example__host" data-status={handle.status}>
      {handle.message}
    </div>
  );
}
