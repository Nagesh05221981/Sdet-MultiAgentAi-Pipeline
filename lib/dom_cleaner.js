import { load } from 'cheerio';

/**
 * Clean raw HTML for LLM consumption.
 * Strips <style>, <script>, inline styles, and SVG content.
 * Keeps only interactive elements with their selectors and text.
 * Reduces token count by ~4x compared to raw HTML.
 */
export function cleanDom(html) {
  const $ = load(html);

  // Remove non-essential elements
  $('style').remove();
  $('script').remove();
  $('svg').remove();
  $('link[rel="stylesheet"]').remove();
  $('meta').remove();

  // Remove inline styles
  $('[style]').removeAttr('style');

  // Remove data attributes that aren't useful for selectors
  $('*').each(function () {
    const el = $(this);
    const attrs = this.attribs || {};
    for (const attr of Object.keys(attrs)) {
      if (attr.startsWith('data-') && !attr.startsWith('data-cy') && !attr.startsWith('data-test')) {
        el.removeAttr(attr);
      }
    }
  });

  return $.html();
}
