import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { palette } from '../theme/tokens';

export function SectionHeading({ eyebrow, title }: { eyebrow: string; title: string }) {
  return <View style={styles.wrap}>
    <Text style={styles.eyebrow}>{eyebrow.toUpperCase()}</Text>
    <Text style={styles.title} accessibilityRole="header">{title}</Text>
  </View>;
}
const styles = StyleSheet.create({
  wrap: { paddingTop: 10, paddingBottom: 10 },
  eyebrow: { fontSize: 10, letterSpacing: 1.5, fontWeight: '800', color: palette.primary },
  title: { fontSize: 21, fontWeight: '900', color: palette.text, marginTop: 5, letterSpacing: -0.35 },
});
