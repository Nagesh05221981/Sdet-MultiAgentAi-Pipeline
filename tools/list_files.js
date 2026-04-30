import { StructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import fs from 'fs/promises';
import path from 'path';

/**
 * Tool: List files in a directory.
 */
export class ListFilesTool extends StructuredTool {
  name = 'list_files';
  description = 'List all files in a directory. Returns file names, one per line.';
  schema = z.object({
    dirPath: z.string().describe('Relative path to the directory, e.g. cypress/e2e'),
  });

  constructor(projectRoot) {
    super();
    this.projectRoot = projectRoot;
  }

  async _call({ dirPath }) {
    const fullPath = path.resolve(this.projectRoot, dirPath);
    try {
      const entries = await fs.readdir(fullPath, { withFileTypes: true });
      const files = entries.map((e) => (e.isDirectory() ? `${e.name}/` : e.name));
      return files.length ? files.join('\n') : '(empty directory)';
    } catch (err) {
      return `Error listing directory: ${err.message}`;
    }
  }
}
