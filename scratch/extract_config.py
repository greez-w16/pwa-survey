import json
import re
import os

md_path = r"C:\Users\SK\.gemini\antigravity\brain\3937ff85-2f19-4149-aa6a-47c584c3dd7c\.system_generated\steps\1352\content.md"
dest_path = r"src\assets\hospital_config.json"

with open(md_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Find the start of the JSON (first '{' after the '---')
start_idx = content.find('\n{')
if start_idx == -1:
    start_idx = content.find('{')

if start_idx == -1:
    raise ValueError("Could not find start of JSON in the markdown file")

json_str = content[start_idx:]

# Let's try parsing it to make sure it's valid JSON
try:
    data = json.loads(json_str)
    print("Successfully parsed JSON!")
    print("Keys in JSON:", list(data.keys()))
    if "hospital_full_configuration" in data:
        print("hospital_full_configuration length:", len(data["hospital_full_configuration"]))
except Exception as e:
    print("Failed to parse JSON:", e)
    # Let's print the first 200 chars and last 200 chars of the json string to debug
    print("START OF STR:", repr(json_str[:200]))
    print("END OF STR:", repr(json_str[-200:]))
    raise e

# Write the valid JSON back to the target file
with open(dest_path, 'w', encoding='utf-8') as f:
    json.dump(data, f, indent=2, ensure_ascii=False)

print(f"Successfully wrote JSON to {dest_path}")
