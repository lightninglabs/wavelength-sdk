import { createNativePasskeyCeremony } from '@lightninglabs/wavelength-react-native';

// The demo's relying party: the docs site serves the association files that
// vouch for this app. Demo-grade trust; see the README. A single module-level
// instance is shared by every screen that runs a passkey ceremony (onboarding
// and unlock), mirroring the web demo's instrumentedPasskeyCeremony in
// src/lib/performance.ts.
export const passkeyCeremony = createNativePasskeyCeremony({
  rpId: 'wavelength.lightning.engineering',
});
