import assert from 'node:assert/strict';
import { TicketPoller } from './poller.js';

let nowMs = Date.UTC(2026, 5, 14, 4, 0, 0); // 2026-06-14 12:00:00 Asia/Shanghai
const realDateNow = Date.now;
Date.now = () => nowMs;
const dayTicketCreatedAt = String(Math.floor((nowMs - 2 * 60 * 1000) / 1000));

const storedTickets = new Map([
  ['117', {
    id: '117',
    subject: 'new ticket',
    status: 'pending',
    created_at: dayTicketCreatedAt,
    updated_at: dayTicketCreatedAt,
    reply_count: 0,
    last_message: ''
  }]
]);
const events = new Set();
const notifications = [];
let notificationsEnabled = true;
const adminRepliedTickets = new Set();

const db = {
  getTicket(id) {
    return storedTickets.get(String(id)) || null;
  },
  upsertTicket(ticket) {
    storedTickets.set(String(ticket.id), ticket);
  },
  hasEvent(key) {
    return events.has(key);
  },
  recordEvent(key) {
    events.add(key);
  },
  setMeta() {},
  getMeta() {
    return null;
  },
  notificationsEnabled() {
    return notificationsEnabled;
  },
  setNotificationsEnabled(enabled) {
    notificationsEnabled = enabled;
  },
  markTicketAdminReplied(ticketId) {
    adminRepliedTickets.add(String(ticketId));
  },
  clearTicketAdminReplied(ticketId) {
    adminRepliedTickets.delete(String(ticketId));
  },
  ticketAdminReplied(ticketId) {
    return adminRepliedTickets.has(String(ticketId));
  }
};

const xboard = {
  async fetchOpenTickets() {
    return [{
      id: '117',
      subject: 'new ticket',
      status: 'pending',
      created_at: dayTicketCreatedAt,
      updated_at: dayTicketCreatedAt,
      reply_count: 0,
      last_message: ''
    }];
  }
};

const bot = {
  async sendTicketNotification(ticket, title) {
    notifications.push({ ticket, title });
  }
};

const poller = new TicketPoller({
  db,
  xboard,
  bot,
  adminUserId: '1',
  intervalSeconds: 30,
  staleTicketConfig: {
    firstRemindMinutes: 1,
    repeatRemindMinutes: 1,
    nightStartHour: 0,
    nightEndHour: 8,
    nightRepeatMinutes: 60
  }
});

await poller.pollOnce();
assert.equal(notifications.length, 2);
assert.equal(notifications[0].ticket.id, '117');
assert.equal(notifications[1].ticket.id, '117');
assert.equal(notifications[1].title, '\u5de5\u5355\u8d85\u65f6\u672a\u56de\u590d');

await poller.pollOnce();
assert.equal(notifications.length, 2);

nowMs += 60 * 1000;
await poller.pollOnce();
assert.equal(notifications.length, 3);

nowMs = Date.UTC(2026, 5, 13, 18, 0, 0); // 2026-06-14 02:00:00 Asia/Shanghai
const nightTicketCreatedAt = String(Math.floor((nowMs - 2 * 60 * 1000) / 1000));
storedTickets.set('118', {
  id: '118',
  subject: 'night ticket',
  status: 'pending',
  created_at: nightTicketCreatedAt,
  updated_at: nightTicketCreatedAt,
  reply_count: 0,
  last_message: ''
});
xboard.fetchOpenTickets = async () => [{
  id: '118',
  subject: 'night ticket',
  status: 'pending',
  created_at: nightTicketCreatedAt,
  updated_at: nightTicketCreatedAt,
  reply_count: 0,
  last_message: ''
}];

await poller.pollOnce();
assert.equal(notifications.length, 5);

nowMs += 30 * 60 * 1000;
await poller.pollOnce();
assert.equal(notifications.length, 5);

nowMs += 30 * 60 * 1000;
await poller.pollOnce();
assert.equal(notifications.length, 6);

const repliedTicketCreatedAt = String(Math.floor((nowMs - 2 * 60 * 1000) / 1000));
storedTickets.set('119', {
  id: '119',
  subject: 'replied ticket',
  status: 'replied',
  created_at: repliedTicketCreatedAt,
  updated_at: repliedTicketCreatedAt,
  reply_count: 1,
  last_message: ''
});
xboard.fetchOpenTickets = async () => [{
  id: '119',
  subject: 'replied ticket',
  status: 'replied',
  created_at: repliedTicketCreatedAt,
  updated_at: repliedTicketCreatedAt,
  reply_count: 1,
  last_message: ''
}];

await poller.pollOnce();
assert.equal(notifications.length, 8);
assert.equal(notifications[6].title, '\u65b0\u5de5\u5355');
assert.equal(notifications[7].title, '\u5de5\u5355\u8d85\u65f6\u672a\u56de\u590d');

const retryTicketCreatedAt = String(Math.floor((nowMs - 2 * 60 * 1000) / 1000));
storedTickets.delete('120');
xboard.fetchOpenTickets = async () => [{
  id: '120',
  subject: 'retry ticket',
  status: 'pending',
  created_at: retryTicketCreatedAt,
  updated_at: retryTicketCreatedAt,
  reply_count: 0,
  last_message: ''
}];

let failNextNotify = true;
bot.sendTicketNotification = async (ticket, title) => {
  if (failNextNotify) {
    failNextNotify = false;
    throw new Error('telegram send failed');
  }
  notifications.push({ ticket, title });
};

const failedStats = await poller.pollOnce();
assert.equal(failedStats.error, 'telegram send failed');
assert.equal(notifications.length, 8);
assert.equal(events.has(`new_ticket:120:${retryTicketCreatedAt}`), false);

const retriedStats = await poller.pollOnce();
assert.equal(retriedStats.error, '');
assert.equal(notifications.length, 10);
assert.equal(notifications[8].ticket.id, '120');
assert.equal(notifications[8].title, '\u65b0\u5de5\u5355');

const mutedTicketCreatedAt = String(Math.floor((nowMs - 2 * 60 * 1000) / 1000));
storedTickets.delete('121');
xboard.fetchOpenTickets = async () => [{
  id: '121',
  subject: 'muted ticket',
  status: 'pending',
  created_at: mutedTicketCreatedAt,
  updated_at: mutedTicketCreatedAt,
  reply_count: 0,
  last_message: ''
}];

notificationsEnabled = false;
const mutedStats = await poller.pollOnce();
assert.equal(mutedStats.notifications_enabled, false);
assert.equal(mutedStats.notifications, 0);
assert.equal(notifications.length, 10);
assert.equal(events.has(`new_ticket:121:${mutedTicketCreatedAt}`), false);

notificationsEnabled = true;
const unmutedStats = await poller.pollOnce();
assert.equal(unmutedStats.notifications_enabled, true);
assert.equal(unmutedStats.notifications, 2);
assert.equal(notifications.length, 12);
assert.equal(notifications[10].ticket.id, '121');

const adminHandledAt = String(Math.floor(nowMs / 1000));
storedTickets.set('122', {
  id: '122',
  subject: 'admin handled ticket',
  status: 'pending',
  created_at: mutedTicketCreatedAt,
  updated_at: adminHandledAt,
  reply_count: 1,
  last_message: 'admin reply',
  last_message_from_admin: true
});
adminRepliedTickets.add('122');
xboard.fetchOpenTickets = async () => [{
  id: '122',
  subject: 'admin handled ticket',
  status: 'pending',
  created_at: mutedTicketCreatedAt,
  updated_at: adminHandledAt,
  reply_count: 1,
  last_message: '',
  last_message_from_admin: false
}];

nowMs += 2 * 60 * 1000;
const handledStats = await poller.pollOnce();
assert.equal(handledStats.notifications, 0);
assert.equal(notifications.length, 12);
assert.equal(adminRepliedTickets.has('122'), true);

const userRepliedAt = String(Math.floor(nowMs / 1000));
xboard.fetchOpenTickets = async () => [{
  id: '122',
  subject: 'admin handled ticket',
  status: 'replied',
  created_at: mutedTicketCreatedAt,
  updated_at: userRepliedAt,
  reply_count: 2,
  last_message: '',
  last_message_from_admin: false
}];

const userRepliedStats = await poller.pollOnce();
assert.equal(userRepliedStats.notifications, 1);
assert.equal(notifications.length, 13);
assert.equal(notifications[12].ticket.id, '122');
assert.equal(notifications[12].title, '\u5de5\u5355\u72b6\u6001\u53d8\u5316');
assert.equal(adminRepliedTickets.has('122'), false);

Date.now = realDateNow;

console.log('poller test ok');
