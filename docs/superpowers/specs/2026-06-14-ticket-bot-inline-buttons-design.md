# Ticket Bot Inline Buttons Design

## Goal

Make the Telegram ticket bot usable without requiring the administrator to know or manually type ticket IDs.

## Behavior

- New ticket and user reply notifications include inline buttons.
- `/tickets` returns a short ticket list with per-ticket buttons.
- `/ticket <id>` remains available as a fallback command.
- The administrator can still reply directly to a bot notification message. The bot maps that Telegram message to the XBoard ticket ID.

## Buttons

Each ticket notification/detail should include:

- `查看详情`: fetch and display the latest ticket detail.
- `关闭工单`: show a confirmation prompt before closing.
- `复制回复命令`: send `/reply <id> ` as a helper message so the admin can type after it.

Close confirmation includes:

- `确认关闭`
- `取消`

## Safety

- Only `TG_ADMIN_USER_ID` can trigger callbacks.
- Close action requires confirmation.
- Existing command flow remains as a fallback.
