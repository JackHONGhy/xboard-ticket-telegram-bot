function write(level, message, extra = undefined) {
  const entry = {
    ts: new Date().toISOString(),
    level,
    message
  };
  if (extra !== undefined) entry.extra = extra;
  const line = JSON.stringify(entry);
  if (level === 'error') {
    console.error(line);
  } else {
    console.log(line);
  }
}

export const logger = {
  info: (message, extra) => write('info', message, extra),
  warn: (message, extra) => write('warn', message, extra),
  error: (message, extra) => write('error', message, extra)
};
