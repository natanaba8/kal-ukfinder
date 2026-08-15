import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * Session token storage.
 *
 * On a device the token goes in the Keychain / Android Keystore via
 * expo-secure-store. SecureStore has no web implementation, so the web build
 * falls back to AsyncStorage (localStorage) — the same trade-off every web app
 * makes, and the reason the token is short-lived and revocable server-side.
 */

const TOKEN_KEY = 'kal-ukfinder.session';
const USER_ID_KEY = 'kal-ukfinder.userId';
const ONBOARDED_KEY = 'kal-ukfinder.onboarded';

const secureAvailable = Platform.OS === 'ios' || Platform.OS === 'android';

const readSecure = async (key: string) => {
  if (!secureAvailable) return AsyncStorage.getItem(key);
  try {
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
};

const writeSecure = async (key: string, value: string) => {
  if (!secureAvailable) return AsyncStorage.setItem(key, value);
  try {
    await SecureStore.setItemAsync(key, value);
  } catch {
    // Keychain can be unavailable on a locked device — fall back rather than crash.
    await AsyncStorage.setItem(key, value);
  }
};

const deleteSecure = async (key: string) => {
  if (!secureAvailable) return AsyncStorage.removeItem(key);
  try {
    await SecureStore.deleteItemAsync(key);
  } catch {
    await AsyncStorage.removeItem(key);
  }
};

export const authStorage = {
  getToken: () => readSecure(TOKEN_KEY),
  setToken: (token: string) => writeSecure(TOKEN_KEY, token),
  clearToken: () => deleteSecure(TOKEN_KEY),

  getUserId: () => AsyncStorage.getItem(USER_ID_KEY),
  setUserId: (id: string) => AsyncStorage.setItem(USER_ID_KEY, id),
  clearUserId: () => AsyncStorage.removeItem(USER_ID_KEY),

  getOnboarded: async () => (await AsyncStorage.getItem(ONBOARDED_KEY)) === 'true',
  setOnboarded: (value: boolean) =>
    value ? AsyncStorage.setItem(ONBOARDED_KEY, 'true') : AsyncStorage.removeItem(ONBOARDED_KEY),
};
