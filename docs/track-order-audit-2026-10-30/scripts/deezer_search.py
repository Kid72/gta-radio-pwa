#!/usr/bin/env python3
"""Build cue list + fetch Deezer search results (cached)."""
import json, os, re, subprocess, sys, time, unicodedata, difflib, hashlib
from pathlib import Path

ROOT = Path("/home/rauf/gta-radio-media")
REP = ROOT / "reports"
CACHE = REP / "cache"
SEARCH = CACHE / "search"
PREV = CACHE / "cache_previews"  # unused
SEARCH.mkdir(parents=True, exist_ok=True)
(REP / "cache" / "previews").mkdir(parents=True, exist_ok=True)

TIMINGS = Path("/home/rauf/wt-gta-media-fix/src/data/track-timings.json")
EXCLUDED = {"kult-fm", "the-lowdown-911", "motomami-los-santos",
            "the-music-locker", "still-slipping-los-santos"}


def slug(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    s = re.sub(r"[^a-zA-Z0-9]+", "-", s).strip("-").lower()
    return s[:80] or hashlib.md5(s.encode()).hexdigest()[:8]


def norm(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    s = re.sub(r"\(.*?\)|\[.*?\]", " ", s)
    s = re.sub(r"\b(feat|ft|featuring|remaster(ed)?|version|radio edit|edit|mix|mono|stereo)\b", " ", s)
    s = re.sub(r"^(the)\s+", "", s)
    s = re.sub(r"[^a-z0-9 ]+", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def load_cues():
    d = json.load(open(TIMINGS))
    out = []
    for key, st in d.items():
        game, sid = key.split(":")
        if sid in EXCLUDED:
            continue
        for i, c in enumerate(st["cues"]):
            if c.get("type") != "music":
                continue
            out.append({
                "station": key, "game": game, "station_id": sid, "idx": i,
                "start": c["start"], "end": c["end"],
                "song": c["song"], "artist": c["artist"],
                "cue_len": round(c["end"] - c["start"], 3),
                "duration_declared": st["duration"],
            })
    return out, d


def curl_json(url):
    p = subprocess.run(["curl", "-s", "--max-time", "25", url], capture_output=True, text=True)
    try:
        return json.loads(p.stdout)
    except Exception:
        return None


def search_one(cue):
    f = SEARCH / (slug(cue["artist"] + " " + cue["song"]) + ".json")
    if f.exists():
        try:
            return json.load(open(f))
        except Exception:
            pass
    q = re.sub(r"[^\w\s'&.-]", " ", cue["artist"] + " " + cue["song"]).replace(" ", "+")
    url = f"https://api.deezer.com/search?q={q}&limit=8"
    res = curl_json(url)
    if res is None:
        return {"error": "parse_fail"}
    if "error" in res:
        return {"error": res["error"].get("message", "api_error")}
    data = []
    for t in res.get("data", []):
        data.append({
            "id": t.get("id"), "title": t.get("title"),
            "artist": t.get("artist", {}).get("name"),
            "album": t.get("album", {}).get("title"),
            "duration": t.get("duration"), "preview": t.get("preview"),
        })
    best, bestscore, notes = None, -1.0, []
    ta = norm(cue["song"])
    aa = norm(cue["artist"])
    for cand in data:
        tc, ac = norm(cand["title"]), norm(cand["artist"] or "")
        tsim = difflib.SequenceMatcher(None, ta, tc).ratio()
        if ta and (ta in tc or tc in ta):
            tsim = max(tsim, 0.92)
        # artist similarity: token overlap + string sim
        at = set(aa.split()); bt = set(ac.split())
        ov = len(at & bt) / max(1, len(at | bt))
        asim = max(difflib.SequenceMatcher(None, aa, ac).ratio(), ov)
        if aa and (aa in ac or ac in aa):
            asim = max(asim, 0.95)
        score = 0.6 * tsim + 0.4 * asim
        cand["title_sim"], cand["artist_sim"], cand["score"] = round(tsim, 3), round(asim, 3), round(score, 3)
        if score > bestscore:
            best, bestscore = cand, score
    out = {
        "query": {"artist": cue["artist"], "song": cue["song"]},
        "n_results": len(data),
        "best": best, "best_score": round(bestscore, 3) if best else 0,
        "candidates": data,
        "usable": bool(best and best.get("preview") and bestscore >= 0.62
                       and best.get("artist_sim", 0) >= 0.55),
        "fetched_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
    }
    json.dump(out, open(f, "w"), ensure_ascii=False, indent=1)
    return out


if __name__ == "__main__":
    cues, raw = load_cues()
    json.dump(cues, open(REP / "cues.json", "w"), indent=1)
    print(f"cues: {len(cues)} over {len({c['station'] for c in cues})} stations")
    t0 = time.time()
    fails = 0
    for n, cue in enumerate(cues, 1):
        r = search_one(cue)
        if "error" in r:
            fails += 1
            print(f"ERR {cue['station']} {cue['song']}: {r['error']}")
            if "rate" in str(r["error"]).lower() or "quota" in str(r["error"]).lower():
                time.sleep(5)
            continue
        b = r.get("best") or {}
        flag = "" if r["usable"] else "  <-- NOT USABLE"
        print(f"[{n}/{len(cues)}] {cue['station'][:28]:30s} {cue['song'][:32]:34s} -> "
              f"{(b.get('title') or '-')[:32]:34s} / {(b.get('artist') or '-')[:18]:20s} "
              f"s={r['best_score']:.2f} id={b.get('id')}{flag}")
        time.sleep(0.22)
    print(f"done in {time.time()-t0:.0f}s, errors={fails}")
