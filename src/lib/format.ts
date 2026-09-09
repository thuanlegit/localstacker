export function formatBytes(bytes: number): string {
  if (bytes <= 0) {
    return "0 B";
  }
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  const i = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  const val = bytes / Math.pow(1024, i);
  const formatted = val.toFixed(1).replace(/\.0$/, "");
  return `${formatted} ${units[i]}`;
}

export function formatDate(date?: Date): string {
  if (!date) {
    return "—";
  }
  return date.toLocaleString();
}
