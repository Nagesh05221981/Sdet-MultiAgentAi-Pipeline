import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import llm from '../lib/llm.js';
import { PIPELINE } from '../config/pipeline.config.js';
import { extractCapabilities, formatCapabilitiesForPrompt } from '../tools/po_capability_extractor.js';
import { log, logError } from '../lib/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');

/**
 * TestFixer — Fixes failing specs using PO capabilities.
 * Only fixes spec code — never touches POs.
 * Uses the same constraint: only PO methods, no raw selectors.
 */

const appModel = await fs.readFile(
  path.resolve(PROJECT_ROOT, 'config/app-model.json'), 'utf-8'
);

export async function runTestFixer(failureContext, domSnapshot, pageIds = ['home'], attempt = 1) {
  const pages = Array.isArray(pageIds) ? pageIds : [pageIds];
  log('FIX', `Fixing ${failureContext.spec} — attempt ${attempt}/${PIPELINE.maxFixRetries} — type: ${failureContext.failureType}`);

  if (failureContext.failureType === 'server_unreachable') {
    logError('FIX', 'Cannot fix — server unreachable.');
    return null;
  }

  // Sync fixture data from app-model (fixes missing testData.appMessages etc.)
  await syncFixtureFromAppModel();

  // Read current spec
  let specCode = '';
  try {
    specCode = await fs.readFile(path.resolve(PROJECT_ROOT, failureContext.spec), 'utf-8');
  } catch (err) {
    logError('FIX', `Cannot read spec: ${failureContext.spec}`, err);
    return null;
  }

  // Read current fixture for context
  let fixtureData = '';
  try {
    fixtureData = await fs.readFile(
      path.resolve(PROJECT_ROOT, 'cypress/fixtures/test-data.json'), 'utf-8'
    );
  } catch { /* no fixture */ }

  // Extract capabilities
  const pagesDir = path.resolve(PROJECT_ROOT, 'cypress/support/pages');
  const capabilities = await extractCapabilities(pagesDir);
  const capabilitiesPrompt = formatCapabilitiesForPrompt(capabilities);

  const prompt = `You are fixing a failing Cypress spec. The spec must ONLY use Page Object methods — no raw cy.get(), cy.contains(), or .should().

## CAPABILITIES (you can ONLY use these methods)
${capabilitiesPrompt}

## APP MODEL
${appModel}

## FIXTURE DATA (available as testData via cy.fixture('test-data'))
${fixtureData}

## FAILURE CONTEXT
Type: ${failureContext.failureType}
Attempt: ${attempt} of ${PIPELINE.maxFixRetries}
Error: ${failureContext.errorMessage}

## CURRENT SPEC (fix this)
${specCode}

## RULES
- Use ONLY methods from CAPABILITIES — do NOT invent methods
- NO cy.get() or cy.contains() in spec — only PO method calls
- NO .should() in spec — use verify methods
- cy.visit() is the only Cypress command allowed directly
- If a method doesn't exist, find the closest available method from CAPABILITIES
- If attempt 2+, try a different approach
- Keep all passing tests unchanged
- ONLY reference keys that actually exist in FIXTURE DATA above
- For state seeding, use testData.stateSeeding keys from the fixture
- For app messages, use testData.appMessages keys from the fixture

Output ONLY the fixed spec code. No explanation. No markdown fences.`;

  try {
    const response = await llm.invoke(prompt);
    let fixedCode = response.content;
    fixedCode = fixedCode.replace(/^```(?:javascript|js)?\n?/gm, '').replace(/```$/gm, '').trim();
    const lastBrace = fixedCode.lastIndexOf('})');
    if (lastBrace > 0) fixedCode = fixedCode.substring(0, lastBrace + 2);

    // Write fixed spec
    await fs.writeFile(path.resolve(PROJECT_ROOT, failureContext.spec), fixedCode + '\n', 'utf-8');
    log('FIX', `Wrote fixed spec: ${failureContext.spec}`);

    return { specCode: fixedCode };
  } catch (err) {
    logError('FIX', `Fix attempt ${attempt} failed`, err);
    return null;
  }
}

/**
 * Sync missing appMessages and stateSeeding from app-model.json into test-data.json.
 * This ensures the fixture has all data the LLM might reference in generated specs.
 */
async function syncFixtureFromAppModel() {
  try {
    const fixturePath = path.resolve(PROJECT_ROOT, 'cypress/fixtures/test-data.json');
    const fixtureRaw = await fs.readFile(fixturePath, 'utf-8');
    const fixture = JSON.parse(fixtureRaw);
    const model = JSON.parse(appModel);

    let updated = false;
    if (model.appMessages && !fixture.appMessages) {
      fixture.appMessages = model.appMessages;
      updated = true;
    }
    if (model.stateSeeding && !fixture.stateSeeding) {
      // Parse pre-serialized JSON strings in localStorage values into real objects
      const parsed = JSON.parse(JSON.stringify(model.stateSeeding));
      for (const [key, seed] of Object.entries(parsed)) {
        if (seed.localStorage) {
          for (const [lsKey, lsVal] of Object.entries(seed.localStorage)) {
            if (typeof lsVal === 'string') {
              try { parsed[key].localStorage[lsKey] = JSON.parse(lsVal); } catch { /* keep as string */ }
            }
          }
        }
      }
      fixture.stateSeeding = parsed;
      updated = true;
    }
    if (updated) {
      await fs.writeFile(fixturePath, JSON.stringify(fixture, null, 2) + '\n', 'utf-8');
      log('FIX', 'Synced missing fixture data from app-model');
    }
  } catch (err) {
    logError('FIX', 'Could not sync fixture from app-model', err);
  }
}
