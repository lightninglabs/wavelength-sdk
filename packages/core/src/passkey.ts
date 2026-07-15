/**
 * Labels how a local wallet is unlocked.
 */
export type WalletKind = 'passkey' | 'password';

/**
 * A passkey ceremony result: the PRF output (hex) shared with the Go SDK, plus
 * the credential id that produced it so callers can scope later assertions to the
 * same passkey.
 */
export type PasskeyAssertion = {
  /** The PRF output (hex) shared with the Go SDK. */
  prfOutput: string;
  /** The credential id that produced the PRF output. */
  credentialId: string;
};

/**
 * The per-platform passkey ceremony the passkey hook drives. The browser
 * (WebAuthn/PRF) implementation is walletdk-web's `webPasskeyCeremony`; a native
 * transport supplies its own. Injecting it keeps walletdk-react free of any
 * transport dependency.
 */
export type PasskeyCeremony = {
  /** Resolves true when the platform supports passkey PRF. */
  supportsPasskeyPrf(): Promise<boolean>;
  /** Registers a new passkey wallet and returns its assertion. */
  registerPasskeyWallet(appName: string): Promise<PasskeyAssertion>;
  /** Asserts an existing passkey, optionally scoped to a credential id. */
  assertPasskeyPrf(allowCredentialId?: string): Promise<PasskeyAssertion>;
};

/**
 * The PRF namespace every Wavelength passkey ceremony evaluates. Shared with the
 * Go SDK (PasskeyPRFNamespace); changing it would orphan every existing
 * passkey wallet.
 */
export const PASSKEY_PRF_NAMESPACE = 'walletdk-passkey:v1';

/**
 * SHA-256(PASSKEY_PRF_NAMESPACE) as lower-case hex: the fixed PRF evaluation
 * input (the WebAuthn prf.eval.first salt) every ceremony uses. The same salt
 * on every device and platform is what makes the derived wallet reproducible.
 * Precomputed so transports without WebCrypto (React Native/Hermes) need no
 * runtime digest; a core unit test pins it to the namespace.
 */
export const PASSKEY_PRF_SALT_HEX =
  'f3183b86bc0387ccf0554fb2ca2d5d7043a0fec02c9596ffc38533c08d520715';
