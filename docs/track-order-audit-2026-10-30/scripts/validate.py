#!/usr/bin/env python3
"""Final authoritative match decision over all cached Deezer candidates.
Strict: karaoke/tribute/cover blacklist, artist+duration sanity, title agreement.
Writes reports/matches.json (one row per cue) and reports/match-audit.json.
"""
import json, re
from pathlib import Path
import sys
sys.path.insert(0, "/home/rauf/gta-radio-media/reports/scripts")
from retry import slug, norm, toks, score_cand, SEARCH, REP

BLACK = re.compile(r"karaoke|in the style of|made famous|tribute|originally performed|"
                   r"lullaby|8-bit|8 bit|string quartet|piano tribute|cover version|"
                   r"instrumental version|backing track|sing along|hits of|"
                   r"performs? the hits|rockabye|twinkle", re.I)


def judge(cue, c):
    c = dict(c)
    if not c.get("preview") or (c.get("duration") or 0) < 60:
        return None
    if BLACK.search(c.get("title") or "") or BLACK.search(c.get("artist") or ""):
        return None
    c = score_cand(cue, c)
    ts, as_, jac = c["title_sim"], c["artist_sim"], c["title_jaccard"]
    if as_ < 0.85:
        return None
    if ts >= 0.85:
        c["match_quality"] = "exact"
    elif ts >= 0.62 and jac >= 0.6:
        c["match_quality"] = "partial_title"
    elif as_ >= 0.95 and jac >= 0.75:
        c["match_quality"] = "artist_exact_title_tokens"
    else:
        return None
    # sanity: declared cue length should not wildly exceed the real track
    if cue.get("cue_len") and c.get("duration"):
        if cue["cue_len"] > c["duration"] + 180:
            c["len_warning"] = "cue much longer than track"
    return c


if __name__ == "__main__":
    cues = json.load(open(REP / "cues.json"))
    out, rejected = {}, []
    for cue in cues:
        key = f"{cue['station']}#{cue['idx']:03d}"
        f = SEARCH / (slug(cue["artist"] + " " + cue["song"]) + ".json")
        pool = []
        if f.exists():
            s = json.load(open(f))
            pool = list(s.get("candidates") or [])
            if s.get("best"):
                pool.append(s["best"])
        seen, uniq = set(), []
        for c in pool:
            if c.get("id") and c["id"] not in seen:
                seen.add(c["id"]); uniq.append(c)
        good = [x for x in (judge(cue, c) for c in uniq) if x]
        good.sort(key=lambda x: x["score"], reverse=True)
        if good:
            b = good[0]
            out[key] = {"station": cue["station"], "idx": cue["idx"],
                        "song": cue["song"], "artist": cue["artist"],
                        "deezer_id": b["id"], "dz_title": b["title"],
                        "dz_artist": b["artist"], "dz_album": b["album"],
                        "dz_duration": b["duration"], "preview": b["preview"],
                        "title_sim": b["title_sim"], "artist_sim": b["artist_sim"],
                        "score": b["score"], "match_quality": b["match_quality"],
                        "len_warning": b.get("len_warning")}
        else:
            best = uniq[0] if uniq else None
            out[key] = None
            rejected.append({"key": key, "song": cue["song"], "artist": cue["artist"],
                             "n_candidates": len(uniq),
                             "best_rejected": (best or {}).get("title"),
                             "best_rejected_artist": (best or {}).get("artist"),
                             "why": "no_candidates" if not uniq else "failed_strict_match"})
    json.dump(out, open(REP / "matches.json", "w"), ensure_ascii=False, indent=1)
    json.dump(rejected, open(REP / "unmatched.json", "w"), ensure_ascii=False, indent=1)
    ok = [v for v in out.values() if v]
    print(f"matched {len(ok)}/{len(out)} cues; unmatched {len(rejected)}")
    from collections import Counter
    print(Counter(v["match_quality"] for v in ok))
    print(Counter(m["station"] for m in rejected))
