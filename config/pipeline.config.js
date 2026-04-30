/**
 * Pipeline configuration — retry limits, timeouts, model settings.
 */

export const PIPELINE = {
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

  // Logging
  failureLogFile: 'cypress-failure.log',
  failureContextFile: 'cypress-failure-context.json',
};
