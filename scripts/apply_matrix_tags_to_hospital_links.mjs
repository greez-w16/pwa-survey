import fs from 'node:fs/promises';
import path from 'node:path';

// Small helpers
const normalize = (raw) => {
  if (!raw) return '';
  let code = String(raw).trim();
  // Strip any prefix up to last '_' before a digit (e.g., EMS_1.2.3.4 -> 1.2.3.4)
  const match = code.match(/.*_(?=\d)/);
  if (match) code = code.slice(match[0].length);
  // Legacy "SE 1.2.3.4"
  if (code.startsWith('SE ')) code = code.slice(3).trim();
  // Drop any circular tags or spaces
  code = code.replace(/-root\(.*\)$/,'').split(/\s+/)[0];
  // Drop any visual tag suffix if present (e.g., 1.2.3.4-G)
  const m = code.match(/^(.*?)-([GB])$/i);
  if (m) code = m[1];
  return code;
};

const rootDir = process.cwd();
const hlPath = path.join(rootDir, 'src', 'assets', 'hospital_links.json');
const matrixPath = path.join(rootDir, 'other-docs', 'matrix.json');

const TAG_FROM_COLOR = (c) => {
  if (!c) return null;
  const v = String(c).toLowerCase();
  if (v === 'green') return 'G';
  if (v === 'blue') return 'B';
  return null;
};

const readJson = async (p) => JSON.parse(await fs.readFile(p, 'utf8'));
const writeJson = async (p, obj) => fs.writeFile(p, JSON.stringify(obj, null, 2) + '\n', 'utf8');

const main = async () => {
  const [hl, mx] = await Promise.all([readJson(hlPath), readJson(matrixPath)]);

  // Build pair -> tag map from matrix (prefer G over B if duplicates)
  const pairTag = new Map(); // key: `${root}|${linked}` -> 'G'|'B'
  for (const row of mx) {
    const root = normalize(row.criteria);
    const list = Array.isArray(row.linked_criteria) ? row.linked_criteria : [];
    for (const it of list) {
      const linked = normalize(it.id);
      const tag = TAG_FROM_COLOR(it.bg_label);
      if (!root || !linked || !tag) continue;
      const key = `${root}|${linked}`;
      const prev = pairTag.get(key);
      if (prev === 'G') continue; // keep strongest
      pairTag.set(key, tag);
    }
  }

  // Transform hospital_links: add -G/-B tags where matrix marks the pair
  const backupPath = path.join(
    path.dirname(hlPath),
    `hospital_links.backup.${new Date().toISOString().replace(/[:.]/g, '-')}.json`
  );
  await writeJson(backupPath, hl);

  let added = 0, removed = 0, unchanged = 0;

  for (const row of hl) {
    const root = normalize(row.criteria);
    const arr = Array.isArray(row.linked_criteria) ? row.linked_criteria : [];
    const next = [];
    for (const raw of arr) {
      const m = String(raw).match(/^(.*?)-([GB])$/i);
      const base = normalize(raw);
      const currentTag = m ? m[2].toUpperCase() : null;
      const desired = pairTag.get(`${root}|${base}`) || null;
      if (desired) {
        const out = `${base}-${desired}`;
        next.push(out);
        if (currentTag === desired) unchanged++; else added++;
      } else {
        next.push(base);
        if (currentTag) removed++; else unchanged++;
      }
    }
    row.linked_criteria = next;
  }

  await writeJson(hlPath, hl);
  console.log(`Applied matrix tags to hospital_links.json`);
  console.log(`Pairs: +tag ${added}, -tag ${removed}, unchanged ${unchanged}`);
  console.log(`Backup: ${backupPath}`);
};

main().catch(err => {
  console.error(err);
  process.exit(1);
});
