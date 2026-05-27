import { normalizeCriterionCode, compareCriterionCodes } from './normalization.js';
import hospitalComputeCriteria from '../assets/hospital_compute_criteria.json';

/**
 * Healthcare Accreditation Scoring Module
 * 
 * Provides deterministic, side-effect-free functions for calculating scores
 * at the standard, section, and overall assessment levels.
 * 
 * Scoring Model:
 * FULL = 2
 * PARTIAL = 1
 * NON = 0
 * NA = Excluded from maxScore
 */

	// Helper to build a map of root criterion -> configured sub-criteria codes for
	// Hospital from a hospital_compute_criteria-style JSON object.
	// Shape: { "7.1.1.1": ["7.1.1.2", "7.1.1.3", ...], ... }
export const buildHospitalSubcriteriaMap = (computeConfig) => {
	    const map = {};
	    if (!computeConfig) return map;
	    try {
	        const seList = computeConfig?.hospital_standards_config?.service_elements || [];
	        seList.forEach(se => {
	            (se.root_criteria || []).forEach(root => {
	                if (!root || !root.id) return;
	                const rootCode = normalizeCriterionCode(root.id);
	                if (!rootCode) return;
	                const subs = Array.isArray(root.sub_criteria)
	                    ? root.sub_criteria.map(code => normalizeCriterionCode(code)).filter(Boolean)
	                    : [];
	                if (subs.length > 0) {
	                    map[rootCode] = subs;
	                }
	            });
	        });
	    } catch (e) {
	        // Fail quietly; scoring will simply ignore configured sub-criteria
	        // if the configuration JSON is missing or malformed.
	        // eslint-disable-next-line no-console
	        console.error('scoring: failed to build hospital sub-criteria map', e);
	    }
	    return map;
};

	// Mutable map so that the host app can swap in a different configuration per
	// version at runtime while keeping the scoring core pure in terms of
	// arguments.
let HOSPITAL_SUBCRITERIA_MAP = buildHospitalSubcriteriaMap(hospitalComputeCriteria);

export const setHospitalSubcriteriaConfig = (computeConfig) => {
	    HOSPITAL_SUBCRITERIA_MAP = buildHospitalSubcriteriaMap(computeConfig || hospitalComputeCriteria);
};

	/**
	 * Helper to calculate points for a single Linked criterion based on severity and response
	 */
	export const calculatePointsForLink = (response, severity) => {
	    if (!response || response === 'NA') return null;
	
	    const res = String(response).toUpperCase().trim();
	
	    // C is now a flat 100 points regardless of severity (full compliance)
	    if (/^([A-Z]+_)?(C|FC|FULL|COMPLIANT)$/.test(res) && !res.includes('NON') || (res.includes('COMPLIANT') && !res.includes('NON') && !res.includes('PARTIAL'))) {
	        return 100;
	    }
	
	    // PC scales based on severity (1=75, 2=65, 3=55, 4=45)
	    // Matches PC, PARTIAL, SUBSTANTIAL, EMS_PC, Q_PC, etc.
	    if (/^([A-Z]+_)?(PC|PARTIAL|SUBSTANTIAL)$/.test(res) || res.includes('PARTIAL')) {
	        let severityNum = parseInt(severity, 10);
	        if (isNaN(severityNum)) severityNum = 1;
	        return 75 - ((severityNum - 1) * 10);
	    }
	
	    // NC scales based on severity (1=35, 2=25, 3=15, 4=5)
	    // Matches NC, NON, NON_COMPLIANT, NON-COMPLIANT, NOT_MET, etc.
	    if (/^([A-Z]+_)?(NC|NON|NON_COMPLIANT|NON-COMPLIANT|NOT_MET|FAIL)$/.test(res) || res.includes('NON') || res.includes('FAIL')) {
	        let severityNum = parseInt(severity, 10);
	        if (isNaN(severityNum)) severityNum = 1;
	        return 35 - ((severityNum - 1) * 10);
	    }
	
	    return null; // NA or unhandled
	};

/**
 * Computes deep recursive graph scores for all criteria.
 * 
 * @param {Object} criteriaMap - Map of normalizedCode -> criterion object
 * @returns {Object} Computed global scores map
 */
export const computeGraphScores = (criteriaMap) => {
    const globalScores = {};
    const currentlyResolving = new Set(); // To detect circular dependencies

    const warnedCircular = new Set();
    const computeCriterion = (code) => {
        if (globalScores[code]) return globalScores[code];

        const criterion = criteriaMap[code];
        if (!criterion) {
            return { points: null, response: 'NA', rawResponse: 'NA', isRoot: false, isDraft: true, criticalFail: false, isScored: false };
        }

        if (currentlyResolving.has(code)) {
            if (!warnedCircular.has(code)) {
                console.warn(`Circular dependency detected involving ${code}. Breaking loop.`);
                warnedCircular.add(code);
            }
            return { points: null, response: 'NA', rawResponse: 'NA', isRoot: false, isDraft: true, criticalFail: false, isScored: false };
        }

        currentlyResolving.add(code);

        const rootSourcesInfo = []; // To store details of linked children for traceability

	        const { id, response, isRoot, links, severity, isCritical, roots, overrideEnabled, overrideResponse } = criterion;
	        const normalizedCode = normalizeCriterionCode(code);
	        const configuredSubs = HOSPITAL_SUBCRITERIA_MAP[normalizedCode] || [];
	        const hasConfiguredSubs = configuredSubs.length > 0;
	        const effectiveIsRoot = Boolean(isRoot || hasConfiguredSubs);

        let points = null;
        let isScored = false;
        let isDraft = false;
        let criticalFail = false;
        // Prefer an explicit overrideResponse when provided; this allows
        // manual overrides for root criteria. If not provided, fall back to
        // the criterion's own response.
        let calculatedResponse = (overrideResponse !== undefined && overrideResponse !== null && String(overrideResponse).trim() !== '')
            ? overrideResponse
            : response;
	        let sumLinkedPoints = 0;
	        let countScoredLinks = 0;
	        // For roots, we also track a draft numeric value that may be
	        // available even while the root is still in a Pending state
	        // (some children not yet assessed). This lets the UI show a
	        // provisional "Calculated Root Score" instead of "--- pts".
	        let rootDraftPoints = null;

	        // NA check entirely ignores non-roots. Hospital criteria with configured
	        // sub-criteria are root-like even when they have no qualifying linked
	        // criteria, because they compute from available sub-criteria.
	        if (response === 'NA' && !effectiveIsRoot) {
	            const res = { points: null, response: 'NA', rawResponse: response, normalizedValue: 'NA', isRoot: false, isDraft: false, criticalFail: false, isScored: false, rootSources: [] };
            globalScores[code] = res;
            currentlyResolving.delete(code);
            return res;
        }

        // Track whether we short-circuit root computation due to a manual override
        let manualOverrideActive = false;

        // --- Critical Risk Rule update ---
        // Do NOT force PC -> NC for critical criteria. We only treat explicit
        // NC as a critical failure. PC remains PC and will be handled via
        // standard-level capping (60%) where applicable.

        // --- Standard Failure Rule ---
        const calcResStr = String(calculatedResponse).toUpperCase().trim();
        if (isCritical && (/^([A-Z]+_)?(NC|NON|NON_COMPLIANT|NON-COMPLIANT|NOT_MET|FAIL)$/.test(calcResStr) || calcResStr.includes('NON') || calcResStr.includes('FAIL'))) {
            criticalFail = true;
        }

	            // Determine if a manual override should short-circuit root computation.
	            // For Hospital configured roots, prefer the configured sub-criteria /
	            // qualifying-link computation unless an override is explicitly enabled.
	            const hasOverrideResponse = (overrideResponse !== undefined && overrideResponse !== null && String(overrideResponse).trim() !== '' && String(overrideResponse).toUpperCase() !== 'NA');
	            const hasOwnResponse = (response !== undefined && response !== null && String(response).trim() !== '' && String(response).toUpperCase() !== 'NA');
	            const overrideFlag = (overrideEnabled === true || String(overrideEnabled).toLowerCase() === 'true' || overrideEnabled === 1 || overrideEnabled === '1');
	            const explicitOverrideActive = overrideFlag && (hasOverrideResponse || hasOwnResponse);
	            const storedRootOverrideActive = !hasConfiguredSubs && hasOverrideResponse;
	            manualOverrideActive = effectiveIsRoot && (explicitOverrideActive || storedRootOverrideActive);

            if (manualOverrideActive) {
                // Treat overridden root like a leaf: compute points directly from
                // the (possibly veto-adjusted) calculatedResponse and bypass links.
                const calculatedPoints = calculatePointsForLink(calculatedResponse, severity);
                if (calculatedPoints !== null) {
                    points = calculatedPoints;
                    isScored = true;
                    isDraft = false;
                }
	            } else if (effectiveIsRoot) {
            // ROOT CRITERION LOGIC (Recursive)
            let ncPcCount = 0;
            let anyChildCriticalFail = false;
            let effectiveLinkCount = 0; // counts links that actually participate (not -G/-B)
                // Track critical child statuses (normalized) to optionally force
                // the root's label to match the worst critical child's label.
                const criticalChildStatuses = [];

	            for (const linkCode of (Array.isArray(links) ? links : [])) {
                const rawLink = String(linkCode || '').trim();
                // Detect optional visual tag suffix "-G" or "-B" and strip it
                // for lookup while keeping the suffix for display.
                const tagMatch = rawLink.match(/^(.*?)-([GB])$/i);
                const baseLink = tagMatch ? tagMatch[1] : rawLink;
                const visualTag = tagMatch ? String(tagMatch[2]).toUpperCase() : null; // 'G' | 'B' | null

                const normalizedLink = normalizeCriterionCode(baseLink);
                const childRes = computeCriterion(normalizedLink);

                rootSourcesInfo.push({
                    code: rawLink,
                    points: childRes.points,
                    response: childRes.response,
                    isScored: childRes.isScored,
                    isCritical: childRes.isCritical
                });

                // Exclude G/B-tagged links from numeric/root-state effects.
                const isExcludedByTag = visualTag === 'G' || visualTag === 'B';

                if (!isExcludedByTag) {
                    effectiveLinkCount++;
                    // Capture critical child status buckets: NC > PC > NA
                    if (childRes.isCritical) {
                        const cr = String(childRes.response || '').toUpperCase();
                        if (cr !== 'C' && cr !== 'COMPLIANT' && cr !== 'FULL' && cr !== 'PENDING') {
                            if (/(NC|NON|NON_COMPLIANT|NON-COMPLIANT|NOT_MET|FAIL)/.test(cr)) {
                                criticalChildStatuses.push('NC');
                            } else if (/(PC|PARTIAL|SUBSTANTIAL)/.test(cr)) {
                                criticalChildStatuses.push('PC');
                            } else if (cr === 'NA') {
                                criticalChildStatuses.push('NA');
                            }
                        }
                    }
                    if (childRes.criticalFail || (childRes.isCritical && String(childRes.response).toUpperCase().includes('NC'))) {
                        anyChildCriticalFail = true;
                    }

                    if (childRes.isDraft || !childRes.isScored) {
                        isDraft = true; // Still missing 100% full assessment
                    }

                    if (childRes.isScored && childRes.points !== null) {
                        countScoredLinks++;
                        sumLinkedPoints += childRes.points;

                        const lRes = String(childRes.response).toUpperCase();
                        const isC = /^([A-Z]+_)?(C|FC|FULL|COMPLIANT)$/.test(lRes) && !lRes.includes('NON') || (lRes.includes('COMPLIANT') && !lRes.includes('NON') && !lRes.includes('PARTIAL'));
                        if (!isC) {
                            ncPcCount++;
                        }
                    }
                }
            }

	                const usesHospitalAverageFormula = hasConfiguredSubs;

                // If any critical child is non-C, force this root's categorical
                // result to the worst critical child's label and bypass numeric
                // aggregation. Hospital roots with configured sub-criteria are an
                // exception: they use the rounded linked/sub-criteria average formula.
                let forcedByCriticalChild = false;
                let forcedRootNa = false;
                if (!usesHospitalAverageFormula && criticalChildStatuses.length > 0) {
                    let forced = null;
                    if (criticalChildStatuses.includes('NC')) forced = 'NC';
                    else if (criticalChildStatuses.includes('PC')) forced = 'PC';
                    else if (criticalChildStatuses.includes('NA')) forced = 'NA';
                    if (forced) {
                        calculatedResponse = forced;
                        if (forced === 'NA') {
                            points = null;
                            isScored = false;
                            isDraft = false;
                            forcedRootNa = true;
                        } else {
                            const p = calculatePointsForLink(forced, severity);
                            if (p !== null) {
                                points = p;
                                isScored = true;
                                isDraft = false;
                            }
                        }
                        // Avoid zeroing the root via safety override below
                        anyChildCriticalFail = false;
                        forcedByCriticalChild = true;
                    }
                }

	                if (!forcedByCriticalChild && effectiveIsRoot) {
	                    // Non-Hospital graph roots with no effective links remain
	                    // pending. Hospital configured roots can still compute from
	                    // available configured sub-criteria.
	                    if (!hasConfiguredSubs && effectiveLinkCount === 0) {
	                        isDraft = true;
	                    }
	                    // A root is considered "finalized" only when all linked
	                    // children have been assessed. However, we still want a
	                    // draft numeric score while it is Pending so that the UI
	                    // can show something more useful than "--- pts".
	                    isScored = !isDraft;
	                }
	
	                // Compute a draft average over scored linked criteria (if any)
	                // and then apply the majority rule override and Hospital
	                // sub-criteria combination to derive a candidate numeric
	                // score for this root.
                let linkedAvgForCombination = null;
	                if (countScoredLinks > 0) {
                        const draftAvg = sumLinkedPoints / countScoredLinks;
                        linkedAvgForCombination = draftAvg;
	
	                    // --- Majority Rule Override (Dynamic live evaluation based on scored links) ---
	                    let majorityAdjusted = draftAvg;
	                    if (countScoredLinks > 1 && ncPcCount > (countScoredLinks / 2)) {
	                        const cThreshold = calculatePointsForLink('C', severity) || 80;
	                        const pcThreshold = calculatePointsForLink('PC', severity) || 55;
	
	                        // If more than 75% are failing (NC/PC), force score into NC range
	                        if (ncPcCount > (countScoredLinks * 0.75)) {
	                            majorityAdjusted = Math.min(majorityAdjusted, pcThreshold - 1);
	                        } else {
	                            // If >50% are failing, force score into PC range (at most)
	                            majorityAdjusted = Math.min(majorityAdjusted, cThreshold - 1);
	                        }
	                    }
	
	                    // Use the majority-adjusted value as the starting
	                    // candidate for the root's numeric score.
	                    rootDraftPoints = majorityAdjusted;
	                }
	
		                // --- Hospital computation rule: for configured roots, set the
		                // root's numeric score from the available scoring inputs:
		                //   (a) qualifying linked-criteria average (non -G/-B links), and
		                //   (b) configured sub-criteria average, when scored.
	                // If both sides are available, average them together. If only one
	                // side is available, use that side by itself. Missing sides are not
	                // treated as zero.
                if (!forcedByCriticalChild && usesHospitalAverageFormula) {
	                    let cfgSum = 0;
	                    let cfgCount = 0;
	                    configuredSubs.forEach(subRaw => {
	                        const subCode = normalizeCriterionCode(subRaw);
	                        if (!subCode) return;
	                        const subRes = computeCriterion(subCode);
	                        if (subRes && subRes.isScored && subRes.points !== null) {
	                            cfgSum += subRes.points;
	                            cfgCount += 1;
	                        }
	                    });
	
                    const subAvg = cfgCount > 0 ? (cfgSum / cfgCount) : null;
                    const linkedAvg = linkedAvgForCombination;

	                    const availableAverages = [];
	                    if (linkedAvg !== null) availableAverages.push(Math.round(linkedAvg));
	                    if (subAvg !== null) availableAverages.push(Math.round(subAvg));

	                    if (availableAverages.length > 0) {
		                        rootDraftPoints = Math.round(
		                            availableAverages.reduce((sum, value) => sum + value, 0) / availableAverages.length
		                        );
	                        points = rootDraftPoints;
	                        isScored = true;
	                        isDraft = false;
	                    } else {
	                        isScored = false;
	                        isDraft = true;
	                    }
	                }
	
	                // If all children have been assessed and we have a
	                // candidate numeric value, promote it to the official
	                // points value. Otherwise it remains a draft-only figure.
                if (!forcedByCriticalChild && !isDraft && rootDraftPoints !== null) {
	                    points = rootDraftPoints;
	                }

	            // Safety override. Do not apply this to configured Hospital roots:
	            // they must use the live formula
	            //   (sub-criteria average + linked-criteria average) / 2
	            // even when one linked child is critical/NC.
	            if (anyChildCriticalFail && !usesHospitalAverageFormula) {
                criticalFail = true;
                points = 0;
                isScored = true;
                isDraft = false; // Critical failure terminates the draft state
            }

            } else if (!manualOverrideActive) {
            // INDIVIDUAL (LEAF) CRITERION LOGIC
            const calculatedPoints = calculatePointsForLink(calculatedResponse, severity);
            if (calculatedPoints !== null) {
                points = calculatedPoints;
                isScored = true;
            }
        }

        // If a root has not been finalized, present it as Pending rather than NA
        // so the UI can reflect that it is intentionally not auto-scored.
	            let displayRes = isScored ? calculatedResponse : (effectiveIsRoot ? 'Pending' : 'NA');
            // If the root was explicitly forced to NA by a critical child's NA,
            // show NA instead of Pending to reflect the rule.
	            if (!isScored && effectiveIsRoot) {
                // We don't have access to forcedRootNa here directly; infer it
                // from calculatedResponse when unscored.
                if (String(calculatedResponse).toUpperCase() === 'NA') {
                    displayRes = 'NA';
                }
            }

        // Derive response for roots or critical fails
	        if (isScored && (effectiveIsRoot || criticalFail)) {
            const cThreshold = calculatePointsForLink('C', severity);
            const pcThreshold = calculatePointsForLink('PC', severity);
            const ncThreshold = calculatePointsForLink('NC', severity);

            if (criticalFail) {
                displayRes = 'NC';
	            } else if (effectiveIsRoot && isDraft) {
                displayRes = 'Pending';
            } else if (points >= cThreshold) {
                displayRes = 'C';
            } else if (points >= pcThreshold) {
                displayRes = 'PC';
            } else {
                displayRes = 'NC';
            }
        } else if (isScored) {
            // Normalize leaf response
            const dispStr = String(displayRes).toUpperCase();
            if (/^([A-Z]+_)?(C|FC|FULL|COMPLIANT)$/.test(dispStr) && !dispStr.includes('NON') || (dispStr.includes('COMPLIANT') && !dispStr.includes('NON') && !dispStr.includes('PARTIAL'))) displayRes = 'C';
            else if (/^([A-Z]+_)?(PC|PARTIAL|SUBSTANTIAL)$/.test(dispStr) || dispStr.includes('PARTIAL')) displayRes = 'PC';
            else if (/^([A-Z]+_)?(NC|NON|NON_COMPLIANT|NON-COMPLIANT|NOT_MET|FAIL)$/.test(dispStr) || dispStr.includes('NON') || dispStr.includes('FAIL')) displayRes = 'NC';
        }

		            const liveDisplayPoints = effectiveIsRoot && rootDraftPoints !== null
	                ? rootDraftPoints
	                : ((isScored && points !== null) ? points : null);
	            const liveDisplayResponse = (() => {
		                if (effectiveIsRoot && liveDisplayPoints !== null && !criticalFail) {
	                    const cThreshold = calculatePointsForLink('C', severity);
	                    const pcThreshold = calculatePointsForLink('PC', severity);
	                    if (liveDisplayPoints >= cThreshold) return 'C';
	                    if (liveDisplayPoints >= pcThreshold) return 'PC';
	                    return 'NC';
	                }
	                return displayRes;
	            })();

	            const res = {
	                points: (isScored && points !== null) ? points : null,
	                response: displayRes,
	                rawResponse: response, // Keep original response for UI logic fallback
	                normalizedValue: displayRes,
		                displayPoints: liveDisplayPoints,
		                displayResponse: liveDisplayResponse,
		                isRoot: effectiveIsRoot,
	                isDraft,
	                criticalFail,
	                isScored,
	                isCritical,
                // For diagnostics, surface whether a manual override was applied
                // (root treated as a leaf) during this computation.
	                isOverridden: Boolean(manualOverrideActive && effectiveIsRoot),
	                // Average over scored linked criteria only (used in some
	                // debug views).
	                draftAvg: countScoredLinks > 0 ? (sumLinkedPoints / countScoredLinks) : null,
	                countScoredLinks,
	                // Draft combined root score (after majority rule and, for
	                // Hospital, sub-criteria combination). This may be non-null
	                // even while the root is still Pending.
	                rootDraftPoints,
	                rootSources: rootSourcesInfo
	            };

        globalScores[code] = res;
        currentlyResolving.delete(code);
        return res;
    };

    // Trigger recursive computation for every criteria in the map
    Object.keys(criteriaMap).forEach(code => {
        computeCriterion(code);
    });

    return globalScores;
};

/**
 * Aggregates scores for a section based on an array of standard results.
 * 
 * @param {Array} standards - Array of results: { totalScore, maxScore, criticalFail }
 * @returns {Object} { percent, totalScore, maxScore, criticalFail }
 */
export const calculateSectionScore = (standards) => {
    if (!Array.isArray(standards) || standards.length === 0) {
        return { percent: 0, totalScore: 0, maxScore: 0, criticalFail: false };
    }

    let totalScoreSum = 0;
    let maxScoreSum = 0;
    let criticalFail = false;

    for (const standard of standards) {
        if (!standard) continue;

        totalScoreSum += (standard.totalScore || 0);
        maxScoreSum += (standard.maxScore || 0);

        if (standard.criticalFail) {
            criticalFail = true;
        }
    }

    let percent = maxScoreSum === 0 ? 0 : (totalScoreSum / maxScoreSum) * 100;
    if (criticalFail) {
        percent = 0;
        totalScoreSum = 0;
    }

    return {
        percent: parseFloat(percent.toFixed(2)),
        totalScore: totalScoreSum,
        maxScore: maxScoreSum,
        criticalFail
    };
};

/**
 * Aggregates scores for the entire assessment based on an array of section results.
 * 
 * @param {Array} sections - Array of results: { totalScore, maxScore, criticalFail }
 * @returns {Object} { percent, totalScore, maxScore, criticalFail }
 */
export const calculateOverallScore = (sections) => {
    // Logic is identical to section aggregation
    return calculateSectionScore(sections);
};
