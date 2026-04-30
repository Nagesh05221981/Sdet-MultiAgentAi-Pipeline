import { load } from 'cheerio';
import fs from 'fs/promises';
import path from 'path';

/**
 * DOM Parser — Extracts interactive elements from HTML using Cheerio.
 * Produces a structured selector registry that the LLM consumes.
 * The LLM NEVER sees raw HTML — only this parsed output.
 */

/**
 * Parse a page's HTML and extract all interactive elements with ranked selectors.
 * @param {string} htmlPath - Path to the HTML file
 * @returns {object[]} Array of selector entries
 */
export function parseDOM(html) {
  const $ = load(html);
  const selectors = [];
  const seen = new Set();

  // Priority 1: data-cy / data-test attributes (score 100)
  $('[data-cy], [data-test], [data-testid]').each((_, el) => {
    const attr = $(el).attr('data-cy') || $(el).attr('data-test') || $(el).attr('data-testid');
    addSelector(selectors, seen, {
      type: 'data-cy',
      value: `[data-cy="${attr}"]`,
      score: 100,
      tag: el.tagName,
      text: $(el).text().trim().slice(0, 40),
      context: getContext($, el),
    });
  });

  // Priority 2: Elements with ID (score 90)
  $('[id]').each((_, el) => {
    const id = $(el).attr('id');
    if (!id || id.length > 40) return;
    const tag = el.tagName;
    const text = $(el).text().trim().slice(0, 40);
    addSelector(selectors, seen, {
      type: 'id',
      value: `#${id}`,
      score: 90,
      tag,
      text,
      context: getContext($, el),
      interactive: isInteractive(el, $),
    });
  });

  // Priority 3: Buttons with text (score 70)
  $('button').each((_, el) => {
    const text = $(el).text().trim();
    if (!text || text.length > 30) return;
    const id = $(el).attr('id');
    if (id) return; // already captured by ID

    const classes = $(el).attr('class') || '';
    const onclick = $(el).attr('onclick') || '';

    // Use onclick to create a unique selector if available
    let selector;
    if (onclick) {
      selector = `button[onclick="${onclick}"]`;
    } else if (classes) {
      const specificClass = getMostSpecificClass(classes);
      selector = specificClass ? `button.${specificClass}` : null;
    }

    if (selector) {
      addSelector(selectors, seen, {
        type: 'button',
        value: selector,
        containsText: text,
        score: 70,
        tag: 'button',
        text,
        context: getContext($, el),
      });
    }

    // Also add cy.contains pattern
    addSelector(selectors, seen, {
      type: 'contains',
      value: `cy.contains('button', '${escapeQuotes(text)}')`,
      score: 60,
      tag: 'button',
      text,
      context: getContext($, el),
    });
  });

  // Priority 4: Input/select/textarea (score 85)
  $('input, select, textarea').each((_, el) => {
    const id = $(el).attr('id');
    if (id) return; // already captured
    const name = $(el).attr('name');
    const type = $(el).attr('type') || '';
    const placeholder = $(el).attr('placeholder') || '';
    const ariaLabel = $(el).attr('aria-label') || '';
    const classes = $(el).attr('class') || '';

    let selector;
    if (name) selector = `[name="${name}"]`;
    else if (ariaLabel) selector = `[aria-label="${ariaLabel}"]`;
    else if (placeholder) selector = `[placeholder="${placeholder}"]`;
    else if (classes) {
      const cls = getMostSpecificClass(classes);
      if (cls) selector = `${el.tagName}.${cls}`;
    }

    if (selector) {
      addSelector(selectors, seen, {
        type: 'input',
        value: selector,
        score: 85,
        tag: el.tagName,
        text: placeholder || ariaLabel || '',
        inputType: type,
        context: getContext($, el),
      });
    }
  });

  // Priority 5: Links (score 65)
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href');
    if (!href || href === '#') return;
    const text = $(el).text().trim();
    const classes = $(el).attr('class') || '';
    const cls = getMostSpecificClass(classes);
    const selector = cls ? `a.${cls}[href="${href}"]` : `a[href="${href}"]`;

    addSelector(selectors, seen, {
      type: 'link',
      value: selector,
      score: 65,
      tag: 'a',
      text: text.slice(0, 40),
      href,
      context: getContext($, el),
    });
  });

  // Priority 6: Elements with onclick (score 60)
  $('[onclick]').each((_, el) => {
    const tag = el.tagName;
    if (tag === 'BUTTON') return; // already captured
    const onclick = $(el).attr('onclick');
    const classes = $(el).attr('class') || '';
    const text = $(el).text().trim().slice(0, 40);
    const cls = getMostSpecificClass(classes);

    let selector;
    if (cls) selector = `.${cls}`;
    else selector = `${tag.toLowerCase()}[onclick="${onclick}"]`;

    addSelector(selectors, seen, {
      type: 'onclick',
      value: selector,
      score: 60,
      tag: tag.toLowerCase(),
      text,
      onclick,
      context: getContext($, el),
    });
  });

  // Priority 7: Dynamic elements from script tags (score 55)
  const scriptContent = $('script').map((_, el) => $(el).html()).get().join('\n');
  const classPattern = /class="([^"]+)"/g;
  let classMatch;
  while ((classMatch = classPattern.exec(scriptContent)) !== null) {
    const classStr = classMatch[1];
    for (let cls of classStr.split(/\s+/)) {
      cls = cls.replace(/\$\{.*$/, '').replace(/[^a-zA-Z0-9_-]/g, '');
      if (!cls || cls.length < 3) continue;
      if (['active', 'open', 'done', 'selected', 'added'].includes(cls)) continue;
      const selector = `.${cls}`;
      if (seen.has(selector)) continue;

      addSelector(selectors, seen, {
        type: 'dynamic-class',
        value: selector,
        score: 55,
        tag: 'dynamic',
        text: '(rendered by JS)',
        context: 'script template',
      });
    }
  }

  // Extract app messages from script (for verify methods)
  const appMessages = [];
  const msgPatterns = [
    /\.textContent\s*=\s*'([^']{4,})'/g,
    /\.textContent\s*=\s*"([^"]{4,})"/g,
  ];
  for (const pattern of msgPatterns) {
    let match;
    while ((match = pattern.exec(scriptContent)) !== null) {
      const text = match[1];
      if (!appMessages.includes(text)) appMessages.push(text);
    }
  }

  return { selectors, appMessages };
}

// --- Helpers ---

function addSelector(selectors, seen, entry) {
  if (seen.has(entry.value)) return;
  seen.add(entry.value);
  selectors.push(entry);
}

function getContext($, el) {
  const parent = $(el).parent();
  const parentId = parent.attr('id');
  const parentClass = parent.attr('class');
  if (parentId) return `inside #${parentId}`;
  if (parentClass) return `inside .${parentClass.split(/\s+/)[0]}`;
  return '';
}

function isInteractive(el, $) {
  const tag = el.tagName.toLowerCase();
  return ['button', 'input', 'select', 'textarea', 'a'].includes(tag) ||
    $(el).attr('onclick') || $(el).attr('role') === 'button';
}

function getMostSpecificClass(classStr) {
  const classes = classStr.split(/\s+/).filter(c =>
    c.length > 2 &&
    !['active', 'open', 'done', 'selected', 'added', 'visible', 'hidden'].includes(c)
  );
  return classes.sort((a, b) => b.length - a.length)[0] || null;
}

function escapeQuotes(str) {
  return str.replace(/'/g, "\\'");
}
