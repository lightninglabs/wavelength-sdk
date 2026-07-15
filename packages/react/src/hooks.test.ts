import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { act } from "@testing-library/react";
import {
  FORCE_UNROLL_ACK,
  type Entry,
  type WalletInfo,
} from "@lightninglabs/wavelength-core";
import { createTestEngine } from "./testing/engine";
import { flushMicrotasks, renderWithEngine } from "./testing/render";
import {
  useWallet,
  useWalletActivity,
  useWalletBalance,
  useWalletSend,
  useWalletRefresh,
  useWalletExit,
  useWalletExitBatch,
  useWalletExitPlan,
  useWalletExits,
  useWalletExitStatus,
  useWalletList,
  useWalletSweep,
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
      client.emit({ type: "activity", payload: { cursor: 1 } as Entry });
      await new Promise((resolve) => setTimeout(resolve, 300));
      await flushMicrotasks();
    });
    assert.ok(client.countOf("balance") > balancesBefore);
    assert.equal(result.current.refreshPending, false);
  });
});

describe("exit hooks", () => {
  it("useWalletExit records data", async () => {
    const { client, engine } = createTestEngine();
    client.stub("exit", {
      path: "unilateral",
      cooperative: false,
      queuedOutpoints: [],
      created: true,
      actorID: "a",
      cooperativeError: "",
    });
    const { result } = renderWithEngine(engine, () => useWalletExit());
    await act(async () => {
      await result.current.exit({ outpoint: "a:0", forceUnrollAck: FORCE_UNROLL_ACK });
      await flushMicrotasks();
    });
    assert.equal(result.current.exitData?.created, true);
  });

  it("useWalletExitBatch collects events", async () => {
    const { client, engine } = createTestEngine();
    client.impl("getExitPlan", () => ({
      plans: [], feeRateSatPerVByte: 1, canStart: true,
      totalFundingShortfallSat: 0, totalRecommendedFundingSat: 0,
    }));
    client.impl("exit", () => ({
      path: "unilateral", cooperative: false, queuedOutpoints: [],
      created: true, actorID: "a", cooperativeError: "",
    }));
    const { result } = renderWithEngine(engine, () => useWalletExitBatch());
    await act(async () => {
      await result.current.exitBatch({ mode: "unilateral", outpoints: ["a:0"] });
      await flushMicrotasks();
    });
    assert.equal(result.current.exitBatchData?.started.length, 1);
    assert.ok(result.current.exitBatchEvents.some((e) => e.type === "started"));
  });

  it("useWalletExitBatch guards against overlapping runs", async () => {
    const { client, engine } = createTestEngine();
    client.impl("getExitPlan", () => new Promise(() => {
      // Never resolves: keeps the first run in flight so a second,
      // overlapping call can be observed hitting the re-entrancy guard.
    }));
    const { result } = renderWithEngine(engine, () => useWalletExitBatch());

    let firstPromise: Promise<unknown>;
    let secondPromise: Promise<unknown>;
    await act(async () => {
      firstPromise = result.current.exitBatch({ mode: "unilateral", outpoints: ["a:0"] });
      secondPromise = result.current.exitBatch({ mode: "unilateral", outpoints: ["a:0"] });
      await flushMicrotasks();
    });
    assert.equal(firstPromise!, secondPromise!);
    assert.equal(client.countOf("getExitPlan"), 1);
  });

  it("useWalletExits fetches the summary on mount", async () => {
    const { client, engine } = createTestEngine();
    client.stub("exitSummary", {
      exits: [], totalExits: 0, totalVTXOAmountSat: 0,
      totalEstFeeSat: 0, totalEstNetRecoveredSat: 0,
    });
    const { result } = renderWithEngine(engine, () => useWalletExits());
    await act(async () => { await flushMicrotasks(); });
    assert.equal(result.current.summary?.totalExits, 0);
    assert.ok(client.countOf("exitSummary") >= 1);
  });

  it("useWalletExits keeps the previous summary while a refetch is pending", async () => {
    const { client, engine } = createTestEngine();
    let resolveSecond!: (v: unknown) => void;
    let callCount = 0;
    client.impl("exitSummary", () => {
      callCount += 1;
      if (callCount === 1) {
        return {
          exits: [], totalExits: 1, totalVTXOAmountSat: 0,
          totalEstFeeSat: 0, totalEstNetRecoveredSat: 0,
        };
      }

      return new Promise((res) => {
        resolveSecond = res;
      });
    });
    const { result } = renderWithEngine(engine, () => useWalletExits());
    await act(async () => { await flushMicrotasks(); });
    assert.equal(result.current.summary?.totalExits, 1);

    // Trigger a manual refetch, mirroring the activity-driven refetch the
    // component does on every confirmed recovery tx. `summary` must not
    // blank to null while this second call is in flight.
    let refetchDone: Promise<unknown>;
    await act(async () => {
      refetchDone = result.current.refreshSummary();
      await flushMicrotasks();
    });
    assert.equal(result.current.summaryPending, true);
    assert.equal(result.current.summary?.totalExits, 1);

    await act(async () => {
      resolveSecond({
        exits: [], totalExits: 2, totalVTXOAmountSat: 0,
        totalEstFeeSat: 0, totalEstNetRecoveredSat: 0,
      });
      await refetchDone;
      await flushMicrotasks();
    });
    assert.equal(result.current.summary?.totalExits, 2);
    assert.equal(result.current.summaryPending, false);
  });

  it("useWalletExits keeps the previous summary when a refetch errors", async () => {
    const { client, engine } = createTestEngine();
    let callCount = 0;
    client.impl("exitSummary", () => {
      callCount += 1;
      if (callCount === 1) {
        return {
          exits: [], totalExits: 1, totalVTXOAmountSat: 0,
          totalEstFeeSat: 0, totalEstNetRecoveredSat: 0,
        };
      }
      throw new Error("poll failed");
    });
    const { result } = renderWithEngine(engine, () => useWalletExits());
    await act(async () => { await flushMicrotasks(); });
    assert.equal(result.current.summary?.totalExits, 1);

    // A transient poll error must not blank a still-valid last-good summary:
    // the exit status panel reads only `summary`, so nulling it here would
    // wrongly drop the in-progress banner.
    await act(async () => {
      await result.current.refreshSummary().catch(() => undefined);
      await flushMicrotasks();
    });
    assert.equal(result.current.summary?.totalExits, 1);
    assert.equal(result.current.summaryError?.message, "poll failed");
    assert.equal(result.current.summaryPending, false);
  });

  it("useWalletExitStatus defaults to the cheap call and does not poll", async () => {
    const { client, engine } = createTestEngine();
    client.stub("exitStatus", {
      found: true, status: "materializing", sweepTxid: "", lastError: "",
      phaseDetail: "", bestCaseBlocksRemaining: 0, currentHeight: 0,
    });
    const { result } = renderWithEngine(engine, () => useWalletExitStatus("a:0"));
    await act(async () => { await flushMicrotasks(); });
    assert.equal(result.current.status?.status, "materializing");
    // detailed defaults false: assert the request carried detailed !== true.
    const call = client.calls.find((c) => c.method === "exitStatus");
    assert.notEqual((call?.args[0] as { detailed?: boolean })?.detailed, true);
  });

  it("useWalletSweep records data on a stubbed preview", async () => {
    const { client, engine } = createTestEngine();
    client.stub("sweepWallet", {
      inputs: [],
      totalInputSat: 5000,
      estimatedFeeSat: 200,
      netAmountSat: 4800,
      feeRateSatPerVByte: 1,
      canBroadcast: true,
      txid: "",
      failureReason: "",
    });
    const { result } = renderWithEngine(engine, () => useWalletSweep());
    await act(async () => {
      await result.current.sweep({ destinationAddress: "addr1", broadcast: false });
      await flushMicrotasks();
    });
    assert.equal(result.current.sweepData?.totalInputSat, 5000);
  });

  it("useWalletExitPlan records data on a stubbed plan", async () => {
    const { client, engine } = createTestEngine();
    client.stub("getExitPlan", {
      plans: [],
      feeRateSatPerVByte: 1,
      canStart: true,
      totalFundingShortfallSat: 0,
      totalRecommendedFundingSat: 0,
    });
    const { result } = renderWithEngine(engine, () => useWalletExitPlan());
    await act(async () => {
      await result.current.plan({ outpoints: ["a:0"] });
      await flushMicrotasks();
    });
    assert.equal(result.current.planData?.canStart, true);
  });

  it("useWalletList records data on a stubbed vtxos view", async () => {
    const { client, engine } = createTestEngine();
    client.stub("list", {
      view: "vtxos",
      vtxos: { vtxos: [], total: 0 },
    });
    const { result } = renderWithEngine(engine, () => useWalletList());
    await act(async () => {
      await result.current.list({ view: "vtxos" });
      await flushMicrotasks();
    });
    assert.ok(result.current.listData);
    assert.equal(result.current.listData?.view, "vtxos");
  });

  it("useWalletExitStatus surfaces a refresh failure and clears pending", async () => {
    const { client, engine } = createTestEngine();
    client.stub("exitStatus", {
      found: true, status: "materializing", sweepTxid: "", lastError: "",
      phaseDetail: "", bestCaseBlocksRemaining: 0, currentHeight: 0,
    });
    const { result } = renderWithEngine(engine, () => useWalletExitStatus("a:0"));
    await act(async () => { await flushMicrotasks(); });
    assert.equal(result.current.status?.status, "materializing");

    client.fail("exitStatus", new Error("x"));
    await act(async () => {
      await result.current.refreshStatus().catch(() => undefined);
      await flushMicrotasks();
    });
    assert.equal(result.current.statusError?.message, "x");
    assert.equal(result.current.statusPending, false);
  });
});
