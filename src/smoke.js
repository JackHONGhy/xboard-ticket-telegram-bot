import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadConfig } from './config.js';
import { openDatabase } from './db.js';
import { normalizeTicket, XBoardClient } from './xboardClient.js';

function withEnv(values, fn) {
  const previous = {};
  for (const [key, value] of Object.entries(values)) {
    previous[key] = process.env[key];
    process.env[key] = value;
  }

  try {
    return fn();
  } finally {
    for (const key of Object.keys(values)) {
      if (previous[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previous[key];
      }
    }
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function runConfigCheck() {
  const config = withEnv({
    BOT_TOKEN: '123456:test-token',
    TG_ADMIN_USER_ID: '10001',
    XBOARD_BASE_URL: 'https://xboard.example.com/',
    XBOARD_AUTH_TYPE: 'bearer',
    XBOARD_AUTH_TOKEN: 'admin-token',
    BOT_WEBHOOK_SECRET: '',
    BOT_PUBLIC_URL: '',
    XBOARD_ADMIN_PATH: 'secret-admin'
  }, () => loadConfig());

  assert(config.xboardBaseUrl === 'https://xboard.example.com', 'base URL should be normalized');
  assert(config.xboard.authType === 'bearer', 'auth type should load');

  const client = new XBoardClient(config);
  const url = client.buildUrl('/api/v2/{admin_path}/ticket/fetch');
  assert(url.href === 'https://xboard.example.com/api/v2/secret-admin/ticket/fetch', 'route variable should be replaced');
}

function runNormalizeCheck() {
  const ticket = normalizeTicket({
    id: 42,
    title: 'Login problem',
    state: 'pending',
    user: { email: 'user@example.com' },
    replies: [
      { content: 'I need help', from: 'user', created_at: '2026-06-14 10:00:00' }
    ]
  });

  assert(ticket.id === '42', 'ticket id should normalize to string');
  assert(ticket.subject === 'Login problem', 'title should normalize to subject');
  assert(ticket.reply_count === 1, 'reply count should be inferred');
  assert(ticket.last_message === 'I need help', 'last message should normalize');
  assert(ticket.last_message_from_admin === false, 'user reply should not be admin');
}

function runDatabaseCheck() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xboard-ticket-bot-'));
  const dbPath = path.join(tempDir, 'smoke.sqlite');
  const db = openDatabase(dbPath);

  db.upsertTicket({
    id: '42',
    subject: 'Login problem',
    status: 'pending',
    updated_at: '2026-06-14 10:00:00',
    created_at: '2026-06-14 09:00:00',
    reply_count: 1,
    user_label: 'user@example.com',
    last_message: 'I need help',
    last_message_from_admin: false,
    raw: { id: 42 }
  });

  db.linkMessage('10001', 20002, '42');
  assert(db.getTicket('42').subject === 'Login problem', 'ticket should be stored');
  assert(db.getLinkedTicket('10001', 20002) === '42', 'message link should be stored');
  assert(db.health().ok, 'database health should pass');
  db.close();

  fs.rmSync(tempDir, { recursive: true, force: true });
}

runConfigCheck();
runNormalizeCheck();
runDatabaseCheck();
console.log('smoke ok');
