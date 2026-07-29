import { useState } from "react";
import { RotateCcw, TriangleAlert } from "lucide-react";
import { AuthHeader } from "../../components/layout/AuthHeader";
import { AuthLayout } from "../../components/layout/AuthLayout";
import { Card } from "../../components/ui/Card";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { GhostButton, PrimaryButton } from "../../components/ui/Button";

// DataMissingScreen serves a registered wallet whose OPFS data is gone: the
// browser cleared storage (private mode, an eviction, a manual clear) out
// from under a wallet that is still listed in the registry. Both the
// registry entry and the on-disk data are independent stores, so this state
// is reachable without any single deletion path being at fault.
export function DataMissingScreen({
  walletName,
  network,
  onSetUpAgain,
  onRemove,
}: {
  walletName: string;
  network: string;
  onSetUpAgain: () => void;
  onRemove: () => void;
}) {
  const [confirmRemove, setConfirmRemove] = useState(false);

  return (
    <AuthLayout network={network}>
      <AuthHeader
        title="Wallet data missing"
        sub={`This browser no longer holds "${walletName}"'s data, even though it is still listed.`}
      />
      <Card className="p-6">
        <div className="flex items-start gap-3">
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center
              border border-warn/30 bg-warn/10 text-warn"
          >
            <TriangleAlert size={18} />
          </span>
          <p className="text-sm text-fg">
            Its storage was cleared, most likely by the browser reclaiming
            space or a manual data wipe. Set it up again with your recovery
            phrase or passkey, or remove it from the list.
          </p>
        </div>
      </Card>

      <div className="mt-5 space-y-3">
        <PrimaryButton icon={RotateCcw} onClick={onSetUpAgain}>
          Set up again
        </PrimaryButton>
        <GhostButton onClick={() => setConfirmRemove(true)}>
          Remove wallet
        </GhostButton>
      </div>

      <ConfirmDialog
        open={confirmRemove}
        title="Remove this wallet?"
        description="This removes the wallet from this list only. There is no data left to reclaim; it is already gone from this browser's storage."
        confirmLabel="Remove wallet"
        destructive
        onConfirm={() => {
          setConfirmRemove(false);
          onRemove();
        }}
        onCancel={() => setConfirmRemove(false)}
      />
    </AuthLayout>
  );
}
