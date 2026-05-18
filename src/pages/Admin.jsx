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

  const fetchActiveAssessments = async () => {
    try {
      setActiveLoading(true);
      setActiveList([]);
      let orgUnits = [];
      if (useAllAssignmentOus) {
          orgUnits = Array.from(new Set((userAssignments || []).map(a => (typeof a.orgUnit === 'string' ? a.orgUnit : a.orgUnit?.id || a.orgUnitId)).filter(Boolean)));
      } else if (orgUnitId) {
          orgUnits = [orgUnitId];
      }

      if (orgUnits.length === 0) {
          showToast?.('Please select an Org Unit or Use all assignment org units', 'warning');
          return;
      }

      let allActive = [];
      for (const ou of orgUnits) {
          const list = await api.getActiveEnrollments(programId, ou);
          allActive = [...allActive, ...list];
      }
      setActiveList(allActive);
      showToast?.(`Found ${allActive.length} active assessments`, 'info');
    } catch (e) {
      console.error('Failed to fetch active assessments', e);
      showToast?.('Failed to fetch active assessments', 'error');
    } finally {
      setActiveLoading(false);
    }
  };

  const performTeiDelete = async (teiId) => {
    if (!window.confirm(`Are you absolutely sure you want to completely delete this TEI (${teiId}) and all of its enrollments/events?`)) {
      return;
    }
    try {
      setActiveLoading(true);
      await api.deleteTrackedEntityInstance(teiId);
      showToast?.(`Successfully deleted TEI ${teiId}`, 'success');
      // remove from list
      setActiveList(prev => prev.filter(item => item.teiId !== teiId));
    } catch (e) {
      console.error('Failed to delete TEI', e);
      showToast?.(`Delete failed: ${e.message}`, 'error');
    } finally {
      setActiveLoading(false);
    }
  };

  const performDeleteAllTeis = async () => {
    if (activeList.length === 0) return;
    if (!window.confirm(`Are you absolutely sure you want to completely delete ALL ${activeList.length} tracked entities shown in this table? This cannot be undone!`)) {
      return;
    }
    try {
      setActiveLoading(true);
      let successCount = 0;
      let failCount = 0;
      for (const item of activeList) {
          try {
              await api.deleteTrackedEntityInstance(item.teiId);
              successCount++;
          } catch (e) {
              console.error(`Failed to delete TEI ${item.teiId}`, e);
              failCount++;
          }
      }
      showToast?.(`Successfully deleted ${successCount} TEIs. Failed to delete ${failCount} TEIs.`, failCount > 0 ? 'warning' : 'success');
      await fetchActiveAssessments();
    } catch (e) {
      console.error('Bulk TEI deletion failed', e);
      showToast?.('Bulk TEI deletion failed', 'error');
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
        <h3>Manage Active Assessments (Safe Deletion)</h3>
        <p style={{ color: '#6b7280' }}>Fetch all currently active assessments. Deleting an assessment here deletes the entire TEI, safely freeing up the facility to start a new assessment.</p>
        <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="contained" onClick={fetchActiveAssessments} disabled={activeLoading}>
                {activeLoading ? 'Loading...' : 'Fetch Active Assessments'}
            </Button>
            {activeList.length > 0 && (
                <Button variant="contained" color="error" onClick={performDeleteAllTeis} disabled={activeLoading}>
                    {activeLoading ? 'Deleting...' : `Delete All (${activeList.length})`}
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
                            <th style={{ padding: 8, borderBottom: '1px solid #ddd' }}>TEI UID</th>
                            <th style={{ padding: 8, borderBottom: '1px solid #ddd' }}>Enrolled At</th>
                            <th style={{ padding: 8, borderBottom: '1px solid #ddd' }}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {activeList.map(item => (
                            <tr key={item.teiId}>
                                <td style={{ padding: 8, borderBottom: '1px solid #eee' }}>{item.orgUnitName || item.orgUnit}</td>
                                <td style={{ padding: 8, borderBottom: '1px solid #eee' }}>
                                    {item.programId === configuration?.program?.id ? (configuration?.program?.name || item.programId) : item.programId}
                                </td>
                                <td style={{ padding: 8, borderBottom: '1px solid #eee' }}><code>{item.teiId}</code></td>
                                <td style={{ padding: 8, borderBottom: '1px solid #eee' }}>{new Date(item.enrollmentDate).toLocaleDateString()}</td>
                                <td style={{ padding: 8, borderBottom: '1px solid #eee' }}>
                                    <Button size="small" color="error" variant="outlined" onClick={() => performTeiDelete(item.teiId)} disabled={activeLoading}>
                                        Delete TEI
                                    </Button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        )}
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
