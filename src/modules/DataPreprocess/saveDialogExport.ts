import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";

interface ExportFilter {
  extensions: string[];
  name: string;
}

export async function saveTextWithDialog(defaultPath: string, filters: ExportFilter[], content: string) {
  const path = await selectSavePath(defaultPath, filters);
  if (!path) {
    return false;
  }

  await invoke("write_text_file", { path, content });
  return true;
}

export async function saveBlobWithDialog(defaultPath: string, filters: ExportFilter[], blob: Blob) {
  const path = await selectSavePath(defaultPath, filters);
  if (!path) {
    return false;
  }

  const buffer = await blob.arrayBuffer();
  await invoke("write_binary_file", { path, bytes: Array.from(new Uint8Array(buffer)) });
  return true;
}

async function selectSavePath(defaultPath: string, filters: ExportFilter[]) {
  const selected = await save({
    defaultPath,
    filters
  });

  return typeof selected === "string" ? selected : null;
}
