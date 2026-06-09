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

  // Find the spec file path from "Running:" line
  let currentSpec = '';
  for (const line of lines) {
    const specMatch = line.match(/Running:\s+(.+\.cy\.js)/);
    if (specMatch) {
      currentSpec = specMatch[1].trim();
      // Ensure full path relative to project root
      if (!currentSpec.startsWith('cypress/')) {
        currentSpec = `cypress/e2e/${currentSpec}`;
      }
    }
  }

  // Parse the failure detail section — starts after "N failing" line
  const failingIdx = lines.findIndex((l) => /\d+\s+failing/.test(l));
  if (failingIdx === -1) return failures;

  // After the "N failing" line, Cypress prints numbered failures like:
  //   1) Suite Name
  //        Test Name:
  //     Error message...
  const failureSection = lines.slice(failingIdx + 1);
  const seen = new Set();

  for (let i = 0; i < failureSection.length; i++) {
    const line = failureSection[i];
    // Match "  N) Test suite name\n       test name:" pattern
    const failMatch = line.match(/^\s+(\d+)\)\s+(.+)/);
    if (failMatch) {
      const testName = failMatch[2].trim();

      // Deduplicate — same test name should only appear once
      if (seen.has(testName)) continue;
      seen.add(testName);

      // Collect error lines (next 8 non-empty lines)
      const errorLines = [];
      for (let j = i + 1; j < Math.min(i + 12, failureSection.length); j++) {
        const errLine = failureSection[j];
        if (/^\s+\d+\)\s+/.test(errLine)) break; // next failure
        if (errLine.trim()) errorLines.push(errLine.trim());
      }

      failures.push({
        spec: currentSpec || 'unknown',
        testName,
        error: errorLines.join('\n'),
      });
    }
  }

  // Fallback if no structured failures found
  if (!failures.length) {
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
