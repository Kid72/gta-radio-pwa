#!/usr/bin/env python3
"""Second pass: recover unusable searches with relaxed queries.
Never overwrites an already-usable result. Records match quality."""
import json, re, time, subprocess, unicodedata, difflib
from pathlib import Path

REP = Path("/home/rauf/gta-radio-media/reports")
SEARCH = REP / "cache" / "search"

STOP = {"rmx", "mix", "edit", "original", "instrumental", "version", "remaster",
        "remastered", "feat", "ft", "the", "a", "an", "of", "and", "&", "part",
        "pts", "pt", "rework", "digital", "radio"}


def slug(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-zA-Z0-9]+", "-", s).strip("-").lower()[:80]


def norm(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    s = re.sub(r"\(.*?\)|\[.*?\]", " ", s)
    s = re.sub(r"\b(feat|ft|featuring|remaster(ed)?|version|radio edit|edit|mix|mono|stereo)\b", " ", s)
    s = re.sub(r"^(the)\s+", "", s)
    s = re.sub(r"[^a-z0-9 ]+", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def toks(s):
    return [t for t in norm(s).split() if t not in STOP]


def curl(url):
    for a in range(3):
        p = subprocess.run(["curl", "-s", "--max-time", "25", url], capture_output=True, text=True)
        try:
            d = json.loads(p.stdout)
        except Exception:
            time.sleep(2 + 2 * a); continue
        if "error" in d:
            time.sleep(4 + 4 * a); continue
        return d
    return None


def fetch(q, limit=8):
    from urllib.parse import quote_plus
    d = curl(f"https://api.deezer.com/search?q={quote_plus(q)}&limit={limit}")
    if d is None:
        return None
    out = []
    for t in d.get("data", []):
        out.append({"id": t["id"], "title": t["title"],
                    "artist": t["artist"]["name"],
                    "album": t["album"]["title"],
                    "duration": t["duration"], "preview": t.get("preview")})
    return out


def score_cand(cue, c):
    ta, aa = norm(cue["song"]), norm(cue["artist"])
    tc, ac = norm(c["title"]), norm(c["artist"])
    tsim = difflib.SequenceMatcher(None, ta, tc).ratio()
    if ta and (ta in tc or tc in ta):
        tsim = max(tsim, 0.92)
    at, bt = set(aa.split()), set(ac.split())
    ov = len(at & bt) / max(1, len(at | bt))
    asim = max(difflib.SequenceMatcher(None, aa, ac).ratio(), ov)
    if aa and (aa in ac or ac in aa):
        asim = max(asim, 0.95)
    sta, stc = set(toks(cue["song"])), set(toks(c["title"]))
    jac = len(sta & stc) / max(1, len(sta | stc))
    c["title_sim"], c["artist_sim"] = round(tsim, 3), round(asim, 3)
    c["title_jaccard"] = round(jac, 3)
    c["score"] = round(0.6 * tsim + 0.4 * asim, 3)
    return c


def usable(c):
    if not c or not c.get("preview") or (c.get("duration") or 0) < 60:
        return False
    if c["artist_sim"] >= 0.85 and (c["title_sim"] >= 0.62 or c["title_jaccard"] >= 0.5):
        return True
    return False


def quality(c):
    if c["title_sim"] >= 0.9:
        return "exact"
    if c["title_sim"] >= 0.62:
        return "partial_title"
    return "artist_title_tokens"


if __name__ == "__main__":
    cues = json.load(open(REP / "cues.json"))
    todo = []
    for cue in cues:
        f = SEARCH / (slug(cue["artist"] + " " + cue["song"]) + ".json")
        s = json.load(open(f)) if f.exists() else {"usable": False, "best": None}
        if not s.get("usable"):
            todo.append((cue, f, s))
    print(f"retry candidates: {len(todo)}")
    stats = {"recovered": 0, "still_missing": 0, "queries": 0}
    for n, (cue, f, old) in enumerate(todo, 1):
        tt = toks(cue["song"])
        variants = []
        if len(tt) >= 2:
            variants.append(f'{cue["artist"]} {" ".join(tt[:3])}')
        variants.append(f'{cue["artist"]} {cue["song"]}')
        if len(tt) >= 1:
            variants.append(f'{" ".join(tt[:4])}')
        variants.append(f"{cue['artist']}")
        best, tried = None, 0
        for q in variants:
            tried += 1
            res = fetch(q)
            stats["queries"] += 1
            if not res:
                continue
            for c in res:
                score_cand(cue, c)
                if usable(c) and (best is None or c["score"] > best["score"]):
                    best = c
            if best and best["title_sim"] >= 0.9:
                break
            time.sleep(0.2)
        if best:
            out = {"query": {"artist": cue["artist"], "song": cue["song"]},
                   "n_results": 1, "best": best, "best_score": best["score"],
                   "candidates": [best], "usable": True,
                   "match_quality": quality(best), "recovered": True,
                   "prev_best": (old.get("best") or {}).get("title"),
                   "fetched_at": time.strftime("%Y-%m-%dT%H:%M:%S")}
            json.dump(out, open(f, "w"), ensure_ascii=False, indent=1)
            stats["recovered"] += 1
            print(f"[{n}/{len(todo)}] OK  {cue['station'][:26]:28s} {cue['song'][:30]:32s} -> "
                  f"{best['title'][:30]:32s}/{best['artist'][:16]:18s} {quality(best)}")
        else:
            stats["still_missing"] += 1
            print(f"[{n}/{len(todo)}] --  {cue['station'][:26]:28s} {cue['song'][:30]:32s} (no match)")
        time.sleep(0.15)
    print(stats)
    json.dump(stats, open(REP / "retry_stats.json", "w"))
