# SDET Multi-Agent AI Pipeline

An autonomous AI-SDET pipeline that converts plain-language user stories into Cypress end-to-end test suites using a multi-agent LLM architecture. Four agents collaborate — designing test cases, generating code, running tests, and self-healing failures — all orchestrated in a single pipeline.

## How It Works

```
User Story (.md)
      |
      v
 +-----------------+     +-------------------+     +-------------+     +------------+
 | TestCaseDesigner | --> | TestCodeGenerator | --> | TestRunner  | --> | TestFixer  |
 | (LLM + Zod)     |     | (LLM + AST valid) |     | (Cypress)   |     | (LLM)     |
 +-----------------+     +-------------------+     +-------------+     +------------+
      |                        |                        |                    |
  test-cases.json         spec.cy.js              pass/fail           fixed spec
                        + page objects           + classified          (up to 3
                                                  failures             retries)
```

## Quick Start

```bash
# Install dependencies
npm install

# Start the target app (in a separate terminal)
npm run serve

# Run the full pipeline (all stories)
npm start

# Run a specific story
node index.js browse-products

# Run with an ad-hoc story
USER_STORY="Filter products by Tech category" node index.js
```

## Pipeline Modes

### Development Mode (default)

Runs the full 5-stage pipeline: generates Page Objects, designs test cases from user stories, generates Cypress specs, runs them, and self-heals failures.

```bash
npm run test:dev
node index.js --mode=development
node index.js                        # default — same as development
node index.js browse-products        # single story
```

| Stage | Agent | What Happens |
|-------|-------|-------------|
| 0 | PageObjectGenerator | Parses app DOM, generates PO classes (skipped if POs exist) |
| 1 | TestCaseDesigner | LLM reads user story + app model, outputs structured test cases |
| 2 | TestCodeGenerator | LLM generates Cypress spec using only PO methods, AST-validated |
| 3 | TestRunner | Runs all generated specs via Cypress |
| 4 | TestFixer | LLM fixes failing specs, re-runs per spec (up to 3 retries) |

### Regression Mode

Skips all generation (stages 0-2). Runs existing specs and self-heals any failures. Use for nightly runs, CI, or quick validation after app changes.

```bash
npm run test:regression
node index.js --mode=regression
node index.js --mode=regression browse-products   # single spec
PIPELINE_MODE=regression node index.js            # via env var
```

| Stage | What Happens |
|-------|-------------|
| 0-2 | **Skipped** — no PO gen, no design, no codegen |
| 3 | Runs existing specs from `cypress/e2e/` |
| 4 | Self-heals failures (up to 3 retries per spec) |

### CI Mode

Same as regression mode but writes `ci-results.json` and exits with a code that tells the CI workflow what to do next.

```bash
npm run test:ci
node index.js --mode=regression --ci
```

| Exit Code | Meaning | CI Action |
|-----------|---------|-----------|
| 0 | All tests passed | Green build |
| 1 | Tests failed, fixer couldn't heal | GitHub Issue created |
| 2 | Tests failed, fixer healed them | Draft PR created for review |

### Legacy Run

Running without any flags works exactly as before — defaults to development mode.

```bash
npm start                                          # all stories
node index.js                                      # all stories
node index.js browse-products                      # single story
USER_STORY="Filter by Tech category" node index.js # ad-hoc story
```

## Agents

### 1. PageObjectGenerator
Parses the target app's DOM, ranks selectors by reliability, and generates Page Object classes. Runs once before all stories.

### 2. TestCaseDesigner
Reads a user story + app model and produces structured test cases (JSON). Output is validated against a Zod schema — no raw LLM text.

### 3. TestCodeGenerator
Takes test cases and generates Cypress specs using only Page Object methods. An AST validator rejects specs that use raw `cy.get()` or `.should()`. Retries up to 3 times on validation failure.

### 4. TestRunner
Spawns Cypress as a child process. No LLM involved. Parses failures from stdout and classifies each into categories: `selector_not_found`, `timeout_issue`, `assertion_failed`, `server_unreachable`, etc.

### 5. TestFixer
Reads the failure context, current spec, and PO capabilities. Generates a minimal targeted fix. Re-runs the spec after each fix attempt. Max 3 retries per failing spec.

## CI/CD (GitHub Actions)

A nightly regression workflow runs all existing specs and self-heals failures.

### Setup

1. Add secrets in **Settings > Secrets and variables > Actions**:
   - `OPENAI_API_KEY` — your LLM API key
   - `OPENAI_API_BASE` — your API base URL (if using a proxy)

2. The workflow runs automatically at **2am UTC nightly**, or trigger manually from **Actions > Regression Tests > Run workflow**.

### What Happens

```
Nightly run
  |-- All tests pass       --> Green build (exit 0)
  |-- Tests fail, LLM fixes --> Draft PR created for human review (exit 2)
  |-- Tests fail, unfixed   --> GitHub Issue opened (exit 1)
```

- The LLM **never merges** — it only proposes fixes via draft PR
- CI **always fails** when tests originally broke, even if healed — forces human attention
- Cypress screenshots are uploaded as artifacts

### Exit Code Contract

| Code | Meaning | CI Action |
|------|---------|-----------|
| 0 | All tests passed | Green build |
| 1 | Tests failed, fixer couldn't heal | GitHub Issue created |
| 2 | Tests failed, fixer healed them | Draft PR created |

## Project Structure

```
.
├── agents/                 # Agent implementations
│   ├── PageObjectGenerator.js
│   ├── TestCaseDesigner.js
│   ├── TestCodeGenerator.js
│   ├── TestRunner.js
│   └── TestFixer.js
├── config/
│   ├── app-model.json      # App pages, flows, selectors, state seeding
│   ├── pages.config.js     # Page registry (add new pages here)
│   └── pipeline.config.js  # Retry limits, timeouts, paths, mode config
├── cypress/
│   ├── e2e/                # Generated spec files
│   ├── fixtures/           # Test data (test-data.json)
│   ├── support/pages/      # Generated Page Objects
│   └── test-cases/         # Generated test case JSON
├── ecommerceTestApp/       # Target app (NOVA Store — static e-commerce SPA)
├── prompts/                # LLM prompt templates
├── schemas/                # Zod validation schemas
├── scripts/
│   └── ci-report.sh        # CI: creates draft PR or GitHub Issue
├── stories/                # User story input files (.md)
├── tools/                  # DOM parsing, selector ranking, spec validation
├── .github/workflows/
│   └── regression.yml      # Nightly regression + manual trigger
├── index.js                # Pipeline orchestrator
└── cypress.config.cjs      # Cypress config (CommonJS required)
```

## Target Application

**NOVA Store** — a 3-page static e-commerce SPA using localStorage for all state:

- **Home** (`index.html`) — Product grid, search, category filters, cart drawer, auth modal
- **Checkout** (`checkout.html`) — 4-step flow: cart review, delivery, payment, order review
- **Confirmation** (`confirmation.html`) — Order summary with print receipt

## Key Conventions

- **ESM throughout** (`"type": "module"` in package.json), except `cypress.config.cjs` which must be CommonJS
- **Page Object Model** — specs import POs from `cypress/support/pages/`. POs never call `cy.visit()`
- **No `cy.intercept()`** — the target app has no backend
- **No invented selectors** — only selectors from the DOM/selector catalogue
- **Zod schemas** enforce LLM output structure
- **AST validation** (acorn) checks generated code before writing to disk

## Environment Variables

| Variable | Description |
|----------|-------------|
| `OPENAI_API_KEY` | LLM API key (required) |
| `OPENAI_API_BASE` | API base URL |
| `OPENAI_MODEL` | Model name (default: `gpt-4o`) |
| `BASE_URL` | Target app URL (default: `http://localhost:8080`) |
| `PIPELINE_MODE` | `development` or `regression` |
| `LANGCHAIN_TRACING_V2` | Enable LangSmith tracing |
| `LANGCHAIN_API_KEY` | LangSmith API key |
| `LANGCHAIN_PROJECT` | LangSmith project name |

## All Commands

```bash
# Pipeline
npm start                          # Full pipeline (all stories)
node index.js browse-products      # Single story
npm run test:dev                   # Development mode (explicit)
npm run test:regression            # Regression mode
npm run test:ci                    # CI mode (JSON output + exit codes)

# Target app
npm run serve                      # Start on port 8080

# Cypress
npm run cypress:open               # Interactive mode
npm run cypress:run                # Headless run
npx cypress run --spec "cypress/e2e/browse-products.cy.js"  # Single spec
```
