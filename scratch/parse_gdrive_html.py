import re
import os
import json

file_path = "C:/Users/SK/.gemini/antigravity-ide/brain/fe513b22-9ec1-4f3a-9ab4-a471582a018f/.system_generated/steps/41/content.md"

with open(file_path, "r", encoding="utf-8") as f:
    html = f.read()

print(f"Total HTML length: {len(html)}")

# Find all JSON filenames
json_files = re.findall(r'[\w\s-]+\.json', html)
print(f"Found JSON file names: {set(json_files)}")

# Find typical Google Drive IDs (33 chars, alpha-numeric, hyphens, underscores)
# A typical pattern is /folders/ID or /file/d/ID or within arrays
# Let's extract any 33-character alphanumeric string containing uppercase, lowercase, numbers, and hyphens/underscores
drive_ids = set(re.findall(r'[a-zA-Z0-9_-]{33}', html))
print(f"Number of potential 33-character Drive IDs: {len(drive_ids)}")

# Let's also print lines containing some keywords
keywords = ["clinics", "ems", "hospital", "mortuary", "guideline", "urology", "radiology"]
for kw in keywords:
    matches = [m.start() for m in re.finditer(kw, html, re.IGNORECASE)]
    print(f"Keyword '{kw}' matches: {len(matches)}")
    for idx in matches[:5]:
        start = max(0, idx - 100)
        end = min(len(html), idx + 150)
        print(f"  Snippet at {idx}: {repr(html[start:end])}")
