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

  return (
    <div style={{ maxWidth: 820, margin: '20px auto', padding: 16 }}>
      <h2>Admin Utilities</h2>
      <div style={{ marginTop: 8, padding: 12, border: '1px solid #e5e7eb', borderRadius: 6 }}>
        <h3>Delete Survey Events (Dangerous)</h3>
        <p style={{ color: '#6b7280' }}>Delete events in the assessment program. Use filters to narrow scope. Always run a Dry Run first.</p>
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
            filterOptions={(x) => x} // server-side filtering
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
