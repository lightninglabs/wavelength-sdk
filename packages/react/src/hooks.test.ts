import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { act } from "@testing-library/react";
import type { WalletInfo } from "@lightninglabs/walletdk-core";
import {
  useDepositAddress,
  useReceive,
  useSend,
  useWalletActivity,
  useWalletBalance,
  useWalletBootstrap,
  useWalletLogs,
  useWalletRuntime,
} from "./hooks.ts";
import { FakeWalletDKClient } from "./testing/fake-client.ts";
import { renderWithProvider } from "./testing/render.ts";

const lockedInfo = { walletState: "locked", walletReady: false } as WalletInfo;

describe("granular hooks surface", () => {
  it("useWalletRuntime exposes the runtime slice and actions", () => {
    const client = new FakeWalletDKClient();
    const { result } = renderWithProvider(client, () => useWalletRuntime());

    assert.equal(result.current.client, client);
    assert.equal(result.current.phase, "loading");
    for (const key of ["start", "stop", "refresh"] as const) {
      assert.equal(typeof result.current[key], "function");
    }
  });

  it("useWalletBootstrap exposes create/unlock", () => {
    const client = new FakeWalletDKClient();
    const { result } = renderWithProvider(client, () => useWalletBootstrap());

    assert.equal(typeof result.current.createWallet, "function");
    assert.equal(typeof result.current.unlockWallet, "function");
  });

  it("useWalletLogs exposes the log tail and clear", () => {
    const client = new FakeWalletDKClient();
    const { result } = renderWithProvider(client, () => useWalletLogs());

    assert.deepEqual(result.current.logs, []);
    assert.equal(typeof result.current.clearLogs, "function");
  });
});

describe("single-operation hooks map busy/error to their operation", () => {
  it("useWalletBalance reflects a failed refresh and clears it", async () => {
    const client = new FakeWalletDKClient();
    client.info = lockedInfo;
    client.fail("balance", new Error("balance down"));
    const { result } = renderWithProvider(client, () => useWalletBalance());

    await act(async () => {
      await assert.rejects(result.current.refresh());
    });
    assert.equal(result.current.error, "balance down");

    act(() => result.current.clearError());
    assert.equal(result.current.error, "");
  });

  it("useWalletActivity exposes entries and refresh state", async () => {
    const client = new FakeWalletDKClient();
    client.info = lockedInfo;
    client.listValue = {
      activity: { entries: [{ id: "e1" }] },
    } as never;
    const { result } = renderWithProvider(client, () => useWalletActivity());

    await act(async () => {
      await result.current.refresh();
    });
    assert.equal(result.current.activity.length, 1);
    assert.equal(result.current.busy, false);
  });

  it("useDepositAddress surfaces its operation error", async () => {
    const client = new FakeWalletDKClient();
    client.info = lockedInfo;
    client.fail("deposit", new Error("no address"));
    const { result } = renderWithProvider(client, () => useDepositAddress());

    await act(async () => {
      await assert.rejects(result.current.deposit());
    });
    assert.equal(result.current.error, "no address");

    act(() => result.current.clearError());
    assert.equal(result.current.error, "");
  });

  it("useReceive surfaces its operation error", async () => {
    const client = new FakeWalletDKClient();
    client.info = lockedInfo;
    client.fail("receive", new Error("bad amount"));
    const { result } = renderWithProvider(client, () => useReceive());

    await act(async () => {
      await assert.rejects(result.current.receive({} as never));
    });
    assert.equal(result.current.error, "bad amount");
  });

  it("useSend surfaces its operation error", async () => {
    const client = new FakeWalletDKClient();
    client.info = lockedInfo;
    client.fail("send", new Error("route not found"));
    const { result } = renderWithProvider(client, () => useSend());

    await act(async () => {
      await assert.rejects(result.current.send({} as never));
    });
    assert.equal(result.current.error, "route not found");

    act(() => result.current.clearError());
    assert.equal(result.current.error, "");
  });
});
