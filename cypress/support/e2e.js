// Cypress global support file
// Runs before every spec. Captures DOM snapshots after each test.

/**
 * Custom command: Capture a DOM snapshot and save it.
 * Used to provide agents with the current page state.
 */
Cypress.Commands.add('captureDom', (snapshotId) => {
  cy.document().then((doc) => {
    const html = doc.documentElement.outerHTML;
    cy.writeFile(`cypress/dom-snapshots/${snapshotId}.html`, html);
  });
});

/**
 * After each test, capture the DOM snapshot.
 * The snapshot ID is derived from the current page URL.
 */
afterEach(() => {
  cy.url().then((url) => {
    let snapshotId = 'unknown';
    if (url.includes('index.html') || url.endsWith('/')) {
      snapshotId = 'homepage';
    } else if (url.includes('checkout.html')) {
      snapshotId = 'checkout';
    } else if (url.includes('confirmation.html')) {
      snapshotId = 'confirmation';
    }
    cy.captureDom(snapshotId);
  });
});
