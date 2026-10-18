import { Tabs, useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { apiCall } from '../../services/api';
import { getSession } from '../../services/session';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { palette } from '../../theme/tokens';
import { canPerform, PermissionAccount } from '../../utils/permissions';

const tabIcon = (symbol: string) => ({ focused }: { focused: boolean; color: string; size: number }) => (
  <View style={[styles.iconWrap, focused && styles.iconActive]}>
    <Text style={[styles.iconText, focused && styles.iconTextActive]}>{symbol}</Text>
  </View>
);

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const [account, setAccount] = useState<PermissionAccount | null>(null);
  const [permissionsLoading, setPermissionsLoading] = useState(true);

  useFocusEffect(useCallback(() => {
    let active = true;
    setPermissionsLoading(true);
    const loadPermissions = async () => {
      try {
        const { token } = await getSession();
        if (!token) { if (active) setAccount(null); return; }
        const result = await apiCall('/api/v1/me/', token);
        if (active) setAccount(result?.account ?? null);
      } catch {
        if (active) setAccount(null);
      } finally {
        if (active) setPermissionsLoading(false);
      }
    };

    loadPermissions();
    return () => {
      active = false;
    };
  }, []));

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: [styles.tabBar, { height: 56 + Math.max(insets.bottom, 8), paddingBottom: Math.max(insets.bottom, 8) }],
        tabBarAccessibilityLabel: "Main navigation",
        tabBarActiveTintColor: palette.primary,
        tabBarInactiveTintColor: '#7d879a',
        tabBarLabelStyle: styles.label,
        tabBarHideOnKeyboard: true,
      }}
    >
      <Tabs.Screen name="home" options={{ title: 'Home', tabBarLabel: 'Home', tabBarIcon: tabIcon('⌂'), tabBarAccessibilityLabel: 'Home dashboard' }} />
      <Tabs.Screen name="inventory" options={{ title: 'Inventory', tabBarLabel: 'Inventory', tabBarIcon: tabIcon('▦'), tabBarAccessibilityLabel: 'Inventory' }} />
      <Tabs.Screen name="sell" options={{ title: 'Sell', tabBarLabel: 'Sell', tabBarIcon: tabIcon('＋'), tabBarAccessibilityLabel: 'Sell products', href: permissionsLoading || !canPerform(account, 'checkout') ? null : undefined }} />
      <Tabs.Screen name="receipts" options={{ title: 'Receipts', tabBarLabel: 'Receipts', tabBarIcon: tabIcon('▤'), tabBarAccessibilityLabel: 'Receipts' }} />
      <Tabs.Screen name="more" options={{ title: 'More', tabBarLabel: 'More', tabBarIcon: tabIcon('☷'), tabBarAccessibilityLabel: 'More business tools' }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: '#ffffff',
    borderTopColor: '#E1E6F0',
    borderTopWidth: 1,
    elevation: 12,
    shadowColor: palette.navy,
    shadowOpacity: 0.07,
    shadowRadius: 14,
    minHeight: 68,
    paddingTop: 8,
  },
  iconWrap: { width: 46, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  iconActive: { backgroundColor: palette.primarySoft, borderWidth: 1, borderColor: '#C8D4FF' },
  iconText: { fontSize: 24, fontWeight: '600', color: '#77839c', lineHeight: 29 },
  iconTextActive: { color: palette.primary },
  label: {
    fontSize: 11,
    fontWeight: '700',
  },
});
