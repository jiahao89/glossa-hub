/**
 * Safely parse a JSON field value that may be:
 *   - already an object (return as-is)
 *   - a JSON string (parse once)
 *   - a double-encoded JSON string (parse until unwrapped)
 *   - null / undefined / empty string (return fallback)
 *
 * @param {*} val - The raw value from the database column
 * @param {*} [fallback={}] - Value to return when parsing fails or input is empty
 * @returns {object|array} The parsed value, or fallback on error
 */
function parseJsonField(val, fallback = {}) {
  if (val === null || val === undefined) return fallback;
  if (typeof val === 'object') return val;
  if (typeof val === 'string' && val.trim() === '') return fallback;

  try {
    let parsed = val;
    // Unwrap nested JSON encoding (e.g. double-stringified objects)
    while (typeof parsed === 'string' && parsed.trim() !== '') {
      parsed = JSON.parse(parsed);
    }
    if (typeof parsed === 'object' && parsed !== null) {
      return parsed;
    }
    return fallback;
  } catch {
    return fallback;
  }
}

module.exports = { parseJsonField };
