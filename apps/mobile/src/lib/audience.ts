/**
 * Copy that must differ between a developer's machine and a shipped app.
 *
 * "Run npm run ingest in the server folder" is useful in development and
 * nonsense on a public website. The signal is `__DEV__`, not the hostname:
 * static rendering runs in Node during `expo export`, where `window` does not
 * exist, so a hostname check would bake developer text into the shipped HTML —
 * which is exactly how it reached production the first time.
 *
 * `__DEV__` is true under the dev server and false in every production bundle,
 * including while pre-rendering.
 */
export const isDevBuild: boolean = typeof __DEV__ !== 'undefined' && __DEV__;

/**
 * Pick the right wording for whoever is reading.
 *
 * @param visitor   what someone using the deployed app should see
 * @param developer what someone running it locally should see
 */
export const forAudience = <T,>(visitor: T, developer: T): T => (isDevBuild ? developer : visitor);
