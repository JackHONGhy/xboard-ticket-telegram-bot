import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

export function openDatabase(databasePath) {
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  const db = new Database(databasePath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS tickets (
      id TEXT PRIMARY KEY,
      subject TEXT,
      status TEXT,
      updated_at TEXT,
      created_at TEXT,
      reply_count INTEGER DEFAULT 0,
      user_label TEXT,
      last_message TEXT,
      last_message_from_admin INTEGER DEFAULT 0,
      raw_json TEXT NOT NULL,
      last_seen_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS message_links (
      chat_id TEXT NOT NULL,
      message_id INTEGER NOT NULL,
      ticket_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (chat_id, message_id)
    );

    CREATE TABLE IF NOT EXISTS events (
      event_key TEXT PRIMARY KEY,
      ticket_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  const statements = {
    getTicket: db.prepare('SELECT * FROM tickets WHERE id = ?'),
    deleteTicket: db.prepare('DELETE FROM tickets WHERE id = ?'),
    upsertTicket: db.prepare(`
      INSERT INTO tickets (
        id, subject, status, updated_at, created_at, reply_count, user_label,
        last_message, last_message_from_admin, raw_json, last_seen_at
      )
      VALUES (
        @id, @subject, @status, @updated_at, @created_at, @reply_count, @user_label,
        @last_message, @last_message_from_admin, @raw_json, @last_seen_at
      )
      ON CONFLICT(id) DO UPDATE SET
        subject = excluded.subject,
        status = excluded.status,
        updated_at = excluded.updated_at,
        created_at = excluded.created_at,
        reply_count = excluded.reply_count,
        user_label = excluded.user_label,
        last_message = excluded.last_message,
        last_message_from_admin = excluded.last_message_from_admin,
        raw_json = excluded.raw_json,
        last_seen_at = excluded.last_seen_at
    `),
    eventExists: db.prepare('SELECT 1 FROM events WHERE event_key = ?'),
    insertEvent: db.prepare('INSERT OR IGNORE INTO events (event_key, ticket_id, event_type, created_at) VALUES (?, ?, ?, ?)'),
    linkMessage: db.prepare(`
      INSERT OR REPLACE INTO message_links (chat_id, message_id, ticket_id, created_at)
      VALUES (?, ?, ?, ?)
    `),
    getLinkedTicket: db.prepare('SELECT ticket_id FROM message_links WHERE chat_id = ? AND message_id = ?'),
    listOpenTickets: db.prepare(`
      SELECT * FROM tickets
      WHERE lower(coalesce(status, '')) NOT IN ('closed', 'close', 'resolved', 'done', '已关闭')
      ORDER BY coalesce(updated_at, created_at, last_seen_at) DESC
      LIMIT ?
    `),
    setMeta: db.prepare(`
      INSERT INTO meta (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `),
    getMeta: db.prepare('SELECT value FROM meta WHERE key = ?')
  };

  return {
    raw: db,
    getTicket(id) {
      return statements.getTicket.get(String(id));
    },
    deleteTicket(id) {
      statements.deleteTicket.run(String(id));
    },
    upsertTicket(ticket) {
      statements.upsertTicket.run({
        id: String(ticket.id),
        subject: ticket.subject || '',
        status: ticket.status || '',
        updated_at: ticket.updated_at || '',
        created_at: ticket.created_at || '',
        reply_count: Number.isFinite(ticket.reply_count) ? ticket.reply_count : 0,
        user_label: ticket.user_label || '',
        last_message: ticket.last_message || '',
        last_message_from_admin: ticket.last_message_from_admin ? 1 : 0,
        raw_json: JSON.stringify(ticket.raw || ticket),
        last_seen_at: new Date().toISOString()
      });
    },
    hasEvent(eventKey) {
      return Boolean(statements.eventExists.get(eventKey));
    },
    recordEvent(eventKey, ticketId, eventType) {
      statements.insertEvent.run(eventKey, String(ticketId), eventType, new Date().toISOString());
    },
    linkMessage(chatId, messageId, ticketId) {
      statements.linkMessage.run(String(chatId), Number(messageId), String(ticketId), new Date().toISOString());
    },
    getLinkedTicket(chatId, messageId) {
      const row = statements.getLinkedTicket.get(String(chatId), Number(messageId));
      return row?.ticket_id || null;
    },
    listOpenTickets(limit = 20) {
      return statements.listOpenTickets.all(limit);
    },
    setMeta(key, value) {
      statements.setMeta.run(key, String(value));
    },
    getMeta(key) {
      return statements.getMeta.get(key)?.value || null;
    },
    notificationsEnabled() {
      return statements.getMeta.get('notifications_enabled')?.value !== '0';
    },
    setNotificationsEnabled(enabled) {
      statements.setMeta.run('notifications_enabled', enabled ? '1' : '0');
    },
    markTicketAdminReplied(ticketId) {
      statements.setMeta.run(`ticket_admin_replied:${ticketId}`, '1');
    },
    clearTicketAdminReplied(ticketId) {
      statements.setMeta.run(`ticket_admin_replied:${ticketId}`, '0');
    },
    ticketAdminReplied(ticketId) {
      return statements.getMeta.get(`ticket_admin_replied:${ticketId}`)?.value === '1';
    },
    health() {
      db.prepare('SELECT 1').get();
      return { ok: true };
    },
    close() {
      db.close();
    }
  };
}
