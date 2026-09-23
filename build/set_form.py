#!/usr/bin/env python3
"""把 Google Form 的「預先填入的連結」解析成 docs/config.json 的 form 設定。

用法:
    python3 build/set_form.py "<貼上預先填入的連結>"

預填時三格請分別填入 PID / META / RESPONSES 這三個字（大小寫、單複數不拘），
這支腳本就能自動判斷哪個 entry 對應哪個欄位。
"""
import json, re, sys, urllib.parse
from pathlib import Path

CFG = Path(__file__).resolve().parent.parent / "docs" / "config.json"
WANT = {                       # 預填值(小寫) -> config 欄位；容忍單複數與縮寫
    "pid": "pid", "id": "pid",
    "meta": "meta", "metadata": "meta",
    "responses": "responses", "response": "responses", "resp": "responses",
}


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    url = sys.argv[1].strip()

    m = re.search(r"/forms/d/e/([A-Za-z0-9_-]+)/", url)
    if not m:
        sys.exit("❌ 連結裡找不到表單 ID，網址應該長得像\n"
                 "   https://docs.google.com/forms/d/e/1FAIpQLSxxxx/viewform?usp=pp_url&entry...")
    action = f"https://docs.google.com/forms/d/e/{m.group(1)}/formResponse"

    params = urllib.parse.parse_qs(urllib.parse.urlparse(url).query)
    entries = {k: v[0] for k, v in params.items() if k.startswith("entry.")}
    if not entries:
        sys.exit("❌ 連結裡沒有 entry.xxx 參數。請按表單右上 ⋮ →「取得預先填入的連結」，\n"
                 "   三格都填字之後再按「取得連結」並複製網址。")

    fields, unmatched = {}, dict(entries)
    for entry, value in entries.items():
        key = WANT.get(value.strip().lower())
        if key and key not in fields:
            fields[key] = entry
            unmatched.pop(entry, None)

    # 沒照規則填字的話，退回用「表單題目順序 = pid, meta, responses」
    if len(fields) < 3:
        left = [k for k in entries if k not in fields.values()]
        for key in ("pid", "meta", "responses"):
            if key not in fields and left:
                fields[key] = left.pop(0)
        print("⚠️  沒認出 PID/META/RESPONSES 這三個字，改用表單的題目順序對應。"
              "\n   請核對下面的結果，順序必須是 pid → meta → responses。")

    cfg = json.loads(CFG.read_text(encoding="utf-8"))
    cfg["form"] = {"action": action, "fields": fields}
    CFG.write_text(json.dumps(cfg, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"✅ 已寫入 {CFG}\n")
    print(f"  action    {action}")
    for k in ("pid", "meta", "responses"):
        print(f"  {k:<9} {fields[k]}   (預填值: {entries[fields[k]]!r})")
    print("\n接著 commit + push，GitHub Pages 幾十秒後就會生效：")
    print("  git add docs/config.json && git commit -m 'link google form' && git push")


if __name__ == "__main__":
    main()
