import React, { useState, useEffect } from 'react';
import { useApp } from '../contexts/AppContext';
import './SurveyPreview.css';

// Data element ID for "SURV-Facility Assessment Group"
const FACILITY_GROUP_DE_ID = 'pzenrgsSny3';

// Helper: extract the assessment/enrollment ID from a draft event key
// Drafts created from assignments use the pattern:
//   draft-assessment-<ASSESSMENT_ID>-group-<GROUP_KEY>
const extractAssessmentIdFromEvent = (evt) => {
    const metaId = evt?._draftData?.metadata?.assessmentId;
    if (metaId) return metaId;

    const key = evt?._draftData?.eventId || evt?.event;
    if (!key || typeof key !== 'string') return null;

    const match = key.match(/^draft-assessment-(.+?)-group-/);
    return match ? match[1] : null;
};

export function SurveyPreview({ event, onClose }) {
    const { configuration, userAssignments } = useApp();
    const [previewData, setPreviewData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [activeSection, setActiveSection] = useState(null);

	    useEffect(() => {
	        if (event && configuration) {
	            // Recompute preview whenever the event, configuration, or
	            // userAssignments change so that facility names are updated
	            // once assignments have loaded.
	            generatePreviewData();
	        }
	    }, [event, configuration, userAssignments]);

	    	    const generatePreviewData = () => {
	    	        setLoading(true);
	    	        try {
	    	            // detailed assignment structure: { trackedEntityInstance, orgUnit, orgUnitName, status }
	    	            // Try to resolve facility from multiple sources:
	    	            //  - Assessment ID on the draft (matches api.getAssignments enrollment)
	    	            //  - Draft form data (facilityName_internal)
	    	            //  - User assignments (matching orgUnit IDs)
	    	            //  - Event/orgUnit name on the event itself
	    	            const assessmentIdFromDraft = extractAssessmentIdFromEvent(event);
	    	            const orgUnitIdFromEvent =
	    	                event?.orgUnit ||
	    	                event?._draftData?.formData?.orgUnit ||
	    	                event?._draftData?.formData?.orgUnit_internal ||
	    	                null;
	    	
	    	            let assignment = null;
	    	
	    	            // 1) Prefer matching by enrollment/assessment ID
	    	            if (assessmentIdFromDraft) {
	    	                assignment = userAssignments?.find(a =>
	    	                    a.enrollment === assessmentIdFromDraft ||
	    	                    a.trackedEntityInstance === assessmentIdFromDraft
	    	                ) || null;
	    	            }
	    	
	    	            // 2) Fallback: match by orgUnit ID if we have it
	    	            if (!assignment && orgUnitIdFromEvent) {
	    	                assignment = userAssignments?.find(a => {
	    	                    const assignmentOrgUnitId = a.orgUnitId || (typeof a.orgUnit === 'string' ? a.orgUnit : a.orgUnit?.id);
	    	                    return assignmentOrgUnitId && assignmentOrgUnitId === orgUnitIdFromEvent;
	    	                }) || null;
	    	            }
	    	
	    	            const facilityNameFromDraft =
	    	                event?._draftData?.formData?.facilityName_internal ||
	    	                event?._draftData?.formData?.facilityName;
	    	
	    	            const facilityName =
	    	                facilityNameFromDraft ||
	    	                assignment?.orgUnitName ||
	    	                event?.orgUnitName ||
	    	                'Unknown Facility';

            const sectionData = {};
            const dataValueMap = {};

	            if (event.dataValues) {
	                event.dataValues.forEach(dv => dataValueMap[dv.dataElement] = dv.value);
	            }
	            // Handle draft data structure if different
	            if (event._draftData && event._draftData.formData) {
	                Object.assign(dataValueMap, event._draftData.formData);
	            }

	            // Facility Assessment Group (Clinics / Hospital / EMS / Mortuary, etc.)
	            const groupName = dataValueMap[FACILITY_GROUP_DE_ID];


            if (configuration.programStage?.programStageSections) {
                configuration.programStage.programStageSections.forEach(section => {
                    const sectionName = section.displayName || section.name;
                    const sectionFields = [];

                    if (section.dataElements) {
                        section.dataElements.forEach(psde => {
                            // API structure check: is it psde.dataElement or just psde?
                            // Based on api.js getFormMetadata, it returns programStageSections with dataElements inside them directly
                            if (!psde) return;
                            const dataElementId = psde.id;
                            const value = dataValueMap[dataElementId];

                            if (value !== undefined && value !== null && value.toString().trim() !== '') {
                                sectionFields.push({
                                    id: dataElementId,
                                    name: psde.displayName || psde.displayFormName,
                                    value: value, // simplified formatting
                                    valueType: psde.valueType
                                });
                            }
                        });
                    }

                    if (sectionFields.length > 0) {
                        sectionData[sectionName] = {
                            name: sectionName,
                            fields: sectionFields,
                            fieldCount: sectionFields.length
                        };
                    }
                });
            }
            const sectionsWithData = Object.keys(sectionData);
            if (sectionsWithData.length > 0 && !activeSection) {
                setActiveSection(sectionsWithData[0]);
            }
	            setPreviewData({
	                event: {
	                    id: event.event,
	                    date: event.eventDate,
	                    status: event.status || event.syncStatus,
	                    createdAt: event.createdAt,
	                    updatedAt: event.updatedAt
	                },
	                facility: { name: facilityName },
	                group: groupName ? { name: groupName } : null,
	                sections: sectionData,
	                totalFields: Object.values(sectionData).reduce((sum, section) => sum + section.fieldCount, 0),
	                sectionsWithData: sectionsWithData.length
	            });
        } catch (error) {
            console.error('Error generating preview:', error);
        } finally {
            setLoading(false);
        }
    };

	    if (loading) return <div className="loading-preview">Loading preview...</div>;
	    if (!previewData) return null;

	    // Derive a friendly date string for the header (prefer event date, then updatedAt, then createdAt)
	    const rawDate = previewData.event?.date || previewData.event?.updatedAt || previewData.event?.createdAt;
	    let displayDate = null;
	    if (rawDate) {
	        const d = new Date(rawDate);
	        displayDate = isNaN(d.getTime()) ? rawDate : d.toLocaleDateString();
	    }

	    return (
	        <div
	            className="inspection-preview-overlay secure-no-select"
	            onCopy={(e) => { e.preventDefault(); e.stopPropagation(); }}
	            onCut={(e) => { e.preventDefault(); e.stopPropagation(); }}
	            onPaste={(e) => { e.preventDefault(); e.stopPropagation(); }}
	            onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}
	        >
	            <div className="inspection-preview-modal">
	                <div className="preview-header">
	                    <div className="preview-header-main">
	                        <h2 className="preview-title">Survey Preview</h2>
	                        <div className="preview-meta">
	                            <div><strong>Facility:</strong> {previewData.facility?.name || 'Unknown Facility'}</div>
	                            {previewData.group?.name && (
	                                <div><strong>Group:</strong> {previewData.group.name}</div>
	                            )}
	                            <div className="preview-event-details">
	                                {previewData.event?.id && (
	                                    <span><strong>Event:</strong> {previewData.event.id}</span>
	                                )}
	                                {displayDate && (
	                                    <span><strong> | Date:</strong> {displayDate}</span>
	                                )}
	                                {previewData.event?.status && (
	                                    <span><strong> | Status:</strong> {String(previewData.event.status).toUpperCase()}</span>
	                                )}
	                            </div>
	                        </div>
	                    </div>
	                    <button className="close-btn" onClick={onClose}>×</button>
	                </div>

	                <div className="preview-content">
                    <div className="section-nav">
                        {Object.keys(previewData.sections).map(sectionName => (
                            <button
                                key={sectionName}
                                className={`section-nav-item ${activeSection === sectionName ? 'active' : ''}`}
                                onClick={() => setActiveSection(sectionName)}
                            >
                                {sectionName}
                            </button>
                        ))}
                    </div>

                    <div className="section-data">
                        {activeSection && previewData.sections[activeSection] && (
                            <div className="fields-list">
                                {previewData.sections[activeSection].fields.map(field => (
                                    <div key={field.id} className="field-item">
                                        <div className="field-question">{field.name}</div>
                                        <div className="field-answer">{field.value}</div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
