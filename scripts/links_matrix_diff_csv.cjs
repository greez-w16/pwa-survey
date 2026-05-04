/*
  Generate a CSV diff between src/assets/hospital_links.json and other-docs/matrix.json
  Columns:
    root, linked, in_hl, in_mx, mx_color, tag, status
  Where:
    - tag = G if mx_color=green, B if mx_color=blue, else empty
    - status = BOTH | HL_ONLY | MX_ONLY
*/

const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const HOSP_LINKS_PATH = path.join(ROOT, 'src', 'assets', 'hospital_links.json');
const MATRIX_PATH = path.join(ROOT, 'other-docs', 'matrix.json');
const OUT_PATH = path.join(ROOT, 'other-docs', 'links_matrix_diff.csv');

function normalize(code) {
  if (!code) return '';
  let c = String(code).trim();
  // strip any -G / -B suffixes if someone hand-annotated
  c = c.replace(/-([GB])$/i, '');
  // drop prefix up to last underscore preceding a digit
  const m = c.match(/.*_(?=\d)/);
  if (m) c = c.slice(m[0].length);
  // legacy "SE " prefix
  if (c.startsWith('SE ')) c = c.slice(3).trim();
  // drop any trailing tag used for display
  c = c.replace(/-root\(.*\)$/, '');
  // first token only if spaces
  c = c.split(/\s+/)[0];
  return c;
}

function loadJSON(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }

function buildHLMap(hospLinks) {
  const map = new Map(); // root -> Set(linked)
  for (const row of hospLinks) {
    if (!row || !row.criteria) continue;
    const root = normalize(row.criteria);
    const arr = Array.isArray(row.linked_criteria) ? row.linked_criteria : [];
    if (!map.has(root)) map.set(root, new Set());
    const set = map.get(root);
    for (const l of arr) set.add(normalize(l));
  }
  return map;
}

function buildMXMap(matrix) {
  const map = new Map(); // root -> Set(linked)
  const colour = new Map(); // `${root}|${linked}` -> lower-case colour label
  for (const row of matrix) {
    if (!row || !row.criteria) continue;
    const root = normalize(row.criteria);
    const arr = Array.isArray(row.linked_criteria) ? row.linked_criteria : [];
    if (!map.has(root)) map.set(root, new Set());
    const set = map.get(root);
    for (const entry of arr) {
      if (!entry || !entry.id) continue;
      const linked = normalize(entry.id);
      set.add(linked);
      const key = `${root}|${linked}`;
      const label = (entry.bg_label || '').toString().toLowerCase();
      if (label) colour.set(key, label);
    }
  }
  return { map, colour };
}

function csvEscape(val) {
  if (val === null || val === undefined) return '';
  const s = String(val);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function main() {
  const hospLinks = loadJSON(HOSP_LINKS_PATH);
  const matrix = loadJSON(MATRIX_PATH);

  const hl = buildHLMap(hospLinks);
  const { map: mx, colour } = buildMXMap(matrix);

  const roots = new Set([...hl.keys(), ...mx.keys()]);
  const header = ['root','linked','in_hl','in_mx','mx_color','tag','status'];
  const rows = [header.join(',')];

  for (const r of Array.from(roots).sort()) {
    const a = hl.get(r) || new Set();
    const b = mx.get(r) || new Set();
    const union = new Set([...a, ...b]);
    for (const l of Array.from(union).sort()) {
      const inHL = a.has(l);
      const inMX = b.has(l);
      const key = `${r}|${l}`;
      const mxColor = colour.get(key) || '';
      const tag = mxColor === 'green' ? 'G' : (mxColor === 'blue' ? 'B' : '');
      const status = inHL && inMX ? 'BOTH' : inHL ? 'HL_ONLY' : 'MX_ONLY';
      rows.push([
        csvEscape(r),
        csvEscape(l),
        inHL ? 1 : 0,
        inMX ? 1 : 0,
        csvEscape(mxColor),
        csvEscape(tag),
        csvEscape(status)
      ].join(','));
    }
  }

  fs.writeFileSync(OUT_PATH, rows.join('\n'), 'utf8');
  console.log(`CSV written: ${OUT_PATH}`);
}

main();
