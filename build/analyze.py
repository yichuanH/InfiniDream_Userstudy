#!/usr/bin/env python3
"""把 Google Sheet 匯出的 CSV 展開成 long format，算出各方法的勝率。

用法:
    python3 build/analyze.py responses.csv
    python3 build/analyze.py responses.csv --min-rt 3000   # 濾掉亂點的人
"""
import argparse, json, sys
from collections import Counter, defaultdict
from pathlib import Path
import csv

LABEL = {  # 內部代號 -> 論文裡的方法名
    "ours": "Ours", "blenderag": "BlenderRAG", "viga": "VIGA",
    "cb_one_shot": "3D-CodeBench (one-shot)", "cb_harness": "3D-CodeBench (harness)",
    "infinigen": "Infinigen",
    "Ours": "Ours", "VIGA": "VIGA", "ClaudeOpus": "Claude Opus",
    "Astra": "Astra", "Code2World": "Code2World", "Infinigen": "Infinigen",
}
QNAME = {"align": "Text alignment", "quality": "3D quality", "realism": "Scene realism"}


def load(csv_path):
    """從 Google Sheet 的 CSV 找出 responses / meta 欄位並展開。"""
    rows = []
    with open(csv_path, newline="", encoding="utf-8") as fh:
        for rec in csv.DictReader(fh):
            resp_raw = next((v for k, v in rec.items()
                             if v and v.lstrip().startswith("[") and '"chosen_method"' in v), None)
            meta_raw = next((v for k, v in rec.items()
                             if v and v.lstrip().startswith("{") and '"started_at"' in v), None)
            if not resp_raw:
                continue
            meta = json.loads(meta_raw) if meta_raw else {}
            pid = next((v for k, v in rec.items() if k.strip().lower() == "pid"), "")
            for a in json.loads(resp_raw):
                rows.append({**a, "pid": pid,
                             "name": meta.get("name", ""),
                             "lang": meta.get("lang", "")})
    return rows


def report(rows, title):
    if not rows:
        return
    print(f"\n{'='*66}\n{title}   (n = {len(rows)} judgements)\n{'='*66}")
    by_q = defaultdict(list)
    for r in rows:
        by_q[r["question"]].append(r)

    for q, qrows in by_q.items():
        n = len(qrows)
        methods = sorted({m for r in qrows for m in r["slot_order"].split("|")})
        wins = Counter(r["chosen_method"] for r in qrows)
        # 每個方法實際被展示的次數（用來算真正的勝率）
        shown = Counter(m for r in qrows for m in r["slot_order"].split("|"))
        chance = 100 / len(methods) if methods else 0
        print(f"\n— {QNAME.get(q, q)} —   (n={n}, chance = {chance:.1f}%)")
        ranked = sorted(methods, key=lambda m: -wins[m] / max(shown[m], 1))
        for m in ranked:
            rate = wins[m] / max(shown[m], 1) * 100
            bar = "█" * round(rate / 2)
            print(f"  {LABEL.get(m, m):<26} {rate:5.1f}%  ({wins[m]:>3}/{shown[m]:<3}) {bar}")

    # 位置偏誤檢查：如果某個 slot 被選的次數明顯偏高就要警覺
    slots = Counter(r["chosen_slot"] for r in rows)
    tot = sum(slots.values())
    print("\n位置偏誤檢查 (理想上每格應接近 "
          f"{100/len(slots):.1f}%): "
          + "  ".join(f"{k}={slots[k]/tot*100:.1f}%" for k in sorted(slots)))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("csv")
    ap.add_argument("--min-rt", type=int, default=0,
                    help="每題作答時間低於這個毫秒數的受試者整份剔除")
    args = ap.parse_args()

    rows = load(args.csv)
    if not rows:
        sys.exit("CSV 裡找不到作答資料，確認欄位是否含 responses 的 JSON。")

    if args.min_rt:
        bad = {r["pid"] for r in rows if r["rt_ms"] < args.min_rt}
        rows = [r for r in rows if r["pid"] not in bad]
        print(f"依 --min-rt {args.min_rt}ms 剔除 {len(bad)} 位受試者")

    langs = Counter(r["lang"] for r in rows if r["lang"])
    print(f"受試者數: {len({r['pid'] for r in rows})}"
          + (f"   語言: {dict(langs)}" if langs else ""))
    report([r for r in rows if r["level"] == "object"], "OBJECT LEVEL")
    report([r for r in rows if r["level"] == "scene"], "SCENE LEVEL")

    out = Path(args.csv).with_suffix(".long.csv")
    with open(out, "w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=list(rows[0].keys()))
        w.writeheader(); w.writerows(rows)
    print(f"\nlong format 已寫出: {out}")


if __name__ == "__main__":
    main()
