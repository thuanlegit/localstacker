fn main() {
    // Re-run when icon files change so `generate_context!` re-embeds them
    // (drives the macOS dev-mode dock icon). Without this, `tauri dev`
    // reuses a stale binary and shows an outdated icon.
    println!("cargo:rerun-if-changed=icons");
    tauri_build::build()
}
