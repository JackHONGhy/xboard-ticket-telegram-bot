import { logger } from './logger.js';

function eventKey(ticket, type, marker) {
  return `${type}:${ticket.id}:${marker || 'none'}`;
}

function changed(previous, current, field) {
  return String(previous?.[field] ?? '') !== String(current?.[field] ?? '');
}

function parseTicketTime(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  if (/^\d{10}$/.test(raw)) return Number(raw) * 1000;
  if (/^\d{13}$/.test(raw)) return Number(raw);
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function beijingHour(timestampMs) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai',
    hour: 'numeric',
    hour12: false
  }).formatToParts(new Date(timestampMs));
  const hour = Number(parts.find((part) => part.type === 'hour')?.value);
  return Number.isFinite(hour) ? hour : 0;
}

function isNightHour(hour, startHour, endHour) {
  if (startHour === endHour) return false;
  if (startHour < endHour) return hour >= startHour && hour < endHour;
  return hour >= startHour || hour < endHour;
}

function isClosedTicket(ticket) {
  return ['closed', 'close', 'resolved', 'done'].includes(String(ticket.status || '').trim().toLowerCase());
}

function isUserAwaitingAdmin(ticket) {
  return String(ticket.status || '').trim().toLowerCase() === 'replied';
}

function buildStaleReminderEvent(ticket, config, nowMs) {
  if (isClosedTicket(ticket)) return null;

  const createdMs = parseTicketTime(ticket.updated_at || ticket.created_at);
  if (!createdMs) return null;

  const ageMs = nowMs - createdMs;
  const firstMs = config.firstRemindMinutes * 60 * 1000;
  if (ageMs < firstMs) return null;

  const hour = beijingHour(nowMs);
  const repeatMinutes = isNightHour(hour, config.nightStartHour, config.nightEndHour)
    ? config.nightRepeatMinutes
    : config.repeatRemindMinutes;
  const bucket = Math.floor(nowMs / (repeatMinutes * 60 * 1000));

  return {
    type: 'stale_ticket',
    key: eventKey(ticket, 'stale_ticket', bucket),
    title: '\u5de5\u5355\u8d85\u65f6\u672a\u56de\u590d'
  };
}

function buildEvents(previous, ticket, config, nowMs) {
  const newTicketEvent = {
    type: 'new_ticket',
    key: eventKey(ticket, 'new_ticket', ticket.created_at || ticket.updated_at || ticket.reply_count),
    title: '\u65b0\u5de5\u5355'
  };

  if (!previous) {
    return [newTicketEvent];
  }

  const events = [];

  if (changed(previous, ticket, 'status')) {
    events.push({
      type: 'status_change',
      key: eventKey(ticket, 'status_change', `${previous.status}->${ticket.status}:${ticket.updated_at}`),
      title: '\u5de5\u5355\u72b6\u6001\u53d8\u5316'
    });
  }

  const previousReplyCount = Number(previous.reply_count || 0);
  const currentReplyCount = Number(ticket.reply_count || 0);
  const userLastMessage = ticket.last_message && !ticket.last_message_from_admin;
  const updatedChanged = changed(previous, ticket, 'updated_at');
  const messageChanged = changed(previous, ticket, 'last_message');

  if ((currentReplyCount > previousReplyCount || updatedChanged || messageChanged) && userLastMessage) {
    events.push({
      type: 'user_reply',
      key: eventKey(ticket, 'user_reply', `${currentReplyCount}:${ticket.updated_at}:${ticket.last_message}`),
      title: '\u7528\u6237\u65b0\u56de\u590d'
    });
  }

  const staleReminderEvent = buildStaleReminderEvent(ticket, config, nowMs);
  if (staleReminderEvent) events.push(staleReminderEvent);

  return { events, newTicketEvent };
}

export class TicketPoller {
  constructor({ db, xboard, bot, adminUserId, intervalSeconds, staleTicketConfig }) {
    this.db = db;
    this.xboard = xboard;
    this.bot = bot;
    this.adminUserId = adminUserId;
    this.intervalMs = intervalSeconds * 1000;
    this.timer = null;
    this.started = false;
    this.running = false;
    this.lastPollAt = null;
    this.lastPollError = null;
    this.lastPollStats = null;
    this.nextPollAt = null;
    this.staleTicketConfig = staleTicketConfig || {
      firstRemindMinutes: 1,
      repeatRemindMinutes: 1,
      nightStartHour: 0,
      nightEndHour: 8,
      nightRepeatMinutes: 60
    };
  }

  async notify(ticket, event) {
    await this.bot.sendTicketNotification(ticket, event.title);
  }

  async pollOnce() {
    if (this.running) {
      return {
        skipped: true,
        running: true,
        tickets: 0,
        notifications: 0,
        error: ''
      };
    }

    this.running = true;

    try {
      const tickets = await this.xboard.fetchOpenTickets();
      let notificationCount = 0;
      const nowMs = Date.now();
      const notificationsEnabled = this.db.notificationsEnabled ? this.db.notificationsEnabled() : true;

      for (const ticket of tickets) {
        const previous = this.db.getTicket(ticket.id);
        const built = buildEvents(previous, ticket, this.staleTicketConfig, nowMs);
        const events = Array.isArray(built) ? built : built.events;
        const newTicketEvent = Array.isArray(built)
          ? events.find((event) => event.type === 'new_ticket')
          : built.newTicketEvent;

        if (previous && newTicketEvent && !this.db.hasEvent(newTicketEvent.key)) {
          events.unshift(newTicketEvent);
        }

        this.db.upsertTicket(ticket);

        const wasAdminReplied = this.db.ticketAdminReplied ? this.db.ticketAdminReplied(ticket.id) : false;
        if (wasAdminReplied && isUserAwaitingAdmin(ticket) && this.db.clearTicketAdminReplied) {
          this.db.clearTicketAdminReplied(ticket.id);
        }
        const skipNotifications = wasAdminReplied && !isUserAwaitingAdmin(ticket);

        for (const event of events) {
          if (this.db.hasEvent(event.key)) continue;
          if (skipNotifications) {
            this.db.recordEvent(event.key, ticket.id, event.type);
            continue;
          }
          if (!notificationsEnabled) continue;
          await this.notify(ticket, event);
          this.db.recordEvent(event.key, ticket.id, event.type);
          notificationCount += 1;
        }
      }

      this.lastPollAt = new Date().toISOString();
      this.lastPollError = null;
      this.lastPollStats = {
        skipped: false,
        running: false,
        tickets: tickets.length,
        notifications: notificationCount,
        notifications_enabled: notificationsEnabled,
        error: ''
      };
      this.db.setMeta('last_poll_at', this.lastPollAt);
      this.db.setMeta('last_poll_error', '');
      logger.info('poll completed', { tickets: tickets.length, notifications: notificationCount });
      return this.lastPollStats;
    } catch (error) {
      this.lastPollAt = new Date().toISOString();
      this.lastPollError = error.message;
      this.lastPollStats = {
        skipped: false,
        running: false,
        tickets: 0,
        notifications: 0,
        notifications_enabled: this.db.notificationsEnabled ? this.db.notificationsEnabled() : true,
        error: error.message
      };
      this.db.setMeta('last_poll_at', this.lastPollAt);
      this.db.setMeta('last_poll_error', this.lastPollError);
      logger.error('poll failed', { error: error.message });
      return this.lastPollStats;
    } finally {
      this.running = false;
    }
  }

  start() {
    if (this.started) return;
    this.started = true;
    logger.info('ticket poller started', { interval_seconds: this.intervalMs / 1000 });

    const tick = async () => {
      if (!this.started) return;
      this.nextPollAt = null;
      await this.pollOnce();
      if (!this.started) return;
      this.nextPollAt = new Date(Date.now() + this.intervalMs).toISOString();
      this.timer = setTimeout(tick, this.intervalMs);
    };

    tick();
  }

  stop() {
    if (!this.started) return;
    this.started = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.nextPollAt = null;
    logger.info('ticket poller stopped');
  }

  status() {
    return {
      running: this.running,
      timer_active: this.started,
      interval_seconds: this.intervalMs / 1000,
      notifications_enabled: this.db.notificationsEnabled ? this.db.notificationsEnabled() : true,
      last_poll_at: this.lastPollAt || this.db.getMeta('last_poll_at'),
      last_poll_error: this.lastPollError || this.db.getMeta('last_poll_error') || '',
      next_poll_at: this.nextPollAt,
      last_poll_stats: this.lastPollStats
    };
  }
}
