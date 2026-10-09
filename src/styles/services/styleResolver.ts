import type { DocumentStyle } from "../types/styleTypes.ts";
import type {
  ResolvedDocumentStyle,
  ResolvedParagraphProperties,
  ResolvedCharacterProperties,
  StyleResolveOptions,
  CycleDetectionResult,
} from "../types/styleResolutionTypes.ts";
import { STYLE_NORMAL_ID } from "./builtInStyles.ts";

/**
 * Giá trị mặc định nền tảng cho khối đoạn văn khi không có thuộc tính nào được định nghĩa.
 */
export const SYSTEM_DEFAULT_PARAGRAPH_PROPERTIES: Readonly<ResolvedParagraphProperties> = {
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
};

/**
 * Giá trị mặc định nền tảng cho định dạng ký tự khi không có thuộc tính nào được định nghĩa.
 */
export const SYSTEM_DEFAULT_CHARACTER_PROPERTIES: Readonly<ResolvedCharacterProperties> = {
  fontFamily: "Calibri",
  fontSize: 11,
  bold: false,
  italic: false,
  underline: false,
  strike: false,
  color: "#0f172a",
};

/**
 * Chuyển đổi danh sách định nghĩa Style sang Map để tra cứu O(1).
 */
export function buildStyleMap(
  definitions: DocumentStyle[] | Map<string, DocumentStyle>
): Map<string, DocumentStyle> {
  if (definitions instanceof Map) {
    return definitions;
  }
  const map = new Map<string, DocumentStyle>();
  if (!definitions || !Array.isArray(definitions)) {
    return map;
  }
  for (const s of definitions) {
    if (s && typeof s === "object" && s.id) {
      map.set(s.id, s);
    }
  }
  return map;
}

/**
 * Lấy định nghĩa Style theo ID.
 */
export function getStyleById(
  styleId: string,
  definitions: DocumentStyle[] | Map<string, DocumentStyle>
): DocumentStyle | undefined {
  const map = buildStyleMap(definitions);
  return map.get(styleId);
}

/**
 * Lấy danh sách các Style con trực tiếp (có basedOn trỏ tới styleId này).
 */
export function getStyleChildren(
  styleId: string,
  definitions: DocumentStyle[] | Map<string, DocumentStyle>
): DocumentStyle[] {
  const map = buildStyleMap(definitions);
  const children: DocumentStyle[] = [];
  for (const s of map.values()) {
    if (s.basedOn === styleId) {
      children.push(s);
    }
  }
  return children;
}

/**
 * Thu thập tất cả ID của các Style hậu duệ (descendants) ở mọi cấp độ kế thừa.
 * Sử dụng BFS kèm visited set chống lặp vô hạn.
 */
export function collectDescendants(
  styleId: string,
  definitions: DocumentStyle[] | Map<string, DocumentStyle>
): string[] {
  const map = buildStyleMap(definitions);
  const descendants: string[] = [];
  const queue: string[] = [styleId];
  const visited = new Set<string>([styleId]);

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    for (const s of map.values()) {
      if (s.basedOn === currentId && !visited.has(s.id)) {
        visited.add(s.id);
        descendants.push(s.id);
        queue.push(s.id);
      }
    }
  }

  return descendants;
}

/**
 * Kiểm tra xem một Style có bị chu trình vòng kế thừa (Inheritance Cycle) hay không.
 */
export function detectInheritanceCycle(
  styleId: string,
  definitions: DocumentStyle[] | Map<string, DocumentStyle>
): CycleDetectionResult {
  const map = buildStyleMap(definitions);
  const visited = new Set<string>();
  const path: string[] = [];
  let currentId: string | null | undefined = styleId;

  while (currentId) {
    if (visited.has(currentId)) {
      path.push(currentId);
      return {
        hasCycle: true,
        cyclePath: path,
      };
    }

    visited.add(currentId);
    path.push(currentId);

    const style = map.get(currentId);
    if (!style || !style.basedOn) {
      break;
    }
    currentId = style.basedOn;
  }

  return { hasCycle: false };
}

/**
 * Kiểm tra xem có thể gán an toàn newBasedOnId làm cha của styleId hay không.
 * Ngăn chặn:
 * - Trỏ tới chính nó (A -> A)
 * - Tạo chu trình vòng gián tiếp (A -> B -> A)
 * - Trỏ tới cha không tồn tại (nếu newBasedOnId != null)
 * - Không tương thích kiểu (paragraph không thể basedOn character và ngược lại)
 */
export function canSetBasedOn(
  styleId: string,
  newBasedOnId: string | null | undefined,
  definitions: DocumentStyle[] | Map<string, DocumentStyle>
): boolean {
  if (!newBasedOnId) {
    return true; // Bỏ basedOn luôn an toàn
  }
  if (styleId === newBasedOnId) {
    return false; // Không thể trỏ chính nó
  }

  const map = buildStyleMap(definitions);
  const target = map.get(styleId);
  const parent = map.get(newBasedOnId);

  if (!parent) {
    return false; // Style cha phải tồn tại
  }

  // Tương thích loại style
  if (target && target.type !== parent.type) {
    return false;
  }

  // Kiểm tra chu trình: duyệt ngược từ parent lên xem có chạm tới styleId không
  let current: DocumentStyle | undefined = parent;
  const visited = new Set<string>([styleId]);

  while (current && current.basedOn) {
    if (visited.has(current.basedOn)) {
      return false; // Sẽ tạo thành chu trình vòng
    }
    visited.add(current.basedOn);
    current = map.get(current.basedOn);
  }

  return true;
}

/**
 * Hợp nhất đè thuộc tính paragraph: chỉ các thuộc tính khác undefined mới ghi đè.
 */
function mergeParagraphProperties(
  base: ResolvedParagraphProperties,
  override?: Partial<ResolvedParagraphProperties>
): ResolvedParagraphProperties {
  if (!override) return { ...base };
  return {
    textAlign: override.textAlign !== undefined ? override.textAlign : base.textAlign,
    lineSpacing: override.lineSpacing !== undefined ? override.lineSpacing : base.lineSpacing,
    spacingBefore: override.spacingBefore !== undefined ? override.spacingBefore : base.spacingBefore,
    spacingAfter: override.spacingAfter !== undefined ? override.spacingAfter : base.spacingAfter,
    leftIndent: override.leftIndent !== undefined ? override.leftIndent : base.leftIndent,
    rightIndent: override.rightIndent !== undefined ? override.rightIndent : base.rightIndent,
    firstLineIndent: override.firstLineIndent !== undefined ? override.firstLineIndent : base.firstLineIndent,
    hangingIndent: override.hangingIndent !== undefined ? override.hangingIndent : base.hangingIndent,
    keepWithNext: override.keepWithNext !== undefined ? override.keepWithNext : base.keepWithNext,
    keepLinesTogether: override.keepLinesTogether !== undefined ? override.keepLinesTogether : base.keepLinesTogether,
    pageBreakBefore: override.pageBreakBefore !== undefined ? override.pageBreakBefore : base.pageBreakBefore,
    widowControl: override.widowControl !== undefined ? override.widowControl : base.widowControl,
    headingLevel: override.headingLevel !== undefined ? override.headingLevel : base.headingLevel,
  };
}

/**
 * Hợp nhất đè thuộc tính character: chỉ các thuộc tính khác undefined mới ghi đè.
 */
function mergeCharacterProperties(
  base: ResolvedCharacterProperties,
  override?: Partial<ResolvedCharacterProperties>
): ResolvedCharacterProperties {
  if (!override) return { ...base };
  return {
    fontFamily: override.fontFamily !== undefined ? override.fontFamily : base.fontFamily,
    fontSize: override.fontSize !== undefined ? override.fontSize : base.fontSize,
    bold: override.bold !== undefined ? override.bold : base.bold,
    italic: override.italic !== undefined ? override.italic : base.italic,
    underline: override.underline !== undefined ? override.underline : base.underline,
    strike: override.strike !== undefined ? override.strike : base.strike,
    color: override.color !== undefined ? override.color : base.color,
    highlight: override.highlight !== undefined ? override.highlight : base.highlight,
  };
}

/**
 * Giải quyết một Style cụ thể theo cơ chế kế thừa nhiều cấp (Style Inheritance Resolution).
 *
 * Pipeline thứ bậc ưu tiên:
 *   System baseline/default
 *   → Inherited ancestor styles (từ gốc xa nhất đến gần nhất)
 *   → Current style definitions
 *
 * Nguyên tắc:
 * 1. Style con chỉ override các thuộc tính mà nó trực tiếp định nghĩa (khác undefined).
 * 2. Không thay đổi (immutability) bất kỳ đối tượng nguồn nào trong definitions.
 * 3. Chống chu trình vòng (Cycle Protection): nếu gặp A -> B -> A hoặc A -> A, ngắt vòng an toàn,
 *    áp dụng baseline Normal và giữ lại thuộc tính hợp lệ của style hiện tại, gắn cờ hasCycle.
 * 4. Style cha bị thiếu (Missing Parent): nếu basedOn không tồn tại, tự động fallback về Normal,
 *    bảo toàn định dạng của style hiện tại và gắn cờ hasBrokenParent.
 * 5. Kết quả hoàn toàn deterministic, không phụ thuộc vào thứ tự phần tử trong mảng definitions.
 */
export function resolveStyle(
  styleId: string,
  definitions: DocumentStyle[] | Map<string, DocumentStyle>,
  options?: StyleResolveOptions
): ResolvedDocumentStyle {
  const map = buildStyleMap(definitions);
  const target = map.get(styleId);

  // Xử lý khi chính styleId không tồn tại
  if (!target) {
    if (options?.strict) {
      throw new Error(`[StyleResolver] Không tìm thấy Style ID "${styleId}" trong tài liệu.`);
    }
    const fallbackId = options?.fallbackStyleId ?? STYLE_NORMAL_ID;
    const fallbackTarget = map.get(fallbackId);
    if (fallbackTarget && fallbackId !== styleId) {
      const resolvedFallback = resolveStyle(fallbackId, map, options);
      return {
        ...resolvedFallback,
        id: styleId,
        name: `(Thiếu: ${styleId})`,
        isMissingStyle: true,
      };
    }
    // Nếu cả fallback cũng không có, trả về hệ thống mặc định hoàn toàn
    return {
      id: styleId,
      name: `(Thiếu: ${styleId})`,
      type: "paragraph",
      basedOn: null,
      isBuiltIn: false,
      inheritanceChain: [styleId],
      paragraph: { ...SYSTEM_DEFAULT_PARAGRAPH_PROPERTIES },
      character: { ...SYSTEM_DEFAULT_CHARACTER_PROPERTIES },
      isMissingStyle: true,
    };
  }

  // Xây dựng chuỗi kế thừa từ con ngược lên cha (Bottom-up traversal)
  const chain: DocumentStyle[] = [target];
  const visited = new Set<string>([target.id]);
  const path: string[] = [target.id];

  let hasCycle = false;
  let cyclePath: string[] | undefined;
  let hasBrokenParent = false;
  let missingParentId: string | undefined;

  let current: DocumentStyle = target;

  while (current.basedOn) {
    const parentId = current.basedOn;

    // Phát hiện chu trình vòng
    if (visited.has(parentId)) {
      hasCycle = true;
      path.push(parentId);
      cyclePath = [...path];
      break;
    }

    const parent = map.get(parentId);
    // Phát hiện cha bị thiếu
    if (!parent) {
      hasBrokenParent = true;
      missingParentId = parentId;
      break;
    }

    visited.add(parentId);
    path.push(parentId);
    // Thêm cha vào đầu chuỗi kế thừa (để duyệt thuận Top-down từ tổ tiên xuống con)
    chain.unshift(parent);
    current = parent;
  }

  // Bắt đầu từ baseline mặc định của hệ thống
  let currentParagraph: ResolvedParagraphProperties = {
    ...SYSTEM_DEFAULT_PARAGRAPH_PROPERTIES,
  };
  let currentCharacter: ResolvedCharacterProperties = {
    ...SYSTEM_DEFAULT_CHARACTER_PROPERTIES,
  };

  // Duyệt xuôi từ ancestor xa nhất tới leaf style hiện tại
  for (const style of chain) {
    if (style.paragraph && target.type === "paragraph") {
      currentParagraph = mergeParagraphProperties(currentParagraph, style.paragraph);
    }
    if (style.character) {
      currentCharacter = mergeCharacterProperties(currentCharacter, style.character);
    }
  }

  const inheritanceChainIds = chain.map((s) => s.id);

  return {
    id: target.id,
    name: target.name,
    type: target.type,
    basedOn: target.basedOn ?? null,
    nextStyleId: target.nextStyleId ?? null,
    isBuiltIn: target.isBuiltIn,
    inheritanceChain: inheritanceChainIds,
    paragraph: target.type === "paragraph" ? currentParagraph : undefined,
    character: currentCharacter,
    hasCycle: hasCycle || undefined,
    cyclePath,
    hasBrokenParent: hasBrokenParent || undefined,
    missingParentId,
  };
}

/**
 * Giải quyết toàn bộ danh sách Style trong tài liệu một lần.
 * Trả về Map<styleId, ResolvedDocumentStyle>.
 */
export function resolveAllStyles(
  definitions: DocumentStyle[] | Map<string, DocumentStyle>,
  options?: StyleResolveOptions
): Map<string, ResolvedDocumentStyle> {
  const map = buildStyleMap(definitions);
  const resolvedMap = new Map<string, ResolvedDocumentStyle>();

  for (const styleId of map.keys()) {
    resolvedMap.set(styleId, resolveStyle(styleId, map, options));
  }

  return resolvedMap;
}
