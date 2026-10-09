/**
 * Định nghĩa kiểu dữ liệu cho hệ thống OMML Equation Fidelity (Phase 5)
 */

export interface OmmlParseResult {
  /** Chuỗi LaTeX chuẩn hóa trích xuất từ OMML */
  latex: string;
  /** Chế độ hiển thị riêng biệt một dòng (true) hay nội dòng (false) */
  displayMode: boolean;
  /** Căn lề của phương trình */
  alignment: "left" | "center" | "right";
  /** Cảnh báo khả năng tương thích phát sinh trong quá trình chuyển đổi */
  warnings: string[];
}

export interface OmmlExportOptions {
  /** Hiển thị dạng khối tách biệt (m:oMathPara) hay nội dòng (m:oMath) */
  displayMode?: boolean;
  /** Căn lề của phương trình */
  alignment?: "left" | "center" | "right";
}

export interface OmmlExportResult {
  /** Chuỗi XML OOXML (m:oMath hoặc m:oMathPara) */
  xml: string;
  /** Đánh dấu biểu thức có nằm hoàn toàn trong tập tính năng OMML được hỗ trợ không */
  isSupported: boolean;
  /** Danh sách cảnh báo tương thích */
  warnings: string[];
}
