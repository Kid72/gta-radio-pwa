#!/usr/bin/env python3
"""Audit scorer v3.
- one chroma cache per station file (11.025 kHz mono, CQT hop 1024 = 93 ms)
- one chroma cache per Deezer preview (same params)
- cue segment = exact slice of the station chroma (no per-cue decode)
- score = max Pearson NCC of the 161-frame (30 s) preview slid over the cue slice
- leave-one-out over the station's previews

subcommands: station | prev | score | global
"""
import json, subprocess, sys, time
from pathlib import Path
import numpy as np
from numpy.lib.stride_tricks import sliding_window_view
import librosa

ROOT = Path("/home/rauf/gta-radio-media")
REP = ROOT / "reports"
F1 = REP / "cache/features"          # old per-cue cache (unused here)
ST_CACHE = REP / "cache/station"
PV_CACHE = REP / "cache/prev2"
for d in (ST_CACHE, PV_CACHE):
    d.mkdir(parents=True, exist_ok=True)

SR = 11025
HOP = 1024
POOL = 2
FRAME = HOP * POOL / SR              # 0.1858 s (after 2x pooling)
CAP = 900.0
FFMPEG = "/home/rauf/.hermes/tools/ffmpeg-9.0.1-linux-x64/bin/ffmpeg"
FFPROBE = "/home/rauf/.hermes/tools/ffmpeg-9.0.1-linux-x64/bin/ffprobe"
CHUNK = 1800.0


def chroma_slice(y):
    c = librosa.feature.chroma_cqt(y=np.ascontiguousarray(y), sr=SR, hop_length=HOP,
                                   n_chroma=12, norm=2).astype(np.float32)
    n = np.linalg.norm(c, axis=0, keepdims=True)
    c = c / np.maximum(n, 1e-8)
    k = POOL
    m = (c.shape[1] // k) * k
    if m == 0:
        return c
    return c[:, :m].reshape(12, -1, k).mean(2)


def decode(path, start, dur):
    p = subprocess.run([FFMPEG, "-nostdin", "-v", "error", "-ss", f"{start:.3f}",
                        "-t", f"{dur:.3f}", "-i", str(path), "-ac", "1", "-ar", str(SR),
                        "-f", "f32le", "-"], capture_output=True)
    if p.returncode != 0:
        raise RuntimeError(p.stderr.decode()[:200])
    return np.frombuffer(p.stdout, dtype=np.float32)


def station_chroma(st, game, sid):
    f = ST_CACHE / f"{st.replace(':','_')}.npz"
    if f.exists():
        return np.load(f)["c"]
    mp3 = ROOT / "raw" / game / f"{sid}.mp3"
    dur = float(subprocess.run([FFPROBE, "-v", "error",
                                "-show_entries", "format=duration", "-of", "csv=p=0",
                                str(mp3)], capture_output=True, text=True).stdout.strip())
    parts = []
    t = 0.0
    while t < dur:
        y = decode(mp3, t, min(CHUNK, dur - t))
        if y.size > SR:
            parts.append(chroma_slice(y))
        t += CHUNK
        print(f"    {st} {t:.0f}/{dur:.0f}s", flush=True)
    c = np.concatenate(parts, axis=1)
    np.savez_compressed(f, c=c)
    print(f"  cached {st}: {c.shape}")
    return c


def preview_chroma(pid, url):
    f = PV_CACHE / f"{pid}.npz"
    if f.exists():
        return np.load(f)["c"].astype(np.float64)
    p = REP / "cache/previews" / f"{pid}.mp3"
    if not p.exists():
        return None
    c = chroma_slice(decode(p, 0, 40)[: int(30 * SR)])
    np.savez_compressed(f, c=c)
    return c.astype(np.float64)


def ncc(full, prev):
    """max Pearson NCC of prev slid over full (1-D lag search)."""
    pw = prev.shape[1]
    if full.shape[1] < pw:
        full = np.pad(full, ((0, 0), (0, pw - full.shape[1])))
    sw = sliding_window_view(full, pw, axis=1)
    mu = sw.mean(2, keepdims=True)
    swd = sw - mu
    sn = np.sqrt((swd ** 2).sum(2))
    pd = prev - prev.mean(1, keepdims=True)
    pn = np.sqrt((pd ** 2).sum(1))
    num = np.einsum("ij,ikj->k", pd, swd)
    den = (pn[:, None] * sn).sum(0)
    s = num / np.maximum(den, 1e-9)
    k = int(np.argmax(s))
    return float(s[k]), k


def build_stations():
    d = json.load(open("/home/rauf/wt-gta-media-fix/src/data/track-timings.json"))
    for st in d:
        game, sid = st.split(":")
        station_chroma(st, game, sid)


def build_previews():
    M = json.load(open(REP / "matches.json"))
    ids = {str(v["deezer_id"]): v for v in M.values() if v}
    print(f"previews: {len(ids)}")
    ok = 0
    for i, (pid, v) in enumerate(ids.items(), 1):
        if preview_chroma(pid, v["preview"]) is not None:
            ok += 1
        if i % 60 == 0:
            print(f"  {i}/{len(ids)}", flush=True)
    print(f"preview chroma ok {ok}/{len(ids)}")


def cue_slice(c, C):
    a = int(round(c["start"] / FRAME))
    b = min(int(round(min(c["end"], c["start"] + CAP) / FRAME)), C.shape[1])
    if b - a < 8:
        return None
    return C[:, a:b].astype(np.float64)


def score_stations(write=True):
    M = json.load(open(REP / "matches.json"))
    cues = json.load(open(REP / "cue_features.json"))
    by = {}
    for c in cues:
        by.setdefault(c["station"], []).append(c)
    out = {}
    jsonl = open(REP / "per-cue-v3.jsonl", "w")
    for st, lst in by.items():
        game, sid = st.split(":")
        C = station_chroma(st, game, sid)
        pv = {}
        for c in lst:
            v = M.get(f"{st}#{c['idx']:03d}")
            if v and str(v["deezer_id"]) not in pv:
                pc = preview_chroma(str(v["deezer_id"]), v["preview"])
                if pc is not None:
                    pv[str(v["deezer_id"])] = pc
        rows = []
        for c in lst:
            v = M.get(f"{st}#{c['idx']:03d}")
            rec = {k: c[k] for k in ("station", "idx", "song", "artist", "start", "end", "cue_len")}
            if not v:
                rec["status"] = "no_preview"; rows.append(rec); continue
            sl = cue_slice(c, C)
            oid = str(v["deezer_id"])
            rec["deezer"] = {"id": v["deezer_id"], "title": v["dz_title"],
                             "artist": v["dz_artist"], "album": v["dz_album"],
                             "duration": v["dz_duration"], "quality": v["match_quality"],
                             "title_sim": v["title_sim"], "artist_sim": v["artist_sim"]}
            if sl is None or oid not in pv:
                rec["status"] = "no_audio" if sl is None else "preview_missing"
                rows.append(rec); continue
            own, lag = ncc(sl, pv[oid])
            others = [(ncc(sl, p)[0], k) for k, p in pv.items() if k != oid]
            sc = np.array([o[0] for o in others]) if others else np.array([])
            rec.update({
                "status": "scored", "own": round(own, 4),
                "own_at_s": round(c["start"] + lag * FRAME, 1),
                "own_offset_s": round(lag * FRAME, 1),
                "n_others": len(others),
                "own_rank": int(1 + (sc > own + 1e-9).sum()) if sc.size else None,
                "runner_up": round(float(sc.max()), 4) if sc.size else None,
                "margin": round(own - float(sc.max()), 4) if sc.size else None,
                "others_mean": round(float(sc.mean()), 4) if sc.size else None,
                "others_std": round(float(sc.std()), 4) if sc.size else None,
                "z": round(float((own - sc.mean()) / max(sc.std(), 1e-6)), 2) if sc.size else None,
                "top_other": (others[int(np.argmax(sc))][1] if others else None),
            })
            rows.append(rec)
            jsonl.write(json.dumps(rec, ensure_ascii=False) + "\n"); jsonl.flush()
        scored = [r for r in rows if r.get("own_rank")]
        def med(k):
            v2 = [r[k] for r in scored if r.get(k) is not None]
            return round(float(np.median(v2)), 4) if v2 else None
        r1 = sum(1 for r in scored if r["own_rank"] == 1)
        summ = {"station": st, "cues": len(rows),
                "with_preview": sum(1 for r in rows if r.get("deezer")),
                "scored": len(scored), "rank1": r1,
                "rank1_share": round(r1 / len(scored), 3) if scored else None,
                "median_own": med("own"), "median_runner_up": med("runner_up"),
                "median_margin": med("margin"), "median_z": med("z"),
                "own_ge_050": sum(1 for r in scored if r["own"] >= 0.5),
                "own_ge_070": sum(1 for r in scored if r["own"] >= 0.7)}
        out[st] = {"summary": summ, "cues": rows}
        print(json.dumps(summ), flush=True)
        if write:
            json.dump(out[st], open(REP / f"v3-station-{st.replace(':','_')}.json", "w"),
                      ensure_ascii=False, indent=1)
    jsonl.close()
    json.dump(out, open(REP / "scored-v3.json", "w"), ensure_ascii=False, indent=1)


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "score"
    if cmd == "station":
        build_stations()
    elif cmd == "prev":
        build_previews()
    elif cmd == "score":
        score_stations()
