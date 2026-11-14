# 複数の大学への対応（運用手順）

立命館大学のほかに、早稲田大学・東京理科大学・筑波大学の先生を検索できるようにするための手順書です。
**DB（Neon）を触れる人**が、この手順どおりに実行すれば、アプリの入口の「知りたい大学」で、その大学が自動で選べるようになります（コードの変更・再デプロイは要りません）。

| 担当 | 内容 |
| --- | --- |
| データを作る人（河合・Claude Code） | KAKEN の取得 → 分野付け → 埋め込みの計算。DB 投入用のファイルを作る（2 章） |
| **Neon を触れる人** | 移行 SQL の実行 → 確認 → 投入（3 章）。所要 15 分ほど |

## 1. しくみ

- 先生の表（`researchers`）に `university_id` 列を足す。立命館大学の先生は `ritsumei`（既定値）。他大学の先生の ID には、`tsukuba:` のように大学の印を付ける。
- 検索 API は、選ばれた大学の先生だけで検索する。
- 入口に出す「選べる大学」は、**DB に先生のデータが入っている大学**（`GET /api/universities`）。データを入れれば増え、取り除けば消える。大学の名前と並び順は `shared/universities.json`。
- 追加するのは、その大学の分の行だけ。**既存の立命館大学のデータ、分野（`fields`）、用語（`terms`）には、触れない。**

## 2. データを作る人の手順（大学ごとに 1 回）

```powershell
# 1. KAKEN から取得（年度ごとに分けて取る。1 大学あたり 30〜50 分）
python data/fetch_kaken.py --university 筑波大学 --slug tsukuba --years 2016-2025

# 2. 分野付け（対応表にない分類は、確かなものだけ field_map_extra.csv に足す）
python data/assign_fields.py --university tsukuba
python data/extend_field_map.py --university tsukuba
python data/assign_fields.py --university tsukuba

# 3. 埋め込みの計算（数十分。初回はモデルを約 120MB ダウンロード）
python -m pip install -r data/requirements-embedding.txt
python data/embed_data.py --university tsukuba
```

出力は `data/raw/tsukuba/embeddings_chunked.json`（約 80MB）です（Git には入れない）。**圧縮して（`.json.gz`、約 35MB）、Google ドライブの共有リンクなどで**、Neon を触れる人に渡します。ハッシュ（SHA-256）も一緒に伝えます。

`--university` に指定する KAKEN の所属機関名は完全一致です。slug は英小文字と数字だけです（`waseda`、`tus`、`tsukuba`）。

## 3. Neon を触れる人の手順

### 準備（初回だけ）

- Python 3.10 以上。`python -m pip install -r data/requirements-db.txt`（`psycopg`）
- リポジトリの `.env.local` に `DATABASE_URL=（接続文字列）` を書く。**最初は、Neon のブランチ（本番のコピー）の接続文字列で試すことを勧めます。**
- 渡された zip（`university-data-20261115.zip`、約 70MB）を、リポジトリの `data/raw/` に**展開する**（`tsukuba/`、`waseda/`、`tus/` ができます。中のファイル `embeddings_chunked.json.gz` は、**解凍しない**でそのまま使えます）。
  壊れていないかは、ハッシュで確かめられます（`SHA256SUMS.txt` に、各ファイルのハッシュがあります）。

  ```powershell
  Get-FileHash data/raw/tsukuba/embeddings_chunked.json.gz -Algorithm SHA256
  ```

### 手順

1. **移行 SQL を実行する。** Neon の SQL Editor で、[`db/migrations/20261115_add_university.sql`](../db/migrations/20261115_add_university.sql) の中身を実行する。列と索引を**足すだけ**で、既存のデータは変わらない（何度実行しても同じ結果）。
2. **確認だけをする（DB は変わらない）。** 大学ごとに行う（`tsukuba`、`waseda`、`tus`）。

   ```powershell
   python data/load_university.py --university tsukuba
   ```

   `before` が 0、`after` が入力の件数であることを見る。エラーが出たら、5 章を見る。
3. **投入する。** 1 回のトランザクションで、途中で失敗したら全部もとに戻る。

   ```powershell
   python data/load_university.py --university tsukuba --apply
   python data/load_university.py --university waseda --apply
   python data/load_university.py --university tus --apply
   ```

   それぞれ、最後に `"verified"` の件数が `after` と一致していれば成功。1 大学ずつ独立しているので、うまくいかない大学があっても、他の大学には影響しない。
4. **画面で確かめる。** アプリの入口を開いて（最大 1 分で反映）、投入した大学が選べること、選んで検索するとその大学の先生が出ることを確かめる。

### 確認用の SQL

```sql
-- 大学ごとの先生の数
SELECT university_id, count(*) FROM researchers GROUP BY 1 ORDER BY 1;

-- 大学ごとの課題チャンクの数
SELECT r.university_id, count(*)
FROM researcher_chunks c JOIN researchers r ON r.id = c.researcher_id
GROUP BY 1 ORDER BY 1;

-- DB の使用量（Neon の無料枠は 0.5GB）
SELECT pg_size_pretty(pg_database_size(current_database()));
```

### もとに戻す

その大学だけを取り除く（他の大学は、そのまま）。

```powershell
python data/load_university.py --university tsukuba --remove          # 確認だけ
python data/load_university.py --university tsukuba --remove --apply  # 取り除く
```

取り除くと、入口の「知りたい大学」から、その大学が自動で消えます。列（`university_id`）は残しても害はありません。

## 4. 大学を足すとき

今回、筑波大学・早稲田大学・東京理科大学の 3 校分のデータを用意しました（件数は下の表）。さらに大学を足すときは、**2 章と 3 章を、slug を変えて繰り返す**だけです。

| 大学 | `--university` | `--slug` | 先生 | 課題チャンク | 圧縮ファイル | 先生の分野付け |
| --- | --- | --- | ---: | ---: | ---: | ---: |
| 筑波大学 | `筑波大学` | `tsukuba` | 1,688 | 6,255 | 35MB | 95.8% |
| 早稲田大学 | `早稲田大学` | `waseda` | 1,575 | 4,114 | 25MB | 92.0% |
| 東京理科大学 | `東京理科大学` | `tus` | 585 | 1,442 | 9MB | 90.1% |

- 取得は、年度（2016〜2025）ごとに分けて、現在その大学に所属する研究者だけを対象にしている（立命館大学の既存データは、全期間）。
- 大学の名前を足す・並べ替えるときは、`shared/universities.json` を直す。

## 5. エラーと対処

| 表示 | 原因と対処 |
| --- | --- |
| `researchers.university_id is missing` | 移行 SQL（3 章の手順 1）が、まだ実行されていない |
| `fields missing in the database` | DB に分野（`fields`）が入っていない。先に、立命館大学の投入（`data/load_data.py`）が要る |
| `metadata does not match shared/embedding.json` | 埋め込みを作ったときのモデルの設定と、いまの設定が違う。埋め込みを作り直す |
| `input could not be read` | `data/raw/<slug>/` に `embeddings_chunked.json`（または `.json.gz`）が置かれていない |
| `row counts after the load do not match` | 入れた件数が入力と合わなかった。**自動でもとに戻っている。** もう一度試し、続くなら作った人に連絡 |
| `DATABASE_URL was not found` | `.env.local` に接続文字列がない |

## 6. 出典・注意

- 先生のデータの出典は KAKEN（国立情報学研究所）です。画面のフッターに、出典と加工した旨を出している。
- 分野付けは、KAKEN の分類からの対応表（`data/field_map.csv`、他大学で足した分は `data/field_map_extra.csv`）による。後者はルールで足したもので、分類名から分野を決める判断を含む。
