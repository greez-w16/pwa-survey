const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'exports', 'google-sheets', 'hospital');
const config = JSON.parse(fs.readFileSync(path.join(root, 'src/assets/hospital_config.json'), 'utf8'));
const compute = JSON.parse(fs.readFileSync(path.join(root, 'src/assets/hospital_compute_criteria.json'), 'utf8'));
const links = JSON.parse(fs.readFileSync(path.join(root, 'src/assets/hospital_links.json'), 'utf8'));

const FACILITY = 'HOSPITAL';
const PROGRAM_STAGE_ID = 'hup8BqEe7Mn';
const PROGRAM_STAGE_NAME = 'Hospital Assessment';

const csv = (rows, headers) => {
  const esc = (v) => {
    if (v === undefined || v === null) return '';
    const s = Array.isArray(v) ? v.join('|') : String(v);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.join(','), ...rows.map(r => headers.map(h => esc(r[h])).join(','))].join('\n') + '\n';
};

const writeTab = (name, rows, headers) => {
  fs.writeFileSync(path.join(outDir, `${name}.csv`), csv(rows, headers), 'utf8');
};

const seRows = [];
const groupRows = [];
const standardRows = [];
const questionRows = [];
const dataElementRows = [];
const stageDataElementRows = [];
const sectionQuestionRows = [];
let globalQuestionSort = 1;

const serviceElements = config.hospital_full_configuration || [];
serviceElements.forEach((se) => {
  const seNumber = Number(se.se_id);
  seRows.push({
    facilityType: FACILITY,
    seNumber,
    seCode: `SE ${seNumber}`,
    seName: se.se_name,
    dhis2SortOrder: seNumber + 1,
    programStageId: PROGRAM_STAGE_ID,
    sectionUid: '',
    dhis2SectionName: se.se_name,
    active: 'TRUE',
    source: 'src/assets/hospital_config.json',
  });

  (se.sections || []).forEach((section, sectionIndex) => {
    groupRows.push({
      facilityType: FACILITY,
      seNumber,
      sectionPiId: section.section_pi_id,
      sectionTitle: section.title,
      sortOrder: sectionIndex + 1,
      active: 'TRUE',
    });

    (section.standards || []).forEach((standard, standardIndex) => {
      standardRows.push({
        facilityType: FACILITY,
        seNumber,
        sectionPiId: section.section_pi_id,
        standardId: standard.standard_id,
        statement: standard.statement,
        intentTooltip: standard.intent_tooltip,
        sortOrder: standardIndex + 1,
        active: 'TRUE',
      });

      (standard.criteria || []).forEach((criterion, criterionIndex) => {
        const questionCode = criterion.id;
        const row = {
          facilityType: FACILITY,
          seNumber,
          sectionPiId: section.section_pi_id,
          standardId: standard.standard_id,
          questionCode,
          questionText: criterion.description,
          guideline: criterion.guideline || '',
          category: criterion.category || '',
          severity: criterion.severity || '',
          isCritical: criterion.is_critical ? 'TRUE' : 'FALSE',
          dataElementUid: '',
          dhis2DataElementCode: '',
          dhis2DataElementName: '',
          uidMatchMethod: '',
          valueType: 'TEXT',
          domainType: 'TRACKER',
          optionSetUid: '',
          compulsory: 'FALSE',
          sortOrderWithinStandard: criterionIndex + 1,
          active: 'TRUE',
        };
        questionRows.push(row);
        dataElementRows.push({
          facilityType: FACILITY,
          seNumber,
          dataElementUid: '',
          code: questionCode,
          dhis2DataElementCode: '',
          name: criterion.description,
          dhis2DataElementName: '',
          shortName: questionCode,
          formName: questionCode,
          valueType: 'TEXT',
          domainType: 'TRACKER',
          optionSetUid: '',
          active: 'TRUE',
        });
        stageDataElementRows.push({
          programStageId: PROGRAM_STAGE_ID,
          seNumber,
          dataElementUid: '',
          dataElementCode: questionCode,
          dhis2DataElementCode: '',
          dhis2DataElementName: '',
          sortOrder: globalQuestionSort,
          compulsory: 'FALSE',
          allowProvidedElsewhere: 'FALSE',
          renderType: 'DEFAULT',
          active: 'TRUE',
        });
        sectionQuestionRows.push({
          facilityType: FACILITY,
          seNumber,
          sectionUid: '',
          sectionName: se.se_name,
          dataElementUid: '',
          dataElementCode: questionCode,
          dhis2DataElementCode: '',
          dhis2DataElementName: '',
          sortOrder: globalQuestionSort,
          active: 'TRUE',
        });
        globalQuestionSort += 1;
      });
    });
  });
});

const computeRows = [];
(compute.hospital_standards_config?.service_elements || []).forEach((se) => {
  const seNumber = Number(String(se.se_id).replace(/[^0-9]/g, ''));
  (se.root_criteria || []).forEach((rootCriterion, idx) => {
    computeRows.push({
      facilityType: FACILITY,
      seNumber,
      seCode: `SE ${seNumber}`,
      seName: se.name,
      rootCriterionCode: rootCriterion.id,
      rootDescription: rootCriterion.description,
      subCriteriaCodes: rootCriterion.sub_criteria || [],
      sortOrder: idx + 1,
      active: 'TRUE',
    });
  });
});

const linkRows = [];
links.forEach((entry) => {
  const linked = entry.linked_criteria || [];
  const roots = entry.root || [];
  linked.forEach((target, idx) => linkRows.push({
    facilityType: FACILITY,
    sourceCriterionCode: entry.criteria,
    sourceDescription: entry.description,
    linkType: 'linked_criteria',
    targetCriterionCode: target,
    sortOrder: idx + 1,
    scoringWeight: 1,
    includeInTooltip: 'TRUE',
    active: 'TRUE',
  }));
  roots.forEach((target, idx) => linkRows.push({
    facilityType: FACILITY,
    sourceCriterionCode: entry.criteria,
    sourceDescription: entry.description,
    linkType: 'root',
    targetCriterionCode: target,
    sortOrder: idx + 1,
    scoringWeight: 1,
    includeInTooltip: 'TRUE',
    active: 'TRUE',
  }));
});

const dataDictionary = [
  ['FacilityTypes', 'facilityType', 'Facility type key used by the app and importer', 'TRUE'],
  ['ProgramStages', 'programStageId', 'DHIS2 program stage UID', 'TRUE'],
  ['ServiceElements', 'sectionUid', 'DHIS2 programStageSection UID; fill or generate before DHIS2 import', 'FALSE'],
  ['Questions', 'dataElementUid', 'DHIS2 dataElement UID; fill or generate before DHIS2 import', 'FALSE'],
  ['RootCriteria', 'subCriteriaCodes', 'Pipe-separated criteria contributing to the root score', 'TRUE'],
  ['CriterionLinks', 'targetCriterionCode', 'Criterion linked to the source criterion', 'TRUE'],
].map(([tab, column, description, required]) => ({ tab, column, description, required }));

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

writeTab('00_DataDictionary', dataDictionary, ['tab', 'column', 'description', 'required']);
writeTab('01_FacilityTypes', [{ facilityType: FACILITY, facilityName: 'Hospital', programStageId: PROGRAM_STAGE_ID, programStageName: PROGRAM_STAGE_NAME, programId: '', active: 'TRUE', notes: 'Program ID must be filled before creating a new stage.' }], ['facilityType', 'facilityName', 'programStageId', 'programStageName', 'programId', 'active', 'notes']);
writeTab('02_ProgramStages', [{ facilityType: FACILITY, programStageId: PROGRAM_STAGE_ID, programStageName: PROGRAM_STAGE_NAME, programId: '', repeatable: 'FALSE', active: 'TRUE' }], ['facilityType', 'programStageId', 'programStageName', 'programId', 'repeatable', 'active']);
writeTab('03_ServiceElements', seRows, ['facilityType', 'seNumber', 'seCode', 'seName', 'dhis2SortOrder', 'programStageId', 'sectionUid', 'dhis2SectionName', 'active', 'source']);
writeTab('04_SectionGroups', groupRows, ['facilityType', 'seNumber', 'sectionPiId', 'sectionTitle', 'sortOrder', 'active']);
writeTab('05_Standards', standardRows, ['facilityType', 'seNumber', 'sectionPiId', 'standardId', 'statement', 'intentTooltip', 'sortOrder', 'active']);
writeTab('06_Questions', questionRows, ['facilityType', 'seNumber', 'sectionPiId', 'standardId', 'questionCode', 'questionText', 'guideline', 'category', 'severity', 'isCritical', 'dataElementUid', 'dhis2DataElementCode', 'dhis2DataElementName', 'uidMatchMethod', 'valueType', 'domainType', 'optionSetUid', 'compulsory', 'sortOrderWithinStandard', 'active']);
writeTab('07_DataElements', dataElementRows, ['facilityType', 'seNumber', 'dataElementUid', 'code', 'dhis2DataElementCode', 'name', 'dhis2DataElementName', 'shortName', 'formName', 'valueType', 'domainType', 'optionSetUid', 'active']);
writeTab('08_StageDataElements', stageDataElementRows, ['programStageId', 'seNumber', 'dataElementUid', 'dataElementCode', 'dhis2DataElementCode', 'dhis2DataElementName', 'sortOrder', 'compulsory', 'allowProvidedElsewhere', 'renderType', 'active']);
writeTab('09_SectionQuestions', sectionQuestionRows, ['facilityType', 'seNumber', 'sectionUid', 'sectionName', 'dataElementUid', 'dataElementCode', 'dhis2DataElementCode', 'dhis2DataElementName', 'sortOrder', 'active']);
writeTab('10_RootCriteria', computeRows, ['facilityType', 'seNumber', 'seCode', 'seName', 'rootCriterionCode', 'rootDescription', 'subCriteriaCodes', 'sortOrder', 'active']);
writeTab('11_CriterionLinks', linkRows, ['facilityType', 'sourceCriterionCode', 'sourceDescription', 'linkType', 'targetCriterionCode', 'sortOrder', 'scoringWeight', 'includeInTooltip', 'active']);
writeTab('12_ScoringRules', [{ facilityType: FACILITY, ruleName: 'normalize_80_to_100', appliesTo: 'criterion', threshold: 80, operator: '>=', outputScore: 100, active: 'TRUE' }], ['facilityType', 'ruleName', 'appliesTo', 'threshold', 'operator', 'outputScore', 'active']);
writeTab('13_ValidationSummary', [
  { check: 'serviceElements', value: seRows.length, note: 'Expected 45 from current Hospital config.' },
  { check: 'standards', value: standardRows.length, note: 'Generated from hospital_config.json.' },
  { check: 'questions', value: questionRows.length, note: 'Each criterion is exported as a question/data element candidate.' },
  { check: 'rootCriteria', value: computeRows.length, note: 'Generated from hospital_compute_criteria.json.' },
  { check: 'criterionLinks', value: linkRows.length, note: 'Expanded from hospital_links.json.' },
  { check: 'uidColumns', value: 'blank', note: 'Fill existing DHIS2 UIDs or generate new UIDs before metadata import.' },
], ['check', 'value', 'note']);

const readme = `# Hospital Google Sheets configuration export\n\nGenerated from the current Hospital app configuration.\n\nImport each CSV as a separate Google Sheet tab in this order.\n\nImportant:\n- Existing DHIS2 UIDs are not stored in the local Hospital JSON config, so UID columns are intentionally blank except programStageId.\n- Fill or generate sectionUid and dataElementUid before using this as a DHIS2 metadata import source.\n- Hospital program stage ID: ${PROGRAM_STAGE_ID}.\n- Current local config includes 45 SEs; live DHIS2 was previously observed to have SE 1-44 only.\n`;
fs.writeFileSync(path.join(outDir, 'README.md'), readme, 'utf8');

console.log(JSON.stringify({ outDir, tabs: fs.readdirSync(outDir).filter(f => f.endsWith('.csv')).length, serviceElements: seRows.length, standards: standardRows.length, questions: questionRows.length, rootCriteria: computeRows.length, criterionLinks: linkRows.length }, null, 2));