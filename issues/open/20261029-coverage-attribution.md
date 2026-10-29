# MoonBit JS の入力別 coverage 帰属とリセットを検証する

Status: open
Model: GPT-6
Created: 2026-10-29
Updated: 2026-10-29
Branch: research/20261029-coverage-attribution

## 概要

生成済み MoonBit JS の実行から、対象入力だけに帰属する coverage feedback を取得できるか検証する。取得単位、初期化の除外、リセット、未対応時の挙動を確定してから、coverage collector と探索ループの実装 Issue を作成する。

## 背景

- [調査基準の README](https://github.com/f4ah6o/moon-fuzz/blob/d9980543109290da8869789f860ac5a9d1c9af95/README.md#L83-L90) は `A → B → A`、driver／初期化 probe の除外、検証不能な guidance 要求の明示的失敗を最初の milestone としている。
- [worker](https://github.com/f4ah6o/moon-fuzz/blob/d9980543109290da8869789f860ac5a9d1c9af95/poc/worker.cjs#L13-L33) は module の読み込み後に入力を一度だけ実行する。現状の worker は入力ごとに作り直され、coverage の収集はない。
- [CI](https://github.com/f4ah6o/moon-fuzz/blob/d9980543109290da8869789f860ac5a9d1c9af95/.github/workflows/ci.yml) は Ubuntu／macOS、Node 20／22、MoonBit `0.10.17+d971670cd` を使用する。

## 問題

観測できる単位が function、block、branch、edge のどれか、module 初期化と入力実行を分離できるか、feature ID がどの範囲で安定するかが未検証である。終了時だけ得られる集計値や driver の実行回数を入力の新規性として扱うと、コーパス採用判定が成立しない。

## 目標

実際の MoonBit 出力を使った再実行可能な検証、対応環境表、feedback 契約、採用方式と不採用理由を残す。成立しない場合も、未対応条件と次に必要な調査を明示して結論とする。

## 対象外

- coverage collector の製品実装、coverage-guided campaign、最適化や性能目標の確定。
- Wasm-GC、差分ファジング、永続 worker を製品の既定動作にする変更。
- 元入力の保存方式を coverage データで置き換えること。

## 提案する方針

1. V8／Node の入力区間を区切る計測 API と生成 JS への明示的な計装を候補として、対象バージョンの公式文書と小さな実験で比較する。特定 API が必要な粒度を提供すると事前に断定しない。
2. pinned toolchain で現行 MoonBit サンプルをビルドし、異なる分岐を通る A と B、初期化専用分岐、driver 専用処理を持つ検証用 target を準備する。生成物と計測設定を固定して記録する。
3. 同一の計測インスタンスで `A → reset → B → reset → A` を行い、二つの A の feature 集合が等しく B が区別できることを確認する。各回を新規 process にした対照実験も行い、process の作り直しだけを reset の証明にしない。
4. module 初期化終了と fuzz 呼び出しの開始・終了を計測境界とし、target の許可リストで driver／runtime の probe を除外する。source map や生成物の範囲情報が必要なら、その取得可能性も検証する。
5. `available`、`unavailable`、`invalid` といった状態を結果分類から独立させる案を比較する。crash／timeout で feedback がない場合でも、親が保持する入力と finding が保存できる契約にする。
6. feature ID の build／collector version への紐付けと、古い corpus feedback の無効化条件を定義する。対応しない環境で guidance が要求された場合のエラーと、利用者が明示して選ぶ非 guidance 動作を区別する。
7. 必要な契約の成立を確認できた場合に collector の実装 Issue を作成する。成立しない場合は実験結果、未対応条件、採用できない理由、次の具体的な問いを記録する。campaign の Issue は collector 契約、[コーパス保存](20261029-corpus-store.md)、[決定的 mutator](20261029-byte-mutators.md) を前提に、採用規則・予算・停止理由を確定してから作成する。

## 受け入れ条件

- [ ] JS fixture と pinned compiler の MoonBit 出力の両方で、入力別帰属と `A → B → A` の実験結果を記録している。
- [ ] 初期化だけ／driver だけを変えた対照実験を行い、不要な feature の除外が成立するか、不成立ならその原因と制約を記録している。
- [ ] 観測単位と feature ID の安定範囲を明示し、block coverage を edge coverage と記述していない。
- [ ] crash、timeout、collector 初期化失敗、対象 build 不一致を区別し、空集合を「取得成功」の代用にしていない。
- [ ] guidance の前提を検証できない場合の明示的失敗と、元入力・診断保存の独立性を実験で確認している。不成立の項目があれば、後続実装に必要な条件として記録している。
- [ ] 対応環境、再現コマンド、採用しなかった方式の理由を記録し、成立時は実装 Issue、不成立時は未対応条件と次の具体的な問いへ引き継いでいる。

## テスト計画

1. 既存の `npm test` と `npm run test:moonbit` を互換性確認として実行する。これらだけでは coverage の成立を証明しない。
2. 調査用ハーネスで同一計測インスタンスと新規 process の A/B/A、初期化、driver、空入力、例外、異常終了、timeout を検証する。実際に追加したコマンドと取得データを結果に残す。
3. Ubuntu／macOS × Node 20／22 の結果を比較し、未実行の組合せは未実行と記録する。異なる build で取得した feature の誤混入も確認する。

## リスク

最適化や compiler／runtime の更新により観測単位と probe 配置が変わる可能性がある。計測が遅延や例外挙動を変えた場合は差を記録する。計測 API の成功だけを guidance 成立の判定にしない。

## 変更履歴

`CHANGES.md` impact: no

本 Issue は検証と契約の確定に限定する。collector と campaign の実装時に利用者向け変更を記録する。

## 2026-10-29 の追加観測

基準: main `5272e00ee48769939556f896e0a9f1782a2d23ed`、Linux x86-64、Node v24.22.1。`node --test test/coverage-research.test.mjs` は 3/3 PASS、基準の `npm test` は 14/14 PASS。追加テストの counter dump は MoonBit の出力形式を模した **手書き JS fixture** であり、コンパイラの計装精度を示すものではない。

| 対照 | 実際の観測 |
| --- | --- |
| 同一 collector、A→B→A | A の feature は同じ、B は別、続く空 dump は空。対象外 driver と類似名 package は除外された。 |
| 初期化と driver のカウンター値を変更 | 対象の A/B 集合は不変。初期化は collector 作成前に完了させた。 |
| 初回呼び出しに初期化を遅延 | 最初の A に初期化 feature が混入し、2回目の A と異なる。dump/reset だけでは入力処理と遅延初期化を分離できない。 |
| 入口ファイル不変、require 先だけ変更 | 別プロセスの実行で feature が変化したが `build_sha256` は同じ。入口 hash は依存閉包の識別子ではない。 |
| 収集の失敗 | 既存 `test/coverage.test.mjs` が取得失敗時の finding 保存、初期化失敗、異常終了、タイムアウトを確認。crash/timeout は coverage 不在で、空集合の成功ではない。 |

追加された実 MoonBit driver 変更のテストを含む `npm run test:moonbit` はローカルでは **未実行**（`moon` が存在せず起動時 ENOENT）。Ubuntu/macOS × Node 20/22 の追加テストも現時点では未確認。CI 結果を見ずに対応環境とみなさない。新しい実 MoonBit variant は driver の初期化値と条件を共に変え、target と A/B の意味を保つ。成功時はその固定例での観測に限る。

### 暫定契約と制約

- feature は `counter_id` と配列 index の組で、正確な package を選択する。これは MoonBit が出力する probe の hit であり、edge や特定の branch 網羅率とは断定しない。
- 呼び出し前に対象の初期化が完了し、入力以外の並行／遅延処理が計測区間で対象 counter を更新しないことが必要。collector はこの前提を検証できない。`coverage_end` は同期して dump と reset を行い、同じレイアウトと直後のゼロを確認できる必要がある。
- 空 feature は正常な dump と reset が検証できた時のみ取得成功。取得不可、invalid、対象実行 crash／timeout は空集合と区別し、finding と元 bytes の保存は feedback の成否から独立させる。現行 P0 にこれらの明示的状態 enum はない。
- 現行 `build_sha256` は入口の bytes だけで、完全な build identity ではない。feature の永続比較には、依存閉包を含む検証可能な build identity、collector/schema version と package 選択の一致を要する。これらが不明なら比較や guidance に使わない。具体的な snapshot は [artifact snapshot](20261029-artifact-snapshot.md) と連携する。
- 方式比較、実 MoonBit での初期化条件の変更、複数 runtime と build にわたる ID の安定性は未検証。後続の [feedback 状態と識別契約](20261029-coverage-feedback-contract.md) は成立した安全条件を実装する課題であり、coverage-guided campaign の完成を意味しない。

## 注記

2026-10-29: P0 の実験的 `moon-probe-dump` adapter と分離した driver／target の A/B/A テストを追加。初期化 counter の破棄、package 単位の選択、取得失敗時の finding 保存を検証する。異なる初期化／driver の対照、計測方式の比較、対応環境表、collector の正式な契約は未完了のため、この調査は open のままとする。

### Wayfinder

- Role: ticket
- Parent map: [JS ファジングの未実装機能と実装順序を整理する](20261029-js-fuzzing-roadmap.md)
- Type: research
- Mode: AFK
- Depends on: none

調査結果は本 Issue の結論、根拠、確認結果、後続への影響として記録する。記載した実験は今後の計画であり、作成時点で coverage の成立を確認したものではない。
