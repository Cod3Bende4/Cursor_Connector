/**
 * Simple timestamped logger with levels.
 */

const LEVELS = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };
const currentLevel = LEVELS[process.env.LOG_LEVEL?.toUpperCase()] ?? LEVELS.INFO;

function log(level, ...args) {
  if (LEVELS[level] < currentLevel) return;
  const ts = new Date().toISOString().replace('T', ' ').split('.')[0];
  const prefix = { DEBUG: '🔍', INFO: '📋', WARN: '⚠️ ', ERROR: '❌' }[level] || '';
  console.log(`[${ts}] ${prefix} [${level}]`, ...args);
}

module.exports = {
  debug: (...a) => log('DEBUG', ...a),
  info:  (...a) => log('INFO', ...a),
  warn:  (...a) => log('WARN', ...a),
  error: (...a) => log('ERROR', ...a),
};
