import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { ChevronDown, ChevronUp, Power } from 'lucide-react-native';
import { AuthHeader } from '../../components/layout/AuthHeader';
import { AuthLayout } from '../../components/layout/AuthLayout';
import { GatewayFields } from '../../components/GatewayFields';
import { WipeDataButton } from '../../components/WipeDataButton';
import { PrimaryButton } from '../../components/ui/Button';
import { InlineError } from '../../components/ui/InlineError';
import { Segmented } from '../../components/ui/Segmented';
import {
  NETWORKS,
  RuntimeFieldSetter,
  RuntimeForm,
  RuntimeNetwork,
} from '../../lib/runtime-config';
import { Palette, fonts } from '../../theme/tokens';
import { useTheme } from '../../theme/ThemeProvider';
import { useThemedStyles } from '../../theme/useThemedStyles';

const makeStyles = (p: Palette) => ({
  stack: {
    gap: 16,
  },
  eyebrow: {
    color: p.muted,
    fontFamily: fonts.sansSemiBold,
    fontSize: 10,
    letterSpacing: 1.6,
    marginBottom: 8,
    textTransform: 'uppercase' as const,
  },
  advanced: {
    borderColor: p.border,
    borderWidth: 1,
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
    padding: 16,
  },
});

// ConnectScreen is the "Start runtime" screen (phase runtimeReady): pick a
// network, optionally adjust the server endpoints, and start. The runtime
// then decides whether the next step is create, unlock, or sync.
export function ConnectScreen({
  form,
  onField,
  onNetworkChange,
  onStart,
  onWipe,
  busy,
  error,
}: {
  form: RuntimeForm;
  onField: RuntimeFieldSetter;
  onNetworkChange: (network: RuntimeNetwork) => void;
  onStart: () => void;
  onWipe: () => void;
  busy: boolean;
  error: string;
}) {
  const { palette } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [advanced, setAdvanced] = useState(false);
  const Chevron = advanced ? ChevronUp : ChevronDown;

  return (
    <AuthLayout network={form.network}>
      <AuthHeader
        title="Start runtime"
        sub="Choose a network and the servers the runtime should connect to."
      />
      <View style={styles.stack}>
        <View>
          <Text style={styles.eyebrow}>Network</Text>
          <Segmented
            value={form.network}
            onChange={onNetworkChange}
            options={NETWORKS.map((n) => ({ value: n, label: n }))}
          />
        </View>

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
              <GatewayFields form={form} onField={onField} />
            </View>
          ) : null}
        </View>

        <PrimaryButton icon={Power} onPress={onStart} disabled={busy} busy={busy}>
          {busy ? 'Starting runtime…' : 'Start runtime'}
        </PrimaryButton>
        <InlineError message={error} />
        <WipeDataButton onWipe={onWipe} />
      </View>
    </AuthLayout>
  );
}
