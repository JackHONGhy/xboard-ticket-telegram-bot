const zh = {
  noSubject: '\u65e0\u6807\u9898',
  pending: '\u5f85\u56de\u590d',
  replied: '\u5df2\u56de\u590d',
  closed: '\u5df2\u5173\u95ed',
  ticket: '\u5de5\u5355',
  status: '\u72b6\u6001',
  user: '\u7528\u6237',
  updated: '\u66f4\u65b0',
  noPending: '\u5f53\u524d\u6ca1\u6709\u5f85\u5904\u7406\u5de5\u5355\u3002',
  replyHint: '\u56de\u590d\u672c\u6d88\u606f\u53ef\u76f4\u63a5\u56de\u590d\u5de5\u5355'
};

export function shortText(value, maxLength = 500) {
  const text = String(value || '').trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1)}...`;
}

function formatStatus(status) {
  const normalized = String(status ?? '').trim().toLowerCase();
  const labels = {
    '0': zh.pending,
    '1': zh.replied,
    '2': zh.closed,
    open: zh.pending,
    pending: zh.pending,
    replied: zh.replied,
    closed: zh.closed,
    close: zh.closed,
    resolved: zh.closed,
    done: zh.closed
  };
  return labels[normalized] || String(status || 'unknown');
}

function formatTime(value) {
  const raw = String(value || '').trim();
  if (!raw) return 'unknown';
  if (/^\d{10}$/.test(raw)) {
    return new Date(Number(raw) * 1000).toLocaleString('zh-CN', {
      timeZone: 'Asia/Shanghai',
      hour12: false
    });
  }
  if (/^\d{13}$/.test(raw)) {
    return new Date(Number(raw)).toLocaleString('zh-CN', {
      timeZone: 'Asia/Shanghai',
      hour12: false
    });
  }
  return raw;
}

export function isClosedStatus(status) {
  return formatStatus(status) === zh.closed;
}

function formatTicketBase(ticket) {
  const lines = [
    `${zh.ticket} #${ticket.id} ${ticket.subject || `(${zh.noSubject})`}`,
    `${zh.status}: ${formatStatus(ticket.status)}`,
    `${zh.user}: ${ticket.user_label || 'unknown'}`,
    `${zh.updated}: ${formatTime(ticket.updated_at || ticket.created_at)}`
  ];

  if (ticket.last_message) {
    lines.push('', shortText(ticket.last_message, 700));
  }

  return lines.join('\n');
}

export function formatTicketSummary(ticket) {
  return formatTicketBase(ticket);
}

export function formatTicketList(tickets) {
  if (tickets.length === 0) {
    return zh.noPending;
  }

  return tickets.map((ticket) => {
    const subject = shortText(ticket.subject || `(${zh.noSubject})`, 80);
    return `#${ticket.id} [${formatStatus(ticket.status)}] ${subject}`;
  }).join('\n');
}

export function formatTicketDetail(ticket) {
  return [
    formatTicketBase(ticket),
    '',
    `${zh.replyHint} #${ticket.id}\u3002`
  ].join('\n');
}
