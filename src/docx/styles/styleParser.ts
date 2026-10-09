import {
  parseXmlString,
  getDirectChildrenByLocalName,
  getFirstChildByLocalName,
  getAttrValue,
  getValAttribute,
  halfPointsToPt,
  normalizeHexColor,
  normalizeHighlightColor,
  twipsToPt,
  parseOoxmlBooleanElement,
} from "../utils/xmlUtils.ts";
import type {
  DocxStyle,
  DocxStyleMap,
  DocxRunFormatting,
  DocxParagraphFormatting,
} from "../types/docxTypes.ts";

/**
 * Trích xuất định dạng Run (w:rPr)
 */
export function parseRunProperties(rPrEl: Element | null): DocxRunFormatting {
  if (!rPrEl) return {};

  const formatting: DocxRunFormatting = {};

  // Bold
  const bEl = getFirstChildByLocalName(rPrEl, "b");
  if (bEl) {
    const val = getValAttribute(bEl);
    formatting.bold = val === null || val === "1" || val === "true" || val === "on";
  }

  // Italic
  const iEl = getFirstChildByLocalName(rPrEl, "i");
  if (iEl) {
    const val = getValAttribute(iEl);
    formatting.italic = val === null || val === "1" || val === "true" || val === "on";
  }

  // Underline
  const uEl = getFirstChildByLocalName(rPrEl, "u");
  if (uEl) {
    const val = getValAttribute(uEl);
    formatting.underline = val !== "none";
  }

  // Strike
  const strikeEl = getFirstChildByLocalName(rPrEl, "strike");
  if (strikeEl) {
    const val = getValAttribute(strikeEl);
    formatting.strike = val === null || val === "1" || val === "true" || val === "on";
  }

  // Font family
  const rFontsEl = getFirstChildByLocalName(rPrEl, "rfonts");
  if (rFontsEl) {
    const font =
      getAttrValue(rFontsEl, "ascii") ||
      getAttrValue(rFontsEl, "hansi") ||
      getAttrValue(rFontsEl, "cs");
    if (font) {
      formatting.fontFamily = font;
    }
  }

  // Font size (half-points -> pt)
  const szEl = getFirstChildByLocalName(rPrEl, "sz");
  if (szEl) {
    const val = getValAttribute(szEl);
    if (val) {
      const halfPoints = parseInt(val, 10);
      if (!isNaN(halfPoints)) {
        formatting.fontSizePt = halfPointsToPt(halfPoints);
      }
    }
  }

  // Color
  const colorEl = getFirstChildByLocalName(rPrEl, "color");
  if (colorEl) {
    const colorHex = normalizeHexColor(getValAttribute(colorEl));
    if (colorHex) {
      formatting.color = colorHex;
    }
  }

  // Highlight
  const highlightEl = getFirstChildByLocalName(rPrEl, "highlight");
  if (highlightEl) {
    const hl = normalizeHighlightColor(getValAttribute(highlightEl));
    if (hl) {
      formatting.highlight = hl;
    }
  }

  return formatting;
}

import { normalizeFirstLineAndHanging } from "../../styles/utils/unitConversion.ts";

/**
 * Trích xuất định dạng Paragraph (w:pPr)
 */
export function parseParagraphProperties(pPrEl: Element | null): DocxParagraphFormatting {
  if (!pPrEl) return {};

  const formatting: DocxParagraphFormatting = {};

  // Căn lề (w:jc)
  const jcEl = getFirstChildByLocalName(pPrEl, "jc");
  if (jcEl) {
    const val = (getValAttribute(jcEl) || "").toLowerCase();
    if (val === "left") formatting.alignment = "left";
    else if (val === "center") formatting.alignment = "center";
    else if (val === "right") formatting.alignment = "right";
    else if (val === "both" || val === "justify") formatting.alignment = "justify";
  }

  // Giãn dòng và khoảng cách đoạn (w:spacing)
  const spacingEl = getFirstChildByLocalName(pPrEl, "spacing");
  if (spacingEl) {
    const lineVal = getAttrValue(spacingEl, "line");
    if (lineVal) {
      const lineNum = parseInt(lineVal, 10);
      if (!isNaN(lineNum) && lineNum > 0) {
        // 240 twips = 1.0 (single)
        const ratio = lineNum / 240;
        if (Math.abs(ratio - 1.0) < 0.05) formatting.lineSpacing = 1.0;
        else if (Math.abs(ratio - 1.15) < 0.05) formatting.lineSpacing = 1.15;
        else if (Math.abs(ratio - 1.5) < 0.05) formatting.lineSpacing = 1.5;
        else if (Math.abs(ratio - 2.0) < 0.05) formatting.lineSpacing = 2.0;
        else formatting.lineSpacing = Math.round(ratio * 100) / 100;
      }
    }

    // Khoảng cách trước đoạn (w:before in twips -> pt)
    const beforeVal = getAttrValue(spacingEl, "before");
    if (beforeVal) {
      const beforeTwips = parseInt(beforeVal, 10);
      if (!isNaN(beforeTwips) && beforeTwips >= 0) {
        formatting.spacingBefore = twipsToPt(beforeTwips);
      }
    }

    // Khoảng cách sau đoạn (w:after in twips -> pt)
    const afterVal = getAttrValue(spacingEl, "after");
    if (afterVal) {
      const afterTwips = parseInt(afterVal, 10);
      if (!isNaN(afterTwips) && afterTwips >= 0) {
        formatting.spacingAfter = twipsToPt(afterTwips);
      }
    }
  }

  // Thụt lề (w:ind)
  const indEl = getFirstChildByLocalName(pPrEl, "ind");
  if (indEl) {
    // Thụt lề trái (w:left in twips -> pt)
    const leftVal = getAttrValue(indEl, "left");
    if (leftVal) {
      const leftTwips = parseInt(leftVal, 10);
      if (!isNaN(leftTwips) && leftTwips >= 0) {
        formatting.leftIndent = twipsToPt(leftTwips);
        // Mỗi nấc indent trong editor tương đương ~36pt (0.5 inch = 720 twips)
        const indentLevel = Math.min(8, Math.max(0, Math.round(formatting.leftIndent / 36)));
        if (indentLevel > 0) {
          formatting.indent = indentLevel;
        }
      }
    }

    // Thụt lề phải (w:right in twips -> pt)
    const rightVal = getAttrValue(indEl, "right");
    if (rightVal) {
      const rightTwips = parseInt(rightVal, 10);
      if (!isNaN(rightTwips) && rightTwips >= 0) {
        formatting.rightIndent = twipsToPt(rightTwips);
      }
    }

    // Thụt lề dòng đầu (w:firstLine in twips -> pt)
    const firstLineVal = getAttrValue(indEl, "firstline");
    if (firstLineVal) {
      const flTwips = parseInt(firstLineVal, 10);
      if (!isNaN(flTwips) && flTwips >= 0) {
        formatting.firstLineIndent = twipsToPt(flTwips);
      }
    }

    // Nhô lề dòng đầu (w:hanging in twips -> pt)
    const hangingVal = getAttrValue(indEl, "hanging");
    if (hangingVal) {
      const hangTwips = parseInt(hangingVal, 10);
      if (!isNaN(hangTwips) && hangTwips >= 0) {
        formatting.hangingIndent = twipsToPt(hangTwips);
      }
    }

    // Chuẩn hóa và xử lý loại trừ lẫn nhau giữa firstLine và hanging
    if (formatting.firstLineIndent !== undefined || formatting.hangingIndent !== undefined) {
      const norm = normalizeFirstLineAndHanging(formatting.firstLineIndent, formatting.hangingIndent);
      formatting.firstLineIndent = norm.firstLineIndent;
      formatting.hangingIndent = norm.hangingIndent;
    }
  }

  // Danh sách (w:numPr)
  const numPrEl = getFirstChildByLocalName(pPrEl, "numpr");
  if (numPrEl) {
    const numIdEl = getFirstChildByLocalName(numPrEl, "numid");
    const ilvlEl = getFirstChildByLocalName(numPrEl, "ilvl");
    const numId = numIdEl ? parseInt(getValAttribute(numIdEl) || "0", 10) : 0;
    const ilvl = ilvlEl ? parseInt(getValAttribute(ilvlEl) || "0", 10) : 0;

    if (numId > 0) {
      formatting.numPr = { numId, ilvl };
    }
  }

  // Page break trước đoạn văn (w:pageBreakBefore)
  const pbbEl = getFirstChildByLocalName(pPrEl, "pagebreakbefore");
  if (pbbEl) {
    const val = parseOoxmlBooleanElement(pbbEl);
    if (val !== undefined) formatting.pageBreakBefore = val;
  }

  // Keep with next (w:keepNext)
  const knEl = getFirstChildByLocalName(pPrEl, "keepnext");
  if (knEl) {
    const val = parseOoxmlBooleanElement(knEl);
    if (val !== undefined) formatting.keepWithNext = val;
  }

  // Keep lines together (w:keepLines)
  const klEl = getFirstChildByLocalName(pPrEl, "keeplines");
  if (klEl) {
    const val = parseOoxmlBooleanElement(klEl);
    if (val !== undefined) formatting.keepLinesTogether = val;
  }

  // Widow / orphan control (w:widowControl)
  const wcEl = getFirstChildByLocalName(pPrEl, "widowcontrol");
  if (wcEl) {
    const val = parseOoxmlBooleanElement(wcEl);
    if (val !== undefined) formatting.widowControl = val;
  }

  // Outline level
  const outlineEl = getFirstChildByLocalName(pPrEl, "outlinelvl");
  if (outlineEl) {
    const val = getValAttribute(outlineEl);
    if (val !== null) {
      const lvl = parseInt(val, 10);
      if (lvl === 0) formatting.headingLevel = 1;
      else if (lvl === 1) formatting.headingLevel = 2;
      else if (lvl === 2) formatting.headingLevel = 3;
    }
  }

  return formatting;
}

/**
 * Nhận diện cấp độ Heading từ Style ID hoặc Tên Style
 */
function detectHeadingLevel(styleId: string, name: string): 1 | 2 | 3 | undefined {
  const combined = `${styleId} ${name}`.toLowerCase();
  if (
    combined.includes("heading 1") ||
    combined.includes("heading1") ||
    combined === "h1" ||
    combined.includes("tiêu đề 1")
  ) {
    return 1;
  }
  if (
    combined.includes("heading 2") ||
    combined.includes("heading2") ||
    combined === "h2" ||
    combined.includes("tiêu đề 2")
  ) {
    return 2;
  }
  if (
    combined.includes("heading 3") ||
    combined.includes("heading3") ||
    combined === "h3" ||
    combined.includes("tiêu đề 3")
  ) {
    return 3;
  }
  return undefined;
}

/**
 * Phân tích tệp word/styles.xml và giải quyết tính kế thừa (inheritance)
 */
export function parseStyles(stylesXml: string | undefined): DocxStyleMap {
  const rawStyles = new Map<string, DocxStyle>();
  if (!stylesXml || !stylesXml.trim()) {
    return rawStyles;
  }

  try {
    const doc = parseXmlString(stylesXml);
    const root = doc.documentElement;
    if (!root) return rawStyles;

    const styleNodes = getDirectChildrenByLocalName(root, "style");
    for (const styleEl of styleNodes) {
      const id = getAttrValue(styleEl, "styleid");
      if (!id) continue;

      const type = (getAttrValue(styleEl, "type") || "paragraph") as DocxStyle["type"];
      const isDefault = getAttrValue(styleEl, "default") === "1";

      const nameEl = getFirstChildByLocalName(styleEl, "name");
      const name = getValAttribute(nameEl) || id;

      const basedOnEl = getFirstChildByLocalName(styleEl, "basedon");
      const basedOn = getValAttribute(basedOnEl) || undefined;

      const nextEl = getFirstChildByLocalName(styleEl, "next");
      const nextStyleId = getValAttribute(nextEl) || undefined;

      const linkEl = getFirstChildByLocalName(styleEl, "link");
      const linkStyleId = getValAttribute(linkEl) || undefined;

      const qFormatEl = getFirstChildByLocalName(styleEl, "qformat");
      const qFormat = qFormatEl !== null ? (parseOoxmlBooleanElement(qFormatEl) ?? true) : undefined;

      const rPrEl = getFirstChildByLocalName(styleEl, "rpr");
      const pPrEl = getFirstChildByLocalName(styleEl, "ppr");

      const runFormatting = parseRunProperties(rPrEl);
      const paragraphFormatting = parseParagraphProperties(pPrEl);

      const headingLevel =
        paragraphFormatting.headingLevel || detectHeadingLevel(id, name);

      const style: DocxStyle = {
        id,
        name,
        type,
        basedOn,
        nextStyleId,
        linkStyleId,
        isDefault,
        qFormat,
        headingLevel,
        runFormatting,
        paragraphFormatting,
        rawRunFormatting: { ...runFormatting },
        rawParagraphFormatting: { ...paragraphFormatting },
      };

      rawStyles.set(id, style);
      // Đăng ký cả lowercase key để tra cứu linh hoạt
      rawStyles.set(id.toLowerCase(), style);
    }
  } catch (err) {
    console.warn("Lỗi khi đọc file word/styles.xml:", err);
  }

  // Giải quyết kế thừa (Inheritance basedOn)
  const resolvedStyles: DocxStyleMap = new Map();
  for (const [key, style] of rawStyles.entries()) {
    resolvedStyles.set(key, resolveStyleInheritance(style, rawStyles));
  }

  return resolvedStyles;
}

/**
 * Kế thừa đệ quy các thuộc tính từ cha (Inheritance Resolution với Cycle Protection)
 */
function resolveStyleInheritance(
  style: DocxStyle,
  stylesMap: Map<string, DocxStyle>,
  visited: Set<string> = new Set()
): DocxStyle {
  if (
    !style.basedOn ||
    style.basedOn.toLowerCase() === style.id.toLowerCase() ||
    visited.has(style.id.toLowerCase())
  ) {
    return style;
  }

  visited.add(style.id.toLowerCase());
  const parent = stylesMap.get(style.basedOn) || stylesMap.get(style.basedOn.toLowerCase());
  if (!parent) return style;

  const resolvedParent = resolveStyleInheritance(parent, stylesMap, visited);

  return {
    ...style,
    headingLevel: style.headingLevel ?? resolvedParent.headingLevel,
    runFormatting: {
      ...resolvedParent.runFormatting,
      ...style.runFormatting,
    },
    paragraphFormatting: {
      ...resolvedParent.paragraphFormatting,
      ...style.paragraphFormatting,
    },
    rawRunFormatting: style.rawRunFormatting,
    rawParagraphFormatting: style.rawParagraphFormatting,
  };
}
