import os
import json
import ssl
import urllib.request
import base64

# SSL context for self-signed or unverified certificates (useful for local dev or UAT environments)
ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

# 1. Configuration for DHIS2
DHIS2_URL = 'https://moh-qimsuat.gov.bw/qims'
USERNAME = 'inspector1'
PASSWORD = 'Nomisr123$'
NAMESPACE = 'qims-survey-configs'

# Directory paths
GUIDELINES_DIR = "scratch/downloaded_guidelines"

# Mappings of downloaded guideline JSON filename to target local files and configurations
MAPPINGS = [
    {
        "guideline_file": "Botswana National Health Quality Standards for Hospitals  Psychiatric Care.json",
        "config_targets": ["src/assets/hospital/hospital_config.json", "hospital_config_utf8.json"],
        "matrix_targets": [],
        "config_keys": ["hospital_full_configuration"],
        "type": "hospital"
    },
    {
        "guideline_file": "Botswana Private Dietetic Standards and Criteria.json",
        "config_targets": ["src/assets/private-diabetic/private_diabetic_config.json"],
        "matrix_targets": ["src/assets/private-diabetic/private_diabetic_matrix.json"],
        "config_keys": ["private_diabetic_full_configuration", "private_dietetic_full_configuration"],
        "type": "private_diabetic"
    },
    {
        "guideline_file": "Botswana Private Eye Care Standards and Criteria.json",
        "config_targets": [],
        "matrix_targets": ["src/assets/eye/eye_matrix.json"],
        "config_keys": ["eye_full_configuration"],
        "matrix_root_key": "eye",
        "type": "eye"
    },
    {
        "guideline_file": "Botswana Private Hospice and Palliative Care Standards and Criteria.json",
        "config_targets": [],
        "matrix_targets": ["src/assets/hospice/hospice_matrix.json"],
        "config_keys": ["hospice_full_configuration"],
        "matrix_root_key": "hospice",
        "type": "hospice"
    },
    {
        "guideline_file": "Botswana Private Medical Laboratory Standards and Criteria (Autosaved).json",
        "config_targets": [],
        "matrix_targets": ["src/assets/private-medical-lab/private_medical_lab_matrix.json"],
        "config_keys": ["private_medical_lab_full_configuration"],
        "matrix_root_key": "private_medical_lab",
        "type": "private_medical_lab"
    },
    {
        "guideline_file": "Botswana Private Obstetrics and Gynaecology Standards and Criteria.json",
        "config_targets": ["src/assets/obsterics-gyno/obsterics_gyno_config.json"],
        "matrix_targets": ["src/assets/obsterics-gyno/obsterics_gyno_matrix.json"],
        "config_keys": ["obgyn_full_configuration", "obsterics_gyno_full_configuration"],
        "matrix_root_key": "obsterics_gyno",
        "type": "obgyn"
    },
    {
        "guideline_file": "Botswana Private Occupational Health Service Standards and Criteria.json",
        "config_targets": [],
        "matrix_targets": ["src/assets/occupational-health/occupational_health_matrix.json"],
        "config_keys": ["occupational_health_full_configuration"],
        "matrix_root_key": "occupational_health",
        "type": "occupational_health"
    },
    {
        "guideline_file": "Botswana Private Oncology Standards and Criteria-edited (3).json",
        "config_targets": ["src/assets/private-oncology/private_oncology_config.json"],
        "matrix_targets": ["src/assets/private-oncology/private_oncology_matrix.json"],
        "config_keys": ["oncology_full_configuration", "private_oncology_full_configuration"],
        "matrix_root_key": "private_oncology",
        "type": "oncology"
    },
    {
        "guideline_file": "Botswana Private Oral Health Care Standards and Criteria.json",
        "config_targets": ["src/assets/oral/oral_config.json"],
        "matrix_targets": ["src/assets/oral/oral_matrix.json"],
        "config_keys": ["oral_full_configuration"],
        "matrix_root_key": "oral",
        "type": "oral"
    },
    {
        "guideline_file": "Botswana Private Paediatric Standards and Criteria 2.json",
        "config_targets": ["src/assets/paediatric/paediatric_config.json"],
        "matrix_targets": ["src/assets/paediatric/paediatric_matrix.json"],
        "config_keys": ["paediatric_full_configuration"],
        "matrix_root_key": "paediatric",
        "type": "paediatric"
    },
    {
        "guideline_file": "Botswana Private Radiology Standards and Criteria.json",
        "config_targets": ["src/assets/radiology/radiology_config.json"],
        "matrix_targets": ["src/assets/radiology/radiology_matrix.json"],
        "config_keys": ["radiology_full_configuration"],
        "matrix_root_key": "radiology",
        "type": "radiology"
    },
    {
        "guideline_file": "Botswana Private Urology.Nephrology Standards and Criteria.json",
        "config_targets": [],
        "matrix_targets": ["src/assets/urology/urology_matrix.json"],
        "config_keys": ["urology_full_configuration"],
        "matrix_root_key": "urology",
        "type": "urology"
    },
    {
        "guideline_file": "Mental Health Services Programme-Specific Standards and Criteria edited.json",
        "config_targets": [],
        "matrix_targets": ["src/assets/mental-health/mental_health_matrix.json"],
        "config_keys": ["mental_health_full_configuration"],
        "matrix_root_key": "mental_health",
        "type": "mental_health"
    },
    {
        "guideline_file": "NHOS for Private Physiotherapy.json",
        "config_targets": ["src/assets/physiotheraphy/physiotheraphy_config.json"],
        "matrix_targets": ["src/assets/physiotheraphy/physiotheraphy_matrix.json"],
        "config_keys": ["physiotherapy_full_configuration", "physiotheraphy_full_configuration"],
        "matrix_root_key": "physiotheraphy",
        "type": "physiotherapy"
    },
    {
        "guideline_file": "National Health Quality Standards for General Practice ( for approval).json",
        "config_targets": ["src/assets/general-practice/general_practice_config.json"],
        "matrix_targets": ["src/assets/general-practice/general_practice_matrix.json"],
        "config_keys": ["general_practice_full_configuration"],
        "matrix_root_key": "general_practice",
        "type": "general_practice"
    }
]

# Helper: Build configuration elements from matrix items mimicking matrixConfig.js
def build_config_from_matrix(service_name, matrix_items):
    if not matrix_items:
        return []
        
    se_map = {}
    
    for item in matrix_items:
        cid = item.get("criteria")
        if not cid:
            continue
        parts = cid.split('.')
        if len(parts) < 4:
            continue
            
        try:
            se_id = int(parts[0])
        except ValueError:
            continue
            
        section_pi_id = ".".join(parts[0:2])
        standard_id = ".".join(parts[0:3])
        
        if se_id not in se_map:
            se_map[se_id] = {
                "se_id": se_id,
                "se_name": f"Service Element {se_id}",
                "sections_map": {}
            }
        se = se_map[se_id]
        
        if section_pi_id not in se["sections_map"]:
            se["sections_map"][section_pi_id] = {
                "section_pi_id": section_pi_id,
                "title": f"Section {section_pi_id}",
                "standards_map": {}
            }
        section = se["sections_map"][section_pi_id]
        
        if standard_id not in section["standards_map"]:
            section["standards_map"][standard_id] = {
                "standard_id": standard_id,
                "statement": f"Standard statement for {standard_id}",
                "intent_tooltip": "",
                "criteria": []
            }
        standard = section["standards_map"][standard_id]
        
        # Check if criterion exists
        existing = next((c for c in standard["criteria"] if c["id"] == cid), None)
        if not existing:
            standard["criteria"].append({
                "id": cid,
                "category": "",
                "severity": None,
                "description": item.get("description", ""),
                "is_critical": False,
                "guideline": item.get("guideline", ""),
                "guidelines": item.get("guidelines", "")
            })
            
    # Convert maps to sorted arrays
    service_elements = []
    for se_id, se in sorted(se_map.items()):
        sections = []
        for sec_id, sec in sorted(se["sections_map"].items(), key=lambda x: [int(p) for p in x[0].split('.')]):
            standards = []
            for std_id, std in sorted(sec["standards_map"].items(), key=lambda x: [int(p) for p in x[0].split('.')]):
                # Sort criteria
                std["criteria"].sort(key=lambda x: [int(p) for p in x["id"].split('.')])
                standards.append(std)
            # Sort standards
            standards.sort(key=lambda x: [int(p) for p in x["standard_id"].split('.')])
            sections.append({
                "section_pi_id": sec["section_pi_id"],
                "title": sec["title"],
                "standards": standards
            })
        service_elements.append({
            "se_id": se["se_id"],
            "se_name": se["se_name"],
            "sections": sections
        })
        
    return service_elements

# Helper: Update standard config JSON structure with guidelines
def update_config_json(config_data, guidelines_map, root_key=None):
    # Determine the array of service elements
    se_list = []
    has_root_key = False
    
    if isinstance(config_data, dict):
        if root_key and root_key in config_data:
            se_list = config_data[root_key]
            has_root_key = True
        else:
            # Try to guess
            for k, val in config_data.items():
                if isinstance(val, list) and (k.endswith("_full_configuration") or k == "service_elements"):
                    se_list = val
                    root_key = k
                    has_root_key = True
                    break
    elif isinstance(config_data, list):
        se_list = config_data
        
    if not se_list:
        return config_data, 0
        
    updated_count = 0
    for se in se_list:
        for section in se.get("sections", []):
            for standard in section.get("standards", []):
                for criterion in standard.get("criteria", []):
                    cid = criterion.get("id")
                    if cid in guidelines_map:
                        g_text = guidelines_map[cid]
                        criterion["guideline"] = g_text
                        criterion["guidelines"] = g_text
                        updated_count += 1
                        
    if has_root_key:
        config_data[root_key] = se_list
    else:
        config_data = se_list
        
    return config_data, updated_count

# Helper: Update matrix JSON structure with guidelines
def update_matrix_json(matrix_data, guidelines_map, root_key):
    items = []
    has_root_key = False
    if isinstance(matrix_data, dict) and root_key in matrix_data:
        items = matrix_data[root_key]
        has_root_key = True
    elif isinstance(matrix_data, list):
        items = matrix_data
        
    if not items:
        return matrix_data, 0
        
    updated_count = 0
    for item in items:
        cid = item.get("criteria")
        if cid in guidelines_map:
            g_text = guidelines_map[cid]
            item["guideline"] = g_text
            item["guidelines"] = g_text
            updated_count += 1
            
    if has_root_key:
        matrix_data[root_key] = items
    else:
        matrix_data = items
        
    return matrix_data, updated_count

# Helper: Upload payload to DHIS2 DataStore
def upload_to_datastore(namespace, key, data):
    url = f"{DHIS2_URL.rstrip('/')}/api/dataStore/{namespace}/{key}"
    auth = base64.b64encode(f"{USERNAME}:{PASSWORD}".encode('utf-8')).decode('utf-8')
    headers = {
        'Content-Type': 'application/json',
        'Authorization': f'Basic {auth}'
    }
    
    # Try PUT first (upsert)
    req = urllib.request.Request(
        url,
        data=json.dumps(data).encode('utf-8'),
        headers=headers,
        method='PUT'
    )
    try:
        with urllib.request.urlopen(req, context=ctx) as response:
            res_body = response.read().decode('utf-8')
            print(f"  [OK] Successfully updated DataStore {namespace}/{key}")
            return True
    except urllib.error.HTTPError as e:
        if e.code == 404:
            # Try POST if key does not exist yet
            req_post = urllib.request.Request(
                url,
                data=json.dumps(data).encode('utf-8'),
                headers=headers,
                method='POST'
            )
            try:
                with urllib.request.urlopen(req_post, context=ctx) as response_post:
                    res_body_post = response_post.read().decode('utf-8')
                    print(f"  [OK] Successfully created DataStore {namespace}/{key}")
                    return True
            except Exception as ex_post:
                print(f"  [ERROR] POST failed for {key}: {ex_post}")
                return False
        else:
            print(f"  [ERROR] PUT failed for {key} (Status {e.code}): {e.read().decode('utf-8')}")
            return False
    except Exception as e:
        print(f"  [ERROR] Failed uploading {key}: {e}")
        return False

def main():
    print("=== STARTING GUIDELINES EXTRACTION & UPDATE ===")
    
    # To accumulate the full updated configurations for remote upload
    configs_to_upload = {}
    
    for mapping in MAPPINGS:
        guideline_file = mapping["guideline_file"]
        guideline_path = os.path.join(GUIDELINES_DIR, guideline_file)
        
        if not os.path.exists(guideline_path):
            print(f"[WARN] Guideline file {guideline_file} not found. Skipping...")
            continue
            
        print(f"\nProcessing guidelines from: {guideline_file}")
        
        # Load guidelines map
        with open(guideline_path, "r", encoding="utf-8-sig") as f:
            g_data = json.load(f)
            
        guidelines_map = {}
        for section in g_data.get("sections", []):
            for cat in section.get("categories", []):
                for std in cat.get("standards", []):
                    for crit in std.get("criteria", []):
                        cid = crit.get("criterion_id")
                        g_text = crit.get("guideline", "")
                        if cid and g_text and len(g_text.strip()) > 0:
                            guidelines_map[cid] = g_text.strip()
                            
        print(f"  Extracted {len(guidelines_map)} non-empty guidelines.")
        
        updated_se_list = None
        
        # 1. Update config files
        for config_path in mapping["config_targets"]:
            if not os.path.exists(config_path):
                print(f"  [WARN] Config file {config_path} not found.")
                continue
            with open(config_path, "r", encoding="utf-8-sig") as cf:
                config_data = json.load(cf)
            
            # Find the root key if dictionary
            root_key = None
            if isinstance(config_data, dict):
                for k in config_data.keys():
                    if k.endswith("_full_configuration") or k == "service_elements":
                        root_key = k
                        break
                        
            config_data, up_cnt = update_config_json(config_data, guidelines_map, root_key)
            with open(config_path, "w", encoding="utf-8-sig") as cf_w:
                json.dump(config_data, cf_w, indent=2, ensure_ascii=False)
            print(f"  [INFO] Updated {up_cnt} criteria guidelines in {config_path}")
            
            # Save the service element array for upload
            if isinstance(config_data, dict) and root_key:
                updated_se_list = config_data[root_key]
            elif isinstance(config_data, list):
                updated_se_list = config_data
                
        # 2. Update matrix files
        for matrix_path in mapping["matrix_targets"]:
            if not os.path.exists(matrix_path):
                print(f"  [WARN] Matrix file {matrix_path} not found.")
                continue
            with open(matrix_path, "r", encoding="utf-8-sig") as mf:
                matrix_data = json.load(mf)
                
            matrix_root_key = mapping.get("matrix_root_key", mapping["type"])
            matrix_data, up_cnt = update_matrix_json(matrix_data, guidelines_map, matrix_root_key)
            with open(matrix_path, "w", encoding="utf-8-sig") as mf_w:
                json.dump(matrix_data, mf_w, indent=4, ensure_ascii=False)
            print(f"  [INFO] Updated {up_cnt} criteria guidelines in {matrix_path}")
            
            # If we don't have a config file target, we dynamically build the config array from this updated matrix!
            if not updated_se_list:
                matrix_items = matrix_data[matrix_root_key] if isinstance(matrix_data, dict) else matrix_data
                updated_se_list = build_config_from_matrix(mapping["type"], matrix_items)
                print(f"  [INFO] Dynamically generated config from matrix with {len(updated_se_list)} service elements.")
                
        # Cache the service elements for remote upload
        if updated_se_list:
            for remote_key in mapping["config_keys"]:
                configs_to_upload[remote_key] = updated_se_list

    # 3. Remote Uploads to DHIS2 DataStore
    print("\n=== UPLOADING TO DHIS2 DATASTORE ===")
    print(f"Ready to upload {len(configs_to_upload)} configuration keys...")
    
    success_count = 0
    for key, data in configs_to_upload.items():
        print(f"Uploading key: {key}...")
        # Since AppSettings.jsx uploads raw service element arrays for most keys, 
        # we directly upload the data array (with root flags handled dynamically by buildConfigFromMatrix/update_config_json).
        
        # Core configs might need to be uploaded as wrapped object if matching DevConfigExport's wrapWithKey:
        # e.g., { hospital_full_configuration: [...] }
        # Let's wrap core configs that require wrapping:
        core_wrappers = {
            'hospital_full_configuration': 'hospital_full_configuration',
            'clinics_full_configuration': 'clinics_full_configuration',
            'ems_full_configuration': 'ems_full_configuration',
            'mortuary_full_configuration': 'mortuary_full_configuration'
        }
        
        payload = data
        if key in core_wrappers:
            payload = { key: data }
            
        success = upload_to_datastore(NAMESPACE, key, payload)
        if success:
            success_count += 1
            
            # If this is a core config, we also update its bundle in qims-config-assessment namespace
            # e.g. 'hospital_bundle', 'clinics_bundle', 'ems_bundle', 'mortuary_bundle'
            bundle_map = {
                'hospital_full_configuration': 'hospital_bundle',
                'clinics_full_configuration': 'clinics_bundle',
                'ems_full_configuration': 'ems_bundle',
                'mortuary_full_configuration': 'mortuary_bundle'
            }
            if key in bundle_map:
                bundle_key = bundle_map[key]
                print(f"  Uploading matching bundle to qims-config-assessment/{bundle_key}...")
                
                # Fetch baseline files to build bundle
                # e.g. for hospital, we need configuration, links, and compute
                # Let's load links and compute dynamically
                links = []
                compute = {}
                
                links_paths = {
                    'hospital_bundle': ('src/assets/hospital/hospital_links.json', 'src/assets/hospital/hospital_compute_criteria.json'),
                    'clinics_bundle': ('src/assets/clinics/clinics_links.json', None),
                    'ems_bundle': ('src/assets/ems/ems_links.json', None),
                    'mortuary_bundle': ('src/assets/mortuary/mortuary_links.json', None)
                }
                
                links_path, compute_path = links_paths[bundle_key]
                if links_path and os.path.exists(links_path):
                    with open(links_path, "r", encoding="utf-8-sig") as lf:
                        links = json.load(lf)
                if compute_path and os.path.exists(compute_path):
                    with open(compute_path, "r", encoding="utf-8-sig") as cf:
                        compute = json.load(cf)
                        
                bundle_payload = {
                    "config": payload,
                    "links": links,
                    "compute": compute
                }
                upload_to_datastore('qims-config-assessment', bundle_key, bundle_payload)
                
    print(f"\n=== PROCESS COMPLETE: {success_count} / {len(configs_to_upload)} remote keys uploaded successfully. ===")

if __name__ == "__main__":
    main()
