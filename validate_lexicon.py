import json
from pathlib import Path
from collections import Counter

LEXICON_PATH = Path("assets/data/lexicon.json")  # adjust if needed

def load_lexicon(path: Path):
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    # allow either list of entries OR dict keyed by id
    if isinstance(data, dict):
        # if it's {"meta":..., "entries":[...]}, handle that too
        if "entries" in data and isinstance(data["entries"], list):
            return data["entries"]
        return list(data.values())
    if isinstance(data, list):
        return data
    raise TypeError(f"Unexpected lexicon.json type: {type(data)}")

lex = load_lexicon(LEXICON_PATH)
print(f"Loaded {len(lex)} entries from {LEXICON_PATH}")

# Basic required fields
required = ["id", "pos", "lemma", "paradigm"]
missing_required = []
dupe_ids = [k for k, v in Counter(e.get("id") for e in lex).items() if k and v > 1]

for i, e in enumerate(lex):
    miss = [k for k in required if not e.get(k)]
    if miss:
        missing_required.append((i, e.get("id"), miss))

print(f"Duplicate ids: {len(dupe_ids)}")
if dupe_ids:
    print("  Examples:", dupe_ids[:10])

print(f"Entries missing required fields: {len(missing_required)}")
for row in missing_required[:20]:
    print(" ", row)

# PB sample readiness checks
pb_nouns = [e for e in lex if e.get("PB") and e.get("pos") == "noun"]
print(f"PB nouns: {len(pb_nouns)}")

no_paradigm = [e.get("id") for e in pb_nouns if not e.get("paradigm")]
no_stems = [e.get("id") for e in pb_nouns if not (e.get("strong_stem") or e.get("weak_stem"))]
no_strong = [e.get("id") for e in pb_nouns if not e.get("strong_stem")]

print(f"PB nouns missing paradigm: {len(no_paradigm)}")
print(f"PB nouns missing BOTH stems: {len(no_stems)}")
print(f"PB nouns missing strong_stem: {len(no_strong)}")

if no_stems[:20]:
    print("  Examples missing stems:", no_stems[:20])

# Coverage by paradigm
pb_by_paradigm = Counter(e.get("paradigm") for e in pb_nouns if e.get("paradigm"))
print("PB nouns by paradigm (top 20):")
for pid, n in pb_by_paradigm.most_common(20):
    print(f"  {pid}: {n}")
