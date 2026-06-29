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
