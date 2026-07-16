import { useEffect, useRef, useState } from "react";
import { Landmark } from "lucide-react";
import {
  Balance,
  useWalletDeposit,
  useWalletSweep,
} from "@lightninglabs/wavelength-react";
import { formatSats } from "../../lib/format";

// OnChainBalance surfaces the backing wallet's confirmed on-chain balance, which
// is NOT part of the SDK Balance snapshot (that only covers Ark VTXO value).
// Cooperative-leave funds land here, so the Overview needs a way to show it.
//
// It reads the total by PREVIEWING a wallet sweep (broadcast:false moves no
// money) to a destination address minted once and cached: the preview needs a
// valid address but never sends. This is a best-effort, preview-call-as-balance
// -read (the clean fix is a real on-chain balance on the SDK facade). If the
// preview throws or finds no inputs, the line hides rather than showing an
// error, and it re-reads on each balance refresh.
export function OnChainBalance({ balance }: { balance: Balance | null }) {
  const { deposit } = useWalletDeposit();
  const { sweep } = useWalletSweep();
  const addressRef = useRef("");
  const [onchainSat, setOnchainSat] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    const read = async () => {
      try {
        // Mint one address and cache it, so a refresh reuses the same preview
        // destination instead of minting on every render.
        if (!addressRef.current) {
          addressRef.current = (await deposit()).address;
        }
        const result = await sweep({
          destinationAddress: addressRef.current,
          broadcast: false,
        });
        if (cancelled) {
          return;
        }
        // Hide the line when the backing wallet has nothing on-chain to sweep.
        const hasInputs = (result.inputs?.length ?? 0) > 0;
        setOnchainSat(hasInputs ? result.totalInputSat : null);
      } catch (err) {
        // Best-effort surface: on any failure, hide silently.
        console.warn("on-chain balance preview failed:", err);
        if (!cancelled) {
          setOnchainSat(null);
        }
      }
    };

    void read();

    return () => {
      cancelled = true;
    };
    // Re-read on each balance refresh: the snapshot object changes per refresh.
  }, [balance, deposit, sweep]);

  if (onchainSat === null) {
    return null;
  }

  return (
    <div
      data-testid="onchain-balance"
      className="mt-5 flex items-center justify-between border-t border-border
        pt-4 text-sm"
    >
      <span className="flex items-center gap-2 text-muted">
        <Landmark size={14} className="text-muted" />
        On-chain wallet
        <span className="text-xs text-faint">backing balance</span>
      </span>
      <span className="font-mono tabular-nums text-fg">
        {formatSats(onchainSat)} sats
      </span>
    </div>
  );
}
