/**
 * Shared YAML frontmatter parser for Pi agent scripts.
 *
 * Handles: top-level keys, nested keys (one level), inline arrays [a, b, c],
 * and quoted string values.
 *
 * Also used by the external prompt-composer package's TypeScript parser.
 * Keep the two in sync if changing parsing behavior.
 */

/**
 * Parse a raw YAML value into a string or string array.
 * @param {string} raw
 * @returns {string | string[]}
 */
export function parseYamlValue(raw) {
  // Inline array: [a, b, c]
  if (raw.startsWith("[") && raw.endsWith("]")) {
    const inner = raw.slice(1, -1);
    return inner
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => {
        if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
          return s.slice(1, -1);
        }
        return s;
      });
  }
  // Quoted string
  if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
    return raw.slice(1, -1);
  }
  return raw;
}

/**
 * Parse YAML frontmatter from a markdown file's content.
 * Returns null if no frontmatter block is found.
 *
 * @param {string} content - Full file content
 * @returns {Record<string, unknown> | null}
 */
export function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;

  const lines = match[1].split("\n");
  const result = {};
  let currentKey = null;

  for (const line of lines) {
    // Nested key (one indent level)
    const indentedMatch = line.match(/^  (\w+):\s*(.*)/);
    if (indentedMatch && currentKey) {
      if (!result[currentKey] || typeof result[currentKey] !== "object") {
        result[currentKey] = {};
      }
      result[currentKey][indentedMatch[1]] = parseYamlValue(indentedMatch[2].trim());
      continue;
    }

    // Top-level key
    const topMatch = line.match(/^(\w+):\s*(.*)/);
    if (topMatch) {
      currentKey = topMatch[1];
      const value = topMatch[2].trim();
      if (value === "" || value === undefined) {
        result[currentKey] = {};
      } else {
        result[currentKey] = parseYamlValue(value);
      }
    }
  }

  return result;
}

/**
 * Extract the body content (everything after frontmatter).
 * @param {string} content - Full file content
 * @returns {string}
 */
export function extractBody(content) {
  return content.replace(/^---\n[\s\S]*?\n---\n*/, "").trim();
}
