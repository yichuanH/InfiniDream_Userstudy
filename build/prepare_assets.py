#!/usr/bin/env python3
"""把 object 圖與 scene 影片壓成網頁素材，並產生 docs/config.json。

用法: python3 build/prepare_assets.py [--force]
"""
import csv, json, os, shutil, subprocess, sys
from pathlib import Path
from PIL import Image

ROOT   = Path(__file__).resolve().parent.parent
DOCS   = ROOT / "docs"
OBJ_SRC   = Path("/project2/yichuanh/Animal/BeyondInfinigen/Evaluation/multi-view")
OBJ_PROMPT= Path("/project2/yichuanh/Animal/BeyondInfinigen/Evaluation/batchAB_all100_prompts.tsv")
# held-out 參考圖：GT_img/{A,B}/by_case/<case>/ref_01.png
#   ★不要用 Evaluation/ref_img/<case>.png★ —— 那是 ours 生成時看過的原始 reference，
#   GT_img/README.md 明確把它(ref_00)排除掉。拿它當問卷參考圖會偏袒 ours。
GT_ROOT   = Path("/project2/yichuanh/Animal/BeyondInfinigen/Evaluation/GT_img")
ZH_PATH   = ROOT / "build" / "prompts_zh.json"
VID_SRC   = Path("/project3/yichuanh/Comparison/Video")
SCN_PROMPT= Path("/project3/yichuanh/Comparison/Evaluation/scene20_prompts.tsv")

VIEW = "az045"                 # object 只用正面這一張
REF_VIEW = "ref_01.png"        # held-out 參考圖用第一張
IMG_SIZE, IMG_Q = 768, 88      # 輸出 jpeg 規格
VID_SCALE, VID_CRF = "854:480", 28

# --- object：6 個方法（目錄 -> 內部代號）-------------------------------------
OBJ_METHODS = [
    ("ours",                          "ours"),
    ("blenderag",                     "blenderag"),
    ("viga",                          "viga"),
    ("3dcodebench_ref_fair/one_shot", "cb_one_shot"),
    ("3dcodebench_ref_fair/harness",  "cb_harness"),
    ("infinigen",                     "infinigen"),
]
OBJ_CASES = [
    "colorful_butterfly", "golden_pangolin", "snow_leopard", "alpine_hare",
    "pink_mossy_boulder", "bee", "king_crab", "lavender",
    "red_handfish", "peacock", "blue_jacaranda_tree", "seahorse",
]

# 個別 (case, 方法代號) 換掉預設視角。
#   alpine_hare / harness：az045 是背對且過曝，az135 才跟其他方法一樣是頭朝右的側身。
VIEW_OVERRIDE = {
    ("alpine_hare", "cb_harness"): "az135",
}

# --- scene：6 個方法（檔名 = 代號）-------------------------------------------
SCN_METHODS = ["Ours", "VIGA", "ClaudeOpus", "Code2World", "Infinigen"]
SCN_CASES = [
    "cliff", "coast", "coast_cypress", "coast_ginkgo", "coral_reef",
    "desert_s3", "desert", "canyon", "plain_sunflower", "under_water",
]

# 覆寫來源 tsv 的英文 prompt（描述與畫面對不上時）。
#   coast_cypress：雪果灌木實際上只有零星幾顆白果，不是 "masses of"，整句拿掉。
PROMPT_OVERRIDE = {
    "coast_cypress":
        "A calm coastal lagoon: bald cypress trees along the shore with tapering "
        "trunks and tiers of rusty-brown needle foliage, low snowberry shrubs, a "
        "flock of black-and-white magpie ducks floating on the still water, pale "
        "sand banks, clear blue sky.",
}

FORCE = "--force" in sys.argv


def read_tsv(path, key_col, want_cols):
    out = {}
    with open(path, newline="", encoding="utf-8") as fh:
        for row in csv.DictReader(fh, delimiter="\t"):
            out[row[key_col]] = {c: row.get(c, "") for c in want_cols}
    return out


def find_ref(case: str) -> Path:
    """在 GT_img 的 A / B 兩群裡找這個 case 的 held-out 參考圖。"""
    for grp in ("A", "B"):
        p = GT_ROOT / grp / "by_case" / case / REF_VIEW
        if p.exists():
            return p
    sys.exit(f"找不到參考圖: {case}")


def convert_image(src: Path, dst: Path):
    if dst.exists() and not FORCE:
        return
    dst.parent.mkdir(parents=True, exist_ok=True)
    im = Image.open(src)
    if im.mode in ("RGBA", "LA", "P"):          # 一律貼到白底，避免 alpha 變黑
        bg = Image.new("RGB", im.size, (255, 255, 255))
        im = im.convert("RGBA")
        bg.paste(im, mask=im.split()[-1])
        im = bg
    else:
        im = im.convert("RGB")
    im = im.resize((IMG_SIZE, IMG_SIZE), Image.LANCZOS)
    im.save(dst, "JPEG", quality=IMG_Q, optimize=True, progressive=True)


def convert_video(src: Path, dst: Path, poster: Path):
    if not (dst.exists() and poster.exists()) or FORCE:
        dst.parent.mkdir(parents=True, exist_ok=True)
        subprocess.run([
            "ffmpeg", "-v", "error", "-y", "-i", str(src),
            "-vf", f"scale={VID_SCALE}", "-c:v", "libx264", "-crf", str(VID_CRF),
            "-preset", "slow", "-pix_fmt", "yuv420p", "-an",
            "-movflags", "+faststart", str(dst),
        ], check=True)
        subprocess.run([
            "ffmpeg", "-v", "error", "-y", "-i", str(src), "-vf",
            f"scale={VID_SCALE}", "-frames:v", "1", "-q:v", "6", str(poster),
        ], check=True)


def main():
    obj_meta = read_tsv(OBJ_PROMPT, "case_id", ["subset", "prompt"])
    scn_meta = read_tsv(SCN_PROMPT, "case_id", ["prompt"])
    zh = json.loads(ZH_PATH.read_text(encoding="utf-8"))

    objects, scenes = [], []

    print("== object ==")
    for case in OBJ_CASES:
        missing_zh = case not in zh["objects"]
        if missing_zh:
            print(f"  ⚠ {case} 缺中文翻譯，中文模式會退回英文")
        ref_rel = f"assets/obj/{case}/_ref.jpg"
        convert_image(find_ref(case), DOCS / ref_rel)
        entry = {"id": case,
                 "category": obj_meta[case]["subset"],
                 "prompt": obj_meta[case]["prompt"],
                 "prompt_zh": zh["objects"].get(case, ""),
                 "ref": ref_rel,
                 "images": {}}
        for src_dir, code in OBJ_METHODS:
            view = VIEW_OVERRIDE.get((case, code), VIEW)
            src = OBJ_SRC / src_dir / case / f"{view}.png"
            if not src.exists():
                sys.exit(f"缺檔: {src}")
            rel = f"assets/obj/{case}/{code}.jpg"
            convert_image(src, DOCS / rel)
            entry["images"][code] = rel
        objects.append(entry)
        print(f"  {case:<28} ok")

    print("== scene ==")
    for case in SCN_CASES:
        if case not in zh["scenes"]:
            print(f"  ⚠ {case} 缺中文翻譯，中文模式會退回英文")
        entry = {"id": case,
                 "prompt": PROMPT_OVERRIDE.get(case, scn_meta[case]["prompt"]),
                 "prompt_zh": zh["scenes"].get(case, ""),
                 "videos": {}, "posters": {}}
        for code in SCN_METHODS:
            src = VID_SRC / case / f"{code}.mp4"
            if not src.exists():
                sys.exit(f"缺檔: {src}")
            rv = f"assets/scene/{case}/{code}.mp4"
            rp = f"assets/scene/{case}/{code}.jpg"
            convert_video(src, DOCS / rv, DOCS / rp)
            entry["videos"][code] = rv
            entry["posters"][code] = rp
        scenes.append(entry)
        print(f"  {case:<18} ok")

    cfg_path = DOCS / "config.json"
    # 保留使用者已經填好的 Google Form 設定，不要被重建蓋掉
    form = {"action": "", "fields": {"pid": "", "meta": "", "responses": ""}}
    sampling = {"objectPerParticipant": len(OBJ_CASES),
                "scenePerParticipant": len(SCN_CASES),
                "estimatedMinutes": 5}
    if cfg_path.exists():
        old = json.loads(cfg_path.read_text(encoding="utf-8"))
        form = old.get("form", form)
        sampling = old.get("sampling", sampling)

    cfg = {
        "form": form,
        "sampling": sampling,
        "methods": {"object": [c for _, c in OBJ_METHODS], "scene": SCN_METHODS},
        "objects": objects,
        "scenes": scenes,
    }
    cfg_path.write_text(json.dumps(cfg, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\n寫出 {cfg_path}")
    total = sum(f.stat().st_size for f in (DOCS / "assets").rglob("*") if f.is_file())
    print(f"assets 總大小: {total/1024/1024:.1f} MB")


if __name__ == "__main__":
    main()
