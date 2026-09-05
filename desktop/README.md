# Hanami デスクトップ版

## ビルド

```sh
cargo run -- ~/notes/todo.md     # 開発起動（引数は省略可）
NO_STRIP=true cargo tauri build  # AppImage / deb（要 tauri-cli）
```

`NO_STRIP` は linuxdeploy 同梱の古い `strip` が現代の toolchain が吐く `.relr.dyn` を扱えず
バンドルに失敗するための回避策。

## バージョン

`YYYY.MMDD.MICRO`（`MICRO` は同日の連番）。semver は3要素固定なので `YYYY.MM.DD.N` は使えない。
`tauri.conf.json` と `Cargo.toml` の両方を揃える。
