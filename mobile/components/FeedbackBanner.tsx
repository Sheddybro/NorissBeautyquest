import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { palette } from '../theme/tokens';

/** Shared accessible feedback for operational screens; no automatic transaction retry. */
export function FeedbackBanner({ kind, message, onDismiss }: {
  kind: 'error' | 'success' | 'info';
  message: string;
  onDismiss?: () => void;
}) {
  if (!message.trim()) return null;
  const error = kind === 'error';
  const success = kind === 'success';
  return (
    <View accessibilityRole="alert" style={[styles.banner, error ? styles.error : success ? styles.success : styles.info]}>
      <View style={styles.copy}>
        <Text style={[styles.heading, error ? styles.errorText : success ? styles.successText : styles.infoText]}>
          {error ? 'Action needs attention' : success ? 'Success' : 'Notice'}
        </Text>
        <Text style={styles.message}>{message}</Text>
      </View>
      {onDismiss ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Dismiss message" hitSlop={12}
          onPress={onDismiss} style={styles.dismiss}>
          <Text style={styles.dismissText}>×</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { flexDirection: 'row', alignItems: 'flex-start', padding: 14, marginVertical: 8, borderRadius: 14, borderWidth: 1, gap: 12 },
  error: { backgroundColor: '#FFF2F1', borderColor: '#F2C7C3' },
  success: { backgroundColor: '#EDF9F3', borderColor: '#BDE5D1' },
  info: { backgroundColor: '#F0F0FF', borderColor: '#D8D5FA' },
  copy: { flex: 1 },
  heading: { fontSize: 13, fontWeight: '800', marginBottom: 4 },
  errorText: { color: '#A52C39' },
  successText: { color: '#126D4C' },
  infoText: { color: palette.primary },
  message: { color: palette.text, fontSize: 13, lineHeight: 19 },
  dismiss: { minWidth: 30, minHeight: 30, alignItems: 'center', justifyContent: 'center' },
  dismissText: { color: palette.muted, fontSize: 25, lineHeight: 28 },
});
