import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

function browserStorage(): Storage {
  if (typeof window === 'undefined' || !window.sessionStorage) {
    throw new Error('Browser session storage is unavailable.');
  }
  return window.sessionStorage;
}

export async function getItemAsync(key: string): Promise<string | null> {
  if (Platform.OS === 'web') return browserStorage().getItem(key);
  return SecureStore.getItemAsync(key);
}

export async function setItemAsync(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') {
    browserStorage().setItem(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

export async function deleteItemAsync(key: string): Promise<void> {
  if (Platform.OS === 'web') {
    browserStorage().removeItem(key);
    return;
  }
  await SecureStore.deleteItemAsync(key);
}