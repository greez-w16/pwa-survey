import csv
import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "exports" / "google-sheets" / "hospital"
META_PATH = OUT_DIR / "dhis2_hospital_metadata.json"


def read_tab(name):
    path = OUT_DIR / name
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        return path, reader.fieldnames or [], list(reader)


def write_tab(path, headers, rows):
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=headers, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def dhis2_question_code(de):
    raw = " ".join(str(de.get(k) or "") for k in ("code", "name", "displayName", "formName"))
    if re.search(r"-comments\b", raw, re.I):
        return None
    match = re.search(r"HOSPITAL_([0-9]+(?:\.[0-9]+){1,3})(?![0-9.])", raw, re.I)
    if not match:
        match = re.search(r"(?:^|[^0-9])([0-9]+(?:\.[0-9]+){3})(?![0-9.])", raw)
    return match.group(1) if match else None


def is_criterion_code(code):
    return bool(code and len(str(code).split(".")) == 4)


def clean_text(value):
    value = re.sub(r"^SURV_HOSP_[0-9]+-", "", str(value or ""), flags=re.I)
    value = re.sub(r"^[0-9]+(?:\.[0-9]+){1,3}\s+", "", value)
    value = re.sub(r"\s*--\s*$", "", value)
    value = re.sub(r"[^a-z0-9]+", " ", value.lower())
    return re.sub(r"\s+", " ", value).strip()


def de_name(de):
    return de.get("displayName") or de.get("formName") or de.get("name") or ""


payload = json.loads(META_PATH.read_text(encoding="utf-8"))
if not payload.get("ok") or not payload.get("metadata", {}).get("programStageSections"):
    raise SystemExit(f"Metadata pull is not usable: {META_PATH}")

sections = payload["metadata"]["programStageSections"]
section_by_se = {}
element_by_code = {}
elements_by_section_text = {}
section_de_refs = 0
non_comment_matches = 0

for section in sections:
    se_num = int(section.get("sortOrder") or 0) - 1
    if se_num >= 1:
        section_by_se[str(se_num)] = section
    for de in section.get("dataElements") or []:
        section_de_refs += 1
        code = dhis2_question_code(de)
        if not code:
            continue
        non_comment_matches += 1
        if is_criterion_code(code):
            element_by_code.setdefault(code, de)
            text_key = (str(se_num), clean_text(de_name(de)))
            if se_num >= 1 and text_key[1]:
                elements_by_section_text.setdefault(text_key, de)


def find_de(row, code_column, text_column=None):
    de = element_by_code.get(row.get(code_column, ""))
    if de:
        return de, "exact_code"
    if text_column:
        key = (str(row.get("seNumber", "")), clean_text(row.get(text_column, "")))
        de = elements_by_section_text.get(key)
        if de:
            return de, "section_text"
    return None, ""


def fill_de_fields(row, de, method=""):
    row["dataElementUid"] = de.get("id", "")
    if "dhis2DataElementCode" in row:
        row["dhis2DataElementCode"] = de.get("code", "")
    if "dhis2DataElementName" in row:
        row["dhis2DataElementName"] = de_name(de)
    if "uidMatchMethod" in row:
        row["uidMatchMethod"] = method
    if "valueType" in row and de.get("valueType"):
        row["valueType"] = de["valueType"]

path, headers, rows = read_tab("03_ServiceElements.csv")
section_matches = 0
for row in rows:
    section = section_by_se.get(str(row.get("seNumber", "")))
    if section:
        row["sectionUid"] = section.get("id", "")
        row["dhis2SectionName"] = section.get("displayName") or section.get("name") or row.get("dhis2SectionName", "")
        section_matches += 1
write_tab(path, headers, rows)

def fill_data_element_uid(tab_name, code_column, uid_column="dataElementUid"):
    path, headers, rows = read_tab(tab_name)
    matches = 0
    for row in rows:
        text_column = "questionText" if tab_name == "06_Questions.csv" else "name" if tab_name == "07_DataElements.csv" else None
        de, method = find_de(row, code_column, text_column)
        if not de:
            continue
        fill_de_fields(row, de, method)
        matches += 1
    write_tab(path, headers, rows)
    return len(rows), matches

question_total, question_matches = fill_data_element_uid("06_Questions.csv", "questionCode")
data_total, data_matches = fill_data_element_uid("07_DataElements.csv", "code")
stage_total, stage_matches = fill_data_element_uid("08_StageDataElements.csv", "dataElementCode")

_, _, enriched_questions = read_tab("06_Questions.csv")
question_uid_by_code = {
    row.get("questionCode", ""): row
    for row in enriched_questions
    if row.get("questionCode") and row.get("dataElementUid")
}

path, headers, rows = read_tab("08_StageDataElements.csv")
stage_matches = 0
for row in rows:
    q = question_uid_by_code.get(row.get("dataElementCode", ""))
    if not q:
        continue
    row["dataElementUid"] = q.get("dataElementUid", "")
    if "dhis2DataElementCode" in row:
        row["dhis2DataElementCode"] = q.get("dhis2DataElementCode", "")
    if "dhis2DataElementName" in row:
        row["dhis2DataElementName"] = q.get("dhis2DataElementName", "")
    stage_matches += 1
write_tab(path, headers, rows)

path, headers, rows = read_tab("09_SectionQuestions.csv")
sq_section_matches = 0
sq_element_matches = 0
for row in rows:
    section = section_by_se.get(str(row.get("seNumber", "")))
    de, method = find_de(row, "dataElementCode")
    if section:
        row["sectionUid"] = section.get("id", "")
        sq_section_matches += 1
    q = question_uid_by_code.get(row.get("dataElementCode", ""))
    if q:
        row["dataElementUid"] = q.get("dataElementUid", "")
        if "dhis2DataElementCode" in row:
            row["dhis2DataElementCode"] = q.get("dhis2DataElementCode", "")
        if "dhis2DataElementName" in row:
            row["dhis2DataElementName"] = q.get("dhis2DataElementName", "")
        sq_element_matches += 1
    elif de:
        fill_de_fields(row, de, method)
        sq_element_matches += 1
write_tab(path, headers, rows)

path, headers, rows = read_tab("13_ValidationSummary.csv")
def upsert(check, value, note):
    for row in rows:
        if row.get("check") == check:
            row.update({"value": str(value), "note": note})
            return
    rows.append({"check": check, "value": str(value), "note": note})

upsert("dhis2SectionsPulled", len(sections), "Pulled from DHIS2 programStageSections endpoint.")
upsert("dhis2SectionDataElementRefs", section_de_refs, "Includes headers/comments as well as scored criteria.")
upsert("dhis2NonCommentCodeMatches", non_comment_matches, "DHIS2 non-comment data elements with extractable Hospital criterion codes.")
upsert("sectionUidMatches", section_matches, "ServiceElements rows matched to DHIS2 sections by sortOrder - 1.")
upsert("questionUidMatches", question_matches, f"{question_total} Questions rows checked.")
upsert("questionUidMissing", question_total - question_matches, "Rows needing manual UID review or DHIS2 creation.")
upsert("uidEnrichmentSource", str(META_PATH.relative_to(ROOT)), "Local sanitized DHIS2 metadata pull used for UID enrichment.")
write_tab(path, headers, rows)

print(json.dumps({
    "sectionsPulled": len(sections),
    "sectionDataElementRefs": section_de_refs,
    "nonCommentMatches": non_comment_matches,
    "sectionMatches": section_matches,
    "questionMatches": question_matches,
    "questionMissing": question_total - question_matches,
    "dataElementMatches": data_matches,
    "stageMatches": stage_matches,
    "sectionQuestionSectionMatches": sq_section_matches,
    "sectionQuestionElementMatches": sq_element_matches,
}, indent=2))