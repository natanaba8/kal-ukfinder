import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { api } from './api';
import type { NotificationPreferences } from './types';

/**
 * Two delivery paths, on purpose:
 *
 *  - Server push (Expo push service) delivers the personalised digest even when
 *    the app is closed. Needs a physical device and a registered token.
 *  - Locally scheduled notifications act as the daily nudge and keep working
 *    offline. They are rescheduled whenever the user changes their hour.
 *
 * Notifications are not supported on web, so every entry point no-ops there
 * rather than throwing.
 */

export const notificationsSupported = Platform.OS === 'ios' || Platform.OS === 'android';

if (notificationsSupported) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

const DIGEST_IDENTIFIER = 'kal-ukfinder-daily-digest';

export const ensureAndroidChannel = async () => {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('briefing', {
    name: 'Daily briefing',
    importance: Notifications.AndroidImportance.DEFAULT,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#1D4E89',
  });
};

export const requestPermission = async (): Promise<boolean> => {
  if (!notificationsSupported) return false;

  const existing = await Notifications.getPermissionsAsync();
  if (existing.granted) return true;
  if (!existing.canAskAgain) return false;

  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
};

/**
 * Register this device with the API so the server can push the digest.
 * Returns null on web, simulators, or when permission is refused — all normal.
 */
export const registerForPush = async (userId: string): Promise<string | null> => {
  if (!notificationsSupported || !Device.isDevice) return null;
  if (!(await requestPermission())) return null;

  await ensureAndroidChannel();

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId ?? undefined;

  try {
    const token = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    await api.registerDevice(userId, token.data, Platform.OS);
    return token.data;
  } catch {
    // No EAS project configured yet, or offline. The local schedule still runs.
    return null;
  }
};

/** Replace the local daily reminder with one at the user's chosen hour. */
export const scheduleDailyDigest = async (preferences: NotificationPreferences) => {
  if (!notificationsSupported) return;

  await Notifications.cancelScheduledNotificationAsync(DIGEST_IDENTIFIER).catch(() => undefined);
  if (!preferences.enabled) return;
  if (!(await requestPermission())) return;

  await ensureAndroidChannel();
  await Notifications.scheduleNotificationAsync({
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
  });
};

export const cancelDailyDigest = async () => {
  if (!notificationsSupported) return;
  await Notifications.cancelScheduledNotificationAsync(DIGEST_IDENTIFIER).catch(() => undefined);
};

export const scheduledCount = async (): Promise<number> => {
  if (!notificationsSupported) return 0;
  return (await Notifications.getAllScheduledNotificationsAsync()).length;
};
