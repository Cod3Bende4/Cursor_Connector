/**
 * cursor/skillsManager.js
 *
 * Manages Cursor skills for the active project.
 * Skills can be activated by:
 *   1. Prepending a skill prompt prefix to the next message
 *   2. Copying the skill's .mdc rule into .cursor/rules/ temporarily
 */

const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');
const { getCurrentProject } = require('./projectSwitch');

// Built-in skill definitions
// Expand these with your actual ~/.gemini/rules/ or .cursor/rules/ content
const SKILL_DEFINITIONS = {
  security: {
    name: 'Security',
    emoji: '🔐',
    description: 'OWASP-aware secure coding, input validation, threat modeling',
    prefix: '[SECURITY MODE] Review and implement with security best practices: OWASP Top 10, input validation, output encoding, least privilege, secure defaults.',
  },
  tdd: {
    name: 'TDD',
    emoji: '🧪',
    description: 'Test-driven development, write tests first',
    prefix: '[TDD MODE] Follow test-driven development: write failing tests first, then implement the minimum code to pass, then refactor.',
  },
  frontend: {
    name: 'Frontend',
    emoji: '🎨',
    description: 'UI/UX, accessibility, responsive design',
    prefix: '[FRONTEND MODE] Focus on clean UI, accessibility (WCAG AA), responsive design, and minimal bundle size.',
  },
  backend: {
    name: 'Backend',
    emoji: '⚙️',
    description: 'API design, performance, database patterns',
    prefix: '[BACKEND MODE] Focus on RESTful API design, database efficiency, error handling, and scalability.',
  },
  review: {
    name: 'Code Review',
    emoji: '👁️',
    description: 'Thorough code review with actionable feedback',
    prefix: '[REVIEW MODE] Perform a thorough code review: identify bugs, security issues, performance problems, and style inconsistencies. Be specific and actionable.',
  },
  docs: {
    name: 'Documentation',
    emoji: '📝',
    description: 'Write clear docs, JSDoc, README content',
    prefix: '[DOCS MODE] Write clear, comprehensive documentation: JSDoc comments, README sections, API docs. Explain the why, not just the what.',
  },
};

// Currently active skill for the next message (one-shot)
let pendingSkill = null;

/**
 * Get skills available for the current project.
 */
function getProjectSkills() {
  const project = getCurrentProject();
  if (!project || !project.skills) return Object.values(SKILL_DEFINITIONS);

  return project.skills
    .map(name => SKILL_DEFINITIONS[name.toLowerCase()])
    .filter(Boolean);
}

/**
 * Get all available skills regardless of project.
 */
function getAllSkills() {
  return Object.values(SKILL_DEFINITIONS);
}

/**
 * Look up a skill by name (case-insensitive partial match).
 */
function findSkill(name) {
  const query = name.toLowerCase();
  return Object.values(SKILL_DEFINITIONS).find(s =>
    s.name.toLowerCase().includes(query) ||
    Object.keys(SKILL_DEFINITIONS).find(k => k.includes(query) && SKILL_DEFINITIONS[k] === s)
  );
}

/**
 * Set the pending skill (applies to the NEXT message only).
 * @param {string} skillName
 */
function activateSkill(skillName) {
  const skill = findSkill(skillName);
  if (!skill) {
    const available = Object.keys(SKILL_DEFINITIONS).join(', ');
    throw new Error(`Skill "${skillName}" not found. Available: ${available}`);
  }
  pendingSkill = skill;
  logger.info(`Skill activated (next message): ${skill.name}`);
  return skill;
}

/**
 * Apply the pending skill prefix to a message, then clear the pending skill.
 * @param {string} message
 * @returns {string} message with skill prefix if one is active
 */
function applyPendingSkill(message) {
  if (!pendingSkill) return message;
  const prefixed = `${pendingSkill.prefix}\n\n${message}`;
  logger.debug(`Applied skill "${pendingSkill.name}" to message`);
  pendingSkill = null;
  return prefixed;
}

/**
 * Get current pending skill (if any).
 */
function getPendingSkill() {
  return pendingSkill;
}

/**
 * Clear pending skill.
 */
function clearPendingSkill() {
  pendingSkill = null;
}

module.exports = {
  getProjectSkills,
  getAllSkills,
  findSkill,
  activateSkill,
  applyPendingSkill,
  getPendingSkill,
  clearPendingSkill,
  SKILL_DEFINITIONS,
};
