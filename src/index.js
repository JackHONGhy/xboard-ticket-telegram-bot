import 'dotenv/config';
import { loadConfig } from './config.js';
import { openDatabase } from './db.js';
import { logger } from './logger.js';
import { TicketPoller } from './poller.js';
import { createServer } from './server.js';
import { createTelegramBot } from './telegramBot.js';
import { XBoardClient } from './xboardClient.js';

const config = loadConfig();
const db = openDatabase(config.databasePath);
const xboard = new XBoardClient(config);

let poller;
let server;
let stopping = false;

function getHealth() {
  let dbHealth = { ok: false };
  try {
    dbHealth = db.health();
  } catch (error) {
    dbHealth = { ok: false, error: error.message };
  }

  const pollerStatus = poller?.status() || {};
  return {
    ok: dbHealth.ok,
    service: 'xboard-ticket-bot',
    mode: config.publicUrl ? 'telegram-webhook' : 'telegram-long-polling',
    database: dbHealth,
    poller: pollerStatus,
    uptime_seconds: Math.round(process.uptime())
  };
}

const bot = createTelegramBot({
  config,
  db,
  xboard,
  getHealth,
  runPoll: async () => poller?.pollOnce()
});
const app = createServer({ config, bot, getHealth });
poller = new TicketPoller({
  db,
  xboard,
  bot,
  adminUserId: config.adminUserId,
  intervalSeconds: config.pollIntervalSeconds,
  staleTicketConfig: config.staleTicket
});

async function startTelegram() {
  if (config.publicUrl) {
    const webhookUrl = `${config.publicUrl}/telegram/webhook/${config.webhookSecret}`;
    await bot.telegram.setWebhook(webhookUrl);
    logger.info('telegram webhook configured', { webhook_url: webhookUrl });
  } else {
    await bot.telegram.deleteWebhook();
    await bot.launch();
    logger.info('telegram long polling started');
  }
}

async function shutdown(signal) {
  if (stopping) return;
  stopping = true;
  logger.info('shutdown requested', { signal });

  try {
    poller.stop();
    await bot.stop(signal);
  } catch (error) {
    logger.error('telegram stop failed', { error: error.message });
  }

  if (server) {
    server.close(() => {
      db.close();
      process.exit(0);
    });
    setTimeout(() => process.exit(0), 5000).unref();
  } else {
    db.close();
    process.exit(0);
  }
}

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));

server = app.listen(config.port, async () => {
  logger.info('health server listening', { port: config.port });
  try {
    poller.start();
    await startTelegram();
  } catch (error) {
    logger.error('startup failed', { error: error.message });
    process.exit(1);
  }
});
