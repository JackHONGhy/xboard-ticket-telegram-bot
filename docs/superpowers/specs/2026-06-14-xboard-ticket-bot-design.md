# XBoard Telegram Ticket Bot Design

## Goal

Build a private Telegram Bot service that connects to XBoard ticket APIs without modifying or embedding into the XBoard main process. The Bot serves one Telegram administrator account only.

The service polls XBoard every 30 seconds, detects new ticket activity, sends private Telegram notifications, and lets the administrator reply to or close tickets from Telegram.

## Architecture

The Bot runs as an independent Dockerized Node.js service:

```text
XBoard Admin API
  -> Ticket Bot poller
  -> SQLite local state
  -> Telegraf / Telegram Bot API
  -> Admin private chat

Admin Telegram reply
  -> Ticket Bot update handler
  -> XBoard Admin API
  -> Ticket reply or close action
```

The Bot never runs inside the XBoard process. If Telegram, the Bot, or SQLite fails, XBoard continues running independently.

## Technology

- Node.js
- Telegraf
- SQLite
- Docker Compose
- Express health server
- Environment variable configuration

## Runtime Modes

If `BOT_PUBLIC_URL` is set, the Bot registers a Telegram webhook at:

```text
POST /telegram/webhook/:secret
```

If `BOT_PUBLIC_URL` is empty, the Bot uses Telegram long polling. This is the simplest private deployment mode.

## Environment Variables

Required:

```env
BOT_TOKEN=
TG_ADMIN_USER_ID=
XBOARD_BASE_URL=
XBOARD_API_SECRET=
BOT_WEBHOOK_SECRET=
```

Optional:

```env
BOT_PUBLIC_URL=
BOT_PORT=3000
DATABASE_PATH=/data/ticket-bot.sqlite
TIMEZONE=Asia/Shanghai
POLL_INTERVAL_SECONDS=30
XBOARD_ADMIN_PATH=admin
XBOARD_TICKET_FETCH_PATH=/api/v2/{admin_path}/ticket/fetch
XBOARD_TICKET_DETAIL_PATH=/api/v2/{admin_path}/ticket/fetch
XBOARD_TICKET_REPLY_PATH=/api/v2/{admin_path}/ticket/reply
XBOARD_TICKET_CLOSE_PATH=/api/v2/{admin_path}/ticket/close
```

The XBoard ticket paths are configurable because XBoard deployments may use a custom admin path or version-specific route details.

## Data Model

SQLite stores local Bot state only. XBoard remains the source of truth.

Tables:

- `tickets`: last seen ticket summary, status, reply count, updated time, and notification state.
- `message_links`: Telegram message ID to XBoard ticket ID mapping, used when the admin replies to a Bot notification.
- `events`: event deduplication keys for new ticket, new reply, and status change notifications.
- `meta`: runtime metadata such as last poll time.

## Polling Behavior

Every 30 seconds the Bot calls the XBoard ticket list API and compares the response with SQLite state.

It detects:

- New tickets.
- User reply count or update timestamp changes.
- Ticket status changes.

For each detected event, the Bot sends a private Telegram message to `TG_ADMIN_USER_ID` and records the resulting Telegram message ID so future Telegram replies can map back to the ticket.

The poller catches and logs errors. Failed polling cycles do not crash the process unless startup configuration is invalid.

## Telegram Commands

Only `TG_ADMIN_USER_ID` is allowed to interact with the Bot.

Commands:

- `/start`: show status and available commands.
- `/tickets`: show pending tickets.
- `/ticket <id>`: show ticket detail.
- `/reply <id> <content>`: reply to a ticket explicitly.
- `/close <id>`: close a ticket.
- `/health`: show Bot health summary.

Telegram normal reply flow:

1. Bot sends a ticket notification.
2. Admin uses Telegram reply on that Bot message.
3. Bot finds the ticket ID from `message_links`.
4. Bot calls XBoard reply API with the admin message text.
5. Bot confirms success or returns an error message privately.

## XBoard API Adapter

The XBoard adapter is isolated behind a small client module.

Default assumptions:

- XBoard API base is `XBOARD_BASE_URL`.
- Auth secret is sent using common API secret headers and bearer auth for compatibility.
- Ticket endpoints can be overridden with environment variables.

The adapter normalizes different plausible response shapes into internal ticket objects:

```text
id, subject, status, updated_at, created_at, user, reply_count, last_message
```

If a deployment returns different fields, only the adapter should need adjustment.

## HTTP Health

The service exposes:

```text
GET /healthz
```

The response includes:

- process status
- database status
- Telegram mode
- last poll time
- last poll error, if any

Docker healthcheck uses this endpoint.

## Docker Output

The project includes:

- `Dockerfile`
- `docker-compose.yml`
- `.env.example`
- `README.md`
- `src/` application source
- `data/.gitkeep` persistent SQLite mount placeholder

## Error Handling

- Startup fails fast on missing required environment variables.
- Polling errors are logged and exposed through `/healthz`.
- Telegram API errors are caught per notification where possible.
- XBoard reply and close failures are reported back to the admin in Telegram.
- Unauthorized Telegram users are ignored.

## Testing And Verification

Minimum verification:

- Install dependencies.
- Run lint or syntax checks.
- Start service locally with sample environment values where possible.
- Confirm `/healthz` responds.
- Confirm Docker image builds.

Live Telegram and XBoard flows require real credentials and should be verified after deployment.
