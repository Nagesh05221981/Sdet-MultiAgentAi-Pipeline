import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import llm from '../lib/llm.js';
import { TestCaseSchema } from '../schemas/test_case.schema.js';
import { log, logError } from '../lib/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');

/**
 * TestCaseDesigner — Agent 1
 * Reads a user story + App Model and produces structured test cases.
 * The App Model replaces the DOM snapshot — it tells the LLM about
 * pages, flows, button prerequisites, navigation, and state.
 */

// Load prompt template
const promptTemplate = await fs.readFile(
  path.resolve(PROJECT_ROOT, 'prompts/design_test_cases.txt'),
  'utf-8'
);

// Load app model (once at startup)
const appModel = await fs.readFile(
  path.resolve(PROJECT_ROOT, 'config/app-model.json'),
  'utf-8'
);

// Load test data fixture
let testData = '{}';
try {
  testData = await fs.readFile(
    path.resolve(PROJECT_ROOT, 'cypress/fixtures/test-data.json'),
    'utf-8'
  );
} catch {
  log('DESIGN', 'No test-data.json fixture found — continuing without it');
}

// Structured output model
const structuredLlm = llm.withStructuredOutput(TestCaseSchema);

/**
 * Run the TestCaseDesigner agent.
 * @param {string} storySlug - Story filename without extension
 * @param {string} storyContent - Full markdown content of the story
 * @param {string} domSnapshot - Cleaned DOM snapshot (kept for backward compat but app model is primary)
 * @returns {object} Validated test cases matching TestCaseSchema
 */
export async function runTestCaseDesigner(storySlug, storyContent, domSnapshot) {
  log('DESIGN', `Designing test cases for: ${storySlug}`);

  const prompt = promptTemplate
    .replace('{user_story}', storyContent)
    .replace('{app_model}', appModel)
    .replace('{test_data}', testData);

  try {
    const result = await structuredLlm.invoke(prompt);
    log('DESIGN', `Generated ${result.cases.length} test cases for "${result.feature}"`);

    // Save to disk
    const outputPath = path.resolve(PROJECT_ROOT, `cypress/test-cases/${storySlug}.json`);
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, JSON.stringify(result, null, 2), 'utf-8');
    log('DESIGN', `Saved test cases to: cypress/test-cases/${storySlug}.json`);

    return result;
  } catch (err) {
    logError('DESIGN', `Failed to design test cases for ${storySlug}`, err);
    throw err;
  }
}
