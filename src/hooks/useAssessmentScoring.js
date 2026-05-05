import { useMemo } from 'react';
import {
    calculateSectionScore,
    calculateOverallScore,
    computeGraphScores
} from '../utils/scoring';
import { normalizeCriterionCode } from '../utils/normalization';

/**
 * Hook for calculating hierarchical assessment scores.
 * 
 * Takes a full assessment object and returns a computed tree of results.
 * Optimized with useMemo to handle 500+ criteria efficiently.
 * 
 * @param {Object} assessment - { sections: [{ id, standards: [{ id, criteria: [] }] }] }
 * @returns {Object} Computed scores for overall, sections, and standards.
 */
export const useAssessmentScoring = (assessment) => {
    return useMemo(() => {
        // 1. Build a full criteria map
        const criteriaMap = {};
        (assessment.sections || []).forEach(section => {
            (section.standards || []).forEach(standard => {
                (standard.criteria || []).forEach(criterion => {
                    const code = criterion.code || criterion.id;
                    if (code) {
                        const norm = normalizeCriterionCode(code);
                        criteriaMap[norm] = criterion;
                    }
                });
            });
        });

        // 2. Perform deep recursive graph resolution for all criteria
        const globalScores = computeGraphScores(criteriaMap);

        // 3. Aggregate into standard, section, and overall results
        const sectionResults = (assessment.sections || []).map(section => {
            const standardResults = (section.standards || []).map(standard => {

                let totalScore = 0;
                let maxScore = 0;
                // We no longer use this to zero an entire section; keep false.
                let criticalFail = false;
                const criteriaScores = {};
                // Track worst scored status among CRITICAL children: NC > PC
                // (ignore NA/Pending for capping purposes)
                let worstCritical = null; // 'NC' | 'PC' | null

                (standard.criteria || []).forEach(criterion => {
                    const code = criterion.code || criterion.id;
                    const norm = normalizeCriterionCode(code);
                    const score = globalScores[norm];

                        if (score) {
                            criteriaScores[criterion.id] = score;

                            // Add to standard totals if it was scored
                            if (score.isScored && score.points !== null) {
                                totalScore += score.points;
                                maxScore += 100;
                            }

                            // Determine worst scored CRITICAL child status for capping
                            if (score.isCritical && score.isScored && typeof score.response === 'string') {
                                const r = score.response.toUpperCase();
                                if (/^(NC|NON|NON_COMPLIANT|NON-COMPLIANT|NOT_MET|FAIL)$/.test(r) || r.includes('NON') || r.includes('FAIL')) {
                                    worstCritical = 'NC';
                                } else if (!worstCritical || worstCritical !== 'NC') {
                                    if (/^(PC|PARTIAL|SUBSTANTIAL)$/.test(r) || r.includes('PARTIAL')) {
                                        worstCritical = 'PC';
                                    }
                                }
                            }
                        }
                });

                    // Apply standard-level capping based on worst scored CRITICAL child
                    if (worstCritical && maxScore > 0) {
                        const cap = worstCritical === 'NC' ? 20 : 60; // percent caps
                        const capPoints = (cap / 100) * maxScore;
                        if (totalScore > capPoints) totalScore = capPoints;
                    }
                    const percent = maxScore === 0 ? 0 : (totalScore / maxScore) * 100;

                    return {
                    id: standard.id,
                    totalScore,
                    maxScore,
                    percent,
                        // Keep criticalFail for backward compatibility but do not
                        // use it to zero sections. The capping above enforces the
                        // business rule for standards instead.
                        criticalFail: false,
                        criteriaScores,
                        // Surface cap reason if any (for debugging/visualization)
                        ...(worstCritical ? { cappedByCritical: worstCritical } : {})
                };
            });

            const sectionResult = calculateSectionScore(standardResults);

            return {
                id: section.id,
                ...sectionResult,
                standards: standardResults
            };
        });

        const overallResult = calculateOverallScore(sectionResults);

        return {
            overall: overallResult,
            sections: sectionResults,
            globalScores // Expose for debugging if needed
        };
    }, [assessment?.sections]);
};
