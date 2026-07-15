import { useState } from "react";
import { AlertTriangle, CheckCircle2, Layers, Zap } from "lucide-react";
import {
  errorMessage,
  useWalletActivity,
  useWalletBalance,
  useWalletDeposit,
  useWalletReceive,
} from "@lightninglabs/wavelength-react";
import { PageHead } from "../../components/layout/PageHead";
import { AppTab } from "../../components/layout/nav";
import { Band } from "../../components/ui/Band";
import { GhostButton, PrimaryButton } from "../../components/ui/Button";
import { CopyRow } from "../../components/ui/CopyRow";
import { FauxQR } from "../../components/ui/FauxQR";
import { Field } from "../../components/ui/Field";
import { InlineError } from "../../components/ui/InlineError";
import { Label } from "../../components/ui/Label";
import { Segmented } from "../../components/ui/Segmented";
import { formatSats } from "../../lib/format";
import {
  hasPendingOnchain,
  usePollWhileWaiting,
} from "../../lib/usePollWhileWaiting";

type Tab = "lightning" | "onchain";

// ReceiveScreen offers a Lightning invoice (amount + memo) or an on-chain
// boarding address, each paired with a QR. Values come from the live
// receive()/deposit() calls, self-served here from the provider. Once a
// payment lands, the provider's activity stream surfaces the matching entry,
// which flips the QR to a received confirmation without any manual refresh.
export function ReceiveScreen({
  onNavigate,
}: {
  onNavigate: (tab: AppTab) => void;
}) {
  const activity = useWalletActivity();
  const balance = useWalletBalance();
  const { receive, receivePending, receiveError } = useWalletReceive();
  const { deposit, depositPending, depositError } = useWalletDeposit();
  const [tab, setTab] = useState<Tab>("lightning");
  const [amount, setAmount] = useState("1000");
  const [memo, setMemo] = useState("");
  const [invoice, setInvoice] = useState("");
  const [address, setAddress] = useState("");
  const [localError, setLocalError] = useState("");
  // The id of the entry each tab's request created, so the live activity list
  // can be matched back to it when it settles. Keyed per tab: a Lightning
  // invoice must keep its confirmation hook across a trip to the on-chain tab
  // and back, since its QR stays on screen and only the id can match it.
  const [pendingEntryId, setPendingEntryId] = useState<Record<Tab, string>>({
    lightning: "",
    onchain: "",
  });

  const isLn = tab === "lightning";
  // The QR result only appears once a value has been generated.
  const result = isLn ? invoice : address;
  const trackedId = pendingEntryId[tab];
  // The activity entry for this request. Lightning matches on the id receive()
  // returned, which the daemon keeps stable. On-chain also matches the boarding
  // address, because a confirmed deposit row is keyed deposit-<address>: that
  // arm is what survives a page reload, where the id from deposit() is lost.
  const match = activity.find((e) => {
    if (trackedId && e.id === trackedId) {
      return true;
    }

    return !isLn && Boolean(address) && e.request?.onchainAddress === address;
  });
  // A receive that failed (expired invoice, rejected swap, timed-out HTLC) must
  // not leave a live-looking QR on screen promising it updates automatically.
  const failed = match?.status === "failed" ? match : undefined;
  // Treat it as received once complete, or, on-chain, as soon as the deposit is
  // detected (pending): funds have arrived; boarding into a spendable VTXO just
  // confirms afterward. A Lightning receive only counts when complete.
  const settled =
    !failed &&
    match &&
    (match.status === "complete" || (!isLn && match.status === "pending"))
      ? match
      : undefined;

  // On-chain boarding deposits are not pushed on the activity stream, so poll
  // while an on-chain address is shown and not yet detected. Once a pending
  // on-chain entry exists, the app-level poll takes over tracking it, so stop
  // here to avoid a double poll. Lightning receives arrive via the stream, and a
  // failed receive is terminal, so neither keeps polling.
  usePollWhileWaiting(
    !isLn &&
      Boolean(address) &&
      !settled &&
      !failed &&
      !hasPendingOnchain(activity, balance),
  );

  function trackEntry(forTab: Tab, id: string) {
    setPendingEntryId((current) => ({ ...current, [forTab]: id }));
  }

  function switchTab(next: Tab) {
    // Each tab keeps its own request, so nothing is dropped on the way out.
    setLocalError("");
    setTab(next);
  }

  async function createInvoice() {
    setLocalError("");
    trackEntry("lightning", "");
    try {
      const next = await receive({
        amountSat: Number(amount) || 0,
        memo: memo || undefined,
      });
      setInvoice(next.invoice);
      trackEntry("lightning", next.entry.id);
    } catch (err) {
      setLocalError(errorMessage(err));
    }
  }

  async function getAddress() {
    setLocalError("");
    trackEntry("onchain", "");
    try {
      const next = await deposit();
      setAddress(next.address);
      trackEntry("onchain", next.entry.id);
    } catch (err) {
      setLocalError(errorMessage(err));
    }
  }

  return (
    <div>
      <PageHead
        title="Receive"
        subtitle="Share an invoice or boarding address"
        onBack={() => onNavigate("home")}
      />

      <Band>
        <Label>Method</Label>
        <div className="mt-3">
          <Segmented
            value={tab}
            onChange={switchTab}
            options={[
              { value: "lightning", label: "Lightning" },
              { value: "onchain", label: "On-chain" },
            ]}
          />
        </div>

        {isLn ? (
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <Field
              label="Amount (sats)"
              inputMode="numeric"
              value={amount}
              onChange={setAmount}
              mono
            />
            <Field label="Memo" value={memo} onChange={setMemo} />
          </div>
        ) : (
          <div className="mt-5 flex items-start gap-2 border border-border bg-well p-3 text-xs text-muted">
            <Layers size={14} className="mt-0.5 shrink-0 text-accent" />
            Funds board into Ark after 1 confirmation.
          </div>
        )}

        <div className="mt-5 flex flex-wrap items-center gap-3">
          {isLn ? (
            <PrimaryButton
              icon={Zap}
              onClick={createInvoice}
              busy={receivePending}
              block={false}
            >
              {receivePending
                ? "Creating invoice…"
                : invoice
                  ? "Create another"
                  : "Create invoice"}
            </PrimaryButton>
          ) : address ? (
            <GhostButton onClick={() => onNavigate("home")} block={false}>
              Done
            </GhostButton>
          ) : (
            <PrimaryButton
              icon={Layers}
              onClick={getAddress}
              busy={depositPending}
              block={false}
            >
              {depositPending ? "Generating…" : "Get boarding address"}
            </PrimaryButton>
          )}
        </div>
        <div className="mt-3">
          <InlineError
            message={
              localError || (isLn ? receiveError : depositError)?.message || ""
            }
          />
        </div>
      </Band>

      {failed ? (
        <Band tinted>
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <AlertTriangle size={40} className="text-bad" />
            <div className="text-lg font-medium text-fg">Payment failed</div>
            <div className="max-w-md text-sm text-muted">
              {failed.failureReason ||
                "This request did not complete. Create a new one to try again."}
            </div>
            <GhostButton onClick={() => onNavigate("home")} block={false}>
              Done
            </GhostButton>
          </div>
        </Band>
      ) : settled ? (
        <Band tinted>
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <CheckCircle2 size={40} className="text-good" />
            <div className="text-lg font-medium text-fg">Payment received</div>
            <div className="font-mono text-2xl font-medium tabular-nums text-good">
              +{formatSats(Math.abs(settled.amountSat))} sats
            </div>
            {settled.status === "pending" ? (
              <div className="text-xs text-muted">
                Confirming on-chain, boarding into Ark…
              </div>
            ) : null}
            <GhostButton onClick={() => onNavigate("home")} block={false}>
              Done
            </GhostButton>
          </div>
        </Band>
      ) : result ? (
        <Band tinted>
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="bg-white p-4">
              <FauxQR
                seed={result}
                size={23}
                color="#0a0a0b"
                className="h-44 w-44"
              />
            </div>
            <span className="text-xs text-faint">
              This is not a real QR code
            </span>
            <div className="w-full max-w-md text-left">
              <CopyRow
                label={isLn ? "Invoice" : "Boarding address"}
                value={result}
              />
            </div>
            <span className="text-xs text-muted">
              Waiting for payment. This updates automatically.
            </span>
          </div>
        </Band>
      ) : null}
    </div>
  );
}
