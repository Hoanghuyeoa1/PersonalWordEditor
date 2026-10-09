import type {
  DocxMediaItem,
  DocxMediaMap,
  DocxRelationshipMap,
} from "../types/docxTypes.ts";

/**
 * Ánh xạ phần mở rộng file sang MIME type
 */
const MIME_TYPE_MAP: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  bmp: "image/bmp",
  ico: "image/x-icon",
  tif: "image/tiff",
  tiff: "image/tiff",
};

/**
 * Chuyển đổi mảng Uint8Array thành chuỗi Base64 hoạt động an toàn cả trong Node.js và trình duyệt
 */
export function uint8ArrayToBase64(bytes: Uint8Array): string {
  const globalObj = globalThis as unknown as { Buffer?: { from: (b: Uint8Array) => { toString: (enc: string) => string } } };
  if (globalObj.Buffer) {
    return globalObj.Buffer.from(bytes).toString("base64");
  }

  // Trình duyệt (chunked để không bị Maximum call stack size exceeded với ảnh lớn)
  let binary = "";
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, Array.from(chunk));
  }
  return btoa(binary);
}

/**
 * Bộ nhớ đệm chuyển đổi media theo session để tránh decode cùng một mảng byte nhiều lần
 */
const sessionMediaCache = new WeakMap<Uint8Array, string>();

/**
 * Chuẩn hóa các biến thể đường dẫn media trong OOXML package (word/media/..., media/..., filename)
 */
export function normalizeMediaTargetPaths(target: string): string[] {
  if (!target) return [];
  const clean = target.replace(/\\/g, "/").toLowerCase().trim();
  const stripped = clean.replace(/^(\.\.\/)+/, "").replace(/^(\.\/)+/, "").replace(/^\/+/, "");
  const withoutWord = stripped.startsWith("word/") ? stripped.substring(5) : stripped;
  const withWord = stripped.startsWith("word/") ? stripped : `word/${stripped}`;
  const filename = stripped.split("/").pop() || stripped;

  return Array.from(new Set([clean, stripped, withoutWord, withWord, filename]));
}

/**
 * Phân tích và nạp toàn bộ các tệp media từ gói DOCX thành Data URL tự chứa
 * Đảm bảo:
 * - Không decode cùng ảnh nhiều lần trong một import session
 * - Tra cứu linh hoạt theo mọi biến thể đường dẫn (word/media/..., media/..., filename)
 */
export function parseMediaItems(
  mediaFiles: Map<string, Uint8Array>,
  relationships: DocxRelationshipMap
): { mediaByPath: DocxMediaMap; mediaByRelId: DocxMediaMap } {
  const mediaByPath: DocxMediaMap = new Map();
  const mediaByRelId: DocxMediaMap = new Map();

  for (const [zipPath, bytes] of mediaFiles.entries()) {
    const ext = zipPath.split(".").pop()?.toLowerCase() || "png";
    const mimeType = MIME_TYPE_MAP[ext] || "image/png";
    const filename = zipPath.split("/").pop() || "image.png";

    try {
      // Tái sử dụng base64 nếu mảng byte đã từng được chuyển đổi
      let dataUrl = sessionMediaCache.get(bytes);
      if (!dataUrl) {
        const base64 = uint8ArrayToBase64(bytes);
        dataUrl = `data:${mimeType};base64,${base64}`;
        sessionMediaCache.set(bytes, dataUrl);
      }

      const item: DocxMediaItem = {
        filename,
        zipPath,
        mimeType,
        dataUrl,
      };

      // Đăng ký toàn bộ các alias đường dẫn khả dĩ
      const aliases = normalizeMediaTargetPaths(zipPath);
      for (const alias of aliases) {
        mediaByPath.set(alias, item);
      }
    } catch (err) {
      console.warn(`Lỗi khi chuyển đổi media ${zipPath} thành base64:`, err);
    }
  }

  // Ghép media với relationship ID (rId)
  for (const [rId, rel] of relationships.entries()) {
    if (rel.target) {
      const targetVariants = normalizeMediaTargetPaths(rel.target);
      let matchedItem: DocxMediaItem | undefined;
      for (const variant of targetVariants) {
        matchedItem = mediaByPath.get(variant);
        if (matchedItem) break;
      }

      if (matchedItem) {
        mediaByRelId.set(rId, matchedItem);
      }
    }
  }

  return { mediaByPath, mediaByRelId };
}
