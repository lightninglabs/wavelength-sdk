import { RefreshCw, TriangleAlert } from "lucide-react";
import { AuthHeader } from "../../components/layout/AuthHeader";
import { AuthLayout } from "../../components/layout/AuthLayout";
import { WipeDataButton } from "../../components/WipeDataButton";
import { Card } from "../../components/ui/Card";
import { PrimaryButton } from "../../components/ui/Button";

// ErrorScreen serves the `error` phase: the runtime failed to initialise or
// start. It surfaces the message and offers a retry, plus the wipe escape
// hatch for when stored data (a stale database, say) is what keeps the
// runtime from starting. Expected conditions (the wallet already running in
// another tab, say) override the title/sub/message with friendlier copy and
// hide the wipe button, which cannot help there.
export function ErrorScreen({
  network,
  message,
  onRetry,
  busy,
  title = "Runtime error",
  sub = "Something went wrong starting the wallet runtime.",
  showWipe = true,
}: {
  network: string;
  message: string;
  onRetry: () => void;
  busy: boolean;
  title?: string;
  sub?: string;
  showWipe?: boolean;
}) {
  return (
    <AuthLayout network={network}>
      <AuthHeader title={title} sub={sub} />
      <Card className="p-6">
        <div className="flex items-start gap-3">
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center
              border border-bad/30 bg-bad/10 text-bad"
          >
            <TriangleAlert size={18} />
          </span>
          <p className="break-words text-sm text-fg">
            {message || "Unknown error."}
          </p>
        </div>
      </Card>
      <div className="mt-5">
        <PrimaryButton icon={RefreshCw} onClick={onRetry} disabled={busy}>
          {busy ? "Retrying…" : "Try again"}
        </PrimaryButton>
        {showWipe && (
          <div className="mt-3 text-center">
            <WipeDataButton />
          </div>
        )}
      </div>
    </AuthLayout>
  );
}
