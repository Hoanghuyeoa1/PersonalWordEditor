import type { DocumentStyle, DocumentStylesMetadata } from "../types/styleTypes.ts";

/**
 * Định danh ổn định và bất biến của các Built-in Styles tiêu chuẩn.
 */
export const STYLE_NORMAL_ID = "style_normal" as const;
export const STYLE_HEADING_1_ID = "style_heading_1" as const;
export const STYLE_HEADING_2_ID = "style_heading_2" as const;
export const STYLE_HEADING_3_ID = "style_heading_3" as const;
export const STYLE_EMPHASIS_ID = "style_emphasis" as const;
export const STYLE_STRONG_ID = "style_strong" as const;

/**
 * Tập hợp các ID built-in cố định của hệ thống.
 */
export const BUILT_IN_STYLE_IDS: ReadonlySet<string> = new Set([
  STYLE_NORMAL_ID,
  STYLE_HEADING_1_ID,
  STYLE_HEADING_2_ID,
  STYLE_HEADING_3_ID,
  STYLE_EMPHASIS_ID,
  STYLE_STRONG_ID,
]);

/**
 * Kiểm tra xem một style ID có phải là built-in style hay không.
 */
export function isBuiltInStyleId(id: string): boolean {
  return BUILT_IN_STYLE_IDS.has(id);
}

/**
 * Tạo danh sách các định nghĩa Built-in Styles mặc định ban đầu:
 * 1. Normal (style_normal) - Đoạn văn bản mặc định
 * 2. Heading 1 (style_heading_1) - Tiêu đề cấp 1 (gắn với heading level=1)
 * 3. Heading 2 (style_heading_2) - Tiêu đề cấp 2 (gắn với heading level=2)
 * 4. Heading 3 (style_heading_3) - Tiêu đề cấp 3 (gắn với heading level=3)
 *
 * Các style này:
 * - Có stable ID cố định
 * - Không thể bị xóa khỏi hệ thống
 * - Ý nghĩa ngữ nghĩa cố định (Normal là đoạn, Heading 1/2/3 là node heading)
 * - Có thể tùy chỉnh thuộc tính trình bày (font, size, spacing, color)
 */
export function createDefaultStyleDefinitions(): DocumentStyle[] {
  return [
    {
      id: STYLE_NORMAL_ID,
      name: "Normal",
      type: "paragraph",
      basedOn: null,
      nextStyleId: STYLE_NORMAL_ID,
      isBuiltIn: true,
      paragraph: {
        textAlign: "left",
        lineSpacing: "1.15",
        spacingBefore: 0,
        spacingAfter: 8,
        leftIndent: 0,
        rightIndent: 0,
        firstLineIndent: 0,
        hangingIndent: 0,
        keepWithNext: false,
        keepLinesTogether: false,
        pageBreakBefore: false,
        widowControl: true,
      },
      character: {
        fontFamily: "Calibri",
        fontSize: 11,
        bold: false,
        italic: false,
        underline: false,
        strike: false,
        color: "#0f172a",
      },
    },
    {
      id: STYLE_HEADING_1_ID,
      name: "Heading 1",
      type: "paragraph",
      basedOn: STYLE_NORMAL_ID,
      nextStyleId: STYLE_NORMAL_ID,
      isBuiltIn: true,
      paragraph: {
        textAlign: "left",
        lineSpacing: "1.15",
        spacingBefore: 12,
        spacingAfter: 6,
        leftIndent: 0,
        rightIndent: 0,
        firstLineIndent: 0,
        hangingIndent: 0,
        keepWithNext: true,
        keepLinesTogether: true,
        pageBreakBefore: false,
        widowControl: true,
        headingLevel: 1,
      },
      character: {
        fontFamily: "Calibri",
        fontSize: 16,
        bold: true,
        italic: false,
        underline: false,
        strike: false,
        color: "#1e3a8a",
      },
    },
    {
      id: STYLE_HEADING_2_ID,
      name: "Heading 2",
      type: "paragraph",
      basedOn: STYLE_NORMAL_ID,
      nextStyleId: STYLE_NORMAL_ID,
      isBuiltIn: true,
      paragraph: {
        textAlign: "left",
        lineSpacing: "1.15",
        spacingBefore: 10,
        spacingAfter: 4,
        leftIndent: 0,
        rightIndent: 0,
        firstLineIndent: 0,
        hangingIndent: 0,
        keepWithNext: true,
        keepLinesTogether: true,
        pageBreakBefore: false,
        widowControl: true,
        headingLevel: 2,
      },
      character: {
        fontFamily: "Calibri",
        fontSize: 13,
        bold: true,
        italic: false,
        underline: false,
        strike: false,
        color: "#1d4ed8",
      },
    },
    {
      id: STYLE_HEADING_3_ID,
      name: "Heading 3",
      type: "paragraph",
      basedOn: STYLE_NORMAL_ID,
      nextStyleId: STYLE_NORMAL_ID,
      isBuiltIn: true,
      paragraph: {
        textAlign: "left",
        lineSpacing: "1.15",
        spacingBefore: 8,
        spacingAfter: 2,
        leftIndent: 0,
        rightIndent: 0,
        firstLineIndent: 0,
        hangingIndent: 0,
        keepWithNext: true,
        keepLinesTogether: true,
        pageBreakBefore: false,
        widowControl: true,
        headingLevel: 3,
      },
      character: {
        fontFamily: "Calibri",
        fontSize: 12,
        bold: true,
        italic: false,
        underline: false,
        strike: false,
        color: "#2563eb",
      },
    },
  ];
}

/**
 * Tạo danh sách các định nghĩa Built-in Character Styles chuẩn:
 * 1. Emphasis (style_emphasis) - Chữ in nghiêng ngữ nghĩa
 * 2. Strong (style_strong) - Chữ in đậm ngữ nghĩa
 */
export function createBuiltInCharacterStyles(): DocumentStyle[] {
  return [
    {
      id: STYLE_EMPHASIS_ID,
      name: "Emphasis",
      type: "character",
      basedOn: null,
      isBuiltIn: true,
      character: {
        italic: true,
      },
    },
    {
      id: STYLE_STRONG_ID,
      name: "Strong",
      type: "character",
      basedOn: null,
      isBuiltIn: true,
      character: {
        bold: true,
      },
    },
  ];
}

/**
 * Trả về toàn bộ danh sách Built-in Styles của hệ thống (cả Paragraph và Character).
 */
export function getAllBuiltInStyles(): DocumentStyle[] {
  return [...createDefaultStyleDefinitions(), ...createBuiltInCharacterStyles()];
}

/**
 * Khởi tạo khối metadata styles mặc định cho tài liệu mới hoặc tài liệu cũ chưa có styles.
 */
export function createDefaultStylesMetadata(): DocumentStylesMetadata {
  return {
    definitions: createDefaultStyleDefinitions(),
    defaultParagraphStyleId: STYLE_NORMAL_ID,
  };
}

/**
 * Sinh ID ổn định cho Style người dùng tùy biến (Custom Style).
 */
export function generateCustomStyleId(prefix = "style_custom"): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Math.random().toString(36).substring(2, 10)}_${Date.now().toString(36)}`;
}
