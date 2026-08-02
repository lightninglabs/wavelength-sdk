// The tick loop speaks just enough L402 to buy one thing, once, and then
// forget it ever had a token.
//
// That last part is the whole trick. L402's normal shape is pay once and reuse
// the token for many requests, which is the opposite of what a stream wants.
// But which credential to present is entirely the client's decision, so we
// simply never present one: every tick asks bare, gets a fresh challenge and a
// fresh invoice, pays it, takes the resource and throws the token away. The
// server is stock and does not need to know a stream is happening.

/** A parsed 402 challenge: somewhere to pay and something to pay it with. */
export interface L402Challenge {
  /** The BOLT11 invoice to settle. */
  invoice: string;
  /** The base64 macaroon to present alongside the preimage. */
  macaroon: string;
}

/**
 * Reads a challenge out of a 402 response.
 *
 * Aperture emits two WWW-Authenticate headers, a legacy `LSAT` one first and
 * an `L402` one after, carrying identical parameters. Fetch folds repeated
 * headers into a single comma-joined value, so a first-match read picks up the
 * legacy copy and gets exactly the same macaroon and invoice. We accept either
 * spelling rather than depending on which arrives first.
 */
export function parseChallenge(response: Response): L402Challenge {
  const header = response.headers.get("www-authenticate") ?? "";
  if (header === "") {
    throw new Error(
      "402 response carried no WWW-Authenticate header. If the board and " +
        "aperture are on different origins, check that aperture is " +
        "exposing the header via Access-Control-Expose-Headers.",
    );
  }

  const invoice = quotedParam(header, "invoice");
  const macaroon = quotedParam(header, "macaroon");

  if (invoice === "" || macaroon === "") {
    throw new Error(`402 challenge is missing an invoice or macaroon: ${header}`);
  }

  return { invoice, macaroon };
}

/**
 * Builds the credential header for a paid challenge. The preimage is the proof
 * of payment, so this is what turns the retry into a 200.
 */
export function authorizationHeader(
  challenge: L402Challenge,
  preimage: string,
): string {
  return `L402 ${challenge.macaroon}:${preimage}`;
}

/** Reads a quoted parameter out of a WWW-Authenticate value. */
function quotedParam(header: string, name: string): string {
  const match = new RegExp(`${name}\\s*=\\s*"([^"]*)"`, "i").exec(header);

  return match?.[1] ?? "";
}

/**
 * Reads the amount out of a BOLT11's human-readable part, in satoshis.
 *
 * The controller needs this because the client does not set the price: the
 * service quotes each tick, and under metered pricing that quote varies per
 * request. Deducting an assumed chunk instead of what was actually invoiced
 * would let the meter drift away from the money.
 *
 * Only the human-readable part is parsed, which is everything before the final
 * separator, so this needs no bech32 decode and no crypto. Returns null for an
 * amountless invoice or one whose amount cannot be read, which the caller must
 * treat as a refusal rather than as zero.
 */
export function invoiceAmountSat(bolt11: string): number | null {
  // The data part uses bech32's charset, which excludes the digit 1, so the
  // last 1 in the string is always the separator and an amount can never
  // contain one.
  const separator = bolt11.lastIndexOf("1");
  if (separator <= 0) {
    return null;
  }

  const hrp = bolt11.slice(0, separator).toLowerCase();
  const match = /^ln(?:bcrt|tbs|bc|tb|sb)(\d+)([munp])?$/.exec(hrp);
  if (match === null) {
    // Either an amountless invoice or a prefix we do not know. Both are a
    // refusal: an unreadable amount is not the same as no amount owed.
    return null;
  }

  const digits = Number(match[1]);
  if (!Number.isFinite(digits)) {
    return null;
  }

  // Each multiplier is a power of ten, so the conversion is a decimal shift.
  // Work in millisatoshis and round up, because a sub-satoshi invoice still
  // costs the payer a whole satoshi.
  const MSAT_PER_BTC = 1e11;
  const divisor = { m: 1e3, u: 1e6, n: 1e9, p: 1e12 }[match[2] ?? ""] ?? 1;
  const msat = (digits * MSAT_PER_BTC) / divisor;

  return Math.ceil(msat / 1000);
}
