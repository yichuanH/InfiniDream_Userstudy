#!/usr/bin/env python3
"""送一筆測試資料到 docs/config.json 設定的 Google Form，診斷回傳狀態。

用法: python3 build/test_form.py
"""
import json, sys, urllib.error, urllib.parse, urllib.request
from pathlib import Path

CFG = Path(__file__).resolve().parent.parent / "docs" / "config.json"


def main():
    form = json.loads(CFG.read_text(encoding="utf-8")).get("form", {})
    action, fields = form.get("action", ""), form.get("fields", {})
    if not action or not all(fields.get(k) for k in ("pid", "meta", "responses")):
        sys.exit("❌ docs/config.json 的 form 還沒設定。先跑 build/set_form.py。")

    print(f"POST -> {action}\n")
    data = urllib.parse.urlencode({
        fields["pid"]: "DIAGNOSTIC | 連線測試（可從試算表刪除）",
        fields["meta"]: json.dumps({"name": "diagnostic", "lang": "en"}, ensure_ascii=False),
        fields["responses"]: json.dumps([{
            "level": "object", "case_id": "TEST", "question": "align",
            "chosen_slot": "A", "chosen_method": "ours",
            "slot_order": "ours|viga", "rt_ms": 1,
        }], ensure_ascii=False),
    }).encode()

    req = urllib.request.Request(action, data=data, method="POST",
                                 headers={"User-Agent": "Mozilla/5.0"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            code, body = r.status, r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        code, body = e.code, e.read().decode("utf-8", "replace")
    except Exception as e:
        sys.exit(f"❌ 連線失敗: {e}")

    low = body.lower()
    recorded = "response has been recorded" in low or "記錄您的回覆" in body
    login = "accounts.google" in low or "signin" in low

    print(f"HTTP {code}")
    if code == 200 and recorded:
        print("\n✅ 送出成功。回試算表確認多了一列 DIAGNOSTIC，確認後可以刪掉。")
        return
    if code in (401, 403) or login:
        print("""
❌ 表單還在要求登入，資料一筆都進不去。

到表單的「設定」分頁，把這三個全部關掉 / 改掉：

  1. 收集電子郵件地址  ->  必須選「不收集」
       （選「已驗證」會強制登入，這是最常見的原因）
  2. 限制為 <你的機構> 的使用者  ->  關閉
  3. 將回覆次數限制為 1 次        ->  關閉

改完直接重跑這支腳本，不用改程式也不用重新 push。""")
        return
    if "not accepting" in low or "停止接受回覆" in body:
        print("\n❌ 表單目前沒有接受回覆。到「回覆」分頁把「接受回覆」打開。")
        return
    print(f"\n⚠️ 非預期的回應。前 400 字：\n{body[:400]}")


if __name__ == "__main__":
    main()
