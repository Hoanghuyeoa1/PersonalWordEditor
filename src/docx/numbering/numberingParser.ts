import {
  parseXmlString,
  getDirectChildrenByLocalName,
  getAttrValue,
  getValAttribute,
  getFirstChildByLocalName,
} from "../utils/xmlUtils.ts";
import type {
  DocxNumberingLevel,
  DocxNumberingRegistry,
} from "../types/docxTypes.ts";

/**
 * Phân tích tệp word/numbering.xml thành cấu trúc định nghĩa danh sách có thứ bậc
 */
export function parseNumbering(numberingXml: string | undefined): DocxNumberingRegistry {
  const registry: DocxNumberingRegistry = {
    abstractNums: new Map(),
    numInstances: new Map(),
  };

  if (!numberingXml || !numberingXml.trim()) {
    return registry;
  }

  try {
    const doc = parseXmlString(numberingXml);
    const root = doc.documentElement;
    if (!root) return registry;

    // 1. Phân tích các <w:abstractNum>
    const abstractNumNodes = getDirectChildrenByLocalName(root, "abstractnum");
    for (const absEl of abstractNumNodes) {
      const id = getAttrValue(absEl, "abstractnumid");
      if (!id) continue;

      const levels = new Map<number, DocxNumberingLevel>();
      const lvlNodes = getDirectChildrenByLocalName(absEl, "lvl");

      for (const lvlEl of lvlNodes) {
        const ilvlStr = getAttrValue(lvlEl, "ilvl");
        const level = ilvlStr !== null ? parseInt(ilvlStr, 10) : 0;

        const numFmtEl = getFirstChildByLocalName(lvlEl, "numfmt");
        const numFmt = getValAttribute(numFmtEl) || "decimal";

        const lvlTextEl = getFirstChildByLocalName(lvlEl, "lvltext");
        const lvlText = getValAttribute(lvlTextEl) || "";

        const startEl = getFirstChildByLocalName(lvlEl, "start");
        const startVal = getValAttribute(startEl);
        const start = startVal ? parseInt(startVal, 10) : 1;

        const isBullet =
          numFmt.toLowerCase() === "bullet" ||
          lvlText === "" ||
          lvlText === "o" ||
          lvlText === "§";

        levels.set(level, {
          level,
          numFmt,
          lvlText,
          start,
          isBullet,
        });
      }

      registry.abstractNums.set(id, { id, levels });
    }

    // 2. Phân tích các <w:num> (liên kết numId -> abstractNumId)
    const numNodes = getDirectChildrenByLocalName(root, "num");
    for (const numEl of numNodes) {
      const numId = getAttrValue(numEl, "numid");
      if (!numId) continue;

      const absIdEl = getFirstChildByLocalName(numEl, "abstractnumid");
      const abstractNumId = getValAttribute(absIdEl);
      if (abstractNumId) {
        registry.numInstances.set(numId, {
          numId,
          abstractNumId,
        });
      }
    }
  } catch (err) {
    console.warn("Lỗi khi đọc file word/numbering.xml:", err);
  }

  return registry;
}

/**
 * Xác định xem một cặp (numId, ilvl) có phải là bullet list hay ordered list
 */
export function resolveListType(
  registry: DocxNumberingRegistry,
  numId: number | string,
  ilvl: number
): { isBullet: boolean; listType: "bulletList" | "orderedList" } {
  const numIdStr = String(numId);
  const numInstance = registry.numInstances.get(numIdStr);

  if (numInstance) {
    const abstractNum = registry.abstractNums.get(numInstance.abstractNumId);
    if (abstractNum) {
      const lvl = abstractNum.levels.get(ilvl) || abstractNum.levels.get(0);
      if (lvl) {
        return {
          isBullet: lvl.isBullet,
          listType: lvl.isBullet ? "bulletList" : "orderedList",
        };
      }
    }
  }

  // Fallback nếu không tìm thấy trong registry
  return {
    isBullet: false,
    listType: "bulletList",
  };
}
