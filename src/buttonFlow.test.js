import assert from 'node:assert/strict';
import { XBoardClient, isTicketClosed } from './xboardClient.js';
import { formatTicketList, formatTicketSummary } from './format.js';
import { createTelegramBot, detailKeyboard } from './telegramBot.js';

function createClient() {
  const calls = [];
  const client = new XBoardClient({
    xboardBaseUrl: 'https://example.com',
    xboard: {
      adminPath: 'admin',
      fetchMethod: 'GET',
      detailMethod: 'GET',
      replyMethod: 'POST',
      closeMethod: 'POST',
      fetchPath: '/tickets',
      detailPath: '/detail',
      replyPath: '/reply',
      closePath: '/close',
      authType: 'none'
    }
  });

  client.calls = calls;
  client.request = async (method, path, { query, body } = {}) => {
    calls.push({ method, path, query, body });

    if (path === '/tickets') {
      return {
        data: [
          {
            id: 117,
            user_id: 89,
            subject: 'new ticket',
            status: 0,
            reply_status: 0,
            created_at: 1781408059,
            updated_at: 1781408059,
            user: { email: 'new@example.com' }
          },
          {
            id: 116,
            user_id: 88,
            subject: 'subscribe failed',
            status: 0,
            reply_status: 1,
            created_at: 1781376072,
            updated_at: 1781395474,
            user: { email: '2335703432@qq.com' }
          },
          {
            id: 99,
            user_id: 77,
            subject: 'closed ticket',
            status: 1,
            reply_status: 1,
            created_at: 1781370000,
            updated_at: 1781371000,
            user: { email: 'closed@example.com' }
          }
        ],
        total: 3
      };
    }

    if (path === '/detail') {
      const id = String(query?.id || '').trim();
      if (id === '116') {
        return { data: [{ id: 246, user_id: 88, message: 'detail message', created_at: 1781395474 }] };
      }
      if (id === '117') {
        return { data: [{ id: 247, user_id: 89, message: 'new ticket message', created_at: 1781408059 }] };
      }
      if (id === '99') {
        return { data: [{ id: 248, user_id: 77, message: 'closed detail message', created_at: 1781371000 }] };
      }
      if (id === '120') {
        return { data: { id: 120, subject: 'copy test', status: 0, user: { email: 'copy@example.com' }, message: 'detail text', updated_at: 1781408059 } };
      }
      throw new Error('XBoard API GET /api/v2/admin/ticket/fetch failed with 400: {"status":"fail","message":"工单不存在"}');
    }

    if (path === '/reply') {
      assert.equal(String(body.id).trim(), '116');
      assert.equal(body.message, 'ok');
      return { status: 'success' };
    }

    if (path === '/close') {
      assert.equal(String(body.id).trim(), '116');
      return { status: 'success' };
    }

    throw new Error(`Unexpected path ${path}`);
  };

  return client;
}

const allTickets = await createClient().fetchTickets();
assert.equal(allTickets.length, 3);
assert.equal(allTickets.find((ticket) => ticket.id === '99').status, 'closed');
assert.equal(isTicketClosed(allTickets.find((ticket) => ticket.id === '99')), true);

const openTickets = await createClient().fetchOpenTickets();
assert.deepEqual(openTickets.map((ticket) => ticket.id), ['117', '116']);
assert.match(formatTicketList(openTickets), /#117/);
assert.match(formatTicketList(openTickets), /#116/);
assert.doesNotMatch(formatTicketList(openTickets), /#99/);

const direct = await createClient().getTicket('116');
assert.equal(direct.id, '116');
assert.equal(direct.subject, 'subscribe failed');
assert.equal(direct.last_message, 'detail message');
assert.match(formatTicketSummary(direct), /#116/);
assert.doesNotMatch(formatTicketSummary(direct), /#246/);

const legacyButton = await createClient().getTicket('246');
assert.equal(legacyButton.id, '116');
assert.equal(legacyButton.subject, 'subscribe failed');
assert.equal(legacyButton.last_message, 'detail message');

const replyClient = createClient();
await replyClient.replyTicket('246', 'ok');
assert.equal(replyClient.calls.at(-1).path, '/reply');
assert.equal(String(replyClient.calls.at(-1).body.id).trim(), '116');

const closeClient = createClient();
await closeClient.closeTicket('246');
assert.equal(closeClient.calls.at(-1).path, '/close');
assert.equal(String(closeClient.calls.at(-1).body.id).trim(), '116');

let notificationText = null;
let notificationOptions = null;
const bot = createTelegramBot({
  config: {
    botToken: '123:test',
    adminUserId: '1'
  },
  db: {
    linkMessage() {},
    upsertTicket() {}
  },
  xboard: createClient(),
  getHealth() {
    return {};
  }
});
bot.telegram.sendMessage = async (chatId, text, options) => {
  notificationText = text;
  notificationOptions = options;
  return { message_id: 1 };
};

await bot.sendTicketNotification({ id: '120', subject: 'copy test', status: 'pending' }, '新工单');
const notificationButtons = notificationOptions.reply_markup.inline_keyboard.flat();
assert.equal(notificationButtons.length, 2);
assert.deepEqual(notificationButtons.map((button) => button.text), ['查看详情', '关闭工单']);
assert.equal(notificationButtons.some((button) => button.copy_text), false);
assert.equal(notificationText.includes('/reply 120'), false);

const detailButtons = detailKeyboard({ id: '120', status: 'pending' }).inline_keyboard.flat();
assert.deepEqual(detailButtons.map((button) => button.text), ['返回', '复制回复命令']);
assert.deepEqual(detailButtons[1].copy_text, { text: '/reply 120 ' });
assert.equal(detailButtons.some((button) => button.text === '关闭工单'), false);

console.log('button flow test ok');
