import { useState } from "react";
import { ConfirmDialog } from "./ui/ConfirmDialog";
import { requestWipe } from "../lib/wipeLocalData";

// WipeDataButton is the escape hatch offered on the pre-runtime screens. The
// settings screen only exists once the runtime is up, so a wallet whose stored
// data keeps the runtime from starting (a stale database, say) would otherwise
// trap the user with no way to clear it. It is a quiet text link, matching the
// unlock screen's "Start over" affordance: starting or retrying stays the only
// prominent action, and the confirmation carries the weight of the warning.
export function WipeDataButton() {
  const [confirmWipe, setConfirmWipe] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setConfirmWipe(true)}
        className="text-xs text-faint underline underline-offset-2
          transition-colors hover:text-muted"
      >
        Clear wallet data
      </button>

      <ConfirmDialog
        open={confirmWipe}
        title="Clear wallet data?"
        description="This permanently deletes the wallet and all data stored in this browser. You can only get it back with your recovery phrase or passkey. This cannot be undone."
        confirmLabel="Clear everything"
        destructive
        onConfirm={requestWipe}
        onCancel={() => setConfirmWipe(false)}
      />
    </>
  );
}
