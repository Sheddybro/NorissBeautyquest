import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { ScreenFrame } from '../components/ScreenFrame';
import { ActionButton } from '../components/ActionButton';
import { API_BASE, getApiConfigStatus } from '../services/api';
import { palette, radius, spacing } from '../theme/tokens';

const API_STATUS = getApiConfigStatus();

export default function SupportScreen() {
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState('');
  const [failed, setFailed] = useState(false);

  const checkConnection = async () => {
    if (!API_STATUS.configured) {
      setFailed(true);
      setResult(API_STATUS.message);
      return;
    }

    setChecking(true);
    setResult('Checking your shop server…');
    setFailed(false);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch(`${API_BASE}/health/`, { signal: controller.signal });
      if (response.ok) {
        setResult('Your shop server is reachable. Return to sign in and try again.');
      } else {
        setFailed(true);
        setResult(`The server responded with HTTP ${response.status}. Please contact your shop administrator.`);
      }
    } catch {
      setFailed(true);
      setResult('Could not reach the shop server. Check your internet connection or contact your shop administrator.');
    } finally {
      clearTimeout(timeout);
      setChecking(false);
    }
  };

  return (
    <ScreenFrame title="Connection support" subtitle="Check whether your shop server is reachable. This diagnostic does not use or send your password.">
      <View style={styles.card}>
        <Text style={styles.label}>Server configuration</Text>
        <Text style={styles.value}>{API_STATUS.configured ? API_BASE : 'Not configured'}</Text>
        <Text style={styles.hint}>{API_STATUS.configured ? 'The configured address is used only for this connection check.' : API_STATUS.message}</Text>
      </View>

      {result ? (
        <View accessibilityRole="alert" style={[styles.resultCard, failed && styles.resultError]}>
          {checking ? <ActivityIndicator color={palette.primary} /> : null}
          <Text style={[styles.resultText, failed && styles.errorText]}>{result}</Text>
        </View>
      ) : null}

      <ActionButton label={checking ? 'Checking connection…' : 'Check connection'} onPress={checkConnection} disabled={checking} busy={checking} />
      <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.backButton}>
        <Text style={styles.backText}>Return to sign in</Text>
      </Pressable>
    </ScreenFrame>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: palette.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: palette.border,
    padding: spacing.lg,
  },
  label: {
    color: palette.text,
    fontSize: 14,
    fontWeight: '800',
  },
  value: {
    color: palette.primaryDark,
    fontSize: 14,
    fontWeight: '700',
    marginTop: spacing.sm,
  },
  hint: {
    color: palette.muted,
    fontSize: 13,
    lineHeight: 19,
    marginTop: spacing.sm,
  },
  resultCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: palette.primarySoft,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  resultError: {
    backgroundColor: palette.accentSoft,
  },
  resultText: {
    flex: 1,
    color: palette.primaryDark,
    lineHeight: 20,
  },
  errorText: {
    color: palette.danger,
  },
  backButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    marginTop: spacing.sm,
  },
  backText: {
    color: palette.primary,
    fontWeight: '700',
  },
});