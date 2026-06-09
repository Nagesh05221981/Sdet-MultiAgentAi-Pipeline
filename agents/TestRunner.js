import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { classifyFailure } from '../tools/read_failure_log.js';
import { PIPELINE } from '../config/pipeline.config.js';
import { log, logError } from '../lib/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');

/**
 * TestRunner — Agent 3
 * Spawns Cypress, captures output, classifies failures.
 * No LLM — pure Node.js child process.
 */

/**
 * Run Cypress specs.
 * @param {string} specPattern - Glob or file path for specs
 * @returns {object} { passed: boolean, specs: {passed:[], failed:[]}, stdout, failures: [] }
 */
export async function runCypressSpecs(specPattern = 'cypress/e2e/**/*.cy.js') {
  log('RUN', `Running Cypress: ${specPattern}`);

  // Clean previous results — overwrite each run to save storage
  const resultsDir = path.resolve(PROJECT_ROOT, 'cypress/results');
  await fs.rm(resultsDir, { recursive: true, force: true });

  return new Promise(async (resolve) => {
    const args = ['cypress', 'run', '--spec', specPattern];
    const proc = spawn('npx', args, {
      cwd: PROJECT_ROOT,
      env: { ...process.env, FORCE_COLOR: '0' },
      timeout: PIPELINE.cypressTimeout,
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      const text = data.toString();
      stdout += text;
      process.stdout.write(text);
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', async (code) => {
      const allPassed = code === 0;

      if (allPassed) {
        log('RUN', 'All Cypress tests PASSED');
        resolve({
          passed: true,
          specs: { passed: [specPattern], failed: [] },
          stdout,
          failures: [],
        });
        return;
      }

      // Parse failures from stdout
      const failures = parseFailures(stdout);

      // Write failure log
      const failureLog = extractFailureSection(stdout);
      await fs.writeFile(
        path.resolve(PROJECT_ROOT, PIPELINE.failureLogFile),
        failureLog,
        'utf-8'
      );

      // Write failure context JSON
      const contexts = failures.map((f) => ({
        spec: f.spec,
        failureType: classifyFailure(f.error),
        errorMessage: f.error,
        failingTest: f.testName,
      }));

      await fs.writeFile(
        path.resolve(PROJECT_ROOT, PIPELINE.failureContextFile),
        JSON.stringify(contexts, null, 2),
        'utf-8'
      );

      log('RUN', `Cypress FAILED — ${failures.length} failure(s)`);
      resolve({
        passed: false,
        specs: {
          passed: [],
          failed: failures.map((f) => f.spec),
        },
        stdout,
        failures: contexts,
      });
    });

    proc.on('error', (err) => {
      logError('RUN', 'Failed to spawn Cypress', err);
      resolve({
        passed: false,
        specs: { passed: [], failed: [] },
        stdout: '',
        failures: [{
          spec: specPattern,
          failureType: 'server_unreachable',
          errorMessage: err.message,
        }],
      });
    });
  });
}

/**
 * Parse individual test failures from Cypress stdout.
 * Cypress outputs failures in a numbered list after "X failing".
 * We parse the detailed failure section (indented with spec context).
 */
function parseFailures(stdout) {
  const failures = [];
  // Strip ANSI escape codes before parsing
  const clean = stdout.replace(/\x1B\[[0-9;]*m/g, '');
  const lines = clean.split('\n');

  // Build a map of spec → failures by tracking which spec is running
  // when "N failing" appears. Cypress outputs per-spec blocks:
  //   Running: cart-management.cy.js
  //   ...tests...
  //   1 failing        <-- failures belong to cart-management.cy.js
  //   Running: user-signup.cy.js
  //   ...tests...
  let currentSpec = '';
  const specFailingSections = []; // { spec, failingIdx }

  for (let i = 0; i < lines.length; i++) {
    const specMatch = lines[i].match(/Running:\s+(.+\.cy\.js)/);
    if (specMatch) {
      currentSpec = specMatch[1].trim();
      if (!currentSpec.startsWith('cypress/')) {
        currentSpec = `cypress/e2e/${currentSpec}`;
      }
    }
    if (/\d+\s+failing/.test(lines[i]) && currentSpec) {
      specFailingSections.push({ spec: currentSpec, failingIdx: i });
    }
  }

  // Parse each failure section
  for (const { spec, failingIdx } of specFailingSections) {
    const failureSection = lines.slice(failingIdx + 1);
    const seen = new Set();

    for (let i = 0; i < failureSection.length; i++) {
      const line = failureSection[i];
      // Stop at the next spec's "Running:" line
      if (/Running:\s+.+\.cy\.js/.test(line)) break;

      const failMatch = line.match(/^\s+(\d+)\)\s+(.+)/);
      if (failMatch) {
        const testName = failMatch[2].trim();
        if (seen.has(testName)) continue;
        seen.add(testName);

        const errorLines = [];
        for (let j = i + 1; j < Math.min(i + 12, failureSection.length); j++) {
          const errLine = failureSection[j];
          if (/^\s+\d+\)\s+/.test(errLine)) break;
          if (/Running:\s+.+\.cy\.js/.test(errLine)) break;
          if (errLine.trim()) errorLines.push(errLine.trim());
        }

        failures.push({
          spec,
          testName,
          error: errorLines.join('\n'),
        });
      }
    }
  }

  // Fallback if no structured failures found
  if (!failures.length && currentSpec) {
    failures.push({
      spec: currentSpec || 'unknown',
      testName: 'unknown',
      error: stdout.slice(-2000),
    });
  }

  return failures;
}

/**
 * Extract the failure section from Cypress output.
 */
function extractFailureSection(stdout) {
  const failIdx = stdout.indexOf('failing');
  if (failIdx === -1) return stdout.slice(-2000);
  return stdout.slice(Math.max(0, failIdx - 500));
}
