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

  // Read current spec
  let specCode = '';
  try {
    specCode = await fs.readFile(path.resolve(PROJECT_ROOT, failureContext.spec), 'utf-8');
  } catch (err) {
    logError('FIX', `Cannot read spec: ${failureContext.spec}`, err);
    return null;
  }

  // Extract capabilities
  const pagesDir = path.resolve(PROJECT_ROOT, 'cypress/support/pages');
  const capabilities = await extractCapabilities(pagesDir);
  const capabilitiesPrompt = formatCapabilitiesForPrompt(capabilities);

  const prompt = `You are fixing a failing Cypress spec. The spec must ONLY use Page Object methods — no raw cy.get(), cy.contains(), or .should().

## CAPABILITIES (you can ONLY use these methods)
${capabilitiesPrompt}

## APP MODEL
${appModel}

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
