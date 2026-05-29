import React, { useState } from 'react';
import { useApp } from '../contexts/AppContext';
import { api } from '../services/api';
import { Button, TextField, Dialog, DialogTitle, DialogContent, DialogActions, Autocomplete, CircularProgress } from '@mui/material';

export default function Admin() {
  const { configuration, showToast, userAssignments } = useApp();
  const defaultProgramId = configuration?.program?.id || 'G2gULe4jsfs';

  const [programId, setProgramId] = useState(defaultProgramId);
  const [orgUnitId, setOrgUnitId] = useState('');
  const [useAllAssignmentOus, setUseAllAssignmentOus] = useState(true);
  const [orgUnitLabel, setOrgUnitLabel] = useState('');
  const [ouOptions, setOuOptions] = useState([]);
  const [ouLoading, setOuLoading] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null); // {count, sampleIds: []}
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const confirmPhrase = `DELETE ${programId}`;
  const norm = (s) => String(s || '').toUpperCase().replace(/\s+/g, ' ').trim();
  const canDelete = norm(confirmText) === norm(confirmPhrase) || norm(confirmText) === 'DELETE';

  // TEI Authorisation Checker state
  const [teiIdInput, setTeiIdInput] = useState('');
  const [teiChecking, setTeiChecking] = useState(false);
  const [teiResult, setTeiResult] = useState(null);
  const [inspectEnrollmentId, setInspectEnrollmentId] = useState('');
  const [inspectTeiId, setInspectTeiId] = useState('');
  const [inspectLoading, setInspectLoading] = useState(false);
  const [inspectResult, setInspectResult] = useState(null);

  const schedulingProgramId = 'K9O5fdoBmKf';
	  const SURVEY_PROGRAM_ATTRIBUTE_IDS = {
	    assessmentTypeSelected: 'qrTQdWKRYMB',
	    assessmentType: 'Bw4PZ8NsYFd',
	  };
  const assignmentOrgUnitIds = Array.from(new Set((userAssignments || []).map(a => (typeof a.orgUnit === 'string' ? a.orgUnit : a.orgUnit?.id || a.orgUnitId)).filter(Boolean)));

	  const getAttributeValue = (attributes, attributeId, displayNameIncludes = []) => {
	    const normalizedNames = displayNameIncludes.map(name => String(name || '').replace(/\s+/g, ' ').toLowerCase());
	    const attr = (attributes || []).find(item => {
	      if (item?.attribute === attributeId) return true;
	      const displayName = String(item?.displayName || '').replace(/\s+/g, ' ').toLowerCase();
	      return normalizedNames.some(name => displayName.includes(name));
	    });
	    const value = attr?.value;
	    return value === undefined || value === null || String(value).trim() === '' ? null : value;
	  };

	  const getActiveAssessmentTypeValue = (item) => (
	    item?.typeOfAssessment
	    || item?.assessmentType
	    || getAttributeValue(item?.attributes, SURVEY_PROGRAM_ATTRIBUTE_IDS.assessmentTypeSelected, ['assessment type of assessment selected'])
	    || getAttributeValue(item?.attributes, SURVEY_PROGRAM_ATTRIBUTE_IDS.assessmentType, ['assessment type'])
	    || '-'
	  );

  const runDryRun = async () => {
    try {
      setLoading(true);
      setResult(null);
      let list = [];
      if (useAllAssignmentOus) {
        const ouIds = Array.from(new Set((userAssignments || []).map(a => (typeof a.orgUnit === 'string' ? a.orgUnit : a.orgUnit?.id || a.orgUnitId)).filter(Boolean)));
        list = await api.listEventsByProgramMultiOrgUnits({ programId, orgUnitIds: ouIds, startDate: startDate || undefined, endDate: endDate || undefined });
      } else {
        list = await api.listEventsByProgram({ programId, orgUnitId: orgUnitId || undefined, startDate: startDate || undefined, endDate: endDate || undefined });
      }
      const ids = Array.isArray(list) ? list : [];
      setResult({ count: ids.length, sampleIds: ids.slice(0, 10) });
      showToast?.(`Found ${ids.length} events. Showing first 10 IDs.`, 'info');
    } catch (e) {
      console.error('Admin dry run failed', e);
      showToast?.('Dry run failed. Check console/logs.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const openDelete = async () => {
    setConfirmText('');
    setConfirmOpen(true);
  };

  const performDelete = async () => {
    if (!canDelete) return;
    try {
      setLoading(true);
      let ids = [];
      if (useAllAssignmentOus) {
        const ouIds = Array.from(new Set((userAssignments || []).map(a => (typeof a.orgUnit === 'string' ? a.orgUnit : a.orgUnit?.id || a.orgUnitId)).filter(Boolean)));
        ids = await api.listEventsByProgramMultiOrgUnits({ programId, orgUnitIds: ouIds, startDate: startDate || undefined, endDate: endDate || undefined });
      } else {
        ids = await api.listEventsByProgram({ programId, orgUnitId: orgUnitId || undefined, startDate: startDate || undefined, endDate: endDate || undefined });
      }
      const deleted = await api.deleteEventsByIds(ids);
      showToast?.(`Deleted ${deleted.deleted} of ${deleted.total} events`, 'success');
      setResult(null);
    } catch (e) {
      console.error('Admin delete failed', e);
      showToast?.(`Delete failed: ${e.message || e}`, 'error');
    } finally {
      setLoading(false);
      setConfirmOpen(false);
    }
  };

  // Search organisation units (debounced inline)
  const handleOuInputChange = async (event, value) => {
    setOrgUnitLabel(value);
    const term = String(value || '').trim();
    if (!term || term.length < 2) { setOuOptions([]); return; }
    try {
      setOuLoading(true);
      const rows = await api.searchOrganisationUnits(term, { max: 20 });
      const opts = rows.map(r => ({ id: r.id, label: r.displayName, level: r.level, parent: r.parent?.displayName }));
      setOuOptions(opts);
    } finally {
      setOuLoading(false);
    }
  };

  const handleOuChange = (event, newValue) => {
    if (newValue && newValue.id) {
      setOrgUnitId(newValue.id);
      setOrgUnitLabel(newValue.label || '');
    } else {
      setOrgUnitId('');
    }
  };

  // Active Assessments Manager State
  const [activeList, setActiveList] = useState([]);
  const [activeLoading, setActiveLoading] = useState(false);
  const [activeDeleteTeiId, setActiveDeleteTeiId] = useState(null);
  const ENROLLMENT_DELETE_PROGRAM_ID = 'G2gULe4jsfs';
  const deletableActiveList = activeList.filter(item => item.programId === ENROLLMENT_DELETE_PROGRAM_ID && item.enrollmentId && String(item.status || '').toUpperCase() === 'ACTIVE');

  const fetchActiveAssessments = async () => {
    try {
      setActiveLoading(true);
      setActiveList([]);
      let orgUnits = [];
      if (useAllAssignmentOus) {
          orgUnits = assignmentOrgUnitIds;
      } else if (orgUnitId) {
          orgUnits = [orgUnitId];
      }

      let allActive = [];
      if (orgUnits.length === 0) {
          // Fetch ALL across the whole system (no org unit limit)
          const list1 = await api.getEnrollmentsByStatusesDirect(programId, null, ['ACTIVE', 'COMPLETED']);
          let list2 = [];
          if (programId !== schedulingProgramId) {
              list2 = await api.getEnrollmentsByStatusesDirect(schedulingProgramId, null, ['ACTIVE', 'COMPLETED']);
          }
          allActive = [...list1, ...list2];
      } else {
          for (const ou of orgUnits) {
              const list1 = await api.getEnrollmentsByStatusesDirect(programId, ou, ['ACTIVE', 'COMPLETED']);
              let list2 = [];
              if (programId !== schedulingProgramId) {
                  list2 = await api.getEnrollmentsByStatusesDirect(schedulingProgramId, ou, ['ACTIVE', 'COMPLETED']);
              }
              allActive = [...allActive, ...list1, ...list2];
          }
      }
      const dedupedActive = Array.from(
        new Map(allActive.map(item => [item.enrollmentId || `${item.programId}-${item.teiId}`, item])).values()
      );
      setActiveList(dedupedActive);
      showToast?.(`Found ${dedupedActive.length} assessments`, 'info');
    } catch (e) {
      console.error('Failed to fetch active assessments', e);
      showToast?.('Failed to fetch active assessments', 'error');
    } finally {
      setActiveLoading(false);
    }
  };

  const inspectEnrollmentOrTei = async () => {
    const enrollmentId = String(inspectEnrollmentId || '').trim();
    const teiId = String(inspectTeiId || '').trim();
    if (!enrollmentId && !teiId) {
      showToast?.('Enter an Enrollment ID or TEI ID to inspect.', 'error');
      return;
    }

    try {
      setInspectLoading(true);
      setInspectResult(null);

      const relevantProgramIds = Array.from(new Set([programId, schedulingProgramId].filter(Boolean)));
      const scopeOrgUnitIds = useAllAssignmentOus ? assignmentOrgUnitIds : (orgUnitId ? [orgUnitId] : []);

      let enrollment = null;
      if (enrollmentId) {
        enrollment = await api.getEnrollmentById(enrollmentId);
      }

      const resolvedTeiId = teiId || enrollment?.trackedEntityInstance || '';
      let tei = null;
      if (resolvedTeiId) {
        const teiResponse = await api.getTrackedEntityInstances([resolvedTeiId]);
        tei = (teiResponse?.trackedEntityInstances || []).find(item => item?.trackedEntityInstance === resolvedTeiId) || null;
      }

      const teiEnrollments = Array.isArray(tei?.enrollments) ? tei.enrollments : [];
      const teiMatchedEnrollment = enrollmentId
        ? teiEnrollments.find(item => item?.enrollment === enrollmentId) || null
        : null;
      const inspectedEnrollment = teiMatchedEnrollment || enrollment || null;
      const normalizedStatus = String(inspectedEnrollment?.status || '').toUpperCase();
      const matchesProgramFilter = inspectedEnrollment ? relevantProgramIds.includes(inspectedEnrollment.program) : null;
      const isActiveEnrollment = inspectedEnrollment ? normalizedStatus === 'ACTIVE' : null;
      const isDeletedEnrollment = inspectedEnrollment?.deleted === true;
      const effectiveOrgUnit = inspectedEnrollment?.orgUnit || tei?.orgUnit || '';
      const exactScopeMatch = scopeOrgUnitIds.length === 0 ? true : scopeOrgUnitIds.includes(effectiveOrgUnit);

      setInspectResult({
        requestedEnrollmentId: enrollmentId,
        requestedTeiId: teiId,
        enrollment,
        tei,
        teiEnrollments,
        inspectedEnrollment,
        relevantProgramIds,
        scopeOrgUnitIds,
        effectiveOrgUnit,
        checks: {
          matchesProgramFilter,
          isActiveEnrollment,
          isDeletedEnrollment,
          exactScopeMatch,
          teiContainsEnrollment: enrollmentId ? Boolean(teiMatchedEnrollment) : null,
        },
      });

      showToast?.(`Loaded inspector details for ${enrollmentId || resolvedTeiId}`, 'info');
    } catch (e) {
      console.error('Enrollment / TEI inspector failed', e);
      showToast?.(`Inspector failed: ${e.message || e}`, 'error');
    } finally {
      setInspectLoading(false);
    }
  };

  const performEnrollmentDelete = async ({ enrollmentId, teiId, programId }) => {
    if (!enrollmentId) {
      showToast?.('This row does not have an enrollment ID to delete.', 'error');
      return;
    }
    if (!window.confirm(`Are you absolutely sure you want to delete enrollment ${enrollmentId}${teiId ? ` for TEI ${teiId}` : ''}? This will remove that enrollment and its events only.`)) {
      return;
    }
    try {
      setActiveLoading(true);
      await api.deleteEnrollmentCascade(enrollmentId, { programId });
      showToast?.(`Successfully deleted enrollment ${enrollmentId}`, 'success');
      setActiveList(prev => prev.filter(item => item.enrollmentId !== enrollmentId));
    } catch (e) {
      console.error('Failed to delete enrollment', e);
      showToast?.(`Delete failed: ${e.message}`, 'error');
    } finally {
      setActiveLoading(false);
    }
  };

  const performDeleteAllEnrollments = async () => {
    if (deletableActiveList.length === 0) return;
    if (!window.confirm(`Are you absolutely sure you want to delete ALL ${deletableActiveList.length} deletable enrollments shown in this table? This cannot be undone!`)) {
      return;
    }
    try {
      setActiveLoading(true);
      let successCount = 0;
      let failCount = 0;
      for (const item of deletableActiveList) {
          try {
              await api.deleteEnrollmentCascade(item.enrollmentId, { programId: item.programId });
              successCount++;
          } catch (e) {
              console.error(`Failed to delete enrollment ${item.enrollmentId}`, e);
              failCount++;
          }
      }
      showToast?.(`Successfully deleted ${successCount} enrollments. Failed to delete ${failCount} enrollments.`, failCount > 0 ? 'warning' : 'success');
      await fetchActiveAssessments();
    } catch (e) {
      console.error('Bulk enrollment deletion failed', e);
      showToast?.('Bulk enrollment deletion failed', 'error');
    } finally {
      setActiveLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 820, margin: '20px auto', padding: 16 }}>
      <h2>Admin Utilities</h2>
      
      {/* Search Filters shared by utilities */}
      <div style={{ marginTop: 8, padding: 12, border: '1px solid #e5e7eb', borderRadius: 6, marginBottom: 16 }}>
        <h3>Target Filter</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <TextField label="Program ID" value={programId} onChange={e => setProgramId(e.target.value)} size="small" />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input id="use-all-ous" type="checkbox" checked={useAllAssignmentOus} onChange={e => setUseAllAssignmentOus(e.target.checked)} />
            <label htmlFor="use-all-ous">Use all assignment org units</label>
          </div>
          <Autocomplete
            options={ouOptions}
            loading={ouLoading}
            onInputChange={handleOuInputChange}
            onChange={handleOuChange}
            filterOptions={(x) => x}
            value={orgUnitId ? { id: orgUnitId, label: orgUnitLabel } : null}
            getOptionLabel={(opt) => opt?.label || ''}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Search Org Unit (optional)"
                placeholder="Type 2+ characters"
                size="small"
                InputProps={{
                  ...params.InputProps,
                  endAdornment: (
                    <>
                      {ouLoading ? <CircularProgress color="inherit" size={16} /> : null}
                      {params.InputProps.endAdornment}
                    </>
                  ),
                }}
              />
            )}
            disabled={useAllAssignmentOus}
          />
          <TextField type="date" label="Start Date (optional)" value={startDate} onChange={e => setStartDate(e.target.value)} size="small" InputLabelProps={{ shrink: true }} />
          <TextField type="date" label="End Date (optional)" value={endDate} onChange={e => setEndDate(e.target.value)} size="small" InputLabelProps={{ shrink: true }} />
        </div>
      </div>

      {/* Active Assessments Manager */}
      <div style={{ marginTop: 8, padding: 12, border: '1px solid #e5e7eb', borderRadius: 6, marginBottom: 16 }}>
        <h3>Manage Assessments (Safe Deletion)</h3>
        <p style={{ color: '#6b7280' }}>Fetch ACTIVE and COMPLETED assessments. Deleting an assessment here removes only the selected enrollment and its events, without deleting the whole TEI. Bulk delete-all remains limited to ACTIVE rows. Enrollment deletion is only allowed for program {ENROLLMENT_DELETE_PROGRAM_ID}.</p>
        <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="contained" onClick={fetchActiveAssessments} disabled={activeLoading}>
                {activeLoading ? 'Loading...' : 'Fetch Assessments'}
            </Button>
            {deletableActiveList.length > 0 && (
                <Button variant="contained" color="error" onClick={performDeleteAllEnrollments} disabled={activeLoading}>
                    {activeLoading ? 'Deleting...' : `Delete All Enrollments (${deletableActiveList.length})`}
                </Button>
            )}
        </div>
        
        {activeList.length > 0 && (
            <div style={{ marginTop: 12 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                    <thead>
                        <tr style={{ background: '#f9fafb', textAlign: 'left' }}>
                            <th style={{ padding: 8, borderBottom: '1px solid #ddd' }}>Facility</th>
                            <th style={{ padding: 8, borderBottom: '1px solid #ddd' }}>Program</th>
	                            <th style={{ padding: 8, borderBottom: '1px solid #ddd' }}>Type of Assessment</th>
	                            <th style={{ padding: 8, borderBottom: '1px solid #ddd' }}>Status</th>
                            <th style={{ padding: 8, borderBottom: '1px solid #ddd' }}>TEI UID</th>
                            <th style={{ padding: 8, borderBottom: '1px solid #ddd' }}>Enrollment ID</th>
                            <th style={{ padding: 8, borderBottom: '1px solid #ddd' }}>Enrolled At</th>
                            <th style={{ padding: 8, borderBottom: '1px solid #ddd' }}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {activeList.map(item => {
                            const canDeleteEnrollment = item.programId === ENROLLMENT_DELETE_PROGRAM_ID;
                            return (
                            <tr key={item.enrollmentId || `${item.programId}-${item.teiId}`}>
                                <td style={{ padding: 8, borderBottom: '1px solid #eee' }}>{item.orgUnitName || item.orgUnit}</td>
                                <td style={{ padding: 8, borderBottom: '1px solid #eee' }}>
                                    {item.programId === configuration?.program?.id ? (configuration?.program?.name || item.programId) : item.programId}
                                </td>
	                                <td style={{ padding: 8, borderBottom: '1px solid #eee' }}>{getActiveAssessmentTypeValue(item)}</td>
	                                <td style={{ padding: 8, borderBottom: '1px solid #eee', fontWeight: 600 }}>{item.status || 'N/A'}</td>
                                <td style={{ padding: 8, borderBottom: '1px solid #eee' }}><code>{item.teiId}</code></td>
                                <td style={{ padding: 8, borderBottom: '1px solid #eee' }}><code>{item.enrollmentId || 'N/A'}</code></td>
                                <td style={{ padding: 8, borderBottom: '1px solid #eee' }}>{new Date(item.enrollmentDate).toLocaleDateString()}</td>
                                <td style={{ padding: 8, borderBottom: '1px solid #eee' }}>
                                    {canDeleteEnrollment ? (
                                        <Button size="small" color="error" variant="outlined" onClick={() => performEnrollmentDelete({ enrollmentId: item.enrollmentId, teiId: item.teiId, programId: item.programId })} disabled={activeLoading || !item.enrollmentId}>
                                            Delete Enrollment
                                        </Button>
                                    ) : null}
                                </td>
                            </tr>
                        );})}
                    </tbody>
                </table>
            </div>
        )}
      </div>

      {/* Enrollment / TEI Inspector */}
      <div style={{ marginTop: 8, padding: 12, border: '1px solid #e5e7eb', borderRadius: 6, marginBottom: 16 }}>
        <h3>Enrollment / TEI Inspector</h3>
        <p style={{ color: '#6b7280', marginTop: 4 }}>
          Directly inspect an enrollment ID or TEI ID and compare it against the current Active Assessments filters.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 8, alignItems: 'center' }}>
          <TextField
            label="Enrollment ID"
            size="small"
            value={inspectEnrollmentId}
            onChange={e => setInspectEnrollmentId(e.target.value.trim())}
            placeholder="e.g. XKvgbPRMm4l"
          />
          <TextField
            label="TEI ID"
            size="small"
            value={inspectTeiId}
            onChange={e => setInspectTeiId(e.target.value.trim())}
            placeholder="e.g. oy96rL4BeCY"
          />
          <Button variant="outlined" disabled={inspectLoading || (!inspectEnrollmentId && !inspectTeiId)} onClick={inspectEnrollmentOrTei}>
            {inspectLoading ? 'Inspecting…' : 'Inspect'}
          </Button>
        </div>

        {inspectResult && (() => {
          const { enrollment, tei, teiEnrollments, inspectedEnrollment, relevantProgramIds, scopeOrgUnitIds, effectiveOrgUnit, checks } = inspectResult;
          const formatProgram = (value) => {
            if (!value) return 'N/A';
            if (value === configuration?.program?.id) return configuration?.program?.name || value;
            if (value === schedulingProgramId) return `Scheduling Program (${value})`;
            return value;
          };
          const formatDate = (value) => (value ? new Date(value).toLocaleString() : 'N/A');
          const statusColor = (ok, warn = false) => ok
            ? { color: '#166534', background: '#dcfce7', border: '1px solid #86efac' }
            : warn
              ? { color: '#92400e', background: '#fef3c7', border: '1px solid #fcd34d' }
              : { color: '#991b1b', background: '#fee2e2', border: '1px solid #fca5a5' };

          return (
            <div style={{ marginTop: 12, fontSize: 14, color: '#374151' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div style={{ background: '#f9fafb', borderRadius: 6, padding: 10 }}>
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>Enrollment</div>
                  <div>ID: <code>{inspectedEnrollment?.enrollment || enrollment?.enrollment || 'Not found'}</code></div>
                  <div>Program: <strong>{formatProgram(inspectedEnrollment?.program || enrollment?.program)}</strong></div>
                  <div>Status: <strong>{inspectedEnrollment?.status || enrollment?.status || 'N/A'}</strong></div>
                  <div>Deleted: <strong>{inspectedEnrollment?.deleted === true || enrollment?.deleted === true ? 'YES' : 'NO / not returned'}</strong></div>
                  <div>Org Unit: <code>{inspectedEnrollment?.orgUnit || enrollment?.orgUnit || 'N/A'}</code></div>
                  <div>Enrollment Date: <strong>{formatDate(inspectedEnrollment?.enrollmentDate || enrollment?.enrollmentDate)}</strong></div>
                </div>
                <div style={{ background: '#f9fafb', borderRadius: 6, padding: 10 }}>
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>Tracked Entity</div>
                  <div>TEI: <code>{tei?.trackedEntityInstance || enrollment?.trackedEntityInstance || 'Not found'}</code></div>
                  <div>TEI Org Unit: <code>{tei?.orgUnit || 'N/A'}</code></div>
                  <div>Effective Org Unit for check: <code>{effectiveOrgUnit || 'N/A'}</code></div>
                  <div>Total enrollments on TEI: <strong>{teiEnrollments.length}</strong></div>
                  <div>Current program filter: <strong>{formatProgram(programId)}</strong></div>
                  <div>Also checked by admin: <strong>{formatProgram(schedulingProgramId)}</strong></div>
                </div>
              </div>

              <div style={{ marginTop: 12 }}>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>Would Active Fetch include it?</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ padding: '4px 8px', borderRadius: 9999, ...statusColor(Boolean(checks.matchesProgramFilter)) }}>
                    Program match: {checks.matchesProgramFilter ? 'YES' : 'NO'}
                  </span>
                  <span style={{ padding: '4px 8px', borderRadius: 9999, ...statusColor(Boolean(checks.isActiveEnrollment)) }}>
                    Active status: {checks.isActiveEnrollment ? 'YES' : 'NO'}
                  </span>
                  <span style={{ padding: '4px 8px', borderRadius: 9999, ...statusColor(!checks.isDeletedEnrollment) }}>
                    Not deleted: {checks.isDeletedEnrollment ? 'NO' : 'YES'}
                  </span>
                  {checks.teiContainsEnrollment !== null && (
                    <span style={{ padding: '4px 8px', borderRadius: 9999, ...statusColor(Boolean(checks.teiContainsEnrollment)) }}>
                      Enrollment on TEI: {checks.teiContainsEnrollment ? 'YES' : 'NO'}
                    </span>
                  )}
                  <span style={{ padding: '4px 8px', borderRadius: 9999, ...statusColor(Boolean(checks.exactScopeMatch), scopeOrgUnitIds.length > 0 && !checks.exactScopeMatch) }}>
                    Exact scope match: {checks.exactScopeMatch ? 'YES' : 'NO'}
                  </span>
                </div>
                <div style={{ marginTop: 8, color: '#6b7280' }}>
                  Scope mode: <strong>{useAllAssignmentOus ? 'All assignment org units' : (orgUnitId ? 'Selected org unit' : 'No org unit restriction')}</strong>
                  {scopeOrgUnitIds.length > 0 ? ` (${scopeOrgUnitIds.join(', ')})` : ''}
                </div>
                <div style={{ marginTop: 4, color: '#6b7280' }}>
                  Note: the Active Assessments fetch uses DHIS2 server-side <code>DESCENDANTS</code> filtering on TEIs, so a non-exact org-unit match may still be included if the TEI is under a descendant org unit.
                </div>
              </div>

              {teiEnrollments.length > 0 && (
                <div style={{ marginTop: 12, overflowX: 'auto' }}>
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>Enrollments on this TEI</div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: '#f9fafb', textAlign: 'left' }}>
                        <th style={{ padding: 8, borderBottom: '1px solid #ddd' }}>Enrollment</th>
                        <th style={{ padding: 8, borderBottom: '1px solid #ddd' }}>Program</th>
                        <th style={{ padding: 8, borderBottom: '1px solid #ddd' }}>Status</th>
                        <th style={{ padding: 8, borderBottom: '1px solid #ddd' }}>Deleted</th>
                        <th style={{ padding: 8, borderBottom: '1px solid #ddd' }}>Org Unit</th>
                        <th style={{ padding: 8, borderBottom: '1px solid #ddd' }}>Enrollment Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {teiEnrollments.map(item => {
                        const isTarget = item?.enrollment && item.enrollment === inspectEnrollmentId;
                        return (
                          <tr key={item.enrollment || `${item.program}-${item.orgUnit}`} style={{ background: isTarget ? '#eff6ff' : 'transparent' }}>
                            <td style={{ padding: 8, borderBottom: '1px solid #eee' }}><code>{item.enrollment || 'N/A'}</code></td>
                            <td style={{ padding: 8, borderBottom: '1px solid #eee' }}>{formatProgram(item.program)}</td>
                            <td style={{ padding: 8, borderBottom: '1px solid #eee' }}>{item.status || 'N/A'}</td>
                            <td style={{ padding: 8, borderBottom: '1px solid #eee' }}>{item.deleted ? 'YES' : 'NO'}</td>
                            <td style={{ padding: 8, borderBottom: '1px solid #eee' }}><code>{item.orgUnit || 'N/A'}</code></td>
                            <td style={{ padding: 8, borderBottom: '1px solid #eee' }}>{formatDate(item.enrollmentDate)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })()}
      </div>

      {/* Bulk Delete Events */}
      <div style={{ marginTop: 8, padding: 12, border: '1px solid #e5e7eb', borderRadius: 6 }}>
        <h3>Bulk Delete Survey Events (Dangerous)</h3>
        <p style={{ color: '#6b7280' }}>Bulk delete isolated events without deleting the TEI. Always run a Dry Run first.</p>
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <Button variant="outlined" onClick={runDryRun} disabled={loading}>Dry Run: Count</Button>
          <Button variant="contained" color="error" onClick={openDelete} disabled={loading}>Delete…</Button>
        </div>
        {result && (
          <div style={{ marginTop: 12, fontSize: 14, color: '#374151' }}>
            <div>Events found: <strong>{result.count}</strong></div>
            {result.sampleIds?.length > 0 && (
              <div style={{ marginTop: 6 }}>
                Sample IDs:
                <pre style={{ background: '#f9fafb', padding: 8, borderRadius: 4, maxHeight: 160, overflow: 'auto' }}>{result.sampleIds.join('\n')}</pre>
              </div>
            )}
          </div>
        )}
      </div>

      {/* TEI Authorisation Checker */}
      <div style={{ marginTop: 16, padding: 12, border: '1px solid #e5e7eb', borderRadius: 6 }}>
        <h3>TEI Authorisation Checker</h3>
        <p style={{ color: '#6b7280', marginTop: 4 }}>
          Check if a Tracked Entity Instance (TEI) has an authorised assessment in the Scheduling program.
        </p>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <TextField
            label="TEI UID"
            size="small"
            value={teiIdInput}
            onChange={e => setTeiIdInput(e.target.value.trim())}
            placeholder="e.g. UtpXiIcqvHW"
            style={{ flex: 1 }}
          />
          <Button
            variant="outlined"
            disabled={teiChecking || !teiIdInput}
            onClick={async () => {
              try {
                setTeiChecking(true);
                setTeiResult(null);
                const res = await api.checkTeiAuthorisation(teiIdInput);
                setTeiResult(res);
                const status = res.hasAuthorised ? 'YES' : 'NO';
                showToast?.(`Authorised: ${status} (accepted=${res.acceptedCount}, approved=${res.approvedCount})`, res.hasAuthorised ? 'success' : 'info');
              } catch (e) {
                console.error('TEI check failed', e);
                showToast?.(`TEI check failed: ${e.message || e}`, 'error');
              } finally {
                setTeiChecking(false);
              }
            }}
          >
            {teiChecking ? 'Checking…' : 'Check'}
          </Button>
        </div>
        {teiResult && (
          <div style={{ marginTop: 10, fontSize: 14, color: '#374151' }}>
            <div>TEI: <strong>{teiResult.teiId}</strong></div>
            <div>Authorised: <strong>{teiResult.hasAuthorised ? 'YES' : 'NO'}</strong></div>
            <div>Accepted team events: <strong>{teiResult.acceptedCount}</strong> (latest: {teiResult.latestAcceptedDate || 'n/a'})</div>
            <div>Approved setup events: <strong>{teiResult.approvedCount}</strong> (latest: {teiResult.latestApprovedDate || 'n/a'})</div>
            {teiResult.sample && (
              <div style={{ marginTop: 6 }}>
                <div>Sample accepted event: {teiResult.sample.acceptedEventId || 'n/a'} (enrollment: {teiResult.sample.enrollmentAccepted || 'n/a'})</div>
                <div>Sample approved event: {teiResult.sample.approvedEventId || 'n/a'} (enrollment: {teiResult.sample.enrollmentApproved || 'n/a'})</div>
              </div>
            )}
          </div>
        )}
      </div>

      <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)}>
        <DialogTitle>Confirm Deletion</DialogTitle>
        <DialogContent>
          <p>You are about to delete events in program <strong>{programId}</strong>.</p>
          <ul>
            {orgUnitId && <li>Org Unit: {orgUnitId}</li>}
            {startDate && <li>Start Date: {startDate}</li>}
            {endDate && <li>End Date: {endDate}</li>}
          </ul>
          <p>Type <code>{confirmPhrase}</code> to confirm.</p>
          <TextField fullWidth autoFocus size="small" value={confirmText} onChange={e => setConfirmText(e.target.value)} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmOpen(false)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={performDelete} disabled={!canDelete || loading}>Delete</Button>
        </DialogActions>
      </Dialog>
    </div>
  );
}
