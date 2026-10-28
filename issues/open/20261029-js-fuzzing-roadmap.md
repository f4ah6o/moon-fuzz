# JS ファジングの未実装機能と実装順序を整理する

Status: open
Model: GPT-6 Astra Pro
Created: 2026-10-29
Updated: 2026-10-29
Branch: docs/20261029-js-fuzzing-roadmap

## 概要

README にある未実装機能を、着手可能な実装 Issue と、先行する調査で仕様を確定する Issue に整理する。JS 経路を完成させるための依存関係と、Wasm-GC・差分ファジング・構造化生成へ進む条件を管理する。

## 背景

調査基準は `main` の [d9980543109290da8869789f860ac5a9d1c9af95](https://github.com/f4ah6o/moon-fuzz/commit/d9980543109290da8869789f860ac5a9d1c9af95)。[README の Next milestones](https://github.com/f4ah6o/moon-fuzz/blob/d9980543109290da8869789f860ac5a9d1c9af95/README.md#L83-L97) と全 16 ファイルの実装・テスト・設定を照合した。

現在の P0 で存在する動作は次のとおりである。

| 既存機能 | 根拠 |
| --- | --- |
| 1 入力ごとの fresh Node worker、起動／実行の deadline、結果分類 | [runner](https://github.com/f4ah6o/moon-fuzz/blob/d9980543109290da8869789f860ac5a9d1c9af95/poc/runner.mjs#L10-L56) |
| target 出力と制御通信の分離、stdout／stderr 各 64 KiB の保存上限 | [runner](https://github.com/f4ah6o/moon-fuzz/blob/d9980543109290da8869789f860ac5a9d1c9af95/poc/runner.mjs#L8-L27) |
| 失敗した元入力、metadata、ログの保存と手動 replay | [finding 保存](https://github.com/f4ah6o/moon-fuzz/blob/d9980543109290da8869789f860ac5a9d1c9af95/poc/runner.mjs#L59-L75)、[CLI acceptance test](https://github.com/f4ah6o/moon-fuzz/blob/d9980543109290da8869789f860ac5a9d1c9af95/test/runner.test.mjs#L74-L91) |
| MoonBit 生成 JS の例、固定 toolchain による example 専用 build、実 target の acceptance test | [build script](https://github.com/f4ah6o/moon-fuzz/blob/d9980543109290da8869789f860ac5a9d1c9af95/scripts/build-moonbit.mjs)、[MoonBit test](https://github.com/f4ah6o/moon-fuzz/blob/d9980543109290da8869789f860ac5a9d1c9af95/test/moonbit.test.mjs) |

実行テストが存在することと、この計画作成環境ですべての対応環境を検証済みであることは区別する。各機能の実装時にテスト結果を記録する。

## 問題

単発の P0 実行を coverage-guided fuzzing へ発展させるには、入力別の feedback、探索用のデータ管理、再現判定、実行環境の識別が必要になる。現行コードにはこれらの契約がなく、README の短い milestone だけでは実装単位と先行判断の関係が分からない。

特に、整数 `2` を同じ property の失敗とみなすこと、入口 JS のコピーを完全な snapshot とみなすこと、集計 coverage を入力別 feedback とみなすことは、実装前の検証が必要である。

## 目標

JS の coverage-guided campaign、入力保存、再現確認・縮小・regression、SDK・自動 build、実行制御について、根拠と検証可能な条件を備えた通常の実装 Issue 集合を得る。未解決事項には調査結果を残し、JS の成立確認後に進める拡張の起票条件も維持する。

## 対象外

- この地図の作成をもって各機能が実装済みとすること。
- roadmap にない GUI、サービス運用、registry 公開、並列・分散実行、Windows 対応。
- JS の成立を確認する前に、Wasm-GC や differential／structured の API を固定すること。

## 提案する方針

1. 現行 P0 の結果分類、終了コード、入力 bytes、診断保存を互換性の基準にする。最初に入力別 coverage を検証し、SDK・build・snapshot・資源制限の独立した調査を進める。
2. 仕様が既に具体化できる Rust supervisor と入口 fingerprint は独立して実装する。Rust workspace 導入後に、corpus store、byte mutator、子孫 process cleanup を別のレビュー単位で実装する。
3. coverage 調査の結論から collector の実装 Issue を作成し、その契約に基づいて campaign の仕様を確定する。guidance が要求されたのに利用できない場合は明示的に失敗させる。
4. SDK の property identity を確定した後に失敗同一性を調査し、signature／自動 repro、shrinking、regression の実装 Issue を分ける。どの段階でも raw input の保持を coverage 成否から独立させる。
5. build discovery、snapshot、資源制限は、それぞれの調査結果から対応範囲と未対応時の挙動を確定して実装 Issue を作成する。
6. JS の統合受け入れ条件が成立してから、Wasm-GC、差分ファジング、構造化生成の問いを具体化する。新たな利用者判断が必要になった場合は、選択肢と影響を備えた decision ticket を追加する。

### 現在の通常実装 Issue

| Issue | 着手条件 | 完了時に得られるもの | CHANGES.md |
| --- | --- | --- | --- |
| [P0 の実行契約を維持する Rust supervisor を実装する](20261029-rust-supervisor.md) | なし | Rust workspace、単発 CLI、独立 control channel、P0 互換の実行と保存 | yes |
| [finding に target artifact と実行環境の fingerprint を記録する](20261029-target-fingerprint.md) | なし | 入口 artifact と環境の観測情報を持つ finding | yes |
| [生バイトのコーパス保存と再読み込みを実装する](20261029-corpus-store.md) | Rust workspace 導入 | 重複を抑えた byte-level store と完全性検証 | no：内部基盤 |
| [再現可能な生バイト mutation の基盤を実装する](20261029-byte-mutators.md) | Rust workspace 導入 | seed／version 付きの決定的な候補列生成 | no：内部基盤 |
| [worker の子孫プロセスを停止・回収する](20261029-process-tree-cleanup.md) | Rust supervisor | Linux／macOS の対応範囲内での停止・回収 | yes |

通常の実装 Issue は Wayfinder の意思決定 ticket には分類しない。依存関係は各 Issue の注記に置く。Rust supervisor が先に統合された場合は、fingerprint の保存先をその実装へ合わせ、同じ機能を両 supervisor に重複実装しない。

### 調査後に作成する実装 Issue

| 未実装機能 | 仕様を確定する前提 | 後続 Issue に含める条件 |
| --- | --- | --- |
| 入力別 coverage collector | [coverage 帰属・reset 調査](20261029-coverage-attribution.md) | 観測単位、対象の絞り込み、build ごとの feature ID、取得不能の表現 |
| coverage-guided corpus 採用・mutation campaign | collector 契約、Rust supervisor、corpus store、byte mutator | 同じ初期条件・feedback／判定列での候補列再現、最大長／試行数／総時間、停止理由、Reject／infra の扱い、新規 feature に基づく採用、入力の保存 |
| MoonBit SDK | [SDK 契約調査](20261029-target-sdk-contract.md) | 利用者 API と export ABI、property identity、同期と状態の契約、P0 bridge からの移行 |
| 利用者 project の CLI 自動 build | [build discovery 調査](20261029-target-build-discovery.md) | package の選択、成果物の確実な発見、版情報、失敗時に stale artifact を実行しないこと |
| 再現用 target snapshot | [snapshot 調査](20261029-artifact-snapshot.md) | 保存する依存物、外部前提、完全性、容量と失敗時の扱い |
| failure signature と自動再現確認 | [失敗同一性の調査](20261029-failure-equivalence.md) | version 付き署名、安定／非再現／flaky／検証不能の区分、元 finding の保持 |
| byte shrinking | 署名・自動再現契約 | 同じ失敗だけを保持、元入力と縮小結果の別保存、有限の試行予算、途中中断 |
| regression checks | 失敗同一性調査の期待結果・終了コード | 再現確認との目的差、修正後の Pass／Reject の扱い、混在 suite、CI 集計 |
| CPU／メモリ制限 | [資源制限の調査](20261029-resource-limits.md) | OS ごとの保証単位、強制と観測の違い、未対応指定のエラー、停止理由 |

表の機能は未実装である。調査結果が内容を変えるため、現在は実装 Issue の受け入れ条件を確定しない。判断が尽くされた項目から通常の Issue を作成して表をリンクへ置き換える。

### JS 統合受け入れの条件

1. pinned compiler の実 target で coverage の帰属・reset が検証され、未対応 guidance は黙示的に非 guidance へ移行しない。
2. 固定 seed／同じ初期 corpus・build・version／実行回数に加えて、同じ feedback と結果判定列の条件で campaign の候補列を再現できる。target の非決定性、入力ごとの timeout、coverage の取得成否が変われば採用される corpus も変わり得るため、seed だけで任意 target の探索全体を再現できるとは保証しない。時間予算による停止回数の差も保証対象に混ぜず、失敗の再現には保存済みの実入力 bytes を使用する。
3. property failure、throw、crash、timeout でも、入力 bytes と bounded diagnostics が coverage 成否によらず保持される。
4. 選定した署名で自動再現を判定し、元入力を保持したまま同じ失敗を縮小できる。regression は定義した期待結果と終了コードで検査できる。
5. SDK・自動 build・fingerprint／snapshot の対応範囲と、process cleanup／資源制限の OS 別制約が文書化・検証される。

## 受け入れ条件

- [ ] README の未実装項目すべてに、実装 Issue、調査 Issue、または後続で具体化する場所がある。
- [ ] 作成したすべての Issue に根拠、対象外、実装または調査方針、検証可能な受け入れ条件、テスト計画、リスク、CHANGES.md への影響がある。
- [ ] 調査の結論が必要な実装を推測で固定せず、採用理由と後続 Issue が記録されている。
- [ ] 通常実装と調査 ticket の依存関係に循環・リンク切れがなく、現在の frontier が一致している。
- [ ] JS の統合条件と将来拡張の段階ゲートが明示されている。
- [ ] 子 ticket の解決時に結論を取り込み、実装可能になった機能の Issue を追加する。必要な判断が尽くされた時点でこの地図を done にする。

## テスト計画

1. `create-issue` に付属する `local_issues.py validate --issue-root issues` で形式・metadata・状態を検証し、相対リンク・依存関係・重複を別途レビューする。
2. README の各未実装項目を上記表と照合する。P0 の手動 replay、例専用 build、timeout、raw-byte 保存を新機能として再登録していないことを確認する。
3. 各実装で `npm test` と `npm run test:moonbit` を既存契約の回帰確認として扱う。Rust 導入後は各 Issue に記載した `cargo test --workspace` と追加の統合試験を実行する。
4. coverage や資源制限の成立は実 target と対象 OS で検証する。未実行、環境要因の失敗、機能の失敗を記録上で区別する。

## リスク

compiler／runtime の版変更で計測と成果物発見の前提が変わる。Rust と P0 の並行変更で契約が分岐する可能性があるため、共通 fixture と保存 schema を基準にする。調査で新しい判断が生じた場合は、関係する Issue とこの地図を同時に更新する。

## 変更履歴

`CHANGES.md` impact: no

本 Issue は計画と依存関係の管理に限定する。調査基準時点に `CHANGES.md` は存在しないため、`yes` の実装 Issue で利用者向け変更を提供するときに新設する。

## 注記

### Wayfinder

- Role: map

### Destination

JS ファジングを実装可能な仕様と通常 Issue の集合にする。coverage、target 契約、再現性、実行制御の判断を根拠付きで閉じ、将来 backend と生成方式へ進む条件を残す。

### Decisions so far

- 調査基準ではローカル Issue の格納先・テンプレート・専用指示が存在しないため、指定された `create-issue` の既定 `issues/open/YYYYMMDD-<slug>.md` を使用する。
- P0 の単発実行、分類、bounded logs、入力保存、手動 replay、MoonBit example と専用 build は既存機能として維持する。
- 計測方式や API が未検証の機能は research で根拠を得てから実装 Issue にする。現時点で完了済みの research ticket はない。
- 今回の Issue 作成で各機能を実装・完了したとは扱わない。

### Not yet specified

- **Wasm-GC:** JS の adapter／SDK／coverage 契約と統合検証の結果を得た後に、runtime 候補、入力 ABI、trap／timeout と計測方式を対象とする research Issue を作成する。JS と同じ実装が使えるとは仮定しない。
- **差分ファジング:** SDK が観測可能にする値と最初の比較対象がまだ定まらない。backend 間／実装間／version 間のどれを比べるか、oracle と正規化、片側 Reject／crash／timeout の扱いは、JS 統合後に具体化する。
- **構造化 generator:** SDK と byte shrinking の契約が固まった後に、最初に扱う型、codec、seed、custom shrinker の接続を具体化する。保存済みの実入力 bytes は引き続き再現の基準にする。

### Out of scope

- GUI、クラウド運用、パッケージ公開、並列・分散実行、Windows 対応は README の現行 milestone に含まれないため今回追加しない。
- 既存 P0 の再実装を、それ自体で新しい coverage-guided 機能の完成と扱うこと。

### Tickets

- [ ] [MoonBit JS の入力別 coverage 帰属とリセットを検証する](20261029-coverage-attribution.md) — `research` / AFK / depends on: none
- [ ] [MoonBit ターゲット SDK と実行契約を確定する](20261029-target-sdk-contract.md) — `research` / AFK / depends on: none
- [ ] [MoonBit JS ターゲットの自動ビルドと成果物発見の契約を調べる](20261029-target-build-discovery.md) — `research` / AFK / depends on: none
- [ ] [再現用 target snapshot の保存範囲と可搬性を確定する](20261029-artifact-snapshot.md) — `research` / AFK / depends on: none
- [ ] [Linux と macOS の CPU・メモリ制限の保証範囲を調べる](20261029-resource-limits.md) — `research` / AFK / depends on: none
- [ ] [失敗署名と自動再現確認の同一性契約を確定する](20261029-failure-equivalence.md) — `research` / AFK / depends on: [MoonBit ターゲット SDK と実行契約を確定する](20261029-target-sdk-contract.md)

### Frontier

上記 Tickets の先頭 5 件は依存なしで着手可能である。失敗同一性は SDK 契約の結論を待つ。通常実装は Rust supervisor と target fingerprint から着手でき、corpus／mutator は workspace、process cleanup は supervisor を待つ。

並び順は README の最初の milestone である coverage を優先し、独立した調査を続け、SDK に依存する失敗同一性を最後にした。着手時は状態を doing に更新して claim し、完了時には依存先とリンクを更新する。
