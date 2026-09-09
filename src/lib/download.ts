export async function saveObjectFile(
  bytes: Uint8Array,
  filename: string,
): Promise<"saved" | "cancelled"> {
  if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
    // Dynamic imports keep platform-specific Tauri plugins out of the browser-dev bundle path
    const { save } = await import("@tauri-apps/plugin-dialog");
    const { writeFile } = await import("@tauri-apps/plugin-fs");
    const target = await save({ defaultPath: filename });
    if (!target) {
      return "cancelled";
    }

    await writeFile(target, bytes);
    return "saved";
  }

  // Browser fallback
  const blob = new Blob([bytes as unknown as BlobPart]);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return "saved";
}
