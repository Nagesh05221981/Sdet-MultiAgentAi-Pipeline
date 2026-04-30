import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import llm from '../lib/llm.js';
import { PAGES } from '../config/pages.config.js';
import { parseDOM } from '../tools/dom_parser.js';
import { rankSelectors, formatSelectorsForPrompt } from '../tools/selector_ranker.js';
import { log, logError } from '../lib/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');

/**
 * PageObjectGenerator — Combined approach:
 *
 * 1. DOM Parser (Cheerio) extracts interactive elements with ranked selectors
 * 2. Selector Ranker scores selectors by stability
 * 3. LLM receives ONLY ranked selectors (never raw HTML) — prevents hallucination
 * 4. LLM generates class-based PO with elements = {} pattern
 * 5. Validator checks all selectors in PO exist in ranked list
 */

const appModel = JSON.parse(
  await fs.readFile(path.resolve(PROJECT_ROOT, 'config/app-model.json'), 'utf-8')
);

const PO_PROMPT = `You are a Senior Cypress SDET generating a Page Object.

IMPORTANT: Test specs will ONLY call your methods. Specs will NEVER write cy.get() or .should().
You must provide EVERY method a spec might need — actions AND verify methods.

## RULES
- Use ONLY selectors from the RANKED SELECTORS list below — DO NOT invent selectors
- Export default class with elements = {} pattern
- ALL assertions live inside verify methods — specs NEVER write .should()
- Group methods by area with comments

## CLASS PATTERN (follow exactly)

class HomePage {
    elements = {
        // --- Navigation ---
        searchInput:    () => cy.get('#search-input'),
        cartCount:      () => cy.get('#cart-count'),
        loginButton:    () => cy.contains('button', 'Login'),
        signUpButton:   () => cy.contains('button', 'Sign Up'),
        cartPill:       () => cy.get('.cart-pill'),
        drawer:         () => cy.get('#drawer'),
        checkoutBtn:    () => cy.get('#checkout-btn'),
        authModal:      () => cy.get('#auth-modal'),
        userChip:       () => cy.get('#user-chip'),
        unameLabel:     () => cy.get('#uname-label'),

        // --- Forms ---
        loginEmail:     () => cy.get('#l-email'),
        loginPassword:  () => cy.get('#l-pass'),
        signupName:     () => cy.get('#s-name'),
        signupEmail:    () => cy.get('#s-email'),
        signupPassword: () => cy.get('#s-pass'),
        signupMessage:  () => cy.get('#s-msg'),
        loginMessage:   () => cy.get('#l-msg'),
    }

    // --- Product Actions ---
    addProductByName(name) {
        cy.contains('.pcard-name', name).should('be.visible').closest('.pcard').find('.add-btn').click()
    }

    addProductByIndex(index) {
        cy.get('.pcard').eq(index).find('.add-btn').should('be.visible').click()
    }

    // --- Search & Filter ---
    searchFor(text) {
        this.elements.searchInput().clear().type(text)
    }

    filterByCategory(category) {
        cy.get('.fchip').contains(category).should('be.visible').click()
    }

    // --- Cart ---
    openCart() {
        this.elements.cartPill().should('be.visible').click()
    }

    proceedToCheckout() {
        this.elements.checkoutBtn().should('be.visible').click()
    }

    // --- Auth ---
    openLogin() {
        this.elements.loginButton().should('be.visible').click()
    }

    openSignup() {
        this.elements.signUpButton().should('be.visible').click()
    }

    login(email, password) {
        this.elements.loginEmail().clear().type(email)
        this.elements.loginPassword().clear().type(password)
        cy.get('#form-login .msubmit').should('be.visible').click()
    }

    signup(name, email, password) {
        this.elements.signupName().clear().type(name)
        this.elements.signupEmail().clear().type(email)
        this.elements.signupPassword().clear().type(password)
        cy.get('#form-signup .msubmit').should('be.visible').click()
    }

    logout() {
        cy.get('#user-chip').find('button').contains('Out').click()
    }

    // --- Verify Methods (specs call ONLY these) ---
    verifyCartCount(expected) {
        this.elements.cartCount().should('be.visible').and('contain', expected)
    }

    verifyProductInCart(productName) {
        cy.contains('.ci-name', productName).should('be.visible')
    }

    verifyCartPriceInDrawer(expectedPrice) {
        cy.get('.ci-sub').should('contain', expectedPrice)
    }

    verifyDrawerOpen() {
        this.elements.drawer().should('have.class', 'open')
    }

    verifySignupMessage(expected) {
        this.elements.signupMessage().should('contain', expected)
    }

    verifyLoginMessage(expected) {
        this.elements.loginMessage().should('contain', expected)
    }

    verifyUserChipVisible(expectedName) {
        this.elements.userChip().should('be.visible')
        this.elements.unameLabel().should('contain', expectedName)
    }

    verifyAuthButtonsNotVisible() {
        cy.get('#auth-btns').should('not.be.visible')
    }

    verifyProductCount(expected) {
        cy.get('.pcard').should('have.length', expected)
    }

    verifyNoResults() {
        cy.get('#no-results').should('be.visible')
    }

    verifyResultsInfo(expected) {
        cy.get('#results-info').should('contain', expected)
    }

    verifyFilterActive(category) {
        cy.get('.fchip').contains(category).should('have.class', 'active')
    }

    verifyAuthModalVisible() {
        this.elements.authModal().should('be.visible')
    }

    verifyUrl(expected) {
        cy.url().should('include', expected)
    }
}
export default HomePage

ADAPT this pattern for the page below. Create appropriate elements, actions, and verify methods based on the RANKED SELECTORS and APP CONTEXT. The example above is for HomePage — adapt the class name, elements, and methods for the actual page.

For checkout pages with steppers:
- Create navigation methods: goToDeliveryStep(), goToPaymentStep(), goToReviewStep(), placeOrder()
- Create selection methods: selectShipping(), selectPickup(), selectStoreByText(name), selectDateByText(text), selectTimeByText(text)
- Create form methods: fillPaymentDetails(number, name, exp, cvv)
- Create verify methods: verifyStepVisible(stepName), verifyShippingSelected(), verifyPickupSelected(), verifyOrderConfirmed()

For confirmation pages:
- Create verify methods: verifyOrderConfirmed(), verifyOrderIdVisible()
- Create action methods: continueShopping()

## PAGE INFO

Page Name: {pageName}
Page URL: {pageUrl}
Description: {pageDescription}

## RANKED SELECTORS (use ONLY these)

{rankedSelectors}

## APP MESSAGES (use these exact strings in verify methods)

{appMessages}

## APP MODEL CONTEXT

{appModelContext}

Generate the Page Object class. Output ONLY valid JavaScript code. No markdown fences. No explanation.`;

/**
 * Generate page objects for all pages.
 */
export async function generateAllPageObjects(force = false) {
  log('PO-GEN', '=== Generating Page Objects (DOM Parse → Rank → LLM) ===');

  const pagesDir = path.resolve(PROJECT_ROOT, 'cypress/support/pages');
  await fs.mkdir(pagesDir, { recursive: true });

  const results = [];

  for (const [pageId, pageConfig] of Object.entries(appModel.pages)) {
    const fileName = `${pageId}-page.js`;
    const filePath = path.resolve(pagesDir, fileName);

    if (!force) {
      try {
        await fs.access(filePath);
        log('PO-GEN', `Skipping ${fileName} — already exists (use --force-po to rebuild)`);
        results.push({ page: pageId, status: 'skipped' });
        continue;
      } catch { /* generate */ }
    }

    log('PO-GEN', `Generating PO for: ${pageId} (${pageConfig.url})`);

    try {
      const page = PAGES.find(p => p.id === pageId);
      if (!page) {
        logError('PO-GEN', `Page ${pageId} not found in pages.config.js`);
        results.push({ page: pageId, status: 'failed' });
        continue;
      }

      // Step 1: Read HTML
      const html = await fs.readFile(path.resolve(PROJECT_ROOT, page.sourceHtml), 'utf-8');

      // Step 2: Parse DOM — extract interactive elements
      const { selectors, appMessages } = parseDOM(html);
      log('PO-GEN', `  Parsed ${selectors.length} selectors from DOM`);

      // Step 3: Rank selectors
      const ranked = rankSelectors(selectors);
      const selectorPrompt = formatSelectorsForPrompt(ranked);

      // Step 4: Build app model context for this page
      let appModelContext = '';
      if (pageConfig.stepper) {
        appModelContext += 'STEPPER FLOW:\n';
        for (const [stepKey, stepCfg] of Object.entries(pageConfig.stepper)) {
          appModelContext += `  ${stepKey}: section=${stepCfg.section || '?'}, nextButton=${stepCfg.nextButton || '?'}`;
          if (stepCfg.enabledWhen) appModelContext += ` (enabled when: ${stepCfg.enabledWhen})`;
          appModelContext += '\n';
          if (stepCfg.options) {
            for (const [optKey, optCfg] of Object.entries(stepCfg.options)) {
              appModelContext += `    option: ${optKey} → ${optCfg.selector} (class "${optCfg.selectedClass}" when selected)\n`;
            }
          }
        }
      }
      if (pageConfig.keyElements) {
        appModelContext += 'KEY ELEMENTS:\n';
        for (const [key, cfg] of Object.entries(pageConfig.keyElements)) {
          const sel = typeof cfg === 'string' ? cfg : cfg.selector;
          const txt = typeof cfg === 'object' ? cfg.text : '';
          appModelContext += `  ${key}: ${sel}${txt ? ` text="${txt}"` : ''}\n`;
        }
      }

      // Step 5: Call LLM with ranked selectors (never raw HTML)
      const className = pageId.charAt(0).toUpperCase() + pageId.slice(1) + 'Page';
      const prompt = PO_PROMPT
        .replace('{pageName}', className)
        .replace('{pageUrl}', pageConfig.url)
        .replace('{pageDescription}', pageConfig.description || '')
        .replace('{rankedSelectors}', selectorPrompt)
        .replace('{appMessages}', appMessages.length ? appMessages.map(m => `  "${m}"`).join('\n') : '  (none found)')
        .replace('{appModelContext}', appModelContext || '(none)');

      const response = await llm.invoke(prompt);
      let code = response.content;

      // Clean markdown fences
      code = code.replace(/^```(?:javascript|js)?\n?/gm, '').replace(/```$/gm, '').trim();

      // Step 6: Validate — check that selectors in code exist in ranked list
      const usedSelectors = [...code.matchAll(/cy\.get\(['"]([^'"]+)['"]\)/g)].map(m => m[1]);
      const rankedValues = new Set(ranked.map(r => r.value.replace(/^cy\.contains\(.*\)$/, '')));
      for (const used of usedSelectors) {
        if (!rankedValues.has(used) && !rankedValues.has(`#${used}`) && !rankedValues.has(`.${used}`)) {
          log('PO-GEN', `  Warning: selector "${used}" not in ranked list — LLM may have hallucinated`);
        }
      }

      await fs.writeFile(filePath, code + '\n', 'utf-8');
      log('PO-GEN', `  Wrote: cypress/support/pages/${fileName}`);
      results.push({ page: pageId, status: 'generated' });
    } catch (err) {
      logError('PO-GEN', `Failed to generate PO for ${pageId}`, err);
      results.push({ page: pageId, status: 'failed', error: err.message });
    }
  }

  // Generate method registry
  await generateMethodRegistry(pagesDir);

  const generated = results.filter(r => r.status === 'generated').length;
  const skipped = results.filter(r => r.status === 'skipped').length;
  log('PO-GEN', `=== PO Generation Complete: ${generated} generated, ${skipped} skipped ===`);
  return results;
}

/**
 * Parse PO files and generate method registry.
 */
async function generateMethodRegistry(pagesDir) {
  const registry = {};

  for (const [pageId] of Object.entries(appModel.pages)) {
    const fileName = `${pageId}-page.js`;
    const filePath = path.resolve(pagesDir, fileName);
    const alias = pageId.charAt(0).toUpperCase() + pageId.slice(1) + 'Page';

    let code;
    try {
      code = await fs.readFile(filePath, 'utf-8');
    } catch { continue; }

    // Parse element names from elements = {} block
    const elementPattern = /(\w+)\s*:\s*\(\)\s*=>/g;
    const elements = [];
    let elMatch;
    while ((elMatch = elementPattern.exec(code)) !== null) {
      elements.push({ name: elMatch[1], description: `element: this.elements.${elMatch[1]}()` });
    }

    // Parse class methods
    const methodPattern = /^\s{2,4}(\w+)\s*\(([^)]*)\)\s*\{/gm;
    const actions = [];
    const verifiers = [];
    let match;
    while ((match = methodPattern.exec(code)) !== null) {
      const name = match[1];
      if (name === 'constructor' || name === 'elements') continue;
      const params = match[2].split(',').map(p => p.trim()).filter(Boolean);

      if (name.startsWith('verify') || name.startsWith('get') || name.startsWith('is')) {
        verifiers.push({ name, params, description: `${name}(${params.join(', ')})` });
      } else {
        actions.push({ name, params, description: `${name}(${params.join(', ')})` });
      }
    }

    registry[alias] = {
      fileName,
      importPath: `${pageId}-page`,
      elements,
      actions,
      verifiers,
    };
  }

  const registryPath = path.resolve(PROJECT_ROOT, 'cypress/support/method-registry.json');
  await fs.writeFile(registryPath, JSON.stringify(registry, null, 2), 'utf-8');
  log('PO-GEN', 'Wrote method registry: cypress/support/method-registry.json');
}
