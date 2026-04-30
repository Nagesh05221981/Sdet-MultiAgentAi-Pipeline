import dotenv from 'dotenv';
import fs from 'fs/promises';
import path from 'path';
import { PAGES } from './config/pages.config.js';
import { PIPELINE } from './config/pipeline.config.js';
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
 * SDET Multi-Agent Pipeline Orchestrator
 *
 * Flow:
 * 1. Read all stories from stories/
 * 2. For each story: TestCaseDesigner → TestCodeGenerator (with validation)
 * 3. Run all specs in a single Cypress pass
 * 4. For failures: TestFixer → re-run (max 3 retries per spec)
 * 5. Print summary
 */

async function main() {
  log('INIT', '=== SDET Multi-Agent Pipeline ===');
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

  // ── Discover stories ──
  const storiesDir = path.resolve(PROJECT_ROOT, PIPELINE.storiesDir);
  let storyFiles;
  const specificStory = process.argv[2];

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
