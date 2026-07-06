import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Palette, fonts } from '../../theme/tokens';
import { useTheme } from '../../theme/ThemeProvider';
import { useThemedStyles } from '../../theme/useThemedStyles';
import { AppTab, NAV } from './nav';

const makeStyles = (p: Palette) => ({
  bar: {
    backgroundColor: p.bg,
    borderColor: p.border,
    borderTopWidth: 1,
    flexDirection: 'row' as const,
    paddingHorizontal: 8,
    paddingTop: 8,
  },
  tab: {
    alignItems: 'center' as const,
    flex: 1,
    gap: 4,
    paddingVertical: 6,
  },
  tabOn: {
    backgroundColor: p.surfaceAlt,
  },
  label: {
    color: p.muted,
    fontFamily: fonts.sansMedium,
    fontSize: 10,
  },
  labelOn: {
    color: p.text,
  },
});

// BottomTabs is the authenticated tab bar, safe-area aware.
export function BottomTabs({
  tab,
  onTab,
}: {
  tab: AppTab;
  onTab: (tab: AppTab) => void;
}) {
  const { palette } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      {NAV.map((n) => {
        const on = tab === n.id;

        return (
          <Pressable
            key={n.id}
            onPress={() => onTab(n.id)}
            style={[styles.tab, on && styles.tabOn]}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
          >
            <n.icon size={18} color={on ? palette.text : palette.muted} />
            <Text style={[styles.label, on && styles.labelOn]}>{n.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
