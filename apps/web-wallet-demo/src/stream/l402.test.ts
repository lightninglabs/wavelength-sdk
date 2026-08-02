import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { invoiceAmountSat } from "./l402.ts";

describe("invoiceAmountSat", () => {
  it("reads each BOLT11 multiplier", () => {
    // 1 milli-BTC is 100,000 sats.
    assert.equal(invoiceAmountSat("lnbcrt1m1placeholder"), 100_000);
    // 10 micro-BTC is 1,000 sats, the operator's minimum.
    assert.equal(invoiceAmountSat("lnbcrt10u1placeholder"), 1_000);
    // 10,000 nano-BTC is also 1,000 sats.
    assert.equal(invoiceAmountSat("lnbcrt10000n1placeholder"), 1_000);
    // A whole bitcoin, with no multiplier at all.
    assert.equal(invoiceAmountSat("lnbcrt21placeholder"), 200_000_000);
  });

  it("rounds a sub-satoshi amount up, the way a payer is debited", () => {
    // 1 pico-BTC is a tenth of a millisatoshi. It still costs a whole sat.
    assert.equal(invoiceAmountSat("lnbcrt1p1placeholder"), 1);
  });

  it("works across networks", () => {
    assert.equal(invoiceAmountSat("lnbc10u1placeholder"), 1_000);
    assert.equal(invoiceAmountSat("lntbs10u1placeholder"), 1_000);
    assert.equal(invoiceAmountSat("lntb10u1placeholder"), 1_000);
  });

  it("returns null rather than zero for an unreadable amount", () => {
    // An unreadable amount is a refusal, not a free tick, so every one of
    // these must be distinguishable from an invoice for zero.
    for (const bad of [
      "lnbcrt1placeholder", // amountless
      "", // empty
      "notaninvoice", // no separator
      "lnxyz10u1placeholder", // unknown network prefix
    ]) {
      assert.equal(invoiceAmountSat(bad), null, bad);
    }
  });
});
