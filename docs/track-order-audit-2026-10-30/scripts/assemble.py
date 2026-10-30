#!/usr/bin/env python3
"""Assemble analysis.json: per-station summaries, cue rows, duration check,
identity check, and the cue->actual-song mapping pattern."""
import json, subprocess
from pathlib import Path
import numpy as np
from collections import Counter

REP = Path("/home/rauf/gta-radio-media/reports")
tim = json.load(open("/home/rauf/wt-gta-media-fix/src/data/track-timings.json"))
ident = json.load(open(REP / "identity.json"))
FFPROBE = "/home/rauf/.hermes/tools/ffmpeg-9.0.1-linux-x64/bin/ffprobe"

stations = {}
for f in sorted(REP.glob("station-*.json")):
    d = json.load(open(f))
    stations[d["summary"]["station"]] = d

dur = {}
for st, v in stations.items():
    g, sid = st.split(":")
    mp3 = Path("/home/rauf/gta-radio-media/raw") / g / f"{sid}.mp3"
    d = float(subprocess.run([FFPROBE, "-v", "error", "-show_entries", "format=duration",
                              "-of", "csv=p=0", str(mp3)], capture_output=True,
                             text=True).stdout.strip())
    decl = tim[st]["duration"]
    dur[st] = {"audio": round(d, 2), "declared": round(decl, 2),
               "delta": round(d - decl, 2), "ok": abs(d - decl) <= 5}

STRONG = 0.60
for st, v in stations.items():
    rows = v["cues"]
    scored = [r for r in rows if r.get("status") == "scored"]
    other = [r for r in scored if r["verdict"] == "other_song_plays_here"]
    deltas = [r["best_other"]["idx"] - r["idx"] for r in other]
    mode = None
    if deltas:
        c = Counter(deltas)
        mode = {"delta": c.most_common(1)[0][0], "n": c.most_common(1)[0][1],
                "frac": round(c.most_common(1)[0][1] / len(deltas), 2)}
    # circular-shift test: is owner_idx == (idx + k) mod n for the modal k?
    shifts = {}
    n = len(rows)
    for r in other:
        k = (r["best_other"]["idx"] - r["idx"]) % n
        shifts[k] = shifts.get(k, 0) + 1
    v["summary"]["delta_mode"] = mode
    v["summary"]["circular_shift_mode"] = (
        {"k": max(shifts, key=shifts.get), "n": max(shifts.values()),
         "frac": round(max(shifts.values()) / len(other), 2)} if shifts else None)
    v["summary"]["duration"] = dur[st]
    v["summary"]["identity"] = ident.get(st)
    v["summary"]["scored_share"] = round(len(scored) / len(rows), 3) if rows else None

# verdicts
def verdict(s):
    if s["scored"] < 4 or (s["confirmed"] + s["other_song"]) < 3:
        return "unverifiable (too few previews)"
    if s["confirmed_share"] is not None and s["confirmed_share"] >= 0.70 and s["median_own"] >= 0.60:
        return "order consistent"
    return "order suspect (evidence of a shifted/incorrect mapping)"

for st, v in stations.items():
    v["summary"]["verdict"] = verdict(v["summary"])

out = {"stations": stations,
       "totals": {
           "cues": sum(v["summary"]["cues"] for v in stations.values()),
           "with_preview": sum(v["summary"]["with_preview"] for v in stations.values()),
           "scored": sum(v["summary"]["scored"] for v in stations.values()),
           "confirmed": sum(v["summary"]["confirmed"] for v in stations.values()),
           "other_song": sum(v["summary"]["other_song"] for v in stations.values()),
           "no_match": sum(v["summary"]["no_match"] for v in stations.values()),
       }}
json.dump(out, open(REP / "analysis.json", "w"), ensure_ascii=False, indent=1)

print(f"{'station':38s} {'cues':>4s} {'prev':>4s} {'scrd':>4s} {'conf':>4s} {'other':>5s} "
      f"{'nomt':>4s} {'cshare':>6s} {'mOwn':>5s} {'mZ':>6s} {'dmod':>8s} {'durΔ':>8s}  verdict")
for st, v in stations.items():
    s = v["summary"]
    dm = s["delta_mode"]
    print(f"{st:38s} {s['cues']:4d} {s['with_preview']:4d} {s['scored']:4d} {s['confirmed']:4d} "
          f"{s['other_song']:5d} {s['no_match']:4d} {str(s['confirmed_share']):>6s} "
          f"{s['median_own']:5.2f} {s['median_z']:6.2f} "
          f"{(str(dm['delta'])+'x'+str(dm['n'])) if dm else '-':>8s} "
          f"{s['duration']['delta']:8.1f}  {s['verdict']}")
print(json.dumps(out["totals"]))
