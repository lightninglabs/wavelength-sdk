/**
 * RUNTIME_MANIFEST_VERSION pins the daemon build this SDK release is paired
 * with: the generated types, the client methods, and the wasm runtime asset
 * set (RUNTIME_ASSET_FILES in the web transport) are all produced from this
 * one daemon revision.
 *
 * Hosted runtime assets live in a directory named after this value
 * (`<assets root>/<RUNTIME_MANIFEST_VERSION>/<file>`), so every asset set gets
 * a unique URL and a browser can never serve a stale cached runtime. Bump it
 * together with regenerating the daemon types and publishing the matching
 * asset set.
 *
 * Build tooling reads this value from the source text via
 * scripts/runtime-version.mjs, so keep the declaration in this exact
 * single-quoted literal form.
 */
export const RUNTIME_MANIFEST_VERSION = 'v0.1.0-rc4';
