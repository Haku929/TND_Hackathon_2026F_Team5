# 開発計画

[仕様書](SPEC.md)・[設計書](DESIGN.md) を 11/14 13:00 の提出までに形にするための、タスク・優先度・分担・スケジュール。デモの対象は**立命館大学**。各タスクは GitHub Issues に登録し、担当者を割り当てている。**Issue を閉じたら、この表の状態も「✅ 完了」に書き換える。**

## 方針

- **最大のリスクから先に潰す。** 「小さなモデルで問いと研究課題が結びつくか」と「KAKEN API の承認」の 2 つが崩れると企画が成り立たない。どちらも中間発表（11/1）までに決着させる。
- **縦に一本通してから広げる。** まず数分野・ダミーデータで「問う → 見渡す → 出会う → 深める」が端から端まで動く状態を作り、それから分野とデータを増やす。
- **KAKEN を待たない。** 承認が下りるまでは、画面と API はダミーの先生データ（JSON）で開発する。

## 優先度

| 優先度 | 意味 |
| --- | --- |
| P0 | ないとデモが成り立たない。最優先 |
| P1 | 審査の評価に効く。P0 の後に必ずやる |
| P2 | 余裕があればやる。間に合わなければ切る |

## スケジュール

```mermaid
gantt
  dateFormat YYYY-MM-DD
  axisFormat %m/%d

  section 準備
  MTG（案・分担の決定）       :milestone, 2026-10-28, 0d
  技術検証                    :a1, 2026-10-28, 4d
  中間発表の準備              :a2, 2026-10-29, 3d
  中間発表                    :milestone, 2026-11-01, 0d

  section 開発
  縦に一本通す                :b1, 2026-11-02, 5d
  一通り動く                  :milestone, 2026-11-07, 0d
  分野・データを広げる・仕上げ :b2, 2026-11-07, 5d
  機能凍結                    :milestone, 2026-11-11, 0d

  section 仕上げ
  セキュリティテスト・記録    :c1, 2026-11-09, 5d
  リハーサル・README          :c2, 2026-11-12, 2d
  提出（13:00）               :milestone, 2026-11-14, 0d
  最終発表                    :milestone, 2026-11-15, 0d
```

| 状態 | 期日 | マイルストーン | 完了の条件 |
| --- | --- | --- | --- |
| ✅ 完了 | 10/28（水） | MTG | 案・役割分担・対象大学（立命館大学）が決まっている（決定済み） |
| 未完了 | 11/1（日） | 中間発表 | 30 分野とモデルを決め、問いと研究課題が結びつくことを確かめている。スライドに背景・テーマ・開発計画・役割分担がある |
| 未完了 | 11/7（土） | 一通り動く | 数分野で 4 段階が端から端まで動き、Vercel 上で触れる |
| 未完了 | 11/11（水） | 機能凍結 | 30 分野と立命館大学のデータが入り、P0・P1 の機能がそろっている。以降はバグ修正とテストのみ |
| 未完了 | 11/14（土）13:00 | 提出 | README が完成し、リポジトリ URL を提出済み |
| 未完了 | 11/15（日） | 最終発表 | 発表用 PC でデモが動く |

## タスク一覧

### 準備（〜11/1）

| 状態 | ID | Issue | タスク | 優先度 | 担当 | 期限 | 依存 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 未完了 | T-01 | [#4](https://github.com/Haku929/TND_Hackathon_2026F_Team5/issues/4) | KAKEN API のアプリケーション ID を申請する | P0 | 河合 | 11/1 | — |
| 未完了 | T-02 | [#5](https://github.com/Haku929/TND_Hackathon_2026F_Team5/issues/5) | KAKEN データの利用規約を確かめる（researchmap は使わない・シラバスは #28 で確認） | P1 | 河合 | 11/1 | — |
| 未完了 | T-03 | [#6](https://github.com/Haku929/TND_Hackathon_2026F_Team5/issues/6) | デモで扱う 30 分野を決める（案・役割分担・対象大学は決定済み） | P0 | 高橋 | 11/1 | — |
| 未完了 | T-04 | [#7](https://github.com/Haku929/TND_Hackathon_2026F_Team5/issues/7) | モデルを比較する：Ruri v3 30m と multilingual-e5-small を Transformers.js で動かし、PC とスマートフォンで読み込み時間・計算速度を測る | P0 | 高橋 | 11/1 | — |
| 未完了 | T-05 | [#8](https://github.com/Haku929/TND_Hackathon_2026F_Team5/issues/8) | 精度を確かめる：問いの例 10 個と研究課題のサンプルで、意味の近さの順位が妥当かを見る | P0 | 上原 | 11/1 | T-09 |
| 未完了 | T-06 | [#9](https://github.com/Haku929/TND_Hackathon_2026F_Team5/issues/9) | Next.js の雛形（用意済み）を Vercel と Neon につなぐ | P0 | 大澤 | 11/1 | T-S6 |
| 未完了 | T-07 | [#10](https://github.com/Haku929/TND_Hackathon_2026F_Team5/issues/10) | 中間発表のスライドを作る | P0 | 河合 | 11/1 | — |
| 未完了 | T-08 | [#11](https://github.com/Haku929/TND_Hackathon_2026F_Team5/issues/11) | 中間発表のリハーサル | P1 | 全員 | 11/1 | T-07 |
| 未完了 | T-09 | [#12](https://github.com/Haku929/TND_Hackathon_2026F_Team5/issues/12) | 精度検証の合格ラインを決める（例：問いの例 10 個のうち何個で、妥当な分野が上位 3 件に入れば合格か）。検証の前に決める | P0 | 上原 | 11/1 | — |

### 案が決まったらすぐ（〜11/1）

| 状態 | ID | Issue | タスク | 優先度 | 担当 | 期限 | 依存 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ✅ 完了 | T-S1 | — | メンバーをリポジトリの Collaborator に招待する | P0 | 河合 | 10/28 | — |
| ✅ 完了 | T-S2 | — | ラベル 5 種類（feature / bug / docs / security / chore）を作る | P0 | 河合 | 10/28 | — |
| ✅ 完了 | T-S3 | — | Issue・PR のテンプレートと開発環境の雛形をマージする（[PR #3](https://github.com/Haku929/TND_Hackathon_2026F_Team5/pull/3)） | P0 | 河合 | 10/28 | — |
| ✅ 完了 | T-S5 | — | タスク一覧を GitHub Issues に登録する（#4〜#37） | P0 | 河合 | 10/28 | — |
| ✅ 完了 | T-S4 | [#13](https://github.com/Haku929/TND_Hackathon_2026F_Team5/issues/13) | `main` のブランチ保護 → 無料プランの非公開リポジトリでは設定できないため、保護なしで運用する（PR を経由し、CI が落ちた PR はマージしない） | P0 | 河合 | 11/1 | — |
| 未完了 | T-S6 | [#14](https://github.com/Haku929/TND_Hackathon_2026F_Team5/issues/14) | Vercel・Neon をどのアカウントに置くかを決める。Vercel の無料プラン（Hobby）は非公開リポジトリでの共同開発に対応しておらず、オーナー以外のコミットはデプロイされない。リポジトリを公開にするか、オーナーのコミットだけでデプロイするか、有料プランにするかを選ぶ。無料枠と、超えたときの費用も確かめる | P0 | 大澤 | 11/1 | — |

### 開発（11/2〜11/11）

| 状態 | ID | Issue | タスク | 優先度 | 担当 | 期限 | 依存 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 未完了 | T-10 | [#15](https://github.com/Haku929/TND_Hackathon_2026F_Team5/issues/15) | ダミーの先生データ（JSON）を作る | P0 | 上原 | 11/2 | — |
| 未完了 | T-11 | [#16](https://github.com/Haku929/TND_Hackathon_2026F_Team5/issues/16) | 埋め込みの共有設定（`shared/embedding.json`）と、ブラウザの埋め込み処理（Web Worker） | P0 | 高橋 | 11/4 | T-04 |
| 未完了 | T-12 | [#17](https://github.com/Haku929/TND_Hackathon_2026F_Team5/issues/17) | 検索 API（分野・用語・先生の取得、隣の分野の選び方） | P0 | 大澤 | 11/6 | T-06 |
| 未完了 | T-13 | [#18](https://github.com/Haku929/TND_Hackathon_2026F_Team5/issues/18) | 画面：問いの入力（読み込み中も入力できる） | P0 | 高橋 | 11/5 | T-11 |
| 未完了 | T-14 | [#19](https://github.com/Haku929/TND_Hackathon_2026F_Team5/issues/19) | 画面：結果（分野カード・先生、スマートフォンでは横スワイプ） | P0 | 高橋 | 11/7 | T-12 |
| 未完了 | T-15 | [#20](https://github.com/Haku929/TND_Hackathon_2026F_Team5/issues/20) | 画面：深める（質問文の組み立て・コピー） | P0 | 河合 | 11/7 | T-14 |
| 未完了 | T-16 | [#21](https://github.com/Haku929/TND_Hackathon_2026F_Team5/issues/21) | KAKEN から立命館大学の研究データを取得し、研究者ごとに整理する | P0 | 上原 | 11/6 | T-01, T-03 |
| 未完了 | T-17 | [#22](https://github.com/Haku929/TND_Hackathon_2026F_Team5/issues/22) | KAKEN の審査区分と 30 分野の対応表を作り、分野付けする | P0 | 上原 | 11/7 | T-16 |
| 未完了 | T-18 | [#23](https://github.com/Haku929/TND_Hackathon_2026F_Team5/issues/23) | 埋め込みを計算し、DB に投入する | P0 | 上原 | 11/9 | T-11, T-17 |
| 未完了 | T-19 | [#24](https://github.com/Haku929/TND_Hackathon_2026F_Team5/issues/24) | 分野カード 30 分野を用意する | P0 | 全員 | 11/9 | T-03 |
| 未完了 | T-20 | [#25](https://github.com/Haku929/TND_Hackathon_2026F_Team5/issues/25) | 「AI」表示と「アプリの外」表示 | P1 | 高橋 | 11/10 | T-14 |
| 未完了 | T-21 | [#26](https://github.com/Haku929/TND_Hackathon_2026F_Team5/issues/26) | 「このアプリについて」画面（AI の場所・問いを保存しないこと・出典） | P1 | 河合 | 11/10 | — |
| 未完了 | T-22 | [#27](https://github.com/Haku929/TND_Hackathon_2026F_Team5/issues/27) | サーバーでモデルを動かす保険と、切り替えの条件 | P1 | 大澤 | 11/11 | T-12 |
| 未完了 | T-23 | [#28](https://github.com/Haku929/TND_Hackathon_2026F_Team5/issues/28) | シラバス・蔵書との連携 | P2 | 未定 | 11/11 | T-02 |

### セキュリティ・仕上げ（11/9〜11/15）

| 状態 | ID | Issue | タスク | 優先度 | 担当 | 期限 | 依存 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 未完了 | T-30 | [#29](https://github.com/Haku929/TND_Hackathon_2026F_Team5/issues/29) | 入力の検証（ベクトルの長さ・型・ノルム・本文サイズ） | P0 | 大澤 | 11/9 | T-12 |
| 未完了 | T-31 | [#30](https://github.com/Haku929/TND_Hackathon_2026F_Team5/issues/30) | CSP・回数制限・環境変数の確認 | P1 | 大澤 | 11/10 | T-06 |
| 未完了 | T-32 | [#31](https://github.com/Haku929/TND_Hackathon_2026F_Team5/issues/31) | セキュリティテストを行い、README に記録する | P1 | 大澤 | 11/12 | T-30, T-31 |
| 未完了 | T-33 | [#32](https://github.com/Haku929/TND_Hackathon_2026F_Team5/issues/32) | 問いが通信に含まれないことを確かめ、デモ用に見せ方を用意する | P1 | 大澤 | 11/12 | T-13 |
| 未完了 | T-34 | [#33](https://github.com/Haku929/TND_Hackathon_2026F_Team5/issues/33) | README の仕上げ（機能の状態・セットアップ・役割分担） | P0 | 河合 | 11/13 | — |
| 未完了 | T-35 | [#34](https://github.com/Haku929/TND_Hackathon_2026F_Team5/issues/34) | 最終発表のスライドとデモの台本 | P0 | 河合 | 11/13 | — |
| 未完了 | T-36 | [#35](https://github.com/Haku929/TND_Hackathon_2026F_Team5/issues/35) | リハーサル（発表用 PC・スマートフォンの両方でデモを通す） | P0 | 全員 | 11/13 | T-35 |
| 未完了 | T-37 | [#36](https://github.com/Haku929/TND_Hackathon_2026F_Team5/issues/36) | 提出（Google Form にリポジトリ URL） | P0 | 河合 | 11/14 13:00 | T-34 |
| 未完了 | T-38 | [#37](https://github.com/Haku929/TND_Hackathon_2026F_Team5/issues/37) | 発表用 PC の接続確認と、モデルの事前読み込み | P0 | 発表者 | 11/15 | T-36 |

## 分担

| 担当 | 主なタスク |
| --- | --- |
| 河合 | 進捗管理、KAKEN 申請、スライド・README・提出、深める画面 |
| 上原さん | データ準備（KAKEN の取得・分野付け・埋め込み・投入）、精度の検証 |
| 高橋さん | 画面、ブラウザの埋め込み処理、モデルの比較 |
| 大澤さん | 環境構築・デプロイ、検索 API、セキュリティ対策とテスト |
| 全員 | 分野カード 30 分野、リハーサル |

上原さんの担当（T-16〜T-18）は KAKEN の承認次第で後ろにずれやすく、11/7〜11/9 に集中する。承認が遅れたら、ダミーデータで画面・API を先に完成させ、データ投入を手伝える人を回す。

## 未決事項

- [ ] デモで扱う 30 分野
- [ ] 最終発表の発表者
