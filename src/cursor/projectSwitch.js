/**
 * cursor/projectSwitch.js
 *
 * Switches the active project in Cursor by opening a folder.
 * Reads available projects from projects.json.
 */

const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');
const { config } = require('../utils/config');

let currentProject = null;

/**
 * Load the projects registry.
 */
function loadProjects() {
  const configPath = path.resolve(config.projects.configPath);
  if (!fs.existsSync(configPath)) {
    throw new Error(`projects.json not found at ${configPath}. Copy and edit the template.`);
  }
  const data = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  return data.projects || [];
}

/**
 * Find a project by name (case-insensitive partial match) or exact path.
 */
function findProject(nameOrPath) {
  const projects = loadProjects();
  const query = nameOrPath.toLowerCase();

  // Exact path match
  const byPath = projects.find(p => p.path === nameOrPath);
  if (byPath) return byPath;

  // Name match (partial OK)
  const byName = projects.find(p =>
    p.name.toLowerCase().includes(query) ||
    (p.displayName || '').toLowerCase().includes(query)
  );
  return byName || null;
}

/**
 * Open a project folder in Cursor.
 * Uses `open -a Cursor /path` which works on macOS.
 */
function openProjectInCursor(projectPath) {
  return new Promise((resolve, reject) => {
    execFile('open', ['-a', config.cursor.appName, projectPath], (err, stdout, stderr) => {
      if (err) return reject(new Error(stderr || err.message));
      resolve(stdout);
    });
  });
}

/**
 * Switch to a project by name or path.
 * @param {string} nameOrPath
 * @returns {{ success: boolean, project: object }}
 */
async function switchProject(nameOrPath) {
  const project = findProject(nameOrPath);

  if (!project) {
    const all = loadProjects().map(p => `"${p.name}"`).join(', ');
    throw new Error(`Project "${nameOrPath}" not found. Available: ${all}`);
  }

  if (!fs.existsSync(project.path)) {
    throw new Error(`Project path does not exist: ${project.path}`);
  }

  await openProjectInCursor(project.path);
  currentProject = project;
  logger.info(`Switched to project: ${project.name} (${project.path})`);

  return { success: true, project };
}

/**
 * Get the currently active project.
 */
function getCurrentProject() {
  if (currentProject) return currentProject;

  // Try to load default from config
  const projects = loadProjects();
  const defaultName = config.projects.defaultName;
  if (defaultName) {
    const found = projects.find(p => p.name === defaultName);
    if (found) {
      currentProject = found;
      return found;
    }
  }
  return projects[0] || null;
}

/**
 * Get all configured projects.
 */
function getAllProjects() {
  return loadProjects();
}

// Test runner
if (require.main === module) {
  const nameOrPath = process.argv[2];
  if (!nameOrPath) {
    console.log('Available projects:', loadProjects().map(p => p.name));
    process.exit(0);
  }
  switchProject(nameOrPath)
    .then(r => { console.log('Switched:', r.project.name); process.exit(0); })
    .catch(e => { console.error('Failed:', e.message); process.exit(1); });
}

module.exports = { switchProject, getCurrentProject, getAllProjects, findProject };
