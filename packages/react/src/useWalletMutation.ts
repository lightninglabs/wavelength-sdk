import { isPasskeyCancelled, toError } from "@lightninglabs/wavelength-core";
import { useCallback, useRef, useState } from "react";

type MutationState<R> = {
  pending: boolean;
  error: Error | null;
  data: R | null;
};

const IDLE = { pending: false, error: null, data: null };

/**
 * Hook-local mutation state shared by every mutation hook: `track` runs one
 * async operation, clearing the previous error and data up front, capturing a failure
 * into `error`, and rethrowing the same Error instance so imperative callers
 * can await/catch (throw-and-capture). A cancelled passkey ceremony rethrows
 * without being recorded: a dismissed OS prompt is not a failure to display.
 * `isPasskeyCancelled` (rather than a bare `instanceof`) is used because a
 * consumer bundle can end up with a duplicate copy of core (e.g. two resolved
 * package versions), which breaks `instanceof` across the boundary; the
 * predicate falls back to matching `err.name` for that case.
 *
 * Overlapping `track` calls are resolved by call order, not settlement order:
 * each call is stamped with a monotonically increasing generation, and only
 * the latest call is allowed to write state. An older call that settles
 * after a newer one still rethrows to its own caller; it just cannot clobber
 * the newer call's `pending: true` or its result.
 */
export function useWalletMutationState<R>(): {
  track: (operation: () => Promise<R>) => Promise<R>;
  reset: () => void;
} & MutationState<R> {
  const [state, setState] = useState<MutationState<R>>(IDLE);
  const generationRef = useRef(0);

  const track = useCallback(async (operation: () => Promise<R>): Promise<R> => {
    const generation = ++generationRef.current;
    setState({ pending: true, error: null, data: null });
    try {
      const data = await operation();
      if (generation === generationRef.current) {
        setState({ pending: false, error: null, data });
      }

      return data;
    } catch (err) {
      if (isPasskeyCancelled(err)) {
        if (generation === generationRef.current) {
          setState(IDLE);
        }
        throw err;
      }
      const error = toError(err);
      if (generation === generationRef.current) {
        setState({ pending: false, error, data: null });
      }
      throw error;
    }
  }, []);

  const reset = useCallback(() => {
    generationRef.current += 1;
    setState(IDLE);
  }, []);

  return { track, reset, ...state };
}
