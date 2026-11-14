"""他大学のデータで見つかった、未対応の KAKEN 分類を、30 分野へ対応づける表（field_map_extra.csv）を作る。

field_map.csv は、立命館大学のデータで確認した分類の対応表。大学が増えると、対応表にない分類が出る。
ここでは、「対応表に行がない（no_mapping_row）」分類のうち、次のルールで**1 つの分野に決まるものだけ**を
追加する。判断が割れるもの・既に「対応させない」と決めたものは、触れない。

  1. 審査区分（小区分・中区分）: 番号の上 2 桁（中区分）で、分野を決める（MID_TO_FIELD）
  2. 研究分野の名前（細目など）: 名前に含まれる言葉で、分野を決める（KEYWORDS）。
     別々の分野の言葉が両方入っていたら、決めない

    python data/assign_fields.py --university tsukuba   # 先に、報告書（unmatched_sources）を作る
    python data/extend_field_map.py --university tsukuba
    python data/assign_fields.py --university tsukuba   # 追加した対応表を使って、もう一度

出力: data/field_map_extra.csv（大学をまたいで、追記・更新する）
"""

from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path
import re

DATA_DIR = Path(__file__).resolve().parent
EXTRA_PATH = DATA_DIR / "field_map_extra.csv"
HEADER = ["source_kind", "table_type", "nii_code", "path", "source_name", "field_id", "note"]

# 審査区分の中区分（番号の上 2 桁）→ 分野。農学系（38〜42）は 30 分野に農学がないため、題材の近い分野に寄せる
MID_TO_FIELD = {
    4: "geography",
    11: "mathematics", 12: "mathematics",
    13: "physics-astronomy-earth-science", 14: "physics-astronomy-earth-science",
    15: "physics-astronomy-earth-science", 16: "physics-astronomy-earth-science",
    17: "physics-astronomy-earth-science",
    21: "electrical-electronics-robotics",
    22: "architecture-civil-disaster-science", 23: "architecture-civil-disaster-science",
    25: "architecture-civil-disaster-science",
    32: "chemistry-materials-nanoscience", 33: "chemistry-materials-nanoscience",
    34: "chemistry-materials-nanoscience", 35: "chemistry-materials-nanoscience",
    36: "chemistry-materials-nanoscience",
    37: "biology-life-science", 38: "biology-life-science", 39: "biology-life-science",
    40: "environmental-science", 41: "environmental-science", 42: "biology-life-science",
    43: "biology-life-science", 44: "biology-life-science", 45: "biology-life-science",
    46: "biology-life-science",
    47: "pharmacy-drug-discovery",
    **{mid: "medicine-health-science" for mid in range(48, 59)},
    59: "sports-science",
    60: "information-science", 61: "information-science", 62: "information-science",
    63: "environmental-science", 64: "environmental-science",
}

# 名前に含まれる言葉 → 分野（複数の分野の言葉が入っていたら、決めない）
KEYWORDS = {
    "medicine-health-science": r"外科|内科|放射線|循環器|呼吸器|消化器|腎|脳神経|泌尿|整形|看護|衛生|公衆衛生|腫瘍|病理|免疫|感染|麻酔|小児|産婦|眼科|皮膚|精神|歯|口腔|医学|健康科学|栄養|体力|生理学",
    "mathematics": r"数学|統計|代数|幾何|解析学",
    "physics-astronomy-earth-science": r"素粒子|原子核|宇宙|物性|薄膜|表面|界面|プラズマ|天文|地球|大気|物理",
    "biology-life-science": r"生物|細胞|動物|植物|昆虫|遺伝|ゲノム|脳科学|神経|生態|進化|発生|微生物|水産|畜産|園芸|農学",
    "chemistry-materials-nanoscience": r"化学|材料|ナノ|高分子|触媒|結晶",
    "information-science": r"情報|データ|ソフトウェア|計算機|ネットワーク",
    "ai-data-science": r"人工知能|機械学習",
    "environmental-science": r"環境|森林|ランドスケープ|気象|地質",
    "architecture-civil-disaster-science": r"建築|土木|防災|都市",
    "electrical-electronics-robotics": r"電気|電子|ロボット|制御|半導体",
    "education": r"教育|学習",
    "psychology": r"心理",
    "law": r"法学|法律",
    "economics": r"経済",
    "business-administration": r"経営|会計|マーケティング",
    "sociology": r"社会学",
    "social-welfare": r"福祉",
    "sports-science": r"スポーツ|体育",
    "arts-media-design": r"芸術|デザイン|美術|音楽|映像",
    "linguistics": r"言語|日本語|英語",
    "literature": r"文学",
    "history": r"歴史|史学",
    "archaeology-cultural-heritage": r"考古|文化財",
    "geography": r"地理",
    "international-relations": r"国際|外交",
    "political-science": r"政治",
    "philosophy-ethics": r"哲学|倫理",
    "tourism-studies": r"観光",
}


def field_by_code(name: str):
    """審査区分の名前から、番号の上 2 桁（中区分）を読み、分野を返す。決まらなければ None。"""
    match = re.match(r"^(?:合同審査対象区分:)?小区分(\d{5})", name)
    if match:
        return MID_TO_FIELD.get(int(match.group(1)[:2])), f"小区分{match.group(1)}"
    match = re.match(r"^中区分(\d+):", name)
    if match:
        return MID_TO_FIELD.get(int(match.group(1))), f"中区分{match.group(1)}"
    return None, ""


def field_by_keyword(name: str):
    hits = {field for field, pattern in KEYWORDS.items() if re.search(pattern, name)}
    if len(hits) == 1:
        return hits.pop(), "名前の言葉"
    return None, ""


def propose(source: dict):
    if source.get("reason") != "no_mapping_row":
        return None, ""  # 「対応させない」と決めたものは、触れない
    name = source.get("source_name") or ""
    if source.get("source_kind") == "review_section":
        field, basis = field_by_code(name)
        if field:
            return field, f"審査区分の{basis}（中区分→分野の表）"
        return None, ""
    field, basis = field_by_keyword(name)
    return field, ("研究分野の" + basis) if field else ""


def read_existing(path: Path) -> dict:
    if not path.exists():
        return {}
    with path.open("r", encoding="utf-8-sig", newline="") as file:
        return {tuple(row[name] for name in HEADER[:5]): row for row in csv.DictReader(file)}


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description="未対応の分類に、確かな対応だけを足す")
    parser.add_argument("--university", required=True)
    args = parser.parse_args(argv)
    report = json.loads(
        (DATA_DIR / "universities" / args.university / "field_mapping_report.json").read_text(encoding="utf-8")
    )
    rows = read_existing(EXTRA_PATH)
    added = skipped = 0
    for source in report["unmatched_sources"]:
        field, basis = propose(source)
        if not field:
            skipped += 1
            continue
        key = tuple(source.get(name) or "" for name in ("source_kind", "table_type", "nii_code", "path", "source_name"))
        if key not in rows:
            added += 1
        rows[key] = dict(zip(HEADER, [*key, field, f"拡張（{args.university}）: {basis}で{field}"]))
    with EXTRA_PATH.open("w", encoding="utf-8", newline="") as file:
        writer = csv.DictWriter(file, fieldnames=HEADER, lineterminator="\n")
        writer.writeheader()
        for key in sorted(rows):
            writer.writerow(rows[key])
    print(json.dumps({"added": added, "skipped": skipped, "total_rows": len(rows)}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
