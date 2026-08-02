// The board is a display, not a participant. The wallet registers a stream
// with it, pushes a receipt after each settled tick, and tells it when the run
// is over. Nothing here is in the payment path: a board that is down costs the
// demo its screen and not its money, which is why every call is allowed to
// fail without stopping the stream.

/** What the board tells a wallet when it registers a stream. */
export interface StreamRegistration {
  /** The board's id for this stream, carried on every later call. */
  streamId: string;
  /** The L402-protected URL to pay against. */
  tickEndpoint: string;
  /** The smallest chunk the service will accept. */
  minSats: number;
  /** The largest chunk the service will accept. */
  maxSats: number;
  /** The pinned exchange rate, so the wallet and the board agree on dollars. */
  usdPerBtc: number;
}

/** A settled tick, pushed for the board to check and display. */
export interface ReceiptPush {
  bolt11: string;
  preimage: string;
  streamId: string;
  seq: number;
}

/** A minimal client for the board's HTTP surface. */
export class BoardClient {
  private readonly baseUrl: string;
  private readonly doFetch: typeof fetch;

  constructor(baseUrl: string, doFetch: typeof fetch = fetch) {
    // A trailing slash would double up against the paths below.
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.doFetch = doFetch;
  }

  /** Registers a stream and learns where to pay. */
  async register(rateMsatPerSec: number): Promise<StreamRegistration> {
    const response = await this.doFetch(`${this.baseUrl}/api/stream`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ rateMsatPerSec }),
    });

    if (!response.ok) {
      throw new Error(
        `board refused the stream: ${response.status} ${await safeText(response)}`,
      );
    }

    return (await response.json()) as StreamRegistration;
  }

  /**
   * Pushes a settled tick. The board proves it rather than believing it, so
   * there is nothing secret here and nothing to sign.
   */
  async pushReceipt(receipt: ReceiptPush): Promise<void> {
    const response = await this.doFetch(`${this.baseUrl}/api/receipt`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(receipt),
    });

    if (!response.ok) {
      throw new Error(
        `board rejected the receipt: ${response.status} ${await safeText(response)}`,
      );
    }
  }

  /**
   * Ends the run, declaring the residual that accrued but never reached a
   * whole chunk. The board shows it as forgiven, which is what metered billing
   * does below a minimum charge.
   */
  async stop(streamId: string, forgivenMsat: number): Promise<void> {
    const response = await this.doFetch(
      `${this.baseUrl}/api/stream/${encodeURIComponent(streamId)}/stop`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ forgivenMsat: Math.floor(forgivenMsat) }),
      },
    );

    if (!response.ok) {
      throw new Error(
        `board refused the stop: ${response.status} ${await safeText(response)}`,
      );
    }
  }
}

/** Reads an error body without letting the read itself throw. */
async function safeText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return "";
  }
}
