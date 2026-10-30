#!/usr/bin/env python3
"""Cheap identity check: 90 s template from each station vs the first 600 s of
every other station (chunked NCC). Detects duplicate/shared audio files."""
import json, sys
from pathlib import Path
import numpy as np
from numpy.lib.stride_tricks import sliding_window_view
sys.path.insert(0, "/home/rauf/gta-radio-media/reports/scripts")
import score3 as S3

REP = Path("/home/rauf/gta-radio-media/reports")


def ncc_short(full, prev):
    pw = prev.shape[1]
    if full.shape[1] < pw:
        return -1
    pd = prev - prev.mean(1, keepdims=True)
    pn = np.sqrt((pd ** 2).sum(1))
    best = -9
    step = 2000
    i = 0
    while i <= full.shape[1] - pw:
        seg = full[:, i:min(i + step + pw, full.shape[1])]
        if seg.shape[1] < pw:
            break
        sw = sliding_window_view(seg, pw, axis=1)
        swd = sw - sw.mean(2, keepdims=True)
        sn = np.sqrt((swd ** 2).sum(2))
        num = np.einsum("ij,ikj->k", pd, swd)
        den = (pn[:, None] * sn).sum(0)
        best = max(best, float((num / np.maximum(den, 1e-9)).max()))
        i += step
    return best


if __name__ == "__main__":
    cues = json.load(open(REP / "cue_features.json"))
    keys = sorted({c["station"] for c in cues})
    C = {}
    for st in keys:
        g, sid = st.split(":")
        C[st] = S3.station_chroma(st, g, sid).astype(np.float64)
    tw = int(90 / S3.FRAME)
    lim = int(600 / S3.FRAME)
    res = {}
    for a in keys:
        t = C[a][:, 300:300 + tw]
        if t.shape[1] < tw:
            continue
        best = (-9, None)
        for b in keys:
            if a == b:
                continue
            s = ncc_short(C[b][:, :lim], t)
            if s > best[0]:
                best = (s, b)
        res[a] = {"best_other_station": best[1], "score": round(best[0], 3),
                  "duplicate": best[0] >= 0.7}
        print(f"{a:38s} best {best[1]:38s} {best[0]:.3f}"
              f"{'  <-- DUPLICATE' if best[0] >= 0.7 else ''}", flush=True)
    json.dump(res, open(REP / "identity.json", "w"), indent=1)
