import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { act } from "@testing-library/react";
import type { WalletInfo } from "@lightninglabs/walletdk-core";
import { createTestEngine } from "./testing/engine";
import { flushMicrotasks, renderWithEngine } from "./testing/render";
import {
  useWallet,
  useWalletActivity,
  useWalletBalance,
  useWalletSend,
  useWalletRefresh,
} from "./hooks";

const readyInfo = { walletState: "ready", walletReady: true } as WalletInfo;

describe("selector hooks", () => {
  it("a log event does not re-render a balance consumer", async () => {
    const { client, engine } = createTestEngine();
    let renders = 0;
    renderWithEngine(engine, () => {
      renders += 1;

      return useWalletBalance();
    });
    const before = renders;
    await act(async () => {
      client.emit({ type: "log", payload: { message: "noise" } } as never);
      await flushMicrotasks();
    });
    assert.equal(renders, before);
  });

  it("a balance change does re-render a balance consumer", async () => {
    const { client, engine } = createTestEngine();
    client.info = readyInfo;
    const { result } = renderWithEngine(engine, () => useWalletBalance());
    assert.equal(result.current, null);
    client.balanceValue = { confirmedSat: 42 } as never;
    await act(async () => {
      client.resolveReady();
      await flushMicrotasks();
      await engine.start({} as never);
      await flushMicrotasks();
    });
    assert.deepEqual(result.current, { confirmedSat: 42 });
  });

  it("useWallet routes the phase and surfaces runtime errors", async () => {
    const { client, engine } = createTestEngine();
    const { result } = renderWithEngine(engine, () => useWallet());
    assert.equal(result.current.phase, "loading");
    await act(async () => {
      client.rejectReady(new Error("wasm gone"));
      await flushMicrotasks();
    });
    assert.equal(result.current.phase, "error");
    assert.equal(result.current.error?.message, "wasm gone");
  });

  it("useWalletActivity returns the same array identity when unchanged", async () => {
    const { client, engine } = createTestEngine();
    client.info = readyInfo;
    const { result } = renderWithEngine(engine, () => useWalletActivity());
    await act(async () => {
      client.resolveReady();
      await flushMicrotasks();
      await engine.start({} as never);
      await flushMicrotasks();
    });
    const first = result.current;
    await act(async () => {
      await engine.refresh();
      await flushMicrotasks();
    });
    assert.equal(result.current, first);
  });
});

describe("mutation hooks", () => {
  it("throw-and-capture: the same Error instance is thrown and recorded", async () => {
    const { client, engine } = createTestEngine();
    client.fail("send", new Error("no route"));
    const { result } = renderWithEngine(engine, () => useWalletSend());
    let thrown: unknown;
    await act(async () => {
      try {
        await result.current.send({} as never);
      } catch (err) {
        thrown = err;
      }
      await flushMicrotasks();
    });
    assert.ok(thrown instanceof Error);
    assert.equal(result.current.sendError, thrown);
    assert.equal(result.current.sendPending, false);
    assert.equal(result.current.sendData, null);
  });

  it("success records data and reset clears it", async () => {
    const { client, engine } = createTestEngine();
    client.stub("send", { entryId: "e1" });
    const { result } = renderWithEngine(engine, () => useWalletSend());
    await act(async () => {
      await result.current.send({} as never);
      await flushMicrotasks();
    });
    assert.deepEqual(result.current.sendData, { entryId: "e1" });
    assert.equal(result.current.sendError, null);
    await act(async () => {
      result.current.resetSend();
    });
    assert.equal(result.current.sendData, null);
  });

  it("reset while pending bumps the generation so a late settlement cannot resurrect state", async () => {
    const { client, engine } = createTestEngine();
    let resolve!: (v: unknown) => void;
    client.impl("send", () => new Promise((res) => {
      resolve = res;
    }));
    const { result } = renderWithEngine(engine, () => useWalletSend());

    let done: Promise<unknown>;
    await act(async () => {
      done = result.current.send({} as never);
      await flushMicrotasks();
    });
    assert.equal(result.current.sendPending, true);

    await act(async () => {
      result.current.resetSend();
    });
    assert.equal(result.current.sendPending, false);
    assert.equal(result.current.sendError, null);
    assert.equal(result.current.sendData, null);

    // The reset call's generation bump means this late settlement must not
    // resurrect pending/error/data, even though the promise itself resolves.
    await act(async () => {
      resolve({ entryId: "late" });
      await done;
      await flushMicrotasks();
    });
    assert.equal(result.current.sendPending, false);
    assert.equal(result.current.sendError, null);
    assert.equal(result.current.sendData, null);
  });

  it("send and sendPrepared share one state slot", async () => {
    const { client, engine } = createTestEngine();
    client.fail("sendPrepared", new Error("intent burned"));
    const { result } = renderWithEngine(engine, () => useWalletSend());
    await act(async () => {
      await result.current.sendPrepared({} as never).catch(() => undefined);
      await flushMicrotasks();
    });
    assert.equal(result.current.sendError?.message, "intent burned");
  });

  it("an older overlapping call cannot clobber a newer call's state", async () => {
    const { client, engine } = createTestEngine();
    // Two overlapping send() calls, deferred so each resolves independently.
    // The FIRST call is made to settle LAST: its late resolution must not
    // overwrite the state the second (later, faster) call already wrote.
    const deferreds: Array<{ resolve: (v: unknown) => void }> = [];
    client.impl("send", () => {
      let resolve!: (v: unknown) => void;
      const promise = new Promise((res) => {
        resolve = res;
      });
      deferreds.push({ resolve });

      return promise;
    });
    const { result } = renderWithEngine(engine, () => useWalletSend());

    let firstDone: Promise<unknown>;
    let secondDone: Promise<unknown>;
    await act(async () => {
      firstDone = result.current.send({} as never);
      await flushMicrotasks();
      secondDone = result.current.send({} as never);
      await flushMicrotasks();
    });
    assert.equal(deferreds.length, 2);

    // Settle the second call first; its result should be visible.
    await act(async () => {
      deferreds[1].resolve({ entryId: "second" });
      await secondDone;
      await flushMicrotasks();
    });
    assert.deepEqual(result.current.sendData, { entryId: "second" });
    assert.equal(result.current.sendPending, false);

    // Settle the first (older) call afterward; it must not clobber the
    // second call's already-recorded outcome, though it still resolves to
    // its own caller.
    await act(async () => {
      deferreds[0].resolve({ entryId: "first" });
      const firstResult = await firstDone;
      assert.deepEqual(firstResult, { entryId: "first" });
      await flushMicrotasks();
    });
    assert.deepEqual(result.current.sendData, { entryId: "second" });
    assert.equal(result.current.sendPending, false);
  });

  it("useWalletRefresh pending is local to the hook instance", async () => {
    const { client, engine } = createTestEngine();
    client.info = readyInfo;
    const { result } = renderWithEngine(engine, () => useWalletRefresh());
    await act(async () => {
      client.resolveReady();
      await flushMicrotasks();
      await engine.start({} as never);
      await flushMicrotasks();
    });
    // An engine-initiated background refresh must not flip this hook's pending.
    // The activity debounce is a real setTimeout (ACTIVITY_DEBOUNCE_MS in core),
    // so the wait below crosses that real timer to let the background refresh
    // actually execute before the assertion runs.
    const balancesBefore = client.countOf("balance");
    await act(async () => {
      client.emit({ type: "activity" } as never);
      await new Promise((resolve) => setTimeout(resolve, 300));
      await flushMicrotasks();
    });
    assert.ok(client.countOf("balance") > balancesBefore);
    assert.equal(result.current.refreshPending, false);
  });
});
