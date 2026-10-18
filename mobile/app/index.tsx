import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, BackHandler, Linking, Platform, Pressable, SafeAreaView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import type { WebViewNavigation } from 'react-native-webview';
import { getSiteOrigin, isAllowedWebNavigation, shouldOpenExternally } from '../services/webConfig';

const SITE_URL = process.env.EXPO_PUBLIC_WEB_URL?.trim() || '';
const SITE_ORIGIN = getSiteOrigin(SITE_URL);

export default function HybridWebsite() {
  const browser = useRef<WebView>(null);
  const [canGoBack, setCanGoBack] = useState(false);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (failed) { setFailed(false); setReloadKey((v) => v + 1); return true; }
      if (canGoBack) { browser.current?.goBack(); return true; }
      Alert.alert('Close Noriss Beautyquest?', 'Your current page will stay available when you return.', [
        { text: 'Stay', style: 'cancel' },
        { text: 'Close', onPress: () => BackHandler.exitApp() },
      ]);
      return true;
    });
    return () => subscription.remove();
  }, [canGoBack, failed]);

  const openOutside = useCallback(async (url: string) => {
    try { await Linking.openURL(url); }
    catch { Alert.alert('Unable to open link', 'Please check the link or install an app that can open it.'); }
  }, []);

  const decideNavigation = useCallback((request: WebViewNavigation) => {
    const url = request.url;
    if (isAllowedWebNavigation(url, SITE_ORIGIN)) return true;
    if (shouldOpenExternally(url)) void openOutside(url);
    return false;
  }, [openOutside]);

  if (!SITE_ORIGIN) return <SafeAreaView style={styles.center}><Text style={styles.heading}>Website not configured</Text><Text style={styles.message}>Set EXPO_PUBLIC_WEB_URL to your Django website address in mobile/.env, then restart Expo and rebuild the APK.</Text></SafeAreaView>;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />
      <WebView
        key={reloadKey}
        ref={browser}
        source={{ uri: SITE_URL }}
        originWhitelist={[SITE_ORIGIN]}
        onShouldStartLoadWithRequest={decideNavigation}
        onNavigationStateChange={(state) => setCanGoBack(state.canGoBack)}
        onLoadStart={() => { setLoading(true); setFailed(false); }}
        onLoadEnd={() => setLoading(false)}
        onError={() => { setLoading(false); setFailed(true); }}
        onHttpError={(event) => { if (event.nativeEvent.statusCode >= 500) { setLoading(false); setFailed(true); } }}
        javaScriptEnabled
        domStorageEnabled
        sharedCookiesEnabled
        thirdPartyCookiesEnabled={false}
        setSupportMultipleWindows={false}
        allowsBackForwardNavigationGestures
        startInLoadingState
        mixedContentMode="never"
        javaScriptCanOpenWindowsAutomatically={false}
        onFileDownload={({ nativeEvent }) => { if (shouldOpenExternally(nativeEvent.downloadUrl)) void openOutside(nativeEvent.downloadUrl); }}
        renderLoading={() => <View style={styles.overlay}><ActivityIndicator size="large" color="#5846c9" /><Text style={styles.message}>Opening Noriss Beautyquest…</Text></View>}
      />
      {loading && !failed ? <View style={styles.topBar}><ActivityIndicator size="small" color="#5846c9" /></View> : null}
      {failed ? <View style={styles.overlay}><Text style={styles.heading}>Unable to connect</Text><Text style={styles.message}>Check your internet connection and make sure the Noriss website is available.</Text><Pressable accessibilityRole="button" style={styles.button} onPress={() => { setFailed(false); setReloadKey((v) => v + 1); }}><Text style={styles.buttonText}>Try again</Text></Pressable></View> : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffff' },
  center: { flex: 1, justifyContent: 'center', padding: 26, backgroundColor: '#ffffff' },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center', padding: 26, gap: 18 },
  heading: { fontSize: 23, fontWeight: '700', color: '#171833', textAlign: 'center' },
  message: { fontSize: 15, color: '#5e6279', lineHeight: 23, textAlign: 'center' },
  button: { paddingVertical: 14, paddingHorizontal: 26, borderRadius: 12, backgroundColor: '#5846c9' },
  buttonText: { color: '#ffffff', fontSize: 16, fontWeight: '700' },
  topBar: { position: 'absolute', top: 0, right: 12, padding: 5, backgroundColor: '#ffffffcc', borderRadius: 8 },
});
