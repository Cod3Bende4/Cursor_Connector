# Cursor Telegram Bridge 🤖↔️📱

Control Cursor IDE from Telegram on your Mac. Send prompts, get responses, switch modes, manage projects — all from your phone.

---

## How It Works

A local Node.js daemon runs alongside Cursor on your Mac. It:

- Connects to your personal Telegram bot
- Injects your messages into Cursor's chat panel via macOS accessibility APIs
- Captures Cursor's AI responses and sends them back to Telegram
- Monitors mode and context window state in real time

```
[Telegram]  ←→  [Local Daemon]  ←→  [Cursor IDE]
```

---

## Prerequisites

- macOS (Apple Silicon or Intel)
- Node.js 20+
- Cursor installed
- A Telegram account

---

## Setup (One Time)

### Step 1 — Create a Telegram Bot

1. Open Telegram, search for **@BotFather**
2. Send `/newbot` and follow the prompts
3. Copy the bot token (looks like `123456:ABCdef...`)
4. Start a chat with your new bot
5. Get your chat ID: message **@userinfobot** — it will reply with your ID

### Step 2 — Install & Configure

```bash
# In the project folder:
bash scripts/setup.sh
```

Edit `.env`:

```
TELEGRAM_BOT_TOKEN=your_token_from_botfather
TELEGRAM_ALLOWED_CHAT_ID=your_chat_id_from_userinfobot
```

Edit `projects.json` — add your real project paths:

```json
{
  "projects": [
    {
      "name": "my-app",
      "displayName": "My App",
      "path": "/Users/rishabh/projects/my-app",
      "skills": ["security", "tdd"],
      "defaultMode": "agent",
      "emoji": "🚀"
    }
  ]
}
```

### Step 3 — Grant macOS Permissions

Go to **System Settings → Privacy & Security → Accessibility**
→ Enable your terminal app (WezTerm, Terminal, iTerm2, etc.)

This is required for the automation to control Cursor's UI.

### Step 4 — Run the AX Discovery Script

This finds the correct UI element paths for your version of Cursor:

```bash
# Make sure Cursor is open with chat panel visible (Cmd+L)
node scripts/discover-ax-paths.js
```

Look at the output — if the text areas and mode buttons are found, you're good.
If paths differ from what's hardcoded, update `src/cursor/injector.js` and `src/cursor/modeSwitch.js`.

### Step 5 — Test Each Component

```bash
# Test message injection (Cursor must be open)
node tests/test-injection.js "Hello from bridge!"

# Test response capture (send a message in Cursor manually after running this)
node tests/test-capture.js

# Full round-trip test
node tests/test-bot.js "Say exactly: test successful."
```

### Step 6 — Start the Bridge

```bash
bash scripts/start.sh
```

Then open Telegram, send any message to your bot, and watch it appear in Cursor.

---

## Telegram Commands


| Command           | Description                              |
| ----------------- | ---------------------------------------- |
| `/start`          | Welcome + current status                 |
| `/status`         | Show mode, project, context %            |
| `/mode plan`      | Switch to Plan mode                      |
| `/mode debug`     | Switch to Debug mode                     |
| `/mode ask`       | Switch to Ask mode                       |
| `/mode agent`     | Switch to Agent mode                     |
| `/project <name>` | Switch active project                    |
| `/projects`       | List all configured projects             |
| `/skill security` | Apply Security skill to next message     |
| `/skill tdd`      | Apply TDD skill to next message          |
| `/skills`         | List all available skills                |
| `/setmodel <q>`   | Open model picker (⌘/) and filter by `q` |
| `/models`         | List aliases from optional `models.json` |
| `/newchat` / `/chatnew` | New AI chat (runs command `aichat.newchataction` by default) |
| `/clear`          | Same as `/newchat` + reset context %    |
| `/help`           | Show all commands                        |


---

## Status Widget

A pinned message in your Telegram chat shows live state:

```
🖥️ Cursor Bridge — ACTIVE

🚀 My App
⚙️ Mode: 📋 Plan
🧠 Context: ████████░░ 78.0% (~78.0k tok bridge est.)

Last sync: 14:32:05
```

The **context** line is a **bridge estimate** (characters sent/received via Telegram, mapped to tokens)—not Cursor’s internal counter. Small chats can look like a low % until enough volume accumulates; adjust `CONTEXT_WINDOW_TOKENS_ESTIMATE` in `.env` if your model uses a larger window (e.g. `200000`).

---

## Response Capture — Three Strategies

The bridge uses three parallel capture methods and returns the first one that succeeds:

**Strategy A — Output file (recommended)**
The `.cursor/rules/telegram-bridge.mdc` rule tells Cursor AI to append its response to `/tmp/cursor-bridge-output.txt`. This is watched with `chokidar`. Works reliably in Agent/Plan modes.

**Strategy B — Clipboard**
Polls the clipboard for changes after injection. Catches responses when Cursor's copy button is clicked, or if you copy text manually.

**Strategy C — Accessibility tree**
Reads Cursor's chat panel text areas directly via AppleScript. Used as a last resort.

> The Cursor rule (Strategy A) is the most reliable. Ensure `.cursor/rules/telegram-bridge.mdc` is present in your project root.

---

## Managing the Daemon

```bash
# Start
bash scripts/start.sh

# Stop
bash scripts/stop.sh

# View live logs
pm2 logs cursor-bridge

# Restart after config change
pm2 restart cursor-bridge

# Auto-start on login
pm2 startup
pm2 save
```

---

## Troubleshooting

**Messages not appearing in Cursor**

- Check Accessibility permission: System Settings → Privacy → Accessibility
- Run `node scripts/discover-ax-paths.js` to verify element paths
- Check `pm2 logs cursor-bridge` for errors
- Make sure Cursor's chat panel is open (`Cmd+L`)

**No response coming back to Telegram**

- Check the `.cursor/rules/telegram-bridge.mdc` rule is in your project
- Verify `/tmp/cursor-bridge-output.txt` exists and is writable: `ls -la /tmp/cursor-bridge-output.txt`
- Run `node tests/test-capture.js` and manually submit a message in Cursor

**Wrong mode button paths after Cursor update**

- Re-run `node scripts/discover-ax-paths.js`
- Update `MODE_SHORTCUTS` and `clickElementByLabel` paths in `src/cursor/modeSwitch.js`

**"Cursor is not running" even when it is**

- Check `CURSOR_APP_NAME` in `.env` matches the exact app name (check Activity Monitor)

**/newchat or /clear opens the palette but does not start a new chat**

- The bridge pastes `NEW_CHAT_PALETTE_QUERY` into the Command Palette (default `aichat.newchataction`). Typing plain English like “New Chat” often highlights the wrong command (e.g. New File).
- In Cursor, press **⌘⇧P**, type `aichat` or `new chat`, and note the **exact** label of the command you want. Set `NEW_CHAT_PALETTE_QUERY` in `.env` to that string or to the command id Cursor shows.
- Optional fallbacks: `NEW_CHAT_PALETTE_ALTERNATES=workbench.action.chat.newChat` (comma- or pipe-separated).
- Set `NEW_CHAT_FOCUS_CHAT_FIRST=false` if **⌘L** before the command interferes with your layout.

---

## Project Structure

```
cursor-telegram-bridge/
├── src/
│   ├── index.js                  # Entry point
│   ├── cursor/
│   │   ├── injector.js           # AppleScript message injection
│   │   ├── modeSwitch.js         # Mode switching (Ask/Agent/Plan/Debug)
│   │   ├── projectSwitch.js      # Project switching
│   │   ├── newChat.js            # New chat via Command Palette
│   │   ├── responseCapture.js    # Three-strategy response capture
│   │   └── skillsManager.js      # Skills prefix management
│   ├── telegram/
│   │   ├── bot.js                # Main bot + message loop
│   │   ├── commands.js           # /command handlers
│   │   └── formatter.js          # Markdown formatting + chunking
│   ├── monitor/
│   │   └── contextMonitor.js     # Mode + context polling
│   └── utils/
│       ├── config.js             # Env var loader + validator
│       └── logger.js             # Timestamped logger
├── scripts/
│   ├── setup.sh                  # One-time setup
│   ├── start.sh                  # Start via pm2
│   ├── stop.sh                   # Stop via pm2
│   └── discover-ax-paths.js      # AX element discovery tool
├── tests/
│   ├── test-injection.js         # Manual injection test
│   ├── test-capture.js           # Manual capture test
│   └── test-bot.js               # Full round-trip test
├── .cursor/
│   └── rules/
│       └── telegram-bridge.mdc   # Cursor rule for response output
├── .env.example                  # Config template
├── projects.json                 # Project registry
├── ecosystem.config.js           # pm2 config
├── PLAN.md                       # Full implementation plan
└── README.md                     # This file
```

---

## Security Notes

- Only messages from `TELEGRAM_ALLOWED_CHAT_ID` are processed — all others are silently ignored
- The bot token and chat ID are never logged
- The bridge runs entirely locally — no cloud relay, no third-party servers
- All Cursor API access is via local macOS accessibility APIs

---

## Known Limitations

- **macOS only** — uses AppleScript/accessibility APIs
- **AX paths are version-sensitive** — Cursor UI updates may require path updates in `injector.js` and `modeSwitch.js`
- **Strategy A requires AI compliance** — the Cursor rule must be followed by the AI; works best in Agent mode
- **Context % is approximate** — based on character counting unless readable from Cursor's UI
- **Cannot access Cursor's file tree** from Telegram (out of scope for v1)

