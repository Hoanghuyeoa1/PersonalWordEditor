/**
 * Chuyển đổi và ánh xạ các kiểu dáng từ Word (word/styles.xml)
 * sang mô hình Semantic Styles Engine 2.0 (DocumentStylesMetadata & DocumentStyle[]).
 *
 * Đảm bảo:
 * - Map deterministic giữa Word styleId và internal styleId.
 * - Giữ vững cấp độ heading ngữ nghĩa (Heading 1/2/3).
 * - Kế thừa basedOn ngữ nghĩa nhiều cấp, fail-safe khi missing parent hoặc chu trình vòng.
 * - Chỉ ánh xạ các thuộc tính editor hỗ trợ (alignment, spacing, indents, font, size, bold, italic, underline, strike, color, highlight).
 * - Bỏ qua an toàn các loại style không hỗ trợ (table, numbering) và OOXML attributes không rõ.
 */

import type {
  DocxStyle,
  DocxStyleMap,
  DocxParagraphFormatting,
  DocxRunFormatting,
} from "../types/docxTypes.ts";
import type {
  DocumentStyle,
  DocumentStylesMetadata,
  ParagraphStyleProperties,
  CharacterStyleProperties,
} from "../../styles/types/styleTypes.ts";
import {
  STYLE_NORMAL_ID,
  STYLE_HEADING_1_ID,
  STYLE_HEADING_2_ID,
  STYLE_HEADING_3_ID,
  STYLE_EMPHASIS_ID,
  STYLE_STRONG_ID,
  BUILT_IN_STYLE_IDS,
  createDefaultStyleDefinitions,
  createDefaultStylesMetadata,
} from "../../styles/services/builtInStyles.ts";
import { normalizeStyleCollection } from "../../styles/validation/styleValidator.ts";

export interface DocxStyleMappingResult {
  stylesMetadata: DocumentStylesMetadata;
  wordStyleIdToInternalId: Map<string, string>;
  internalIdToWordStyleId: Map<string, string>;
}

/**
 * Kiểm tra xem một Word style có phải là Normal style hay không
 */
function isWordNormalStyle(style: DocxStyle): boolean {
  if (style.type !== "paragraph") return false;
  const idLower = style.id.toLowerCase().trim();
  const nameLower = style.name.toLowerCase().trim();
  return (
    idLower === "normal" ||
    nameLower === "normal" ||
    (Boolean(style.isDefault) && style.headingLevel === undefined)
  );
}

/**
 * Kiểm tra và xác định cấp độ heading (1 | 2 | 3) từ Word style
 */
function getWordHeadingLevel(style: DocxStyle): 1 | 2 | 3 | undefined {
  if (style.type !== "paragraph") return undefined;
  if (style.headingLevel && [1, 2, 3].includes(style.headingLevel)) {
    return style.headingLevel;
  }
  const combined = `${style.id} ${style.name}`.toLowerCase();
  if (combined.includes("heading 1") || combined.includes("heading1") || combined.includes("tiêu đề 1")) {
    return 1;
  }
  if (combined.includes("heading 2") || combined.includes("heading2") || combined.includes("tiêu đề 2")) {
    return 2;
  }
  if (combined.includes("heading 3") || combined.includes("heading3") || combined.includes("tiêu đề 3")) {
    return 3;
  }
  return undefined;
}

/**
 * Kiểm tra xem style có phải là character style built-in (Emphasis / Strong)
 */
function getWordBuiltInCharacterType(style: DocxStyle): "emphasis" | "strong" | undefined {
  if (style.type !== "character") return undefined;
  const combined = `${style.id} ${style.name}`.toLowerCase();
  if (combined.includes("emphasis") || combined.includes("italic") || combined.includes("nghiêng")) {
    return "emphasis";
  }
  if (combined.includes("strong") || combined.includes("bold") || combined.includes("đậm")) {
    return "strong";
  }
  return undefined;
}

/**
 * Sinh ID ổn định cho Style tùy biến của Word
 */
function sanitizeWordStyleId(wordStyleId: string): string {
  const clean = wordStyleId
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "_")
    .replace(/^_+|_+$/g, "");
  if (!clean) return "style_docx_custom";
  if (BUILT_IN_STYLE_IDS.has(clean)) {
    return `style_docx_${clean}`;
  }
  if (clean.startsWith("style_docx_")) {
    return clean;
  }
  if (clean.startsWith("style_")) {
    return `style_docx_${clean.replace(/^style_/, "")}`;
  }
  return `style_docx_${clean}`;
}

/**
 * Chuyển đổi DocxParagraphFormatting sang ParagraphStyleProperties chuẩn editor
 */
function mapDocxParagraphProperties(
  props?: DocxParagraphFormatting,
  headingLevel?: 1 | 2 | 3
): ParagraphStyleProperties | undefined {
  if (!props && headingLevel === undefined) return undefined;
  const res: ParagraphStyleProperties = {};
  if (props?.alignment) res.textAlign = props.alignment;
  if (props?.lineSpacing !== undefined) res.lineSpacing = String(props.lineSpacing);
  if (typeof props?.spacingBefore === "number" && props.spacingBefore >= 0) {
    res.spacingBefore = props.spacingBefore;
  }
  if (typeof props?.spacingAfter === "number" && props.spacingAfter >= 0) {
    res.spacingAfter = props.spacingAfter;
  }
  if (typeof props?.leftIndent === "number" && props.leftIndent >= 0) {
    res.leftIndent = props.leftIndent;
  }
  if (typeof props?.rightIndent === "number" && props.rightIndent >= 0) {
    res.rightIndent = props.rightIndent;
  }
  if (typeof props?.firstLineIndent === "number" && props.firstLineIndent >= 0) {
    res.firstLineIndent = props.firstLineIndent;
  }
  if (typeof props?.hangingIndent === "number" && props.hangingIndent >= 0) {
    res.hangingIndent = props.hangingIndent;
  }
  if (typeof props?.keepWithNext === "boolean") {
    res.keepWithNext = props.keepWithNext;
  }
  if (typeof props?.keepLinesTogether === "boolean") {
    res.keepLinesTogether = props.keepLinesTogether;
  }
  if (typeof props?.pageBreakBefore === "boolean") {
    res.pageBreakBefore = props.pageBreakBefore;
  }
  if (typeof props?.widowControl === "boolean") {
    res.widowControl = props.widowControl;
  }
  if (headingLevel !== undefined) {
    res.headingLevel = headingLevel;
  } else if (props?.headingLevel !== undefined) {
    res.headingLevel = props.headingLevel;
  }
  return Object.keys(res).length > 0 ? res : undefined;
}

/**
 * Chuyển đổi DocxRunFormatting sang CharacterStyleProperties chuẩn editor
 */
function mapDocxRunProperties(
  props?: DocxRunFormatting
): CharacterStyleProperties | undefined {
  if (!props) return undefined;
  const res: CharacterStyleProperties = {};
  if (props.fontFamily && props.fontFamily.trim()) {
    res.fontFamily = props.fontFamily.trim();
  }
  if (typeof props.fontSizePt === "number" && props.fontSizePt > 0) {
    res.fontSize = props.fontSizePt;
  }
  if (typeof props.bold === "boolean") res.bold = props.bold;
  if (typeof props.italic === "boolean") res.italic = props.italic;
  if (typeof props.underline === "boolean") res.underline = props.underline;
  if (typeof props.strike === "boolean") res.strike = props.strike;
  if (props.color && props.color.trim()) res.color = props.color.trim();
  if (props.highlight && props.highlight.trim()) res.highlight = props.highlight.trim();
  return Object.keys(res).length > 0 ? res : undefined;
}

/**
 * Ánh xạ toàn bộ styles từ word/styles.xml sang Styles Engine 2.0 metadata
 */
export function mapDocxStylesToDocumentStyles(
  docxStyles: DocxStyleMap | undefined
): DocxStyleMappingResult {
  const wordStyleIdToInternalId = new Map<string, string>();
  const internalIdToWordStyleId = new Map<string, string>();

  // Khởi tạo mapping mặc định cho các built-in styles phổ biến
  wordStyleIdToInternalId.set("normal", STYLE_NORMAL_ID);
  wordStyleIdToInternalId.set("heading 1", STYLE_HEADING_1_ID);
  wordStyleIdToInternalId.set("heading1", STYLE_HEADING_1_ID);
  wordStyleIdToInternalId.set("heading 2", STYLE_HEADING_2_ID);
  wordStyleIdToInternalId.set("heading2", STYLE_HEADING_2_ID);
  wordStyleIdToInternalId.set("heading 3", STYLE_HEADING_3_ID);
  wordStyleIdToInternalId.set("heading3", STYLE_HEADING_3_ID);
  wordStyleIdToInternalId.set("emphasis", STYLE_EMPHASIS_ID);
  wordStyleIdToInternalId.set("strong", STYLE_STRONG_ID);

  if (!docxStyles || docxStyles.size === 0) {
    return {
      stylesMetadata: createDefaultStylesMetadata(),
      wordStyleIdToInternalId,
      internalIdToWordStyleId,
    };
  }

  // 1. Thu thập các style hợp lệ duy nhất (loại bỏ key lowercase nhân bản của DocxStyleMap)
  const uniqueWordStyles = new Map<string, DocxStyle>();
  for (const style of docxStyles.values()) {
    // Chỉ chấp nhận paragraph và character style
    if (style.type !== "paragraph" && style.type !== "character") {
      continue;
    }
    if (!uniqueWordStyles.has(style.id)) {
      uniqueWordStyles.set(style.id, style);
    }
  }

  // 2. Bước 1: Quyết định internal ID cho từng Word style
  const usedInternalIds = new Map<string, string>(); // internalId -> wordStyleId

  for (const [id, style] of uniqueWordStyles.entries()) {
    let internalId: string;

    if (isWordNormalStyle(style)) {
      internalId = STYLE_NORMAL_ID;
    } else {
      const headingLvl = getWordHeadingLevel(style);
      if (headingLvl === 1) internalId = STYLE_HEADING_1_ID;
      else if (headingLvl === 2) internalId = STYLE_HEADING_2_ID;
      else if (headingLvl === 3) internalId = STYLE_HEADING_3_ID;
      else {
        const charType = getWordBuiltInCharacterType(style);
        if (charType === "emphasis") internalId = STYLE_EMPHASIS_ID;
        else if (charType === "strong") internalId = STYLE_STRONG_ID;
        else {
          // Custom style
          let base = sanitizeWordStyleId(id);
          let candidate = base;
          let counter = 2;
          while (usedInternalIds.has(candidate) && usedInternalIds.get(candidate) !== id) {
            candidate = `${base}_${counter++}`;
          }
          internalId = candidate;
        }
      }
    }

    usedInternalIds.set(internalId, id);
    internalIdToWordStyleId.set(internalId, id);

    // Đăng ký lookup tra cứu nhiều biến thể (original id, lowercase, name, name lowercase)
    wordStyleIdToInternalId.set(style.id, internalId);
    wordStyleIdToInternalId.set(style.id.toLowerCase(), internalId);
    if (style.name) {
      wordStyleIdToInternalId.set(style.name, internalId);
      wordStyleIdToInternalId.set(style.name.toLowerCase(), internalId);
    }
  }

  // 3. Bước 2: Chuyển đổi định nghĩa các style sang DocumentStyle
  const defaultBuiltIns = createDefaultStyleDefinitions();
  const builtInDefaultsMap = new Map<string, DocumentStyle>(
    defaultBuiltIns.map((s) => [s.id, s])
  );

  const convertedStyles: DocumentStyle[] = [];

  for (const [id, style] of uniqueWordStyles.entries()) {
    const internalId = wordStyleIdToInternalId.get(id)!;
    const isBuiltIn = BUILT_IN_STYLE_IDS.has(internalId);
    const headingLvl = getWordHeadingLevel(style);

    // Xác định basedOn:
    let basedOn: string | null = null;
    if (style.basedOn) {
      const mappedParent =
        wordStyleIdToInternalId.get(style.basedOn) ||
        wordStyleIdToInternalId.get(style.basedOn.toLowerCase());
      if (mappedParent && mappedParent !== internalId) {
        basedOn = mappedParent;
      } else {
        basedOn = style.type === "paragraph" && internalId !== STYLE_NORMAL_ID ? STYLE_NORMAL_ID : null;
      }
    } else {
      basedOn = style.type === "paragraph" && internalId !== STYLE_NORMAL_ID ? STYLE_NORMAL_ID : null;
    }

    // Xác định nextStyleId
    let mappedNextStyleId: string | null = null;
    if (style.nextStyleId) {
      const mappedNext =
        wordStyleIdToInternalId.get(style.nextStyleId) ||
        wordStyleIdToInternalId.get(style.nextStyleId.toLowerCase());
      mappedNextStyleId = mappedNext || null;
    } else if (style.type === "paragraph") {
      mappedNextStyleId = STYLE_NORMAL_ID;
    }

    // Xác định linkStyleId
    let mappedLinkStyleId: string | undefined = undefined;
    if (style.linkStyleId) {
      const mappedLink =
        wordStyleIdToInternalId.get(style.linkStyleId) ||
        wordStyleIdToInternalId.get(style.linkStyleId.toLowerCase());
      mappedLinkStyleId = mappedLink || undefined;
    }

    // Lấy unmerged/raw formatting nếu có, fallback flattened formatting
    const rawPara = style.rawParagraphFormatting || style.paragraphFormatting;
    const rawRun = style.rawRunFormatting || style.runFormatting;

    const mappedParaProps =
      style.type === "paragraph"
        ? mapDocxParagraphProperties(rawPara, headingLvl)
        : undefined;

    const mappedCharProps = mapDocxRunProperties(rawRun);

    // Nếu là built-in style, hòa trộn các thuộc tính từ Word lên baseline mặc định
    if (isBuiltIn) {
      const baseDefault = builtInDefaultsMap.get(internalId);
      convertedStyles.push({
        id: internalId,
        name: baseDefault?.name || style.name || id,
        type: style.type === "character" ? "character" : "paragraph",
        basedOn: baseDefault?.basedOn ?? basedOn,
        nextStyleId: baseDefault?.nextStyleId ?? mappedNextStyleId,
        linkStyleId: mappedLinkStyleId,
        isDefault: typeof style.isDefault === "boolean" ? style.isDefault : undefined,
        qFormat: typeof style.qFormat === "boolean" ? style.qFormat : true,
        wordStyleId: id,
        isBuiltIn: true,
        paragraph:
          style.type === "paragraph"
            ? {
                ...baseDefault?.paragraph,
                ...mappedParaProps,
                headingLevel: headingLvl ?? baseDefault?.paragraph?.headingLevel,
              }
            : undefined,
        character: {
          ...baseDefault?.character,
          ...mappedCharProps,
        },
      });
    } else {
      convertedStyles.push({
        id: internalId,
        name: style.name || id,
        type: style.type === "character" ? "character" : "paragraph",
        basedOn,
        nextStyleId: mappedNextStyleId,
        linkStyleId: mappedLinkStyleId,
        isDefault: typeof style.isDefault === "boolean" ? style.isDefault : undefined,
        qFormat: typeof style.qFormat === "boolean" ? style.qFormat : undefined,
        wordStyleId: id,
        isBuiltIn: false,
        paragraph: mappedParaProps,
        character: mappedCharProps,
      });
    }
  }

  // 4. Chuẩn hóa qua normalizeStyleCollection để bù built-in, phá vòng cycle và deduplicate
  const stylesMetadata = normalizeStyleCollection(convertedStyles);

  return {
    stylesMetadata,
    wordStyleIdToInternalId,
    internalIdToWordStyleId,
  };
}
