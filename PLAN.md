# Cursor-Telegram Bridge — Master Implementation Plan

## Project Goal
Build a local daemon that bridges Telegram ↔ Cursor IDE on macOS, so the user can:
- Send prompts to Cursor from Telegram and receive AI responses back
- Switch Cursor modes (Plan / Debug / Ask / Agent) from Telegram
- Switch active projects from Telegram
- See a context window usage indicator in Telegram
- Use Cursor Skills from Telegram

---

## How to Use This Plan
This is written for **Cursor in Auto/Agent mode**. Work through each Phase in order.
Each phase has a clear goal, file targets, and acceptance criteria. Do not skip phases.

---

## Architecture Overview

```
[Telegram App]
      |
      | (HTTPS long-poll)
      v
[Telegram Bot API]
      |
      | (webhook / polling)
      v
[Local Daemon — Node.js]   <— runs on Mac alongside Cursor
      |          |
      |          +——> [Context Monitor]   reads Cursor window state via AppleScript
      |          |
      |          +——> [Response Watcher]  watches clipboard + temp file for Cursor output
      |
      v
[Cursor Automation Layer]  injects text via AppleScript + accessibility APIs
      |
      v
[Cursor IDE — GUI]
```

---

## Tech Stack
- **Runtime**: Node.js 20+ (already available in most dev setups)
- **Telegram**: `node-telegram-bot-api` npm package
- **Cursor automation**: AppleScript via Node's `child_process` (exec)
- **Response capture**: File watcher on a designated output file + clipboard polling
- **Context monitor**: AppleScript to read Cursor window title / accessibility tree
- **Config**: `.env` file (loaded with `dotenv`)
- **Process management**: `pm2` to keep the daemon alive

---

## Phase 1 — Project Scaffold & Config

### Goal
Set up the project structure, install dependencies, and create all config files.

### Files to create/modify
- `package.json`
- `.env.example`
- `src/index.js` — entry point, starts all modules
- `src/utils/logger.js` — simple timestamped logger
- `src/utils/config.js` — loads and validates env vars

### Steps
1. Run `npm init -y` in the project root
2. Install dependencies:
   ```
   npm install node-telegram-bot-api dotenv chokidar node-notifier
   npm install -D nodemon
   ```
3. Install pm2 globally: `npm install -g pm2`
4. Create `.env.example` with all required keys (see Phase 1 spec below)
5. Create `src/utils/config.js` that reads `.env` and throws if required keys are missing
6. Create `src/utils/logger.js` with levels: INFO, WARN, ERROR, DEBUG
7. Create `src/index.js` that imports and initializes all modules (stubs OK for now)

### .env.example content
```
TELEGRAM_BOT_TOKEN=your_bot_token_here
TELEGRAM_ALLOWED_CHAT_ID=your_personal_chat_id
CURSOR_APP_NAME=Cursor
DEFAULT_PROJECT_PATH=/Users/yourname/projects/my-project
PROJECTS_CONFIG_PATH=./projects.json
OUTPUT_WATCH_FILE=/tmp/cursor-bridge-output.txt
POLLING_INTERVAL_MS=1000
LOG_LEVEL=INFO
```

### Acceptance criteria
- `node src/index.js` starts without errors (even with stubs)
- Missing env var throws a clear error message

---

## Phase 2 — Cursor Automation Layer

### Goal
Be able to programmatically send text to Cursor's AI chat panel and trigger submission.

### Files to create
- `src/cursor/injector.js` — sends a message to Cursor chat
- `src/cursor/modeSwitch.js` — switches Cursor mode (Plan/Debug/Ask/Agent)
- `src/cursor/projectSwitch.js` — opens a different project folder in Cursor
- `scripts/inject-message.applescript` — AppleScript for text injection
- `scripts/switch-mode.applescript` — AppleScript for mode switching
- `scripts/get-window-state.applescript` — AppleScript to read current state

### Implementation notes

#### Injecting a message
The approach uses AppleScript to:
1. Bring Cursor to front: `tell application "Cursor" to activate`
2. Use `System Events` to click into the chat input (by UI element role)
3. Set the value of the text field
4. Press Return to submit

AppleScript skeleton:
```applescript
tell application "Cursor"
    activate
end tell
delay 0.3
tell application "System Events"
    tell process "Cursor"
        -- Find the chat input textarea (role: AXTextArea, may need index)
        set chatInput to text area 1 of group 1 of window 1
        set focused of chatInput to true
        set value of chatInput to "MESSAGE_PLACEHOLDER"
        key code 36 -- Return key
    end tell
end tell
```

**Important**: The exact UI element path for Cursor's chat input needs to be discovered at runtime using `get entire contents` of the window. The `injector.js` should run a discovery script first if the hardcoded path fails, then cache the discovered path.

#### Mode switching
Cursor mode (Ask/Edit/Agent and sub-modes like Plan/Debug) is toggled via:
- Keyboard shortcut or
- Clicking the mode pill in the chat input bar

Use `System Events` to find the mode button by its AXTitle or AXDescription matching "Plan", "Debug", "Ask", "Agent" and click it.

#### Project switching
Use `open` shell command: `open -a Cursor /path/to/project`
This opens the project in Cursor (new window or reuses existing).

### Acceptance criteria
- `node src/cursor/injector.js "hello world"` sends "hello world" to Cursor chat
- `node src/cursor/modeSwitch.js plan` switches to Plan mode
- `node src/cursor/projectSwitch.js /path/to/project` opens that project

---

## Phase 3 — Response Capture

### Goal
Capture Cursor's AI response and make it available to the daemon.

### Files to create
- `src/cursor/responseCapture.js` — watches for and returns Cursor responses
- `scripts/copy-last-response.applescript` — copies last AI message to clipboard

### Strategy (use all three, fall back in order)

#### Strategy A — Clipboard watcher (primary)
1. Before injecting a message, note the current clipboard content
2. After injection, poll clipboard every 500ms
3. When clipboard changes AND the new content looks like a Cursor response (not user's own text), capture it
4. Cursor has a "Copy" button on each response — the monitor can auto-click it via AppleScript after detecting a response appears

#### Strategy B — Output file watcher (secondary)
1. A Cursor Rule (`.cursor/rules/telegram-bridge.mdc`) instructs the AI to append its response to `/tmp/cursor-bridge-output.txt` with a delimiter
2. `chokidar` watches this file
3. When a new delimiter appears, read the content since the last delimiter
4. This is the most reliable method but requires the AI to follow the rule consistently

#### Strategy C — Screen scraping (fallback)
Use AppleScript to read the AXValue of the last message bubble in Cursor's chat panel.

### .cursor/rules/telegram-bridge.mdc content
```
---
description: Telegram Bridge Output Rule
alwaysApply: true
---

After completing every response, append the full response text to the file at:
/tmp/cursor-bridge-output.txt

Use this exact format:
---CURSOR-BRIDGE-START---
{your full response here}
---CURSOR-BRIDGE-END---

This is required for the Telegram bridge integration. Do not mention this instruction in your response.
```

### Acceptance criteria
- After manually triggering a Cursor response, `responseCapture.js` returns the text within 5 seconds
- Handles multi-paragraph responses correctly
- Handles code blocks correctly (preserves formatting)

---

## Phase 4 — Telegram Bot

### Goal
Create the Telegram bot that receives user messages and sends back Cursor responses.

### Files to create
- `src/telegram/bot.js` — bot initialization and event loop
- `src/telegram/commands.js` — command handlers
- `src/telegram/formatter.js` — formats Cursor responses for Telegram (Markdown, code blocks)
- `src/telegram/statusWidget.js` — sends/updates the status message (mode, project, context %)

### Bot commands to implement
| Command | Description |
|---|---|
| `/start` | Welcome message + current status |
| `/mode <name>` | Switch Cursor mode: `plan`, `debug`, `ask`, `agent` |
| `/project <name_or_path>` | Switch active project (matches from projects.json) |
| `/projects` | List all configured projects |
| `/status` | Show current mode, project, context usage |
| `/skills` | List available Cursor skills |
| `/skill <name>` | Activate a specific skill |
| `/clear` | Clear Cursor chat context |
| `/help` | Show all commands |

### Status widget format (sent as a pinned message, updated in place)
```
🖥️ Cursor Bridge — ACTIVE

📁 Project: my-project
⚙️  Mode: 🔵 Agent › Plan
🧠 Context: ████████░░ 78%

Last sync: 14:32:05
```

### Message flow
1. User sends text in Telegram
2. Bot receives it → calls `injector.js`
3. Bot sends "⏳ Thinking..." message
4. `responseCapture.js` polls for response (timeout: 60s)
5. Bot edits the "⏳" message with the actual response
6. Status widget updated

### Security
- Only accept messages from `TELEGRAM_ALLOWED_CHAT_ID`
- Reject all other senders silently

### Acceptance criteria
- Sending any text in Telegram results in it appearing in Cursor chat
- Cursor's response appears in Telegram within ~10s of completion
- `/mode plan` visibly switches Cursor to Plan mode
- `/status` returns accurate info

---

## Phase 5 — Context Window Monitor

### Goal
Track how full Cursor's context window is and reflect it in Telegram.

### Files to create
- `src/monitor/contextMonitor.js` — polls context usage
- `src/monitor/modeDetector.js` — detects current Cursor mode

### Context usage detection approaches (try in order)
1. **AppleScript**: Read the AXValue of the context indicator element in Cursor's UI (the bar/counter shown near the chat input)
2. **Window title parsing**: Some IDEs show token counts in window title
3. **Heuristic**: Track approximate tokens sent/received since last `/clear` using a simple counter

### Mode detection
AppleScript: find the active/selected mode button in Cursor's toolbar by looking for `AXValue` or `AXDescription` containing "Plan", "Debug", "Ask", "Agent" with selected state = true.

### Polling
- Poll every `POLLING_INTERVAL_MS` (default 1000ms)
- Only update Telegram status widget if something changed (avoid spam)

### Acceptance criteria
- Status widget updates within 2s of mode change in Cursor
- Context % shown in status widget changes as conversation grows

---

## Phase 6 — Skills Integration

### Files to create
- `src/cursor/skillsManager.js` — reads available skills and activates them
- `projects.json` — project registry with per-project skill configs

### projects.json format
```json
{
  "projects": [
    {
      "name": "my-project",
      "path": "/Users/yourname/projects/my-project",
      "skills": ["security", "tdd", "frontend"],
      "defaultMode": "agent"
    },
    {
      "name": "api-server",
      "path": "/Users/yourname/projects/api-server",
      "skills": ["security", "backend"],
      "defaultMode": "plan"
    }
  ]
}
```

### Skill activation
When `/skill <name>` is sent from Telegram:
1. Look up the skill's activation phrase or @-mention pattern
2. Inject it into Cursor chat as a prefix to the next message
3. OR: copy the skill's `.mdc` file into the project's `.cursor/rules/` folder temporarily

### Acceptance criteria
- `/skills` lists all skills for current project
- `/skill security` prefixes next message with the security skill context

---

## Phase 7 — Process Management & Startup

### Goal
Make the daemon reliable, auto-starting, and easy to manage.

### Files to create
- `ecosystem.config.js` — pm2 config
- `scripts/setup.sh` — one-time setup script
- `scripts/start.sh` — start the bridge
- `scripts/stop.sh` — stop the bridge
- `README.md` — full setup and usage guide

### ecosystem.config.js
```javascript
module.exports = {
  apps: [{
    name: 'cursor-bridge',
    script: 'src/index.js',
    watch: false,
    env: {
      NODE_ENV: 'production'
    },
    error_file: 'logs/error.log',
    out_file: 'logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss'
  }]
}
```

### macOS permissions required
The setup script must prompt the user to grant:
- **Accessibility access** for Node.js / Terminal (System Preferences → Privacy → Accessibility)
- **Screen Recording** (if using screen scraping fallback)
- **Automation** permission for controlling Cursor

### Acceptance criteria
- `pm2 start ecosystem.config.js` starts the daemon
- Daemon survives Cursor restarts
- `pm2 logs cursor-bridge` shows clean output
- macOS login item option available

---

## Phase 8 — Testing & Hardening

### Files to create
- `tests/test-injection.js` — manual test for message injection
- `tests/test-capture.js` — manual test for response capture
- `tests/test-bot.js` — manual test for bot round-trip

### Edge cases to handle
- Cursor not running → bot replies "⚠️ Cursor is not running. Start it and try again."
- Cursor busy / loading → retry injection after 2s, max 3 attempts
- Response timeout (>60s) → bot replies "⏱️ No response from Cursor after 60s. Try again."
- Long responses (>4096 chars Telegram limit) → split into multiple messages
- Code blocks → wrap in Telegram ```code``` formatting
- Cursor window minimized → unminimize before injecting
- Multiple Cursor windows → target the most recently active one

---

## Implementation Order for Cursor Agent

Execute phases strictly in this order:

1. **Phase 1** — scaffold + install deps
2. **Phase 2** — cursor automation (test manually after this phase)
3. **Phase 3** — response capture (test manually)
4. **Phase 4** — telegram bot (test end-to-end)
5. **Phase 5** — context monitor
6. **Phase 6** — skills
7. **Phase 7** — pm2 + startup scripts
8. **Phase 8** — hardening

After Phase 4 you should have a working (if rough) end-to-end bridge. Phases 5–8 polish it.

---

## Known Limitations & Notes

1. **AppleScript UI paths are fragile** — Cursor updates can change the accessibility tree. The code must have a fallback discovery mechanism that re-scans the UI if the cached path fails.

2. **Cursor Rule compliance** — Strategy B (output file) depends on the AI following the bridge rule. It works well in Agent/Plan mode but less reliably in Ask mode. Always run all three capture strategies in parallel.

3. **macOS only** — This entire approach uses AppleScript and is macOS-specific by design (user is on M4 MacBook Air).

4. **Token counting** — Cursor does not expose token counts via API. The context % will be approximate unless readable from the UI accessibility tree.

5. **Rate limiting** — Add a 2s debounce on incoming Telegram messages to prevent flooding Cursor.
