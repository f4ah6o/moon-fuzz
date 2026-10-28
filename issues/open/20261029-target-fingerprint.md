# finding に target artifact と実行環境の fingerprint を記録する

Status: open
Model: GPT-6 Astra Pro
Created: 2026-10-29
Updated: 2026-10-29
Branch: feat/20261029-target-fingerprint

## 概要

失敗入力の metadata に、実行前に観測した入口 artifact の内容 hash と実行環境を記録する。同じパスの内容変更と情報不足を判別できるようにし、後続の snapshot・再現確認で利用する。

## 背景

- [README](https://github.com/f4ah6o/moon-fuzz/blob/d9980543109290da8869789f860ac5a9d1c9af95/README.md#L94-L97) は build fingerprint と target snapshot を未実装としている。
- [saveFinding](https://github.com/f4ah6o/moon-fuzz/blob/d9980543109290da8869789f860ac5a9d1c9af95/poc/runner.mjs#L59-L75) は入力 hash、module の絶対パス、Node version、timeout、結果を schema 1 metadata に保存する。対象 module の内容は識別していない。
- [CLI](https://github.com/f4ah6o/moon-fuzz/blob/d9980543109290da8869789f860ac5a9d1c9af95/poc/cli.mjs#L14-L23) はビルド済み module を受け取り、実行後に finding を保存する。

## 問題

同じ module path を再ビルドしても metadata の path は変わらない。保存後の実行結果が変化した場合に、入口 artifact の差、runtime の差、観測情報の欠落を区別する材料が不足する。

## 目標

新規 finding に version 付き fingerprint を保存し、現行 metadata と共存できるようにする。これは入口ファイルの観測記録であり、依存閉包やロードされた全コードの同一性を保証するものではないと明示する。

## 対象外

- target snapshot、依存閉包の収集、再現の自動判定、失敗署名。
- 汎用 MoonBit 自動ビルド、環境変数全体の収集。
- build provenance を持たない JS module に MoonBit version を推測して付与すること。

## 提案する方針

1. 着手時に統合済みの supervisor を確認する。P0 が実行経路なら `poc/runner.mjs` に実行 context の収集と fingerprint の生成を分けて追加し、`poc/cli.mjs` から実行開始前の観測を `saveFinding` に渡す。Rust supervisor が統合済みなら同じ責務を Rust 側に一度だけ実装する。実行後だけの読み取りを実行時 artifact の識別としない。
2. fingerprint version、入口ファイル bytes の SHA-256、観測時点、worker が使用する runtime の version、OS／architecture、bridge version、実行設定を記録する。元の入力 hash と target hash は別項目にする。
3. 実際に取得できた build provenance がある場合にのみ compiler／core version、build target／profile、関連 manifest 情報を保存する。既存 `--module` から不明な項目は `unknown` または未取得の状態とし、値を補完しない。
4. 実行前後の入口 artifact を比較して、変更・欠損が観測された場合は fingerprint の状態を明示する。前後一致も実行中の一時的変更や依存 module の不変性までは証明しないと文書化する。
5. metadata schema の変更を version で識別し、schema 1 は fingerprint 不明として読めるようにする。既存の結果、入力 hash、期限、ログを保持し、optional 情報の取得失敗で保存済み bytes を失わない構造にする。
6. [snapshot 調査](20261029-artifact-snapshot.md) が定める manifest と、後続 Rust supervisor の finding 保存へ同じ意味の項目を引き継げるよう、schema と例を README に記載する。

## 受け入れ条件

- [ ] 同じ bytes の入口 artifact は同じ content hash になり、同じパスの bytes を変えると hash が変わる。
- [ ] target hash と input hash を別項目として保存し、空入力や `00 ff` を含む入力を従来どおり保存する。
- [ ] 実行前に観測した情報、実行後の変更検出、取得不能を区別できる。
- [ ] runtime／build 情報の取得源と未取得の扱いが明確で、推測した toolchain version が保存されない。
- [ ] schema 1 の fixture を fingerprint 不明として扱え、新しい metadata でも既存の必須情報が保持される。
- [ ] property failure、throw、crash、timeout で fingerprint の有無にかかわらず元入力と診断を保持する。
- [ ] 入口 hash の一致を完全な再現保証として表示せず、snapshot と依存物の扱いを説明している。

## テスト計画

1. `npm test` を実行し、既存の結果分類・保存・手動 replay を維持する。
2. 同じパスの内容置換、別パスの同一 bytes、実行中の変更／削除、未知の build 情報、schema 1／新 schema の読み取りを一時ディレクトリで検証するテストを追加する。
3. `npm run test:moonbit` で実際の生成 JS を使い、入力 hash と target hash、取得した toolchain 情報の関係を確認する。新規テストは実装時に追加・実行する。
4. Rust 側へ実装する場合は `cargo test --workspace` と同じ通常 target fixture・生成済み MoonBit target を使う統合試験で新しい metadata を検証する。既存の npm テストだけで Rust の変更を検証済みとしない。

## リスク

実行とファイル読み取りの間には変更競合があり、入口 hash だけでは依存 module も識別できない。観測範囲を狭く正確に記録し、強い保証は snapshot 契約に委ねる。schema 更新では既存 finding を書き換えない。

## 変更履歴

`CHANGES.md` impact: yes

項目案：

- finding に入口 target artifact と実行環境の fingerprint を追加し、取得範囲と metadata schema の互換性を明示した。

## 注記

- 種別: implementation
- 親計画: [JS ファジングの未実装機能と実装順序を整理する](20261029-js-fuzzing-roadmap.md)
- Depends on: none

現行 P0 へ独立して追加できる。Rust supervisor が先に統合された場合は実装先をそちらへ合わせ、同じ機能を二重に実装しない。P0 に先に導入した場合は Rust 移行時に保存 schema と共通 fixture を引き継ぐ。

調査基準時点に `CHANGES.md` はないため、実装を利用者へ提供する変更で新設する。Issue 文書の追加だけでは機能追加の履歴を記載しない。
