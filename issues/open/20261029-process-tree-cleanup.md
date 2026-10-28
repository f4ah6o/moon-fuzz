# worker の子孫プロセスを停止・回収する

Status: open
Model: GPT-6 Astra Pro
Created: 2026-10-29
Updated: 2026-10-29
Branch: feat/20261029-process-tree-cleanup

## 概要

Rust supervisor の各実行に属する worker と子孫プロセスを、timeout・異常終了・利用者中断・正常終了後に停止し、残存プロセスや開いた pipe による停止待ちを防ぐ。初期対象は現行 CI と同じ Linux／macOS とする。

## 背景

- [README](https://github.com/f4ah6o/moon-fuzz/blob/d9980543109290da8869789f860ac5a9d1c9af95/README.md#L40-L44) は直接 worker だけを終了し、target が子プロセスを起動しないことを現行制約にしている。
- [現行 deadline](https://github.com/f4ah6o/moon-fuzz/blob/d9980543109290da8869789f860ac5a9d1c9af95/poc/runner.mjs#L29-L54) は `child.kill('SIGKILL')` を呼ぶ。子孫の停止・回収は行わない。
- [Rust supervisor](20261029-rust-supervisor.md) は単発実行と P0 互換性を導入する別 Issue である。

## 問題

子孫が残ると、実行期限後も計算や出力を続けたり、継承した stdout／stderr を閉じずに親の終了処理を妨げたりする。直接 worker の終了と、その実行に属する process 全体の終了を分けて扱う必要がある。

## 目標

supervisor が所有する実行単位を識別し、対応範囲内の子孫を停止する。終了処理に有限の期限を設け、入力・finding を保存してから実行を完了できるようにする。

## 対象外

- CPU／メモリ制限、security sandbox、Windows 対応。
- 実行単位から意図的に離脱する process や、外部サービスを含む完全な封じ込め。
- P0 Node supervisor と Rust supervisor への同時実装、並列・分散 campaign。

## 提案する方針

1. Rust の process 起動・終了を小さな OS adapter に分ける。Linux／macOS の公式仕様を確認し、専用 process group 等による実行単位の作成、終了通知、待機を実装する。採用した仕組みと制約を記録する。
2. 実行開始時に所有する単位を確定し、起動失敗、実行 timeout、worker 異常終了、正常結果後の cleanup、supervisor の SIGINT／SIGTERM を一つの終了経路へ集約する。
3. 期限が必要な場合は終了要求と強制停止に上限を設け、直接 worker を回収する。子孫が継承したログ pipe の close だけを待ち続けないよう、結果確定・cleanup・ログ収集の完了条件を分ける。
4. process identity と所有期間を管理し、既に終了した PID の再利用や、supervisor 自身・無関係な process への signal を避ける。timeout 発生と結果受信の競合を明示的に扱う。
5. 原因となった結果分類と cleanup の結果を別に記録する。cleanup 失敗を成功扱いせず、元の finding と raw bytes は保持する。
6. 対応する子孫の範囲と、group／session から離脱する target などの非対応条件を README に記載する。対象 OS で必要な機能が使えない場合の明示的なエラーを定める。

## 受け入れ条件

- [ ] 親・子・孫を作る fixture が、正常終了・startup timeout・execution timeout・worker crash・利用者中断後に対応範囲内で残存しない。
- [ ] 子孫が stdout／stderr を開いたままでも終了処理が所定の上限内に完了する。
- [ ] 別の実行単位に属する対照 process と supervisor 自身を終了しない。
- [ ] 実行結果と cleanup 結果を区別し、cleanup のエラーでも入力と元の finding を保持する。
- [ ] 連続実行と結果／timeout の競合で誤った PID への停止や待機漏れがない。
- [ ] Linux／macOS の対応範囲と非対応条件が明示され、資源制限や sandbox の保証と混同していない。

## テスト計画

1. Rust workspace 導入後に `cargo test --workspace` で process lifecycle の統合テストを実行する。実装時に追加するコマンドであり、現行 repository に Rust テストはない。
2. 一時ディレクトリへ PID と開始通知を出す親・子・孫 fixture と、別実行単位の対照 fixture を使用する。テスト自身にも期限と後始末を設け、失敗時に process を残さない。
3. Linux／macOS で各停止理由と pipe 継承を検証し、未実行 OS を PASS にしない。既存 `npm test` と `npm run test:moonbit` の P0 契約も維持する。

## リスク

process group の扱い、signal、待機可能な子孫の範囲には OS 差がある。意図的な離脱を含む任意 target の完全停止を保証しない。強制停止は target の後始末を実行しないため、診断と入力は親が保持する。

## 変更履歴

`CHANGES.md` impact: yes

項目案：

- Linux／macOS の Rust supervisor に実行単位の cleanup を追加し、対応する子孫 process を timeout や中断後に停止するようにした。

## 注記

- 種別: implementation
- 親計画: [JS ファジングの未実装機能と実装順序を整理する](20261029-js-fuzzing-roadmap.md)
- Depends on: [P0 の実行契約を維持する Rust supervisor を実装する](20261029-rust-supervisor.md)

[CPU・メモリ制限の調査](20261029-resource-limits.md) とは独立して進める。実装先は Rust supervisor とし、P0 への重複投資を避ける。
