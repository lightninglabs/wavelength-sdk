import { useCallback, useState } from "react";
import {
  ArrowDownLeft,
  ArrowDownToLine,
  ArrowUpRight,
  ChevronRight,
  Layers,
  Lock,
  type LucideIcon,
  RefreshCw,
  ShieldCheck,
  Wallet,
  Zap,
} from "lucide-react";
import {
  Balance,
  Entry,
  WalletInfo,
  errorMessage,
  useWallet,
  useWalletBalance,
  useWalletDeposit,
  useWalletActivity,
  useWalletInfo,
  useWalletRefresh,
} from "@lightninglabs/wavelength-react";
import { ActivityRow } from "../../components/ActivityRow";
import { PageHead } from "../../components/layout/PageHead";
import { AppTab } from "../../components/layout/nav";
import { Band } from "../../components/ui/Band";
import { PrimaryButton } from "../../components/ui/Button";
import { CopyRow } from "../../components/ui/CopyRow";
import { FauxQR } from "../../components/ui/FauxQR";
import { InlineError } from "../../components/ui/InlineError";
import { Label } from "../../components/ui/Label";
import { cn } from "../../lib/cn";
import {
  balanceSat,
  hasAnyValue,
  pendingInSat,
  pendingOutSat,
} from "../../lib/balance";
import { formatBtc, formatSats } from "../../lib/format";
import { statusLabel } from "../../lib/phase";
import { usePollWhileWaiting } from "../../lib/usePollWhileWaiting";
import { Composition } from "./Composition";
import { OnChainBalance } from "./OnChainBalance";

// HomeScreen is the authenticated overview: the balance hero with composition,
// recent activity, quick actions and runtime status, laid out as full-bleed
// Zones bands. A zero balance swaps the funded dashboard for a board-on-chain
// CTA (the only way to fund a fresh Ark wallet). Balance, activity, info,
// deposit and refresh are all self-served from the provider; only tab
// routing comes from the caller.
export function HomeScreen({
  onNavigate,
}: {
  onNavigate: (tab: AppTab) => void;
}) {
  const { phase } = useWallet();
  const info = useWalletInfo();
  const phaseLabel = statusLabel(phase);
  const balance = useWalletBalance();
  const activity = useWalletActivity();
  const { deposit, depositPending, depositError } = useWalletDeposit();
  const { refresh, refreshPending, refreshError } = useWalletRefresh();
  const refreshErrorMessage = refreshError?.message ?? "";

  const onDeposit = useCallback(
    () => deposit().then((result) => result.address),
    [deposit],
  );
  const onRefresh = useCallback(() => {
    void refresh().catch(() => undefined);
  }, [refresh]);

  // Treat the wallet as funded when the balance holds or is moving any value,
  // or when there is any history to show. Value comes from the balance, history
  // from the activity: the two are never mixed.
  const funded = hasAnyValue(balance) || activity.length > 0;

  return (
    <div>
      <PageHead
        title="Overview"
        subtitle="Your self-custodial wallet balance and pending flows."
        accent="violet"
      />
      {funded ? (
        <>
          <BalanceBand
            balance={balance}
            onNavigate={onNavigate}
            onRefresh={onRefresh}
            refreshBusy={refreshPending}
            refreshError={refreshErrorMessage}
          />
          <Band>
            <Label accent="teal" rule>Balance composition</Label>
            <div className="mt-4">
              <Composition balance={balance} />
              <OnChainBalance balance={balance} />
            </div>
          </Band>
          <RecentActivityBand activity={activity} onNavigate={onNavigate} />
          <RuntimeBand info={info} phaseLabel={phaseLabel} />
        </>
      ) : (
        <EmptyWallet
          info={info}
          phaseLabel={phaseLabel}
          onNavigate={onNavigate}
          onDeposit={onDeposit}
          depositBusy={depositPending}
          depositError={depositError?.message ?? ""}
        />
      )}
    </div>
  );
}

// BalanceBand is the Home hero: spendable balance, derived BTC, pending flow
// and the primary Send / Receive actions.
function BalanceBand({
  balance,
  onNavigate,
  onRefresh,
  refreshBusy,
  refreshError,
}: {
  balance: Balance | null;
  onNavigate: (t: AppTab) => void;
  onRefresh: () => void;
  refreshBusy: boolean;
  refreshError: string;
}) {
  const amount = balanceSat(balance);
  const incoming = pendingInSat(balance);
  const outgoing = pendingOutSat(balance);

  return (
    <Band tinted>
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div>
          <div className="flex items-center gap-3">
            <Label>Balance</Label>
            <span
              className="inline-flex items-center gap-1.5 border border-border
                px-2 py-0.5 text-xs font-medium text-muted"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-good" />
              Self-custody
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span
              className="font-mono text-5xl font-semibold tracking-tight
                tabular-nums text-fg lg:text-6xl"
            >
              {formatSats(amount)}
            </span>
            <span className="text-sm font-medium text-muted">sats</span>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 text-sm">
            <span className="font-mono tabular-nums text-muted">
              {formatBtc(amount)} BTC
            </span>
            {incoming > 0 ? (
              <>
                <span className="text-faint">·</span>
                <span className="font-mono tabular-nums text-sky">
                  +{formatSats(incoming)} incoming
                </span>
              </>
            ) : null}
            {outgoing > 0 ? (
              <>
                <span className="text-faint">·</span>
                <span className="font-mono tabular-nums text-orange">
                  -{formatSats(outgoing)} outgoing
                </span>
              </>
            ) : null}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshBusy}
            aria-label="Refresh"
            className="inline-flex items-center justify-center p-2.5 text-muted
              transition-colors hover:text-fg disabled:opacity-50"
          >
            <RefreshCw
              size={16}
              className={cn(refreshBusy && "animate-spin")}
            />
          </button>
          <button
            type="button"
            onClick={() => onNavigate("send")}
            className="inline-flex items-center gap-2 bg-accent-fill px-4 py-2.5
              text-sm font-semibold text-on-accent transition-opacity
              hover:opacity-90"
          >
            <ArrowUpRight size={16} /> Send
          </button>
          <button
            type="button"
            onClick={() => onNavigate("receive")}
            className="inline-flex items-center gap-2 border border-border
              [background:var(--bg)] px-4 py-2.5 text-sm font-medium text-fg
              transition-colors hover:border-border-strong"
          >
            <ArrowDownLeft size={16} /> Receive
          </button>
        </div>
      </div>
      {refreshError ? (
        <div className="mt-3">
          <InlineError message={refreshError} />
        </div>
      ) : null}
    </Band>
  );
}

// RuntimeBand surfaces live runtime telemetry and honest self-custody cues as a
// horizontal stat strip.
function RuntimeBand({
  info,
  phaseLabel,
}: {
  info: WalletInfo | null;
  phaseLabel: string;
}) {
  // A row's `tone` colors its stat icon with the accent matching the stat's
  // domain (sky network, orange chain height, teal wallet identity); `good`
  // rows read fully in lime instead.
  const rows: Array<{
    icon: LucideIcon;
    label: string;
    value: string;
    good?: boolean;
    tone?: string;
  }> = [
    { icon: ShieldCheck, label: "Runtime", value: phaseLabel, good: true },
    { icon: Zap, label: "Network", value: info?.network || "-", tone: "text-sky" },
    {
      icon: Layers,
      label: "Block height",
      value: info?.blockHeight ? formatSats(info.blockHeight) : "-",
      tone: "text-orange",
    },
    {
      icon: Wallet,
      label: "Wallet",
      value: info?.walletType || "-",
      tone: "text-teal",
    },
    { icon: Lock, label: "Keys", value: "On this device", good: true },
  ];

  return (
    <Band>
      <Label accent="violet" rule>Runtime &amp; security</Label>
      {/* Two columns on a phone: five equal flex children leave each stat
          about 70px, too narrow for "Block height" or "On this device" to sit
          on one line. Three columns at sm; the divided row returns at md with
          tighter gutters, since px-5 there would push the widest value onto
          a second line. */}
      <div className="mt-4 grid grid-cols-2 gap-x-5 gap-y-4 divide-border sm:grid-cols-3 md:flex md:flex-wrap md:gap-0 md:divide-x">
        {rows.map((r) => (
          <div key={r.label} className="px-0 md:flex-1 md:px-3 md:first:pl-0 lg:px-5">
            <div className="flex items-center gap-1.5 text-xs text-muted">
              <r.icon
                size={13}
                className={r.good ? "text-lime" : (r.tone ?? "text-muted")}
              />
              {r.label}
            </div>
            <div
              className={cn(
                "mt-1 font-mono text-sm tabular-nums",
                r.good ? "text-lime" : "text-fg",
              )}
            >
              {r.value}
            </div>
          </div>
        ))}
      </div>
    </Band>
  );
}

// EmptyWallet is the zero-balance state. It boards on-chain funds, so it fetches
// a boarding address up front and shows it inline. A Lightning top-up routes to
// the receive screen, where the user must choose an amount first.
function EmptyWallet({
  info,
  phaseLabel,
  onNavigate,
  onDeposit,
  depositBusy,
  depositError,
}: {
  info: WalletInfo | null;
  phaseLabel: string;
  onNavigate: (t: AppTab) => void;
  onDeposit: () => Promise<string>;
  depositBusy: boolean;
  depositError: string;
}) {
  const [address, setAddress] = useState("");
  const [localError, setLocalError] = useState("");

  // A boarding deposit is not pushed on the activity stream, so poll while the
  // address is shown and the wallet is still empty (this view unmounts once it
  // is funded, which stops the poll).
  usePollWhileWaiting(Boolean(address));

  const fetchAddress = useCallback(async () => {
    setLocalError("");
    try {
      setAddress(await onDeposit());
    } catch (err) {
      setLocalError(errorMessage(err));
    }
  }, [onDeposit]);

  // Each step's number chip walks the brand accents in flow order: incoming
  // on-chain funds are sky, the Ark VTXO they become is teal, and spending is
  // the primary violet.
  const steps: Array<{ text: string; tone: string }> = [
    {
      text: "Send on-chain Bitcoin to your boarding address.",
      tone: "bg-sky-fill/10 text-sky",
    },
    {
      text: "After 1 confirmation it joins the next round.",
      tone: "bg-teal-fill/10 text-teal",
    },
    {
      text: "Spend instantly over Lightning.",
      tone: "bg-violet-fill/10 text-violet",
    },
  ];
  const error = localError || depositError;

  return (
    <>
      <Band tinted>
        <div className="mx-auto flex max-w-md flex-col items-center text-center">
          <div className="flex h-14 w-14 items-center justify-center bg-sky-fill/10">
            <ArrowDownToLine size={26} className="text-sky" />
          </div>
          <h2 className="mt-5 font-display text-xl font-semibold text-fg">
            Fund your wallet
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Your balance is empty. Send Bitcoin to your boarding address to start
            using Ark and Lightning. Funds become spendable once they confirm and
            join the next round.
          </p>

          <div className="mt-6 w-full max-w-sm">
            {address ? (
              <div className="flex flex-col items-center gap-4">
                <div className="bg-white p-4">
                  <FauxQR
                    seed={address}
                    size={23}
                    color="#0a0a0b"
                    className="h-40 w-40"
                  />
                </div>
                <span className="text-xs text-faint">
                  This is not a real QR code
                </span>
                <div className="w-full text-left">
                  <CopyRow label="Boarding address" value={address} />
                </div>
              </div>
            ) : (
              <>
                <PrimaryButton
                  icon={ArrowDownToLine}
                  onClick={() => void fetchAddress()}
                  busy={depositBusy}
                >
                  {depositBusy ? "Generating…" : "Get a boarding address"}
                </PrimaryButton>
                <div className="mt-3">
                  <InlineError message={error} />
                </div>
              </>
            )}
          </div>

          <button
            type="button"
            onClick={() => onNavigate("receive")}
            className="mt-4 text-xs font-medium text-muted hover:text-fg"
          >
            or create a Lightning invoice
          </button>
        </div>
      </Band>

      <Band>
        <Label accent="sky" rule>How boarding works</Label>
        <ol className="mt-4 grid gap-4 sm:grid-cols-3">
          {steps.map((step, i) => (
            <li key={step.text} className="flex gap-3">
              <span
                className={cn(
                  `flex h-6 w-6 shrink-0 items-center justify-center
                  text-[11px] font-bold`,
                  step.tone,
                )}
              >
                {i + 1}
              </span>
              <span className="text-sm text-muted">{step.text}</span>
            </li>
          ))}
        </ol>
      </Band>

      <RuntimeBand info={info} phaseLabel={phaseLabel} />
    </>
  );
}

// RecentActivityBand lists the latest entries with a link to full history.
function RecentActivityBand({
  activity,
  onNavigate,
}: {
  activity: readonly Entry[];
  onNavigate: (t: AppTab) => void;
}) {

  return (
    <Band tinted>
      <div className="flex items-center justify-between">
        <Label accent="teal">Recent activity</Label>
        <button
          type="button"
          onClick={() => onNavigate("activity")}
          className="inline-flex items-center gap-1 text-xs font-medium text-accent"
        >
          View all <ChevronRight size={13} />
        </button>
      </div>
      {activity.length === 0 ? (
        <div className="mt-2 border-t border-border py-8 text-center text-sm text-muted">
          No activity yet.
        </div>
      ) : (
        <div className="mt-2 divide-y divide-border border-t border-border">
          {activity.slice(0, 4).map((entry) => (
            <ActivityRow key={entry.id} entry={entry} />
          ))}
        </div>
      )}
    </Band>
  );
}
