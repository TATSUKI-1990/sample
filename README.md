# Neon Outpost TPS (GitHub Pages対応)

Three.js（CDN import）だけで構築した、GitHub Pagesでそのまま公開できる3D TPSシューティング縦スライスです。npm/ビルド不要で、静的ファイルのみで動作します。

## ディレクトリ構成

```txt
/
├─ index.html
├─ style.css
├─ README.md
├─ assets/
│  └─ README.md
└─ src/
   ├─ main.js      # ブートストラップ、入力、UI連携
   ├─ game.js      # 3D描画、ゲームループ、プレイヤー、AI、演出
   ├─ audio.js     # WebAudioの軽量SE生成
   └─ net.js       # GameState/NetAdapter 抽象（将来マルチ用）
```

## 操作方法

- クリック: ポインタロック
- マウス: 視点操作
- `WASD`: 移動
- `Shift`: スプリント
- `Ctrl`: しゃがみ
- `Space`: ジャンプ
- 左クリック: 射撃（ヒットスキャン）
- `R`: リロード

## 実装済み仕様（縦スライス）

- 3D TPS視点（肩越し）
- プレイヤー移動（WASD / ジャンプ / しゃがみ / スプリント）
- 射撃（ヒットスキャン）、反動、拡散
- HP/被ダメージ/死亡/リスタート
- AIボット（巡回→発見→攻撃→遮蔽物への移動）
- 小規模屋外マップ（地面、遮蔽物、建物風ブロック）
- UI（クロスヘア、HP、弾数、キル数）
- 演出（銃口フラッシュ、トレーサ、着弾、ヒットマーカー、被弾ビネット、カメラ揺れ、WebAudio SE）

## GitHub Pages公開手順

1. GitHubにpush
2. リポジトリ `Settings` → `Pages`
3. `Build and deployment` で `Deploy from a branch`
4. Branchを `main`（または使用ブランチ）/`root` に設定
5. 数十秒待って発行URLへアクセス

## 設計概要

### 1) Game loop / Rendering
- `src/game.js` が Three.js のシーン・カメラ・レンダラを管理。
- 1フレームごとに `updatePlayer -> updateBots -> updateEffects -> updateCamera -> render` を実行。

### 2) Gameplay modules
- `src/main.js`:
  - ポインタロック
  - キー/マウス入力
  - UI DOM 更新
- `src/audio.js`:
  - WebAudioで発砲音/命中音/足音をオンザフライ生成

### 3) Multiplayer拡張を見据えた分離
- `src/net.js` に `GameState` と `LocalNetAdapter` を定義。
- 現在はローカル実行だが、将来的に `WebSocketNetAdapter` へ差し替えるだけで同期層を追加しやすい構造。

## マルチ化ロードマップ

1. **サーバ追加**
   - Node.js/Go/RustなどでWebSocketサーバを別途常駐
2. **スナップショット同期**
   - サーバ authoritative な `GameState` を定期配信
3. **クライアント予測**
   - 入力先行適用 + サーバ補正（reconciliation）
4. **ヒット判定のサーバ移譲**
   - チート耐性向上のため射撃・被弾はサーバ判定
5. **ルーム/マッチ管理**
   - 部屋作成、参加、リスポーン、スコア集計
6. **帯域最適化**
   - Delta圧縮、interest management、更新頻度制御

---

> GitHub Pagesは静的ホスティングのため、常時稼働が必要なオンラインマルチは単体では実装不可です。本リポジトリは「マルチ拡張可能なシングル縦スライス」を提供します。
