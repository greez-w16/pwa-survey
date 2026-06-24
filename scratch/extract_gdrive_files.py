import re

file_path = "C:/Users/SK/.gemini/antigravity-ide/brain/fe513b22-9ec1-4f3a-9ab4-a471582a018f/.system_generated/steps/41/content.md"

with open(file_path, "r", encoding="utf-8") as f:
    html = f.read()

# We can search for the JSON strings and the Drive IDs using regex or JS state variables.
# Let's inspect the JSON data embedded in the page. Google Drive often has:
# [ "FILE_ID", ["FOLDER_ID"], "FILE_NAME", "MIME_TYPE", ... ]
# Let's search for patterns like:
# "FILE_ID",["FOLDER_ID"],"FILE_NAME"
# or similar strings in the HTML block.
# Since it is escaped, let's look for both raw and escaped characters.
# Escaped: "ID",[\"FOLDER_ID\"],"NAME"
# Let's write a general parser that looks for:
# "([a-zA-Z0-9_-]{33})",\s*\[\s*"1fFx3hGTFwJ9bHiOspIjWuYYrq6ShPibo"\s*\],\s*"([^"]+\.json)"
# Or with escaped quotes:
# \\x22([a-zA-Z0-9_-]{33})\\x22,\s*\\x5b\s*\\x221fFx3hGTFwJ9bHiOspIjWuYYrq6ShPibo\\x22\s*\\x5d,\s*\\x22([^"\\]+\.json)\\x22

pattern1 = r'"([a-zA-Z0-9_-]{33})",\s*\[\s*"1fFx3hGTFwJ9bHiOspIjWuYYrq6ShPibo"\s*\],\s*"([^"]+\.json)"'
matches1 = re.findall(pattern1, html)

pattern2 = r'\\x22([a-zA-Z0-9_-]{33})\\x22,\s*\\x5b\s*\\x221fFx3hGTFwJ9bHiOspIjWuYYrq6ShPibo\\x22\s*\\x5d,\s*\\x22([^\\"]+\.json)\\x22'
matches2 = re.findall(pattern2, html)

# Let's also look for data-id and data-tooltip or aria-label in HTML elements
pattern3 = r'data-id="([a-zA-Z0-9_-]{33})"[^>]+data-tooltip="([^"]+\.json)'
matches3 = re.findall(pattern3, html)

pattern4 = r'aria-label="([^"]+\.json)[^"]*"\s+data-handled-by-drag-and-drop="true"\s+ssk=\'[^\']*?([a-zA-Z0-9_-]{33})'
matches4 = re.findall(pattern4, html)

# Let's combine all results
files_map = {}
for file_id, name in matches1:
    files_map[name] = file_id
for file_id, name in matches2:
    files_map[name] = file_id
for file_id, name in matches3:
    files_map[name] = file_id
for name, file_id in matches4:
    files_map[name] = file_id

# Let's search generally for any string like `1...` and any `.json` file name within 200 chars
for match in re.finditer(r'[\w\s.-]+\.json', html):
    name = match.group(0)
    # look around 300 chars
    start = max(0, match.start() - 300)
    end = min(len(html), match.end() + 300)
    window_str = html[start:end]
    # find 33-char drive IDs in this window
    ids = re.findall(r'[a-zA-Z0-9_-]{33}', window_str)
    # filter out known strings or common constants
    valid_ids = [i for i in ids if i != '1fFx3hGTFwJ9bHiOspIjWuYYrq6ShPibo' and not i.startswith('closure_')]
    if valid_ids and name not in files_map:
        files_map[name] = valid_ids[0]

print("Extracted files:")
for name, file_id in sorted(files_map.items()):
    print(f"  {name}: {file_id}")

with open("scratch/gdrive_files_map.json", "w") as out:
    json.dump(files_map, out, indent=2)
