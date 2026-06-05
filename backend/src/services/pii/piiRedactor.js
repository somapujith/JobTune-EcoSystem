'use strict';

/**
 * PII Redactor Service
 * Redacts personally identifiable information from text and restores it.
 */

// ─── Name lists ───────────────────────────────────────────────────────────────

const FIRST_NAMES = [
  'James', 'John', 'Robert', 'Michael', 'William', 'David', 'Richard', 'Joseph',
  'Thomas', 'Charles', 'Mary', 'Patricia', 'Jennifer', 'Linda', 'Barbara',
  'Elizabeth', 'Susan', 'Jessica', 'Sarah', 'Karen', 'Alice', 'Bob', 'Emily',
  'Daniel', 'Matthew', 'Andrew', 'Joshua', 'Christopher', 'Ryan', 'Kevin'
];

const LAST_NAMES = [
  'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis',
  'Martinez', 'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson', 'Thomas',
  'Taylor', 'Moore', 'Jackson', 'Martin', 'Lee', 'Thompson', 'White', 'Harris',
  'Sanchez', 'Clark', 'Ramirez', 'Lewis', 'Robinson', 'Walker', 'Young'
];

// ─── Regex patterns ───────────────────────────────────────────────────────────

const EMAIL_REGEX = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;

// US 10-digit: 555-123-4567 | 555.123.4567 | 555 123 4567 | 5551234567
const PHONE_REGEX = /\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/g;

// Street number + street keyword
const ADDRESS_REGEX = /\b\d+\s+[A-Za-z0-9\s]{1,30}?\s(?:Street|St|Ave|Avenue|Blvd|Boulevard|Rd|Road|Ln|Lane|Ct|Court|Dr|Drive|Way|Place|Pl)\b/gi;

/**
 * Build a regex that matches any known name as a whole word (case-sensitive capitalized).
 */
function buildNameRegex() {
  const all = [...new Set([...FIRST_NAMES, ...LAST_NAMES])];
  const pattern = all.map(n => `\\b${n}\\b`).join('|');
  return new RegExp(pattern, 'g');
}

const NAME_REGEX = buildNameRegex();

// ─── Core functions ───────────────────────────────────────────────────────────

/**
 * Redact PII from text.
 * @param {string} text
 * @returns {{ redacted: string, map: Object.<string, string> }}
 */
function redact(text) {
  if (typeof text !== 'string') {
    throw new TypeError('redact() requires a string argument');
  }

  const map = {};
  const counters = { EMAIL: 0, PHONE: 0, ADDRESS: 0, NAME: 0 };

  // Collect all matches with their positions to handle overlaps
  const replacements = [];

  // Reset regex state
  EMAIL_REGEX.lastIndex = 0;
  PHONE_REGEX.lastIndex = 0;
  ADDRESS_REGEX.lastIndex = 0;
  NAME_REGEX.lastIndex = 0;

  for (const match of text.matchAll(EMAIL_REGEX)) {
    replacements.push({ start: match.index, end: match.index + match[0].length, value: match[0], type: 'EMAIL' });
  }
  for (const match of text.matchAll(PHONE_REGEX)) {
    replacements.push({ start: match.index, end: match.index + match[0].length, value: match[0], type: 'PHONE' });
  }
  for (const match of text.matchAll(ADDRESS_REGEX)) {
    replacements.push({ start: match.index, end: match.index + match[0].length, value: match[0], type: 'ADDRESS' });
  }
  for (const match of text.matchAll(NAME_REGEX)) {
    replacements.push({ start: match.index, end: match.index + match[0].length, value: match[0], type: 'NAME' });
  }

  if (replacements.length === 0) {
    return { redacted: text, map };
  }

  // Sort by start position, resolve overlaps (keep longer/earlier match)
  replacements.sort((a, b) => a.start - b.start || b.end - a.end);

  const deduped = [];
  let lastEnd = -1;
  for (const r of replacements) {
    if (r.start >= lastEnd) {
      deduped.push(r);
      lastEnd = r.end;
    }
  }

  // Build redacted string
  let result = '';
  let cursor = 0;

  for (const r of deduped) {
    result += text.slice(cursor, r.start);
    counters[r.type] += 1;
    const token = `[${r.type}_${counters[r.type]}]`;
    map[token] = r.value;
    result += token;
    cursor = r.end;
  }
  result += text.slice(cursor);

  return { redacted: result, map };
}

/**
 * Restore PII tokens in text using a redaction map.
 * @param {string} text
 * @param {Object.<string, string>} map
 * @returns {string}
 */
function restore(text, map) {
  if (typeof text !== 'string') {
    throw new TypeError('restore() requires a string as first argument');
  }

  let result = text;
  for (const [token, original] of Object.entries(map)) {
    // Escape token for regex use (brackets are special)
    const escaped = token.replace(/[[\]]/g, '\\$&');
    result = result.replace(new RegExp(escaped, 'g'), original);
  }
  return result;
}

module.exports = { redact, restore };
