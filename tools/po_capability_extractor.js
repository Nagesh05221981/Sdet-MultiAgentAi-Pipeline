import fs from 'fs/promises';
import path from 'path';

/**
 * PO Capability Extractor — Extracts method names from PO files.
 * This is the ONLY method list the spec generator LLM can use.
 * If a method isn't in this list, the LLM cannot call it.
 */

/**
 * Extract capabilities from all PO files in a directory.
 * @param {string} pagesDir - Path to cypress/support/pages/
 * @returns {object} { PageName: { actions: [...], verifiers: [...], elements: [...] } }
 */
export async function extractCapabilities(pagesDir) {
  const capabilities = {};

  let files;
  try {
    files = await fs.readdir(pagesDir);
  } catch {
    return capabilities;
  }

  const poFiles = files.filter(f => f.endsWith('-page.js'));

  for (const file of poFiles) {
    const filePath = path.join(pagesDir, file);
    const code = await fs.readFile(filePath, 'utf-8');

    // Extract class name
    const classMatch = code.match(/class\s+(\w+)/);
    const className = classMatch ? classMatch[1] : file.replace('-page.js', 'Page');

    // Extract methods with their parameters
    const methods = [];
    const methodPattern = /^\s{2,4}(\w+)\s*\(([^)]*)\)\s*\{/gm;
    let match;
    while ((match = methodPattern.exec(code)) !== null) {
      const name = match[1];
      if (name === 'constructor') continue;
      const params = match[2].split(',').map(p => p.trim()).filter(Boolean);
      methods.push({ name, params });
    }

    // Classify methods
    const actions = methods.filter(m =>
      !m.name.startsWith('verify') && !m.name.startsWith('get') && !m.name.startsWith('is')
    );
    const verifiers = methods.filter(m =>
      m.name.startsWith('verify') || m.name.startsWith('get') || m.name.startsWith('is')
    );

    // Extract element names from elements = {} block
    const elementNames = [];
    const elPattern = /(\w+)\s*:\s*\(\)\s*=>/g;
    let elMatch;
    while ((elMatch = elPattern.exec(code)) !== null) {
      elementNames.push(elMatch[1]);
    }

    capabilities[className] = {
      fileName: file,
      importPath: file.replace('.js', ''),
      actions: actions.map(a => `${a.name}(${a.params.join(', ')})`),
      verifiers: verifiers.map(v => `${v.name}(${v.params.join(', ')})`),
      elementNames,
    };
  }

  return capabilities;
}

/**
 * Format capabilities as a string for the LLM prompt.
 */
export function formatCapabilitiesForPrompt(capabilities) {
  let output = '';
  for (const [className, cap] of Object.entries(capabilities)) {
    output += `\n${className} (import from '../support/pages/${cap.importPath}.js'):\n`;
    output += `  Actions:\n`;
    for (const a of cap.actions) {
      output += `    - ${className.charAt(0).toLowerCase() + className.slice(1)}.${a}\n`;
    }
    output += `  Verify Methods:\n`;
    for (const v of cap.verifiers) {
      output += `    - ${className.charAt(0).toLowerCase() + className.slice(1)}.${v}\n`;
    }
    if (cap.elementNames && cap.elementNames.length) {
      output += `  Element Names (valid values for dynamic methods): ${cap.elementNames.join(', ')}\n`;
    }
  }
  return output;
}
