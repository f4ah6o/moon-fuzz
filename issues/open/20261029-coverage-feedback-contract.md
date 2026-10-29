# coverage feedback の状態と比較境界を明示する

Status: open
Model: GPT-6
Created: 2026-10-29
Updated: 2026-10-29
Branch: feat/20261029-coverage-feedback-contract

## 背景と目的

[帰属研究](20261029-coverage-attribution.md) の対照では、空の正常 dump と取得失敗は異なり、入口ファイル hash が同じでも依存 module の変更で feature が変わった。現行の実験的 adapter では完全な build identity も明示的な feedback 状態もない。入力と finding の保存を維持しながら、比較可能な feedback の前提を表現する。

## 実装方針

1. coverage 状態を `available`、`unavailable`、`invalid` 等の version 付き契約として実行結果分類と独立して定義する。正常に検証した空集合と失敗を区別する。timeout、crash、取得エラーを区別し、既存 finding と bytes を失わない。
2. feature 比較には対象 package、collector/schema version、および依存閉包を含む検証済み build identity の一致を必須とする。入口 SHA256 は入口識別子としてのみ保持し、完全な build identity と扱わない。[artifact snapshot](20261029-artifact-snapshot.md) の契約が不足する場合は identity 不明として比較を拒否する。
3. 初期化完了と同期的な入力区間が要求されることを文書化する。遅延初期化や非同期処理の分離は現 adapter から推測しない。前提を満たせない、または確認不能な guidance 要求は明示的に失敗させる。
4. 現行の `guidance=none` と P0 の結果・保存・replay を維持する。既存 metadata の読み取りと schema 移行方針を明記する。

## 受け入れ条件

- [ ] 正常な空集合、collector 初期化失敗、収集失敗、crash、timeout、layout/reset 不一致が区別され、入力・診断は保持される。
- [ ] 入口不変で依存物だけ変更した場合、同一 build として feature を比較しない。identity 不明と不一致は明示的に拒否する。
- [ ] 同一検証済み build と設定では反復可能な fixture の A/B/A を比較できる。異なる version/package は比較しない。
- [ ] 既存 P0、実 MoonBit、対応環境の回帰を実行し、未実行の組合せを明記する。

## 対象外

coverage-guided campaign、汎用 build snapshot の完成、遅延初期化の自動分離、未検証環境のサポート宣言。研究 Issue の残課題は open のまま追跡する。

## 変更履歴

`CHANGES.md` impact: yes（実装時に契約と互換性を記録）

### Wayfinder

- Role: ticket
- Parent map: [JS ファジングの未実装機能と実装順序を整理する](20261029-js-fuzzing-roadmap.md)
- Type: implementation
- Depends on: artifact snapshot の検証可能な build identity（identity 不明で fail closed する状態表現は先行可能）
