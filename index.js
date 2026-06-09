import dotenv from 'dotenv';
import fs from 'fs/promises';
import path from 'path';
import { PAGES } from './config/pages.config.js';
import { PIPELINE, VALID_MODES } from './config/pipeline.config.js';
import { generateAllPageObjects } from './agents/PageObjectGenerator.js';
import { runTestCaseDesigner } from './agents/TestCaseDesigner.js';
import { runTestCodeGenerator } from './agents/TestCodeGenerator.js';
import { runCypressSpecs } from './agents/TestRunner.js';
import { runTestFixer } from './agents/TestFixer.js';
import { cleanDom } from './lib/dom_cleaner.js';
import { log, logError } from './lib/logger.js';

dotenv.config();

const PROJECT_ROOT = process.cwd();

/**
 * Resolve pipeline mode from CLI flags or environment variable.
 * --mode=regression | --mode=development | PIPELINE_MODE env var
 * Default: 'development'
 */
function resolveMode() {
  const modeArg = process.argv.find((a) => a.startsWith('--mode='));
  const mode = modeArg ? modeArg.split('=')[1] : (process.env.PIPELINE_MODE || PIPELINE.defaultMode);
  if (!VALID_MODES.includes(mode)) {
    logError('INIT', `Invalid mode "${mode}". Valid modes: ${VALID_MODES.join(', ')}`);
    process.exit(1);
  }
  return mode;
}

/**
 * SDET Multi-Agent Pipeline Orchestrator
 *
 * Modes:
 *   development (default) — full pipeline: design → generate → run → fix
 *   regression            — run existing specs + fix failures (skip generation)
 */

async function main() {
  const mode = resolveMode();
  const ciMode = process.argv.includes('--ci');
  // Extract story slug, ignoring --flags
  const specificStory = process.argv.slice(2).find((a) => !a.startsWith('--'));

  log('INIT', '=== SDET Multi-Agent Pipeline ===');
  log('INIT', `Mode: ${mode}${ciMode ? ' (CI)' : ''}`);
  log('INIT', `Model: ${process.env.OPENAI_MODEL || 'gpt-4o'}`);
  log('INIT', `LangSmith tracing: ${process.env.LANGCHAIN_TRACING_V2 || 'false'}`);

  // ── Verify app is accessible ──
  const baseUrl = process.env.BASE_URL || 'http://localhost:8080';
  try {
    const resp = await fetch(`${baseUrl}/index.html`);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    log('INIT', `App reachable at ${baseUrl}`);
  } catch (err) {
    logError('INIT', `App not reachable at ${baseUrl}. Start it with: python3 -m http.server 8080 -d ecommerceTestApp`, err);
    process.exit(1);
  }

  // ── Regression mode: skip generation, run existing specs ──
  if (mode === 'regression') {
    return runRegression(specificStory, ciMode);
  }

  // ── Development mode: full pipeline ──
  const storiesDir = path.resolve(PROJECT_ROOT, PIPELINE.storiesDir);
  let storyFiles;

  if (specificStory) {
    storyFiles = [`${specificStory}.md`];
    log('INIT', `Running specific story: ${specificStory}`);
  } else if (process.env.USER_STORY) {
    // Ad-hoc inline story
    const slug = 'adhoc-story';
    const adhocPath = path.resolve(storiesDir, `${slug}.md`);
    await fs.writeFile(adhocPath, `# Ad-hoc Story\n\n## User Story\n${process.env.USER_STORY}\n`, 'utf-8');
    storyFiles = [`${slug}.md`];
    log('INIT', 'Running ad-hoc inline story');
  } else {
    const allFiles = await fs.readdir(storiesDir);
    storyFiles = allFiles.filter((f) => f.endsWith('.md'));
    log('INIT', `Found ${storyFiles.length} stories: ${storyFiles.join(', ')}`);
  }

  if (!storyFiles.length) {
    logError('INIT', 'No story files found in stories/');
    process.exit(1);
  }

  // ── Stage 0: Generate Page Objects (once, reused by all stories) ──
  const forceRebuild = process.argv.includes('--force-po');
  await generateAllPageObjects(forceRebuild);

  // ── Read DOM snapshot for the home page (primary context) ──
  const homePage = PAGES.find((p) => p.id === 'home');
  const homeHtml = await fs.readFile(path.resolve(PROJECT_ROOT, homePage.sourceHtml), 'utf-8');
  const homeDom = cleanDom(homeHtml);

  const results = [];

  // ── Stage 1 & 2: Design + Generate for each story (sequential) ──
  for (const file of storyFiles) {
    const slug = file.replace('.md', '');
    log('STORY', `Processing story: ${slug}`);

    try {
      // Read story
      const storyContent = await fs.readFile(path.resolve(storiesDir, file), 'utf-8');

      // Detect ALL pages involved in this story (multi-page flows)
      const pageIds = detectPages(storyContent);
      log('STORY', `Pages involved: ${pageIds.join(', ')}`);

      // Build combined DOM snapshot from all involved pages
      let domSnapshot = '';
      for (const pid of pageIds) {
        const pg = PAGES.find((p) => p.id === pid);
        if (pg) {
          const html = await fs.readFile(path.resolve(PROJECT_ROOT, pg.sourceHtml), 'utf-8');
          domSnapshot += `\n<!-- PAGE: ${pg.name} (${pg.url}) -->\n` + cleanDom(html);
        }
      }

      // Stage 1: Design test cases
      const testCases = await runTestCaseDesigner(slug, storyContent, domSnapshot);

      // Stage 2: Generate Cypress code — pass ALL page IDs for combined catalogue
      await runTestCodeGenerator(slug, testCases, domSnapshot, pageIds);

      results.push({ story: slug, status: 'generated', error: null });
    } catch (err) {
      logError('STORY', `Failed to process story: ${slug}`, err);
      results.push({ story: slug, status: 'generation_failed', error: err.message });
    }
  }

  // ── Stage 3: Run all specs in a single pass ──
  log('RUN', '=== Running all generated specs ===');
  const runResult = await runCypressSpecs('cypress/e2e/**/*.cy.js');

  if (runResult.passed) {
    log('DONE', 'All tests PASSED!');
    printSummary(results, runResult);
    return;
  }

  // ── Stage 4: Fix failures ──
  // Deduplicate by spec — multiple test failures in the same spec get one fix attempt
  const uniqueFailures = [];
  const seenSpecs = new Set();
  for (const failure of runResult.failures) {
    if (!seenSpecs.has(failure.spec)) {
      seenSpecs.add(failure.spec);
      // Combine error messages from all failures in this spec
      const allErrors = runResult.failures
        .filter((f) => f.spec === failure.spec)
        .map((f) => `[${f.failingTest || 'unknown'}] ${f.errorMessage}`)
        .join('\n\n');
      uniqueFailures.push({ ...failure, errorMessage: allErrors });
    }
  }

  log('FIX', `=== ${uniqueFailures.length} failing spec(s) — starting self-heal ===`);

  for (const failure of uniqueFailures) {
    let fixed = false;

    // Determine ALL pages for this spec
    const pageIds = detectPagesFromSpec(failure.spec);

    for (let attempt = 1; attempt <= PIPELINE.maxFixRetries; attempt++) {
      const fixResult = await runTestFixer(failure, '', pageIds, attempt);

      if (!fixResult) {
        log('FIX', `Attempt ${attempt} produced no fix for ${failure.spec}`);
        continue;
      }

      // Re-run the fixed spec
      log('FIX', `Re-running fixed spec: ${failure.spec}`);
      const rerun = await runCypressSpecs(failure.spec);

      if (rerun.passed) {
        log('FIX', `FIXED on attempt ${attempt}: ${failure.spec}`);
        fixed = true;
        break;
      }

      // Update failure context for next attempt
      if (rerun.failures.length > 0) {
        failure.errorMessage = rerun.failures[0].errorMessage;
        failure.failureType = rerun.failures[0].failureType;
      }
    }

    const storySlug = failure.spec.replace('cypress/e2e/', '').replace('.cy.js', '');
    const entry = results.find((r) => r.story === storySlug);
    if (entry) {
      entry.status = fixed ? 'fixed' : 'fix_failed';
    }
  }

  // ── Final summary ──
  printSummary(results, runResult);
}

/**
 * Detect ALL pages involved in a story from its content.
 * Returns an array of page IDs — always includes 'home' as the starting point.
 */
function detectPages(storyContent) {
  const lower = storyContent.toLowerCase();
  const pages = ['home']; // always include home — it's the entry point

  if (lower.includes('checkout') || lower.includes('delivery') || lower.includes('payment') || lower.includes('cart')) {
    pages.push('checkout');
  }
  if (lower.includes('confirmation') || lower.includes('order confirmed') || lower.includes('place order')) {
    pages.push('confirmation');
  }

  return [...new Set(pages)]; // deduplicate
}

/**
 * Detect all pages a spec might be testing from its file path.
 */
function detectPagesFromSpec(specPath) {
  const lower = specPath.toLowerCase();
  const pages = ['home'];
  if (lower.includes('checkout') || lower.includes('cart') || lower.includes('product')) pages.push('checkout');
  if (lower.includes('confirmation') || lower.includes('order')) pages.push('confirmation');
  return [...new Set(pages)];
}

/**
 * Regression mode — run existing specs and self-heal failures.
 * Skips stages 0 (PO gen), 1 (design), and 2 (codegen).
 *
 * Exit codes (CI mode):
 *   0 — all tests passed on first run
 *   1 — tests failed, fixer could not heal
 *   2 — tests failed, fixer healed them (needs human review)
 */
async function runRegression(specificStory, ciMode = false) {
  const specPattern = specificStory
    ? `cypress/e2e/${specificStory}.cy.js`
    : 'cypress/e2e/**/*.cy.js';

  log('REGRESSION', `Running existing specs: ${specPattern}`);

  // ── Stage 3: Run specs ──
  const runResult = await runCypressSpecs(specPattern);

  // Build results from discovered specs
  const results = [];
  if (runResult.passed) {
    results.push({ story: specificStory || 'all-specs', status: 'generated', error: null });
    log('REGRESSION', 'All tests PASSED!');
    printSummary(results, runResult);
    if (ciMode) await writeCiResults(results, false);
    return; // exit 0 — all green
  }

  // ── Stage 4: Fix failures ──
  const uniqueFailures = [];
  const seenSpecs = new Set();
  for (const failure of runResult.failures) {
    if (!seenSpecs.has(failure.spec)) {
      seenSpecs.add(failure.spec);
      const allErrors = runResult.failures
        .filter((f) => f.spec === failure.spec)
        .map((f) => `[${f.failingTest || 'unknown'}] ${f.errorMessage}`)
        .join('\n\n');
      uniqueFailures.push({ ...failure, errorMessage: allErrors });
    }
  }

  // Populate results for each failing spec
  for (const f of uniqueFailures) {
    const slug = f.spec.replace('cypress/e2e/', '').replace('.cy.js', '');
    results.push({ story: slug, status: 'fix_failed', error: f.errorMessage });
  }

  log('FIX', `=== ${uniqueFailures.length} failing spec(s) — starting self-heal ===`);

  for (const failure of uniqueFailures) {
    let fixed = false;
    const pageIds = detectPagesFromSpec(failure.spec);

    for (let attempt = 1; attempt <= PIPELINE.maxFixRetries; attempt++) {
      const fixResult = await runTestFixer(failure, '', pageIds, attempt);

      if (!fixResult) {
        log('FIX', `Attempt ${attempt} produced no fix for ${failure.spec}`);
        continue;
      }

      log('FIX', `Re-running fixed spec: ${failure.spec}`);
      const rerun = await runCypressSpecs(failure.spec);

      if (rerun.passed) {
        log('FIX', `FIXED on attempt ${attempt}: ${failure.spec}`);
        fixed = true;
        break;
      }

      if (rerun.failures.length > 0) {
        failure.errorMessage = rerun.failures[0].errorMessage;
        failure.failureType = rerun.failures[0].failureType;
      }
    }

    const slug = failure.spec.replace('cypress/e2e/', '').replace('.cy.js', '');
    const entry = results.find((r) => r.story === slug);
    if (entry) {
      entry.status = fixed ? 'fixed' : 'fix_failed';
    }
  }

  printSummary(results, runResult);

  // ── CI: write results and exit with appropriate code ──
  if (ciMode) {
    const specsFixed = results.filter((r) => r.status === 'fixed').map((r) => r.story);
    const specsUnfixed = results.filter((r) => r.status === 'fix_failed').map((r) => r.story);
    const fixesApplied = specsFixed.length > 0;

    await writeCiResults(results, fixesApplied);

    if (specsUnfixed.length > 0) {
      log('CI', `Exiting with code 1 — ${specsUnfixed.length} spec(s) still failing`);
      process.exit(1);
    }
    if (fixesApplied) {
      log('CI', `Exiting with code 2 — ${specsFixed.length} spec(s) healed, needs human review`);
      process.exit(2);
    }
  }
}

/**
 * Write CI results JSON for downstream scripts (ci-report.sh).
 */
async function writeCiResults(results, fixesApplied) {
  const specsFixed = results.filter((r) => r.status === 'fixed');
  const specsUnfixed = results.filter((r) => r.status === 'fix_failed');
  const specsPassed = results.filter((r) => r.status === 'generated');

  const ciResults = {
    timestamp: new Date().toISOString(),
    testsRan: results.length,
    testsPassed: specsPassed.length + specsFixed.length,
    testsFailed: specsUnfixed.length,
    fixesApplied,
    specsFixed: specsFixed.map((r) => ({ spec: r.story, error: r.error })),
    specsUnfixed: specsUnfixed.map((r) => ({ spec: r.story, error: r.error })),
  };

  const outPath = path.resolve(PROJECT_ROOT, PIPELINE.ciResultsFile);
  await fs.writeFile(outPath, JSON.stringify(ciResults, null, 2) + '\n', 'utf-8');
  log('CI', `Wrote results to ${PIPELINE.ciResultsFile}`);
}

/**
 * Print a summary table of results.
 */
function printSummary(results, runResult) {
  log('DONE', '\n=== Pipeline Summary ===\n');

  const table = results.map((r) => ({
    Story: r.story,
    Status: r.status === 'generated' ? 'PASS' :
            r.status === 'fixed' ? 'FIXED' :
            r.status === 'generation_failed' ? 'GEN FAIL' :
            'FIX FAIL',
    Error: r.error || '',
  }));

  console.table(table);

  const passed = results.filter((r) => r.status === 'generated' || r.status === 'fixed').length;
  const failed = results.length - passed;
  log('DONE', `\nTotal: ${results.length} stories | ${passed} passed | ${failed} failed`);
}

// ── Run ──
main().catch((err) => {
  logError('ERROR', 'Pipeline crashed', err);
  process.exit(1);
});
