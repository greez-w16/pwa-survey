import matrixData from '../../other-docs/matrix.json';
import { normalizeCriterionCode } from './normalization.js';

// Build fast lookups of (root, linked) -> colour tag based on the external
// matrix.json definition. Tags are:
//   G = green
//   B = blue
// Any other colour is ignored for this purpose.

const GREEN_TAG = 'G';
const BLUE_TAG = 'B';

const greenPairs = new Set(); // key = `${root}|${linked}`
const bluePairs = new Set();

try {
    const rows = Array.isArray(matrixData) ? matrixData : [];
    rows.forEach((row) => {
        if (!row || !row.criteria) return;
        const rootCode = normalizeCriterionCode(row.criteria);
        if (!rootCode) return;

        const linkedList = Array.isArray(row.linked_criteria) ? row.linked_criteria : [];
        linkedList.forEach((entry) => {
            if (!entry || !entry.id) return;
            const linkedCode = normalizeCriterionCode(entry.id);
            if (!linkedCode) return;

            const label = String(entry.bg_label || '').toLowerCase();
            const key = `${rootCode}|${linkedCode}`;
            if (label === 'green') {
                greenPairs.add(key);
            } else if (label === 'blue') {
                bluePairs.add(key);
            }
        });
    });
} catch (e) {
    // eslint-disable-next-line no-console
    console.error('hospitalMatrixTags: failed to build colour pairs from matrix.json', e);
}

/**
 * Returns a visual tag for a Hospital root -> linked pair based on matrix.json.
 *
 * @param {string} rootCode   e.g. "7.1.1.1"
 * @param {string} linkedCode e.g. "1.2.2.4" (without any -G / -B suffix)
 * @returns {'G'|'B'|null}
 */
export const getMatrixTagForLink = (rootCode, linkedCode) => {
    if (!rootCode || !linkedCode) return null;
    const rootNorm = normalizeCriterionCode(rootCode);
    const linkedNorm = normalizeCriterionCode(linkedCode);
    if (!rootNorm || !linkedNorm) return null;
    const key = `${rootNorm}|${linkedNorm}`;
    if (greenPairs.has(key)) return GREEN_TAG;
    if (bluePairs.has(key)) return BLUE_TAG;
    return null;
};

/**
 * Decorates a Hospital links array with -G / -B suffixes on linked_criteria
 * entries where the matrix marks the pair as green or blue. Existing suffixes
 * are preserved unless the matrix provides a stronger signal.
 *
 * The function is pure and idempotent: calling it multiple times with the same
 * input yields the same result without accumulating extra suffixes.
 *
 * @param {Array<Object>} hospitalLinksRaw - raw hospital_links-style array
 * @returns {Array<Object>} new array with decorated linked_criteria
 */
export const decorateHospitalLinksWithMatrixTags = (hospitalLinksRaw) => {
    const links = Array.isArray(hospitalLinksRaw) ? [...hospitalLinksRaw] : [];
    
    // Create a Set of normalized criterion codes that are already present in hospitalLinksRaw
    const existingKeys = new Set(
        links
            .map(l => l && l.criteria ? normalizeCriterionCode(l.criteria) : null)
            .filter(Boolean)
    );

    // Read all rows from the master matrixData and append missing ones
    const matrixRows = Array.isArray(matrixData) ? matrixData : [];
    matrixRows.forEach((row) => {
        if (!row || !row.criteria) return;
        const normCode = normalizeCriterionCode(row.criteria);
        if (!normCode || existingKeys.has(normCode)) return;

        // Construct standard link object format for the missing criteria
        const constructedLinked = (row.linked_criteria || [])
            .map(lc => {
                if (!lc || !lc.id) return null;
                const tag = String(lc.bg_label || '').toLowerCase() === 'green'
                    ? 'G'
                    : String(lc.bg_label || '').toLowerCase() === 'blue'
                        ? 'B'
                        : null;
                return tag ? `${lc.id}-${tag}` : lc.id;
            })
            .filter(Boolean);

        links.push({
            criteria: row.criteria,
            description: "",
            linked_criteria: constructedLinked,
            root: []
        });
        existingKeys.add(normCode);
    });

    return links.map((linkObj) => {
        if (!linkObj || !linkObj.criteria) return linkObj;
        const rootCode = linkObj.criteria;
        const originalLinked = Array.isArray(linkObj.linked_criteria)
            ? linkObj.linked_criteria
            : [];

        const decoratedLinked = originalLinked.map((rawCode) => {
            if (!rawCode) return rawCode;
            const str = String(rawCode).trim();
            const match = str.match(/^(.*?)-([GB])$/i);
            const baseCode = match ? match[1] : str;
            const existingTag = match ? match[2].toUpperCase() : null;

            const matrixTag = getMatrixTagForLink(rootCode, baseCode);
            const finalTag = matrixTag || existingTag;

            if (!finalTag) return baseCode;
            return `${baseCode}-${finalTag}`;
        });

        return {
            ...linkObj,
            linked_criteria: decoratedLinked,
        };
    });
};
