#!/usr/bin/env python3
"""Finalise: recompute per-cue verdicts from stored scores, aggregate, write
track-order-2026-10-30.json and .md"""
import json
from pathlib import Path
from collections import Counter
import numpy as np

REP = Path("/home/rauf/gta-radio-media/reports")
tim = json.load(open("/home/rauf/wt-gta-media-fix/src/data/track-timings.json"))
ident = json.load(open(REP / "identity.json"))
OWN_OK, STRONG = 0.60, 0.60
EXCL = ["kult-fm", "the-lowdown-911", "motomami-los-santos",
        "the-music-locker", "still-slipping-los-santos"]

S = {}
_prev = json.load(open(REP / "analysis.json"))["stations"] if (REP / "analysis.json").exists() else {}
for f in sorted(REP.glob("station-*.json")):
    d = json.load(open(f))
    st = d["summary"]["station"]
    if st in _prev:
        d["summary"]["duration"] = _prev[st]["summary"]["duration"]
        d["summary"]["identity"] = _prev[st]["summary"]["identity"]
    S[st] = d

for st, v in S.items():
    for r in v["cues"]:
        if r.get("status") != "scored":
            continue
        own, best = r["own"], r["best_other"]["score"]
        if own >= OWN_OK:
            r["verdict"] = "confirmed" if r["own_rank"] == 1 else "confirmed_rank2"
        elif best >= STRONG:
            r["verdict"] = "other_song"
        else:
            r["verdict"] = "no_match"

for st, v in S.items():
    rows = v["cues"]
    sc = [r for r in rows if r.get("status") == "scored"]
    conf = [r for r in sc if r["verdict"].startswith("confirmed")]
    other = [r for r in sc if r["verdict"] == "other_song"]
    nomatch = [r for r in sc if r["verdict"] == "no_match"]
    ranked = [r for r in sc if r.get("own_rank")]
    deltas = [r["best_other"]["idx"] - r["idx"] for r in other]
    ms = None
    if deltas:
        n = len(rows)
        sh = Counter((d % n) for d in deltas)
        k, c = sh.most_common(1)[0]
        kk = k if k <= n // 2 else k - n
        ms = {"k": kk, "n": c, "of": len(other), "frac": round(c / len(other), 2)}
    s = v["summary"]
    s.update({
        "confirmed": len(conf),
        "confirmed_rank1": sum(1 for r in conf if r["own_rank"] == 1),
        "other_song": len(other),
        "no_match": len(nomatch),
        "informative": len(conf) + len(other),
        "consistency": round(len(conf) / (len(conf) + len(other)), 3) if (conf or other) else None,
        "median_own": round(float(np.median([r["own"] for r in sc])), 4) if sc else None,
        "median_margin": round(float(np.median([r["margin"] for r in ranked])), 4) if ranked else None,
        "median_z": round(float(np.median([r["z"] for r in ranked])), 2) if ranked else None,
        "median_best_other": round(float(np.median([r["best_other"]["score"] for r in sc])), 4) if sc else None,
        "modal_shift": ms,
    })
    if s["scored"] < 4 or s["informative"] < 2:
        s["verdict"] = "unverifiable (too few previews)"
    elif s["consistency"] is not None and s["consistency"] >= 0.80:
        s["verdict"] = "order consistent"
    else:
        s["verdict"] = "order suspect (evidence of a shifted/incorrect mapping)"

T = {"cues": sum(v["summary"]["cues"] for v in S.values()),
     "with_preview": sum(v["summary"]["with_preview"] for v in S.values()),
     "scored": sum(v["summary"]["scored"] for v in S.values()),
     "confirmed": sum(v["summary"]["confirmed"] for v in S.values()),
     "confirmed_rank1": sum(v["summary"]["confirmed_rank1"] for v in S.values()),
     "other_song": sum(v["summary"]["other_song"] for v in S.values()),
     "no_match": sum(v["summary"]["no_match"] for v in S.values()),
     "verdicts": dict(Counter(v["summary"]["verdict"] for v in S.values()))}

json.dump({"generated": "2026-10-30", "thresholds": {"own_ok": OWN_OK, "strong": STRONG},
           "totals": T, "stations": S, "identity": ident},
          open(REP / "track-order-2026-10-30.json", "w"), ensure_ascii=False, indent=1)

outl = []
for st, v in S.items():
    for r in v["cues"]:
        if r.get("verdict") != "other_song":
            continue
        b = r["best_other"]
        outl.append({"station": st, "idx": r["idx"], "song": r["song"], "artist": r["artist"],
                     "start": round(r["start"], 1), "own": r["own"], "rank": r["own_rank"],
                     "other_idx": b["idx"], "other_song": b["song"],
                     "other_artist": b["artist"], "other_score": b["score"],
                     "delta": b["idx"] - r["idx"]})
outl.sort(key=lambda x: -x["other_score"])

L = []
w = L.append
w("# Аудит порядка треков в GTA Radio PWA — 2026-10-30")
w("")
w("Проверено, совпадает ли порядок треков в `src/data/track-timings.json` с тем, что реально")
w("звучит в шлифованных лупах `gta-radio-media/raw/<game>/<id>.mp3`. Идентификация — по")
w("хрома-признакам против официальных 30-секундных превью Deezer. AcoustID/Chromaprint не")
w("использовался (нет ключа).")
w("")
w("## Итог")
w("")
w(f"- Станций в таблице: **{len(S)}**. Music-cue: **{T['cues']}**.")
w(f"- Превью Deezer найдено: **{T['with_preview']}** ({T['with_preview']/T['cues']*100:.1f}% покрытие), "
  f"оценено cue: **{T['scored']}**.")
w(f"- Свой трек на месте (score ≥ {OWN_OK}): **{T['confirmed']}** "
  f"({T['confirmed']/T['scored']*100:.1f}%), из них на первом месте по станции "
  f"**{T['confirmed_rank1']}** ({T['confirmed_rank1']/T['scored']*100:.1f}%).")
w(f"- На месте cue звучит **другой** трек этой же станции (≥ {STRONG}): **{T['other_song']}** "
  f"({T['other_song']/T['scored']*100:.1f}%).")
w(f"- Нет матча ни к одному превью станции: **{T['no_match']}** "
  f"({T['no_match']/T['scored']*100:.1f}%).")
w("")
w(f"Из {T['other_song']} случаев «звучит другой трек» у **45** score ≥ 0.90 и у **75** score ≥ 0.80,")
w("медиана 0.895 — это не пограничные совпадения. Качество поиска Deezer: 302 из 303 совпаданий")
w("`exact` (название и артист совпали), 1 — `partial_title`.")
w("")
w(f"Вердикты: **{T['verdicts'].get('order consistent',0)}** «order consistent», "
  f"**{T['verdicts'].get('order suspect (evidence of a shifted/incorrect mapping)',0)}** «order suspect», "
  f"**{T['verdicts'].get('unverifiable (too few previews)',0)}** «unverifiable».")
w("")
w("## Метод")
w("")
w("1. **Признаки.** `librosa.feature.chroma_cqt`, mono 11.025 кГц, hop 1024 (93 мс), `n_chroma=12`,")
w("   `norm=2` (L2 по кадрам), затем усреднение пар кадров → эффективный шаг 186 мс. Одна и та же")
w("   функция для аудио станции и для превью. Аудио станции кэшируется один раз на файл.")
w("2. **Окно.** По спецификации: 20 с с центром в `(start+end)/2`, обрезанное по границам cue")
w("   (cue короче 20 с — 0 штук). На практике превью Deezer — это произвольные 30 с трека и часто")
w("   **не перекрывают** центральное окно: «1979» (liberty-rock-radio) центр 0.204 → по всему cue")
w("   **0.991**; «Ring My Bell» (k-jah-west) 0.119 → **0.941**. Поэтому основная метрика —")
w("   **скольжение всего 30-с превью по всему фрагменту cue** (до 900 с), а центровое окно")
w("   сохранено в JSON (`own_centre20`) для сверки.")
w("3. **Скор.** Максимум **нормированной взаимной корреляции (Пирсон)** по 12 хрома-бинам,")
w("   среднее вычитается по времени внутри каждого окна, затем максимум по всем лагам.")
w("   Калибровка скорера: превью против себя — 1.000, против чужих превью — 0.06–0.12.")
w("   Без вычитания среднего по времени все треки дают ~0.93 — поэтому Пирсон, а не косинус.")
w("4. **Превью.** `https://api.deezer.com/search?q=<artist title>`, до 25 кандидатов, три прохода")
w("   с расширяющимися запросами; затем строгая проверка: артист ≥0.85, название ≥0.85")
w("   (или ≥0.62 при Jaccard ≥0.6), длительность ≥60 с, чёрный список karaoke/tribute/cover/")
w("   «in the style of». 302 уникальных превью скачано и декодировано, 0 потерь.")
w("5. **Leave-one-out.** Окно cue i скорится против превью всех cue той же станции, кроме своего:")
w("   `own`, `own_rank`, `runner_up`, `margin = own − runner_up`,")
w("   `z = (own − μ)/σ` по чужим превью.")
w("6. **Контроль.** Косинус усреднённых хрома-гистограмм (в JSON `control_hist`/`control_rank`).")
w("   Он **вырожден**: медиана 0.976, у 94% cue >0.9 — усреднённый хрома-профиль похож у всех")
w("   треков, поэтому контроль не различает записи и не может ни подтвердить, ни опровергнуть")
w("   совпадение. Это и есть причина, по которой основной метрикой выбран временной NCC: его")
w("   нулевое распределение (чужие превью) — 0.06–0.12, а совпадения дают 0.85–0.99.")
w("7. **Проверка на перепутанные файлы.** 90-с шаблон каждой станции против первых 10 мин всех")
w("   остальных: максимум **0.291** — среди этих 17 станций дублей аудио нет. То есть провалы")
w("   ниже — не следствие того, что подставлен файл другой станции.")
w("")
w("### Пороги")
w("")
w(f"- `confirmed` — own ≥ {OWN_OK} (свой трек действительно звучит в этом cue);")
w(f"- `confirmed` и `own_rank = 1` — ещё и лучший из всех превью станции;")
w(f"- `other_song` — own < {OWN_OK} и лучший матч ≥ {STRONG} принадлежит другому cue той же станции;")
w(f"- `no_match` — ни своё, ни чужое превью не дало ≥ {STRONG};")
w("- `order consistent` — confirmed / (confirmed + other_song) ≥ 0.80 при ≥2 информативных cue;")
w("- `order suspect` — иначе; `unverifiable` — <4 оценёных cue или <2 информативных.")
w("")
w("## Таблица по станциям")
w("")
w("| станция | cues | превью | оценено | confirmed | rank1 | другой трек | нет матча | consistency | median own | median z | Δ duration, с | вердикт |")
w("|---|---|---|---|---|---|---|---|---|---|---|---|---|")
order = sorted(S, key=lambda k: (-S[k]["summary"]["confirmed"],
                                 -S[k]["summary"]["cues"]))
for st in order:
    s = S[st]["summary"]
    f2 = lambda x, d="—": (f"{x:.2f}" if isinstance(x, (int, float)) else d)
    w(f"| `{st}` | {s['cues']} | {s['with_preview']} | {s['scored']} | {s['confirmed']} | "
      f"{s['confirmed_rank1']} | {s['other_song']} | {s['no_match']} | {f2(s['consistency'])} | "
      f"{f2(s['median_own'])} | {('%.1f' % s['median_z']) if s['median_z'] is not None else '—'} | "
      f"{s['duration']['delta']:+.1f} | {s['verdict']} |")
w("")
w("`Δ duration` — длительность mp3 минус `duration` из таблицы.")
w("`consistency` — доля подтверждённых среди cue, где вообще удалось что-то опознать.")
w("")
w("## Разбор по станциям")
w("")
for st in order:
    s = S[st]["summary"]
    ms = s.get("modal_shift")
    w(f"**`{st}`** — {s['verdict']}. cues {s['cues']}, превью {s['with_preview']}, "
      f"оценено {s['scored']}: confirmed {s['confirmed']} (rank1 {s['confirmed_rank1']}), "
      f"другой трек {s['other_song']}, нет матча {s['no_match']}; "
      f"median own {f2(s['median_own'])}, median margin {f2(s['median_margin'])}, "
      f"median z {('%.1f' % s['median_z']) if s['median_z'] is not None else '—'}.")
    if ms and ms["frac"] >= 0.5 and ms["of"] >= 3:
        w(f"  Сдвиг систематический: у {ms['n']} из {ms['of']} несовпадений номер трека в аудио")
        w(f"  отличается ровно на **{ms['k']:+d}** cue — таблица смещена относительно файла,")
        w(f"  а не содержит случайный набор песен.")
    elif ms and ms["of"] >= 4:
        w(f"  Сдвиг несистематический: модальный сдвиг {ms['k']:+d} объясняет лишь "
          f"{ms['n']} из {ms['of']} несовпадений — порядок перепутан, а не сдвинут целиком.")
    if s["duration"]["delta"] < -5:
        w(f"  Длительность файла **{s['duration']['delta']:+.1f} с** относительно таблицы "
          f"({s['duration']['audio']:.1f} vs {s['duration']['declared']:.1f}) — границы строились")
        w(f"  по другому (более длинному) файлу.")
    w("")
w("## Самые подозрительные cue (топ-12 по силе матча на чужой трек)")
w("")
w("Формат: станция, #cue, заявленный трек, `own` (скор своего превью), `rank`, далее — что")
w("реально звучит в этом месте файла по данным матчинга.")
w("")
for o in outl[:12]:
    w(f"- `{o['station']}` #{o['idx']} «{o['song']}» / {o['artist']} (t={o['start']:.0f} с): "
      f"own **{o['own']:.3f}**, rank **{o['rank']}** → звучит «{o['other_song']}» / "
      f"{o['other_artist']} (score **{o['other_score']:.3f}**, cue #{o['other_idx']}, "
      f"сдвиг {o['delta']:+d}).")
w("")
w(f"Всего таких cue: {len(outl)}; полный список — `cues[].best_other` в JSON.")
w("")
w("## Чего не хватает для 100% подтверждения")
w("")
w("1. **AcoustID/Chromaprint с ключом.** Отпечаток по всему треку даёт бит-в-бит идентификацию")
w("   записи и не зависит от того, попал ли 30-с фрагмент превью в проверяемое окно. Сейчас")
w("   главное ограничение метода именно это: превью покрывает 30 с из 200–300 с трека.")
w("2. **Полные официальные треки вместо 30-с превью** — убирает и «лотерею» с фрагментом, и")
w("   часть ложных `no_match`.")
w("3. **Авторитетный треклист по каждой станции с указанием издания игры.** Для GTA V станции")
w("   различаются между изданиями (2013 / Expanded & Enhanced); судя по результатам, таблица")
w("   собрана по одному списку, а аудио — по другому, и часть строк вообще не песни.")
w("4. **Ручное прослушивание 3–5 окон** как ground truth для калибровки порогов 0.60/0.80.")
w("5. **Перегенерация границ для 6 станций**, где длительность файла не совпадает с таблицей")
w("   (все пять GTA SA + liberty-rock-radio): расхождение 46–190 с.")
_un = json.load(open(REP / "unmatched.json"))
_pat = __import__("re").compile(r"intro|outro|banter|monologue|rant|chat|philosoph|reflect|"
                                r"identif|speech|welcome|interlude|station id|declaration|"
                                r"memories|concludes|reasoning", __import__("re").I)
_talk = [x for x in _un if _pat.search(x["song"])]
w(f"6. **Часть строк таблицы — не песни.** Из {len(_un)} ненайденных записей "
  f"**{len(_talk)}** — это DJ-подводки, помеченные `type: music`:")
w("")
for _x in _talk:
    w(f"   - `{_x['key']}` — «{_x['song']}» ({_x['artist']})")
w("")
w("   Они не могут быть подтверждены в принципе: это речь диджея, а не трек. Пока они лежат")
w("   в таблице как музыкальные cue, любая проверка порядка будет считать их «несовпадением».")
w("")
w("")
w("## Ограничения метода (важно при чтении цифр)")
w("")
w("- **30-с превью ≠ трек.** Если превью из припева, а в cue куплет — матча не будет даже при")
w("  верном порядке. Поэтому `no_match` означает «не проверили», а не «неправильно».")
w("- **DJ-речь поверх музыки** (GTA V) и джинглы дают `no_match`; 20-с центральное окно обычно")
w("  чистое, но в no_match-случаях это частая причина.")
w("- **Ремиксы/ремастеры/live**: Deezer отдаёт другую версию — score падает до 0.3–0.5; такие")
w("  совпадения помечены `match_quality: partial_title`.")
w("- **Качество рипов не объясняет провалы**: файлы 32 или 48 кГц, 320 кбит/с, доля энергии")
w("  <1 кГц 0.80–0.88 у сломанных и рабочих станций одинакова.")
w("- **Одинаково низкие скоры = содержимое, а не метод**: у fusion-fm / if99 / jazz-nation все")
w("  превью дают 0.10–0.15 (уровень шума), т.е. окно не содержит этих записей.")
w("")
w("## Артефакты")
w("")
w("- `track-order-2026-10-30.json` — по каждому cue: `own`, `own_rank`, `runner_up`, `margin`,")
w("  `z`, `best_other` (idx/название/артист/скор), `deezer` (id/title/artist/quality); сводки.")
w("- `per-cue-v3.jsonl` — построчно.")
w("- `cache/previews/<deezer_id>.mp3`, `cache/search/*.json` — превью и результаты поиска.")
w("- `scripts/` — весь пайплайн.")
w("")
w(f"_Исключены по указанию: {', '.join(EXCL)} — их аудио является файлами других станций и"
  " заменяется параллельно._")
(REP / "track-order-2026-10-30.md").write_text("\n".join(L) + "\n")
print("verdicts:", T["verdicts"])
print("totals:", {k: v for k, v in T.items() if k != "verdicts"})
for st in order:
    s = S[st]["summary"]
    print(f"{st:36s} conf {s['confirmed']:3d}/{s['scored']:3d} other {s['other_song']:3d} "
          f"nm {s['no_match']:3d} cons {str(s['consistency']):>5s} "
          f"mOwn {s['median_own']:.2f} shift {str(s['modal_shift'] and s['modal_shift']['k']):>3s} "
          f"| {s['verdict'][:14]}")
