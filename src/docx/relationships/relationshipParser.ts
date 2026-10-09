import { parseXmlString, getDirectChildrenByLocalName, getAttrValue } from "../utils/xmlUtils.ts";
import type { DocxRelationship, DocxRelationshipMap } from "../types/docxTypes.ts";

/**
 * Phân tích tệp quan hệ OOXML (word/_rels/document.xml.rels)
 */
export function parseRelationships(relsXml: string | undefined): DocxRelationshipMap {
  const map: DocxRelationshipMap = new Map();
  if (!relsXml || !relsXml.trim()) {
    return map;
  }

  try {
    const doc = parseXmlString(relsXml);
    const root = doc.documentElement;
    if (!root) return map;

    const relElements = getDirectChildrenByLocalName(root, "relationship");
    for (const el of relElements) {
      const id = getAttrValue(el, "id") || getAttrValue(el, "Id");
      const type = getAttrValue(el, "type") || getAttrValue(el, "Type");
      const target = getAttrValue(el, "target") || getAttrValue(el, "Target");
      const targetMode = getAttrValue(el, "targetmode") || getAttrValue(el, "TargetMode");

      if (id && target) {
        // Chuẩn hóa đường dẫn đích nếu là nội bộ
        let normalizedTarget = target;
        if (targetMode !== "External") {
          normalizedTarget = normalizeRelationshipTarget(target, "word");
        }

        const rel: DocxRelationship = {
          id,
          type: type || "",
          target: normalizedTarget,
          targetMode: targetMode === "External" ? "External" : "Internal",
        };
        map.set(id, rel);
      }
    }
  } catch (err) {
    // Không làm crash toàn doc nếu rels bị lỗi cú pháp nhỏ
    console.warn("Lỗi khi đọc file quan hệ document.xml.rels:", err);
  }

  return map;
}

/**
 * Chuẩn hóa đường dẫn tương đối của target bên trong file ZIP
 */
export function normalizeRelationshipTarget(target: string, basePath = "word"): string {
  if (target.startsWith("/")) {
    return target.substring(1).toLowerCase();
  }
  if (target.startsWith("../")) {
    return target.replace(/^\.\.\//, "").toLowerCase();
  }
  // Nếu tương đối so với thư mục word/
  return `${basePath}/${target}`.replace(/\/+/g, "/").toLowerCase();
}
