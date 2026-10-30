# Аудит порядка треков в GTA Radio PWA — 2026-10-30

Проверено, совпадает ли порядок треков в `src/data/track-timings.json` с тем, что реально
звучит в шлифованных лупах `gta-radio-media/raw/<game>/<id>.mp3`. Идентификация — по
хрома-признакам против официальных 30-секундных превью Deezer. AcoustID/Chromaprint не
использовался (нет ключа).

## Итог

- Станций в таблице: **17**. Music-cue: **382**.
- Превью Deezer найдено: **303** (79.3% покрытие), оценено cue: **303**.
- Свой трек на месте (score ≥ 0.6): **66** (21.8%), из них на первом месте по станции **60** (19.8%).
- На месте cue звучит **другой** трек этой же станции (≥ 0.6): **97** (32.0%).
- Нет матча ни к одному превью станции: **140** (46.2%).

Из 97 случаев «звучит другой трек» у **45** score ≥ 0.90 и у **75** score ≥ 0.80,
медиана 0.895 — это не пограничные совпадения. Качество поиска Deezer: 302 из 303 совпаданий
`exact` (название и артист совпали), 1 — `partial_title`.

Вердикты: **2** «order consistent», **13** «order suspect», **2** «unverifiable».

## Метод

1. **Признаки.** `librosa.feature.chroma_cqt`, mono 11.025 кГц, hop 1024 (93 мс), `n_chroma=12`,
   `norm=2` (L2 по кадрам), затем усреднение пар кадров → эффективный шаг 186 мс. Одна и та же
   функция для аудио станции и для превью. Аудио станции кэшируется один раз на файл.
2. **Окно.** По спецификации: 20 с с центром в `(start+end)/2`, обрезанное по границам cue
   (cue короче 20 с — 0 штук). На практике превью Deezer — это произвольные 30 с трека и часто
   **не перекрывают** центральное окно: «1979» (liberty-rock-radio) центр 0.204 → по всему cue
   **0.991**; «Ring My Bell» (k-jah-west) 0.119 → **0.941**. Поэтому основная метрика —
   **скольжение всего 30-с превью по всему фрагменту cue** (до 900 с), а центровое окно
   сохранено в JSON (`own_centre20`) для сверки.
3. **Скор.** Максимум **нормированной взаимной корреляции (Пирсон)** по 12 хрома-бинам,
   среднее вычитается по времени внутри каждого окна, затем максимум по всем лагам.
   Калибровка скорера: превью против себя — 1.000, против чужих превью — 0.06–0.12.
   Без вычитания среднего по времени все треки дают ~0.93 — поэтому Пирсон, а не косинус.
4. **Превью.** `https://api.deezer.com/search?q=<artist title>`, до 25 кандидатов, три прохода
   с расширяющимися запросами; затем строгая проверка: артист ≥0.85, название ≥0.85
   (или ≥0.62 при Jaccard ≥0.6), длительность ≥60 с, чёрный список karaoke/tribute/cover/
   «in the style of». 302 уникальных превью скачано и декодировано, 0 потерь.
5. **Leave-one-out.** Окно cue i скорится против превью всех cue той же станции, кроме своего:
   `own`, `own_rank`, `runner_up`, `margin = own − runner_up`,
   `z = (own − μ)/σ` по чужим превью.
6. **Контроль.** Косинус усреднённых хрома-гистограмм (в JSON `control_hist`/`control_rank`).
   Он **вырожден**: медиана 0.976, у 94% cue >0.9 — усреднённый хрома-профиль похож у всех
   треков, поэтому контроль не различает записи и не может ни подтвердить, ни опровергнуть
   совпадение. Это и есть причина, по которой основной метрикой выбран временной NCC: его
   нулевое распределение (чужие превью) — 0.06–0.12, а совпадения дают 0.85–0.99.
7. **Проверка на перепутанные файлы.** 90-с шаблон каждой станции против первых 10 мин всех
   остальных: максимум **0.291** — среди этих 17 станций дублей аудио нет. То есть провалы
   ниже — не следствие того, что подставлен файл другой станции.

### Пороги

- `confirmed` — own ≥ 0.6 (свой трек действительно звучит в этом cue);
- `confirmed` и `own_rank = 1` — ещё и лучший из всех превью станции;
- `other_song` — own < 0.6 и лучший матч ≥ 0.6 принадлежит другому cue той же станции;
- `no_match` — ни своё, ни чужое превью не дало ≥ 0.6;
- `order consistent` — confirmed / (confirmed + other_song) ≥ 0.80 при ≥2 информативных cue;
- `order suspect` — иначе; `unverifiable` — <4 оценёных cue или <2 информативных.

## Таблица по станциям

| станция | cues | превью | оценено | confirmed | rank1 | другой трек | нет матча | consistency | median own | median z | Δ duration, с | вердикт |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `gta5:rebel-radio` | 17 | 16 | 16 | 12 | 12 | 1 | 3 | 0.92 | 0.89 | 24.1 | -0.0 | order consistent |
| `gta5:space-1032` | 22 | 21 | 21 | 10 | 9 | 6 | 5 | 0.62 | 0.56 | 6.7 | -0.0 | order suspect (evidence of a shifted/incorrect mapping) |
| `gtasa:k-rose` | 17 | 15 | 15 | 10 | 10 | 0 | 5 | 1.00 | 0.89 | 15.6 | -68.7 | order consistent |
| `gta5:east-los-fm` | 15 | 13 | 13 | 8 | 6 | 4 | 1 | 0.67 | 0.62 | 2.9 | -0.0 | order suspect (evidence of a shifted/incorrect mapping) |
| `gta5:los-santos-underground-radio` | 65 | 40 | 40 | 7 | 7 | 4 | 29 | 0.64 | 0.24 | 1.0 | +0.0 | order suspect (evidence of a shifted/incorrect mapping) |
| `gta5:worldwide-fm` | 37 | 30 | 30 | 5 | 3 | 9 | 16 | 0.36 | 0.16 | 0.6 | -0.0 | order suspect (evidence of a shifted/incorrect mapping) |
| `gta4:liberty-rock-radio` | 36 | 28 | 28 | 4 | 4 | 13 | 11 | 0.23 | 0.18 | -0.1 | -118.5 | order suspect (evidence of a shifted/incorrect mapping) |
| `gta5:flylo-fm` | 21 | 14 | 14 | 2 | 2 | 3 | 9 | 0.40 | 0.14 | -0.3 | +0.0 | order suspect (evidence of a shifted/incorrect mapping) |
| `gtasa:mastersounds-98-3` | 17 | 12 | 12 | 2 | 2 | 4 | 6 | 0.33 | 0.14 | 0.0 | -46.0 | order suspect (evidence of a shifted/incorrect mapping) |
| `gtasa:bounce-fm` | 16 | 13 | 13 | 2 | 2 | 7 | 4 | 0.22 | 0.13 | -0.3 | -190.4 | order suspect (evidence of a shifted/incorrect mapping) |
| `gtasa:k-jah-west` | 16 | 13 | 13 | 2 | 2 | 5 | 6 | 0.29 | 0.13 | -0.4 | -89.5 | order suspect (evidence of a shifted/incorrect mapping) |
| `gta5:los-santos-rock-radio` | 37 | 34 | 34 | 1 | 1 | 22 | 11 | 0.04 | 0.16 | -0.1 | -0.0 | order suspect (evidence of a shifted/incorrect mapping) |
| `gtasa:k-dst` | 18 | 15 | 15 | 1 | 0 | 7 | 7 | 0.12 | 0.37 | 1.3 | -53.1 | order suspect (evidence of a shifted/incorrect mapping) |
| `gta5:channel-x` | 18 | 16 | 16 | 0 | 0 | 10 | 6 | 0.00 | 0.13 | -0.3 | +0.0 | order suspect (evidence of a shifted/incorrect mapping) |
| `gta4:jazz-nation-radio` | 12 | 10 | 10 | 0 | 0 | 2 | 8 | 0.00 | 0.12 | -0.5 | +0.0 | order suspect (evidence of a shifted/incorrect mapping) |
| `gta4:if99` | 10 | 7 | 7 | 0 | 0 | 0 | 7 | — | 0.12 | -0.2 | +0.0 | unverifiable (too few previews) |
| `gta4:fusion-fm` | 8 | 6 | 6 | 0 | 0 | 0 | 6 | — | 0.10 | -0.8 | +0.1 | unverifiable (too few previews) |

`Δ duration` — длительность mp3 минус `duration` из таблицы.
`consistency` — доля подтверждённых среди cue, где вообще удалось что-то опознать.

## Разбор по станциям

**`gta5:rebel-radio`** — order consistent. cues 17, превью 16, оценено 16: confirmed 12 (rank1 12), другой трек 1, нет матча 3; median own 0.89, median margin 0.69, median z 24.1.

**`gta5:space-1032`** — order suspect (evidence of a shifted/incorrect mapping). cues 22, превью 21, оценено 21: confirmed 10 (rank1 9), другой трек 6, нет матча 5; median own 0.56, median margin 0.12, median z 6.7.
  Сдвиг систематический: у 6 из 6 несовпадений номер трека в аудио
  отличается ровно на **+1** cue — таблица смещена относительно файла,
  а не содержит случайный набор песен.

**`gtasa:k-rose`** — order consistent. cues 17, превью 15, оценено 15: confirmed 10 (rank1 10), другой трек 0, нет матча 5; median own 0.89, median margin 0.59, median z 15.6.
  Длительность файла **-68.7 с** относительно таблицы (2886.3 vs 2954.9) — границы строились
  по другому (более длинному) файлу.

**`gta5:east-los-fm`** — order suspect (evidence of a shifted/incorrect mapping). cues 15, превью 13, оценено 13: confirmed 8 (rank1 6), другой трек 4, нет матча 1; median own 0.62, median margin -0.07, median z 2.9.
  Сдвиг систематический: у 4 из 4 несовпадений номер трека в аудио
  отличается ровно на **+1** cue — таблица смещена относительно файла,
  а не содержит случайный набор песен.

**`gta5:los-santos-underground-radio`** — order suspect (evidence of a shifted/incorrect mapping). cues 65, превью 40, оценено 40: confirmed 7 (rank1 7), другой трек 4, нет матча 29; median own 0.24, median margin -0.17, median z 1.0.
  Сдвиг несистематический: модальный сдвиг -1 объясняет лишь 1 из 4 несовпадений — порядок перепутан, а не сдвинут целиком.

**`gta5:worldwide-fm`** — order suspect (evidence of a shifted/incorrect mapping). cues 37, превью 30, оценено 30: confirmed 5 (rank1 3), другой трек 9, нет матча 16; median own 0.16, median margin -0.15, median z 0.6.
  Сдвиг систематический: у 6 из 9 несовпадений номер трека в аудио
  отличается ровно на **-1** cue — таблица смещена относительно файла,
  а не содержит случайный набор песен.

**`gta4:liberty-rock-radio`** — order suspect (evidence of a shifted/incorrect mapping). cues 36, превью 28, оценено 28: confirmed 4 (rank1 4), другой трек 13, нет матча 11; median own 0.18, median margin -0.40, median z -0.1.
  Сдвиг несистематический: модальный сдвиг +4 объясняет лишь 3 из 13 несовпадений — порядок перепутан, а не сдвинут целиком.
  Длительность файла **-118.5 с** относительно таблицы (10236.8 vs 10355.3) — границы строились
  по другому (более длинному) файлу.

**`gta5:flylo-fm`** — order suspect (evidence of a shifted/incorrect mapping). cues 21, превью 14, оценено 14: confirmed 2 (rank1 2), другой трек 3, нет матча 9; median own 0.14, median margin -0.12, median z -0.3.

**`gtasa:mastersounds-98-3`** — order suspect (evidence of a shifted/incorrect mapping). cues 17, превью 12, оценено 12: confirmed 2 (rank1 2), другой трек 4, нет матча 6; median own 0.14, median margin -0.16, median z 0.0.
  Сдвиг систематический: у 4 из 4 несовпадений номер трека в аудио
  отличается ровно на **+1** cue — таблица смещена относительно файла,
  а не содержит случайный набор песен.
  Длительность файла **-46.0 с** относительно таблицы (4061.5 vs 4107.6) — границы строились
  по другому (более длинному) файлу.

**`gtasa:bounce-fm`** — order suspect (evidence of a shifted/incorrect mapping). cues 16, превью 13, оценено 13: confirmed 2 (rank1 2), другой трек 7, нет матча 4; median own 0.13, median margin -0.60, median z -0.3.
  Сдвиг несистематический: модальный сдвиг +2 объясняет лишь 2 из 7 несовпадений — порядок перепутан, а не сдвинут целиком.
  Длительность файла **-190.4 с** относительно таблицы (3903.9 vs 4094.3) — границы строились
  по другому (более длинному) файлу.

**`gtasa:k-jah-west`** — order suspect (evidence of a shifted/incorrect mapping). cues 16, превью 13, оценено 13: confirmed 2 (rank1 2), другой трек 5, нет матча 6; median own 0.13, median margin -0.44, median z -0.4.
  Сдвиг систематический: у 3 из 5 несовпадений номер трека в аудио
  отличается ровно на **+2** cue — таблица смещена относительно файла,
  а не содержит случайный набор песен.
  Длительность файла **-89.5 с** относительно таблицы (3633.5 vs 3723.0) — границы строились
  по другому (более длинному) файлу.

**`gta5:los-santos-rock-radio`** — order suspect (evidence of a shifted/incorrect mapping). cues 37, превью 34, оценено 34: confirmed 1 (rank1 1), другой трек 22, нет матча 11; median own 0.16, median margin -0.62, median z -0.1.
  Сдвиг несистематический: модальный сдвиг +5 объясняет лишь 2 из 22 несовпадений — порядок перепутан, а не сдвинут целиком.

**`gtasa:k-dst`** — order suspect (evidence of a shifted/incorrect mapping). cues 18, превью 15, оценено 15: confirmed 1 (rank1 0), другой трек 7, нет матча 7; median own 0.37, median margin -0.39, median z 1.3.
  Сдвиг систематический: у 5 из 7 несовпадений номер трека в аудио
  отличается ровно на **+1** cue — таблица смещена относительно файла,
  а не содержит случайный набор песен.
  Длительность файла **-53.1 с** относительно таблицы (4001.2 vs 4054.3) — границы строились
  по другому (более длинному) файлу.

**`gta5:channel-x`** — order suspect (evidence of a shifted/incorrect mapping). cues 18, превью 16, оценено 16: confirmed 0 (rank1 0), другой трек 10, нет матча 6; median own 0.13, median margin -0.70, median z -0.3.
  Сдвиг несистематический: модальный сдвиг +1 объясняет лишь 4 из 10 несовпадений — порядок перепутан, а не сдвинут целиком.

**`gta4:jazz-nation-radio`** — order suspect (evidence of a shifted/incorrect mapping). cues 12, превью 10, оценено 10: confirmed 0 (rank1 0), другой трек 2, нет матча 8; median own 0.12, median margin -0.19, median z -0.5.

**`gta4:if99`** — unverifiable (too few previews). cues 10, превью 7, оценено 7: confirmed 0 (rank1 0), другой трек 0, нет матча 7; median own 0.12, median margin -0.03, median z -0.2.

**`gta4:fusion-fm`** — unverifiable (too few previews). cues 8, превью 6, оценено 6: confirmed 0 (rank1 0), другой трек 0, нет матча 6; median own 0.10, median margin -0.05, median z -0.8.

## Самые подозрительные cue (топ-12 по силе матча на чужой трек)

Формат: станция, #cue, заявленный трек, `own` (скор своего превью), `rank`, далее — что
реально звучит в этом месте файла по данным матчинга.

- `gtasa:bounce-fm` #8 «Funky Worm» / Ohio Players (t=1984 с): own **0.105**, rank **5** → звучит «Between the Sheets» / The Isley Brothers (score **0.998**, cue #12, сдвиг +4).
- `gtasa:k-jah-west` #6 «Revolution» / Dennis Brown (t=1462 с): own **0.134**, rank **9** → звучит «Sidewalk Killer» / I-Roy (score **0.990**, cue #8, сдвиг +2).
- `gta5:los-santos-rock-radio` #25 «Ogdens' Nut Gone Flake» / Small Faces (t=6019 с): own **0.217**, rank **4** → звучит «Peace of Mind» / Boston (score **0.989**, cue #15, сдвиг -10).
- `gtasa:k-jah-west` #9 «Funky Kingston» / Toots & the Maytals (t=2172 с): own **0.117**, rank **10** → звучит «Pressure Drop» / The Maytals (score **0.983**, cue #12, сдвиг +3).
- `gta4:liberty-rock-radio` #5 «Edge of Seventeen» / Stevie Nicks (t=1207 с): own **0.193**, rank **7** → звучит «Evil Woman» / Electric Light Orchestra (score **0.979**, cue #6, сдвиг +1).
- `gtasa:k-dst` #2 «Barracuda» / Heart (t=464 с): own **0.475**, rank **2** → звучит «Strutter» / Kiss (score **0.977**, cue #4, сдвиг +2).
- `gtasa:mastersounds-98-3` #13 «I Know You Got Soul» / Bobby Byrd (t=2829 с): own **0.101**, rank **8** → звучит «The Payback» / James Brown (score **0.976**, cue #14, сдвиг +1).
- `gta4:jazz-nation-radio` #9 «St. Thomas» / Sonny Rollins (t=1875 с): own **0.127**, rank **7** → звучит «Whisper Not» / Dizzy Gillespie (score **0.973**, cue #10, сдвиг +1).
- `gtasa:mastersounds-98-3` #6 «Green Onions» / Booker T. & the M.G.'s (t=1476 с): own **0.087**, rank **9** → звучит «Rock Creek Park» / The Blackbyrds (score **0.971**, cue #7, сдвиг +1).
- `gta5:los-santos-rock-radio` #30 «Roundabout» / Yes (t=7120 с): own **0.190**, rank **8** → звучит «Danger Zone» / Kenny Loggins (score **0.970**, cue #17, сдвиг -13).
- `gta5:channel-x` #17 «I Don't Need Society» / D.R.I. (t=2739 с): own **0.098**, rank **10** → звучит «Linda Blair» / Redd Kross (score **0.969**, cue #0, сдвиг -17).
- `gta4:liberty-rock-radio` #28 «Five to One» / The Doors (t=7414 с): own **0.145**, rank **21** → звучит «Touch Too Much» / AC/DC (score **0.967**, cue #32, сдвиг +4).

Всего таких cue: 97; полный список — `cues[].best_other` в JSON.

## Чего не хватает для 100% подтверждения

1. **AcoustID/Chromaprint с ключом.** Отпечаток по всему треку даёт бит-в-бит идентификацию
   записи и не зависит от того, попал ли 30-с фрагмент превью в проверяемое окно. Сейчас
   главное ограничение метода именно это: превью покрывает 30 с из 200–300 с трека.
2. **Полные официальные треки вместо 30-с превью** — убирает и «лотерею» с фрагментом, и
   часть ложных `no_match`.
3. **Авторитетный треклист по каждой станции с указанием издания игры.** Для GTA V станции
   различаются между изданиями (2013 / Expanded & Enhanced); судя по результатам, таблица
   собрана по одному списку, а аудио — по другому, и часть строк вообще не песни.
4. **Ручное прослушивание 3–5 окон** как ground truth для калибровки порогов 0.60/0.80.
5. **Перегенерация границ для 6 станций**, где длительность файла не совпадает с таблицей
   (все пять GTA SA + liberty-rock-radio): расхождение 46–190 с.
6. **Часть строк таблицы — не песни.** Из 79 ненайденных записей **19** — это DJ-подводки, помеченные `type: music`:

   - `gta4:fusion-fm#000` — «Mystic Fusion Intro» (Roy Ayers)
   - `gta4:if99#000` — «International Funk Welcome» (Femi Kuti)
   - `gta4:if99#005` — «African Rhythms & Afrobeat Speech» (Femi Kuti)
   - `gta4:jazz-nation-radio#000` — «Jazz Heritage Intro» (Roy Haynes)
   - `gta4:jazz-nation-radio#011` — «Jazz Outro» (Roy Haynes Ensemble)
   - `gta4:liberty-rock-radio#000` — «Intro & Classic Rock Declaration» (Iggy Pop)
   - `gta4:liberty-rock-radio#010` — «Iggy Rant on Star Junction» (Iggy Pop)
   - `gta4:liberty-rock-radio#020` — «Street Philosophy & Station ID» (Iggy Pop)
   - `gta4:liberty-rock-radio#035` — «The Nightmare Concludes» (Iggy Pop)
   - `gtasa:k-rose#003` — «Heartbreak & Trailer Park Chat» (Mary-Beth Maybell)
   - `gtasa:k-rose#011` — «Ex-Husband Memories» (Mary-Beth Maybell)
   - `gtasa:k-dst#001` — «The Nightmare Rant» (Tommy "The Nightmare" Smith)
   - `gtasa:k-dst#008` — «Dust Identification & Station ID» (Tommy "The Nightmare" Smith)
   - `gtasa:bounce-fm#003` — «Funky Cosmic Monologue» (The Funktipus)
   - `gtasa:bounce-fm#011` — «Funky Party Interlude» (The Funktipus)
   - `gtasa:k-jah-west#003` — «Reggae Philosophy & Dub Sound» (Marshall Peters & Johnny Lawton)
   - `gtasa:k-jah-west#011` — «Roots & Culture Reasoning» (Marshall Peters & Johnny Lawton)
   - `gtasa:mastersounds-98-3#003` — «The Love Maker Banter» (Johnny "The Love Maker" Parkinson)
   - `gtasa:mastersounds-98-3#012` — «Late Night Soul Reflection» (Johnny "The Love Maker" Parkinson)

   Они не могут быть подтверждены в принципе: это речь диджея, а не трек. Пока они лежат
   в таблице как музыкальные cue, любая проверка порядка будет считать их «несовпадением».


## Ограничения метода (важно при чтении цифр)

- **30-с превью ≠ трек.** Если превью из припева, а в cue куплет — матча не будет даже при
  верном порядке. Поэтому `no_match` означает «не проверили», а не «неправильно».
- **DJ-речь поверх музыки** (GTA V) и джинглы дают `no_match`; 20-с центральное окно обычно
  чистое, но в no_match-случаях это частая причина.
- **Ремиксы/ремастеры/live**: Deezer отдаёт другую версию — score падает до 0.3–0.5; такие
  совпадения помечены `match_quality: partial_title`.
- **Качество рипов не объясняет провалы**: файлы 32 или 48 кГц, 320 кбит/с, доля энергии
  <1 кГц 0.80–0.88 у сломанных и рабочих станций одинакова.
- **Одинаково низкие скоры = содержимое, а не метод**: у fusion-fm / if99 / jazz-nation все
  превью дают 0.10–0.15 (уровень шума), т.е. окно не содержит этих записей.

## Артефакты

- `report.json` — по каждому cue: `own`, `own_rank`, `runner_up`, `margin`, `z`,
  `best_other` (idx / название / артист / скор), `deezer` (id/title/artist/quality
  и качество совпадения), плюс сводки по станциям и проверка идентичности файлов.
- `scripts/` — весь пайплайн в порядке запуска: `deezer_search.py` → `retry.py` /
  `retry3.py` → `validate.py` (строгий выбор превью) → `score3.py station|prev|score` →
  `analyse.py` → `identity.py` → `assemble.py` → `finalise.py`.
- Вне репозитория (тяжёлое, не коммитится): `~/gta-radio-media/reports/cache/` —
  скачанные превью `previews/<deezer_id>.mp3`, результаты поиска `search/*.json`,
  хрома-кэши `station/*.npz` и `prev2/*.npz`, матрицы `per-cue-v3.jsonl`.

Пути в скриптах абсолютные (`/home/rauf/...`) — они писались под эту машину; при
переносе достаточно поменять три константы в `score3.py` (`ROOT`, `REP`, `FFMPEG`).

_Исключены по указанию: kult-fm, the-lowdown-911, motomami-los-santos, the-music-locker, still-slipping-los-santos. На момент аудита их аудио было файлами других станций; перезалиты отдельно в `c8591bd`, в этот замер они не входят._
