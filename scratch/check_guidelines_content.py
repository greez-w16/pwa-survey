import os
import json

output_dir = "scratch/downloaded_guidelines"

for filename in sorted(os.listdir(output_dir)):
    if not filename.endswith(".json"):
        continue
    file_path = os.path.join(output_dir, filename)
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        
        doc_name = data.get("document_name", filename)
        sections = data.get("sections", [])
        
        # Traverse categories -> standards -> criteria
        total_criteria = 0
        non_empty_guidelines = 0
        for section in sections:
            for cat in section.get("categories", []):
                for std in cat.get("standards", []):
                    for crit in std.get("criteria", []):
                        total_criteria += 1
                        g = crit.get("guideline", "")
                        if g and len(g.strip()) > 0:
                            non_empty_guidelines += 1
        
        print(f"{filename}:")
        print(f"  Doc name: {doc_name}")
        print(f"  Total criteria: {total_criteria}")
        print(f"  Non-empty guidelines: {non_empty_guidelines}")
    except Exception as e:
        print(f"Error reading {filename}: {e}")
