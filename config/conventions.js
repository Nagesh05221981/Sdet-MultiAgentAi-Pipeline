/**
 * POM and Cypress conventions enforced by the validator.
 * Edit these rules without touching validator code.
 */

export const SPEC_RULES = [
  {
    id: 'has-visit',
    description: 'Spec must call cy.visit()',
    test: (code) => /cy\.visit\s*\(/.test(code),
    message: 'Spec file must include at least one cy.visit() call',
  },
  {
    id: 'no-hardcoded-url',
    description: 'No hardcoded localhost/port in cy.visit()',
    test: (code) => !/cy\.visit\s*\(\s*['"`]https?:\/\//.test(code),
    message: 'Do not hardcode protocol/host in cy.visit() — use relative paths with baseUrl',
  },
  {
    id: 'no-intercept',
    description: 'No cy.intercept() — app has no backend',
    test: (code) => !/cy\.intercept\s*\(/.test(code),
    message: 'Do not use cy.intercept() — this app has no backend API',
  },
  {
    id: 'imports-page-object',
    description: 'Spec must import from support/pages/',
    test: (code) => /from\s+['"]\.\.\/support\/pages\//.test(code),
    message: 'Spec must import Page Objects from ../support/pages/',
  },
];

export const PAGE_OBJECT_RULES = [
  {
    id: 'no-visit-in-po',
    description: 'Page Object must NOT call cy.visit()',
    test: (code) => !/cy\.visit\s*\(/.test(code),
    message: 'Page Objects must NOT call cy.visit() — navigation is the spec\'s responsibility',
  },
  {
    id: 'has-export',
    description: 'Page Object must export functions or class',
    test: (code) => /export\s+function/.test(code) || /export\s*\{/.test(code) || /export\s+(default\s+)?class/.test(code),
    message: 'Page Object must export at least one function or class',
  },
];
