# 3D Generation User Study

GitHub Pages 靜態問卷，作答結果自動寫入 Google Sheet。

```
docs/                 ← GitHub Pages 根目錄
  index.html  app.js  i18n.js  style.css
  config.json         ← 題庫 + Google Form 設定（要手動填 3 個 entry ID）
  assets/obj/<case>/<method>.jpg
  assets/obj/<case>/_ref.jpg        ← held-out 參考圖
  assets/scene/<scene>/<method>.mp4 (+ .jpg poster)
build/
  prepare_assets.py   ← 從原始渲染重建 assets 與 config.json
  prompts_zh.json     ← prompt 的中文翻譯（中文模式用）
  analyze.py          ← 把 Google Sheet 匯出的 CSV 算成勝率表
```

## 題庫

**Object — 12 個 case × 6 個方法**（單張 `az045` 正面圖 + 一張參考圖）

`ours` · `blenderag` · `viga` · `3dcodebench_ref_fair/one_shot` · `3dcodebench_ref_fair/harness` · `infinigen`

參考圖來自 **`GT_img/{A,B}/by_case/<case>/ref_01.png`** —— 這是 held-out 的參考集。

> ⚠️ **不要改用 `Evaluation/ref_img/<case>.png`**。那是 ours 生成時看過的原始 reference
> （`GT_img/README.md` 明確把它以 `ref_00` 之名排除，理由是 "was visible to the ours
> generation pipeline"），拿它當問卷參考圖會偏袒 ours。而且其中 3 個 case
> （`red_handfish`、`pink_blossom_glade`、`red_breasted_robin`）的 symlink 是斷的，
> 指向 `_original_factories/` 的 Infinigen 原廠算圖。

### 已知的素材問題（照實保留，未修改）

| 位置 | 狀況 |
|---|---|
| `golden_pangolin` / `cb_one_shot` | 完全空白（render 失敗） |
| `pink_mossy_boulder` / `cb_one_shot` | 完全空白（render 失敗） |
| `red_handfish` / `cb_one_shot` | 完全空白（render 失敗） |
| `seahorse` / `viga` | 整格被 VIGA 自己加的灰色背景牆佔滿，幾乎看不到物件 |

`ref_one_shot` 全體 100 個 case 有 15 個 render 失敗，目前這 12 個抽到 3 個。
空白就算它輸，是誠實的呈現；要換掉的話改 `build/prepare_assets.py` 的 `OBJ_CASES` 再重跑。

### 視角覆寫

`build/prepare_assets.py` 的 `VIEW_OVERRIDE` 可以針對個別 (case, 方法) 換掉預設的 `az045`：

```python
VIEW_OVERRIDE = {
    ("alpine_hare", "cb_harness"): "az135",   # az045 是背對且過曝
}
```

### Prompt 覆寫

`PROMPT_OVERRIDE` 可以改寫來源 tsv 的英文 prompt（描述與畫面對不上時）。
目前 `coast_cypress` 拿掉了 "snowberry shrubs carrying **masses of** round white berries"
—— 畫面裡白果只有零星幾顆。**改了英文就要同步改 `build/prompts_zh.json` 的中文。**

**Scene — 10 個 scene × 5 個方法**（5 秒環繞影片，854×480）

`Ours` · `VIGA` · `ClaudeOpus` · `Code2World` · `Infinigen`

> Astra 已從 scene 比較中移除。object 是 6 個方法（選項 A–F），scene 是 5 個（A–E），
> 所以兩邊的 chance level 不同（16.7% vs 20%）。`analyze.py` 會依 `slot_order` 自動算。

## 流程

1. **首頁**（雙語呈現，**預設英文**）：填姓名 + 選「全部中文 / All English」。
   選中文的話連 prompt 都會換成中文。
2. 第一部分：12 個 object —— 按「開始」後**直接進第一題**，沒有分段頁。
   區段說明（「接下來每一題會顯示…」）改成一塊提示框，掛在該區段第一題的上方。
3. 第二部分：10 個 scene —— 同上，接在 object 最後一題之後直接開始
4. 完成頁：顯示作答編號、自動送出、提供備份下載

`sampling.estimatedMinutes` 是**首頁上顯示給受試者看的數字**，目前寫 `5`。

> ⚠️ 12 objects + 10 scenes 全做，實際大約要 **9 分鐘**。
> 要讓「5 分鐘」成立，把每人抽題數降下來即可 —— 跨受試者累積仍會覆蓋整個題庫：
>
> ```json
> "sampling": { "objectPerParticipant": 7, "scenePerParticipant": 5, "estimatedMinutes": 5 }
> ```

## 語言

`docs/i18n.js` 放全站文案（`zh` / `en` 兩份，key 必須一致）。
prompt 的中文翻譯放在 `build/prompts_zh.json`，由 `prepare_assets.py` 寫進 `config.json`
的 `prompt_zh` 欄位；缺翻譯的 case 在中文模式會自動退回英文，並在 build 時印出警告。

每人獨立隨機：抽哪幾題、題目順序、以及 6 個方法擺在 A–F 哪一格，全部用 `crypto` 重新洗牌。
真正的對應關係記錄在每筆作答的 `slot_order` 欄位。

## 每題問什麼

| | 問題 |
|---|---|
| Object Q1 `align` | 哪一個最符合文字描述與參考圖？（種類／部位／顏色／數量） |
| Object Q2 `quality` | 哪一個 3D 品質最好？（比例、破面、穿插、浮空零件） |
| Scene Q1 `align` | 哪一個場景最符合文字描述？ |
| Scene Q2 `realism` | 哪一個場景整體最真實可信？（擺放、疏密、地形植被協調） |

---

## 設定步驟

### 1. 建 Google Form

新增一份表單，**3 個問題**（名稱隨意，順序要一致）：

| 題目 | 類型 |
|---|---|
| pid | 簡答 |
| meta | **段落** |
| responses | **段落** |

設定裡要**關掉**：
- 「收集電子郵件地址」
- 「僅限 <你的機構> 使用者」
- 「回覆次數上限為 1 次」

> 這三個只要有一個開著，跨站 POST 就會被擋掉。

### 2. 拿 entry ID

表單右上 ⋮ →「取得預先填入的連結」→ 三格都隨便打字 → 「取得連結」→ 複製網址。
網址長這樣：

```
...?usp=pp_url&entry.1234567890=aaa&entry.987654321=bbb&entry.555555555=ccc
```

同一頁的網址列也可以拿到表單 ID：`https://docs.google.com/forms/d/e/<FORM_ID>/viewform`

### 3. 填進 `docs/config.json`

```json
"form": {
  "action": "https://docs.google.com/forms/d/e/<FORM_ID>/formResponse",
  "fields": {
    "pid":       "entry.1234567890",
    "meta":      "entry.987654321",
    "responses": "entry.555555555"
  }
}
```

`prepare_assets.py` 重跑時會保留這段，不會被蓋掉。

### 4. 推上 GitHub 開 Pages

```bash
cd /project3/yichuanh/UserStudy
git init && git add . && git commit -m "user study"
git remote add origin git@github.com:<you>/<repo>.git
git push -u origin main
```

GitHub → Settings → Pages → Source: `Deploy from a branch` → `main` / **`/docs`**
網址會是 `https://<you>.github.io/<repo>/`

### 5. 本機先試跑

```bash
python3 -m http.server 8000 --directory docs
# 開 http://localhost:8000
```

`form.action` 留空時會進**測試模式**：不送出，只讓你下載結果 JSON。

---

## 收資料與分析

Google Form →「回覆」分頁 → 建立試算表 → 下載 CSV：

```bash
python3 build/analyze.py responses.csv
python3 build/analyze.py responses.csv --min-rt 3000   # 剔除每題不到 3 秒的亂點者
```

輸出各方法的勝率（含被展示次數校正）、chance level、語言分布、以及**位置偏誤檢查**
（A–F 各格被選的比例，理想上應接近 16.7%；若嚴重偏斜代表隨機化有問題）。
同時寫出 `responses.long.csv`，一列一筆判斷，可直接丟進 pandas / R。

## 送出失敗的備援

跨站 POST 讀不到真正的狀態碼，所以：
- 結果同時寫進 `localStorage`
- 完成頁顯示作答編號 `pid`
- 一律提供「下載我的作答結果」按鈕

若 Google 端持續擋掉，改用 Google Apps Script Web App (`doPost`) 取代 —
可以正常回 CORS 並直接寫 Sheet，前端只要換 `form.action` 並改成 `fetch` POST。

## 重建素材

```bash
python3 build/prepare_assets.py           # 只補缺的
python3 build/prepare_assets.py --force   # 全部重做
```

來源：
- object `/project2/yichuanh/Animal/BeyondInfinigen/Evaluation/multi-view`
- scene `/project3/yichuanh/Comparison/Video`
- 參考圖 `/project2/yichuanh/Animal/BeyondInfinigen/Evaluation/GT_img/{A,B}/by_case/<case>/ref_01.png`
- prompts `batchAB_all100_prompts.tsv` / `scene20_prompts.tsv`
- 中文翻譯 `build/prompts_zh.json`（手動維護）
