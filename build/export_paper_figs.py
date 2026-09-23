#!/usr/bin/env python3
"""把 user study 用的 13 個 object 的「原始未壓縮」渲染圖匯出成論文製圖用的排版。

輸出: /project3/yichuanh/Comparison/Object/<case>/<Method>.png
      （直接複製原始 PNG bytes，不重新編碼、不縮放）

用法: python3 build/export_paper_figs.py [--dry-run]
"""
import hashlib, shutil, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from prepare_assets import OBJ_CASES, OBJ_METHODS, VIEW, VIEW_OVERRIDE, OBJ_SRC, GT_ROOT, REF_VIEW

DST = Path("/project3/yichuanh/Comparison/Object")

# 內部代號 -> 論文用檔名（跟 Comparison/MultiViews、Comparison/Video 的大寫命名一致）
PAPER_NAME = {
    "ours":        "Ours",
    "blenderag":   "BlenderRAG",
    "viga":        "VIGA",
    "cb_one_shot": "3DCodeBench_one_shot",
    "cb_harness":  "3DCodeBench_harness",
    "infinigen":   "Infinigen",
}
DRY = "--dry-run" in sys.argv


def md5(p: Path) -> str:
    h = hashlib.md5()
    with open(p, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def copy_exact(src: Path, dst: Path) -> str:
    """原樣複製，並比對 md5 確認 bytes 完全相同。"""
    if DRY:
        return "dry-run"
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dst)
    if md5(src) != md5(dst):
        sys.exit(f"❌ 複製後 md5 不符: {dst}")
    return "ok"


def main():
    n = 0
    for case in OBJ_CASES:
        print(f"\n{case}")
        for src_dir, code in OBJ_METHODS:
            view = VIEW_OVERRIDE.get((case, code), VIEW)
            src = OBJ_SRC / src_dir / case / f"{view}.png"
            if not src.exists():
                sys.exit(f"❌ 缺檔: {src}")
            dst = DST / case / f"{PAPER_NAME[code]}.png"
            copy_exact(src, dst)
            note = f"  ← {view} (覆寫)" if view != VIEW else ""
            print(f"  {PAPER_NAME[code]:<22} {src.stat().st_size/1024:7.0f} KB{note}")
            n += 1

        # 參考圖（held-out GT，不是 render；用 _ 開頭方便排序與辨識）
        for grp in ("A", "B"):
            ref = GT_ROOT / grp / "by_case" / case / REF_VIEW
            if ref.exists():
                copy_exact(ref, DST / case / "_Reference.png")
                print(f"  {'_Reference':<22} {ref.stat().st_size/1024:7.0f} KB  ← GT_img/{grp}")
                n += 1
                break

    print(f"\n{'（dry-run，未實際寫入）' if DRY else '✅'} 共 {n} 個檔案 -> {DST}")


if __name__ == "__main__":
    main()
