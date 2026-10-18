import React from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { elevation, palette, radius, spacing } from '../theme/tokens';

/** Consistent responsive workspace chrome; individual screens own their business workflows. */
export function ScreenFrame({ title, subtitle, eyebrow = 'NORISS BEAUTYQUEST', children, scrollable = true }: {
  title: string; subtitle?: string; eyebrow?: string; children: React.ReactNode; scrollable?: boolean;
}) {
  const { width } = useWindowDimensions();
  const compact = width < 375;
  const wide = width >= 680;
  const header = (
    <View style={styles.header}>
      <View style={styles.brandRow}>
        <View style={styles.brandMark} accessible accessibilityLabel="Noriss Beautyquest logo">
          <Text style={styles.brandMarkText}>N</Text>
        </View>
        <View style={styles.brandCopy}>
          <Text style={styles.brandName} numberOfLines={1}>Noriss</Text>
          <Text style={styles.brandTagline} numberOfLines={1}>BEAUTYQUEST RETAIL APP</Text>
        </View>
      </View>
      <View style={styles.headingRow}>
        <View style={styles.headingCopy}>
          <Text style={styles.overline}>{eyebrow}</Text>
          <Text accessibilityRole="header" style={[styles.title, compact && styles.compactTitle]}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
        <View style={styles.headingDecoration} accessible={false}><View style={styles.decorationInner} /></View>
      </View>
    </View>
  );
  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {scrollable ? (
          <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" showsVerticalScrollIndicator={false}
            contentContainerStyle={[styles.content, wide && styles.contentWide]}>{header}{children}</ScrollView>
        ) : (
          <View style={[styles.fixedContent, wide && styles.contentWide]}>{header}{children}</View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: palette.background },
  fill: { flex: 1 },
  content: { flexGrow: 1, paddingHorizontal: spacing.md, paddingBottom: spacing.xxl },
  fixedContent: { flex: 1, paddingHorizontal: spacing.md },
  contentWide: { width: '100%', maxWidth: 1120, alignSelf: 'center' },
  header: { paddingTop: 8, paddingBottom: 4, marginBottom: 16 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingBottom: 13 },
  brandMark: { width: 42, height: 42, borderRadius: 13, backgroundColor: palette.primary,
    justifyContent: 'center', alignItems: 'center', ...elevation.card },
  brandMarkText: { fontSize: 24, fontWeight: '900', color: '#fff', letterSpacing: -1 },
  brandMarkDot: { position: 'absolute', right: 6, top: 7, width: 6, height: 6, borderRadius: 3, backgroundColor: '#c3ceff' },
  brandCopy: { flex: 1, minWidth: 0 },
  brandName: { fontSize: 17, fontWeight: '800', color: palette.text },
  brandAccent: { color: palette.primary },
  brandTagline: { fontSize: 8, fontWeight: '800', color: palette.primary, letterSpacing: 2.2, marginTop: 3 },
  brandStatus: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#eeebff', paddingVertical: 8,
    paddingHorizontal: 9, borderRadius: radius.pill },
  statusDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: palette.success },
  statusText: { color: palette.primaryDark, fontSize: 9, fontWeight: '800', letterSpacing: 0.6 },
  headingRow: { flexDirection: 'row', alignItems: 'center', overflow: 'hidden', backgroundColor: palette.primaryDark,
    borderRadius: 16, minHeight: 0, paddingHorizontal: 20, paddingVertical: 20 },
  headingCopy: { flex: 1, zIndex: 1 },
  overline: { fontSize: 9, letterSpacing: 1.4, fontWeight: '800', color: '#C3CEFF', marginBottom: 7 },
  title: { fontSize: 27, lineHeight: 33, fontWeight: '800', color: '#fff' },
  compactTitle: { fontSize: 23, lineHeight: 29 },
  subtitle: { fontSize: 12, lineHeight: 18, color: '#C1C9DF', marginTop: 6, maxWidth: 450 },
  headingDecoration: { position: 'absolute', right: -46, top: -55, width: 170, height: 170, borderRadius: 90,
    borderWidth: 25, borderColor: '#ffffff12', justifyContent: 'center', alignItems: 'center' },
  decorationInner: { width: 65, height: 65, borderRadius: 40, backgroundColor: '#ffffff0c' },
});
