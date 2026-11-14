# 問学（TND_Hackathon_2026F_Team5）

> 問いから、学問へ、そして師へ。
> 大会の要件・審査基準・中間発表の情報は [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md) を参照。

**本番: <https://tnd-hackathon-5.vercel.app>**（スマートフォンでも開けます。非公式の作品で、大学の公式サービスではありません）

## リンク

- [共有ドライブ](https://drive.google.com/drive/folders/1w2jBpdN3dWKbkCe_TKRRFrbeO4pKPhCL?usp=sharing)（議事録・最終発表のスライドと補足資料の置き場）
- [仕様書（Spec）](docs/SPEC.md)
- [設計書（Design）](docs/DESIGN.md)
- [視覚デザイン（Visual Design）](docs/VISUAL_DESIGN.md)
- [開発計画（Plan）](docs/PLAN.md)
- [要件まとめ（Requirements）](docs/REQUIREMENTS.md)
- [開発ルール（Contributing）](docs/CONTRIBUTING.md)
- [セキュリティの確認記録](docs/SECURITY_CHECK.md)
- [複数の大学への対応（データ投入の手順書）](docs/MULTI_UNIVERSITY.md)

## アプリ名

問学

## 概要

学生がふと抱いた問いから、それに迫る学問と、学内で会える師（先生）へとつなぐ Web アプリ。「気軽に AI に相談する → 分野を知る → 師に出会う」という道のりを支える。

## 対象ユーザー

- 大学生（特に学部 1〜2 年生・研究室配属前）と、進路に悩む高校生。
- 対象の大学は、立命館大学・早稲田大学・東京理科大学・筑波大学。入口で「知りたい大学」を選ぶ（データの準備ができた大学から、順に選べるようになる）。
- 想定する場面: 授業や日常でふと抱いた問いを、どの学問で・どの先生のもとで深められるかを知りたいとき。研究室やゼミ、学部を選ぶ前の段階。

## 背景・解決する課題

- **学ぶ前に、学ぶものを選ばなければならない。** 専門用語や分野名が壁になり、自分の問いがどの学問につながるのかわからない（例：「なぜ人は協力するのか」が「ゲーム理論」につながると気づけない）。
- **よき師との出会いは人生を動かすが、出会えている学生は少ない。** 在学中によき師に恵まれた大卒者は 100 人に 14 人（[Gallup-Purdue Index, 2014](https://news.gallup.com/opinion/gallup/173624/gallup-purdue-reveal-findings-college-graduates.aspx)。米国の調査）。
- **憧れの先生には、いきなり会いに行きにくい。** その前段階の「気軽に相談する → 分野を知る」を支えるものがない。

## AIの活用

| 項目 | 内容 |
| --- | --- |
| AIを使う理由 | 日常の言葉で書かれた問いと、専門用語で書かれた研究テーマは、キーワードでは一致しない。意味の近さで結びつけるには埋め込みモデルが必要 |
| 利用場面 | 問いと分野・用語・研究テーマの意味の近さの計算（アプリ内で AI が動くのはこの 1 か所） |
| 使用モデル / API | 多言語対応の小さな埋め込みモデル（[multilingual-e5-small](https://huggingface.co/Xenova/multilingual-e5-small)、版を固定）を Transformers.js でブラウザ上で実行。クラウドの LLM API は使わない |
| 長い対話 | アプリの中では行わない。質問文をつくり、利用者が自分の AI（ChatGPT・Claude・Gemini など）に貼り付けて聞く |

## 主な機能

| 機能 | 説明 | 状態 |
| --- | --- | --- |
| 問う | 日常の言葉で問いを書く（例文あり）。大学を選べる。問いの文章はブラウザ内で数値に変え、サーバーへ送らない。検索中は、AI の準備と検索の進み具合を見せる | 実装済み |
| 見渡す | 問いに近い分野を並べ、「ひとことで言うと」「よくある誤解」「あなたの問いの、この分野での呼び名」を示す。近いが違う「別の視点」の分野も見せる | 実装済み |
| 出会う | 研究テーマが問いに近い順に、その大学の先生を並べる（KAKEN の実データ。最大 3 人、折りたたみ） | 実装済み |
| 深める | 分野・用語・先生を差し込んだ質問文を作り、ChatGPT・Claude・Gemini のボタンで、コピーして開く | 実装済み |
| このアプリについて | AI がどこで動くか、問いを保存しないこと、データの出典、非公式であること | 実装済み |

## 独自性（新規性）

研究者を意味で探す仕組みはすでにある（[SeedsSearch+ AI](https://en.nagoya-u.ac.jp/news/seedssearch_ai_research_database_launched.html)、[OpportunityMatch](https://bayes-centre.ed.ac.uk/access-expertise/opportunitymatch/introducing-opportunitymatch) など）が、いずれも企業や研究者どうしの連携向け。このアプリは**学生の問いから始まり、複数の分野を見渡し、学内の師にたどり着く**。汎用 AI と違い、実在する自分の大学の先生につながり、実在しない人や本は出てこない。

## 期待される効果（インパクト）

- 自分の問いと学問のつながりに気づき、学部をまたいだ学びが生まれる
- 研究室・ゼミ選びのミスマッチが減る
- 先生に会いに行く前に、分野のことばを知った状態で相談できる
- 利用者が増えても、AI の推論は端末で動くので、運営費が増えない（無料のまま続けられる）

## セキュリティ対策

設計は [設計書の「セキュリティ設計」](docs/DESIGN.md#9-セキュリティ設計)、確認の記録は [docs/SECURITY_CHECK.md](docs/SECURITY_CHECK.md)（本番の外からの確認を含む）を参照。

| 想定する攻撃 | 対策 | テスト方法 / 結果 |
| --- | --- | --- |
| XSS | React の自動エスケープ。CSP で外部スクリプトを禁止し、WASM の実行に必要な範囲だけ許可。DB 由来の URL は `https://` のときだけリンクにする | 本番ビルドで CSP 違反 0 件を確認。WASM の許可（`wasm-unsafe-eval`）は残る |
| SQL インジェクション | パラメータ化クエリ。API は、数値の配列と、知っている大学の ID しか受け取らない | 本番に、SQL インジェクション風の入力を送り、400 を確認 |
| 不正・過大なリクエスト | ベクトルの長さ・型・本文サイズの検証。回数制限（Vercel） | 壊れた JSON・型違い・非数値・無限大・巨大な本文（6MB）を送り、400 / 413 を確認。回数制限は、Vercel の設定（`docs/security`）。無料枠の上限に注意 |
| 問いの漏えい | 問いをサーバーに送らない・URL に入れない・ログに残さない。端末に残るのは、選んだ大学と前回選んだ AI の名前だけ | 通信の要求ペイロードが数値の配列と大学の ID だけであることを確認（`docs/security`） |
| プロンプトインジェクション | 質問文に差し込む先生の名前・テーマ・分野名・用語を整形（改行・制御文字・長さ） | `npm test`（6 件）で確認 |
| クリックジャッキングなど | `X-Frame-Options`、`frame-ancestors`、`X-Content-Type-Options`、`Referrer-Policy`、`Permissions-Policy`、HSTS | 本番のヘッダーを確認 |
| モデルのすり替え・食い違い | モデルの版（revision）を固定し、DB の埋め込みを作る側と、ブラウザ側で同じ版を使う | `shared/embedding.json` |
| 取得スクリプトの API キー流出 | 環境変数または Git 対象外の `.env` から読み込み、キー入りの URL をログ・キャッシュに保存しない | エラー非表示・応答へのキー混入拒否を通信なしテストで確認。Git の管理下にキーがないことを検索で確認 |
| 依存パッケージ | `npm audit` | 本番分の脆弱性 0 件 |

## UI・UX の工夫

- 分野カードには「よくある誤解」を必ず載せ、分野の印象を一目で正す
- 一致度の高い分野だけでなく、近いが違う分野もわざと見せ、分野をまたいだ発見を生む
- アプリ内で AI が動く箇所には「AI」と表示する
- ログイン不要。問いは保存しない
- スマートフォンを主な利用環境として設計（PC では、入口を 2 列、結果を「左にタブ・右に中身」に広げる）。検索ボタンを押すと検索中の画面に切り替わり、AI の読み込みは裏で続く
- 「紙・墨・朱」の文書型のデザイン。見出しは明朝、本文は 17px 以上、ライト・ダーク両対応、「動きを減らす」設定に対応

## 技術スタック

| 分類 | 技術 |
| --- | --- |
| フロントエンド | Next.js 16（React・TypeScript）、Transformers.js |
| バックエンド | Vercel Functions（検索 API・選べる大学の API） |
| データベース | Neon（Postgres + pgvector） |
| AI | multilingual-e5-small（量子化版、ブラウザで実行。WebGPU が使えれば WebGPU、なければ WASM） |
| インフラ / デプロイ | Vercel、GitHub Actions |
| データの準備 | Python（KAKEN API から取得・分野付け・埋め込み計算・DB への投入） |

## セットアップ

Node.js 22 以上が必要（バージョンは `.nvmrc` を参照）。

```bash
npm install
cp .env.example .env.local   # 値はチームから受け取って書き込む
npm run dev                  # http://localhost:3000
```

| コマンド | 内容 |
| --- | --- |
| `npm run dev` | 開発サーバーを起動 |
| `npm run build` | 本番用にビルド |
| `npm run lint` | ESLint でチェック |
| `npm run format` | Prettier で整形（`format:check` は確認のみ） |
| `npm test` | 質問文の整形（プロンプトインジェクション対策）のテスト |

データの準備（KAKEN からの取得 → 分野付け → 埋め込み → DB への投入）は [data/README.md](data/README.md) と [docs/MULTI_UNIVERSITY.md](docs/MULTI_UNIVERSITY.md) を参照。通信なしの Python テストは、次のとおり。

```bash
python -m unittest discover -s data -p "test_fetch_kaken.py"
python -m unittest discover -s data -p "test_assign_fields.py"
python -m unittest discover -s data -p "test_load_university.py"
```

## 開発の経過

| 時期 | 内容 |
| --- | --- |
| 〜11/1 | アイデア確定、技術検証（埋め込みモデルの精度・ブラウザでの動作）、KAKEN API の利用申請、中間発表 |
| 11/2〜11/13 | 開発（検索 API、画面、KAKEN の取得・分野付け・埋め込み）、セキュリティ対策とテスト |
| 11/14 | 成果物提出。アプリ名を「問学」に決定。デザインの刷新、PC 向けレイアウト、検索中の画面 |
| 11/15 | 複数の大学への対応（画面・API・データ準備の道具）、本番の確認。最終発表・審査 |

詳しい計画と進捗は [docs/PLAN.md](docs/PLAN.md)。

## 今後の課題

- **複数の大学のデータ投入**: 早稲田・東京理科・筑波のデータは用意済み。DB への投入（手順は [docs/MULTI_UNIVERSITY.md](docs/MULTI_UNIVERSITY.md)）のあと、入口で自動で選べるようになる。
- **動かない端末向けの保険**: モデルを端末で動かせない場合に、サーバーで同じモデルを動かす方式（方針のみ。[#27](https://github.com/Haku929/TND_Hackathon_2026F_Team5/issues/27)）。
- **授業（シラバス）・蔵書との連携**（[#28](https://github.com/Haku929/TND_Hackathon_2026F_Team5/issues/28)）。
- **初回の読み込みの軽量化**: モデル（約 118MB）とトークナイザ・実行環境で、端末の保存量が約 160MB。モバイル通信では重い。
- **モデルと実行環境の自前配信**: 現在は `huggingface.co` と `cdn.jsdelivr.net` から取得する。
- 実機（iOS・Android）と、画面の読み上げでの確認。

## チームメンバー・役割分担

| 名前 | GitHub | 役割 |
| --- | --- | --- |
| 河合 | @Haku929 | マネジメント・環境整備、スライド・README、「深める」画面 |
| 上原 | @gitthobe | データ準備（KAKEN の取得・分野付け・埋め込み）、精度の検証 |
| 高橋 | @Alphaverse-404 | 画面、ブラウザでの埋め込み処理、モデルの比較 |
| 大澤 | @tsubasa0038 | 環境構築・デプロイ、検索 API、セキュリティ対策とテスト |

## データの出典・ライセンス

- 先生と研究テーマのデータは [KAKEN（科学研究費助成事業データベース）](https://kaken.nii.ac.jp/)（国立情報学研究所）から取得し、加工して利用する。画面にも、出典と加工した旨を明記している。
- このリポジトリのコードは [MIT ライセンス](LICENSE)。使っている外部のデータ・モデル・ライブラリの出典とライセンスは [NOTICE](NOTICE.md) を参照。
- 本アプリは大学の公式サービスではない（非公式の作品）。大学のロゴ・校章は使わない。
