/**
 * Tiện ích thoát ký tự đặc biệt cho XML (XML Escaping)
 */
export function escapeXmlText(str: string): string {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function escapeXmlAttr(str: string): string {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Tạo thẻ <w:t> bảo toàn khoảng trắng nếu cần
 */
export function buildTextElement(text: string): string {
  if (!text) return "";
  const needsPreserve =
    text.startsWith(" ") ||
    text.endsWith(" ") ||
    text.includes("  ") ||
    text.includes("\t") ||
    text.includes("\n");

  const escaped = escapeXmlText(text);
  if (needsPreserve) {
    return `<w:t xml:space="preserve">${escaped}</w:t>`;
  }
  return `<w:t>${escaped}</w:t>`;
}
