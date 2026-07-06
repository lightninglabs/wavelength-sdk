import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { ClipboardPaste, KeyRound } from 'lucide-react-native';
import { AuthHeader } from '../../components/layout/AuthHeader';
import { AuthLayout } from '../../components/layout/AuthLayout';
import { GhostButton, PrimaryButton } from '../../components/ui/Button';
import { Field } from '../../components/ui/Field';
import { InlineError } from '../../components/ui/InlineError';
import { Segmented } from '../../components/ui/Segmented';
import { Palette, fonts } from '../../theme/tokens';
import { useTheme } from '../../theme/ThemeProvider';
import { useThemedStyles } from '../../theme/useThemedStyles';

// resize grows or shrinks a word list to the requested length, preserving any
// already-entered words.
function resize(words: string[], length: number): string[] {
  const next = words.slice(0, length);
  while (next.length < length) {
    next.push('');
  }

  return next;
}

// parseMnemonicPaste splits clipboard text on whitespace into words.
function parseMnemonicPaste(text: string): string[] {
  return text
    .trim()
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length > 0);
}

const makeStyles = (p: Palette) => ({
  form: {
    gap: 16,
  },
  phraseHead: {
    alignItems: 'center' as const,
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    marginBottom: 8,
  },
  eyebrow: {
    color: p.muted,
    fontFamily: fonts.sansSemiBold,
    fontSize: 10,
    letterSpacing: 1.6,
    textTransform: 'uppercase' as const,
  },
  grid: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 8,
  },
  wordBox: {
    alignItems: 'center' as const,
    backgroundColor: p.well,
    borderColor: p.border,
    borderWidth: 1,
    flexBasis: '48%' as const,
    flexDirection: 'row' as const,
    flexGrow: 1,
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  wordIndex: {
    color: p.faint,
    fontFamily: fonts.mono,
    fontSize: 11,
  },
  wordInput: {
    color: p.text,
    flex: 1,
    fontFamily: fonts.sans,
    fontSize: 14,
    paddingVertical: 2,
  },
});

// RestoreWalletScreen rebuilds a wallet on-device from an existing recovery
// phrase. Restores are always password wallets, so it collects a new local
// password alongside the phrase.
export function RestoreWalletScreen({
  network,
  onRestore,
  onBack,
  busy,
  error,
}: {
  network: string;
  onRestore: (args: {
    password: string;
    mnemonic: string[];
    passphrase: string;
  }) => void;
  onBack: () => void;
  busy: boolean;
  error: string;
}) {
  const { palette } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [count, setCount] = useState<12 | 24>(12);
  const [words, setWords] = useState<string[]>(() => resize([], 12));
  const [passphrase, setPassphrase] = useState('');

  const passwordOk = password.length > 0 && password === confirm;
  const wordsOk = words.every((w) => w.trim().length > 0);
  const canSubmit = !busy && passwordOk && wordsOk;

  // pastePhrase distributes a multi-word clipboard string across the inputs,
  // switching the word count when the clipboard holds exactly 12 or 24 words.
  // A clipboard read can reject under platform access restrictions, so a
  // failure is treated as an empty clipboard (the button no-ops) rather than
  // an unhandled rejection.
  const pastePhrase = async () => {
    let clip = '';
    try {
      clip = await Clipboard.getStringAsync();
    } catch {
      return;
    }
    const parts = parseMnemonicPaste(clip);
    if (parts.length <= 1) {
      return;
    }

    const length: 12 | 24 =
      parts.length === 12 ? 12 : parts.length === 24 ? 24 : count;
    if (length !== count) {
      setCount(length);
    }
    setWords(resize(parts, length));
  };

  return (
    <AuthLayout network={network}>
      <AuthHeader
        title="Restore wallet"
        sub="Enter your recovery phrase to rebuild this wallet on-device."
      />
      <View style={styles.form}>
        <Field
          label="New password"
          secure
          placeholder="••••••••••"
          value={password}
          onChange={setPassword}
        />
        <Field
          label="Confirm password"
          secure
          placeholder="••••••••••"
          value={confirm}
          onChange={setConfirm}
        />

        <View>
          <View style={styles.phraseHead}>
            <Text style={styles.eyebrow}>Recovery phrase</Text>
            <Segmented
              size="sm"
              value={String(count)}
              onChange={(v) => {
                const n = Number(v) as 12 | 24;
                setCount(n);
                setWords((w) => resize(w, n));
              }}
              options={[
                { value: '12', label: '12 words' },
                { value: '24', label: '24 words' },
              ]}
            />
          </View>
          <View style={styles.grid}>
            {words.map((word, i) => (
              <View key={i} style={styles.wordBox}>
                <Text style={styles.wordIndex}>
                  {String(i + 1).padStart(2, '0')}
                </Text>
                <TextInput
                  style={styles.wordInput}
                  value={word}
                  onChangeText={(v) =>
                    setWords((w) => w.map((x, idx) => (idx === i ? v : x)))
                  }
                  autoCapitalize="none"
                  autoCorrect={false}
                  placeholderTextColor={palette.faint}
                  accessibilityLabel={`Word ${i + 1}`}
                />
              </View>
            ))}
          </View>
          <View style={{ marginTop: 12 }}>
            <GhostButton icon={ClipboardPaste} onPress={() => void pastePhrase()}>
              Paste phrase
            </GhostButton>
          </View>
        </View>

        <Field
          label="BIP-39 passphrase (optional)"
          secure
          placeholder="leave blank if unused"
          value={passphrase}
          onChange={setPassphrase}
        />

        <PrimaryButton
          icon={KeyRound}
          onPress={() => {
            if (canSubmit) {
              onRestore({
                password,
                mnemonic: words.map((w) => w.trim()),
                passphrase: passphrase.trim(),
              });
            }
          }}
          disabled={!canSubmit}
          busy={busy}
        >
          {busy ? 'Restoring wallet…' : 'Restore wallet'}
        </PrimaryButton>
        <InlineError message={error} />
        <GhostButton onPress={onBack} disabled={busy}>
          Back
        </GhostButton>
      </View>
    </AuthLayout>
  );
}
