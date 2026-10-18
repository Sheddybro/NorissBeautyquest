import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const screen = readFileSync(new URL('../app/index.tsx', import.meta.url), 'utf8');
const config = readFileSync(new URL('../services/webConfig.ts', import.meta.url), 'utf8');
const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
test('hybrid app uses one Django website in WebView', () => {
 assert.match(screen, /<WebView/); assert.match(screen, /EXPO_PUBLIC_WEB_URL/);
 assert.ok(packageJson.dependencies['react-native-webview']);
});
test('hybrid app handles Android back and failed network', () => {
 assert.match(screen, /hardwareBackPress/); assert.match(screen, /onError=/); assert.match(screen, /Try again/);
});
test('webview blocks off-origin pages and unsafe protocols', () => {
 assert.match(screen, /onShouldStartLoadWithRequest=\{decideNavigation\}/);
 assert.match(config, /parsed\.origin === origin/);
 assert.match(config, /\['https:', 'http:', 'mailto:', 'tel:'\]/);
});
