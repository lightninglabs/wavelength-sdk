import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { ArrowRight, ChevronDown, ChevronUp } from 'lucide-react-native';
import { DEBUG_LEVELS } from '@lightninglabs/wavelength-react-native';
import { AuthHeader } from '../../components/layout/AuthHeader';
import { AuthLayout } from '../../components/layout/AuthLayout';
import { Field } from '../../components/ui/Field';
import { Select } from '../../components/ui/Select';
import { InlineError } from '../../components/ui/InlineError';
import { PrimaryButton, TextLink } from '../../components/ui/Button';
import { NetworkPicker } from '../../components/ui/NetworkPicker';
import { ToggleRow } from '../../components/ui/ToggleRow';
import {
  endpointsForNetwork,
  NETWORKS,
  RuntimeNetwork,
  WalletEndpoints,
} from '../../lib/runtime-config';
import { Palette, fonts } from '../../theme/tokens';
import { useTheme } from '../../theme/ThemeProvider';
import { useThemedStyles } from '../../theme/useThemedStyles';

const makeStyles = (p: Palette) => ({
  eyebrow: {
    color: p.muted,
    fontFamily: fonts.sansSemiBold,
    fontSize: 10,
    letterSpacing: 1.6,
    marginBottom: 8,
    textTransform: 'uppercase' as const,
  },
  networkBlock: {
    marginBottom: 16,
  },
  advanced: {
    borderColor: p.border,
    borderWidth: 1,
    marginBottom: 16,
  },
  advancedHead: {
    alignItems: 'center' as const,
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  advancedTitle: {
    color: p.text,
    fontFamily: fonts.sansMedium,
    fontSize: 14,
  },
  advancedBody: {
    borderColor: p.border,
    borderTopWidth: 1,
    gap: 16,
    padding: 16,
  },
  link: {
    alignItems: 'center' as const,
    marginTop: 20,
  },
});

// ChooseNetworkScreen serves a legacy registry entry (predating per-wallet
// network tracking): its network is unknown until this one-time pick.
// Regtest carries the same advanced endpoints section as WalletSetupScreen,
// because a real legacy regtest wallet needs its local server addresses
// re-entered; hosted networks reuse their SDK preset regardless of what is
// edited here. The pick is only persisted after a successful unlock proves it
// right, so a wrong guess just surfaces as an InlineError and the user tries
// again.
export function ChooseNetworkScreen({
  walletName,
  regtestUnlocked,
  onUnlockRegtest,
  onSubmit,
  onBack,
  busy,
  error,
}: {
  walletName: string;
  regtestUnlocked: boolean;
  onUnlockRegtest: () => void;
  onSubmit: (network: RuntimeNetwork, endpoints: WalletEndpoints) => void;
  onBack: () => void;
  busy: boolean;
  error: string;
}) {
  const { palette } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const availableNetworks = NETWORKS.filter(
    (n) => n !== 'regtest' || regtestUnlocked,
  );

  const [network, setNetwork] = useState<RuntimeNetwork>(availableNetworks[0]);
  const [endpoints, setEndpoints] = useState<WalletEndpoints>(() =>
    endpointsForNetwork(availableNetworks[0]),
  );
  const [advanced, setAdvanced] = useState(false);
  const Chevron = advanced ? ChevronUp : ChevronDown;

  function onNetworkChange(next: RuntimeNetwork) {
    setNetwork(next);
    setEndpoints(endpointsForNetwork(next));
  }

  function setField<K extends keyof WalletEndpoints>(
    key: K,
    value: WalletEndpoints[K],
  ) {
    setEndpoints((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit() {
    onSubmit(
      network,
      network === 'regtest' ? endpoints : endpointsForNetwork(network),
    );
  }

  return (
    <AuthLayout network={network}>
      <Pressable onLongPress={onUnlockRegtest} delayLongPress={600}>
        <AuthHeader
          title="Choose network"
          sub={`"${walletName}" was created before wallets tracked their network. Pick the one it was set up on; this is remembered after it unlocks successfully.`}
        />
      </Pressable>

      <View style={styles.networkBlock}>
        <Text style={styles.eyebrow}>Network</Text>
        <NetworkPicker
          value={network}
          onChange={onNetworkChange}
          options={availableNetworks}
        />
      </View>

      {network === 'regtest' ? (
        <View style={styles.advanced}>
          <Pressable
            onPress={() => setAdvanced((v) => !v)}
            style={styles.advancedHead}
          >
            <Text style={styles.advancedTitle}>Advanced endpoints</Text>
            <Chevron size={16} color={palette.muted} />
          </Pressable>
          {advanced ? (
            <View style={styles.advancedBody}>
              <Field
                label="Ark server address"
                value={endpoints.arkServerAddress}
                onChange={(v) => setField('arkServerAddress', v)}
                mono
              />
              <Field
                label="Wallet Esplora URL"
                value={endpoints.walletEsploraUrl}
                onChange={(v) => setField('walletEsploraUrl', v)}
                mono
              />
              <Field
                label="Swap server address"
                value={endpoints.swapServerAddress}
                onChange={(v) => setField('swapServerAddress', v)}
                mono
              />
              <Select
                label="Debug level"
                value={endpoints.debugLevel}
                onChange={(v) =>
                  setField('debugLevel', v as WalletEndpoints['debugLevel'])
                }
                options={DEBUG_LEVELS}
              />
              <ToggleRow
                title="Allow insecure transport"
                subtitle="Permit non-TLS Ark server connections"
                on={endpoints.arkServerInsecure}
                onChange={(v) => setField('arkServerInsecure', v)}
              />
              <ToggleRow
                title="Allow insecure swap transport"
                subtitle="Permit non-TLS swap server connections"
                on={endpoints.swapServerInsecure}
                onChange={(v) => setField('swapServerInsecure', v)}
              />
            </View>
          ) : null}
        </View>
      ) : null}

      <PrimaryButton
        icon={ArrowRight}
        iconRight
        onPress={handleSubmit}
        busy={busy}
        disabled={busy}
      >
        Continue
      </PrimaryButton>
      <InlineError message={error} />

      <View style={styles.link}>
        <TextLink onPress={onBack}>Back to wallets</TextLink>
      </View>
    </AuthLayout>
  );
}
