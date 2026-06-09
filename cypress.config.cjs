const { defineConfig } = require('cypress');

module.exports = defineConfig({
  e2e: {
    baseUrl: 'http://localhost:8080',
    specPattern: 'cypress/e2e/**/*.cy.js',
    supportFile: 'cypress/support/e2e.js',
    video: true,
    videosFolder: 'cypress/results/videos',
    screenshotOnRunFailure: true,
    screenshotsFolder: 'cypress/results/screenshots',
    defaultCommandTimeout: 10000,
    viewportWidth: 1280,
    viewportHeight: 720,
  },
});
