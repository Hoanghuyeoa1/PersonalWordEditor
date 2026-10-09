import type { JSONContent } from "@tiptap/core";
import {
  parseXmlString,
  getDirectChildrenByLocalName,
  getFirstChildByLocalName,
  findDescendantByLocalName,
  getAttrValue,
  getValAttribute,
  getLocalName,
  emuToPixels,
} from "../utils/xmlUtils.ts";
import type {
  DocxStyleMap,
  DocxStyle,
  DocxRunFormatting,
  DocxRelationshipMap,
  DocxMediaMap,
  DocxNumberingRegistry,
  DocxCommentMap,
} from "../types/docxTypes.ts";
import { resolveListType } from "../numbering/numberingParser.ts";
import { parseSectionPageSettings } from "./pageSettingsMapper.ts";
import { extractSectionHeaderFooter } from "./headerFooterMapper.ts";
import { parseRunProperties, parseParagraphProperties } from "../styles/styleParser.ts";
import type { PageSettings } from "../../page/types/pageTypes.ts";
import type { SectionHeaderFooter } from "../../page/types/headerFooterTypes.ts";
import type { CommentItem, TrackChangeItem } from "../../document/documentTypes.ts";
import { ReferenceAnchorService } from "../../references/services/referenceAnchorService.ts";
import { BookmarkService } from "../../references/services/bookmarkService.ts";
import { ComplexFieldParser } from "../../fields/parser/complexFieldParser.ts";
import type { FieldAttributes } from "../../fields/types/fieldTypes.ts";
import { OmmlEngine } from "../omml/ommlEngine.ts";
import type { DocumentStylesMetadata } from "../../styles/types/styleTypes.ts";
import {
  DocxFormattingRevisionMapper,
  type ParsedRunPropertiesChange,
  type ParsedParagraphPropertiesChange,
} from "./docxFormattingRevisionMapper.ts";
import {
  STYLE_NORMAL_ID,
  STYLE_HEADING_1_ID,
  STYLE_HEADING_2_ID,
  STYLE_HEADING_3_ID,
} from "../../styles/services/builtInStyles.ts";
import {
  validateAndNormalizeCellMargins,
  type CellMargins,
  type RowHeightRule,
} from "../../editor/tableDimensionService.ts";
import {
  DEFAULT_TABLE_STYLE_OPTIONS,
  type TableStyleId,
  type TableStyleOptions,
} from "../../editor/tableStyleService.ts";
import type { TableBorderStyle, TableLayoutMode } from "../../editor/tableExtensions.ts";
import { parseDrawingElement } from "../drawing/drawingPositionParser.ts";
import type { DrawingPosition } from "../drawing/drawingTypes.ts";

import type { DocxDiagnosticsReporter } from "../diagnostics/docxDiagnostics.ts";

export interface DocumentMapperContext {
  styles: DocxStyleMap;
  styleIdMap?: Map<string, string>;
  documentStyles?: DocumentStylesMetadata;
  relationships: DocxRelationshipMap;
  mediaByRelId: DocxMediaMap;
  mediaByPath: DocxMediaMap;
  numbering: DocxNumberingRegistry;
  headersXmlMap: Map<string, string>;
  footersXmlMap: Map<string, string>;
  headerRelsMap?: Map<string, DocxRelationshipMap>;
  footerRelsMap?: Map<string, DocxRelationshipMap>;
  warnings: string[];
  diagnostics?: DocxDiagnosticsReporter;
  comments?: DocxCommentMap;
  activeCommentIds?: Set<string>;
  commentAnchorTexts?: Map<string, string[]>;
  trackedChangesMap?: Map<string, TrackChangeItem>;
  footnotes?: Map<string, string>;
  endnotes?: Map<string, string>;
  activeBookmarks?: Map<string, { id: string; name: string; hasContent: boolean }>;
  importedBookmarkNames?: Map<string, string>;
  parsedHeaderCache?: Map<string, any>;
  parsedFooterCache?: Map<string, any>;
}

/**
 * Trích xuất nội dung văn bản từ word/footnotes.xml hoặc word/endnotes.xml
 */
export function parseDocxNotesXml(
  xmlStr?: string,
  itemTagName: "footnote" | "endnote" = "footnote"
): Map<string, string> {
  const map = new Map<string, string>();
  if (!xmlStr) return map;
  try {
    const doc = parseXmlString(xmlStr);
    const root = doc.documentElement;
    if (!root) return map;
    const notes = getDirectChildrenByLocalName(root, itemTagName);
    for (const noteEl of notes) {
      const id = getAttrValue(noteEl, "id");
      const type = getAttrValue(noteEl, "type");
      if (type === "separator" || type === "continuationSeparator" || id === "-1" || id === "0") {
        continue;
      }
      if (id !== null) {
        let text = "";
        const pEls = getDirectChildrenByLocalName(noteEl, "p");
        for (const pEl of pEls) {
          const rEls = getDirectChildrenByLocalName(pEl, "r");
          for (const rEl of rEls) {
            const tEl = getFirstChildByLocalName(rEl, "t");
            if (tEl && tEl.textContent) {
              text += tEl.textContent;
            }
          }
        }
        map.set(id, text.trim());
      }
    }
  } catch {
    // Safe ignore
  }
  return map;
}

export interface MappedDocumentResult {
  content: JSONContent;
  initialPageSettings: PageSettings;
  initialHeaderFooter: SectionHeaderFooter;
  comments?: CommentItem[];
  trackedChanges?: TrackChangeItem[];
}

function recordTrackChangeItem(
  ctx: DocumentMapperContext,
  item: TrackChangeItem,
  textPiece?: string
): string {
  if (!ctx.trackedChangesMap) {
    ctx.trackedChangesMap = new Map();
  }
  let finalId = item.id;
  const existing = ctx.trackedChangesMap.get(finalId);
  if (!existing) {
    ctx.trackedChangesMap.set(finalId, {
      ...item,
      id: finalId,
      text: textPiece || item.text || "",
    });
    return finalId;
  }

  // Nếu cùng revision (cùng author, cùng type, cùng formatDetails hoặc scope) được phân mảnh do run segmentation
  if (
    existing.author === item.author &&
    existing.type === item.type &&
    (existing.formatDetails === item.formatDetails || existing.scope === item.scope)
  ) {
    if (textPiece) {
      existing.text = (existing.text || "") + textPiece;
    }
    return finalId;
  }

  // Nếu bị trùng ID do tài liệu Word bị lỗi (Malformed OOXML duplicate ID) nhưng là revision khác nhau
  let counter = 2;
  while (ctx.trackedChangesMap.has(`${finalId}_dup${counter}`)) {
    counter++;
  }
  finalId = `${finalId}_dup${counter}`;
  const disambiguatedItem: TrackChangeItem = {
    ...item,
    id: finalId,
    text: textPiece || item.text || "",
    ...(item.formatChange
      ? {
          formatChange: {
            ...item.formatChange,
          },
        }
      : {}),
  };
  ctx.trackedChangesMap.set(finalId, disambiguatedItem);
  ctx.diagnostics?.recordApproximated(
    "TrackChanges",
    "DUPLICATE_REVISION_ID_DISAMBIGUATED",
    `Phát hiện ID revision trùng lặp "${item.id}"; đã phân giải thành "${finalId}".`
  );
  return finalId;
}

function recordTrackChange(
  ctx: DocumentMapperContext,
  id: string,
  type: "insert" | "delete",
  author: string,
  timestamp: string,
  textPiece: string
) {
  recordTrackChangeItem(
    ctx,
    {
      id,
      type,
      author,
      timestamp,
      status: "pending",
      text: textPiece,
    },
    textPiece
  );
}

function recordCommentAnchor(
  ctx: DocumentMapperContext,
  commentId: string,
  textPiece: string
) {
  if (!ctx.commentAnchorTexts) {
    ctx.commentAnchorTexts = new Map();
  }
  const arr = ctx.commentAnchorTexts.get(commentId) || [];
  arr.push(textPiece);
  ctx.commentAnchorTexts.set(commentId, arr);
}

/**
 * Trích xuất thuộc tính hình ảnh từ phần tử drawing hoặc pict
 */
function extractImageInfo(
  node: Element,
  ctx: DocumentMapperContext
): { src: string; width: number; height: number } | null {
  // 1. DrawingML (<w:drawing>)
  const blipEl = findDescendantByLocalName(node, "blip");
  const extentEl = findDescendantByLocalName(node, "extent");

  let embedId: string | null = null;
  if (blipEl) {
    embedId =
      blipEl.getAttribute("r:embed") ||
      blipEl.getAttribute("embed") ||
      blipEl.getAttribute("r:id") ||
      blipEl.getAttribute("id");
  }

  // 2. VML (<w:pict>/<v:imagedata>)
  if (!embedId) {
    const vImageData = findDescendantByLocalName(node, "imagedata");
    if (vImageData) {
      embedId =
        vImageData.getAttribute("r:id") ||
        vImageData.getAttribute("id") ||
        vImageData.getAttribute("r:href") ||
        vImageData.getAttribute("href");
    }
  }

  if (!embedId) return null;

  // Tra cứu trong media map
  let mediaItem = ctx.mediaByRelId.get(embedId);
  if (!mediaItem) {
    const rel = ctx.relationships.get(embedId);
    if (rel && rel.target) {
      const clean = rel.target.replace(/\\/g, "/").toLowerCase().trim();
      const stripped = clean.replace(/^(\.\.\/)+/, "").replace(/^(\.\/)+/, "").replace(/^\/+/, "");
      const withoutWord = stripped.startsWith("word/") ? stripped.substring(5) : stripped;
      const withWord = stripped.startsWith("word/") ? stripped : `word/${stripped}`;
      const filename = stripped.split("/").pop() || stripped;
      mediaItem =
        ctx.mediaByPath.get(clean) ||
        ctx.mediaByPath.get(stripped) ||
        ctx.mediaByPath.get(withoutWord) ||
        ctx.mediaByPath.get(withWord) ||
        ctx.mediaByPath.get(filename);
    }
  }

  if (!mediaItem) {
    ctx.warnings.push(`Không tìm thấy hình ảnh tương ứng với relationship ID: ${embedId}`);
    const placeholderSvg = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200" viewBox="0 0 300 200"><rect width="300" height="200" fill="%23f1f5f9" stroke="%23cbd5e1" stroke-width="2"/><text x="50%" y="45%" dominant-baseline="middle" text-anchor="middle" fill="%2364748b" font-family="sans-serif" font-size="14" font-weight="600">Missing Image</text><text x="50%" y="60%" dominant-baseline="middle" text-anchor="middle" fill="%2394a3b8" font-family="sans-serif" font-size="11">(${embedId})</text></svg>`;
    return {
      src: placeholderSvg,
      width: 300,
      height: 200,
    };
  }

  let width = 400;
  let height = 260;

  if (extentEl) {
    const cxStr = getAttrValue(extentEl, "cx");
    const cyStr = getAttrValue(extentEl, "cy");
    if (cxStr && cyStr) {
      const wPx = emuToPixels(parseInt(cxStr, 10));
      const hPx = emuToPixels(parseInt(cyStr, 10));
      if (wPx > 0 && hPx > 0) {
        width = Math.min(800, Math.max(30, wPx));
        height = Math.min(800, Math.max(30, hPx));
      }
    }
  }

  return {
    src: mediaItem.dataUrl,
    width,
    height,
  };
}

/**
 * Tạo danh sách Marks cho text run
 */
function buildMarks(formatting: DocxRunFormatting): NonNullable<JSONContent["marks"]> {
  const marks: NonNullable<JSONContent["marks"]> = [];

  if (formatting.bold) {
    marks.push({ type: "bold" });
  }
  if (formatting.italic) {
    marks.push({ type: "italic" });
  }
  if (formatting.underline) {
    marks.push({ type: "underline" });
  }
  if (formatting.strike) {
    marks.push({ type: "strike" });
  }

  if (formatting.linkHref) {
    marks.push({
      type: "link",
      attrs: {
        href: formatting.linkHref,
        target: "_blank",
      },
    });
  }

  // TextStyle attributes
  const textStyleAttrs: Record<string, string> = {};
  if (formatting.fontFamily) {
    textStyleAttrs.fontFamily = formatting.fontFamily;
  }
  if (formatting.fontSizePt) {
    textStyleAttrs.fontSize = `${formatting.fontSizePt}pt`;
  }
  if (formatting.color) {
    textStyleAttrs.color = formatting.color;
  }

  if (Object.keys(textStyleAttrs).length > 0) {
    marks.push({
      type: "textStyle",
      attrs: textStyleAttrs,
    });
  }

  if (formatting.highlight) {
    marks.push({
      type: "highlight",
      attrs: {
        color: formatting.highlight,
      },
    });
  }

  return marks;
}

/**
 * Trộn các thuộc tính formatting từ Style và Run trực tiếp
 */
function mergeRunFormatting(
  styleFormatting: DocxRunFormatting,
  directFormatting: DocxRunFormatting,
  extraLinkHref?: string
): DocxRunFormatting {
  return {
    bold: directFormatting.bold ?? styleFormatting.bold,
    italic: directFormatting.italic ?? styleFormatting.italic,
    underline: directFormatting.underline ?? styleFormatting.underline,
    strike: directFormatting.strike ?? styleFormatting.strike,
    fontFamily: directFormatting.fontFamily || styleFormatting.fontFamily,
    fontSizePt: directFormatting.fontSizePt ?? styleFormatting.fontSizePt,
    color: directFormatting.color || styleFormatting.color,
    highlight: directFormatting.highlight || styleFormatting.highlight,
    linkHref: extraLinkHref || directFormatting.linkHref || styleFormatting.linkHref,
  };
}

interface RawParagraphPart {
  type: "text" | "hardBreak" | "pageBreak" | "image" | "shape" | "textBox" | "noteReference" | "bookmarkAnchor" | "crossReference" | "field" | "equation";
  text?: string;
  marks?: NonNullable<JSONContent["marks"]>;
  crossReferenceAttrs?: {
    targetId: string;
    targetType: string;
    format: string;
    customText?: string | null;
  };
  imageAttrs?: {
    src: string;
    alt?: string;
    title?: string;
    width: number;
    height: number;
    alignment: "left" | "center" | "right";
    drawingPosition?: DrawingPosition | null;
    isMissingMedia?: boolean;
  };
  shapeAttrs?: {
    shapeType: string;
    width: number;
    height: number;
    fillColor: string;
    strokeColor: string;
    strokeWidth: number;
    alignment: "left" | "center" | "right";
    drawingPosition?: DrawingPosition | null;
  };
  textBoxAttrs?: {
    width: number;
    minHeight: number;
    alignment: "left" | "center" | "right";
    backgroundColor: string;
    borderColor: string;
    drawingPosition?: DrawingPosition | null;
    content?: JSONContent[];
  };
  noteAttrs?: {
    noteId: string;
    noteType: "footnote" | "endnote";
    content: string;
  };
  bookmarkAnchorAttrs?: {
    id: string;
    name: string;
    createdAt: string;
  };
  fieldAttrs?: FieldAttributes;
  equationAttrs?: {
    latex: string;
    displayMode: boolean;
    alignment: "left" | "center" | "right";
  };
}

/**
 * Xử lý phần tử Drawing/Shape/TextBox bằng shared parser và đưa vào danh sách parts
 */
function processDrawingOrShapeElement(
  drawingEl: Element,
  ctx: DocumentMapperContext,
  parts: RawParagraphPart[]
): boolean {
  const parsed = parseDrawingElement(drawingEl, ctx);
  if (!parsed) return false;

  const align: "left" | "center" | "right" =
    parsed.position.horizontalAlign === "left" || parsed.position.horizontalAlign === "right"
      ? parsed.position.horizontalAlign
      : "center";

  if (parsed.payload.kind === "image") {
    parts.push({
      type: "image",
      imageAttrs: {
        src: parsed.payload.src,
        alt: parsed.payload.alt,
        title: parsed.payload.title,
        width: parsed.position.width,
        height: parsed.position.height,
        alignment: align,
        drawingPosition: parsed.position,
        isMissingMedia: parsed.payload.isMissingMedia,
      },
    });
    return true;
  }

  if (parsed.payload.kind === "shape") {
    parts.push({
      type: "shape",
      shapeAttrs: {
        shapeType: parsed.payload.shapeType,
        width: parsed.position.width,
        height: parsed.position.height,
        fillColor:
          parsed.payload.fillColor !== undefined
            ? parsed.payload.fillColor
            : parsed.payload.shapeType === "line" || parsed.payload.shapeType === "arrow"
            ? "none"
            : "#3b82f6",
        strokeColor: parsed.payload.strokeColor || "#1d4ed8",
        strokeWidth: parsed.payload.strokeWidth || 2,
        alignment: align,
        drawingPosition: parsed.position,
      },
    });
    return true;
  }

  if (parsed.payload.kind === "textBox") {
    parts.push({
      type: "textBox",
      textBoxAttrs: {
        width: parsed.position.width,
        minHeight: parsed.position.height,
        alignment: align,
        backgroundColor: parsed.payload.backgroundColor || "#ffffff",
        borderColor: parsed.payload.borderColor || "#cbd5e1",
        drawingPosition: parsed.position,
        content: parsed.payload.content,
      },
    });
    return true;
  }

  // Biểu đồ (Chart): Không render/edit, bỏ qua an toàn, bảo toàn part trong package
  if (parsed.payload.kind === "chart") {
    return true;
  }

  // Sơ đồ SmartArt: Bỏ qua an toàn, không làm xáo trộn bố cục hoặc flatten thành random paragraphs
  if (parsed.payload.kind === "smartart") {
    return true;
  }

  // Nghệ thuật chữ (WordArt): Trích xuất văn bản hiển thị an toàn
  if (parsed.payload.kind === "wordart") {
    parts.push({
      type: "text",
      text: parsed.payload.text || "WordArt",
      marks: [{ type: "bold" }],
    });
    return true;
  }

  // Nếu là đối tượng DrawingML/Picture nhưng bị thiếu media binary, bảo toàn node ảnh dạng placeholder
  if (parsed.payload.kind === "unknown") {
    const isPicture = Boolean(
      findDescendantByLocalName(drawingEl, "blip") ||
      findDescendantByLocalName(drawingEl, "imagedata") ||
      (parsed.payload.graphicUri && parsed.payload.graphicUri.includes("picture"))
    );
    if (isPicture) {
      const placeholderSvg = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200" viewBox="0 0 300 200"><rect width="300" height="200" fill="%23f1f5f9" stroke="%23cbd5e1" stroke-width="2"/><text x="50%" y="45%" dominant-baseline="middle" text-anchor="middle" fill="%2364748b" font-family="sans-serif" font-size="14" font-weight="600">Missing Image</text><text x="50%" y="60%" dominant-baseline="middle" text-anchor="middle" fill="%2394a3b8" font-family="sans-serif" font-size="11">(${parsed.position.docPrName || "Image"})</text></svg>`;
      parts.push({
        type: "image",
        imageAttrs: {
          src: placeholderSvg,
          alt: parsed.position.docPrDescription || parsed.position.docPrName || "Missing Image",
          title: parsed.position.docPrName || "",
          width: parsed.position.width,
          height: parsed.position.height,
          alignment: align,
          drawingPosition: parsed.position,
          isMissingMedia: true,
        },
      });
      return true;
    }
  }

  return false;
}

/**
 * Phân tích các phần tử bên trong một paragraph (<w:p>)
 */
function parseParagraphRuns(
  pEl: Element,
  parentFormatting: DocxRunFormatting,
  ctx: DocumentMapperContext
): { parts: RawParagraphPart[]; nextSectionPr: Element | null } {
  const parts: RawParagraphPart[] = [];
  let nextSectionPr: Element | null = null;
  const complexFieldParser = new ComplexFieldParser();

  for (let i = 0; i < pEl.childNodes.length; i++) {
    const child = pEl.childNodes[i];
    if (child.nodeType !== 1) continue;
    const local = getLocalName(child).toLowerCase();

    // 1. Thuộc tính paragraph (pPr)
    if (local === "ppr") {
      const pPrEl = child as Element;
      // Kiểm tra section break bên trong paragraph
      const sectPrEl = getFirstChildByLocalName(pPrEl, "sectpr");
      if (sectPrEl) {
        nextSectionPr = sectPrEl;
      }
      continue;
    }

    // 2. Hyperlink (<w:hyperlink>)
    if (local === "hyperlink") {
      const linkEl = child as Element;
      const rId =
        linkEl.getAttribute("r:id") ||
        linkEl.getAttribute("id") ||
        linkEl.getAttribute("r:href") ||
        "";
      const rel = ctx.relationships.get(rId);
      const linkHref = rel ? rel.target : "";

      // Duyệt các runs con bên trong hyperlink
      for (let j = 0; j < linkEl.childNodes.length; j++) {
        const linkChild = linkEl.childNodes[j];
        if (linkChild.nodeType !== 1) continue;
        if (getLocalName(linkChild).toLowerCase() === "r") {
          processRunElement(linkChild as Element, linkHref);
        }
      }
      continue;
    }

    // 3. Run thông thường (<w:r>)
    if (local === "r") {
      processRunElement(child as Element, undefined);
      continue;
    }

    // 4. Drawing đứng độc lập trực tiếp dưới paragraph
    if (local === "drawing" || local === "pict") {
      const handled = processDrawingOrShapeElement(child as Element, ctx, parts);
      if (!handled) {
        const imgInfo = extractImageInfo(child as Element, ctx);
        if (imgInfo) {
          parts.push({
            type: "image",
            imageAttrs: {
              ...imgInfo,
              alignment: "center",
            },
          });
        }
      }
      continue;
    }

    // 5. AlternateContent (mc:AlternateContent thường bọc Drawing/Shape hoặc Fallback)
    if (local === "alternatecontent") {
      const handled = processDrawingOrShapeElement(child as Element, ctx, parts);
      if (!handled) {
        const imgInfo = extractImageInfo(child as Element, ctx);
        if (imgInfo) {
          parts.push({
            type: "image",
            imageAttrs: {
              ...imgInfo,
              alignment: "center",
            },
          });
        } else {
          // Trích xuất các runs fallback nếu có
          for (let j = 0; j < (child as Element).childNodes.length; j++) {
            const sub = (child as Element).childNodes[j];
            if (sub.nodeType !== 1) continue;
            for (let k = 0; k < sub.childNodes.length; k++) {
              const grand = sub.childNodes[k];
              if (grand.nodeType === 1 && getLocalName(grand).toLowerCase() === "r") {
                processRunElement(grand as Element, undefined);
              }
            }
          }
        }
      }
      continue;
    }

    // Comment Range Start / End (Phase 5.8)
    if (local === "commentrangestart") {
      const cId = getAttrValue(child as Element, "id");
      if (cId && ctx.activeCommentIds) {
        ctx.activeCommentIds.add(cId);
      }
      continue;
    }
    if (local === "commentrangeend") {
      const cId = getAttrValue(child as Element, "id");
      if (cId && ctx.activeCommentIds) {
        ctx.activeCommentIds.delete(cId);
      }
      continue;
    }

    // Bookmark Range Start / Position Bookmark (<w:bookmarkStart>) - Phase 10
    if (local === "bookmarkstart") {
      const bId = getAttrValue(child as Element, "id");
      const bName = getAttrValue(child as Element, "name");
      if (bId && bName) {
        const isTechnical =
          bName.startsWith("_GoBack") ||
          bName.startsWith("_Toc") ||
          bName.startsWith("_TOC") ||
          bName.startsWith("_Hlk") ||
          bName.startsWith("_Ref");

        if (!isTechnical) {
          if (!ctx.activeBookmarks) {
            ctx.activeBookmarks = new Map();
          }
          if (!ctx.importedBookmarkNames) {
            ctx.importedBookmarkNames = new Map();
          }

          // Xử lý malformed OOXML nếu trùng lặp numeric bId trong cùng phạm vi
          if (ctx.activeBookmarks.has(bId)) {
            const prev = ctx.activeBookmarks.get(bId)!;
            if (!prev.hasContent) {
              parts.push({
                type: "bookmarkAnchor",
                bookmarkAnchorAttrs: {
                  id: prev.id,
                  name: prev.name,
                  createdAt: new Date().toISOString(),
                },
              });
            }
            ctx.activeBookmarks.delete(bId);
          }

          const internalId = BookmarkService.generateBookmarkId(bName);
          let safeName = bName.trim() || "Bookmark";
          let counter = 1;
          const baseName = safeName;
          while (
            ctx.importedBookmarkNames.has(safeName.toLowerCase()) &&
            ctx.importedBookmarkNames.get(safeName.toLowerCase()) !== internalId
          ) {
            safeName = `${baseName} (${counter++})`;
          }
          ctx.importedBookmarkNames.set(safeName.toLowerCase(), internalId);

          ctx.activeBookmarks.set(bId, {
            id: internalId,
            name: safeName,
            hasContent: false,
          });
        }
      }
      continue;
    }

    // Bookmark End (<w:bookmarkEnd>) - Phase 10
    if (local === "bookmarkend") {
      const bId = getAttrValue(child as Element, "id");
      if (bId && ctx.activeBookmarks?.has(bId)) {
        const bm = ctx.activeBookmarks.get(bId)!;
        if (!bm.hasContent) {
          // Zero-range anchor -> Position Bookmark
          parts.push({
            type: "bookmarkAnchor",
            bookmarkAnchorAttrs: {
              id: bm.id,
              name: bm.name,
              createdAt: new Date().toISOString(),
            },
          });
        }
        ctx.activeBookmarks.delete(bId);
      }
      continue;
    }

    // Tracked Insertion (<w:ins>) - Phase 5.8
    if (local === "ins" || local === "moveto") {
      if (local === "moveto") {
        ctx.warnings.push("Phát hiện Move Revision (moveTo); đã chuyển đổi thành Tracked Insertion.");
        ctx.diagnostics?.recordApproximated(
          "TrackChanges",
          "MOVE_TO_INSERT",
          "Thao tác di chuyển (moveTo) được chuyển đổi thành thao tác chèn (insertion)."
        );
      }
      const insId = getAttrValue(child as Element, "id") || `ins-${Math.random().toString(36).substring(2, 7)}`;
      const insAuthor = getAttrValue(child as Element, "author") || "Author";
      const insDate = getAttrValue(child as Element, "date") || new Date().toISOString();
      const changeId = insId.startsWith("change-") || insId.startsWith("ins-") ? insId : `ins-${insId}`;

      for (let j = 0; j < (child as Element).childNodes.length; j++) {
        const sub = (child as Element).childNodes[j];
        if (sub.nodeType !== 1) continue;
        const subLocal = getLocalName(sub).toLowerCase();
        if (subLocal === "r") {
          processRunElement(sub as Element, undefined, {
            id: changeId,
            changeType: "insert",
            author: insAuthor,
            timestamp: insDate,
          });
        } else if (subLocal === "drawing" || subLocal === "pict" || subLocal === "alternatecontent") {
          processDrawingOrShapeElement(sub as Element, ctx, parts);
          ctx.diagnostics?.recordPreserved(
            "TrackChanges",
            "TRACKED_DRAWING_SAFE_PARSE",
            "Đối tượng hình vẽ nằm trong tracked revision được phân tích an toàn."
          );
        } else if (subLocal === "omath" || subLocal === "omathpara") {
          const mathResult = OmmlEngine.parseOmml(sub as Element);
          if (mathResult && mathResult.latex.trim()) {
            parts.push({
              type: "equation",
              equationAttrs: {
                latex: mathResult.latex,
                displayMode: mathResult.displayMode,
                alignment: mathResult.alignment,
              },
            });
          }
        }
      }
      continue;
    }

    // Tracked Deletion (<w:del>) - Phase 5.8
    if (local === "del" || local === "movefrom") {
      if (local === "movefrom") {
        ctx.warnings.push("Phát hiện Move Revision (moveFrom) thành Tracked Deletion.");
        ctx.diagnostics?.recordApproximated(
          "TrackChanges",
          "MOVE_FROM_DELETE",
          "Thao tác di chuyển (moveFrom) được chuyển đổi thành thao tác xóa (deletion)."
        );
      }
      const delId = getAttrValue(child as Element, "id") || `del-${Math.random().toString(36).substring(2, 7)}`;
      const delAuthor = getAttrValue(child as Element, "author") || "Author";
      const delDate = getAttrValue(child as Element, "date") || new Date().toISOString();
      const changeId = delId.startsWith("change-") || delId.startsWith("del-") ? delId : `del-${delId}`;

      for (let j = 0; j < (child as Element).childNodes.length; j++) {
        const sub = (child as Element).childNodes[j];
        if (sub.nodeType !== 1) continue;
        const subLocal = getLocalName(sub).toLowerCase();
        if (subLocal === "r") {
          processRunElement(sub as Element, undefined, {
            id: changeId,
            changeType: "delete",
            author: delAuthor,
            timestamp: delDate,
          });
        } else if (subLocal === "drawing" || subLocal === "pict" || subLocal === "alternatecontent") {
          processDrawingOrShapeElement(sub as Element, ctx, parts);
          ctx.diagnostics?.recordPreserved(
            "TrackChanges",
            "TRACKED_DRAWING_SAFE_PARSE",
            "Đối tượng hình vẽ nằm trong tracked deletion được phân tích an toàn."
          );
        } else if (subLocal === "omath" || subLocal === "omathpara") {
          const mathResult = OmmlEngine.parseOmml(sub as Element);
          if (mathResult && mathResult.latex.trim()) {
            parts.push({
              type: "equation",
              equationAttrs: {
                latex: mathResult.latex,
                displayMode: mathResult.displayMode,
                alignment: mathResult.alignment,
              },
            });
          }
        }
      }
      continue;
    }

    // 6. Trường đơn giản (fldSimple) - Semantic Field Engine Phase 4 & Phase 12
    if (local === "fldsimple") {
      const { fieldAttrs, childRuns } = complexFieldParser.parseFldSimple(child as Element);
      let fieldMarks: NonNullable<JSONContent["marks"]> | undefined = undefined;
      if (childRuns.length > 0) {
        const firstR = childRuns[0];
        const rPrEl = getFirstChildByLocalName(firstR, "rpr");
        const dirFormatting = parseRunProperties(rPrEl);
        const marks = buildMarks(dirFormatting);
        if (marks.length > 0) fieldMarks = marks;
      }

      if (fieldAttrs.fieldType === "REF" || fieldAttrs.fieldType === "PAGEREF") {
        const bmName = fieldAttrs.argument || "";
        const targetId = ctx.importedBookmarkNames?.get(bmName.toLowerCase()) || bmName;
        const format = fieldAttrs.fieldType === "PAGEREF" ? "page" : "text";
        const customText = fieldAttrs.result || (fieldAttrs.fieldType === "PAGEREF" ? "1" : "[Cross-reference]");
        parts.push({
          type: "crossReference",
          crossReferenceAttrs: {
            targetId,
            targetType: "bookmark",
            format,
            customText,
          },
          marks: fieldMarks,
        });
        continue;
      }

      parts.push({
        type: "field",
        fieldAttrs,
        marks: fieldMarks,
      });
      continue;
    }

    // Thẻ thông minh (smartTag)
    if (local === "smarttag") {
      for (let j = 0; j < (child as Element).childNodes.length; j++) {
        const sub = (child as Element).childNodes[j];
        if (sub.nodeType !== 1) continue;
        if (getLocalName(sub).toLowerCase() === "r") {
          processRunElement(sub as Element, undefined);
        }
      }
      continue;
    }

    // 7. Công thức toán học Office Math (m:oMath, m:oMathPara) - OMML Fidelity Phase 5
    if (local === "omath" || local === "omathpara") {
      let mathResult: any = null;
      try {
        mathResult = OmmlEngine.parseOmml(child as Element);
      } catch (err: any) {
        ctx.warnings.push(`Lỗi phân tích cú pháp OMML: ${err?.message || String(err)}`);
      }

      if (mathResult && mathResult.latex.trim()) {
        parts.push({
          type: "equation",
          equationAttrs: {
            latex: mathResult.latex,
            displayMode: mathResult.displayMode,
            alignment: mathResult.alignment,
          },
        });
        if (mathResult.warnings.length > 0) {
          ctx.warnings.push(...mathResult.warnings);
          ctx.diagnostics?.recordApproximated(
            "Equation",
            "OMML_APPROXIMATED",
            "Công thức toán học có cảnh báo cú pháp nhưng đã được chuyển đổi an toàn."
          );
        } else {
          ctx.diagnostics?.recordPreserved(
            "Equation",
            "OMML_PRESERVED",
            "Công thức toán học Office Math (OMML) được bảo toàn nguyên vẹn."
          );
        }
      } else {
        // Fallback an toàn cho OMML hỏng hoặc không trích xuất được LaTeX
        const fallbackText = (child as Element).textContent?.trim() || "[Equation]";
        parts.push({
          type: "text",
          text: fallbackText,
        });
        ctx.warnings.push("Công thức toán học (OMML) không hợp lệ, đã chuyển đổi sang văn bản thay thế an toàn.");
        ctx.diagnostics?.recordApproximated(
          "Equation",
          "OMML_INVALID_FALLBACK",
          "Công thức toán học không hợp lệ hoặc bị hỏng đã được chuyển đổi an toàn sang văn bản thay thế."
        );
      }
      continue;
    }
  }

  function processRunElement(
    rEl: Element,
    extraLinkHref?: string,
    trackChangeInfo?: {
      id: string;
      changeType: "insert" | "delete";
      author: string;
      timestamp: string;
    }
  ) {
    const rPrEl = getFirstChildByLocalName(rEl, "rpr");
    const directFormatting = parseRunProperties(rPrEl);

    // Kế thừa style từ w:rStyle nếu có
    let mappedCharStyleId: string | undefined;
    let fallbackRStyleFormatting: DocxRunFormatting = {};

    if (rPrEl) {
      const rStyleEl = getFirstChildByLocalName(rPrEl, "rstyle");
      const rStyleId = getValAttribute(rStyleEl);
      if (rStyleId) {
        const mapped =
          ctx.styleIdMap?.get(rStyleId) ||
          ctx.styleIdMap?.get(rStyleId.toLowerCase());
        if (mapped) {
          mappedCharStyleId = mapped;
        } else {
          const foundStyle =
            ctx.styles.get(rStyleId) || ctx.styles.get(rStyleId.toLowerCase());
          if (foundStyle) {
            fallbackRStyleFormatting = foundStyle.runFormatting;
          }
        }
      }
    }

    let parsedRunFmtRev: ParsedRunPropertiesChange | null = null;
    if (rPrEl && getFirstChildByLocalName(rPrEl, "rprchange")) {
      parsedRunFmtRev = DocxFormattingRevisionMapper.parseRunPropertiesChange(
        rPrEl,
        directFormatting,
        mappedCharStyleId,
        ctx.styleIdMap
      );
      if (parsedRunFmtRev) {
        if (ctx.trackedChangesMap && ctx.trackedChangesMap.has(parsedRunFmtRev.id)) {
          const existing = ctx.trackedChangesMap.get(parsedRunFmtRev.id)!;
          const isSameRevision =
            existing.author === parsedRunFmtRev.author &&
            existing.type === "format" &&
            (existing.formatDetails === parsedRunFmtRev.summary || existing.scope === parsedRunFmtRev.scope);
          if (!isSameRevision) {
            let counter = 2;
            while (ctx.trackedChangesMap.has(`${parsedRunFmtRev.id}_dup${counter}`)) {
              counter++;
            }
            const disambiguatedId = `${parsedRunFmtRev.id}_dup${counter}`;
            ctx.diagnostics?.recordApproximated(
              "TrackChanges",
              "DUPLICATE_REVISION_ID_DISAMBIGUATED",
              `Phát hiện ID revision trùng lặp "${parsedRunFmtRev.id}"; đã phân giải thành "${disambiguatedId}".`
            );
            parsedRunFmtRev.id = disambiguatedId;
          }
        }

        ctx.diagnostics?.recordPreserved(
          "TrackChanges",
          "CHARACTER_FORMATTING_REVISION_IMPORTED",
          `Nhập thành công Character Formatting Revision (${parsedRunFmtRev.summary}).`
        );
      }
    }

    const mergedForMarks: DocxRunFormatting = mappedCharStyleId
      ? { ...directFormatting, linkHref: extraLinkHref || directFormatting.linkHref }
      : mergeRunFormatting(
          mergeRunFormatting(parentFormatting, fallbackRStyleFormatting),
          directFormatting,
          extraLinkHref
        );
    const marks = buildMarks(mergedForMarks);

    // Gắn mark characterStyle nếu có Character Style ngữ nghĩa
    if (mappedCharStyleId) {
      marks.push({
        type: "characterStyle",
        attrs: {
          styleId: mappedCharStyleId,
        },
      });
    }

    // Gắn mark trackChange nếu có từ revision chèn/xóa (w:ins / w:del)
    if (trackChangeInfo) {
      marks.push({
        type: "trackChange",
        attrs: {
          id: trackChangeInfo.id,
          changeType: trackChangeInfo.changeType,
          author: trackChangeInfo.author,
          timestamp: trackChangeInfo.timestamp,
        },
      });
    }

    // Gắn mark trackChange nếu có từ revision định dạng ký tự (w:rPrChange)
    if (parsedRunFmtRev) {
      marks.push({
        type: "trackChange",
        attrs: {
          id: parsedRunFmtRev.id,
          changeType: "format",
          author: parsedRunFmtRev.author,
          timestamp: parsedRunFmtRev.date,
          scope: parsedRunFmtRev.scope,
          formatChanges: parsedRunFmtRev.diffs,
          formatDetails: parsedRunFmtRev.summary,
          status: "pending",
        },
      });
    }

    // Gắn mark comment nếu nằm trong dải anchor
    if (ctx.activeCommentIds && ctx.activeCommentIds.size > 0) {
      for (const comId of ctx.activeCommentIds) {
        marks.push({
          type: "comment",
          attrs: { commentId: `comment-${comId}` },
        });
      }
    }

    // Gắn mark bookmark nếu nằm trong dải Range Bookmark (Phase 10)
    if (ctx.activeBookmarks && ctx.activeBookmarks.size > 0) {
      for (const bm of ctx.activeBookmarks.values()) {
        bm.hasContent = true;
        marks.push({
          type: "bookmark",
          attrs: {
            id: bm.id,
            name: bm.name,
            createdAt: new Date().toISOString(),
          },
        });
      }
    }

    for (let k = 0; k < rEl.childNodes.length; k++) {
      const rChild = rEl.childNodes[k];
      if (rChild.nodeType !== 1) continue;
      const childLocal = getLocalName(rChild).toLowerCase();

      // Field Character (<w:fldChar>) - Complex Field Phase 4 & Phase 12
      if (childLocal === "fldchar") {
        const completedField = complexFieldParser.handleFldChar(rChild as Element, rPrEl);
        if (completedField) {
          if (completedField.fieldType === "REF" || completedField.fieldType === "PAGEREF") {
            const bmName = completedField.argument || "";
            const targetId = ctx.importedBookmarkNames?.get(bmName.toLowerCase()) || bmName;
            const format = completedField.fieldType === "PAGEREF" ? "page" : "text";
            const customText = completedField.result || (completedField.fieldType === "PAGEREF" ? "1" : "[Cross-reference]");
            parts.push({
              type: "crossReference",
              crossReferenceAttrs: {
                targetId,
                targetType: "bookmark",
                format,
                customText,
              },
              marks: marks.length > 0 ? [...marks] : undefined,
            });
          } else {
            parts.push({
              type: "field",
              fieldAttrs: completedField,
              marks: marks.length > 0 ? [...marks] : undefined,
            });
          }
        }
      }
      // Field Instruction Text (<w:instrText>)
      else if (childLocal === "instrtext") {
        complexFieldParser.appendInstructionText(rChild.textContent || "");
      }
      // Text (<w:t> hoặc <w:delText>)
      else if (childLocal === "t" || childLocal === "deltext") {
        const textContent = rChild.textContent || "";
        if (complexFieldParser.isInField) {
          complexFieldParser.appendResultText(textContent);
        } else {
          if (textContent.length > 0) {
            parts.push({
              type: "text",
              text: textContent,
              ...(marks.length > 0 ? { marks: [...marks] } : {}),
            });

            if (trackChangeInfo) {
              recordTrackChange(
                ctx,
                trackChangeInfo.id,
                trackChangeInfo.changeType,
                trackChangeInfo.author,
                trackChangeInfo.timestamp,
                textContent
              );
            }
            if (parsedRunFmtRev) {
              recordTrackChangeItem(
                ctx,
                {
                  id: parsedRunFmtRev.id,
                  type: "format",
                  author: parsedRunFmtRev.author,
                  timestamp: parsedRunFmtRev.date,
                  scope: parsedRunFmtRev.scope,
                  status: "pending",
                  formatDetails: parsedRunFmtRev.summary,
                  formatChange: {
                    scope: parsedRunFmtRev.scope,
                    changes: parsedRunFmtRev.diffs,
                    summary: parsedRunFmtRev.summary,
                  },
                },
                textContent
              );
            }
            if (ctx.activeCommentIds && ctx.activeCommentIds.size > 0) {
              for (const comId of ctx.activeCommentIds) {
                recordCommentAnchor(ctx, `comment-${comId}`, textContent);
              }
            }
          }
        }
      }
      // Line break (<w:br>)
      else if (childLocal === "br") {
        const typeAttr = getAttrValue(rChild as Element, "type") || "";
        if (typeAttr.toLowerCase() === "page") {
          parts.push({ type: "pageBreak" });
        } else {
          parts.push({ type: "hardBreak" });
        }
      }
      // Tab (<w:tab>)
      else if (childLocal === "tab") {
        parts.push({
          type: "text",
          text: "\t",
          ...(marks.length > 0 ? { marks } : {}),
        });
      }
      // Drawing bên trong Run
      else if (childLocal === "drawing" || childLocal === "pict" || childLocal === "alternatecontent") {
        const handled = processDrawingOrShapeElement(rChild as Element, ctx, parts);
        if (!handled) {
          const imgInfo = extractImageInfo(rChild as Element, ctx);
          if (imgInfo) {
            parts.push({
              type: "image",
              imageAttrs: {
                ...imgInfo,
                alignment: "center",
              },
            });
          }
        }
        if (ctx.activeCommentIds && ctx.activeCommentIds.size > 0) {
          for (const comId of ctx.activeCommentIds) {
            recordCommentAnchor(ctx, `comment-${comId}`, "[Drawing/Object]");
          }
        }
      }
      // OLE Object bên trong Run (<w:object>)
      else if (childLocal === "object") {
        ctx.diagnostics?.recordIgnoredSafely(
          "Security",
          "OLE_EXECUTION_BLOCKED",
          "Đối tượng nhúng OLE Object được xử lý ở chế độ an toàn (không thực thi mã nhúng)."
        );
        const handled = processDrawingOrShapeElement(rChild as Element, ctx, parts);
        if (!handled) {
          const imgInfo = extractImageInfo(rChild as Element, ctx);
          if (imgInfo) {
            parts.push({
              type: "image",
              imageAttrs: {
                ...imgInfo,
                alignment: "center",
              },
            });
          }
        }
        if (ctx.activeCommentIds && ctx.activeCommentIds.size > 0) {
          for (const comId of ctx.activeCommentIds) {
            recordCommentAnchor(ctx, `comment-${comId}`, "[OLE Object]");
          }
        }
      }
      // Footnote reference (<w:footnoteReference>)
      else if (childLocal === "footnotereference") {
        const fId = getAttrValue(rChild as Element, "id") || "1";
        const content = ctx.footnotes?.get(fId) || "";
        parts.push({
          type: "noteReference",
          noteAttrs: {
            noteId: `ref_fn_docx_${fId}`,
            noteType: "footnote",
            content,
          },
        });
      }
      // Endnote reference (<w:endnoteReference>)
      else if (childLocal === "endnotereference") {
        const eId = getAttrValue(rChild as Element, "id") || "1";
        const content = ctx.endnotes?.get(eId) || "";
        parts.push({
          type: "noteReference",
          noteAttrs: {
            noteId: `ref_en_docx_${eId}`,
            noteType: "endnote",
            content,
          },
        });
      }
    }

    if (parsedRunFmtRev && !ctx.trackedChangesMap?.has(parsedRunFmtRev.id)) {
      recordTrackChangeItem(
        ctx,
        {
          id: parsedRunFmtRev.id,
          type: "format",
          author: parsedRunFmtRev.author,
          timestamp: parsedRunFmtRev.date,
          scope: parsedRunFmtRev.scope,
          status: "pending",
          formatDetails: parsedRunFmtRev.summary,
          formatChange: {
            scope: parsedRunFmtRev.scope,
            changes: parsedRunFmtRev.diffs,
            summary: parsedRunFmtRev.summary,
          },
        },
        ""
      );
    }
  }

  // Fail-safe cho malformed bookmarks (start without end trong cùng paragraph)
  if (ctx.activeBookmarks && ctx.activeBookmarks.size > 0) {
    for (const [bId, bm] of Array.from(ctx.activeBookmarks.entries())) {
      if (!bm.hasContent) {
        parts.push({
          type: "bookmarkAnchor",
          bookmarkAnchorAttrs: {
            id: bm.id,
            name: bm.name,
            createdAt: new Date().toISOString(),
          },
        });
      }
      ctx.activeBookmarks.delete(bId);
    }
  }

  // Fail-safe cho malformed fields (begin without end trong cùng paragraph)
  const unclosedFields = complexFieldParser.flushRemainingFrames();
  for (const fieldAttrs of unclosedFields) {
    parts.push({
      type: "field",
      fieldAttrs,
    });
  }

  return { parts, nextSectionPr };
}

/**
 * Phân tích kiểu viền bảng từ thẻ <w:tblBorders>
 */
function parseTableBorders(tblBordersEl: Element | null): TableBorderStyle {
  if (!tblBordersEl) return "all";

  const topEl = getFirstChildByLocalName(tblBordersEl, "top");
  const bottomEl = getFirstChildByLocalName(tblBordersEl, "bottom");
  const leftEl = getFirstChildByLocalName(tblBordersEl, "left");
  const rightEl = getFirstChildByLocalName(tblBordersEl, "right");
  const insideHEl = getFirstChildByLocalName(tblBordersEl, "insideh");
  const insideVEl = getFirstChildByLocalName(tblBordersEl, "insidev");

  const isNone = (el: Element | null) => {
    if (!el) return false;
    const val = (getValAttribute(el) || getAttrValue(el, "val") || "").toLowerCase();
    return val === "none" || val === "nil";
  };

  const topNone = isNone(topEl);
  const bottomNone = isNone(bottomEl);
  const leftNone = isNone(leftEl);
  const rightNone = isNone(rightEl);
  const insideHNone = isNone(insideHEl);
  const insideVNone = isNone(insideVEl);

  if (topNone && bottomNone && leftNone && rightNone && insideHNone && insideVNone) {
    return "none";
  }

  if (!topNone && !bottomNone && !leftNone && !rightNone && insideHNone && insideVNone) {
    return "outside";
  }

  return "all";
}

/**
 * Phân tích lề ô (Cell Margins) từ <w:tblCellMar> hoặc <w:tcMar>
 * Đơn vị OOXML twips -> px (1 px = 15 twips)
 */
function parseCellMarginsElement(marEl: Element | null): Partial<CellMargins> | null {
  if (!marEl) return null;

  const topEl = getFirstChildByLocalName(marEl, "top");
  const bottomEl = getFirstChildByLocalName(marEl, "bottom");
  const leftEl = getFirstChildByLocalName(marEl, "left") || getFirstChildByLocalName(marEl, "start");
  const rightEl = getFirstChildByLocalName(marEl, "right") || getFirstChildByLocalName(marEl, "end");

  const margins: Partial<CellMargins> = {};

  const parseVal = (el: Element | null): number | undefined => {
    if (!el) return undefined;
    const wStr = getAttrValue(el, "w") || getValAttribute(el);
    if (!wStr) return undefined;
    const twips = parseInt(wStr, 10);
    if (!isNaN(twips) && twips >= 0) {
      return Math.round(twips / 15);
    }
    return undefined;
  };

  const top = parseVal(topEl);
  if (top !== undefined) margins.top = top;

  const bottom = parseVal(bottomEl);
  if (bottom !== undefined) margins.bottom = bottom;

  const left = parseVal(leftEl);
  if (left !== undefined) margins.left = left;

  const right = parseVal(rightEl);
  if (right !== undefined) margins.right = right;

  if (Object.keys(margins).length === 0) return null;
  return margins;
}

/**
 * Phân tích các tùy chọn kiểu dáng bảng từ thẻ <w:tblLook>
 */
function parseTableLookElement(tblLookEl: Element | null): Required<TableStyleOptions> {
  const options: Required<TableStyleOptions> = { ...DEFAULT_TABLE_STYLE_OPTIONS };
  if (!tblLookEl) return options;

  const firstRow = getAttrValue(tblLookEl, "firstrow") || getAttrValue(tblLookEl, "firstRow");
  if (firstRow === "1" || firstRow === "true") options.headerRow = true;
  else if (firstRow === "0" || firstRow === "false") options.headerRow = false;

  const firstCol = getAttrValue(tblLookEl, "firstcolumn") || getAttrValue(tblLookEl, "firstColumn");
  if (firstCol === "1" || firstCol === "true") options.firstColumn = true;
  else if (firstCol === "0" || firstCol === "false") options.firstColumn = false;

  const lastCol = getAttrValue(tblLookEl, "lastcolumn") || getAttrValue(tblLookEl, "lastColumn");
  if (lastCol === "1" || lastCol === "true") options.lastColumn = true;
  else if (lastCol === "0" || lastCol === "false") options.lastColumn = false;

  const noHBand = getAttrValue(tblLookEl, "nohband") || getAttrValue(tblLookEl, "noHBand");
  if (noHBand === "1" || noHBand === "true") options.bandedRows = false;
  else if (noHBand === "0" || noHBand === "false") options.bandedRows = true;

  const noVBand = getAttrValue(tblLookEl, "novband") || getAttrValue(tblLookEl, "noVBand");
  if (noVBand === "1" || noVBand === "true") options.bandedColumns = false;
  else if (noVBand === "0" || noVBand === "false") options.bandedColumns = true;

  // Hỗ trợ mã bitmask hex w:val nếu không có thuộc tính riêng lẻ
  const valHex = getAttrValue(tblLookEl, "val");
  if (valHex && firstRow === null && noHBand === null) {
    const bitmask = parseInt(valHex, 16);
    if (!isNaN(bitmask)) {
      options.headerRow = Boolean(bitmask & 0x0020);
      options.firstColumn = Boolean(bitmask & 0x0080);
      options.lastColumn = Boolean(bitmask & 0x0100);
      options.bandedRows = !(bitmask & 0x0200);
      options.bandedColumns = !(bitmask & 0x0400);
    }
  }

  return options;
}

/**
 * Ánh xạ Style ID bảng từ Word OOXML sang 5 built-in presets của Table Engine 2.0
 */
function mapDocxTableStyleId(rawStyleId: string | null): TableStyleId {
  if (!rawStyleId) return "grid";
  const clean = rawStyleId.trim().toLowerCase();

  if (clean === "plain" || clean.includes("plain") || clean === "tablenormal") {
    return "plain";
  }
  if (
    clean === "lightgrid" ||
    clean.includes("lightgrid") ||
    clean.includes("light-grid") ||
    clean.includes("lightshading")
  ) {
    return "light-grid";
  }
  if (
    clean === "mediumaccent" ||
    clean.includes("mediumaccent") ||
    clean.includes("medium-accent") ||
    clean.includes("mediumshading")
  ) {
    return "medium-accent";
  }
  if (clean === "academic" || clean.includes("academic") || clean.includes("gridtable")) {
    return "academic";
  }
  if (clean === "grid" || clean === "tablegrid" || clean.includes("grid")) {
    return "grid";
  }

  return "grid";
}

/**
 * Kiểm tra xem các block nội dung trong ô có chứa thông tin thực (chữ, phương trình, ảnh, v.v.) hay không
 */
function hasMeaningfulBlockContent(blocks: JSONContent[]): boolean {
  for (const block of blocks) {
    if (block.type === "paragraph") {
      if (Array.isArray(block.content) && block.content.length > 0) {
        for (const inline of block.content) {
          if (inline.type === "text") {
            if (inline.text && inline.text.trim()) return true;
          } else {
            // equation, field, bookmarkAnchor, image, noteReference, etc.
            return true;
          }
        }
      }
    } else {
      // Non-paragraph block (table, image block, etc.)
      return true;
    }
  }
  return false;
}

function appendNonEmptyContent(masterCell: JSONContent, continuationBlocks: JSONContent[]): void {
  if (!hasMeaningfulBlockContent(continuationBlocks)) return;

  if (!Array.isArray(masterCell.content)) {
    masterCell.content = [];
  }

  // Nếu ô master trước đó chỉ có 1 paragraph rỗng thì thay thế bằng nội dung thực
  if (
    masterCell.content.length === 1 &&
    masterCell.content[0].type === "paragraph" &&
    (!masterCell.content[0].content || masterCell.content[0].content.length === 0)
  ) {
    masterCell.content = [...continuationBlocks];
  } else {
    masterCell.content.push(...continuationBlocks);
  }
}

interface ParsedDocxCell {
  cellNode: JSONContent;
  colSpan: number;
  vMerge: "restart" | "continue" | null;
  cellBlocks: JSONContent[];
  hasDirectText: boolean;
}

/**
 * Phân tích một ô trong bảng (<w:tc>) với đầy đủ semantic metadata
 */
function parseTableCellRaw(
  tcEl: Element,
  isHeaderRow: boolean,
  ctx: DocumentMapperContext
): ParsedDocxCell {
  const tcPr = getFirstChildByLocalName(tcEl, "tcpr");
  let colspan = 1;
  let vMerge: "restart" | "continue" | null = null;
  let bgColor: string | null = null;
  let vAlign: "top" | "middle" | "bottom" | null = null;
  let colwidth: number[] | null = null;
  let cellMargins: Partial<CellMargins> | null = null;

  if (tcPr) {
    // 1. Colspan (<w:gridSpan>)
    const gridSpanEl = getFirstChildByLocalName(tcPr, "gridspan");
    const spanVal = getValAttribute(gridSpanEl);
    if (spanVal) {
      const spanNum = parseInt(spanVal, 10);
      if (!isNaN(spanNum) && spanNum >= 1) {
        colspan = spanNum;
      }
    }

    // 2. Vertical Merge (<w:vMerge>)
    const vMergeEl = getFirstChildByLocalName(tcPr, "vmerge");
    if (vMergeEl) {
      const val = (getValAttribute(vMergeEl) || "").trim().toLowerCase();
      if (val === "restart") {
        vMerge = "restart";
      } else if (val === "none" || val === "false" || val === "0") {
        vMerge = null;
      } else {
        // "continue", hoặc thẻ <w:vMerge/> không có thuộc tính w:val mặc định là continue theo ISO/IEC 29500
        vMerge = "continue";
      }
    }

    // 3. Cell Width (<w:tcW>)
    const tcWEl = getFirstChildByLocalName(tcPr, "tcw");
    const wVal = getAttrValue(tcWEl || tcPr, "w");
    if (wVal) {
      const wTwips = parseInt(wVal, 10);
      if (!isNaN(wTwips) && wTwips > 0) {
        colwidth = [Math.max(20, Math.round(wTwips / 15))];
      }
    }

    // 4. Cell Background (<w:shd>)
    const shdEl = getFirstChildByLocalName(tcPr, "shd");
    if (shdEl) {
      const fillVal = getAttrValue(shdEl, "fill");
      if (fillVal && fillVal.toLowerCase() !== "auto") {
        const hex = fillVal.replace(/^#/, "");
        if (/^[0-9a-fA-F]{6}$/.test(hex)) {
          bgColor = `#${hex.toUpperCase()}`;
        }
      }
    }

    // 5. Vertical Align (<w:vAlign>)
    const vAlignEl = getFirstChildByLocalName(tcPr, "valign");
    const vVal = (getValAttribute(vAlignEl) || "").toLowerCase();
    if (vVal === "top") vAlign = "top";
    else if (vVal === "center") vAlign = "middle";
    else if (vVal === "bottom") vAlign = "bottom";

    // 6. Cell Margins Override (<w:tcMar>)
    const tcMarEl = getFirstChildByLocalName(tcPr, "tcmar");
    if (tcMarEl) {
      cellMargins = parseCellMarginsElement(tcMarEl);
    }
  }

  // Duyệt các đoạn văn bên trong ô
  const cellBlocks: JSONContent[] = [];
  const pNodes = getDirectChildrenByLocalName(tcEl, "p");
  let firstParaAlign: "left" | "center" | "right" | null = null;

  for (const pEl of pNodes) {
    const pPr = getFirstChildByLocalName(pEl, "ppr");
    const directPara = parseParagraphProperties(pPr);
    const pStyleEl = getFirstChildByLocalName(pPr, "pstyle");
    const cellStyleId = getValAttribute(pStyleEl);
    const mappedCellStyleId = cellStyleId
      ? ctx.styleIdMap?.get(cellStyleId) || ctx.styleIdMap?.get(cellStyleId.toLowerCase())
      : undefined;

    let cellParaFmtRev: ParsedParagraphPropertiesChange | null = null;
    if (pPr && getFirstChildByLocalName(pPr, "pprchange")) {
      const targetNodeId = `p-cell-${Math.random().toString(36).substring(2, 9)}`;
      cellParaFmtRev = DocxFormattingRevisionMapper.parseParagraphPropertiesChange(
        pPr,
        directPara,
        mappedCellStyleId,
        ctx.styleIdMap,
        targetNodeId
      );
      if (cellParaFmtRev) {
        ctx.diagnostics?.recordPreserved(
          "TrackChanges",
          "PARAGRAPH_FORMATTING_REVISION_IMPORTED",
          `Nhập thành công Paragraph Formatting Revision trong ô bảng (${cellParaFmtRev.summary}).`
        );
      }
    }

    if (!firstParaAlign && directPara.alignment) {
      if (
        directPara.alignment === "left" ||
        directPara.alignment === "center" ||
        directPara.alignment === "right"
      ) {
        firstParaAlign = directPara.alignment;
      }
    }

    const paraAttrs: Record<string, unknown> = {
      styleId: mappedCellStyleId || STYLE_NORMAL_ID,
    };
    if (directPara.alignment) paraAttrs.textAlign = directPara.alignment;
    if (directPara.lineSpacing) paraAttrs.lineSpacing = directPara.lineSpacing;
    if (directPara.spacingBefore !== undefined) paraAttrs.spacingBefore = directPara.spacingBefore;
    if (directPara.spacingAfter !== undefined) paraAttrs.spacingAfter = directPara.spacingAfter;
    if (directPara.leftIndent !== undefined) paraAttrs.leftIndent = directPara.leftIndent;
    if (directPara.rightIndent !== undefined) paraAttrs.rightIndent = directPara.rightIndent;
    if (directPara.firstLineIndent !== undefined) paraAttrs.firstLineIndent = directPara.firstLineIndent;
    if (directPara.hangingIndent !== undefined) paraAttrs.hangingIndent = directPara.hangingIndent;
    if (directPara.keepWithNext !== undefined) paraAttrs.keepWithNext = directPara.keepWithNext;
    if (directPara.keepLinesTogether !== undefined) paraAttrs.keepLinesTogether = directPara.keepLinesTogether;
    if (directPara.pageBreakBefore !== undefined) paraAttrs.pageBreakBefore = directPara.pageBreakBefore;
    if (directPara.widowControl !== undefined) paraAttrs.widowControl = directPara.widowControl;

    const runsResult = parseParagraphRuns(pEl, {}, ctx);

    // Chuyển parts thành inline nodes
    const inlineContent: JSONContent[] = [];
    for (const part of runsResult.parts) {
      if (part.type === "text" && part.text) {
        inlineContent.push({
          type: "text",
          text: part.text,
          ...(part.marks && part.marks.length > 0 ? { marks: part.marks } : {}),
        });
      } else if (part.type === "hardBreak") {
        inlineContent.push({ type: "hardBreak" });
      } else if (part.type === "bookmarkAnchor" && part.bookmarkAnchorAttrs) {
        inlineContent.push({
          type: "bookmarkAnchor",
          attrs: {
            id: part.bookmarkAnchorAttrs.id,
            name: part.bookmarkAnchorAttrs.name,
            createdAt: part.bookmarkAnchorAttrs.createdAt,
          },
        });
      } else if (part.type === "field" && part.fieldAttrs) {
        inlineContent.push({
          type: "field",
          attrs: {
            fieldType: part.fieldAttrs.fieldType,
            instruction: part.fieldAttrs.instruction,
            result: part.fieldAttrs.result,
            argument: part.fieldAttrs.argument || null,
            switches: part.fieldAttrs.switches || [],
            rawInstruction: part.fieldAttrs.rawInstruction || null,
            isComplex: Boolean(part.fieldAttrs.isComplex),
          },
          ...(part.marks && part.marks.length > 0 ? { marks: part.marks } : {}),
        });
      } else if (part.type === "equation" && part.equationAttrs) {
        inlineContent.push({
          type: "equation",
          attrs: {
            latex: part.equationAttrs.latex,
            displayMode: part.equationAttrs.displayMode,
            alignment: part.equationAttrs.alignment,
          },
        });
      } else if (part.type === "noteReference" && part.noteAttrs) {
        inlineContent.push({
          type: "noteReference",
          attrs: {
            noteId: part.noteAttrs.noteId,
            noteType: part.noteAttrs.noteType,
            content: part.noteAttrs.content,
          },
        });
      } else if (part.type === "image" && part.imageAttrs) {
        if (inlineContent.length > 0) {
          cellBlocks.push({
            type: "paragraph",
            attrs: paraAttrs,
            content: [...inlineContent],
          });
          inlineContent.length = 0;
        }
        cellBlocks.push({
          type: "image",
          attrs: {
            src: part.imageAttrs.src,
            alt: part.imageAttrs.alt || "Hình ảnh",
            title: part.imageAttrs.title || "",
            width: part.imageAttrs.width,
            height: part.imageAttrs.height,
            alignment: part.imageAttrs.alignment,
            ...(part.imageAttrs.drawingPosition ? { drawingPosition: part.imageAttrs.drawingPosition } : {}),
            ...(part.imageAttrs.isMissingMedia ? { isMissingMedia: true } : {}),
          },
        });
      } else if (part.type === "shape" && part.shapeAttrs) {
        if (inlineContent.length > 0) {
          cellBlocks.push({
            type: "paragraph",
            attrs: paraAttrs,
            content: [...inlineContent],
          });
          inlineContent.length = 0;
        }
        cellBlocks.push({
          type: "shape",
          attrs: {
            shapeType: part.shapeAttrs.shapeType,
            width: part.shapeAttrs.width,
            height: part.shapeAttrs.height,
            fillColor: part.shapeAttrs.fillColor,
            strokeColor: part.shapeAttrs.strokeColor,
            strokeWidth: part.shapeAttrs.strokeWidth,
            alignment: part.shapeAttrs.alignment,
            ...(part.shapeAttrs.drawingPosition ? { drawingPosition: part.shapeAttrs.drawingPosition } : {}),
          },
        });
      } else if (part.type === "textBox" && part.textBoxAttrs) {
        if (inlineContent.length > 0) {
          cellBlocks.push({
            type: "paragraph",
            attrs: paraAttrs,
            content: [...inlineContent],
          });
          inlineContent.length = 0;
        }
        cellBlocks.push({
          type: "textBox",
          attrs: {
            width: part.textBoxAttrs.width,
            minHeight: part.textBoxAttrs.minHeight,
            alignment: part.textBoxAttrs.alignment,
            backgroundColor: part.textBoxAttrs.backgroundColor,
            borderColor: part.textBoxAttrs.borderColor,
            ...(part.textBoxAttrs.drawingPosition ? { drawingPosition: part.textBoxAttrs.drawingPosition } : {}),
          },
          content:
            part.textBoxAttrs.content && part.textBoxAttrs.content.length > 0
              ? part.textBoxAttrs.content
              : [{ type: "paragraph", content: [{ type: "text", text: "" }] }],
        });
      }
    }

    if (cellParaFmtRev) {
      const cellTextSnippet = inlineContent
        .map((n) => n.text || "")
        .join("")
        .trim();
      paraAttrs.nodeId = cellParaFmtRev.item.targetNodeId;
      paraAttrs.formatRevisions = [cellParaFmtRev.item];
      recordTrackChangeItem(ctx, cellParaFmtRev.item, cellTextSnippet);
    }

    cellBlocks.push({
      type: "paragraph",
      attrs: paraAttrs,
      ...(inlineContent.length > 0 ? { content: inlineContent } : {}),
    });
  }

  // Đảm bảo ô luôn có ít nhất 1 paragraph
  if (cellBlocks.length === 0) {
    cellBlocks.push({ type: "paragraph" });
  }

  const attrs: Record<string, unknown> = {
    colspan,
    rowspan: 1, // Sẽ được cập nhật chính xác qua topological vertical merge pass
  };
  if (colwidth) attrs.colwidth = colwidth;
  if (bgColor) attrs.backgroundColor = bgColor;
  if (vAlign) attrs.verticalAlign = vAlign;
  if (firstParaAlign) attrs.textAlign = firstParaAlign;
  if (cellMargins) {
    attrs.cellMargins = validateAndNormalizeCellMargins(cellMargins);
  }

  return {
    cellNode: {
      type: isHeaderRow ? "tableHeader" : "tableCell",
      attrs,
      content: cellBlocks,
    },
    colSpan: colspan,
    vMerge,
    cellBlocks,
    hasDirectText: hasMeaningfulBlockContent(cellBlocks),
  };
}

/**
 * Phân tích bảng (<w:tbl>) và ánh xạ sang Table Engine 2.0 AST hoàn chỉnh
 */
function parseTable(tblEl: Element, ctx: DocumentMapperContext): JSONContent {
  const tblPr = getFirstChildByLocalName(tblEl, "tblpr");

  // 1. Phân tích Column Grid (<w:tblGrid>)
  const gridColWidths: number[] = [];
  const tblGridEl = getFirstChildByLocalName(tblEl, "tblgrid");
  if (tblGridEl) {
    for (const colEl of getDirectChildrenByLocalName(tblGridEl, "gridcol")) {
      const wVal = getAttrValue(colEl, "w");
      if (wVal) {
        const twips = parseInt(wVal, 10);
        if (!isNaN(twips) && twips > 0) {
          gridColWidths.push(Math.max(20, Math.round(twips / 15)));
        }
      }
    }
  }

  // 2. Phân tích Table Properties (<w:tblPr>)
  let layoutMode: TableLayoutMode = "autoWindow";
  let tableWidth: string = "100%";

  if (tblPr) {
    const tblWEl = getFirstChildByLocalName(tblPr, "tblw");
    if (tblWEl) {
      const wType = (getAttrValue(tblWEl, "type") || "").toLowerCase();
      const wVal = getAttrValue(tblWEl, "w");
      const wNum = wVal ? parseInt(wVal, 10) : NaN;

      if (wType === "auto" || wNum === 0) {
        layoutMode = "autoContent";
        tableWidth = "auto";
      } else if (wType === "pct" && !isNaN(wNum) && wNum > 0) {
        layoutMode = "autoWindow";
        const pct = Math.round(wNum / 50);
        tableWidth = `${pct}%`;
      } else if (wType === "dxa" && !isNaN(wNum) && wNum > 0) {
        layoutMode = "fixed";
        tableWidth = `${Math.round(wNum / 15)}px`;
      }
    }

    const tblLayoutEl = getFirstChildByLocalName(tblPr, "tbllayout");
    if (tblLayoutEl) {
      const lType = (getAttrValue(tblLayoutEl, "type") || "").toLowerCase();
      if (lType === "fixed") {
        layoutMode = "fixed";
      } else if (lType === "autofit") {
        if (tableWidth === "auto") {
          layoutMode = "autoContent";
        } else {
          layoutMode = "autoWindow";
        }
      }
    }
  }

  // Cell Margins mặc định của bảng (<w:tblCellMar>)
  const tblCellMarEl = tblPr ? getFirstChildByLocalName(tblPr, "tblcellmar") : null;
  const parsedTableMargins = parseCellMarginsElement(tblCellMarEl);
  const tableCellMargins = validateAndNormalizeCellMargins(parsedTableMargins);

  // Table Style & Style Options (<w:tblStyle>, <w:tblLook>)
  const tblStyleEl = tblPr ? getFirstChildByLocalName(tblPr, "tblstyle") : null;
  const rawStyleVal = getValAttribute(tblStyleEl);
  const tableStyleId = mapDocxTableStyleId(rawStyleVal);

  const tblLookEl = tblPr ? getFirstChildByLocalName(tblPr, "tbllook") : null;
  const tableStyleOptions = parseTableLookElement(tblLookEl);

  // Table Borders (<w:tblBorders>)
  const tblBordersEl = tblPr ? getFirstChildByLocalName(tblPr, "tblborders") : null;
  const tableBorders = parseTableBorders(tblBordersEl);

  // Table Caption / ID (<w:tblCaption>)
  const tblCaptionEl = tblPr ? getFirstChildByLocalName(tblPr, "tblcaption") : null;
  const tableId = tblCaptionEl ? (getValAttribute(tblCaptionEl) || getAttrValue(tblCaptionEl, "w:val")) : null;

  // 3. Phân tích các hàng (<w:tr>) với topological Vertical Merge
  interface ActiveMerge {
    masterCell: JSONContent;
    startGridCol: number;
    spanCols: number;
  }
  const activeMerges = new Map<number, ActiveMerge>();
  let hasAnyRepeatHeader = false;
  const rows: JSONContent[] = [];

  const trNodes = getDirectChildrenByLocalName(tblEl, "tr");

  for (const trEl of trNodes) {
    const trPr = getFirstChildByLocalName(trEl, "trpr");
    const isHeaderRow = Boolean(getFirstChildByLocalName(trPr || trEl, "tblheader"));
    if (isHeaderRow) {
      hasAnyRepeatHeader = true;
    }

    // Row Height (<w:trHeight>)
    let rowHeight: number | null = null;
    let rowHeightRule: RowHeightRule = "auto";
    const trHeightEl = trPr ? getFirstChildByLocalName(trPr, "trheight") : null;
    if (trHeightEl) {
      const hValStr = getAttrValue(trHeightEl, "val");
      const hTwips = hValStr ? parseInt(hValStr, 10) : NaN;
      if (!isNaN(hTwips) && hTwips > 0) {
        rowHeight = Math.max(10, Math.round(hTwips / 15));
        const hRuleStr = (getAttrValue(trHeightEl, "hrule") || "").toLowerCase();
        rowHeightRule = hRuleStr === "exact" ? "exact" : "atLeast";
      }
    }

    const rowAttrs: Record<string, unknown> = {
      rowHeight,
      rowHeightRule,
    };

    const cells: JSONContent[] = [];
    const tcNodes = getDirectChildrenByLocalName(trEl, "tc");
    let currentGridCol = 0;
    if (trPr) {
      const gridBeforeEl = getFirstChildByLocalName(trPr, "gridbefore");
      const gbVal = gridBeforeEl ? parseInt(getValAttribute(gridBeforeEl) || "0", 10) : 0;
      if (!isNaN(gbVal) && gbVal > 0) {
        currentGridCol = gbVal;
      }
    }
    const handledMastersInThisRow = new Set<JSONContent>();

    for (const tcEl of tcNodes) {
      const parsed = parseTableCellRaw(tcEl, isHeaderRow, ctx);
      const colSpan = parsed.colSpan;
      const vMerge = parsed.vMerge;
      const cellNode = parsed.cellNode;

      // Bổ sung colwidth từ gridColWidths nếu cell chưa có hoặc spans multiple cols
      if (gridColWidths.length >= currentGridCol + colSpan) {
        const slice = gridColWidths.slice(currentGridCol, currentGridCol + colSpan);
        if (slice.length > 0) {
          cellNode.attrs = cellNode.attrs || {};
          cellNode.attrs.colwidth = slice;
        }
      }

      if (vMerge === "restart") {
        cellNode.attrs = cellNode.attrs || {};
        cellNode.attrs.rowspan = 1;

        const mergeInfo: ActiveMerge = {
          masterCell: cellNode,
          startGridCol: currentGridCol,
          spanCols: colSpan,
        };

        for (let c = currentGridCol; c < currentGridCol + colSpan; c++) {
          activeMerges.set(c, mergeInfo);
        }

        cells.push(cellNode);
      } else if (vMerge === "continue") {
        const active = activeMerges.get(currentGridCol);
        if (active) {
          // Increment rowspan duy nhất 1 lần cho mỗi master cell trên hàng này
          if (!handledMastersInThisRow.has(active.masterCell)) {
            handledMastersInThisRow.add(active.masterCell);
            active.masterCell.attrs = active.masterCell.attrs || {};
            const curSpan =
              typeof active.masterCell.attrs.rowspan === "number"
                ? active.masterCell.attrs.rowspan
                : 1;
            active.masterCell.attrs.rowspan = curSpan + 1;
          }

          // Bảo toàn văn bản: nối vào master nếu ô continuation có chữ
          if (parsed.hasDirectText) {
            appendNonEmptyContent(active.masterCell, parsed.cellBlocks);
          }

          // KHÔNG thêm cellNode vào cells (loại bỏ fake continuation cell)
        } else {
          // Trường hợp dị thường: vMerge continue nhưng không có restart trước đó
          // Fail-safe: xử lý như ô bình thường để không crash và không mất text
          cellNode.attrs = cellNode.attrs || {};
          cellNode.attrs.rowspan = 1;
          cells.push(cellNode);
        }
      } else {
        // Ô bình thường: đóng mọi merge đang chạy trên các cột tương ứng
        for (let c = currentGridCol; c < currentGridCol + colSpan; c++) {
          activeMerges.delete(c);
        }

        cellNode.attrs = cellNode.attrs || {};
        cellNode.attrs.rowspan = 1;
        cells.push(cellNode);
      }

      currentGridCol += colSpan;
    }

    rows.push({
      type: "tableRow",
      attrs: rowAttrs,
      content: cells,
    });
  }

  if (rows.length === 0) {
    rows.push({
      type: "tableRow",
      attrs: { rowHeight: null, rowHeightRule: "auto" },
      content: [
        {
          type: "tableCell",
          attrs: { colspan: 1, rowspan: 1 },
          content: [{ type: "paragraph" }],
        },
      ],
    });
  }

  const tableAttrs: Record<string, unknown> = {
    ...(tableId ? { id: tableId, targetId: tableId } : {}),
    borders: tableBorders,
    repeatHeader: hasAnyRepeatHeader,
    layoutMode,
    tableWidth,
    cellMargins: tableCellMargins,
    tableStyleId,
    tableStyleOptions,
  };

  return {
    type: "table",
    attrs: tableAttrs,
    content: rows,
  };
}

interface IntermediateListItem {
  isBullet: boolean;
  level: number;
  paragraphAttrs: Record<string, unknown>;
  content: JSONContent[];
}

/**
 * Gom cụm các list item kế tiếp nhau thành cây lồng cấp bulletList / orderedList chuẩn ProseMirror
 */
function groupListItemsIntoProseMirrorTree(items: IntermediateListItem[]): JSONContent[] {
  if (items.length === 0) return [];

  const rootListType = items[0].isBullet ? "bulletList" : "orderedList";

  interface LevelNode {
    type: "bulletList" | "orderedList";
    content: JSONContent[];
  }

  const stack: { level: number; listNode: LevelNode; currentListItem: JSONContent | null }[] = [];

  const rootList: LevelNode = {
    type: rootListType,
    content: [],
  };
  stack.push({ level: 0, listNode: rootList, currentListItem: null });

  for (const item of items) {
    const targetLevel = Math.max(0, item.level);

    // Thu nhỏ stack nếu targetLevel nhỏ hơn đỉnh stack
    while (stack.length > 1 && stack[stack.length - 1].level > targetLevel) {
      stack.pop();
    }

    // Nếu targetLevel cao hơn đỉnh stack, lồng thêm sub-list vào currentListItem của đỉnh
    while (stack[stack.length - 1].level < targetLevel) {
      const top = stack[stack.length - 1];
      const subListType = item.isBullet ? "bulletList" : "orderedList";
      const subList: LevelNode = {
        type: subListType,
        content: [],
      };

      if (top.currentListItem) {
        if (!top.currentListItem.content) top.currentListItem.content = [];
        top.currentListItem.content.push(subList);
      } else {
        top.listNode.content.push(subList);
      }

      stack.push({
        level: stack[stack.length - 1].level + 1,
        listNode: subList,
        currentListItem: null,
      });
    }

    // Tại đúng level
    const currentFrame = stack[stack.length - 1];
    const listItemNode: JSONContent = {
      type: "listItem",
      content: [
        {
          type: "paragraph",
          ...(Object.keys(item.paragraphAttrs).length > 0 ? { attrs: item.paragraphAttrs } : {}),
          ...(item.content.length > 0 ? { content: item.content } : {}),
        },
      ],
    };

    currentFrame.listNode.content.push(listItemNode);
    currentFrame.currentListItem = listItemNode;
  }

  return [rootList];
}

/**
 * Phân tích toàn bộ phần thân văn bản word/document.xml
 */
export function mapDocxXmlToDocumentModel(
  documentXml: string,
  ctx: DocumentMapperContext
): MappedDocumentResult {
  const doc = parseXmlString(documentXml);
  const root = doc.documentElement;
  if (!root) {
    throw new Error("Không thể phân tích cây DOM của word/document.xml.");
  }

  const bodyEl = getFirstChildByLocalName(root, "body");
  if (!bodyEl) {
    throw new Error("Tệp word/document.xml thiếu thẻ w:body.");
  }

  // Khởi tạo các cấu trúc thu thập review metadata (Phase 5.8)
  ctx.activeCommentIds = ctx.activeCommentIds || new Set<string>();
  ctx.commentAnchorTexts = ctx.commentAnchorTexts || new Map<string, string[]>();
  ctx.trackedChangesMap = ctx.trackedChangesMap || new Map<string, TrackChangeItem>();

  const finalBlocks: JSONContent[] = [];
  let pendingListItems: IntermediateListItem[] = [];
  let currentListNumId: number | null = null;
  let currentListIsBullet: boolean | null = null;

  // Thu thập các section break nodes và sectPr theo thứ tự OOXML
  const sectionBreakNodes: { node: JSONContent }[] = [];
  const collectedSectPrs: (Element | null)[] = [];

  function flushPendingList() {
    if (pendingListItems.length > 0) {
      const grouped = groupListItemsIntoProseMirrorTree(pendingListItems);
      finalBlocks.push(...grouped);
      pendingListItems = [];
      currentListNumId = null;
      currentListIsBullet = null;
    }
  }

  // Duyệt các con trực tiếp của w:body
  for (let i = 0; i < bodyEl.childNodes.length; i++) {
    const child = bodyEl.childNodes[i];
    if (child.nodeType !== 1) continue;
    const local = getLocalName(child).toLowerCase();

    // Comment Range Start / End ở cấp độ body (Phase 5.8)
    if (local === "commentrangestart") {
      const cid = getAttrValue(child as Element, "id");
      if (cid && ctx.activeCommentIds) {
        ctx.activeCommentIds.add(cid);
      }
      continue;
    }
    if (local === "commentrangeend") {
      const cid = getAttrValue(child as Element, "id");
      if (cid && ctx.activeCommentIds) {
        ctx.activeCommentIds.delete(cid);
      }
      continue;
    }

    // 1. Thẻ Bảng (<w:tbl>)
    if (local === "tbl") {
      flushPendingList();
      finalBlocks.push(parseTable(child as Element, ctx));
      continue;
    }

    // 1.5. Thẻ Công thức toán học đứng trực tiếp dưới body (<m:oMathPara> hoặc <m:oMath>)
    if (local === "omathpara" || local === "omath") {
      flushPendingList();
      let mathResult: any = null;
      try {
        mathResult = OmmlEngine.parseOmml(child as Element);
      } catch (err: any) {
        ctx.warnings.push(`Lỗi phân tích cú pháp OMML: ${err?.message || String(err)}`);
      }

      if (mathResult && mathResult.latex.trim()) {
        finalBlocks.push({
          type: "equation",
          attrs: {
            latex: mathResult.latex,
            displayMode: true,
            alignment: mathResult.alignment,
          },
        });
        if (mathResult.warnings.length > 0) {
          ctx.warnings.push(...mathResult.warnings);
          ctx.diagnostics?.recordApproximated(
            "Equation",
            "OMML_APPROXIMATED",
            "Công thức toán học có cảnh báo cú pháp nhưng đã được chuyển đổi an toàn."
          );
        } else {
          ctx.diagnostics?.recordPreserved(
            "Equation",
            "OMML_PRESERVED",
            "Công thức toán học Office Math (OMML) được bảo toàn nguyên vẹn."
          );
        }
      } else {
        const fallbackText = (child as Element).textContent?.trim() || "[Equation]";
        finalBlocks.push({
          type: "paragraph",
          content: [{ type: "text", text: fallbackText }],
        });
        ctx.diagnostics?.recordApproximated(
          "Equation",
          "OMML_INVALID_FALLBACK",
          "Công thức toán học không hợp lệ hoặc bị hỏng đã được chuyển đổi an toàn sang văn bản thay thế."
        );
      }
      continue;
    }

    // 2. Thẻ Đoạn văn (<w:p>)
    if (local === "p") {
      const pEl = child as Element;
      const pPrEl = getFirstChildByLocalName(pEl, "ppr");
      const directParaProps = parseParagraphProperties(pPrEl);

      // Tra cứu style
      const pStyleEl = getFirstChildByLocalName(pPrEl, "pstyle");
      const styleId = getValAttribute(pStyleEl);
      let matchedStyle: DocxStyle | undefined;
      let mappedStyleId: string | undefined;

      if (styleId) {
        matchedStyle = ctx.styles.get(styleId) || ctx.styles.get(styleId.toLowerCase());
        mappedStyleId =
          ctx.styleIdMap?.get(styleId) || ctx.styleIdMap?.get(styleId.toLowerCase());
      }

      let parsedParaFmtRev: ParsedParagraphPropertiesChange | null = null;
      if (pPrEl && getFirstChildByLocalName(pPrEl, "pprchange")) {
        const targetNodeId = `p-node-${Math.random().toString(36).substring(2, 9)}`;
        parsedParaFmtRev = DocxFormattingRevisionMapper.parseParagraphPropertiesChange(
          pPrEl,
          directParaProps,
          mappedStyleId,
          ctx.styleIdMap,
          targetNodeId
        );
        if (parsedParaFmtRev) {
          if (ctx.trackedChangesMap && ctx.trackedChangesMap.has(parsedParaFmtRev.id)) {
            const existing = ctx.trackedChangesMap.get(parsedParaFmtRev.id)!;
            const isSame =
              existing.author === parsedParaFmtRev.author &&
              existing.type === "format" &&
              (existing.formatDetails === parsedParaFmtRev.summary || existing.scope === parsedParaFmtRev.scope);
            if (!isSame) {
              let counter = 2;
              while (ctx.trackedChangesMap.has(`${parsedParaFmtRev.id}_dup${counter}`)) {
                counter++;
              }
              const disambiguatedId = `${parsedParaFmtRev.id}_dup${counter}`;
              parsedParaFmtRev.id = disambiguatedId;
              parsedParaFmtRev.item.id = disambiguatedId;
              ctx.diagnostics?.recordApproximated(
                "TrackChanges",
                "DUPLICATE_REVISION_ID_DISAMBIGUATED",
                `Phát hiện ID revision trùng lặp "${parsedParaFmtRev.id}"; đã phân giải thành "${disambiguatedId}".`
              );
            }
          }

          ctx.diagnostics?.recordPreserved(
            "TrackChanges",
            "PARAGRAPH_FORMATTING_REVISION_IMPORTED",
            `Nhập thành công Paragraph Formatting Revision (${parsedParaFmtRev.summary}).`
          );
        }
      }

      // Kế thừa formatting từ style
      const effectiveHeadingLevel =
        directParaProps.headingLevel ?? matchedStyle?.headingLevel;

      const effectiveAlignment =
        directParaProps.alignment ?? matchedStyle?.paragraphFormatting.alignment;

      const effectiveLineSpacing =
        directParaProps.lineSpacing ?? matchedStyle?.paragraphFormatting.lineSpacing;

      const effectiveIndent =
        directParaProps.indent ?? matchedStyle?.paragraphFormatting.indent;

      const effectiveNumPr =
        directParaProps.numPr ?? matchedStyle?.paragraphFormatting.numPr;

      // Phân tích các runs con bên trong paragraph
      const runsResult = parseParagraphRuns(
        pEl,
        matchedStyle?.runFormatting || {},
        ctx
      );

      // Tách các phần tử con thành inline text hoặc image / equation / pageBreak block
      const currentInline: JSONContent[] = [];
      let hasEmittedBlockInParagraph = false;

      for (const part of runsResult.parts) {
        if (part.type === "pageBreak") {
          // Ngắt trang giữa chừng paragraph
          if (currentInline.length > 0 || !effectiveNumPr) {
            emitParagraphBlock(currentInline);
            currentInline.length = 0;
          }
          flushPendingList();
          finalBlocks.push({ type: "pageBreak" });
        } else if (part.type === "image" && part.imageAttrs) {
          // Node ảnh block atom
          if (currentInline.length > 0) {
            emitParagraphBlock(currentInline);
            currentInline.length = 0;
          }
          flushPendingList();
          hasEmittedBlockInParagraph = true;
          finalBlocks.push({
            type: "image",
            attrs: {
              src: part.imageAttrs.src,
              alt: part.imageAttrs.alt || "Hình ảnh",
              title: part.imageAttrs.title || "",
              width: part.imageAttrs.width,
              height: part.imageAttrs.height,
              alignment: part.imageAttrs.alignment,
              ...(part.imageAttrs.drawingPosition
                ? {
                    drawingPosition: part.imageAttrs.drawingPosition,
                    floating: part.imageAttrs.drawingPosition.placement === "floating",
                    wrap: part.imageAttrs.drawingPosition.wrapMode,
                  }
                : {}),
              ...(part.imageAttrs.isMissingMedia ? { isMissingMedia: true } : {}),
            },
          });
        } else if (part.type === "shape" && part.shapeAttrs) {
          // Node hình vẽ vector block atom
          if (currentInline.length > 0) {
            emitParagraphBlock(currentInline);
            currentInline.length = 0;
          }
          flushPendingList();
          hasEmittedBlockInParagraph = true;
          finalBlocks.push({
            type: "shape",
            attrs: {
              shapeType: part.shapeAttrs.shapeType,
              width: part.shapeAttrs.width,
              height: part.shapeAttrs.height,
              fillColor: part.shapeAttrs.fillColor,
              strokeColor: part.shapeAttrs.strokeColor,
              strokeWidth: part.shapeAttrs.strokeWidth,
              alignment: part.shapeAttrs.alignment,
              ...(part.shapeAttrs.drawingPosition
                ? {
                    drawingPosition: part.shapeAttrs.drawingPosition,
                    floating: part.shapeAttrs.drawingPosition.placement === "floating",
                    wrap: part.shapeAttrs.drawingPosition.wrapMode,
                  }
                : {}),
            },
          });
        } else if (part.type === "textBox" && part.textBoxAttrs) {
          // Node hộp văn bản block atom
          if (currentInline.length > 0) {
            emitParagraphBlock(currentInline);
            currentInline.length = 0;
          }
          flushPendingList();
          hasEmittedBlockInParagraph = true;
          finalBlocks.push({
            type: "textBox",
            attrs: {
              width: part.textBoxAttrs.width,
              minHeight: part.textBoxAttrs.minHeight,
              alignment: part.textBoxAttrs.alignment,
              backgroundColor: part.textBoxAttrs.backgroundColor,
              borderColor: part.textBoxAttrs.borderColor,
              ...(part.textBoxAttrs.drawingPosition
                ? {
                    drawingPosition: part.textBoxAttrs.drawingPosition,
                    floating: part.textBoxAttrs.drawingPosition.placement === "floating",
                    wrap: part.textBoxAttrs.drawingPosition.wrapMode,
                  }
                : {}),
            },
            content:
              part.textBoxAttrs.content && part.textBoxAttrs.content.length > 0
                ? part.textBoxAttrs.content
                : [
                    {
                      type: "paragraph",
                      content: [{ type: "text", text: "" }],
                    },
                  ],
          });
        } else if (part.type === "hardBreak") {
          currentInline.push({ type: "hardBreak" });
        } else if (part.type === "noteReference" && part.noteAttrs) {
          currentInline.push({
            type: "noteReference",
            attrs: {
              noteId: part.noteAttrs.noteId,
              noteType: part.noteAttrs.noteType,
              content: part.noteAttrs.content,
            },
          });
        } else if (part.type === "bookmarkAnchor" && part.bookmarkAnchorAttrs) {
          currentInline.push({
            type: "bookmarkAnchor",
            attrs: {
              id: part.bookmarkAnchorAttrs.id,
              name: part.bookmarkAnchorAttrs.name,
              createdAt: part.bookmarkAnchorAttrs.createdAt,
            },
          });
        } else if (part.type === "crossReference" && part.crossReferenceAttrs) {
          currentInline.push({
            type: "crossReference",
            attrs: {
              targetId: part.crossReferenceAttrs.targetId,
              targetType: part.crossReferenceAttrs.targetType || "bookmark",
              format: part.crossReferenceAttrs.format || "text",
              customText: part.crossReferenceAttrs.customText || null,
            },
            ...(part.marks && part.marks.length > 0 ? { marks: part.marks } : {}),
          });
        } else if (part.type === "field" && part.fieldAttrs) {
          currentInline.push({
            type: "field",
            attrs: {
              fieldType: part.fieldAttrs.fieldType,
              instruction: part.fieldAttrs.instruction,
              result: part.fieldAttrs.result,
              argument: part.fieldAttrs.argument || null,
              switches: part.fieldAttrs.switches || [],
              rawInstruction: part.fieldAttrs.rawInstruction || null,
              isComplex: Boolean(part.fieldAttrs.isComplex),
            },
            ...(part.marks && part.marks.length > 0 ? { marks: part.marks } : {}),
          });
        } else if (part.type === "equation" && part.equationAttrs) {
          // Khối phương trình toán học (Equation Block)
          if (currentInline.length > 0) {
            emitParagraphBlock(currentInline);
            currentInline.length = 0;
          }
          flushPendingList();
          hasEmittedBlockInParagraph = true;
          finalBlocks.push({
            type: "equation",
            attrs: {
              latex: part.equationAttrs.latex,
              displayMode: part.equationAttrs.displayMode,
              alignment: part.equationAttrs.alignment,
            },
          });
        } else if (part.type === "text" && part.text) {
          currentInline.push({
            type: "text",
            text: part.text,
            ...(part.marks && part.marks.length > 0 ? { marks: part.marks } : {}),
          });
        }
      }

      // Phát hành phần text còn lại nếu có hoặc nếu chưa phát hành block nào trong paragraph
      if (currentInline.length > 0 || !hasEmittedBlockInParagraph) {
        if (effectiveNumPr) {
          // Đây là một mục danh sách
          const listMeta = resolveListType(
            ctx.numbering,
            effectiveNumPr.numId,
            effectiveNumPr.ilvl
          );

          // Nếu numId hoặc loại danh sách thay đổi so với danh sách đang dồn, flush danh sách cũ
          if (
            pendingListItems.length > 0 &&
            (currentListNumId !== effectiveNumPr.numId || currentListIsBullet !== listMeta.isBullet)
          ) {
            flushPendingList();
          }
          currentListNumId = effectiveNumPr.numId;
          currentListIsBullet = listMeta.isBullet;

          const paraAttrs: Record<string, unknown> = {
            styleId: mappedStyleId || STYLE_NORMAL_ID,
          };
          if (directParaProps.alignment) paraAttrs.textAlign = directParaProps.alignment;
          else if (!mappedStyleId && effectiveAlignment) paraAttrs.textAlign = effectiveAlignment;

          if (directParaProps.lineSpacing) paraAttrs.lineSpacing = directParaProps.lineSpacing;
          else if (!mappedStyleId && effectiveLineSpacing) paraAttrs.lineSpacing = effectiveLineSpacing;
          if (directParaProps.spacingBefore !== undefined) paraAttrs.spacingBefore = directParaProps.spacingBefore;
          if (directParaProps.spacingAfter !== undefined) paraAttrs.spacingAfter = directParaProps.spacingAfter;

          if (parsedParaFmtRev) {
            const listSnippet = currentInline
              .map((n) => n.text || "")
              .join("")
              .trim();
            paraAttrs.nodeId = parsedParaFmtRev.item.targetNodeId;
            paraAttrs.formatRevisions = [parsedParaFmtRev.item];
            recordTrackChangeItem(ctx, parsedParaFmtRev.item, listSnippet);
          }

          pendingListItems.push({
            isBullet: listMeta.isBullet,
            level: effectiveNumPr.ilvl,
            paragraphAttrs: paraAttrs,
            content: [...currentInline],
          });
        } else {
          flushPendingList();
          emitParagraphBlock(currentInline);
        }
      }

      // Kiểm tra xem đoạn văn này có chứa section break (pPr/sectPr) không
      if (runsResult.nextSectionPr) {
        flushPendingList();
        collectedSectPrs.push(runsResult.nextSectionPr);

        const breakNode: JSONContent = {
          type: "sectionBreak",
          attrs: {
            sectionType: "nextPage",
            sectionId: `sec-${Math.random().toString(36).substring(2, 9)}`,
          },
        };
        sectionBreakNodes.push({ node: breakNode });
        finalBlocks.push(breakNode);
      }

      function emitParagraphBlock(inlineNodes: JSONContent[]) {
        if (effectiveHeadingLevel) {
          const headingText = inlineNodes
            .map((n) => n.text || "")
            .join("")
            .trim();
          const headingId = ReferenceAnchorService.generateAnchorId("heading", headingText);

          // Gán styleId phù hợp cho heading
          const headingStyleId =
            (mappedStyleId && matchedStyle?.headingLevel === effectiveHeadingLevel)
              ? mappedStyleId
              : effectiveHeadingLevel === 1
              ? STYLE_HEADING_1_ID
              : effectiveHeadingLevel === 2
              ? STYLE_HEADING_2_ID
              : STYLE_HEADING_3_ID;

          const headingAttrs: Record<string, unknown> = {
            id: headingId,
            level: effectiveHeadingLevel,
            styleId: headingStyleId,
          };
          if (directParaProps.alignment) headingAttrs.textAlign = directParaProps.alignment;
          else if (effectiveAlignment) headingAttrs.textAlign = effectiveAlignment;

          if (directParaProps.lineSpacing) headingAttrs.lineSpacing = directParaProps.lineSpacing;
          else if (effectiveLineSpacing) headingAttrs.lineSpacing = effectiveLineSpacing;
          if (directParaProps.spacingBefore !== undefined) headingAttrs.spacingBefore = directParaProps.spacingBefore;
          if (directParaProps.spacingAfter !== undefined) headingAttrs.spacingAfter = directParaProps.spacingAfter;
          if (directParaProps.keepWithNext !== undefined) headingAttrs.keepWithNext = directParaProps.keepWithNext;
          if (directParaProps.keepLinesTogether !== undefined) headingAttrs.keepLinesTogether = directParaProps.keepLinesTogether;
          if (directParaProps.pageBreakBefore !== undefined) headingAttrs.pageBreakBefore = directParaProps.pageBreakBefore;
          if (directParaProps.widowControl !== undefined) headingAttrs.widowControl = directParaProps.widowControl;

          if (parsedParaFmtRev) {
            headingAttrs.nodeId = parsedParaFmtRev.item.targetNodeId || headingId;
            headingAttrs.formatRevisions = [parsedParaFmtRev.item];
            recordTrackChangeItem(ctx, parsedParaFmtRev.item, headingText);
          }

          finalBlocks.push({
            type: "heading",
            attrs: headingAttrs,
            ...(inlineNodes.length > 0 ? { content: [...inlineNodes] } : {}),
          });
        } else if (styleId && styleId.toLowerCase() === "caption") {
          const rawText = inlineNodes
            .map((n) => n.text || "")
            .join("")
            .trim();
          const match = rawText.match(
            /^(Figure|Table|Equation|Hình|Bảng|Công thức)\s*(\d+)?\s*(?:—|-|:)?\s*(.*)$/i
          );
          const label = match && match[1] ? match[1] : "Figure";
          const text = match && match[3] ? match[3].trim() : rawText;
          const captionId = `ref_cap_${label.toLowerCase()}_${Date.now()}_${Math.random()
            .toString(36)
            .substring(2, 6)}`;

          finalBlocks.push({
            type: "caption",
            attrs: {
              id: captionId,
              label,
              text,
            },
            ...(text ? { content: [{ type: "text", text }] } : {}),
          });
        } else {
          const paraAttrs: Record<string, unknown> = {
            styleId: mappedStyleId || STYLE_NORMAL_ID,
          };
          if (directParaProps.alignment) paraAttrs.textAlign = directParaProps.alignment;
          else if (!mappedStyleId && effectiveAlignment) paraAttrs.textAlign = effectiveAlignment;

          if (directParaProps.lineSpacing) paraAttrs.lineSpacing = directParaProps.lineSpacing;
          else if (!mappedStyleId && effectiveLineSpacing) paraAttrs.lineSpacing = effectiveLineSpacing;
          if (directParaProps.spacingBefore !== undefined) paraAttrs.spacingBefore = directParaProps.spacingBefore;
          if (directParaProps.spacingAfter !== undefined) paraAttrs.spacingAfter = directParaProps.spacingAfter;
          if (directParaProps.leftIndent !== undefined) paraAttrs.leftIndent = directParaProps.leftIndent;
          if (directParaProps.rightIndent !== undefined) paraAttrs.rightIndent = directParaProps.rightIndent;
          if (directParaProps.firstLineIndent !== undefined) paraAttrs.firstLineIndent = directParaProps.firstLineIndent;
          if (directParaProps.hangingIndent !== undefined) paraAttrs.hangingIndent = directParaProps.hangingIndent;
          if (directParaProps.indent !== undefined) {
            paraAttrs.indent = directParaProps.indent;
          } else if (!mappedStyleId && effectiveIndent) {
            paraAttrs.indent = effectiveIndent;
          }
          if (directParaProps.keepWithNext !== undefined) {
            paraAttrs.keepWithNext = directParaProps.keepWithNext;
          } else if (!mappedStyleId && matchedStyle?.paragraphFormatting.keepWithNext !== undefined) {
            paraAttrs.keepWithNext = matchedStyle.paragraphFormatting.keepWithNext;
          }
          if (directParaProps.keepLinesTogether !== undefined) {
            paraAttrs.keepLinesTogether = directParaProps.keepLinesTogether;
          } else if (!mappedStyleId && matchedStyle?.paragraphFormatting.keepLinesTogether !== undefined) {
            paraAttrs.keepLinesTogether = matchedStyle.paragraphFormatting.keepLinesTogether;
          }
          if (directParaProps.pageBreakBefore !== undefined) {
            paraAttrs.pageBreakBefore = directParaProps.pageBreakBefore;
          } else if (!mappedStyleId && matchedStyle?.paragraphFormatting.pageBreakBefore !== undefined) {
            paraAttrs.pageBreakBefore = matchedStyle.paragraphFormatting.pageBreakBefore;
          }
          if (directParaProps.widowControl !== undefined) {
            paraAttrs.widowControl = directParaProps.widowControl;
          } else if (!mappedStyleId && matchedStyle?.paragraphFormatting.widowControl !== undefined) {
            paraAttrs.widowControl = matchedStyle.paragraphFormatting.widowControl;
          }

          if (parsedParaFmtRev) {
            const paraSnippet = inlineNodes
              .map((n) => n.text || "")
              .join("")
              .trim();
            paraAttrs.nodeId = parsedParaFmtRev.item.targetNodeId;
            paraAttrs.formatRevisions = [parsedParaFmtRev.item];
            recordTrackChangeItem(ctx, parsedParaFmtRev.item, paraSnippet);
          }

          finalBlocks.push({
            type: "paragraph",
            attrs: paraAttrs,
            ...(inlineNodes.length > 0 ? { content: [...inlineNodes] } : {}),
          });
        }
      }
    }
  }

  flushPendingList();

  // Đảm bảo document luôn có ít nhất 1 paragraph
  if (finalBlocks.length === 0) {
    finalBlocks.push({
      type: "paragraph",
      content: [{ type: "text", text: "" }],
    });
  }

  // Thu thập section properties cuối cùng của document (body/sectPr)
  const finalSectPr = getFirstChildByLocalName(bodyEl, "sectpr");
  collectedSectPrs.push(finalSectPr);

  // Theo chuẩn OOXML:
  // - sectPr xuất hiện trong paragraph xác định thuộc tính của section kết thúc tại đó (Section 1..k-1).
  // - body/sectPr xác định thuộc tính của section cuối cùng (Section k).
  // Vì vậy:
  // - Section 1 (document-level) sử dụng collectedSectPrs[0].
  // - sectionBreak thứ i (chuyển sang Section i+1) sử dụng collectedSectPrs[i+1].
  if (!ctx.parsedHeaderCache) ctx.parsedHeaderCache = new Map();
  if (!ctx.parsedFooterCache) ctx.parsedFooterCache = new Map();

  const initialSectPr = collectedSectPrs[0];
  const initialPageSettings = parseSectionPageSettings(initialSectPr);
  const initialHeaderFooter = extractSectionHeaderFooter(
    initialSectPr,
    ctx.relationships,
    ctx.headersXmlMap,
    ctx.footersXmlMap,
    ctx.headerRelsMap,
    ctx.footerRelsMap,
    ctx.mediaByPath,
    ctx.mediaByRelId,
    ctx.parsedHeaderCache,
    ctx.parsedFooterCache
  );

  // Gán cấu hình section cho các node sectionBreak
  for (let s = 0; s < sectionBreakNodes.length; s++) {
    const nextSectPr = collectedSectPrs[s + 1];
    const secSettings = parseSectionPageSettings(nextSectPr);
    const secHf = extractSectionHeaderFooter(
      nextSectPr,
      ctx.relationships,
      ctx.headersXmlMap,
      ctx.footersXmlMap,
      ctx.headerRelsMap,
      ctx.footerRelsMap,
      ctx.mediaByPath,
      ctx.mediaByRelId,
      ctx.parsedHeaderCache,
      ctx.parsedFooterCache
    );

    sectionBreakNodes[s].node.attrs = {
      ...sectionBreakNodes[s].node.attrs,
      pageSettings: secSettings,
      headerFooter: secHf,
    };
  }

  // Thu thập và chuyển đổi Comments từ word/comments.xml (Phase 5.8)
  const docComments: CommentItem[] = [];
  if (ctx.comments && ctx.comments.size > 0) {
    for (const [wId, parsed] of ctx.comments.entries()) {
      const internalId = `comment-${wId}`;
      const anchorPieces = ctx.commentAnchorTexts?.get(internalId) || [];
      const selectedText = anchorPieces.join("").trim() || undefined;

      if (parsed.parentCommentId) {
        ctx.warnings.push(
          `Bình luận #${wId} là phản hồi phân cấp (Threaded Comment); đã chuyển đổi thành bình luận độc lập để bảo toàn nội dung.`
        );
      }

      docComments.push({
        id: internalId,
        author: parsed.author,
        createdAt: parsed.date,
        updatedAt: parsed.date,
        content: parsed.content,
        resolved: parsed.resolved ?? false,
        selectedText,
      });

      ctx.diagnostics?.recordPreserved(
        "Comments",
        "COMMENT_BODY_PRESERVED",
        `Bình luận #${wId} của tác giả "${parsed.author}" được bảo toàn đầy đủ nội dung.`
      );
    }
  }

  const trackedChangesList: TrackChangeItem[] = ctx.trackedChangesMap
    ? Array.from(ctx.trackedChangesMap.values())
    : [];

  return {
    content: {
      type: "doc",
      content: finalBlocks,
    },
    initialPageSettings,
    initialHeaderFooter,
    comments: docComments.length > 0 ? docComments : undefined,
    trackedChanges: trackedChangesList.length > 0 ? trackedChangesList : undefined,
  };
}
