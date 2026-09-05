# 開発

## レンダリング回帰テスト

`index.html` の描画を Playwright で検証する。

```bash
npm ci
npm test             # Docker で全テスト
npm run test:update  # 基準画像・スナップショットを更新
npm run test:dom     # DOM スナップショットのみホストで実行（初回に npx playwright install chromium）
```

基準画像は必ず `npm run test:update` で更新する。ホストで直接 `--update-snapshots` すると、ホストのフォントで撮った画像が入って CI が落ちる。
