import { StructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { spawn } from 'child_process';
import path from 'path';

/**
 * Tool: Run one or more Cypress spec files.
 * Spawns npx cypress run, captures stdout/stderr, returns results.
 */
export class RunCypressSpecTool extends StructuredTool {
  name = 'run_cypress_spec';
  description =
    'Run Cypress tests for a given spec pattern. Returns pass/fail results and stdout. Use a glob pattern like "cypress/e2e/**/*.cy.js" or a specific file.';
  schema = z.object({
    specPattern: z.string().describe('Spec file path or glob, e.g. "cypress/e2e/browse-products.cy.js"'),
  });

  constructor(projectRoot, timeout = 120_000) {
    super();
    this.projectRoot = projectRoot;
    this.timeout = timeout;
  }

  async _call({ specPattern }) {
    return new Promise((resolve) => {
      const args = ['cypress', 'run', '--spec', specPattern];
      const proc = spawn('npx', args, {
        cwd: this.projectRoot,
        env: { ...process.env, FORCE_COLOR: '0' },
        timeout: this.timeout,
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => {
        const text = data.toString();
        stdout += text;
        process.stdout.write(text); // stream live
      });

      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        if (code === 0) {
          resolve(`PASSED\n\n${stdout}`);
        } else {
          resolve(`FAILED (exit code ${code})\n\nSTDOUT:\n${stdout}\n\nSTDERR:\n${stderr}`);
        }
      });

      proc.on('error', (err) => {
        resolve(`ERROR spawning Cypress: ${err.message}`);
      });
    });
  }
}
