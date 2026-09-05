use std::{env, fs, path::PathBuf};

// GitHub Pages 用の index.html を単一の情報源とするため、ビルド時に dist/ へ複製して
// frontendDist に食わせる。リポジトリルートを直接 frontendDist にすると .git まで埋め込まれる。
fn main() {
    let manifest = PathBuf::from(env::var("CARGO_MANIFEST_DIR").unwrap());
    let src = manifest.parent().unwrap().join("index.html");
    let dist = manifest.join("dist");

    fs::create_dir_all(&dist).expect("dist ディレクトリを作成できません");
    fs::copy(&src, dist.join("index.html")).expect("index.html を複製できません");
    println!("cargo:rerun-if-changed={}", src.display());

    tauri_build::build();
}
