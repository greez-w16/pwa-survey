import csv
import html
import os
import re
import sys
import zipfile
from pathlib import Path


NS_MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
NS_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"


def col_name(index):
    name = ""
    while index:
        index, rem = divmod(index - 1, 26)
        name = chr(65 + rem) + name
    return name



def safe_sheet_name(csv_path, used):
    name = csv_path.stem
    if "_" in name and name[:2].isdigit():
        name = name.split("_", 1)[1]
    for ch in '[]:*?/\\':
        name = name.replace(ch, " ")
    name = name[:31] or "Sheet"
    base = name
    i = 2
    while name.lower() in used:
        suffix = f" {i}"
        name = (base[: 31 - len(suffix)] + suffix)[:31]
        i += 1
    used.add(name.lower())
    return name


# XML 1.0 valid chars: #x9 | #xA | #xD | [#x20-#xD7FF] | [#xE000-#xFFFD] | [#x10000-#x10FFFF]
_INVALID_XML_CHARS = re.compile(
    "["
    "\x00-\x08"
    "\x0b\x0c"
    "\x0e-\x1f"
    "]"
)


def sanitize_for_xml(value):
    if value is None:
        return ""
    return _INVALID_XML_CHARS.sub("", value)


def sheet_xml(csv_path):
    out = [f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>']
    out.append(f'<worksheet xmlns="{NS_MAIN}" xmlns:r="{NS_REL}"><sheetData>')
    with csv_path.open("r", encoding="utf-8-sig", newline="") as handle:
        for row_idx, row in enumerate(csv.reader(handle), start=1):
            out.append(f'<row r="{row_idx}">')
            for col_idx, value in enumerate(row, start=1):
                cell_ref = f"{col_name(col_idx)}{row_idx}"
                value = html.escape(sanitize_for_xml(value or ""), quote=False)
                out.append(
                    f'<c r="{cell_ref}" t="inlineStr"><is><t xml:space="preserve">{value}</t></is></c>'
                )
            out.append("</row>")
    out.append("</sheetData></worksheet>")
    return "".join(out)



def build_xlsx(csv_dir, output_path):
    csv_files = sorted(Path(csv_dir).glob("*.csv"))
    if not csv_files:
        raise SystemExit(f"No CSV files found in {csv_dir}")

    used_names = set()
    sheets = [(safe_sheet_name(p, used_names), p) for p in csv_files]

    with zipfile.ZipFile(output_path, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr(
            "[Content_Types].xml",
            "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>"
            "<Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\">"
            "<Default Extension=\"rels\" ContentType=\"application/vnd.openxmlformats-package.relationships+xml\"/>"
            "<Default Extension=\"xml\" ContentType=\"application/xml\"/>"
            "<Override PartName=\"/xl/workbook.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml\"/>"
            + "".join(
                f"<Override PartName=\"/xl/worksheets/sheet{i}.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml\"/>"
                for i in range(1, len(sheets) + 1)
            )
            + "</Types>",
        )
        zf.writestr(
            "_rels/.rels",
            "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>"
            "<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">"
            "<Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument\" Target=\"xl/workbook.xml\"/>"
            "</Relationships>",
        )
        zf.writestr(
            "xl/workbook.xml",
            f"<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>"
            f"<workbook xmlns=\"{NS_MAIN}\" xmlns:r=\"{NS_REL}\"><sheets>"
            + "".join(
                f"<sheet name=\"{html.escape(name, quote=True)}\" sheetId=\"{i}\" r:id=\"rId{i}\"/>"
                for i, (name, _) in enumerate(sheets, start=1)
            )
            + "</sheets></workbook>",
        )
        zf.writestr(
            "xl/_rels/workbook.xml.rels",
            "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>"
            "<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">"
            + "".join(
                f"<Relationship Id=\"rId{i}\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet\" Target=\"worksheets/sheet{i}.xml\"/>"
                for i in range(1, len(sheets) + 1)
            )
            + "</Relationships>",
        )
        for i, (_, csv_path) in enumerate(sheets, start=1):
            zf.writestr(f"xl/worksheets/sheet{i}.xml", sheet_xml(csv_path))

    print(f"Wrote {output_path} with {len(sheets)} sheets")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit("Usage: python scripts/csv_tabs_to_xlsx.py <csv-dir> <output.xlsx>")
    build_xlsx(sys.argv[1], sys.argv[2])