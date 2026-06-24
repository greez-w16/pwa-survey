import json

file_path = "scratch/downloaded_guidelines/Botswana Private Radiology Standards and Criteria.json"
with open(file_path, "r", encoding="utf-8") as f:
    data = json.load(f)

count = 0
for sec in data.get("sections", []):
    for cat in sec.get("categories", []):
        for std in cat.get("standards", []):
            for crit in std.get("criteria", []):
                g = crit.get("guideline", "")
                if g and len(g.strip()) > 0:
                    print(f"ID: {crit.get('criterion_id')}")
                    print(f"Text: {repr(crit.get('criterion_text'))}")
                    print(f"Guideline: {repr(g)}")
                    print("-" * 40)
                    count += 1
                    if count >= 3:
                        break
            if count >= 3: break
        if count >= 3: break
    if count >= 3: break
