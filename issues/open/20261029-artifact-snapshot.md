# 再現用 target snapshot の保存範囲と可搬性を確定する

Status: open
Model: GPT-6 Astra Pro
Created: 2026-10-29
Updated: 2026-10-29
Branch: research/20261029-artifact-snapshot

## 概要

失敗入力と共に保存する target artifact の範囲を調査し、どの条件で元の project に依存せず再実行できるかを確定する。依存物を含む snapshot、明示的な外部前提、再現保証のない場合を区別して実装 Issue に落とす。

## 背景

- [README](https://github.com/f4ah6o/moon-fuzz/blob/d9980543109290da8869789f860ac5a9d1c9af95/README.md#L94-L97) は target snapshot を未実装とし、同じ target と環境の保持を replay の前提にしている。
- [現行 metadata](https://github.com/f4ah6o/moon-fuzz/blob/d9980543109290da8869789f860ac5a9d1c9af95/poc/runner.mjs#L59-L75) は module の絶対パスを保存する。`input` は生バイトで保存済みである。
- [worker の読み込み](https://github.com/f4ah6o/moon-fuzz/blob/d9980543109290da8869789f860ac5a9d1c9af95/poc/worker.cjs#L15-L21) は `require(message.module)` であり、入力 module が単一ファイルで完結する制約はない。

## 問題

入口の JS だけをコピーしても、相対 `require`、package、追加データ、native addon、FFI、環境変数に依存する対象では再実行条件が変わり得る。入口ファイルのハッシュと、依存物を含む再現可能な snapshot は異なる契約である。

## 目標

初期版で保存する範囲、外部前提の記録方法、未対応を検出したときの挙動、schema 1 の finding との互換性を確定する。保存・移動・再実行の小さな実験を根拠に、実装可能な snapshot Issue を作成する。

## 対象外

- snapshot の製品実装、任意の Node project の完全な自動封じ込め。
- runtime／OS 全体の複製、container 配布、外部サービスの複製。
- 失敗署名の設計、縮小アルゴリズム、保存先のクラウド化。

## 提案する方針

1. pinned MoonBit の単一生成 JS、相対 module を読む CommonJS、package 依存、実行時データを読む target を比較し、実際に読み込むファイルと外部条件を列挙する。
2. 単一 artifact 限定、利用者が宣言する manifest、依存閉包の収集を候補として比較する。静的解析だけで dynamic `require` を完全に検出できるとは仮定しない。
3. snapshot manifest に含める相対パス、ファイル hash、entry point、runtime／toolchain 情報、外部前提、schema version を提案する。秘密値を含む全環境変数の収集は行わず、必要な入力だけを宣言して扱う。
4. 保存中のファイル変更、symlink、保存範囲外の参照、欠損、容量上限、途中中断について、拒否・部分保存・再現不能のどれとして表すかを確定する。入力と元の finding は snapshot 失敗時も保持する。
5. 元 project を使わない別ディレクトリで replay し、同じ入力 bytes と選定した観測結果を取得する。元 project への意図しない参照があれば、制約として残す。
6. [target fingerprint](20261029-target-fingerprint.md) の入口ファイル識別と整合させる。自動 build の artifact 情報を利用する場合は [build discovery 調査](20261029-target-build-discovery.md) の結論を取り込み、保証対象を限定して実装 Issue を作成する。

## 受け入れ条件

- [ ] 初期対応 target と非対応 target を具体例で区別し、依存物の保存責任が明確になっている。
- [ ] snapshot manifest、外部前提、完全性検証、保存失敗時の状態を定義している。
- [ ] 別ディレクトリへの移動後に replay できる例と、再現を保証できない例を実験で示している。
- [ ] 動的依存、symlink、artifact 変更、容量上限、欠損の扱いを記録している。
- [ ] snapshot が失敗しても入力と既存 finding を失わない後続受け入れ条件を定義している。
- [ ] schema 1 finding は snapshot 不明として扱い、架空の snapshot identity を補完しない。
- [ ] 採用方式、不採用理由、未対応範囲、後続実装 Issue を記録している。

## テスト計画

1. 上記 target ごとに調査用 snapshot を作り、元 project を参照しない作業ディレクトリで実行する。再現条件と実行コマンドを記録する。
2. ファイル欠損・hash 不一致・relative dependency・外部参照・保存中断を安全な一時ディレクトリで検証する。
3. 既存 `npm test` と `npm run test:moonbit` による生バイト保存・手動 replay の契約と照合する。今後追加する試験を既存の成功結果として扱わない。

## リスク

依存閉包を過大に保存すると容量や持ち出し範囲が増え、過小に保存すると再現性を誤表示する。snapshot が揃っていても OS や外部サービスまで同一とは限らない。保存範囲と外部前提を分離して記録する。

## 変更履歴

`CHANGES.md` impact: no

本 Issue は保存契約の調査に限定する。snapshot の保存・replay を提供する後続実装では `yes` とする。

## 注記

### Wayfinder

- Role: ticket
- Parent map: [JS ファジングの未実装機能と実装順序を整理する](20261029-js-fuzzing-roadmap.md)
- Type: research
- Mode: AFK
- Depends on: none

fingerprint の実装や自動 build の実装を待たず、現行の `--module` 入力に対して調査できる。後続の統合で結論が変わる場合は保証範囲を更新する。
