import requests
import json
import urllib3

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

url = "https://moh-qimsuat.gov.bw/qims/api/programStages/radStageU11.json"
auth = ("inspector1", "Nomisr123$")
params = {"fields": "programStageDataElements[dataElement[id,name,displayName,formName,code,description]]"}

try:
    response = requests.get(url, auth=auth, params=params, verify=False, timeout=30)
    response.raise_for_status()
    metadata = response.json()
    
    data_elements = []
    for psde in metadata.get("programStageDataElements", []):
        de = psde.get("dataElement")
        if de:
            data_elements.append(de)
            
    target_de = []
    for de in data_elements:
        code = str(de.get("code", ""))
        name = str(de.get("name", ""))
        if "1.4.2" in code or "1.4.2" in name:
            target_de.append(de)
            
    target_de.sort(key=lambda x: x.get("code", "") or x.get("name", ""))
    
    output_lines = []
    output_lines.append(f"Found {len(target_de)} data elements matching '1.4.2':\n")
    for de in target_de:
        output_lines.append(f"ID: {de.get('id')}")
        output_lines.append(f"  Code: {de.get('code')}")
        output_lines.append(f"  Name: {de.get('name')}")
        output_lines.append(f"  DisplayName: {de.get('displayName')}")
        output_lines.append(f"  FormName: {de.get('formName')}")
        output_lines.append(f"  Description: {de.get('description')}")
        output_lines.append("-" * 50)
        
    with open("scratch/rad_1.4.2_descriptions.txt", "w", encoding="utf-8") as f:
        f.write("\n".join(output_lines))
    print("Done! Output written to scratch/rad_1.4.2_descriptions.txt")
    
except Exception as e:
    print(f"Error: {e}")
