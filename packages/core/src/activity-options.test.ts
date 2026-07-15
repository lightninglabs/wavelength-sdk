import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { validateActivityStreamOptions } from './activity-options.ts';
import { WavelengthError } from './errors.ts';

describe('validateActivityStreamOptions', () => {
  it('accepts zero and nonnegative safe integer cursors', () => {
    validateActivityStreamOptions({ cursor: 0 });
    validateActivityStreamOptions({ cursor: Number.MAX_SAFE_INTEGER });
  });

  for (const cursor of [-1, 1.5, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1]) {
    it(`rejects invalid cursor ${cursor}`, () => {
      assert.throws(
        () => validateActivityStreamOptions({ cursor }),
        (err: WavelengthError) => err.code === 'invalid_cursor',
      );
    });
  }
});
