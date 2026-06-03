import { api } from '../api';

// Known DHIS2 data element UIDs used in the assignment/scheduling flows.
// If your program uses a specific data element to store the status code,
// set its UID here. Otherwise status is derived from enrollment status.
const STATUS_DATA_ELEMENT_UID = null; // e.g. 'abc123XYZ' — set if applicable

// Attribute UID for "Inspection Final List" (list of inspector user IDs) in
// the main survey program (G2gULe4jsfs). Duplicated here from api.js so we
// can perform a client-side fallback filter without changing the API shape.
const INSPECTOR_LIST_ATTR = 'Rh87cVTZ8b6';

/**
 * Maps a DHIS2 enrollment status (and optional stored status value) to
 * the FAC_ASS_ASSIGN_* codes expected by the UI.
 */
function mapStatus(enrollmentStatus, storedStatusCode) {
    // If a specific status code was stored on a data element, trust it
    if (storedStatusCode && storedStatusCode.startsWith('FAC_ASS_ASSIGN_')) {
        return storedStatusCode;
    }
    switch (enrollmentStatus) {
        case 'ACTIVE': return 'FAC_ASS_ASSIGN_PENDING';
        case 'COMPLETED': return 'FAC_ASS_ASSIGN_ACCEPTED';
        case 'CANCELLED': return 'FAC_ASS_ASSIGN_CANCELLED';
        default: return 'FAC_ASS_ASSIGN_PENDING';
    }
}

/**
 * Extracts the most relevant date from an enrollment.
 * Prefers the first event's occurredAt/eventDate, falls back to enrollmentDate / incidentDate.
 */
function extractDate(item) {
    if (item.events && item.events.length > 0) {
        const sorted = [...item.events].sort((a, b) =>
	            new Date(a.occurredAt || a.eventDate) - new Date(b.occurredAt || b.eventDate)
        );
	        const first = sorted[0];
	        const dateStr = first.occurredAt || first.eventDate;
	        if (dateStr) {
	            return dateStr.slice(0, 10);
        }
    }
    return (item.enrollmentDate || item.incidentDate || new Date().toISOString()).slice(0, 10);
}

class AssessmentTeamAssignmentService {
    constructor() {
        this.metadata = null;
    }

    async init({ metadata }) {
        this.metadata = metadata;
        return true;
    }

	    /**
	     * Fetch assignments for a specific user and year from DHIS2.
	     * Returns objects shaped as: { eventId, scheduleTeiId, statusCode, sortDate, orgUnitName }
	     */
		    async getUserAssignmentsDomain({ userId, username, year }) {
	        try {
		            console.log('[AssessmentTeamAssignmentService] getUserAssignmentsDomain called', {
		                userId,
		                username,
		                year
		            });
		            // Primary path: Use scheduling workflow assignments derived from
		            // program K9O5fdoBmKf via api.getSchedulingAssignments. Pass both
		            // userId and username so the API can match whichever identifier
		            // is stored in the Assigned User ID data element.
		            let enrollments = [];
		            try {
		                enrollments = await api.getSchedulingAssignments(userId, username);
		            } catch (err) {
		                console.warn('[AssessmentTeamAssignmentService] Scheduling assignments call failed, will fall back to legacy getAssignments if possible.', err);
		            }
		            console.log('[AssessmentTeamAssignmentService] Scheduling assignments result', {
		                userId,
		                username,
		                count: enrollments?.length || 0
		            });

		            if (userId) {
		                // Fetch legacy enrollments filtered by user ID and/or username on the server
		                const [legacyByUid, legacyByUsername] = await Promise.all([
		                    api.getAssignments('G2gULe4jsfs', userId),
		                    username && username !== userId ? api.getAssignments('G2gULe4jsfs', username) : Promise.resolve([])
		                ]);
		                const legacyEnrollments = [...legacyByUid, ...legacyByUsername];
		                
		                // Deduplicate by enrollment ID
		                const seenEnrollments = new Set();
		                const uniqueLegacy = [];
		                for (const enr of legacyEnrollments) {
		                    if (!seenEnrollments.has(enr.enrollment)) {
		                        seenEnrollments.add(enr.enrollment);
		                        uniqueLegacy.push(enr);
		                    }
		                }

		                console.log('[AssessmentTeamAssignmentService] Legacy assignments for user (server filtered)', { userId, username, count: uniqueLegacy.length });
		                enrollments = [...(enrollments || []), ...uniqueLegacy];
		            }

	            console.log('[AssessmentTeamAssignmentService] Total enrollments to map into domain assignments', {
	                userId,
	                username,
	                count: enrollments?.length || 0
	            });

            return enrollments.map(item => {
	                // Try to infer a stored status code from team events (preferred),
	                // falling back to any explicit STATUS_DATA_ELEMENT_UID, and
	                // finally to enrollment.status via mapStatus.
	                let storedStatusCode = null;

	                // If api.getSchedulingAssignments attached team info, derive status
	                if (item.team && item.team.length > 0) {
	                    const myEvents = item.team.filter(t => t.assignedUserId === userId);
	                    const relevant = (myEvents.length > 0 ? myEvents : item.team)[myEvents.length > 0 ? myEvents.length - 1 : item.team.length - 1];
	                    if (relevant && relevant.assignmentStatus) {
	                        storedStatusCode = relevant.assignmentStatus;
	                    }
	                }

	                // Legacy path: look for a dedicated status data element if configured
	                if (!storedStatusCode && STATUS_DATA_ELEMENT_UID && item.events) {
	                    for (const event of item.events) {
	                        const dv = (event.dataValues || []).find(
	                            d => d.dataElement === STATUS_DATA_ELEMENT_UID
	                        );
	                        if (dv) { storedStatusCode = dv.value; break; }
	                    }
	                }

                return {
	                    eventId: item.enrollment || item.trackedEntityInstance,
			            // Keep explicit reference to the TEI so other parts of the
			            // app (e.g. App.jsx auto-population of Assessment Details)
			            // can reliably access it.
			            trackedEntityInstance: item.trackedEntityInstance,
			            scheduleTeiId: item.trackedEntityInstance,
	                    statusCode: mapStatus(item.status, storedStatusCode),
	                    sortDate: extractDate(item),
	                    // Use enriched fields from api.js
	                    orgUnitName: item.orgUnitName,
	                    orgUnit: item.orgUnitId || item.orgUnit?.id || item.orgUnit,
	                    facilityId: item.facilityId,
	                    // programOrgUnitId is the org unit used for the main
	                    // survey program (e.g. district like Gaborone). This is
	                    // what FormArea uses when creating the TEI/enrollment so
	                    // that the program/OU assignment is valid in DHIS2.
	                    programOrgUnitId: item.programOrgUnitId,
	                    parentOrgUnitName: item.parentOrgUnitName,
	                    enrollmentDate: item.enrollmentDate,
		                    // Optional Tracker scheduling / audit fields, not
		                    // required by the current UI but available for
		                    // troubleshooting or future features.
		                    scheduledAt: item.scheduledAt || null,
		                    updatedAt: item.updatedAt || null,
                    attributes: item.attributes || [],
	                    setupEventId: item.setupEventId || null,
	                    setupEventDataValues: Array.isArray(item.setupEventDataValues) ? item.setupEventDataValues : [],
                    // Surface the team from api.getSchedulingAssignments so the
                    // Dashboard can display members/roles next to each assignment.
                    // Shape: [{ assignedUserId, assignmentStatus, teamRole, eventDate, orgUnit, orgUnitName }]
                    team: Array.isArray(item.team) ? item.team : [],
                    teamSize: Array.isArray(item.team) ? item.team.length : 0,
                    // Convenience fields for current user’s membership when available
                    myTeamRole: (() => {
                        const mine = (Array.isArray(item.team) ? item.team : []).find(t => String(t.assignedUserId || '') === String(userId) || String(t.assignedUserId || '').toLowerCase().includes(String(username || '').toLowerCase()));
                        return mine?.teamRole || null;
                    })(),
                    myAssignmentStatus: (() => {
                        const mine = (Array.isArray(item.team) ? item.team : []).find(t => String(t.assignedUserId || '') === String(userId) || String(t.assignedUserId || '').toLowerCase().includes(String(username || '').toLowerCase()));
                        return mine?.assignmentStatus || null;
                    })(),
	                };
	            });
	        } catch (error) {
	            console.error('Error fetching user assignments:', error);
	            throw error;
	        }
	    }

    async respondToAssignment({ eventId, statusCode, reason }) {
        console.log(`Responding to assignment ${eventId} with status ${statusCode}`);
        // Implement placeholder for now - standard DHIS2 update would go here
        return { success: true };
    }
}

export default new AssessmentTeamAssignmentService();

