# CLAUDE.md

This file provides guidance to Claude Code when working with this repository.

## What This Is

An autonomous AI-SDET pipeline that converts plain-language user stories into Cypress test suites using a multi-agent LLM architecture. Four agents collaborate: TestCaseDesigner, TestCodeGenerator, TestRunner, and TestFixer.

See ARCHITECTURE.md for the full design document.

## Commands

```bash
# Serve the target app (required in a separate terminal)
python3 -m http.server 8080 -d ecommerceTestApp

# Run the full pipeline (processes all stories/*.md files)
node index.js

# Run a specific story
node index.js browse-products

# Run with an ad-hoc inline story
USER_STORY="Filter products by Tech category" node index.js

# Run Cypress directly (for debugging generated specs)
npx cypress run --spec "cypress/e2e/browse-products.cy.js"
npx cypress open
```

## Architecture

4 agents orchestrated by `index.js`:

1. **TestCaseDesigner** (`agents/TestCaseDesigner.js`) — LLM reads user story + DOM snapshot, outputs structured test cases JSON.
2. **TestCodeGenerator** (`agents/TestCodeGenerator.js`) — LLM reads test cases + DOM + PO index, outputs Cypress spec + Page Object files.
3. **TestRunner** (`agents/TestRunner.js`) — Spawns Cypress, classifies failures into 6 categories.
4. **TestFixer** (`agents/TestFixer.js`) — LLM reads failure log + DOM + spec, outputs minimal targeted fix. Max 3 retries.

## Key Conventions

- **ESM throughout** (`"type": "module"` in package.json), except `cypress.config.js` which **must be CommonJS**.
- **Page Object Model** — specs import POs from `cypress/support/pages/`. POs NEVER call `cy.visit()`.
- **No `cy.intercept()`** — the target app has no backend.
- **No invented selectors** — only selectors from the DOM/selector catalogue.
- **Zod schemas** enforce LLM output structure. Defined in `schemas/`.
- **AST validation** (acorn) + convention checks before writing generated code to disk.
- **Page registry** (`config/pages.config.js`) — add new pages here, not in agent code.
- **Prompt templates** in `prompts/` — external files, edit without code changes.

## Environment Variables (.env)

`OPENAI_API_KEY`, `OPENAI_API_BASE`, `OPENAI_MODEL`, `BASE_URL`, plus LangSmith: `LANGCHAIN_TRACING_V2`, `LANGCHAIN_API_KEY`, `LANGCHAIN_PROJECT`.
