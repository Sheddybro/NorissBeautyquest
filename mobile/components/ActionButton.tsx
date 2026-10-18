import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';
import { palette, radius } from '../theme/tokens';
type Props = { label: string; onPress: () => void; disabled?: boolean; busy?: boolean; variant?: 'primary' | 'secondary' | 'danger' };
export function ActionButton({label, onPress, disabled = false, busy = false, variant = 'primary'}: Props) {
  const inactive = disabled || busy;
  return <Pressable accessibilityRole="button" accessibilityLabel={label}
    accessibilityState={{disabled: inactive, busy}} disabled={inactive} onPress={onPress}
    style={({pressed}) => [styles.button, variant === 'secondary' && styles.secondary,
      variant === 'danger' && styles.danger, pressed && !inactive && styles.pressed, inactive && styles.disabled]}>
    {busy ? <ActivityIndicator color={variant === 'secondary' ? palette.primary : '#fff'} /> :
      <Text style={[styles.text, variant === 'secondary' && styles.secondaryText]}>{label}</Text>}
  </Pressable>;
}
const styles = StyleSheet.create({
  button: {backgroundColor: palette.primary, borderRadius: radius.md, paddingHorizontal: 18,
    alignItems: 'center', justifyContent: 'center', minHeight: 54, marginVertical: 8, elevation: 3},
  secondary: {backgroundColor: palette.primarySoft, borderWidth: 1, borderColor: palette.border},
  danger: {backgroundColor: palette.danger},
  text: {color: '#fff', fontWeight: '800', fontSize: 14, letterSpacing: 0.15},
  secondaryText: {color: palette.primary}, pressed: {opacity: 0.86}, disabled: {opacity: 0.5},
});
