import type {
  WavelengthPerformanceEvent,
  WavelengthPerformanceListener,
} from '@lightninglabs/wavelength-core';

/** Returns a monotonic timestamp when available. */
export function performanceNow(): number {
  return globalThis.performance?.now?.() ?? Date.now();
}

/** Delivers an opt-in timing sample without affecting wallet behavior. */
export function reportPerformance(
  listener: WavelengthPerformanceListener | undefined,
  event: WavelengthPerformanceEvent,
): void {
  if (!listener) {
    return;
  }

  try {
    listener(event);
  } catch {
    // Performance reporting is diagnostic and must never break wallet work.
  }
}
