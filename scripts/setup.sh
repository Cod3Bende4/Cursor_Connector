#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Cursor Telegram Bridge — Setup Script
# Run once after cloning: bash scripts/setup.sh
# ─────────────────────────────────────────────────────────────────────────────

set -e

BOLD="\033[1m"
GREEN="\033[32m"
YELLOW="\033[33m"
RED="\033[31m"
RESET="\033[0m"

info()    { echo -e "${GREEN}✅ $1${RESET}"; }
warn()    { echo -e "${YELLOW}⚠️  $1${RESET}"; }
error()   { echo -e "${RED}❌ $1${RESET}"; exit 1; }
heading() { echo -e "\n${BOLD}── $1 ──${RESET}"; }

echo -e "${BOLD}"
echo "╔══════════════════════════════════════╗"
echo "║   Cursor Telegram Bridge — Setup     ║"
echo "╚══════════════════════════════════════╝"
echo -e "${RESET}"

# ── 1. Check macOS ─────────────────────────────────────────────────────────
heading "Checking system"
[[ "$(uname)" == "Darwin" ]] || error "This project is macOS only."
info "macOS detected"

# ── 2. Check Node.js ───────────────────────────────────────────────────────
if ! command -v node &>/dev/null; then
  error "Node.js not found. Install it via: brew install node"
fi
NODE_VERSION=$(node --version | sed 's/v//' | cut -d. -f1)
[[ "$NODE_VERSION" -ge 20 ]] || error "Node.js 20+ required. Current: $(node --version)"
info "Node.js $(node --version)"

# ── 3. Install dependencies ────────────────────────────────────────────────
heading "Installing npm dependencies"
npm install
info "npm dependencies installed"

# ── 4. Install pm2 ────────────────────────────────────────────────────────
heading "Installing pm2"
if ! command -v pm2 &>/dev/null; then
  npm install -g pm2
  info "pm2 installed globally"
else
  info "pm2 already installed ($(pm2 --version))"
fi

# ── 5. Create .env ─────────────────────────────────────────────────────────
heading "Environment configuration"
if [[ ! -f .env ]]; then
  cp .env.example .env
  warn ".env created from template. You MUST edit it before starting."
  echo ""
  echo "  Required values to fill in:"
  echo "    TELEGRAM_BOT_TOKEN     — get from @BotFather on Telegram"
  echo "    TELEGRAM_ALLOWED_CHAT_ID — get from @userinfobot on Telegram"
  echo ""
  echo "  Then edit projects.json to add your project paths."
  echo ""
else
  info ".env already exists"
fi

# ── 6. Create output watch file ────────────────────────────────────────────
heading "Creating runtime files"
touch /tmp/cursor-bridge-output.txt
info "Output watch file created at /tmp/cursor-bridge-output.txt"

mkdir -p logs
info "logs/ directory ready"

# ── 7. Copy Cursor rule into current project ───────────────────────────────
heading "Cursor rule"
RULE_SRC=".cursor/rules/telegram-bridge.mdc"
if [[ -f "$RULE_SRC" ]]; then
  info "Cursor rule present at $RULE_SRC"
  echo "  → This rule tells Cursor AI to append responses to the watch file."
  echo "  → It will be picked up automatically when you open this project in Cursor."
else
  warn "Cursor rule not found. It should be at $RULE_SRC"
fi

# ── 8. macOS permissions ───────────────────────────────────────────────────
heading "macOS Permissions Required"
echo ""
echo -e "${YELLOW}You must grant two macOS permissions for automation to work:${RESET}"
echo ""
echo "  1. Accessibility access for Terminal (or iTerm2/WezTerm):"
echo "     System Settings → Privacy & Security → Accessibility"
echo "     → Enable your terminal app"
echo ""
echo "  2. Automation permission (will be requested automatically"
echo "     the first time you run the bridge)"
echo ""
echo "  To open Privacy settings now:"
read -p "  Open System Settings → Privacy now? [y/N] " OPEN_PRIV
if [[ "$OPEN_PRIV" == "y" || "$OPEN_PRIV" == "Y" ]]; then
  open "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility"
fi

# ── 9. Summary ─────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}${GREEN}Setup complete!${RESET}"
echo ""
echo "Next steps:"
echo "  1. Edit .env  (TELEGRAM_BOT_TOKEN and TELEGRAM_ALLOWED_CHAT_ID)"
echo "  2. Edit projects.json  (add your actual project paths)"
echo "  3. Open your project in Cursor"
echo "  4. Run: bash scripts/start.sh"
echo ""
echo "To test individual components first:"
echo "  node src/cursor/injector.js \"Hello from bridge!\""
echo "  node src/cursor/modeSwitch.js ask"
echo "  node src/cursor/responseCapture.js"
echo ""
