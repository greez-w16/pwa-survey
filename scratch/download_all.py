import urllib.request
import json
import ssl
import os

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

# Re-parse map or define it directly
files_map = {
  "Botswana National Health Quality Standards for Hospitals  Psychiatric Care.json": "1_xLT6wp8wmi4VzLzeVko0rlmj0rJPNNV",
  "Botswana Private Dietetic Standards and Criteria.json": "1Ac3FviJ7_92dyelY4cAdtd29UePCSMfr",
  "Botswana Private Eye Care Standards and Criteria.json": "1feu-r1sNWHf_fz0KTqLyjD1GxLls61gU",
  "Botswana Private Hospice and Palliative Care Standards and Criteria.json": "1xsCdDMZcfszI8fnzByY6DXL2jf3Apym1",
  "Botswana Private Medical Laboratory Standards and Criteria (Autosaved).json": "1qOpT1rUKthAlp6zoubEAa5u2Osst4cJo",
  "Botswana Private Obstetrics and Gynaecology Standards and Criteria.json": "1PghhYYbGdeSKkFBjGvRKa5CtijENCwXA",
  "Botswana Private Occupational Health Service Standards and Criteria.json": "1j3SCvwjZbqwDUjriXYeZGQW8SZbn07rK",
  "Botswana Private Oncology Standards and Criteria-edited (3).json": "1SSfoNm2Kr7KSrJUwzNePbn2YlyVtdWfF",
  "Botswana Private Oral Health Care Standards and Criteria.json": "1v2wEYQAfQmBbjUKx5vJ8pRYZAMpbWDRj",
  "Botswana Private Paediatric Standards and Criteria 2.json": "1s3DtUw0zKmAk59sKcabvtlY39ijJpNoN",
  "Botswana Private Radiology Standards and Criteria.json": "1vddMEXH5gDIcLiM4Ew9ZnR-U4uiT-ME0",
  "Botswana Private Urology.Nephrology Standards and Criteria.json": "1hqJeKVPrgRD1VrFDId-CDvBHLsE7bf4i",
  "Mental Health Services Programme-Specific Standards and Criteria edited.json": "1R8Y1PY6YR8yi-mPY7RdsRkEES5SDasXX",
  "NHOS for Private Physiotherapy.json": "1ADGAsD-AUScw9ldxuigtioPMw4XIHTE4",
  "National Health Quality Standards for General Practice ( for approval).json": "1gntInnN92rj9Y1WO-Jb3FWptOhuTfDwh"
}

output_dir = "scratch/downloaded_guidelines"
os.makedirs(output_dir, exist_ok=True)

for filename, file_id in files_map.items():
    dest_path = os.path.join(output_dir, filename)
    url = f"https://drive.google.com/uc?export=download&id={file_id}"
    try:
        print(f"Downloading {filename} ({file_id})...")
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, context=ctx) as response:
            content = response.read()
            with open(dest_path, "wb") as out_f:
                out_f.write(content)
            print(f"  Saved to {dest_path} ({len(content)} bytes)")
    except Exception as e:
        print(f"  Failed to download {filename}: {e}")

print("All downloads complete.")
