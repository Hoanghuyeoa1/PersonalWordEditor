import type { Node as PMNode } from "@tiptap/pm/model";
import type { JSONContent } from "@tiptap/core";
import type {
  FormattingRevisionScope,
  FormattingPropertyDiff,
  FormattingRevisionDetails,
  TrackChangeItem,
  RevisionStatus,
} from "../../document/documentTypes.ts";
import type { DocumentStyle } from "../../styles/types/styleTypes.ts";
import {
  getEffectiveCharacterFormatting,
  getEffectiveParagraphFormatting,
} from "../../styles/services/effectiveStyleService.ts";

export const SUPPORTED_CHARACTER_PROPERTIES = [
  "bold",
  "italic",
  "underline",
  "strike",
  "fontFamily",
  "fontSize",
  "color",
  "highlight",
  "characterStyleId",
] as const;

export const SUPPORTED_PARAGRAPH_PROPERTIES = [
  "textAlign",
  "lineSpacing",
  "spacingBefore",
  "spacingAfter",
  "indent",
  "leftIndent",
  "rightIndent",
  "firstLineIndent",
  "hangingIndent",
  "paragraphStyleId",
  "headingLevel",
  "keepWithNext",
  "keepLinesTogether",
  "pageBreakBefore",
  "widowControl",
] as const;

export interface CharacterFormattingSegment {
  from: number;
  to: number;
  text: string;
  directFormatting: Record<string, unknown>;
  effectiveFormatting: Record<string, unknown>;
}

export interface PropertyInspection {
  property: string;
  isMixed: boolean;
  values: unknown[];
  uniformValue: unknown;
}

export interface SelectionFormattingInspection {
  from: number;
  to: number;
  text: string;
  segments: CharacterFormattingSegment[];
  properties: Record<string, PropertyInspection>;
}

export interface RangeFormattingDiffResult {
  from: number;
  to: number;
  hasChanges: boolean;
  changes: FormattingPropertyDiff[];
  summary: string;
  affectedSegments: Array<{
    from: number;
    to: number;
    changes: FormattingPropertyDiff[];
  }>;
}

export interface ParagraphFormattingDiffResult {
  hasChanges: boolean;
  changes: FormattingPropertyDiff[];
  summary: string;
  targetNodeId?: string;
}

export interface CreateFormattingRevisionOptions {
  id?: string;
  author?: string;
  timestamp?: string;
  scope: FormattingRevisionScope;
  changes: FormattingPropertyDiff[];
  summary?: string;
  targetNodeId?: string;
  styleId?: string;
  status?: RevisionStatus;
  text?: string;
  from?: number;
  to?: number;
}

/**
 * Helper sinh ID ổn định cho revision
 */
export function generateFormattingRevisionId(scope: FormattingRevisionScope = "character"): string {
  const prefix = scope === "paragraph" ? "fmt-para" : scope === "style" ? "fmt-style" : "fmt-char";
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
}

/**
 * FormattingDiffService - Personal Word Editor (Track Changes 2.0 - Phase 2)
 *
 * Dịch vụ lõi so sánh định dạng thô trước / sau:
 * - Chuẩn hóa màu sắc, đơn vị kích thước, logic boolean
 * - Phân biệt missing property vs explicit value
 * - Phân biệt direct formatting vs inherited style formatting
 * - Hỗ trợ vùng chọn hỗn hợp (mixed selection) mà KHÔNG lấy ký tự đầu làm đại diện
 * - Phát hiện và loại bỏ triệt để no-op / empty diff
 * - Tạo revision object bất biến (immutable) với ID ổn định
 */
export class FormattingDiffService {
  /**
   * Chuẩn hóa mã màu về dạng hex chữ thường 6 ký tự chuẩn (#rrggbb).
   */
  public static normalizeColor(color: unknown): string | null {
    if (color === null || color === undefined) return null;
    if (typeof color !== "string") return null;
    const trimmed = color.trim().toLowerCase();
    if (!trimmed || trimmed === "none" || trimmed === "transparent" || trimmed === "auto") {
      return null;
    }

    // Hex 3 ký tự: #rgb -> #rrggbb
    const hex3Match = trimmed.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/);
    if (hex3Match) {
      return `#${hex3Match[1]}${hex3Match[1]}${hex3Match[2]}${hex3Match[2]}${hex3Match[3]}${hex3Match[3]}`;
    }

    // Hex 6 ký tự: #rrggbb
    if (/^#[0-9a-f]{6}$/.test(trimmed)) {
      return trimmed;
    }

    // rgb(r, g, b)
    const rgbMatch = trimmed.match(/^rgb\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/);
    if (rgbMatch) {
      const r = Math.max(0, Math.min(255, parseInt(rgbMatch[1], 10))).toString(16).padStart(2, "0");
      const g = Math.max(0, Math.min(255, parseInt(rgbMatch[2], 10))).toString(16).padStart(2, "0");
      const b = Math.max(0, Math.min(255, parseInt(rgbMatch[3], 10))).toString(16).padStart(2, "0");
      return `#${r}${g}${b}`;
    }

    return trimmed;
  }

  /**
   * Chuẩn hóa cỡ chữ về số nguyên dương theo đơn vị điểm (pt).
   */
  public static normalizeFontSize(size: unknown): number | null {
    if (size === null || size === undefined) return null;
    if (typeof size === "number") {
      if (isNaN(size) || !isFinite(size) || size <= 0) return null;
      return Math.round(size);
    }
    if (typeof size === "string") {
      const trimmed = size.trim().toLowerCase();
      if (!trimmed) return null;
      const num = parseFloat(trimmed.replace(/pt|px$/i, ""));
      if (isNaN(num) || !isFinite(num) || num <= 0) return null;
      return Math.round(num);
    }
    return null;
  }

  /**
   * Chuẩn hóa độ giãn dòng (Line Spacing) về chuỗi số thực hoặc preset chuẩn.
   */
  public static normalizeLineSpacing(spacing: unknown): string | null {
    if (spacing === null || spacing === undefined) return null;
    if (typeof spacing === "number") {
      if (isNaN(spacing) || !isFinite(spacing)) return null;
      return String(spacing);
    }
    if (typeof spacing === "string") {
      const trimmed = spacing.trim();
      if (!trimmed) return null;
      const parsed = parseFloat(trimmed);
      if (!isNaN(parsed) && isFinite(parsed)) {
        return String(parsed);
      }
      return trimmed;
    }
    return null;
  }

  /**
   * Chuẩn hóa độ thụt lề hoặc khoảng cách (pt).
   */
  public static normalizeSpacingOrIndent(val: unknown): number | null {
    if (val === null || val === undefined) return null;
    if (typeof val === "number") {
      if (isNaN(val) || !isFinite(val)) return null;
      return Math.round(val * 10) / 10;
    }
    if (typeof val === "string") {
      const trimmed = val.trim().toLowerCase().replace(/pt|px$/i, "");
      const num = parseFloat(trimmed);
      if (isNaN(num) || !isFinite(num)) return null;
      return Math.round(num * 10) / 10;
    }
    return null;
  }

  /**
   * So sánh hai giá trị định dạng có bằng nhau về mặt ngữ nghĩa hay không.
   */
  public static areValuesEqual(property: string, a: unknown, b: unknown): boolean {
    // Cả hai cùng là missing / rỗng
    const isANullish = a === null || a === undefined || a === "";
    const isBNullish = b === null || b === undefined || b === "";
    if (isANullish && isBNullish) return true;
    if (isANullish !== isBNullish) return false;

    // Màu sắc
    if (property === "color" || property === "highlight") {
      const normA = this.normalizeColor(a);
      const normB = this.normalizeColor(b);
      return normA === normB;
    }

    // Cỡ chữ
    if (property === "fontSize") {
      const normA = this.normalizeFontSize(a);
      const normB = this.normalizeFontSize(b);
      return normA === normB;
    }

    // Độ giãn dòng
    if (property === "lineSpacing") {
      const normA = this.normalizeLineSpacing(a);
      const normB = this.normalizeLineSpacing(b);
      return normA === normB;
    }

    // Khoảng cách & Thụt lề
    if (
      property === "spacingBefore" ||
      property === "spacingAfter" ||
      property === "leftIndent" ||
      property === "rightIndent" ||
      property === "firstLineIndent" ||
      property === "hangingIndent" ||
      property === "indent"
    ) {
      const normA = this.normalizeSpacingOrIndent(a);
      const normB = this.normalizeSpacingOrIndent(b);
      return normA === normB;
    }

    // Booleans (in đậm, in nghiêng, gạch chân, gạch ngang, phân trang)
    if (
      property === "bold" ||
      property === "italic" ||
      property === "underline" ||
      property === "strike" ||
      property === "keepWithNext" ||
      property === "keepLinesTogether" ||
      property === "pageBreakBefore" ||
      property === "widowControl"
    ) {
      return Boolean(a) === Boolean(b);
    }

    // Cấp tiêu đề (HeadingLevel)
    if (property === "headingLevel") {
      const numA = typeof a === "number" ? a : null;
      const numB = typeof b === "number" ? b : null;
      return numA === numB;
    }

    // Căn lề hoặc StyleId hoặc FontFamily
    if (
      property === "fontFamily" ||
      property === "characterStyleId" ||
      property === "paragraphStyleId"
    ) {
      const strA = typeof a === "string" ? a.trim().toLowerCase() : "";
      const strB = typeof b === "string" ? b.trim().toLowerCase() : "";
      return strA === strB;
    }

    return a === b;
  }

  /**
   * So sánh thuộc tính đơn lẻ và trả về diff nếu có thay đổi.
   */
  public static computePropertyDiff<T = any>(
    property: string,
    before: T,
    after: T,
    isInheritedBefore = false
  ): FormattingPropertyDiff<T> | null {
    if (this.areValuesEqual(property, before, after)) {
      return null;
    }
    return {
      property,
      before,
      after,
      isInheritedBefore,
    };
  }

  /**
   * So sánh hai bản ghi định dạng (Before và After) và chỉ trả về các thuộc tính thực sự thay đổi.
   * - Phân biệt rõ missing property vs explicit value
   * - Trả về mảng rỗng nếu toàn bộ không có gì đổi (No-op)
   */
  public static computeFormattingDiff(
    before: Record<string, unknown>,
    after: Record<string, unknown>,
    options?: {
      scope?: FormattingRevisionScope;
      inheritedBefore?: Record<string, unknown>;
    }
  ): FormattingPropertyDiff[] {
    const diffs: FormattingPropertyDiff[] = [];
    const keysToCheck = new Set<string>([...Object.keys(before), ...Object.keys(after)]);

    for (const key of keysToCheck) {
      const beforeVal = before[key];
      const afterVal = after[key];

      // Nếu afterVal không được chỉ định trong target, bỏ qua không so sánh
      if (afterVal === undefined) {
        continue;
      }

      const isInherited =
        (beforeVal === null || beforeVal === undefined) &&
        options?.inheritedBefore &&
        options.inheritedBefore[key] !== undefined;

      const diff = this.computePropertyDiff(key, beforeVal, afterVal, Boolean(isInherited));
      if (diff) {
        diffs.push(diff);
      }
    }

    return diffs;
  }

  /**
   * Trích xuất chi tiết định dạng trực tiếp (direct marks) từ danh sách marks của text node.
   */
  public static extractDirectCharacterFormatting(marks: readonly any[]): Record<string, unknown> {
    const formatting: Record<string, unknown> = {
      bold: false,
      italic: false,
      underline: false,
      strike: false,
      fontFamily: null,
      fontSize: null,
      color: null,
      highlight: null,
      characterStyleId: null,
    };

    if (!Array.isArray(marks)) return formatting;

    for (const mark of marks) {
      const name = typeof mark?.type?.name === "string" ? mark.type.name : mark?.type;
      const attrs = mark?.attrs && typeof mark.attrs === "object" ? mark.attrs : {};

      if (name === "bold") formatting.bold = true;
      if (name === "italic") formatting.italic = true;
      if (name === "underline") formatting.underline = true;
      if (name === "strike") formatting.strike = true;

      if (name === "textStyle") {
        if (attrs.fontFamily) formatting.fontFamily = attrs.fontFamily;
        if (attrs.fontSize) formatting.fontSize = attrs.fontSize;
        if (attrs.color) formatting.color = attrs.color;
      }

      if (name === "highlight") {
        formatting.highlight = attrs.color || "#fef08a";
      }

      if (name === "characterStyle") {
        formatting.characterStyleId = attrs.styleId || null;
      }
    }

    return formatting;
  }

  /**
   * Khảo sát toàn diện định dạng ký tự trong phạm vi [from, to] của tài liệu ProseMirror.
   * Tuyệt đối không lấy ký tự đầu làm đại diện (tránh lỗi ngộ nhận khi vùng chọn bị mixed).
   */
  public static inspectSelectionCharacterFormatting(
    doc: PMNode,
    from: number,
    to: number,
    stylesMap?: Map<string, DocumentStyle> | DocumentStyle[]
  ): SelectionFormattingInspection {
    const segments: CharacterFormattingSegment[] = [];
    const propertyValueMap: Record<string, Set<any>> = {};

    for (const prop of SUPPORTED_CHARACTER_PROPERTIES) {
      propertyValueMap[prop] = new Set();
    }

    let fullText = "";

    doc.nodesBetween(from, to, (node, pos) => {
      if (!node.isText || !node.text) return;

      const nodeFrom = Math.max(from, pos);
      const nodeTo = Math.min(to, pos + node.nodeSize);
      if (nodeFrom >= nodeTo) return;

      const subLength = nodeTo - nodeFrom;
      const subText = node.text.substring(nodeFrom - pos, nodeFrom - pos + subLength);
      fullText += subText;

      const direct = this.extractDirectCharacterFormatting(node.marks);
      const hasValidStyles = stylesMap && (Array.isArray(stylesMap) ? stylesMap.length > 0 : stylesMap.size > 0);
      const effective = getEffectiveCharacterFormatting(node, hasValidStyles ? stylesMap : undefined);

      segments.push({
        from: nodeFrom,
        to: nodeTo,
        text: subText,
        directFormatting: direct,
        effectiveFormatting: effective as unknown as Record<string, unknown>,
      });

      for (const prop of SUPPORTED_CHARACTER_PROPERTIES) {
        const val = direct[prop];
        propertyValueMap[prop].add(val);
      }
    });

    const properties: Record<string, PropertyInspection> = {};

    for (const prop of SUPPORTED_CHARACTER_PROPERTIES) {
      const set = propertyValueMap[prop];
      const values = Array.from(set);
      const isMixed = values.length > 1;
      const uniformValue = values.length === 1 ? values[0] : null;

      properties[prop] = {
        property: prop,
        isMixed,
        values,
        uniformValue,
      };
    }

    return {
      from,
      to,
      text: fullText,
      segments,
      properties,
    };
  }

  /**
   * Tính toán diff định dạng trên toàn dải [from, to] đối chiếu với định dạng đích.
   * - Nếu toàn bộ các node đã khớp với định dạng đích -> hasChanges = false (No-op).
   * - Xác định chính xác các phân đoạn thực sự thay đổi (segments to change).
   */
  public static computeRangeFormattingDiff(
    doc: PMNode,
    from: number,
    to: number,
    targetProperties: Record<string, unknown>,
    stylesMap?: Map<string, DocumentStyle> | DocumentStyle[]
  ): RangeFormattingDiffResult {
    const inspection = this.inspectSelectionCharacterFormatting(doc, from, to, stylesMap);
    const affectedSegments: Array<{ from: number; to: number; changes: FormattingPropertyDiff[] }> = [];
    const aggregatedDiffMap = new Map<string, FormattingPropertyDiff>();

    for (const segment of inspection.segments) {
      const segDiffs = this.computeFormattingDiff(segment.directFormatting, targetProperties);
      if (segDiffs.length > 0) {
        affectedSegments.push({
          from: segment.from,
          to: segment.to,
          changes: segDiffs,
        });

        for (const d of segDiffs) {
          if (!aggregatedDiffMap.has(d.property)) {
            aggregatedDiffMap.set(d.property, { ...d });
          } else {
            // Nếu vùng chọn có nhiều giá trị trước đó khác nhau, ghi nhận before = "mixed" trong aggregated overview
            const existing = aggregatedDiffMap.get(d.property)!;
            if (!this.areValuesEqual(d.property, existing.before, d.before)) {
              existing.before = "mixed";
            }
          }
        }
      }
    }

    const changes = Array.from(aggregatedDiffMap.values());
    const hasChanges = changes.length > 0 && affectedSegments.length > 0;
    const summary = hasChanges ? this.formatDiffSummary(changes, "character") : "Không có thay đổi";

    return {
      from,
      to,
      hasChanges,
      changes,
      summary,
      affectedSegments,
    };
  }

  /**
   * So sánh định dạng đoạn văn (Paragraph / Heading) trước và sau.
   */
  public static computeParagraphDiff(
    node: PMNode | JSONContent,
    targetAttrs: Record<string, unknown>,
    stylesMap?: Map<string, DocumentStyle> | DocumentStyle[]
  ): ParagraphFormattingDiffResult {
    const currentAttrs = (node.attrs && typeof node.attrs === "object" ? node.attrs : {}) as Record<string, unknown>;
    const hasValidStyles = stylesMap && (Array.isArray(stylesMap) ? stylesMap.length > 0 : stylesMap.size > 0);
    const effective = getEffectiveParagraphFormatting(node, hasValidStyles ? stylesMap : undefined);

    const targetNodeId = (currentAttrs.nodeId as string) || (currentAttrs.id as string) || undefined;
    const changes: FormattingPropertyDiff[] = [];

    for (const prop of SUPPORTED_PARAGRAPH_PROPERTIES) {
      if (targetAttrs[prop] === undefined) continue;

      const beforeVal = currentAttrs[prop] !== undefined ? currentAttrs[prop] : null;
      const targetVal = targetAttrs[prop];
      const effectiveVal = (effective as any)[prop];

      // Nếu thuộc tính chưa có giá trị direct (beforeVal == null)
      // nhưng targetVal trùng với giá trị hiệu lực (effectiveVal), thì đây là No-Op!
      if (beforeVal === null && this.areValuesEqual(prop, effectiveVal, targetVal)) {
        continue;
      }

      const isInherited = beforeVal === null && effectiveVal !== undefined;

      const diff = this.computePropertyDiff(prop, beforeVal, targetVal, isInherited);
      if (diff) {
        changes.push(diff);
      }
    }

    const hasChanges = changes.length > 0;
    const summary = hasChanges ? this.formatDiffSummary(changes, "paragraph") : "Không có thay đổi";

    return {
      hasChanges,
      changes,
      summary,
      targetNodeId,
    };
  }

  /**
   * Tạo chuỗi tóm tắt người dùng dễ hiểu cho danh sách thuộc tính thay đổi.
   */
  public static formatDiffSummary(
    changes: FormattingPropertyDiff[],
    _scope: FormattingRevisionScope = "character"
  ): string {
    if (changes.length === 0) return "Không có thay đổi";

    const parts: string[] = [];

    for (const ch of changes) {
      switch (ch.property) {
        case "bold":
          parts.push(ch.after ? "In đậm" : "Bỏ in đậm");
          break;
        case "italic":
          parts.push(ch.after ? "In nghiêng" : "Bỏ in nghiêng");
          break;
        case "underline":
          parts.push(ch.after ? "Gạch chân" : "Bỏ gạch chân");
          break;
        case "strike":
          parts.push(ch.after ? "Gạch ngang" : "Bỏ gạch ngang");
          break;
        case "fontFamily":
          parts.push(`Phông chữ: ${ch.after}`);
          break;
        case "fontSize":
          parts.push(`Cỡ chữ: ${ch.before ?? "mặc định"} → ${ch.after}`);
          break;
        case "color":
          parts.push(`Màu chữ: ${ch.after}`);
          break;
        case "highlight":
          parts.push(ch.after ? `Màu nền: ${ch.after}` : "Bỏ màu nền");
          break;
        case "textAlign":
          parts.push(`Căn lề: ${ch.after}`);
          break;
        case "lineSpacing":
          parts.push(`Giãn dòng: ${ch.after}`);
          break;
        case "spacingBefore":
          parts.push(`Cách trên: ${ch.after}pt`);
          break;
        case "spacingAfter":
          parts.push(`Cách dưới: ${ch.after}pt`);
          break;
        case "indent":
          parts.push(`Cấp thụt lề: ${ch.after}`);
          break;
        case "leftIndent":
          parts.push(`Thụt lề trái: ${ch.after}pt`);
          break;
        case "rightIndent":
          parts.push(`Thụt lề phải: ${ch.after}pt`);
          break;
        case "firstLineIndent":
          parts.push(`Thụt đầu dòng: ${ch.after}pt`);
          break;
        case "hangingIndent":
          parts.push(`Thụt lề treo: ${ch.after}pt`);
          break;
        case "paragraphStyleId":
          parts.push(ch.after ? `Kiểu đoạn văn: ${ch.after}` : "Kiểu đoạn văn: Normal");
          break;
        case "characterStyleId":
          parts.push(ch.after ? `Kiểu ký tự: ${ch.after}` : "Bỏ kiểu ký tự");
          break;
        case "headingLevel":
          parts.push(ch.after ? `Cấp tiêu đề: ${ch.after}` : "Chuyển thành đoạn văn thường");
          break;
        default:
          parts.push(`${ch.property}: ${ch.after}`);
          break;
      }
    }

    return parts.join("; ");
  }

  /**
   * Tạo bản ghi TrackChangeItem chuẩn hóa cho Formatting Revision.
   * Đảm bảo tính bất biến (deep clone) và ID ổn định.
   */
  public static createFormattingRevisionItem(options: CreateFormattingRevisionOptions): TrackChangeItem {
    const id = options.id || generateFormattingRevisionId(options.scope);
    const author = options.author || "Author";
    const timestamp = options.timestamp || new Date().toISOString();
    const status = options.status || "pending";
    const summary = options.summary || this.formatDiffSummary(options.changes, options.scope);

    const clonedChanges: FormattingPropertyDiff[] = JSON.parse(JSON.stringify(options.changes));

    const formatChange: FormattingRevisionDetails = {
      scope: options.scope,
      changes: clonedChanges,
      summary,
      targetNodeId: options.targetNodeId,
      styleId: options.styleId,
    };

    return {
      id,
      type: "format",
      author,
      timestamp,
      status,
      scope: options.scope,
      formatChange,
      formatDetails: summary,
      targetNodeId: options.targetNodeId,
      text: options.text,
      from: options.from,
      to: options.to,
    };
  }
}
