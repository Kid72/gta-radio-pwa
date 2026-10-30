#!/usr/bin/env python3
"""Third pass: wider result sets (limit 25) + Deezer advanced syntax, with 429 tracking."""
import json, re, time, subprocess, unicodedata, difflib, sys
from pathlib import Path
sys.path.insert(0, "/home/rauf/gta-radio-media/reports/scripts")
from retry import slug, norm, toks, score_cand, usable, quality, SEARCH, REP

STATS = {"ok": 0, "none": 0, "http429": 0, "queries": 0}


def get(q, limit=25):
    from urllib.parse import quote_plus
    url = f"https://api.deezer.com/search?q={quote_plus(q)}&limit={limit}"
    for a in range(4):
        p = subprocess.run(["curl", "-s", "-w", "\\n%{http_code}", "--max-time", "25", url],
                           capture_output=True, text=True)
        body, _, code = p.stdout.rpartition("\n")
        STATS["queries"] += 1
        if code == "429":
            STATS["http429"] += 1
            time.sleep(6 + 6 * a)
            continue
        try:
            d = json.loads(body)
        except Exception:
            time.sleep(2 + 2 * a)
            continue
        if "error" in d:
            time.sleep(5)
            continue
        return d.get("data", [])
    return None


def cands(data):
    out = []
    for t in data or []:
        out.append({"id": t["id"], "title": t["title"], "artist": t["artist"]["name"],
                    "album": t["album"]["title"], "duration": t["duration"],
                    "preview": t.get("preview")})
    return out


if __name__ == "__main__":
    cues = json.load(open(REP / "cues.json"))
    todo = []
    for cue in cues:
        f = SEARCH / (slug(cue["artist"] + " " + cue["song"]) + ".json")
        s = json.load(open(f)) if f.exists() else {}
        if not s.get("usable"):
            todo.append((cue, f, s))
    print(f"third pass over {len(todo)} cues")
    for n, (cue, f, old) in enumerate(todo, 1):
        tt = toks(cue["song"])
        qs = [f'{cue["artist"]} {cue["song"]}',
              f'artist:"{cue["artist"]}" track:"{cue["song"]}"']
        if len(tt) >= 2:
            qs.append(f'artist:"{cue["artist"]}" track:"{" ".join(tt[:3])}"')
            qs.append(f'{cue["artist"]} {" ".join(tt[:2])}')
        best = None
        for q in qs:
            data = get(q, 25)
            if data is None:
                continue
            for c in cands(data):
                score_cand(cue, c)
                if usable(c) and (best is None or c["score"] > best["score"]):
                    best = c
            if best and best["title_sim"] >= 0.9:
                break
            time.sleep(0.15)
        if best:
            out = {"query": {"artist": cue["artist"], "song": cue["song"]},
                   "best": best, "best_score": best["score"], "candidates": [best],
                   "usable": True, "match_quality": quality(best), "recovered": True,
                   "prev_best": (old.get("best") or {}).get("title"),
                   "fetched_at": time.strftime("%Y-%m-%dT%H:%M:%S")}
            json.dump(out, open(f, "w"), ensure_ascii=False, indent=1)
            STATS["ok"] += 1
            print(f"[{n}/{len(todo)}] OK  {cue['song'][:34]:36s} -> {best['title'][:32]:34s}"
                  f"/{best['artist'][:16]:18s} {quality(best)}")
        else:
            STATS["none"] += 1
        time.sleep(0.1)
    print(STATS)
    json.dump(STATS, open(REP / "retry3_stats.json", "w"))
