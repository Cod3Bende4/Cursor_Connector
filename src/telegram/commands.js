/**
 * telegram/commands.js
 *
 * Handles all Telegram bot slash commands.
 */

const { switchMode, detectCurrentMode } = require('../cursor/modeSwitch');
const { switchProject, getCurrentProject, getAllProjects } = require('../cursor/projectSwitch');
const { activateSkill, getProjectSkills, getPendingSkill, clearPendingSkill, SKILL_DEFINITIONS } = require('../cursor/skillsManager');
const { monitor } = require('../monitor/contextMonitor');
const { formatStatusWidget } = require('./formatter');
const { injectMessage, isCursorRunning } = require('../cursor/injector');
const logger = require('../utils/logger');

/**
 * Register all commands on the bot instance.
 * @param {TelegramBot} bot
 * @param {object} statusWidget - { messageId, update() }
 */
function registerCommands(bot, chatId, statusWidget) {

  // /start
  bot.onText(/\/start/, async (msg) => {
    if (String(msg.chat.id) !== String(chatId)) return;
    const running = await isCursorRunning();
    const cursor = running ? '🟢 Running' : '🔴 Not running';
    await bot.sendMessage(chatId,
      `👋 *Cursor Telegram Bridge*\n\n` +
      `Cursor: ${cursor}\n\n` +
      `Just send any message to talk to Cursor\\.\n\n` +
      `*Commands:*\n` +
      `/mode plan|debug|ask|agent\n` +
      `/project \\<name\\>\n` +
      `/projects — list all\n` +
      `/skill \\<name\\>\n` +
      `/skills — list all\n` +
      `/status — current state\n` +
      `/clear — clear context\n` +
      `/help — this message`,
      { parse_mode: 'MarkdownV2' }
    );
  });

  // /help
  bot.onText(/\/help/, async (msg) => {
    if (String(msg.chat.id) !== String(chatId)) return;
    return bot.emit('text', { ...msg, text: '/start' }); // reuse /start
  });

  // /status
  bot.onText(/\/status/, async (msg) => {
    if (String(msg.chat.id) !== String(chatId)) return;
    try {
      const state = monitor.getState();
      const project = getCurrentProject();
      const pendingSkill = getPendingSkill();
      const text = formatStatusWidget({ ...state, project, pendingSkill });
      await bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
    } catch (err) {
      await bot.sendMessage(chatId, `⚠️ Status error: ${err.message}`);
    }
  });

  // /mode <name>
  bot.onText(/\/mode (.+)/, async (msg, match) => {
    if (String(msg.chat.id) !== String(chatId)) return;
    const mode = match[1].trim().toLowerCase();
    try {
      const result = await switchMode(mode);
      if (result.success) {
        await bot.sendMessage(chatId, `✅ Switched to *${mode}* mode`, { parse_mode: 'Markdown' });
        await statusWidget.update();
      } else {
        await bot.sendMessage(chatId,
          `⚠️ Could not auto-switch to "${mode}" mode\\.\n${result.hint || ''}`,
          { parse_mode: 'MarkdownV2' }
        );
      }
    } catch (err) {
      await bot.sendMessage(chatId, `❌ ${err.message}`);
    }
  });

  // /project <name>
  bot.onText(/\/project (.+)/, async (msg, match) => {
    if (String(msg.chat.id) !== String(chatId)) return;
    const name = match[1].trim();
    try {
      const result = await switchProject(name);
      await bot.sendMessage(chatId,
        `✅ Switched to *${result.project.displayName || result.project.name}*`,
        { parse_mode: 'Markdown' }
      );
      await statusWidget.update();
    } catch (err) {
      await bot.sendMessage(chatId, `❌ ${err.message}`);
    }
  });

  // /projects
  bot.onText(/\/projects$/, async (msg) => {
    if (String(msg.chat.id) !== String(chatId)) return;
    const projects = getAllProjects();
    if (projects.length === 0) {
      return bot.sendMessage(chatId, 'No projects configured. Edit projects.json and restart.');
    }
    const current = getCurrentProject();
    const lines = projects.map(p => {
      const active = current && p.name === current.name ? ' ← active' : '';
      return `${p.emoji || '📁'} \`${p.name}\`${active}`;
    });
    await bot.sendMessage(chatId,
      `*Configured Projects:*\n\n${lines.join('\n')}\n\nUse /project \\<name\\> to switch`,
      { parse_mode: 'MarkdownV2' }
    );
  });

  // /skill <name>
  bot.onText(/\/skill (.+)/, async (msg, match) => {
    if (String(msg.chat.id) !== String(chatId)) return;
    const name = match[1].trim();
    try {
      const skill = activateSkill(name);
      await bot.sendMessage(chatId,
        `${skill.emoji} *${skill.name}* skill activated for next message`,
        { parse_mode: 'Markdown' }
      );
    } catch (err) {
      await bot.sendMessage(chatId, `❌ ${err.message}`);
    }
  });

  // /skills
  bot.onText(/\/skills$/, async (msg) => {
    if (String(msg.chat.id) !== String(chatId)) return;
    const skills = getProjectSkills();
    const lines = skills.map(s => `${s.emoji} \`${Object.keys(SKILL_DEFINITIONS).find(k => SKILL_DEFINITIONS[k] === s)}\` — ${s.description}`);
    await bot.sendMessage(chatId,
      `*Available Skills:*\n\n${lines.join('\n')}\n\nUse /skill \\<name\\> to activate for next message`,
      { parse_mode: 'MarkdownV2' }
    );
  });

  // /clear
  bot.onText(/\/clear/, async (msg) => {
    if (String(msg.chat.id) !== String(chatId)) return;
    try {
      // Inject a "new conversation" command or use keyboard shortcut
      // Cursor's new chat: Cmd+L (opens new chat)
      const { execFile } = require('child_process');
      await new Promise((res, rej) => {
        execFile('osascript', ['-e', `
          tell application "System Events"
            tell process "Cursor"
              keystroke "l" using command down
            end tell
          end tell
        `], (err) => err ? rej(err) : res());
      });
      monitor.resetTokens();
      clearPendingSkill();
      await bot.sendMessage(chatId, '🧹 Context cleared \\(new chat opened in Cursor\\)', { parse_mode: 'MarkdownV2' });
      await statusWidget.update();
    } catch (err) {
      await bot.sendMessage(chatId, `❌ Could not clear context: ${err.message}`);
    }
  });

}

module.exports = { registerCommands };
