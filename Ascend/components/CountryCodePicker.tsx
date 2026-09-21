// Country dial-code picker for the phone sign-in flow — tapping the "+1"
// prefix in AuthMethodScreen opens this. Styled after NutritionScreen's
// full-screen add-food modal (same overlay/scrim, full-bleed sheet, header
// with a title + "Done" close) so the app's one established modal pattern
// doesn't fork into a second one just for this.

import { useState, useMemo } from 'react';
import { Modal, View, Text, TextInput, Pressable, FlatList, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { spacing, radius, layout, type } from '../theme/tokens';
import { fontFamily } from '../theme/fonts';
import { usePalette } from '../theme/themedColors';
import { COUNTRIES, type Country } from '../utils/phone';

type CountryCodePickerProps = {
  visible: boolean;
  onClose: () => void;
  onSelect: (country: Country) => void;
};

export default function CountryCodePicker({ visible, onClose, onSelect }: CountryCodePickerProps) {
  const palette = usePalette();
  const [query, setQuery] = useState('');

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return COUNTRIES;
    return COUNTRIES.filter(
      c => c.name.toLowerCase().includes(q) || c.dialCode.includes(q)
    );
  }, [query]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={[styles.overlay, { backgroundColor: palette.scrim }]}>
        <View style={[styles.content, { backgroundColor: palette.surface, borderColor: palette.border }]}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: palette.textPrimary }]}>Country code</Text>
            <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Done">
              <Text style={[styles.close, { color: palette.textSecondary }]}>Done</Text>
            </Pressable>
          </View>

          <View
            style={[styles.searchRow, { backgroundColor: palette.surfaceRaised, borderColor: palette.border }]}>
            <Ionicons name="search" size={16} color={palette.textMuted} />
            <TextInput
              style={[styles.searchInput, { color: palette.textPrimary }]}
              value={query}
              onChangeText={setQuery}
              placeholder="Search country or code"
              placeholderTextColor={palette.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              accessibilityLabel="Search country or code"
            />
          </View>

          <FlatList
            data={results}
            keyExtractor={(item) => `${item.name}-${item.dialCode}`}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <Pressable
                onPress={() => {
                  onSelect(item);
                  onClose();
                }}
                accessibilityRole="button"
                accessibilityLabel={`${item.name}, plus ${item.dialCode}`}
                style={({ pressed }) => [
                  styles.row,
                  { borderBottomColor: palette.divider },
                  pressed && styles.rowPressed,
                ]}>
                <Text style={styles.flag}>{item.flag}</Text>
                <Text style={[styles.rowName, { color: palette.textPrimary }]} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={[styles.rowDial, { color: palette.textMuted }]}>+{item.dialCode}</Text>
              </Pressable>
            )}
            ListEmptyComponent={
              <Text style={[styles.empty, { color: palette.textMuted }]}>No matches</Text>
            }
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'center' },
  content: {
    width: '100%',
    height: '100%',
    borderWidth: layout.hairline,
    padding: spacing.lg,
    gap: spacing.md,
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontFamily: fontFamily.serif, fontSize: 22 },
  close: { fontFamily: fontFamily.sansBold, fontSize: 15 },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: layout.hairline,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
  },
  searchInput: {
    flex: 1,
    fontFamily: fontFamily.sans,
    fontSize: 15,
    paddingVertical: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: layout.hairline,
  },
  rowPressed: { opacity: 0.6 },
  flag: { fontSize: 22 },
  rowName: { ...type.body, flex: 1 },
  rowDial: { ...type.bodySm },
  empty: {
    ...type.body,
    textAlign: 'center',
    paddingTop: spacing.xxl,
  },
});
