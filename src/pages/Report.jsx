import React, { useEffect, useMemo, useState } from 'react';
import { useApp } from '../contexts/AppContext';
import { api } from '../services/api';
import { Button, TextField, MenuItem, FormControl, InputLabel, Select } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { useNavigate } from 'react-router-dom';
import { transformMetadata } from '../utils/transformers';
import { normalizeCriterionCode } from '../utils/normalization';
import { useAssessmentScoring } from '../hooks/useAssessmentScoring';
import { decorateHospitalLinksWithMatrixTags } from '../utils/hospitalMatrixTags';
import emsConfig from '../assets/ems_config.json';
import mortuaryConfig from '../assets/mortuary_config.json';
import clinicsConfig from '../assets/clinics_config.json';
import hospitalConfig from '../assets/hospital_config.json';
import emsLinks from '../assets/ems_links.json';
import mortuaryLinks from '../assets/mortuary_links.json';
import clinicsLinks from '../assets/clinics_links.json';
import hospitalLinks from '../assets/hospital_links.json';
import { setHospitalSubcriteriaConfig } from '../utils/scoring';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend
} from 'recharts';

export default function Report() {
  const { user, configuration, showToast, configBundles, activeConfigVersionId, userAssignments } = useApp();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [facilityOptions, setFacilityOptions] = useState([]); // [{id, name}]
  const [selectedFacilityId, setSelectedFacilityId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reportLoading, setReportLoading] = useState(false);
  const [reportInfo, setReportInfo] = useState(null); // { groupId, groupLabel, count, baselineDate, latestDate }
  const [reportAssessment, setReportAssessment] = useState(null);
  const [baselineAssessment, setBaselineAssessment] = useState(null);
  const [baselineProvisioned, setBaselineProvisioned] = useState(false);
  const [sectionLabels, setSectionLabels] = useState({});

  const programId = configuration?.program?.id || 'G2gULe4jsfs';
  const stageId = configuration?.programStage?.id || 'HpHD6u6MV37';

  // Compute a sensible default OU to search under (user's first org unit)
  const rootOrgUnitId = useMemo(() => {
    const ous = user?.organisationUnits || [];
    return ous[0]?.id || null;
  }, [user]);

  // Build groups from already loaded metadata (no extra network call)
  const groups = useMemo(() => {
    if (!configuration?.programStage) return [];
    try { return transformMetadata(configuration.programStage) || []; } catch { return []; }
  }, [configuration?.programStage]);

  // Build programme-specific scoring metadata from active configuration version
  const programmeScoringMeta = useMemo(() => {
    const bundle = (configBundles && activeConfigVersionId) ? (configBundles[activeConfigVersionId] || null) : null;
    const sourceConfig = bundle && bundle.config ? bundle.config : { ...emsConfig, ...mortuaryConfig, ...clinicsConfig, ...hospitalConfig };
    const baseLinks = bundle && bundle.links ? bundle.links : { ems: emsLinks, mortuary: mortuaryLinks, clinics: clinicsLinks, hospital: hospitalLinks };
    const effectiveLinks = { ...baseLinks, hospital: decorateHospitalLinksWithMatrixTags(baseLinks.hospital || hospitalLinks) };

    const buildMeta = (config, key, links) => {
      const linksDataLookup = {};
      (links || []).forEach(linkObj => {
        if (!linkObj || !linkObj.criteria) return;
        linksDataLookup[linkObj.criteria] = { roots: linkObj.root || [], linked_criteria: linkObj.linked_criteria || [] };
      });
      const severityLookup = {};
      try {
        (config?.[key] || []).forEach(se => {
          (se.sections || []).forEach(section => {
            (section.standards || []).forEach(standard => {
              (standard.criteria || []).forEach(crit => {
                if (crit && crit.id) severityLookup[crit.id] = crit.severity || 1;
              });
            });
          });
        });
      } catch {}
      return { linksDataLookup, severityLookup };
    };

    return {
      ems: buildMeta(sourceConfig, 'ems_full_configuration', effectiveLinks.ems || emsLinks),
      mortuary: buildMeta(sourceConfig, 'mortuary_full_configuration', effectiveLinks.mortuary || mortuaryLinks),
      clinics: buildMeta(sourceConfig, 'clinics_full_configuration', effectiveLinks.clinics || clinicsLinks),
      hospital: buildMeta(sourceConfig, 'hospital_full_configuration', effectiveLinks.hospital || hospitalLinks),
    };
  }, [configBundles, activeConfigVersionId]);

  // Keep hospital sub-criteria config in sync for scoring of roots
  useEffect(() => {
    const bundle = (configBundles && activeConfigVersionId) ? (configBundles[activeConfigVersionId] || null) : null;
    if (bundle && bundle.compute) setHospitalSubcriteriaConfig(bundle.compute);
    else setHospitalSubcriteriaConfig(null);
  }, [configBundles, activeConfigVersionId]);

  const FACILITY_GROUP_DE_ID = 'pzenrgsSny3';
  // Resolve the DataElement ID for "Type of Assessment" from loaded metadata
  const TYPE_OF_ASSESSMENT_DE_ID = useMemo(() => {
    const ps = configuration?.programStage;
    if (!ps) return null;
    const candidates = (ps.programStageDataElements || []).map(psde => psde.dataElement || psde);
    const match = candidates.find(de => {
      const n = (de?.displayName || de?.formName || de?.name || '').toLowerCase();
      return n.includes('type of assessment');
    });
    return match?.id || null;
  }, [configuration]);

  const isBaselineType = (val) => {
    if (val === undefined || val === null) return false;
    const raw = String(val);
    // Exact code provided by user (including trailing space)
    if (raw === 'Baseline Assessment ') return true;
    const trimmed = raw.trim();
    const v = trimmed.toLowerCase();
    // Common textual labels
    if (v === 'baseline' || v === 'baseline assessment' || v === 'base-line') return true;
    // Known code-like values that sometimes appear
    if (v === 'fac_ass_baseline' || v === 'baseline_assessment' || v === 'baseline_survey') return true;
    // Fallback: contains word baseline
    if (v.includes('baseline')) return true;
    return false;
  };
  const resolveGroupIdFromText = (text) => {
    if (!text) return null;
    const t = String(text).toLowerCase();
    if (t.includes('hosp')) return 'HOSPITAL';
    if (t.includes('clinic')) return 'CLINICS';
    if (t.includes('ems') || t.startsWith('se') || t.includes(' se')) return 'SE';
    if (t.includes('mortu') || t.includes('general')) return 'GENERAL';
    return null;
  };

  useEffect(() => {
    let cancelled = false;
    async function loadFacilitiesAuthorised() {
      setLoading(true);
      setError(null);
      try {
        let options = [];
        // Prefer authorised facilities from scheduling assignments
        if (Array.isArray(userAssignments) && userAssignments.length > 0) {
          const byOu = new Map();
          userAssignments.forEach(a => {
            const id = a.orgUnitId || (typeof a.orgUnit === 'string' ? a.orgUnit : a.orgUnit?.id);
            if (!id) return;
            if (!byOu.has(id)) byOu.set(id, a.orgUnitName || (a.orgUnit && (a.orgUnit.displayName || a.orgUnit.name)) || id);
          });
          options = [...byOu.entries()].map(([id, name]) => ({ id, name }));
        } else if (rootOrgUnitId) {
          // Fallback: discover facilities that already have assessments under user's OU
          const events = await api.getEventsList({
            programId,
            stageId,
            orgUnitId: rootOrgUnitId,
            ouMode: 'DESCENDANTS',
            order: 'eventDate:asc',
            fields: 'event,eventDate,orgUnit,trackedEntityInstance,status',
          });
          const facilityIds = [...new Set((events || []).map(e => e.orgUnit).filter(Boolean))];
          const detailed = await Promise.all(
            facilityIds.map(async (id) => {
              try {
                const ou = await api.getFacilityDetails(id);
                return { id, name: ou.displayName || ou.name || id };
              } catch (_) {
                return { id, name: id };
              }
            })
          );
          options = detailed;
        }

        if (cancelled) return;
        options.sort((a, b) => String(a.name).localeCompare(String(b.name)));
        setFacilityOptions(options);
        if (options.length === 1) setSelectedFacilityId(options[0].id);
      } catch (e) {
        console.error('Report: failed to load facilities list', e);
        if (!cancelled) setError('Failed to load facilities');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadFacilitiesAuthorised();
    return () => { cancelled = true; };
  }, [userAssignments, programId, stageId, rootOrgUnitId]);

  const handleGenerate = () => {
    (async () => {
      if (!selectedFacilityId) { showToast?.('Please select a facility.', 'warning'); return; }
      if (startDate && endDate && new Date(startDate) > new Date(endDate)) { showToast?.('Start date must be before end date.', 'warning'); return; }
      setReportLoading(true);
      setReportInfo(null);
      setReportAssessment(null);
      try {
        // Fetch all events for this facility OU, then filter by date range client-side
        const events = await api.getEventsList({
          programId, stageId, orgUnitId: selectedFacilityId, ouMode: 'SELECTED', order: 'eventDate:asc',
          fields: 'event,eventDate,orgUnit,trackedEntityInstance,status,dataValues[dataElement,value]'
        });
        const all = Array.isArray(events) ? events : [];

        // If there are no assessments at all for this facility, provision a baseline event
        if (all.length === 0) {
          try {
            const match = (Array.isArray(userAssignments) ? userAssignments : []).find(a => {
              const ouId = a.orgUnitId || (typeof a.orgUnit === 'string' ? a.orgUnit : a.orgUnit?.id);
              return ouId === selectedFacilityId;
            });
            const teiId = match?.trackedEntityInstance;
            if (teiId) {
              await api.createSurveyEvent({ programId, stageId, orgUnitId: selectedFacilityId, teiId, status: 'ACTIVE' });
              setBaselineProvisioned(true);
              showToast?.('Baseline provisioned for this facility.', 'success');
            } else {
              showToast?.('No TEI found for this facility to create a baseline.', 'warning');
            }
          } catch (e) {
            console.warn('Report: baseline provisioning failed (non-fatal)', e);
          }
        }
        const inPeriod = all.filter(ev => {
          const d = ev.eventDate ? new Date(ev.eventDate) : null;
          if (!d) return false;
          if (startDate && d < new Date(startDate)) return false;
          if (endDate && d > new Date(endDate)) return false;
          return true;
        });
        if (inPeriod.length === 0) { showToast?.('No assessments found for the selected filters.', 'info'); setReportLoading(false); return; }

        // Determine facility group from a Baseline event (prefer Type of assessment == Baseline).
        let baseline = null;
        if (TYPE_OF_ASSESSMENT_DE_ID) {
          const baselineCandidates = all.filter(ev => {
            const dv = (ev.dataValues || []).find(d => d.dataElement === TYPE_OF_ASSESSMENT_DE_ID);
            return dv && isBaselineType(dv.value);
          });
          if (baselineCandidates.length > 0) {
            baseline = baselineCandidates.reduce((earliest, ev) => (
              !earliest || new Date(ev.eventDate) < new Date(earliest.eventDate) ? ev : earliest
            ), null);
          }
        }
        // Fallback to earliest event if no explicit Baseline type found
        if (!baseline && all.length > 0) {
          baseline = all.reduce((earliest, ev) => (
            !earliest || new Date(ev.eventDate) < new Date(earliest.eventDate) ? ev : earliest
          ), null);
        }

        // If still no explicit Baseline event (by type), consider provisioning one
        if (!baseline) {
          try {
            // Prefer TEI from any existing assessment; otherwise from authorised assignment
            const teiFromEvents = (all.find(ev => ev.trackedEntityInstance)?.trackedEntityInstance) || null;
            let teiForBaseline = teiFromEvents;
            if (!teiForBaseline) {
              const match = (Array.isArray(userAssignments) ? userAssignments : []).find(a => {
                const ouId = a.orgUnitId || (typeof a.orgUnit === 'string' ? a.orgUnit : a.orgUnit?.id);
                return ouId === selectedFacilityId;
              });
              teiForBaseline = match?.trackedEntityInstance || null;
            }
            if (teiForBaseline) {
              await api.createSurveyEvent({ programId, stageId, orgUnitId: selectedFacilityId, teiId: teiForBaseline, status: 'ACTIVE' });
              setBaselineProvisioned(true);
              showToast?.('Baseline provisioned for this facility.', 'success');
            }
          } catch (e) {
            console.warn('Report: baseline provisioning (no explicit baseline type) failed', e);
          }
        }
        const baseDv = Object.fromEntries((baseline.dataValues || []).map(dv => [dv.dataElement, dv.value]));
        const groupText = baseDv[FACILITY_GROUP_DE_ID] || '';
        const groupId = resolveGroupIdFromText(groupText) || 'GENERAL';
        const groupObj = groups.find(g => g.id === groupId) || null;

        // Prepare formData from latest event in the selected period
        let latest = inPeriod[inPeriod.length - 1];
        for (const ev of inPeriod) { if (new Date(ev.eventDate) > new Date(latest.eventDate)) latest = ev; }
        const latestFormData = Object.fromEntries((latest.dataValues || []).map(dv => [dv.dataElement, dv.value]));
        const latestType = TYPE_OF_ASSESSMENT_DE_ID ? (latestFormData[TYPE_OF_ASSESSMENT_DE_ID] || 'Latest assessment') : 'Latest assessment';

        // Build assessment structure for scoring based on facility group
        const programmeType = (groupId === 'HOSPITAL') ? 'hospital' : (groupId === 'CLINICS') ? 'clinics' : (groupId === 'SE') ? 'ems' : 'mortuary';
        const { linksDataLookup, severityLookup } = programmeScoringMeta[programmeType] || programmeScoringMeta.ems;
        const targetSections = groupObj ? groupObj.sections || [] : [];
        const assessment = {
          sections: targetSections.map(section => ({
            id: section.id,
            standards: [{
              id: section.code || section.id,
              criteria: (section.fields || [])
                .filter(f => f.type === 'select')
                .map(f => {
                  const code = f.code || f.id;
                  const normalizedCode = normalizeCriterionCode(code);
                  const linksData = linksDataLookup[normalizedCode] || linksDataLookup[code] || { roots: [], linked_criteria: [] };
                  const isRoot = linksData.linked_criteria.length > 0;
                  const severity = severityLookup[normalizedCode] || severityLookup[code] || 1;
                  return {
                    id: f.id,
                    code,
                    response: latestFormData[f.id] || 'NA',
                    isCritical: false,
                    isRoot,
                    links: linksData.linked_criteria,
                    roots: linksData.roots,
                    severity
                  };
                })
            }]
          }))
        };

        // Build baseline assessment (earliest event overall for facility)
        const baselineFormData = Object.fromEntries(((baseline?.dataValues) || []).map(dv => [dv.dataElement, dv.value]));
        const baselineAssess = {
          sections: targetSections.map(section => ({
            id: section.id,
            standards: [{
              id: section.code || section.id,
              criteria: (section.fields || [])
                .filter(f => f.type === 'select')
                .map(f => {
                  const code = f.code || f.id;
                  const normalizedCode = normalizeCriterionCode(code);
                  const linksData = linksDataLookup[normalizedCode] || linksDataLookup[code] || { roots: [], linked_criteria: [] };
                  const isRoot = linksData.linked_criteria.length > 0;
                  const severity = severityLookup[normalizedCode] || severityLookup[code] || 1;
                  return {
                    id: f.id,
                    code,
                    response: baselineFormData[f.id] || 'NA',
                    isCritical: false,
                    isRoot,
                    links: linksData.linked_criteria,
                    roots: linksData.roots,
                    severity
                  };
                })
            }]
          }))
        };

        setReportAssessment(assessment);
        setBaselineAssessment(baselineAssess);
        // Build section label map for display
        const labels = {};
        targetSections.forEach(s => { labels[s.id] = s.code || s.name || s.id; });
        setSectionLabels(labels);
        setReportInfo({
          groupId,
          groupLabel: groupObj?.name || groupId,
          count: inPeriod.length,
          baselineDate: baseline?.eventDate || null,
          latestDate: latest?.eventDate || null,
          latestType,
        });
      } catch (e) {
        console.error('Report: generation failed', e);
        showToast?.('Failed to generate report', 'error');
      } finally {
        setReportLoading(false);
      }
    })();
  };

  const scoring = useAssessmentScoring(reportAssessment || { sections: [] });
  const baselineScoring = useAssessmentScoring(baselineAssessment || { sections: [] });

  return (
    <div className="dashboard-container" style={{ padding: '16px' }}>
      <div className="program-header" style={{ marginBottom: '12px' }}>
        <div className="program-info"><h1 className="program-title">Report</h1></div>
        <div className="quick-actions">
          <Button
            size="small"
            variant="outlined"
            onClick={() => navigate(-1)}
            startIcon={<ArrowBackIcon />}
          >
            Back
          </Button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, maxWidth: 720 }}>
        <TextField
          label="Start date"
          type="date"
          size="small"
          value={startDate}
          onChange={e => setStartDate(e.target.value)}
          InputLabelProps={{ shrink: true }}
        />
        <TextField
          label="End date"
          type="date"
          size="small"
          value={endDate}
          onChange={e => setEndDate(e.target.value)}
          InputLabelProps={{ shrink: true }}
        />
        <FormControl size="small" fullWidth style={{ gridColumn: '1 / span 2' }}>
          <InputLabel id="facility-select-label">Facility (authorised)</InputLabel>
          <Select
            labelId="facility-select-label"
            label="Facility (authorised)"
            value={selectedFacilityId}
            onChange={e => setSelectedFacilityId(e.target.value)}
          >
            {facilityOptions.map(opt => (
              <MenuItem key={opt.id} value={opt.id}>{opt.name} ({opt.id})</MenuItem>
            ))}
          </Select>
        </FormControl>
      </div>

      <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
        <Button
          variant="contained"
          color="primary"
          disabled={loading || reportLoading || facilityOptions.length === 0}
          onClick={handleGenerate}
        >
          {reportLoading ? 'Generating…' : 'Generate'}
        </Button>
        {loading && <span style={{ color: '#64748b' }}>Loading facilities…</span>}
        {!loading && error && <span style={{ color: '#dc2626' }}>{error}</span>}
        {!loading && !error && (
          <span style={{ color: '#64748b' }}>
            {facilityOptions.length} authorised facilities
          </span>
        )}
      </div>

      {/* Report Output */}
      <div style={{ marginTop: 24 }}>
        {!reportInfo && (
          <div style={{ color: '#475569', fontSize: '0.95em' }}>
            Select a period and facility, then click Generate to view the report.
          </div>
        )}
        {reportInfo && (
          <div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ background: '#0b1220', color: '#e5e7eb', padding: '10px 12px', borderRadius: 8, minWidth: 180 }}>
                <div style={{ fontSize: 12, opacity: 0.8 }}>Facility group</div>
                <div style={{ fontWeight: 700 }}>{reportInfo.groupLabel}</div>
              </div>
              <div style={{ background: '#0b1220', color: '#e5e7eb', padding: '10px 12px', borderRadius: 8, minWidth: 180 }}>
                <div style={{ fontSize: 12, opacity: 0.8 }}>Assessments in period</div>
                <div style={{ fontWeight: 700 }}>{reportInfo.count}</div>
              </div>
              <div style={{ background: '#0b1220', color: '#e5e7eb', padding: '10px 12px', borderRadius: 8, minWidth: 220 }}>
                <div style={{ fontSize: 12, opacity: 0.8 }}>Baseline (earliest)</div>
                <div style={{ fontWeight: 700 }}>{reportInfo.baselineDate ? new Date(reportInfo.baselineDate).toLocaleDateString() : 'N/A'}</div>
              </div>
              <div style={{ background: '#0b1220', color: '#e5e7eb', padding: '10px 12px', borderRadius: 8, minWidth: 220 }}>
                <div style={{ fontSize: 12, opacity: 0.8 }}>Latest in period</div>
                <div style={{ fontWeight: 700 }}>{reportInfo.latestDate ? new Date(reportInfo.latestDate).toLocaleDateString() : 'N/A'}</div>
              </div>
              <div style={{ background: '#0b1220', color: '#e5e7eb', padding: '10px 12px', borderRadius: 8, minWidth: 220 }}>
                <div style={{ fontSize: 12, opacity: 0.8 }}>Overall (COHSASA)</div>
                <div style={{ fontWeight: 700 }}>{Number.isFinite(scoring?.overall?.percent) ? `${scoring.overall.percent.toFixed(1)}%` : '—'}</div>
              </div>
            </div>

            {/* Baseline vs Latest (per SE) */}
            <div style={{ marginTop: 18 }}>
              <h3 style={{ margin: '8px 0' }}>Baseline vs Latest (per SE)</h3>
              {/* Simple legend */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8, color: '#64748b', fontSize: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 12, height: 12, background: '#34d399', display: 'inline-block', borderRadius: 2 }} />
                  <span>Baseline</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 12, height: 12, background: '#60a5fa', display: 'inline-block', borderRadius: 2 }} />
                  <span>{reportInfo?.latestType || 'Latest assessment'}</span>
                </div>
              </div>
              {(() => {
                const bl = Array.isArray(baselineScoring?.sections) ? baselineScoring.sections : [];
                const lt = Array.isArray(scoring?.sections) ? scoring.sections : [];
                const blMap = Object.fromEntries(bl.map(s => [s.id, s.percent]));
                const ltMap = Object.fromEntries(lt.map(s => [s.id, s.percent]));
                const ids = Object.keys(sectionLabels || {});
                if (ids.length === 0) return (<div style={{ color: '#64748b' }}>No section breakdown available.</div>);
                const chartData = ids.map(id => ({
                  name: sectionLabels[id] || id,
                  Baseline: Number.isFinite(blMap[id]) ? Number(blMap[id]) : 0,
                  Latest: Number.isFinite(ltMap[id]) ? Number(ltMap[id]) : 0,
                }));
                return (
                  <>
                    <div style={{ width: '100%', height: 320, marginBottom: 12 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData} margin={{ top: 8, right: 16, bottom: 24, left: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={60} />
                          <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} width={40} />
                          <Tooltip formatter={(v) => `${Number(v).toFixed(1)}%`} />
                          <Legend />
                          <Bar dataKey="Baseline" fill="#34d399" />
                          <Bar dataKey="Latest" name={`Latest (${reportInfo?.latestType || 'Latest'})`} fill="#60a5fa" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
                      {ids.map(id => {
                      const name = sectionLabels[id] || id;
                      const b = Number.isFinite(blMap[id]) ? blMap[id] : null;
                      const l = Number.isFinite(ltMap[id]) ? ltMap[id] : null;
                      return (
                        <div key={`cmp-${id}`} style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 12 }}>
                          <div style={{ fontWeight: 600, marginBottom: 8 }}>{name}</div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            <div>
                              <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>Baseline ({name})</div>
                              <div style={{ height: 14, background: '#f1f5f9', borderRadius: 6, overflow: 'hidden', border: '1px solid #e2e8f0' }}>
                                <div style={{ width: `${(b && b > 0) ? Math.max(4, Math.min(100, b)) : 0}%`, height: '100%', background: '#34d399' }} />
                              </div>
                              <div style={{ fontSize: 12, color: '#475569', marginTop: 4 }}>{b !== null ? `${b.toFixed(1)}%` : (baselineProvisioned ? '— (provisioned)' : '—')}</div>
                            </div>
                            <div>
                              <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>{(reportInfo?.latestType || 'Latest assessment')} ({name})</div>
                              <div style={{ height: 14, background: '#f1f5f9', borderRadius: 6, overflow: 'hidden', border: '1px solid #e2e8f0' }}>
                                <div style={{ width: `${(l && l > 0) ? Math.max(4, Math.min(100, l)) : 0}%`, height: '100%', background: '#60a5fa' }} />
                              </div>
                              <div style={{ fontSize: 12, color: '#475569', marginTop: 4 }}>{l !== null ? `${l.toFixed(1)}%` : '—'}</div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
