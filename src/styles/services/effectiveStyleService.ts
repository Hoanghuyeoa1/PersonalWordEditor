import type { Editor, JSONContent } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { DocumentStyle } from "../types/styleTypes.ts";
import {
  STYLE_NORMAL_ID,
  STYLE_HEADING_1_ID,
  STYLE_HEADING_2_ID,
  STYLE_HEADING_3_ID,
  createDefaultStyleDefinitions,
} from "./builtInStyles.ts";
import { resolveStyle } from "./styleResolver.ts";
import { PT_PER_INDENT_LEVEL } from "../utils/unitConversion.ts";

/**
 * Định dạng đoạn văn hiệu lực (Effective Paragraph Formatting).
 * Kết quả sau khi hợp nhất:
 *   Built-in / Baseline Default
 *   → Inherited Styles
 *   → Current Paragraph Style
 *   → Direct Formatting (Node Attributes)
 */
export interface EffectiveParagraphFormatting {
  /** ID của style áp dụng cho đoạn văn */
  styleId: string;
  /** Tên của style áp dụng */
  styleName: string;
  /** Căn lề hiệu lực (direct node attr override style) */
  textAlign: "left" | "center" | "right" | "justify";
  /** Độ giãn dòng hiệu lực (direct node attr override style) */
  lineSpacing: string | number;
  /** Khoảng cách trước đoạn hiệu lực (pt) */
  spacingBefore: number;
  /** Khoảng cách sau đoạn hiệu lực (pt) */
  spacingAfter: number;
  /** Thụt lề trái hiệu lực (pt) */
  leftIndent: number;
  /** Thụt lề phải hiệu lực (pt) */
  rightIndent: number;
  /** Thụt lề dòng đầu hiệu lực (pt) */
  firstLineIndent: number;
  /** Nhô lề dòng đầu hiệu lực (pt) */
  hangingIndent: number;
  /** Giữ liền trang với đoạn kế tiếp */
  keepWithNext: boolean;
  /** Giữ các dòng trong đoạn cùng một trang */
  keepLinesTogether: boolean;
  /** Bắt đầu đoạn văn ở đầu trang mới */
  pageBreakBefore: boolean;
  /** Kiểm soát dòng đơn độc (Widow/Orphan control) */
  widowControl: boolean;
  /** Cấp độ đề mục ngữ nghĩa (nếu là heading) */
  headingLevel?: 1 | 2 | 3;
  /** Phông chữ nền tảng của đoạn văn */
  fontFamily: string;
  /** Cỡ chữ nền tảng của đoạn văn (pt) */
  fontSize: number | string;
  /** In đậm nền tảng */
  bold: boolean;
  /** In nghiêng nền tảng */
  italic: boolean;
  /** Màu chữ nền tảng */
  color: string;
  /** Cờ đánh dấu có direct formatting ghi đè lên style hay không */
  hasDirectOverrides: boolean;
  /** Danh sách tên các thuộc tính bị direct override */
  directOverrideFields: string[];
}

/**
 * Lấy kiểu node an toàn từ đối tượng ProseMirror Node hoặc Tiptap JSONContent.
 */
function getNodeTypeName(node: ProseMirrorNode | JSONContent): string {
  if (typeof (node as ProseMirrorNode).type?.name === "string") {
    return (node as ProseMirrorNode).type.name;
  }
  if (typeof (node as JSONContent).type === "string") {
    return (node as JSONContent).type!;
  }
  return "paragraph";
}

/**
 * Lấy thuộc tính attrs an toàn từ Node hoặc JSONContent.
 */
function getNodeAttrs(node: ProseMirrorNode | JSONContent): Record<string, any> {
  if ("attrs" in node && node.attrs && typeof node.attrs === "object") {
    return node.attrs;
  }
  return {};
}

/**
 * Suy luận styleId mặc định phù hợp cho node khi node chưa gắn styleId rõ ràng.
 * - Paragraph → "style_normal"
 * - Heading level 1 → "style_heading_1"
 * - Heading level 2 → "style_heading_2"
 * - Heading level 3 → "style_heading_3"
 */
export function getDefaultStyleIdForNode(nodeType: string, headingLevel?: number): string {
  if (nodeType === "heading") {
    if (headingLevel === 2) return STYLE_HEADING_2_ID;
    if (headingLevel === 3) return STYLE_HEADING_3_ID;
    return STYLE_HEADING_1_ID;
  }
  return STYLE_NORMAL_ID;
}

/**
 * Tính toán định dạng hiệu lực đầy đủ của một đoạn văn hoặc tiêu đề.
 * Tuân thủ nghiêm ngặt Precedence:
 *   Built-in/Default → Inherited Style → Current Style → Direct Node Attributes
 */
export function getEffectiveParagraphFormatting(
  node: ProseMirrorNode | JSONContent,
  definitions?: DocumentStyle[] | Map<string, DocumentStyle>
): EffectiveParagraphFormatting {
  const nodeType = getNodeTypeName(node);
  const attrs = getNodeAttrs(node);

  // 1. Xác định Style ID
  const level = typeof attrs.level === "number" ? attrs.level : undefined;
  const styleId: string =
    typeof attrs.styleId === "string" && attrs.styleId.trim()
      ? attrs.styleId.trim()
      : getDefaultStyleIdForNode(nodeType, level);

  // 2. Resolve Style từ Style Engine
  const effectiveDefs = (definitions && (Array.isArray(definitions) ? definitions.length > 0 : definitions.size > 0))
    ? definitions
    : createDefaultStyleDefinitions();
  const resolved = resolveStyle(styleId, effectiveDefs);
  const basePara = resolved.paragraph;
  const baseChar = resolved.character;

  const directOverrides: string[] = [];

  // 3. Áp dụng Direct Overrides từ Node Attributes (nếu có)
  // 3.1 Căn lề textAlign
  let textAlign = basePara?.textAlign ?? "left";
  if (attrs.textAlign && ["left", "center", "right", "justify"].includes(attrs.textAlign)) {
    if (attrs.textAlign !== textAlign) {
      directOverrides.push("textAlign");
    }
    textAlign = attrs.textAlign;
  }

  // 3.2 Giãn dòng lineSpacing
  let lineSpacing = basePara?.lineSpacing ?? "1.15";
  if (attrs.lineSpacing !== null && attrs.lineSpacing !== undefined) {
    if (attrs.lineSpacing !== lineSpacing) {
      directOverrides.push("lineSpacing");
    }
    lineSpacing = attrs.lineSpacing;
  }

  // 3.3 Khoảng cách trước đoạn spacingBefore (pt)
  let spacingBefore = basePara?.spacingBefore ?? 0;
  if (typeof attrs.spacingBefore === "number" && !isNaN(attrs.spacingBefore)) {
    if (attrs.spacingBefore !== spacingBefore) {
      directOverrides.push("spacingBefore");
    }
    spacingBefore = attrs.spacingBefore;
  }

  // 3.4 Khoảng cách sau đoạn spacingAfter (pt)
  let spacingAfter = basePara?.spacingAfter ?? 0;
  if (typeof attrs.spacingAfter === "number" && !isNaN(attrs.spacingAfter)) {
    if (attrs.spacingAfter !== spacingAfter) {
      directOverrides.push("spacingAfter");
    }
    spacingAfter = attrs.spacingAfter;
  }

  // 3.5 Thụt lề trái leftIndent (pt)
  let leftIndent = basePara?.leftIndent ?? 0;
  if (typeof attrs.leftIndent === "number" && !isNaN(attrs.leftIndent)) {
    if (attrs.leftIndent !== leftIndent) {
      directOverrides.push("leftIndent");
    }
    leftIndent = attrs.leftIndent;
  } else if (typeof attrs.indent === "number" && attrs.indent > 0) {
    // Tương thích ngược với thuộc tính indent nấc (0..8) của Phase 1
    const convertedPt = attrs.indent * PT_PER_INDENT_LEVEL;
    if (convertedPt !== leftIndent) {
      directOverrides.push("leftIndent");
    }
    leftIndent = convertedPt;
  }

  // 3.6 Thụt lề phải rightIndent (pt)
  let rightIndent = basePara?.rightIndent ?? 0;
  if (typeof attrs.rightIndent === "number" && !isNaN(attrs.rightIndent)) {
    if (attrs.rightIndent !== rightIndent) {
      directOverrides.push("rightIndent");
    }
    rightIndent = attrs.rightIndent;
  }

  // 3.7 Thụt lề dòng đầu firstLineIndent (pt)
  let firstLineIndent = basePara?.firstLineIndent ?? 0;
  if (typeof attrs.firstLineIndent === "number" && !isNaN(attrs.firstLineIndent)) {
    if (attrs.firstLineIndent !== firstLineIndent) {
      directOverrides.push("firstLineIndent");
    }
    firstLineIndent = attrs.firstLineIndent;
  }

  // 3.8 Nhô lề dòng đầu hangingIndent (pt)
  let hangingIndent = basePara?.hangingIndent ?? 0;
  if (typeof attrs.hangingIndent === "number" && !isNaN(attrs.hangingIndent)) {
    if (attrs.hangingIndent !== hangingIndent) {
      directOverrides.push("hangingIndent");
    }
    hangingIndent = attrs.hangingIndent;
  }

  // 3.9 Keep with next
  let keepWithNext = basePara?.keepWithNext ?? false;
  if (typeof attrs.keepWithNext === "boolean") {
    if (attrs.keepWithNext !== keepWithNext) {
      directOverrides.push("keepWithNext");
    }
    keepWithNext = attrs.keepWithNext;
  }

  // 3.10 Keep lines together
  let keepLinesTogether = basePara?.keepLinesTogether ?? false;
  if (typeof attrs.keepLinesTogether === "boolean") {
    if (attrs.keepLinesTogether !== keepLinesTogether) {
      directOverrides.push("keepLinesTogether");
    }
    keepLinesTogether = attrs.keepLinesTogether;
  }

  // 3.11 Page break before
  let pageBreakBefore = basePara?.pageBreakBefore ?? false;
  if (typeof attrs.pageBreakBefore === "boolean") {
    if (attrs.pageBreakBefore !== pageBreakBefore) {
      directOverrides.push("pageBreakBefore");
    }
    pageBreakBefore = attrs.pageBreakBefore;
  }

  // 3.12 Widow/Orphan control
  let widowControl = basePara?.widowControl ?? true;
  if (typeof attrs.widowControl === "boolean") {
    if (attrs.widowControl !== widowControl) {
      directOverrides.push("widowControl");
    }
    widowControl = attrs.widowControl;
  }

  return {
    styleId,
    styleName: resolved.name,
    textAlign,
    lineSpacing,
    spacingBefore,
    spacingAfter,
    leftIndent,
    rightIndent,
    firstLineIndent,
    hangingIndent,
    keepWithNext,
    keepLinesTogether,
    pageBreakBefore,
    widowControl,
    headingLevel: level as (1 | 2 | 3 | undefined) ?? basePara?.headingLevel,
    fontFamily: baseChar.fontFamily,
    fontSize: baseChar.fontSize,
    bold: baseChar.bold,
    italic: baseChar.italic,
    color: baseChar.color,
    hasDirectOverrides: directOverrides.length > 0,
    directOverrideFields: directOverrides,
  };
}

/**
 * Thuộc tính phân trang của một block văn bản.
 */
export interface BlockPaginationRules {
  keepWithNext: boolean;
  keepLinesTogether: boolean;
  pageBreakBefore: boolean;
  widowControl: boolean;
}

/**
 * Trích xuất quy tắc phân trang hiệu lực cho một node (kết hợp Style + Direct Overrides).
 */
export function resolveBlockPaginationRules(
  node: ProseMirrorNode | JSONContent,
  stylesMap?: Map<string, DocumentStyle> | DocumentStyle[]
): BlockPaginationRules {
  const eff = getEffectiveParagraphFormatting(node, stylesMap);
  return {
    keepWithNext: eff.keepWithNext,
    keepLinesTogether: eff.keepLinesTogether,
    pageBreakBefore: eff.pageBreakBefore,
    widowControl: eff.widowControl,
  };
}

/**
 * Định dạng ký tự hiệu lực (Effective Character Formatting).
 * Kết quả sau khi hợp nhất theo quy tắc Precedence nghiêm ngặt:
 *   Base / Default (từ Paragraph Style cơ sở hoặc style_normal)
 *   → Inherited Character Style (thông qua basedOn)
 *   → Current Character Style
 *   → Direct Formatting (Marks: bold, italic, underline, strike, textStyle, highlight)
 */
export interface EffectiveCharacterFormatting {
  /** ID của Character Style áp dụng (nếu có) */
  characterStyleId: string | null;
  /** Tên của Character Style áp dụng (nếu có) */
  characterStyleName: string | null;
  /** Phông chữ hiệu lực */
  fontFamily: string;
  /** Cỡ chữ hiệu lực (pt hoặc string) */
  fontSize: number | string;
  /** In đậm hiệu lực */
  bold: boolean;
  /** In nghiêng hiệu lực */
  italic: boolean;
  /** Gạch chân hiệu lực */
  underline: boolean;
  /** Gạch ngang hiệu lực */
  strike: boolean;
  /** Màu chữ hiệu lực */
  color: string;
  /** Màu nền highlight hiệu lực (nếu có) */
  highlight?: string;
  /** Cờ đánh dấu có direct formatting ghi đè lên style hay không */
  hasDirectOverrides: boolean;
  /** Danh sách tên các thuộc tính bị direct override */
  directOverrideFields: string[];
}

/**
 * Trích xuất tên mark an toàn từ ProseMirror Mark hoặc Tiptap JSONContent mark.
 */
function getMarkName(mark: any): string {
  if (typeof mark?.type?.name === "string") return mark.type.name;
  if (typeof mark?.type === "string") return mark.type;
  return "";
}

/**
 * Trích xuất attributes an toàn từ mark.
 */
function getMarkAttrs(mark: any): Record<string, any> {
  return mark?.attrs && typeof mark.attrs === "object" ? mark.attrs : {};
}

/**
 * Tính toán định dạng ký tự hiệu lực (Effective Character Formatting) cho một text node hoặc tập hợp marks.
 * Tuân thủ nghiêm ngặt Precedence:
 *   Base Paragraph Style → Inherited Character Style → Current Character Style → Direct Marks
 */
export function getEffectiveCharacterFormatting(
  nodeOrMarks: ProseMirrorNode | JSONContent | readonly any[],
  definitions?: DocumentStyle[] | Map<string, DocumentStyle>,
  baseParagraphStyleId: string = STYLE_NORMAL_ID
): EffectiveCharacterFormatting {
  let marks: any[] = [];

  if (Array.isArray(nodeOrMarks)) {
    marks = nodeOrMarks;
  } else if (nodeOrMarks && typeof nodeOrMarks === "object") {
    if ("marks" in nodeOrMarks && Array.isArray((nodeOrMarks as any).marks)) {
      marks = (nodeOrMarks as any).marks;
    }
  }

  // 1. Lấy baseline formatting từ Base Paragraph Style (mặc định STYLE_NORMAL_ID)
  const effectiveDefs = (definitions && (Array.isArray(definitions) ? definitions.length > 0 : definitions.size > 0))
    ? definitions
    : createDefaultStyleDefinitions();
  const resolvedBasePara = resolveStyle(baseParagraphStyleId, effectiveDefs);
  const baseChar = resolvedBasePara.character;

  let fontFamily: string = baseChar.fontFamily ?? "Calibri";
  let fontSize: number | string = baseChar.fontSize ?? 11;
  let bold: boolean = baseChar.bold ?? false;
  let italic: boolean = baseChar.italic ?? false;
  let underline: boolean = baseChar.underline ?? false;
  let strike: boolean = baseChar.strike ?? false;
  let color: string = baseChar.color ?? "#0f172a";
  let highlight: string | undefined = baseChar.highlight;

  // 2. Tìm Character Style mark (nếu có)
  let characterStyleId: string | null = null;
  let characterStyleName: string | null = null;

  const charStyleMark = marks.find((m) => getMarkName(m) === "characterStyle");
  if (charStyleMark) {
    const attrs = getMarkAttrs(charStyleMark);
    if (typeof attrs.styleId === "string" && attrs.styleId.trim()) {
      characterStyleId = attrs.styleId.trim();
      const resolvedCharStyle = resolveStyle(characterStyleId, effectiveDefs);
      characterStyleName = resolvedCharStyle.name;

      if (resolvedCharStyle.character) {
        const cs = resolvedCharStyle.character;
        if (cs.fontFamily !== undefined) fontFamily = cs.fontFamily;
        if (cs.fontSize !== undefined) fontSize = cs.fontSize;
        if (cs.bold !== undefined) bold = cs.bold;
        if (cs.italic !== undefined) italic = cs.italic;
        if (cs.underline !== undefined) underline = cs.underline;
        if (cs.strike !== undefined) strike = cs.strike;
        if (cs.color !== undefined) color = cs.color;
        if (cs.highlight !== undefined) highlight = cs.highlight;
      }
    }
  }

  const styleFont = fontFamily;
  const styleSize = fontSize;
  const styleBold = bold;
  const styleItalic = italic;
  const styleUnderline = underline;
  const styleStrike = strike;
  const styleColor = color;
  const styleHighlight = highlight;

  const directOverrides: string[] = [];

  // 3. Quét các direct marks và ghi đè (Direct formatting precedence)
  for (const mark of marks) {
    const name = getMarkName(mark);
    const attrs = getMarkAttrs(mark);

    if (name === "bold") {
      if (!styleBold) {
        directOverrides.push("bold");
      }
      bold = true;
    } else if (name === "italic") {
      if (!styleItalic) {
        directOverrides.push("italic");
      }
      italic = true;
    } else if (name === "underline") {
      if (!styleUnderline) {
        directOverrides.push("underline");
      }
      underline = true;
    } else if (name === "strike") {
      if (!styleStrike) {
        directOverrides.push("strike");
      }
      strike = true;
    } else if (name === "textStyle") {
      if (attrs.fontFamily && attrs.fontFamily !== styleFont) {
        directOverrides.push("fontFamily");
        fontFamily = attrs.fontFamily;
      }
      if (attrs.fontSize !== undefined && attrs.fontSize !== null) {
        const sz =
          typeof attrs.fontSize === "string"
            ? attrs.fontSize.replace(/pt$/i, "")
            : attrs.fontSize;
        const parsed = typeof sz === "string" ? parseFloat(sz) : sz;
        if (!isNaN(parsed) && parsed !== styleSize) {
          directOverrides.push("fontSize");
          fontSize = parsed;
        }
      }
      if (attrs.color && attrs.color !== styleColor) {
        directOverrides.push("color");
        color = attrs.color;
      }
    } else if (name === "highlight") {
      if (attrs.color && attrs.color !== styleHighlight) {
        directOverrides.push("highlight");
        highlight = attrs.color;
      }
    }
  }

  return {
    characterStyleId,
    characterStyleName,
    fontFamily,
    fontSize,
    bold,
    italic,
    underline,
    strike,
    color,
    highlight,
    hasDirectOverrides: directOverrides.length > 0,
    directOverrideFields: directOverrides,
  };
}

/**
 * Trạng thái Style đang hoạt động tại vị trí con trỏ hoặc vùng chọn hiện tại.
 */
export interface ActiveStyleState {
  /** ID của Paragraph Style đang chọn (null nếu selection chứa mixed styles) */
  paragraphStyleId: string | null;
  /** Cờ đánh dấu selection trải dài qua nhiều block mang các Paragraph Style khác nhau */
  isParagraphMixed: boolean;
  /** ID của Character Style đang chọn (null nếu không có hoặc mixed) */
  characterStyleId: string | null;
  /** Cờ đánh dấu selection chứa các ký tự có Character Style khác nhau hoặc một phần unstyled */
  isCharacterMixed: boolean;
}

/**
 * Xác định chính xác trạng thái Active Style và Mixed Style của con trỏ / vùng chọn trong Editor.
 */
export function getActiveStyleState(editor: Editor | null): ActiveStyleState {
  if (!editor || !editor.state) {
    return {
      paragraphStyleId: STYLE_NORMAL_ID,
      isParagraphMixed: false,
      characterStyleId: null,
      isCharacterMixed: false,
    };
  }

  const { state } = editor;
  const { selection } = state;
  const { from, to, empty } = selection;

  // 1. Quét Paragraph Styles trên các textblock thuộc vùng chọn
  const foundParaStyleIds = new Set<string>();

  state.doc.nodesBetween(from, to, (node) => {
    if (node.isTextblock && (node.type.name === "paragraph" || node.type.name === "heading")) {
      const styleId =
        node.attrs?.styleId ||
        getDefaultStyleIdForNode(node.type.name, node.attrs?.level);
      foundParaStyleIds.add(styleId);
    }
  });

  let paragraphStyleId: string | null = null;
  let isParagraphMixed = false;

  if (foundParaStyleIds.size === 1) {
    paragraphStyleId = foundParaStyleIds.values().next().value ?? STYLE_NORMAL_ID;
  } else if (foundParaStyleIds.size > 1) {
    paragraphStyleId = null;
    isParagraphMixed = true;
  } else {
    paragraphStyleId = STYLE_NORMAL_ID;
  }

  // 2. Quét Character Styles
  let characterStyleId: string | null = null;
  let isCharacterMixed = false;

  const charMarkType = state.schema.marks.characterStyle;
  if (!charMarkType) {
    return { paragraphStyleId, isParagraphMixed, characterStyleId: null, isCharacterMixed: false };
  }

  if (empty) {
    const stored = state.storedMarks || selection.$from.marks();
    const found = stored.find((m) => m.type === charMarkType);
    characterStyleId = found?.attrs?.styleId ?? null;
  } else {
    const charStyleIds = new Set<string>();
    let totalTextNodes = 0;
    let styledTextNodes = 0;

    state.doc.nodesBetween(from, to, (node) => {
      if (node.isText) {
        totalTextNodes++;
        const found = node.marks.find((m) => m.type === charMarkType);
        if (found?.attrs?.styleId) {
          styledTextNodes++;
          charStyleIds.add(found.attrs.styleId);
        }
      }
    });

    if (totalTextNodes > 0) {
      if (charStyleIds.size === 1 && styledTextNodes === totalTextNodes) {
        characterStyleId = charStyleIds.values().next().value ?? null;
      } else if (charStyleIds.size > 0 && styledTextNodes < totalTextNodes) {
        isCharacterMixed = true;
        characterStyleId = null;
      } else if (charStyleIds.size > 1) {
        isCharacterMixed = true;
        characterStyleId = null;
      }
    }
  }

  return {
    paragraphStyleId,
    isParagraphMixed,
    characterStyleId,
    isCharacterMixed,
  };
}


