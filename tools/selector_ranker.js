/**
 * Selector Ranker — Scores and ranks selectors for stability.
 * Promotes stable selectors (data-cy, #id), demotes fragile ones.
 * Learns from failures: if a selector caused a failure, it gets demoted.
 */

/**
 * Rank selectors by stability score.
 * @param {object[]} selectors - Array from dom_parser
 * @param {string} failureLog - Previous failure log (optional, for self-healing)
 * @returns {object[]} Sorted by score descending
 */
export function rankSelectors(selectors, failureLog = '') {
  return selectors
    .map(s => {
      let score = s.score || 50;

      // Boost stable selector types
      if (s.type === 'data-cy') score += 20;
      if (s.type === 'id') score += 10;
      if (s.type === 'input') score += 5;

      // Demote fragile types
      if (s.type === 'contains') score -= 5;
      if (s.type === 'dynamic-class') score -= 10;
      if (s.type === 'onclick') score -= 5;

      // Demote if this selector caused a previous failure
      if (failureLog && failureLog.includes(s.value)) {
        score -= 30;
      }

      // Demote overly generic selectors
      if (s.value === 'button' || s.value === 'a' || s.value === 'div') {
        score -= 40;
      }

      return { ...s, score };
    })
    .sort((a, b) => b.score - a.score);
}

/**
 * Format ranked selectors as a string for the LLM prompt.
 * Groups by context/area for readability.
 */
export function formatSelectorsForPrompt(selectors) {
  let output = '';
  const grouped = {};

  for (const s of selectors) {
    const group = s.context || 'page-level';
    if (!grouped[group]) grouped[group] = [];
    grouped[group].push(s);
  }

  for (const [group, items] of Object.entries(grouped)) {
    output += `\n[${group}]\n`;
    for (const s of items) {
      let line = `  ${s.value.padEnd(50)} score:${s.score}  tag:${s.tag || '?'}`;
      if (s.text) line += `  text:"${s.text}"`;
      if (s.inputType) line += `  type:${s.inputType}`;
      if (s.containsText) line += `  contains:"${s.containsText}"`;
      output += line + '\n';
    }
  }

  return output;
}
