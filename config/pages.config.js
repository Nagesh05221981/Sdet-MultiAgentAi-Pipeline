/**
 * Page Registry — single source of truth for all application pages.
 *
 * To add a new page:
 *   1. Add the HTML file to ecommerceTestApp/
 *   2. Add an entry to the PAGES array below
 *   3. Write a story in stories/ that references the page
 *   4. Run the pipeline — everything else is auto-generated
 */

export const PAGES = [
  {
    id: 'home',
    name: 'HomePage',
    url: '/index.html',
    pageObjectFile: 'cypress/support/pages/HomePage.js',
    domSnapshotId: 'homepage',
    sourceHtml: 'ecommerceTestApp/index.html',
    description: 'Product catalog with search, category filters, cart drawer, auth modal (login/signup)',
  },
  {
    id: 'checkout',
    name: 'CheckoutPage',
    url: '/checkout.html',
    pageObjectFile: 'cypress/support/pages/CheckoutPage.js',
    domSnapshotId: 'checkout',
    sourceHtml: 'ecommerceTestApp/checkout.html',
    description: '4-step checkout flow: cart review, delivery (shipping/pickup), payment, order review',
  },
  {
    id: 'confirmation',
    name: 'ConfirmationPage',
    url: '/confirmation.html',
    pageObjectFile: 'cypress/support/pages/ConfirmationPage.js',
    domSnapshotId: 'confirmation',
    sourceHtml: 'ecommerceTestApp/confirmation.html',
    description: 'Order confirmation with order ID, delivery details, items, totals, print receipt',
  },
];

/**
 * Lookup a page by id.
 */
export function getPage(id) {
  return PAGES.find((p) => p.id === id);
}

/**
 * Get all page URLs for Cypress visits.
 */
export function getPageUrls() {
  return PAGES.map((p) => ({ id: p.id, url: p.url }));
}
