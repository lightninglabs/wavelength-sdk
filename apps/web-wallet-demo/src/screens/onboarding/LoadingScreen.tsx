import { RefreshCw } from "lucide-react";
import { AuthHeader } from "../../components/layout/AuthHeader";
import { AuthLayout } from "../../components/layout/AuthLayout";
import { WipeDataButton } from "../../components/WipeDataButton";
import { Card } from "../../components/ui/Card";
import { InlineError } from "../../components/ui/InlineError";
import { PrimaryButton } from "../../components/ui/Button";
import { Spinner } from "../../components/ui/Spinner";

// LoadingScreen is the boot/transition splash shown while the WASM runtime
// downloads and instantiates, and during start/stop transitions. It normally
// carries no action (the wallet phase advances it automatically), but the
// runtime start can fail without changing phase, so an optional error + onRetry
// turns the otherwise endless spinner into a message the user can act on.
export function LoadingScreen({
  network,
  title,
  sub,
  version,
  commit,
  error,
  onRetry,
}: {
  network: string;
  title: string;
  sub: string;
  version?: string;
  commit?: string;
  error?: string;
  onRetry?: () => void;
}) {
  const failed = Boolean(error);

  return (
    <AuthLayout network={network}>
      <AuthHeader title={title} sub={sub} />
      <Card className="p-6">
        {failed ? (
          <InlineError message={error ?? ""} />
        ) : (
          <>
            <div className="flex items-center gap-3">
              <Spinner />
              <span className="text-sm font-medium text-fg">{sub}</span>
            </div>
            <div
              className="mt-4 h-2 w-full overflow-hidden rounded-full bg-border"
            >
              <div className="h-full w-1/3 animate-pulse rounded-full bg-accent" />
            </div>
          </>
        )}
        {version || commit ? (
          <div
            className="mt-3 flex items-center justify-between font-mono text-xs
              tabular-nums text-faint"
          >
            <span>{version ? `v${version}` : ""}</span>
            <span>{commit ? `commit ${commit}` : ""}</span>
          </div>
        ) : null}
      </Card>
      {failed && onRetry ? (
        <div className="mt-5">
          <PrimaryButton icon={RefreshCw} onClick={onRetry}>
            Try again
          </PrimaryButton>
          <div className="mt-3 text-center">
            <WipeDataButton />
          </div>
        </div>
      ) : null}
    </AuthLayout>
  );
}
