function replacePathVariables(pathTemplate, config) {
  return pathTemplate.replaceAll('{admin_path}', encodeURIComponent(config.adminPath));
}

function appendQuery(url, query = {}) {
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  });
}

function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== '');
}

function asText(value) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

function asNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function unwrapPayload(payload) {
  let current = payload;
  const seen = new Set();
  while (isObject(current) && !seen.has(current)) {
    seen.add(current);
    const next = firstDefined(current.data, current.result, current.response, current.payload);
    if (!next || next === current) break;
    current = next;
  }
  return current;
}

function looksLikeTicket(item) {
  if (!isObject(item)) return false;
  const hasId = firstDefined(item.id, item.ticket_id, item.ticketId, item.uuid) !== undefined;
  const hasTicketShape = firstDefined(item.subject, item.title, item.name, item.status, item.reply_status, item.user) !== undefined;
  return hasId && hasTicketShape;
}

function looksLikeTicketMessage(item) {
  if (!isObject(item)) return false;
  const hasMessageText = firstDefined(item.message, item.content, item.text, item.body, item.reply) !== undefined;
  const hasTicketTitle = firstDefined(item.subject, item.title, item.name) !== undefined;
  return hasMessageText && !hasTicketTitle;
}

function findTicketArray(payload) {
  const unwrapped = unwrapPayload(payload);
  if (Array.isArray(unwrapped)) return unwrapped;
  if (!isObject(unwrapped)) return [];

  const direct = [unwrapped.data, unwrapped.list, unwrapped.rows, unwrapped.items, unwrapped.tickets, unwrapped.records];
  for (const value of direct) {
    if (Array.isArray(value)) return value;
    if (isObject(value) && Array.isArray(value.data)) return value.data;
  }

  for (const value of Object.values(unwrapped)) {
    if (Array.isArray(value) && value.some(looksLikeTicket)) return value;
  }

  return looksLikeTicket(unwrapped) ? [unwrapped] : [];
}

function collectMessages(raw) {
  if (Array.isArray(raw)) return raw.filter((item) => isObject(item));
  if (!isObject(raw)) return [];

  const candidates = [raw.messages, raw.replies, raw.reply, raw.ticket_messages, raw.ticketMessages, raw.children];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate.filter((item) => isObject(item));
  }

  if (isObject(raw.data) || Array.isArray(raw.data)) return collectMessages(raw.data);
  return [];
}

function messageHasId(message, id) {
  if (!isObject(message)) return false;
  const expected = String(id).trim();
  const actual = firstDefined(message.id, message.message_id, message.messageId, message.reply_id, message.replyId, message.uuid);
  return String(actual ?? '').trim() === expected;
}

function isAdminMessage(message) {
  const value = firstDefined(message.is_admin, message.isAdmin, message.admin, message.from_admin, message.fromAdmin);
  if (value === true || value === 1 || value === '1') return true;

  const type = asText(firstDefined(
    message.type,
    message.user_type,
    message.userType,
    message.sender_type,
    message.senderType,
    message.role,
    message.from
  )).toLowerCase();

  return ['admin', 'staff', 'operator', 'support'].includes(type);
}

function normalizeMessageText(message) {
  if (!isObject(message)) return '';
  return asText(firstDefined(message.message, message.content, message.text, message.body, message.reply));
}

function normalizeUser(raw) {
  const user = firstDefined(raw.user, raw.customer, raw.account, raw.creator);
  if (isObject(user)) {
    return asText(firstDefined(user.email, user.name, user.username, user.user_name, user.id));
  }
  return asText(firstDefined(raw.email, raw.user_email, raw.userEmail, raw.user_name, raw.username, raw.user_id, raw.userId, user));
}

function normalizeStatus(item) {
  const status = String(firstDefined(item.status, item.state, '')).trim().toLowerCase();
  const replyStatus = String(firstDefined(item.reply_status, item.replyStatus, '')).trim().toLowerCase();

  if (['1', 'closed', 'close', 'resolved', 'done'].includes(status)) return 'closed';
  if (['1', 'replied', 'reply'].includes(replyStatus)) return 'replied';
  if (['0', 'pending', 'open', ''].includes(status)) return 'pending';
  return status || replyStatus || 'unknown';
}

export function isTicketClosed(ticket) {
  return String(ticket?.status || '').trim().toLowerCase() === 'closed';
}

export function normalizeTicket(raw) {
  const item = isObject(raw?.data) && looksLikeTicket(raw.data) ? raw.data : raw;
  const messages = collectMessages(item);
  const lastMessage = messages.length > 0 ? messages[messages.length - 1] : null;
  const id = firstDefined(item.id, item.ticket_id, item.ticketId, item.uuid);
  const updatedAt = asText(firstDefined(
    item.updated_at,
    item.updatedAt,
    item.update_time,
    item.updated,
    item.last_reply_at,
    item.lastReplyAt,
    lastMessage?.created_at,
    lastMessage?.createdAt,
    item.created_at,
    item.createdAt
  ));

  return {
    id: asText(id),
    subject: asText(firstDefined(item.subject, item.title, item.name, `Ticket ${id}`)),
    status: normalizeStatus(item),
    updated_at: updatedAt,
    created_at: asText(firstDefined(item.created_at, item.createdAt, item.create_time, item.created)),
    reply_count: asNumber(firstDefined(item.reply_count, item.replyCount, item.replies_count, item.messages_count, item.message_count, messages.length)),
    user_label: normalizeUser(item),
    last_message: normalizeMessageText(lastMessage || item.last_message || item.lastMessage || item),
    last_message_from_admin: lastMessage ? isAdminMessage(lastMessage) : isAdminMessage(item.last_message || item.lastMessage || {}),
    raw: item
  };
}

function normalizeTickets(payload) {
  return findTicketArray(payload)
    .filter((ticket) => !looksLikeTicketMessage(ticket))
    .map((ticket) => normalizeTicket(ticket))
    .filter((ticket) => ticket.id);
}

function normalizeTicketDetail(ticketId, payload, listTicket = null) {
  const requestedId = String(ticketId).trim();
  const unwrapped = unwrapPayload(payload);
  const messages = collectMessages(unwrapped);
  const lastMessage = messages.length > 0 ? messages[messages.length - 1] : null;
  const base = listTicket || {};

  return {
    id: requestedId,
    subject: base.subject || asText(firstDefined(unwrapped.subject, unwrapped.title, `Ticket ${requestedId}`)),
    status: base.status || normalizeStatus(unwrapped),
    updated_at: base.updated_at || asText(firstDefined(unwrapped.updated_at, unwrapped.updatedAt, lastMessage?.created_at, lastMessage?.createdAt, unwrapped.created_at, unwrapped.createdAt)),
    created_at: base.created_at || asText(firstDefined(unwrapped.created_at, unwrapped.createdAt, lastMessage?.created_at, lastMessage?.createdAt)),
    reply_count: messages.length || base.reply_count || 0,
    user_label: base.user_label || normalizeUser(unwrapped) || normalizeUser(lastMessage || {}),
    last_message: normalizeMessageText(lastMessage || unwrapped.last_message || unwrapped.lastMessage || unwrapped),
    last_message_from_admin: lastMessage ? isAdminMessage(lastMessage) : false,
    raw: { list_ticket: base.raw || base, detail: payload }
  };
}

function ticketIdCandidates(ticketId) {
  const value = String(ticketId);
  const trimmed = value.trim();
  return Array.from(new Set([value, trimmed, ` ${trimmed}`]));
}

function shouldRetryTicketId(error) {
  const message = String(error?.message || '').toLowerCase();
  return message.includes('ticket not found')
    || message.includes('ticket does not exist')
    || message.includes('not found')
    || message.includes('not exist')
    || message.includes('\u5de5\u5355\u4e0d\u5b58\u5728')
    || message.includes('\\u5de5\\u5355\\u4e0d\\u5b58\\u5728');
}

export class XBoardClient {
  constructor(config) {
    this.baseUrl = config.xboardBaseUrl;
    this.routeConfig = config.xboard;
  }

  buildUrl(pathTemplate, query = {}) {
    const resolvedPath = replacePathVariables(pathTemplate, this.routeConfig);
    const url = resolvedPath.startsWith('http://') || resolvedPath.startsWith('https://')
      ? new URL(resolvedPath)
      : new URL(resolvedPath.startsWith('/') ? resolvedPath : `/${resolvedPath}`, this.baseUrl);
    appendQuery(url, query);
    return url;
  }

  headers() {
    const headers = { Accept: 'application/json', 'Content-Type': 'application/json' };

    if (this.routeConfig.authType === 'cookie') headers.Cookie = this.routeConfig.cookie;

    if (this.routeConfig.authType === 'bearer' || this.routeConfig.authType === 'custom') {
      const authValue = this.routeConfig.authScheme
        ? `${this.routeConfig.authScheme} ${this.routeConfig.authToken}`
        : this.routeConfig.authToken;
      headers[this.routeConfig.authHeader] = authValue;
    }

    if (this.routeConfig.apiSecret) {
      headers[this.routeConfig.apiSecretHeader] = this.routeConfig.apiSecret;
      headers['X-API-Secret'] = this.routeConfig.apiSecret;
      headers['X-Api-Secret'] = this.routeConfig.apiSecret;
      headers['XBoard-API-Secret'] = this.routeConfig.apiSecret;
    }

    return headers;
  }

  async request(method, pathTemplate, { query = {}, body = {} } = {}) {
    const upperMethod = method.toUpperCase();
    const url = this.buildUrl(pathTemplate, upperMethod === 'GET' ? query : {});
    let response;
    try {
      response = await fetch(url, {
        method: upperMethod,
        headers: this.headers(),
        body: upperMethod === 'GET' ? undefined : JSON.stringify(body)
      });
    } catch (error) {
      const cause = error.cause
        ? `; cause=${error.cause.code || error.cause.name || 'unknown'} ${error.cause.message || ''}`.trim()
        : '';
      throw new Error(`XBoard API ${upperMethod} ${url.href} network failed: ${error.message}${cause}`);
    }

    const text = await response.text();
    let payload = {};
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = { raw: text };
      }
    }

    if (!response.ok) {
      throw new Error(`XBoard API ${upperMethod} ${url.pathname} failed with ${response.status}: ${text.slice(0, 300)}`);
    }

    const code = payload?.code ?? payload?.status_code;
    if (code !== undefined && Number(code) >= 400) {
      throw new Error(`XBoard API returned error code ${code}: ${JSON.stringify(payload).slice(0, 300)}`);
    }

    return payload;
  }

  async fetchTickets() {
    const payload = await this.request(this.routeConfig.fetchMethod, this.routeConfig.fetchPath);
    return normalizeTickets(payload);
  }

  async fetchOpenTickets() {
    const tickets = await this.fetchTickets();
    return tickets.filter((ticket) => !isTicketClosed(ticket));
  }

  async fetchTicketDetailPayload(ticketId) {
    let lastError;
    for (const candidate of ticketIdCandidates(ticketId)) {
      try {
        const query = { id: candidate, ticket_id: candidate };
        const body = { id: candidate, ticket_id: candidate };
        return await this.request(this.routeConfig.detailMethod, this.routeConfig.detailPath, { query, body });
      } catch (error) {
        lastError = error;
        if (!shouldRetryTicketId(error)) break;
      }
    }
    throw lastError;
  }

  async resolveMessageIdToTicket(messageId, tickets) {
    for (const ticket of tickets) {
      try {
        const payload = await this.fetchTicketDetailPayload(ticket.id);
        const messages = collectMessages(unwrapPayload(payload));
        if (messages.some((message) => messageHasId(message, messageId))) {
          return normalizeTicketDetail(ticket.id, payload, ticket);
        }
      } catch {
        // Keep scanning. Some ticket detail responses can fail independently.
      }
    }
    return null;
  }

  async resolveTicketId(ticketId) {
    let tickets = [];
    try {
      tickets = await this.fetchTickets();
    } catch {
      return String(ticketId).trim();
    }

    const exact = tickets.find((ticket) => String(ticket.id).trim() === String(ticketId).trim());
    if (exact) return exact.id;

    const resolved = await this.resolveMessageIdToTicket(ticketId, tickets);
    return resolved?.id || String(ticketId).trim();
  }

  async getTicket(ticketId) {
    let lastError;
    let listTickets = [];
    try {
      listTickets = await this.fetchTickets();
    } catch {
      listTickets = [];
    }
    const listTicket = listTickets.find((ticket) => String(ticket.id).trim() === String(ticketId).trim()) || null;

    try {
      const payload = await this.fetchTicketDetailPayload(ticketId);
      const tickets = normalizeTickets(payload);
      const exactTicket = tickets.find((ticket) => String(ticket.id).trim() === String(ticketId).trim());
      if (exactTicket) return exactTicket;
      return normalizeTicketDetail(ticketId, payload, listTicket);
    } catch (error) {
      lastError = error;
    }

    if (listTickets.length > 0 && shouldRetryTicketId(lastError)) {
      const resolved = await this.resolveMessageIdToTicket(ticketId, listTickets);
      if (resolved) return resolved;
    }

    throw lastError;
  }

  async replyTicket(ticketId, message) {
    let lastError;
    const resolvedId = await this.resolveTicketId(ticketId);

    for (const candidate of ticketIdCandidates(resolvedId)) {
      try {
        const body = { id: candidate, ticket_id: candidate, message, content: message, reply: message };
        return await this.request(this.routeConfig.replyMethod, this.routeConfig.replyPath, {
          query: { id: candidate, ticket_id: candidate },
          body
        });
      } catch (error) {
        lastError = error;
        if (!shouldRetryTicketId(error)) break;
      }
    }

    throw lastError;
  }

  async closeTicket(ticketId) {
    let lastError;
    const resolvedId = await this.resolveTicketId(ticketId);

    for (const candidate of ticketIdCandidates(resolvedId)) {
      try {
        const body = { id: candidate, ticket_id: candidate, status: 'closed' };
        return await this.request(this.routeConfig.closeMethod, this.routeConfig.closePath, {
          query: { id: candidate, ticket_id: candidate },
          body
        });
      } catch (error) {
        lastError = error;
        if (!shouldRetryTicketId(error)) break;
      }
    }

    throw lastError;
  }
}
