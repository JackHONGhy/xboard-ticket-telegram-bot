import 'dotenv/config';
import { loadConfig } from './config.js';
import { XBoardClient } from './xboardClient.js';

function keysOf(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  return Object.keys(value);
}

function findFirstArray(value, depth = 0) {
  if (depth > 4 || !value || typeof value !== 'object') return null;
  if (Array.isArray(value)) return value;
  for (const item of Object.values(value)) {
    const found = findFirstArray(item, depth + 1);
    if (found) return found;
  }
  return null;
}

function summarizeTicket(ticket) {
  if (!ticket || typeof ticket !== 'object') return null;
  return {
    id: ticket.id,
    subject: ticket.subject,
    status: ticket.status,
    updated_at: ticket.updated_at,
    created_at: ticket.created_at,
    reply_count: ticket.reply_count,
    user_label: ticket.user_label,
    last_message_preview: ticket.last_message ? `${ticket.last_message.slice(0, 80)}${ticket.last_message.length > 80 ? '...' : ''}` : ''
  };
}

async function main() {
  const config = loadConfig();
  const xboard = new XBoardClient(config);

  console.log('XBoard debug');
  console.log(`base_url: ${config.xboardBaseUrl}`);
  console.log(`auth_type: ${config.xboard.authType}`);
  console.log(`fetch: ${config.xboard.fetchMethod} ${config.xboard.fetchPath}`);

  const payload = await xboard.request(
    config.xboard.fetchMethod,
    config.xboard.fetchPath
  );

  console.log(`top_level_keys: ${keysOf(payload).join(', ') || '(none)'}`);

  const firstArray = findFirstArray(payload);
  console.log(`first_array_length: ${firstArray ? firstArray.length : 0}`);
  if (firstArray?.[0]) {
    console.log(`first_item_keys: ${keysOf(firstArray[0]).join(', ') || '(none)'}`);
  }

  const tickets = await xboard.fetchTickets();
  console.log(`normalized_ticket_count: ${tickets.length}`);
  if (tickets[0]) {
    console.log('first_normalized_ticket:');
    console.log(JSON.stringify(summarizeTicket(tickets[0]), null, 2));
    console.log(`first_raw_keys: ${keysOf(tickets[0].raw).join(', ') || '(none)'}`);
  }
}

main().catch((error) => {
  console.error(`debug failed: ${error.message}`);
  process.exit(1);
});
