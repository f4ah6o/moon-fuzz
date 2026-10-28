# MoonBit ターゲット SDK と実行契約を確定する

Status: open
Model: GPT-6 Astra Pro
Created: 2026-10-29
Updated: 2026-10-29
Branch: research/20261029-target-sdk-contract

## 概要

MoonBit 利用者が記述する SDK API と、runner が呼び出すターゲット ABI の責任境界を調査する。同期実行、状態、入力の所有権、property の識別、既存 P0 との互換性を決められる根拠を残し、通常の実装 Issue を作成できる状態にする。

## 背景

- 基準コミットは `d9980543109290da8869789f860ac5a9d1c9af95`。
- [README の実行契約](https://github.com/f4ah6o/moon-fuzz/blob/d9980543109290da8869789f860ac5a9d1c9af95/README.md#L23-L27) は、同期 `fuzz_one(Uint8Array)` と整数 verdict を一時的な橋渡しと位置付けている。
- [MoonBit の例](https://github.com/f4ah6o/moon-fuzz/blob/d9980543109290da8869789f860ac5a9d1c9af95/examples/moonbit/target/target.mbt#L4-L25) は `Bytes -> Int` を export する。
- [worker](https://github.com/f4ah6o/moon-fuzz/blob/d9980543109290da8869789f860ac5a9d1c9af95/poc/worker.cjs#L16-L32) は module を読み込み、入力を渡し、戻り値を検査している。

## 問題

最終 SDK の型、property の安定した識別子、入力バッファの扱い、状態初期化の約束が定義されていない。整数 ABI をそのまま公開 API に固定すると、将来の failure signatures や structured generators の要件を満たせるか判断できない。

現在は入力ごとに新しいプロセスを作るため、永続 worker での状態リセットが成立することは実証されていない。

## 目標

- 利用者向け API、コンパイラへの export、runner protocol の三つの境界を説明できる。
- pass、reject、property failure、例外、crash、timeout、infrastructure error の責任主体を区別する。
- 後続実装の範囲と移行条件を確定し、未検証事項を明示する。

## 対象外

- SDK の製品実装、配布、CLI 自動ビルドの実装。
- coverage の計測方式や corpus の選択方式の決定。
- Wasm-GC、非同期ターゲット、structured generators の API 確定。
- 永続 worker への切り替え。

## 提案する方針

1. 現行 example、worker、受け入れテストから観測できる契約を列挙し、SDK が保証すべき事項と P0 固有の挙動を分ける。
2. 固定版 MoonBit の公式文書と小さいコンパイル例で、公開型、export、Bytes の受け渡しに関する制約を確認する。参照 URL、版、実行結果を調査報告へ記録する。
3. 同期呼び出しの完了条件、入力を変更・保持できる範囲、呼び出し間の状態、初期化時エラーを整理する。所有権の保証を生成コードの推測だけで決めない。
4. property ID を必要とする場面と生成主体を調べる。安定性の単位、明示 ID と既定 ID、既存の匿名 failure の扱いを比較する。
5. 利用者向け API と `Bytes -> Int` bridge を分離する案を、単純さ、診断情報、互換性、将来の拡張性で比較し、根拠付きの推奨案を記録する。
6. P0 の module 入力を維持するか、adapter を設けるか、移行期間を設けるかを整理する。未決事項が残る場合は判断用 Issue とし、本実装の条件を推測で固定しない。
7. 調査報告をリポジトリへ残す。契約と移行方針を確定できた段階で、SDK 実装を独立した通常の Issue として起票する。

## 受け入れ条件

- [ ] 公開 API、export ABI、runner protocol の契約表と、根拠となる固定版の文書・実験結果がある。
- [ ] 同期、状態初期化、入力の変更・保持、property ID、失敗分類の各項目に結論または明示的な未決理由がある。
- [ ] 既存の `Bytes -> Int` ターゲットの互換性と移行経路を説明できる。
- [ ] 候補比較と推奨理由があり、未実施の検証を成功として扱っていない。
- [ ] 通常の SDK 実装 Issue を作れる契約が揃っているか、未決事項を解消する具体的な判断用 Issue がある。

## テスト計画

1. `npm test` と `npm run test:moonbit` を現行契約の基準として実行し、実行環境と PASS / FAIL / 未実行を記録する。
2. 小さい MoonBit fixture で、空入力、`00 ff`、pass/reject/failure、入力変更、複数回呼び出しの状態を観察する。
3. 不正な export、同期契約を満たさない戻り値、初期化失敗と実行時失敗の境界を検査する。
4. property ID の衝突、匿名 failure、ビルドをやり直した場合の識別の安定性について、必要な検証と未検証の範囲を記録する。
5. 変更後も [既存の MoonBit 受け入れ条件](https://github.com/f4ah6o/moon-fuzz/blob/d9980543109290da8869789f860ac5a9d1c9af95/test/moonbit.test.mjs#L14-L67) を満たす移行案かレビューする。

この Issue 作成時には上記の研究・試験を実施していない。以後の調査で実行した結果を追記する。

## リスク

- コンパイラの版によって FFI や生成物の形が異なる可能性があるため、確認した版を契約に添える。
- property ID と failure signature を同一のものとして設計すると、異なる失敗の集約や過剰分割が起こり得る。
- 永続 worker を前提にすると、現在のプロセス分離が持つ状態初期化の性質を失うため、別途成立性を検証する必要がある。

## 変更履歴

`CHANGES.md` impact: no

調査と契約文書に留まる。後続の SDK 実装 Issue では利用者 API と互換性への影響を `yes` とする。

## 注記

未確定 API の名前や型を本 Issue の受け入れ条件として固定しない。

### Wayfinder

- Role: ticket
- Parent map: [JS ファジングの未実装機能と実装順序を整理する](20261029-js-fuzzing-roadmap.md)
- Type: research
- Mode: AFK
- Depends on: none
