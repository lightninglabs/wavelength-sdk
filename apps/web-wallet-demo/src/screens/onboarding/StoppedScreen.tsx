import { Power } from "lucide-react";
import { useWalletInfo } from "@lightninglabs/wavelength-react";
import { AuthHeader } from "../../components/layout/AuthHeader";
import { AuthLayout } from "../../components/layout/AuthLayout";
import { Card } from "../../components/ui/Card";
import { PrimaryButton } from "../../components/ui/Button";

// StoppedScreen serves the `stopped` phase: the runtime was torn down and its
// in-memory keys cleared. There is nothing more to do with this wallet in
// this state, so the only action is back to the wallet list; opening it
// again from there re-runs the unlock flow. The last known block height and
// version are self-served from the provider (the engine keeps the most
// recent info around after a stop).
export function StoppedScreen({
  network,
  onBack,
}: {
  network: string;
  onBack: () => void;
}) {
  const info = useWalletInfo();
  const blockHeight = info?.blockHeight;
  const version = info?.version;

  return (
    <AuthLayout network={network}>
      <AuthHeader
        title="Runtime stopped"
        sub={`The runtime was torn down. Open it again from the wallet list to reconnect to the ${network} servers.`}
      />
      <Card className="p-6">
        <div className="flex items-center gap-3">
          <span
            className="flex h-11 w-11 items-center justify-center border
              border-border bg-surface-alt"
          >
            <Power size={20} className="text-muted" />
          </span>
          <div>
            <div className="text-sm font-medium text-fg">
              In-memory keys cleared
            </div>
            {blockHeight || version ? (
              <div className="font-mono text-xs tabular-nums text-faint">
                {blockHeight ? `last block ${blockHeight}` : ""}
                {blockHeight && version ? " · " : ""}
                {version ? `v${version}` : ""}
              </div>
            ) : null}
          </div>
        </div>
      </Card>
      <div className="mt-5">
        <PrimaryButton icon={Power} onClick={onBack}>
          Back to wallet list
        </PrimaryButton>
      </div>
      <p className="mt-3 text-center text-xs text-faint">
        You will need your password or passkey to unlock again.
      </p>
    </AuthLayout>
  );
}
