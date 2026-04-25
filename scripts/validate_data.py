import json
from pathlib import Path
p=Path(__file__).resolve().parents[1]/"data"/"site-data.json"
d=json.loads(p.read_text(encoding="utf-8"))
assert d["crops"]
for c in d["crops"]: assert c["level"] in d["levels"]
print("OK")
