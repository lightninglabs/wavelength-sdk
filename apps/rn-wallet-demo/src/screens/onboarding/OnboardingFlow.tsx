import { useState } from 'react';
import { WalletMode } from '../../components/ui/WalletTypePicker';
import { CreateWalletScreen } from './CreateWalletScreen';
import { RestoreWalletScreen } from './RestoreWalletScreen';

type Step = 'create' | 'restore';

// OnboardingFlow serves the needsWallet phase (runtime started, no local
// wallet). It routes between creating a wallet and restoring one from a
// phrase. leadWithUnlock is computed by WalletApp from the stored wallet
// markers (a recorded passkey wallet means the user should re-open it rather
// than mint a second one).
export function OnboardingFlow({
  network,
  passkeySupported,
  leadWithUnlock,
  onCreate,
  onRestore,
  onUnlockPasskey,
  busy,
  error,
  passkeyBusy,
  passkeyError,
}: {
  network: string;
  passkeySupported: boolean;
  leadWithUnlock: boolean;
  onCreate: (args: { password: string; mode: WalletMode }) => void;
  onRestore: (args: {
    password: string;
    mnemonic: string[];
    passphrase: string;
    recoverState: boolean;
    recoveryWindow?: number;
  }) => void;
  onUnlockPasskey: () => void;
  busy: boolean;
  error: string;
  passkeyBusy: boolean;
  passkeyError: string;
}) {
  const [step, setStep] = useState<Step>('create');

  if (step === 'restore') {
    return (
      <RestoreWalletScreen
        network={network}
        onRestore={onRestore}
        onBack={() => setStep('create')}
        busy={busy}
        error={error}
      />
    );
  }

  return (
    <CreateWalletScreen
      network={network}
      passkeySupported={passkeySupported}
      leadWithUnlock={leadWithUnlock}
      onCreate={onCreate}
      onUnlockPasskey={onUnlockPasskey}
      onRestore={() => setStep('restore')}
      busy={busy}
      error={error}
      passkeyBusy={passkeyBusy}
      passkeyError={passkeyError}
    />
  );
}
