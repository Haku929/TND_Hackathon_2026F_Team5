# 出典・ライセンス（NOTICE）

このリポジトリのコードは [MIT ライセンス](LICENSE) です。ただし、次の外部のデータ・モデル・ライブラリは、それぞれの条件に従います。本アプリは大学の公式サービスではない（非公式の作品）ことを、画面にも明記しています。

## データ

| 項目 | 出典・条件 |
| --- | --- |
| 先生・研究テーマ | [KAKEN（科学研究費助成事業データベース）](https://kaken.nii.ac.jp/)、国立情報学研究所。[KAKEN 利用規程](https://support.nii.ac.jp/ja/kaken/about/terms)に従い、出典と加工した旨（必要項目の選択・文章の連結・分野付け・埋め込みの計算）を画面に明記して利用する。取得は、利用者の操作のたびには行わず、事前に行っている。API で取得できることは利用許諾の保証ではなく、個別の著作権表示・利用条件の照合は未完了（[data/README.md](data/README.md)） |
| 分野カード・用語の説明・よくある誤解 | 本チームが作成した文章 |

## モデル・ライブラリ

| 項目 | ライセンス |
| --- | --- |
| 埋め込みモデル [multilingual-e5-small](https://huggingface.co/intfloat/multilingual-e5-small)（元モデル、intfloat）と、ONNX 版 [Xenova/multilingual-e5-small](https://huggingface.co/Xenova/multilingual-e5-small) | 元モデルは MIT。ONNX 版は、元モデルからの変換版（ライセンス欄は未記載） |
| [Transformers.js](https://github.com/huggingface/transformers.js)（`@huggingface/transformers`） | Apache-2.0 |
| [ONNX Runtime Web](https://github.com/microsoft/onnxruntime) | MIT |
| [Next.js](https://github.com/vercel/next.js)、[React](https://github.com/facebook/react) | MIT |
| [Geist](https://vercel.com/font)（欧文フォント。`next/font` で配信） | SIL Open Font License 1.1 |
| そのほかの npm パッケージ | `package.json` / `package-lock.json` を参照（開発用を含む） |

## サービス

Vercel（ホスティング）、Neon（データベース）、Hugging Face と jsDelivr（モデルと実行環境の配信元）を利用している。

## 引用した調査

Gallup-Purdue Index 2014（米国の大学卒業生 約 3 万人）。相関であり、因果関係を示すものではない。米国の調査であり、日本の学生に同じ数字が当てはまるとは限らない。
