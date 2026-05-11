// Consistent base URL for DHIS2 AP// Consistent base URL for DHIS2 API (points to the /qims context on the server)
const BASE_URL = '/qims';

const getHeaders = (username, password) => {
    const headers = {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
    };
    if (username && password) {
        headers['Authorization'] = 'Basic ' + btoa(username + ':' + password);
    } else {
        const auth = localStorage.getItem('dhis2_auth');
        if (auth) {
            headers['Authorization'] = auth;
        }
    }
    return headers;
};

export const api = {
    // Debug info for scheduling assignments; populated by getSchedulingAssignments
	    _schedulingDebug: null,
    // Simple in-memory cache for DHIS2 user display names
    _userDisplayCache: {},

	    login: async (username, password) => {
        const url = `${BASE_URL}/api/me?fields=id,displayName,username,organisationUnits[id,name]`;
        const response = await fetch(url, {
            headers: getHeaders(username, password)
        });

        if (!response.ok) {
            const text = await response.text();
            console.error('Login failed response:', text);
            throw new Error(`Login failed: ${response.status}`);
        }

        const responseClone = response.clone();
        try {
            const data = await response.json();
            // Store credentials for subsequent requests (Basic Auth)
            const authHeader = 'Basic ' + btoa(username + ':' + password);
            localStorage.setItem('dhis2_auth', authHeader);
            localStorage.setItem('dhis2_user', JSON.stringify(data));
            return data;
        } catch (err) {
            const text = await responseClone.text();
            console.error('Failed to parse login JSON. Raw response:', text);
            throw new Error(`Login failed: Invalid JSON response from server. Check console for details.`);
        }
    },

    /**
     * Check whether a given TEI has an authorised assessment in the Scheduling program (K9O5fdoBmKf).
     * Definition used here:
     *  - Has at least one Team Assignment & Acceptance event (UQmvnyPZLk2)
     *    with Assignment Status (yVVbhT02L6G) == FAC_ASS_ASSIGN_ACCEPTED
     *  - AND has at least one Programme Setup event (M2RdEI7Tbqr)
     *    with Assessment Program Status (xFQOt5o6DSz) == FAC_ASS_PROGRAM_FINAL_CONFIRMED
     * Returns a compact summary with counts and latest dates.
     */
    checkTeiAuthorisation: async (teiId) => {
        if (!teiId) throw new Error('checkTeiAuthorisation requires teiId');
        const PROGRAM_ID = 'K9O5fdoBmKf';
        const TEAM_STAGE_ID = 'UQmvnyPZLk2';
        const SETUP_STAGE_ID = 'M2RdEI7Tbqr';
        const DE_ASSIGN_STATUS = 'yVVbhT02L6G'; // Assignment Status
        const DE_PROGRAM_STATUS = 'xFQOt5o6DSz'; // Assessment Program Status
        const ASSIGN_STATUS_ACCEPTED = 'FAC_ASS_ASSIGN_ACCEPTED';
        const PROGRAM_STATUS_APPROVED = 'FAC_ASS_PROGRAM_FINAL_CONFIRMED';

        const fields = [
            'event', 'eventDate', 'status', 'orgUnit', 'programStage', 'enrollment',
            'dataValues[dataElement,value]'
        ].join(',');

        const makeUrl = (stageId) => (
            `${BASE_URL}/api/events?paging=false&program=${PROGRAM_ID}` +
            `&programStage=${stageId}&trackedEntityInstance=${encodeURIComponent(teiId)}` +
            `&ouMode=ALL&fields=${fields}&order=eventDate:desc`
        );

        const [teamResp, setupResp] = await Promise.all([
            fetch(makeUrl(TEAM_STAGE_ID), { headers: getHeaders() }),
            fetch(makeUrl(SETUP_STAGE_ID), { headers: getHeaders() })
        ]);
        if (!teamResp.ok) throw new Error(`Failed to fetch team events: ${teamResp.status}`);
        if (!setupResp.ok) throw new Error(`Failed to fetch setup events: ${setupResp.status}`);
        const teamJson = await teamResp.json();
        const setupJson = await setupResp.json();
        const teamEvents = teamJson.events || [];
        const setupEvents = setupJson.events || [];

        const hasDv = (ev, deId, valEquals) => {
            const dvs = ev?.dataValues || [];
            return dvs.some(d => d.dataElement === deId && String(d.value || '').trim() === valEquals);
        };

        const acceptedEvents = teamEvents.filter(ev => hasDv(ev, DE_ASSIGN_STATUS, ASSIGN_STATUS_ACCEPTED));
        const approvedEvents = setupEvents.filter(ev =>
            hasDv(ev, DE_PROGRAM_STATUS, PROGRAM_STATUS_APPROVED) ||
            hasDv(ev, DE_PROGRAM_STATUS, 'Approved') // fallback if server stores label
        );

        const latestDate = (list) => (list[0]?.eventDate ? list[0].eventDate.slice(0,10) : null);

        const summary = {
            teiId,
            teamEventsCount: teamEvents.length,
            acceptedCount: acceptedEvents.length,
            setupEventsCount: setupEvents.length,
            approvedCount: approvedEvents.length,
            latestAcceptedDate: latestDate(acceptedEvents),
            latestApprovedDate: latestDate(approvedEvents),
            hasAuthorised: (acceptedEvents.length > 0) && (approvedEvents.length > 0),
            sample: {
                acceptedEventId: acceptedEvents[0]?.event || null,
                approvedEventId: approvedEvents[0]?.event || null,
                enrollmentAccepted: acceptedEvents[0]?.enrollment || null,
                enrollmentApproved: approvedEvents[0]?.enrollment || null,
            }
        };
        return summary;
    },

    /**
     * Resolve DHIS2 user display names for a list of identifiers. The identifiers
     * can be either user IDs (UIDs) or usernames. Returns a map of
     * { key -> { id, username, displayName } } and caches results in-memory.
     */
    resolveUserDisplayNames: async (values) => {
        try {
            if (!Array.isArray(values) || values.length === 0) return {};
            const result = {};
            const cache = api._userDisplayCache || (api._userDisplayCache = {});

            // Expand composite keys like "id|username" into individual keys
            const expanded = new Set();
            values.forEach(v => {
                if (!v) return;
                String(v).split('|').forEach(part => {
                    const k = String(part || '').trim();
                    if (k) expanded.add(k);
                });
            });

            // Seed from cache
            const unknown = [];
            expanded.forEach(k => {
                if (cache[k]) {
                    result[k] = cache[k];
                } else {
                    unknown.push(k);
                }
            });

            if (unknown.length === 0) return result;

            // Partition into likely IDs (11-char DHIS2 UID) and usernames (others)
            const uidLike = unknown.filter(k => /^[A-Za-z0-9]{11}$/.test(k));
            const usernames = unknown.filter(k => !/^[A-Za-z0-9]{11}$/.test(k));

            const collected = [];

            // Helper to fetch with a specific filter
            const fetchUsers = async (filterField, list) => {
                if (list.length === 0) return [];
                const bracket = `[${list.map(encodeURIComponent).join(',')}]`;
                const url = `${BASE_URL}/api/users.json?paging=false&fields=id,username,displayName&filter=${filterField}:in:${bracket}`;
                const resp = await fetch(url, { headers: getHeaders() });
                if (!resp.ok) return [];
                const data = await resp.json().catch(() => ({}));
                return data.users || data || [];
            };

            try {
                const byId = await fetchUsers('id', uidLike);
                collected.push(...byId);
            } catch (_) {}
            try {
                const byUsername = await fetchUsers('username', usernames);
                collected.push(...byUsername);
            } catch (_) {}

            collected.forEach(u => {
                const entry = { id: u.id, username: u.username, displayName: u.displayName || u.username || u.id };
                if (u.id) { cache[u.id] = entry; result[u.id] = entry; }
                if (u.username) { cache[u.username] = entry; result[u.username] = entry; }
            });

            return result;
        } catch (e) {
            console.warn('resolveUserDisplayNames failed (non-fatal)', e);
            return {};
        }
    },

  // List events by program with optional filters
  listEventsByProgram: async ({ programId, orgUnitId, startDate, endDate }) => {
    if (!programId) throw new Error('programId is required');
    let url = `${BASE_URL}/api/events.json?skipPaging=true&fields=event&program=${encodeURIComponent(programId)}`;
    if (orgUnitId) url += `&orgUnit=${encodeURIComponent(orgUnitId)}&ouMode=DESCENDANTS`;
    if (startDate) url += `&startDate=${encodeURIComponent(startDate)}`;
    if (endDate) url += `&endDate=${encodeURIComponent(endDate)}`;
    const resp = await fetch(url, { headers: getHeaders() });
    if (!resp.ok) throw new Error(`Failed to list events (${resp.status})`);
    const json = await resp.json().catch(() => ({}));
    const events = json?.events || json?.instances || [];
    return events.map(e => e.event).filter(Boolean);
  },

  // List events by program across multiple org units (merged unique IDs)
  listEventsByProgramMultiOrgUnits: async ({ programId, orgUnitIds = [], startDate, endDate }) => {
    const ids = new Set();
    const arr = Array.isArray(orgUnitIds) ? orgUnitIds.filter(Boolean) : [];
    if (arr.length === 0) {
      // Fallback to no OU filter (entire program)
      const all = await api.listEventsByProgram({ programId, startDate, endDate });
      all.forEach(id => ids.add(id));
      return Array.from(ids);
    }
    // Fetch in parallel (cap concurrency if needed later)
    await Promise.all(arr.map(async (ou) => {
      try {
        const subset = await api.listEventsByProgram({ programId, orgUnitId: ou, startDate, endDate });
        subset.forEach(id => ids.add(id));
      } catch (_) { /* ignore one OU failure */ }
    }));
    return Array.from(ids);
  },

  // Delete many events by IDs in batches
  deleteEventsByIds: async (ids, { batchSize = 100 } = {}) => {
    const arr = Array.isArray(ids) ? ids : [];
    let deleted = 0;
    for (let i = 0; i < arr.length; i += batchSize) {
      const slice = arr.slice(i, i + batchSize);
      await Promise.all(slice.map(async (id) => {
        try {
          const resp = await fetch(`${BASE_URL}/api/events/${encodeURIComponent(id)}`, { method: 'DELETE', headers: getHeaders() });
          if (resp.ok) deleted += 1;
        } catch (_) { /* ignore a single failure and continue */ }
      }));
    }
    return { total: arr.length, deleted };
  },

  // DataStore helpers -------------------------------------------------------
  upsertDataStoreItem: async (namespace, key, valueObj) => {
    if (!namespace || !key) throw new Error('DataStore upsert requires namespace and key');
    const url = `${BASE_URL}/api/dataStore/${encodeURIComponent(namespace)}/${encodeURIComponent(key)}`;
    const headers = getHeaders();
    // Try PUT (works as upsert on newer DHIS2). If fails 404, try POST.
    let resp = await fetch(url, { method: 'PUT', headers, body: JSON.stringify(valueObj) });
    if (resp.ok) return 'OK';
    if (resp.status === 404) {
      resp = await fetch(url, { method: 'POST', headers, body: JSON.stringify(valueObj) });
      if (resp.ok) return 'OK';
    }
    const text = await resp.text().catch(() => '');
    throw new Error(`DataStore upsert failed: ${resp.status} ${text}`);
  },

  getDataStoreItem: async (namespace, key) => {
    const url = `${BASE_URL}/api/dataStore/${encodeURIComponent(namespace)}/${encodeURIComponent(key)}`;
    const resp = await fetch(url, { headers: getHeaders() });
    if (!resp.ok) return null;
    return await resp.json().catch(() => null);
  },

  /**
   * PUT data values to a specific DHIS2 event using the supplied user credentials.
   * This does NOT change the current user's session in localStorage – it creates
   * an isolated Basic-Auth request so that DHIS2 records `lastUpdatedBy` as the
   * given user, which is what powers the per-assessor audit trail in the report.
   *
   * @param {Object}  opts
   * @param {string}  opts.eventId    – DHIS2 event UID
   * @param {string}  opts.username   – DHIS2 username of the assessor
   * @param {string}  opts.password   – assessor password
   * @param {string}  opts.programId
   * @param {string}  opts.stageId
   * @param {string}  opts.orgUnitId
   * @param {string}  [opts.teiId]
   * @param {Array}   opts.dataValues – [{ dataElement, value }]
   */
  putEventDataValuesAs: async ({ eventId, username, password, programId, stageId, orgUnitId, teiId, dataValues }) => {
    if (!eventId || !username || !password) throw new Error('putEventDataValuesAs: eventId, username and password are required');
    const DE_FACILITY_TEI_ID = 'BKs2OwTxyYa';
    const url = `${BASE_URL}/api/events/${encodeURIComponent(eventId)}/${DE_FACILITY_TEI_ID}`;
    const body = {
      event: eventId,
      orgUnit: orgUnitId,
      program: programId || 'G2gULe4jsfs',
      programStage: stageId || 'HpHD6u6MV37',
      status: 'ACTIVE',
      ...(teiId ? { trackedEntityInstance: teiId } : {}),
      dataValues: (dataValues || []).map(dv => ({ ...dv, providedElsewhere: false })),
    };
    const headers = getHeaders(username, password);
    const resp = await fetch(url, { method: 'PUT', headers, body: JSON.stringify(body) });
    if (!resp.ok) {
      const txt = await resp.text().catch(() => '');
      throw new Error(`putEventDataValuesAs(${username}→${eventId}) failed: ${resp.status} ${txt?.slice(0, 300)}`);
    }
    return { ok: true, eventId, username };
  },

  // Search organisation units by display name (case-insensitive LIKE)
  searchOrganisationUnits: async (query, { max = 20 } = {}) => {
    const q = String(query || '').trim();
    if (!q) return [];
    const url = `${BASE_URL}/api/organisationUnits.json?paging=false&fields=id,displayName,level,parent[id,displayName]&filter=displayName:ilike:${encodeURIComponent(q)}&pageSize=${max}`;
    const resp = await fetch(url, { headers: getHeaders() });
    if (!resp.ok) return [];
    const json = await resp.json().catch(() => ({}));
    return json?.organisationUnits || json?.rows || [];
  },

  // Get a single OU by id
  getOrganisationUnit: async (id) => {
    if (!id) return null;
    const resp = await fetch(`${BASE_URL}/api/organisationUnits/${encodeURIComponent(id)}.json?fields=id,displayName,level,parent[id,displayName]`, { headers: getHeaders() });
    if (!resp.ok) return null;
    return await resp.json().catch(() => null);
  },

    getCurrentUser: async () => {
        const response = await fetch(`${BASE_URL}/api/me?fields=id,displayName,username,organisationUnits[id,name]`, {
            headers: getHeaders()
        });
        if (!response.ok) throw new Error('Failed to get user');
        return await response.json();
    },

    getFormMetadata: async (programStageId = 'HpHD6u6MV37') => {
        const params = [
            // Include program + its trackedEntityType so we can use them when
            // submitting tracker payloads (TEI + enrollment + event).
            'fields=id,name,displayName,description,sortOrder,repeatable,program[id,displayName,trackedEntityType[id,displayName]]',
            'programStageSections[id,name,displayName,code,sortOrder,dataElements[id,formName,displayFormName,name,displayName,shortName,code,description,valueType,compulsory,allowProvidedElsewhere,lastUpdated,optionSet[id,displayName,options[id,displayName,code,sortOrder]]]]',
            'programStageDataElements[id,displayName,sortOrder,compulsory,allowProvidedElsewhere,dataElement[id,formName,displayFormName,name,displayName,shortName,code,description,valueType,aggregationType,lastUpdated,optionSet[id,displayName,options[id,displayName,code,sortOrder]]]]'
        ].join(',');

        const response = await fetch(`${BASE_URL}/api/programStages/${programStageId}?${params}`, {
            headers: getHeaders()
        });
        if (!response.ok) throw new Error('Failed to load metadata');
        const metadata = await response.json();

        // ── Second-pass: fetch missing data elements ──────────────────────────
        // DHIS2 programStageSections[].dataElements often returns bare {id} refs
        // for DEs that aren't registered in programStageDataElements (e.g. new
        // SURV-MORTUARY / Mortuary sections). Detect and fetch them in one batch.
        try {
            // Build set of IDs already fully resolved via programStageDataElements
            const resolvedIds = new Set(
                (metadata.programStageDataElements || []).map(psde => {
                    const de = psde.dataElement || psde;
                    return de?.id;
                }).filter(Boolean)
            );

            // Collect IDs referenced in sections but NOT resolved yet
            const missingIds = new Set();
            (metadata.programStageSections || []).forEach(section => {
                (section.dataElements || []).forEach(rawDe => {
                    const id = rawDe.id || rawDe.dataElement?.id;
                    // A DE is "missing" if it's not resolved, OR if it was returned
                    // without an optionSet (bare reference)
                    const hasOptionSet = rawDe.optionSet || rawDe.dataElement?.optionSet;
                    if (id && (!resolvedIds.has(id) || !hasOptionSet)) {
                        missingIds.add(id);
                    }
                });
            });

            if (missingIds.size > 0) {
                console.log(`[API] Fetching ${missingIds.size} missing data elements for section hydration...`);
                const deFields = 'id,formName,displayFormName,name,displayName,shortName,code,description,valueType,aggregationType,lastUpdated,optionSet[id,displayName,options[id,displayName,code,sortOrder]]';
                const deResponse = await fetch(
                    `${BASE_URL}/api/dataElements?paging=false&filter=id:in:[${[...missingIds].join(',')}]&fields=${deFields}`,
                    { headers: getHeaders() }
                );

                if (deResponse.ok) {
                    const deData = await deResponse.json();
                    const fetchedDEs = deData.dataElements || [];
                    console.log(`[API] Fetched ${fetchedDEs.length} missing data elements.`);

                    // Merge into programStageDataElements so the transformer sees them
                    if (!metadata.programStageDataElements) metadata.programStageDataElements = [];
                    fetchedDEs.forEach(de => {
                        if (!resolvedIds.has(de.id)) {
                            metadata.programStageDataElements.push({ dataElement: de });
                        } else {
                            // Update existing entry with richer data (has optionSet)
                            const existing = metadata.programStageDataElements.find(
                                psde => (psde.dataElement?.id || psde.id) === de.id
                            );
                            if (existing && !existing.dataElement?.optionSet && de.optionSet) {
                                if (existing.dataElement) existing.dataElement = de;
                                else existing.optionSet = de.optionSet;
                            }
                        }
                    });
                } else {
                    console.warn('[API] Failed to fetch missing data elements:', deResponse.status);
                }
            }
        } catch (err) {
            console.warn('[API] Second-pass DE fetch failed (non-fatal):', err);
        }

        return metadata;
    },


    getAssignments: async (programId = 'G2gULe4jsfs', userId = null) => {
        const fields = [
            'enrollment',
            'trackedEntityInstance',
            'orgUnit',
            'orgUnitName',
            'status',
            'enrollmentDate',
            'incidentDate',
            'attributes[attribute,value]',
            'events[event,eventDate,status,dataValues[dataElement,value]]'
        ].join(',');

        // Attribute UIDs
        const INSPECTOR_LIST_ATTR = 'Rh87cVTZ8b6'; // "Inspection Final List" — contains inspector user IDs
        const FACILITY_ID_ATTR = 'R0e1pnpjkaW'; // "Inspection Facility ID"

        // Build the filter: only enrollments where the inspector list contains this user's ID
        const userFilter = userId ? `&filter=${INSPECTOR_LIST_ATTR}:like:${userId}` : '';

        const response = await fetch(
            `${BASE_URL}/api/enrollments?paging=false&ouMode=ALL&program=${programId}&fields=${fields}${userFilter}`,
            { headers: getHeaders() }
        );
        if (!response.ok) throw new Error('Failed to fetch assignments');
        const data = await response.json();
        const enrollments = data.enrollments || [];

        // 1. Extract all unique org unit IDs to fetch their full details (including parents)
        const ouIds = [...new Set(enrollments.map(e =>
            typeof e.orgUnit === 'string' ? e.orgUnit : e.orgUnit?.id
        ).filter(Boolean))];

        let ouMap = {};
        if (ouIds.length > 0) {
            try {
                // Fetch details for all encountered org units in one request
                // Standard filter syntax: filter=id:in:id1,id2,id3
                const ouResponse = await fetch(
                    `${BASE_URL}/api/organisationUnits?paging=false&filter=id:in:${ouIds.join(',')}&fields=id,displayName,name,level,parent[id,displayName,name,level,parent[id,displayName,name,level]]`,
                    { headers: getHeaders() }
                );
                if (ouResponse.ok) {
                    const ouData = await ouResponse.json();
                    ouData.organisationUnits?.forEach(ou => {
                        ouMap[ou.id] = ou;
                    });
                }
            } catch (err) {
                console.warn('⚠️ api.js: Failed to fetch bulk org unit details, falling back to basic info.', err);
            }
        }

        // 2. Enrich enrollments with full org unit data
        return enrollments.map(enrollment => {
            const rawOu = enrollment.orgUnit;
            const ouId = typeof rawOu === 'string' ? rawOu : (rawOu?.id || null);
            const fullOu = ouMap[ouId];

            const facilityIdAttr = (enrollment.attributes || []).find(
                a => a.attribute === FACILITY_ID_ATTR
            );

            // The facilityId displayed in the UI is either the explicitly assigned attribute
            // or the ID of the organization unit itself.
            const resolvedFacilityId = facilityIdAttr?.value || fullOu?.id || ouId || 'N/A';

            // Calculate parent name with multiple fallbacks
            // District name = one level above the immediate parent (if present),
            // otherwise fall back to the immediate parent name
            const parent = fullOu?.parent;
            const grand = parent?.parent;
            const parentName = grand?.displayName || grand?.name || parent?.displayName || parent?.name || null;

            return {
                ...enrollment,
                // Inject the full org unit object for parent lookups
                orgUnit: fullOu || rawOu,
                // Store a guaranteed string ID for the org unit
                orgUnitId: ouId,
                // Display name prioritized from the bulk fetch
                orgUnitName: fullOu?.displayName || fullOu?.name || enrollment.orgUnitName || 'Unknown Facility',
                facilityId: resolvedFacilityId,
                parentOrgUnitName: parentName
            };
        });
    },

	    /**
	     * Fetch assignments for the External Facility Assessment Scheduling Workflow
	     * (program K9O5fdoBmKf) based on DHIS2 stages and data elements.
	     *
	     * For the logged-in user, return one row per enrollment where BOTH are true:
	     *  1) There is a Team Assignment and Acceptance event (stage UQmvnyPZLk2)
	     *     with:
	     *        - Assigned User ID (AXvpO8KR1Mw) == current user ID
	     *        - Assignment Status (yVVbhT02L6G) == FAC_ASS_ASSIGN_ACCEPTED
	     *  2) There is an Assessment Programme Setup event (stage M2RdEI7Tbqr)
	     *     with:
	     *        - Assessment Program Status (xFQOt5o6DSz) == "Approved".
	     *
	     * No deduplication by facility is done: each qualifying enrollment is
	     * returned as a separate assignment row.
	     */
		    getSchedulingAssignments: async (userId, username) => {
		        if (!userId && !username) throw new Error('getSchedulingAssignments requires a userId or username');

	        // Program and stage IDs
	        const PROGRAM_ID = 'K9O5fdoBmKf';
	        const SETUP_STAGE_ID = 'M2RdEI7Tbqr'; // Assessment Programme Setup
	        const TEAM_STAGE_ID = 'UQmvnyPZLk2';   // Team Assignment and Acceptance

	        // Data element IDs
	        const DE_ASSIGNED_USER_ID = 'AXvpO8KR1Mw';      // Assigned User ID
	        const DE_ASSIGN_STATUS = 'yVVbhT02L6G';        // Assignment Status
	        const DE_PROGRAM_STATUS = 'xFQOt5o6DSz';       // Assessment Program Status
	        const DE_TEAM_ROLE = 'GixEay7pfpl';            // Team Role

	        // Value codes from DHIS2 option sets.
	        const ASSIGN_STATUS_ACCEPTED = 'FAC_ASS_ASSIGN_ACCEPTED';
	        // In K9O5fdoBmKf, "approved" programmes use this status code
	        // on xFQOt5o6DSz (Assessment Program Status).
	        const PROGRAM_STATUS_APPROVED = 'FAC_ASS_PROGRAM_FINAL_CONFIRMED';

	        // 1) Fetch all team-assignment events for this user where assignment
	        //    status is FAC_ASS_ASSIGN_ACCEPTED.
	        const teamFields = [
	            'event',
	            'enrollment',
		            'trackedEntity',
	            'orgUnit',
	            'orgUnitName',
	            'programStage',
		            // Tracker API uses occurredAt for the event date; keep both
		            // sides happy by requesting occurredAt and mapping to
		            // eventDate further down.
		            'occurredAt',
			            // Optional Tracker fields that can be useful for
			            // scheduling/debugging but are not required by the UI.
			            'scheduledAt',
			            'updatedAt',
	            'status',
	            'dataValues[dataElement,value]'
	        ].join(',');
		
		        // Lightweight debug log of DHIS2 calls made while resolving
		        // scheduling assignments so the Dashboard can surface them.
		        const debugRequests = [];
		
		        const teamEvents = [];
		        const seenEventIds = new Set();
		        const idValues = [];
		        if (userId) idValues.push(userId);
		        if (username && username !== userId) idValues.push(username);
			
		        for (const idVal of idValues) {
		            const teamUrl = `${BASE_URL}/api/tracker/events.json?paging=false&ouMode=ALL&program=${PROGRAM_ID}` +
		                `&programStage=${TEAM_STAGE_ID}&fields=${teamFields}` +
		                // Filter by Assigned User ID value (may be DHIS2 user id or username).
		                // Use LIKE instead of EQ so we still match when the
		                // scheduler stores additional context around the ID
		                // (e.g. "uid|username" or similar composite values).
		                `&filter=${DE_ASSIGNED_USER_ID}:LIKE:${encodeURIComponent(idVal)}`;
		
		            const teamResponse = await fetch(teamUrl, { headers: getHeaders() });
		            if (!teamResponse.ok) {
		                debugRequests.push({
		                    kind: 'teamEvents',
		                    path: teamUrl.replace(BASE_URL, ''),
		                    filter: idVal,
		                    status: teamResponse.status,
		                    ok: false,
		                    count: 0,
		                });
		                throw new Error('Failed to fetch team assignment events');
		            }
		            const teamData = await teamResponse.json();
		            // Tracker API returns "instances" for collections; fall back to
		            // legacy "events" for safety in case of mixed environments.
		            const events = teamData.instances || teamData.events || [];
		            events.forEach(ev => {
		                if (!seenEventIds.has(ev.event)) {
		                    seenEventIds.add(ev.event);
		                    teamEvents.push(ev);
		                }
		            });
		            debugRequests.push({
		                kind: 'teamEvents',
		                path: teamUrl.replace(BASE_URL, ''),
		                filter: idVal,
		                status: teamResponse.status,
		                ok: true,
		                count: events.length,
		            });
		        }
		        console.log('[SchedulingAssignments] teamEvents count for user', userId || username, teamEvents.length);
		
		        // Initialize debug snapshot early so the UI can see at least
		        // the teamEvents count even when we return early.
		        api._schedulingDebug = {
		            userId,
		            username,
		            teamEventsCount: teamEvents.length,
		            enrollmentIds: [],
		            enrollmentsCount: 0,
		            qualifyingCount: 0,
		            requests: debugRequests,
		        };

		        if (teamEvents.length === 0) {
		            return [];
		        }

        // Group team events by enrollment and collect enrollment IDs
	        const teamByEnrollment = {};
	        const enrollmentIds = new Set();
	        for (const ev of teamEvents) {
	            const enr = ev.enrollment;
	            if (!enr) continue;
	            enrollmentIds.add(enr);
	            if (!teamByEnrollment[enr]) teamByEnrollment[enr] = [];
	            teamByEnrollment[enr].push(ev);
	        }

		        if (enrollmentIds.size === 0) {
		            api._schedulingDebug = {
		                ...api._schedulingDebug,
		                enrollmentIds: [],
		                enrollmentsCount: 0,
		                qualifyingCount: 0,
		            };
		            return [];
		        }

        // Phase 2: Enrich teamByEnrollment with ALL team members for each
        // enrollment (remove the Assigned User ID filter). This ensures the UI
        // can display the full team, not just the current user's row.
        try {
            for (const enrId of enrollmentIds) {
                const allTeamUrl = `${BASE_URL}/api/tracker/events.json?paging=false&program=${PROGRAM_ID}` +
                    `&programStage=${TEAM_STAGE_ID}&fields=${teamFields}&enrollment=${encodeURIComponent(enrId)}`;
                const resp = await fetch(allTeamUrl, { headers: getHeaders() });
                if (!resp.ok) {
                    debugRequests.push({ kind: 'teamEventsAll', path: allTeamUrl.replace(BASE_URL, ''), status: resp.status, ok: false, enrollment: enrId });
                    continue;
                }
                const json = await resp.json();
                const events = (json?.instances || json?.events || []);
                debugRequests.push({ kind: 'teamEventsAll', path: allTeamUrl.replace(BASE_URL, ''), status: resp.status, ok: true, count: events.length, enrollment: enrId });
                for (const ev of events) {
                    if (!ev || !ev.event) continue;
                    if (seenEventIds.has(ev.event)) continue; // skip duplicates we already pulled for current user
                    seenEventIds.add(ev.event);
                    const enr = ev.enrollment || enrId;
                    if (!teamByEnrollment[enr]) teamByEnrollment[enr] = [];
                    teamByEnrollment[enr].push(ev);
                }
            }
        } catch (err) {
            console.warn('⚠️ api.js: Failed to enrich full team membership for enrollments', err);
            debugRequests.push({ kind: 'teamEventsAll', status: 'ERR', ok: false });
        }

	        // 2) Fetch enrollments with events so we can check programme setup
	        // 2) Build lightweight "enrollment-like" objects directly from the
	        //    team events. This avoids relying on embedded events within
	        //    enrollments, which may not be visible to all users, and is
	        //    sufficient for displaying assigned facilities.
	        const enrollments = [...enrollmentIds].map(enrId => {
	            const evts = teamByEnrollment[enrId] || [];
	            const primary = evts[0] || {};
	            return {
	                enrollment: enrId,
		                // trackedEntityInstance will be hydrated from a lightweight
		                // /enrollments call below so that the UI can auto-populate
		                // the "Facility Assessment TEI ID" field when a user
		                // opens an assigned assessment.
		                trackedEntityInstance: null,
		                orgUnit: primary.orgUnit || null,
		                orgUnitName: primary.orgUnitName || null,
			                status: primary.status || 'ACTIVE',
			                // Prefer Tracker's occurredAt for dating the assignment,
			                // but fall back to legacy eventDate if present.
			                enrollmentDate: primary.occurredAt || primary.eventDate || new Date().toISOString(),
			                incidentDate: primary.occurredAt || primary.eventDate || new Date().toISOString(),
			                // Surface Tracker scheduling / audit timestamps from the
			                // primary team event so downstream services can use them
			                // if needed.
			                scheduledAt: primary.scheduledAt || null,
			                updatedAt: primary.updatedAt || null,
	                events: evts,
	            };
	        });
	        console.log('[SchedulingAssignments] synthetic enrollments from team events', enrollments.length);

	        // 2b) Hydrate trackedEntityInstance for each enrollment from a
	        //     minimal /enrollments call. Inspector users are allowed to
	        //     view enrollments (but not necessarily embedded events),
	        //     and we only need the TEI ID plus the *program-level orgUnit*
	        //     (the enrollment's orgUnit, typically a district like
	        //     "Gaborone"). This lets the UI submit surveys against the
	        //     correct orgUnit for the main survey program while still
	        //     displaying the facility orgUnit from the team events.
		        try {
		            const enrFieldsTei = ['enrollment', 'trackedEntityInstance', 'orgUnit'].join(',');
			            const enrParamsTei = [...enrollmentIds].map(id => `enrollment=${id}`).join('&');
			            const enrUrlTei = `${BASE_URL}/api/enrollments?paging=false&program=${PROGRAM_ID}&fields=${enrFieldsTei}&${enrParamsTei}`;
			            const enrRespTei = await fetch(enrUrlTei, { headers: getHeaders() });
		            if (enrRespTei.ok) {
	                const enrJson = await enrRespTei.json();
	                const teiByEnrollment = {};
	                const progOuByEnrollment = {};
	                (enrJson.enrollments || []).forEach(enr => {
	                    if (!enr.enrollment) return;
	                    if (enr.trackedEntityInstance) {
	                        teiByEnrollment[enr.enrollment] = enr.trackedEntityInstance;
	                    }
	                    if (enr.orgUnit) {
	                        progOuByEnrollment[enr.enrollment] =
	                            typeof enr.orgUnit === 'string' ? enr.orgUnit : (enr.orgUnit.id || null);
	                    }
	                });
		                enrollments.forEach(e => {
	                    const enrId = e.enrollment;
	                    if (!e.trackedEntityInstance && teiByEnrollment[enrId]) {
	                        e.trackedEntityInstance = teiByEnrollment[enrId];
	                    }
	                    if (progOuByEnrollment[enrId]) {
	                        // programOrgUnitId: org unit attached to the scheduling
	                        // enrollment (e.g. district). We submit the main survey
	                        // program against this OU to satisfy DHIS2 program
	                        // assignment rules.
	                        e.programOrgUnitId = progOuByEnrollment[enrId];
	                    }
	                });
		                const hydratedCount = Object.keys(teiByEnrollment).length;
		                console.log('[SchedulingAssignments] hydrated TEIs and programme orgUnits for enrollments', hydratedCount);
		                debugRequests.push({
		                    kind: 'enrollmentsTei',
		                    path: enrUrlTei.replace(BASE_URL, ''),
		                    status: enrRespTei.status,
		                    ok: true,
		                    count: hydratedCount,
		                });
		            } else {
		                console.warn('⚠️ api.js: Failed to hydrate TEIs for scheduling enrollments', enrRespTei.status, enrRespTei.statusText);
		                debugRequests.push({
		                    kind: 'enrollmentsTei',
		                    path: enrUrlTei.replace(BASE_URL, ''),
		                    status: enrRespTei.status,
		                    ok: false,
		                    count: 0,
		                });
		            }
		        } catch (err) {
		            console.warn('⚠️ api.js: Error hydrating TEIs for scheduling enrollments', err);
		            debugRequests.push({
		                kind: 'enrollmentsTei',
		                path: '/api/enrollments',
		                status: 'ERR',
		                ok: false,
		                count: 0,
		            });
		        }

		        // 2c) Fallback: For any remaining enrollments without a TEI,
		        //     use the Tracker enrollments endpoint
		        //     /api/tracker/enrollments/{id}.json to resolve trackedEntity.
		        const missingTeiEnrollments = enrollments.filter(e => !e.trackedEntityInstance && e.enrollment);
		        if (missingTeiEnrollments.length > 0) {
		            const trackerPromises = missingTeiEnrollments.map(async e => {
		                const enrId = e.enrollment;
		                const trackerUrl = `${BASE_URL}/api/tracker/enrollments/${enrId}.json?fields=enrollment,trackedEntity,orgUnit`;
		                try {
		                    const resp = await fetch(trackerUrl, { headers: getHeaders() });
		                    if (!resp.ok) {
		                        debugRequests.push({
		                            kind: 'enrollmentsTeiTracker',
		                            path: trackerUrl.replace(BASE_URL, ''),
		                            status: resp.status,
		                            ok: false,
		                            count: 0,
		                        });
		                        return;
		                    }
		                    const trackerEnr = await resp.json();
		                    const teiId = trackerEnr.trackedEntity || trackerEnr.trackedEntityInstance || trackerEnr.trackedEntityId;
		                    if (teiId && !e.trackedEntityInstance) {
		                        e.trackedEntityInstance = teiId;
		                    }
		                    if (trackerEnr.orgUnit) {
		                        e.programOrgUnitId =
		                            typeof trackerEnr.orgUnit === 'string'
		                                ? trackerEnr.orgUnit
		                                : (trackerEnr.orgUnit.id || e.programOrgUnitId || null);
		                    }
		                    debugRequests.push({
		                        kind: 'enrollmentsTeiTracker',
		                        path: trackerUrl.replace(BASE_URL, ''),
		                        status: resp.status,
		                        ok: true,
		                        count: 1,
		                    });
		                } catch (err) {
		                    console.warn('⚠️ api.js: Error hydrating TEI via Tracker enrollment', err);
		                    debugRequests.push({
		                        kind: 'enrollmentsTeiTracker',
		                        path: trackerUrl.replace(BASE_URL, ''),
		                        status: 'ERR',
		                        ok: false,
		                        count: 0,
		                    });
		                }
		            });
		            await Promise.all(trackerPromises);
		        }

	        // 3) Fetch Programme Setup events separately (event-level join by enrollment)
	        const setupFields = [
	            'event',
	            'enrollment',
	            'orgUnit',
	            'orgUnitName',
	            'eventDate',
	            'status',
	            'dataValues[dataElement,value]'
	        ].join(',');

		        const setupParams = [...enrollmentIds].map(id => `enrollment=${id}`).join('&');
		        const setupUrl = `${BASE_URL}/api/events?paging=false&program=${PROGRAM_ID}` +
		            `&programStage=${SETUP_STAGE_ID}&fields=${setupFields}&${setupParams}`;
		
		        const setupResponse = await fetch(setupUrl, { headers: getHeaders() });
		        if (!setupResponse.ok) {
		            debugRequests.push({
		                kind: 'setupEvents',
		                path: setupUrl.replace(BASE_URL, ''),
		                status: setupResponse.status,
		                ok: false,
		                count: 0,
		            });
		            throw new Error('Failed to fetch programme setup events');
		        }
		        const setupData = await setupResponse.json();
		        const setupEvents = setupData.events || [];
		        console.log('[SchedulingAssignments] setup events fetched', setupEvents.length);
		        debugRequests.push({
		            kind: 'setupEvents',
		            path: setupUrl.replace(BASE_URL, ''),
		            status: setupResponse.status,
		            ok: true,
		            count: setupEvents.length,
		        });

	        // Index setup events by enrollment, taking the latest event per enrollment
	        const setupByEnrollment = {};
	        for (const ev of setupEvents) {
	            const enr = ev.enrollment;
	            if (!enr) continue;
	            if (!setupByEnrollment[enr]) setupByEnrollment[enr] = [];
	            setupByEnrollment[enr].push(ev);
	        }

	        const pickLatestSetupEvent = (enrId) => {
	            const list = setupByEnrollment[enrId];
	            if (!list || list.length === 0) return null;
	            return list.slice().sort((a, b) => new Date(b.eventDate) - new Date(a.eventDate))[0];
	        };

	        // 4) NEW: For now, treat all enrollments that have team events as
	        //    "assigned" regardless of programme status. We still attach
	        //    programmeStatus from setup events when available, but we don't
	        //    filter by it.
	        const qualifying = enrollments;

	        console.log('[SchedulingAssignments] qualifying enrollments (no status filter)', qualifying.length);

		        // Expose a small debug snapshot for the UI/debug tools
		        api._schedulingDebug = {
		            userId,
		            username,
		            teamEventsCount: teamEvents.length,
		            enrollmentIds: [...enrollmentIds],
		            enrollmentsCount: enrollments.length,
		            qualifyingCount: qualifying.length,
		            requests: debugRequests,
		        };

	        if (qualifying.length === 0) {
	            return [];
	        }

	        // 5) Enrich org unit details based on the facility org unit from team
	        //    events (rather than the enrollment org unit, which may be a
	        //    district/administrative level).
	        const ouIds = [...new Set(qualifying.map(e => {
	            const teamEvts = teamByEnrollment[e.enrollment] || [];
	            const firstTeam = teamEvts[0];
	            if (firstTeam && firstTeam.orgUnit) return firstTeam.orgUnit;
	            const rawOu = e.orgUnit;
	            return typeof rawOu === 'string' ? rawOu : rawOu?.id;
	        }).filter(Boolean))];

		        let ouMap = {};
		        if (ouIds.length > 0) {
		            try {
                const ouUrl = `${BASE_URL}/api/organisationUnits?paging=false&filter=id:in:[${ouIds.join(',')}]` +
                    `&fields=id,displayName,name,level,parent[id,displayName,name,level,parent[id,displayName,name,level]]`;
		                const ouResponse = await fetch(
		                    ouUrl,
		                    { headers: getHeaders() }
		                );
		                if (ouResponse.ok) {
		                    const ouJson = await ouResponse.json();
		                    (ouJson.organisationUnits || []).forEach(ou => {
		                        ouMap[ou.id] = ou;
		                    });
		                    debugRequests.push({
		                        kind: 'organisationUnits',
		                        path: ouUrl.replace(BASE_URL, ''),
		                        status: ouResponse.status,
		                        ok: true,
		                        count: (ouJson.organisationUnits || []).length,
		                    });
		                } else {
		                    debugRequests.push({
		                        kind: 'organisationUnits',
		                        path: ouUrl.replace(BASE_URL, ''),
		                        status: ouResponse.status,
		                        ok: false,
		                        count: 0,
		                    });
		                }
		            } catch (err) {
		                console.warn('⚠️ api.js: Failed to fetch bulk org unit details for scheduling assignments.', err);
		                debugRequests.push({
		                    kind: 'organisationUnits',
		                    path: '/api/organisationUnits',
		                    status: 'ERR',
		                    ok: false,
		                    count: 0,
		                });
		            }
		        }

	        // Helper to extract team info from team events
	        const buildTeamForEnrollment = (enrId) => {
	            const evts = teamByEnrollment[enrId] || [];
	            return evts.map(ev => {
	                const dvs = ev.dataValues || [];
	                const userDv = dvs.find(d => d.dataElement === DE_ASSIGNED_USER_ID);
	                const statusDv = dvs.find(d => d.dataElement === DE_ASSIGN_STATUS);
	                const roleDv = dvs.find(d => d.dataElement === DE_TEAM_ROLE);
	                return {
	                    event: ev.event,
	                    assignedUserId: userDv?.value || null,
	                    assignmentStatus: statusDv?.value || null,
	                    teamRole: roleDv?.value || null,
		                    // Map Tracker's occurredAt back to eventDate to keep
		                    // the rest of the app API-compatible.
		                    eventDate: ev.occurredAt || ev.eventDate || null,
			                    // Expose Tracker scheduling / audit timestamps for
			                    // debugging or future UI enhancements.
			                    scheduledAt: ev.scheduledAt || null,
			                    updatedAt: ev.updatedAt || null,
	                    orgUnit: ev.orgUnit || null,
	                    orgUnitName: ev.orgUnitName || null
	                };
	            });
	        };

	        // 6) Map to assignment objects (one per enrollment, no deduplication)
	        return qualifying.map(enrollment => {
	            const enrId = enrollment.enrollment;
	            const teamEvts = teamByEnrollment[enrId] || [];
	            const firstTeam = teamEvts[0] || null;

	            const rawOu = firstTeam?.orgUnit || enrollment.orgUnit;
	            const ouId = typeof rawOu === 'string' ? rawOu : (rawOu?.id || null);
	            const fullOu = ouMap[ouId];

            const parent = fullOu?.parent;
            const grand = parent?.parent;
            const parentName = grand?.displayName || grand?.name || parent?.displayName || parent?.name || null;

	            const setupEvent = pickLatestSetupEvent(enrId);
	            const setupDv = setupEvent?.dataValues?.find(d => d.dataElement === DE_PROGRAM_STATUS) || null;
	            const programmeStatus = setupDv?.value || null;

	            return {
	                ...enrollment,
	                program: PROGRAM_ID,
	                orgUnit: fullOu || rawOu,
	                orgUnitId: ouId,
	                // programOrgUnitId is the orgUnit attached to the underlying
	                // scheduling enrollment (often a district like Gaborone).
	                // We use this when submitting the main survey program
	                // (G2gULe4jsfs) so that DHIS2 does not reject the
	                // enrollment with "OrganisationUnit and Program don't match".
	                programOrgUnitId: enrollment.programOrgUnitId || ouId,
	                orgUnitName: fullOu?.displayName || fullOu?.name || firstTeam?.orgUnitName || enrollment.orgUnitName || 'Unknown Facility',
	                parentOrgUnitName: parentName,
		                setupEventId: setupEvent?.event || null,
		                setupEventDataValues: Array.isArray(setupEvent?.dataValues) ? setupEvent.dataValues : [],
	                programmeStatus,
	                team: buildTeamForEnrollment(enrId)
	            };
	        });
	    },

    getTrackedEntityInstances: async (teiIds) => {
        if (!teiIds || teiIds.length === 0) return [];
        const response = await fetch(`${BASE_URL}/api/trackedEntityInstances?trackedEntityInstance=${teiIds.join(';')}&fields=*`, {
            headers: getHeaders()
        });
        if (!response.ok) throw new Error('Failed to fetch TEIs');
        return await response.json();
    },

    getFacilityDetails: async (facilityId) => {
        const response = await fetch(`${BASE_URL}/api/organisationUnits/${facilityId}?fields=id,displayName,openingDate,closedDate,comment,attributeValues`, {
            headers: getHeaders()
        });
        if (!response.ok) throw new Error('Failed to fetch facility details');
        return await response.json();
    },

    // Fetch a simple list of events for a given filter (helper)
    getEventsList: async ({
        programId,
        stageId,
        teiId,
        enrollmentId,
        orgUnitId,
        ouMode = 'SELECTED',
        order = 'eventDate:desc',
        fields = 'event,eventDate,status,program,programStage,orgUnit,trackedEntityInstance'
    }) => {
        const params = [
            'paging=false',
            programId ? `program=${programId}` : null,
            stageId ? `programStage=${stageId}` : null,
            teiId ? `trackedEntityInstance=${teiId}` : null,
            enrollmentId ? `enrollment=${enrollmentId}` : null,
            orgUnitId ? `orgUnit=${orgUnitId}` : null,
            orgUnitId ? `ouMode=${ouMode}` : null,
            order ? `order=${order}` : null,
            fields ? `fields=${fields}` : null
        ].filter(Boolean).join('&');
        const url = `${BASE_URL}/api/events?${params}`;
        const resp = await fetch(url, { headers: getHeaders() });
        if (!resp.ok) throw new Error(`Failed to fetch events list: ${resp.status}`);
        const data = await resp.json();
        return data.events || [];
    },

    // Fetch Programme Setup events for a scheduling enrollment (K9O5fdoBmKf / M2RdEI7Tbqr)
    getSetupEventsForEnrollment: async (enrollmentId) => {
        if (!enrollmentId) return [];
        const PROGRAM_ID = 'K9O5fdoBmKf';
        const STAGE_ID = 'M2RdEI7Tbqr';
        return await api.getEventsList({
            programId: PROGRAM_ID,
            stageId: STAGE_ID,
            enrollmentId,
            order: 'eventDate:desc',
            fields: 'event,eventDate,status'
        });
    },

    // Fetch main survey events for a TEI in the target program/stage
    getSurveyEventsForTei: async ({ teiId, orgUnitId, programId = 'G2gULe4jsfs', stageId = 'HpHD6u6MV37',
        fields = 'event,eventDate,status,trackedEntityInstance,dataValues[dataElement,value]' }) => {
        if (!teiId) return [];
        return await api.getEventsList({
            programId,
            stageId,
            teiId,
            orgUnitId,
            ouMode: 'DESCENDANTS',
            order: 'eventDate:desc',
            fields
        });
    },

    // Resolve the baseline Assessment Group value (DE pzenrgsSny3) from the earliest
    // event for this TEI/program/stage (scoped to orgUnit when provided).
    getBaselineAssessmentGroup: async ({ teiId, orgUnitId, programId = 'G2gULe4jsfs', stageId = 'HpHD6u6MV37' }) => {
        if (!teiId) return null;
        try {
            const events = await api.getEventsList({
                programId,
                stageId,
                teiId,
                orgUnitId,
                ouMode: 'DESCENDANTS',
                order: 'eventDate:asc',
                fields: 'event,eventDate,status,dataValues[dataElement,value]'
            });
            if (!Array.isArray(events) || events.length === 0) return null;
            const baseline = events[0];
            const dv = (baseline.dataValues || []).find(d => d.dataElement === 'pzenrgsSny3');
            return dv?.value || null;
        } catch (e) {
            console.warn('getBaselineAssessmentGroup failed (non-fatal)', e);
            return null;
        }
    },

    /**
     * Formats form data into DHIS2 data values.
     */
    formatDataValues: (formData) => {
        return Object.entries(formData)
            .filter(([key, value]) => {
                if (key.startsWith('is_critical_')) return false;
                if (key.endsWith('_internal')) return false;
                // Local UI-only flags for manual root overrides
                if (key.startsWith('override_')) return false;
	                // SE narrative summaries are stored as event comments/notes,
	                // not as data elements.
	                if (key.startsWith('se_summary_')) return false;
                if (key === 'scoringSnapshot') return false;
                return value !== undefined && value !== null && value !== '';
            })
            .map(([dataElement, value]) => ({
                dataElement,
                value: String(value)
            }));
    },

    /**
     * Find the latest event ID for a TEI in a given program/stage (optionally constrained to orgUnit).
     * Returns the newest event's UID or null if none found.
     */
    getLatestSurveyEventId: async ({ programId = 'G2gULe4jsfs', stageId = 'HpHD6u6MV37', teiId, orgUnitId }) => {
        const fields = 'event,eventDate,lastUpdated,status,program,programStage,orgUnit,trackedEntityInstance';
        const params = [
            `paging=false`,
            `program=${encodeURIComponent(programId)}`,
            `programStage=${encodeURIComponent(stageId)}`,
            teiId ? `trackedEntityInstance=${encodeURIComponent(teiId)}` : null,
            orgUnitId ? `orgUnit=${encodeURIComponent(orgUnitId)}` : null,
            orgUnitId ? `ouMode=SELECTED` : null,
            `order=lastUpdated:desc`,
            `fields=${fields}`
        ].filter(Boolean).join('&');

        const url = `${BASE_URL}/api/events?${params}`;
        const response = await fetch(url, { headers: getHeaders() });
        if (!response.ok) {
            const text = await response.text().catch(() => '');
            throw new Error(`Failed to fetch latest survey event: ${response.status} ${text}`);
        }
        const data = await response.json();
        const events = data.events || [];
        return events.length > 0 ? events[0].event : null;
    },

    /**
     * Alternate save path: Update a single Event via Events API using PUT
     * to /api/events/{eventId}/{dataElementId} with a full event body.
     *
     * Contract requested by client:
     *   URL:   /qims/api/events/EVENT_ID/BKs2OwTxyYa
     *   Method: PUT
     *   Body:  {
     *            event, orgUnit, program, programStage, status,
     *            trackedEntityInstance, dataValues[{ dataElement,value,providedElsewhere:false }]
     *          }
     */
    submitEventPut: async (formData, configuration, orgUnitId) => {
        // Delegate to batched to ensure split-event routing works universally
        return await api.submitEventPutBatched(formData, configuration, orgUnitId);
    },

  /**
   * submitEventPutBatched
   * Same as submitEventPut, but splits dataValues into multiple smaller PUTs
   * to avoid gateway/proxy timeouts when sending very large payloads.
   * Options: { batchSize?: number, interChunkDelayMs?: number }
   */
  submitEventPutBatched: async (formData, configuration, orgUnitId, opts = {}) => {
    const PROGRAM_ID = configuration?.program?.id || 'G2gULe4jsfs';
    const STAGE_ID = configuration?.programStage?.id || 'HpHD6u6MV37';
    const DE_FACILITY_TEI_ID = 'BKs2OwTxyYa';
    const batchSize = Math.max(50, Math.min(400, Number(opts.batchSize || 150))); // sane bounds
    const interDelay = Math.max(0, Number(opts.interChunkDelayMs || 50));

    const baseEventId = formData.eventId_internal || formData.event || formData.eventId;
    if (!baseEventId) throw new Error('Missing DHIS2 event ID (eventId_internal) required for PUT batching');
    const teiId = formData.teiId_internal || null;

    let eventIdMap = {};
    try {
        if (formData.eventIdMap_internal) {
            eventIdMap = JSON.parse(formData.eventIdMap_internal);
        }
    } catch(e) {}

    // Build dataElement -> eventId mapping based on sections
    const deToEventMap = {};
    if (Object.keys(eventIdMap).length > 0 && configuration?.programStage?.programStageSections) {
        configuration.programStage.programStageSections.forEach(sec => {
            const secName = (sec.displayName || sec.name || '').toLowerCase();
            let tag = '';
            if (secName.includes('assessment details') || secName.includes('assessment_details')) {
                tag = 'FINAL';
            } else {
                // Match "SE 1" or "SE1"
                const match = secName.match(/se\s*(\d+)/i);
                if (match) tag = match[1];
            }
            if (tag && eventIdMap[tag]) {
                const elements = sec.dataElements || sec.programStageDataElements || [];
                elements.forEach(rawDe => {
                    const deId = rawDe.id || (rawDe.dataElement ? rawDe.dataElement.id : (typeof rawDe === 'string' ? rawDe : null));
                    if (deId) deToEventMap[deId] = eventIdMap[tag];
                });
            }
        });
    }

    // Notes: convert SE summaries to DHIS2 notes once (attach on last chunk of their respective events later, or fallback to base)
    const seSummaryNotes = Object.entries(formData || {})
      .filter(([k, v]) => k.startsWith('se_summary_') && v !== undefined && v !== null && String(v).trim() !== '')
      .map(([k, v]) => ({ value: `SE summary (${k.replace('se_summary_', '') || 'unknown-section'}): ${String(v).trim()}` }));

    // Build all DVs once
    const baseDvs = api.formatDataValues(formData).map(dv => ({ ...dv, providedElsewhere: false }));
    
    // Ensure TEI mapping DE is present
    if (teiId) {
      const idx = baseDvs.findIndex(d => d.dataElement === DE_FACILITY_TEI_ID);
      const teiDv = { dataElement: DE_FACILITY_TEI_ID, value: String(teiId), providedElsewhere: false };
      if (idx >= 0) baseDvs[idx] = teiDv; else baseDvs.unshift(teiDv);
    }

    // Align Assessment Group from baseline (add/replace once)
    try {
      if (teiId) {
        const baselineGroup = await api.getBaselineAssessmentGroup({ teiId, orgUnitId, programId: PROGRAM_ID, stageId: STAGE_ID });
        if (baselineGroup && String(baselineGroup).trim() !== '') {
          const AG_DE = 'pzenrgsSny3';
          const idxAg = baseDvs.findIndex(d => d.dataElement === AG_DE);
          const agDv = { dataElement: AG_DE, value: String(baselineGroup), providedElsewhere: false };
          if (idxAg >= 0) baseDvs[idxAg] = agDv; else baseDvs.push(agDv);
        }
      }
    } catch (e) {
      console.warn('submitEventPutBatched: could not align Assessment Group (non-fatal)', e);
    }

    // Group DVs by target event
    const eventsToUpdate = {}; // { [eventId]: [dv1, dv2] }
    
    baseDvs.forEach(dv => {
        let targetEventId = baseEventId; // Fallback to main/final event
        if (Object.keys(deToEventMap).length > 0) {
            targetEventId = deToEventMap[dv.dataElement] || eventIdMap['FINAL'] || baseEventId;
        }
        if (!eventsToUpdate[targetEventId]) eventsToUpdate[targetEventId] = [];
        eventsToUpdate[targetEventId].push(dv);
    });

    const baseBody = {
      orgUnit: orgUnitId,
      program: PROGRAM_ID,
      programStage: STAGE_ID,
      status: 'COMPLETED',
      ...(teiId ? { trackedEntityInstance: teiId } : {}),
    };

    let totalSuccessCount = 0;
    
    for (const [targetEventId, eventDvs] of Object.entries(eventsToUpdate)) {
        // Chunk dataValues for this specific event
        const chunks = [];
        for (let i = 0; i < eventDvs.length; i += batchSize) {
          chunks.push(eventDvs.slice(i, i + batchSize));
        }

        const url = `${BASE_URL}/api/events/${encodeURIComponent(targetEventId)}/${DE_FACILITY_TEI_ID}`;
        
        for (let ci = 0; ci < chunks.length; ci++) {
          const body = {
            ...baseBody,
            event: targetEventId,
            dataValues: chunks[ci],
            // Attach notes only to the FINAL event, on its last chunk
            ...(ci === chunks.length - 1 && seSummaryNotes.length > 0 && (targetEventId === baseEventId || targetEventId === eventIdMap['FINAL']) ? { notes: seSummaryNotes } : {}),
          };
          const resp = await fetch(url, { method: 'PUT', headers: getHeaders({ json: true }), body: JSON.stringify(body) });
          if (!resp.ok) {
            const txt = await resp.text().catch(() => '');
            throw new Error(`Event ${targetEventId} Chunk ${ci + 1}/${chunks.length} failed: HTTP ${resp.status} ${txt?.slice(0,200)}`);
          }
          totalSuccessCount += 1;
          if (interDelay > 0 && ci < chunks.length - 1) await new Promise(r => setTimeout(r, interDelay));
        }
    }

    return { ok: true, chunks: totalSuccessCount, updated: baseDvs.length };
  },

    /**
     * Create a fresh assessment TEI + ACTIVE enrollment in the survey program.
     * Used when a new assessment must live on its own TEI (e.g. Self Assessment).
     */
    createAssessmentTei: async ({ programId = 'G2gULe4jsfs', orgUnitId, trackedEntityTypeId = 'uTTDt3fuXZK' }) => {
        if (!orgUnitId) throw new Error('createAssessmentTei: orgUnitId is required');

        const now = new Date().toISOString().slice(0, 10);
        const ATTR_ID = 'Bw4PZ8NsYFd';
        const ATTR_VALUE = 'FAC_ASS_TYPE_INTERNAL';
        const ADMIN_USERNAME = 'admin';
        const ADMIN_PASSWORD = '5Am53808053@';

        const trackerPayload = {
            trackedEntities: [{
                trackedEntityType: trackedEntityTypeId,
                orgUnit: orgUnitId,
                attributes: [],
                enrollments: [{
                    program: programId,
                    orgUnit: orgUnitId,
                    status: 'ACTIVE',
                    enrolledAt: now,
                    occurredAt: now,
                    attributes: [{ attribute: ATTR_ID, value: ATTR_VALUE }]
                }]
            }]
        };

        const response = await fetch(`${BASE_URL}/api/tracker?async=false&importStrategy=CREATE`, {
            method: 'POST',
            headers: getHeaders(ADMIN_USERNAME, ADMIN_PASSWORD),
            body: JSON.stringify(trackerPayload)
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok || data.status !== 'OK') {
            const errorMsg = data.validationReport?.errorReports?.[0]?.message || data.message || 'Assessment TEI creation failed';
            console.error('❌ createAssessmentTei failed:', data);
            throw new Error(errorMsg);
        }

        const teiId = data.bundleReport?.typeReportMap?.TRACKED_ENTITY?.objectReports?.[0]?.uid || null;
        const enrollmentId = data.bundleReport?.typeReportMap?.ENROLLMENT?.objectReports?.[0]?.uid || null;
        if (!teiId) throw new Error('Assessment TEI creation succeeded but TEI UID was not returned.');

        return { teiId, enrollmentId };
    },

    /**
     * Create a new survey Event in the target program/stage for a TEI/orgUnit.
     * Returns the created event UID.
     */
    createSurveyEvent: async ({ programId = 'G2gULe4jsfs', stageId = 'HpHD6u6MV37', orgUnitId, teiId, status = 'ACTIVE', eventDate = null, enrollmentId = null, notes = [], dataValues = [] }) => {
        if (!orgUnitId) throw new Error('createSurveyEvent: orgUnitId is required');
        if (!teiId) throw new Error('createSurveyEvent: teiId is required');

        const today = new Date().toISOString().slice(0, 10);
        let resolvedEnrollment = enrollmentId || null;
        if (!resolvedEnrollment) {
            try {
                const teiResult = await api.getTrackedEntityInstances([teiId]);
                const tei = (teiResult?.trackedEntityInstances || []).find(t => t.trackedEntityInstance === teiId);
                const existingEnrollment = tei?.enrollments?.find(e => e.program === programId && !e.deleted && (!e.status || e.status === 'ACTIVE'));
                if (existingEnrollment?.enrollment) resolvedEnrollment = existingEnrollment.enrollment;
            } catch (e) {
                console.warn('createSurveyEvent: could not resolve existing enrollment (non-fatal)', e);
            }
        }

        const eventPayload = {
            trackedEntityInstance: teiId,
            program: programId,
            programStage: stageId,
            orgUnit: orgUnitId,
            status,
            eventDate: eventDate || today,
            notes: Array.isArray(notes) ? notes : [],
            dataValues: Array.isArray(dataValues) ? dataValues.map(dv => ({ ...dv, providedElsewhere: dv?.providedElsewhere === true ? true : false })) : []
        };
        if (resolvedEnrollment) eventPayload.enrollment = resolvedEnrollment;

        const result = await api.submitEvent(eventPayload);
        const createdId = api.extractEventId(result);
        if (!createdId) {
            throw new Error('Failed to create survey event: missing event UID in response');
        }
        return createdId;
    },

    /**
     * Unified orchestrator for DHIS2 v41 Tracker API.
     * Bundles TEI, Enrollment, and Event in ONE request.
     */
	    submitTrackerAssessment: async (formData, configuration, orgUnitId, onIdGenerated) => {
		        const PROGRAM_ID = configuration?.program?.id || 'G2gULe4jsfs';
		        const STAGE_ID = configuration?.programStage?.id || 'HpHD6u6MV37';
		        const TE_TYPE = configuration?.program?.trackedEntityType?.id || 'uTTDt3fuXZK';
        const ATTR_ID = 'Bw4PZ8NsYFd';
        const ATTR_VALUE = 'FAC_ASS_TYPE_INTERNAL';

        const now = new Date().toISOString().slice(0, 10);
			
	        // If we already know the survey-program enrollment ID for this TEI,
	        // reuse it. Otherwise, if a TEI ID is present, look up existing
	        // enrollments in DHIS2 so we don't try to create a second ACTIVE
	        // enrollment in the same program (which DHIS2 forbids).
	        let enrollmentIdToUse = formData.enrollmentId_internal || null;
	        const teiIdForLookup = formData.teiId_internal;
	        if (!enrollmentIdToUse && teiIdForLookup) {
	            try {
	                const teiResult = await api.getTrackedEntityInstances([teiIdForLookup]);
	                const tei = (teiResult?.trackedEntityInstances || []).find(
	                    (t) => t.trackedEntityInstance === teiIdForLookup
	                );
	                const existingEnrollment = tei?.enrollments?.find(
	                    (enr) =>
	                        enr.program === PROGRAM_ID &&
	                        !enr.deleted &&
	                        (!enr.status || enr.status === 'ACTIVE')
	                );
	                if (existingEnrollment?.enrollment) {
	                    enrollmentIdToUse = existingEnrollment.enrollment;
	                    if (onIdGenerated) {
	                        // Persist for future saves so we don't need to
	                        // re-query DHIS2 again for this draft.
	                        onIdGenerated('enrollmentId_internal', enrollmentIdToUse);
	                    }
	                    console.log(
	                        '🔁 Reusing existing ACTIVE enrollment for TEI',
	                        teiIdForLookup,
	                        'in program',
	                        PROGRAM_ID,
	                        '→',
	                        enrollmentIdToUse
	                    );
	                }
	            } catch (lookupErr) {
	                console.warn(
	                    '⚠️ submitTrackerAssessment: Failed to look up existing enrollments for TEI',
	                    teiIdForLookup,
	                    lookupErr
	                );
	            }
	        }
			
	        // Collect any SE narrative summaries from the draft form data.
	        // Each key is of the form `se_summary_<sectionId>` and will be
	        // persisted to DHIS2 as an event note/comment rather than a
	        // dataElement value.
	        const seSummaryNotes = Object.entries(formData || {})
	            .filter(([key, value]) =>
	                key.startsWith('se_summary_') &&
	                value !== undefined && value !== null && String(value).trim() !== ''
	            )
	            .map(([key, value]) => {
	                const sectionId = key.replace('se_summary_', '') || 'unknown-section';
	                return {
	                    value: `SE summary (${sectionId}): ${String(value).trim()}`
	                };
	            });

        // DHIS2 v41 Tracker Payload Structure
		    // Build the base Tracked Entity object. DHIS2 requires
		    // `trackedEntityType` to be present on both create and update, but its
		    // value is immutable once the TEI is created. Since you've aligned the
		    // programs to use the same tracked entity type, we can safely always
		    // send TE_TYPE here.
		    const teiObject = {
		        trackedEntityType: TE_TYPE,
		        orgUnit: orgUnitId,
		        attributes: [], // Add TEI attributes here if needed
		            enrollments: [
		                {
		                    // If we discovered an existing ACTIVE enrollment in this
		                    // program, reference it here so DHIS2 treats this as an
		                    // update instead of trying to create a duplicate.
		                    ...(enrollmentIdToUse ? { enrollment: enrollmentIdToUse } : {}),
		                    program: PROGRAM_ID,
		                    orgUnit: orgUnitId,
		                    status: 'ACTIVE',
		                    enrolledAt: now,
		                    occurredAt: now,
		                    attributes: [
		                        { attribute: ATTR_ID, value: ATTR_VALUE }
		                    ],
		                    events: [
		                        {
		                            uid: formData.eventId_internal || undefined,
		                            program: PROGRAM_ID,
		                            programStage: STAGE_ID,
		                            orgUnit: orgUnitId,
		                            status: 'COMPLETED',
		                            occurredAt: now,
		                            dataValues: api.formatDataValues(formData),
		                            // Persist SE narrative summaries as
		                            // standard DHIS2 event notes so that
		                            // they are visible alongside the
		                            // event in the Tracker UI.
		                            ...(seSummaryNotes.length > 0
		                                ? { notes: seSummaryNotes }
		                                : {})
		                        }
		                    ]
		                }
		            ]
		        };
		
		        // For existing TEIs, include the `trackedEntity` id so DHIS2 treats
		        // this as an update. The trackedEntityType above must match the
		        // type configured for that TEI.
		        if (formData.teiId_internal) {
		            teiObject.trackedEntity = formData.teiId_internal;
		        }
		
	        const trackerPayload = {
	            trackedEntities: [teiObject]
	        };

        console.log('📤 Submitting to DHIS2 v41 Unified Tracker:', trackerPayload);

        const response = await fetch(`${BASE_URL}/api/tracker?async=false&importStrategy=CREATE_AND_UPDATE`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify(trackerPayload)
        });

        const data = await response.json();

        if (!response.ok || data.status !== 'OK') {
            const errorMsg = data.validationReport?.errorReports?.[0]?.message ||
                data.message ||
                'Tracker submission failed';
            console.error('❌ Tracker submission failed:', data);
            throw new Error(errorMsg);
        }

        console.log('✅ Tracker submission successful:', data);

        // Extract IDs for persistence to enable updates instead of duplicates
        const newTeiId = data.bundleReport?.typeReportMap?.TRACKED_ENTITY?.objectReports?.[0]?.uid;
        if (newTeiId && onIdGenerated) {
            onIdGenerated('teiId_internal', newTeiId);
        }

        const newEnrollmentId = data.bundleReport?.typeReportMap?.ENROLLMENT?.objectReports?.[0]?.uid;
        if (newEnrollmentId && onIdGenerated) {
            onIdGenerated('enrollmentId_internal', newEnrollmentId);
        }

        const newEventId = data.bundleReport?.typeReportMap?.EVENT?.objectReports?.[0]?.uid;
        if (newEventId && onIdGenerated) {
            onIdGenerated('eventId_internal', newEventId);
        }

        return data;
    },

    /**
     * Helper to extract the generated Event UID from various DHIS2 response formats.
     */
    extractEventId: (result) => {
        // Tracker API (v41)
        const trackerUid = result?.bundleReport?.typeReportMap?.EVENT?.objectReports?.[0]?.uid;
        if (trackerUid) return trackerUid;

        // Legacy Event API
        const legacyUid = result?.response?.importSummaries?.[0]?.reference;
        if (legacyUid) return legacyUid;

        return null;
    },

    extractEventImportError: (result) => {
        const summary = result?.response?.importSummaries?.[0] || null;
        const status = summary?.status || result?.status || null;
        const description = summary?.description || summary?.importConflicts?.[0]?.value || summary?.conflicts?.[0]?.value || null;
        const rejection = summary?.rejectedIndexes?.length ? `Rejected indexes: ${summary.rejectedIndexes.join(', ')}` : null;
        const typeReportErr = result?.bundleReport?.typeReportMap?.EVENT?.objectReports?.[0]?.errorReports?.[0]?.message || null;
        const validationErr = result?.validationReport?.errorReports?.[0]?.message || null;
        const topLevelMsg = result?.message || null;
        const parts = [typeReportErr, validationErr, description, rejection, topLevelMsg].filter(Boolean);
        if (parts.length > 0) return parts.join(' | ');
        if (status && String(status).toUpperCase() !== 'SUCCESS' && String(status).toUpperCase() !== 'OK') {
            return `DHIS2 import status: ${status}`;
        }
        return null;
    },

    /**
     * Legacy event submission (kept for compatibility if needed).
     */
    submitEvent: async (eventPayload) => {
        console.log('📤 Submitting event to DHIS2 (Legacy):', eventPayload);
        const response = await fetch(`${BASE_URL}/api/events.json`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ events: [eventPayload] })
        });

        if (!response.ok) {
            const data = await response.json();
            throw new Error(data?.message || `Event submission failed: ${response.status}`);
        }

        const data = await response.json();
        const createdId = api.extractEventId(data);
        if (!createdId) {
            const detail = api.extractEventImportError(data) || 'DHIS2 did not return an event UID.';
            const err = new Error(`Event submission rejected by DHIS2: ${detail}`);
            err.dhis2Response = data;
            throw err;
        }
        return data;
    }
};
