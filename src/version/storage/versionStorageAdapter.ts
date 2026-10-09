/**
 * Bộ chuyển đổi lưu trữ lịch sử phiên bản và bản chụp phục hồi.
 */

import type { VersionStorageAdapter } from "../types.ts";

/**
 * Khử khuẩn mã định danh để phòng chống triệt để Path Traversal (thư mục cha .., dấu chéo / \).
 * Chỉ cho phép ký tự chữ cái, số, gạch ngang và gạch dưới.
 */
export function sanitizeStorageId(id: string): string {
  if (!id || typeof id !== "string") {
    throw new Error("Mã định danh lưu trữ không được để trống.");
  }
  const trimmed = id.trim();
  // Chặn path traversal cơ bản
  if (trimmed === "." || trimmed === ".." || trimmed.includes("/") || trimmed.includes("\\")) {
    throw new Error(`Mã định danh không an toàn (phát hiện ký tự đường dẫn): "${id}"`);
  }
  const sanitized = trimmed.replace(/[^a-zA-Z0-9_-]/g, "_");
  if (!sanitized) {
    throw new Error(`Mã định danh không hợp lệ sau khi làm sạch: "${id}"`);
  }
  return sanitized;
}

export type { VersionStorageAdapter };
