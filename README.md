# GitHub Pages 3D TPS Vertical Slice

Three.js (CDN import) + 素の HTML/CSS/JavaScript だけで作った、GitHub Pages 向け 3D TPS シューティング縦スライスです。  
PUBG/荒野行動風の「肩越し視点・ヒットスキャン・ボット戦・被弾演出」を静的ホスティングだけで動かします。

## 構成

```
/index.html
/style.css
/src/
  main.js
  game.js
  config.js
  input.js
  entities.js
  effects.js
  audio.js
  net.js
/assets/
  .gitkeep
```

## 操作方法

- クリック: ポインタロック
- マウス: 視点
- 左クリック: 射撃（ヒットスキャン）
- `WASD`: 移動
- `Space`: ジャンプ
- `Shift`: スプリント
- `Ctrl`: しゃがみ
- `R`: リロード / 死亡時リスタート

## 実装済みゲーム仕様（縦スライス）

- 3D TPS 肩越しカメラ
- プレイヤー移動、ジャンプ、しゃがみ、スプリント
- ヒットスキャン射撃、反動（カメラキック）、拡散
- ダメージ/HP/死亡→リスタート
- 敵 AI（巡回→発見→攻撃→遮蔽移動）
- 小規模屋外マップ（地面、遮蔽物、建物風ボックス）
- UI（クロスヘア、HP、弾数、キル数、死亡画面）
- 演出（銃口フラッシュ、着弾スパーク、ヒットマーカー、被弾ビネット、画面揺れ、簡易足音/射撃音）

## GitHub Pages 公開手順

1. このリポジトリを GitHub に push
2. GitHub の `Settings` → `Pages`
3. `Build and deployment` の `Source` を **Deploy from a branch**
4. `Branch` を `main` (or your branch) / `/ (root)` に設定
5. 保存後、表示された Pages URL にアクセス

> 静的ファイルのみなので追加サーバは不要です。

## 設計概要

- **`game.js`**: メインループ、ワールド生成、プレイヤー/ボット更新、射撃、UI更新
- **`input.js`**: キー入力、マウス視点、ポインタロック
- **`entities.js`**: Player / Bot の初期化データ
- **`effects.js`**: 銃口フラッシュ、着弾粒子、カメラシェイク
- **`audio.js`**: WebAudio で軽量な効果音を生成
- **`net.js`**: `GameState` / `NetAdapter` の分離層（将来マルチ化の土台）
- **`config.js`**: バランス値、速度、ダメージ、弾数

## パフォーマンス上の工夫

- パーティクルをプール再利用
- dt上限 (`Math.min(0.033, delta)`) でフレーム落ち時の暴走抑制
- シーン探索を必要箇所に限定（bot・obstacle配列を明示管理）

## マルチ化ロードマップ

GitHub Pages は静的ホスティングなので、常時接続サーバが必要なオンライン対戦はこのままでは不可です。  
ただし、以下の段階で移行しやすい構造にしています。

1. **`NetAdapter` を WebSocket 実装に差し替え**
   - `LocalAdapter` を維持しつつ、`WebSocketAdapter` を追加
2. **サーバ authoritative 化**
   - 弾道判定・HP更新をサーバ側へ
3. **スナップショット同期**
   - `GameState` を snapshot / interpolation 可能な形式へ拡張
4. **ルーム管理・マッチング**
   - 参加/退出、スポーン管理をサーバへ
5. **チート対策の導入**
   - 入力検証、レート制限、位置補正

この構造により、フロントは静的のまま、別途 WebSocket バックエンドを追加して段階的にマルチ化できます。
