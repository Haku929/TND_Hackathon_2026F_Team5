# 開発用データ

`sample.json` は画面・検索APIの開発に使う、KAKEN由来の少量データです。[設計書](../docs/DESIGN.md#6-db-スキーマ) の4表に対応する `fields`、`terms`、`researchers`、`researcher_fields` を収録しています。DBへの投入や画面への接続はまだ行っていません。

法学（`law`）・情報学（`information-science`）・生命科学（`life-science`）の3分野、各3人の研究者、各3件の用語を含みます。

研究者情報は2026-11-02にKAKEN APIから取得しました。APIの現在所属が「立命館大学」と完全一致する記録を選び、`theme` には研究代表者として登録された課題名と、掲載キーワードの先頭5個までを連結しています。

分野カードと用語説明は今回の試作用に作成した文章です。研究者の分野は部局と課題内容に基づく分類です。研究者ごとの出典・選定理由・検証結果は [sample_sources.md](sample_sources.md) を参照してください。

## 埋め込み

モデルは `intfloat/multilingual-e5-small`、revisionは `614241f622f53c4eeff9890bdc4f31cfecc418b3` です。次の文章に `passage: ` を付け、CPUでL2正規化した384次元ベクトルを、小数点以下8桁に丸めて保存しています。

- 分野：分野名・概要・各用語と説明を空白で連結
- 用語：用語名と説明を空白で連結
- 研究者：`theme`

検索する問いには `query: ` を付け、同じモデルでL2正規化して比較します。

## 出典

出典: KAKEN（国立情報学研究所）https://kaken.nii.ac.jp/ ／ 必要項目の選択・文章の連結・暫定分野付け・埋め込み計算を行って加工。APIキーとAPIの生応答はこのデータに含めていません。表示時にも出典と加工した旨を明記してください。

## 研究者データの取得・整理（#21）

`fetch_kaken.py` はKAKEN APIから取得した課題を研究者ごとにまとめ、APIの現在所属が「立命館大学」と完全一致する人だけを `researchers.json` に保存します。Python 3.10以上の標準ライブラリだけで実行できます。環境変数 `KAKEN_APPID`、またはリポジトリ直下の `.env` に同名の値を設定してください。

```powershell
python data/fetch_kaken.py
npx prettier --write data/researchers.json
```

取得済みページを再利用します。ネットワークを使わず再整理する場合は `python data/fetch_kaken.py --offline` を使います。キーとAPI応答はGitに追加しないでください。APIの生応答・ページ情報・中間JSONはGit対象外の `data/raw/` に保存されます。

2026-11-05の整理結果は、研究者1,201人、参画課題3,374件（重複除去後）、研究者と課題の組み合わせ4,332件です。検索結果5,860課題・2,925人をIDで照合してから現在所属を判定しました。現在所属の1,407人のうち、対象課題への有効な参画記録がなかった206人は収録していません。取得・除外条件と欠損件数は [KAKEN_API.md](../docs/KAKEN_API.md#9-検証結果と未測定事項) にあります。

`researchers.json` の `coverage` に取得総数・重複除去後の件数・除外理由、`researchers` に名前・所属・研究テーマ・課題ごとの出典・役割・分類情報を保存しています。テーマは課題名・キーワード・概要を連結した原文で、要約や翻訳はしていません。分野付け・埋め込みは後述のスクリプトで行い、元の研究者JSONは変更しません。384次元ベクトルを含む3分野の画面確認用データは、前述の `sample.json` を使ってください。

APIが提供する概要は保持し、報告書PDFの全文は取得・利用しません。概要の種類だけを理由に一律削除する方針にはしていません。ただしAPIで取得できることは利用許諾の保証ではなく、著作物と明示された一部の旧報告書等には別条件があります。個別の著作権表示・利用条件の照合は未完了です。[KAKEN利用規程](https://support.nii.ac.jp/ja/kaken/about/terms)に従い、出典と加工した旨を記載してください。

通信なしのテスト:

```powershell
python -m unittest discover -s data -p test_fetch_kaken.py -v
```

## 研究者の分野付け（#22）

`fields_catalog.json` は [#6](https://github.com/Haku929/TND_Hackathon_2026F_Team5/issues/6) を基にチーム了承済みの見直しを反映した30分野、`field_map.csv` はKAKENの分類から分野IDへの対応表です。実行時は対応表の完全一致で分類し、LLM・研究テーマの文章・外部APIは使いません。Python 3.10以上の標準ライブラリだけで実行できます。

```powershell
python data/assign_fields.py
npx prettier --write data/fields_catalog.json data/researcher_fields.json data/field_mapping_report.json
python -m unittest discover -s data -p test_assign_fields.py -v
```

出力は `researcher_fields.json`（研究者IDと分野IDの組）、`field_mapping_report.json`（件数・未分類者・使用した分類）、`field_mapping_report.md`（一覧）です。入力の `researchers.json` は変更しません。研究者のうち1,157人／1,201人（96.3%）に分野が付き、44人が未分類でした。対応方法と制約は [FIELD_MAPPING.md](FIELD_MAPPING.md) を参照してください。

`sample.json` は旧3分野の画面確認用データとして独立しています。本番データを投入する #23 では、新しい `fields_catalog.json` のIDと `researcher_fields.json` を組にして使用してください。

## 埋め込み計算（#23）

`embed_data.py` は `researchers.json`、`fields.yaml`、`researcher_fields.json` と `shared/embedding.json` を読み、DBの各テーブル用データを作ります。モデルは設定ファイルの `Xenova/multilingual-e5-small` を使い、Hugging Faceの現在のrevision SHAに固定して `onnx/model_quantized.onnx` をCPUで実行します。トークン化には、同じrevisionの `tokenizer.json` をRust実装の`tokenizers`で読み込みます。

```powershell
python -m pip install -r data/requirements-embedding.txt
python data/embed_data.py
```

HFキャッシュは `data/raw/model_cache/hub/`、出力は旧 `embeddings.json` を残したまま `data/raw/embeddings_chunked.json` に作られます。分野・用語が512トークンを超えたらエラーにし、研究者は課題ごとのタイトル・キーワード・概要をtokenizerの文字境界で分割します。分割は重複・切り捨てなしで、各断片は接頭辞とspecial token込みで512トークン以下です。課題本文とベクトルは課題IDごとに一度計算し、研究者との対応行へ展開します。
分割では原文を保持し、末尾の句点だけのchunkを作りません。記号だけのchunkは生成時とloaderで拒否するため、既存の不良な `embeddings_chunked.json` は再生成が必要です。

出力は `fields`、`terms`、`researchers`、`researcher_fields`、`researcher_chunks` の5配列です。研究者の `theme` 原文は保持し、NOT NULLの `researchers.embedding` には先頭チャンクのベクトルを入れます。新しい検索は `researcher_chunks` の最大類似度を使います。メタデータにはモデル・入力のハッシュ、ライブラリのバージョン、分割方式、固有課題数・計算チャンク数・保存チャンク数、切り捨て数（0）を記録します。出力は計算が成功した後に置き換わるため、失敗時は既存の正式出力を保ちます。

新しい検索APIを使う前に、既存DBへ [`db/migrations/20261111_add_researcher_chunks.sql`](../db/migrations/20261111_add_researcher_chunks.sql) を実行してください。移行SQLは追加テーブルだけを作成します。テーブル未作成のままではAPIの研究者検索が失敗します。

### DBへの投入（#23 Phase 2）

```powershell
python -m pip install -r data/requirements-db.txt
python data/load_data.py
```

引数なしはDBを読取専用で調べるdry-runです。URLは環境変数 `DATABASE_URL`、リポジトリの `.env.local`、`.env` の順に読みます。モデル設定・4入力ファイルのハッシュ・5配列・参照・ベクトル次元と正規化をDB接続前に検証します。差分表示は表ごとの追加・更新対象・削除候補の件数だけで、既存値との一致は比較しません。

実反映は `python data/load_data.py --apply` です。削除候補があると、`--prune` がない限り一切書き込みません。承認済みの削除も含めて同期する場合は `python data/load_data.py --apply --prune` を使います。実反映前にDBにある対象表の全行を日時付きJSONで `data/raw/` に保存し、追加テーブルのmigration・同期・件数確認を1トランザクションで行います。成功時にバックアップファイル名を表示します。行データは失敗時にrollbackしますが、PostgreSQLのserial採番値を直した後で失敗した場合は、採番値に欠番が残ることがあります。

通信なしで動く投入scriptのテスト:

```powershell
python -m unittest discover -s data -p test_load_data.py -v
```

最大類似度で順位を付けるため、課題数・分割数の多い研究者は高いスコアを得る機会も増えます。分割による検索精度の改善は、従来方式との比較と人の判定で別途確認します。
