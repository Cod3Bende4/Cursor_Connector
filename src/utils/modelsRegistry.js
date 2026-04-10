/**
 * Optional models.json — maps short aliases to search strings for /setmodel.
 */

const fs = require('fs');
const path = require('path');
const { config } = require('./config');

let cache = null;
let cachePath = null;

function loadModelsFile() {
  const configPath = path.resolve(config.models?.configPath || './models.json');
  if (!fs.existsSync(configPath)) {
    return { models: [] };
  }
  const raw = fs.readFileSync(configPath, 'utf8');
  const data = JSON.parse(raw);
  return { models: data.models || [] };
}

/**
 * @returns {{ id: string, search: string }[]}
 */
function getModelAliases() {
  const p = path.resolve(config.models?.configPath || './models.json');
  if (cache && cachePath === p) return cache;
  cachePath = p;
  try {
    const { models } = loadModelsFile();
    cache = models.map((m) => ({
      id: String(m.id || m.alias || '').toLowerCase(),
      search: m.search || m.label || m.id,
    })).filter((m) => m.id && m.search);
  } catch {
    cache = [];
  }
  return cache;
}

/**
 * Resolve user input to a picker search string.
 * @param {string} nameOrAlias
 * @returns {string}
 */
function resolveModelSearch(nameOrAlias) {
  const q = nameOrAlias.trim();
  if (!q) return q;
  const lower = q.toLowerCase();
  const aliases = getModelAliases();
  const hit = aliases.find((m) => m.id === lower);
  if (hit) return hit.search;
  return q;
}

function invalidateModelsCache() {
  cache = null;
  cachePath = null;
}

module.exports = { getModelAliases, resolveModelSearch, invalidateModelsCache };
