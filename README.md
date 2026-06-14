# XBoard 工单 Telegram Bot 部署教程

这是一个独立部署的私人 Telegram Bot，用于对接 XBoard 工单系统。

Bot 不修改 XBoard 主站代码，也不运行在 XBoard 主进程里。Telegram、Bot 或本地 SQLite 出错时，不会影响 XBoard 主站运行。

## 一、推荐部署方式

在新服务器上执行下面的一键准备命令：

```bash
curl -fsSL https://raw.githubusercontent.com/JackHONGhy/xboard-ticket-telegram-bot/main/install.sh | bash
```

这个命令会自动完成：

- 安装或检查 Git、Docker、Docker Compose。
- 创建目录 `/opt/xboard-ticket-telegram-bot`。
- 从 GitHub 拉取项目代码。
- 根据 `.env.example` 生成 `.env` 文件。

它不会询问配置，也不会自动填写你的 Telegram Token 或 XBoard Token。你需要自己编辑 `.env` 后再编译启动。

## 二、编辑 `.env`

进入项目目录：

```bash
cd /opt/xboard-ticket-telegram-bot
```

编辑 `.env`：

```bash
nano .env
```

至少填写这些配置：

```env
BOT_TOKEN=你的_Telegram_Bot_Token
TG_ADMIN_USER_ID=你的_Telegram_数字用户_ID

XBOARD_BASE_URL=https://你的-xboard-域名
XBOARD_ADMIN_PATH=你的-xboard-后台路径

XBOARD_AUTH_TYPE=bearer
XBOARD_AUTH_TOKEN=你的_XBoard_管理员_Token
XBOARD_API_SECRET=

BOT_WEBHOOK_SECRET=
BOT_PUBLIC_URL=
BOT_PORT=3000
DATABASE_PATH=/data/ticket-bot.sqlite
TIMEZONE=Asia/Shanghai
POLL_INTERVAL_SECONDS=30
```

说明：

- `BOT_TOKEN`：从 Telegram BotFather 获取。
- `TG_ADMIN_USER_ID`：你的 Telegram 数字用户 ID，不是用户名。
- `XBOARD_BASE_URL`：XBoard 主站地址，例如 `https://xboard.example.com`。
- `XBOARD_ADMIN_PATH`：XBoard 后台路径，不要带 `/`。
- `XBOARD_AUTH_TOKEN`：XBoard 管理端接口使用的管理员 Token。
- `BOT_PUBLIC_URL`：默认留空，使用 Telegram long polling。
- `POLL_INTERVAL_SECONDS=30`：每 30 秒轮询一次 XBoard 工单接口。

## 三、编译并启动

确认 `.env` 已经填写完成后执行：

```bash
docker compose up -d --build
```

查看容器状态：

```bash
docker compose ps
```

查看日志：

```bash
docker compose logs -f
```

## 四、健康检查

```bash
curl http://127.0.0.1:3000/healthz
```

正常会返回类似：

```json
{
  "ok": true,
  "service": "xboard-ticket-bot"
}
```

## 五、XBoard 工单接口路径

默认路径：

```env
XBOARD_TICKET_FETCH_PATH=/api/v2/{admin_path}/ticket/fetch
XBOARD_TICKET_DETAIL_PATH=/api/v2/{admin_path}/ticket/fetch
XBOARD_TICKET_REPLY_PATH=/api/v2/{admin_path}/ticket/reply
XBOARD_TICKET_CLOSE_PATH=/api/v2/{admin_path}/ticket/close
```

`{admin_path}` 会自动替换为 `XBOARD_ADMIN_PATH`。

如果你的 XBoard 接口路径不同，直接在 `.env` 里覆盖：

```env
XBOARD_TICKET_FETCH_PATH=/api/v2/你的后台路径/ticket/fetch
XBOARD_TICKET_REPLY_PATH=/api/v2/你的后台路径/ticket/reply
```

请求方法也可以覆盖：

```env
XBOARD_TICKET_FETCH_METHOD=GET
XBOARD_TICKET_DETAIL_METHOD=GET
XBOARD_TICKET_REPLY_METHOD=POST
XBOARD_TICKET_CLOSE_METHOD=POST
```

## 六、Telegram 使用命令

Bot 只允许 `TG_ADMIN_USER_ID` 对应的账号使用。

```text
/start
/help
/tickets
/ticket <id>
/reply <id> <内容>
/close <id>
/health
```

你也可以直接回复 Bot 发来的某条工单通知，Bot 会把回复写回对应 XBoard 工单。

## 七、调试 XBoard 接口

如果 Bot 不能拉取工单，可以在项目目录执行：

```bash
npm install
npm run debug:xboard
```

这个命令会读取 `.env`，请求 XBoard 工单列表接口，并输出接口返回结构摘要，方便判断路径或认证是否正确。

Docker 部署本身不需要手动安装 Node.js。只有调试 XBoard 接口时才需要在服务器上执行 `npm install`。

## 八、更新

```bash
cd /opt/xboard-ticket-telegram-bot
git pull
docker compose up -d --build
```

## 九、停止

```bash
cd /opt/xboard-ticket-telegram-bot
docker compose down
```

## 十、重启

```bash
cd /opt/xboard-ticket-telegram-bot
docker compose restart
```

## 十一、数据持久化

Docker Compose 默认挂载：

```text
./data:/data
```

SQLite 数据库默认路径：

```text
/data/ticket-bot.sqlite
```

这个数据库只保存 Bot 本地状态，XBoard 仍然是工单数据源。

## 十二、首次运行提醒

首次运行时，Bot 本地没有历史快照。XBoard 工单列表接口返回的已有工单，可能会被识别为新工单并通知一次。

后续轮询会通过 SQLite 自动去重。
