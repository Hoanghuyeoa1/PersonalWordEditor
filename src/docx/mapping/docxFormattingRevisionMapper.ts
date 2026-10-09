import type { Element } from "@xmldom/xmldom";
import type {
  FormattingPropertyDiff,
  FormattingRevisionScope,
  TrackChangeItem,
} from "../../document/documentTypes.ts";
import {
  parseRunProperties,
  parseParagraphProperties,
} from "../styles/styleParser.ts";
import type {
  DocxRunFormatting,
  DocxParagraphFormatting,
} from "../types/docxTypes.ts";
import {
  getFirstChildByLocalName,
  getAttrValue,
  getValAttribute,
} from "../utils/xmlUtils.ts";
import { FormattingDiffService } from "../../review/trackChanges/formattingDiffService.ts";
import { STYLE_NORMAL_ID } from "../../styles/services/builtInStyles.ts";

export interface ParsedRunPropertiesChange {
  id: string;
  author: string;
  date: string;
  scope: FormattingRevisionScope;
  diffs: FormattingPropertyDiff[];
  summary: string;
  previousFormatting: DocxRunFormatting;
}

export interface ParsedParagraphPropertiesChange {
  id: string;
  author: string;
  date: string;
  scope: FormattingRevisionScope;
  diffs: FormattingPropertyDiff[];
  summary: string;
  item: TrackChangeItem;
}

/**
 * ============================================================================
 * DOCX FORMATTING REVISIONS IMPORT MAPPER (PHASE 11)
 * ============================================================================
 * Phân tích và chuyển đổi các thẻ revision định dạng chuẩn WordprocessingML:
 * - <w:rPrChange> trên run properties
 * - <w:pPrChange> trên paragraph properties
 */
export class DocxFormattingRevisionMapper {
  /**
   * Phân tích revision định dạng ký tự (<w:rPrChange>) bên trong <w:rPr>
   */
  public static parseRunPropertiesChange(
    rPrEl: Element | null,
    currentFormatting: DocxRunFormatting,
    currentMappedCharStyleId?: string,
    styleIdMap?: Map<string, string>
  ): ParsedRunPropertiesChange | null {
    if (!rPrEl) return null;

    const rPrChangeEl = getFirstChildByLocalName(rPrEl, "rprchange");
    if (!rPrChangeEl) return null;

    const rawId =
      getAttrValue(rPrChangeEl, "id") ||
      getAttrValue(rPrChangeEl, "w:id") ||
      `fmt-r-${Math.random().toString(36).substring(2, 7)}`;
    const id = rawId.startsWith("fmt-") || rawId.startsWith("change-") ? rawId : `fmt-r-${rawId}`;

    const author =
      getAttrValue(rPrChangeEl, "author") ||
      getAttrValue(rPrChangeEl, "w:author") ||
      "Unknown Author";

    const date =
      getAttrValue(rPrChangeEl, "date") ||
      getAttrValue(rPrChangeEl, "w:date") ||
      new Date().toISOString();

    const prevRPrEl = getFirstChildByLocalName(rPrChangeEl, "rpr");
    const prevFormatting = prevRPrEl ? parseRunProperties(prevRPrEl) : {};

    // Tra cứu style trước đó
    const prevStyleEl = prevRPrEl ? getFirstChildByLocalName(prevRPrEl, "rstyle") : null;
    const prevStyleVal = prevStyleEl ? getValAttribute(prevStyleEl) : null;
    const prevMappedCharStyleId = prevStyleVal
      ? styleIdMap?.get(prevStyleVal) ||
        styleIdMap?.get(prevStyleVal.toLowerCase()) ||
        prevStyleVal
      : undefined;

    // So sánh sự thay đổi giữa prevFormatting (BEFORE) và currentFormatting (AFTER)
    const diffs: FormattingPropertyDiff[] = [];

    // Font Family
    if (
      (prevFormatting.fontFamily !== undefined || currentFormatting.fontFamily !== undefined) &&
      prevFormatting.fontFamily !== currentFormatting.fontFamily
    ) {
      diffs.push({
        property: "fontFamily",
        before: prevFormatting.fontFamily ?? null,
        after: currentFormatting.fontFamily ?? null,
      });
    }

    // Font Size
    if (
      (prevFormatting.fontSizePt !== undefined || currentFormatting.fontSizePt !== undefined) &&
      prevFormatting.fontSizePt !== currentFormatting.fontSizePt
    ) {
      diffs.push({
        property: "fontSize",
        before: prevFormatting.fontSizePt ?? null,
        after: currentFormatting.fontSizePt ?? null,
      });
    }

    // Bold
    if (Boolean(prevFormatting.bold) !== Boolean(currentFormatting.bold)) {
      diffs.push({
        property: "bold",
        before: Boolean(prevFormatting.bold),
        after: Boolean(currentFormatting.bold),
      });
    }

    // Italic
    if (Boolean(prevFormatting.italic) !== Boolean(currentFormatting.italic)) {
      diffs.push({
        property: "italic",
        before: Boolean(prevFormatting.italic),
        after: Boolean(currentFormatting.italic),
      });
    }

    // Underline
    if (Boolean(prevFormatting.underline) !== Boolean(currentFormatting.underline)) {
      diffs.push({
        property: "underline",
        before: Boolean(prevFormatting.underline),
        after: Boolean(currentFormatting.underline),
      });
    }

    // Strike
    if (Boolean(prevFormatting.strike) !== Boolean(currentFormatting.strike)) {
      diffs.push({
        property: "strike",
        before: Boolean(prevFormatting.strike),
        after: Boolean(currentFormatting.strike),
      });
    }

    // Color
    if (
      (prevFormatting.color !== undefined || currentFormatting.color !== undefined) &&
      prevFormatting.color !== currentFormatting.color
    ) {
      diffs.push({
        property: "color",
        before: prevFormatting.color ?? null,
        after: currentFormatting.color ?? null,
      });
    }

    // Highlight
    if (
      (prevFormatting.highlight !== undefined || currentFormatting.highlight !== undefined) &&
      prevFormatting.highlight !== currentFormatting.highlight
    ) {
      diffs.push({
        property: "highlight",
        before: prevFormatting.highlight ?? null,
        after: currentFormatting.highlight ?? null,
      });
    }

    // Character Style Assignment
    if (
      (prevMappedCharStyleId !== undefined || currentMappedCharStyleId !== undefined) &&
      prevMappedCharStyleId !== currentMappedCharStyleId
    ) {
      diffs.push({
        property: "characterStyleId",
        before: prevMappedCharStyleId ?? null,
        after: currentMappedCharStyleId ?? null,
      });
    }

    if (diffs.length === 0) {
      // Trường hợp OOXML chứa thẻ rPrChange nhưng không có thuộc tính nào thay đổi rõ rệt
      // hoặc rPr con rỗng -> tạo 1 diff an toàn để bảo toàn revision metadata
      diffs.push({
        property: "fontFamily",
        before: prevFormatting.fontFamily ?? null,
        after: currentFormatting.fontFamily ?? null,
      });
    }

    const scope: FormattingRevisionScope =
      diffs.length === 1 && diffs[0].property === "characterStyleId" ? "style" : "character";

    const summary = FormattingDiffService.formatDiffSummary(diffs, scope);

    return {
      id,
      author,
      date,
      scope,
      diffs,
      summary,
      previousFormatting: prevFormatting,
    };
  }

  /**
   * Phân tích revision định dạng đoạn văn (<w:pPrChange>) bên trong <w:pPr>
   */
  public static parseParagraphPropertiesChange(
    pPrEl: Element | null,
    currentParaProps: DocxParagraphFormatting,
    currentMappedStyleId?: string,
    styleIdMap?: Map<string, string>,
    targetNodeId?: string
  ): ParsedParagraphPropertiesChange | null {
    if (!pPrEl) return null;

    const pPrChangeEl = getFirstChildByLocalName(pPrEl, "pprchange");
    if (!pPrChangeEl) return null;

    const rawId =
      getAttrValue(pPrChangeEl, "id") ||
      getAttrValue(pPrChangeEl, "w:id") ||
      `fmt-p-${Math.random().toString(36).substring(2, 7)}`;
    const id = rawId.startsWith("fmt-") || rawId.startsWith("change-") ? rawId : `fmt-p-${rawId}`;

    const author =
      getAttrValue(pPrChangeEl, "author") ||
      getAttrValue(pPrChangeEl, "w:author") ||
      "Unknown Author";

    const date =
      getAttrValue(pPrChangeEl, "date") ||
      getAttrValue(pPrChangeEl, "w:date") ||
      new Date().toISOString();

    const prevPPrEl = getFirstChildByLocalName(pPrChangeEl, "ppr");
    const prevParaProps = prevPPrEl ? parseParagraphProperties(prevPPrEl) : {};

    // Tra cứu style trước đó
    const prevPStyleEl = prevPPrEl ? getFirstChildByLocalName(prevPPrEl, "pstyle") : null;
    const prevStyleVal = prevPStyleEl ? getValAttribute(prevPStyleEl) : null;
    const prevMappedPStyleId = prevStyleVal
      ? styleIdMap?.get(prevStyleVal) ||
        styleIdMap?.get(prevStyleVal.toLowerCase()) ||
        prevStyleVal
      : undefined;

    const diffs: FormattingPropertyDiff[] = [];

    // Căn lề
    const prevAlign = prevParaProps.alignment || "left";
    const curAlign = currentParaProps.alignment || "left";
    if (prevParaProps.alignment !== undefined && prevAlign !== curAlign) {
      diffs.push({
        property: "textAlign",
        before: prevAlign,
        after: curAlign,
      });
    } else if (
      prevParaProps.alignment === undefined &&
      currentParaProps.alignment !== undefined &&
      curAlign !== "left"
    ) {
      diffs.push({
        property: "textAlign",
        before: "left",
        after: curAlign,
      });
    }

    // Độ giãn dòng
    const prevLine = prevParaProps.lineSpacing ?? 1;
    const curLine = currentParaProps.lineSpacing ?? 1;
    if (prevParaProps.lineSpacing !== undefined && prevLine !== curLine) {
      diffs.push({
        property: "lineSpacing",
        before: String(prevLine),
        after: String(curLine),
      });
    } else if (
      prevParaProps.lineSpacing === undefined &&
      currentParaProps.lineSpacing !== undefined &&
      curLine !== 1
    ) {
      diffs.push({
        property: "lineSpacing",
        before: "1",
        after: String(curLine),
      });
    }

    // Khoảng cách trước đoạn
    if (
      (prevParaProps.spacingBefore !== undefined || currentParaProps.spacingBefore !== undefined) &&
      (prevParaProps.spacingBefore ?? 0) !== (currentParaProps.spacingBefore ?? 0)
    ) {
      diffs.push({
        property: "spacingBefore",
        before: prevParaProps.spacingBefore ?? 0,
        after: currentParaProps.spacingBefore ?? 0,
      });
    }

    // Khoảng cách sau đoạn
    if (
      (prevParaProps.spacingAfter !== undefined || currentParaProps.spacingAfter !== undefined) &&
      (prevParaProps.spacingAfter ?? 0) !== (currentParaProps.spacingAfter ?? 0)
    ) {
      diffs.push({
        property: "spacingAfter",
        before: prevParaProps.spacingAfter ?? 0,
        after: currentParaProps.spacingAfter ?? 0,
      });
    }

    // Thụt lề trái
    if (
      (prevParaProps.leftIndent !== undefined || currentParaProps.leftIndent !== undefined) &&
      (prevParaProps.leftIndent ?? 0) !== (currentParaProps.leftIndent ?? 0)
    ) {
      diffs.push({
        property: "leftIndent",
        before: prevParaProps.leftIndent ?? 0,
        after: currentParaProps.leftIndent ?? 0,
      });
    }

    // Thụt lề phải
    if (
      (prevParaProps.rightIndent !== undefined || currentParaProps.rightIndent !== undefined) &&
      (prevParaProps.rightIndent ?? 0) !== (currentParaProps.rightIndent ?? 0)
    ) {
      diffs.push({
        property: "rightIndent",
        before: prevParaProps.rightIndent ?? 0,
        after: currentParaProps.rightIndent ?? 0,
      });
    }

    // Thụt lề dòng đầu
    if (
      (prevParaProps.firstLineIndent !== undefined || currentParaProps.firstLineIndent !== undefined) &&
      (prevParaProps.firstLineIndent ?? 0) !== (currentParaProps.firstLineIndent ?? 0)
    ) {
      diffs.push({
        property: "firstLineIndent",
        before: prevParaProps.firstLineIndent ?? 0,
        after: currentParaProps.firstLineIndent ?? 0,
      });
    }

    // Nhô lề dòng đầu
    if (
      (prevParaProps.hangingIndent !== undefined || currentParaProps.hangingIndent !== undefined) &&
      (prevParaProps.hangingIndent ?? 0) !== (currentParaProps.hangingIndent ?? 0)
    ) {
      diffs.push({
        property: "hangingIndent",
        before: prevParaProps.hangingIndent ?? 0,
        after: currentParaProps.hangingIndent ?? 0,
      });
    }

    // Cấp độ indent
    if (
      (prevParaProps.indent !== undefined || currentParaProps.indent !== undefined) &&
      (prevParaProps.indent ?? 0) !== (currentParaProps.indent ?? 0)
    ) {
      diffs.push({
        property: "indent",
        before: prevParaProps.indent ?? 0,
        after: currentParaProps.indent ?? 0,
      });
    }

    // Cấp độ tiêu đề (headingLevel)
    if (
      (prevParaProps.headingLevel !== undefined || currentParaProps.headingLevel !== undefined) &&
      prevParaProps.headingLevel !== currentParaProps.headingLevel
    ) {
      diffs.push({
        property: "headingLevel",
        before: prevParaProps.headingLevel ?? null,
        after: currentParaProps.headingLevel ?? null,
      });
    }

    // Paragraph Style Assignment
    const prevStyle = prevMappedPStyleId || STYLE_NORMAL_ID;
    const curStyle = currentMappedStyleId || STYLE_NORMAL_ID;
    if (
      (prevMappedPStyleId !== undefined || currentMappedStyleId !== undefined) &&
      prevStyle !== curStyle
    ) {
      diffs.push({
        property: "paragraphStyleId",
        before: prevStyle,
        after: curStyle,
      });
    }

    if (diffs.length === 0) {
      // Fallback nếu rPr/pPr con rỗng hoặc chứa thuộc tính chưa hỗ trợ
      diffs.push({
        property: "textAlign",
        before: prevParaProps.alignment || "left",
        after: currentParaProps.alignment || "left",
      });
    }

    const scope: FormattingRevisionScope =
      diffs.length === 1 && diffs[0].property === "paragraphStyleId" ? "style" : "paragraph";

    const summary = FormattingDiffService.formatDiffSummary(diffs, scope);
    const resolvedTargetNodeId = targetNodeId || `node-${id}`;

    const item: TrackChangeItem = {
      id,
      type: "format",
      author,
      timestamp: date,
      scope,
      status: "pending",
      targetNodeId: resolvedTargetNodeId,
      formatDetails: summary,
      formatChange: {
        scope,
        changes: diffs,
        summary,
        targetNodeId: resolvedTargetNodeId,
        ...(scope === "style" ? { styleId: curStyle } : {}),
      },
    };

    return {
      id,
      author,
      date,
      scope,
      diffs,
      summary,
      item,
    };
  }
}
