import React, { useEffect, useRef, useState } from 'react';
import { router } from 'expo-router';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {ActionButton} from '../components/ActionButton';
import { apiCall as call } from '../services/api';
import { clearSession, getSession, saveSession } from '../services/session';
import { palette, radius, spacing } from '../theme/tokens';

export default function AppEntry() {
  const { width } = useWindowDimensions();
  const compact = width < 760;
  const usernameRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [restoringSession, setRestoringSession] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const restoreSession = async () => {
      try {
        const { token } = await getSession();
        if (!token) return;
        await call('/api/v1/me/', token);
        if (active) router.replace('/(tabs)/home');
      } catch (err: any) {
        if (err?.status === 401) {
          await clearSession();
        } else if (active && err?.connectionFailure) {
          setError('Could not reconnect to your saved session. Check your connection, then sign in again.');
        }
      } finally {
        if (active) setRestoringSession(false);
      }
    };

    restoreSession();
    return () => {
      active = false;
    };
  }, []);

  const label = restoringSession ? 'Restoring session…' : loading ? 'Signing in…' : 'Sign in to your shop →';

  const handleContinue = async () => {
    if (loading || restoringSession) return;
    const trimmedUsername = username.trim();
    if (!trimmedUsername || !password) {
      setError('Enter your username and password.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const result = await call('/api/v1/auth/login/', '', { username: trimmedUsername, password });
      await saveSession(result.access_token, result.user?.username || trimmedUsername);
      setPassword('');
      router.replace('/(tabs)/home');
    } catch (err: any) {
      setError(err?.message || 'Unable to sign in.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.safeArea}>
        <ScrollView
          contentContainerStyle={[styles.scrollContent, compact && styles.compactScrollContent]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.container, compact && styles.compactContainer]}>
            <View style={[styles.brandWrap, compact && styles.compactBrandWrap]}>
              <View style={[styles.brandIdentity, compact && styles.compactBrandIdentity]}>
                <View style={[styles.brandBadge, compact && styles.compactBrandBadge]}>
                  <Text style={styles.brandBadgeText}>N</Text>
                </View>
                <View>
                  <Text style={[styles.brandName, compact && styles.compactBrandName]}>Noriss</Text>
                  <Text style={[styles.brandTagline, compact && styles.compactBrandTagline]}>BEAUTYQUEST</Text>
                </View>
              </View>
              <View style={styles.brandCopy}>
                <Text style={[styles.eyebrow, compact && styles.compactEyebrow]}>BEAUTY IN EVERY DETAIL</Text>
                <Text style={[styles.title, compact && styles.compactTitle]}>Your shop.{ '\n' }A clearer perspective.</Text>
                <Text style={[styles.subtitle, compact && styles.compactSubtitle]}>A beautiful workspace for sales, purchasing and inventory.</Text>
              </View>
            </View>

            <View style={[styles.card, compact && styles.compactCard]}>
              <Text style={styles.cardTitle}>Good to see you again.</Text>
              <Text style={styles.cardHint}>Sign in to manage Noriss Beautyquest.</Text>

              <Text style={styles.fieldLabel}>Username</Text>
              <TextInput
                style={styles.input}
                ref={usernameRef}
                value={username}
                onChangeText={(value) => { setUsername(value); if (error) setError(''); }}
                placeholder="Enter your username"
                autoCapitalize="none"
                autoCorrect={false}
                textContentType="username"
                autoComplete="username"
                returnKeyType="next"
                onSubmitEditing={() => passwordRef.current?.focus()}
                accessibilityLabel="Username"
              />

              <Text style={styles.fieldLabel}>Password</Text>
              <View style={styles.passwordWrap}>
                <TextInput
                  ref={passwordRef}
                  style={styles.passwordInput}
                  value={password}
                  onChangeText={(value) => { setPassword(value); if (error) setError(''); }}
                  placeholder="Enter your password"
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  textContentType="password"
                  autoComplete="password"
                  returnKeyType="go"
                  blurOnSubmit
                  accessibilityLabel="Password"
                  onSubmitEditing={handleContinue}
                />
                <Pressable
                  style={styles.passwordToggle}
                  onPress={() => setShowPassword((value) => !value)}
                  accessibilityRole="button"
                  accessibilityLabel={showPassword?'Hide password':'Show password'}
                >
                  <Text style={styles.passwordToggleText}>{showPassword?'Hide':'Show'}</Text>
                </Pressable>
              </View>

              {error ? <Text accessibilityRole="alert" style={styles.errorText}>{error}</Text> : null}

              <ActionButton label={label} onPress={handleContinue} disabled={restoringSession || loading || !username.trim() || !password} busy={restoringSession || loading} />
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Open connection support"
              hitSlop={12}
              onPress={() => router.push('/support')}
              style={styles.supportLink}
            >
              <Text style={styles.supportLinkText}>Having trouble signing in?</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: palette.background,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
  },
  compactScrollContent: {
    justifyContent: 'flex-start',
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  container: {
    width: '100%',
    maxWidth: 440,
    alignSelf: 'center',
    justifyContent: 'center',
  },
  compactContainer: {
    maxWidth: '100%',
  },
  brandWrap: {
    alignItems: 'center',
    marginBottom: 24,
  },
  compactBrandWrap: {
    height: 260,
    width: '100%',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    backgroundColor: palette.navy,
    padding: 25,
    marginBottom: 0,
  },
  brandIdentity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  compactBrandIdentity: {
    alignItems: 'center',
  },
  brandBadge: {
    width: 45,
    height: 48,
    borderRadius: 13,
    backgroundColor: palette.navy,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 0,
  },
  brandBadgeText: {
    color: '#ffffff',
    fontSize: 30,
    fontWeight: '900',
  },
  compactBrandBadge: {
    width: 42,
    height: 44,
    borderRadius: 12,
    backgroundColor: palette.primary,
  },
  compactBrandName: {
    color: '#FFFFFF',
    fontSize: 21,
    fontWeight: '800',
  },
  compactBrandTagline: {
    color: '#D3DAFA',
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 2.1,
    marginTop: 2,
  },
  brandCopy: {
    width: '100%',
  },
  brandName: {
    color: palette.text,
    fontSize: 21,
    fontWeight: '800',
  },
  brandTagline: {
    color: palette.primary,
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 2.1,
    marginTop: 2,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 2,
    color: palette.primary,
  },
  compactEyebrow: {
    color: '#C3CEFF',
    fontSize: 8,
    letterSpacing: 1.5,
  },
  title: {
    fontSize: 29,
    fontWeight: '900',
    color: palette.text,
    marginTop: 8,
    textAlign: 'center',
  },
  compactTitle: {
    color: '#FFFFFF',
    fontSize: 28,
    lineHeight: 35,
    textAlign: 'left',
    marginTop: 7,
  },
  subtitle: {
    fontSize: 14,
    color: palette.muted,
    marginTop: 10,
    textAlign: 'center',
    lineHeight: 21,
    maxWidth: 320,
  },
  compactSubtitle: {
    display: 'none',
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.border,
    padding: spacing.lg,
    shadowColor: palette.navy,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.09,
    shadowRadius: 20,
    elevation: 3,
  },
  compactCard: {
    backgroundColor: 'transparent',
    borderWidth: 0,
    borderRadius: 0,
    paddingHorizontal: 25,
    paddingTop: 38,
    paddingBottom: 0,
    shadowOpacity: 0,
    elevation: 0,
  },
  cardTitle: {
    color: palette.text,
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 3,
  },
  cardHint: { color: palette.muted, fontSize: 13, marginBottom: 24 },
  fieldLabel: {
    color: palette.text,
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#ffffff',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.border,
    paddingHorizontal: spacing.md,
    minHeight: 52,
    paddingVertical: spacing.sm,
    fontSize: 16,
    color: palette.text,
    marginBottom: 12,
  },
  passwordWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.border,
    paddingRight: spacing.sm,
    minHeight: 52,
    marginBottom: spacing.md,
  },
  passwordInput: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: palette.text,
  },
  passwordToggle: {
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  passwordToggleText: {
    color: palette.primary,
    fontWeight: '800',
  },
  errorText: {
    color: palette.danger,
    fontSize: 13,
    marginBottom: 10,
  },
  supportLink: {
    alignSelf: 'center',
    marginTop: spacing.md,
    minHeight: 44,
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
  },
  supportLinkText: {
    color: palette.primary,
    fontWeight: '700',
  },
});
