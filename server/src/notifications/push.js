import { config } from '../config.js';
import { createLogger } from '../logger.js';
import { removeDevice } from '../store/users.js';

const log = createLogger('push');

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

const isExpoToken = (token) => /^Expo(nent)?PushToken\[.+\]$/.test(token ?? '');

const chunk = (items, size) => {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
  return chunks;
};

/**
 * Send through Expo's push service.
 * Tokens Expo reports as unregistered are dropped so we stop paying for them.
 *
 * @param {Array<{to: string, title: string, body: string, data?: object}>} messages
 */
export const sendPush = async (messages) => {
  const valid = messages.filter((message) => isExpoToken(message.to));
  const invalid = messages.length - valid.length;
  if (invalid > 0) log.warn(`${invalid} message(s) skipped — not an Expo push token`);
  if (valid.length === 0) return { sent: 0, failed: 0, skipped: invalid };

  let sent = 0;
  let failed = 0;

  for (const batch of chunk(valid, 100)) {
    try {
      const response = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
          ...(config.digest.expoAccessToken
            ? { authorization: `Bearer ${config.digest.expoAccessToken}` }
            : {}),
        },
        body: JSON.stringify(
          batch.map((message) => ({
            to: message.to,
            title: message.title,
            body: message.body,
            data: message.data ?? {},
            sound: 'default',
            channelId: message.channelId ?? 'briefing',
            priority: 'normal',
          })),
        ),
        signal: AbortSignal.timeout(20000),
      });

      if (!response.ok) {
        log.warn(`expo push -> HTTP ${response.status}`);
        failed += batch.length;
        continue;
      }

      const payload = await response.json();
      // `sent`/`failed` are read after the loop, so the ticket walk has to finish
      // before it — a forEach with an async callback would not wait.
      for (const [index, ticket] of (payload.data ?? []).entries()) {
        if (ticket.status === 'ok') {
          sent += 1;
          continue;
        }
        failed += 1;
        log.warn(`ticket error: ${ticket.message}`);
        if (ticket.details?.error === 'DeviceNotRegistered') await removeDevice(batch[index].to);
      }
    } catch (error) {
      failed += batch.length;
      log.warn(`push batch failed: ${error.message}`);
    }
  }

  return { sent, failed, skipped: invalid };
};
