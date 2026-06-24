import urllib.request
import json
import ssl

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

file_id = "1vddMEXH5gDIcLiM4Ew9ZnR-U4uiT-ME0"  # Radiology
url = f"https://drive.google.com/uc?export=download&id={file_id}"

try:
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, context=ctx) as response:
        data = json.loads(response.read().decode('utf-8'))
        
        print("Root keys:", list(data.keys()))
        sections = data.get("sections", [])
        print("Number of sections:", len(sections))
        
        if len(sections) > 0:
            print("\nKeys of sections[0]:", list(sections[0].keys()) if isinstance(sections[0], dict) else type(sections[0]))
            print("\nContent of sections[0]:")
            print(json.dumps(sections[0], indent=2)[:2000])
except Exception as e:
    print(f"Error: {e}")
