import { useEffect, useState } from "react";
import { ShieldAlert } from "lucide-react";
import { FORCE_UNROLL_ACK } from "@lightninglabs/wavelength-react";
import { Modal } from "../ui/Modal";
import { Field } from "../ui/Field";
import { GhostButton } from "../ui/Button";

// ExitAckDialog is the last gate before a unilateral exit. It guards an
// irreversible, expensive on-chain action, so it carries deliberately more
// visual weight than an ordinary confirm: a danger banner spelling out the
// cost, and a type-to-confirm field that arms the action only on an exact
// match of the acknowledgement phrase.
export function ExitAckDialog({
  open,
  busy,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [typed, setTyped] = useState("");
  const armed = typed === FORCE_UNROLL_ACK;

  // This component stays mounted for the whole ExitScreen lifetime (Modal
  // only gates visibility of its children, not this component), so the typed
  // phrase must be cleared explicitly on every close. Without this, a second
  // unilateral exit would reopen with the phrase already filled in and the
  // confirm button already armed, defeating the deliberate-friction gate.
  useEffect(() => {
    if (!open) {
      setTyped("");
    }
  }, [open]);

  return (
    <Modal open={open} onClose={onCancel} labelledBy="exit-ack-title">
      <div data-testid="exit-ack-dialog" aria-label="Confirm unilateral exit">
        <div className="flex items-start gap-3">
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center
              bg-bad/15 text-bad"
          >
            <ShieldAlert size={18} />
          </div>
          <div>
            <h2 id="exit-ack-title" className="text-base font-semibold text-fg">
              Force unilateral exit
            </h2>
            <p className="mt-0.5 text-xs font-medium uppercase tracking-[0.12em] text-bad">
              This cannot be undone
            </p>
          </div>
        </div>

        <div className="mt-4 space-y-2 border border-bad/35 bg-bad/10 p-3.5 text-xs leading-relaxed text-fg">
          <p>Your funds are pushed on-chain, out of the shared protocol.</p>
          <p>
            The exit takes hours to days to finish as timelocks mature and
            transactions confirm.
          </p>
          <p>
            On-chain fees are paid from the backing wallet and are not
            recoverable.
          </p>
        </div>

        <div className="mt-5">
          <Field
            label={`Type ${FORCE_UNROLL_ACK} to confirm`}
            value={typed}
            onChange={setTyped}
            mono
          />
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3">
          <GhostButton onClick={onCancel} disabled={busy}>
            Cancel
          </GhostButton>
          <button
            type="button"
            data-testid="exit-ack-confirm"
            disabled={!armed || busy}
            onClick={onConfirm}
            className="inline-flex items-center justify-center gap-2 bg-bad
              px-4 py-2.5 text-sm font-semibold text-white transition-opacity
              hover:opacity-90 disabled:opacity-40"
          >
            {busy ? "Starting…" : "Force unilateral exit"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
