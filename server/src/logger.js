const stamp = () => new Date().toISOString().slice(11, 19);

const write = (level, scope, message, extra) => {
  const line = `${stamp()} ${level.padEnd(5)} [${scope}] ${message}`;
  if (extra === undefined) console.log(line);
  else console.log(line, extra);
};

/** Tiny scoped logger — keeps ingestion output readable without a dependency. */
export const createLogger = (scope) => ({
  info: (message, extra) => write('info', scope, message, extra),
  warn: (message, extra) => write('warn', scope, message, extra),
  error: (message, extra) => write('error', scope, message, extra),
});
