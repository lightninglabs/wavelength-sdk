import { useEffect, useRef, useState } from "react";
import { AlertTriangle, ArrowRight, Check, Info, Link2, Zap } from "lucide-react";
import {
  PrepareSendResult,
  SendRequest,
  classifyDestination,
  errorMessage,
  useWalletPrepareSend,
  useWalletSend,
} from "@lightninglabs/wavelength-react";
import { PageHead } from "../../components/layout/PageHead";
import { AppTab } from "../../components/layout/nav";
import { Band } from "../../components/ui/Band";
import { GhostButton, PrimaryButton } from "../../components/ui/Button";
import { CopyRow } from "../../components/ui/CopyRow";
import { Field } from "../../components/ui/Field";
import { InlineError } from "../../components/ui/InlineError";
import { Label } from "../../components/ui/Label";
import { ToggleRow } from "../../components/ui/ToggleRow";
import { formatSats } from "../../lib/format";
import { QuoteReview } from "./QuoteReview";

// nowSeconds is the unix clock the quote countdown compares against.
function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

// QUOTE_TIMEOUT_MS bounds a prepareSend that never settles. Observed live: the
// daemon can accept the call and never answer, which left the button stuck on
// "Quoting..." with no error and no way back.
const QUOTE_TIMEOUT_MS = 60_000;

// SendScreen walks a payment through form -> quote -> sent. Step one collects
// only what cannot be derived from the destination; the quote supplies the
// rest. Quoting and dispatch are self-served from the provider; only the
// spendable balance (for the sweep-all guard) and tab routing come from the
// caller.
export function SendScreen({
  onNavigate,
  balanceSat,
}: {
  onNavigate: (tab: AppTab) => void;
  balanceSat: number;
}) {
  const { prepare } = useWalletPrepareSend();
  const { sendPrepared, sendPending } = useWalletSend();
  const [dest, setDest] = useState("");
  const [amount, setAmount] = useState("");
  const [sweepAll, setSweepAll] = useState(false);
  const [note, setNote] = useState("");
  const [quote, setQuote] = useState<PrepareSendResult | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [localError, setLocalError] = useState("");
  const [quoting, setQuoting] = useState(false);
  const [sent, setSent] = useState<{ hash: string; amountSat: number } | null>(
    null,
  );

  // quoteToken invalidates in-flight quotes. A prepareSend that hangs and later
  // resolves must not overwrite state the user has since moved on from.
  const quoteToken = useRef(0);

  const destination = classifyDestination(dest);
  const isInvoice = destination.kind === "invoice";
  const isAddress = destination.kind === "address";
  const isAmountlessInvoice =
    isInvoice && destination.amount.status === "amountless";
  // The daemon ignores amountSat on the invoice path and currently rejects an
  // amountless invoice outright, so an invoice never asks for an amount. An
  // address does unless it is sweeping everything.
  const needsAmount = isAddress && !sweepAll;
  const amountReady =
    !needsAmount || (Number.isInteger(Number(amount)) && Number(amount) > 0);
  // The sweep path has nothing to send when the balance is zero.
  const sweepReady = !sweepAll || balanceSat > 0;
  const canContinue =
    destination.kind !== "empty" &&
    !isAmountlessInvoice &&
    amountReady &&
    sweepReady &&
    !quoting;

  // The countdown ticks only while a live quote is on screen. It is the whole
  // of the expiry mechanism: at zero, QuoteReview swaps Confirm for Refresh.
  // This covers the common case, not every case: the daemon can still reject
  // sendPrepared with the invalid-intent sentinel (clock skew, a suspended
  // tab, or a race across the boundary), and that rejection burns the quote,
  // which is why confirm() clears it below.
  useEffect(() => {
    if (!quote) {
      return;
    }

    const tick = () => setSecondsLeft(quote.expiresAtUnix - nowSeconds());
    tick();
    const id = setInterval(tick, 1000);

    return () => clearInterval(id);
  }, [quote]);

  // buildRequest maps the step-one inputs onto the wire shape. sweepAll and
  // amountSat are mutually exclusive on the wire: the daemon rejects a
  // sweep_all request that also carries a non-zero amount. The invoice arm
  // never sends amountSat: the daemon ignores it on that path.
  function buildRequest(): SendRequest {
    const trimmed = dest.trim();
    const common = note ? { note } : {};

    if (isInvoice) {
      return {
        invoice: trimmed,
        ...common,
      };
    }

    return {
      onchainAddress: trimmed,
      ...(sweepAll ? { sweepAll: true } : { amountSat: Number(amount) }),
      ...common,
    };
  }

  // requestQuote quotes the payment. A failure is safe to retry, so it
  // surfaces inline and leaves the user on the form. quoting is local state
  // rather than the provider's busy flag: a hung prepare never resolves that
  // flag, so it cannot drive a timeout or a way back to the form.
  async function requestQuote() {
    const token = ++quoteToken.current;
    setLocalError("");
    setQuoting(true);

    let timedOut = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        timedOut = true;
        reject(new Error("quote timed out"));
      }, QUOTE_TIMEOUT_MS);
    });

    try {
      const result = await Promise.race([prepare(buildRequest()), timeout]);
      clearTimeout(timer);
      // A stale token means the user has since cancelled or edited the
      // destination; a late response must not overwrite what they see now.
      if (quoteToken.current !== token) {
        return;
      }
      setQuote(result);
      // Seed the countdown from the quote itself, in the same tick that stores
      // it. Otherwise secondsLeft starts at 0 and QuoteReview paints "expired"
      // for one frame, until the effect's own tick() corrects it.
      setSecondsLeft(result.expiresAtUnix - nowSeconds());
    } catch (err) {
      clearTimeout(timer);
      if (quoteToken.current !== token) {
        return;
      }
      setLocalError(
        timedOut
          ? "The quote is taking too long. Check your connection and try again."
          : errorMessage(err),
      );
    } finally {
      if (quoteToken.current === token) {
        setQuoting(false);
      }
    }
  }

  // cancelQuote gives up on an in-flight quote. It bumps the token so a late
  // response from the abandoned prepareSend cannot land, and hands the user
  // back a usable form instead of an indefinite spinner.
  function cancelQuote() {
    quoteToken.current += 1;
    setQuoting(false);
    setLocalError("");
  }

  // confirm dispatches the quoted payment. The daemon deletes the send intent
  // before dispatching it to the backend, so any failure here burns the
  // intent regardless of whether the payment actually went out. It also
  // returns a single sentinel for a missing, expired, or already-consumed
  // intent ("send intent is missing, expired, or already consumed"), so the
  // message cannot say which one happened. On a money screen, wrongly telling
  // the user nothing was sent is far worse than wrongly telling them to check
  // Activity, so always show the cautious message and discard the burned
  // quote: leaving it on screen would re-enable Confirm & pay on an intent
  // that can now only fail again.
  async function confirm() {
    if (!quote) {
      return;
    }

    setLocalError("");
    try {
      const result = await sendPrepared(quote);
      setSent({
        hash: result.paymentHash || result.entry?.id || "",
        amountSat:
          result.actualAmountSat ||
          Math.abs(result.entry?.amountSat ?? 0) ||
          quote.amountSat,
      });
    } catch (err) {
      setLocalError(
        `${errorMessage(err)}. Check Activity before retrying: the payment may already have been sent.`,
      );
      setQuote(null);
    }
  }

  function reset() {
    setSent(null);
    setQuote(null);
    setDest("");
    setAmount("");
    setSweepAll(false);
    setNote("");
    setLocalError("");
  }

  if (sent) {
    return (
      <div>
        <PageHead
          title="Payment sent"
          subtitle="Submitted to the network"
          accent="orange"
          onBack={() => onNavigate("home")}
        />
        <Band tinted>
          <div className="mx-auto flex max-w-md flex-col items-center text-center">
            <div className="flex h-12 w-12 items-center justify-center bg-good/15">
              <Check size={22} className="text-good" />
            </div>
            <div className="mt-4 font-mono text-3xl font-semibold tabular-nums text-fg">
              {sent.amountSat > 0 ? formatSats(sent.amountSat) : "-"}
              <span className="ml-1.5 text-sm font-medium text-muted">sats</span>
            </div>
            {sent.hash ? (
              <div className="mt-5 w-full text-left">
                <CopyRow label="Payment hash" value={sent.hash} />
              </div>
            ) : null}
            <div className="mt-6 grid w-full grid-cols-2 gap-3">
              <GhostButton onClick={reset}>Send another</GhostButton>
              <PrimaryButton onClick={() => onNavigate("activity")}>
                View in activity
              </PrimaryButton>
            </div>
          </div>
        </Band>
      </div>
    );
  }

  // Step two: the form collapses to a recap row so the destination stays
  // readable while the user commits to paying it.
  if (quote) {
    return (
      <div>
        <PageHead
          title="Send"
          subtitle="Review and confirm"
          accent="orange"
          onBack={() => onNavigate("home")}
        />
        <Band>
          <Label>Payment details</Label>
          <div className="mt-4 flex items-center justify-between gap-4">
            <div className="min-w-0 truncate font-mono text-xs text-muted">
              {dest.trim()}
            </div>
            <button
              type="button"
              // cancelQuote bumps quoteToken, so a Refresh that is still in
              // flight cannot resolve and bounce the user back into review with
              // a stale quote. It also clears `quoting` and the error.
              onClick={() => {
                cancelQuote();
                setQuote(null);
              }}
              className="shrink-0 text-xs text-accent hover:underline"
            >
              Edit
            </button>
          </div>
        </Band>
        <QuoteReview
          quote={quote}
          destination={dest}
          expired={secondsLeft <= 0}
          secondsLeft={secondsLeft}
          quoting={quoting}
          busy={sendPending}
          error={localError}
          onConfirm={confirm}
          onRefresh={requestQuote}
        />
      </div>
    );
  }

  return (
    <div>
      <PageHead
        title="Send"
        subtitle="Pay an invoice or on-chain address"
        accent="orange"
        onBack={() => onNavigate("home")}
      />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (canContinue) {
            requestQuote();
          }
        }}
      >
        <Band>
          <div className="flex items-center justify-between gap-4">
            <Label>Payment details</Label>
            {/* Provisional: classifyDestination cannot see a settlement rail, so
              this pill only confirms the input parsed as an invoice or an
              address. quote.rail in step 2 is authoritative and may differ
              (e.g. an invoice can still settle in_ark, credit, or mixed). */}
            {isInvoice ? (
              <span className="inline-flex items-center gap-1 bg-accent-soft px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-accent">
                <Zap size={11} /> Lightning
              </span>
            ) : isAddress ? (
              <span className="inline-flex items-center gap-1 bg-warn/15 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-warn">
                <Link2 size={11} /> On-chain
              </span>
            ) : null}
          </div>
          <div className="mt-4 space-y-4">
            <label className="block">
              <span className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
                Invoice or address
              </span>
              <textarea
                value={dest}
                onChange={(e) => setDest(e.target.value)}
                rows={3}
                placeholder="lnbc… or tb1q…"
                className="w-full resize-none border border-border bg-well px-3
                  py-3 font-mono text-xs text-fg outline-none transition-colors
                  focus:border-border-strong"
              />
            </label>

            {isInvoice && destination.amount.status === "known" ? (
              <div className="flex items-start gap-2 border border-border bg-well p-3 text-xs text-muted">
                <Info size={14} className="mt-0.5 shrink-0 text-accent" />
                Amount is set by the invoice:{" "}
                <span className="font-mono text-fg">
                  {formatSats(destination.amount.sat)} sats
                </span>
              </div>
            ) : null}

            {isInvoice && destination.amount.status === "unrepresentable" ? (
              <div className="flex items-start gap-2 border border-border bg-well p-3 text-xs text-muted">
                <Info size={14} className="mt-0.5 shrink-0 text-accent" />
                Amount is set by the invoice.
              </div>
            ) : null}

            {isAmountlessInvoice ? (
              <div className="flex items-start gap-2 border border-warn/35 bg-warn/10 p-3 text-xs text-warn">
                <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                This invoice carries no amount. Amountless invoices are not
                supported yet.
              </div>
            ) : null}

            {isAddress ? (
              <ToggleRow
                title="Send max"
                subtitle="Sweep the full spendable balance"
                on={sweepAll}
                onChange={setSweepAll}
              />
            ) : null}

            {needsAmount ? (
              <Field
                label="Amount (sats)"
                placeholder="Amount to send"
                inputMode="numeric"
                value={amount}
                onChange={setAmount}
                mono
              />
            ) : null}

            {isAddress && sweepAll ? (
              <Field
                label="Amount (sats)"
                value={String(balanceSat)}
                disabled
                mono
              />
            ) : null}

            <Field
              label="Note"
              placeholder="optional · stored locally"
              value={note}
              onChange={setNote}
            />

            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={!canContinue}
                className="inline-flex items-center gap-2 bg-accent-fill px-4 py-2.5
                  text-sm font-semibold text-on-accent transition-opacity
                  hover:opacity-90 disabled:opacity-50"
              >
                {quoting ? "Quoting…" : "Continue"} <ArrowRight size={16} />
              </button>
              {quoting ? (
                <GhostButton onClick={cancelQuote} block={false}>
                  Cancel
                </GhostButton>
              ) : null}
            </div>
          </div>
        </Band>
        {localError ? (
          <Band tinted>
            <InlineError message={localError} />
          </Band>
        ) : null}
      </form>
    </div>
  );
}
