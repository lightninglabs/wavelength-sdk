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
  field: {
    marginBottom: 16,
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
  links: {
    alignItems: 'center' as const,
    flexDirection: 'row' as const,
    gap: 16,
    justifyContent: 'center' as const,
    marginTop: 20,
  },
});

// WalletSetupScreen collects everything a fresh registry entry needs: a
// display name, the network, and (only for regtest, where there is no hosted
// preset) the server endpoints. It serves both the create and restore flows;
// the flows differ only in copy here, diverging afterward. onSwitchMode flips
// between the two flows in place, which is also how a fresh device (no
// wallet list yet) reaches restore at all.
//
// Regtest is gated behind a long press on the header title (no visible
// affordance, matching the web demo's dev gate): long-pressing while regtest
// is already visible is a harmless no-op for the caller to implement.
export function WalletSetupScreen({
  mode,
  regtestUnlocked,
  onUnlockRegtest,
  onSubmit,
  onSwitchMode,
  onBack,
  busy,
  error,
}: {
  mode: 'create' | 'restore';
  regtestUnlocked: boolean;
  onUnlockRegtest: () => void;
  onSubmit: (args: {
    name: string;
    network: RuntimeNetwork;
    endpoints: WalletEndpoints;
  }) => void;
  onSwitchMode: () => void;
  onBack: (() => void) | null;
  busy: boolean;
  error: string;
}) {
  const { palette } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const availableNetworks = NETWORKS.filter(
    (n) => n !== 'regtest' || regtestUnlocked,
  );

  const [name, setName] = useState('My Wallet');
  const [network, setNetwork] = useState<RuntimeNetwork>(availableNetworks[0]);
  const [endpoints, setEndpoints] = useState<WalletEndpoints>(() =>
    endpointsForNetwork(availableNetworks[0]),
  );
  const [advanced, setAdvanced] = useState(false);
  const Chevron = advanced ? ChevronUp : ChevronDown;

  // Endpoints are only ever hand-edited for regtest, so switching away from it
  // resets the draft: nothing is lost, since the non-regtest presets are
  // recomputed from endpointsForNetwork at submit time regardless.
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

  const trimmedName = name.trim();

  function handleSubmit() {
    onSubmit({
      name: trimmedName,
      network,
      endpoints: network === 'regtest' ? endpoints : endpointsForNetwork(network),
    });
  }

  return (
    <AuthLayout network={network}>
      <Pressable onLongPress={onUnlockRegtest} delayLongPress={600}>
        <AuthHeader
          title={mode === 'create' ? 'Create a wallet' : 'Restore a wallet'}
          sub="Name it, choose a network, and continue."
        />
      </Pressable>

      <View style={styles.field}>
        <Field label="Wallet name" value={name} onChange={setName} />
      </View>

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
        disabled={busy || trimmedName.length === 0}
      >
        Continue
      </PrimaryButton>
      <InlineError message={error} />

      <View style={styles.links}>
        <TextLink onPress={onSwitchMode}>
          {mode === 'create' ? 'Restore instead' : 'Create instead'}
        </TextLink>
        {onBack ? <TextLink onPress={onBack}>Back to wallets</TextLink> : null}
      </View>
    </AuthLayout>
  );
}
