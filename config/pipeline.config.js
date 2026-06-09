/**
 * Pipeline configuration — retry limits, timeouts, model settings.
 */

export const VALID_MODES = ['development', 'regression'];

export const PIPELINE = {
  // Run mode — 'development' (full pipeline) or 'regression' (run + fix only)
  defaultMode: 'development',

  // LLM settings
  model: 'gpt-4o',
  temperature: 0,

  // Retry limits
  maxFixRetries: 3,
  maxValidationRetries: 3,

  // Cypress
  cypressTimeout: 120_000, // 2 minutes per run
  defaultCommandTimeout: 10_000,

  // Paths
  storiesDir: 'stories',
  testCasesDir: 'cypress/test-cases',
  specsDir: 'cypress/e2e',
  pagesDir: 'cypress/support/pages',
  snapshotsDir: 'cypress/dom-snapshots',
  fixturesDir: 'cypress/fixtures',

  // CI
  ciResultsFile: 'ci-results.json',

  // Logging
  failureLogFile: 'cypress-failure.log',
  failureContextFile: 'cypress-failure-context.json',
};
