/**
 * Fallback JSON extractor — strips markdown fences and extracts JSON.
 * Used as a backup when .withStructuredOutput() edge cases occur.
 */
export function extractJson(text) {
  if (!text || typeof text !== 'string') return null;

  // Try direct parse first
  try {
    return JSON.parse(text);
  } catch {
    // continue to fallback
  }

  // Strip markdown code fences
  const fencePattern = /```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/;
  const match = text.match(fencePattern);
  if (match) {
    try {
      return JSON.parse(match[1].trim());
    } catch {
      // continue
    }
  }

  // Try to find JSON object/array in the text
  const jsonPattern = /(\{[\s\S]*\}|\[[\s\S]*\])/;
  const jsonMatch = text.match(jsonPattern);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[1]);
    } catch {
      // give up
    }
  }

  return null;
}
