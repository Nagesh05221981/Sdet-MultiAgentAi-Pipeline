import Handlebars from 'handlebars';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = path.resolve(__dirname, '..', 'templates');

// --- Handlebars helpers ---

Handlebars.registerHelper('lowerFirst', (str) => {
  if (!str) return '';
  return str.charAt(0).toLowerCase() + str.slice(1);
});

Handlebars.registerHelper('joinArgs', (params) => {
  if (!params || !params.length) return '';
  return params.join(', ');
});

Handlebars.registerHelper('locatorConst', (locatorKey) => {
  return resolveLocatorRef(locatorKey);
});

Handlebars.registerHelper('resolveLocator', (locatorKey) => {
  return resolveLocatorRef(locatorKey);
});

Handlebars.registerHelper('renderGetter', (getter) => {
  let chain = `cy.get(${resolveLocatorRef(getter.locator)})`;
  if (getter.index !== null && getter.index !== undefined) {
    // {index} = param reference, number = literal
    const idx = String(getter.index);
    if (idx.startsWith('{')) {
      chain += `.eq(${idx.replace(/[{}]/g, '')})`;
    } else {
      chain += `.eq(${getter.index})`;
    }
  }
  if (getter.childLocator) {
    chain += `.find(${resolveLocatorRef(getter.childLocator)})`;
  }
  return chain;
});

Handlebars.registerHelper('getterParams', (getter) => {
  const params = [];
  if (getter.index !== null && getter.index !== undefined) {
    const idx = String(getter.index);
    if (idx.startsWith('{')) {
      params.push(idx.replace(/[{}]/g, ''));
    }
  }
  return params.join(', ');
});

/**
 * Resolve a locator reference: if it's an UPPER_SNAKE_CASE constant name, use it directly.
 * If it looks like a raw CSS selector (#id, .class), wrap in quotes.
 */
function resolveLocatorRef(loc) {
  if (!loc) return "''";
  // UPPER_SNAKE_CASE = constant reference
  if (/^[A-Z][A-Z0-9_]+$/.test(loc)) return loc;
  // Raw CSS selector — wrap in quotes
  return `'${escapeStr(loc)}'`;
}

Handlebars.registerHelper('renderStep', (step) => {
  const loc = resolveLocatorRef(step.locator);

  // Format the value — {param} → variable, otherwise string literal
  const formatValue = (val) => {
    if (!val) return '';
    if (/^\{(\w+)\}$/.test(val)) return val.replace(/^\{/, '').replace(/\}$/, '');
    return `'${escapeStr(val)}'`;
  };

  // Build the chain: cy.get(LOC).eq(n).find(CHILD).action(value)
  let chain = `cy.get(${loc})`;

  // .eq(index) — for selecting nth element from a list
  if (step.index !== null && step.index !== undefined) {
    if (typeof step.index === 'string' && /^\{/.test(step.index)) {
      chain += `.eq(${step.index.replace(/[{}]/g, '')})`;
    } else {
      chain += `.eq(${step.index})`;
    }
  }

  // .find(childLocator) — for selecting a child element
  if (step.childLocator) {
    chain += `.find(${resolveLocatorRef(step.childLocator)})`;
  }

  switch (step.type) {
    case 'click':
      return `  ${chain}.click();`;
    case 'type':
      return `  ${chain}.clear().type(${formatValue(step.value)});`;
    case 'clear':
      return `  ${chain}.clear();`;
    case 'select':
      return `  ${chain}.select(${formatValue(step.value)});`;
    case 'check':
      return `  ${chain}.check();`;
    case 'uncheck':
      return `  ${chain}.uncheck();`;
    case 'contains-click':
      return `  ${chain}.contains(${formatValue(step.value)}).click();`;
    default:
      return `  ${chain}.${step.type}();`;
  }
});

Handlebars.registerHelper('formatArgs', (args) => {
  if (!args || !args.length) return '';
  return args.map((a) => `'${escapeStr(a)}'`).join(', ');
});

/**
 * Format args with test data fixture support.
 * Args starting with "testData." are rendered as variable references.
 * Other args are rendered as string literals.
 */
Handlebars.registerHelper('formatTestDataArgs', (args) => {
  if (!args || !args.length) return '';
  return args.map((a) => {
    if (a && a.startsWith('testData.')) {
      return a; // variable reference — no quotes
    }
    return `'${escapeStr(a)}'`; // string literal
  }).join(', ');
});

/**
 * Escape special characters in strings for safe JS string literals.
 */
function escapeStr(s) {
  if (!s) return '';
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n').replace(/\r/g, '');
}

Handlebars.registerHelper('escapeValue', (val) => {
  if (!val) return '';
  return escapeStr(val);
});

/**
 * Render a single test step — either an action or an assertion.
 * Actions render as: Page.method(args);
 * Assertions render as: Page.getter().should('...', 'value');
 */
Handlebars.registerHelper('renderTestStep', (step) => {
  if (step.stepType === 'action') {
    // Render action: pageName.call(args); — camelCase instance name
    const pageClass = step.page || 'UnknownPage';
    const page = pageClass.charAt(0).toLowerCase() + pageClass.slice(1);
    const call = step.call || 'unknownMethod';
    let argsStr = '';
    if (step.args && step.args.length) {
      argsStr = step.args.map((a) => {
        if (a && a.startsWith('testData.')) return a;
        return `'${escapeStr(a)}'`;
      }).join(', ');
    }
    return `    ${page}.${call}(${argsStr});`;
  }

  if (step.stepType === 'assertion') {
    // Render assertion: page.getter().should('should', value); — lowercase instance name
    const pageClass = step.page || 'UnknownPage';
    const page = pageClass.charAt(0).toLowerCase() + pageClass.slice(1);
    const getter = step.getter || 'unknownGetter';
    const should = step.should || 'exist';
    let valueStr = '';
    if (step.value) {
      if (step.value.startsWith('testData.')) {
        valueStr = `, ${step.value}`;
      } else {
        valueStr = `, '${escapeStr(step.value)}'`;
      }
    }
    return `    ${page}.${getter}().should('${should}'${valueStr});`;
  }

  return `    // Unknown step type: ${step.stepType}`;
});

/**
 * Render an assertion value — fixture references become variable references (no quotes).
 */
Handlebars.registerHelper('assertionValue', (val) => {
  if (!val) return '';
  // testData.x.y.z → variable reference, no quotes
  if (val.startsWith('testData.')) return `, ${val}`;
  // string literal, with quotes
  return `, '${escapeStr(val)}'`;
});

// --- Template loader + compiler ---

const templateCache = {};

async function loadTemplate(name) {
  if (templateCache[name]) return templateCache[name];
  const filePath = path.resolve(TEMPLATES_DIR, `${name}.hbs`);
  const source = await fs.readFile(filePath, 'utf-8');
  const compiled = Handlebars.compile(source, { noEscape: true });
  templateCache[name] = compiled;
  return compiled;
}

/**
 * Render a page object file from structured data.
 * @param {object} poData - { fileName, locators, actions, getters }
 * @returns {string} Rendered JavaScript source code
 */
export async function renderPageObject(poData) {
  const template = await loadTemplate('page-object');
  return template(poData);
}

/**
 * Render a spec file from structured data.
 * @param {object} specData - { fileName, describe, pageImports, visitUrl, tests }
 * @returns {string} Rendered JavaScript source code
 */
export async function renderSpec(specData) {
  // Load app model stateSeeding definitions
  let stateSeedings = {};
  try {
    const appModelPath = path.resolve(TEMPLATES_DIR, '..', 'config', 'app-model.json');
    const appModel = JSON.parse(await fs.readFile(appModelPath, 'utf-8'));
    stateSeedings = appModel.stateSeeding || {};
  } catch {
    // no app model or no stateSeeding section
  }

  // For each test that has stateSeeding, generate the seeding code
  const enrichedData = {
    ...specData,
    tests: specData.tests.map((test) => {
      if (!test.stateSeeding || !stateSeedings[test.stateSeeding]) {
        return test;
      }
      const seed = stateSeedings[test.stateSeeding];
      const localStorage = seed.localStorage || {};
      let code = `    cy.visit('${specData.visitUrl}', {\n`;
      code += `      onBeforeLoad(win) {\n`;
      for (const [key, value] of Object.entries(localStorage)) {
        code += `        win.localStorage.setItem('${escapeStr(key)}', '${escapeStr(value)}');\n`;
      }
      code += `      }\n`;
      code += `    });`;
      return { ...test, seedingCode: code };
    }),
  };

  const template = await loadTemplate('spec');
  return template(enrichedData);
}
