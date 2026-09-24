# 3D Generation User Study

A static survey site served from GitHub Pages. Responses are POSTed to a Google
Form and land in a Google Sheet — no backend, no database.

```
docs/                     GitHub Pages root
  index.html  app.js  i18n.js  style.css
  config.json             question bank + Google Form endpoint
  assets/obj/<case>/<method>.jpg
  assets/obj/<case>/_ref.jpg              held-out reference image
  assets/scene/<scene>/<method>.mp4       (+ .jpg poster)
build/
  prepare_assets.py       rebuild assets/ and config.json from the source renders
  prompts_zh.json         Chinese translations of every prompt
  set_form.py             derive the Google Form config from a prefilled link
  analyze.py              turn the exported Sheet CSV into win-rate tables
  export_paper_figs.py    copy the uncompressed source renders for paper figures
```

## What participants see

1. **Landing page** (bilingual, **English by default**) — name field plus a
   language switch. Choosing Chinese also swaps every prompt to Chinese.
2. **Part 1 — 12 objects.** Pressing Start goes straight to the first question;
   there is no separate section page. The part's instructions appear as a
   callout above the first question of the part.
3. **Part 2 — 10 scenes.** Follows immediately after the last object question.
4. **Completion page** — response ID, automatic submission, backup download.

Each participant gets an independently shuffled run: which cases they see, the
order of the questions, and which method sits in which lettered slot are all
re-drawn with `crypto`. The true mapping is recorded in the `slot_order` field
of every answer.

`sampling.estimatedMinutes` in `config.json` is the figure shown to participants
on the landing page. It is currently `5`.

> ⚠️ Answering all 12 objects and 10 scenes actually takes around **9 minutes**.
> To make "5 minutes" true, lower the per-participant counts — the full bank is
> still covered once responses accumulate across participants:
>
> ```json
> "sampling": { "objectPerParticipant": 7, "scenePerParticipant": 5, "estimatedMinutes": 5 }
> ```

## Questions

| | Prompt shown to the participant |
|---|---|
| Object Q1 `align` | Which one best matches the description and the reference image? (species, body parts, colours, counts) |
| Object Q2 `quality` | Ignoring the description, which has the best 3D quality? (proportions, broken surfaces, interpenetration, floating parts) |
| Scene Q1 `align` | Which scene best matches the description? |
| Scene Q2 `realism` | Which scene is the most believable overall? (placement, density, terrain/vegetation coherence, repetition, clipping) |

## Question bank

**Objects — 12 cases × 6 methods.** A single front render (`az045`) per method,
shown alongside a reference image.

`ours` · `blenderag` · `viga` · `3dcodebench_ref_fair/one_shot` ·
`3dcodebench_ref_fair/harness` · `infinigen`

**Scenes — 10 scenes × 5 methods.** A 5-second orbit video per method, 854×480.

`Ours` · `VIGA` · `ClaudeOpus` · `Code2World` · `Infinigen`

> Astra was dropped from the scene comparison. Objects therefore have 6 options
> (A–F) and scenes have 5 (A–E), so the two levels have different chance levels
> (16.7% vs 20%). `analyze.py` derives this per level from `slot_order`.

### Reference images

Object reference images come from **`GT_img/{A,B}/by_case/<case>/ref_01.png`**,
the held-out reference set.

> ⚠️ **Do not switch to `Evaluation/ref_img/<case>.png`.** That is the original
> pipeline reference that *ours* saw during generation — `GT_img/README.md`
> excludes it by name (`ref_00`) precisely because it "was visible to the ours
> generation pipeline". Using it as the survey's reference would bias the study
> toward ours. Several of those symlinks are also broken, pointing at Infinigen
> factory renders under `_original_factories/`.

### Known asset defects (kept as-is)

| Where | What |
|---|---|
| `golden_pangolin` / `cb_one_shot` | Entirely blank — render failed |
| `pink_mossy_boulder` / `cb_one_shot` | Entirely blank — render failed |
| `red_handfish` / `cb_one_shot` | Entirely blank — render failed |
| `seahorse` / `viga` | Filled by the grey backdrop wall VIGA renders; the object is barely visible |

15 of the 100 `ref_one_shot` cases failed to render overall; 3 of them landed in
this set of 12. Blanks simply lose, which is the honest presentation. To swap
those cases out, edit `OBJ_CASES` in `build/prepare_assets.py` and rebuild.

### View overrides

`VIEW_OVERRIDE` in `build/prepare_assets.py` replaces the default `az045` for a
specific (case, method) pair:

```python
VIEW_OVERRIDE = {
    ("alpine_hare", "cb_harness"): "az135",   # az045 faces away and is blown out
}
```

### Prompt overrides

`PROMPT_OVERRIDE` rewrites the English prompt from the source TSV when the text
does not match what is actually rendered. `coast_cypress` currently drops
"snowberry shrubs carrying **masses of** round white berries" — the render has
only a few scattered berries. **Editing the English means editing the Chinese in
`build/prompts_zh.json` to match.**

### Languages

`docs/i18n.js` holds the UI copy (`zh` and `en`, with identical key sets).
Prompt translations live in `build/prompts_zh.json` and are written into the
`prompt_zh` field of `config.json` by `prepare_assets.py`. A case with no
translation falls back to English in Chinese mode and prints a build warning.

---

## Setup

### 1. Create the Google Form

Add **three questions**, in this order:

| Question | Type | |
|---|---|---|
| pid | Short answer | response id + the participant's name |
| summary | **Paragraph** | human-readable recap — optional but recommended |
| meta | **Paragraph** | language, timing, user agent |
| responses | **Paragraph** | the raw JSON the analysis reads |

Everything but `pid` must be *Paragraph* (long text) — `responses` carries
roughly 8 KB of JSON.

`summary` is what makes the spreadsheet readable without running anything. Its
first line is the recap you see in the collapsed cell, and the rest is the
per-question detail:

```
Ours 40/44 · 3DCodeBench-1shot 2/44 · Infinigen 2/44  |  44 judgements  |  ~2.2 min

[OBJECT] 12 cases
  bee                  align=Ours(D)  quality=Ours(D)  [7.5s]
  seahorse             align=3DCodeBench-1shot(D)  quality=3DCodeBench-1shot(D)  [4.6s]
  ...
[SCENE] 10 cases
  coast_cypress        align=Ours(C)  realism=Ours(C)  [3.7s]
  ...
```

Leaving `summary` out still works — the sheet then only holds the raw JSON. Note that nobody ever fills this form by hand; the page writes to it
programmatically, so the form is just a mailbox that feeds a spreadsheet.

Under **Settings → Responses**, set *Collect email addresses* to **Do not
collect** and turn off *Limit to 1 response*.

Then — this is the part that is easy to miss — press **Publish** (top right) and
set the responder audience to **Anyone with the link**. On a Workspace account
this defaults to your organisation only, and the form returns `401` to everyone
else, including the survey page. `build/test_form.py` checks this for you:

```bash
python3 build/test_form.py
```

### 2. Point the site at the form

Form → **⋮** → *Get pre-filled link*. Type `PID`, `SUMMARY`, `META` and
`RESPONSES` into the respective fields, press *Get link*, and copy it. Then:

```bash
python3 build/set_form.py "<the prefilled link>"
```

This parses the form ID and the `entry.*` IDs into `docs/config.json` and
prints the mapping for you to check. Quote the URL — an unquoted `&` will send
the command to the background.

Re-running `prepare_assets.py` preserves this block.

Finally, on the form's **Responses** tab, create the linked spreadsheet.

### 3. Deploy

```bash
git add -A && git commit -m "link google form" && git push
```

On GitHub: **Settings → Pages → Deploy from a branch → `main` / `/docs`**.
The site appears at `https://<user>.github.io/<repo>/` after a minute or two.

### 4. Run locally

```bash
python3 -m http.server 8000 --directory docs
```

With `form.action` empty the site runs in **test mode**: nothing is submitted,
and the completion page offers the result JSON as a download instead.

---

## Reading the results in the spreadsheet

`build/sheet_script.gs` is an Apps Script that expands the JSON payload into two
readable tabs, rebuilt automatically on every new response.

**Install once:** spreadsheet -> Extensions -> Apps Script -> paste the whole
file -> Save -> pick `setUp` in the function dropdown -> Run -> Allow.

**明細 Detail** — one row per participant, one column per question, each cell
holding the method they picked and the slot it sat in. Cells starting with
`Ours` are highlighted, so a glance down a column tells you how a case did.

```
                       |            | 物件 bee              | 物件 king_crab        | 場景 cliff
 時間        姓名  語言 費時 | 符合描述  3D品質 | 符合描述  3D品質  | 符合描述  場景真實感
 09/24 10:00 A    zh   2.2 | Ours(D)  Ours(D) | Ours(D)  Ours(D) | Ours(E)  Ours(E)
 09/24 10:20 B    en   4.4 | Ours(A)  Ours(C) | Ours(F)  VIGA(B)  | ...
```

**總分 Totals** — per-method tallies, object and scene scored separately because
they have different numbers of options:

```
OBJECT            共 72 次判斷 / 6 個方法 / 隨機基準 16.7%
方法                符合描述  3D品質  總得票  出現次數  勝率
Ours                    22     22     44      72    61.1%
3DCodeBench-1shot        4      4      8      72    11.1%
...
位置偏誤   A=12.5%  B=22.2%  C=20.8%  D=15.3%  E=11.1%  F=18.1%

SCENE             共 60 次判斷 / 5 個方法 / 隨機基準 20%
...
```

The win rate divides wins by how often that method was actually shown, so it
stays correct if the per-participant sampling is ever reduced. `位置偏誤` is the
position-bias check: each slot should attract about a chance share of the picks.

A menu item, **User Study -> 立即重算**, recomputes on demand — the menu only
appears after the spreadsheet is reloaded, so reload once after installing.
**User Study -> 診斷** logs what the script sees in each column, for when it
cannot find the payload.

The raw JSON stays in the form's own response tab; that tab is never modified.

Both tabs are recomputed from scratch on every run, so **deleting rows from the
response sheet and hitting 立即重算 is how you drop a participant** — pilot runs,
diagnostics, someone who clicked through in 20 seconds. Delete the whole row
(right-click the row number), keep row 1, and remember the automatic trigger only
fires on new submissions, so a manual deletion needs a manual recompute. Deleting
every row leaves both tabs holding a "no responses" note rather than stale numbers.

Note that rows deleted here still exist in the Form's own *Responses* view —
Google keeps that copy independently. The analysis only ever reads the sheet.

## Collecting and analysing responses

Form → *Responses* → the linked sheet → File → Download → CSV, then:

```bash
python3 build/analyze.py responses.csv
python3 build/analyze.py responses.csv --min-rt 3000   # drop participants who sped through
```

Prints per-method win rates (corrected for how often each method was shown), the
chance level, the language split, and a **position-bias check** — the share of
picks that went to each lettered slot, which should sit near chance. A strong
skew means the randomisation is not working. Also writes `responses.long.csv`,
one row per judgement, ready for pandas or R.

### If submission fails

The cross-site POST cannot read a real status code, so the page hedges:

- the result is mirrored into `localStorage`
- the completion page shows the response ID
- a "download my responses" button is always offered

If Google blocks the POST persistently, replace the endpoint with a Google Apps
Script web app (`doPost`), which can return proper CORS headers and write to the
sheet directly. Only `form.action` and the submit call need to change.

---

## Rebuilding assets

```bash
python3 build/prepare_assets.py           # fill in what is missing
python3 build/prepare_assets.py --force   # redo everything
```

Sources:

| | Path |
|---|---|
| Object renders | `/project2/yichuanh/Animal/BeyondInfinigen/Evaluation/multi-view` |
| Scene videos | `/project3/yichuanh/Comparison/Video` |
| Reference images | `.../Evaluation/GT_img/{A,B}/by_case/<case>/ref_01.png` |
| Prompts | `batchAB_all100_prompts.tsv`, `scene20_prompts.tsv` |
| Chinese prompts | `build/prompts_zh.json` (maintained by hand) |

## Paper figures

```bash
python3 build/export_paper_figs.py
```

Copies the **uncompressed** source PNGs (byte-for-byte, md5-verified) to
`/project3/yichuanh/Comparison/Object/<case>/<Method>.png`, using the same case
list and view overrides as the survey. Reference images are included as
`_Reference.png`.
