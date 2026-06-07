// Consistent base URL for DHIS2 API (points to the /qims context on the server)
const BASE_URL = '/qims';
const ADMIN_USER_RESOLVER_URL = '/email2/api/admin/resolve-users';

const getAdminUserResolverUrls = () => {
    const urls = [ADMIN_USER_RESOLVER_URL];
    if (typeof window !== 'undefined' && /^localhost$|^127\.0\.0\.1$/.test(window.location.hostname)) {
        urls.push('https://moh-qimsuat.gov.bw/email2/api/admin/resolve-users');
    }
    return urls;
};

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

const appendEventScopeFields = (fields, requiredFields = []) => {
    let result = String(fields || '').trim();
    requiredFields.filter(Boolean).forEach((fieldName) => {
        const pattern = new RegExp(`(^|,)${fieldName}(,|$)`);
        if (!pattern.test(result)) {
            result = result ? `${result},${fieldName}` : fieldName;
        }
    });
    return result;
};

const filterEventsByExactScope = (events, {
    programId,
    stageId,
    teiId,
    enrollmentId,
} = {}) => {
    const list = Array.isArray(events) ? events : [];
    return list.filter((ev) => {
        if (!ev?.event) return false;
        if (programId && ev.program !== programId) return false;
        if (stageId && ev.programStage !== stageId) return false;
        if (teiId) {
            const teiIds = String(teiId).split(';').map(id => id.trim()).filter(Boolean);
            if (!teiIds.includes(ev.trackedEntityInstance)) return false;
        }
        if (enrollmentId && ev.enrollment !== enrollmentId) return false;
        return true;
    });
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
     * Resolve users through the secure admin-backed resolver endpoint.
     * Returns a map keyed by both id and username where available.
     */
    resolveAdminUserDisplayNames: async (values) => {
        if (!Array.isArray(values) || values.length === 0) return {};
        const identifiers = Array.from(new Set(
            values
                .flatMap(v => String(v || '').split('|'))
                .map(v => v.trim())
                .filter(Boolean)
        ));
        if (identifiers.length === 0) return {};

        let data = null;
        let lastError = null;
        for (const url of getAdminUserResolverUrls()) {
            try {
                const resp = await fetch(url, {
                    method: 'POST',
                    headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
                    body: JSON.stringify({ identifiers }),
                    cache: 'no-store'
                });
                if (!resp.ok) {
                    lastError = new Error(`Admin user resolver failed at ${url}: ${resp.status}`);
                    continue;
                }
                const parsed = await resp.json().catch(() => ({}));
                const hasResolverShape = Array.isArray(parsed) || Array.isArray(parsed?.users) || Array.isArray(parsed?.results) || Array.isArray(parsed?.unresolved);
                if (!hasResolverShape) {
                    lastError = new Error(`Admin user resolver at ${url} did not return resolver JSON`);
                    continue;
                }
                data = parsed;
                break;
            } catch (e) {
                lastError = e;
            }
        }
        if (!data) throw lastError || new Error('Admin user resolver failed');

        const users = Array.isArray(data) ? data : (data.users || data.results || []);
        const cache = api._userDisplayCache || (api._userDisplayCache = {});
        const result = {};
        users.forEach(u => {
            if (!u || (!u.id && !u.username && !u.uid)) return;
            const entry = {
                id: u.id || u.uid || u.username,
                username: u.username || u.id || u.uid,
                displayName: u.displayName || u.name || u.username || u.id || u.uid
            };
            if (entry.id) { cache[entry.id] = entry; result[entry.id] = entry; }
            if (entry.username) { cache[entry.username] = entry; result[entry.username] = entry; }
        });
        return result;
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

            const addResolvedUser = (u) => {
                if (!u || (!u.id && !u.username)) return;
                const entry = {
                    id: u.id || u.uid || u.username,
                    username: u.username || u.id || u.uid,
                    displayName: u.displayName || u.name || u.username || u.id || u.uid
                };
                if (entry.id) { cache[entry.id] = entry; result[entry.id] = entry; }
                if (entry.username) { cache[entry.username] = entry; result[entry.username] = entry; }
            };

            // Preferred secure resolver. This endpoint should perform the DHIS2
            // user lookup server-side using admin credentials and return only
            // safe user metadata: id, username, displayName.
            try {
                const secureMap = await api.resolveAdminUserDisplayNames(unknown);
                Object.values(secureMap || {}).forEach(addResolvedUser);
            } catch (e) {
                console.warn('secure resolve-users endpoint unavailable; falling back to DHIS2 user lookup', e);
            }

            const remainingUnknown = unknown.filter(k => !result[k]);
            if (remainingUnknown.length === 0) return result;

            // Partition into likely IDs (11-char DHIS2 UID) and usernames (others)
            const uidLike = remainingUnknown.filter(k => /^[A-Za-z0-9]{11}$/.test(k));
            const usernames = remainingUnknown.filter(k => !/^[A-Za-z0-9]{11}$/.test(k));

            const collected = [];

            // Helper to fetch with a specific filter
            const fetchUsers = async (filterField, list) => {
                if (list.length === 0) return [];
                const bracket = `[${list.map(encodeURIComponent).join(',')}]`;
                const url = `${BASE_URL}/api/users.json?paging=false&fields=id,username,displayName&filter=${filterField}:in:${bracket}&_=${Date.now()}`;
                const resp = await fetch(url, {
                    headers: { ...getHeaders(), 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
                    cache: 'no-store'
                });
                if (!resp.ok) return [];
                const data = await resp.json().catch(() => ({}));
                return data.users || data || [];
            };

            const fetchUserById = async (id) => {
                if (!id) return null;
                const url = `${BASE_URL}/api/users/${encodeURIComponent(id)}.json?fields=id,username,displayName&_=${Date.now()}`;
                const resp = await fetch(url, {
                    headers: { ...getHeaders(), 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
                    cache: 'no-store'
                });
                if (!resp.ok) return null;
                return await resp.json().catch(() => null);
            };

            try {
                const byId = await fetchUsers('id', uidLike);
                collected.push(...byId);
            } catch (_) {}
            try {
                const byUsername = await fetchUsers('username', usernames);
                collected.push(...byUsername);
            } catch (_) {}

            const collectedKeys = new Set();
            collected.forEach(u => {
                if (u?.id) collectedKeys.add(u.id);
                if (u?.username) collectedKeys.add(u.username);
            });
            const missingUidLike = uidLike.filter(id => !collectedKeys.has(id));
            if (missingUidLike.length > 0) {
                try {
                    const directUsers = await Promise.all(missingUidLike.map(fetchUserById));
                    directUsers.filter(Boolean).forEach(u => collected.push(u));
                } catch (_) {}
            }

            collected.forEach(addResolvedUser);

            return result;
        } catch (e) {
            console.warn('resolveUserDisplayNames failed (non-fatal)', e);
            return {};
        }
    },

  // List events by program with optional filters
  listEventsByProgram: async ({ programId, orgUnitId, startDate, endDate }) => {
    if (!programId) throw new Error('programId is required');
    let url = `${BASE_URL}/api/events.json?skipPaging=true&fields=event,program&program=${encodeURIComponent(programId)}`;
    if (orgUnitId) url += `&orgUnit=${encodeURIComponent(orgUnitId)}&ouMode=DESCENDANTS`;
    if (startDate) url += `&startDate=${encodeURIComponent(startDate)}`;
    if (endDate) url += `&endDate=${encodeURIComponent(endDate)}`;
    const resp = await fetch(url, { headers: getHeaders() });
    if (!resp.ok) throw new Error(`Failed to list events (${resp.status})`);
    const json = await resp.json().catch(() => ({}));
    const events = json?.events || json?.instances || [];
    return events.filter(e => e?.event && e.program === programId).map(e => e.event);
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

  deleteTrackedEntityInstance: async (teiId) => {
    const resp = await fetch(`${BASE_URL}/api/trackedEntityInstances/${encodeURIComponent(teiId)}`, {
      method: 'DELETE',
      headers: getHeaders()
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new Error(`Failed to delete TEI: ${resp.status} ${text}`);
    }
    return true;
  },

  deleteEnrollment: async (enrollmentId) => {
    const resp = await fetch(`${BASE_URL}/api/enrollments/${encodeURIComponent(enrollmentId)}`, {
      method: 'DELETE',
      headers: getHeaders()
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new Error(`Failed to delete enrollment: ${resp.status} ${text}`);
    }
    return true;
  },

  completeEnrollment: async (enrollmentId) => {
    if (!enrollmentId) throw new Error('completeEnrollment: enrollmentId is required');
    const resp = await fetch(`${BASE_URL}/api/enrollments/${encodeURIComponent(enrollmentId)}/completed`, {
      method: 'PUT',
      headers: getHeaders()
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new Error(`Failed to complete enrollment: ${resp.status} ${text}`);
    }
    return true;
  },

  getEnrollmentById: async (enrollmentId) => {
    if (!enrollmentId) throw new Error('getEnrollmentById: enrollmentId is required');
    const fields = 'enrollment,program,status,trackedEntityInstance,orgUnit,deleted,enrollmentDate,incidentDate';
    const resp = await fetch(
      `${BASE_URL}/api/enrollments/${encodeURIComponent(enrollmentId)}?fields=${encodeURIComponent(fields)}`,
      { headers: getHeaders() }
    );
    if (!resp.ok) throw new Error(`Failed to fetch enrollment ${enrollmentId}: ${resp.status}`);
    return await resp.json();
  },

  getEventsForEnrollment: async (enrollmentId, { programId = null, stageId = null } = {}) => {
    if (!enrollmentId) throw new Error('getEventsForEnrollment: enrollmentId is required');
    const fields = 'event,enrollment,program,programStage';
    const params = [
      'paging=false',
      'skipPaging=true',
      `enrollment=${encodeURIComponent(enrollmentId)}`,
      programId ? `program=${encodeURIComponent(programId)}` : null,
      stageId ? `programStage=${encodeURIComponent(stageId)}` : null,
      `fields=${encodeURIComponent(fields)}`
    ].filter(Boolean).join('&');
    const url = `${BASE_URL}/api/events?${params}`;
    const resp = await fetch(url, { headers: getHeaders() });
    if (!resp.ok) throw new Error(`Failed to fetch events for enrollment: ${resp.status}`);
    const data = await resp.json();
    const events = data.events || [];
    return events.filter((ev) => (
      ev?.event &&
      ev.enrollment === enrollmentId &&
      (!programId || ev.program === programId) &&
      (!stageId || ev.programStage === stageId)
    ));
  },

  deleteEnrollmentCascade: async (enrollmentId, { programId = null, stageId = null } = {}) => {
    if (!enrollmentId) throw new Error('deleteEnrollmentCascade: enrollmentId is required');
    let resolvedProgramId = programId;
    if (!resolvedProgramId) {
      try {
        const enrollment = await api.getEnrollmentById(enrollmentId);
        resolvedProgramId = enrollment?.program || null;
      } catch (e) {
        console.warn('[deleteEnrollmentCascade] Failed to resolve enrollment program, falling back to enrollment-only client filtering', e);
      }
    }
    const events = await api.getEventsForEnrollment(enrollmentId, { programId: resolvedProgramId, stageId });
    const eventIds = events.map(ev => ev.event).filter(Boolean);
    if (eventIds.length > 0) {
      await api.deleteEventsByIds(eventIds);
    }
    return await api.deleteEnrollment(enrollmentId);
  },

  deleteTeiCascade: async (teiId, programId) => {
    // 1. Get enrollments for this TEI in this program
    const enrollments = await api.getEnrollmentsForTei(teiId, programId);
    
    for (const enr of enrollments) {
      const enrollmentId = enr.enrollment;
      // 2. Delete this enrollment and its events
      await api.deleteEnrollmentCascade(enrollmentId, { programId: enr.program });
    }
    
    // 3. Finally delete the TEI
    return api.deleteTrackedEntityInstance(teiId);
  },

  getActiveEnrollments: async (programId, orgUnitId = null) => {
    // Fetch active enrollments directly from the enrollments endpoint.
    // This avoids missing records where the enrollment OU matches but a TEI-first
    // trackedEntityInstances query does not return the TEI in the expected scope.
    const params = [
      'paging=false',
      `program=${encodeURIComponent(programId)}`,
      `programStatus=ACTIVE`,
      `ouMode=${orgUnitId ? 'DESCENDANTS' : 'ALL'}`,
      `fields=enrollment,status,program,deleted,trackedEntityInstance,orgUnit,orgUnitName,enrollmentDate,incidentDate,attributes[attribute,displayName,value]`
    ];
    if (orgUnitId) params.push(`ou=${encodeURIComponent(orgUnitId)}`);

    const url = `${BASE_URL}/api/enrollments?${params.join('&')}`;
    const resp = await fetch(url, { headers: getHeaders() });
    if (!resp.ok) throw new Error(`Failed to fetch active enrollments: ${resp.status}`);
    const data = await resp.json();

    return (data.enrollments || [])
      .filter(enr => enr.program === programId && String(enr.status || '').toUpperCase() === 'ACTIVE' && !enr.deleted)
      .map(enr => ({
        teiId: enr.trackedEntityInstance,
        enrollmentId: enr.enrollment,
        programId: enr.program,
        status: enr.status,
        orgUnit: enr.orgUnit,
        orgUnitName: enr.orgUnitName || enr.orgUnit,
        enrollmentDate: enr.enrollmentDate || enr.incidentDate,
        incidentDate: enr.incidentDate,
        attributes: enr.attributes || []
      }));
  },

  getEnrollmentsByStatusesDirect: async (programId, orgUnitId = null, statuses = ['ACTIVE', 'COMPLETED']) => {
    const allowedStatuses = new Set((statuses || []).map(s => String(s || '').toUpperCase()).filter(Boolean));
    const params = [
      'paging=false',
      `program=${encodeURIComponent(programId)}`,
      `ouMode=${orgUnitId ? 'DESCENDANTS' : 'ALL'}`,
      `fields=enrollment,status,program,deleted,trackedEntityInstance,orgUnit,orgUnitName,enrollmentDate,incidentDate,attributes[attribute,displayName,value]`
    ];
    if (orgUnitId) params.push(`ou=${encodeURIComponent(orgUnitId)}`);

    const url = `${BASE_URL}/api/enrollments?${params.join('&')}`;
    const resp = await fetch(url, { headers: getHeaders() });
    if (!resp.ok) throw new Error(`Failed to fetch enrollments by status: ${resp.status}`);
    const data = await resp.json();

    return (data.enrollments || [])
      .filter(enr => {
        const status = String(enr.status || '').toUpperCase();
        return enr.program === programId && !enr.deleted && (!allowedStatuses.size || allowedStatuses.has(status));
      })
      .map(enr => ({
        teiId: enr.trackedEntityInstance,
        enrollmentId: enr.enrollment,
        programId: enr.program,
        status: enr.status,
        orgUnit: enr.orgUnit,
        orgUnitName: enr.orgUnitName || enr.orgUnit,
        enrollmentDate: enr.enrollmentDate || enr.incidentDate,
        incidentDate: enr.incidentDate,
        attributes: enr.attributes || []
      }));
  },

  getProgramEnrollments: async (programId, orgUnitId = null, statuses = ['ACTIVE', 'COMPLETED']) => {
    const allowedStatuses = new Set((statuses || []).map(s => String(s || '').toUpperCase()).filter(Boolean));
    const params = [
      `program=${encodeURIComponent(programId)}`,
      `ouMode=${orgUnitId ? 'DESCENDANTS' : 'ALL'}`,
      `fields=trackedEntityInstance,orgUnit,attributes[attribute,displayName,value],enrollments[enrollment,status,program,deleted,orgUnit,orgUnitName,enrollmentDate,incidentDate]`
    ];
    if (orgUnitId) params.push(`ou=${encodeURIComponent(orgUnitId)}`);

    const url = `${BASE_URL}/api/trackedEntityInstances?${params.join('&')}`;
    const resp = await fetch(url, { headers: getHeaders() });
    if (!resp.ok) throw new Error(`Failed to fetch program enrollments: ${resp.status}`);
    const data = await resp.json();

    const list = [];
    (data.trackedEntityInstances || []).forEach(tei => {
      (tei.enrollments || []).forEach(enr => {
        const status = String(enr.status || '').toUpperCase();
        if (enr.program === programId && !enr.deleted && (!allowedStatuses.size || allowedStatuses.has(status))) {
          list.push({
            teiId: tei.trackedEntityInstance,
            enrollmentId: enr.enrollment,
            programId: enr.program,
            status: enr.status,
            orgUnit: enr.orgUnit,
            orgUnitName: enr.orgUnitName || tei.orgUnit,
            enrollmentDate: enr.enrollmentDate,
            incidentDate: enr.incidentDate,
            attributes: tei.attributes || []
          });
        }
      });
    });
    return list;
  },

  getEnrollmentsForTei: async (teiId, programId) => {
    const url = `${BASE_URL}/api/trackedEntityInstances/${encodeURIComponent(teiId)}?fields=enrollments[enrollment,status,program,deleted,orgUnit,enrollmentDate,incidentDate]`;
    const resp = await fetch(url, { headers: getHeaders() });
    if (!resp.ok) throw new Error(`Failed to fetch enrollments for TEI: ${resp.status}`);
    const data = await resp.json();
    return (data.enrollments || []).filter(e => e.program === programId);
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
      programStage: stageId || '',
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

    getFormMetadata: async (programStageId = '') => {
        const params = [
            // Include program + its trackedEntityType so we can use them when
            // submitting tracker payloads (TEI + enrollment + event).
            'fields=id,name,displayName,description,sortOrder,repeatable,program[id,displayName,trackedEntityType[id,displayName]]',
            'programStageSections[id,name,displayName,code,sortOrder,dataElements[id,formName,displayFormName,name,displayName,shortName,code,description,valueType,compulsory,allowProvidedElsewhere,lastUpdated,optionSet[id,displayName,options[id,displayName,code,sortOrder]]]]',
            'programStageDataElements[id,displayName,sortOrder,compulsory,allowProvidedElsewhere,dataElement[id,formName,displayFormName,name,displayName,shortName,code,description,valueType,aggregationType,lastUpdated,optionSet[id,displayName,options[id,displayName,code,sortOrder]]]]'
        ].join(',');

        const response = await fetch(`${BASE_URL}/api/programStages/${programStageId}?${params}&_=${Date.now()}`, {
            headers: { ...getHeaders(), 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
            cache: 'no-store'
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
                    `${BASE_URL}/api/dataElements?paging=false&filter=id:in:[${[...missingIds].join(',')}]&fields=${deFields}&_=${Date.now()}`,
                    { headers: { ...getHeaders(), 'Cache-Control': 'no-cache', Pragma: 'no-cache' }, cache: 'no-store' }
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
            'attributes[attribute,value]'
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
                    `${BASE_URL}/api/organisationUnits?paging=false&filter=id:in:[${ouIds.join(',')}]&fields=id,displayName,name,level,parent[id,displayName,name,level,parent[id,displayName,name,level]]`,
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
     * Optimizations vs original:
     *  - Step 1: Fetch ALL team-stage events in ONE bulk request without
     *    data-element filtering.
     *  - Step 2 eliminated (reused Step 1 bulk data).
     *  - Step 3 fetches Setup Events for user's enrollments in parallel.
     */
    getSchedulingAssignments: async (userId, username) => {
        if (!userId && !username) throw new Error('getSchedulingAssignments requires a userId or username');
        const t_total_start = performance.now();

        // Program and stage IDs
        const PROGRAM_ID = 'K9O5fdoBmKf';
        const SETUP_STAGE_ID = 'M2RdEI7Tbqr'; // Assessment Programme Setup
        const TEAM_STAGE_ID = 'UQmvnyPZLk2';   // Team Assignment and Acceptance

        // Data element IDs
        const DE_ASSIGNED_USER_ID = 'AXvpO8KR1Mw';      // Assigned User ID
        const DE_ASSIGN_STATUS = 'yVVbhT02L6G';        // Assignment Status
        const DE_PROGRAM_STATUS = 'xFQOt5o6DSz';       // Assessment Program Status
        const DE_TEAM_ROLE = 'GixEay7pfpl';            // Team Role

        // Minimal fields — only what we need to group, filter and display
        const teamFields = [
            'event',
            'enrollment',
            'trackedEntityInstance',
            'orgUnit',
            'orgUnitName',
            'eventDate',
            'status',
            'dataValues[dataElement,value]'
        ].join(',');

        const debugRequests = [];
        const idValues = [];
        if (userId) idValues.push(userId);
        if (username && username !== userId) idValues.push(username);

        // ─────────────────────────────────────────────────────────────────────
        // STEP 1 — Fetch only the user's assigned events first, then fetch bulk
        // team details for only those specific TEIs to avoid slow system-wide scans.
        // ─────────────────────────────────────────────────────────────────────
        const t1_start = performance.now();
        const userStageEvents = [];
        
        try {
            const userEventResults = await Promise.all(
                idValues.map(async (idVal) => {
                    const url = `${BASE_URL}/api/events.json?paging=false&ouMode=ALL` +
                        `&programStage=${TEAM_STAGE_ID}&fields=trackedEntityInstance,enrollment` +
                        `&filter=${DE_ASSIGNED_USER_ID}:like:${encodeURIComponent(idVal)}`;
                    const resp = await fetch(url, { headers: getHeaders() });
                    if (resp.ok) {
                        const d = await resp.json();
                        debugRequests.push({ kind: 'userEventsCheck', path: url.replace(BASE_URL, ''), filter: idVal, status: resp.status, ok: true, count: (d.events || []).length });
                        return d.events || [];
                    }
                    debugRequests.push({ kind: 'userEventsCheck', path: url.replace(BASE_URL, ''), filter: idVal, status: resp.status, ok: false });
                    return [];
                })
            );
            userStageEvents.push(...userEventResults.flat());
        } catch (err) {
            console.warn('⚠️ api.js: Failed to fetch user events', err);
        }

        const userTeis = new Set(userStageEvents.map(ev => ev.trackedEntityInstance).filter(Boolean));
        const enrollmentIds = new Set(userStageEvents.map(ev => ev.enrollment).filter(Boolean));

        if (userTeis.size === 0) {
            const t1_end = performance.now();
            console.log(`⏱️ [SchedulingAssignments] Performance Breakdown (No Assignments Found):
  - Step 1 (Fetch User TEIs): ${(t1_end - t1_start).toFixed(1)}ms`);
            return [];
        }

        // Fetch full team stage details ONLY for the TEIs the user is actually assigned to
        let allStageEvents = [];
        try {
            const bulkTeiUrl = `${BASE_URL}/api/events.json?paging=false&ouMode=ALL` +
                `&programStage=${TEAM_STAGE_ID}&fields=${teamFields}&trackedEntityInstance=${[...userTeis].join(';')}`;
            const bulkResp = await fetch(bulkTeiUrl, { headers: getHeaders() });
            if (bulkResp.ok) {
                const bulkData = await bulkResp.json();
                allStageEvents = bulkData.events || [];
                debugRequests.push({ kind: 'teamEventsBulk', path: bulkTeiUrl.replace(BASE_URL, ''), status: bulkResp.status, ok: true, count: allStageEvents.length });
            } else {
                debugRequests.push({ kind: 'teamEventsBulk', path: bulkTeiUrl.replace(BASE_URL, ''), status: bulkResp.status, ok: false });
                throw new Error(`Bulk fetch failed with status ${bulkResp.status}`);
            }
        } catch (err) {
            console.warn('⚠️ api.js: Bulk TEI events fetch failed, falling back to individual fetches', err);
            // Fallback: fetch per TEI in parallel
            try {
                const individualResults = await Promise.all(
                    [...userTeis].map(async (teiId) => {
                        const url = `${BASE_URL}/api/events.json?paging=false&ouMode=ALL` +
                            `&programStage=${TEAM_STAGE_ID}&fields=${teamFields}&trackedEntityInstance=${teiId}`;
                        const resp = await fetch(url, { headers: getHeaders() });
                        if (resp.ok) {
                            const d = await resp.json();
                            return d.events || [];
                        }
                        return [];
                    })
                );
                allStageEvents = individualResults.flat();
            } catch (fallbackErr) {
                console.error('⚠️ api.js: Fallback individual fetches failed', fallbackErr);
            }
        }
        const t1_end = performance.now();

        const teamByTei = {};
        const seenEventIds = new Set();

        for (const ev of allStageEvents) {
            const tei = ev.trackedEntityInstance;
            if (!tei || !ev.event) continue;

            if (!teamByTei[tei]) teamByTei[tei] = [];
            if (!seenEventIds.has(ev.event)) {
                seenEventIds.add(ev.event);
                teamByTei[tei].push(ev);
            }
        }

        if (userTeis.size === 0) return [];

        const enrollments = [...userTeis].map(tei => {
            const evts = teamByTei[tei] || [];
            const primary = evts[0] || {};
            return {
                enrollment: primary.enrollment || tei,
                trackedEntityInstance: tei,
                programOrgUnitId: primary.orgUnit || null,
                orgUnit: primary.orgUnit || null,
                orgUnitName: primary.orgUnitName || null,
                status: primary.status || 'ACTIVE',
                enrollmentDate: primary.eventDate || new Date().toISOString(),
                incidentDate: primary.eventDate || new Date().toISOString(),
                scheduledAt: null,
                updatedAt: null,
                events: evts,
            };
        });

        const setupFields = [
            'event', 'enrollment', 'orgUnit', 'orgUnitName',
            'eventDate', 'status', 'dataValues[dataElement,value]'
        ].join(',');

        const t3_start = performance.now();
        const enrollmentIdList = [...enrollmentIds];
        let setupEvents = [];

        try {
            const setupResults = await Promise.all(
                enrollmentIdList.map(async (enrId) => {
                    const url = `${BASE_URL}/api/events.json?paging=false&ouMode=ALL&programStage=${SETUP_STAGE_ID}&enrollment=${enrId}&fields=${setupFields}`;
                    const resp = await fetch(url, { headers: getHeaders() });
                    if (resp.ok) {
                        const d = await resp.json();
                        debugRequests.push({ kind: 'setupEventSingle', path: url.replace(BASE_URL, ''), status: resp.status, ok: true });
                        return d.events || [];
                    }
                    debugRequests.push({ kind: 'setupEventSingle', path: url.replace(BASE_URL, ''), status: resp.status, ok: false });
                    return [];
                })
            );
            setupEvents = setupResults.flat();
        } catch (err) {
            console.warn('⚠️ api.js: Failed to fetch setup events in parallel', err);
        }
        const t3_end = performance.now();

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

        const qualifying = enrollments;

        api._schedulingDebug = {
            userId, username,
            teamEventsCount: userTeis.size,
            enrollmentIds: [...enrollmentIds],
            enrollmentsCount: enrollments.length,
            qualifyingCount: qualifying.length,
            requests: debugRequests,
        };

        const t5_start = performance.now();
        if (qualifying.length === 0) return [];

        const ouIds = [...new Set(qualifying.map(e => {
            const primary = (teamByTei[e.trackedEntityInstance] || [])[0];
            if (primary && primary.orgUnit) return primary.orgUnit;
            const rawOu = e.orgUnit;
            return typeof rawOu === 'string' ? rawOu : rawOu?.id;
        }).map(id => String(id || '').trim()).filter(id => id && id !== 'null' && id !== 'undefined'))];

        let ouMap = {};
        if (ouIds.length > 0) {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 3000);
            try {
                const ouUrl = `${BASE_URL}/api/organisationUnits?paging=false&filter=id:in:[${ouIds.join(',')}]` +
                    `&fields=id,displayName,name,level,parent[id,displayName,name,level,parent[id,displayName,name,level]]`;
                const ouResponse = await fetch(ouUrl, { headers: getHeaders('admin', '5Am53808053@'), signal: controller.signal });
                clearTimeout(timeoutId);
                if (ouResponse.ok) {
                    const ouJson = await ouResponse.json();
                    (ouJson.organisationUnits || []).forEach(ou => { ouMap[ou.id] = ou; });
                    debugRequests.push({ kind: 'organisationUnits', path: ouUrl.replace(BASE_URL, ''), status: ouResponse.status, ok: true, count: (ouJson.organisationUnits || []).length });
                } else {
                    debugRequests.push({ kind: 'organisationUnits', path: ouUrl.replace(BASE_URL, ''), status: ouResponse.status, ok: false, count: 0 });
                }
            } catch (err) {
                clearTimeout(timeoutId);
                debugRequests.push({ kind: 'organisationUnits', path: '/api/organisationUnits', status: err.name === 'AbortError' ? 'TIMEOUT' : 'ERR', ok: false, count: 0 });
            }
        }
        const t5_end = performance.now();

        const buildTeamForTei = (tei) => {
            const evts = teamByTei[tei] || [];
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
                    eventDate: ev.eventDate || null,
                    orgUnit: ev.orgUnit || null,
                    orgUnitName: ev.orgUnitName || null
                };
            });
        };

        const results = qualifying.map(enrollment => {
            const tei = enrollment.trackedEntityInstance;
            const enrId = enrollment.enrollment;
            const primaryEvt = (teamByTei[tei] || [])[0] || null;

            const rawOu = primaryEvt?.orgUnit || enrollment.orgUnit;
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
                programOrgUnitId: enrollment.programOrgUnitId || ouId,
                orgUnitName: fullOu?.displayName || fullOu?.name || primaryEvt?.orgUnitName || enrollment.orgUnitName || 'Unknown Facility',
                parentOrgUnitName: parentName,
                setupEventId: setupEvent?.event || null,
                setupEventDataValues: Array.isArray(setupEvent?.dataValues) ? setupEvent.dataValues : [],
                programmeStatus,
                team: buildTeamForTei(tei)
            };
        });

        const t_total_end = performance.now();
        console.log(`⏱️ [SchedulingAssignments] Performance Breakdown:
  - Step 1 (Fetch ALL Team Events + build teamByTei): ${(t1_end - t1_start).toFixed(1)}ms
  - Step 2 (Enrich All Team Members): ELIMINATED — reused Step 1 bulk data
  - Step 3 (Fetch Setup Events in parallel per enrollment): ${(t3_end - t3_start).toFixed(1)}ms
  - Step 5 (Fetch Org Unit Bulk Metadata): ${(t5_end - t5_start).toFixed(1)}ms
  - Total Server Fetching & Processing: ${(t_total_end - t_total_start).toFixed(1)}ms`);

        return results;
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
        eventIds,
        ouMode = 'SELECTED',
        order = 'eventDate:desc',
        fields = 'event,eventDate,status,program,programStage,orgUnit,trackedEntityInstance'
    }) => {
        const scopedFields = appendEventScopeFields(fields, [
            'event',
            programId || stageId ? 'program' : null,
            stageId ? 'programStage' : null,
            teiId ? 'trackedEntityInstance' : null,
            enrollmentId ? 'enrollment' : null,
        ]);
        const eventIdsParam = (Array.isArray(eventIds) && eventIds.length)
            ? `event=${eventIds.map(encodeURIComponent).join(',')}`
            : null;
        // When fetching by specific identifiers (TEI, Enrollment, or Event IDs) without a specific orgUnit,
        // we must supply ouMode=ALL so DHIS2 searches across the hierarchy instead of restricting to the user's scope.
        const effectiveOuMode = orgUnitId ? ouMode : (teiId || enrollmentId || eventIdsParam ? 'ALL' : null);
        const params = [
            'paging=false',
            programId ? `program=${programId}` : null,
            stageId ? `programStage=${stageId}` : null,
            teiId ? `trackedEntityInstance=${teiId}` : null,
            enrollmentId ? `enrollment=${enrollmentId}` : null,
            eventIdsParam,
            orgUnitId ? `orgUnit=${orgUnitId}` : null,
            effectiveOuMode ? `ouMode=${effectiveOuMode}` : null,
            order ? `order=${order}` : null,
            scopedFields ? `fields=${scopedFields}` : null
        ].filter(Boolean).join('&');
        const url = `${BASE_URL}/api/events.json?${params}`;
        const resp = await fetch(url, { headers: getHeaders() });
        if (!resp.ok) throw new Error(`Failed to fetch events list: ${resp.status}`);
        const data = await resp.json();
        return filterEventsByExactScope(data.events || [], { programId, stageId, teiId, enrollmentId });
    },

    getSelfAssessmentAssessorUserIds: async ({
        orgUnitId,
        programId = 'b7wdiBqcml5',
        stageId = 'hczvoscj8Ce',
        statusDataElementId = 'WmnMQhFIaMu',
        userDataElementId = 'uJCFQsE2Z4W'
    }) => {
        if (!orgUnitId) return [];
        const fields = 'dataValues,occurredAt,event,status,orgUnit,program,programType,updatedAt,createdAt,assignedUser';
        const params = [
            'page=1',
            'pageSize=200',
            `program=${encodeURIComponent(programId)}`,
            `programStage=${encodeURIComponent(stageId)}`,
            `orgUnit=${encodeURIComponent(orgUnitId)}`,
            'ouMode=SELECTED',
            'status=ACTIVE',
            `order=${encodeURIComponent('occurredAt:desc')}`,
            `fields=${encodeURIComponent(fields)}`
        ].join('&');
        let resp = await fetch(`${BASE_URL}/api/40/tracker/events?${params}`, { headers: getHeaders() });
        if (!resp.ok) {
            const fallbackParams = [
                'paging=false',
                `program=${encodeURIComponent(programId)}`,
                `programStage=${encodeURIComponent(stageId)}`,
                `orgUnit=${encodeURIComponent(orgUnitId)}`,
                'ouMode=SELECTED',
                'status=ACTIVE',
                `order=${encodeURIComponent('occurredAt:desc')}`,
                `fields=${encodeURIComponent(fields)}`
            ].join('&');
            resp = await fetch(`${BASE_URL}/api/tracker/events.json?${fallbackParams}`, { headers: getHeaders() });
        }
        if (!resp.ok) throw new Error(`Failed to fetch self-assessment assessor events: ${resp.status}`);
        const data = await resp.json().catch(() => ({}));
        const events = data?.instances || data?.events || [];
        const ids = new Set();
        const isUsableUserIdentifier = (value) => {
            const v = String(value || '').trim();
            if (!v) return false;
            const lower = v.toLowerCase();
            if (['active', 'completed', 'scheduled', 'cancelled', 'skipped', 'true', 'false', 'null', 'undefined'].includes(lower)) return false;
            return /^[A-Za-z][A-Za-z0-9]{10}$/.test(v) || /^[A-Za-z0-9._@-]{3,80}$/.test(v);
        };
        const addCandidate = (value) => {
            String(value || '')
                .split(/[|,;\s]+/)
                .map(v => v.trim())
                .filter(Boolean)
                .forEach(v => { if (isUsableUserIdentifier(v)) ids.add(v); });
        };
        const getDataValue = (dataValues, targetDataElementId) => {
            if (Array.isArray(dataValues)) {
                const found = dataValues.find(dv => {
                    const deId = typeof dv?.dataElement === 'object' ? dv.dataElement?.id : dv?.dataElement;
                    return deId === targetDataElementId;
                });
                return found ? (found.value ?? found.dataValue ?? found.plainValue) : undefined;
            }
            if (dataValues && typeof dataValues === 'object') {
                const raw = dataValues[targetDataElementId];
                return raw && typeof raw === 'object' ? (raw.value ?? raw.dataValue ?? raw.plainValue) : raw;
            }
            return undefined;
        };
        (Array.isArray(events) ? events : []).forEach(ev => {
            if (String(ev?.status || '').toUpperCase() !== 'ACTIVE') return;
            const dataValues = ev?.dataValues;
            const statusValue = String(getDataValue(dataValues, statusDataElementId) || '').trim().toLowerCase();
            if (statusValue !== 'active') return;
            addCandidate(getDataValue(dataValues, userDataElementId));
        });
        return Array.from(ids);
    },

	    // Fetch one page of events. Useful when events contain many dataValues and
	    // the caller wants to process SYS_TAG/event mapping in small chunks.
	    getEventsListPage: async ({
	        programId,
	        stageId,
	        teiId,
	        enrollmentId,
	        orgUnitId,
	        ouMode = 'SELECTED',
	        order = 'eventDate:desc',
	        fields = 'event,eventDate,status,program,programStage,orgUnit,trackedEntityInstance',
	        page = 1,
	        pageSize = 10
	    }) => {
		        const scopedFields = appendEventScopeFields(fields, [
		            'event',
		            programId || stageId ? 'program' : null,
		            stageId ? 'programStage' : null,
		            teiId ? 'trackedEntityInstance' : null,
		            enrollmentId ? 'enrollment' : null,
		        ]);
	        const params = [
	            'paging=true',
	            `page=${Math.max(1, Number(page) || 1)}`,
	            `pageSize=${Math.max(1, Number(pageSize) || 10)}`,
		            programId ? `program=${programId}` : null,
		            stageId ? `programStage=${stageId}` : null,
		            teiId ? `trackedEntityInstance=${teiId}` : null,
	            enrollmentId ? `enrollment=${enrollmentId}` : null,
		            orgUnitId ? `orgUnit=${orgUnitId}` : null,
		            orgUnitId ? `ouMode=${ouMode}` : null,
	            order ? `order=${order}` : null,
		            scopedFields ? `fields=${scopedFields}` : null
	        ].filter(Boolean).join('&');
	        const url = `${BASE_URL}/api/events?${params}`;
	        const resp = await fetch(url, { headers: getHeaders() });
	        if (!resp.ok) throw new Error(`Failed to fetch events page: ${resp.status}`);
	        const data = await resp.json();
		        return {
		            events: filterEventsByExactScope(data.events || [], { programId, stageId, teiId, enrollmentId }),
		            pager: data.pager || null,
		        };
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
    getSurveyEventsForTei: async ({ teiId, orgUnitId, programId = 'G2gULe4jsfs', stageId = '',
        fields = 'event,eventDate,status,trackedEntityInstance,dataValues[dataElement,value]' }) => {
        if (!teiId) return [];
        return await api.getEventsList({
            programId,
            stageId,
            teiId,
            orgUnitId,
            ouMode: orgUnitId ? 'DESCENDANTS' : 'ALL',
            order: 'eventDate:desc',
            fields
        });
    },

    // Fetch all survey events for an Org Unit (all TEIs) in the target program/stage
    getSurveyEventsForOrgUnit: async ({ orgUnitId, programId = 'G2gULe4jsfs', stageId = '',
        fields = 'event,eventDate,status,trackedEntityInstance,dataValues[dataElement,value]' }) => {
        if (!orgUnitId) return [];
        
        // 1. Fetch from legacy events API (handles most existing data)
        let events = await api.getEventsList({
            programId,
            stageId,
            orgUnitId,
            ouMode: 'DESCENDANTS',
            order: 'eventDate:desc',
            fields
        }).catch(() => []);
        
        // 2. Supplement with modern tracker events API (handles new 'detached' self-assessments)
        try {
            const trackerParams = [
                'paging=false',
                `program=${programId}`,
                `programStage=${stageId}`,
                `orgUnit=${orgUnitId}`,
                'ouMode=DESCENDANTS',
                'order=occurredAt:desc',
                `fields=${fields.replace('eventDate', 'occurredAt').replace('trackedEntityInstance', 'trackedEntity')}`
            ].join('&');
            const trackerResp = await fetch(`${BASE_URL}/api/tracker/events?${trackerParams}`, { headers: getHeaders() });
            if (trackerResp.ok) {
                const trackerData = await trackerResp.json();
                const trackerInstances = (trackerData.instances || trackerData.events || []).map(ev => ({
                    ...ev,
                    event: ev.event || ev.instance,
                    eventDate: ev.occurredAt || ev.eventDate,
                    trackedEntityInstance: ev.trackedEntity || ev.trackedEntityInstance
                }));
                
                // Merge and deduplicate by event ID
                const seenIds = new Set(events.map(e => e.event));
                trackerInstances.forEach(ev => {
                    if (!seenIds.has(ev.event)) {
                        events.push(ev);
                        seenIds.add(ev.event);
                    }
                });
            }
        } catch (err) {
            console.warn('[getSurveyEventsForOrgUnit] Tracker supplement failed', err);
        }

        return events;
    },

	    getSurveyEventsForTeiPage: async ({ teiId, orgUnitId, programId = 'G2gULe4jsfs', stageId = '',
	        fields = 'event,eventDate,status,trackedEntityInstance,dataValues[dataElement,value]', page = 1, pageSize = 10 }) => {
	        if (!teiId) return { events: [], pager: null };
	        return await api.getEventsListPage({
	            programId,
	            stageId,
	            teiId,
	            orgUnitId,
	            ouMode: orgUnitId ? 'DESCENDANTS' : 'ALL',
	            order: 'eventDate:desc',
	            fields,
	            page,
	            pageSize
	        });
	    },

	    getEventById: async (eventId, fields = 'event,eventDate,status,trackedEntityInstance,notes[note,value],dataValues[dataElement,value]') => {
	        if (!eventId) return null;
	        // Try legacy API first
	        const url = `${BASE_URL}/api/events/${encodeURIComponent(eventId)}?fields=${fields}`;
	        const resp = await fetch(url, { headers: getHeaders() });
	        if (resp.ok) return await resp.json();

	        // Fallback: tracker API for detached/tracker-only events
	        try {
	            const trackerFields = fields.replace('eventDate', 'occurredAt').replace('trackedEntityInstance', 'trackedEntity');
	            const trackerUrl = `${BASE_URL}/api/tracker/events/${encodeURIComponent(eventId)}?fields=${trackerFields}`;
	            const trackerResp = await fetch(trackerUrl, { headers: getHeaders() });
	            if (trackerResp.ok) {
	                const trackerData = await trackerResp.json();
	                if (trackerData) {
	                    return {
	                        ...trackerData,
	                        event: trackerData.event || trackerData.instance,
	                        eventDate: trackerData.occurredAt || trackerData.eventDate,
	                        trackedEntityInstance: trackerData.trackedEntity || trackerData.trackedEntityInstance
	                    };
	                }
	            }
	        } catch (trackerErr) {
	            console.warn(`[getEventById] Tracker fallback failed for ${eventId}:`, trackerErr);
	        }

	        throw new Error(`Failed to fetch event ${eventId}: ${resp.status}`);
	    },

	    getSurveyEventIdsForTei: async ({ teiId, orgUnitId, programId = 'G2gULe4jsfs', stageId = '', pageSize = 50 }) => {
	        if (!teiId) return [];
	        const ids = [];
	        let page = 1;
	        let pageCount = 1;

	        do {
	            const result = await api.getSurveyEventsForTeiPage({
	                teiId,
	                orgUnitId,
	                programId,
	                stageId,
	                fields: 'event',
	                page,
	                pageSize
	            });
	            const events = result.events || [];
	            events.forEach(ev => {
	                if (ev?.event) ids.push(ev.event);
	            });
	            pageCount = result.pager?.pageCount || (events.length < pageSize ? page : page + 1);
	            page += 1;
	        } while (page <= pageCount);

	        return [...new Set(ids)];
	    },

	    getSurveyEventsForTeiByEventIds: async ({
	        teiId,
	        orgUnitId,
	        programId = 'G2gULe4jsfs',
	        stageId = '',
	        fields = 'event,eventDate,status,trackedEntityInstance,notes[note,value],dataValues[dataElement,value]',
	        listPageSize = 50,
	        detailBatchSize = 5
	    }) => {
	        if (!teiId) return [];
	        const events = [];
	        const seen = new Set();
	        let page = 1;
	        let pageCount = 1;
	        const pageSize = Math.max(1, Number(listPageSize) || 50);

	        do {
	            const result = await api.getSurveyEventsForTeiPage({
	                teiId,
	                orgUnitId,
	                programId,
	                stageId,
	                fields,
	                page,
	                pageSize
	            });
	            const pageEvents = result.events || [];
	            pageEvents.forEach(ev => {
	                if (ev?.event && !seen.has(ev.event)) {
	                    seen.add(ev.event);
	                    events.push(ev);
	                }
	            });
	            pageCount = result.pager?.pageCount || (pageEvents.length < pageSize ? page : page + 1);
	            page += 1;
	        } while (page <= pageCount);

	        return events;
	    },

    // Resolve the baseline Assessment Group value (DE pzenrgsSny3) from the earliest
    // event for this TEI/program/stage (scoped to orgUnit when provided).
    getBaselineAssessmentGroup: async ({ teiId, orgUnitId, programId = 'G2gULe4jsfs', stageId = '' }) => {
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
    getLatestSurveyEventId: async ({ programId = 'G2gULe4jsfs', stageId = '', teiId, orgUnitId }) => {
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
    const STAGE_ID = configuration?.programStage?.id || '';
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

    createAssessmentTei: async ({ programId = 'G2gULe4jsfs', orgUnitId, trackedEntityTypeId = 'uTTDt3fuXZK', extraAttributes = [] }) => {
        if (!orgUnitId) throw new Error('createAssessmentTei: orgUnitId is required');

        const now = new Date().toISOString().slice(0, 10);
        const ATTR_ID = 'Bw4PZ8NsYFd';
        const ATTR_VALUE = 'FAC_ASS_TYPE_INTERNAL';
        
        const rootAttributes = [
            { attribute: ATTR_ID, value: ATTR_VALUE },
            ...extraAttributes
        ];

        const trackerPayload = {
            trackedEntities: [{
                trackedEntityType: trackedEntityTypeId,
                orgUnit: orgUnitId,
                attributes: rootAttributes,
                enrollments: [{
                    program: programId,
                    orgUnit: orgUnitId,
                    status: 'ACTIVE',
                    enrolledAt: now,
                    occurredAt: now,
                    attributes: rootAttributes
                }]
            }]
        };

        const response = await fetch(`${BASE_URL}/api/tracker?async=false&importStrategy=CREATE`, {
            method: 'POST',
            headers: getHeaders(),
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
     * Create a fresh ACTIVE enrollment in the survey program for an existing TEI.
     * Used for new normal assessment instances that should reuse the authorised TEI
     * but not reuse the previous survey-program enrollment.
     */
    createAssessmentEnrollment: async ({ programId = 'G2gULe4jsfs', orgUnitId, teiId, trackedEntityTypeId = 'uTTDt3fuXZK', extraAttributes = [] }) => {
        if (!orgUnitId) throw new Error('createAssessmentEnrollment: orgUnitId is required');
        if (!teiId) throw new Error('createAssessmentEnrollment: teiId is required');

        const now = new Date().toISOString().slice(0, 10);
        const ATTR_ID = 'Bw4PZ8NsYFd';
        const ATTR_VALUE = 'FAC_ASS_TYPE_INTERNAL';

        const enrollmentPayload = {
            trackedEntityInstance: teiId,
            program: programId,
            orgUnit: orgUnitId,
            status: 'ACTIVE',
            enrollmentDate: now,
            incidentDate: now,
            attributes: [
                { attribute: ATTR_ID, value: ATTR_VALUE },
                ...extraAttributes
            ]
        };

        const response = await fetch(`${BASE_URL}/api/enrollments`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify(enrollmentPayload)
        });

        const data = await response.json().catch(() => ({}));
        const importStatus = data?.status || data?.response?.status;
        if (!response.ok || (importStatus && !['OK', 'SUCCESS'].includes(String(importStatus).toUpperCase()))) {
            const errorMsg = data?.response?.importSummaries?.[0]?.description || data?.message || 'Assessment enrollment creation failed';
            console.error('❌ createAssessmentEnrollment failed:', data);
            throw new Error(errorMsg);
        }

        const enrollmentId =
            data?.response?.importSummaries?.[0]?.reference ||
            data?.importSummaries?.[0]?.reference ||
            data?.enrollment ||
            null;
        if (!enrollmentId) throw new Error('Assessment enrollment creation succeeded but enrollment UID was not returned.');
        return { teiId, enrollmentId };
    },

    /**
     * Create a complete assessment bundle (TEI, Enrollment, and all Events) in ONE request.
     * Used for Self Assessments to ensure atomic creation.
     */
    createAssessmentBundle: async ({ programId = 'G2gULe4jsfs', stageId = '', orgUnitId, teiId = null, enrollmentId = null, trackedEntityTypeId = 'uTTDt3fuXZK', extraAttributes = [], events = [] }) => {
        if (!orgUnitId) throw new Error('createAssessmentBundle: orgUnitId is required');

        const now = new Date().toISOString().slice(0, 10);
        const ATTR_ID = 'Bw4PZ8NsYFd';
        const ATTR_VALUE = 'FAC_ASS_TYPE_INTERNAL';

        const rootAttributes = [
            { attribute: ATTR_ID, value: ATTR_VALUE },
            ...extraAttributes
        ];

        const teiPayload = {
            trackedEntityType: trackedEntityTypeId,
            orgUnit: orgUnitId,
            attributes: rootAttributes,
            enrollments: [
                {
                    enrollment: enrollmentId,
                    program: programId,
                    orgUnit: orgUnitId,
                    status: 'ACTIVE',
                    enrolledAt: now,
                    occurredAt: now,
                    attributes: rootAttributes,
					    events: events.map(ev => ({
                        program: programId,
                        programStage: stageId,
                        orgUnit: orgUnitId,
                        status: ev.status || 'ACTIVE',
                        occurredAt: now,
                        dataValues: ev.dataValues || [],
                        notes: ev.notes || [],
					        ...(ev.event || ev.uid ? { event: ev.event || ev.uid } : {})
                    }))
                }
            ]
        };

        if (teiId) {
            teiPayload.trackedEntity = teiId;
        }

        const trackerPayload = {
            trackedEntities: [teiPayload]
        };

        console.log('[API] createAssessmentBundle payload:', trackerPayload);

        const response = await fetch(`${BASE_URL}/api/tracker?async=false`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                ...getHeaders()
            },
            body: JSON.stringify(trackerPayload)
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok || data.status !== 'OK') {
            const errorMsg = data.validationReport?.errorReports?.[0]?.message || data.message || 'Assessment bundle creation failed';
            console.error('❌ createAssessmentBundle failed:', data);
            const err = new Error(errorMsg);
            err.payload = trackerPayload;
            err.data = data;
            throw err;
        }

		const createdTeiId = data.bundleReport?.typeReportMap?.TRACKED_ENTITY?.objectReports?.[0]?.uid || teiId;
		const createdEnrollmentId = data.bundleReport?.typeReportMap?.ENROLLMENT?.objectReports?.[0]?.uid || enrollmentId;
		const createdEventIds = (data.bundleReport?.typeReportMap?.EVENT?.objectReports || [])
			.map(report => report?.uid)
			.filter(Boolean);
        
		return { teiId: createdTeiId, enrollmentId: createdEnrollmentId, eventIds: createdEventIds, trackerResponse: data };
    },

    /**
     * Create a new survey Event in the target program/stage for a TEI/orgUnit.
     * Returns the created event UID.
     */
    createSurveyEvent: async ({ programId = 'G2gULe4jsfs', stageId = '', orgUnitId, teiId, status = 'ACTIVE', eventDate = null, enrollmentId = null, notes = [], dataValues = [] }) => {
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
		        const STAGE_ID = configuration?.programStage?.id || '';
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
		        attributes: [{ attribute: ATTR_ID, value: ATTR_VALUE }], // Add TEI attributes here if needed
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
    },
    // Aliases for Survey Initiation Flow
    qimsTrackerEvents: async (params) => api.getSelfAssessmentAssessorUserIds(params),
    resolveUsers: async (identifiers) => api.resolveAdminUserDisplayNames(identifiers),

    // Direct option-set lookup (e.g. survey type options)
    getOptionSetOptions: async (optionSetId) => {
        try {
            const response = await fetch(`${BASE_URL}/api/optionSets/${optionSetId}.json?fields=options[id,code,name]`, { headers: getHeaders() });
            if (!response.ok) return [];
            const data = await response.json();
            return (data.options || []).map(o => ({ value: o.code || o.name, label: o.name }));
        } catch (e) {
            console.warn('getOptionSetOptions failed (non-fatal)', e);
            return [];
        }
    },

    // Query TEIs by org-unit to look up enrollment attribute values (e.g. baseline check)
    // Uses trackedEntityInstances.json (structured) instead of query.json (grid) for reliable attribute parsing
    getTeisByOrgUnitForBaselineCheck: async ({ orgUnitId, programId = 'G2gULe4jsfs' }) => {
        try {
            const params = new URLSearchParams({
                ou: orgUnitId,
                ouMode: 'DESCENDANTS',
                program: programId,
                pageSize: '500',
                page: '1'
            });
            const response = await fetch(`${BASE_URL}/api/trackedEntityInstances.json?${params.toString()}`, { headers: getHeaders() });
            if (!response.ok) return null;
            return await response.json();
        } catch (e) {
            console.warn('getTeisByOrgUnitForBaselineCheck failed (non-fatal)', e);
            return null;
        }
    },

    // Temporary diagnostic helper to inspect a single enrollment
    getEnrollmentDetails: async (enrollmentId, fields = '*') => {
        try {
            const response = await fetch(`${BASE_URL}/api/enrollments/${enrollmentId}.json?fields=${encodeURIComponent(fields)}`, { headers: getHeaders() });
            if (!response.ok) return null;
            return await response.json();
        } catch (e) {
            console.warn('getEnrollmentDetails failed (non-fatal)', e);
            return null;
        }
    }
};
