import assert from "node:assert/strict";
import { createElement, type ReactNode } from "react";
import { describe, it, mock } from "node:test";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { Entry, WalletInfo } from "@lightninglabs/walletdk-core";
import { WalletDKProvider, useWalletDK } from "./provider.tsx";
import { FakeWalletDKClient } from "./testing/fake-client.ts";
import { flushMicrotasks, renderWithProvider } from "./testing/render.ts";

// A ready wallet info, the common precondition for the ready-phase effects.
const readyInfo = { walletState: "ready", walletReady: true } as WalletInfo;
// A locked wallet info: a live phase that starts neither the syncing poll nor
// the activity stream, so create/unlock/refresh assertions stay isolated.
const lockedInfo = { walletState: "locked", walletReady: false } as WalletInfo;
const syncingInfo = { walletState: "syncing", walletReady: false } as WalletInfo;

function entry(id: string): Entry {
  return { id } as unknown as Entry;
}

describe("WalletDKProvider readiness", () => {
  it("advances loading -> runtimeReady once ready() resolves", async () => {
    const client = new FakeWalletDKClient();
    const { result } = renderWithProvider(client, () => useWalletDK());

    assert.equal(result.current.phase, "loading");

    client.resolveReady();
    await waitFor(() => assert.equal(result.current.phase, "runtimeReady"));
  });

  it("goes to error with the message when ready() rejects", async () => {
    const client = new FakeWalletDKClient();
    const { result } = renderWithProvider(client, () => useWalletDK());

    client.rejectReady(new Error("assets failed"));
    await waitFor(() => assert.equal(result.current.phase, "error"));
    assert.equal(result.current.error, "assets failed");
  });

  it("a runtimeReady event lifts loading even before ready() resolves", async () => {
    const client = new FakeWalletDKClient();
    const { result } = renderWithProvider(client, () => useWalletDK());

    // ready() left pending on purpose: the event is the other path to ready.
    act(() => client.emit({ type: "runtimeReady" }));
    await waitFor(() => assert.equal(result.current.phase, "runtimeReady"));
  });

  it("a late runtimeReady event does not clobber a live phase", async () => {
    const client = new FakeWalletDKClient();
    client.info = readyInfo;
    const { result } = renderWithProvider(client, () => useWalletDK());

    await act(async () => {
      await result.current.refresh();
    });
    assert.equal(result.current.phase, "ready");

    // A stray runtimeReady must be ignored once past loading, or the UI would
    // snap a running wallet back to the pre-wallet runtimeReady phase.
    act(() => client.emit({ type: "runtimeReady" }));
    assert.equal(result.current.phase, "ready");
  });

  it("a runtimeStopped event drops to stopped and clears wallet state", async () => {
    const client = new FakeWalletDKClient();
    client.info = readyInfo;
    client.listValue = { activity: { entries: [entry("a")] } } as never;
    const { result } = renderWithProvider(client, () => useWalletDK());

    await act(async () => {
      await result.current.refresh();
    });
    assert.equal(result.current.phase, "ready");
    assert.notEqual(result.current.info, null);

    act(() => client.emit({ type: "runtimeStopped" }));
    await waitFor(() => assert.equal(result.current.phase, "stopped"));
    assert.equal(result.current.info, null);
    assert.equal(result.current.balance, null);
    assert.deepEqual(result.current.activity, []);
  });
});

describe("WalletDKProvider start/stop", () => {
  it("start sets phase from the returned info and best-effort refreshes", async () => {
    const client = new FakeWalletDKClient();
    client.info = lockedInfo;
    const { result } = renderWithProvider(client, () => useWalletDK());

    await act(async () => {
      await result.current.start({ network: "regtest" } as never);
    });

    assert.equal(result.current.phase, "locked");
    assert.equal(client.countOf("start"), 1);
    // start awaits a best-effort refresh, so getInfo/balance/list ran too.
    assert.ok(client.countOf("getInfo") >= 1);
    assert.equal(result.current.operations.runtime.busy, false);
  });

  it("start swallows a failing refresh and still resolves with info", async () => {
    const client = new FakeWalletDKClient();
    client.info = lockedInfo;
    client.fail("getInfo", new Error("not ready"));
    const { result } = renderWithProvider(client, () => useWalletDK());

    await act(async () => {
      const info = await result.current.start({ network: "regtest" } as never);
      assert.equal(info.walletState, "locked");
    });

    assert.equal(result.current.phase, "locked");
    assert.equal(result.current.operations.runtime.error, "");
  });

  it("stop tears down state and lands on stopped", async () => {
    const client = new FakeWalletDKClient();
    client.info = lockedInfo;
    const { result } = renderWithProvider(client, () => useWalletDK());

    await act(async () => {
      await result.current.start({ network: "regtest" } as never);
    });
    await act(async () => {
      await result.current.stop();
    });

    assert.equal(result.current.phase, "stopped");
    assert.equal(result.current.info, null);
    assert.equal(client.countOf("stop"), 1);
  });
});

describe("WalletDKProvider create/unlock optimistic patch", () => {
  it("createWallet patches info to ready before refresh and returns the result", async () => {
    const client = new FakeWalletDKClient();
    // Fail the refresh so only the optimistic patch survives, isolating it.
    client.fail("getInfo", new Error("bootstrap"));
    const { result } = renderWithProvider(client, () => useWalletDK());

    await act(async () => {
      await assert.rejects(result.current.createWallet({ password: "pw" }));
    });

    assert.equal(result.current.phase, "ready");
    assert.equal(result.current.info?.identityPubKey, "pk-create");
    assert.equal(result.current.info?.walletState, "ready");
    assert.equal(result.current.info?.walletReady, true);
    // The rejected refresh is surfaced on the createWallet operation.
    assert.equal(result.current.operations.createWallet.error, "bootstrap");
    assert.equal(result.current.operations.createWallet.busy, false);
  });

  it("createWallet resolves and refreshes on the happy path", async () => {
    const client = new FakeWalletDKClient();
    client.info = readyInfo;
    const { result } = renderWithProvider(client, () => useWalletDK());

    let identity = "";
    await act(async () => {
      const res = await result.current.createWallet({ password: "pw" });
      identity = res.identityPubKey;
    });

    assert.equal(identity, "pk-create");
    assert.equal(result.current.phase, "ready");
    assert.equal(client.countOf("createWallet"), 1);
    assert.ok(client.countOf("getInfo") >= 1);
  });

  it("unlockWallet patches info to ready and refreshes", async () => {
    const client = new FakeWalletDKClient();
    client.info = readyInfo;
    const { result } = renderWithProvider(client, () => useWalletDK());

    await act(async () => {
      const res = await result.current.unlockWallet({ password: "pw" });
      assert.equal(res.identityPubKey, "pk-unlock");
    });

    assert.equal(result.current.phase, "ready");
    assert.equal(result.current.info?.walletState, "ready");
    assert.equal(client.countOf("unlockWallet"), 1);
  });
});

describe("WalletDKProvider refresh", () => {
  it("populates info, balance, and activity and derives the phase", async () => {
    const client = new FakeWalletDKClient();
    client.info = lockedInfo;
    client.balanceValue = { confirmed: 7 } as never;
    client.listValue = { activity: { entries: [entry("x"), entry("y")] } } as never;
    const { result } = renderWithProvider(client, () => useWalletDK());

    await act(async () => {
      await result.current.refresh();
    });

    assert.equal(result.current.phase, "locked");
    assert.deepEqual(result.current.balance, { confirmed: 7 });
    assert.equal(result.current.activity.length, 2);
    assert.equal(result.current.operations.refresh.busy, false);
    assert.equal(result.current.operations.refresh.error, "");
  });

  it("records the error and rethrows when a refresh call fails", async () => {
    const client = new FakeWalletDKClient();
    client.info = lockedInfo;
    client.fail("balance", new Error("balance down"));
    const { result } = renderWithProvider(client, () => useWalletDK());

    await act(async () => {
      await assert.rejects(result.current.refresh());
    });

    assert.equal(result.current.operations.refresh.error, "balance down");
  });
});

describe("WalletDKProvider syncing auto-poll", () => {
  it("polls syncing -> ready when the wallet finishes catching up", async () => {
    mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
    const client = new FakeWalletDKClient();
    client.info = syncingInfo;
    const { result } = renderWithProvider(client, () => useWalletDK());

    await act(async () => {
      await result.current.start({ network: "regtest" } as never);
    });
    assert.equal(result.current.phase, "syncing");

    client.info = readyInfo;
    await act(async () => {
      mock.timers.tick(2000);
      await flushMicrotasks();
    });

    assert.equal(result.current.phase, "ready");
  });

  it("bails to error after five consecutive polling failures", async () => {
    mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
    const client = new FakeWalletDKClient();
    client.info = syncingInfo;
    const { result } = renderWithProvider(client, () => useWalletDK());

    await act(async () => {
      await result.current.start({ network: "regtest" } as never);
    });
    assert.equal(result.current.phase, "syncing");

    // Every subsequent refresh fails; the poll gives up after five.
    client.fail("getInfo", new Error("still stuck"));
    for (let i = 0; i < 5; i++) {
      await act(async () => {
        mock.timers.tick(2000);
        await flushMicrotasks();
      });
    }

    assert.equal(result.current.phase, "error");
    assert.equal(result.current.error, "still stuck");
  });

  it("counts failures consecutively, not cumulatively", async () => {
    mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
    const client = new FakeWalletDKClient();
    client.info = syncingInfo;
    const { result } = renderWithProvider(client, () => useWalletDK());

    await act(async () => {
      await result.current.refresh();
    });
    assert.equal(result.current.phase, "syncing");

    // Script the poll: four failures, one success (still syncing, which resets
    // the counter), then four more failures. That is eight total but never five
    // in a row, so it must not bail. Drop the reset and the fifth cumulative
    // failure would flip this to error.
    let call = 0;
    client.impl("getInfo", () => {
      call += 1;
      if (call === 5) {
        return syncingInfo;
      }
      throw new Error("stuck");
    });
    for (let i = 0; i < 9; i++) {
      await act(async () => {
        mock.timers.tick(2000);
        await flushMicrotasks();
      });
    }

    assert.equal(result.current.phase, "syncing");
    assert.equal(result.current.error, "");
  });
});

describe("WalletDKProvider activity stream", () => {
  async function toReady(client: FakeWalletDKClient) {
    client.info = readyInfo;
    const rendered = renderWithProvider(client, () => useWalletDK());
    await act(async () => {
      await rendered.result.current.refresh();
      await flushMicrotasks();
    });
    assert.equal(rendered.result.current.phase, "ready");

    return rendered;
  }

  it("opens the stream on ready and refreshes on a debounced activity event", async () => {
    mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
    const client = new FakeWalletDKClient();
    const { result } = await toReady(client);
    assert.ok(client.countOf("startActivity") >= 1);

    const before = client.countOf("getInfo");
    await act(async () => {
      client.emit({ type: "activity", payload: entry("new") });
      mock.timers.tick(250);
      await flushMicrotasks();
    });

    assert.ok(client.countOf("getInfo") > before);
  });

  it("reopens the stream after an activityStream loss", async () => {
    mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
    const client = new FakeWalletDKClient();
    const { result } = await toReady(client);
    const opened = client.countOf("startActivity");

    await act(async () => {
      client.emit({ type: "activityStream", payload: { state: "failed", message: "x" } });
      mock.timers.tick(1000);
      await flushMicrotasks();
    });

    assert.ok(client.countOf("startActivity") > opened);
  });

  it("surfaces an error after the reopen limit of consecutive failures", async () => {
    mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
    const client = new FakeWalletDKClient();
    // Every startActivity (initial open and each retry) fails.
    client.startActivityImpl = () => Promise.reject(new Error("no stream"));
    const { result } = await toReady(client);

    // Let the initial open() rejection register, then drive the backoff retries
    // (1s, 2s, 4s, 8s) until the fifth failure trips the limit.
    await act(async () => {
      await flushMicrotasks();
    });
    for (const delay of [1000, 2000, 4000, 8000]) {
      await act(async () => {
        mock.timers.tick(delay);
        await flushMicrotasks();
      });
    }

    assert.equal(result.current.phase, "error");
    assert.equal(
      result.current.error,
      "lost the activity stream and could not reconnect",
    );
  });

  it("resets the reopen failure count after a clean reopen", async () => {
    mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
    const client = new FakeWalletDKClient();
    // Only the fifth open (index 4) succeeds; every other attempt fails.
    client.startActivityImpl = (i) =>
      i === 4 ? Promise.resolve() : Promise.reject(new Error("no stream"));
    const { result } = await toReady(client);

    // Attempts 0-3 fail (the mount open plus backoff retries at 1s/2s/4s/8s),
    // attempt 4 succeeds and resets the counter, then a fresh loss drives
    // attempt 5. With the reset that is one consecutive failure; without it,
    // it would be the fifth in a row and trip the limit to error.
    for (const delay of [1000, 2000, 4000, 8000]) {
      await act(async () => {
        mock.timers.tick(delay);
        await flushMicrotasks();
      });
    }
    await act(async () => {
      client.emit({
        type: "activityStream",
        payload: { state: "failed", message: "x" },
      });
      mock.timers.tick(1000);
      await flushMicrotasks();
    });

    assert.equal(result.current.phase, "ready");
  });
});

describe("WalletDKProvider operations", () => {
  it("tracks busy per operation while a call is in flight", async () => {
    const client = new FakeWalletDKClient();
    client.info = lockedInfo;
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    client.impl("send", () => gate.then(() => ({})));
    const { result } = renderWithProvider(client, () => useWalletDK());

    let sendPromise!: Promise<unknown>;
    act(() => {
      sendPromise = result.current.send({ invoice: "ln" } as never);
    });
    assert.equal(result.current.operations.send.busy, true);
    // A sibling operation stays idle: busy state is per-operation.
    assert.equal(result.current.operations.receive.busy, false);

    await act(async () => {
      release();
      await sendPromise;
    });
    assert.equal(result.current.operations.send.busy, false);
  });

  it("deposit, receive, and send call the client and refresh on success", async () => {
    const client = new FakeWalletDKClient();
    client.info = lockedInfo;
    const { result } = renderWithProvider(client, () => useWalletDK());

    for (const op of ["deposit", "receive", "send"] as const) {
      const before = client.countOf("getInfo");
      await act(async () => {
        await result.current[op]({} as never);
      });
      assert.equal(client.countOf(op), 1);
      assert.ok(client.countOf("getInfo") > before);
    }
  });

  it("records and clears a per-operation error", async () => {
    const client = new FakeWalletDKClient();
    client.info = lockedInfo;
    client.fail("send", new Error("route not found"));
    const { result } = renderWithProvider(client, () => useWalletDK());

    await act(async () => {
      await assert.rejects(result.current.send({ invoice: "ln" } as never));
    });
    assert.equal(result.current.operations.send.error, "route not found");

    act(() => result.current.clearOperationError("send"));
    assert.equal(result.current.operations.send.error, "");
  });
});

describe("WalletDKProvider logs", () => {
  it("buffers log events, caps the tail, and clears them", async () => {
    const client = new FakeWalletDKClient();
    const { result } = renderWithProvider(client, () => useWalletDK());

    act(() => {
      for (let i = 0; i < 205; i++) {
        client.emit({
          type: "log",
          payload: { level: "info", message: `line ${i}` },
        });
      }
    });

    // MAX_LOGS is 200; the oldest are dropped and the newest is kept last.
    assert.equal(result.current.logs.length, 200);
    assert.equal(result.current.logs.at(-1)?.message, "line 204");

    act(() => result.current.clearLogs());
    assert.equal(result.current.logs.length, 0);
  });
});

describe("WalletDKProvider wiring", () => {
  it("throws when useWalletDK is used outside a provider", () => {
    assert.throws(
      () => renderHook(() => useWalletDK()),
      /must be used inside WalletDKProvider/,
    );
  });

  it("throws when neither client nor createClient is given", () => {
    assert.throws(() =>
      renderHook(() => useWalletDK(), {
        wrapper: ({ children }: { children: ReactNode }) =>
          createElement(WalletDKProvider, {}, children),
      }),
    );
  });

  it("calls createClient once across rerenders", () => {
    const client = new FakeWalletDKClient();
    let created = 0;
    const createClient = () => {
      created += 1;

      return client;
    };
    const { result, rerender } = renderHook(() => useWalletDK(), {
      wrapper: ({ children }: { children: ReactNode }) =>
        createElement(WalletDKProvider, { createClient }, children),
    });

    rerender();
    rerender();

    assert.equal(created, 1);
    assert.equal(result.current.client, client);
  });
});
