# MoonBit JS ターゲットの自動ビルドと成果物発見の契約を調べる

Status: open
Model: GPT-6 Astra Pro
Created: 2026-10-29
Updated: 2026-10-29
Branch: research/20261029-target-build-discovery

## 概要

利用者の MoonBit プロジェクトを CLI からビルドするため、対象 package の選択と生成 JS の発見に使える公式 API・コマンドを調査する。対応版、失敗時の挙動、既存 module 入力との関係を明確にしてから実装 Issue を作成する。

## 背景

- 基準コミットは `d9980543109290da8869789f860ac5a9d1c9af95`。
- [既存ビルド補助](https://github.com/f4ah6o/moon-fuzz/blob/d9980543109290da8869789f860ac5a9d1c9af95/scripts/build-moonbit.mjs#L4-L19) は example のディレクトリを固定し、版確認、clean、JS build を行う。
- [README](https://github.com/f4ah6o/moon-fuzz/blob/d9980543109290da8869789f860ac5a9d1c9af95/README.md#L48-L62) は、利用者が手動ビルドした CommonJS module を指定する手順を示す。
- [package 設定](https://github.com/f4ah6o/moon-fuzz/blob/d9980543109290da8869789f860ac5a9d1c9af95/examples/moonbit/target/moon.pkg#L1-L2) は `foreign_library` と CommonJS 出力を指定している。

## 問題

テスト用の固定 example をビルドする処理はあるが、CLI が任意の利用者プロジェクトから対象 package と正しい成果物を選択する仕組みはない。example 固有の `_build/js/debug/build/target/target.js` を一般化できる根拠もない。

複数 package、異なる profile、古い成果物、ビルド失敗を扱う契約がないまま自動化すると、意図しないターゲットを実行する可能性がある。

## 目標

- 対象 package を一意に指定し、当該ビルドの JS artifact を取得する方法と対応版を示す。
- 正規 API の有無、代替案の制約、ビルド失敗・成果物不在時の挙動を説明できる。
- 自動ビルド実装の入出力、移行条件、検証可能な受け入れ条件を確定する。

## 対象外

- 汎用 CLI 自動ビルドの製品実装、toolchain の自動インストール。
- Wasm-GC、native backend、SDK の公開 API の確定。
- package の公開、依存関係の自動更新、全対応版への拡張。
- 利用者プロジェクトを無条件に clean する設計。

## 提案する方針

1. `moon version --all` と既存 script が検査する固定版を調査の基準にする。別版を扱う場合は、結果と差異を版ごとに記録する。
2. 公式 CLI 文書、help、必要ならソースを調べ、package 選択、backend/profile の指定、成果物一覧の機械可読出力に使える正式な手段を列挙する。
3. 単一 package、複数 package、入れ子のディレクトリ、空白を含むパスを持つ小さい JS `foreign_library` プロジェクトで候補を検証する。
4. 生成物の場所を固定推測する案、探索する案、公式の build metadata を読む案を比較する。正式な機械可読 API がない場合は、その事実と暫定案の対応版・検出方法を記録する。
5. 明示的な module 入力と project/package 入力の選択契約を提案する。曖昧な package や複数の候補 artifact を暗黙に選ばない方針を定める。
6. build の非ゼロ終了、期限超過、成果物不在、非 CommonJS 出力、export 不一致を分類する。ビルド失敗時は stale artifact を実行しない条件を定める。
7. build fingerprint に必要な版・引数・対象・artifact の情報を整理する。snapshot の形式そのものは別 Issue に委ねる。
8. 根拠と再現手順を調査報告へ残す。対象選択と成果物取得の契約が検証できた場合のみ、通常の自動ビルド実装 Issue を起票する。

## 受け入れ条件

- [ ] 正式な package 選択と成果物取得の手段、または正式な手段がない根拠を確認した版とともに記録している。
- [ ] 単一・複数 package、パスの違い、profile の違いについて、成功例と失敗例の結果がある。
- [ ] build 失敗時に古い成果物を実行しない契約と、その検証手順がある。
- [ ] module 入力との互換性、曖昧な入力へのエラー、ビルド診断の扱いを提案している。
- [ ] fingerprint へ渡す情報が明確で、未検証事項を後続実装の確定仕様として扱っていない。
- [ ] 推奨方式で実装 Issue を作れるか、追加調査・判断が必要な理由と次の問いが明示されている。

## テスト計画

1. `npm run test:moonbit` で既存の版確認・example build・受け入れ試験を基準として確認する。`npm test` も既存挙動の回帰確認に使う。
2. 公式文書から確認した build/metadata コマンドを小さい fixture に対して実行し、実際のコマンド、版、出力を報告へ記録する。
3. stale artifact を置いてから意図的にコンパイルを失敗させ、候補方式が古い成功を新しい成功と誤認しないことを検証する。
4. `moon` 不在、対応外の版、package 不在、複数候補、出力欠落を検証し、何を実行前に検出できるか整理する。
5. build 後の module を既存 runner へ渡し、空入力・バイナリ入力・failure・保存入力の replay を検査する。

この Issue 作成時には上記の研究・試験を実施していない。各結果を PASS / FAIL / 未実行で記録する。

## リスク

- 出力ディレクトリや CLI 表示の推測に依存すると、toolchain 更新で誤った artifact を選ぶ可能性がある。
- テスト用の `moon clean` をそのまま製品 CLI に移すと、利用者の他の成果物を失う可能性がある。
- 自動ビルドと実行の間に artifact が変化する場合の同一性確認は、fingerprint/snapshot の方針と整合させる必要がある。

## 変更履歴

`CHANGES.md` impact: no

調査報告のみを対象とする。後続の自動ビルド実装 Issue では CLI の動作と対応版への影響を `yes` とする。

## 注記

既存の example 用ビルド補助を未実装として扱わず、汎用 CLI との接続に必要な不足を調べる。

### Wayfinder

- Role: ticket
- Parent map: [JS ファジングの未実装機能と実装順序を整理する](20261029-js-fuzzing-roadmap.md)
- Type: research
- Mode: AFK
- Depends on: none
