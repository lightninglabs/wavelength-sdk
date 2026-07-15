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
 * (WebAuthn/PRF) implementation is wavelength-web's `webPasskeyCeremony`; a native
 * transport supplies its own. Injecting it keeps wavelength-react free of any
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
 * The PRF namespace every Wavelength passkey ceremony evaluates. Chosen
 * client-side: its SHA-256 (PASSKEY_PRF_SALT_HEX) is the fixed WebAuthn
 * prf.eval.first salt every ceremony evaluates, and the resulting raw PRF
 * output is what the daemon's HKDF derivation consumes. Changing it re-derives
 * (orphans) every existing passkey wallet.
 */
export const PASSKEY_PRF_NAMESPACE = 'wavewalletdk-passkey:v1';

/**
 * SHA-256(PASSKEY_PRF_NAMESPACE) as lower-case hex: the fixed PRF evaluation
 * input (the WebAuthn prf.eval.first salt) every ceremony uses. The same salt
 * on every device and platform is what makes the derived wallet reproducible.
 * Precomputed so transports without WebCrypto (React Native/Hermes) need no
 * runtime digest; a core unit test pins it to the namespace.
 */
export const PASSKEY_PRF_SALT_HEX =
  '9a7a2e0ff3c5d1f2f172cd5edd67527bf392ae399048eb6e36b9cb6c3ab89d03';
