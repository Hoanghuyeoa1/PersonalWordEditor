import {
  parseXmlString,
  getDirectChildrenByLocalName,
  getFirstChildByLocalName,
  getValAttribute,
  getLocalName,
  findDescendantByLocalName,
  getAttrValue,
} from "../utils/xmlUtils.ts";
import type {
  HeaderFooterItem,
  HeaderFooterAlignment,
  HeaderFooterImage,
  SectionHeaderFooter,
} from "../../page/types/headerFooterTypes.ts";
import {
  DEFAULT_HEADER_CONTENT,
  DEFAULT_FOOTER_CONTENT,
  DEFAULT_SECTION_HEADER_FOOTER,
} from "../../page/types/headerFooterTypes.ts";
import type { DocxRelationshipMap, DocxMediaMap } from "../types/docxTypes.ts";

import { ComplexFieldParser } from "../../fields/parser/complexFieldParser.ts";
import type { FieldAttributes } from "../../fields/types/fieldTypes.ts";

function fieldAttrsToHeaderFooterToken(fieldAttrs: FieldAttributes): string {
  switch (fieldAttrs.fieldType) {
    case "PAGE":
      return "{PAGE}";
    case "NUMPAGES":
      return "{NUMPAGES}";
    case "SECTIONPAGES":
      return "{SECTIONPAGES}";
    case "SECTION":
      return "{SECTION}";
    case "TITLE":
      return "{TITLE}";
    case "AUTHOR":
      return "{AUTHOR}";
    case "DATE":
      return "{DATE}";
    case "TIME":
      return "{TIME}";
    default:
      return fieldAttrs.result || fieldAttrs.instruction || "";
  }
}

function extractHfImage(
  el: Element,
  partRels?: DocxRelationshipMap,
  mediaByPath?: DocxMediaMap,
  mediaByRelId?: DocxMediaMap
): HeaderFooterImage | null {
  const blip = findDescendantByLocalName(el, "blip");
  const imagedata = findDescendantByLocalName(el, "imagedata");
  const rId =
    getAttrValue(blip as any, "embed") ||
    getAttrValue(blip as any, "id") ||
    getAttrValue(imagedata as any, "id") ||
    getAttrValue(imagedata as any, "href");

  if (!rId) return null;

  let mediaItem = mediaByRelId?.get(rId);
  if (!mediaItem && partRels) {
    const rel = partRels.get(rId);
    if (rel && rel.target && mediaByPath) {
      const clean = rel.target.replace(/\\/g, "/").toLowerCase().trim();
      const stripped = clean.replace(/^(\.\.\/)+/, "").replace(/^(\.\/)+/, "").replace(/^\/+/, "");
      const withoutWord = stripped.startsWith("word/") ? stripped.substring(5) : stripped;
      const withWord = stripped.startsWith("word/") ? stripped : `word/${stripped}`;
      const filename = stripped.split("/").pop() || stripped;
      mediaItem =
        mediaByPath.get(clean) ||
        mediaByPath.get(stripped) ||
        mediaByPath.get(withoutWord) ||
        mediaByPath.get(withWord) ||
        mediaByPath.get(filename);
    }
  }

  if (mediaItem) {
    return {
      src: mediaItem.dataUrl,
      width: 120,
      height: 40,
    };
  }
  return null;
}

/**
 * Phân tích nội dung của một tệp header.xml hoặc footer.xml thành HeaderFooterItem
 * Tái sử dụng ComplexFieldParser và hỗ trợ nhận diện hình ảnh/media (Phase 12).
 */
export function parseHeaderFooterXml(
  xmlContent: string | undefined,
  relationships?: DocxRelationshipMap,
  mediaByPath?: DocxMediaMap,
  mediaByRelId?: DocxMediaMap
): HeaderFooterItem | null {
  if (!xmlContent || !xmlContent.trim()) {
    return null;
  }

  try {
    const doc = parseXmlString(xmlContent);
    const root = doc.documentElement;
    if (!root) return null;

    let textPieces: string[] = [];
    let alignment: HeaderFooterAlignment = "center";
    let isBold = false;
    let isItalic = false;
    const extractedImages: HeaderFooterImage[] = [];

    // Duyệt qua các paragraph trong header/footer
    const paragraphs = getDirectChildrenByLocalName(root, "p");
    for (const p of paragraphs) {
      // 1. Phân tích căn lề từ w:pPr/w:jc
      const pPr = getFirstChildByLocalName(p, "ppr");
      if (pPr) {
        const jc = getFirstChildByLocalName(pPr, "jc");
        const jcVal = (getValAttribute(jc) || "").toLowerCase();
        if (jcVal === "left") alignment = "left";
        else if (jcVal === "right") alignment = "right";
        else if (jcVal === "center") alignment = "center";
      }

      // 2. Phân tích nội dung các runs, drawings và fields bằng ComplexFieldParser (Phase 4 & Phase 12)
      const fieldParser = new ComplexFieldParser();
      for (let i = 0; i < p.childNodes.length; i++) {
        const child = p.childNodes[i];
        if (child.nodeType !== 1) continue;
        const local = getLocalName(child).toLowerCase();

        // Simple Field (ví dụ: <w:fldSimple w:instr="PAGE"/>)
        if (local === "fldsimple") {
          const { fieldAttrs } = fieldParser.parseFldSimple(child as Element);
          textPieces.push(fieldAttrsToHeaderFooterToken(fieldAttrs));
          continue;
        }

        // Drawing trực tiếp dưới paragraph (<w:drawing> hoặc <w:pict>)
        if (local === "drawing" || local === "pict") {
          const hfImg = extractHfImage(child as Element, relationships, mediaByPath, mediaByRelId);
          if (hfImg) {
            extractedImages.push(hfImg);
          }
          continue;
        }

        // Run (<w:r>)
        if (local === "r") {
          const rEl = child as Element;
          const rPr = getFirstChildByLocalName(rEl, "rpr");
          if (rPr) {
            const b = getFirstChildByLocalName(rPr, "b");
            if (b) {
              const v = getValAttribute(b);
              if (v === null || v === "1" || v === "true" || v === "on") isBold = true;
            }
            const it = getFirstChildByLocalName(rPr, "i");
            if (it) {
              const v = getValAttribute(it);
              if (v === null || v === "1" || v === "true" || v === "on") isItalic = true;
            }
          }

          for (let k = 0; k < rEl.childNodes.length; k++) {
            const rChild = rEl.childNodes[k];
            if (rChild.nodeType !== 1) continue;
            const childLocal = getLocalName(rChild).toLowerCase();

            if (childLocal === "fldchar") {
              const completedField = fieldParser.handleFldChar(rChild as Element, rPr);
              if (completedField) {
                textPieces.push(fieldAttrsToHeaderFooterToken(completedField));
              }
            } else if (childLocal === "instrtext") {
              fieldParser.appendInstructionText(rChild.textContent || "");
            } else if (childLocal === "t") {
              const textContent = rChild.textContent || "";
              if (fieldParser.isInField) {
                fieldParser.appendResultText(textContent);
              } else {
                textPieces.push(textContent);
              }
            } else if (childLocal === "drawing" || childLocal === "pict") {
              const hfImg = extractHfImage(rChild as Element, relationships, mediaByPath, mediaByRelId);
              if (hfImg) {
                extractedImages.push(hfImg);
              }
            }
          }
        }
      }

      const flushed = fieldParser.flushRemainingFrames();
      for (const f of flushed) {
        textPieces.push(fieldAttrsToHeaderFooterToken(f));
      }
    }

    const rawText = textPieces.join("").trim();
    if (!rawText && extractedImages.length === 0) return null;

    const item: HeaderFooterItem = {
      text: rawText,
      alignment,
    };
    if (isBold) item.bold = true;
    if (isItalic) item.italic = true;
    if (extractedImages.length > 0) {
      item.image = extractedImages[0];
      if (extractedImages.length > 1) {
        item.images = extractedImages;
      }
    }

    return item;
  } catch (err) {
    console.warn("Lỗi khi đọc header/footer xml:", err);
    return null;
  }
}

/**
 * Trích xuất SectionHeaderFooter từ <w:sectPr> và các part headers/footers
 */
export function extractSectionHeaderFooter(
  sectPrEl: Element | null,
  relationships: DocxRelationshipMap,
  headersXmlMap: Map<string, string>,
  footersXmlMap: Map<string, string>,
  headerRelsMap?: Map<string, DocxRelationshipMap>,
  footerRelsMap?: Map<string, DocxRelationshipMap>,
  mediaByPath?: DocxMediaMap,
  mediaByRelId?: DocxMediaMap,
  parsedHeaderCache?: Map<string, HeaderFooterItem | null>,
  parsedFooterCache?: Map<string, HeaderFooterItem | null>
): SectionHeaderFooter {
  let headerItem: HeaderFooterItem = { ...DEFAULT_HEADER_CONTENT };
  let footerItem: HeaderFooterItem = { ...DEFAULT_FOOTER_CONTENT };

  if (!sectPrEl) {
    return { ...DEFAULT_SECTION_HEADER_FOOTER };
  }

  // 1. Tìm header reference
  const headerRefs = getDirectChildrenByLocalName(sectPrEl, "headerreference");
  for (const ref of headerRefs) {
    const type = getValAttribute(getFirstChildByLocalName(ref, "type")) || ref.getAttribute("w:type") || "default";
    const rId = ref.getAttribute("r:id") || ref.getAttribute("id");
    if (rId && (type === "default" || headerRefs.length === 1)) {
      const rel = relationships.get(rId);
      if (rel && rel.target) {
        const targetLower = rel.target.toLowerCase();
        let parsed = parsedHeaderCache?.get(targetLower);
        if (parsed === undefined) {
          const xml = headersXmlMap.get(targetLower);
          const partRels = headerRelsMap?.get(targetLower) || relationships;
          parsed = parseHeaderFooterXml(xml, partRels, mediaByPath, mediaByRelId);
          if (parsedHeaderCache) {
            parsedHeaderCache.set(targetLower, parsed);
          }
        }
        if (parsed) {
          headerItem = parsed;
        }
      }
    }
  }

  // 2. Tìm footer reference
  const footerRefs = getDirectChildrenByLocalName(sectPrEl, "footerreference");
  for (const ref of footerRefs) {
    const type = getValAttribute(getFirstChildByLocalName(ref, "type")) || ref.getAttribute("w:type") || "default";
    const rId = ref.getAttribute("r:id") || ref.getAttribute("id");
    if (rId && (type === "default" || footerRefs.length === 1)) {
      const rel = relationships.get(rId);
      if (rel && rel.target) {
        const targetLower = rel.target.toLowerCase();
        let parsed = parsedFooterCache?.get(targetLower);
        if (parsed === undefined) {
          const xml = footersXmlMap.get(targetLower);
          const partRels = footerRelsMap?.get(targetLower) || relationships;
          parsed = parseHeaderFooterXml(xml, partRels, mediaByPath, mediaByRelId);
          if (parsedFooterCache) {
            parsedFooterCache.set(targetLower, parsed);
          }
        }
        if (parsed) {
          footerItem = parsed;
        }
      }
    }
  }

  return {
    linkToPrevious: false,
    header: headerItem,
    footer: footerItem,
  };
}
