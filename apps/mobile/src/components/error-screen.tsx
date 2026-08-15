import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { API_BASE_URL, isDeployedWeb } from '@/lib/api';
import { isDevBuild } from '@/lib/audience';

/**
 * Shown by expo-router when a screen throws during render.
 *
 * A bare red box gives you a stack trace and nothing else. This says what
 * failed in words, shows the message and stack so it can be screenshotted or
 * copied, and names the two things that are wrong most often in development:
 * the API not running, and a stale Metro cache.
 */
export function ErrorScreen({ error, retry }: { error: Error; retry: () => void }) {
  const message = error?.message ?? String(error);
  const looksLikeNetwork = /network|fetch|reach|ECONNREFUSED|Failed to fetch/i.test(message);

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.badge}>KAL-UKFINDER</Text>
        <Text style={styles.title}>The app hit an error</Text>

        <Text style={styles.lead}>
          {!looksLikeNetwork
            ? 'Something threw while rendering. The details are below — send them over and they can be fixed.'
            : isDeployedWeb()
              ? 'This site could not reach its backend. The message below says what to do.'
              : 'It could not reach the Kal-UKFinder API. Start it with "npm run dev" from the project root, and make sure this device is on the same Wi-Fi as your computer.'}
        </Text>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>MESSAGE</Text>
          <Text style={styles.message} selectable>
            {message}
          </Text>
        </View>

        {/* Addresses and stack traces help a developer and mean nothing to a
            visitor, so they only appear in a development build. */}
        {isDevBuild ? (
          <>
            <View style={styles.card}>
              <Text style={styles.cardLabel}>API ADDRESS</Text>
              <Text style={styles.mono} selectable>
                {API_BASE_URL}
              </Text>
            </View>

            {error?.stack ? (
              <View style={styles.card}>
                <Text style={styles.cardLabel}>STACK</Text>
                <Text style={styles.mono} selectable>
                  {error.stack.split('\n').slice(0, 12).join('\n')}
                </Text>
              </View>
            ) : null}
          </>
        ) : null}

        <TouchableOpacity style={styles.button} onPress={retry} accessibilityRole="button">
          <Text style={styles.buttonText}>Try again</Text>
        </TouchableOpacity>

        {isDevBuild ? (
          <Text style={styles.hint}>
            If a fix does not seem to take effect, the bundler cache is probably stale. Stop the app and run
            {'\n'}
            <Text style={styles.mono}>npm run clean</Text> then <Text style={styles.mono}>npm run dev:clean</Text>.
          </Text>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0B0F14' },
  content: { padding: 24, paddingTop: 72, gap: 16 },
  badge: { color: '#7FB0F0', fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  title: { color: '#F2F5F8', fontSize: 24, fontWeight: '700' },
  lead: { color: '#A3AEBB', fontSize: 14, lineHeight: 21 },
  card: { backgroundColor: '#141A21', borderColor: '#28323D', borderWidth: 1, borderRadius: 14, padding: 14, gap: 6 },
  cardLabel: { color: '#78848F', fontSize: 11, fontWeight: '700', letterSpacing: 0.8 },
  message: { color: '#FF7D97', fontSize: 14, lineHeight: 20 },
  mono: { color: '#A3AEBB', fontSize: 12, fontFamily: 'monospace', lineHeight: 18 },
  button: { backgroundColor: '#7FB0F0', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  buttonText: { color: '#08121F', fontSize: 15, fontWeight: '700' },
  hint: { color: '#78848F', fontSize: 12, lineHeight: 18 },
});
