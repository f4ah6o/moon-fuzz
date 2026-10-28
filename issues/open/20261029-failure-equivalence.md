# 失敗署名と自動再現確認の同一性契約を確定する

Status: open
Model: GPT-6 Astra Pro
Created: 2026-10-29
Updated: 2026-10-29
Branch: research/20261029-failure-equivalence

## 概要

異なる入力や反復実行の結果を「同じ失敗」と扱える条件を定義する。failure signature、自動再現確認、shrinking、regression checks が共有する観測情報と判定境界を、SDK の結論に基づいて確定する。

## 背景

- [README の milestone](https://github.com/f4ah6o/moon-fuzz/blob/d9980543109290da8869789f860ac5a9d1c9af95/README.md#L83-L97) に failure signatures、reproducibility checks、shrinking、regression checks が含まれる。
- [現行 bridge](https://github.com/f4ah6o/moon-fuzz/blob/d9980543109290da8869789f860ac5a9d1c9af95/poc/worker.cjs#L23-L33) は `0/1/2` だけを返し、例外では文字列化した stack を送る。property の識別子はない。
- [現行 finding ID](https://github.com/f4ah6o/moon-fuzz/blob/d9980543109290da8869789f860ac5a9d1c9af95/poc/runner.mjs#L59-L66) は入力 hash と UUID であり、失敗署名ではない。
- [MoonBit の二つの failure 分岐](https://github.com/f4ah6o/moon-fuzz/blob/d9980543109290da8869789f860ac5a9d1c9af95/examples/moonbit/target/target.mbt#L9-L23) は共に `2` を返す。現在の replay 試験は結果分類の一致を確認している。

## 問題

`PropertyFailure` の一致だけでは同じ property の違反か判断できない。入力 hash を署名にすると shrinking 後の入力を同一視できず、例外文字列の完全一致だけではパスや非決定的な値が判定を不安定にする。また、元 finding の再現成功と、修正後の regression 成功は逆の期待結果を持ち得る。

## 目標

結果種別ごとの同一性、署名の version、観測不足時の保守的な扱い、反復確認の結果区分を確定する。署名・repro、shrinking、regression の独立した後続実装 Issue を、検証可能な条件付きで作成する。

## 対象外

- 製品への署名・自動再現・縮小・regression コマンドの実装。
- 署名が等しいことによる根本原因の完全な同一性保証。
- 非決定的な対象を必ず安定化すること、任意のログ内容を比較 oracle にすること。

## 提案する方針

1. [SDK 契約](20261029-target-sdk-contract.md) で決まった property identity と結果表現を入力に、Pass／Reject／PropertyFailure／UncaughtError／Crash／Timeout／InfrastructureError の判定表を作る。
2. build identity、property ID、例外種別と安定した位置情報、exit code／signal、実行 phase を署名候補として評価する。正規化で除去する情報、保存する元データ、判定不能な場合を明文化する。
3. P0 の整数 bridge のように識別情報が不足する場合は、その限界を明示する。別 property への移り変わりを「同じ失敗の縮小」と断定できないことを fixture で確認する。
4. fresh worker で同じ保存入力を有限回実行し、安定再現、非再現、flaky、検証不能を区別する案を評価する。試行回数と各試行結果を保存し、再現しなくても元 finding を保持する。
5. shrinking には同じ署名を再現する候補だけを採用し、元入力と縮小結果を別保存する方針を検証する。異なる failure 種別、異なる property、infra error、予算切れの候補を採用しない条件を作る。
6. regression は保存ケースを現在の build で検査する目的とし、期待する Pass、Reject の可否、finding、infra error の終了コードを提案する。利用者判断が必要なら、候補と影響を記載した decision ticket を地図に追加する。
7. schema 1 finding、fingerprint 不明、snapshot 不完全、build 変更の扱いを整理し、情報不足を一致扱いしない。結論に基づき、署名と反復確認、byte shrinking、regression suite を独立した実装 Issue に分割する。

## 受け入れ条件

- [ ] 結果種別別の同一性表と、署名の安定範囲・version・正規化規則が定義されている。
- [ ] 同じ入力 hash／同じ `kind`／同じ根本原因を区別し、情報不足を明示している。
- [ ] 同一 property、別 property、別例外、timeout、infra error を含む例で判定を検証している。
- [ ] 安定再現・非再現・flaky・検証不能の区分と、元 finding の保持を確認している。
- [ ] shrinking が別 failure を採用しない条件と、停止時の保存契約が決まっている。
- [ ] 再現確認と regression の成功条件・終了コードの違い、および Reject の扱いが記録されている。
- [ ] 未解決の判断が残る場合は実装条件を固定せず、decision ticket または地図の未確定範囲へ引き継いでいる。

## テスト計画

1. P0 の二つの failure 入力、SDK の識別情報を持つ target、交互に結果が変わる target で、候補判定表と実際の観測値を照合する。
2. path／stack の変化、別 build、同じ exit code の別原因、起動失敗を用いて過剰な統合がないか確認する。
3. 元 failure が縮小で別 property、例外、timeout に変わるケースと、修正後に Pass／Reject になる regression ケースを試作で検証する。試作のコマンドと結果は完了時に記録する。

## リスク

署名を粗くすると別の不具合を統合し、細かくすると同一失敗を分断する。timeout と flaky の評価は実行環境にも依存する。署名は観測上の同一性であることを記録し、元の証跡を破棄しない。

## 変更履歴

`CHANGES.md` impact: no

本 Issue は判定契約の調査に限定する。署名・再現確認・shrinking・regression の各実装では利用者向け変更を記録する。

## 注記

### Wayfinder

- Role: ticket
- Parent map: [JS ファジングの未実装機能と実装順序を整理する](20261029-js-fuzzing-roadmap.md)
- Type: research
- Mode: AFK
- Depends on: [MoonBit ターゲット SDK と実行契約を確定する](20261029-target-sdk-contract.md)

SDK の property identity が未確定の間は frontier に含めない。後続実装の仕様は本 Issue の結論から作成し、現在の整数 `2` を恒久的な署名にしない。
