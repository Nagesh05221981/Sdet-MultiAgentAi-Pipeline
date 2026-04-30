import { StructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import fs from 'fs/promises';
import path from 'path';

/**
 * Tool: Scan existing Page Objects and return a summary index.
 * This prevents the generator from overwriting existing POs
 * and helps it reuse methods that already exist.
 */
export class GetPageObjectIndexTool extends StructuredTool {
  name = 'get_page_object_index';
  description =
    'Get an index of all existing Page Objects. Returns class names, file paths, and method signatures. Use this to reuse existing Page Objects instead of creating duplicates.';
  schema = z.object({});

  constructor(projectRoot) {
    super();
    this.projectRoot = projectRoot;
    this.pagesDir = path.resolve(projectRoot, 'cypress/support/pages');
  }

  async _call() {
    let files;
    try {
      files = await fs.readdir(this.pagesDir);
    } catch {
      return 'No Page Objects exist yet. You may create new ones.';
    }

    const jsFiles = files.filter((f) => f.endsWith('.js'));
    if (!jsFiles.length) {
      return 'No Page Objects exist yet. You may create new ones.';
    }

    let index = 'EXISTING PAGE OBJECTS\n' + '='.repeat(40) + '\n\n';

    for (const file of jsFiles) {
      const filePath = path.join(this.pagesDir, file);
      const content = await fs.readFile(filePath, 'utf-8');

      // Extract class name
      const classMatch = content.match(/class\s+(\w+)/);
      const className = classMatch ? classMatch[1] : file.replace('.js', '');

      // Extract method names
      const methodMatches = [...content.matchAll(/^\s+(\w+)\s*\([^)]*\)\s*\{/gm)];
      const methods = methodMatches
        .map((m) => m[1])
        .filter((m) => m !== 'constructor');

      index += `File: cypress/support/pages/${file}\n`;
      index += `Class: ${className}\n`;
      index += `Methods: ${methods.length ? methods.join(', ') : '(none)'}\n\n`;
    }

    return index;
  }
}
