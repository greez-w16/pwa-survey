import React, { useState, useMemo } from 'react';
import './FormArea.css';
import { useApp } from '../../contexts/AppContext';
import { api } from '../../services/api';
import indexedDBService from '../../services/indexedDBService';
import emsConfig from '../../assets/ems_config.json';
import mortuaryConfig from '../../assets/mortuary_config.json';
import clinicsConfig from '../../assets/clinics_config.json';
import hospitalConfig from '../../assets/hospital_config.json';
import emsLinks from '../../assets/ems_links.json';
import mortuaryLinks from '../../assets/mortuary_links.json';
import clinicsLinks from '../../assets/clinics_links.json';
import hospitalLinks from '../../assets/hospital_links.json';
import hospitalComputeCriteria from '../../assets/hospital_compute_criteria.json';
import ScoreBadge from '../ScoreBadge';
import { classifyAssessment } from '../../utils/classification';
import { normalizeCriterionCode } from '../../utils/normalization';
import { createAssessmentSnapshot } from '../../utils/createAssessmentSnapshot';
import { calculatePointsForLink } from '../../utils/scoring';

// Build a fast lookup from criterion ID (e.g. "1.2.1.3") to its
// standard statement, intent text, critical flag, and severity.
		const buildCriterionIndex = (configData) => {
		    const index = {};
		    try {
		        // Support EMS, Mortuary, Clinics, and Hospital configs.
		        // Accept either a single array of SE objects or an object with *_full_configuration keys.
		        let seArray = [];

		        if (Array.isArray(configData)) {
		            seArray = configData;
		        } else if (configData && typeof configData === 'object') {
		            const possibleKeys = [
		                'ems_full_configuration',
		                'mortuary_full_configuration',
		                'clinics_full_configuration',
		                'hospital_full_configuration',
		            ];
		            possibleKeys.forEach((key) => {
		                if (Array.isArray(configData[key])) {
		                    seArray = seArray.concat(configData[key]);
		                }
		            });
		        }

		        seArray.forEach(se => {
		            (se.sections || []).forEach(section => {
		                (section.standards || []).forEach(standard => {
		                    const stdId = (standard.standard_id || standard.standardId || '').trim();
		                    // Add a lookup entry for the Standard itself (e.g. "7.1.1")
		                    // so that display-only x.x.x rows can show Intent tooltips.
		                    if (stdId && !index[stdId]) {
		                        index[stdId] = {
		                            statement: standard.statement || '',
		                            intent: standard.intent_tooltip || '',
		                            is_critical: false,
		                            severity: null,
		                        };
		                    }

		                    (standard.criteria || []).forEach(crit => {
		                        if (!crit || !crit.id) return;
		                        index[crit.id] = {
		                            statement: standard.statement || '',
		                            intent: standard.intent_tooltip || '',
		                            is_critical: crit.is_critical || false,
		                            severity: crit.severity || 1,
		                        };
		                    });
		                });
		            });
		        });
		    } catch (e) {
		        console.error('FormArea: Failed to build criterion index', e);
		    }
		    return index;
		};

	// Default index for helper functions that don't have access to component state
	const DEFAULT_CRITERION_INDEX = buildCriterionIndex(emsConfig);

// Pre-compute a map of root criterion -> sub-criteria for Hospital,
// based on the "Criteria and Sub Criteria for computation" settings.
// Shape: { "7.1.1.1": ["7.1.1.2", "7.1.1.3", ...], ... }
const HOSPITAL_SUBCRITERIA_MAP = (() => {
    const map = {};
    try {
        const seList = hospitalComputeCriteria?.hospital_standards_config?.service_elements || [];
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
        // Fail quietly; tooltips will just omit sub-criteria if config is invalid
        // eslint-disable-next-line no-console
        console.error('FormArea: Failed to build hospital sub-criteria map', e);
    }
    return map;
})();

// Shared utility normalizeCriterionCode is now imported

const SEVERITY_LABELS = {
	    1: 'Minor',
	    2: 'Moderate',
	    3: 'Serious',
	    4: 'Very Serious',
	};

const formatSeverityLabel = (severity) => {
    if (severity === undefined || severity === null) return '';
    const sevNumber = parseInt(severity, 10);
    if (Number.isNaN(sevNumber)) return String(severity);
    return SEVERITY_LABELS[sevNumber] || `Severity ${sevNumber}`;
};

	// Renders a label in italics when it represents a numeric
	// **standard** (x.x.x). Criterion questions (x.x.x.x) stay normal.
	// Other labels are returned unchanged.
	const renderCriterionLabel = (labelText, { isStandardCriterion } = {}) => {
	    if (!labelText || typeof labelText !== 'string') return labelText;
	    const trimmed = labelText.trim();
	    // Looks like a 3-level code at the start, but NOT a 4-level one
	    // e.g. "7.1.1 Something" -> true, "7.1.1.1 Something" -> false
	    const looksLikeStandard = /^\d+(?:\.\d+){2}(?!\.)/.test(trimmed);
	    if (!(isStandardCriterion || looksLikeStandard)) {
	        return labelText;
	    }
	    return <em>{labelText}</em>;
	};

// Preserve full intent text (including paragraphing) from the source.
// We no longer try to break it into "Intent" vs "Overview" – the
// tooltip simply shows the complete text, and CSS handles newlines.
const splitIntentText = (fullIntent) => {
	    const text = (fullIntent || '').trim();
	    return text
	        ? { primaryIntent: text, overviewText: '' }
	        : { primaryIntent: '', overviewText: '' };
	};

			const getCriterionTooltip = (code, links, index, scoreResult) => {
			    const normalized = normalizeCriterionCode(code);
			    if (!normalized) return '';
			    const info = index[normalized];
			    if (!info) return '';
			
			    const isStandardCode = /^\d+(\.\d+){2}$/.test(normalized); // x.x.x display-only rows
			    const isCriterionCode = /^\d+(\.\d+){3}$/.test(normalized); // x.x.x.x question rows
			
			    const compareCodes = (aCode, bCode) => {
			        const aParts = normalizeCriterionCode(aCode).split('.').map(n => parseInt(n, 10));
			        const bParts = normalizeCriterionCode(bCode).split('.').map(n => parseInt(n, 10));
			        const len = Math.max(aParts.length, bParts.length);
			        for (let i = 0; i < len; i += 1) {
			            const av = Number.isNaN(aParts[i]) ? 0 : (aParts[i] || 0);
			            const bv = Number.isNaN(bParts[i]) ? 0 : (bParts[i] || 0);
			            if (av !== bv) return av - bv;
			        }
			        return 0;
			    };
			
				    const parts = [];
			    // For criterion (x.x.x.x) rows we no longer include the textual
			    // Standard / Intent / Overview blocks in the tooltip. Those remain
			    // only for higher-level rows (e.g. x.x.x display-only standards).
			    if (!isStandardCode && !isCriterionCode && info.statement) {
			        parts.push(`Standard:\n${info.statement.trim().replace(/^Standard\s*/i, '')}`);
			    }
		
			    if (!isCriterionCode && info.intent) {
			        const { primaryIntent, overviewText } = splitIntentText(info.intent);
			        if (primaryIntent) {
			            parts.push(`Intent:\n${primaryIntent}`);
			        }
			        if (!isStandardCode && overviewText) {
			            parts.push(`Overview:\n${overviewText}`);
			        }
			    }
		    if (!isStandardCode && info.severity !== undefined && info.severity !== null) {
        const sevLabel = formatSeverityLabel(info.severity);
        if (sevLabel) {
            parts.push(`Severity:\n${sevLabel}`);
        }

        // Explain how this severity level influences scoring thresholds
        const sevNumber = parseInt(info.severity, 10);
        if (!Number.isNaN(sevNumber)) {
            const cPts = calculatePointsForLink('C', sevNumber);
            const pcPts = calculatePointsForLink('PC', sevNumber);
            const ncPts = calculatePointsForLink('NC', sevNumber);

            if (cPts !== null && pcPts !== null && ncPts !== null) {
                parts.push(
                    `Severity impact on scoring:\n` +
                    `• C (Compliant): about ${cPts} pts\n` +
                    `• PC (Partial): about ${pcPts} pts\n` +
                    `• NC (Non-compliant): about ${ncPts} pts\n` +
                    `Higher severity means PC/NC scores are lower (stricter penalty).`
                );
            }
        }
		    }

		    // Add Hospital computation sub-criteria for root criteria (if configured)
		    if (scoreResult && scoreResult.isRoot) {
		        const configuredSubs = HOSPITAL_SUBCRITERIA_MAP[normalized];
		        if (configuredSubs && configuredSubs.length > 0) {
		            const sortedSubs = [...configuredSubs].sort(compareCodes);
		            const enumeratedSubs = sortedSubs
		                .map((subCode, idx) => `${idx + 1}. ${subCode}`)
		                .join('\n');
		            parts.push(`Sub-criteria for computation:\n${enumeratedSubs}`);
		        }
		    }

		    // Add Linked Criteria if available
		    if (links && Array.isArray(links)) {
		        const linkInfo = links.find(l => normalizeCriterionCode(l.criteria) === normalized);
                if (linkInfo) {
                    if (linkInfo.linked_criteria && linkInfo.linked_criteria.length > 0) {
                            // Sort linked criteria codes in natural numeric order and
                            // render them as an enumerated list for easier reading.
                            const sortedLinked = [...linkInfo.linked_criteria].sort(compareCodes);
                            const colored = sortedLinked.map((linkedCode, idx) => {
                                const m = String(linkedCode).match(/^(.*?)-(G|B)$/i);
                                const tag = m ? m[2].toUpperCase() : null;
                                const icon = tag === 'G' ? '🟩' : tag === 'B' ? '🟦' : '•';
                                // Keep the visible -G/-B suffix for clarity, prepend a colored icon
                                return `${idx + 1}. ${icon} ${linkedCode}`;
                            }).join('\n');
                            parts.push(`Linked Criteria:\n${colored}`);
                    }
                }
		    }
		
		    // Add Score Traceability (sorted by criterion code for consistency)
		    if (scoreResult && scoreResult.isRoot && scoreResult.rootSources && scoreResult.rootSources.length > 0) {
		        const sortedSources = [...scoreResult.rootSources].sort((a, b) => compareCodes(a.code, b.code));
		        const sourceDetails = sortedSources.map(src => {
		            const pts = (src.points !== null && src.isScored)
		                ? (Number.isInteger(src.points) ? src.points : src.points.toFixed(1))
		                : '---';
		            const res = src.response || 'Pending';
		            return `• ${src.code}: ${pts} pts [${res}]`;
		        }).join('\n');
		        parts.push(`Score Traceability:\n${sourceDetails}`);
		    }

    return parts.join('\n\n');
};

const ScoringGuideModal = ({ isOpen, onClose }) => {
    if (!isOpen) return null;
    return (
        <div className="scoring-modal-overlay" onClick={onClose}>
            <div className="scoring-modal-content" onClick={e => e.stopPropagation()}>
                <div className="scoring-modal-header">
                    <h2 style={{ margin: 0, color: '#2b3a8e' }}>Scoring Logic Guide</h2>
                    <button className="close-modal-btn" onClick={onClose}>&times;</button>
                </div>
                <div className="scoring-modal-body">
                    <p style={{ marginBottom: '1.5rem', color: '#4a5568' }}>This table summarizes the hierarchical structure and expected behavior of the criteria as implemented:</p>
                    <table className="scoring-guide-table">
                        <thead>
                            <tr>
                                <th>Level</th>
                                <th>Criterion ID</th>
                                <th>Type</th>
                                <th>Severity</th>
                                <th>Expected Behavior</th>
                            </tr>
                        </thead>
	                        <tbody>
	                            <tr>
	                                <td style={{ textAlign: 'center' }}><strong>3</strong></td>
		                                <td><em>1.1.2.1</em></td>
	                                <td>Mega-Root</td>
	                                <td style={{ textAlign: 'center' }}>3</td>
	                                <td><strong>Disabled.</strong> Calc: Avg of Level 2 results + other links.</td>
	                            </tr>
	                            <tr>
	                                <td style={{ textAlign: 'center' }}><strong>2</strong></td>
		                                <td><em>1.2.2.1</em></td>
	                                <td>Intermediate Root</td>
	                                <td style={{ textAlign: 'center' }}>3</td>
	                                <td><strong>Disabled.</strong> Calc: Avg of Level 1 results.</td>
	                            </tr>
	                            <tr>
	                                <td style={{ textAlign: 'center' }}><strong>1</strong></td>
		                                <td><em>1.4.1.2</em></td>
	                                <td>Data Point</td>
	                                <td style={{ textAlign: 'center' }}>3</td>
	                                <td><strong>Enabled.</strong> Manual Input (C, PC, NC).</td>
	                            </tr>
	                            <tr>
	                                <td style={{ textAlign: 'center' }}><strong>1</strong></td>
		                                <td><em>1.4.1.3</em></td>
	                                <td>Data Point</td>
	                                <td style={{ textAlign: 'center' }}>4</td>
	                                <td><strong>Enabled.</strong> Manual Input (C, PC, NC).</td>
	                            </tr>
	                        </tbody>
                    </table>
                    <div className="scoring-guide-footer" style={{ marginTop: '1.5rem', borderTop: '1px solid #e2e8f0', paddingTop: '1rem' }}>
                        <p style={{ fontSize: '0.9rem', color: '#718096', fontStyle: 'italic' }}>
                            *The scoring engine handles this recursion automatically, ensuring that roots are only finalized when all children (at any depth) are fully assessed.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};

	    const RootCalculationModal = ({ isOpen, onClose, rootCode, scoreResult }) => {
	        if (!isOpen || !scoreResult) return null;
	
	        const sources = (scoreResult.rootSources || []).slice().sort((a, b) => {
	            const norm = (code) => normalizeCriterionCode(code).split('.').map(n => parseInt(n, 10));
	            const aParts = norm(a.code);
	            const bParts = norm(b.code);
	            const len = Math.max(aParts.length, bParts.length);
	            for (let i = 0; i < len; i += 1) {
	                const av = Number.isNaN(aParts[i]) ? 0 : (aParts[i] || 0);
	                const bv = Number.isNaN(bParts[i]) ? 0 : (bParts[i] || 0);
	                if (av !== bv) return av - bv;
	            }
	            return 0;
	        });
    const points = scoreResult.points;
    const isDraft = scoreResult.isDraft;

    return (
        <div className="scoring-modal-overlay" onClick={onClose}>
            <div className="scoring-modal-content root-calc-modal" onClick={e => e.stopPropagation()}>
                <div className="scoring-modal-header">
                    <h2 style={{ margin: 0, color: '#2b3a8e' }}>Calculation Details: {rootCode}</h2>
                    <button className="close-modal-btn" onClick={onClose}>&times;</button>
                </div>
                <div className="scoring-modal-body">
                    <div className="calc-summary-box">
                        <div className="calc-stat">
                            <span className="label">{isDraft ? 'Draft Average:' : 'Current Score:'}</span>
                            <span className="value">
                                {points !== null
                                    ? (Number.isInteger(points) ? points : points.toFixed(1))
                                    : (scoreResult.draftAvg !== null ? `${Number.isInteger(scoreResult.draftAvg) ? scoreResult.draftAvg : scoreResult.draftAvg.toFixed(1)} (Draft)` : '---')}
                                {isDraft ? '' : ' pts'}
                            </span>
                        </div>
                        <div className="calc-stat">
                            <span className="label">Status:</span>
                            <span className={`value status-${scoreResult.response.toLowerCase()}`}>{scoreResult.response}</span>
                        </div>
                    </div>

                    <h4 style={{ margin: '1.5rem 0 0.5rem', color: '#2d3748' }}>Contributing Criteria:</h4>
                    <table className="scoring-guide-table">
                        <thead>
                            <tr>
                                <th>Criterion</th>
                                <th>Response</th>
                                <th>Points</th>
                            </tr>
                        </thead>
                    <tbody>
                            {sources.map((src, idx) => (
                                <tr key={idx}>
                                    <td>
                                        <em>{src.code}</em> {src.isCritical && <span style={{ color: '#c53030', fontWeight: 'bold' }} title="Critical Criterion">þ</span>}
                                    </td>
                                    <td><span className={`status-pill status-${src.response?.toLowerCase()}`}>{src.response || 'Pending'}</span></td>
                                    <td style={{ textAlign: 'right' }}>
                                        {src.points !== null ? (Number.isInteger(src.points) ? src.points : src.points.toFixed(1)) : '---'}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    <div className="calc-formula">
                        <strong>Formula:</strong> {isDraft ? "Draft average of completed items" : "Average of all linked criteria"}
                        {scoreResult.countScoredLinks > 0 && (
                            <div className="formula-work">
                                ({sources.filter(s => s.points !== null).map(s => Number.isInteger(s.points) ? s.points : s.points.toFixed(1)).join(' + ')}) / {scoreResult.countScoredLinks} = {(scoreResult.draftAvg || 0).toFixed(1)}
                            </div>
                        )}
                    </div>

                    {scoreResult.criticalFail && (
                        <div className="calc-warning" style={{ backgroundColor: '#fed7d7', borderColor: '#feb2b2', color: '#9b2c2c' }}>
                            ⛔ <strong>Critical Failure:</strong> One or more Critical Criteria (þ) linked to this root are Non-compliant. The entire score is forced to 0.
                        </div>
                    )}

                    {isDraft && !scoreResult.criticalFail && (
                        <div className="calc-warning">
                            ⚠️ This score is <strong>Pending</strong> because some contributing criteria have not been assessed yet.
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

// Internal Input component to manage local state and prevent focus loss on re-renders
const FieldInput = ({ type, value, onChange, onBlur, disabled, id, className }) => {
    const [localValue, setLocalValue] = useState(value || '');

    // Sync local value with prop value when Prop value changes from outside
    React.useEffect(() => {
        setLocalValue(value || '');
    }, [value]);

    const handleChange = (e) => {
        setLocalValue(e.target.value);
        onChange(e); // Still call parent onChange to update global state (debounced via saveField)
    };

    if (type === 'textarea') {
        return (
            <textarea
                id={id}
                className={className}
                value={localValue}
                onChange={handleChange}
                onBlur={onBlur}
                disabled={disabled}
                rows={3}
            />
        );
    }

    return (
        <input
            id={id}
            type={type || 'text'}
            className={className}
            value={localValue}
            onChange={handleChange}
            onBlur={onBlur}
            disabled={disabled}
        />
    );
};

const FormArea = ({
    activeSection,
    selectedFacility,
    user,
    groups,
    formData,
    saveField,
    isSaving,
    lastSaved,
    isADComplete,
    activeEventId,
    scoringResults,
    isScoringPending,
    onCriterionChange
}) => {
    const [customLinks, setCustomLinks] = useState(null);
    const [customConfig, setCustomConfig] = useState(null);
    const [isScoringModalOpen, setIsScoringModalOpen] = useState(false);
    const [viewingRootCalc, setViewingRootCalc] = useState(null); // { code, result }
    const [currentSubsectionIndex, setCurrentSubsectionIndex] = useState(0);
    const [showStandardSummary, setShowStandardSummary] = useState(false); // x.x.x list (collapsed by default)
    const [showPiSummary, setShowPiSummary] = useState(false); // x.x PI row (collapsed by default)
    const [isSeSummaryOpen, setIsSeSummaryOpen] = useState(false); // collapsible SE summary textarea
    const [openStandardSummaries, setOpenStandardSummaries] = useState({}); // keyed by x.x.x field id
    const [openPiGroups, setOpenPiGroups] = useState({}); // keyed by PI code (e.g. 7.1)
    // Persistent tooltip panel for criterion info (click-to-open)
    const [openCriterionTooltip, setOpenCriterionTooltip] = useState(null);

    // Reset pagination when activeSection changes
    React.useEffect(() => {
        setCurrentSubsectionIndex(0);
    }, [activeSection?.id]);

    React.useEffect(() => {
        const savedLinks = localStorage.getItem('custom_ems_links');
        if (savedLinks) {
            try {
                setCustomLinks(JSON.parse(savedLinks));
            } catch (e) {
                console.error('FormArea: Failed to parse saved custom links');
            }
        }

        const savedConfig = localStorage.getItem('custom_ems_config');
        if (savedConfig) {
            try {
                setCustomConfig(JSON.parse(savedConfig));
            } catch (e) {
                console.error('FormArea: Failed to parse saved custom config');
            }
        }
    }, []);

	    const activeGroup = groups.find(g => g.sections?.some(s => s.id === activeSection?.id));

	    const programmeType = (() => {
	        if (activeGroup?.id === 'SURV-MORTUARY' || activeGroup?.id === 'GENERAL' || activeGroup?.name === 'Mortuary') {
	            return 'mortuary';
	        }
	        if (activeGroup?.id === 'CLINICS' || activeGroup?.name === 'Clinics') {
	            return 'clinics';
	        }
	        if (activeGroup?.id === 'HOSPITAL' || activeGroup?.name === 'Hospital') {
	            return 'hospital';
	        }
	        return 'ems';
	    })();

	    // Resolve configuration for the current programme (EMS, Mortuary, Clinics, Hospital)
	    const baseConfig = customConfig || { ...emsConfig, ...mortuaryConfig, ...clinicsConfig, ...hospitalConfig };
	    const configKeyMap = {
	        ems: 'ems_full_configuration',
	        mortuary: 'mortuary_full_configuration',
	        clinics: 'clinics_full_configuration',
	        hospital: 'hospital_full_configuration',
	    };
	    const activeConfigArray = (() => {
	        const key = configKeyMap[programmeType];
	        if (baseConfig && key && Array.isArray(baseConfig[key])) {
	            return baseConfig[key];
	        }
	        return Array.isArray(baseConfig) ? baseConfig : [];
	    })();

	    // Resolve links for the current programme
	    const staticLinksMap = {
	        ems: emsLinks,
	        mortuary: mortuaryLinks,
	        clinics: clinicsLinks,
	        hospital: hospitalLinks,
	    };
	    const activeLinks = (() => {
	        if (customLinks) {
	            // New-style customLinks stored as { ems: [...], mortuary: [...], clinics: [...], hospital: [...] }
	            if (!Array.isArray(customLinks) && typeof customLinks === 'object') {
	                return customLinks[programmeType] || staticLinksMap[programmeType] || [];
	            }
	            // Backwards-compat: treat array value as override for all programmes
	            if (Array.isArray(customLinks)) {
	                return customLinks;
	            }
	        }
	        return staticLinksMap[programmeType] || [];
	    })();
		
		    const criterionIndex = useMemo(() => buildCriterionIndex(activeConfigArray), [activeConfigArray]);
		
		    // Build an SE/Section overview object for the currently active section
		    // so we can render a narrative page similar to the source PDFs (SE
		    // title, Standard text, and Standard Intent paragraphs).
		    const seOverview = useMemo(() => {
		        if (!activeSection || !Array.isArray(activeConfigArray) || activeConfigArray.length === 0) {
		            return null;
		        }
		
		        const rawName = (activeSection._originalName || activeSection.name || '').trim();
		        const rawCode = (activeSection.code || '').trim();
		
		        // Try to pull out a numeric PI id like "9.1" from the metadata
		        // name/code so we can match it to section_pi_id in the
		        // *_full_configuration arrays. If that fails (e.g. section name is
		        // just "SE 9 PREVENTION..."), fall back to inspecting the
		        // section's fields and derive the PI from the first coded
		        // Standard/Criterion id such as "9.1.1.1".
		        let hintedPiId = null;
		        const piMatch = rawName.match(/\b\d+\.\d+\b/) || rawCode.match(/\b\d+\.\d+\b/);
		        if (piMatch) {
		            hintedPiId = piMatch[0];
		        } else if (Array.isArray(activeSection.fields)) {
		            for (const f of activeSection.fields) {
		                const codeSrc = (f && (f.code || f.id)) ? String(f.code || f.id) : '';
		                if (!codeSrc) continue;
		                // Look for something like 9.1.1 or 9.1.1.1 and reduce it
		                // to the PI level (9.1).
		                const codeMatch = codeSrc.match(/\b\d+\.\d+(?:\.\d+){1,2}\b/);
		                if (!codeMatch) continue;
		                const parts = codeMatch[0].split('.');
		                if (parts.length >= 2) {
		                    hintedPiId = `${parts[0]}.${parts[1]}`;
		                    break;
		                }
		            }
		        }
		
		        let matchedSe = null;
		        let matchedSection = null;
		
		        outer: for (const se of activeConfigArray) {
		            const seSections = se.sections || [];
		            for (const sec of seSections) {
		                const secPi = (sec.section_pi_id || '').trim();
		                const secTitle = (sec.title || '').trim();
		
		                const numberMatches =
		                    !!secPi && (
		                        secPi === hintedPiId ||
		                        rawName.includes(secPi) ||
		                        rawCode.includes(secPi)
		                    );
		
		                const titleLc = secTitle.toLowerCase();
		                const nameLc = rawName.toLowerCase();
		                const titleMatches = titleLc && (nameLc.includes(titleLc) || titleLc.includes(nameLc));
		
		                if (numberMatches || titleMatches) {
		                    matchedSe = se;
		                    matchedSection = sec;
		                    break outer;
		                }
		            }
		        }
		
		        if (!matchedSe || !matchedSection) return null;
		
		        const standards = matchedSection.standards || [];
		        if (!standards.length) return null;
		
		        return {
		            seId: matchedSe.se_id,
		            seName: matchedSe.se_name,
		            sectionPiId: matchedSection.section_pi_id,
		            sectionTitle: matchedSection.title,
		            standards,
		        };
		    }, [activeSection, activeConfigArray]);
    // DEBUG: Validate props on render
    React.useEffect(() => {
        if (!activeSection) console.warn("FormArea: No active section provided");
        if (activeSection) console.log(`FormArea Rendering Section: ${activeSection.name}`);
    }, [activeSection]);

    const { configuration } = useApp();

    // Submit state
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitResult, setSubmitResult] = useState(null); // { success, message }

  // Resolve the DataElement ID for "Type of Assessment" from loaded metadata so
  // we can enforce it as mandatory on submit.
  const typeOfAssessmentDeId = React.useMemo(() => {
    const ps = configuration?.programStage;
    if (!ps) return null;
    const list = (ps.programStageDataElements || []).map(psde => psde.dataElement || psde);
    const match = list.find(de => {
      const n = (de?.displayName || de?.formName || de?.name || '').toLowerCase();
      return n.includes('type of assessment');
    });
    // Known fallback if present in your environment
    return match?.id || 'LNszX9xHx8s';
  }, [configuration]);

    // Reset submit status if data changes after successful submission
    // This allows the user to "Update" DHIS2
    React.useEffect(() => {
        if (submitResult?.success) {
            console.log('📝 FormArea: Detected change after submission, resetting status to allow update.');
            setSubmitResult(null);
        }
    }, [formData]);

		    const isADSection = activeSection?.name === "Assessment Details";

	    	    // Group fields into subsections ("pages").
	    	    //
	    	    // Desired behaviour:
	    	    //   - For coded assessment sections, treat each x.x.x "standard"
	    	    //     row as the start of a new page, and keep all following
	    	    //     fields (x.x.x.1 ... x.x.x.n, comments, etc.) on that same
	    	    //     page until the next x.x.x standard.
	    	    //   - For sections without such codes (e.g. Assessment Details),
	    	    //     fall back to header-based grouping.
	    const subsections = useMemo(() => {
	    	        if (!activeSection?.fields) return [];
	    	
		        const groups = [];
		        let currentGroup = [];
		        let hasStandardInCurrentGroup = false;
		
		        // Helper: detect if a field is a display-only x.x.x standard row.
		        const isStandardRow = (field) => {
		            if (!field || !field.code) return false;
		            const isCommentField =
		                field.isComment ||
		                field.label === 'Comment' ||
		                !!field.questionFieldId ||
		                (typeof field.label === 'string' && /-comments\b/i.test(field.label)) ||
		                field.id?.endsWith('-comments') ||
		                field.id?.endsWith('-comment');
		            if (isCommentField) return false;
	    	            const normalized = normalizeCriterionCode(field.code);
	    	            if (!normalized) return false;
	    	            // Exactly three numeric segments, e.g. "7.2.2".
	    	            return /^\d+(?:\.\d+){2}$/.test(normalized);
	    	        };
	    	
	    	        // First check whether this section actually has any standard rows.
	    	        const hasStandardRows = activeSection.fields.some((field) => isStandardRow(field));
	    	
	    	        activeSection.fields.forEach((field, index) => {
	    	            if (!field) return;
	    	
	    	            const isHeader = field.type === 'header';
	    	
	    	            if (!hasStandardRows) {
	    	                // Fallback: original header-based grouping when there
	    	                // are no coded standards in this section.
	    	                if (isHeader && index !== 0) {
	    	                    if (currentGroup.length > 0) {
	    	                        groups.push(currentGroup);
	    	                    }
	    	                    currentGroup = [field];
	    	                } else {
	    	                    currentGroup.push(field);
	    	                }
	    	                return;
	    	            }
	    	
	    	            const isStd = isStandardRow(field);
	    	
	    	            if (hasStandardRows) {
	    	                // Coded sections:
	    	                // - If we see a header *after* a standard has already
	    	                //   appeared in the current group, treat that header as
	    	                //   the start of the *next* page so that it sits above
	    	                //   the following x.x.x standard (e.g. "PATIENT SAFETY"
	    	                //   before 7.2.1).
	    	                if (isHeader && hasStandardInCurrentGroup && currentGroup.length > 0) {
	    	                    groups.push(currentGroup);
	    	                    currentGroup = [];
	    	                    hasStandardInCurrentGroup = false;
	    	                }
	    	
	    	                // When we hit a standard row:
	    	                // - if the current group already has a standard, this
	    	                //   is the *next* x.x.x → start a new page;
	    	                // - otherwise, just mark that this group now contains
	    	                //   a standard (any intro/header lines stay with it).
	    	                if (isStd) {
	    	                    if (hasStandardInCurrentGroup && currentGroup.length > 0) {
	    	                        groups.push(currentGroup);
	    	                        currentGroup = [];
	    	                    }
	    	                    hasStandardInCurrentGroup = true;
	    	                }
	    	            }
	    	
	    	            currentGroup.push(field);
	    	        });
	    	
	    	        if (currentGroup.length > 0) {
	    	            groups.push(currentGroup);
	    	        }
	    	
	        	        return groups;
	        	    }, [activeSection?.fields]);
	
	    // For each subsection (page), pre-compute a draft standard-level score
	    // and metadata (x.x.x code + title). This powers both the inline
	    // "x.x.x % Score (Not Saved)" pill next to the standard row and the
	    // floating summary panel that shows all Standards in the section.
		    const standardDraftScores = useMemo(() => {
		        if (!scoringResults?.sections || !activeSection || !Array.isArray(subsections) || subsections.length === 0) {
		            return {};
		        }
		
		        const sectionScore = scoringResults.sections.find((s) => s.id === activeSection.id);
		        const standardResults = sectionScore?.standards?.[0];
		        if (!standardResults) return {};
		
		        const criteriaScores = standardResults.criteriaScores || {};
		        const result = {};
		
		        subsections.forEach((subFields, subsectionIndex) => {
		            if (!Array.isArray(subFields) || subFields.length === 0) return;
		
		            const selectIds = subFields
		                .filter((f) => f && f.type === 'select')
		                .map((f) => f.id);
		            if (!selectIds.length) return;
		
		            let totalPoints = 0;
		            let scoredCount = 0;
		            let hasCriticalFail = false;
		
		            selectIds.forEach((id) => {
		                const score = criteriaScores[id];
		                if (!score) return;
		                if (score.criticalFail) hasCriticalFail = true;
		                if (score.isScored && score.points !== null) {
		                    totalPoints += score.points;
		                    scoredCount += 1;
		                }
		            });
		
		            let avgPercent = scoredCount ? totalPoints / scoredCount : 0;
		            if (hasCriticalFail) {
		                avgPercent = 0;
		            }
		
		            // Find the first x.x.x Standard row in this subsection so we can
		            // attach the draft score (and label) to a specific Standard.
		            let standardCode = null;
		            let standardTitle = '';
		            for (const field of subFields) {
		                if (!field) continue;
		                const isCommentField =
		                    field.isComment ||
		                    field.label === 'Comment' ||
		                    !!field.questionFieldId ||
		                    (typeof field.label === 'string' && /-comments\b/i.test(field.label)) ||
		                    field.id?.endsWith('-comments') ||
		                    field.id?.endsWith('-comment');
		                if (isCommentField) continue;
		
		                const rawLabel = field.label || '';
		                let norm = normalizeCriterionCode(field.code);
		                if (!norm || !/\d/.test(norm)) {
		                    const labelMatch = rawLabel.match(/\b\d+(?:\.\d+){2,3}\b/);
		                    if (labelMatch) {
		                        norm = labelMatch[0];
		                    }
		                }
		
		                if (norm && /^\d+(?:\.\d+){2}$/.test(norm)) {
		                    standardCode = norm;
		                    const info = criterionIndex[norm];
		                    standardTitle = (info?.statement || rawLabel || '').trim();
		                    break;
		                }
		            }
		
		            if (!standardCode) {
		                return;
		            }
		
		            result[subsectionIndex] = {
		                code: standardCode,
		                title: standardTitle || standardCode,
		                percent: avgPercent,
		                criticalFail: hasCriticalFail,
		            };
		        });
		
		        return result;
		    }, [scoringResults, activeSection, subsections, criterionIndex]);
		
		    // For each subsection, derive the PI (x.x) overview from its Standard
		    // code (x.x.x) so that sections like SE 9 correctly switch between 9.1
		    // and 9.2 depending on which subsection the user is viewing.
		    const subsectionPiOverviews = useMemo(() => {
		        if (!Array.isArray(subsections) || subsections.length === 0 || !Array.isArray(activeConfigArray)) {
		            return [];
		        }
		        const result = [];
		
		        subsections.forEach((subFields, subsectionIndex) => {
		            if (!Array.isArray(subFields) || subFields.length === 0) return;
		
		            // Reuse the same detection as above to find the x.x.x Standard
		            // code for this subsection.
		            let standardCode = null;
		            for (const field of subFields) {
		                if (!field) continue;
		                const isCommentField =
		                    field.isComment ||
		                    field.label === 'Comment' ||
		                    !!field.questionFieldId ||
		                    (typeof field.label === 'string' && /-comments\b/i.test(field.label)) ||
		                    field.id?.endsWith('-comments') ||
		                    field.id?.endsWith('-comment');
		                if (isCommentField) continue;
		
		                const rawLabel = field.label || '';
		                let norm = normalizeCriterionCode(field.code);
		                if (!norm || !/\d/.test(norm)) {
		                    const labelMatch = rawLabel.match(/\b\d+(?:\.\d+){2,3}\b/);
		                    if (labelMatch) {
		                        norm = labelMatch[0];
		                    }
		                }
		
		                if (norm && /^\d+(?:\.\d+){2}$/.test(norm)) {
		                    standardCode = norm;
		                    break;
		                }
		            }
		
		            if (!standardCode) return;
		
		            const parts = standardCode.split('.');
		            if (parts.length < 2) return;
		            const piCode = `${parts[0]}.${parts[1]}`;
		
		            let matched = null;
		            outer: for (const se of activeConfigArray) {
		                const seSections = se.sections || [];
		                for (const sec of seSections) {
		                    const secPi = (sec.section_pi_id || '').trim();
		                    if (secPi === piCode) {
		                        matched = {
		                            seId: se.se_id,
		                            seName: se.se_name,
		                            sectionPiId: sec.section_pi_id,
		                            sectionTitle: sec.title,
		                            standards: sec.standards || [],
		                        };
		                        break outer;
		                    }
		                }
		            }
		
		            if (matched) {
		                result[subsectionIndex] = matched;
		            }
		        });
		
		        return result;
		    }, [subsections, activeConfigArray]);
			
		        	// Draft PI score for the whole section: simple average of the
		        	// per-subsection Standard (x.x.x) draft scores that exist. This
		        	// powers the high-level "PI summary" header value.
		        	const sectionPiDraftScore = useMemo(() => {
		        	    const entries = Object.values(standardDraftScores || {}).filter(Boolean);
		        	    if (!entries.length) return 0;
		        	
		        	    let total = 0;
		        	    let count = 0;
		        	    entries.forEach((entry) => {
		        	        const value = typeof entry.percent === 'number'
		        	            ? entry.percent
		        	            : parseFloat(entry.percent);
		        	        if (!Number.isFinite(value)) return;
		        	        total += value;
		        	        count += 1;
		        	    });
		        	
		        	    if (!count) return 0;
		        	    return total / count;
		        	}, [standardDraftScores]);
			
		        	// PI-level critical fail: if any Standard within any PI has a
		        	// criticalFail flag, we treat the section as having a critical
		        	// failure for summary purposes.
		        	const sectionPiHasCriticalFail = useMemo(() => {
		        	    const entries = Object.values(standardDraftScores || {}).filter(Boolean);
		        	    return entries.some((entry) => entry.criticalFail);
		        	}, [standardDraftScores]);
			
			// Build a nested PI → Standards structure so the PI summary can show
			// each Performance Indicator (e.g. 7.1) with its contributing
			// standards (7.1.1, 7.1.2, ...) listed underneath.
			const piSummaryEntries = useMemo(() => {
			    if (!Array.isArray(subsections) || subsections.length === 0) return [];
			
			    const buckets = {};
			
			    subsections.forEach((subFields, idx) => {
			        const overview = subsectionPiOverviews[idx] || seOverview;
			        const piCode = overview?.sectionPiId;
			        if (!piCode) return;
			
			        if (!buckets[piCode]) {
			            buckets[piCode] = {
			                code: piCode,
			                title: overview.sectionTitle || 'Performance Indicator',
			                total: 0,
			                count: 0,
			                criticalFail: false,
			                standards: [],
			            };
			        }
			
			        const stdEntry = standardDraftScores[idx];
			        let value = 0;
			        if (stdEntry) {
			            const raw = typeof stdEntry.percent === 'number'
			                ? stdEntry.percent
			                : parseFloat(stdEntry.percent);
			            if (Number.isFinite(raw)) value = raw;
			            if (stdEntry.criticalFail) buckets[piCode].criticalFail = true;
			
			            buckets[piCode].standards.push({
			                code: stdEntry.code,
			                title: stdEntry.title,
			                percent: value,
			                criticalFail: stdEntry.criticalFail,
			                subsectionIndex: idx,
			            });
			        }
			
			        buckets[piCode].total += value;
			        buckets[piCode].count += 1;
			    });
			
			    return Object.values(buckets).map((b) => ({
			        code: b.code,
			        title: b.title,
			        percent: b.count ? b.total / b.count : 0,
			        criticalFail: b.criticalFail,
			        standards: (b.standards || []).sort((a, b) =>
			            a.code.localeCompare(b.code, undefined, { numeric: true })
			        ),
			    })).sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
			}, [subsections, subsectionPiOverviews, standardDraftScores, seOverview]);
		
		    const activeSubsectionFields = subsections[currentSubsectionIndex] || [];
		    const currentPiOverview = subsectionPiOverviews[currentSubsectionIndex] || seOverview;
    const isLastSubsection = currentSubsectionIndex === subsections.length - 1 || subsections.length === 0;

    // Render Logic Helpers
    const renderFields = () => {
        if (!activeSection) return null;

        // Safety check for fields
        if (!activeSection.fields || !Array.isArray(activeSection.fields)) {
            console.error("FormArea: activeSection.fields is missing or not an array:", activeSection);
            return <div className="error-message">Error: Section data is malformed.</div>;
        }

	    if (activeSubsectionFields.length === 0) {
	        return <div className="empty-fields-message">No fields in this subsection.</div>;
	    }

	    // Track seen criterion question codes (x.x.x.x) so that if the
	    // metadata contains two different fields with the same numeric code
	    // (e.g. 7.1.1.1) we only render the first and silently skip
	    // duplicates to avoid double rows in the UI.
	    const seenQuestionCodes = new Set();

		    // Look up the pre-computed draft Standard-level score (x.x.x) for
	        // this subsection, if any. These values come from the same
	        // scoringResults object that powers the per-criterion score badges
	        // and are also surfaced in the floating summary panel.
	        const subsectionStandardScore = standardDraftScores[currentSubsectionIndex] || null;
		
		
	    return activeSubsectionFields.map((field) => {
            // Safety check for field
            if (!field || !field.id) {
                console.warn("FormArea: Invalid field in section:", field);
                return null;
            }

		            if (field.type === 'header') {
		                // Subheading within a section. For coded SE sections where we
		                // have a matching configuration entry, we want to show the PI
		                // id (e.g. "9.2") together with the PI title or the existing
		                // header text, instead of a plain uppercase label.
		                const displayLabel = (() => {
		                    const raw = field.label || '';
		                    if (!raw) return '';
		                    const parts = raw.split(/\s+/);
		                    const kept = [];
		                    let dropping = true;
		                    for (const p of parts) {
		                        if (dropping && p.includes('_')) continue;
		                        dropping = false;
		                        kept.push(p);
		                    }
		                    const cleaned = kept.join(' ').trim();
		                    const baseLabel = cleaned || raw.trim();
		
		                    const piInfo = currentPiOverview || seOverview;
		                    if (piInfo?.sectionPiId && piInfo?.sectionTitle) {
		                        const normaliseTitle = (str) =>
		                            (str || '')
		                                .toUpperCase()
		                                .replace(/[^A-Z0-9]+/g, ' ')
		                                .replace(/\s+/g, ' ')
		                                .trim();
		
		                        const headerNorm = normaliseTitle(baseLabel);
		                        const titleNorm = normaliseTitle(piInfo.sectionTitle);
		
		                        // If the header text essentially matches the PI title, use
		                        // the canonical config title in nice case.
		                        if (headerNorm && titleNorm && (headerNorm === titleNorm ||
		                            headerNorm.includes(titleNorm) ||
		                            titleNorm.includes(headerNorm))) {
		                            const cleanTitle = piInfo.sectionTitle.replace(/[.\s]+$/g, '');
		                            return `${piInfo.sectionPiId} ${cleanTitle}`;
		                        }
		
		                        // Otherwise still prefix the existing header label with
		                        // the PI id so sections like EMS SE8 also show "8.1 ...".
		                        const alreadyHasCode = /^\d+(?:\.\d+)*\s/.test(baseLabel);
		                        if (!alreadyHasCode) {
		                            return `${piInfo.sectionPiId} ${baseLabel}`;
		                        }
		                    }
		
		                    return baseLabel;
		                })();
		                return (
		                    <div key={field.id} className="form-header-separator">
		                        <h3>{displayLabel}</h3>
		                    </div>
		                );
		            }

            // Extract calculated score for this field if it exists
            let calculatedFieldScore = null;
            if (scoringResults?.sections) {
                const currentSectionScores = scoringResults.sections.find(s => s.id === activeSection.id);
                if (currentSectionScores?.standards) {
                    for (const standard of currentSectionScores.standards) {
                        if (standard.criteriaScores && standard.criteriaScores[field.id]) {
                            calculatedFieldScore = standard.criteriaScores[field.id];
                            break;
                        }
                    }
                }
            }
	            
	            const isRoot = calculatedFieldScore?.isRoot || false;
	            const rootDraftPoints = isRoot && calculatedFieldScore
	                ? (typeof calculatedFieldScore.rootDraftPoints === 'number'
	                    ? calculatedFieldScore.rootDraftPoints
	                    : null)
	                : null;
		
		            // Precompute the raw label once so we can reuse it for
		            // multiple checks (severity, display label, code fallback).
		            const rawLabel = field.label || '';
		            const rawLabelLower = typeof rawLabel === 'string' ? rawLabel.toLowerCase() : '';
		
		            // In the Assessment Details section, hide the technical
		            // manifest/version field entirely so it does not appear in the
		            // UI. The DHIS2 label for this is typically something like
		            // "FAC_ASS_DATA_MANIFEST_VERSION Facility Assessment Data
		            // Manifest Version".
		            if (isADSection && rawLabelLower.includes('data manifest version')) {
		                return null;
		            }
		
		            // Normalise the criterion code early so we can also use it to
		            // detect comment-style data elements whose codes end with
		            // "-comments" (a common DHIS2 pattern).
		            let normalizedCode = normalizeCriterionCode(field.code);
		            // Hospital and some other programmes have a few data elements
		            // where the DHIS2 dataElement.code is missing or not aligned
		            // with the numeric criterion ID, but the label still begins
		            // with something like "7.1.1.1 HOSP ...". As a fallback,
		            // try to extract a 3- or 4-segment numeric id from the label
		            // itself so that duplicates can still be de-duplicated and
		            // severity lookups work.
		            if (!normalizedCode || !/\d/.test(normalizedCode)) {
		                const labelMatch = rawLabel.match(/\b\d+(?:\.\d+){2,3}\b/);
		                if (labelMatch) {
		                    normalizedCode = labelMatch[0];
		                }
		            }
		
		            const isCommentField =
		                field.isComment ||
		                field.label === 'Comment' ||
		                !!field.questionFieldId ||
		                // Label explicitly tagged as a comments field
		                (typeof rawLabel === 'string' && /\bcomments?\b/i.test(rawLabel)) ||
		                // DHIS2 code or normalised code ends with "-comments"
		                (typeof field.code === 'string' && /-comments?$/i.test(field.code)) ||
		                (typeof normalizedCode === 'string' && /-comments?$/i.test(normalizedCode)) ||
		                field.id?.endsWith('-comments') ||
		                field.id?.endsWith('-comment');
		
		            const associatedCommentId = field.commentFieldId;
		            const currentCommentValue = associatedCommentId ? (formData[associatedCommentId] || '') : '';
		            // Standards (x.x.x) should be display-only in the UI: no
		            // input controls, just bolded text. We detect them by a
		            // three-level numeric code (e.g. "1.2.3").
		            const isStandardCriterion =
		                !isCommentField &&
		                normalizedCode &&
		                /^\d+(\.\d+){2}$/.test(normalizedCode);
		            const isCriterionQuestion =
		                !isCommentField &&
		                normalizedCode &&
		                /^\d+(\.\d+){3}$/.test(normalizedCode);

		            if (isCriterionQuestion) {
		                if (seenQuestionCodes.has(normalizedCode)) {
		                    console.warn('FormArea: hiding duplicate criterion field for code', normalizedCode, 'field', field.id);
		                    return null;
		                }
		                seenQuestionCodes.add(normalizedCode);
		            }
		            const configEntry = normalizedCode ? (criterionIndex[normalizedCode] || {}) : {};
	            const configIsCritical = configEntry.is_critical || false;
	            const configSeverity = configEntry.severity;

            const isCritical = formData[`is_critical_${associatedCommentId}`] !== undefined
                ? formData[`is_critical_${associatedCommentId}`]
                : (configIsCritical || currentCommentValue.includes('[CRITICAL]'));

		            const questionValue = formData[field.id];
	            const isQuestionAnswered = questionValue !== undefined && questionValue !== null && questionValue !== '';

	            // Check if comment field is disabled (parent question not answered)
	            const parentQuestionId = field.questionFieldId;
	            const isParentAnswered = parentQuestionId ? (formData[parentQuestionId] !== undefined && formData[parentQuestionId] !== null && formData[parentQuestionId] !== '') : true;

		            // For Hospital root criteria that are part of the "Criteria and
		            // Sub Criteria for computation" settings, pre-compute:
		            //  - The average score of the configured sub-criteria
		            //  - The average score of all linked criteria in the scoring
		            //    graph (using rootSources from the scoring engine)
		            // These are *display only* helpers and do NOT affect the
		            // official scoring logic.
		            let subCriteriaAvgPoints = null;
		            let subCriteriaAvgCount = 0;
		            let subCriteriaExpectedCount = 0;
		            let linkedAvgPoints = null;
		            let linkedAvgCount = 0;
		            let linkedExpectedCount = 0;
		            if (
		                isRoot &&
		                normalizedCode &&
		                programmeType === 'hospital' &&
		                scoringResults?.globalScores &&
		                HOSPITAL_SUBCRITERIA_MAP[normalizedCode]
		            ) {
		                const subCodes = HOSPITAL_SUBCRITERIA_MAP[normalizedCode];
		                subCriteriaExpectedCount = Array.isArray(subCodes) ? subCodes.length : 0;
                let sum = 0;
                subCodes.forEach(subCode => {
                    const normSub = normalizeCriterionCode(subCode) || subCode;
                    const subScore = scoringResults.globalScores[normSub];
                    if (subScore && subScore.isScored && subScore.points !== null) {
                        sum += subScore.points;
                        subCriteriaAvgCount += 1;
                    }
                });
                // Always compute a value; when none are scored yet, show 0 pts (0/x)
                subCriteriaAvgPoints = subCriteriaAvgCount > 0 ? (sum / subCriteriaAvgCount) : 0;
		            }
		
		            // Compute a simple average over all linked criteria in the
		            // scoring graph for this root, using the rootSources array
		            // provided by the scoring engine. This reflects how the
		            // scoring graph is wired, independent of the App Settings
		            // computation map above. We always track counts so that we
		            // can show "0/X" even when none of the linked criteria have
		            // been scored yet.
            if (isRoot && calculatedFieldScore?.rootSources && Array.isArray(calculatedFieldScore.rootSources)) {
                const allSources = calculatedFieldScore.rootSources;
                // Exclude visual-only links (-G / -B) from debug averages and counts
                const effectiveSources = allSources.filter(src => {
                    const code = typeof src === 'string' ? src : src.code;
                    return !String(code || '').match(/-(G|B)$/i);
                });
                linkedExpectedCount = effectiveSources.length;
                let sum = 0;
                effectiveSources.forEach(src => {
                    if (!src) return;
                    if (src.isScored && src.points !== null && typeof src.points === 'number') {
                        sum += src.points;
                        linkedAvgCount += 1;
                    }
                });
                if (linkedAvgCount > 0) {
                    linkedAvgPoints = sum / linkedAvgCount;
                }
            }

	            // Compute the parent criterion's score so we can surface it
	            // next to the Comment label instead of inside the textarea.
	            // This does not change any scoring logic; it only reuses the
	            // already computed scores from scoringResults.
	            let commentScoreForDisplay = null;
	            if (isCommentField && scoringResults?.sections && parentQuestionId) {
	                const sectionScoresForComments = scoringResults.sections.find(s => s.id === activeSection.id);
	                if (sectionScoresForComments?.standards) {
	                    for (const standard of sectionScoresForComments.standards) {
	                        if (standard.criteriaScores && standard.criteriaScores[parentQuestionId]) {
	                            commentScoreForDisplay = standard.criteriaScores[parentQuestionId];
	                            break;
	                        }
	                    }
	                }
	            }

	            // If this is a comment attached to a Standard (x.x.x), hide the
	            // comment row entirely in the UI.
	            if (isCommentField && parentQuestionId) {
	                const parentField = activeSection.fields.find(f => f.id === parentQuestionId);
	                const parentNorm = parentField?.code ? normalizeCriterionCode(parentField.code) : '';
	                const parentIsStandard = parentNorm && /^\d+(\.\d+){2}$/.test(parentNorm);
	                if (parentIsStandard) {
	                    return null;
	                }
	            }

	            // Check if this is a technical field that should be read-only
	            // (Enrollment ID, TEI ID, Assessor User ID, Facility Assessment
	            // Group) in the Assessment Details section. These are
	            // populated automatically and should not be editable by the
	            // assessor.
	            const labelLower = rawLabel.toLowerCase();
	            const labelUpper = rawLabel.toUpperCase();
	            const isEnrollmentField = labelLower.includes('enrollment');
	            const isTeiField = labelLower.includes('tei id');
	            const isAssessorUserField =
	                labelUpper.includes('FAC_ASS_ASSESSOR_USER_ID') ||
	                labelUpper.includes('ASSESSOR USER ID');
            const isFacilityGroupField =
                field.id === 'pzenrgsSny3' ||
                labelLower.includes('facility assessment group');
            // Do NOT treat Facility Assessment Group as a technical (read-only) field.
            // It must remain editable so that when loading an existing event from the
            // table the corresponding group value is shown and forms can react to it.
            const isTechnicalField =
                isADSection &&
                (isEnrollmentField ||
                    isTeiField ||
                    isAssessorUserField);

		            // Look up EMS standard/intent tooltip for this data element code
		            const criterionTooltip = (!isCommentField && field.code) ? getCriterionTooltip(field.code, activeLinks, criterionIndex, calculatedFieldScore) : '';
		
		            // For Standard (x.x.x) rows, locate the hidden comment field we
		            // want to reuse as the backing store for the "Standard
		            // summary" text icon.
		            const standardSummaryCommentId = isStandardCriterion ? field.commentFieldId : null;
		            const standardSummaryValue = standardSummaryCommentId ? (formData[standardSummaryCommentId] || '') : '';
		            const isStandardSummaryOpen = isStandardCriterion && !!openStandardSummaries[field.id];
		
		            // Compute the human-friendly label once, so we can reuse it
		            // for both normal and standard (display-only) rows.
		            const displayLabel = (() => {
		                // For all fields we want to hide any technical
		                // prefixes that appear before underscores in the
		                // underlying codes (e.g. "SURV_EMS_", "FAC_ASS_"),
		                // but we still allow a clean, human-readable
		                // criterion number such as "1.2.3.4".
		                const cleanedCode = field.code ? normalizeCriterionCode(field.code) : '';
		                const shouldShowCode = !!cleanedCode && /\d/.test(cleanedCode) && !cleanedCode.includes('_');
		                const isLabelComment = typeof rawLabel === 'string' && /-comments\b/i.test(rawLabel);
		
		                // DEBUG: log what the app thinks for the specific Hospital
		                // SE7 comment label so we can see why it isn't collapsing.
		                if (
		                    typeof rawLabel === 'string' &&
		                    rawLabel.includes('HOSP There are documented risk management processes for the identification of all risks')
		                ) {
		                    console.log('FormArea DEBUG comment label', {
		                        fieldId: field.id,
		                        rawLabel,
		                        isCommentField,
		                        isLabelComment,
		                        cleanedCode,
		                        shouldShowCode,
		                    });
		                }
		
		                if (isCommentField || isLabelComment) {
		                    // Many DHIS2 comment data elements repeat the full
		                    // criterion statement in the label, e.g.
		                    // "7.1.1.1-comments HOSP There are documented risk ...".
		                    // For the assessor this just looks like a duplicate
		                    // question. In the UI we always collapse these to a
		                    // simple "Comment" label, without repeating the code
		                    // or description.
		                    return 'Comment';
		                }

	                // For Assessment Details, show only the human-friendly
	                // part of the label (e.g. "Facility Assessment Assessor
	                // User ID"), dropping any leading technical code such as
	                // "FAC_ASS_ASSESSOR_USER_ID".
	                if (isADSection) {
	                    const parts = rawLabel.split(/\s+/);
	                    if (parts.length > 1 && /^[A-Z0-9_]+$/.test(parts[0])) {
	                        return parts.slice(1).join(' ');
	                    }
	                    return rawLabel || 'Unnamed Field';
	                }

	                // For other sections, optionally prepend the
	                // cleaned criterion number (without any
	                // SURV_/FAC_/etc. prefixes) if it adds
	                // information and does not duplicate the
	                // start of the label.
	                if (shouldShowCode && rawLabel && !rawLabel.startsWith(cleanedCode)) {
	                    return `${cleanedCode} ${rawLabel}`;
	                }

	                return rawLabel || 'Unnamed Field';
	            })();

	            // For comment rows, prepare a short score label to display next
	            // to the Comment caption (separate from the textarea contents).
	            // This string is derived from the existing scoringResults and
	            // does not affect how scores are computed or stored.
	            const commentScorePillText = (() => {
	                if (!commentScoreForDisplay) return null;
	
	                const isRootScore = commentScoreForDisplay.isRoot || false;
	                const isDraftScore = commentScoreForDisplay.isDraft || false;
	
	                const pts = (commentScoreForDisplay.points !== null && commentScoreForDisplay.points !== undefined)
	                    ? (Number.isInteger(commentScoreForDisplay.points)
	                        ? `${commentScoreForDisplay.points}`
	                        : commentScoreForDisplay.points.toFixed(1))
	                    : null;
	                const status = commentScoreForDisplay.normalizedValue || commentScoreForDisplay.response || '';
	
	                if (!pts && !status) return null;
	
	                if (isRootScore) {
	                    const prefix = isDraftScore ? 'Incomplete Root Score' : 'Root Score';
	                    return `${prefix}: ${pts ? `${pts} pts ` : ''}${status}`.trim();
	                }
	
	                return `Score: ${pts ? `${pts} pts ` : ''}${status}`.trim();
	            })();

	            return (
	                <div
	                    key={field.id}
	                    className={`form-field ${isCritical ? 'is-critical' : ''} ${(!isParentAnswered && isCommentField) ? 'field-disabled' : ''}`}
	                    data-tooltip={(!isParentAnswered && isCommentField) ? "Please answer the main question first" : ""}
	                >
	                    <div className="field-label-container">
                        <div className="field-label-main">
                            <label>
	                                {isStandardCriterion ? (
	                                    <span style={{ fontSize: '1.6em', fontWeight: 400 }}>
	                                        {renderCriterionLabel(displayLabel, { isStandardCriterion, isCriterionQuestion })}
	                                    </span>
	                                ) : (
	                                    renderCriterionLabel(displayLabel, { isStandardCriterion, isCriterionQuestion })
	                                )}
                            </label>
                            {!isCommentField && configSeverity !== undefined && configSeverity !== null && (
                                <span className="severity-pill">
                                    {formatSeverityLabel(configSeverity)}
                                </span>
                            )}
	                            {isCommentField && commentScorePillText && (
	                                <span
	                                    className="comment-score-pill"
	                                    style={{
	                                        marginLeft: '10px',
	                                        fontSize: '0.8em',
	                                        fontWeight: 600,
	                                        padding: '2px 8px',
	                                        borderRadius: '12px',
	                                        backgroundColor: 'rgba(43, 58, 142, 0.06)',
	                                        color: '#2b3a8e',
	                                        border: '1px solid rgba(43, 58, 142, 0.35)'
	                                    }}
	                                >
	                                    {commentScorePillText}
	                                </span>
	                            )}
		                            {isStandardCriterion && subsectionStandardScore && (
		                                <span
		                                    className="standard-score-pill"
		                                    style={{
		                                        marginLeft: '10px',
		                                        fontSize: '0.8em',
		                                        fontWeight: 600,
		                                        padding: '2px 8px',
		                                        borderRadius: '12px',
		                                        backgroundColor: 'rgba(43, 58, 142, 0.1)',
		                                        color: '#2b3a8e',
		                                        border: '1px solid rgba(43, 58, 142, 0.35)'
		                                    }}
		                                >
		                                    {isScoringPending && (
		                                        <span className="score-spinner" aria-label="Recalculating standard score" />
		                                    )}
		                                    {subsectionStandardScore.percent.toFixed(1)}% Score (Not Saved)
		                                </span>
		                            )}
		                            {isStandardCriterion && standardSummaryCommentId && (
		                                <button
		                                    type="button"
		                                    className="standard-summary-icon"
		                                    onClick={() => {
		                                        setOpenStandardSummaries(prev => ({
		                                            ...prev,
		                                            [field.id]: !prev[field.id],
		                                        }));
		                                    }}
		                                >
		                                    Standard summary
		                                </button>
		                            )}
                            {criterionTooltip && (
                                <button
                                    type="button"
                                    className="ems-info-icon"
                                    data-ems-tooltip={criterionTooltip}
                                    aria-label="View EMS standard and intent"
                                    onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        setOpenCriterionTooltip(criterionTooltip);
                                    }}
                                >
                                    ?
                                </button>
                            )}
	                        </div>
	                        {isCritical && <span className="critical-badge">CRITICAL</span>}
	                    </div>
		                    {isStandardCriterion && standardSummaryCommentId && isStandardSummaryOpen && (
		                        <div className="standard-summary-editor">
		                            <label className="standard-summary-label" htmlFor={`standard-summary-${standardSummaryCommentId}`}>
		                                Standard summary
		                            </label>
		                            <textarea
		                                id={`standard-summary-${standardSummaryCommentId}`}
		                                className="form-control standard-summary-textarea"
		                                value={standardSummaryValue}
		                                onChange={(e) => {
		                                    const newVal = e.target.value;
		                                    saveField(standardSummaryCommentId, newVal);
		                                }}
		                                rows={3}
		                            />
		                        </div>
		                    )}
	                    {formData[`is_critical_${field.id}`] && isCommentField && (
	                        <div className="mandatory-label">Comment is required for Critical issues.</div>
	                    )}
	                    {!isStandardCriterion && (field.type === 'select' ? (
                        <>
                            {calculatedFieldScore && (
                                // Show root panel only when there is something meaningful to show:
                                // numeric points OR draft points OR at least one effective linked criterion
                                (calculatedFieldScore.points !== null || (isRoot && (rootDraftPoints !== null || linkedExpectedCount > 0)))
                            ) && (
                                <div className={`${isRoot ? 'root-score-display' : 'linked-score-display'}`} style={{ marginBottom: '10px', padding: '10px', backgroundColor: isRoot ? '#e2e8f0' : '#f0f4f8', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: isRoot ? '1px solid #cbd5e1' : '1px dashed #cbd5e1' }}>
                                    <span style={{ fontWeight: '600', color: '#2d3748', fontSize: '0.9em' }}>
                                        {isRoot ? 'Calculated Root Score:' : 'Criterion Score:'}
                                    </span>
                                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
	                                        <span style={{ fontWeight: 'bold', fontSize: '1.05em', color: '#2b3a8e' }}>
	                                            {(() => {
	                                                const effectivePoints =
	                                                    (calculatedFieldScore.points !== null && calculatedFieldScore.points !== undefined)
	                                                        ? calculatedFieldScore.points
                                                        : (isRoot && rootDraftPoints !== null
	                                                            ? rootDraftPoints
	                                                            : null);
	                                                if (effectivePoints === null) return '--- pts';
	                                                return `${Number.isInteger(effectivePoints) ? effectivePoints : effectivePoints.toFixed(1)} pts`;
	                                            })()}
	                                        </span>
                                        <span style={{
                                            padding: '2px 8px',
                                            borderRadius: '12px',
                                            fontSize: '0.75em',
                                            fontWeight: 'bold',
                                            backgroundColor: (calculatedFieldScore.response === 'NC' || calculatedFieldScore.response === 'NON') ? '#fed7d7' : ((calculatedFieldScore.response === 'PC' || calculatedFieldScore.response === 'PARTIAL' || calculatedFieldScore.response === 'SUBSTANTIAL') ? '#fefcbf' : (calculatedFieldScore.response === 'Pending' ? '#edf2f7' : '#c6f6d5')),
                                            color: (calculatedFieldScore.response === 'NC' || calculatedFieldScore.response === 'NON') ? '#c53030' : ((calculatedFieldScore.response === 'PC' || calculatedFieldScore.response === 'PARTIAL' || calculatedFieldScore.response === 'SUBSTANTIAL') ? '#b7791f' : (calculatedFieldScore.response === 'Pending' ? '#4a5568' : '#22543d'))
                                        }}>
                                            {calculatedFieldScore.response}
                                        </span>
                                        {isRoot && (
                                            <button
                                                type="button"
                                                className="view-calc-btn"
                                                onClick={() => setViewingRootCalc({ code: field.code, result: calculatedFieldScore })}
                                                title="View calculation details"
                                                style={{
                                                    background: '#2b3a8e',
                                                    color: 'white',
                                                    border: 'none',
                                                    borderRadius: '4px',
                                                    padding: '2px 8px',
                                                    fontSize: '0.75em',
                                                    cursor: 'pointer',
                                                    marginLeft: '8px'
                                                }}
                                            >
                                                ℹ️ Details
                                            </button>
                                        )}
                                    </div>
                            {isRoot && subCriteriaExpectedCount > 0 && (
		                                <div style={{ marginTop: '4px', fontSize: '0.8em', color: '#4a5568' }}>
		                                    Sub-criteria average (configured):{' '}
		                                    {Number.isInteger(subCriteriaAvgPoints)
		                                        ? subCriteriaAvgPoints
		                                        : subCriteriaAvgPoints.toFixed(1)}{' '}
		                                    pts
                                    {' '}
                                    ({subCriteriaAvgCount}/{subCriteriaExpectedCount})
		                                </div>
		                            )}
		                            {isRoot && linkedExpectedCount > 0 && (
		                                <div style={{ marginTop: '2px', fontSize: '0.8em', color: '#4a5568' }}>
		                                    Linked-criteria average (graph):{' '}
		                                    {linkedAvgPoints !== null
		                                        ? (Number.isInteger(linkedAvgPoints)
		                                            ? linkedAvgPoints
		                                            : linkedAvgPoints.toFixed(1))
		                                        : '---'}{' '}
		                                    pts
		                                    {' '}
		                                    ({linkedAvgCount}/{linkedExpectedCount})
		                                </div>
		                            )}
                                </div>
                            )}
                            <select
                                className="form-control"
                                value={isRoot && calculatedFieldScore ? (calculatedFieldScore.normalizedValue || calculatedFieldScore.response) : (formData[field.id] || '')}
                                onChange={(e) => handleInputChange(e, field.id)}
                                id={`field-${field.id}`} // Helper for testing
                                disabled={isRoot || (!isParentAnswered && isCommentField) || isTechnicalField}
                            >
                                <option value="">
                                    {isRoot
                                        ? ((linkedExpectedCount > 0 || (rootDraftPoints !== null))
                                            ? 'Auto-calculated from configured criteria'
                                            : 'Not auto-calculated (no effective linked criteria)')
                                        : 'Select...'}
                                </option>
                                {(() => {
                                    const options = field.options || [];
                                    const groups = {};
                                    const ungrouped = [];

                                    options.forEach(opt => {
                                        const val = typeof opt === 'object' ? opt.value : opt;
                                        const label = typeof opt === 'object' ? opt.label : opt;

                                        if (typeof val === 'string' && val.includes('_')) {
                                            const prefix = val.split('_')[0];
                                            if (!groups[prefix]) groups[prefix] = [];
                                            groups[prefix].push({ val, label });
                                        } else {
                                            ungrouped.push({ val, label });
                                        }
                                    });

                                    const groupKeys = Object.keys(groups);
                                    if (groupKeys.length === 0) {
                                        // No grouped options, render normally
                                        return options.map((opt, idx) => {
                                            const val = typeof opt === 'object' ? opt.value : opt;
                                            const label = typeof opt === 'object' ? opt.label : opt;
                                            return (
                                                <option key={`${val}-${idx}`} value={val}>
                                                    {label}
                                                </option>
                                            );
                                        });
                                    }

                                    // Render grouped options
                                    return (
                                        <>
                                            {ungrouped.map((opt, idx) => (
                                                <option key={`ungrouped-${opt.val}-${idx}`} value={opt.val}>
                                                    {opt.label}
                                                </option>
                                            ))}
                                            {groupKeys.map(group => (
                                                <optgroup key={group} label={group}>
                                                    {groups[group].map((opt, idx) => (
                                                        <option key={`${group}-${opt.val}-${idx}`} value={opt.val}>
                                                            {opt.label}
                                                        </option>
                                                    ))}
                                                </optgroup>
                                            ))}
                                        </>
                                    );
                                })()}
	                            </select>
	                        </>
                            ) : (
                                isCommentField ? (
                                    (() => {
                                        // Split the single DHIS2 comment value into two parts using '|'
                                        const splitCommentValue = (raw) => {
                                            const str = String(raw || '');
                                            const idx = str.indexOf('|');
                                            if (idx === -1) return { comments: str, recommendations: '' };
                                            return { comments: str.slice(0, idx), recommendations: str.slice(idx + 1) };
                                        };
                                        const joinCommentValue = (a, b) => `${a || ''}|${b || ''}`;

                                        // Strip any injected tags from display only
                                        const stripTags = (txt) => (txt || '').replace(/\s*\[(INCOMPLETE )?((ROOT )?SCORE|SEVERITY)[^\]]*\]/g, '').trim();

                                        const parts = splitCommentValue(formData[field.id] || '');
                                        const disabled = (!isParentAnswered && isCommentField) || isTechnicalField;
                                        const baseClass = `form-control ${formData[`is_critical_${field.id}`] && (!questionValue || questionValue === '') ? 'mandatory-warning' : ''}`;

                                        const handlePartChange = (which, newVal) => {
                                            const current = splitCommentValue(formData[field.id] || '');
                                            const next = joinCommentValue(
                                                which === 'comments' ? newVal : current.comments,
                                                which === 'recommendations' ? newVal : current.recommendations
                                            );
                                            saveField(field.id, next);
                                        };

                                        return (
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                                                <div>
                                                    <label className="standard-summary-label" htmlFor={`field-${field.id}-comments`}>Comments</label>
                                                    <textarea
                                                        id={`field-${field.id}-comments`}
                                                        className={baseClass}
                                                        rows={3}
                                                        value={stripTags(parts.comments)}
                                                        onChange={(e) => handlePartChange('comments', e.target.value)}
                                                        onBlur={() => handleCommentBlur(field.id)}
                                                        disabled={disabled}
                                                    />
                                                </div>
                                                <div>
                                                    <label className="standard-summary-label" htmlFor={`field-${field.id}-recs`}>Recommendations</label>
                                                    <textarea
                                                        id={`field-${field.id}-recs`}
                                                        className={baseClass}
                                                        rows={3}
                                                        value={stripTags(parts.recommendations)}
                                                        onChange={(e) => handlePartChange('recommendations', e.target.value)}
                                                        onBlur={() => handleCommentBlur(field.id)}
                                                        disabled={disabled}
                                                    />
                                                </div>
                                            </div>
                                        );
                                    })()
                                ) : (
                                    <FieldInput
                                        type={field.type}
                                        className={`form-control ${formData[`is_critical_${field.id}`] && (!questionValue || questionValue === '') ? 'mandatory-warning' : ''}`}
                                        value={formData[field.id] || ''}
                                        onChange={(e) => handleInputChange(e, field.id)}
                                        id={`field-${field.id}`}
                                        disabled={isTechnicalField}
                                    />
                                )
                            ))}
                </div>
            );
        });
    };

    if (!activeSection) {
        if (!selectedFacility) {
            return <div className="form-area-empty">Please select a facility and a section</div>;
        }
        return <div className="form-area-empty">Please select a section</div>;
    }

	    const handleInputChange = (e, fieldId) => {
	        const value = e.target.value;
	
	        const field = activeSection?.fields?.find(f => f.id === fieldId);
	        if (field?.type === 'select' && typeof onCriterionChange === 'function') {
	            onCriterionChange();
	        }
	
	        saveField(fieldId, value);
	    };

	    React.useEffect(() => {
	        if (!scoringResults?.sections || !activeSection?.fields) return;
	
	        const currentSectionScores = scoringResults.sections.find(s => s.id === activeSection.id);
	        if (!currentSectionScores?.standards) return;
	
	        let hasUpdates = false;
	        const updates = {};
	
	        // Keep comment score tags in sync with the latest scoring results,
	        // but avoid touching a comment field while the user is actively
	        // typing in it.
	        for (const field of activeSection.fields) {
	            if (field.type !== 'select' || !field.commentFieldId) continue;
	
	            // Find calculated score for this criterion
	            let calculatedScore = null;
	            for (const standard of currentSectionScores.standards) {
	                if (standard.criteriaScores && standard.criteriaScores[field.id]) {
	                    calculatedScore = standard.criteriaScores[field.id];
	                    break;
	                }
	            }
	
	            if (!calculatedScore) continue;
	
	            const commentFieldId = field.commentFieldId;
	            const currentComment = formData[commentFieldId] || '';
	
	            // If the assessor currently has focus in this comment field,
	            // don't auto-rewrite the value underneath them.
            if (typeof document !== 'undefined') {
                const activeEl = document.activeElement;
                if (activeEl && typeof activeEl.id === 'string') {
                    const id = activeEl.id;
                    // Skip auto-annotating while the assessor is typing in any of
                    // the comment textareas related to this comment field. In the
                    // split UI we render two textareas with ids:
                    //   field-<commentFieldId>-comments
                    //   field-<commentFieldId>-recs
                    // Older UIs may still use: field-<commentFieldId>
                    const isEditingThisComment =
                        id === `field-${commentFieldId}` ||
                        id === `field-${commentFieldId}-comments` ||
                        id === `field-${commentFieldId}-recs` ||
                        id.startsWith(`field-${commentFieldId}-`);
                    if (isEditingThisComment) {
                        continue;
                    }
                }
            }
	
	            const isRoot = calculatedScore.isRoot || false;
	            const isDraft = calculatedScore.isDraft || false;
	
            // Use normalized value if available for consistent tagging
            const statusText = calculatedScore.normalizedValue || calculatedScore.response || 'NA';
            const pointsText = calculatedScore.points !== null ? `${parseFloat(calculatedScore.points).toFixed(0)} pts` : '0 pts';

            // For roots, exclude -G/-B visual-only links when constructing suffix
            const allRootCodes = (calculatedScore.rootSources || []).map(s => typeof s === 'string' ? s : s.code);
            const effectiveRootCodes = allRootCodes.filter(c => !String(c || '').match(/-(G|B)$/i));
            const isPureVisualOnlyRoot = isRoot && effectiveRootCodes.length === 0;

            if (isPureVisualOnlyRoot) {
                // Clean any stale tags but do not append a new tag
                const cleaned = currentComment
                    .replace(/\s*\[(INCOMPLETE )?((ROOT )?SCORE|SEVERITY)[^\]]*\]/g, '')
                    .replace(/\[object Object\](\)]*)?/g, '')
                    .trim();
                if (cleaned !== currentComment) {
                    updates[commentFieldId] = cleaned;
                    hasUpdates = true;
                }
                continue;
            }

            const rootSuffix = isRoot && effectiveRootCodes.length > 0 ? ` -root(${effectiveRootCodes.join(',')})` : '';

            let scoreTag = `[SCORE: ${pointsText} - ${statusText}${rootSuffix}]`;
            if (isRoot) {
                scoreTag = isDraft
                    ? `[INCOMPLETE ROOT SCORE: ${pointsText} - ${statusText}${rootSuffix}]`
                    : `[ROOT SCORE: ${pointsText} - ${statusText}${rootSuffix}]`;
            }

            // Only update if there's an actual response value (not empty)
            // or if it's an auto-calculated Root score with at least one effective linked criterion
            const hasResponse = (isRoot && effectiveRootCodes.length > 0) || (formData[field.id] && formData[field.id] !== '' && formData[field.id] !== 'NA');
	
	            if (hasResponse) {
	                // Remove any old score/severity tags and also common junk like [object Object]
	                let newComment = currentComment
	                    .replace(/\s*\[(INCOMPLETE )?((ROOT )?SCORE|SEVERITY)[^\]]*\]/g, '')
	                    .replace(/\[object Object\](\)]*)?/g, '')
	                    .trim();
	                // Append the new one
	                newComment = newComment ? `${newComment} ${scoreTag}` : scoreTag;

	                if (newComment !== currentComment) {
	                    updates[commentFieldId] = newComment;
	                    hasUpdates = true;
	                }
	            } else if (currentComment.match(/\[((ROOT )?SCORE|SEVERITY)[^\]]*\]/)) {
	                // Clear score tag if answer removed
	                let newComment = currentComment.replace(/\s*\[((ROOT )?SCORE|SEVERITY)[^\]]*\]/g, '').trim();
	                if (newComment !== currentComment) {
	                    updates[commentFieldId] = newComment;
	                    hasUpdates = true;
	                }
	            }
	        }
	
	        if (hasUpdates) {
	            Object.entries(updates).forEach(([key, val]) => {
	                saveField(key, val);
	            });
	        }
	    }, [scoringResults, activeSection, saveField]);



    const handleCommentBlur = (fieldId) => {
        const currentComment = formData[fieldId] || '';
        const parentField = activeSection.fields.find(f => f.commentFieldId === fieldId);
        const parentFieldId = parentField?.id;

        let newComment = currentComment;

        // Add [CRITICAL] tag if toggled
        if (formData[`is_critical_${fieldId}`] && !newComment.includes('[CRITICAL]')) {
            newComment = newComment ? `${newComment} [CRITICAL]` : '[CRITICAL]';
        }

        // Add Score Tag if calculated score exists for parent field
        if (parentFieldId && scoringResults?.sections) {
            const currentSectionScores = scoringResults.sections.find(s => s.id === activeSection.id);
            if (currentSectionScores?.standards) {
                let calculatedScore = null;
                for (const standard of currentSectionScores.standards) {
                    if (standard.criteriaScores && standard.criteriaScores[parentFieldId]) {
                        calculatedScore = standard.criteriaScores[parentFieldId];
                        break;
                    }
                }

                if (calculatedScore && calculatedScore.points !== null) {
                    const isRoot = calculatedScore.isRoot || false;
                    const hasParentResponse = isRoot || (formData[parentFieldId] && formData[parentFieldId] !== '');

                    if (hasParentResponse) {
                    const isDraft = calculatedScore.isDraft || false;
                    const allCodes = (calculatedScore.rootSources || []).map(s => typeof s === 'string' ? s : s.code);
                    const effectiveCodes = allCodes.filter(c => !String(c || '').match(/-(G|B)$/i));
                    const isPureVisualOnlyRoot = isRoot && effectiveCodes.length === 0;

                    // Remove any old score tags first and also common junk
                    newComment = newComment
                        .replace(/\s*\[(INCOMPLETE )?((ROOT )?SCORE|SEVERITY)[^\]]*\]/g, '')
                        .replace(/\[object Object\](\)]*)?/g, '')
                        .trim();

                    if (!isPureVisualOnlyRoot) {
                        const rootSuffix = isRoot && effectiveCodes.length > 0 ? ` -root(${effectiveCodes.join(',')})` : '';
                        let scoreTag = `[SCORE: ${parseFloat(calculatedScore.points).toFixed(0)} pts - ${calculatedScore.response}${rootSuffix}]`;
                        if (isRoot) {
                            if (isDraft) {
                                scoreTag = `[INCOMPLETE ROOT SCORE: ${parseFloat(calculatedScore.points).toFixed(0)} pts - ${calculatedScore.response}${rootSuffix}]`;
                            } else {
                                scoreTag = `[ROOT SCORE: ${parseFloat(calculatedScore.points).toFixed(0)} pts - ${calculatedScore.response}${rootSuffix}]`;
                            }
                        }
                        // Append the new one only when there are effective links
                        newComment = newComment ? `${newComment} ${scoreTag}` : scoreTag;
                    }
                    }
                }
            }
        }

        if (newComment !== currentComment) {
            saveField(fieldId, newComment);
        }
    };

    const handleCriticalToggle = (fieldId, commentFieldId, isChecked) => {
        const currentComment = formData[commentFieldId] || '';
        let newComment = currentComment;

        // Save a helper state to track if critical is toggled, so we can make it mandatory
        saveField(`is_critical_${commentFieldId}`, isChecked);

        if (!isChecked) {
            // If turning off, remove the tag immediately
            newComment = currentComment.replace(/\s?\[CRITICAL\]/g, '').trim();
            saveField(commentFieldId, newComment);
        }
    };

	    const handleSubmit = async () => {
	        if (!configuration) {
	            setSubmitResult({ success: false, message: 'Form configuration not loaded yet.' });
	            return;
	        }
			    // Use the same orgUnit as the facility shown in the header when
			    // submitting to the survey program. That orgUnit comes from the
			    // team-assignment / facility orgUnit (e.g. the hospital/clinic the
			    // assessor sees at the top of the form). We still fall back to the
			    // program-level orgUnit only if no facility orgUnit is available.
			    const orgUnit =
			        // 1) Facility orgUnit ID used for the header label
			        selectedFacility?.orgUnitId ||
			        // 2) Raw orgUnit from the assignment object (string ID or object)
			        (typeof selectedFacility?.orgUnit === 'string'
			          ? selectedFacility.orgUnit
			          : selectedFacility?.orgUnit?.id) ||
			        // 3) Any explicit facility identifier if present
			        selectedFacility?.facilityId ||
			        // 4) Fallback: program-level orgUnit from the scheduling enrollment
			        selectedFacility?.programOrgUnitId;
	        if (!orgUnit) {
	            setSubmitResult({ success: false, message: 'No facility selected.' });
	            return;
	        }

        setIsSubmitting(true);
        setSubmitResult(null);

        // Validation: Check for mandatory critical comments
        const missingComments = activeSection.fields
            .filter(f => formData[`is_critical_${f.id}`])
            .filter(f => {
                const val = formData[f.id] || '';
                return val.replace('[CRITICAL]', '').trim() === '';
            });

        if (missingComments.length > 0) {
            setSubmitResult({ success: false, message: '❌ Please provide comments for all items marked as Critical.' });
            setIsSubmitting(false);
            return;
        }

    // Validation: "Type of Assessment" must be selected in Assessment Details
    if (typeOfAssessmentDeId) {
      const v = formData?.[typeOfAssessmentDeId];
      if (v === undefined || v === null || String(v).trim() === '' || String(v).toUpperCase() === 'NA') {
        setSubmitResult({ success: false, message: '❌ Please select a Type of Assessment in Assessment Details before saving.' });
        setIsSubmitting(false);
        return;
      }
    }

	        try {
	            // Priority 1: Official Assignment IDs (The Source of Truth)
	            // Priority 2: Locally saved internal IDs (From previous successes)
		            const enrichedData = {
	                ...formData,
	                // Reuse the facility TEI from the scheduling workflow if
	                // available, but NEVER reuse its enrollment ID for the
	                // main survey program. That enrollment belongs to the
	                // scheduling program (K9O5fdoBmKf), so we let DHIS2 create
	                // a fresh enrollment for G2gULe4jsfs. If a survey-specific
	                // enrollment already exists, it will be stored in
	                // formData.enrollmentId_internal from a previous
	                // successful submission.
	                teiId_internal: selectedFacility?.trackedEntityInstance || formData.teiId_internal,
	                enrollmentId_internal: formData.enrollmentId_internal,
	                // Add point-in-time scoring snapshot for auditing
	                scoringSnapshot: createAssessmentSnapshot(scoringResults)
		            };
		
            console.log('🚀 Starting Event PUT workflow...', {
                submitOrgUnit: orgUnit,
                assignmentOrgUnitId: selectedFacility?.orgUnitId,
                assignmentOrgUnitName: selectedFacility?.orgUnitName,
                programOrgUnitId: selectedFacility?.programOrgUnitId,
            });

            // 1) Resolve latest DHIS2 survey Event ID for this TEI/program/stage (prefer latest on server)
            const programId = configuration?.program?.id || 'G2gULe4jsfs';
            const stageId = configuration?.programStage?.id || 'HpHD6u6MV37';
            const teiId = enrichedData.teiId_internal;
            if (!teiId) {
                throw new Error('Missing TEI ID; cannot resolve latest survey event.');
            }
            let latestEventId = null;
            try {
                latestEventId = await api.getLatestSurveyEventId({
                    programId,
                    stageId,
                    teiId,
                    orgUnitId: orgUnit
                });
            } catch (resolveErr) {
                console.warn('⚠️ Could not resolve latest survey event; falling back to local eventId_internal if present.', resolveErr);
            }

            // Prefer an explicitly selected/loaded event id first (e.g. from clicking a row),
            // then fall back to server-latest, then any legacy fields.
            const putEventId = formData.eventId_internal || formData.event || formData.eventId || latestEventId;
            if (!putEventId) {
                throw new Error('Missing survey Event ID (latest on server and local draft are both unavailable).');
            }

            // Persist the resolved event id into the draft and use it for the payload
            try { saveField('eventId_internal', putEventId); } catch (_) {}
            const payloadData = { ...enrichedData, eventId_internal: putEventId };

            const result = await api.submitEventPut(
                payloadData,
                configuration,
                orgUnit
            );

            // For the PUT flow, we already know the target Event ID
            const dhis2EventId = putEventId;

	            if (activeEventId) {
	                await indexedDBService.markAsSynced(activeEventId, dhis2EventId || 'synced');
	            }
	
	            setSubmitResult({ success: true, message: '✅ Saved successfully (data will sync to DHIS2 when online).' });
        } catch (err) {
            console.error('❌ Tracker workflow failed:', err);
            if (activeEventId) await indexedDBService.markAsFailed(activeEventId, err.message);
            setSubmitResult({ success: false, message: `❌ Submit failed: ${err.message}` });
        } finally {
            setIsSubmitting(false);
        }
    };

	    return (
	        <div className="form-area">
		            <div className="form-header">
		                <div className="header-content">
			                    <h2>
			                        {(() => {
			                            const raw = activeSection?.name || '';
			                            if (!raw) return '';
			                            const upper = raw.toUpperCase();

			                            // If the name already starts with an SE prefix like
			                            // "SE7 RISK MANAGEMENT" or "SE 7 RISK MANAGEMENT",
			                            // normalise it to "SE 7 ..." (i.e. always include a
			                            // space between SE and the number).
			                            const sePrefixMatch = raw.match(/^\s*SE\s*([0-9]+(?:\.[0-9]+)*)\s*(.*)$/i);
			                            if (sePrefixMatch) {
			                                const num = sePrefixMatch[1];
			                                const rest = sePrefixMatch[2].trim();
			                                const seToken = `SE ${num}`;
			                                return rest ? `${seToken} ${rest}` : seToken;
			                            }

			                            // Try to derive SE code from HOSP patterns, e.g.
			                            // "1-HOSPITAL_1 HOSP_SE1 ..." or "SURV_HOSP_1.1 ...".
			                            const hospMatch = upper.match(/HOSP[_\s-]*(SE)?(\d+(?:\.\d+)*)/);
			                            if (hospMatch) {
			                                const numPart = hospMatch[2]; // e.g. "1" or "1.1"
			                                const seToken = `SE ${numPart}`;
			                                const rest = raw
			                                    .slice(hospMatch.index + hospMatch[0].length)
			                                    .replace(/^[\s\-_:]+/, '');
			                                return rest ? `${seToken} ${rest}` : seToken;
			                            }
			                            return raw.trim();
			                        })()}
	                        {subsections.length > 1 && (
                            <span style={{ fontSize: '0.6em', opacity: 0.8, marginLeft: '10px', verticalAlign: 'middle', backgroundColor: 'rgba(255,255,255,0.15)', padding: '2px 8px', borderRadius: '4px' }}>
                                Part {currentSubsectionIndex + 1} of {subsections.length}
                            </span>
                        )}
                    </h2>
                    {activeEventId && (
                        <div className="save-status-container">
                            {isSaving ? (
                                <span className="save-status saving">
                                    <span className="spinner"></span> Saving...
                                </span>
                            ) : lastSaved ? (
                                <span className="save-status saved">
                                    Saved {lastSaved.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                            ) : (
                                <span className="save-status ready">Ready to save</span>
                            )}
                        </div>
                    )}
	                    {/* Section-level scoring summary was previously shown here.
	                        The standard-level draft score is now displayed inline
	                        next to the x.x.x standard row within the form body. */}
                    <div className="header-actions" style={{ marginLeft: 'auto' }}>
                        <button
                            className="scoring-logic-btn"
                            onClick={() => setIsScoringModalOpen(true)}
                            title="View Scoring Logic Summary"
                        >
                            📊 Scoring Logic
                        </button>
                    </div>
                </div>
            </div>
            <ScoringGuideModal
                isOpen={isScoringModalOpen}
                onClose={() => setIsScoringModalOpen(false)}
            />
	            <RootCalculationModal
	                isOpen={!!viewingRootCalc}
	                rootCode={viewingRootCalc?.code}
	                scoreResult={viewingRootCalc?.result}
	                onClose={() => setViewingRootCalc(null)}
	            />
		            {/* Top pager: duplicate of the bottom Previous/Next controls so
		                assessors can navigate subsections without scrolling all the
		                way down. */}
		            {subsections.length > 1 && (
		                <div
		                    className="subsection-nav subsection-nav-top"
		                    style={{
		                        display: 'flex',
		                        justifyContent: 'space-between',
		                        alignItems: 'center',
		                        width: '100%',
		                        margin: '0 0 0.75rem 0',
		                    }}
		                >
		                    <button
		                        className="nav-btn"
		                        onClick={() => {
		                            setCurrentSubsectionIndex((curr) => Math.max(0, curr - 1));
		                            window.scrollTo(0, 0);
		                        }}
		                        disabled={currentSubsectionIndex === 0}
		                        style={{ opacity: currentSubsectionIndex === 0 ? 0.5 : 1 }}
		                    >
		                        
		                        
		                        
		                        
		                        
		                        
		                        
		                        ← Previous Page
		                    </button>
		                    <span
		                        className="page-indicator"
		                        style={{ fontWeight: 600, color: '#4a5568' }}
		                    >
		                        Subsection {currentSubsectionIndex + 1} of {subsections.length}
		                    </span>
		                    <button
		                        className="nav-btn"
		                        onClick={() => {
		                            setCurrentSubsectionIndex((curr) =>
		                                Math.min(subsections.length - 1, curr + 1),
		                            );
		                            window.scrollTo(0, 0);
		                        }}
		                        disabled={isLastSubsection}
		                        style={{ opacity: isLastSubsection ? 0.5 : 1 }}
		                    >
		                        Next Page →
		                    </button>
		                </div>
		            )}
		            <div className="form-content">
		                {Object.keys(standardDraftScores).length > 0 && (
		                    <>
		                        {/* 1. SE narrative summary (free-text) – now labelled Overview */}
		                        <div className="standard-summary-panel">
		                            <button
		                                type="button"
		                                className="standard-summary-toggle"
		                                onClick={() => setIsSeSummaryOpen(prev => !prev)}
		                            >
		                                <span>Overview</span>
		                                <span>{isSeSummaryOpen ? '▾' : '▸'}</span>
		                            </button>
		                            {isSeSummaryOpen && (
		                                <div className="standard-summary-body">
		                                    <label
		                                        htmlFor={`se-summary-${activeSection?.id || 'unknown'}`}
		                                        className="standard-summary-label"
		                                    >
		                                        Overview for this SE
		                                    </label>
		                                    <textarea
		                                        id={`se-summary-${activeSection?.id || 'unknown'}`}
		                                        className="form-control se-summary-textarea"
		                                        rows={4}
		                                        value={formData[`se_summary_${activeSection?.id}`] || ''}
		                                        onChange={(e) => {
		                                            const key = `se_summary_${activeSection?.id}`;
		                                            saveField(key, e.target.value);
		                                        }}
		                                        placeholder="Type an overview or concise narrative for this SE..."
		                                    />
		                                </div>
		                            )}
		                        </div>
		
		                        {/* 2. PI (x.x) aggregate summary for this section */}
		                        <div className="standard-summary-panel">
		                            <button
		                                type="button"
		                                className="standard-summary-toggle"
		                                onClick={() => setShowPiSummary(prev => !prev)}
		                            >
		                                <span>
                                    SE summary
		                                    <span className="standard-summary-pi-inline">
		                                        {' Overall: '}
		                                        {Number(sectionPiDraftScore || 0).toFixed(1)}%
		                                    </span>
		                                </span>
		                                <span>{showPiSummary ? '▾' : '▸'}</span>
		                            </button>
                            {showPiSummary && (
                                <div className="standard-summary-body">
                                    {piSummaryEntries.map((entry) => {
                                        const isOpen = !!openPiGroups[entry.code];
                                        const togglePi = () => {
                                            setOpenPiGroups((prev) => ({
                                                ...prev,
                                                [entry.code]: !prev[entry.code],
                                            }));
                                        };

                                        return (
                                            <div key={entry.code} className="pi-summary-group">
                                                {/* PI row (click to expand/collapse standards) */}
                                                <div
                                                    className="standard-summary-row standard-summary-row-clickable"
                                                    role="button"
                                                    tabIndex={0}
                                                    onClick={togglePi}
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter' || e.key === ' ') {
                                                            e.preventDefault();
                                                            togglePi();
                                                        }
                                                    }}
                                                >
                                                    <div className="standard-summary-code">
                                                        {entry.code}
                                                    </div>
                                                    <div className="standard-summary-title">
                                                        {entry.title}
                                                    </div>
                                                    <div className="standard-summary-score">
                                                        <span
                                                            className={
                                                                'standard-summary-score-value' +
                                                                (entry.criticalFail
                                                                    ? ' standard-summary-score-critical'
                                                                    : '')
                                                            }
                                                        >
                                                            {Number(entry.percent || 0).toFixed(1)}%
                                                        </span>
                                                        {entry.criticalFail && (
                                                            <span className="standard-summary-critical-flag">
                                                                CF
                                                            </span>
                                                        )}
                                                        <span className="standard-summary-pi-toggle-icon">
                                                            {isOpen ? '▾' : '▸'}
                                                        </span>
                                                    </div>
                                                </div>

                                                {/* Standards under this PI */}
                                                {isOpen && entry.standards && entry.standards.map((std) => {
                                                    const isCurrent = std.subsectionIndex === currentSubsectionIndex;
                                                    const handleJumpToSubsection = () => {
                                                        setCurrentSubsectionIndex(std.subsectionIndex);
                                                        window.scrollTo(0, 0);
                                                    };
                                                    return (
                                                        <div
                                                            key={`${entry.code}-${std.code}-${std.subsectionIndex}`}
                                                            className={
                                                                'standard-summary-row standard-summary-row-clickable standard-summary-row-standard' +
                                                                (isCurrent ? ' standard-summary-row-active' : '')
                                                            }
                                                            role="button"
                                                            tabIndex={0}
                                                            onClick={handleJumpToSubsection}
                                                            onKeyDown={(e) => {
                                                                if (e.key === 'Enter' || e.key === ' ') {
                                                                    e.preventDefault();
                                                                    handleJumpToSubsection();
                                                                }
                                                            }}
                                                        >
                                                            <div className="standard-summary-code">{std.code}</div>
                                                            <div className="standard-summary-title">
                                                                {std.title}
                                                            </div>
                                                            <div className="standard-summary-score">
                                                                <span
                                                                    className={
                                                                        'standard-summary-score-value' +
                                                                        (std.criticalFail
                                                                            ? ' standard-summary-score-critical'
                                                                            : '')
                                                                    }
                                                                >
                                                                    {Number(std.percent || 0).toFixed(1)}%
                                                                </span>
                                                                {std.criticalFail && (
                                                                    <span className="standard-summary-critical-flag">
                                                                        CF
                                                                    </span>
                                                                )}
                                                                {isCurrent && (
                                                                    <span className="standard-summary-current-pill">
                                                                        Current
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
		                        </div>
		                    </>
		                )}
		                {renderFields()}
		            </div>
            <div className="form-footer">
                {submitResult && (
                    <div style={{
                        padding: '8px 12px',
                        marginBottom: '8px',
                        borderRadius: '4px',
                        background: submitResult.success ? '#d4edda' : '#f8d7da',
                        color: submitResult.success ? '#155724' : '#721c24',
                        fontSize: '0.9em'
                    }}>
                        {submitResult.message}
                    </div>
                )}
                {subsections.length > 1 && (
                    <div className="subsection-nav" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginBottom: '1rem' }}>
                        <button
                            className="nav-btn"
                            onClick={() => {
                                setCurrentSubsectionIndex(curr => Math.max(0, curr - 1));
                                window.scrollTo(0, 0);
                            }}
                            disabled={currentSubsectionIndex === 0}
                            style={{ opacity: currentSubsectionIndex === 0 ? 0.5 : 1 }}
                        >
                            ← Previous Page
                        </button>
                        <span className="page-indicator" style={{ fontWeight: 600, color: '#4a5568' }}>
                            Subsection {currentSubsectionIndex + 1} of {subsections.length}
                        </span>
                        <button
                            className="nav-btn"
                            onClick={() => {
                                setCurrentSubsectionIndex(curr => Math.min(subsections.length - 1, curr + 1));
                                window.scrollTo(0, 0);
                            }}
                            disabled={isLastSubsection}
                            style={{ opacity: isLastSubsection ? 0.5 : 1 }}
                        >
                            Next Page →
                        </button>
                    </div>
                )}
	                {isLastSubsection && (
	                    <button
	                        className="nav-btn submit-btn"
	                        onClick={handleSubmit}
	                        disabled={isSubmitting || isSaving || submitResult?.success}
	                        style={{
	                            marginTop: '12px',
	                            width: '100%',
	                            background: (isSubmitting || isSaving) ? '#6c757d' : submitResult?.success ? '#2ecc71' : '#28a745',
	                            color: '#fff',
	                            border: 'none',
	                            padding: '10px',
	                            borderRadius: '4px',
	                            cursor: (isSubmitting || isSaving || submitResult?.success) ? 'not-allowed' : 'pointer',
	                            fontWeight: 600,
	                            fontSize: '1em',
	                            opacity: submitResult?.success ? 0.8 : 1
	                        }}
	                    >
	                        {isSubmitting
	                            ? 'Saving...'
	                            : submitResult?.success
	                                ? '✓ Successfully Saved'
	                                : 'Save'}
	                    </button>
	                )}
            </div>
            {/* Click-to-open persistent tooltip panel */}
            {openCriterionTooltip && (
                <div className="scoring-modal-overlay" onClick={() => setOpenCriterionTooltip(null)}>
                    <div
                        className="scoring-modal-content"
                        style={{ maxWidth: '900px', maxHeight: '85vh' }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="scoring-modal-header">
                            <div>Criterion information</div>
                            <button className="close-modal-btn" onClick={() => setOpenCriterionTooltip(null)} aria-label="Close">&times;</button>
                        </div>
                        <div className="scoring-modal-body" style={{ whiteSpace: 'pre-line' }}>
                            {openCriterionTooltip}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default FormArea;
