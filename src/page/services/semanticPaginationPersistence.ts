/**
 * PAGINATION ENGINE 2.0 — SEMANTIC PAGINATION PROPERTIES PERSISTENCE (PHASE 12)
 *
 * Đảm bảo:
 * 1. Tuyệt đối KHÔNG lưu trữ runtime layout fragments, pageIndex, DOM rects,
 *    line boundaries hay cached layout vào tệp .mwd.
 * 2. Bảo toàn 100% các thuộc tính ngữ nghĩa (keepWithNext, keepLinesTogether,
 *    pageBreakBefore, widowControl) cả ở cấp node attributes và DocumentStyle.
 * 3. Tương thích ngược với tệp .mwd cũ (áp dụng safe defaults, không migrate phá vỡ AST).
 * 4. Xử lý triệt để các giá trị hỏng/malformed (null, wrong type, NaN) bằng deterministic fallback,
 *    không bao giờ làm sập ứng dụng hay mất mát văn bản.
 */

import type { JSONContent } from "@tiptap/core";

/**
 * Danh sách các khóa thuộc tính runtime cấm lưu trữ vào tệp tài liệu
 */
export const FORBIDDEN_RUNTIME_LAYOUT_KEYS = [
  "pageIndex",
  "fragmentIndex",
  "fragmentId",
  "fragmentCoordinates",
  "fragmentBounds",
  "domRect",
  "calculatedPageCount",
  "runtimeLineBoundaries",
  "cachedLayout",
  "cachedHeight",
  "measuredHeight",
  "measuredLines",
  // Table Engine 2.0 runtime pagination & layout keys
  "tableFragments",
  "tableMetadata",
  "hasRepeatedHeader",
  "visualRepeatedHeader",
  "isRepeatedHeader",
  "runtimeTableMap",
  "tableMapCache",
  "tablePage",
  "rowPage",
  "isFragment",
  "measuredRowHeights",
] as const;

/**
 * Danh sách các thuộc tính phân trang ngữ nghĩa hợp lệ trên block node
 */
export const SEMANTIC_PAGINATION_KEYS = [
  "keepWithNext",
  "keepLinesTogether",
  "pageBreakBefore",
  "widowControl",
] as const;

export type SemanticPaginationKey = (typeof SEMANTIC_PAGINATION_KEYS)[number];

/**
 * Chuẩn hóa một giá trị boolean ngữ nghĩa từ dữ liệu đầu vào có thể bị hỏng (malformed)
 */
export function sanitizeBooleanAttribute(
  value: unknown,
  defaultValue?: boolean
): boolean | undefined {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const trimmed = value.trim().toLowerCase();
    if (trimmed === "true") return true;
    if (trimmed === "false") return false;
  }

  if (typeof value === "number" && !Number.isNaN(value)) {
    if (value === 1) return true;
    if (value === 0) return false;
  }

  return defaultValue;
}

/**
 * Làm sạch và chuẩn hóa toàn bộ thuộc tính phân trang ngữ nghĩa trong cây AST
 * Đồng thời loại bỏ triệt để mọi thuộc tính runtime bị rò rỉ.
 */
export function sanitizeSemanticPaginationAttributes(node: JSONContent): JSONContent {
  if (!node || typeof node !== "object") {
    return node;
  }

  const newNode: JSONContent = { ...node };

  if (newNode.attrs && typeof newNode.attrs === "object") {
    const cleanAttrs: Record<string, unknown> = { ...newNode.attrs };

    // 1. Loại bỏ toàn bộ các thuộc tính runtime bị rò rỉ
    for (const forbiddenKey of FORBIDDEN_RUNTIME_LAYOUT_KEYS) {
      if (forbiddenKey in cleanAttrs) {
        delete cleanAttrs[forbiddenKey];
      }
    }

    // pageNumber chỉ hợp lệ trên crossReference hoặc caption
    if (
      "pageNumber" in cleanAttrs &&
      newNode.type !== "crossReference" &&
      newNode.type !== "caption"
    ) {
      delete cleanAttrs.pageNumber;
    }

    // 2. Chuẩn hóa các thuộc tính ngữ nghĩa cho block paragraph / heading
    if (newNode.type === "paragraph" || newNode.type === "heading") {
      // keepWithNext
      if ("keepWithNext" in cleanAttrs) {
        const sanitized = sanitizeBooleanAttribute(cleanAttrs.keepWithNext);
        if (typeof sanitized === "boolean") {
          cleanAttrs.keepWithNext = sanitized;
        } else {
          delete cleanAttrs.keepWithNext;
        }
      }

      // keepLinesTogether
      if ("keepLinesTogether" in cleanAttrs) {
        const sanitized = sanitizeBooleanAttribute(cleanAttrs.keepLinesTogether);
        if (typeof sanitized === "boolean") {
          cleanAttrs.keepLinesTogether = sanitized;
        } else {
          delete cleanAttrs.keepLinesTogether;
        }
      }

      // pageBreakBefore
      if ("pageBreakBefore" in cleanAttrs) {
        const sanitized = sanitizeBooleanAttribute(cleanAttrs.pageBreakBefore);
        if (typeof sanitized === "boolean") {
          cleanAttrs.pageBreakBefore = sanitized;
        } else {
          delete cleanAttrs.pageBreakBefore;
        }
      }

      // widowControl
      if ("widowControl" in cleanAttrs) {
        const sanitized = sanitizeBooleanAttribute(cleanAttrs.widowControl);
        if (typeof sanitized === "boolean") {
          cleanAttrs.widowControl = sanitized;
        } else {
          delete cleanAttrs.widowControl;
        }
      }
    }

    newNode.attrs = cleanAttrs;
  }

  // 3. Đệ quy duyệt qua các node con
  if (Array.isArray(newNode.content)) {
    newNode.content = newNode.content.map(sanitizeSemanticPaginationAttributes);
  }

  return newNode;
}

/**
 * Kiểm tra xác thực tính an toàn của chuỗi JSON tuần tự hóa:
 * Đảm bảo 100% không chứa bất kỳ khóa runtime layout nào.
 */
export function validateNoRuntimeLayoutInPackage(packageData: unknown): {
  isValid: boolean;
  violations: string[];
} {
  const violations: string[] = [];

  const inspect = (obj: unknown, path: string) => {
    if (!obj || typeof obj !== "object") return;

    if (Array.isArray(obj)) {
      obj.forEach((item, idx) => inspect(item, `${path}[${idx}]`));
      return;
    }

    const record = obj as Record<string, unknown>;
    for (const key of Object.keys(record)) {
      if (FORBIDDEN_RUNTIME_LAYOUT_KEYS.includes(key as any)) {
        violations.push(`${path}.${key}`);
      }
      inspect(record[key], `${path}.${key}`);
    }
  };

  inspect(packageData, "root");

  return {
    isValid: violations.length === 0,
    violations,
  };
}
