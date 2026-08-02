// The stream controller turns a rate into payments.
//
// The shape is accrue-then-flush. A meter runs continuously at the rate the
// user typed, and whenever it crosses one chunk the controller buys a tick:
// ask the L402 endpoint bare, get a 402 and a fresh invoice, pay it, present
// the preimage, then throw the token away and push the receipt to the board.
//
// The displayed figure is what is *owed*, which moves smoothly, and the
// payments are settlements against it, which land every few seconds because
// the rail will not carry anything smaller or faster. That is not a fudge, it
// is what a meter is: continuous measurement, discrete settlement.

import { BoardClient, type StreamRegistration } from "./board.ts";
import {
  authorizationHeader,
  invoiceAmountSat,
  parseChallenge,
} from "./l402.ts";

/** How far along a run is. */
export type StreamPhase =
  | "idle"
  | "registering"
  | "running"
  | "stopping"
  | "stopped"
  | "failed";

/** Everything a UI needs to render the stream. */
export interface StreamState {
  phase: StreamPhase;
  streamId: string | null;
  /** Sats per payment, derived from the rate and clamped to the board's bounds. */
  chunkSat: number;
  /** Owed but not yet settled, in millisatoshis. Moves continuously. */
  accruedMsat: number;
  /** Settled and pushed, in satoshis. Moves in chunks. */
  settledSat: number;
  /** How many ticks have been paid. */
  payments: number;
  /** True while a tick is being bought. */
  inFlight: boolean;
  /** The most recent failure, or null. */
  lastError: string | null;
  /** How many ticks have failed back to back. */
  consecutiveFailures: number;
}

/** Tuning for a run. */
export interface StreamOptions {
  /** The board to register with and push receipts to. */
  boardUrl: string;
  /** What the user asked to pay, in millisatoshis per second. */
  rateMsatPerSec: number;
  /**
   * How long the controller aims to leave between payments. The chunk size is
   * derived from this and the rate, so the cadence stays roughly constant
   * whatever rate the user picks and the rate knob does what a person expects.
   */
  targetIntervalMs?: number;
  /**
   * How many back-to-back failures end the run. A single failure is worth
   * retrying, since a stalled hop is ordinary; a run of them means something
   * is actually wrong and grinding away at it just hides that.
   */
  maxConsecutiveFailures?: number;
}

/** The outside world, injected so the controller is testable without any. */
export interface StreamDeps {
  fetch: typeof fetch;
  /** Settles an invoice and resolves to the preimage, hex encoded. */
  payInvoice: (bolt11: string) => Promise<string>;
  /** Milliseconds since the epoch. */
  now: () => number;
}

const DEFAULT_TARGET_INTERVAL_MS = 3_000;

/**
 * How often to tell the board what we owe. Far more often than payments land,
 * so the board interpolates over a short gap rather than a long one, and stops
 * quickly when we stop.
 */
const METER_REPORT_INTERVAL_MS = 1_000;
const DEFAULT_MAX_CONSECUTIVE_FAILURES = 3;

export class StreamController {
  private state: StreamState = {
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

  private readonly board: BoardClient;
  private readonly listeners = new Set<(s: StreamState) => void>();
  private readonly opts: StreamOptions;
  private readonly deps: StreamDeps;

  private registration: StreamRegistration | null = null;
  private lastTickAt = 0;
  private lastMeterReportAt = 0;
  private seq = 0;

  constructor(opts: StreamOptions, deps: StreamDeps) {
    this.opts = opts;
    this.deps = deps;
    this.board = new BoardClient(opts.boardUrl, deps.fetch);
  }

  /** Returns the current state. Cheap, so a UI may call it every frame. */
  getState(): StreamState {
    return { ...this.state };
  }

  /** Subscribes to state changes, returning the unsubscribe function. */
  subscribe(fn: (s: StreamState) => void): () => void {
    this.listeners.add(fn);

    return () => {
      this.listeners.delete(fn);
    };
  }

  /**
   * Registers with the board and begins accruing. The caller drives the run by
   * calling tick(); nothing here starts a timer of its own, which keeps the
   * controller deterministic under test.
   */
  async start(): Promise<void> {
    if (this.state.phase !== "idle" && this.state.phase !== "stopped") {
      throw new Error(`cannot start from phase ${this.state.phase}`);
    }

    this.patch({ phase: "registering", lastError: null });

    let registration: StreamRegistration;
    try {
      registration = await this.board.register(this.opts.rateMsatPerSec);
    } catch (err) {
      this.patch({ phase: "failed", lastError: message(err) });

      throw err;
    }

    this.registration = registration;
    this.seq = 0;
    this.lastTickAt = this.deps.now();

    // Report on the very first tick rather than a second into the run, so the
    // board starts moving as soon as we do.
    this.lastMeterReportAt = 0;

    this.patch({
      phase: "running",
      streamId: registration.streamId,
      chunkSat: this.chunkFor(registration),
      accruedMsat: 0,
      settledSat: 0,
      payments: 0,
      consecutiveFailures: 0,
    });
  }

  /**
   * Advances the meter and buys a tick when one is due.
   *
   * The returned promise resolves once any triggered payment has finished, so
   * a test can await it. A UI can ignore it and call this on an interval.
   */
  async tick(): Promise<void> {
    if (this.state.phase !== "running") {
      return;
    }

    const now = this.deps.now();
    const elapsedMs = Math.max(0, now - this.lastTickAt);
    this.lastTickAt = now;

    this.patch({
      accruedMsat:
        this.state.accruedMsat +
        (this.opts.rateMsatPerSec * elapsedMs) / 1000,
    });

    this.maybeReportMeter(now);

    const chunkMsat = this.state.chunkSat * 1000;
    if (this.state.inFlight || this.state.accruedMsat < chunkMsat) {
      return;
    }

    await this.buyTick();
  }

  /**
   * Ends the run and tells the board what accrued but never settled.
   *
   * Stopping is best effort on the board call: the money side is already
   * finished by this point, and failing to update a display is not a reason to
   * leave the controller wedged in "stopping".
   */
  async stop(): Promise<void> {
    if (this.state.phase !== "running" && this.state.phase !== "failed") {
      return;
    }

    const forgivenMsat = this.state.accruedMsat;
    this.patch({ phase: "stopping" });

    try {
      if (this.registration !== null) {
        await this.board.stop(this.registration.streamId, forgivenMsat);
      }
    } catch (err) {
      this.patch({ lastError: message(err) });
    }

    this.patch({ phase: "stopped" });
  }

  /**
   * Tells the board what we owe, at most once per report interval.
   *
   * Fire and forget: the board is a display, and failing to update it is not a
   * reason to interrupt paying. A dropped report just means the board
   * interpolates a little further before the next one lands.
   */
  private maybeReportMeter(now: number): void {
    const registration = this.registration;
    if (registration === null) {
      return;
    }

    if (now - this.lastMeterReportAt < METER_REPORT_INTERVAL_MS) {
      return;
    }

    this.lastMeterReportAt = now;

    void this.board
      .reportMeter(registration.streamId, this.state.accruedMsat)
      .catch(() => undefined);
  }

  /**
   * Buys one tick: bare request, pay the challenge, present the preimage,
   * discard the token, push the receipt.
   */
  private async buyTick(): Promise<void> {
    const registration = this.registration;
    if (registration === null) {
      return;
    }

    this.patch({ inFlight: true });

    const seq = this.seq + 1;

    try {
      const challenge = await this.requestChallenge(registration.tickEndpoint);

      // The service sets the price, not us, and under metered pricing it
      // varies per request. Read what was actually quoted before paying, so
      // the meter is drawn down by the real figure rather than by the chunk we
      // guessed, and so an absurd quote can be refused rather than paid.
      const quotedSat = invoiceAmountSat(challenge.invoice);
      if (quotedSat === null) {
        throw new Error(
          "the challenge invoice carries no readable amount, so there is " +
            "no way to know what paying it would cost",
        );
      }

      if (quotedSat > registration.maxSats) {
        throw new Error(
          `the service quoted ${quotedSat} sats, above the ${registration.maxSats} ` +
            `sat ceiling it advertised`,
        );
      }

      const preimage = await this.deps.payInvoice(challenge.invoice);

      // Present the proof of payment to collect the resource. We do not keep
      // the token: the next tick asks bare again, which is what makes the
      // stream one settled invoice per tick against a stock server.
      const paid = await this.deps.fetch(registration.tickEndpoint, {
        headers: { authorization: authorizationHeader(challenge, preimage) },
      });

      if (!paid.ok) {
        throw new Error(
          `paid request was refused: ${paid.status} ${paid.statusText}`,
        );
      }

      // The money has moved by this point, so a board that is unreachable must
      // not undo the accounting. Record the payment either way and let the
      // error surface as a warning.
      let pushError: string | null = null;
      try {
        await this.board.pushReceipt({
          bolt11: challenge.invoice,
          preimage,
          streamId: registration.streamId,
          seq,
        });
      } catch (err) {
        pushError = message(err);
      }

      this.seq = seq;

      // Draw the meter down by what was actually paid. Clamped at zero
      // because a quote larger than the accrual means we have paid ahead,
      // and owing a negative amount is not a thing.
      const paidMsat = quotedSat * 1000;

      this.patch({
        accruedMsat: Math.max(0, this.state.accruedMsat - paidMsat),
        settledSat: this.state.settledSat + quotedSat,
        payments: this.state.payments + 1,
        consecutiveFailures: 0,
        lastError: pushError,
        inFlight: false,
      });
    } catch (err) {
      // The accrual is deliberately left alone. Nothing was paid, so the
      // satoshis are still owed and the next tick should try again for them.
      const failures = this.state.consecutiveFailures + 1;
      const spent = failures >= this.maxFailures();

      this.patch({
        consecutiveFailures: failures,
        lastError: message(err),
        inFlight: false,
        phase: spent ? "failed" : this.state.phase,
      });
    }
  }

  /** Asks the tick endpoint with no credential and reads the 402 it returns. */
  private async requestChallenge(endpoint: string) {
    const response = await this.deps.fetch(endpoint);

    if (response.status !== 402) {
      throw new Error(
        `expected a 402 challenge, got ${response.status}. A tick endpoint ` +
          `that serves without payment cannot drive a stream.`,
      );
    }

    return parseChallenge(response);
  }

  /**
   * Derives the chunk size from the rate and the target interval, clamped to
   * what the service will accept.
   *
   * Fixing the interval rather than the chunk is what makes the rate knob
   * behave: at any rate the payments land at roughly the same cadence. At low
   * rates the service minimum takes over and the interval stretches instead,
   * which a UI should show rather than let the user discover as a stall.
   */
  private chunkFor(registration: StreamRegistration): number {
    const targetMs = this.opts.targetIntervalMs ?? DEFAULT_TARGET_INTERVAL_MS;
    const ideal = Math.round(
      (this.opts.rateMsatPerSec * (targetMs / 1000)) / 1000,
    );

    return Math.min(
      Math.max(ideal, registration.minSats),
      registration.maxSats,
    );
  }

  private maxFailures(): number {
    return (
      this.opts.maxConsecutiveFailures ?? DEFAULT_MAX_CONSECUTIVE_FAILURES
    );
  }

  private patch(next: Partial<StreamState>): void {
    this.state = { ...this.state, ...next };
    for (const fn of this.listeners) {
      fn(this.state);
    }
  }
}

/**
 * The interval between payments the current settings imply. A UI shows this
 * next to the rate so the tradeoff is visible up front: at a low enough rate
 * the minimum chunk means a payment every several minutes, which is a stalled
 * demo rather than a slow one.
 */
export function impliedIntervalMs(
  rateMsatPerSec: number,
  chunkSat: number,
): number {
  if (rateMsatPerSec <= 0) {
    return Number.POSITIVE_INFINITY;
  }

  return (chunkSat * 1000 * 1000) / rateMsatPerSec;
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
