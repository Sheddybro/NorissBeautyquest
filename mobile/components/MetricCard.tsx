import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { elevation, palette, radius } from '../theme/tokens';

/** Responsive dashboard KPI card; keeps the entire metric readable to screen readers. */
export function MetricCard({ icon, label, value }: { icon: string; label: string; value: number | string }) {
  return (
    <View style={styles.card} accessible accessibilityLabel={`${label}: ${value}`}>
      <View style={styles.iconBubble} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Text style={styles.icon}>{icon}</Text>
      </View>
      <Text style={styles.label} numberOfLines={2}>{label}</Text>
      <Text style={styles.value} adjustsFontSizeToFit minimumFontScale={0.65} numberOfLines={1}>{value}</Text>
    </View>
  );
}
const styles = StyleSheet.create({
  card: { flex: 1, minWidth: 0, backgroundColor: palette.surface, borderRadius: 14,
    padding: 16, borderWidth: 1, borderColor: palette.border, minHeight: 148, ...elevation.card },
  iconBubble: { width: 37, height: 37, borderRadius: 9, backgroundColor: palette.primarySoft,
    alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  icon: { fontSize: 20, color: palette.primary },
  label: { fontSize: 12, fontWeight: '600', lineHeight: 17, color: palette.muted },
  value: { fontSize: 24, fontWeight: '900', color: palette.text, marginTop: 7, letterSpacing: -0.6 },
});
