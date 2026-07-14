import { FORCE_UNROLL_ACK, type ExitRequest } from './requests.ts';

const cooperativeExit: ExitRequest = { outpoint: 'tx:0', destination: 'bcrt1q...' };
const unilateralExit: ExitRequest = { outpoint: 'tx:0', forceUnrollAck: FORCE_UNROLL_ACK };
// @ts-expect-error destination and force acknowledgement are mutually exclusive.
const invalidExit: ExitRequest = {
  outpoint: 'tx:0',
  destination: 'bcrt1q...',
  forceUnrollAck: FORCE_UNROLL_ACK,
};
void cooperativeExit;
void unilateralExit;
void invalidExit;
