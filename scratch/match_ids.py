import os
import json

output_dir = "scratch/downloaded_guidelines"
gdrive_files = sorted(os.listdir(output_dir))

# Load our local configs to match them
local_configs = {
    'hospital': 'hospital_config_utf8.json',
    'clinics': 'clinics_config_utf8.json',
    'ems': 'ems_config_utf8.json',
    'mortuary': 'mortuary_config_utf8.json',
    
    # What about others? We saw src/assets/obsterics-gyno/obsterics_gyno_config.json, etc.
    # Let's list some directories in src/assets
    'obgyn': 'src/assets/obsterics-gyno/obsterics_gyno_config.json',
    'physiotherapy': 'src/assets/physiotheraphy/physiotheraphy_config.json',
    'radiology': 'src/assets/radiology/radiology_config.json',
    'general_practice': 'src/assets/general-practice/general_practice_config.json',
    'private_diabetic': 'src/assets/private-diabetic/private_diabetic_config.json',
    'oral': 'src/assets/oral/oral_config.json',
    'oncology': 'src/assets/private-oncology/private_oncology_config.json',
    'paediatric': 'src/assets/paediatric/paediatric_config.json',
    # Others are built dynamically from matrices at startup in AppContext!
    # e.g., mental_health, eye, hospice, occupational_health, urology, childhood_illness, emergency_management
    # wait, urologyMatrix is src/assets/urology/urology_matrix.json
}

# Load local config criterion IDs
local_ids_map = {}
for key, relative_path in local_configs.items():
    path = relative_path
    if not os.path.exists(path) and not path.startswith("src/"):
        path = os.path.join(".", relative_path)
    if not os.path.exists(path):
        continue
        
    try:
        with open(path, "r", encoding="utf-8") as f:
            cdata = json.load(f)
        
        # Traverse config JSON (it might be wrapped in full_configuration or be direct list or object)
        # e.g. clinics_config_utf8.json has key 'clinics_full_configuration'
        se_list = []
        if isinstance(cdata, dict):
            for k, val in cdata.items():
                if isinstance(val, list) and k.endswith("_full_configuration"):
                    se_list = val
                    break
            if not se_list and "service_elements" in cdata:
                se_list = cdata["service_elements"]
        elif isinstance(cdata, list):
            se_list = cdata
            
        cids = set()
        for se in se_list:
            for sec in se.get("sections", []):
                for std in sec.get("standards", []):
                    for crit in std.get("criteria", []):
                        cids.add(crit.get("id"))
        local_ids_map[key] = cids
        print(f"Loaded local config '{key}' with {len(cids)} criteria.")
    except Exception as e:
        print(f"Error loading local {key}: {e}")

# Now match each downloaded file's IDs with each local config
for filename in gdrive_files:
    if not filename.endswith(".json"):
        continue
    file_path = os.path.join(output_dir, filename)
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        
        # Extract all criteria IDs from downloaded file
        gdrive_ids = set()
        for section in data.get("sections", []):
            for cat in section.get("categories", []):
                for std in cat.get("standards", []):
                    for crit in std.get("criteria", []):
                        cid = crit.get("criterion_id")
                        if cid:
                            gdrive_ids.add(cid)
                            
        print(f"\n{filename} (contains {len(gdrive_ids)} criteria):")
        # Find best local config matching
        best_match = None
        max_intersection = 0
        for key, cids in local_ids_map.items():
            intersection = len(gdrive_ids.intersection(cids))
            if intersection > max_intersection:
                max_intersection = intersection
                best_match = key
        if best_match:
            print(f"  Best matches local config: '{best_match}'")
            print(f"  Intersection size: {max_intersection} / {len(gdrive_ids)}")
            print(f"  Local config size: {len(local_ids_map[best_match])}")
        else:
            print("  No matching local config found.")
    except Exception as e:
        print(f"Error reading {filename}: {e}")
