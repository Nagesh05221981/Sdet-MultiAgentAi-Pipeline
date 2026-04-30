import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import llm from '../lib/llm.js';
import { PIPELINE } from '../config/pipeline.config.js';
import { extractCapabilities, formatCapabilitiesForPrompt } from '../tools/po_capability_extractor.js';
import { validateSpec } from '../tools/spec_validator.js';
import { log, logError } from '../lib/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');

/**
 * TestCodeGenerator — Spec-Only Generation
 *
 * 1. Extracts PO capabilities (method list)
 * 2. LLM generates spec using ONLY PO methods — no raw selectors
 * 3. Validator rejects specs with cy.get() or .should()
 * 4. Retry if validation fails
 */

const promptTemplate = await fs.readFile(
  path.resolve(PROJECT_ROOT, 'prompts/generate_test_script.txt'),
  'utf-8'
);

const appModel = await fs.readFile(
  path.resolve(PROJECT_ROOT, 'config/app-model.json'),
  'utf-8'
);

/**
 * Run the spec generator.
 */
export async function runTestCodeGenerator(storySlug, testCases, domSnapshot, pageIds = ['home']) {
  log('GENERATE', `Generating spec for: ${storySlug}`);

  // Step 1: Extract PO capabilities
  const pagesDir = path.resolve(PROJECT_ROOT, 'cypress/support/pages');
  const capabilities = await extractCapabilities(pagesDir);
  const capabilitiesPrompt = formatCapabilitiesForPrompt(capabilities);
  log('GENERATE', `Extracted capabilities from ${Object.keys(capabilities).length} POs`);

  // Step 2: Read test data
  let testDataInfo = '';
  try {
    const fixtureRaw = await fs.readFile(
      path.resolve(PROJECT_ROOT, 'cypress/fixtures/test-data.json'), 'utf-8'
    );
    testDataInfo = `Available fixture data:\n${fixtureRaw}`;
  } catch { /* no fixture */ }

  // Step 3: Build prompt
  const prompt = promptTemplate
    .replace('{test_cases_json}', JSON.stringify(testCases, null, 2))
    .replace('{capabilities}', capabilitiesPrompt)
    .replace('{app_model}', appModel)
    .replace('{test_data_info}', testDataInfo);

  let lastError;

  for (let attempt = 1; attempt <= PIPELINE.maxValidationRetries; attempt++) {
    try {
      log('GENERATE', `LLM call attempt ${attempt}/${PIPELINE.maxValidationRetries}`);
      const response = await llm.invoke(prompt);
      let specCode = response.content;

      // Clean markdown fences and trailing explanation text
      specCode = specCode.replace(/^```(?:javascript|js)?\n?/gm, '').replace(/```$/gm, '').trim();
      // Remove anything after the last closing }) — the LLM sometimes adds explanation text
      const lastBrace = specCode.lastIndexOf('})');
      if (lastBrace > 0) {
        specCode = specCode.substring(0, lastBrace + 2);
      }

      // Step 4: Validate — no raw selectors, only PO methods
      const validation = validateSpec(specCode, capabilities);
      if (!validation.valid) {
        log('VALIDATE', `Spec validation failed (${validation.errors.length} errors):`);
        for (const err of validation.errors.slice(0, 5)) {
          log('VALIDATE', `  ${err}`);
        }
        // On last attempt, write anyway and let Cypress catch runtime errors
        if (attempt < PIPELINE.maxValidationRetries) {
          lastError = validation.errors.join('; ');
          continue;
        }
        log('VALIDATE', 'Writing spec despite validation errors (last attempt)');
      }

      // Step 5: Write spec file
      const specFileName = `${storySlug}.cy.js`;
      const specPath = path.resolve(PROJECT_ROOT, 'cypress/e2e', specFileName);
      await fs.mkdir(path.dirname(specPath), { recursive: true });
      await fs.writeFile(specPath, specCode + '\n', 'utf-8');
      log('GENERATE', `Wrote spec: cypress/e2e/${specFileName}`);

      // Save generated data for fixer
      const dataPath = path.resolve(PROJECT_ROOT, `cypress/test-cases/${storySlug}.generated.json`);
      await fs.writeFile(dataPath, JSON.stringify({ specCode, testCases }, null, 2), 'utf-8');

      return { specFileName, specCode };
    } catch (err) {
      lastError = err.message;
      logError('GENERATE', `Attempt ${attempt} failed`, err);
    }
  }

  throw new Error(`TestCodeGenerator failed for ${storySlug}: ${lastError}`);
}
