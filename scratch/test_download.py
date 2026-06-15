import urllib.request
import json
import ssl

# Bypass SSL certificate verification if needed
ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

file_id = "1vddMEXH5gDIcLiM4Ew9ZnR-U4uiT-ME0"  # Radiology Standards and Criteria
url = f"https://drive.google.com/uc?export=download&id={file_id}"

try:
    print(f"Downloading from {url}...")
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, context=ctx) as response:
        content = response.read()
        print(f"Download complete! Size: {len(content)} bytes")
        
        # Try parsing as JSON
        data = json.loads(content.decode('utf-8'))
        print("Successfully parsed as JSON!")
        # Print root keys
        if isinstance(data, dict):
            print("Root keys:", list(data.keys()))
        elif isinstance(data, list):
            print("Parsed list of length:", len(data))
            if len(data) > 0:
                print("First element keys:", list(data[0].keys()) if isinstance(data[0], dict) else type(data[0]))
except Exception as e:
    print(f"Failed to download/parse: {e}")
