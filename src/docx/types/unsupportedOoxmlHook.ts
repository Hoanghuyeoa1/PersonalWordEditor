/**
 * Cơ chế neo siêu dữ liệu OOXML chưa hỗ trợ (Raw / Unsupported Metadata Hook)
 *
 * Nguyên tắc thiết kế:
 * 1. KHÔNG lưu raw XML tràn lan vào mọi AST node (tránh làm phình DocumentModel hoặc rò rỉ rác DOM).
 * 2. Chỉ kích hoạt khi có semantic justification rõ ràng (ví dụ: raw OMML XML cho equation,
 *    hoặc các OOXML parts độc lập của gói như theme, fontTable, settings).
 * 3. Bảo đảm an toàn: Mọi chuỗi XML trong hook phải được kiểm tra tính hợp lệ (parseable) trước khi lưu.
 */

import { parseXmlString } from "../utils/xmlUtils.ts";

/**
 * Các loại đối tượng được phép sử dụng node-level pass-through hook
 */
export type UnsupportedNodeHookKind =
  | "omml"           // Công thức toán Office Math nguyên bản (<m:oMath>)
  | "drawingAnchor"  // Định vị floating object nâng cao (<wp:anchor>)
  | "textBoxPr"      // Thuộc tính hộp văn bản nâng cao
  | "fieldInstr";    // Cú pháp trường phức tạp (<w:fldChar>)

/**
 * Cấu trúc Hook lưu trữ an toàn trong thuộc tính của ProseMirror Node (ví dụ node.attrs.ooxmlHook)
 */
export interface NodeOoxmlMetadataHook {
  kind: UnsupportedNodeHookKind;
  rawXml: string;
  sourcePart?: string;
}

/**
 * Kho lưu trữ các Part phụ của gói DOCX (Package-level Part Preservation)
 * Giúp bảo toàn word/theme/theme1.xml, word/settings.xml, word/fontTable.xml...
 * mà không ảnh hưởng tới cây AST ProseMirror.
 */
export interface PackagePartPreservation {
  partName: string;
  contentType: string;
  data: string | Uint8Array;
}

/**
 * Kiểm tra tính an toàn của một NodeOoxmlMetadataHook
 */
export function validateNodeOoxmlHook(hook: unknown): hook is NodeOoxmlMetadataHook {
  if (!hook || typeof hook !== "object") return false;
  const h = hook as Record<string, unknown>;

  if (typeof h.kind !== "string" || !["omml", "drawingAnchor", "textBoxPr", "fieldInstr"].includes(h.kind)) {
    return false;
  }

  if (typeof h.rawXml !== "string" || !h.rawXml.trim()) {
    return false;
  }

  // Xác thực XML parseable không chứa lỗi cú pháp
  try {
    parseXmlString(h.rawXml);
    return true;
  } catch {
    return false;
  }
}
