/* CJS version for Node (package type = module) */
const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const HOSP_LINKS_PATH = path.join(ROOT, 'src', 'assets', 'hospital_links.json');
const MATRIX_PATH = path.join(ROOT, 'other-docs', 'matrix.json');

function normalize(code) {
  if (!code) return '';
  let c = String(code).trim();
  c = c.replace(/-([GB])$/i, '');
  const m = c.match(/.*_(?=\d)/);
  if (m) c = c.slice(m[0].length);
  if (c.startsWith('SE ')) c = c.slice(3).trim();
  c = c.replace(/-root\(.*\)$/, '');
  c = c.split(/\s+/)[0];
  return c;
}

function loadJSON(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }

function buildHLMap(hospLinks) {
  const map = new Map();
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
  const map = new Map();
  const colour = new Map();
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

function diffSets(a = new Set(), b = new Set()) {
  const onlyA = [];
  const onlyB = [];
  for (const v of a) if (!b.has(v)) onlyA.push(v);
  for (const v of b) if (!a.has(v)) onlyB.push(v);
  onlyA.sort();
  onlyB.sort();
  return { onlyA, onlyB };
}

function main() {
  const MAX_PER_ROOT = parseInt(process.env.MAX_PER_ROOT || '5', 10);
  const hospLinks = loadJSON(HOSP_LINKS_PATH);
  const matrix = loadJSON(MATRIX_PATH);

  const hl = buildHLMap(hospLinks);
  const { map: mx, colour } = buildMXMap(matrix);

  const roots = new Set([...hl.keys(), ...mx.keys()]);

  let totalHL = 0, totalMX = 0, totalOnlyHL = 0, totalOnlyMX = 0;
  for (const r of roots) {
    totalHL += (hl.get(r)?.size || 0);
    totalMX += (mx.get(r)?.size || 0);
    const { onlyA, onlyB } = diffSets(hl.get(r), mx.get(r));
    totalOnlyHL += onlyA.length;
    totalOnlyMX += onlyB.length;
  }

  const lines = [];
  lines.push('=== Hospital Links vs Matrix (by linked criteria) ===');
  lines.push(`Roots compared: ${roots.size}`);
  lines.push(`Total links: hospital_links=${totalHL}, matrix(unique)=${totalMX}`);
  lines.push(`Differences: HL-only=${totalOnlyHL}, MX-only=${totalOnlyMX}`);
  lines.push('');

  const scored = [];
  for (const r of roots) {
    const { onlyA, onlyB } = diffSets(hl.get(r), mx.get(r));
    const score = onlyA.length + onlyB.length;
    if (score > 0) scored.push({ r, onlyA, onlyB, score });
  }
  scored.sort((x, y) => y.score - x.score);
  const top = scored.slice(0, 15);
  for (const { r, onlyA, onlyB } of top) {
    lines.push(`Root ${r}`);
    if (onlyA.length) {
      lines.push(`  In hospital_links only (${onlyA.length}): ${onlyA.slice(0, MAX_PER_ROOT).join(', ')}${onlyA.length > MAX_PER_ROOT ? ', ...' : ''}`);
    }
    if (onlyB.length) {
      lines.push(`  In matrix only (${onlyB.length}): ${onlyB.slice(0, MAX_PER_ROOT).join(', ')}${onlyB.length > MAX_PER_ROOT ? ', ...' : ''}`);
    }
  }

  const output = lines.join('\n');
  console.log(output);
  const outPath = path.join(ROOT, 'other-docs', 'links_matrix_diff_report.txt');
  try { fs.writeFileSync(outPath, output, 'utf8'); } catch (e) {}
}

main();
