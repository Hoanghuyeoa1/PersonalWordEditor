import type { VersionStorageAdapter } from "../types.ts";
import { MemoryStorageAdapter } from "./memoryStorageAdapter.ts";
import { TauriStorageAdapter } from "./tauriStorageAdapter.ts";
import { isTauriEnvironment } from "../../file/fileOperations.ts";

let activeAdapter: VersionStorageAdapter | null = null;

/**
 * Lấy adapter lưu trữ hiện tại.
 * Mặc định: dùng TauriStorageAdapter nếu chạy Desktop Tauri,
 * ngược lại dùng MemoryStorageAdapter (Node test, Web browser).
 */
export function getVersionStorageAdapter(): VersionStorageAdapter {
  if (!activeAdapter) {
    if (isTauriEnvironment()) {
      activeAdapter = new TauriStorageAdapter();
    } else {
      activeAdapter = new MemoryStorageAdapter();
    }
  }
  return activeAdapter;
}

/**
 * Thiết lập thủ công adapter lưu trữ (phục vụ Unit Test, Mocking).
 */
export function setVersionStorageAdapter(adapter: VersionStorageAdapter | null): void {
  activeAdapter = adapter;
}
