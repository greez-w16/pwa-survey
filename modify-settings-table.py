import re

with open('src/pages/Dashboard.jsx', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Widen the Settings dialog
content = content.replace(
    'maxWidth="md"\n                fullWidth',
    'maxWidth="xl"\n                fullWidth'
)

# 2. Find and replace the Facility Type table section
# The section starts with the div containing "Facility Type \u2014 SE Criteria Overview"
# and ends with the closing </div> of that settings-section

start_marker = '<div className="settings-section">\n\t\t\t\t\t\t\t\t\t<h4>Facility Type \u2014 SE Criteria Overview</h4>'
end_marker = '</div>\n\t\t\t\t\t\t\t\t</div>\n\t\t\t\t\t\t\t\t<div className="settings-section">\n\t\t\t\t\t\t\t\t\t<h4>User Info</h4>'

start_idx = content.find(start_marker)
if start_idx == -1:
    # Try alternate indentation
    start_marker2 = '<div className="settings-section">\n\t\t\t\t\t\t\t\t\t<h4>Facility Type'
    start_idx = content.find(start_marker2)
    if start_idx == -1:
        print("ERROR: Could not find start marker for Facility Type table")
        exit(1)

end_idx = content.find(end_marker, start_idx)
if end_idx == -1:
    print("ERROR: Could not find end marker for Facility Type table")
    exit(1)

old_section = content[start_idx:end_idx]
print(f"Found old section at {start_idx}-{end_idx}, length={len(old_section)}")

new_section = '''<div className="settings-section">
\t\t\t\t\t\t\t\t\t<h4>Facility Type \u2014 SE Criteria Overview</h4>
\t\t\t\t\t\t\t\t\t<p className="settings-subtitle">Flattened view of every criterion by facility type, SE and standard.</p>
\t\t\t\t\t\t\t\t\t<div style={{ maxHeight: '60vh', overflowY: 'auto', overflowX: 'auto' }}>
\t\t\t\t\t\t\t\t\t\t<table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82em', marginTop: '8px' }}>
\t\t\t\t\t\t\t\t\t\t\t<thead style={{ position: 'sticky', top: 0, zIndex: 2 }}>
\t\t\t\t\t\t\t\t\t\t\t\t<tr style={{ background: '#edf2f7', textAlign: 'left' }}>
\t\t\t\t\t\t\t\t\t\t\t\t\t<th style={{ padding: '8px', border: '1px solid #cbd5e0', minWidth: '90px', position: 'sticky', top: 0, background: '#edf2f7' }}>Facility Type</th>
\t\t\t\t\t\t\t\t\t\t\t\t\t<th style={{ padding: '8px', border: '1px solid #cbd5e0', minWidth: '55px', position: 'sticky', top: 0, background: '#edf2f7', textAlign: 'center' }}>SE Number</th>
\t\t\t\t\t\t\t\t\t\t\t\t\t<th style={{ padding: '8px', border: '1px solid #cbd5e0', minWidth: '70px', position: 'sticky', top: 0, background: '#edf2f7', textAlign: 'center' }}>Standard</th>
\t\t\t\t\t\t\t\t\t\t\t\t\t<th style={{ padding: '8px', border: '1px solid #cbd5e0', minWidth: '80px', position: 'sticky', top: 0, background: '#edf2f7', textAlign: 'center' }}>Criterion</th>
\t\t\t\t\t\t\t\t\t\t\t\t\t<th style={{ padding: '8px', border: '1px solid #cbd5e0', minWidth: '100px', position: 'sticky', top: 0, background: '#edf2f7', textAlign: 'center' }}>Critical / Non-Critical</th>
\t\t\t\t\t\t\t\t\t\t\t\t\t<th style={{ padding: '8px', border: '1px solid #cbd5e0', minWidth: '180px', position: 'sticky', top: 0, background: '#edf2f7' }}>Linked Criteria</th>
\t\t\t\t\t\t\t\t\t\t\t\t\t<th style={{ padding: '8px', border: '1px solid #cbd5e0', minWidth: '180px', position: 'sticky', top: 0, background: '#edf2f7' }}>Sub-Criteria (Standards)</th>
\t\t\t\t\t\t\t\t\t\t\t\t</tr>
\t\t\t\t\t\t\t\t\t\t\t</thead>
\t\t\t\t\t\t\t\t\t\t\t<tbody>
\t\t\t\t\t\t\t\t\t\t\t\t{(() => {
\t\t\t\t\t\t\t\t\t\t\t\t\tconst FACILITY_CONFIGS = [
\t\t\t\t\t\t\t\t\t\t\t\t\t\t{ type: 'Hospital', config: hospitalConfig, key: 'hospital_full_configuration' },
\t\t\t\t\t\t\t\t\t\t\t\t\t\t{ type: 'Clinics', config: clinicsConfig, key: 'clinics_full_configuration' },
\t\t\t\t\t\t\t\t\t\t\t\t\t\t{ type: 'EMS', config: emsConfig, key: 'ems_full_configuration' },
\t\t\t\t\t\t\t\t\t\t\t\t\t\t{ type: 'Mortuary', config: mortuaryConfig, key: 'mortuary_full_configuration' },
\t\t\t\t\t\t\t\t\t\t\t\t\t];
\t\t\t\t\t\t\t\t\t\t\t\t\treturn FACILITY_CONFIGS.flatMap(({ type, config, key }) => {
\t\t\t\t\t\t\t\t\t\t\t\t\t\tconst seList = config?.[key] || [];
\t\t\t\t\t\t\t\t\t\t\t\t\t\treturn seList.flatMap(se => {
\t\t\t\t\t\t\t\t\t\t\t\t\t\t\tconst allStandardIds = [];
\t\t\t\t\t\t\t\t\t\t\t\t\t\t\tconst rows = [];
\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t(se.sections || []).forEach(section => {
\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t(section.standards || []).forEach(standard => {
\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\tif (standard.standard_id) allStandardIds.push(standard.standard_id);
\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\tconst standardCriteriaIds = (standard.criteria || []).map(c => c.id).filter(Boolean);
\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t(standard.criteria || []).forEach(c => {
\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\trows.push({
\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\tseId: se.se_id,
\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\tstandardId: standard.standard_id,
\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\tcriterionId: c.id,
\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\tisCritical: c.is_critical,
\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\tlinkedCriteria: standardCriteriaIds,
\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t});
\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t});
\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t});
\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t});
\t\t\t\t\t\t\t\t\t\t\t\t\t\t\tconst standardIdsUnique = [...new Set(allStandardIds)];
\t\t\t\t\t\t\t\t\t\t\t\t\t\t\treturn rows.map((row, idx) => (
\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t<tr key={`${type}-se-${row.seId}-st-${row.standardId}-c-${row.criterionId}-${idx}`}>
\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t<td style={{ padding: '8px', border: '1px solid #e2e8f0' }}>{type}</td>
\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t<td style={{ padding: '8px', border: '1px solid #e2e8f0', textAlign: 'center' }}>{row.seId}</td>
\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t<td style={{ padding: '8px', border: '1px solid #e2e8f0', textAlign: 'center', fontFamily: 'monospace' }}>{row.standardId}</td>
\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t<td style={{ padding: '8px', border: '1px solid #e2e8f0', textAlign: 'center', fontFamily: 'monospace' }}>{row.criterionId}</td>
\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t<td style={{ padding: '8px', border: '1px solid #e2e8f0', textAlign: 'center' }}>
\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t<span style={{
\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\tcolor: row.isCritical ? '#c53030' : '#2f855a',
\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\tfontWeight: 600,
\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\tbackground: row.isCritical ? '#fff5f5' : '#f0fff4',
\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\tpadding: '2px 8px',
\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\tborderRadius: '4px',
\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\tfontSize: '0.85em',
\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t}}>
\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t{row.isCritical ? 'Critical' : 'Non-Critical'}
\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t</span>
\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t</td>
\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t<td style={{ padding: '8px', border: '1px solid #e2e8f0' }}>
\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t<div style={{ maxHeight: '60px', overflowY: 'auto', fontSize: '0.8em', fontFamily: 'monospace' }}>
\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t{row.linkedCriteria.join(', ') || '\u2014'}
\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t</div>
\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t</td>
\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t<td style={{ padding: '8px', border: '1px solid #e2e8f0' }}>
\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t<div style={{ maxHeight: '60px', overflowY: 'auto', fontSize: '0.8em', fontFamily: 'monospace' }}>
\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t{standardIdsUnique.join(', ') || '\u2014'}
\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t</div>
\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t</td>
\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t</tr>
\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t);
\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t});
\t\t\t\t\t\t\t\t\t\t\t\t\t});
\t\t\t\t\t\t\t\t\t\t\t\t})()}
\t\t\t\t\t\t\t\t\t\t\t</tbody>
\t\t\t\t\t\t\t\t\t\t</table>
\t\t\t\t\t\t\t\t\t</div>
\t\t\t\t\t\t\t\t</div>'''

content = content[:start_idx] + new_section + content[end_idx:]

with open('src/pages/Dashboard.jsx', 'w', encoding='utf-8') as f:
    f.write(content)

print("Done: widened dialog, added Standard + Criterion columns, flattened rows per criterion, added frozen header.")
