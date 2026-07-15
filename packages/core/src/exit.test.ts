import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isExitInfeasibilityFundable } from './exit.ts';

describe('isExitInfeasibilityFundable', () => {
  it('classifies funding shortfalls as fundable', () => {
    assert.equal(isExitInfeasibilityFundable('wallet_underfunded'), true);
    assert.equal(isExitInfeasibilityFundable('wallet_too_few_inputs'), true);
  });

  it('classifies structural reasons as not fundable', () => {
    assert.equal(isExitInfeasibilityFundable('sweep_below_dust'), false);
    assert.equal(isExitInfeasibilityFundable('uneconomical'), false);
    assert.equal(isExitInfeasibilityFundable('unspecified'), false);
  });
});
