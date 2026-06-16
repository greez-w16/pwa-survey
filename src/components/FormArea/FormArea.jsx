import React, { useState, useMemo } from 'react';
import './FormArea.css';
import { useApp } from '../../contexts/AppContext';
import { api } from '../../services/api';
import indexedDBService from '../../services/indexedDBService';
import emsConfig from '../../assets/ems/ems_config.json';
import mortuaryConfig from '../../assets/mortuary/mortuary_config.json';
import clinicsConfig from '../../assets/clinics/clinics_config.json';
import hospitalConfig from '../../assets/hospital/hospital_config.json';
import emsLinks from '../../assets/ems/ems_links.json';
import mortuaryLinks from '../../assets/mortuary/mortuary_links.json';
import clinicsLinks from '../../assets/clinics/clinics_links.json';
import hospitalLinks from '../../assets/hospital/hospital_links.json';
import hospitalComputeCriteria from '../../assets/hospital/hospital_compute_criteria.json';
import ScoreBadge from '../ScoreBadge';
import { classifyAssessment } from '../../utils/classification';
import { normalizeCriterionCode } from '../../utils/normalization';
import { createAssessmentSnapshot } from '../../utils/createAssessmentSnapshot';
import { calculatePointsForLink } from '../../utils/scoring';
import { decorateHospitalLinksWithMatrixTags } from '../../utils/hospitalMatrixTags';

        const getProgrammeTypeFromGroup = (group) => {
        if (!group) return 'ems';
        const id = String(group.id || '').trim().toUpperCase();
        const name = String(group.name || '').trim().toLowerCase();
        
        if (id === 'HOSPITAL' || name.includes('hospital')) return 'hospital';
        if (id === 'CLINICS' || name.includes('clinic')) return 'clinics';
        if (id === 'EMS' || name.includes('ems')) return 'ems';
        if (id === 'GENERAL' || id === 'MORTUARY' || name.includes('mortu')) return 'mortuary';
        if (id === 'OBGYN' || name.includes('obg')) return 'obgyn';
        if (id === 'PHYSIOTHERAPY' || name.includes('physio')) return 'physiotherapy';
        if (id === 'RADIOLOGY' || name.includes('radio')) return 'radiology';
        if (id === 'PRIVATE_LAB' || name.includes('private lab') || name.includes('private_lab') || name.includes('medical lab') || name.includes('medical_lab')) return 'private_lab';
        if (id === 'GENERAL_PRACTICE' || name.includes('general practice') || name.includes('general_practice')) return 'general_practice';
        if (id === 'PRIVATE_DIETETIC' || name.includes('diabet') || name.includes('dietet') || name.includes('prd')) return 'private_diabetic';
        if (id === 'MENTAL_HEALTH' || name.includes('mental')) return 'mental_health';
        if (id === 'EYE' || name.includes('eye')) return 'eye';
        if (id === 'HOSPICE_PALLIATIVE' || name.includes('hospice') || name.includes('palliative')) return 'hospice_palliative';
        if (id === 'OCCUPATIONAL_HEALTH' || name.includes('occupational')) return 'occupational_health';
        if (id === 'UROLOGY_NEPHR' || name.includes('urology') || name.includes('nephr')) return 'urology_nephrology';
        if (id === 'ORAL' || name.includes('oral')) return 'oral';
        if (id === 'IMCI' || name.includes('imci') || name.includes('childhood')) return 'imci';
        if (id === 'EMONC' || name.includes('emonc') || name.includes('emergency')) return 'emonc';
        if (id === 'ONCOLOGY' || name.includes('oncology') || name.includes('onc')) return 'oncology';
        if (id === 'PAEDIATRIC' || name.includes('paediatric') || name.includes('pae') || name.includes('pediatric')) return 'paediatric';
        
        return 'ems';
    };

    // Build a fast lookup from criterion ID (e.g. "1.2.1.3") to its
    // standard statement, intent text, critical flag, and severity.
            const buildCriterionIndex = (configData) => {
                const index = {};
                try {
                    // Support all 20 configs.
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
                            'obsterics_gyno_full_configuration',
                            'obgyn_full_configuration',
                            'physiotheraphy_full_configuration',
                            'physiotherapy_full_configuration',
                            'radiology_full_configuration',
                            'general_practice_full_configuration',
                            'private_diabetic_full_configuration',
                            'private_dietetic_full_configuration',
                            'oral_full_configuration',
                            'private_oncology_full_configuration',
                            'oncology_full_configuration',
                            'paediatric_full_configuration',
                            'private_medical_lab_full_configuration',
                            'private_lab_full_configuration',
                            'mental_health_full_configuration',
                            'eye_full_configuration',
                            'hospice_full_configuration',
                            'hospice_palliative_full_configuration',
                            'occupational_health_full_configuration',
                            'urology_full_configuration',
                            'urology_nephrology_full_configuration',
                            'childhood_illness_full_configuration',
                            'imci_full_configuration',
                            'emergency_management_full_configuration',
                            'emonc_full_configuration',
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
                                        intent: standard.intent_tooltip || standard.intent || '',
	                                        guideline: standard.guideline || standard.guidelines || standard.guidline || '',
                                        is_critical: false,
                                        severity: null,
                                    };
                                }

                                    (standard.criteria || []).forEach(crit => {
                                    if (!crit || !crit.id) return;
                                    index[crit.id] = {
                                        statement: standard.statement || '',
                                        intent: standard.intent_tooltip || standard.intent || '',
                                        description: (crit.description && !crit.description.trim().startsWith('Critical:')) ? crit.description : '',
                                        guideline: crit.guideline || crit.guidelines || crit.guidline || '',
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

            const injectVirtualStandards = (sections, criterionIndex) => {
                if (!Array.isArray(sections)) return [];
                return sections.map(section => {
                    const fields = section.fields || [];
                    const presentCodes = new Set();
                    fields.forEach(f => {
                        let norm = normalizeCriterionCode(f.code);
                        if (!norm || !/\d/.test(norm)) {
                            const match = (f.label || '').match(/\b\d+(?:\.\d+){2,3}\b/);
                            if (match) norm = match[0];
                        }
                        if (norm) presentCodes.add(norm);
                    });

                    const missingStandards = new Set();
                    fields.forEach(f => {
                        let norm = normalizeCriterionCode(f.code);
                        if (!norm || !/\d/.test(norm)) {
                            const match = (f.label || '').match(/\b\d+(?:\.\d+){2,3}\b/);
                            if (match) norm = match[0];
                        }
                        if (norm && /^\d+(\.\d+){3}$/.test(norm)) {
                            const stdCode = norm.split('.').slice(0, 3).join('.');
                            if (!presentCodes.has(stdCode)) {
                                missingStandards.add(stdCode);
                            }
                        }
                    });

                    if (missingStandards.size === 0) return section;

                    const newFields = [];
                    const injectedStandards = new Set();

                    fields.forEach(f => {
                        let norm = normalizeCriterionCode(f.code);
                        if (!norm || !/\d/.test(norm)) {
                            const match = (f.label || '').match(/\b\d+(?:\.\d+){2,3}\b/);
                            if (match) norm = match[0];
                        }

                        if (norm && /^\d+(\.\d+){3}$/.test(norm)) {
                            const stdCode = norm.split('.').slice(0, 3).join('.');
                            if (missingStandards.has(stdCode) && !injectedStandards.has(stdCode)) {
                                injectedStandards.add(stdCode);
                                const stdInfo = criterionIndex?.[stdCode] || {};
                                const statement = stdInfo.statement || `Standard ${stdCode}`;
                                newFields.push({
                                    id: `virtual-std-${section.id}-${stdCode}`,
                                    label: statement,
                                    type: 'text',
                                    code: stdCode,
                                    isVirtualStandard: true,
                                });
                            }
                        }
                        newFields.push(f);
                    });

                    return {
                        ...section,
                        fields: newFields
                    };
                });
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
                return <span dangerouslySetInnerHTML={{ __html: labelText }} />;
            }
            return <em dangerouslySetInnerHTML={{ __html: labelText }} />;
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

	                const getCriterionTooltip = (code, links, index, scoreResult, hospitalSubcriteriaMap = HOSPITAL_SUBCRITERIA_MAP) => {
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
                    if (hospitalSubcriteriaMap?.[normalized]?.length > 0) {
                        parts.push("**Root Criteria**");
                    }
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

	                // Add Hospital computation sub-criteria whenever configured.
	                // Do not require scoreResult.isRoot here: some Hospital roots only
	                // have visual -G/-B links and are therefore not marked as scoring
	                // roots, but their configured sub-criteria should still be visible
	                // in the criterion information panel.
	                const configuredSubs = hospitalSubcriteriaMap?.[normalized];
	                if (configuredSubs && configuredSubs.length > 0) {
	                    const sortedSubs = [...configuredSubs].sort(compareCodes);
	                    const enumeratedSubs = sortedSubs
	                        .map((subCode, idx) => `${idx + 1}. ${subCode}`)
	                        .join('\n');
	                    parts.push(`Sub-criteria for computation:\n${enumeratedSubs}`);
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
	        const points = (scoreResult.displayPoints !== null && scoreResult.displayPoints !== undefined)
	            ? scoreResult.displayPoints
	            : scoreResult.points;
	        const displayResponse = scoreResult.displayResponse || scoreResult.response;
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
	                                        ? `${Math.round(points)} pts${isDraft ? ' (Draft)' : ''}`
	                                        : (scoreResult.draftAvg !== null ? `${Math.round(scoreResult.draftAvg)} pts (Draft)` : '---')}
                                </span>
                            </div>
                            <div className="calc-stat">
                                <span className="label">Status:</span>
	                                <span className={`value status-${String(displayResponse).toLowerCase()}`}>{displayResponse}</span>
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
                                    ({sources.filter(s => s.points !== null).map(s => Number.isInteger(s.points) ? s.points : s.points.toFixed(1)).join(' + ')}) / {scoreResult.countScoredLinks} = {Math.round(scoreResult.draftAvg || 0)}
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

    const EMPTY_MAP = {};

    const FormArea = ({
        activeSection: propsActiveSection,
        selectedFacility,
        user,
        groups,
        formData,
        saveField: rawSaveField,
        isSaving,
        lastSaved,
        isADComplete,
        activeEventId,
        scoringResults,
        isScoringPending,
        onCriterionChange,
        syncStatus,
        setSyncStatus,
        pendingFields,
        syncedFields
    }) => {
        const saveField = React.useCallback((key, val) => {
            console.log(`[FormArea Debug] saveField called: key="${key}"`);
            rawSaveField(key, val);
        }, [rawSaveField]);

        const getFieldStatusClass = React.useCallback((fieldId) => {
            const val = formData?.[fieldId];
            if (val === undefined || val === null || String(val).trim() === '') {
                return '';
            }
            if (pendingFields && pendingFields.has(fieldId)) {
                return 'status-unsaved';
            }
            if (syncedFields && syncedFields.has(fieldId)) {
                return 'status-synced';
            }
            return 'status-local';
        }, [formData, pendingFields, syncedFields]);

        const renderFieldStatus = React.useCallback((fieldId) => {
            const status = getFieldStatusClass(fieldId);
            if (!status) return null;
            
            let text = '';
            let textClass = '';
            let dotClass = '';
            
            if (status === 'status-unsaved') {
                text = 'Unsaved changes';
                textClass = 'text-unsaved';
                dotClass = 'dot-unsaved';
            } else if (status === 'status-local') {
                text = 'Saved locally (offline)';
                textClass = 'text-local';
                dotClass = 'dot-local';
            } else if (status === 'status-synced') {
                text = 'Synced to server';
                textClass = 'text-synced';
                dotClass = 'dot-synced';
            } else {
                return null;
            }
            
            return (
                <div className={`status-indicator-container ${textClass}`}>
                    <span className={`status-dot ${dotClass}`} />
                    {text}
                </div>
            );
        }, [getFieldStatusClass]);

        const formAreaRef = React.useRef(null);

        const scrollToTop = React.useCallback(() => {
            if (formAreaRef.current) {
                formAreaRef.current.scrollTo({
                    top: 0,
                    behavior: 'smooth'
                });
            } else {
                window.scrollTo({
                    top: 0,
                    behavior: 'smooth'
                });
            }
        }, []);

        const [isScoringModalOpen, setIsScoringModalOpen] = useState(false);
        const [viewingRootCalc, setViewingRootCalc] = useState(null); // { code, result }
        const [currentSubsectionIndex, setCurrentSubsectionIndex] = useState(0);
        const [isWindowActive, setIsWindowActive] = useState(true);
        const [showStandardSummary, setShowStandardSummary] = useState(false); // x.x.x list (collapsed by default)
        const [showPiSummary, setShowPiSummary] = useState(false); // x.x PI row (collapsed by default)
        const [isSeSummaryOpen, setIsSeSummaryOpen] = useState(false); // collapsible SE summary textarea
        const [openStandardSummaries, setOpenStandardSummaries] = useState({}); // keyed by x.x.x field id
        const [openPiGroups, setOpenPiGroups] = useState({}); // keyed by PI code (e.g. 7.1)
        // Persistent tooltip panel for criterion info (click-to-open)
        const [openCriterionTooltip, setOpenCriterionTooltip] = useState(null);
        const [randomizeRunState, setRandomizeRunState] = useState(null); // { status, label, summary, completedAt }

        const FACILITY_GROUP_DE_ID = 'pzenrgsSny3';

        const resolveAssessmentGroupId = React.useCallback((text) => {
            const t = String(text || '').toLowerCase();
            if (t.includes('hosp')) return 'HOSPITAL';
            if (t.includes('clinic')) return 'CLINICS';
            if (t.includes('ems') || t.startsWith('se') || t.includes(' se')) return 'SE';
            if (t.includes('mortu') || t.includes('general')) return 'GENERAL';
            return null;
        }, []);

        const resolveAssessmentNamespace = React.useCallback((text) => {
            const t = String(text || '').toLowerCase();
            if (t.includes('hosp')) return 'HOSPITAL';
            if (t.includes('clinic')) return 'CLINICS';
            if (t.includes('ems') || t.startsWith('se') || t.includes(' se')) return 'EMS';
            if (t.includes('mortu') || t.includes('general')) return 'MORTUARY';
            return String(text || '').toUpperCase().trim() || null;
        }, []);

        const assessmentGroupText = React.useMemo(
            () => String(formData?.[FACILITY_GROUP_DE_ID] || '').trim(),
            [formData?.[FACILITY_GROUP_DE_ID]]
        );

        const activeGroup = React.useMemo(() => {
            return groups.find(g => g.sections?.some(s => s.id === propsActiveSection?.id)) || null;
        }, [groups, propsActiveSection]);

        const assessmentScopedGroup = React.useMemo(() => {
            const targetId = resolveAssessmentGroupId(assessmentGroupText);
            const matched = targetId && Array.isArray(groups)
                ? groups.find(g => g.id === targetId)
                : null;
            return matched || activeGroup || null;
        }, [groups, activeGroup, assessmentGroupText, resolveAssessmentGroupId]);

        const programmeType = React.useMemo(() => {
            return getProgrammeTypeFromGroup(activeGroup);
        }, [activeGroup]);

        const { configuration, showToast, isOnline } = useApp();

        // Resolve configuration for the current programme
        const activeConfigArray = React.useMemo(() => {
            const configKeyMap = {
                ems: 'ems_full_configuration',
                mortuary: 'mortuary_full_configuration',
                clinics: 'clinics_full_configuration',
                hospital: 'hospital_full_configuration',
                obgyn: 'obgyn_full_configuration',
                obsterics_gyno: 'obsterics_gyno_full_configuration',
                physiotherapy: 'physiotherapy_full_configuration',
                physiotheraphy: 'physiotheraphy_full_configuration',
                radiology: 'radiology_full_configuration',
                general_practice: 'general_practice_full_configuration',
                private_diabetic: 'private_diabetic_full_configuration',
                private_dietetic: 'private_dietetic_full_configuration',
                oral: 'oral_full_configuration',
                oncology: 'oncology_full_configuration',
                private_oncology: 'private_oncology_full_configuration',
                paediatric: 'paediatric_full_configuration',
                private_lab: 'private_lab_full_configuration',
                private_medical_lab: 'private_medical_lab_full_configuration',
                mental_health: 'mental_health_full_configuration',
                eye: 'eye_full_configuration',
                hospice_palliative: 'hospice_palliative_full_configuration',
                hospice: 'hospice_full_configuration',
                occupational_health: 'occupational_health_full_configuration',
                urology_nephrology: 'urology_nephrology_full_configuration',
                urology: 'urology_full_configuration',
                imci: 'imci_full_configuration',
                childhood_illness: 'childhood_illness_full_configuration',
                emonc: 'emonc_full_configuration',
                emergency_management: 'emergency_management_full_configuration',
            };
            const key = configKeyMap[programmeType];
            if (configuration && key && Array.isArray(configuration[key])) {
                return configuration[key];
            }
            return [];
        }, [configuration, programmeType]);

        // Resolve links for the current programme
        const activeLinks = React.useMemo(() => {
            const links = configuration?.links || {};
            const rawLinks = links[programmeType] || [];
            if (programmeType === 'hospital') {
                return decorateHospitalLinksWithMatrixTags(rawLinks);
            }
            return rawLinks;
        }, [configuration, programmeType]);

        const criterionIndex = React.useMemo(() => {
            // Build the index purely from the configuration (local bundle or DataStore).
            // links.json descriptions are intentionally excluded from this index – they
            // are only used for the info-panel tooltip (getCriterionTooltip) and must
            // never influence the field label shown to the assessor.
            return buildCriterionIndex(activeConfigArray);
        }, [activeConfigArray]);

        const rawAssessmentScopedSections = React.useMemo(
            () => (Array.isArray(assessmentScopedGroup?.sections) ? assessmentScopedGroup.sections : []),
            [assessmentScopedGroup]
        );

        const assessmentScopedSections = React.useMemo(() => {
            return injectVirtualStandards(rawAssessmentScopedSections, criterionIndex);
        }, [rawAssessmentScopedSections, criterionIndex]);

        const activeSection = React.useMemo(() => {
            const matched = assessmentScopedSections.find(s => s.id === propsActiveSection?.id);
            return matched || propsActiveSection;
        }, [assessmentScopedSections, propsActiveSection]);

        // Reset pagination when activeSection changes
        React.useEffect(() => {
            setCurrentSubsectionIndex(0);
            scrollToTop();
        }, [propsActiveSection?.id, scrollToTop]);

        // Window active state tracking for screenshot security (blur overlay)
        React.useEffect(() => {
            const handleFocus = () => setIsWindowActive(true);
            const handleBlur = () => setIsWindowActive(false);
            const handleVisibilityChange = () => {
                if (document.hidden) {
                    setIsWindowActive(false);
                } else {
                    setIsWindowActive(true);
                }
            };

            window.addEventListener('focus', handleFocus);
            window.addEventListener('blur', handleBlur);
            document.addEventListener('visibilitychange', handleVisibilityChange);

            // Set initial state
            setIsWindowActive(document.hasFocus());

            return () => {
                window.removeEventListener('focus', handleFocus);
                window.removeEventListener('blur', handleBlur);
                document.removeEventListener('visibilitychange', handleVisibilityChange);
            };
        }, []);

        // Key shortcuts security (Print, Save, Copy/Paste)
        React.useEffect(() => {
            const handleKeyDown = (e) => {
                // Intercept Ctrl+P / Cmd+P (Print)
                if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
                    e.preventDefault();
                    e.stopPropagation();
                    alert("Printing is disabled for security reasons.");
                }
                // Intercept Ctrl+S / Cmd+S (Save)
                if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                    e.preventDefault();
                    e.stopPropagation();
                }
                // Intercept Copy/Cut/Paste shortcuts
                if ((e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'v' || e.key === 'x')) {
                    e.preventDefault();
                    e.stopPropagation();
                }
            };

            const handleKeyUp = (e) => {
                if (e.key === 'PrintScreen') {
                    try {
                        navigator.clipboard.writeText('');
                    } catch (_) {}
                    alert("Screenshots are disabled for security reasons.");
                }
            };

            window.addEventListener('keydown', handleKeyDown, true);
            window.addEventListener('keyup', handleKeyUp, true);

            return () => {
                window.removeEventListener('keydown', handleKeyDown, true);
                window.removeEventListener('keyup', handleKeyUp, true);
            };
        }, []);

            // Resolve Hospital compute criteria from configuration
            const HOSPITAL_SUBCRITERIA_MAP = React.useMemo(() => {
                const map = {};
                try {
	                    const computeConfig = configuration?.compute || hospitalComputeCriteria;
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
                    console.error('FormArea: Failed to build hospital sub-criteria map', e);
                }
                return map;
            }, [configuration?.compute]);

            // Build an SE/Section overview object for the currently active section
            // so we can render a narrative page similar to the source PDFs (SE
            // title, Standard text, and Standard Intent paragraphs).
            const seOverview = React.useMemo(() => {
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
                        const codeMatch = codeSrc.match(/\d+\.\d+(?:\.\d+){1,2}\b/);
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
	        return n.includes('type of assessment') || (n.includes('assessment type') && !n.includes('facility assessment'));
        });
        // Known fallback if present in your environment
        return match?.id || 'LNszX9xHx8s';
    }, [configuration]);

    // Helper: determine if a value represents the Baseline assessment type
    const isBaselineType = (val) => {
        if (val === undefined || val === null) return false;
        const raw = String(val);
        if (raw === 'Baseline Assessment ') return true; // exact known label (with space)
        const trimmed = raw.trim();
        const v = trimmed.toLowerCase();
        if (v === 'baseline' || v === 'baseline assessment' || v === 'base-line') return true;
        if (v === 'fac_ass_baseline' || v === 'baseline_assessment' || v === 'baseline_survey') return true;
        if (v.includes('baseline')) return true;
        return false;
    };

    const isSupportiveType = (val) => {
        const text = String(val || '').toLowerCase().replace(/[_-]+/g, ' ');
        return text.includes('supportive') || (text.includes('support') && text.includes('visit'));
    };

    // Track if a baseline assessment (by Type of Assessment) already exists for this facility/TEI
    const [hasExistingBaseline, setHasExistingBaseline] = useState(false);

    React.useEffect(() => {
        let cancelled = false;
        (async () => {
        try {
            if (!configuration || !typeOfAssessmentDeId || !selectedFacility) return;

            // Resolve TEI and orgUnit for this assessment context
            const teiId = selectedFacility?.trackedEntityInstance || selectedFacility?.scheduleTeiId || formData?.teiId_internal;
            const orgUnitId =
            selectedFacility?.orgUnitId ||
            (typeof selectedFacility?.orgUnit === 'string' ? selectedFacility.orgUnit : selectedFacility?.orgUnit?.id) ||
            selectedFacility?.facilityId ||
            selectedFacility?.programOrgUnitId ||
            null;
            if (!teiId) return;

            const programId = configuration?.program?.id || 'G2gULe4jsfs';
            const stageId = configuration?.programStage?.id || 'HpHD6u6MV37';

            // Fetch existing survey events and check if any (other than current) is baseline-typed
            const events = await api.getSurveyEventsForTei({ teiId, orgUnitId, programId, stageId });
            const currentEventId = formData?.eventId_internal || formData?.event || formData?.eventId || null;
            const exists = (Array.isArray(events) ? events : []).some(ev => {
            if (!ev || (currentEventId && ev.event === currentEventId)) return false;
            const dv = (ev.dataValues || []).find(d => d && d.dataElement === typeOfAssessmentDeId);
            return dv && isBaselineType(dv.value);
            });
            if (!cancelled) setHasExistingBaseline(exists);
        } catch (e) {
            // If we cannot resolve, keep default false (do not block user unnecessarily)
            if (!cancelled) setHasExistingBaseline(false);
        }
        })();
        return () => { cancelled = true; };
    }, [configuration, typeOfAssessmentDeId, selectedFacility, formData?.eventId_internal]);

        // Reset submit status if data changes after successful submission
        // This allows the user to "Update" DHIS2
        React.useEffect(() => {
            if (submitResult?.success) {
                console.log('📝 FormArea: Detected change after submission, resetting status to allow update.');
                setSubmitResult(null);
            }
        }, [formData]);

	                const isADSection = (() => {
	                    const name = String(activeSection?.name || activeSection?.code || activeSection?.id || '').toLowerCase().trim();
	                    return name === 'ad' || name === 'assessment_details' || name === 'assessment-details' || name.includes('assessment details');
	                })();

        // ── SE-level editing restrictions ─────────────────────────────────
        // Fetch the assignment plan once and determine which SEs the current
        // user is assigned to. Non-assigned sections become read-only.
        const [assignmentPlan, setAssignmentPlan] = useState(null);
        const [assignmentLoaded, setAssignmentLoaded] = useState(false);
        const [assignmentPlanSource, setAssignmentPlanSource] = useState({ nsKey: null, teiId: null });
        const [randomizeUserMap, setRandomizeUserMap] = useState({});
        const [randomizeUsersLoaded, setRandomizeUsersLoaded] = useState(false);
        const [resolvedEventIdMap, setResolvedEventIdMap] = useState({});
        const [resolvedSurveyEventsById, setResolvedSurveyEventsById] = useState({});
        const [eventMapResolving, setEventMapResolving] = useState(false);

        const loadAssignmentPlanForAssessment = React.useCallback(async () => {
            const groupText = String(formData?.[FACILITY_GROUP_DE_ID] || '').trim();
            const preferredNs = resolveAssessmentNamespace(groupText);
            const candidateNamespaces = Array.from(new Set([
                preferredNs,
                'HOSPITAL',
                'CLINICS',
                'EMS',
                'MORTUARY',
            ].filter(Boolean)));
            const candidateTeis = Array.from(new Set([
                formData?.teiId_internal,
                selectedFacility?.trackedEntityInstance,
                selectedFacility?.scheduleTeiId,
            ].filter(Boolean)));

            for (const teiId of candidateTeis) {
                for (const nsKey of candidateNamespaces) {
                    try {
                        const plan = await api.getDataStoreItem(nsKey, teiId);
                        if (plan && typeof plan === 'object' && Object.keys(plan).length > 0) {
                            return { plan, nsKey, teiId };
                        }
                    } catch (_) {
                        // keep probing
                    }
                }
            }
            return { plan: null, nsKey: preferredNs, teiId: candidateTeis[0] || null };
        }, [formData?.teiId_internal, formData?.pzenrgsSny3, selectedFacility, resolveAssessmentNamespace]);

        React.useEffect(() => {
            let cancelled = false;
            (async () => {
                try {
                    const { plan, nsKey, teiId } = await loadAssignmentPlanForAssessment();
                    if (!cancelled) {
                        setAssignmentPlan(plan || null);
                        setAssignmentPlanSource({ nsKey: nsKey || null, teiId: teiId || null });
                        setAssignmentLoaded(true);
                    }
                } catch (e) {
                    console.warn('FormArea: Could not load assignment plan (non-fatal)', e);
                    if (!cancelled) {
                        setAssignmentPlan(null);
                        setAssignmentPlanSource({ nsKey: null, teiId: null });
                        setAssignmentLoaded(true);
                    }
                }
            })();
            return () => { cancelled = true; };
        }, [loadAssignmentPlanForAssessment]);

        React.useEffect(() => {
            let cancelled = false;
            (async () => {
                try {
                    if (!assignmentLoaded) {
                        if (!cancelled) setRandomizeUsersLoaded(false);
                        return;
                    }
                    const teamMembers = assignmentPlan?.team || [];
                    const allUserIds = [...new Set(teamMembers.map(t => t.userId).filter(Boolean))];
                    if (allUserIds.length === 0) {
                        if (!cancelled) {
                            setRandomizeUserMap({});
                            setRandomizeUsersLoaded(true);
                        }
                        return;
                    }
                    const resolved = await api.resolveUserDisplayNames(allUserIds).catch(() => ({}));
                    if (!cancelled) {
                        setRandomizeUserMap(resolved || {});
                        setRandomizeUsersLoaded(true);
                    }
                } catch (e) {
                    console.warn('FormArea: Could not resolve randomizer usernames (non-fatal)', e);
                    if (!cancelled) {
                        setRandomizeUserMap({});
                        setRandomizeUsersLoaded(true);
                    }
                }
            })();
            return () => { cancelled = true; };
        }, [assignmentLoaded, assignmentPlan]);

        // Determine the current user's role and assigned SEs
        const seLockInfo = React.useMemo(() => {
            if (!assignmentLoaded || !assignmentPlan) {
                return { hasAssignments: false, isLead: false, mySeNums: [], lockedOwnerName: null };
            }
            const seAssignments = assignmentPlan.seAssignments || {};
            const teamMembers = assignmentPlan.team || [];
            const userId = user?.id || null;
            const username = user?.username || null;

            // Check if the current user is a Lead
            const myTeamEntry = teamMembers.find(t =>
                t.userId === userId || t.userId === username
            );
            const isLead = myTeamEntry
                ? /lead|leader/i.test(String(myTeamEntry.role || '').replace(/^FAC_ASS_ROLE_/i, ''))
                : false;

            // Build list of SE numbers assigned to the current user
            const mySeNums = [];
            Object.entries(seAssignments).forEach(([seNum, userIds]) => {
                if (Array.isArray(userIds) && userIds.some(id => id === userId || id === username)) {
                    mySeNums.push(seNum);
                }
            });

            return { hasAssignments: Object.keys(seAssignments).length > 0, isLead, mySeNums, seAssignments, teamMembers };
        }, [assignmentPlan, assignmentLoaded, user]);

	        const isAssessmentDetailsSection = React.useCallback((sec) => {
	            const name = String(sec?.name || sec?.code || sec?.id || '').toLowerCase().trim();
	            return name === 'ad' || name === 'assessment_details' || name === 'assessment-details' || name.includes('assessment details');
	        }, []);

        const assessmentScopedSeSections = React.useMemo(
            () => assessmentScopedSections.filter(sec => !isAssessmentDetailsSection(sec)),
            [assessmentScopedSections, isAssessmentDetailsSection]
        );

        const assessmentNamespaceKey = React.useMemo(
            () => resolveAssessmentNamespace(assessmentGroupText || assessmentScopedGroup?.name || assessmentScopedGroup?.id || ''),
            [assessmentGroupText, assessmentScopedGroup, resolveAssessmentNamespace]
        );

        const latestFormDataRef = React.useRef(formData);
        React.useEffect(() => {
            latestFormDataRef.current = formData;
        }, [formData]);
            const hydratedServerFieldIdsRef = React.useRef(new Set());
            React.useEffect(() => {
                hydratedServerFieldIdsRef.current = new Set();
            }, [activeEventId]);

            const lastSavedEventIdMapRef = React.useRef('');
            React.useEffect(() => {
                lastSavedEventIdMapRef.current = '';
            }, [activeEventId]);

        React.useEffect(() => {
            if (!scoringResults?.sections || !activeSection?.fields) return;

            const currentSectionScores = scoringResults.sections.find(s => s.id === activeSection.id);
            if (!currentSectionScores?.standards) return;

            let hasUpdates = false;
            const updates = {};

            for (const field of activeSection.fields) {
                if (field.type !== 'select' || !field.commentFieldId) continue;

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

                if (typeof document !== 'undefined') {
                    const activeEl = document.activeElement;
                    if (activeEl && typeof activeEl.id === 'string') {
                        const id = activeEl.id;
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

                const displayScorePoints = (calculatedScore.displayPoints !== null && calculatedScore.displayPoints !== undefined)
                    ? calculatedScore.displayPoints
                    : calculatedScore.points;
                const statusText = calculatedScore.displayResponse || calculatedScore.normalizedValue || calculatedScore.response || 'NA';
                const pointsText = displayScorePoints !== null ? `${parseFloat(displayScorePoints).toFixed(0)} pts` : '0 pts';

                const allRootCodes = (calculatedScore.rootSources || []).map(s => typeof s === 'string' ? s : s.code);
                const effectiveRootCodes = allRootCodes.filter(c => !String(c || '').match(/-(G|B)$/i));
                const isPureVisualOnlyRoot = isRoot && effectiveRootCodes.length === 0;

                if (isPureVisualOnlyRoot) {
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

                const hasResponse = (isRoot && effectiveRootCodes.length > 0) || (formData[field.id] && formData[field.id] !== '' && formData[field.id] !== 'NA');

                if (hasResponse) {
                    let newComment = currentComment
                        .replace(/\s*\[(INCOMPLETE )?((ROOT )?SCORE|SEVERITY)[^\]]*\]/g, '')
                        .replace(/\[object Object\](\)]*)?/g, '')
                        .trim();
                    newComment = newComment ? `${newComment} ${scoreTag}` : scoreTag;

                    if (newComment !== currentComment) {
                        updates[commentFieldId] = newComment;
                        hasUpdates = true;
                    }
                } else if (currentComment.match(/\[((ROOT )?SCORE|SEVERITY)[^\]]*\]/)) {
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


        const extractSeNum = React.useCallback((sec) => {
            const direct = sec?.se_id ?? sec?.seId ?? sec?.sectionNumber ?? null;
            if (direct !== null && direct !== undefined && String(direct).trim() !== '') {
                return String(direct).trim();
            }

            const candidates = [
                sec?._originalName,
                sec?.name,
                sec?.code,
                sec?.id,
            ].filter(Boolean).map(v => String(v));

            for (const candidate of candidates) {
                let m = candidate.match(/(?:^|[_\s-])(SE|SEC|SECTION|EMS)\s*([0-9]+)(?=$|[_\s:-])/i);
                if (m) return m[2];
            }

            // Final fallback: infer the section number from the section's field
            // codes/labels, e.g. SURV_HOSP_SE2_2.1.1.1 or 2.1.1.1 ...
            const fieldCandidates = (sec?.fields || []).flatMap(f => [f?.code, f?.label]).filter(Boolean).map(v => String(v));
            for (const candidate of fieldCandidates) {
                let m = candidate.match(/(?:SE|SEC|SECTION|EMS)\s*([0-9]+)/i);
                if (m) return m[1];

                m = candidate.match(/(?:^|[^0-9])([0-9]+)\.[0-9]+\.[0-9]+\.[0-9]+/);
                if (m) return m[1];
            }

            return null;
        }, []);

        // Extract SE number from the active section
        const activeSeNum = React.useMemo(() => extractSeNum(activeSection), [activeSection, extractSeNum]);
        const SYS_TAG_DE_ID = 'r8pqjX6Jtr0';
        const getEventSysTag = React.useCallback((ev) => {
                const dataValues = Array.isArray(ev?.dataValues) ? ev.dataValues : [];
                for (const dv of dataValues) {
                    if (dv?.dataElement !== SYS_TAG_DE_ID) continue;
                    const value = dv?.value === undefined || dv?.value === null ? '' : String(dv.value).trim();
                    if (value) return value;
                    break;
                }
                return null;
        }, []);

        const draftEventIdMap = React.useMemo(() => {
            try {
                return formData?.eventIdMap_internal ? (JSON.parse(formData.eventIdMap_internal) || EMPTY_MAP) : EMPTY_MAP;
            } catch (_) {
                return EMPTY_MAP;
            }
        }, [formData?.eventIdMap_internal]);

            const dataStoreEventIdMap = React.useMemo(() => {
                try {
                    const raw = assignmentPlan?.eventIdMap;
                    if (!raw) return EMPTY_MAP;
                    if (typeof raw === 'string') return JSON.parse(raw) || EMPTY_MAP;
                    return typeof raw === 'object' ? raw : EMPTY_MAP;
                } catch (_) {
                    return EMPTY_MAP;
                }
            }, [assignmentPlan?.eventIdMap]);

            const authoritativeEventIdMap = React.useMemo(() => {
                if (draftEventIdMap === EMPTY_MAP && dataStoreEventIdMap === EMPTY_MAP) return EMPTY_MAP;
                return {
                    ...(draftEventIdMap || {}),
                    ...(dataStoreEventIdMap || {}),
                };
            }, [draftEventIdMap, dataStoreEventIdMap]);

        const effectiveEventIdMap = React.useMemo(() => {
		        // Server-read SYS_TAG mappings must override local/DataStore mappings.
		        // Otherwise a stale locally generated ID can survive after DHIS2 created
		        // a different real event ID, causing later PUTs to fail as Invalid Event ID.
            return {
		            ...(authoritativeEventIdMap || {}),
		        ...(resolvedEventIdMap || {}),
            };
            }, [authoritativeEventIdMap, resolvedEventIdMap]);

        const activeExpectedSysTag = React.useMemo(() => {
            if (!activeSection) return null;
            return isAssessmentDetailsSection(activeSection) ? 'FINAL' : (activeSeNum || null);
        }, [activeSection, activeSeNum, isAssessmentDetailsSection]);

	        const activeSectionEventId = React.useMemo(() => {
	            if (!activeExpectedSysTag) return null;
	            const mapped = effectiveEventIdMap?.[activeExpectedSysTag] || null;
	            if (mapped) return mapped;
	            if (activeExpectedSysTag === 'FINAL') {
	                return selectedFacility?.baselineEventId || formData?.eventId_internal || null;
	            }
	            return null;
	        }, [activeExpectedSysTag, effectiveEventIdMap, selectedFacility?.baselineEventId, formData?.eventId_internal]);

        const activeMappedEventPayload = React.useMemo(() => {
            if (!activeSectionEventId) return null;
            return resolvedSurveyEventsById?.[activeSectionEventId] || null;
        }, [activeSectionEventId, resolvedSurveyEventsById]);

        const activeSectionDebugPayload = React.useMemo(() => {
            const orgUnitId = selectedFacility?.orgUnitId
                || (typeof selectedFacility?.orgUnit === 'string' ? selectedFacility.orgUnit : selectedFacility?.orgUnit?.id)
                || selectedFacility?.facilityId
                || null;
            const fieldIds = (activeSection?.fields || [])
                .filter(field => field?.id && field.type !== 'header')
                .map(field => field.id);
            const currentValues = {};
            const emptyFieldIds = [];

            fieldIds.forEach(fieldId => {
                const value = formData?.[fieldId];
                const text = value === undefined || value === null ? '' : String(value);
                if (text.trim() === '') {
                    emptyFieldIds.push(fieldId);
                } else {
                    currentValues[fieldId] = value;
                }
            });

                const mappedDataValueIds = new Set(
                    (activeMappedEventPayload?.dataValues || [])
                        .map(dv => dv?.dataElement)
                        .filter(Boolean)
                );
                const mappedFieldIds = fieldIds.filter(fieldId => mappedDataValueIds.has(fieldId));
                const unmatchedMappedDataElementIds = Array.from(mappedDataValueIds)
                    .filter(dataElementId => !fieldIds.includes(dataElementId));

                return {
                sectionId: activeSection?.id || null,
                sectionName: activeSection?.name || null,
                expectedSysTag: activeExpectedSysTag,
                mappedEventId: activeSectionEventId,
                activeSeNum: activeSeNum || null,
                assessmentGroupText: assessmentGroupText || null,
                assessmentGroupId: assessmentScopedGroup?.id || null,
                namespace: assessmentNamespaceKey || null,
                teiId: formData?.teiId_internal || selectedFacility?.trackedEntityInstance || selectedFacility?.scheduleTeiId || null,
                orgUnitId,
                mappedEventStatus: activeMappedEventPayload?.status || null,
                mappedEventDate: activeMappedEventPayload?.eventDate || null,
                eventIdMap: effectiveEventIdMap || {},
                fieldCount: fieldIds.length,
                    mappedEventDataValueCount: mappedDataValueIds.size,
                    mappedFieldCount: mappedFieldIds.length,
                    mappedFieldIds,
                    unmatchedMappedDataElementIds,
                populatedFieldCount: Object.keys(currentValues).length,
                emptyFieldIds,
                currentValues,
            };
        }, [activeSection, activeExpectedSysTag, activeSectionEventId, activeSeNum, assessmentGroupText, assessmentScopedGroup, assessmentNamespaceKey, formData, selectedFacility, effectiveEventIdMap, activeMappedEventPayload]);

            const inferEventIdMapFromSurveyEvents = React.useCallback((events) => {
            const map = {};
            (events || []).forEach(ev => {
                const tag = getEventSysTag(ev);
                    if (tag && ev?.event) {
                        map[tag] = ev.event;
                } else {
                        console.warn('FormArea: Survey event skipped during SE map generation because SYS_TAG is missing', ev?.event || ev);
                }
            });

                return map;
            }, [getEventSysTag]);

        React.useEffect(() => {
            let cancelled = false;
            (async () => {
                try {
                    const targetSections = assessmentScopedSections || [];
                    const teiId = formData?.teiId_internal || selectedFacility?.trackedEntityInstance || selectedFacility?.scheduleTeiId || null;
                    const orgUnitId = selectedFacility?.orgUnitId
                        || (typeof selectedFacility?.orgUnit === 'string' ? selectedFacility.orgUnit : selectedFacility?.orgUnit?.id)
                        || selectedFacility?.facilityId
                        || null;
                    const programId = configuration?.program?.id || 'G2gULe4jsfs';
                    const stageId = configuration?.programStage?.id || 'HpHD6u6MV37';

                    if (!teiId || !orgUnitId || targetSections.length === 0) {
                        if (!cancelled) {
                            setResolvedEventIdMap(EMPTY_MAP);
                            setEventMapResolving(false);
                        }
                        return;
                    }

                    if (!cancelled) setEventMapResolving(true);
                    const selectedEnrollmentId = formData?.enrollmentId_internal
                        || selectedFacility?.enrollment
                        || selectedFacility?.preloadDataValues?.enrollmentId_internal
                        || null;
                    let surveyEvents = selectedEnrollmentId
                        ? await api.getEventsList({
                            teiId,
                            orgUnitId,
                            programId,
                            stageId,
                            enrollmentId: selectedEnrollmentId,
                            fields: 'event,eventDate,status,programStage,trackedEntityInstance,notes[note,value],dataValues[dataElement,value]'
                        }).catch(() => [])
                        : await api.getSurveyEventsForTeiByEventIds({
                            teiId,
                            orgUnitId,
                            programId,
                            stageId,
                            listPageSize: 50,
                            detailBatchSize: 5,
                            fields: 'event,eventDate,status,programStage,trackedEntityInstance,notes[note,value],dataValues[dataElement,value]'
                        }).catch(() => []);
					const authoritativeEventIds = new Set(Object.values(authoritativeEventIdMap || {}).filter(Boolean));
					if (!selectedEnrollmentId && authoritativeEventIds.size > 0) {
						surveyEvents = (surveyEvents || []).filter(ev => authoritativeEventIds.has(ev?.event));
					}
                        const inferredMap = inferEventIdMapFromSurveyEvents(surveyEvents);

						const mergedMap = {
						    ...(authoritativeEventIdMap || {}),
						    ...(inferredMap || {}),
						};

                    const targetFieldIds = new Set(
                        targetSections.flatMap(sec => (sec?.fields || []).map(f => f?.id).filter(Boolean))
                    );
                    const serverFieldValues = new Map();
                    (surveyEvents || []).forEach(ev => {
                        (ev?.dataValues || []).forEach(dv => {
                            if (!dv?.dataElement || !targetFieldIds.has(dv.dataElement)) return;
                            if (dv.value === undefined || dv.value === null) return;
                            const text = String(dv.value).trim();
                            if (!text || serverFieldValues.has(dv.dataElement)) return;
                            serverFieldValues.set(dv.dataElement, dv.value);
                        });
                    });
                    const surveyEventsById = Object.fromEntries(
                        (surveyEvents || []).filter(ev => ev?.event).map(ev => [ev.event, ev])
                    );

                    if (!cancelled) {
                        setResolvedSurveyEventsById(surveyEventsById);
                        setResolvedEventIdMap(mergedMap);
                        setEventMapResolving(false);

                        const mergedMapStr = JSON.stringify(mergedMap);
                        if (Object.keys(mergedMap || {}).length > 0 && 
                            mergedMapStr !== JSON.stringify(draftEventIdMap || {}) &&
                            mergedMapStr !== lastSavedEventIdMapRef.current) {
                            lastSavedEventIdMapRef.current = mergedMapStr;
                            saveField('eventIdMap_internal', mergedMapStr);
                        }

                        const shouldHydrateServerValues = Boolean(
                            selectedFacility?.hydrateAll ||
                            selectedFacility?.baselineEventId ||
                            selectedFacility?.eventId ||
                            formData?.eventId_internal ||
                            formData?.eventIdMap_internal ||
                            (activeEventId && String(activeEventId).startsWith('draft-assessment-')) ||
                            Object.keys(mergedMap || {}).length > 0
                        );

                        if (shouldHydrateServerValues) {
                            serverFieldValues.forEach((value, fieldId) => {
                                const currentValue = latestFormDataRef.current?.[fieldId];
                                const currentText = currentValue === undefined || currentValue === null ? '' : String(currentValue).trim();
                                if (currentText === '' && !hydratedServerFieldIdsRef.current.has(fieldId)) {
                                    hydratedServerFieldIdsRef.current.add(fieldId);
                                    saveField(fieldId, value);
                                }
                            });
                        }
                    }
                } catch (e) {
                    console.warn('FormArea: Could not resolve SE event mapping automatically', e);
                    if (!cancelled) {
                        setResolvedSurveyEventsById(EMPTY_MAP);
                        setResolvedEventIdMap(EMPTY_MAP);
                        setEventMapResolving(false);
                    }
                }
            })();
            return () => { cancelled = true; };
            }, [draftEventIdMap, authoritativeEventIdMap, assessmentScopedSections, formData?.teiId_internal, formData?.enrollmentId_internal, formData?.eventId_internal, formData?.eventIdMap_internal, selectedFacility, configuration, inferEventIdMapFromSurveyEvents, saveField, activeEventId]);

        // Determine if the current section is locked for this user
        const isSectionLocked = React.useMemo(() => {
            if (isADSection) return false; // Assessment Details always editable
            if (!seLockInfo.hasAssignments) return false; // No plan → everything editable
            if (seLockInfo.isLead) return false; // Lead → full access
            if (!activeSeNum) return false; // Can't determine SE → don't lock
            return !seLockInfo.mySeNums.includes(activeSeNum);
        }, [isADSection, seLockInfo, activeSeNum]);

        const randomizeStatus = React.useMemo(() => {
            const targetSections = assessmentScopedSections;
            const seSections = assessmentScopedSeSections;
            const nsKey = assessmentNamespaceKey;
            const teiId = formData?.teiId_internal || selectedFacility?.trackedEntityInstance || selectedFacility?.scheduleTeiId || null;
            const orgUnitId = selectedFacility?.orgUnitId
                || (typeof selectedFacility?.orgUnit === 'string' ? selectedFacility.orgUnit : selectedFacility?.orgUnit?.id)
                || selectedFacility?.facilityId
                || null;

            const eventIdMap = effectiveEventIdMap || {};

            if (!targetSections.length || seSections.length === 0) return { enabled: false, reason: 'No SE sections available to randomize' };
            if (!teiId) return { enabled: false, reason: 'Assessment TEI is missing' };
            if (!orgUnitId) return { enabled: false, reason: 'Assessment org unit is missing' };
	            if (!nsKey) return { enabled: false, reason: 'Facility type is missing' };
            if (!assignmentLoaded) return { enabled: false, reason: 'Loading assignment plan…' };
            if (!assignmentPlan) return { enabled: false, reason: 'No assignment plan found for this assessment' };
            if (!randomizeUsersLoaded) return { enabled: false, reason: 'Resolving assigned usernames…' };
            if (eventMapResolving) return { enabled: false, reason: 'Resolving SE event mapping…' };
            if (Object.keys(eventIdMap).length === 0) return { enabled: false, reason: 'SE event mapping is missing' };

            const seAssignments = assignmentPlan?.seAssignments || {};
            if (Object.keys(seAssignments).length === 0) return { enabled: false, reason: 'No SE assignments found in the plan' };

            for (const section of seSections) {
                const seNum = extractSeNum(section);
                if (!seNum) return { enabled: false, reason: `Could not detect SE number for ${section?.name || section?.id || 'a section'}` };
                if (!eventIdMap[seNum]) return { enabled: false, reason: `SE ${seNum} is missing an event mapping` };
                const assignedUserIds = seAssignments[seNum] || [];
                if (!Array.isArray(assignedUserIds) || assignedUserIds.length === 0) return { enabled: false, reason: `SE ${seNum} has no assigned user` };
                const primaryUserId = assignedUserIds[0];
                const resolvedUser = primaryUserId ? randomizeUserMap?.[primaryUserId] : null;
                // Normalize to lowercase for testing environment authentication
                const assigneeUsername = resolvedUser?.username ? String(resolvedUser.username).toLowerCase() : null;
                if (!assigneeUsername) return { enabled: false, reason: `SE ${seNum} assigned username could not be resolved` };
            }

		            return { enabled: true, reason: 'Randomize all criterion answers and comments across this facility type (testing only)' };
	        }, [assessmentScopedSections, assessmentScopedSeSections, assessmentNamespaceKey, formData, selectedFacility, assignmentLoaded, assignmentPlan, randomizeUsersLoaded, randomizeUserMap, extractSeNum, effectiveEventIdMap, eventMapResolving]);

        // Resolve the owner's name for the lock banner
        const sectionOwnerName = React.useMemo(() => {
            if (!isSectionLocked || !activeSeNum || !seLockInfo.seAssignments) return null;
            const ownerIds = seLockInfo.seAssignments[activeSeNum] || [];
            if (ownerIds.length === 0) return 'Unassigned';
            const owner = (seLockInfo.teamMembers || []).find(t => ownerIds.includes(t.userId));
            return owner?.displayName || ownerIds[0] || 'Another assessor';
        }, [isSectionLocked, activeSeNum, seLockInfo]);

        const headerAssessorAssignments = React.useMemo(() => {
            if (!assignmentLoaded) {
                return {
                    loading: true,
                    rows: [],
                    currentRow: null,
                    totalAssignedSections: 0,
                    totalAssessorCount: 0,
                };
            }

            const seAssignments = assignmentPlan?.seAssignments || {};
            const teamMembers = assignmentPlan?.team || [];
            const uniqueAssessorKeys = new Set();

            const resolveAssignee = (userId) => {
                const normalizedId = String(userId || '').trim();
                const teamMember = teamMembers.find(t => String(t?.userId || '').trim() === normalizedId);
                const resolvedUser = normalizedId
                    ? (randomizeUserMap?.[normalizedId] || (teamMember?.username ? randomizeUserMap?.[teamMember.username] : null))
                    : null;
                const displayName =
                    resolvedUser?.displayName ||
                    teamMember?.displayName ||
                    resolvedUser?.username ||
                    normalizedId ||
                    'Unassigned';
                const username = resolvedUser?.username || teamMember?.username || null;
                const role = teamMember?.role
                    ? String(teamMember.role).replace(/^FAC_ASS_ROLE_/i, '').replace(/_/g, ' ')
                    : null;
                const key = normalizedId || username || displayName;
                if (key) uniqueAssessorKeys.add(key);
                return { key, userId: normalizedId || null, displayName, username, role };
            };

            const rows = Object.entries(seAssignments)
                .map(([seNum, userIds]) => ({
                    seNum: String(seNum || '').trim(),
                    assignees: (Array.isArray(userIds) ? userIds : [userIds])
                        .filter(Boolean)
                        .map(resolveAssignee),
                }))
                .filter(row => row.seNum)
                .sort((a, b) => a.seNum.localeCompare(b.seNum, undefined, { numeric: true }));

            const currentRow = activeSeNum
                ? rows.find(row => row.seNum === String(activeSeNum)) || null
                : null;

            return {
                loading: false,
                rows,
                currentRow,
                totalAssignedSections: rows.length,
                totalAssessorCount: uniqueAssessorKeys.size,
            };
        }, [assignmentLoaded, assignmentPlan, randomizeUserMap, activeSeNum]);

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
                    if (!sectionScore?.standards || sectionScore.standards.length === 0) return {};

                    const criteriaScores = {};
                    sectionScore.standards.forEach(std => {
                        if (std.criteriaScores) {
                            Object.assign(criteriaScores, std.criteriaScores);
                        }
                    });
                    const result = {};

                    subsections.forEach((subFields, subsectionIndex) => {
                        if (!Array.isArray(subFields) || subFields.length === 0) return;

	                        const selectFields = subFields
	                            .filter((f) => f && f.type === 'select');
	                        const selectIds = selectFields.map((f) => f.id);
	                        if (!selectIds.length) return;

                let totalPoints = 0;
                let scoredCount = 0;
                let hasCriticalFail = false;
                // Track worst scored CRITICAL status within this x.x.x group for capping
                let worstCritical = null; // 'NC' | 'PC' | null

	                const contributions = [];
	                selectFields.forEach((field) => {
	                    const id = field.id;
                    const score = criteriaScores[id];
                    if (!score) return;
                    if (score.criticalFail) hasCriticalFail = true;
                    if (score.isScored && score.points !== null) {
                        totalPoints += score.points;
                        scoredCount += 1;
	                        let criterionCode = normalizeCriterionCode(field.code);
	                        if (!criterionCode || !/\d/.test(criterionCode)) {
	                            const labelMatch = String(field.label || '').match(/\b\d+(?:\.\d+){2,3}\b/);
	                            if (labelMatch) criterionCode = labelMatch[0];
	                        }
	                        const responseValue = String(score.response || '').trim();
	                        contributions.push({
	                            code: criterionCode || id,
	                            response: responseValue || '-',
	                            points: score.points,
	                        });
                    }
                    // Determine worst scored critical child status for this subgroup
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
                });

                            // Compute raw average first so we can show it in tooltips
                            const rawPercent = scoredCount ? totalPoints / scoredCount : 0;
                            let avgPercent = rawPercent;
                            // Do NOT zero the standard just because a critical child is NC.
                            // The correct behaviour is to apply a cap (20% for NC, 60% for PC)
                            // while preserving the actual computed average if it is already lower.
                // Apply subgroup-level cap based on worstCritical within this x.x.x
                if (worstCritical) {
                    const cap = worstCritical === 'NC' ? 20 : 60;
                    if (avgPercent > cap) avgPercent = cap;
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

                        // Fallback: If no explicit 3-segment standard code was found in the fields (common for missing standard rows),
                        // derive it from any 4-segment criterion code.
                        if (!standardCode) {
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

                                if (norm && /^\d+(?:\.\d+){3}$/.test(norm)) {
                                    const parts = norm.split('.');
                                    standardCode = `${parts[0]}.${parts[1]}.${parts[2]}`;
                                    const info = criterionIndex[standardCode];
                                    standardTitle = (info?.statement || rawLabel || '').trim();
                                    break;
                                }
                            }
                        }

                        if (!standardCode) {
                            return;
                        }

	                            const maxScore = scoredCount * 100;
	                            const displayedTotalScore = maxScore > 0
	                                ? Math.round(((avgPercent / 100) * maxScore) * 10) / 10
	                                : 0;

	                            result[subsectionIndex] = {
	                            code: standardCode,
	                            title: standardTitle || standardCode,
	                            percent: avgPercent,
	                                rawPercent,
	                                totalScore: displayedTotalScore,
	                                maxScore,
	                                contributions,
	                    criticalFail: hasCriticalFail,
	                    ...(worstCritical ? { cappedByCritical: worstCritical } : {}),
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

                        // Fallback: If no explicit 3-segment standard code was found in the fields (common for missing standard rows),
                        // derive it from any 4-segment criterion code.
                        if (!standardCode) {
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

                                if (norm && /^\d+(?:\.\d+){3}$/.test(norm)) {
                                    const parts = norm.split('.');
                                    standardCode = `${parts[0]}.${parts[1]}.${parts[2]}`;
                                    break;
                                }
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
                    cappedByCritical: stdEntry.cappedByCritical,
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
                                    <h3 dangerouslySetInnerHTML={{ __html: displayLabel }} />
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
                        // Root score manual override toggle (stored per criterion id)
                        const overrideRaw = formData[`override_${field.id}`];
                        const overrideOn = (overrideRaw === true) || (overrideRaw === 1) || (String(overrideRaw).toLowerCase() === 'true') || (String(overrideRaw) === '1');
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
                    const isTeiField = labelLower.includes('tei id') || labelLower.includes('tei_id') || labelLower.includes('tei');
                    const isProgramStageIdField =
                        labelLower.includes('program stage id') ||
                        labelUpper.includes('PROGRAM_STAGE');
                    const isAssessorUserField =
                        labelUpper.includes('FAC_ASS_ASSESSOR_USER_ID') ||
                        labelUpper.includes('ASSESSOR USER ID') ||
                        labelLower.includes('assessor');
                const isFacilityGroupField =
                    field.id === 'pzenrgsSny3' ||
                        /facility assessment (group|type)/.test(labelLower);
                    const isHospitalAssessmentTypeField = Boolean(
                        isADSection && /hospital assessment type/.test(labelLower)
                    );
                    const isSysTagField = Boolean(
                        isADSection && (
                            field.id === SYS_TAG_DE_ID ||
                            labelLower === 'tag' ||
                            labelLower.includes('sys_tag') ||
                            labelLower.includes('sys-tag') ||
                            labelLower.includes('systag') ||
                            /\b(sys[ _-]?tag|tag)\b/i.test(rawLabel)
                        )
                    );
	                const isTypeOfAssessmentField = Boolean(
	                    isADSection &&
	                    (
	                        (typeOfAssessmentDeId && field.id === typeOfAssessmentDeId) ||
	                        (labelLower.includes('type of assessment') && !isHospitalAssessmentTypeField) ||
	                        (
	                            labelLower.includes('assessment type') &&
	                            !labelLower.includes('facility assessment') &&
	                            !isHospitalAssessmentTypeField
	                        )
	                    )
	                );
	                const typeOfAssessmentEventValue = isTypeOfAssessmentField
	                    ? (activeMappedEventPayload?.dataValues || []).find(dv => dv?.dataElement === field.id)?.value
	                    : null;
	                const typeOfAssessmentDisplayValue = isTypeOfAssessmentField
	                    ? (formData[field.id] || typeOfAssessmentEventValue || '')
	                    : '';
	                // Treat Assessment Details routing/metadata fields as read-only.
	                // This includes the legacy Facility Assessment Group field, which is
	                // presented in the UI as "SURV-Facility Assessment Type".
                const isTechnicalField =
                    isADSection &&
                    (isEnrollmentField ||
                        isTeiField ||
	                        isProgramStageIdField ||
	                        isFacilityGroupField ||
	                        isAssessorUserField ||
	                        isHospitalAssessmentTypeField ||
	                        isSysTagField);

                        // Look up EMS standard/intent tooltip for this data element code
	                        const criterionTooltip = (!isCommentField && field.code) ? getCriterionTooltip(field.code, activeLinks, criterionIndex, calculatedFieldScore, HOSPITAL_SUBCRITERIA_MAP) : '';
	                        const criterionGuideline = String(configEntry.guideline || '').trim();
	                        const hasCriterionInfo = Boolean(criterionTooltip || criterionGuideline);

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
	                            const friendlyLabel = (label) => String(label || '')
	                                .replace(/facility assessment group/ig, 'Facility Type')
	                                .replace(/assessment group/ig, 'Facility Type')
	                                .replace(/facility group/ig, 'Facility Type');
                            if (parts.length > 1 && /^[A-Z0-9_]+$/.test(parts[0])) {
	                                return friendlyLabel(parts.slice(1).join(' '));
                            }
	                            return friendlyLabel(rawLabel) || 'Unnamed Field';
                        }

                        // ── Label resolution for criterion questions (x.x.x.x) ────────
                        // DHIS2 metadata is the source of truth for the displayed label.
                        // For Standards (x.x.x) the config statement is richer and preferred.
                        //
                        // Label sources (in priority order):
                        //   1. DHIS2 rawLabel – stripped of leading code and facility prefix
                        //   2. Local/DataStore config description – fallback when DHIS2
                        //      label cannot be cleaned to meaningful text
                        //
                        // links.json descriptions are NEVER used for field labels.
                        let targetText = rawLabel;
                        if (isStandardCriterion && configEntry.statement) {
                            // Standards: use the full config statement text
                            targetText = configEntry.statement;
                        } else if (isCriterionQuestion) {
                            // Step 1: strip leading numeric code e.g. "24.1.1.2 "
                            const labelAfterCode = rawLabel
                                .replace(/^\s*\d+(?:\.\d+){2,3}\s*/, '')
                                .trim();
                            // Step 2: strip facility/programme prefix tokens
                            // e.g. "HOSP ", "EMS ", "SURV_EMS_", "FAC_ASS_", "CLINICS_"
                            // These are one or more consecutive ALL_CAPS words at the start.
                            const labelAfterPrefix = labelAfterCode
                                .replace(/^(?:[A-Z][A-Z0-9_]*\s+)+/, '')
                                .trim();
                            // Step 3: sanitize numeric artifacts that DHIS2 sometimes
                            // prepends or appends to dataElement names, e.g.:
                            //   "159-The human resource manager..."   (sequence-id prefix)
                            //   "(2)- rest of label"                  (parenthesised number-dash)
                            //   "Some statement. - 3 21.3.1.1"       (trailing severity + codes)
                            //   "Some statement -2 15.1.1.1-2"       (trailing count + codes)
                            const sanitizeLabel = (text) => text
                                // Remove leading bare number-dash e.g. "159-" or "42- "
                                // (DHIS2 sequence IDs prepended to the element name)
                                .replace(/^\d+-\s*/, '')
                                // Remove leading (number)- e.g. "(2)- " or "(3)-"
                                .replace(/^\(\d+\)-\s*/, '')
                                // Remove trailing " - <digit> <codes...>" artifacts
                                // e.g. " - 3 21.3.1.1 22.1.1.4" at end of sentence
                                .replace(/\s+-\s*\d+(\s+\d+(?:\.\d+){2,3}(-\d+)?)*\s*$/, '')
                                // Remove trailing " -<digit> <codes...>" (no space before dash)
                                .replace(/\s+-\d+(\s+\d+(?:\.\d+){2,3}(-\d+)?)*\s*$/, '')
                                // Remove trailing standalone criterion code lists
                                // e.g. " 15.1.1.1-2 16.1.1.1-2"
                                .replace(/(\s+\d+(?:\.\d+){2,3}(-\d+)?)+\s*$/, '')
                                .trim();
                            const dhisLabelClean = sanitizeLabel(labelAfterPrefix || labelAfterCode);
                            if (dhisLabelClean && dhisLabelClean.length > 5) {
                                // DHIS2 label successfully cleaned – use it
                                targetText = dhisLabelClean;
                            } else if (configEntry.description) {
                                // DHIS2 label too short or empty – use config description
                                targetText = configEntry.description;
                            }
                            // No further fallback: if both are empty, rawLabel is kept
                        }

                        if (shouldShowCode && targetText && !targetText.startsWith(cleanedCode)) {
                            return `${cleanedCode} ${targetText}`;
                        }

                        return targetText || 'Unnamed Field';
                    })();

                    // For comment rows, prepare a short score label to display next
                    // to the Comment caption (separate from the textarea contents).
                    // This string is derived from the existing scoringResults and
                    // does not affect how scores are computed or stored.
                    const commentScorePillText = (() => {
                        if (!commentScoreForDisplay) return null;

                        const isRootScore = commentScoreForDisplay.isRoot || false;
                        const isDraftScore = commentScoreForDisplay.isDraft || false;

	                        const displayPoints = (commentScoreForDisplay.displayPoints !== null && commentScoreForDisplay.displayPoints !== undefined)
	                            ? commentScoreForDisplay.displayPoints
	                            : commentScoreForDisplay.points;
	                        const pts = (displayPoints !== null && displayPoints !== undefined)
	                            ? (Number.isInteger(displayPoints)
	                                ? `${displayPoints}`
	                                : displayPoints.toFixed(1))
                            : null;
	                        const status = commentScoreForDisplay.displayResponse || commentScoreForDisplay.normalizedValue || commentScoreForDisplay.response || '';

                        if (!pts && !status) return null;

                        if (isRootScore) {
                            const prefix = isDraftScore ? 'Incomplete Root Score' : 'Root Score';
                            return `${prefix}: ${pts ? `${pts} pts ` : ''}${status}`.trim();
                        }

                        return `Score: ${pts ? `${pts} pts ` : ''}${status}`.trim();
                    })();

                    const fieldContent = (
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
	                                                {subsectionStandardScore.maxScore > 0 && (
	                                                    <>
	                                                        {' '}• {subsectionStandardScore.totalScore}/{subsectionStandardScore.maxScore} pts
	                                                    </>
	                                                )}
	                                                {Array.isArray(subsectionStandardScore.contributions) && subsectionStandardScore.contributions.length > 0 && (
	                                                    <span
	                                                        style={{
	                                                            display: 'block',
	                                                            marginTop: '4px',
	                                                            fontSize: '0.9em',
	                                                            fontWeight: 500,
	                                                            lineHeight: 1.35,
	                                                            whiteSpace: 'normal'
	                                                        }}
	                                                    >
	                                                        {subsectionStandardScore.contributions
	                                                            .map((item) => `${item.code}=${item.response} (${item.points})`)
	                                                            .join(' • ')}
	                                                    </span>
	                                                )}
                                            </span>
                                        )}
                                    {isStandardCriterion && subsectionStandardScore?.cappedByCritical && (
                                        <span
                                            className="standard-cap-pill"
                                            title={`Capped due to critical item: ${subsectionStandardScore.cappedByCritical}`}
                                            style={{
                                                marginLeft: '8px',
                                                fontSize: '0.75em',
                                                fontWeight: 700,
                                                padding: '2px 8px',
                                                    borderRadius: '12px',
                                                backgroundColor: subsectionStandardScore.cappedByCritical === 'NC' ? '#fde8e8' : '#fff8e1',
                                                color: subsectionStandardScore.cappedByCritical === 'NC' ? '#a61b1b' : '#92400e',
                                                border: '1px solid rgba(0,0,0,0.1)'
                                            }}
                                        >
                                            Capped ({subsectionStandardScore.cappedByCritical})
                                        </span>
                                    )}

	                                {hasCriterionInfo && (
                                    <button
                                        type="button"
                                        className="ems-info-icon"
	                                        data-ems-tooltip={criterionTooltip || (criterionGuideline ? `Guideline:\n${criterionGuideline}` : '')}
                                        aria-label="View EMS standard and intent"
                                        onClick={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            setOpenCriterionTooltip({
                                                text: criterionTooltip,
                                                guideline: criterionGuideline,
                                                code: field.code,
                                            });
                                        }}
                                    >
                                        i
                                    </button>
                                )}
                                </div>
                                {isCritical && <span className="critical-badge">CRITICAL</span>}
                            </div>

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
                                            {isRoot ? 'Calculated Score:' : 'Criterion Score:'}
                                        </span>
                                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                                <span style={{ fontWeight: 'bold', fontSize: '1.05em', color: '#2b3a8e' }}>
	                                                    {(() => {
	                                                        const effectivePoints =
	                                                            (calculatedFieldScore.displayPoints !== null && calculatedFieldScore.displayPoints !== undefined)
	                                                                ? calculatedFieldScore.displayPoints
	                                                                : ((calculatedFieldScore.points !== null && calculatedFieldScore.points !== undefined)
	                                                                    ? calculatedFieldScore.points
	                                                                    : (isRoot && rootDraftPoints !== null
	                                                                        ? rootDraftPoints
	                                                                        : null));
	                                                        if (effectivePoints === null) return '--- pts';
	                                                        return `${Number.isInteger(effectivePoints) ? effectivePoints : effectivePoints.toFixed(1)} pts`;
	                                                    })()}
                                                </span>
	                                            {(() => {
	                                                const displayResponse = calculatedFieldScore.displayResponse || calculatedFieldScore.response;
	                                                return (
                                            <span style={{
                                                padding: '2px 8px',
                                                borderRadius: '12px',
                                                fontSize: '0.75em',
                                                fontWeight: 'bold',
	                                                backgroundColor: (displayResponse === 'NC' || displayResponse === 'NON') ? '#fed7d7' : ((displayResponse === 'PC' || displayResponse === 'PARTIAL' || displayResponse === 'SUBSTANTIAL') ? '#fefcbf' : (displayResponse === 'Pending' ? '#edf2f7' : '#c6f6d5')),
	                                                color: (displayResponse === 'NC' || displayResponse === 'NON') ? '#c53030' : ((displayResponse === 'PC' || displayResponse === 'PARTIAL' || displayResponse === 'SUBSTANTIAL') ? '#b7791f' : (displayResponse === 'Pending' ? '#4a5568' : '#22543d'))
                                            }}>
	                                                {displayResponse}
                                            </span>
	                                                );
	                                            })()}
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
                                            {isRoot && (
                                                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginLeft: 10, fontSize: '0.8em', color: '#2d3748' }}>
                                                    <input
                                                        type="checkbox"
                                                        checked={overrideOn}
                                                        onChange={(e) => {
                                                            const next = e.target.checked;
		                                                            if (typeof onCriterionChange === 'function') onCriterionChange(`override_${field.id}`, next ? true : false);
                                                            saveField(`override_${field.id}`, next ? true : false);
                                                            if (next) {
                                                                // When enabling override, prefill with current auto status if it's a concrete value
	                                                                const autoResponse = calculatedFieldScore?.displayResponse || calculatedFieldScore?.response;
	                                                                const autoVal = (calculatedFieldScore && ['C','PC','NC'].includes(String(autoResponse)))
	                                                                    ? autoResponse
                                                                    : '';
		                                                                if (typeof onCriterionChange === 'function') onCriterionChange(field.id, autoVal);
                                                                saveField(field.id, autoVal);
                                                            } else {
                                                                // When disabling override, clear any manual value to avoid submitting it
		                                                                if (typeof onCriterionChange === 'function') onCriterionChange(field.id, '');
                                                                saveField(field.id, '');
                                                            }
                                                        }}
                                                    />
                                                    Override score
                                                </label>
                                            )}
                                        </div>
                                {isRoot && subCriteriaExpectedCount > 0 && (
                                            <div style={{ marginTop: '4px', fontSize: '0.8em', color: '#4a5568' }}>
                                                Sub-criteria average (configured):{' '}
                                                {Math.round(subCriteriaAvgPoints)}{' '}
                                                pts
                                        {' '}
                                        ({subCriteriaAvgCount}/{subCriteriaExpectedCount})
                                            </div>
                                        )}
                                        {isRoot && linkedExpectedCount > 0 && (
                                            <div style={{ marginTop: '2px', fontSize: '0.8em', color: '#4a5568' }}>
                                                Linked-criteria average (graph):{' '}
                                                {linkedAvgPoints !== null ? Math.round(linkedAvgPoints) : '---'}{' '}
                                                pts
                                                {' '}
                                                ({linkedAvgCount}/{linkedExpectedCount})
                                            </div>
                                        )}
                                    </div>
                                )}
                       	        {(isTypeOfAssessmentField || (isADSection && (labelLower.includes('type of assessment') || (labelLower.includes('assessment type') && !labelLower.includes('facility assessment'))))) ? (
	                                    <div
	                                        className="form-control"
	                                        id={`field-${field.id}`}
	                                        aria-readonly="true"
	                                        title="Type of Assessment is loaded from the mapped Assessment Details event."
	                                        style={{
	                                            minHeight: '38px',
	                                            display: 'flex',
	                                            alignItems: 'center',
	                                            backgroundColor: '#f7fafc',
	                                            color: typeOfAssessmentDisplayValue ? '#1f2937' : '#718096',
	                                            borderStyle: 'dashed',
	                                            cursor: 'default'
	                                        }}
	                                    >
	                                        {typeOfAssessmentDisplayValue || 'Loading from event...'}
	                                    </div>
	                                ) : (
	                                    <>
	                                        <select
                                                className={`form-control ${getFieldStatusClass(field.id)}`}
                                                value={(isRoot && !overrideOn)
                                                    ? (calculatedFieldScore ? (calculatedFieldScore.normalizedValue || calculatedFieldScore.response) : '')
                                                    : (formData[field.id] || '')}
                                                onChange={(e) => handleInputChange(e, field.id)}
                                                id={`field-${field.id}`} // Helper for testing
                                                disabled={isSectionLocked || (isRoot && !overrideOn) || (!isParentAnswered && isCommentField) || isTechnicalField || (isADSection && (labelLower.includes('type of assessment') || (labelLower.includes('assessment type') && !labelLower.includes('facility assessment'))))}
                                            >
                                                <option value="">
                                                    {isRoot
                                                        ? (!overrideOn
                                                            ? ((linkedExpectedCount > 0 || (rootDraftPoints !== null))
                                                                ? 'Auto-calculated from configured criteria'
                                                                : 'Not auto-calculated (no effective linked criteria)')
                                                            : 'Select...')
                                                        : 'Select...'}
                                                </option>
                                                {(() => {
                                                    const options = (field.options || []).filter((opt) => {
 	                                                        const val = typeof opt === 'object' ? opt.value : opt;
 	                                                        const label = typeof opt === 'object' ? opt.label : opt;
 	                                                        if (field.id === typeOfAssessmentDeId && (isSupportiveType(val) || isSupportiveType(label))) {
 	                                                            return false;
 	                                                        }
                                                        // If a Baseline already exists for this facility, hide any Baseline-type option
                                                        if (field.id === typeOfAssessmentDeId && hasExistingBaseline) {
                                                            return !(isBaselineType(val) || isBaselineType(label));
                                                        }
                                                        return true;
                                                    });
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
                                            {renderFieldStatus(field.id)}
                                        </>
 	                                )}
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

 	                                            // Strip any injected tags from display only, but preserve
 	                                            // user-entered whitespace while typing so the textarea does
 	                                            // not eat space-bar input at the end of a sentence.
 	                                            const stripTags = (txt) => (txt || '').replace(/\s*\[(INCOMPLETE )?((ROOT )?SCORE|SEVERITY)[^\]]*\]/g, '');

                                            const parts = splitCommentValue(formData[field.id] || '');
                                            const disabled = isSectionLocked || (!isParentAnswered && isCommentField) || isTechnicalField || (isADSection && (labelLower.includes('type of assessment') || (labelLower.includes('assessment type') && !labelLower.includes('facility assessment'))));
                                            const fieldStatusClass = getFieldStatusClass(field.id);
                                            const baseClass = `form-control ${formData[`is_critical_${field.id}`] && (!questionValue || questionValue === '') ? 'mandatory-warning' : ''} ${fieldStatusClass}`;

                                            const handlePartChange = (which, newVal) => {
                                                const current = splitCommentValue(formData[field.id] || '');
                                                const next = joinCommentValue(
                                                    which === 'comments' ? newVal : current.comments,
                                                    which === 'recommendations' ? newVal : current.recommendations
                                                );
                                                saveField(field.id, next);
                                            };

                                            return (
                                                <>
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
                                                    {renderFieldStatus(field.id)}
                                                </>
                                            );
                                        })()
                                    ) : (
                                        <>
                                            <FieldInput
                                                type={field.type}
                                                className={`form-control ${formData[`is_critical_${field.id}`] && (!questionValue || questionValue === '') ? 'mandatory-warning' : ''} ${getFieldStatusClass(field.id)}`}
                                                value={formData[field.id] || ''}
                                                onChange={(e) => handleInputChange(e, field.id)}
                                                id={`field-${field.id}`}
                                                disabled={isSectionLocked || isTechnicalField || (isADSection && (labelLower.includes('type of assessment') || (labelLower.includes('assessment type') && !labelLower.includes('facility assessment'))))}
                                            />
                                            {renderFieldStatus(field.id)}
                                        </>
                                    )))
                                }
                    </div>
                );

                if (isADSection && (isAssessorUserField || isTeiField || isSysTagField)) {
                    return (
                        <details
                            key={field.id}
                            className="technical-details-collapse"
                            style={{
                                marginTop: '12px',
                                border: '1px solid rgba(148, 163, 184, 0.25)',
                                borderRadius: '6px',
                                padding: '10px',
                                backgroundColor: 'rgba(15, 23, 42, 0.02)'
                            }}
                        >
                            <summary style={{ cursor: 'pointer', fontWeight: 600, color: '#475569', fontSize: '0.9rem', outline: 'none' }}>
                                🔧 {displayLabel}
                            </summary>
                            <div style={{ marginTop: '10px' }}>
                                {fieldContent}
                            </div>
                        </details>
                    );
                }

                return fieldContent;
            });
        };

        // Testing helper: randomize answers and comments across all SEs in the assessment group.
        // When SE assignments exist (from the initiation plan), each SE's randomized data
        // is PUT to DHIS2 under the assigned assessor's credentials so the audit trail
        // (lastUpdatedBy) shows which user entered which SE data in the report.
        const randomizeAllAnswers = React.useCallback(async () => {
            try {
                const targetSections = assessmentScopedSections;
                if (!targetSections.length) {
                    if (typeof showToast === 'function') showToast('No sections available to randomize.', 'warning');
                    return;
                }
	                if (!window.confirm('Randomize all criterion responses and comments across all sections in this facility type?\nThis will overwrite existing values AND push data to DHIS2 under each assigned assessor.')) {
                    return;
                }
                setRandomizeRunState({ status: 'running', label: 'Randomizing…', summary: null, completedAt: null });

                // ── Resolve SE assignment plan & event ID map ──────────────────
                let eventIdMap = effectiveEventIdMap || {};

                // Determine facility group key from the Assessment Group field value
                // (pzenrgsSny3) — NOT from the active group which may default to Mortuary.
                const nsKey = assessmentNamespaceKey;

                // TEI used as the DataStore key
                const teiId = formData?.teiId_internal
                    || selectedFacility?.trackedEntityInstance
                    || selectedFacility?.scheduleTeiId
                    || null;

                // Fetch the assignment plan from DataStore
                let planToUse = null;
                let seAssignments = {}; // { [seId]: [userIds] }
                let teamMembers = [];   // [{ userId, displayName, role }]
                if (assignmentPlanSource?.teiId === teiId && assignmentPlan) {
                    planToUse = assignmentPlan;
                    seAssignments = planToUse.seAssignments || {};
                    teamMembers = planToUse.team || [];
                } else {
                    try {
                        const found = await loadAssignmentPlanForAssessment();
                        planToUse = found?.plan || null;
                        if (planToUse) {
                            seAssignments = planToUse.seAssignments || {};
                            teamMembers = planToUse.team || [];
                        }
                    } catch (e) {
                        console.warn('Randomize: Could not fetch assignment plan from DataStore', e);
                    }
                }

                // Resolve usernames for all team member IDs so we can build Basic Auth
                let userMap = randomizeUserMap || {};
                const missingIds = teamMembers.map(t => t.userId).filter(id => id && !userMap[id]);
                if (missingIds.length > 0) {
                    console.log('Randomize: Resolving missing team member usernames...', missingIds);
                    const newlyResolved = await api.resolveUserDisplayNames(missingIds).catch(() => ({}));
                    userMap = { ...userMap, ...newlyResolved };
                }

                const hasAssignments = Object.keys(seAssignments).length > 0 && Object.keys(userMap).length > 0;
                const SHARED_PASSWORD = 'Nomisr123$';

                const programId = configuration?.program?.id || 'G2gULe4jsfs';
                const stageId = configuration?.programStage?.id || 'HpHD6u6MV37';
                const orgUnitId = selectedFacility?.orgUnitId
                    || (typeof selectedFacility?.orgUnit === 'string' ? selectedFacility.orgUnit : selectedFacility?.orgUnit?.id)
                    || selectedFacility?.facilityId
                    || null;

                // ── Helpers ───────────────────────────────────────────────────
                const pickFromOptions = (field) => {
                    const rawOpts = Array.isArray(field?.options) ? field.options : [];
                    const norm = (x) => String(x || '').toUpperCase().trim();
                    const values = rawOpts.map(o => (typeof o === 'object' ? (o.value || o.val || o.code || o.label || o.name) : o)).map(norm);
                    const pool = [];
                    const pushIf = (code, weight) => { if (values.some(v => v === code)) pool.push(...Array(weight).fill(code)); };
                    pushIf('C', 55); pushIf('COMPLIANT', 55);
                    pushIf('PC', 30); pushIf('PARTIAL', 30); pushIf('SUBSTANTIAL', 10);
                    pushIf('NC', 12); pushIf('NON', 12); pushIf('NON-COMPLIANT', 12);
                    if (values.includes('NA')) pool.push(...Array(3).fill('NA'));
                    if (pool.length === 0) {
                        return rawOpts.length > 0 ? (typeof rawOpts[0] === 'object' ? (rawOpts[0].value || rawOpts[0].code || rawOpts[0].label || rawOpts[0].name) : rawOpts[0]) : '';
                    }
                    const choice = pool[Math.floor(Math.random() * pool.length)];
                    const match = rawOpts.find(o => {
                        const v = typeof o === 'object' ? (o.value || o.val || o.code || o.label || o.name) : o;
                        return norm(v) === choice;
                    });
                    return typeof match === 'object' ? (match.value || match.val || match.code || match.label || match.name) : match;
                };

                const randText = () => {
                    const words = ['good', 'fair', 'requires', 'attention', 'policy', 'procedure', 'training', 'evidence', 'documented', 'verified'];
                    return Array.from({ length: 6 }, () => words[Math.floor(Math.random() * words.length)]).join(' ');
                };

                // ── Main loop: iterate SE sections ────────────────────────────
                const seSections = assessmentScopedSeSections;

                // Strict preflight: refuse to randomize unless we can push every SE to DHIS2
                const preflightIssues = [];
                if (!teiId) preflightIssues.push('assessment TEI is missing');
                if (!orgUnitId) preflightIssues.push('org unit is missing');
	                if (!nsKey) preflightIssues.push('facility type / namespace is missing');
                if (!planToUse) preflightIssues.push('assignment plan was not found in DataStore');
                if (!hasAssignments) preflightIssues.push('assigned users or usernames could not be resolved');
                if (eventMapResolving) preflightIssues.push('SE event mapping is still resolving');
                if (Object.keys(eventIdMap).length === 0) preflightIssues.push('SE event mapping is missing');

                const sectionIssues = [];
                seSections.forEach(section => {
                    const seNum = extractSeNum(section);
                    const seEventId = seNum ? eventIdMap[seNum] : null;
                    const assignedUserIds = (seNum && seAssignments[seNum]) || [];
                    const assignedUserId = assignedUserIds[0] || null;
                    const resolvedUser = assignedUserId ? (userMap[assignedUserId] || null) : null;
                    // Normalize to lowercase for testing environment authentication
                    const assigneeUsername = resolvedUser?.username ? String(resolvedUser.username).toLowerCase() : null;

                    if (!seNum) sectionIssues.push(`${section?.name || section?.id || 'Unknown section'}: SE number not detected`);
                    else if (!seEventId) sectionIssues.push(`SE ${seNum}: event mapping missing`);
                    else if (!assignedUserId) sectionIssues.push(`SE ${seNum}: no assigned user`);
                    else if (!assigneeUsername) sectionIssues.push(`SE ${seNum}: assigned username could not be resolved`);
                });

                if (preflightIssues.length > 0 || sectionIssues.length > 0) {
                    const details = [...preflightIssues, ...sectionIssues].slice(0, 6).join('; ');
                    console.warn('Randomize: refusing to run because server-push prerequisites are missing', {
                        preflightIssues,
                        sectionIssues,
                        nsKey,
                        teiId,
                        orgUnitId,
                        eventIdMapKeys: Object.keys(eventIdMap || {}),
                        seAssignmentsKeys: Object.keys(seAssignments || {}),
                    });
                    if (typeof showToast === 'function') {
                        showToast(`Randomize blocked: server-push prerequisites are missing. ${details}`, 'error');
                    }
                    setRandomizeRunState({
                        status: 'error',
                        label: 'Randomize failed',
                        summary: details,
                        completedAt: Date.now(),
                    });
                    return;
                }

                let pushedCount = 0;
                let failedCount = 0;

                if (typeof showToast === 'function') showToast(`Randomizing ${seSections.length} sections...`, 'info');

                for (const section of seSections) {
                    const seNum = extractSeNum(section);
                    const seEventId = seNum ? eventIdMap[seNum] : null;

                    // Find assigned user for this SE
                    const assignedUserIds = (seNum && seAssignments[seNum]) || [];
                    const assignedUserId = assignedUserIds[0]; // primary assignee
                    const resolvedUser = assignedUserId ? (userMap[assignedUserId] || null) : null;
                    // Normalize to lowercase for testing environment authentication
                    const assigneeUsername = resolvedUser?.username ? String(resolvedUser.username).toLowerCase() : null;
                    const assigneeDisplayName = resolvedUser?.displayName || assigneeUsername || 'Unassigned';

                    // Collect data values for this section
                    const sectionDvs = [];

                    // First pass: select fields (criterion responses)
                    (section.fields || []).forEach(f => {
                        if (f && f.type === 'select' && f.id) {
                            const val = pickFromOptions(f);
                            try { saveField(f.id, val); } catch (_) {}
                            if (val) sectionDvs.push({ dataElement: f.id, value: String(val) });
                        }
                    });

                    // Second pass: comment/text fields
                    (section.fields || []).forEach(f => {
                        if (f && f.id && f.type !== 'select' && (f.questionFieldId || f.isCommentField)) {
                            const combined = `${randText()} | ${randText()}`;
                            try { saveField(f.id, combined); } catch (_) {}
                            sectionDvs.push({ dataElement: f.id, value: combined });
                        }
                    });

                    // PUT to DHIS2 under the assigned user's credentials
                    if (hasAssignments && seEventId && assigneeUsername && orgUnitId && sectionDvs.length > 0) {
                        try {
                            await api.putEventDataValuesAs({
                                eventId: seEventId,
                                username: assigneeUsername,
                                password: SHARED_PASSWORD,
                                programId,
                                stageId,
                                orgUnitId,
                                teiId,
                                dataValues: sectionDvs,
                            });
                            console.log(`✅ Randomize: SE ${seNum} → ${assigneeDisplayName} (${assigneeUsername}) → event ${seEventId} [${sectionDvs.length} DVs]`);
                            pushedCount++;
                        } catch (err) {
                            console.warn(`❌ Randomize: SE ${seNum} → ${assigneeDisplayName} push failed:`, err);
                            failedCount++;
                        }
                    }
                }

                // Summary toast
                if (hasAssignments) {
                    const msg = failedCount > 0
                        ? `Randomized ${seSections.length} SEs. Pushed ${pushedCount} to DHIS2, ${failedCount} failed.`
                        : `Randomized ${seSections.length} SEs. All ${pushedCount} pushed to DHIS2 under assigned users.`;
                    setRandomizeRunState({
                        status: failedCount > 0 ? 'warning' : 'success',
                        label: failedCount > 0 ? 'Randomization partial' : 'Randomization complete',
                        summary: msg,
                        completedAt: Date.now(),
                    });
                    if (typeof showToast === 'function') showToast(msg, failedCount > 0 ? 'warning' : 'success');
                }
            } catch (e) {
                console.warn('Randomize answers failed', e);
                setRandomizeRunState({
                    status: 'error',
                    label: 'Randomize failed',
                    summary: e?.message || 'Randomization failed',
                    completedAt: Date.now(),
                });
                if (typeof showToast === 'function') showToast('Randomize failed (see console).', 'error');
            }
        }, [assessmentScopedSections, assessmentScopedSeSections, assessmentNamespaceKey, effectiveEventIdMap, assignmentPlanSource?.teiId, assignmentPlan, loadAssignmentPlanForAssessment, randomizeUserMap, saveField, showToast, formData, selectedFacility, configuration, eventMapResolving, extractSeNum, isAssessmentDetailsSection]);

        const performBackgroundSync = React.useCallback(async () => {
            if (!configuration || !formData || Object.keys(formData).length === 0) return;
            const orgUnit = selectedFacility?.orgUnitId || (typeof selectedFacility?.orgUnit === 'string' ? selectedFacility.orgUnit : selectedFacility?.orgUnit?.id) || selectedFacility?.facilityId || selectedFacility?.programOrgUnitId;
            if (!orgUnit) return;

            try {
                const enrichedData = {
                    ...formData,
                    teiId_internal: selectedFacility?.trackedEntityInstance || formData.teiId_internal,
                    enrollmentId_internal: formData.enrollmentId_internal,
                    scoringSnapshot: createAssessmentSnapshot(scoringResults)
                };

                const programId = configuration?.program?.id || 'G2gULe4jsfs';
                const stageId = configuration?.programStage?.id || 'HpHD6u6MV37';
                const teiId = enrichedData.teiId_internal;
                if (!teiId) return;

                let latestEventId = null;
                try {
                    latestEventId = await api.getLatestSurveyEventId({ programId, stageId, teiId, orgUnitId: orgUnit });
                } catch (resolveErr) {}

                const putEventId = formData.eventId_internal || formData.event || formData.eventId || latestEventId;
                if (!putEventId) return;

                try { saveField('eventId_internal', putEventId); } catch (_) {}
                const payloadData = { ...enrichedData, eventId_internal: putEventId };

                await (api.submitEventPutBatched
                    ? api.submitEventPutBatched(payloadData, configuration, orgUnit, { batchSize: 150, interChunkDelayMs: 75 })
                    : api.submitEventPut(payloadData, configuration, orgUnit));

                if (activeEventId) {
                    await indexedDBService.markAsSynced(activeEventId, putEventId || 'synced');
                    if (typeof setSyncStatus === 'function') {
                        setSyncStatus('synced');
                    }
                }
                console.log('✅ Background sync on section change successful.');
            } catch (err) {
                console.warn('⚠️ Background sync failed (data remains safe in IndexedDB):', err);
            }
        }, [configuration, formData, selectedFacility, scoringResults, activeEventId, saveField]);

        const previousSectionRef = React.useRef(activeSection?.id);
        React.useEffect(() => {
            if (activeSection && previousSectionRef.current && activeSection.id !== previousSectionRef.current) {
                const prevId = previousSectionRef.current;
                previousSectionRef.current = activeSection.id;
                console.log(`🔄 Section changed from ${prevId} to ${activeSection.id}. Triggering background sync...`);
                performBackgroundSync();
            } else if (activeSection && !previousSectionRef.current) {
                previousSectionRef.current = activeSection.id;
            }
        }, [activeSection, performBackgroundSync]);

        if (!activeSection) {
            if (!selectedFacility) {
                return <div className="form-area-empty">Please select a facility and a section</div>;
            }
            return <div className="form-area-empty">Please select a section</div>;
        }

        const isRandomizing = randomizeRunState?.status === 'running';

        const handleInputChange = (e, fieldId) => {
            const value = e.target.value;

            // Guard: prevent setting Type of Assessment to Baseline if one already exists
            if (typeOfAssessmentDeId && fieldId === typeOfAssessmentDeId) {
                if (isSupportiveType(value)) {
                    if (typeof showToast === 'function') {
                        showToast('Supportive is no longer available as a Type of Assessment. Please choose a different Type of Assessment.', 'error');
                    }
                    return;
                }
                if (isBaselineType(value) && hasExistingBaseline) {
                    if (typeof showToast === 'function') {
                        showToast('A Baseline assessment already exists for this facility. Please choose a different Type of Assessment.', 'error');
                    }
                    // Do not persist the change
                    return;
                }
            }

                const field = activeSection?.fields?.find(f => f.id === fieldId);
		                if (field?.type === 'select' && typeof onCriterionChange === 'function') {
		                    onCriterionChange(fieldId, value);
                }

                saveField(fieldId, value);
            };

            if (false) { /* MOVED ABOVE to fix hook-order violation */
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

	                // Use the live display score for roots so configured Hospital roots
	                // tag the same real-time value shown in the form header panel.
	                const displayScorePoints = (calculatedScore.displayPoints !== null && calculatedScore.displayPoints !== undefined)
	                    ? calculatedScore.displayPoints
	                    : calculatedScore.points;
	                const statusText = calculatedScore.displayResponse || calculatedScore.normalizedValue || calculatedScore.response || 'NA';
	                const pointsText = displayScorePoints !== null ? `${parseFloat(displayScorePoints).toFixed(0)} pts` : '0 pts';

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
            }



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

	                    const displayScorePoints = calculatedScore
	                        ? ((calculatedScore.displayPoints !== null && calculatedScore.displayPoints !== undefined)
	                            ? calculatedScore.displayPoints
	                            : calculatedScore.points)
	                        : null;
	                    if (calculatedScore && displayScorePoints !== null) {
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
	                            const displayResponse = calculatedScore.displayResponse || calculatedScore.response;
	                            let scoreTag = `[SCORE: ${parseFloat(displayScorePoints).toFixed(0)} pts - ${displayResponse}${rootSuffix}]`;
                            if (isRoot) {
                                if (isDraft) {
	                                    scoreTag = `[INCOMPLETE ROOT SCORE: ${parseFloat(displayScorePoints).toFixed(0)} pts - ${displayResponse}${rootSuffix}]`;
                                } else {
	                                    scoreTag = `[ROOT SCORE: ${parseFloat(displayScorePoints).toFixed(0)} pts - ${displayResponse}${rootSuffix}]`;
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
	            if (typeof onCriterionChange === 'function') onCriterionChange(`is_critical_${commentFieldId}`, isChecked);
            saveField(`is_critical_${commentFieldId}`, isChecked);

            if (!isChecked) {
                // If turning off, remove the tag immediately
                newComment = currentComment.replace(/\s?\[CRITICAL\]/g, '').trim();
	                if (typeof onCriterionChange === 'function') onCriterionChange(commentFieldId, newComment);
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

	        // Validation: "Type of Assessment" must be loaded in Assessment Details
        if (typeOfAssessmentDeId) {
        const v = formData?.[typeOfAssessmentDeId];
        if (v === undefined || v === null || String(v).trim() === '' || String(v).toUpperCase() === 'NA') {
	            setSubmitResult({ success: false, message: '❌ Type of Assessment has not loaded from the Assessment Details event yet.' });
            setIsSubmitting(false);
            return;
        }
        // Additional rule: prevent Baseline type if a Baseline assessment already exists for this facility
        if (isBaselineType(v) && hasExistingBaseline) {
            setSubmitResult({ success: false, message: '❌ A Baseline assessment already exists for this facility. Please choose a different Type of Assessment.' });
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

                const result = await (api.submitEventPutBatched
                    ? api.submitEventPutBatched(payloadData, configuration, orgUnit, { batchSize: 150, interChunkDelayMs: 75 })
                    : api.submitEventPut(payloadData, configuration, orgUnit));

                // For the PUT flow, we already know the target Event ID
                const dhis2EventId = putEventId;

                    if (activeEventId) {
                        await indexedDBService.markAsSynced(activeEventId, dhis2EventId || 'synced');
                        if (typeof setSyncStatus === 'function') {
                            setSyncStatus('synced');
                        }
                    }

                if (result && result.chunks) {
                    setSubmitResult({ success: true, message: `✅ Saved successfully in ${result.chunks} batches.` });
                } else {
                    setSubmitResult({ success: true, message: '✅ Saved successfully (data will sync to DHIS2 when online).' });
                }
            } catch (err) {
                console.error('❌ Tracker workflow failed:', err);
                if (activeEventId) await indexedDBService.markAsFailed(activeEventId, err.message);
                setSubmitResult({ success: false, message: `❌ Submit failed: ${err.message}` });
            } finally {
                setIsSubmitting(false);
            }
        };

            return (
                <div
                    ref={formAreaRef}
                    className="form-area secure-no-select"
                    onCopy={(e) => { e.preventDefault(); e.stopPropagation(); }}
                    onCut={(e) => { e.preventDefault(); e.stopPropagation(); }}
                    onPaste={(e) => { e.preventDefault(); e.stopPropagation(); }}
                    onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}
                >
                    {!isWindowActive && (
                        <div className="security-blur-overlay" onClick={() => setIsWindowActive(true)}>
                            <div className="security-blur-card" onClick={(e) => e.stopPropagation()}>
                                <span className="security-blur-icon">🔒</span>
                                <h3 className="security-blur-title">Security Shield Active</h3>
                                <p className="security-blur-text">
                                    Survey content is hidden for security and confidentiality reasons because this window is inactive.
                                </p>
                                <button className="security-blur-btn" onClick={() => setIsWindowActive(true)}>
                                    Resume Survey
                                </button>
                            </div>
                        </div>
                    )}
                    <div className="form-header">
                        <div className="header-content">
                                <h2>
	                                    {(() => {
	                                            const raw = String(activeSection?.name || '').trim();
	                                            if (!raw) return '';
	                                            const upper = raw.toUpperCase();
	                                            const seId = activeSection?.se_id ?? activeSection?.seId ?? activeSection?.sectionNumber ?? null;
	                                            const isAD = isAssessmentDetailsSection(activeSection);
	                                            const escapeRegExp = (value) => String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

	                                            // If the name already starts with an SE prefix like
	                                            // "SE7 RISK MANAGEMENT" or "SE 7 RISK MANAGEMENT",
	                                            // normalise it to "SE 7 ...".
	                                            const sePrefixMatch = raw.match(/^\s*SE\s*([0-9]+(?:\.[0-9]+)*)\s*(.*)$/i);
	                                            if (sePrefixMatch) {
	                                                const num = sePrefixMatch[1];
	                                                const rest = sePrefixMatch[2].trim();
	                                                const seToken = `SE ${num}`;
	                                                return rest ? `${seToken} ${rest}` : seToken;
	                                            }

	                                            // Try to derive SE code from HOSP patterns.
	                                            const hospMatch = upper.match(/HOSP[_\s-]*(SE)?(\d+(?:\.\d+)*)/);
	                                            if (hospMatch) {
	                                                const numPart = hospMatch[2];
	                                                const seToken = `SE ${numPart}`;
	                                                const rest = raw
	                                                    .slice(hospMatch.index + hospMatch[0].length)
	                                                    .replace(/^[\s\-_:]+/, '');
	                                                return rest ? `${seToken} ${rest}` : seToken;
	                                            }

	                                            if (seId && !isAD) {
	                                                const leadingSePattern = new RegExp(`^\\s*(?:SE\\s*)?${escapeRegExp(seId)}(?:[\\s\\-_:]+)?`, 'i');
	                                                const rest = raw.replace(leadingSePattern, '').trim();
	                                                const seToken = `SE ${seId}`;
	                                                return rest ? `${seToken} ${rest}` : seToken;
	                                            }
	                                            return raw;
	                                        })()}
                                {subsections.length > 1 && (
                                <span style={{ fontSize: '0.6em', opacity: 0.8, marginLeft: '10px', verticalAlign: 'middle', backgroundColor: 'rgba(255,255,255,0.15)', padding: '2px 8px', borderRadius: '4px' }}>
                                    Part {currentSubsectionIndex + 1} of {subsections.length}
                                </span>
                            )}
                        </h2>
                        {/* SE assignment status banner */}
                        {seLockInfo.hasAssignments && !isADSection && (
                            <div style={{
                                padding: '8px 14px',
                                borderRadius: 6,
                                fontSize: '0.85em',
                                fontWeight: 600,
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8,
                                marginBottom: 2,
                                ...(isSectionLocked
                                    ? { background: '#fef3c7', color: '#92400e', border: '1px solid #fbbf24' }
                                    : seLockInfo.isLead
                                        ? { background: '#ede9fe', color: '#5b21b6', border: '1px solid #c4b5fd' }
                                        : { background: '#d1fae5', color: '#065f46', border: '1px solid #6ee7b7' })
                            }}>
                                {isSectionLocked
                                    ? <>{String.fromCodePoint(0x1F512)} This SE is assigned to {sectionOwnerName}. View-only.</>
                                    : seLockInfo.isLead
                                        ? <>{String.fromCodePoint(0x1F451)} Lead assessor — full access</>
                                        : <>{String.fromCodePoint(0x270F, 0xFE0F)} Assigned to you</>}
                            </div>
                        )}
                        {(activeEventId || randomizeRunState) && (
                            <div className="header-status-group">
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
                                {randomizeRunState && (
                                    <div
                                        className={`randomize-status-badge ${randomizeRunState.status}`}
                                        title={randomizeRunState.summary || randomizeRunState.label}
                                    >
                                        <span className="randomize-status-dot" />
                                        <span>{randomizeRunState.label}</span>
                                        {randomizeRunState.completedAt && !isRandomizing && (
                                            <span className="randomize-status-time">
                                                {new Date(randomizeRunState.completedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                            {/* Section-level scoring summary was previously shown here.
                                The standard-level draft score is now displayed inline
                                next to the x.x.x standard row within the form body. */}
                        <div className="header-actions" style={{ marginLeft: 'auto' }}>
                            <details className="header-assessors-dropdown">
                                <summary className="header-assessors-summary">
                                    <span>{String.fromCodePoint(0x1F465)}</span>
                                    <span>
                                        {headerAssessorAssignments.loading
                                            ? 'Loading assigned assessors…'
                                            : headerAssessorAssignments.currentRow && !isADSection
                                                ? `SE ${headerAssessorAssignments.currentRow.seNum}: ${headerAssessorAssignments.currentRow.assignees.map(a => a.displayName).join(', ') || 'Unassigned'}`
                                                : `Assigned assessors (${headerAssessorAssignments.totalAssessorCount || 0})`}
                                    </span>
                                </summary>
                                <div className="header-assessors-menu">
                                    {headerAssessorAssignments.loading ? (
                                        <div className="header-assessors-empty">Loading assignment plan…</div>
                                    ) : headerAssessorAssignments.rows.length === 0 ? (
                                        <div className="header-assessors-empty">No assigned assessors were found for this assessment.</div>
                                    ) : (
                                        <>
                                            {headerAssessorAssignments.currentRow && !isADSection && (
                                                <div className="header-assessors-current">
                                                    <strong>Current section:</strong> SE {headerAssessorAssignments.currentRow.seNum} — {headerAssessorAssignments.currentRow.assignees.map(a => a.displayName).join(', ') || 'Unassigned'}
                                                </div>
                                            )}
                                            <div className="header-assessors-meta">
                                                {headerAssessorAssignments.totalAssignedSections} SEs assigned · {headerAssessorAssignments.totalAssessorCount} assessor{headerAssessorAssignments.totalAssessorCount === 1 ? '' : 's'}
                                            </div>
                                            <div className="header-assessors-list">
                                                {headerAssessorAssignments.rows.map((row) => (
                                                    <div
                                                        key={`header-assessor-${row.seNum}`}
                                                        className={`header-assessors-item ${String(activeSeNum || '') === row.seNum ? 'active' : ''}`}
                                                    >
                                                        <div className="header-assessors-se">SE {row.seNum}</div>
                                                        <div className="header-assessors-names">
                                                            {row.assignees.length > 0
                                                                ? row.assignees.map((assignee) => assignee.displayName).join(', ')
                                                                : 'Unassigned'}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </>
                                    )}
                                </div>
                            </details>
                            <button
                                className="scoring-logic-btn"
                                onClick={() => setIsScoringModalOpen(true)}
                                title="View Scoring Logic Summary"
                            >
                                📊 Scoring Logic
                            </button>
                            <button
                                className="nav-btn"
                                onClick={randomizeAllAnswers}
                                disabled={true}
                                title="Randomization is disabled during pretesting."
                                style={{ 
                                    marginLeft: 8, 
                                    background: 'transparent', 
                                    color: '#d1d5db', 
                                    border: '1px dashed #e5e7eb',
                                    fontSize: '0.8em',
                                    cursor: 'not-allowed' 
                                }}
                            >
                                {isRandomizing ? 'Randomizing...' : 'Randomize Answers'}
                            </button>
                        </div>
                    </div>
                    <details style={{
                        marginTop: '12px',
                        padding: '12px 14px',
                        borderRadius: '8px',
                        background: 'rgba(15, 23, 42, 0.28)',
                        border: '1px solid rgba(148, 163, 184, 0.45)',
                        color: '#e2e8f0'
                    }}>
                        <summary style={{ cursor: 'pointer', fontWeight: 600, color: '#94a3b8', fontSize: '0.9rem', outline: 'none' }}>
                            🔧 Technical Event Mapping Metadata
                        </summary>
                        <div style={{ marginTop: '12px', display: 'flex', flexWrap: 'wrap', gap: '14px', alignItems: 'center', fontSize: '0.92rem' }}>
                            <div><strong>Expected SYS_TAG:</strong> <code>{activeExpectedSysTag || 'N/A'}</code></div>
                            <div><strong>Mapped Event ID:</strong> <code>{activeSectionEventId || 'Not mapped'}</code></div>
                        </div>
	                        <details style={{ marginTop: '10px' }}>
                            <summary style={{ cursor: 'pointer', fontWeight: 700 }}>Expected data JSON</summary>
                            <pre style={{
                                marginTop: '10px',
                                marginBottom: 0,
                                maxHeight: '280px',
                                overflow: 'auto',
                                padding: '12px',
                                borderRadius: '6px',
                                background: 'rgba(2, 6, 23, 0.78)',
                                color: '#cbd5e1',
                                whiteSpace: 'pre-wrap',
                                wordBreak: 'break-word',
                                fontSize: '0.78rem',
                                lineHeight: 1.45
                            }}>{JSON.stringify(activeSectionDebugPayload, null, 2)}</pre>
                        </details>
                        <details style={{ marginTop: '10px' }}>
                            <summary style={{ cursor: 'pointer', fontWeight: 700 }}>Mapped DHIS2 event payload</summary>
                            <pre style={{
                                marginTop: '10px',
                                marginBottom: 0,
                                maxHeight: '280px',
                                overflow: 'auto',
                                padding: '12px',
                                borderRadius: '6px',
                                background: 'rgba(2, 6, 23, 0.78)',
                                color: '#cbd5e1',
                                whiteSpace: 'pre-wrap',
                                wordBreak: 'break-word',
                                fontSize: '0.78rem',
                                lineHeight: 1.45
                            }}>{JSON.stringify(activeMappedEventPayload || { message: 'No mapped event payload available for this section.' }, null, 2)}</pre>
                        </details>
                    </details>
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
                                        scrollToTop();
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
                                        scrollToTop();
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
                                        {isSeSummaryOpen && (() => {
                                            const rawVal = formData[`se_summary_${activeSection?.id}`] || '';
                                            let leadInterviewee = '';
                                            let overview = '';
                                            try {
                                                const parsed = JSON.parse(rawVal);
                                                if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                                                    leadInterviewee = parsed.leadInterviewee || '';
                                                    overview = parsed.overview || '';
                                                } else {
                                                    overview = rawVal;
                                                }
                                            } catch (e) {
                                                overview = rawVal;
                                            }

                                            return (
                                                <div className="standard-summary-body" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: 'none' }}>
                                                    <div>
                                                        <label
                                                            htmlFor={`se-lead-${activeSection?.id || 'unknown'}`}
                                                            className="standard-summary-label"
                                                        >
                                                            Lead Interviewee Name
                                                        </label>
                                                        <input
                                                            id={`se-lead-${activeSection?.id || 'unknown'}`}
                                                            type="text"
                                                            className="form-control"
                                                            style={{ fontSize: '0.85rem', padding: '0.5rem 0.75rem' }}
                                                            value={leadInterviewee}
                                                            onChange={(e) => {
                                                                const key = `se_summary_${activeSection?.id}`;
                                                                saveField(key, JSON.stringify({ leadInterviewee: e.target.value, overview }));
                                                            }}
                                                            placeholder="Type lead interviewee name..."
                                                            disabled={isSectionLocked}
                                                        />
                                                    </div>
                                                    <div>
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
                                                            value={overview}
                                                            onChange={(e) => {
                                                                const key = `se_summary_${activeSection?.id}`;
                                                                saveField(key, JSON.stringify({ leadInterviewee, overview: e.target.value }));
                                                            }}
                                                            placeholder="Type an overview or concise narrative for this SE..."
                                                            disabled={isSectionLocked}
                                                        />
                                                    </div>
                                                </div>
                                            );
                                        })()}
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
                                                        <div className="standard-summary-title" dangerouslySetInnerHTML={{ __html: entry.title }} />
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
                                                            scrollToTop();
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
                                                                <div className="standard-summary-title" dangerouslySetInnerHTML={{ __html: std.title }} />
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
                                                                    {std.cappedByCritical && (
                                                                        <span
                                                                            className="standard-summary-cap-pill"
                                                                            title={`Capped due to critical item: ${std.cappedByCritical}`}
                                                                            style={{
                                                                                marginLeft: '6px',
                                                                                fontSize: '0.7em',
                                                                                fontWeight: 700,
                                                                                padding: '1px 6px',
                                                                                borderRadius: '10px',
                                                                                backgroundColor: std.cappedByCritical === 'NC' ? '#fde8e8' : '#fff8e1',
                                                                                color: std.cappedByCritical === 'NC' ? '#a61b1b' : '#92400e',
                                                                                border: '1px solid rgba(0,0,0,0.1)'
                                                                            }}
                                                                        >
                                                                            Capped ({std.cappedByCritical})
                                                                        </span>
                                                                    )}
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
                                    scrollToTop();
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
                                    scrollToTop();
                                }}
                                disabled={isLastSubsection}
                                style={{ opacity: isLastSubsection ? 0.5 : 1 }}
                            >
                                Next Page →
                            </button>
                            {/* Testing: Randomize all answers/comments across this group's sections */}
                            <button
                                className="nav-btn"
                                onClick={randomizeAllAnswers}
                                disabled={true}
                                title="Randomization is disabled during pretesting."
                                style={{ 
                                    marginLeft: '8px', 
                                    background: 'transparent', 
                                    color: '#d1d5db', 
                                    border: '1px dashed #e5e7eb',
                                    fontSize: '0.8em',
                                    cursor: 'not-allowed' 
                                }}
                            >
                                {isRandomizing ? 'Randomizing...' : 'Randomize Answers (all SEs)'}
                            </button>
                        </div>
                    )}
                        {isLastSubsection && (
                            <button
                                className="nav-btn submit-btn"
                                onClick={handleSubmit}
                                disabled={isSubmitting || isSaving || submitResult?.success || isSectionLocked}
                                style={{
                                    marginTop: '12px',
                                    width: '100%',
                                    background: (isSubmitting || isSaving) ? '#6c757d' : submitResult?.success ? '#2ecc71' : '#28a745',
                                    color: '#fff',
                                    border: 'none',
                                    padding: '10px',
                                    borderRadius: '4px',
                                    cursor: (isSubmitting || isSaving || submitResult?.success || isSectionLocked) ? 'not-allowed' : 'pointer',
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
                                <div>
                                    {(() => {
                                        const code = openCriterionTooltip?.code;
                                        const normalized = code ? normalizeCriterionCode(code) : null;
                                        const hasSubCriteria = normalized ? (HOSPITAL_SUBCRITERIA_MAP[normalized]?.length > 0) : false;
                                        return hasSubCriteria ? <strong>Root Criteria</strong> : "Criterion information";
                                    })()}
                                </div>
                                <button className="close-modal-btn" onClick={() => setOpenCriterionTooltip(null)} aria-label="Close">&times;</button>
                            </div>
	                            <div className="scoring-modal-body" style={{ whiteSpace: 'pre-line' }}>
	                                {(() => {
	                                    const tooltipText = typeof openCriterionTooltip === 'string'
	                                        ? openCriterionTooltip
	                                        : (openCriterionTooltip?.text || '');
	                                    const tooltipGuideline = typeof openCriterionTooltip === 'string'
	                                        ? ''
	                                        : (openCriterionTooltip?.guideline || '');
	                                    return (
	                                        <>
	                                            {tooltipGuideline && (
	                                                <div style={{ marginBottom: '16px', padding: '12px 14px', borderRadius: '8px', background: '#eff6ff', border: '1px solid #bfdbfe' }}>
	                                                    <div style={{ fontWeight: 700, color: '#1e3a8a', marginBottom: '6px' }}>Guideline</div>
	                                                    <div dangerouslySetInnerHTML={{ __html: tooltipGuideline }} />
	                                                </div>
	                                            )}
	                                            {tooltipText && (
                                                    <div>
                                                        {tooltipText.startsWith("**Root Criteria**") ? (
                                                            <>
                                                                <strong>Root Criteria</strong>
                                                                <div dangerouslySetInnerHTML={{ __html: tooltipText.substring("**Root Criteria**".length) }} />
                                                            </>
                                                        ) : (
                                                            <div dangerouslySetInnerHTML={{ __html: tooltipText }} />
                                                        )}
                                                    </div>
                                                )}
	                                        </>
	                                    );
	                                })()}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        );
    };

    export default FormArea;