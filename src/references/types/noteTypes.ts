/**
 * Note Types - Personal Word Editor (Phase 6.4 Architecture)
 *
 * Định nghĩa hệ thống kiểu dữ liệu cho chú thích ngữ nghĩa:
 * - Footnote (Chú thích chân trang)
 * - Endnote (Chú thích cuối bài / cuối tài liệu)
 */

export type NoteType = "footnote" | "endnote";

/**
 * Bản ghi dữ liệu một chú thích được trích xuất từ AST
 */
export interface NoteItem {
  /** Định danh duy nhất, ổn định của chú thích (VD: "ref_fn_123456" hoặc "ref_en_789abc") */
  id: string;
  /** Loại chú thích */
  type: NoteType;
  /** Số thứ tự liên tục trong tài liệu (1-indexed: 1, 2, 3...) */
  number: number;
  /** Nhãn hiển thị ("1", "2", "3"... cho Footnote; "i", "ii", "iii"... cho Endnote) */
  label: string;
  /** Nội dung ngữ nghĩa của chú thích */
  content: string;
  /** Vị trí bắt đầu của marker trong ProseMirror AST (nếu có) */
  pos?: number;
  /** Ký hiệu tùy chỉnh nếu người dùng gán riêng (mặc định undefined) */
  customMark?: string;
  /** Thời điểm tạo (ISO string) */
  createdAt?: string;
  /** Thời điểm cập nhật gần nhất (ISO string) */
  updatedAt?: string;
}

/**
 * Thuộc tính của inline atom node `noteReference` trong ProseMirror AST
 */
export interface NoteReferenceAttrs {
  /** Định danh duy nhất của chú thích */
  noteId: string;
  /** Loại chú thích: footnote hoặc endnote */
  noteType: NoteType;
  /** Nội dung văn bản của chú thích */
  content: string;
  /** Ký hiệu tùy chỉnh (nếu có) */
  customMark?: string;
}

/**
 * Chuyển đổi số nguyên dương sang chữ số La Mã viết thường (cho Endnote chuẩn Word: i, ii, iii, iv, v...)
 */
export function toRomanNumeral(num: number): string {
  if (num <= 0) return String(num);
  const romanMap: [number, string][] = [
    [1000, "m"],
    [900, "cm"],
    [500, "d"],
    [400, "cd"],
    [100, "c"],
    [90, "xc"],
    [50, "l"],
    [40, "xl"],
    [10, "x"],
    [9, "ix"],
    [5, "v"],
    [4, "iv"],
    [1, "i"],
  ];

  let result = "";
  let remainder = num;

  for (const [val, roman] of romanMap) {
    while (remainder >= val) {
      result += roman;
      remainder -= val;
    }
  }

  return result;
}

/**
 * Định dạng nhãn hiển thị cho chú thích theo quy ước chuẩn:
 * - Footnote: 1, 2, 3...
 * - Endnote: i, ii, iii, iv...
 */
export function formatNoteLabel(type: NoteType, num: number, customMark?: string): string {
  if (customMark && customMark.trim()) {
    return customMark.trim();
  }
  if (type === "endnote") {
    return toRomanNumeral(num);
  }
  return String(num);
}
