# P0 の実行契約を維持する Rust supervisor を実装する

Status: open
Model: GPT-6 Astra Pro
Created: 2026-10-29
Updated: 2026-10-29
Branch: feat/20261029-rust-supervisor

## 概要

Cargo workspace と Rust CLI を導入し、1 入力を新規 Node.js worker で実行する supervisor を実装する。
P0 の結果分類、起動・実行期限、診断出力、元入力の保存と CLI 終了コードを維持し、後続のファジング機能が利用できる実行境界を作る。

## 背景

- [README の次期計画](https://github.com/f4ah6o/moon-fuzz/blob/d9980543109290da8869789f860ac5a9d1c9af95/README.md#L83-L97) は Rust supervisor を未実装機能として挙げている。
- [現在の supervisor](https://github.com/f4ah6o/moon-fuzz/blob/d9980543109290da8869789f860ac5a9d1c9af95/poc/runner.mjs#L10-L56) は Node の `fork` と IPC に依存し、起動と実行を別の期限で監視する。
- [worker の同期 API](https://github.com/f4ah6o/moon-fuzz/blob/d9980543109290da8869789f860ac5a9d1c9af95/poc/worker.cjs#L13-L35) は `fuzz_one(Uint8Array)` の整数結果を解釈する。この暫定 API を移行の比較基準とする。
- [保存処理](https://github.com/f4ah6o/moon-fuzz/blob/d9980543109290da8869789f860ac5a9d1c9af95/poc/runner.mjs#L59-L75) は入力 bytes、結果、実行条件、ログを finding ごとに保存する。

## 問題

Rust の CLI・実行ライブラリ・worker との通信契約がなく、後続機能が Node 固有の親プロセス実装に結合する。
現在の Node IPC を Rust 側でそのまま利用できると仮定すると、制御メッセージと target 出力の分離や、異常終了時の分類を失う可能性がある。

## 目標

Rust CLI から既存の JS fixture と生成済み MoonBit JS target を単発実行でき、P0 と同じ観測結果を得られること。
worker が異常終了しても親側の元入力から finding を保存でき、制御プロトコルの異常を target の成功と混同しないこと。

## 対象外

- coverage guidance、corpus 管理、mutation、campaign の予算・停止・再開。
- process-tree termination、資源制限、security sandbox、target の自動 build。
- SDK の最終 API、Wasm-GC、differential fuzzing、structured generators。
- failure signature、再現性の自動判定、shrinking、build fingerprint。これらは別 Issue または後続作業とする。

## 提案する方針

1. ルートに `Cargo.toml` を追加し、実行処理をライブラリ、引数・JSON 出力を CLI として分離する。配置案は `crates/moon-fuzz/` と `crates/moon-fuzz-cli/` とし、Node worker は独立した実行ファイルとして配置する。
2. `run --module --input --timeout --startup-timeout --out` 相当の単発実行を導入する。入力と期限を開始前に検証し、P0 と同じ既定値・有効範囲・終了コードを維持する。
3. worker の stdout/stderr と独立した制御チャンネルを定義する。OS の pipe または local socket 等を比較し、対応環境で動作を確認してから採用する。利用する crate や FD 配置は確認前に固定しない。
4. バージョン付きメッセージに request ID を持たせ、handshake、run、started、result、infrastructure error を区別する。入力 bytes の転送形式・メッセージ境界・許容長を文書化し、truncated frame、不正形式、未対応 version、ID 不一致、重複・順序違反を成功扱いしない。
5. 起動、実行、終了待ちの状態を親側で管理する。handshake と module load は起動期限に含め、正しい `started` を受信した時点で実行期限へ切り替える。結果受信後も終了・ログ排出を有限時間だけ待ち、終了しない直接 worker を停止・回収する。
6. `Pass`、`Reject`、`PropertyFailure`、`UncaughtError`、`Crash`、`Timeout`、`InfrastructureError` を維持する。`Pass`／`Reject` の報告後に非ゼロ終了または signal 終了した場合は `Crash` とする。起動失敗や不正 protocol を target の finding と混同しない。
7. stdout/stderr を並行して読み、各 64 KiB の上限と `logsTruncated` を維持する。制御メッセージに似た target 出力、大量出力、出力後の異常終了でも制御状態を破損させない。
8. 親は転送前の入力 bytes を保持し、worker の結果や将来の coverage の取得可否と独立して保存する。対象となる finding は P0 と同じ 4 分類とし、`input`、`metadata.json`、`stdout.log`、`stderr.log` を一時ディレクトリから確定する。保存失敗を成功と報告しない。
9. metadata の入力 hash、target、Node version、期限、結果の既存フィールドを引き継ぐ。変更が必要な場合は schema の互換性を明記し、P0 の保存入力を Rust CLI へ渡して replay できるようにする。
10. 移行中は `poc/` を比較基準として残し、README に Cargo の導入・単発実行手順を追加する。既存の JS／MoonBit acceptance を維持したうえで Rust の検証を CI に追加する。

## 受け入れ条件

- [ ] Cargo workspace を build でき、Rust CLI が既存 fixture と生成済み MoonBit JS target を実行できる。
- [ ] P0 の 7 結果分類と終了コード 0／1／2 を維持し、起動期限と実行期限を区別できる。
- [ ] 正常結果の報告後に異常終了した worker を成功扱いせず、期限後の直接 worker を回収する。
- [ ] 制御 protocol の version、request ID、状態遷移、frame 境界が文書化され、不正・欠落メッセージを検出できる。
- [ ] target の出力は制御と分離され、stdout/stderr の各上限・切り詰め表示・終了前の排出が検証される。
- [ ] property failure、例外、crash、timeout の全てで元入力が byte-for-byte 保存され、保存失敗が明示される。
- [ ] 保存入力の再実行と既存 metadata の読み取り上の互換性が確認され、coverage がなくても保存できる。
- [ ] 新旧 supervisor の比較、既存 JS／MoonBit acceptance、Rust のテストが CI で実行される。

## テスト計画

以下は実装後に実行する計画であり、この Issue 作成時点の実行結果ではない。

1. Cargo workspace 導入後に `cargo test --workspace` を実行し、引数・期限・protocol parser・状態遷移・保存失敗を検証する。
2. `npm test` と `npm run test:moonbit` を維持し、Rust 側から同じ通常 target fixture と生成済み target を呼ぶ統合テストを追加する。
3. 正常、reject、property failure、例外、起動 hang、実行 hang、不正 export／返値、異常終了を新旧で比較する。旧 Node IPC を直接呼ぶ `fixtures/target.cjs` の case 11 は共有対象から外し、新 protocol に対応した専用 worker fixture で「有効な Pass の送信後に exit 17 → Crash」を検証する。旧 IPC 専用 fixture の無変更互換性を新 protocol の要件にせず、P0 の既存試験は維持する。PID や所要時間等の変動値を同一性の条件にしない。
4. 専用 worker fixture で不正 version、異なる ID、分割 frame、途中 EOF、result 重複、started 前の result、終了しない worker を検証する。
5. 大量 stdout/stderr と制御に似た文字列を出力し、出力上限と protocol の独立性を確認する。
6. `00` と `ff` を含む入力を各 finding で保存・replay し、元入力、hash、metadata、ログを確認する。書き込み拒否等で保存失敗が表面化することも確認する。
7. 現行 CI の Ubuntu／macOS と Node 20／22 で実行し、Rust の対応バージョンと依存関係を明記する。

## リスク

- 制御チャンネルと強制終了の挙動は OS に依存する。導入時の対応範囲を明記し、未対応環境を正常扱いしない。
- result、終了、期限切れの競合は分類を変え得る。優先順位を状態遷移として固定し、競合を再現する fixture で確認する。
- Node worker の配布先・検出方法と Rust CLI の配布形態が一致しないと、開発環境だけで動く構成になる。初期リリースの実行条件を README に記載する。
- 直接 worker の停止だけでは子孫プロセスを回収できない。後続機能が完成するまでは、信頼できる target と子プロセスを起動しない制約を維持する。
- 移行中は P0 を残し、Rust の結果差異を観測できるようにする。既存 artifact を破壊的に変換しない。

## 変更履歴

`CHANGES.md` impact: yes

項目案：

- P0 の単発実行契約を維持する Rust CLI と supervisor を追加し、JS／MoonBit JS target の結果分類・期限管理・診断と失敗入力の保存を利用できるようにした。

## 注記

- 種別: implementation
- 親計画: [JS ファジングの未実装機能と実装順序を整理する](20261029-js-fuzzing-roadmap.md)
- Depends on: none
- 調査基準: `d9980543109290da8869789f860ac5a9d1c9af95`。この Issue は実装方針を記録し、機能の実装完了を示さない。
