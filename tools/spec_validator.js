/**
 * Spec Validator — Hard gate that rejects unsafe generated specs.
 * Checks that specs only use PO methods, never raw selectors.
 */

/**
 * Validate a generated spec against PO capabilities.
 * @param {string} specCode - The generated spec code
 * @param {object} capabilities - From po_capability_extractor
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateSpec(specCode, capabilities) {
  const errors = [];

  // Rule 1: No raw cy.get() in spec (except cy.visit and cy.url and cy.fixture)
  const rawGetMatches = [...specCode.matchAll(/cy\.(get|contains|find)\s*\(/g)];
  for (const match of rawGetMatches) {
    const lineNum = specCode.substring(0, match.index).split('\n').length;
    errors.push(`Line ${lineNum}: Raw cy.${match[1]}() found in spec — use PO methods instead`);
  }

  // Rule 2: No raw .should() in spec (except cy.url().should which is ok)
  const shouldMatches = [...specCode.matchAll(/\.should\s*\(/g)];
  for (const match of shouldMatches) {
    // Allow cy.url().should()
    const before = specCode.substring(Math.max(0, match.index - 30), match.index);
    if (before.includes('cy.url()')) continue;
    const lineNum = specCode.substring(0, match.index).split('\n').length;
    errors.push(`Line ${lineNum}: Raw .should() found in spec — use verify methods instead`);
  }

  // Rule 3: All method calls must exist in capabilities
  const allMethods = new Set();
  for (const cap of Object.values(capabilities)) {
    for (const a of cap.actions) {
      allMethods.add(a.split('(')[0]);
    }
    for (const v of cap.verifiers) {
      allMethods.add(v.split('(')[0]);
    }
  }

  // Find method calls in spec: instanceName.methodName(
  const methodCallPattern = /\b(\w+Page)\.\s*(\w+)\s*\(/gi;
  // Also match lowercase: homePage.method(
  const instanceCallPattern = /\b(\w+)\.\s*(\w+)\s*\(/g;
  let callMatch;
  while ((callMatch = instanceCallPattern.exec(specCode)) !== null) {
    const instance = callMatch[1];
    const method = callMatch[2];
    // Skip non-PO calls (testData, cy, etc.)
    if (['cy', 'testData', 'win', 'data', 'console', 'JSON', 'Object', 'window'].includes(instance)) continue;
    if (['then', 'visit', 'fixture', 'url', 'log', 'wait'].includes(method)) continue;
    // Check if this looks like a PO method call
    if (instance.endsWith('Page') || Object.keys(capabilities).some(c => c.toLowerCase() === instance.toLowerCase() || (c.charAt(0).toLowerCase() + c.slice(1)) === instance)) {
      if (!allMethods.has(method)) {
        const lineNum = specCode.substring(0, callMatch.index).split('\n').length;
        errors.push(`Line ${lineNum}: Method '${method}' not found in PO capabilities`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
