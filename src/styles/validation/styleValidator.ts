import type { JSONContent } from "@tiptap/core";
import type {
  DocumentStyle,
  DocumentStylesMetadata,
  DocumentStyleType,
  ParagraphStyleProperties,
  CharacterStyleProperties,
} from "../types/styleTypes.ts";
import {
  BUILT_IN_STYLE_IDS,
  STYLE_NORMAL_ID,
  createDefaultStyleDefinitions,
  createDefaultStylesMetadata,
  isBuiltInStyleId,
} from "../services/builtInStyles.ts";

export interface StyleValidationResult {
  isValid: boolean;
  errors: string[];
}

const VALID_STYLE_TYPES: ReadonlySet<string> = new Set(["paragraph", "character"]);
const VALID_ALIGNMENTS: ReadonlySet<string> = new Set(["left", "center", "right", "justify"]);

/**
 * Kiểm tra tính hợp lệ của giá trị phông chữ / cỡ chữ / màu sắc trong CharacterStyleProperties.
 */
export function validateCharacterProperties(
  props: unknown
): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!props || typeof props !== "object" || Array.isArray(props)) {
    return { isValid: false, errors: ["Thuộc tính character phải là một đối tượng."] };
  }

  const cp = props as Partial<CharacterStyleProperties>;

  // FontSize: nếu có, phải là số dương hoặc chuỗi kích thước hợp lệ
  if (cp.fontSize !== undefined && cp.fontSize !== null) {
    if (typeof cp.fontSize === "number") {
      if (isNaN(cp.fontSize) || !isFinite(cp.fontSize) || cp.fontSize <= 0 || cp.fontSize > 144) {
        errors.push(`Cỡ chữ fontSize (${cp.fontSize}) không hợp lệ (phải từ 1 đến 144 pt).`);
      }
    } else if (typeof cp.fontSize === "string") {
      const num = parseFloat(cp.fontSize.trim().replace(/pt|px$/i, ""));
      if (isNaN(num) || num <= 0 || num > 144) {
        errors.push(`Cỡ chữ fontSize ("${cp.fontSize}") không hợp lệ.`);
      }
    } else {
      errors.push("Cỡ chữ fontSize phải là số hoặc chuỗi.");
    }
  }

  // FontFamily: nếu có, phải là chuỗi không rỗng
  if (cp.fontFamily !== undefined && cp.fontFamily !== null) {
    if (typeof cp.fontFamily !== "string" || !cp.fontFamily.trim()) {
      errors.push("Tên phông chữ fontFamily không được rỗng.");
    }
  }

  // Color: nếu có, phải là chuỗi
  if (cp.color !== undefined && cp.color !== null && typeof cp.color !== "string") {
    errors.push("Màu chữ color phải là chuỗi.");
  }

  // Highlight: nếu có, phải là chuỗi
  if (cp.highlight !== undefined && cp.highlight !== null && typeof cp.highlight !== "string") {
    errors.push("Màu highlight phải là chuỗi.");
  }

  return { isValid: errors.length === 0, errors };
}

/**
 * Kiểm tra tính hợp lệ của các thuộc tính ParagraphStyleProperties.
 */
export function validateParagraphProperties(
  props: unknown
): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!props || typeof props !== "object" || Array.isArray(props)) {
    return { isValid: false, errors: ["Thuộc tính paragraph phải là một đối tượng."] };
  }

  const pp = props as Partial<ParagraphStyleProperties>;

  // TextAlign
  if (pp.textAlign !== undefined && pp.textAlign !== null) {
    if (typeof pp.textAlign !== "string" || !VALID_ALIGNMENTS.has(pp.textAlign)) {
      errors.push(`Căn lề textAlign ("${String(pp.textAlign)}") không hợp lệ (hỗ trợ: left, center, right, justify).`);
    }
  }

  // LineSpacing: nếu là số thì > 0, nếu là string thì không rỗng
  if (pp.lineSpacing !== undefined && pp.lineSpacing !== null) {
    if (typeof pp.lineSpacing === "number") {
      if (isNaN(pp.lineSpacing) || !isFinite(pp.lineSpacing) || pp.lineSpacing <= 0) {
        errors.push(`Độ giãn dòng lineSpacing (${pp.lineSpacing}) phải là số dương.`);
      }
    } else if (typeof pp.lineSpacing === "string") {
      const parsed = parseFloat(pp.lineSpacing);
      if (isNaN(parsed) || parsed <= 0) {
        errors.push(`Độ giãn dòng lineSpacing ("${pp.lineSpacing}") không hợp lệ.`);
      }
    } else {
      errors.push("Độ giãn dòng lineSpacing phải là chuỗi hoặc số.");
    }
  }

  // SpacingBefore & SpacingAfter: số >= 0
  if (pp.spacingBefore !== undefined && pp.spacingBefore !== null) {
    if (typeof pp.spacingBefore !== "number" || isNaN(pp.spacingBefore) || pp.spacingBefore < 0) {
      errors.push(`Khoảng cách trước đoạn spacingBefore (${String(pp.spacingBefore)}) phải là số không âm.`);
    }
  }
  if (pp.spacingAfter !== undefined && pp.spacingAfter !== null) {
    if (typeof pp.spacingAfter !== "number" || isNaN(pp.spacingAfter) || pp.spacingAfter < 0) {
      errors.push(`Khoảng cách sau đoạn spacingAfter (${String(pp.spacingAfter)}) phải là số không âm.`);
    }
  }

  // Indents: số >= 0
  if (pp.leftIndent !== undefined && pp.leftIndent !== null) {
    if (typeof pp.leftIndent !== "number" || isNaN(pp.leftIndent) || pp.leftIndent < 0) {
      errors.push(`Thụt lề trái leftIndent (${String(pp.leftIndent)}) phải là số không âm.`);
    }
  }
  if (pp.rightIndent !== undefined && pp.rightIndent !== null) {
    if (typeof pp.rightIndent !== "number" || isNaN(pp.rightIndent) || pp.rightIndent < 0) {
      errors.push(`Thụt lề phải rightIndent (${String(pp.rightIndent)}) phải là số không âm.`);
    }
  }
  if (pp.firstLineIndent !== undefined && pp.firstLineIndent !== null) {
    if (typeof pp.firstLineIndent !== "number" || isNaN(pp.firstLineIndent) || pp.firstLineIndent < 0) {
      errors.push(`Thụt lề dòng đầu firstLineIndent (${String(pp.firstLineIndent)}) phải là số không âm.`);
    }
  }
  if (pp.hangingIndent !== undefined && pp.hangingIndent !== null) {
    if (typeof pp.hangingIndent !== "number" || isNaN(pp.hangingIndent) || pp.hangingIndent < 0) {
      errors.push(`Nhô lề dòng đầu hangingIndent (${String(pp.hangingIndent)}) phải là số không âm.`);
    }
  }

  // HeadingLevel: 1 | 2 | 3
  if (pp.headingLevel !== undefined && pp.headingLevel !== null) {
    if (![1, 2, 3].includes(pp.headingLevel as number)) {
      errors.push(`Cấp độ đề mục headingLevel (${String(pp.headingLevel)}) phải là 1, 2 hoặc 3.`);
    }
  }

  return { isValid: errors.length === 0, errors };
}

/**
 * Kiểm tra tính hợp lệ của một đối tượng DocumentStyle đơn lẻ.
 */
export function validateDocumentStyle(data: unknown): StyleValidationResult {
  const errors: string[] = [];

  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return { isValid: false, errors: ["Dữ liệu Style phải là một đối tượng."] };
  }

  const s = data as Partial<DocumentStyle>;

  // ID
  if (typeof s.id !== "string" || !s.id.trim()) {
    errors.push("ID của Style không được để trống.");
  }

  // Name
  if (typeof s.name !== "string" || !s.name.trim()) {
    errors.push("Tên Style (name) không được để trống.");
  }

  // Type
  if (typeof s.type !== "string" || !VALID_STYLE_TYPES.has(s.type)) {
    errors.push(`Loại Style ("${String(s.type)}") không hợp lệ (phải là "paragraph" hoặc "character").`);
  }

  // isBuiltIn flag
  if (typeof s.isBuiltIn !== "boolean") {
    errors.push("Thuộc tính isBuiltIn phải là kiểu boolean.");
  } else if (typeof s.id === "string") {
    const isBuiltInId = isBuiltInStyleId(s.id);
    if (isBuiltInId && !s.isBuiltIn) {
      errors.push(`Style ID "${s.id}" là built-in và không thể đặt isBuiltIn = false.`);
    }
    if (!isBuiltInId && s.isBuiltIn) {
      errors.push(`Style ID tùy biến "${s.id}" không thể đặt isBuiltIn = true.`);
    }
  }

  // basedOn không được trỏ chính nó
  if (typeof s.basedOn === "string" && typeof s.id === "string" && s.basedOn === s.id) {
    errors.push(`Style "${s.id}" không thể có basedOn trỏ tới chính nó.`);
  }

  // Kiểm tra paragraph properties nếu có
  if (s.paragraph !== undefined && s.paragraph !== null) {
    const pRes = validateParagraphProperties(s.paragraph);
    if (!pRes.isValid) {
      errors.push(...pRes.errors);
    }
  }

  // Kiểm tra character properties nếu có
  if (s.character !== undefined && s.character !== null) {
    const cRes = validateCharacterProperties(s.character);
    if (!cRes.isValid) {
      errors.push(...cRes.errors);
    }
  }

  return { isValid: errors.length === 0, errors };
}

/**
 * Kiểm tra xem một styleId có bị phụ thuộc vòng (circular reference) thông qua basedOn hay không.
 */
export function hasCircularBasedOn(
  startStyleId: string,
  styleMap: Map<string, DocumentStyle>
): boolean {
  const visited = new Set<string>();
  let currentId: string | null | undefined = startStyleId;

  while (currentId) {
    if (visited.has(currentId)) {
      return true;
    }
    visited.add(currentId);
    const style = styleMap.get(currentId);
    if (!style || !style.basedOn) {
      break;
    }
    currentId = style.basedOn;
  }

  return false;
}

/**
 * Kiểm tra tính hợp lệ của toàn bộ bộ sưu tập Styles trong tài liệu.
 * Đảm bảo:
 * - Không có ID trùng lặp
 * - Không có tên trùng lặp (không phân biệt chữ hoa/thường)
 * - Tất cả các built-in styles bắt buộc đều có mặt
 * - Không có tham chiếu basedOn vòng
 * - basedOn trỏ tới một style tồn tại trong collection (nếu có chỉ định)
 */
export function validateStyleCollection(definitions: unknown): StyleValidationResult {
  const errors: string[] = [];

  if (!Array.isArray(definitions)) {
    return { isValid: false, errors: ["Danh sách definitions phải là một mảng các DocumentStyle."] };
  }

  const idMap = new Map<string, DocumentStyle>();
  const nameSet = new Set<string>();

  for (let i = 0; i < definitions.length; i++) {
    const raw = definitions[i];
    const res = validateDocumentStyle(raw);
    if (!res.isValid) {
      errors.push(`Style ở vị trí index ${i} không hợp lệ: ${res.errors.join("; ")}`);
      continue;
    }

    const s = raw as DocumentStyle;

    // Kiểm tra duplicate ID
    if (idMap.has(s.id)) {
      errors.push(`Phát hiện Style ID trùng lặp: "${s.id}".`);
    } else {
      idMap.set(s.id, s);
    }

    // Kiểm tra duplicate Name (case-insensitive)
    const normalizedName = s.name.trim().toLowerCase();
    if (nameSet.has(normalizedName)) {
      errors.push(`Phát hiện tên Style trùng lặp: "${s.name}".`);
    } else {
      nameSet.add(normalizedName);
    }
  }

  // Đảm bảo tất cả 4 built-in styles bắt buộc đều tồn tại
  for (const builtInId of BUILT_IN_STYLE_IDS) {
    if (!idMap.has(builtInId)) {
      errors.push(`Thiếu Built-in Style bắt buộc: "${builtInId}".`);
    }
  }

  // Kiểm tra tham chiếu vòng & tính tồn tại của basedOn
  for (const [id, style] of idMap.entries()) {
    if (style.basedOn) {
      if (!idMap.has(style.basedOn)) {
        errors.push(`Style "${id}" kế thừa từ basedOn "${style.basedOn}" nhưng style này không tồn tại.`);
      } else if (hasCircularBasedOn(id, idMap)) {
        errors.push(`Style "${id}" có tham chiếu kế thừa vòng (circular reference qua basedOn).`);
      }
    }
  }

  return { isValid: errors.length === 0, errors };
}

/**
 * Chuẩn hóa an toàn một bộ sưu tập Style từ dữ liệu thô (ví dụ khi nạp tài liệu cũ hoặc file ngoài).
 * Tự động bù đắp các built-in styles bị thiếu, loại bỏ các mục lỗi/trùng ID,
 * đảm bảo 100% tính tương thích ngược mà không ném ngoại lệ làm sập ứng dụng.
 */
export function normalizeStyleCollection(rawDefinitions?: unknown): DocumentStylesMetadata {
  const defaultBuiltIns = createDefaultStyleDefinitions();
  const builtInMap = new Map<string, DocumentStyle>(
    defaultBuiltIns.map((s) => [s.id, { ...s }])
  );

  if (!Array.isArray(rawDefinitions)) {
    return createDefaultStylesMetadata();
  }

  const finalDefinitions: DocumentStyle[] = [];
  const processedIds = new Set<string>();
  const processedNames = new Set<string>();

  // 1. Quét các định nghĩa đầu vào
  for (const item of rawDefinitions) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const raw = item as Partial<DocumentStyle>;

    if (typeof raw.id !== "string" || !raw.id.trim()) continue;
    const id = raw.id.trim();

    if (processedIds.has(id)) continue; // Bỏ qua ID trùng

    if (typeof raw.name !== "string" || !raw.name.trim()) continue;
    const name = raw.name.trim();

    // Xử lý duplicate names: thay vì drop style làm mất format của block, deduplicate tên có hậu tố
    let finalName = name;
    let normalizedName = finalName.toLowerCase();
    if (processedNames.has(normalizedName)) {
      let counter = 2;
      while (processedNames.has(`${name.toLowerCase()} (${counter})`)) {
        counter++;
      }
      finalName = `${name} (${counter})`;
      normalizedName = finalName.toLowerCase();
    }

    const type: DocumentStyleType = raw.type === "character" ? "character" : "paragraph";
    const isBuiltIn = isBuiltInStyleId(id);

    // Kế thừa các thiết lập mặc định của built-in nếu là built-in
    const baseDefault = isBuiltIn ? builtInMap.get(id) : undefined;

    const validatedParagraph: ParagraphStyleProperties | undefined =
      type === "paragraph"
        ? (raw.paragraph || isBuiltIn)
          ? {
              textAlign:
                raw.paragraph?.textAlign && VALID_ALIGNMENTS.has(raw.paragraph.textAlign)
                  ? raw.paragraph.textAlign
                  : isBuiltIn ? baseDefault?.paragraph?.textAlign ?? "left" : undefined,
              lineSpacing:
                raw.paragraph?.lineSpacing !== undefined
                  ? raw.paragraph.lineSpacing
                  : isBuiltIn ? baseDefault?.paragraph?.lineSpacing ?? "1.15" : undefined,
              spacingBefore:
                typeof raw.paragraph?.spacingBefore === "number" && raw.paragraph.spacingBefore >= 0
                  ? raw.paragraph.spacingBefore
                  : isBuiltIn ? baseDefault?.paragraph?.spacingBefore ?? 0 : undefined,
              spacingAfter:
                typeof raw.paragraph?.spacingAfter === "number" && raw.paragraph.spacingAfter >= 0
                  ? raw.paragraph.spacingAfter
                  : isBuiltIn ? baseDefault?.paragraph?.spacingAfter ?? 0 : undefined,
              leftIndent:
                typeof raw.paragraph?.leftIndent === "number" && raw.paragraph.leftIndent >= 0
                  ? raw.paragraph.leftIndent
                  : isBuiltIn ? baseDefault?.paragraph?.leftIndent ?? 0 : undefined,
              rightIndent:
                typeof raw.paragraph?.rightIndent === "number" && raw.paragraph.rightIndent >= 0
                  ? raw.paragraph.rightIndent
                  : isBuiltIn ? baseDefault?.paragraph?.rightIndent ?? 0 : undefined,
              firstLineIndent:
                typeof raw.paragraph?.firstLineIndent === "number" && raw.paragraph.firstLineIndent >= 0
                  ? raw.paragraph.firstLineIndent
                  : isBuiltIn ? baseDefault?.paragraph?.firstLineIndent ?? 0 : undefined,
              hangingIndent:
                typeof raw.paragraph?.hangingIndent === "number" && raw.paragraph.hangingIndent >= 0
                  ? raw.paragraph.hangingIndent
                  : isBuiltIn ? baseDefault?.paragraph?.hangingIndent ?? 0 : undefined,
              keepWithNext:
                typeof raw.paragraph?.keepWithNext === "boolean"
                  ? raw.paragraph.keepWithNext
                  : isBuiltIn ? baseDefault?.paragraph?.keepWithNext ?? false : undefined,
              keepLinesTogether:
                typeof raw.paragraph?.keepLinesTogether === "boolean"
                  ? raw.paragraph.keepLinesTogether
                  : isBuiltIn ? baseDefault?.paragraph?.keepLinesTogether ?? false : undefined,
              pageBreakBefore:
                typeof raw.paragraph?.pageBreakBefore === "boolean"
                  ? raw.paragraph.pageBreakBefore
                  : isBuiltIn ? baseDefault?.paragraph?.pageBreakBefore ?? false : undefined,
              widowControl:
                typeof raw.paragraph?.widowControl === "boolean"
                  ? raw.paragraph.widowControl
                  : isBuiltIn ? baseDefault?.paragraph?.widowControl ?? true : undefined,
              headingLevel:
                raw.paragraph?.headingLevel && [1, 2, 3].includes(raw.paragraph.headingLevel)
                  ? (raw.paragraph.headingLevel as 1 | 2 | 3)
                  : isBuiltIn ? baseDefault?.paragraph?.headingLevel : undefined,
            }
          : undefined
        : undefined;

    const validatedCharacter: CharacterStyleProperties | undefined =
      (raw.character || isBuiltIn)
        ? {
            fontFamily:
              typeof raw.character?.fontFamily === "string" && raw.character.fontFamily.trim()
                ? raw.character.fontFamily
                : isBuiltIn ? baseDefault?.character?.fontFamily ?? "Calibri" : undefined,
            fontSize:
              raw.character?.fontSize !== undefined
                ? raw.character.fontSize
                : isBuiltIn ? baseDefault?.character?.fontSize ?? 11 : undefined,
            bold:
              typeof raw.character?.bold === "boolean"
                ? raw.character.bold
                : isBuiltIn ? baseDefault?.character?.bold ?? false : undefined,
            italic:
              typeof raw.character?.italic === "boolean"
                ? raw.character.italic
                : isBuiltIn ? baseDefault?.character?.italic ?? false : undefined,
            underline:
              typeof raw.character?.underline === "boolean"
                ? raw.character.underline
                : isBuiltIn ? baseDefault?.character?.underline ?? false : undefined,
            strike:
              typeof raw.character?.strike === "boolean"
                ? raw.character.strike
                : isBuiltIn ? baseDefault?.character?.strike ?? false : undefined,
            color:
              typeof raw.character?.color === "string"
                ? raw.character.color
                : isBuiltIn ? baseDefault?.character?.color ?? "#0f172a" : undefined,
            highlight:
              typeof raw.character?.highlight === "string"
                ? raw.character.highlight
                : undefined,
          }
        : undefined;

    const normalizedStyle: DocumentStyle = {
      id,
      name: finalName,
      type,
      basedOn: raw.basedOn && raw.basedOn !== id ? raw.basedOn : isBuiltIn ? baseDefault?.basedOn : null,
      nextStyleId: raw.nextStyleId ?? baseDefault?.nextStyleId ?? (type === "paragraph" ? STYLE_NORMAL_ID : null),
      linkStyleId: typeof raw.linkStyleId === "string" ? raw.linkStyleId : undefined,
      isDefault: typeof raw.isDefault === "boolean" ? raw.isDefault : undefined,
      qFormat: typeof raw.qFormat === "boolean" ? raw.qFormat : undefined,
      wordStyleId: typeof raw.wordStyleId === "string" ? raw.wordStyleId : undefined,
      isBuiltIn,
      paragraph: validatedParagraph,
      character: validatedCharacter,
    };

    finalDefinitions.push(normalizedStyle);
    processedIds.add(id);
    processedNames.add(normalizedName);
  }

  // 2. Bổ sung các Built-in còn thiếu (đảm bảo luôn đủ 4 built-ins)
  for (const defaultStyle of defaultBuiltIns) {
    if (!processedIds.has(defaultStyle.id)) {
      finalDefinitions.push({ ...defaultStyle });
      processedIds.add(defaultStyle.id);
      processedNames.add(defaultStyle.name.toLowerCase());
    }
  }

  const finalIdMap = new Map<string, DocumentStyle>(
    finalDefinitions.map((s) => [s.id, s])
  );

  // 3. Chuẩn hóa basedOn: xử lý missing parent và type mismatch
  for (const style of finalDefinitions) {
    if (style.basedOn) {
      const parent = finalIdMap.get(style.basedOn);
      if (!parent || parent.type !== style.type || parent.id === style.id) {
        // Fallback deterministic: paragraph -> STYLE_NORMAL_ID (hoặc null nếu là Normal), character -> null
        style.basedOn = style.id === STYLE_NORMAL_ID ? null : (style.type === "paragraph" ? STYLE_NORMAL_ID : null);
      }
    }
    // Chuẩn hóa linkStyleId và nextStyleId nếu trỏ tới ID không tồn tại
    if (style.linkStyleId && !finalIdMap.has(style.linkStyleId)) {
      style.linkStyleId = undefined;
    }
    if (style.nextStyleId && !finalIdMap.has(style.nextStyleId)) {
      style.nextStyleId = style.type === "paragraph" ? STYLE_NORMAL_ID : null;
    }
  }

  // 4. Chuẩn hóa chu trình kế thừa (Inheritance Cycle Protection): ngắt vòng lặp an toàn
  for (const style of finalDefinitions) {
    if (style.basedOn && hasCircularBasedOn(style.id, finalIdMap)) {
      style.basedOn = style.id === STYLE_NORMAL_ID ? null : (style.type === "paragraph" ? STYLE_NORMAL_ID : null);
    }
  }

  return {
    definitions: finalDefinitions,
    defaultParagraphStyleId: STYLE_NORMAL_ID,
  };
}

/**
 * Chuẩn hóa các tham chiếu Style trong cây nội dung ProseMirror AST (JSONContent).
 * Bảo vệ tối đa tính toàn vẹn dữ liệu:
 * - Block có styleId không tồn tại: fallback an toàn (heading -> default heading level, paragraph -> null / Normal)
 * - Text node có characterStyle mark trỏ tới styleId không tồn tại: gỡ bỏ mark phantom mà giữ nguyên 100% text và các mark khác
 * - Tuyệt đối không làm mất ký tự hay đoạn văn bản nào của tài liệu.
 */
export function normalizeDocumentContentStyles(
  content: JSONContent,
  validStyleIds: Set<string>
): JSONContent {
  if (!content || typeof content !== "object") {
    return content;
  }

  const normalized: JSONContent = { ...content };

  // 1. Chuẩn hóa styleId trên block (paragraph hoặc heading)
  if (normalized.type === "paragraph" || normalized.type === "heading") {
    const rawStyleId = normalized.attrs?.styleId;
    if (typeof rawStyleId === "string" && rawStyleId.trim()) {
      const trimmedStyleId = rawStyleId.trim();
      if (!validStyleIds.has(trimmedStyleId)) {
        // Style ID không tồn tại -> fallback deterministic
        const fallbackStyleId =
          normalized.type === "heading"
            ? (normalized.attrs?.level === 2
                ? "style_heading_2"
                : normalized.attrs?.level === 3
                ? "style_heading_3"
                : "style_heading_1")
            : null;
        normalized.attrs = {
          ...normalized.attrs,
          styleId: fallbackStyleId,
        };
      }
    }
  }

  // 2. Chuẩn hóa marks trên text node
  if (Array.isArray(normalized.marks) && normalized.marks.length > 0) {
    normalized.marks = normalized.marks.filter((mark) => {
      if (mark && mark.type === "characterStyle") {
        const charStyleId = mark.attrs?.styleId;
        if (!charStyleId || typeof charStyleId !== "string" || !validStyleIds.has(charStyleId.trim())) {
          // Bỏ mark phantom không tồn tại
          return false;
        }
      }
      return true;
    });
  }

  // 3. Đệ quy duyệt các node con
  if (Array.isArray(normalized.content)) {
    normalized.content = normalized.content.map((child) =>
      normalizeDocumentContentStyles(child, validStyleIds)
    );
  }

  return normalized;
}
