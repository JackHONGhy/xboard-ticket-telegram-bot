const required = [
  'BOT_TOKEN',
  'TG_ADMIN_USER_ID',
  'XBOARD_BASE_URL'
];

function readInt(name, fallback) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}

function readString(name, fallback = '') {
  const value = process.env[name];
  return value === undefined || value === null ? fallback : String(value).trim();
}

function readHour(name, fallback) {
  const raw = process.env[name];
  const value = raw ? Number.parseInt(raw, 10) : fallback;
  if (value < 0 || value > 23) {
    throw new Error(`${name} must be an hour from 0 to 23`);
  }
  return value;
}

export function loadConfig() {
  const missing = required.filter((name) => !readString(name));
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  const baseUrl = readString('XBOARD_BASE_URL').replace(/\/+$/, '');
  const publicUrl = readString('BOT_PUBLIC_URL').replace(/\/+$/, '');
  const authType = readString('XBOARD_AUTH_TYPE', 'bearer').toLowerCase();
  const authToken = readString('XBOARD_AUTH_TOKEN') || readString('XBOARD_API_SECRET');
  const cookie = readString('XBOARD_COOKIE');
  const apiSecret = readString('XBOARD_API_SECRET');
  const webhookSecret = readString('BOT_WEBHOOK_SECRET');

  if (publicUrl && !webhookSecret) {
    throw new Error('BOT_WEBHOOK_SECRET is required when BOT_PUBLIC_URL is set');
  }

  if (!['bearer', 'cookie', 'custom', 'none'].includes(authType)) {
    throw new Error('XBOARD_AUTH_TYPE must be one of: bearer, cookie, custom, none');
  }

  if (authType === 'cookie' && !cookie) {
    throw new Error('XBOARD_COOKIE is required when XBOARD_AUTH_TYPE=cookie');
  }

  if ((authType === 'bearer' || authType === 'custom') && !authToken) {
    throw new Error('XBOARD_AUTH_TOKEN or XBOARD_API_SECRET is required for bearer/custom auth');
  }

  return {
    botToken: readString('BOT_TOKEN'),
    adminUserId: readString('TG_ADMIN_USER_ID'),
    xboardBaseUrl: baseUrl,
    webhookSecret,
    publicUrl,
    port: readInt('BOT_PORT', 3000),
    databasePath: readString('DATABASE_PATH', '/data/ticket-bot.sqlite'),
    timezone: readString('TIMEZONE', 'Asia/Shanghai'),
    pollIntervalSeconds: readInt('POLL_INTERVAL_SECONDS', 30),
    staleTicket: {
      firstRemindMinutes: readInt('STALE_TICKET_FIRST_REMIND_MINUTES', 1),
      repeatRemindMinutes: readInt('STALE_TICKET_REPEAT_REMIND_MINUTES', 1),
      nightStartHour: readHour('STALE_TICKET_NIGHT_START_HOUR', 0),
      nightEndHour: readHour('STALE_TICKET_NIGHT_END_HOUR', 8),
      nightRepeatMinutes: readInt('STALE_TICKET_NIGHT_REPEAT_MINUTES', 60)
    },
    xboard: {
      adminPath: readString('XBOARD_ADMIN_PATH', 'admin'),
      fetchPath: readString('XBOARD_TICKET_FETCH_PATH', '/api/v2/{admin_path}/ticket/fetch'),
      detailPath: readString('XBOARD_TICKET_DETAIL_PATH', '/api/v2/{admin_path}/ticket/fetch'),
      replyPath: readString('XBOARD_TICKET_REPLY_PATH', '/api/v2/{admin_path}/ticket/reply'),
      closePath: readString('XBOARD_TICKET_CLOSE_PATH', '/api/v2/{admin_path}/ticket/close'),
      fetchMethod: readString('XBOARD_TICKET_FETCH_METHOD', 'GET').toUpperCase(),
      detailMethod: readString('XBOARD_TICKET_DETAIL_METHOD', 'GET').toUpperCase(),
      replyMethod: readString('XBOARD_TICKET_REPLY_METHOD', 'POST').toUpperCase(),
      closeMethod: readString('XBOARD_TICKET_CLOSE_METHOD', 'POST').toUpperCase(),
      authType,
      authToken,
      cookie,
      apiSecret,
      authHeader: readString('XBOARD_AUTH_HEADER', 'Authorization'),
      authScheme: readString('XBOARD_AUTH_SCHEME', 'Bearer'),
      apiSecretHeader: readString('XBOARD_API_SECRET_HEADER', 'X-API-Secret')
    }
  };
}
