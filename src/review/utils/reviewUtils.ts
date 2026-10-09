/**
 * Review Utilities - Personal Word Editor (Phase 5.1 Architecture)
 */

/**
 * Định dạng số với dấu phân cách hàng nghìn
 */
export function formatNumber(val: number): string {
  return (val || 0).toLocaleString("vi-VN");
}

/**
 * Rút gọn chuỗi văn bản trích dẫn (ví dụ cho comment preview)
 */
export function truncateText(text: string, maxLength = 60): string {
  if (!text || text.length <= maxLength) return text || "";
  return text.substring(0, maxLength).trim() + "...";
}
