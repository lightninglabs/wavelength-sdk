import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { StreamController, impliedIntervalMs } from "./controller.ts";
import { parseChallenge, authorizationHeader } from "./l402.ts";

const TICK_ENDPOINT = "https://meter.example/tick";
const BOARD_URL = "https://board.example";

/** A recorded request, so tests can assert on what actually went out. */
interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

/**
 * fakeWorld stands in for the board, the L402 endpoint and the wallet. It
 * records every request so a test can check not just the outcome but the
 * shape of the traffic, which is where the interesting behaviour lives.
 */
function fakeWorld(overrides: {
  registration?: Partial<{
    streamId: string;
    tickEndpoint: string;
    minSats: number;
    maxSats: number;
    usdPerBtc: number;
  }>;
  challengeStatus?: number;
  wwwAuthenticate?: string | null;
  paidStatus?: number;
  receiptStatus?: number;
  payInvoice?: (bolt11: string) => Promise<string>;
  rateMsatPerSec?: number;
  /** What the service quotes per tick, in sats. */
  quotedSat?: number;
  /** Overrides the invoice string outright, for unreadable-amount cases. */
  invoice?: string;
} = {}) {
  const calls: Call[] = [];
  let clock = 0;

  const registration = {
    streamId: "stream-1",
    tickEndpoint: TICK_ENDPOINT,
    minSats: 1000,
    maxSats: 100_000,
    usdPerBtc: 100_000,
    ...overrides.registration,
  };

  // A BOLT11 human-readable part carrying the quoted amount. Only the prefix
  // is parsed by the controller, so the data part can be a placeholder.
  const quotedSat = overrides.quotedSat ?? 1000;
  const invoice =
    overrides.invoice ?? `lnbcrt${quotedSat * 10}n1placeholder`;

  const challengeHeader =
    overrides.wwwAuthenticate === undefined
      ? `LSAT macaroon="bWFj", invoice="${invoice}", ` +
        `L402 macaroon="bWFj", invoice="${invoice}"`
      : overrides.wwwAuthenticate;

  const doFetch: typeof fetch = async (input, init) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    const headers = Object.fromEntries(
      Object.entries((init?.headers ?? {}) as Record<string, string>),
    );
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;

    calls.push({ url, method, headers, body });

    if (url.endsWith("/api/stream")) {
      return new Response(JSON.stringify(registration), { status: 200 });
    }

    if (url.includes("/api/stream/") && url.endsWith("/stop")) {
      return new Response("{}", { status: 200 });
    }

    if (url.endsWith("/api/receipt")) {
      return new Response("{}", {
        status: overrides.receiptStatus ?? 200,
      });
    }

    // The tick endpoint. Bare asks get the challenge; a request carrying a
    // credential gets the resource.
    if (headers.authorization !== undefined) {
      return new Response("ok", { status: overrides.paidStatus ?? 200 });
    }

    const h = new Headers();
    if (challengeHeader !== null) {
      h.set("www-authenticate", challengeHeader);
    }

    return new Response("payment required", {
      status: overrides.challengeStatus ?? 402,
      headers: h,
    });
  };

  const controller = new StreamController(
    {
      boardUrl: BOARD_URL,
      rateMsatPerSec: overrides.rateMsatPerSec ?? 1_000_000,
      targetIntervalMs: 3000,
    },
    {
      fetch: doFetch,
      now: () => clock,
      payInvoice:
        overrides.payInvoice ?? (async () => "ab".repeat(32)),
    },
  );

  return {
    controller,
    calls,
    invoice,
    quotedSat,
    advance: (ms: number) => {
      clock += ms;
    },
    ticksTo: (url: string) => calls.filter((c) => c.url === url),
  };
}

describe("StreamController", () => {
  it("registers and derives the chunk from the rate", async () => {
    const w = fakeWorld();

    await w.controller.start();

    const state = w.controller.getState();
    assert.equal(state.phase, "running");
    assert.equal(state.streamId, "stream-1");

    // 1000 sat/s for 3s is 3000 sats a payment.
    assert.equal(state.chunkSat, 3000);

    assert.deepEqual(w.calls[0]?.body, { rateMsatPerSec: 1_000_000 });
  });

  it("clamps the chunk to the service minimum at a low rate", async () => {
    const w = fakeWorld({ rateMsatPerSec: 1000 });

    await w.controller.start();

    // 1 sat/s for 3s is 3 sats, well under the 1000 sat floor, so the floor
    // takes over and the interval stretches instead.
    assert.equal(w.controller.getState().chunkSat, 1000);
  });

  it("accrues without paying until a whole chunk is owed", async () => {
    const w = fakeWorld();
    await w.controller.start();

    // Two thirds of a chunk.
    w.advance(2000);
    await w.controller.tick();

    assert.equal(w.controller.getState().payments, 0);
    assert.equal(w.controller.getState().accruedMsat, 2_000_000);
    assert.equal(w.ticksTo(TICK_ENDPOINT).length, 0);
  });

  it("buys a tick bare, pays, presents the preimage and pushes a receipt",
    async () => {
      const w = fakeWorld();
      await w.controller.start();

      w.advance(3000);
      await w.controller.tick();

      const state = w.controller.getState();
      assert.equal(state.payments, 1);

      // The service quoted 1000 sats, so 1000 is what settles, whatever the
      // client's chunk arithmetic hoped for.
      assert.equal(state.settledSat, 1000);
      assert.equal(state.lastError, null);

      // The accrual is drawn down by what was actually paid rather than
      // reset, so the remaining 2000 sats stay owed.
      assert.equal(state.accruedMsat, 2_000_000);

      const ticks = w.ticksTo(TICK_ENDPOINT);
      assert.equal(ticks.length, 2, "one bare ask and one paid retry");
      assert.equal(
        ticks[0]?.headers.authorization,
        undefined,
        "the first ask must carry no credential, or no challenge is minted",
      );
      assert.equal(
        ticks[1]?.headers.authorization,
        `L402 bWFj:${"ab".repeat(32)}`,
      );

      const receipt = w.calls.find((c) => c.url.endsWith("/api/receipt"));
      assert.deepEqual(receipt?.body, {
        bolt11: w.invoice,
        preimage: "ab".repeat(32),
        streamId: "stream-1",
        seq: 1,
      });
    });

  it("throws the token away, so every tick asks bare again", async () => {
    const w = fakeWorld();
    await w.controller.start();

    for (let i = 0; i < 3; i++) {
      w.advance(3000);
      await w.controller.tick();
    }

    assert.equal(w.controller.getState().payments, 3);

    const bare = w
      .ticksTo(TICK_ENDPOINT)
      .filter((c) => c.headers.authorization === undefined);

    assert.equal(
      bare.length,
      3,
      "reusing a token would collapse the stream to a single payment",
    );
  });

  it("pays only one tick at a time", async () => {
    // The gate is built before the controller so it cannot be released before
    // the payment has actually reached it.
    let release!: (preimage: string) => void;
    const gate = new Promise<string>((resolve) => {
      release = resolve;
    });

    const w = fakeWorld({ payInvoice: () => gate });

    await w.controller.start();

    w.advance(9000);
    const first = w.controller.tick();

    // Let the first tick run as far as the hanging payment.
    await waitFor(() => w.controller.getState().inFlight);

    // A second tick while the first is in flight must not start another
    // payment. Pipelining would buy cadence and produce out-of-order
    // arrivals, which is the ugliest bug available here.
    w.advance(3000);
    await w.controller.tick();

    assert.equal(w.ticksTo(TICK_ENDPOINT).length, 1);
    assert.equal(w.controller.getState().payments, 0);

    release("cd".repeat(32));
    await first;

    assert.equal(w.controller.getState().payments, 1);
    assert.equal(w.controller.getState().inFlight, false);
  });

  it("keeps the accrual when a payment fails, so the sats stay owed",
    async () => {
      const w = fakeWorld({
        payInvoice: async () => {
          throw new Error("no route");
        },
      });

      await w.controller.start();

      w.advance(3000);
      await w.controller.tick();

      const state = w.controller.getState();
      assert.equal(state.payments, 0);
      assert.equal(state.consecutiveFailures, 1);
      assert.equal(state.accruedMsat, 3_000_000, "the debt must survive");
      assert.match(state.lastError ?? "", /no route/);
      assert.equal(state.phase, "running", "one failure is worth retrying");
    });

  it("gives up after enough consecutive failures", async () => {
    const w = fakeWorld({
      payInvoice: async () => {
        throw new Error("no route");
      },
    });

    await w.controller.start();

    for (let i = 0; i < 3; i++) {
      w.advance(3000);
      await w.controller.tick();
    }

    assert.equal(w.controller.getState().phase, "failed");

    // A failed run stops accruing rather than quietly running up a debt it
    // has already proven it cannot pay.
    w.advance(3000);
    await w.controller.tick();
    assert.equal(w.controller.getState().accruedMsat, 9_000_000);
  });

  it("counts a payment even when the board cannot be reached", async () => {
    const w = fakeWorld({ receiptStatus: 500 });

    await w.controller.start();

    w.advance(3000);
    await w.controller.tick();

    const state = w.controller.getState();

    // The money moved. A display that is down must not un-spend it.
    assert.equal(state.payments, 1);
    assert.equal(state.settledSat, 1000);
    assert.match(state.lastError ?? "", /board rejected the receipt/);
    assert.equal(state.phase, "running");
  });

  it("settles the amount the service quoted, not the chunk it guessed",
    async () => {
      // The client's arithmetic wants 3000 sats a tick; the service charges
      // 500. Under metered pricing this is the normal case, not an edge one.
      const w = fakeWorld({ quotedSat: 500 });
      await w.controller.start();

      w.advance(3000);
      await w.controller.tick();

      const state = w.controller.getState();
      assert.equal(state.settledSat, 500);
      assert.equal(
        state.accruedMsat,
        2_500_000,
        "the unpaid remainder must stay owed",
      );
    });

  it("refuses a quote above the ceiling the service advertised", async () => {
    const w = fakeWorld({ quotedSat: 500_000 });
    await w.controller.start();

    w.advance(3000);
    await w.controller.tick();

    const state = w.controller.getState();
    assert.equal(state.payments, 0);
    assert.match(state.lastError ?? "", /above the .* ceiling/);

    // Nothing was paid, so nothing was spent and the debt survives.
    assert.equal(state.accruedMsat, 3_000_000);
  });

  it("refuses an invoice whose amount cannot be read", async () => {
    // An amountless invoice. Treating an unreadable amount as zero would let
    // the meter drain against payments of unknown size.
    const w = fakeWorld({ invoice: "lnbcrt1placeholder" });
    await w.controller.start();

    w.advance(3000);
    await w.controller.tick();

    assert.equal(w.controller.getState().payments, 0);
    assert.match(
      w.controller.getState().lastError ?? "",
      /no readable amount/,
    );
  });

  it("never lets the meter go negative when it pays ahead", async () => {
    const w = fakeWorld({ quotedSat: 5000 });
    await w.controller.start();

    // Only 3000 sats have accrued, but the tick costs 5000.
    w.advance(3000);
    await w.controller.tick();

    const state = w.controller.getState();
    assert.equal(state.settledSat, 5000);
    assert.equal(state.accruedMsat, 0, "owing a negative amount is not a thing");
  });

  it("refuses an endpoint that serves without payment", async () => {
    const w = fakeWorld({ challengeStatus: 200 });

    await w.controller.start();

    w.advance(3000);
    await w.controller.tick();

    assert.match(
      w.controller.getState().lastError ?? "",
      /expected a 402 challenge/,
    );
  });

  it("explains a missing challenge header as the CORS problem it usually is",
    async () => {
      const w = fakeWorld({ wwwAuthenticate: null });

      await w.controller.start();

      w.advance(3000);
      await w.controller.tick();

      assert.match(
        w.controller.getState().lastError ?? "",
        /Access-Control-Expose-Headers/,
      );
    });

  it("reports the unsettled residual as forgiven when it stops", async () => {
    const w = fakeWorld();
    await w.controller.start();

    // Accrue 4000 sats, of which one 1000 sat tick settles.
    w.advance(4000);
    await w.controller.tick();

    await w.controller.stop();

    assert.equal(w.controller.getState().phase, "stopped");

    const stop = w.calls.find((c) => c.url.endsWith("/stop"));
    assert.deepEqual(stop?.body, { forgivenMsat: 3_000_000 });
  });

  it("notifies subscribers as the run progresses", async () => {
    const w = fakeWorld();
    const phases: string[] = [];

    w.controller.subscribe((s) => {
      if (phases[phases.length - 1] !== s.phase) phases.push(s.phase);
    });

    await w.controller.start();
    w.advance(3000);
    await w.controller.tick();
    await w.controller.stop();

    assert.deepEqual(phases, [
      "registering",
      "running",
      "stopping",
      "stopped",
    ]);
  });

  it("refuses to start twice", async () => {
    const w = fakeWorld();
    await w.controller.start();

    await assert.rejects(() => w.controller.start(), /cannot start from phase/);
  });

  it("ignores ticks before a run has started", async () => {
    const w = fakeWorld();

    await w.controller.tick();

    assert.equal(w.controller.getState().payments, 0);
    assert.equal(w.calls.length, 0);
  });
});

describe("impliedIntervalMs", () => {
  it("reports the cadence the rate and chunk imply", () => {
    // 1000 sat/s in 3000 sat chunks is a payment every three seconds.
    assert.equal(impliedIntervalMs(1_000_000, 3000), 3000);

    // The case a UI has to warn about: a slow rate against the service floor
    // means a payment every several minutes.
    assert.equal(impliedIntervalMs(1000, 1000), 1_000_000);
  });

  it("does not divide by zero", () => {
    assert.equal(impliedIntervalMs(0, 1000), Number.POSITIVE_INFINITY);
  });
});

describe("parseChallenge", () => {
  it("reads a folded LSAT and L402 header pair", () => {
    const headers = new Headers();
    headers.set(
      "www-authenticate",
      `LSAT macaroon="bWFj", invoice="lnbcrt1inv", ` +
        `L402 macaroon="bWFj", invoice="lnbcrt1inv"`,
    );

    const got = parseChallenge(
      new Response("", { status: 402, headers }),
    );

    assert.deepEqual(got, { macaroon: "bWFj", invoice: "lnbcrt1inv" });
  });

  it("reads an L402-only header", () => {
    const headers = new Headers();
    headers.set("www-authenticate", `L402 macaroon="bWFj", invoice="lnbcrt1inv"`);

    assert.deepEqual(parseChallenge(new Response("", { status: 402, headers })), {
      macaroon: "bWFj",
      invoice: "lnbcrt1inv",
    });
  });

  it("rejects a challenge missing either half", () => {
    const headers = new Headers();
    headers.set("www-authenticate", `L402 macaroon="bWFj"`);

    assert.throws(
      () => parseChallenge(new Response("", { status: 402, headers })),
      /missing an invoice or macaroon/,
    );
  });
});

describe("authorizationHeader", () => {
  it("joins the macaroon and preimage the way aperture expects", () => {
    assert.equal(
      authorizationHeader({ macaroon: "bWFj", invoice: "x" }, "ff".repeat(32)),
      `L402 bWFj:${"ff".repeat(32)}`,
    );
  });
});

/** Spins the microtask queue until a condition holds, or gives up. */
async function waitFor(cond: () => boolean, tries = 100): Promise<void> {
  for (let i = 0; i < tries; i++) {
    if (cond()) return;
    await new Promise((r) => setTimeout(r, 0));
  }

  throw new Error("condition never became true");
}
