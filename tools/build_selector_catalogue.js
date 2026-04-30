import { StructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import fs from 'fs/promises';
import path from 'path';
import { load } from 'cheerio';

/**
 * Tool: Build a structured selector catalogue from page HTML.
 * Extracts interactive elements grouped by page section.
 * Token-efficient alternative to raw DOM (~40 lines vs 700+).
 */
export class BuildSelectorCatalogueTool extends StructuredTool {
  name = 'build_selector_catalogue';
  description =
    'Build a selector catalogue for a page. Returns all interactive elements with their CSS selectors, text content, and element type. Use this to know which selectors are available in the DOM.';
  schema = z.object({
    pageId: z.string().describe('Page identifier, e.g. "home", "checkout", "confirmation"'),
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

    const htmlPath = path.resolve(this.projectRoot, page.sourceHtml);
    let html;
    try {
      html = await fs.readFile(htmlPath, 'utf-8');
    } catch (err) {
      return `Error reading HTML: ${err.message}`;
    }

    const $ = load(html);
    const catalogue = [];

    // Extract interactive elements
    const selectors = new Set();

    $('button, input, select, textarea, a, [onclick]').each(function () {
      const el = $(this);
      const tag = this.tagName;
      const id = el.attr('id');
      const classes = el.attr('class') || '';
      const text = el.text().trim().slice(0, 50);
      const placeholder = el.attr('placeholder') || '';
      const type = el.attr('type') || '';
      const href = el.attr('href') || '';

      // Build best selector — prefer id, then most specific class
      let selector;
      if (id) {
        selector = `#${id}`;
      } else if (classes) {
        // Use the most specific (longest) class, not the first
        const classList = classes.split(/\s+/).filter((c) => !c.startsWith('active') && !c.startsWith('open') && !c.startsWith('done'));
        const specificClass = classList.sort((a, b) => b.length - a.length)[0] || classList[0];
        selector = specificClass ? `.${specificClass}` : `.${classes.split(/\s+/)[0]}`;
      } else {
        selector = tag;
      }

      // Add this selector
      if (!selectors.has(selector)) {
        selectors.add(selector);
        const entry = { selector, tag, text };
        if (placeholder) entry.placeholder = placeholder;
        if (type) entry.type = type;
        if (href && href !== '#') entry.href = href;
        catalogue.push(entry);
      }

      // Also add ALL unique classes as individual selectors (for discoverable elements)
      if (classes) {
        for (const cls of classes.split(/\s+/)) {
          const clsSel = `.${cls}`;
          if (!selectors.has(clsSel) && cls.length > 2 && !['active', 'open', 'done', 'selected'].includes(cls)) {
            selectors.add(clsSel);
            catalogue.push({ selector: clsSel, tag, text: text || '' });
          }
        }
      }
    });

    // Capture key containers by id or unique class
    $('[id]').each(function () {
      const el = $(this);
      const id = el.attr('id');
      const selector = `#${id}`;
      if (selectors.has(selector)) return;

      const tag = this.tagName;
      const text = el.text().trim().slice(0, 30);
      if (['div', 'section', 'span', 'nav', 'footer'].includes(tag)) {
        selectors.add(selector);
        catalogue.push({ selector, tag, text: text || '(container)' });
      }
    });

    // Extract script content for dynamic element and message scanning
    const scriptTags = html.match(/<script[^>]*>([\s\S]*?)<\/script>/gi) || [];
    const scriptContent = scriptTags.map((t) => t.replace(/<\/?script[^>]*>/gi, '')).join('\n');

    // Extract dynamically rendered elements from JavaScript template literals in <script> tags
    // These elements don't exist in the static HTML but are rendered at runtime
    const classInTemplatePattern = /class="([^"]+)"/g;
    let templateMatch;
    while ((templateMatch = classInTemplatePattern.exec(scriptContent)) !== null) {
      const classStr = templateMatch[1];
      for (let cls of classStr.split(/\s+/)) {
        // Clean template artifacts: "add-btn${inCart?'" → "add-btn"
        cls = cls.replace(/\$\{.*$/, '').replace(/[^a-zA-Z0-9_-]/g, '');
        if (!cls || cls.length < 3) continue;
        const dynSelector = `.${cls}`;
        if (!selectors.has(dynSelector) && !['active', 'open', 'done', 'selected', 'added'].includes(cls)) {
          selectors.add(dynSelector);
          // Try to find context — what element is this class on?
          const contextMatch = scriptContent.match(new RegExp(`<(\\w+)[^>]*class="[^"]*${cls}[^"]*"[^>]*>([^<]{0,50})`));
          const dynTag = contextMatch ? contextMatch[1] : 'dynamic';
          const dynText = contextMatch ? contextMatch[2].trim().slice(0, 40) : '(rendered by JS)';
          catalogue.push({ selector: dynSelector, tag: dynTag, text: dynText || '(rendered by JS)' });
        }
      }
    }

    // Add scoped selectors for elements that have duplicates or need disambiguation
    const scopedPairs = [
      // Auth modal scoped selectors
      { parent: '#form-login', child: '.msubmit', label: 'Login submit button' },
      { parent: '#form-signup', child: '.msubmit', label: 'Signup submit button' },
      { parent: '#form-login', child: '.mmsg', label: 'Login message area' },
      { parent: '#form-signup', child: '.mmsg', label: 'Signup message area' },
      { parent: '#auth-btns', child: '.btn-ghost', label: 'Login nav button — click to open auth modal login tab' },
      { parent: '#auth-btns', child: '.btn-fill', label: 'Sign Up nav button — click to open auth modal signup tab' },
      // Checkout step scoped selectors — each step has its own .next-btn and .back-btn
      { parent: '#sec-1', child: '.next-btn', label: 'Choose Delivery button (Step 1 → Step 2)' },
      { parent: '#sec-2', child: '.next-btn', label: 'Continue to Payment button (Step 2 → Step 3)' },
      { parent: '#sec-3', child: '.next-btn', label: 'Review Order button (Step 3 → Step 4)' },
      { parent: '#sec-4', child: '.next-btn', label: 'Place Order button (Step 4 → Confirmation)' },
      { parent: '#sec-2', child: '.back-btn', label: 'Back to Cart button' },
      { parent: '#sec-3', child: '.back-btn', label: 'Back to Delivery button' },
      { parent: '#sec-4', child: '.back-btn', label: 'Back to Payment button' },
    ];
    for (const pair of scopedPairs) {
      const scopedSelector = `${pair.parent} ${pair.child}`;
      if (!selectors.has(scopedSelector) && $(pair.parent).length && $(pair.parent).find(pair.child).length) {
        selectors.add(scopedSelector);
        const text = $(pair.parent).find(pair.child).text().trim().slice(0, 50);
        catalogue.push({ selector: scopedSelector, tag: 'scoped', text: text || pair.label, scoped: true });
      }
    }

    // Extract actual text content the app displays for key message elements
    const appMessages = [];
    const msgPatterns = [
      /\.textContent\s*=\s*'([^']+)'/g,
      /\.textContent\s*=\s*"([^"]+)"/g,
      /\.className\s*=\s*'mmsg\s+(err|ok)'/g,
    ];
    // Also capture string literals near msg variable assignments
    const msgAssignPatterns = [
      /msg\.textContent\s*=\s*'([^']+)'/g,
      /msg\.textContent\s*=\s*"([^"]+)"/g,
    ];
    const allPatterns = [...msgPatterns, ...msgAssignPatterns];
    for (const pattern of allPatterns) {
      let match;
      while ((match = pattern.exec(scriptContent)) !== null) {
        const text = match[1].replace(/\\'/g, "'").replace(/\\"/g, '"');
        if (text.length > 3 && !appMessages.includes(text) && !text.startsWith('mmsg')) {
          appMessages.push(text);
        }
      }
    }

    // Format as readable text
    let output = `SELECTOR CATALOGUE — ${page.name} (${page.url})\n`;
    output += '='.repeat(60) + '\n\n';

    for (const entry of catalogue) {
      let line = `${entry.selector.padEnd(35)} ${entry.tag.padEnd(10)}`;
      if (entry.text) line += ` "${entry.text}"`;
      if (entry.placeholder) line += ` placeholder="${entry.placeholder}"`;
      if (entry.type) line += ` type="${entry.type}"`;
      if (entry.href) line += ` href="${entry.href}"`;
      output += line + '\n';
    }

    // Append app messages section
    if (appMessages.length) {
      output += '\nACTUAL TEXT CONTENT THE APP DISPLAYS\n';
      output += '-'.repeat(40) + '\n';
      output += 'These are the EXACT strings the app sets on message elements.\n';
      output += 'Use these values in assertions — do NOT guess or paraphrase.\n\n';
      for (const msg of appMessages) {
        output += `  "${msg}"\n`;
      }
    }

    return output;
  }
}
