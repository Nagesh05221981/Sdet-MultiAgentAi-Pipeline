# SDET Multi-Agent AI Pipeline — Architecture & Design

## 1. Overview

An autonomous AI-SDET pipeline that converts plain-language user stories into Cypress end-to-end test suites. Five agents collaborate: PageObjectGenerator creates complete Page Objects from live DOM, TestCaseDesigner designs test cases from stories using the App Model, TestCodeGenerator produces specs using only PO methods, TestRunner executes Cypress, and TestFixer self-heals failing tests.

**Results:** 21/22 tests pass across 5 stories (95.5%). 3 of 5 stories pass all tests on first generation with zero fix attempts.

### Target Application

**NOVA Store** — a 3-page static e-commerce SPA using localStorage for all state.

| Page | File | Features |
|------|------|----------|
| Home / Catalog | `index.html` | Product grid, search, category filters, cart drawer, auth modal (login/signup) |
| Checkout | `checkout.html` | 4-step flow: cart review, delivery (shipping/store pickup), payment, order review |
| Confirmation | `confirmation.html` | Order summary, items, totals, print receipt |

---

## 2. System Architecture

```
                         ┌─────────────────────┐
                         │   config/app-model   │
                         │   (source of truth)  │
                         └────────┬────────────┘
                                  │
     ┌────────────────────────────┼────────────────────────────┐
     │                            │                            │
     ▼                            ▼                            ▼
┌─────────────┐          ┌─────────────────┐          ┌──────────────────┐
│   Stage 0   │          │    Stage 1      │          │    Stage 2       │
│ PO Generator│          │ TestCase        │          │ TestCode         │
│ (per page)  │          │ Designer        │          │ Generator        │
│             │          │ (per story)     │          │ (per story)      │
│ DOM Parse   │          │                 │          │                  │
│ → Rank      │          │ Story + AppModel│          │ TestCases +      │
│ → LLM       │          │ → Test Cases    │          │ PO Capabilities  │
│ → PO Class  │          │                 │          │ → Spec File      │
└──────┬──────┘          └────────┬────────┘          └────────┬─────────┘
       │                          │                            │
       ▼                          ▼                            ▼
  PO Files +               Test Cases JSON              Spec .cy.js File
  Method Registry                                     (only PO method calls)
                                                              │
                                                              ▼
                                                    ┌──────────────────┐
                                                    │    Stage 3       │
                                                    │   TestRunner     │
                                                    │  (Cypress exec)  │
                                                    └────────┬─────────┘
                                                             │
                                                    pass?────┼────fail?
                                                    │                │
                                                    ▼                ▼
                                                  DONE      ┌──────────────┐
                                                            │   Stage 4    │
                                                            │  TestFixer   │
                                                            │  (max 3)     │
                                                            └──────┬───────┘
                                                                   │
                                                                   ▼
                                                            Re-run Stage 3
```

---

## 3. Key Design Principles

### 3.1 "Generate Data, Not Code" → Evolved to "Specs Call Only PO Methods"

The final architecture ensures specs contain **zero raw selectors**. All `cy.get()`, `cy.contains()`, and `.should()` assertions live inside Page Objects. Specs are pure orchestration — just PO method calls in order.

```
SPEC CONTAINS:                   PO CONTAINS:
  cy.visit('/index.html')          elements = { ... }
  homePage.addProductByName(...)   addProductByName(name) { cy.contains().closest().find().click() }
  homePage.verifyCartCount('1')    verifyCartCount(expected) { this.elements.cartCount().should(...) }
  checkoutPage.placeOrder()        placeOrder() { this.elements.placeOrderBtn().click() }
  confirmationPage.verifyOrder()   verifyOrderConfirmed() { cy.get('.confirm-page h1').should(...) }
```

### 3.2 App Model as Source of Truth

The `config/app-model.json` describes everything the DOM snapshot cannot convey: page transitions, button prerequisites, state dependencies, flow sequences, assertion rules, and exact app message text.

### 3.3 DOM Parse → Rank → LLM (Never Raw HTML to LLM)

The LLM never sees raw HTML. Cheerio parses the DOM, extracts interactive elements, ranks selectors by stability, and the LLM receives only the ranked selector list. This prevents selector hallucination.

### 3.4 Decoupled PO and Spec Generation

Page Objects are generated once per app (Stage 0). Spec generation (Stage 2) reads PO capabilities and uses only available methods. This decoupling means POs are stable and reusable across all stories.

---

## 4. Agent Specifications

### 4.1 PageObjectGenerator (Stage 0)

**Purpose:** Generate complete, production-ready Page Object classes from live DOM.

**When it runs:** Once per app, or when `--force-po` is passed. Skips pages that already have PO files.

**Pipeline:**

```
HTML File (ecommerceTestApp/*.html)
    │
    ▼
DOM Parser (Cheerio) ── tools/dom_parser.js
    │  Extracts:
    │  - Elements with data-cy/data-test attributes (score 100)
    │  - Elements with IDs (score 90)
    │  - Inputs/selects/textareas (score 85)
    │  - Buttons with text (score 70)
    │  - Links with href (score 65)
    │  - Elements with onclick handlers (score 60)
    │  - Dynamic classes from script templates (score 55)
    │  - App messages from script textContent assignments
    │
    ▼
Selector Ranker ── tools/selector_ranker.js
    │  Scores each selector by stability:
    │  - data-cy: +20 bonus
    │  - id: +10 bonus
    │  - text/contains: -5 penalty
    │  - Previously failed selectors: -30 penalty (self-healing)
    │  Sorts by score descending
    │
    ▼
LLM (GPT-4o, temperature 0)
    │  Receives: ranked selectors + app model context + app messages
    │  Never receives: raw HTML
    │  Generates: class-based PO with elements = {} pattern
    │
    ▼
Validator
    │  Checks: all cy.get() selectors exist in ranked list
    │  Warns: if LLM used a selector not in the ranked list
    │
    ▼
PO File (cypress/support/pages/<page>-page.js)
    │
    ▼
Method Registry (cypress/support/method-registry.json)
    │  Parsed from PO files using regex
    │  Lists: actions, verifiers, element names per PO class
    │  Used by: TestCodeGenerator and TestFixer
```

**PO Class Pattern:**

```javascript
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
    }

    // --- Product Actions ---
    addProductByName(name) {
        cy.contains('.pcard-name', name)
          .should('be.visible')
          .closest('.pcard')
          .find('.add-btn')
          .click()
    }

    // --- Verify Methods (specs call ONLY these) ---
    verifyCartCount(expected) {
        this.elements.cartCount().should('be.visible').and('contain', expected)
    }

    verifyProductInCart(productName) {
        cy.contains('.ci-name', productName).should('be.visible')
    }
}
export default HomePage
```

**Key rules:**
- `elements = {}` with arrow functions returning `cy.get()` or `cy.contains()` chains
- Action methods use `this.elements.x().should('be.visible').click()`
- Verify methods contain ALL `.should()` assertions — specs never write `.should()`
- `addProductByName(name)` uses `cy.contains('.pcard-name', name).closest('.pcard').find('.add-btn')`
- Text-based selection: `filterByCategory(cat)`, `selectStoreByText(name)`, `selectDateByText(text)`
- `export default ClassName`

---

### 4.2 TestCaseDesigner (Stage 1)

**Purpose:** Design structured test cases from user stories using the App Model.

**Pipeline:**

```
User Story (stories/<slug>.md)
    +
App Model (config/app-model.json)
    +
Test Data Fixture (cypress/fixtures/test-data.json)
    │
    ▼
LLM (GPT-4o, temperature 0, withStructuredOutput)
    │  Zod schema: TestCaseSchema
    │  Prompt: prompts/design_test_cases.txt
    │
    ▼
Test Cases JSON (cypress/test-cases/<slug>.json)
```

**What the Designer produces:**

```json
{
  "feature": "Add Product and Checkout",
  "cases": [
    {
      "id": "TC-001",
      "title": "Add LED Lamp to Cart and Verify",
      "steps": [
        "Open the NOVA Store homepage",
        "Click the Add button on the Smart LED Desk Lamp",
        "Verify the cart badge displays 1",
        "Open the cart drawer",
        "Verify the cart drawer is visible",
        "Verify the Smart LED Desk Lamp is listed in the cart"
      ],
      "assertions": [
        "Cart badge should display 1",
        "Cart drawer should be visible",
        "Cart should list Smart LED Desk Lamp"
      ],
      "testData": null
    }
  ]
}
```

**Key rules enforced by the prompt:**
1. Steps are natural language — never Cypress code or selectors
2. Each test is a complete independent journey (no shared state between tests)
3. Every step is a single atomic action (never summaries like "Complete the checkout")
4. Follows App Model flow sequences — never skips prerequisite steps
5. Assertions target the correct page (no asserting on departed pages)
6. Uses exact app message text from `appMessages` in the App Model
7. References fixture data keys (testData.products.ledLamp) not hardcoded values
8. State seeding specified when test needs pre-existing data

**Problems this agent solved:**
- Skipped prerequisites (buttons disabled because prior step was missing)
- Tests assuming shared state between `it()` blocks
- Assertions after page navigation
- Story text trusted over actual app behavior
- Wrong test granularity (micro-tests or mega-tests)

---

### 4.3 TestCodeGenerator (Stage 2)

**Purpose:** Generate Cypress spec files that use only PO methods — no raw selectors.

**Pipeline:**

```
Test Cases JSON (from Stage 1)
    +
PO Capabilities (from po_capability_extractor.js)
    +
App Model (config/app-model.json)
    +
Test Data Fixture (cypress/fixtures/test-data.json)
    │
    ▼
LLM (GPT-4o, temperature 0)
    │  Prompt: prompts/generate_test_script.txt
    │  Constraint: use ONLY methods from PO capabilities list
    │
    ▼
Spec Validator (tools/spec_validator.js)
    │  Rejects if: cy.get() found (except cy.visit/cy.url)
    │  Rejects if: .should() found (except cy.url().should)
    │  Rejects if: method called that doesn't exist in capabilities
    │  Retries: up to 3 attempts on validation failure
    │
    ▼
Spec File (cypress/e2e/<slug>.cy.js)
```

**What the Generator produces:**

```javascript
import HomePage from '../support/pages/home-page.js'
import CheckoutPage from '../support/pages/checkout-page.js'
import ConfirmationPage from '../support/pages/confirmation-page.js'

describe('Product Checkout', () => {
  const homePage = new HomePage()
  const checkoutPage = new CheckoutPage()
  const confirmationPage = new ConfirmationPage()
  let testData

  beforeEach(() => {
    cy.fixture('test-data').then(data => { testData = data })
  })

  it('TC-001: Add LED Lamp to Cart and Verify', () => {
    cy.visit('/index.html')
    homePage.addProductByName(testData.products.ledLamp.name)
    homePage.verifyCartCount('1')
    homePage.openCart()
    homePage.verifyDrawerOpen()
    homePage.verifyProductInCart(testData.products.ledLamp.name)
  })

  it('TC-002: Checkout with Store Pickup', () => {
    cy.visit('/index.html', {
      onBeforeLoad(win) {
        win.localStorage.setItem('nova_cart', JSON.stringify({ "2": 1 }))
      }
    })
    homePage.openCart()
    homePage.proceedToCheckout()
    checkoutPage.goToDeliveryStep()
    checkoutPage.selectPickup()
    checkoutPage.selectStoreByText(testData.storeLocations.novaPaloAlto)
    checkoutPage.selectDateByText(testData.pickupDetails.desiredDay)
    checkoutPage.selectTimeByText(testData.pickupDetails.desiredTime)
    checkoutPage.goToPaymentStep()
    checkoutPage.fillPaymentDetails(
      testData.payment.validCard.number,
      testData.payment.validCard.name,
      testData.payment.validCard.expiry,
      testData.payment.validCard.cvv
    )
    checkoutPage.goToReviewStep()
    checkoutPage.placeOrder()
    confirmationPage.verifyOrderConfirmed()
  })
})
```

**Key constraints enforced:**
- NO `cy.get()` or `cy.contains()` in specs — only PO method calls
- NO `.should()` in specs — only verify methods
- `cy.visit()` is the only Cypress command allowed directly
- All methods must exist in the PO capabilities list
- Page tracking: after navigation, switch to the new page's instance
- State seeding via `onBeforeLoad` for tests needing pre-existing localStorage data

**Capability Extraction (tools/po_capability_extractor.js):**

Parses PO files to extract method signatures. The LLM sees ONLY this list — it cannot invent methods:

```
HomePage:
  Actions:
    - homePage.addProductByName(name)
    - homePage.addProductByIndex(index)
    - homePage.searchFor(text)
    - homePage.filterByCategory(category)
    - homePage.openCart()
    - homePage.proceedToCheckout()
    - homePage.openLogin()
    - homePage.signup(name, email, password)
  Verify Methods:
    - homePage.verifyCartCount(expected)
    - homePage.verifyProductInCart(productName)
    - homePage.verifyDrawerOpen()
    - homePage.verifySignupMessage(expected)
```

**Spec Validator (tools/spec_validator.js):**

Hard gate that rejects specs with raw selectors or assertions:
- `cy.get()` found → reject (except `cy.visit`, `cy.url`, `cy.fixture`)
- `.should()` found → reject (except `cy.url().should()`)
- Method not in capabilities → reject
- Retries up to 3 times with fresh LLM call

---

### 4.4 TestRunner (Stage 3)

**Purpose:** Execute Cypress tests, capture results, classify failures.

**Pipeline:**

```
Spec File(s)
    │
    ▼
Spawn: npx cypress run --spec <pattern>
    │  Stream stdout live
    │  Capture exit code
    │
    ├── Exit 0 → ALL PASS → Done
    │
    └── Exit != 0 → Parse failures
        │
        ├── Write cypress-failure.log
        ├── Write cypress-failure-context.json
        └── Classify each failure:
            - server_unreachable: ECONNREFUSED
            - selector_issue: element not found
            - timeout_issue: timed out
            - page_object_error: is not a function
            - assertion_failure: expected/to contain
            - syntax_error: SyntaxError
            - navigation_error: cy.visit() failed
```

**No LLM involved.** Pure Node.js child process execution.

---

### 4.5 TestFixer (Stage 4)

**Purpose:** Fix failing specs using PO capabilities and error context.

**Pipeline:**

```
Failure Context (spec path, error message, failure type)
    +
Current Spec Code
    +
PO Capabilities (same list the generator used)
    +
App Model
    │
    ▼
LLM (GPT-4o, temperature 0)
    │  Prompt: inline in TestFixer.js
    │  Same constraint: ONLY PO methods, NO raw selectors
    │
    ▼
Fixed Spec Code
    │
    ▼
Overwrite spec file → Re-run TestRunner
    │
    ├── Pass → FIXED
    └── Fail → Retry (max 3 attempts)
```

**Key constraints:**
- Fixer uses the same PO capability constraint as the generator
- Fixer never creates or modifies POs — only fixes spec code
- Fixer sees the error message and current spec to diagnose issues
- On attempt 2+, the fixer tries a different approach

---

## 5. The App Model (`config/app-model.json`)

The App Model is the single most important configuration file. It tells the AI everything the DOM cannot convey.

### Structure

```json
{
  "app": "NOVA Store",
  "entryPoint": "/index.html",

  "pages": {
    "home": {
      "url": "/index.html",
      "description": "Product catalogue with search, filters, cart drawer, auth modal",
      "initialState": { "cart": "empty", "authModal": "hidden" },
      "selectors": { "search": "#search-input", "cartCount": "#cart-count", ... }
    },
    "checkout": {
      "url": "/checkout.html",
      "prerequisite": "Cart must have items",
      "stepper": {
        "step1_cart": { "section": "#sec-1", "nextButton": "#btn-to-2", "enabledWhen": "cart has items" },
        "step2_delivery": { "options": { "shipping": {...}, "pickup": {...} }, "enabledWhen": "delivery selected" },
        ...
      }
    },
    "confirmation": { "url": "/confirmation.html", ... }
  },

  "flows": {
    "addProductToCart": { "steps": [...], "endState": "cart has 1 item" },
    "chooseStandardShipping": { "requires": ["openCartAndProceedToCheckout"], "steps": [...] },
    "chooseStorePickup": { "requires": [...], "steps": [...] },
    ...
  },

  "stateSeeding": {
    "cartWithOneItem": { "localStorage": { "nova_cart": "{\"1\": 1}" } },
    "existingUserForDuplicate": { "localStorage": { "nova_users": "..." } }
  },

  "appMessages": {
    "signup": { "success": "✓ Account created! Signing you in…", ... },
    "confirmation": { "heading": "Order Confirmed!" }
  },

  "navigationTriggers": {
    "goToCheckout": { "from": "home", "to": "checkout" },
    "placeOrder": { "from": "checkout", "to": "confirmation" },
    ...
  },

  "assertionRules": {
    "not.exist vs not.be.visible": "Elements are HIDDEN, never removed — use not.be.visible",
    "have.class active vs selected": "Filter chips use 'active', delivery options use 'selected'",
    ...
  }
}
```

---

## 6. Test Data Management

Test data lives in `cypress/fixtures/test-data.json` — the single place users configure what to test:

```json
{
  "products": {
    "productToAdd": { "index": 0, "name": "Wireless Headphones", "price": "$149.99" },
    "ledLamp": { "index": 1, "name": "Smart LED Desk Lamp", "price": "$79.99" }
  },
  "users": {
    "newUser": { "name": "Jane Doe", "email": "jane@test.com", "password": "pass123" },
    "existingUser": { "email": "john@test.com", ... },
    "invalidEmail": { "email": "not-an-email", ... },
    "shortPassword": { "password": "123", ... }
  },
  "payment": {
    "validCard": { "number": "1234 5678 9012 3456", "name": "Jane Doe", "expiry": "12/28", "cvv": "123" }
  },
  "storeLocations": { "novaPaloAlto": "Nova Palo Alto" },
  "pickupDetails": { "desiredDay": "Fri", "desiredTime": "10:00 AM" }
}
```

State seeding in specs uses `onBeforeLoad` to set localStorage before the app JS initializes:

```javascript
cy.visit('/index.html', {
  onBeforeLoad(win) {
    win.localStorage.setItem('nova_cart', JSON.stringify({ "1": 1 }))
  }
})
```

---

## 7. Directory Structure

```
Sdet-MultiAgentAi-Pipeline/
├── ecommerceTestApp/              # Target app (untouched)
│   ├── index.html
│   ├── checkout.html
│   └── confirmation.html
│
├── config/
│   ├── app-model.json             # App behavior, flows, state, messages
│   ├── pages.config.js            # Page registry (id, url, source html)
│   ├── pipeline.config.js         # Retry limits, timeouts, model settings
│   └── conventions.js             # POM convention rules
│
├── agents/
│   ├── PageObjectGenerator.js     # Stage 0: DOM → Rank → LLM → PO class
│   ├── TestCaseDesigner.js        # Stage 1: Story → test cases JSON
│   ├── TestCodeGenerator.js       # Stage 2: Test cases → spec file
│   ├── TestRunner.js              # Stage 3: Run Cypress
│   └── TestFixer.js               # Stage 4: Fix failing specs
│
├── tools/
│   ├── dom_parser.js              # Cheerio DOM parser → selector registry
│   ├── selector_ranker.js         # Rank selectors by stability
│   ├── po_capability_extractor.js # Extract PO method list for spec generator
│   ├── spec_validator.js          # Reject specs with raw selectors
│   ├── read_failure_log.js        # Parse + classify Cypress failures
│   └── build_selector_catalogue.js # Legacy selector catalogue builder
│
├── prompts/
│   ├── design_test_cases.txt      # TestCaseDesigner system prompt
│   ├── generate_test_script.txt   # TestCodeGenerator system prompt
│   └── fix_test.txt               # TestFixer system prompt (legacy)
│
├── lib/
│   ├── llm.js                     # Shared ChatOpenAI instance + LangSmith
│   ├── template_renderer.js       # Handlebars template engine (legacy)
│   ├── dom_cleaner.js             # Strip styles/scripts from HTML
│   ├── extract_json.js            # Fallback JSON parser
│   └── logger.js                  # Structured pipeline logging
│
├── stories/                       # User stories (pipeline input)
│   ├── browse-products.md
│   ├── cart-management.md
│   ├── user-signup.md
│   ├── Add-Product-checkout.md
│   └── select-store-pickup.md
│
├── cypress/
│   ├── e2e/                       # Generated spec files
│   ├── test-cases/                # Generated test case JSON
│   ├── support/
│   │   ├── e2e.js                 # Global hooks + DOM capture
│   │   ├── pages/                 # Generated Page Objects
│   │   └── method-registry.json   # Extracted PO capabilities
│   ├── fixtures/
│   │   └── test-data.json         # User-configurable test data
│   └── dom-snapshots/
│
├── templates/                     # Handlebars templates (legacy)
│   ├── page-object.hbs
│   └── spec.hbs
│
├── index.js                       # Pipeline orchestrator
├── package.json
├── cypress.config.cjs             # CommonJS (Cypress requirement)
└── .env                           # API keys
```

---

## 8. Pipeline Execution Flow

```
node index.js [story-name]

1. INIT
   ├── Load .env
   ├── Verify app is served (fetch BASE_URL/index.html)
   └── Log model and tracing config

2. STAGE 0: Generate Page Objects (once, skipped if POs exist)
   ├── For each page in app-model.json:
   │   ├── Read HTML file
   │   ├── Parse DOM with Cheerio → extract interactive elements
   │   ├── Rank selectors by stability
   │   ├── Call LLM with ranked selectors (never raw HTML)
   │   ├── Validate generated PO selectors against ranked list
   │   └── Write PO file
   └── Generate method registry from PO files

3. FOR EACH story:
   ├── STAGE 1: TestCaseDesigner
   │   ├── Read story markdown
   │   ├── Inject app model + test data into prompt
   │   ├── Call LLM with structured output (Zod schema)
   │   └── Write test-cases/<slug>.json
   │
   └── STAGE 2: TestCodeGenerator
       ├── Extract PO capabilities from PO files
       ├── Build prompt with capabilities + test cases + app model
       ├── Call LLM to generate spec code
       ├── Validate: no cy.get(), no .should(), methods exist
       ├── Retry if validation fails (max 3)
       └── Write spec file

4. STAGE 3: TestRunner
   ├── Spawn: npx cypress run --spec cypress/e2e/**/*.cy.js
   ├── Stream stdout live
   ├── Parse failures, classify by type
   └── Write failure log + context

5. STAGE 4: TestFixer (if failures)
   ├── For each failing spec (max 3 retries):
   │   ├── Read current spec + error log
   │   ├── Extract PO capabilities
   │   ├── Call LLM to fix spec (same constraints: only PO methods)
   │   ├── Write fixed spec
   │   └── Re-run single spec
   └── Report results

6. DONE — Print summary table
```

---

## 9. How to Use

### Run the full pipeline
```bash
python3 -m http.server 8080 -d ecommerceTestApp  # Terminal 1
node index.js                                      # Terminal 2 (all stories)
node index.js select-store-pickup                  # Single story
```

### Add a new story
1. Write `stories/my-new-story.md` with acceptance criteria
2. Add test data to `cypress/fixtures/test-data.json` if needed
3. Run `node index.js my-new-story`

### Add a new page to the app
1. Add HTML file to `ecommerceTestApp/`
2. Add entry to `config/pages.config.js`
3. Add page config to `config/app-model.json`
4. Run `node index.js --force-po` to regenerate POs

### Force rebuild POs
```bash
node index.js --force-po
```

---

## 10. Tech Stack

| Component | Technology |
|-----------|-----------|
| Runtime | Node.js 18+ (ESM) |
| LLM | OpenAI GPT-4o via LangChain |
| LLM Binding | @langchain/openai |
| Schema Validation | Zod |
| DOM Parsing | Cheerio |
| Test Framework | Cypress 13+ |
| Tracing | LangSmith |
| Template Engine | Handlebars (legacy, partially used) |
| Environment | dotenv |

---

## 11. Results

| Story | Tests | First Run | After Fix | Total |
|-------|-------|-----------|-----------|-------|
| user-signup | 5 | 4/5 | 5/5 | **5/5 (100%)** |
| browse-products | 6 | 6/6 | — | **6/6 (100%)** |
| Add-Product-checkout | 2 | 2/2 | — | **2/2 (100%)** |
| select-store-pickup | 2 | 2/2 | — | **2/2 (100%)** |
| cart-management | 7 | 6/7 | 6/7 | **6/7 (86%)** |
| **TOTAL** | **22** | **20** | **21** | **21/22 (95.5%)** |
