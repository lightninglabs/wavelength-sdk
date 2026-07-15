import { useEffect } from "react";
import type { CreateWalletResult } from "@lightninglabs/wavelength-react";
import { useWalletRecovery } from "@lightninglabs/wavelength-react";
import { CheckCircle2, TriangleAlert, X } from "lucide-react";
import { Spinner } from "./ui/Spinner";

// summarizeRecovered turns the recovery counters into a short human summary of
// what came back, e.g. "3 VTXOs, 1 boarding output".
function summarizeRecovered(result: CreateWalletResult): string {
  const parts: string[] = [];
  const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;
  if (result.recoveredVTXOs > 0) {
    parts.push(plural(result.recoveredVTXOs, "VTXO"));
  }
  if (result.recoveredBoardingUTXOs > 0) {
    parts.push(plural(result.recoveredBoardingUTXOs, "boarding output"));
  }

  return parts.join(", ");
}

// RecoveryBanner surfaces the background wallet-recovery status above the main
// wallet UI. Recovery runs while the wallet is already usable, so the banner
// explains that balances and history are still filling in, and reports the
// outcome once the daemon's indexer scan finishes.
export function RecoveryBanner() {
  const { recovery, acknowledge } = useWalletRecovery();

  // Auto-clear the success banner after a short read; leave the failure banner
  // up until the user dismisses it.
  useEffect(() => {
    if (recovery.status !== "done") {
      return;
    }

    const id = setTimeout(acknowledge, 8000);

    return () => clearTimeout(id);
  }, [recovery.status, acknowledge]);

  if (recovery.status === "idle") {
    return null;
  }

  if (recovery.status === "restoring") {
    return (
      <div
        className="flex w-full items-center gap-3 border-b border-border
          bg-accent-soft px-4 py-3 text-sm text-fg lg:px-8"
        role="status"
      >
        <Spinner size={16} className="shrink-0" />
        <span>
          Restoring your balance and history. This can take a few minutes;
          your balance will fill in as it is found.
        </span>
      </div>
    );
  }

  if (recovery.status === "done") {
    const summary = summarizeRecovered(recovery.result);

    return (
      <div
        className="flex w-full items-center gap-3 border-b border-border
          [background:color-mix(in_srgb,var(--good)_12%,transparent)] px-4 py-3
          text-sm text-fg lg:px-8"
        role="status"
      >
        <CheckCircle2 size={16} className="shrink-0 text-good" />
        <span className="flex-1">
          {summary
            ? `Wallet restored. Recovered ${summary}.`
            : "Wallet restored. No prior balance or history was found."}
        </span>
        <DismissButton onClick={acknowledge} />
      </div>
    );
  }

  // status === "failed"
  return (
    <div
      className="flex w-full items-center gap-3 border-b border-border
        [background:color-mix(in_srgb,var(--bad)_10%,transparent)] px-4 py-3
        text-sm text-fg lg:px-8"
      role="alert"
    >
      <TriangleAlert size={16} className="shrink-0 text-bad" />
      <span className="flex-1">
        Could not finish restoring your history, so your balance may be
        incomplete. The wallet is still usable.
      </span>
      <DismissButton onClick={acknowledge} />
    </div>
  );
}

function DismissButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Dismiss"
      className="shrink-0 text-muted transition-colors hover:text-fg"
    >
      <X size={16} />
    </button>
  );
}
