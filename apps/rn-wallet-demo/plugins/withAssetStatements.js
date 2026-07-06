// Resolved through expo's re-export: the app depends on expo directly, and
// build-phase config evaluation (expo-constants) requires this plugin with
// plain CJS resolution, where the scoped package is not reachable under
// pnpm's isolated node_modules.
const {
  AndroidConfig,
  withAndroidManifest,
  withStringsXml,
} = require('expo/config-plugins');

// The app-side half of the Digital Asset Links association that Android
// passkeys require: an asset_statements string resource naming the relying
// party's assetlinks.json, referenced from a manifest meta-data entry. The
// server-side half is that assetlinks.json vouching for this app. See the
// Credential Manager prerequisites documentation.
const RP_ASSETLINKS_URL =
  'https://dadocs.lightning.engineering/.well-known/assetlinks.json';

// The double quotes are backslash-escaped because the Android resource
// compiler treats bare quotes in a string resource as delimiters and strips
// them; the escaped form compiles to plain JSON at runtime.
const ASSET_STATEMENTS = `[{\\"include\\": \\"${RP_ASSETLINKS_URL}\\"}]`;

module.exports = function withAssetStatements(config) {
  config = withStringsXml(config, (cfg) => {
    cfg.modResults = AndroidConfig.Strings.setStringItem(
      [
        {
          $: { name: 'asset_statements', translatable: 'false' },
          _: ASSET_STATEMENTS,
        },
      ],
      cfg.modResults,
    );
    return cfg;
  });

  return withAndroidManifest(config, (cfg) => {
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(
      cfg.modResults,
    );
    app['meta-data'] = (app['meta-data'] ?? []).filter(
      (entry) => entry.$['android:name'] !== 'asset_statements',
    );
    app['meta-data'].push({
      $: {
        'android:name': 'asset_statements',
        'android:resource': '@string/asset_statements',
      },
    });
    return cfg;
  });
};
