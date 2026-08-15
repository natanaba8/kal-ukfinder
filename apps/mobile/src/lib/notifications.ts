import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { api } from './api';
import type { NotificationPreferences } from './types';

/**
 * Two delivery paths, on purpose:
 *
 *  - Server push (Expo push service) delivers the personalised digest even when
 *    the app is closed. Needs a development build and a registered token.
 *  - Locally scheduled notifications act as the daily nudge and keep working
 *    offline.
 *
 * Everything here is defensive. Notifications are unavailable on web, and
 * `expo-notifications` was removed from Expo Go on Android in SDK 53 — calling
 * into it there throws "Cannot find native module". Since the app must still
 * run in Expo Go for development, every native call is guarded and failures
 * degrade to "no notifications" rather than crashing the app.
 */

/** Expo Go, as opposed to a development build or a store build. */
export const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

const platformSupported = Platform.OS === 'ios' || Platform.OS === 'android';

/**
 * True only where the native module actually exists. Android Expo Go lost it in
 * SDK 53; iOS Expo Go keeps local notifications but not push tokens.
 */
export const notificationsSupported = platformSupported && !(isExpoGo && Platform.OS === 'android');

/** Push tokens need a development build — Expo Go cannot issue them. */
export const pushSupported = notificationsSupported && !isExpoGo;

export const notificationsUnavailableReason = (): string | null => {
  if (!platformSupported) return 'Notifications are a mobile feature — open the app on iOS or Android.';
  if (isExpoGo && Platform.OS === 'android') {
    return 'Expo Go cannot show notifications on Android since SDK 53. Use a development build to test them.';
  }
  if (isExpoGo) return 'Expo Go can show reminders but cannot register for push. Use a development build for that.';
  return null;
};

/** Never let a missing native module take the app down. */
const safely = async <T,>(run: () => Promise<T>, fallback: T): Promise<T> => {
  if (!notificationsSupported) return fallback;
  try {
    return await run();
  } catch {
    return fallback;
  }
};

// The handler is a native call, so it cannot run at module scope unguarded.
if (notificationsSupported) {
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: false,
        shouldSetBadge: false,
      }),
    });
  } catch {
    // Older Expo Go builds without the module — reminders simply will not fire.
  }
}

const DIGEST_IDENTIFIER = 'kal-ukfinder-daily-digest';

export const ensureAndroidChannel = async () => {
  if (Platform.OS !== 'android') return;

  await safely(
    () =>
      Notifications.setNotificationChannelAsync('briefing', {
        name: 'Daily briefing',
        importance: Notifications.AndroidImportance.DEFAULT,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#1D4E89',
      }),
    null,
  );
};

export const requestPermission = async (): Promise<boolean> =>
  safely(async () => {
    const existing = await Notifications.getPermissionsAsync();
    if (existing.granted) return true;
    if (!existing.canAskAgain) return false;

    const requested = await Notifications.requestPermissionsAsync();
    return requested.granted;
  }, false);

/**
 * Register this device with the API so the server can push the digest.
 * Returns null on web, in Expo Go, on simulators, or when permission is
 * refused — all normal, and none of them an error worth surfacing.
 */
export const registerForPush = async (userId: string): Promise<string | null> => {
  if (!pushSupported || !Device.isDevice) return null;
  if (!(await requestPermission())) return null;

  await ensureAndroidChannel();

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId ?? undefined;

  // Without an EAS project id the push service has nowhere to address the
  // token, so there is no point asking for one.
  if (!projectId) return null;

  return safely(async () => {
    const token = await Notifications.getExpoPushTokenAsync({ projectId });
    await api.registerDevice(userId, token.data, Platform.OS);
    return token.data;
  }, null);
};

/** Replace the local daily reminder with one at the user's chosen hour. */
export const scheduleDailyDigest = async (preferences: NotificationPreferences) => {
  if (!notificationsSupported) return;

  await safely(() => Notifications.cancelScheduledNotificationAsync(DIGEST_IDENTIFIER), undefined);
  if (!preferences.enabled) return;
  if (!(await requestPermission())) return;

  await ensureAndroidChannel();

  await safely(
    () =>
      Notifications.scheduleNotificationAsync({
        identifier: DIGEST_IDENTIFIER,
        content: {
          title: 'Your UK briefing is ready',
          body: 'Today’s jobs, policy changes and career news, summarised.',
          data: { type: 'digest-local' },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DAILY,
          hour: preferences.digestHour,
          minute: 0,
          channelId: 'briefing',
        },
      }),
    '',
  );
};

export const cancelDailyDigest = async () => {
  await safely(() => Notifications.cancelScheduledNotificationAsync(DIGEST_IDENTIFIER), undefined);
};

export const scheduledCount = async (): Promise<number> =>
  safely(async () => (await Notifications.getAllScheduledNotificationsAsync()).length, 0);
