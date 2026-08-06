import {
  createWebPasskeyCeremony,
  type WavelengthPerformanceEvent,
} from "@lightninglabs/wavelength-web";

declare global {
  interface Window {
    __wavelengthReportPerformance?: (
      event: WavelengthPerformanceEvent,
    ) => void;
  }
}

// The demo exposes timing samples only when a diagnostic or benchmark installs
// the callback before boot. Normal users pay only the optional callback check.
export function reportPerformance(event: WavelengthPerformanceEvent): void {
  window.__wavelengthReportPerformance?.(event);
}

export const performanceListener = window.__wavelengthReportPerformance
  ? reportPerformance
  : undefined;

// Keep passkey ceremony timing on the same structured sink as runtime and
// wallet-engine timing.
export const instrumentedPasskeyCeremony = createWebPasskeyCeremony({
  onPerformance: performanceListener,
});
