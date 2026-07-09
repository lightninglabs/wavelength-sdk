import { useMemo } from "react";
import { useWalletInfo, useWalletLogs } from "@lightninglabs/walletdk-react";
import { AuthHeader } from "../../components/layout/AuthHeader";
import { AuthLayout } from "../../components/layout/AuthLayout";
import { Card } from "../../components/ui/Card";
import { formatSats } from "../../lib/format";

type LogRow = { time: string; message: string };

// MAX_LOGS bounds the log tail shown on the syncing screen.
const MAX_LOGS = 8;

// SyncingScreen serves the `syncing` phase: the wallet exists and is scanning
// the chain to rebuild state. Progress is indeterminate (there is no synced-%
// telemetry); it advances automatically once the wallet reports ready. Chain
// tip and the log tail are self-served from the provider.
export function SyncingScreen({ network }: { network: string }) {
  const info = useWalletInfo();
  const { logs: engineLogs } = useWalletLogs();

  // Map the engine's buffered log tail to this screen's row shape. The engine
  // buffers newest-last and carries no per-line timestamp, so the window keeps
  // only the most recent MAX_LOGS entries, newest first; the time column is
  // left blank rather than faked.
  const logs: LogRow[] = useMemo(
    () =>
      engineLogs
        .slice(-MAX_LOGS)
        .reverse()
        .map((log) => ({ time: "", message: log.message })),
    [engineLogs],
  );

  return (
    <AuthLayout network={network}>
      <AuthHeader
        title="Syncing"
        sub="Scanning the chain and rebuilding wallet state."
      />
      <Card className="p-6">
        {info?.blockHeight ? (
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted">Chain tip</span>
            <span className="font-mono tabular-nums text-fg">
              block {formatSats(info.blockHeight)}
            </span>
          </div>
        ) : null}
        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-border">
          <div className="h-full w-1/3 animate-pulse rounded-full bg-accent" />
        </div>
        {logs.length > 0 ? (
          <div
            className="mt-5 space-y-2 border border-border bg-well p-3"
          >
            {logs.slice(0, 4).map((log) => (
              <div
                key={`${log.time}-${log.message}`}
                className="flex items-center gap-2 font-mono text-xs text-muted"
              >
                <span className="text-faint">{log.time}</span>
                <span className="truncate">{log.message}</span>
              </div>
            ))}
          </div>
        ) : null}
      </Card>
    </AuthLayout>
  );
}
