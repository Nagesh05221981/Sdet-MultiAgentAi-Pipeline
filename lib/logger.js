/**
 * Structured pipeline logger.
 * Prefixes every message with a timestamp and stage tag.
 */

const STAGE_COLORS = {
  INIT: '\x1b[36m',    // cyan
  STORY: '\x1b[35m',   // magenta
  DESIGN: '\x1b[34m',  // blue
  GENERATE: '\x1b[33m', // yellow
  VALIDATE: '\x1b[32m', // green
  RUN: '\x1b[31m',     // red
  FIX: '\x1b[91m',     // bright red
  DONE: '\x1b[92m',    // bright green
  ERROR: '\x1b[41m',   // red bg
};
const RESET = '\x1b[0m';

function timestamp() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

export function log(stage, message, data) {
  const color = STAGE_COLORS[stage] || '';
  const prefix = `${color}[${timestamp()}] [${stage}]${RESET}`;
  if (data !== undefined) {
    console.log(`${prefix} ${message}`, typeof data === 'string' ? data : JSON.stringify(data, null, 2));
  } else {
    console.log(`${prefix} ${message}`);
  }
}

export function logError(stage, message, error) {
  const prefix = `${STAGE_COLORS.ERROR}[${timestamp()}] [${stage}]${RESET}`;
  console.error(`${prefix} ${message}`, error?.message || error || '');
}
