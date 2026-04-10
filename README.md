# Cursor Telegram Bridge 🤖↔️📱

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/Cod3Bende4/Cursor_Connector/blob/main/LICENSE)
[![Node.js 20+](https://img.shields.io/badge/node.js-20%2B-brightgreen)](https://nodejs.org/)

Control Cursor IDE from Telegram on your Mac. Send prompts, get responses, switch modes, manage projects — all from your phone.

**License:** [MIT](LICENSE) · **Contributing:** [CONTRIBUTING.md](CONTRIBUTING.md) · **Security:** [SECURITY.md](SECURITY.md) · **Code of conduct:** [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)

---

## How It Works

A local Node.js daemon runs alongside Cursor on your Mac. It:

- Connects to your personal Telegram bot
- Injects your messages into Cursor's chat panel via macOS accessibility APIs
- Captures Cursor's AI responses and sends them back to Telegram (replies are formatted as **Telegram HTML**: bold, inline code, fenced blocks, links)
- Monitors mode and polls an estimated context usage (bridge-side token heuristic)
- On startup, syncs mode once before the Telegram status widget so mode is less often stuck on “unknown”
- While waiting for a reply, can refresh a “thinking” line on Telegram with elapsed time, mode, and estimated context (optional; see `.env.example`)

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

## Keeping it running (constraints)

- **The Mac must stay on and awake.** The bridge is a normal local Node process. **Sleep** suspends it and breaks Telegram polling; **shutdown** stops it until you start it again. Only the **display** sleeping (with the Mac still awake) is fine. For 24/7 use, disable sleep or use an always-on Mac; restart the bridge after reboot (`pm2` / `node src/index.js` — see [Managing the Daemon](#managing-the-daemon)).
- **Select the right Agent chat in Cursor before using Telegram.** The bridge injects into **whichever chat thread is focused** in Cursor (⌘L focuses the panel, but not a specific thread). **`/project`** opens a workspace folder; it does **not** switch the highlighted chat in the Agent sidebar. If another project’s chat is selected, your Telegram messages will go **there**. After switching projects or opening a new chat, **click the intended chat** under the correct repo in Cursor’s sidebar, then send from Telegram.
- **Per-project rule for capture:** Strategy A needs `.cursor/rules/telegram-bridge.mdc` in **each** workspace you drive from Telegram (copy from this repo). Without it, capture often falls back to clipboard/AX.

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

> The Cursor rule (Strategy A) is the most reliable. Copy `telegram-bridge.mdc` into **every** project root you use with `/project` so capture keeps working after switching folders.

**Telegram formatting:** Outgoing messages use **`parse_mode: HTML`** (`src/telegram/formatter.js`) so bold, code, and links survive the trip to Telegram. The pinned status widget still uses MarkdownV2 for short, controlled text.

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
│   │   ├── applescriptUtil.js    # Shared AppleScript helpers
│   │   ├── modelPicker.js        # /setmodel (⌘/ model dropdown)
│   │   ├── newChat.js            # /newchat via Command Palette
│   │   ├── responseCapture.js    # Three-strategy response capture
│   │   └── skillsManager.js      # Skills prefix management
│   ├── telegram/
│   │   ├── bot.js                # Main bot + message loop
│   │   ├── commands.js           # /command handlers
│   │   ├── formatter.js          # HTML replies + status MarkdownV2 + chunking
│   │   └── progressUpdates.js    # Live “thinking” line while waiting
│   ├── monitor/
│   │   └── contextMonitor.js     # Mode + context polling + startup sync
│   └── utils/
│       ├── config.js             # Env var loader + validator
│       ├── modelsRegistry.js     # Optional models.json for /setmodel
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
├── models.json.example           # Optional aliases for /setmodel
├── projects.json                 # Project registry
├── ecosystem.config.js           # pm2 config
├── LICENSE                       # MIT
├── CONTRIBUTING.md               # How to contribute + branch policy
├── CODE_OF_CONDUCT.md            # Contributor Covenant
├── SECURITY.md                   # Vulnerability reporting
├── PLAN.md                       # Full implementation plan
└── README.md                     # This file
```

---

## Open source & branch rules

This repository is public and open to contributions under the [MIT License](LICENSE). Please read [CONTRIBUTING.md](CONTRIBUTING.md) for workflow and tests.

`main` is protected by a GitHub **ruleset** that requires **pull requests** for most contributors. The repository owner can bypass the rule when needed (personal repos cannot use the older “bypass list” API the same way; the ruleset approach achieves the same outcome).

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
- **Context % in the widget is a bridge estimate** — from Telegram↔Cursor traffic (chars → tokens), not Cursor’s internal meter; tune `CONTEXT_WINDOW_TOKENS_ESTIMATE` in `.env` if needed
- **Injection targets the focused chat** — not “the project you picked in Telegram” unless that chat is selected in Cursor (see [Keeping it running](#keeping-it-running-constraints))
- **Machine must be awake** — sleep or power-off stops the bridge; restart the process after reboot
- **Cannot access Cursor's file tree** from Telegram (out of scope for v1)

