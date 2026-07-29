import type { ConfigContext, ExpoConfig } from 'expo/config';

// The relying party whose /.well-known/ association files vouch for this demo
// app. Passkeys bind to it on both platforms, but only iOS declares it as an
// app entitlement: Android carries the association through the
// asset_statements resource that ./plugins/withAssetStatements adds.
const RP_ID = 'wavelength.lightning.engineering';

// Set this to 1 to build with the associated-domains entitlement that iOS
// passkeys require.
const IOS_PASSKEYS_ENV = 'WAVELENGTH_IOS_PASSKEYS';

// The entitlement is opt-in because `expo run:ios` refuses to build a target
// declaring com.apple.developer.associated-domains unless the machine has an
// Apple development certificate, simulator builds included. Off by default,
// the demo builds on a checkout with no Apple developer setup at all. Nothing
// is lost today: the iOS half of the association still awaits a Team ID, so
// the entitlement cannot validate either way. See the README.
export default ({ config }: ConfigContext): ExpoConfig => {
  if (process.env[IOS_PASSKEYS_ENV] !== '1') {
    return config as ExpoConfig;
  }

  return {
    ...config,
    ios: {
      ...config.ios,
      associatedDomains: [`webcredentials:${RP_ID}`],
    },
  } as ExpoConfig;
};
