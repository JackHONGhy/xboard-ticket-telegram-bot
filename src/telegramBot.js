import { Telegraf } from 'telegraf';
import { formatTicketDetail, formatTicketList, formatTicketSummary, shortText } from './format.js';
import { logger } from './logger.js';

const zh = {
  running: 'XBoard \u5de5\u5355 Bot \u5df2\u542f\u52a8\u3002',
  autoNotify: '\u6709\u65b0\u5de5\u5355\u6216\u7528\u6237\u65b0\u56de\u590d\u65f6\uff0cBot \u4f1a\u81ea\u52a8\u79c1\u804a\u901a\u77e5\u4f60\uff0c\u5e76\u9644\u5e26\u64cd\u4f5c\u6309\u94ae\u3002',
  directReply: '\u4f60\u4e5f\u53ef\u4ee5\u76f4\u63a5\u56de\u590d Bot \u53d1\u6765\u7684\u67d0\u6761\u5de5\u5355\u901a\u77e5\uff0cBot \u4f1a\u81ea\u52a8\u628a\u5185\u5bb9\u5199\u56de\u5bf9\u5e94\u5de5\u5355\u3002',
  details: '\u67e5\u770b\u8be6\u60c5',
  back: '\u8fd4\u56de',
  close: '\u5173\u95ed\u5de5\u5355',
  replyCommand: '\u590d\u5236\u56de\u590d\u547d\u4ee4',
  confirmClose: '\u786e\u8ba4\u5173\u95ed',
  cancel: '\u53d6\u6d88',
  noSubject: '\u65e0\u6807\u9898',
  usageTicket: '\u7528\u6cd5: /ticket <id>',
  usageReply: '\u7528\u6cd5: /reply id \u5185\u5bb9',
  usageClose: '\u7528\u6cd5: /close <id>',
  fetching: '\u6b63\u5728\u83b7\u53d6\u5de5\u5355\u8be6\u60c5',
  replyCreated: '\u5df2\u751f\u6210\u56de\u590d\u547d\u4ee4',
  closing: '\u6b63\u5728\u5173\u95ed\u5de5\u5355',
  canceled: '\u5df2\u53d6\u6d88',
  closeCanceled: '\u5df2\u53d6\u6d88\u5173\u95ed\u5de5\u5355\u3002',
  notLinked: '\u6ca1\u6709\u627e\u5230\u8fd9\u6761 Telegram \u6d88\u606f\u5bf9\u5e94\u7684 XBoard \u5de5\u5355\u3002\u8bf7\u4f7f\u7528 /reply id \u5185\u5bb9\u3002',
  fallbackLocal: '\u5b9e\u65f6\u83b7\u53d6\u5931\u8d25\uff0c\u5df2\u663e\u793a\u672c\u5730\u7f13\u5b58\u3002'
};

function isAuthorized(ctx, adminUserId) {
  return String(ctx.from?.id || '') === String(adminUserId);
}

function commandArgs(ctx, command) {
  const text = ctx.message?.text || '';
  return text.replace(new RegExp(`^/${command}(?:@\\w+)?\\s*`, 'i'), '').trim();
}

function splitIdAndContent(raw) {
  const match = raw.match(/^(\S+)\s+([\s\S]+)$/);
  if (!match) return null;
  return { ticketId: match[1], content: match[2].trim() };
}

export function notificationKeyboard(ticket) {
  const ticketId = ticket.id || ticket;
  if (String(ticket.status || '').toLowerCase() === 'closed') {
    return {
      inline_keyboard: [
        [{ text: zh.details, callback_data: `ticket:detail:${ticketId}` }]
      ]
    };
  }

  return {
    inline_keyboard: [
      [
        { text: zh.details, callback_data: `ticket:detail:${ticketId}` },
        { text: zh.close, callback_data: `ticket:close:${ticketId}` }
      ]
    ]
  };
}

export function detailKeyboard(ticket) {
  const ticketId = ticket.id || ticket;
  return {
    inline_keyboard: [
      [
        { text: zh.back, callback_data: `ticket:back:${ticketId}` },
        { text: zh.replyCommand, copy_text: { text: `/reply ${ticketId} ` } }
      ]
    ]
  };
}

function ticketListKeyboard(tickets) {
  return {
    inline_keyboard: tickets.slice(0, 20).flatMap((ticket) => {
      const first = {
        text: `${zh.details} #${ticket.id} ${shortText(ticket.subject || zh.noSubject, 24)}`,
        callback_data: `ticket:detail:${ticket.id}`
      };
      if (String(ticket.status || '').toLowerCase() === 'closed') return [[first]];
      return [[first, { text: zh.close, callback_data: `ticket:close:${ticket.id}` }]];
    })
  };
}

function closeConfirmKeyboard(ticketId) {
  return {
    inline_keyboard: [
      [
        { text: zh.confirmClose, callback_data: `ticket:close_confirm:${ticketId}` },
        { text: zh.cancel, callback_data: `ticket:close_cancel:${ticketId}` }
      ]
    ]
  };
}

async function ignoreUnauthorized(ctx, adminUserId) {
  if (isAuthorized(ctx, adminUserId)) return false;
  logger.warn('ignored unauthorized telegram user', {
    user_id: ctx.from?.id,
    username: ctx.from?.username
  });
  return true;
}

const helpText = [
  zh.running,
  '',
  zh.autoNotify,
  '',
  '/tickets \u67e5\u770b\u5f85\u5904\u7406\u5de5\u5355\u6309\u94ae\u5217\u8868',
  '/ticket <id> \u67e5\u770b\u5de5\u5355\u8be6\u60c5',
  '/reply id \u5185\u5bb9 \u56de\u590d\u5de5\u5355',
  '/close <id> \u5173\u95ed\u5de5\u5355',
  '/health \u67e5\u770b Bot \u72b6\u6001',
  '/poll \u7acb\u5373\u68c0\u67e5\u65b0\u5de5\u5355',
  '/notify_on \u5f00\u542f\u673a\u5668\u4eba\u81ea\u52a8\u901a\u77e5',
  '/notify_off \u5173\u95ed\u673a\u5668\u4eba\u81ea\u52a8\u901a\u77e5',
  '/notify_status \u67e5\u770b\u901a\u77e5\u5f00\u5173\u72b6\u6001',
  '/help \u67e5\u770b\u5e2e\u52a9',
  '',
  zh.directReply
].join('\n');

async function replyOrEditTicket(ctx, text, replyMarkup) {
  if (ctx.callbackQuery?.message) {
    try {
      await ctx.editMessageText(text, {
        disable_web_page_preview: true,
        reply_markup: replyMarkup
      });
      return ctx.callbackQuery.message;
    } catch (error) {
      logger.warn('edit ticket message failed; falling back to reply', { error: error.message });
    }
  }

  return ctx.reply(text, {
    disable_web_page_preview: true,
    reply_markup: replyMarkup
  });
}

async function sendTicketDetail(ctx, xboard, db, ticketId) {
  const ticket = await xboard.getTicket(ticketId);
  db.upsertTicket(ticket);
  const sent = await replyOrEditTicket(ctx, formatTicketDetail(ticket), detailKeyboard(ticket));
  db.linkMessage(ctx.chat.id, sent.message_id, ticket.id);
  return ticket;
}

async function sendTicketSummary(ctx, xboard, db, ticketId) {
  const ticket = await xboard.getTicket(ticketId);
  db.upsertTicket(ticket);
  const sent = await replyOrEditTicket(ctx, formatTicketSummary(ticket), notificationKeyboard(ticket));
  db.linkMessage(ctx.chat.id, sent.message_id, ticket.id);
  return ticket;
}

export function createTelegramBot({ config, db, xboard, getHealth, runPoll }) {
  const bot = new Telegraf(config.botToken);

  bot.use(async (ctx, next) => {
    if (await ignoreUnauthorized(ctx, config.adminUserId)) return;
    await next();
  });

  bot.start(async (ctx) => {
    await ctx.reply(helpText);
  });

  bot.help(async (ctx) => {
    await ctx.reply(helpText);
  });

  bot.command('tickets', async (ctx) => {
    try {
      const tickets = await xboard.fetchOpenTickets();
      for (const ticket of tickets) db.upsertTicket(ticket);
      if (tickets.length === 0) {
        await ctx.reply(formatTicketList(tickets));
        return;
      }
      await ctx.reply(formatTicketList(tickets), {
        reply_markup: ticketListKeyboard(tickets)
      });
    } catch (error) {
      logger.error('live ticket list failed', { error: error.message });
      const tickets = db.listOpenTickets(20);
      await ctx.reply(`${zh.fallbackLocal}\n\n${formatTicketList(tickets)}`, tickets.length > 0
        ? { reply_markup: ticketListKeyboard(tickets) }
        : undefined);
    }
  });

  bot.command('ticket', async (ctx) => {
    const ticketId = commandArgs(ctx, 'ticket');
    if (!ticketId) {
      await ctx.reply(zh.usageTicket);
      return;
    }

    try {
      await sendTicketDetail(ctx, xboard, db, ticketId);
    } catch (error) {
      logger.error('ticket detail failed', { ticket_id: ticketId, error: error.message });
      await ctx.reply(`\u83b7\u53d6\u5de5\u5355\u5931\u8d25: ${error.message}`);
    }
  });

  bot.command('reply', async (ctx) => {
    const parsed = splitIdAndContent(commandArgs(ctx, 'reply'));
    if (!parsed) {
      await ctx.reply(zh.usageReply);
      return;
    }

    try {
      const ticketId = await xboard.resolveTicketId(parsed.ticketId);
      await xboard.replyTicket(ticketId, parsed.content);
      if (db.markTicketAdminReplied) db.markTicketAdminReplied(ticketId);
      await ctx.reply(`\u5df2\u56de\u590d\u5de5\u5355 #${ticketId}`);
    } catch (error) {
      logger.error('ticket reply failed', { ticket_id: parsed.ticketId, error: error.message });
      await ctx.reply(`\u56de\u590d\u5931\u8d25: ${error.message}`);
    }
  });

  bot.command('close', async (ctx) => {
    const ticketId = commandArgs(ctx, 'close');
    if (!ticketId) {
      await ctx.reply(zh.usageClose);
      return;
    }

    await ctx.reply(`\u786e\u8ba4\u5173\u95ed\u5de5\u5355 #${ticketId}\uff1f`, {
      reply_markup: closeConfirmKeyboard(ticketId)
    });
  });

  bot.command('health', async (ctx) => {
    await ctx.reply(JSON.stringify(getHealth(), null, 2));
  });

  bot.command('notify_on', async (ctx) => {
    db.setNotificationsEnabled(true);
    await ctx.reply('\u5df2\u5f00\u542f\u673a\u5668\u4eba\u81ea\u52a8\u901a\u77e5\u3002');
  });

  bot.command('notify_off', async (ctx) => {
    db.setNotificationsEnabled(false);
    await ctx.reply('\u5df2\u5173\u95ed\u673a\u5668\u4eba\u81ea\u52a8\u901a\u77e5\u3002\u4f60\u4ecd\u7136\u53ef\u4ee5\u4f7f\u7528 /tickets\u3001/ticket\u3001/reply\u3001/close \u624b\u52a8\u5904\u7406\u5de5\u5355\u3002');
  });

  bot.command('notify_status', async (ctx) => {
    const enabled = db.notificationsEnabled ? db.notificationsEnabled() : true;
    await ctx.reply(enabled
      ? '\u673a\u5668\u4eba\u81ea\u52a8\u901a\u77e5\uff1a\u5df2\u5f00\u542f'
      : '\u673a\u5668\u4eba\u81ea\u52a8\u901a\u77e5\uff1a\u5df2\u5173\u95ed');
  });

  bot.command('poll', async (ctx) => {
    if (!runPoll) {
      await ctx.reply('\u8f6e\u8be2\u5668\u672a\u5c31\u7eea\u3002');
      return;
    }

    const stats = await runPoll();
    await ctx.reply([
      '\u5df2\u6267\u884c\u4e00\u6b21\u5de5\u5355\u68c0\u67e5\u3002',
      `tickets: ${stats?.tickets ?? 0}`,
      `notifications: ${stats?.notifications ?? 0}`,
      `skipped: ${stats?.skipped ? 'yes' : 'no'}`,
      `error: ${stats?.error || 'none'}`
    ].join('\n'));
  });

  bot.action(/^ticket:detail:(.+)$/, async (ctx) => {
    const ticketId = ctx.match[1];
    await ctx.answerCbQuery(zh.fetching);

    try {
      await sendTicketDetail(ctx, xboard, db, ticketId);
    } catch (error) {
      logger.error('ticket detail callback failed', { ticket_id: ticketId, error: error.message });
      await ctx.reply(`\u83b7\u53d6\u5de5\u5355\u5931\u8d25: ${error.message}`);
    }
  });

  bot.action(/^ticket:back:(.+)$/, async (ctx) => {
    const ticketId = ctx.match[1];
    await ctx.answerCbQuery(zh.back);

    try {
      await sendTicketSummary(ctx, xboard, db, ticketId);
    } catch (error) {
      logger.error('ticket back callback failed', { ticket_id: ticketId, error: error.message });
      await ctx.reply(`\u8fd4\u56de\u5de5\u5355\u6458\u8981\u5931\u8d25: ${error.message}`);
    }
  });

  bot.action(/^ticket:reply:(.+)$/, async (ctx) => {
    const ticketId = ctx.match[1];
    await ctx.answerCbQuery(zh.replyCreated);
    try {
      const resolvedId = await xboard.resolveTicketId(ticketId);
      await ctx.reply(`/reply ${resolvedId} `);
    } catch {
      await ctx.reply(`/reply ${ticketId} `);
    }
  });

  bot.action(/^ticket:close:(.+)$/, async (ctx) => {
    const ticketId = ctx.match[1];
    await ctx.answerCbQuery();
    await ctx.reply(`\u786e\u8ba4\u5173\u95ed\u5de5\u5355 #${ticketId}\uff1f`, {
      reply_markup: closeConfirmKeyboard(ticketId)
    });
  });

  bot.action(/^ticket:close_cancel:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery(zh.canceled);
    try {
      await ctx.editMessageText(zh.closeCanceled);
    } catch {
      await ctx.reply(zh.closeCanceled);
    }
  });

  bot.action(/^ticket:close_confirm:(.+)$/, async (ctx) => {
    const ticketId = ctx.match[1];
    await ctx.answerCbQuery(zh.closing);

    try {
      const resolvedId = await xboard.resolveTicketId(ticketId);
      await xboard.closeTicket(resolvedId);
      if (db.clearTicketAdminReplied) db.clearTicketAdminReplied(resolvedId);
      const local = db.getTicket(resolvedId);
      if (local) {
        db.upsertTicket({
          ...local,
          id: resolvedId,
          status: 'closed',
          updated_at: new Date().toISOString(),
          raw: JSON.parse(local.raw_json || '{}')
        });
      }
      await ctx.reply(`\u5df2\u5173\u95ed\u5de5\u5355 #${resolvedId}`);
    } catch (error) {
      logger.error('ticket close callback failed', { ticket_id: ticketId, error: error.message });
      await ctx.reply(`\u5173\u95ed\u5931\u8d25: ${error.message}`);
    }
  });

  bot.on('text', async (ctx) => {
    const replyTo = ctx.message?.reply_to_message?.message_id;
    if (!replyTo) return;

    const ticketId = db.getLinkedTicket(ctx.chat.id, replyTo);
    if (!ticketId) {
      await ctx.reply(zh.notLinked);
      return;
    }

    try {
      const resolvedId = await xboard.resolveTicketId(ticketId);
      await xboard.replyTicket(resolvedId, ctx.message.text);
      if (db.markTicketAdminReplied) db.markTicketAdminReplied(resolvedId);
      await ctx.reply(`\u5df2\u56de\u590d\u5de5\u5355 #${resolvedId}`);

      const local = db.getTicket(resolvedId);
      if (local) {
        db.upsertTicket({
          ...local,
          id: resolvedId,
          last_message: ctx.message.text,
          last_message_from_admin: true,
          updated_at: new Date().toISOString(),
          raw: JSON.parse(local.raw_json || '{}')
        });
      }
    } catch (error) {
      logger.error('telegram reply mapping failed', { ticket_id: ticketId, error: error.message });
      await ctx.reply(`\u56de\u590d\u5931\u8d25: ${error.message}`);
    }
  });

  bot.catch((error, ctx) => {
    logger.error('telegram handler failed', {
      update_id: ctx?.update?.update_id,
      error: error.message
    });
  });

  bot.sendTicketNotification = async (ticket, title) => {
    const sent = await bot.telegram.sendMessage(config.adminUserId, [
      title,
      '',
      formatTicketSummary(ticket)
    ].join('\n'), {
      disable_web_page_preview: true,
      reply_markup: notificationKeyboard(ticket)
    });
    db.linkMessage(config.adminUserId, sent.message_id, ticket.id);
    return sent;
  };

  return bot;
}
