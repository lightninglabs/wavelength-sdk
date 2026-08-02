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
