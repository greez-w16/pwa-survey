import os

assets_dir = "src/assets"
json_files = []
for root, dirs, files in os.walk(assets_dir):
    for f in files:
        if f.endswith(".json"):
            json_files.append(os.path.join(root, f))

for jf in sorted(json_files):
    print(jf)
