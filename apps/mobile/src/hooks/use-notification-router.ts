import * as Notifications from 'expo-notifications';
import { useRouter, type Href } from 'expo-router';
import { useEffect } from 'react';

import { notificationsSupported } from '@/lib/notifications';

type DigestPayload = {
  type?: string;
  itemIds?: string[];
  jobIds?: string[];
};

const routeFor = (data: DigestPayload): Href => {
  if (data.itemIds?.length) return { pathname: '/item/[id]', params: { id: data.itemIds[0] } };
  if (data.jobIds?.length) return { pathname: '/job/[id]', params: { id: data.jobIds[0] } };
  return '/';
};

/**
 * Opens the right screen when a notification is tapped — the first story in the
 * digest, or the app root for a plain reminder. Also handles the cold-start
 * case where the app was launched by the tap.
 */
export function useNotificationRouter() {
  const router = useRouter();

  useEffect(() => {
    // The native module is absent in Expo Go on Android, so touching it there
    // throws. Tapping a notification is a nice-to-have; never let it crash the app.
    if (!notificationsSupported) return;

    let cancelled = false;
    let subscription: { remove: () => void } | undefined;

    try {
      Notifications.getLastNotificationResponseAsync()
        .then((response) => {
          if (cancelled || !response) return;
          router.push(routeFor((response.notification.request.content.data ?? {}) as DigestPayload));
        })
        .catch(() => undefined);

      subscription = Notifications.addNotificationResponseReceivedListener((response) => {
        router.push(routeFor((response.notification.request.content.data ?? {}) as DigestPayload));
      });
    } catch {
      // No notifications in this runtime — nothing to route from.
    }

    return () => {
      cancelled = true;
      subscription?.remove();
    };
  }, [router]);
}
