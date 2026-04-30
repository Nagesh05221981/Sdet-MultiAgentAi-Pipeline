import { StructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import fs from 'fs/promises';
import path from 'path';

/**
 * Tool: Write content to a file. Creates parent directories if needed.
 */
export class WriteFileTool extends StructuredTool {
  name = 'write_file';
  description = 'Write content to a file. Provide a relative path and the full file content.';
  schema = z.object({
    filePath: z.string().describe('Relative path to the file, e.g. cypress/e2e/browse-products.cy.js'),
    content: z.string().describe('Full file content to write'),
  });

  constructor(projectRoot) {
    super();
    this.projectRoot = projectRoot;
  }

  async _call({ filePath, content }) {
    const fullPath = path.resolve(this.projectRoot, filePath);
    try {
      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      await fs.writeFile(fullPath, content, 'utf-8');
      return `Successfully wrote ${content.length} characters to ${filePath}`;
    } catch (err) {
      return `Error writing file: ${err.message}`;
    }
  }
}
