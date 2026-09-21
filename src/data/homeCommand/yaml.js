/** Parse the HomeAlone inventory YAML subset (maps, lists, scalars, comments). */

function stripComment(line) {
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === "'" && !inDouble) inSingle = !inSingle;
    else if (ch === '"' && !inSingle && line[i - 1] !== '\\') inDouble = !inDouble;
    else if (ch === '#' && !inSingle && !inDouble) return line.slice(0, i);
  }
  return line;
}

function parseScalar(raw) {
  const value = String(raw ?? '').trim();
  if (!value || value === 'null' || value === '~') return null;
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value.startsWith('[') && value.endsWith(']')) {
    const inner = value.slice(1, -1).trim();
    if (!inner) return [];
    return inner.split(',').map((part) => parseScalar(part));
  }
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  return value;
}

function indentOf(line) {
  return line.length - line.trimStart().length;
}

function prepareLines(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map((line) => stripComment(line).replace(/\t/g, '  '))
    .filter((line) => line.trim() !== '');
}

function parseBlock(lines, start, parentIndent) {
  const line = lines[start];
  if (!line || indentOf(line) < parentIndent) return [null, start];
  if (line.trim().startsWith('- ')) return parseList(lines, start, indentOf(line));
  return parseMap(lines, start, indentOf(line));
}

function parseMap(lines, start, indent) {
  const result = {};
  let index = start;
  while (index < lines.length) {
    const line = lines[index];
    const current = indentOf(line);
    if (current < indent) break;
    if (current > indent) throw new Error(`Unexpected indent: ${line.trim()}`);
    if (line.trim().startsWith('- ')) break;
    const trimmed = line.trim();
    const colon = trimmed.indexOf(':');
    if (colon === -1) throw new Error(`YAML line is not a mapping: ${trimmed}`);
    const key = trimmed.slice(0, colon).trim();
    const raw = trimmed.slice(colon + 1).trim();
    index += 1;
    if (raw) {
      result[key] = parseScalar(raw);
      continue;
    }
    const next = lines[index];
    if (!next || indentOf(next) < indent) {
      result[key] = {};
      continue;
    }
    if (indentOf(next) === indent && next.trim().startsWith('- ')) {
      const [value, nextIndex] = parseList(lines, index, indent);
      result[key] = value;
      index = nextIndex;
      continue;
    }
    if (indentOf(next) <= indent) {
      result[key] = {};
      continue;
    }
    const [value, nextIndex] = parseBlock(lines, index, indent + 1);
    result[key] = value;
    index = nextIndex;
  }
  return [result, index];
}

function parseList(lines, start, indent) {
  const result = [];
  let index = start;
  while (index < lines.length) {
    const line = lines[index];
    const current = indentOf(line);
    if (current < indent) break;
    if (current > indent) throw new Error(`Unexpected indent: ${line.trim()}`);
    const trimmed = line.trim();
    if (!trimmed.startsWith('- ')) break;
    const rest = trimmed.slice(2);
    const itemIndent = current + 2;
    index += 1;
    if (!rest.includes(':')) {
      result.push(parseScalar(rest));
      continue;
    }
    const colon = rest.indexOf(':');
    const key = rest.slice(0, colon).trim();
    const raw = rest.slice(colon + 1).trim();
    const item = {};
    if (raw) item[key] = parseScalar(raw);
    else {
      const next = lines[index];
      if (next && indentOf(next) > current) {
        const [value, nextIndex] = parseBlock(lines, index, itemIndent);
        item[key] = value;
        index = nextIndex;
      } else item[key] = {};
    }
    while (index < lines.length) {
      const next = lines[index];
      const nextIndent = indentOf(next);
      if (nextIndent <= current) break;
      if (next.trim().startsWith('- ')) break;
      const [extra, nextIndex] = parseMap(lines, index, nextIndent);
      Object.assign(item, extra);
      index = nextIndex;
    }
    result.push(item);
  }
  return [result, index];
}

/**
 * Parse HomeAlone `site/inventory.yaml` into a plain object.
 * @param {string} text
 */
export function parseYaml(text) {
  const lines = prepareLines(text);
  if (!lines.length) return {};
  const [value, index] = parseBlock(lines, 0, 0);
  if (index !== lines.length) throw new Error('YAML did not consume every line');
  return value;
}
