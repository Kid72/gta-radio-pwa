#!/usr/bin/env python3
"""Final per-cue / per-station analysis: own score, rank, best-matching song,
cue->owner mapping characterisation, station audio-identity check."""
import json, sys, time
from pathlib import Path
import numpy as np
from scipy.stats import spearmanr
sys.path.insert(0, "/home/rauf/gta-radio-media/reports/scripts")
import score3 as S3

REP = Path("/home/rauf/gta-radio-media/reports")
STRONG = 0.60
OWN_OK = 0.60


def station_identity():
    """NCC of a 180 s slice of each station against every other station's audio."""
    d = json.load(open(REP / "cue_features.json"))
    keys = sorted({c["station"] for c in d})
    C = {}
    for st in keys:
        g, sid = st.split(":")
        C[st] = S3.station_chroma(st, g, sid).astype(np.float64)
    tmpl = {st: C[st][:, 600:600 + int(180 / S3.FRAME)] for st in keys}   # ~111 s
    res = {}
    for a in keys:
        best = (-9, None)
        for b in keys:
            if a == b:
                continue
            s, _ = S3.ncc(C[b], tmpl[a])
            if s > best[0]:
                best = (s, b)
        res[a] = {"best_other_station": best[1], "score": round(best[0], 3),
                  "duplicate": best[0] >= 0.7}
    return res


def main():
    M = json.load(open(REP / "matches.json"))
    cues = json.load(open(REP / "cue_features.json"))
    dur = json.load(open("/home/rauf/wt-gta-media-fix/src/data/track-timings.json"))
    by = {}
    for c in cues:
        by.setdefault(c["station"], []).append(c)
    out = {}
    t0 = time.time()
    for st, lst in by.items():
        g, sid = st.split(":")
        C = S3.station_chroma(st, g, sid).astype(np.float64)
        pv = {}
        for c in lst:
            v = M.get(f"{st}#{c['idx']:03d}")
            if v:
                pc = S3.preview_chroma(str(v["deezer_id"]), v["preview"])
                if pc is not None:
                    pv[str(v["deezer_id"])] = pc
        rows = []
        for c in lst:
            v = M.get(f"{st}#{c['idx']:03d}")
            rec = {"idx": c["idx"], "song": c["song"], "artist": c["artist"],
                   "start": c["start"], "end": c["end"], "cue_len": round(c["cue_len"], 1)}
            if not v:
                rec["status"] = "no_preview"
                rows.append(rec); continue
            rec["deezer"] = {"id": v["deezer_id"], "title": v["dz_title"],
                             "artist": v["dz_artist"], "album": v["dz_album"],
                             "duration": v["dz_duration"], "quality": v["match_quality"],
                             "title_sim": v["title_sim"], "artist_sim": v["artist_sim"]}
            sl = S3.cue_slice(c, C)
            oid = str(v["deezer_id"])
            if sl is None or oid not in pv:
                rec["status"] = "no_audio"; rows.append(rec); continue
            own, lag = S3.ncc(sl, pv[oid])
            sc = []
            for k2, p2 in pv.items():
                if k2 == oid:
                    continue
                s2, l2 = S3.ncc(sl, p2)
                sc.append((s2, k2, l2))
            arr = np.array([x[0] for x in sc])
            best = max(sc, key=lambda x: x[0])
            owner_idx = None
            for c2 in lst:
                v2 = M.get(f"{st}#{c2['idx']:03d}")
                if v2 and str(v2["deezer_id"]) == best[1]:
                    owner_idx = c2["idx"]; owner_song = c2["song"]; owner_artist = c2["artist"]
                    break
            rec.update({
                "status": "scored",
                "own": round(own, 4),
                "own_at_s": round(c["start"] + lag * S3.FRAME, 1),
                "own_rank": int(1 + (arr > own + 1e-9).sum()),
                "runner_up": round(float(arr.max()), 4),
                "margin": round(own - float(arr.max()), 4),
                "z": round(float((own - arr.mean()) / max(arr.std(), 1e-6)), 2),
                "n_others": len(sc),
                "best_other": {"idx": owner_idx, "song": owner_song, "artist": owner_artist,
                               "score": round(best[0], 4)},
            })
            # per-cue verdict
            if own >= OWN_OK and rec["own_rank"] == 1:
                rec["verdict"] = "confirmed"
            elif best[0] >= STRONG:
                rec["verdict"] = "other_song_plays_here"
            else:
                rec["verdict"] = "no_match"
            rows.append(rec)
        scored = [r for r in rows if r.get("status") == "scored"]
        conf = [r for r in scored if r["verdict"] == "confirmed"]
        other = [r for r in scored if r["verdict"] == "other_song_plays_here"]
        nomatch = [r for r in scored if r["verdict"] == "no_match"]
        deltas = [r["best_other"]["idx"] - r["idx"] for r in other]
        rho = None
        if len(other) >= 4:
            rho = float(spearmanr([r["idx"] for r in other],
                                  [r["best_other"]["idx"] for r in other]).statistic)
        # circular-shift fraction: does one constant delta explain most matches?
        same_delta = None
        if deltas:
            vals, counts = np.unique(deltas, return_counts=True)
            same_delta = round(float(counts.max() / len(deltas)), 3)
        summ = {
            "station": st, "game": g, "station_id": sid,
            "declared_duration": dur[st]["duration"],
            "cues": len(rows),
            "with_preview": sum(1 for r in rows if r.get("deezer")),
            "scored": len(scored),
            "confirmed": len(conf), "other_song": len(other), "no_match": len(nomatch),
            "confirmed_share": round(len(conf) / len(scored), 3) if scored else None,
            "rank1": sum(1 for r in scored if r["own_rank"] == 1),
            "median_own": round(float(np.median([r["own"] for r in scored])), 4) if scored else None,
            "median_margin": round(float(np.median([r["margin"] for r in scored])), 4) if scored else None,
            "median_z": round(float(np.median([r["z"] for r in scored])), 2) if scored else None,
            "median_best_other": round(float(np.median([r["best_other"]["score"] for r in scored])), 4) if scored else None,
            "spearman_idx_vs_owner": round(rho, 2) if rho is not None else None,
            "same_delta_fraction": same_delta,
        }
        out[st] = {"summary": summ, "cues": rows}
        print(json.dumps(summ, ensure_ascii=False), flush=True)
        json.dump(out[st], open(REP / f"station-{st.replace(':','_')}.json", "w"),
                  ensure_ascii=False, indent=1)
    ident = station_identity()
    json.dump({"stations": out, "identity": ident},
              open(REP / "analysis.json", "w"), ensure_ascii=False, indent=1)
    print("wrote analysis.json", f"{time.time()-t0:.0f}s")


if __name__ == "__main__":
    main()
