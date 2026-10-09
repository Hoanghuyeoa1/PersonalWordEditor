import type { DocumentStyleType } from "./styleTypes.ts";

/**
 * Thuộc tính đoạn văn đã được giải quyết kế thừa đầy đủ (không còn giá trị undefined cho các thuộc tính cốt lõi).
 */
export interface ResolvedParagraphProperties {
  /** Căn lề ngang: left, center, right, justify */
  textAlign: "left" | "center" | "right" | "justify";
  /** Độ giãn dòng (chuỗi như "1.15" hoặc số tỉ lệ) */
  lineSpacing: string | number;
  /** Khoảng cách phía trên đoạn văn (points / pt) */
  spacingBefore: number;
  /** Khoảng cách phía dưới đoạn văn (points / pt) */
  spacingAfter: number;
  /** Thụt lề trái (mức 0..8 hoặc pt) */
  leftIndent: number;
  /** Thụt lề phải (pt) */
  rightIndent: number;
  /** Thụt lề dòng đầu tiên (pt) */
  firstLineIndent: number;
  /** Nhô lề dòng đầu (pt) */
  hangingIndent: number;
  /** Giữ liền trang với đoạn kế tiếp */
  keepWithNext: boolean;
  /** Giữ các dòng trong đoạn cùng một trang */
  keepLinesTogether: boolean;
  /** Bắt đầu đoạn văn ở đầu trang mới */
  pageBreakBefore: boolean;
  /** Kiểm soát dòng đơn độc (Widow/Orphan control) */
  widowControl: boolean;
  /** Cấp độ đề mục ngữ nghĩa (1 | 2 | 3) nếu gắn với Heading */
  headingLevel?: 1 | 2 | 3;
}

/**
 * Thuộc tính ký tự đã được giải quyết kế thừa đầy đủ.
 */
export interface ResolvedCharacterProperties {
  /** Tên phông chữ */
  fontFamily: string;
  /** Cỡ chữ (pt) */
  fontSize: number | string;
  /** Chữ in đậm */
  bold: boolean;
  /** Chữ in nghiêng */
  italic: boolean;
  /** Gạch chân */
  underline: boolean;
  /** Gạch ngang chữ */
  strike: boolean;
  /** Màu chữ (hex hoặc rgb) */
  color: string;
  /** Màu nền highlight */
  highlight?: string;
}

/**
 * Kết quả giải quyết Style sau khi hợp nhất toàn bộ chuỗi kế thừa (Inheritance Chain).
 */
export interface ResolvedDocumentStyle {
  /** Định danh của Style */
  id: string;
  /** Tên hiển thị người dùng */
  name: string;
  /** Kiểu loại Style: "paragraph" hoặc "character" */
  type: DocumentStyleType;
  /** ID của Style cơ sở trực tiếp */
  basedOn: string | null;
  /** Style kế tiếp khi gõ phím Enter */
  nextStyleId?: string | null;
  /** Cờ đánh dấu Style hệ thống */
  isBuiltIn: boolean;
  /** Chuỗi ID các Style tổ tiên từ gốc tới Style hiện tại */
  inheritanceChain: string[];
  /** Thuộc tính paragraph đã hợp nhất (đầy đủ cho paragraph style, undefined cho character style) */
  paragraph?: ResolvedParagraphProperties;
  /** Thuộc tính character đã hợp nhất */
  character: ResolvedCharacterProperties;
  /** Cờ đánh dấu phát hiện chu trình kế thừa vòng */
  hasCycle?: boolean;
  /** Chi tiết đường dẫn chu trình vòng nếu có (VD: ["A", "B", "A"]) */
  cyclePath?: string[];
  /** Cờ đánh dấu Style cha (basedOn) bị thiếu / không tìm thấy */
  hasBrokenParent?: boolean;
  /** ID của Style cha bị thiếu nếu có */
  missingParentId?: string;
  /** Cờ đánh dấu chính Style này không tồn tại trong definitions (phải dùng fallback) */
  isMissingStyle?: boolean;
}

/**
 * Tùy chọn cấu hình khi giải quyết Style.
 */
export interface StyleResolveOptions {
  /** Ném ngoại lệ khi gặp lỗi thay vì áp dụng fallback an toàn (mặc định: false) */
  strict?: boolean;
  /** ID của Style dùng làm fallback an toàn (mặc định: "style_normal") */
  fallbackStyleId?: string;
}

/**
 * Kết quả kiểm tra chu trình vòng kế thừa.
 */
export interface CycleDetectionResult {
  hasCycle: boolean;
  cyclePath?: string[];
}
