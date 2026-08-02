// The React binding for the stream controller.
//
// It supplies the two things the controller cannot have of its own: a wallet
// to settle invoices with, and a clock to run the meter on. Everything else,
// including all the interesting behaviour, lives in controller.ts where it can
// be tested without a browser.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useWalletSend, useWalletActivity } from "@lightninglabs/wavelength-react";
import type { Entry } from "@lightninglabs/wavelength-react";

import {
  StreamController,
  type StreamOptions,
  type StreamState,
} from "./controller.ts";

/**
 * How often the meter redraws. This is not the payment cadence, which comes
 * from the rate and the chunk size; it is only how smoothly the owed figure
 * moves on screen.
 */
const METER_INTERVAL_MS = 100;

/**
 * How long to wait for a preimage to become durably known after a send
 * reports success, and how often to look.
 *
 * The daemon populates progress.preimage only once the swap has revealed it
 * and it has been persisted, so it is routinely empty at the moment send()
 * resolves. Without this wait the receipt would carry an empty proof and the
 * board would rightly reject it.
 */
const PREIMAGE_TIMEOUT_MS = 30_000;
const PREIMAGE_POLL_MS = 250;

/** What the screen gets back. */
export interface UseStreamResult {
  state: StreamState;
  start: (opts: Omit<StreamOptions, never>) => Promise<void>;
  stop: () => Promise<void>;
  /** The last error, cleared when a new run starts. */
  error: string | null;
}

export function useStream(): UseStreamResult {
  const { send } = useWalletSend();
  const activity = useWalletActivity();

  // The controller reads activity through a ref so that a payment in flight
  // always sees the newest entries rather than the ones captured when the run
  // began.
  const activityRef = useRef<readonly Entry[]>(activity);
  activityRef.current = activity;

  const controllerRef = useRef<StreamController | null>(null);
  const [state, setState] = useState<StreamState>(idleState);
  const [error, setError] = useState<string | null>(null);

  // Settles an invoice and waits until the preimage is durably known, which is
  // what the board needs as proof.
  const payInvoice = useCallback(
    async (bolt11: string): Promise<string> => {
      const result = await send({ invoice: bolt11 });

      const immediate = result.entry?.progress?.preimage ?? "";
      if (immediate !== "") {
        return immediate;
      }

      const hash = result.paymentHash ?? result.entry?.progress?.paymentHash;
      if (hash === undefined || hash === "") {
        throw new Error(
          "the send reported no payment hash, so its preimage cannot be found",
        );
      }

      return waitForPreimage(hash, () => activityRef.current);
    },
    [send],
  );

  const start = useCallback(
    async (opts: StreamOptions) => {
      setError(null);

      const controller = new StreamController(opts, {
        fetch: (input, init) => fetch(input, init),
        payInvoice,
        now: () => Date.now(),
      });

      controller.subscribe(setState);
      controllerRef.current = controller;

      try {
        await controller.start();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));

        throw err;
      }
    },
    [payInvoice],
  );

  const stop = useCallback(async () => {
    await controllerRef.current?.stop();
  }, []);

  // Drive the meter. A plain interval rather than requestAnimationFrame: rAF
  // is suspended whenever the page is not being painted, and a wallet left in
  // a background tab would stop paying entirely rather than merely stop
  // animating. The controller computes from timestamps, so a throttled timer
  // costs redraws and never accuracy.
  useEffect(() => {
    const id = setInterval(() => {
      void controllerRef.current?.tick();
    }, METER_INTERVAL_MS);

    return () => clearInterval(id);
  }, []);

  // A run must not outlive the screen. Without this a navigation away would
  // leave the controller paying in the background with nothing showing it.
  useEffect(() => {
    return () => {
      void controllerRef.current?.stop();
    };
  }, []);

  return useMemo(
    () => ({ state, start, stop, error }),
    [state, start, stop, error],
  );
}

/** Polls the activity stream until the entry for a payment hash reveals its
 * preimage. */
async function waitForPreimage(
  paymentHash: string,
  entries: () => readonly Entry[],
): Promise<string> {
  const deadline = Date.now() + PREIMAGE_TIMEOUT_MS;

  for (;;) {
    for (const entry of entries()) {
      if (entry.progress?.paymentHash !== paymentHash) {
        continue;
      }

      const preimage = entry.progress?.preimage ?? "";
      if (preimage !== "") {
        return preimage;
      }
    }

    if (Date.now() > deadline) {
      throw new Error(
        `the payment settled but its preimage never became durably known ` +
          `(hash ${paymentHash.slice(0, 12)}), so there is no proof to push`,
      );
    }

    await new Promise((resolve) => setTimeout(resolve, PREIMAGE_POLL_MS));
  }
}

const idleState: StreamState = {
  phase: "idle",
  streamId: null,
  chunkSat: 0,
  accruedMsat: 0,
  settledSat: 0,
  payments: 0,
  inFlight: false,
  lastError: null,
  consecutiveFailures: 0,
};
