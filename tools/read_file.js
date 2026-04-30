import { StructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import fs from 'fs/promises';
import path from 'path';

/**
 * Tool: Read a file from the project directory.
 */
export class ReadFileTool extends StructuredTool {
  name = 'read_file';
  description = 'Read the contents of a file. Provide a relative path from the project root.';
  schema = z.object({
    filePath: z.string().describe('Relative path to the file, e.g. stories/browse-products.md'),
  });

  constructor(projectRoot) {
    super();
    this.projectRoot = projectRoot;
  }

  async _call({ filePath }) {
    const fullPath = path.resolve(this.projectRoot, filePath);
    try {
      const content = await fs.readFile(fullPath, 'utf-8');
      return content;
    } catch (err) {
      return `Error reading file: ${err.message}`;
    }
  }
}
