import React from 'react';
import { StyleSheet, Text, Pressable, View } from 'react-native';
import { palette } from '../theme/tokens';

const symbols: Record<string, string> = { Home: '⌂', Inventory: '▦', Checkout: '⊕', Sell: '⊕', Receipts: '▤', More: '☷' };
type Props = { items: string[]; active: string; onSelect: (item: string) => void };
/** Permission-filtered primary navigation; only the parent can authorize actions. */
export function BottomNavigation({ items, active, onSelect }: Props) {
  return (
    <View style={styles.bar} accessibilityRole="tablist" accessibilityLabel="Primary navigation">
      {items.map((item) => {
        const selected = item === active;
        return (
          <Pressable key={item} onPress={() => { if (!selected) onSelect(item); }}
            accessibilityRole="tab" accessibilityLabel={item} accessibilityState={{ selected }}
            style={({ pressed }) => [styles.item, selected && styles.active, pressed && !selected && styles.pressed]}>
            <Text accessible={false} style={[styles.symbol, selected && styles.selected]}>{symbols[item] || '•'}</Text>
            <Text style={[styles.label, selected && styles.selected]} numberOfLines={1}>{item}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
const styles = StyleSheet.create({
  bar: { flexDirection: 'row', justifyContent: 'space-around', backgroundColor: '#fff', borderTopWidth: 1,
    borderTopColor: '#e6eaf3', paddingTop: 9, paddingBottom: 9, marginHorizontal: -16, paddingHorizontal: 8, elevation: 8 },
  item: { minHeight: 58, flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 16, paddingHorizontal: 2 },
  active: { backgroundColor: '#EDF1FF' }, pressed: { backgroundColor: '#F4F6FB' },
  symbol: { fontSize: 23, color: '#8490ab', fontWeight: '800' },
  label: { fontSize: 11, fontWeight: '700', color: '#78849c', marginTop: 3 },
  selected: { color: palette.primary },
});
