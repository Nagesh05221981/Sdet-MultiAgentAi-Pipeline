import { StructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import fs from 'fs/promises';
import path from 'path';
import { cleanDom } from '../lib/dom_cleaner.js';

/**
 * Tool: Read and clean a DOM snapshot for LLM consumption.
 * Falls back to reading the source HTML if no snapshot exists.
 */
export class ReadDomSnapshotTool extends StructuredTool {
  name = 'read_dom_snapshot';
  description =
    'Read a cleaned DOM snapshot for a page. Provide the page id (e.g. "home", "checkout", "confirmation"). Returns cleaned HTML with only interactive elements.';
  schema = z.object({
    pageId: z.string().describe('Page identifier from pages.config.js, e.g. "home"'),
  });

  constructor(projectRoot, pagesConfig) {
    super();
    this.projectRoot = projectRoot;
    this.pagesConfig = pagesConfig;
  }

  async _call({ pageId }) {
    const page = this.pagesConfig.find((p) => p.id === pageId);
    if (!page) {
      return `Error: Unknown page id "${pageId}". Available: ${this.pagesConfig.map((p) => p.id).join(', ')}`;
    }

    // Try snapshot first, fall back to source HTML
    const snapshotPath = path.resolve(this.projectRoot, 'cypress/dom-snapshots', `${page.domSnapshotId}.html`);
    const sourcePath = path.resolve(this.projectRoot, page.sourceHtml);

    let html;
    try {
      html = await fs.readFile(snapshotPath, 'utf-8');
    } catch {
      try {
        html = await fs.readFile(sourcePath, 'utf-8');
      } catch (err) {
        return `Error: Could not read DOM for page "${pageId}": ${err.message}`;
      }
    }

    return cleanDom(html);
  }
}
