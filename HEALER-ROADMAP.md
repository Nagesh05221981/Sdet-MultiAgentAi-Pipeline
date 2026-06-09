# Self-Healing Architecture — Design Document & Roadmap

## 1. Problem Statement

The current `TestFixer.js` agent rewrites **spec files** when tests fail. This violates production-ready healing principles:

- It changes test intent, assertions, and business flow to make tests pass
- It hides real bugs by rewriting assertions
- It breaks auditability — specs change without code change
- It has no failure classification — all failures are treated the same
- It targets the wrong layer — specs instead of Page Objects

---

## 2. Current State Analysis

### Current Flow (WRONG)

```
Test fails
  → Read spec file
  → Send entire spec + error to LLM
  → LLM rewrites spec
  → Overwrite spec on disk
  → Re-run
```

### Violations Found

| # | Violation | Severity | Evidence |
|---|---|---|---|
| 1 | Heals spec code instead of Page Objects | Critical | `TestFixer.js` line 80: writes to spec file |
| 2 | No failure classification | Critical | Only gate is `server_unreachable` (line 26) |
| 3 | Can modify test assertions | Critical | LLM prompt has no assertion-protection guard |
| 4 | Can modify test steps | Critical | Prompt says "fix this spec" — no scope limit |
| 5 | Can modify business flow | Critical | No flow-preservation constraint |
| 6 | Can modify test data references | Critical | No data-preservation constraint |
| 7 | Healing is run-driven, not event-driven | High | Heals on every failure regardless of type |
| 8 | No selector ranking awareness | High | No concept of selector priority |
| 9 | Entire spec is in blast radius | High | Full file rewrite, not targeted fix |
| 10 | No distinction between PO bug and app bug | Critical | All failures get "fixed" |

---

## 3. Target State — Correct Healing Architecture

### Correct Flow

```
Test fails
  → Classify failure (selector vs non-selector)
  → If selector failure:
      → Identify broken selector in Page Object
      → Find higher-ranked replacement
      → Heal ONLY that selector in the PO
      → Re-run test
  → If non-selector failure:
      → Report as real bug
      → NO healing
```

### Healing Scope Rules

#### ALLOWED to Heal

| Area | Why |
|---|---|
| Selectors inside Page Objects | DOM drift tolerant |
| Selector priority / ranking | Improves stability |
| Wait strategy (retry, visibility) | Reduces flakiness |
| Fallback selectors | Safe recovery |

#### NOT ALLOWED to Heal

| Area | Why |
|---|---|
| Test steps | Changes test intent |
| Assertions | Hides real bugs |
| Business flow | Invalidates coverage |
| Test data values | Masks data issues |
| Spec structure | Breaks auditability |

### Failure Classification

#### Healable (selector-related)

```
"Timed out retrying: Expected to find element"
"Expected to find element: X, but never found it"
"Element not found"
"Detached from DOM"
"Element not visible"
"Cannot call click on undefined"
"cy.get() yielded empty"
```

#### NOT Healable (real bugs — report only)

```
"expected true to equal false"
"expected X to contain Y" (assertion on text/value)
"API returned 500"
"Checkout total incorrect"
"Validation message missing"
"cy.type() cannot accept an empty string"
"Status code was 4xx/5xx"
```

### Decision Rule

```
IF error matches healable pattern
  AND failure is inside a Page Object method
  AND a higher-ranked selector exists
  → HEAL the Page Object

ELSE
  → REPORT as bug, do NOT heal
```

---

## 4. New Components

### 4.1 FailureClassifier (`agents/FailureClassifier.js`)

**Purpose:** Classify every failure before any healing attempt.

**Input:** Error message string from Cypress failure
**Output:** `{ type: 'selector' | 'assertion' | 'logic' | 'server', healable: boolean, reason: string }`

**Logic:**
```
SELECTOR_PATTERNS = [
  /timed out retrying.*find element/i,
  /expected to find element/i,
  /element not found/i,
  /detached from DOM/i,
  /not visible/i,
  /yielded empty/i,
  /cannot call \w+ on undefined/i,
]

ASSERTION_PATTERNS = [
  /expected.*to equal/i,
  /expected.*to contain/i,
  /expected.*to be/i,
  /assertion failed/i,
  /status code/i,
]

For each error:
  1. Match against SELECTOR_PATTERNS → healable
  2. Match against ASSERTION_PATTERNS → not healable (real bug)
  3. No match → not healable (unknown, report for manual review)
```

### 4.2 PageObjectHealer (`agents/PageObjectHealer.js`)

**Purpose:** Heal broken selectors inside Page Objects. Never touches specs.

**Input:** Failure context + DOM snapshot + current PO code
**Output:** Updated PO file with fixed selector

**Healing Strategy:**
```
1. Parse error to extract the broken selector
2. Read the Page Object file containing that selector
3. Read the current DOM snapshot of the page
4. Find the target element using alternative strategies:
   a. #id (highest priority)
   b. [data-testid] / [data-cy]
   c. Unique class
   d. Parent#id > tag.class chain
   e. cy.contains('selector', 'text')
5. Replace ONLY the broken selector line in the PO
6. Validate the new selector against DOM
7. Write the updated PO file
```

**Constraints:**
- Only modify the getter line containing the broken selector
- Never add/remove methods
- Never change method signatures
- Never touch spec files
- Max 1 selector change per healing attempt

### 4.3 Updated Orchestrator Logic (`index.js`)

**Current Stage 4 (lines 146-182):**
```js
// WRONG: heals everything, rewrites specs
for (const failure of uniqueFailures) {
  await runTestFixer(failure, ...);
}
```

**New Stage 4:**
```js
for (const failure of uniqueFailures) {
  const classification = classifyFailure(failure.errorMessage);

  if (classification.healable) {
    log('HEAL', `Selector failure — healing PO: ${classification.reason}`);
    const healed = await runPageObjectHealer(failure, pageIds);
    if (healed) {
      const rerun = await runCypressSpecs(failure.spec);
      if (rerun.passed) {
        log('HEAL', `HEALED: ${failure.spec}`);
      }
    }
  } else {
    log('BUG', `Real bug detected — not healing`);
    log('BUG', `Type: ${classification.type}`);
    log('BUG', `Error: ${failure.errorMessage}`);
    // Add to bug report, no file modifications
  }
}
```

---

## 5. File Changes Summary

| File | Action | Description |
|---|---|---|
| `agents/FailureClassifier.js` | **CREATE** | Classify failures as healable or not |
| `agents/PageObjectHealer.js` | **CREATE** | Heal PO selectors only |
| `agents/TestFixer.js` | **DELETE** | Replaced by FailureClassifier + PageObjectHealer |
| `index.js` | **MODIFY** | Add classification gate before healing |
| `config/pipeline.config.js` | **MODIFY** | Add healing patterns and selector priority |
| `config/healing-patterns.js` | **CREATE** | Centralized regex patterns for classification |

---

## 6. Roadmap

### Phase 1: Foundation (Week 1)

| Task | Priority | Description |
|---|---|---|
| 1.1 Create `FailureClassifier.js` | P0 | Regex-based failure classification |
| 1.2 Create `healing-patterns.js` | P0 | Centralized healable/non-healable patterns |
| 1.3 Add classification gate to `index.js` | P0 | Block healing for non-selector failures |
| 1.4 Write unit tests for classifier | P0 | Cover all known failure patterns |

**Outcome:** No more healing of assertion failures. Real bugs are reported, not hidden.

### Phase 2: Page Object Healer (Week 2)

| Task | Priority | Description |
|---|---|---|
| 2.1 Create `PageObjectHealer.js` | P0 | Heal broken selectors in PO files |
| 2.2 Add selector ranking logic | P0 | id > data-testid > class > chain |
| 2.3 Add DOM validation after heal | P1 | Verify new selector resolves |
| 2.4 Delete `TestFixer.js` | P0 | Remove spec-rewriting agent |
| 2.5 Update orchestrator to use new healer | P0 | Wire FailureClassifier → PageObjectHealer |

**Outcome:** Healing targets the correct layer. Specs are never modified by the healer.

### Phase 3: Pipeline Separation (Week 3)

| Task | Priority | Description |
|---|---|---|
| 3.1 Add `--generate-only` flag | P1 | LLM runs, produces specs + POs, no execution |
| 3.2 Add `--test-only` flag (default) | P1 | `cypress run` only, no LLM |
| 3.3 Add `--heal-only` flag | P1 | Event-driven healing from failure context |
| 3.4 Add `DISABLE_LLM` hard gate | P1 | Prevent accidental LLM calls in CI |
| 3.5 Update `package.json` scripts | P1 | `generate`, `test`, `heal` as separate commands |

**Outcome:** Two separate pipelines — generation (LLM) and execution (CI). LLM never runs in CI.

### Phase 4: Optimization (Week 4)

| Task | Priority | Description |
|---|---|---|
| 4.1 Add hash-based regeneration skip | P2 | `sha256(po + dom + testCase + prompt)` |
| 4.2 Add healing audit log | P2 | Track what was healed, when, why |
| 4.3 Add healing metrics | P2 | Success rate, avg attempts, common failure types |
| 4.4 Add fallback selector support | P2 | PO getters try multiple selectors |
| 4.5 CI integration guide | P2 | Document CI setup with `DISABLE_LLM` gate |

**Outcome:** Cost-safe, audit-safe, production-ready pipeline.

---

## 7. Success Criteria

| Metric | Current | Target |
|---|---|---|
| Spec files modified by healer | Yes (every failure) | Never |
| Assertion failures healed | Yes (hidden) | Never — reported as bugs |
| Healing target | Spec file | Page Object selector only |
| Failure classification | None | 100% classified before healing |
| LLM calls in CI | Every run | Zero (hard gate) |
| Healing trigger | Run-driven | Event-driven |
| Specs committed to git | No | Yes — treated as source code |

---

## 8. Risk Assessment

| Risk | Impact | Mitigation |
|---|---|---|
| Classifier misses a pattern | Heals a real bug | Conservative default: unknown = don't heal |
| PO healer breaks a working selector | Test regression | DOM validation after every heal |
| LLM generates invalid selector | Wasted retry | Cheerio validation before writing |
| Hash collision skips needed regeneration | Stale tests | Include prompt version in hash |

---

## 9. Key Principle

> **Treat LLM-generated tests exactly like human-written tests.**
> Generate once → review → commit → run many times.
> Healing fixes the plumbing (selectors), not the tests.
