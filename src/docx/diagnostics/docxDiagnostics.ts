/**
 * Mô hình chuẩn đoán tương thích OOXML (Compatibility Diagnostics Model)
 *
 * Phân loại có cấu trúc các sự kiện xử lý đối tượng OOXML:
 * - preserved: Đối tượng được bảo toàn hoàn toàn (hoặc qua raw hook)
 * - approximated: Đối tượng được chuyển đổi xấp xỉ an toàn (vd moveTo -> insert)
 * - unsupported: Đối tượng chưa hỗ trợ nhưng có fallback bảo toàn văn bản
 * - ignoredSafely: Bỏ qua an toàn không ảnh hưởng nội dung (vd rPrChange)
 * - warning: Cảnh báo cần lưu ý
 */

export type DocxDiagnosticSeverity = "info" | "warning" | "error";

export type DocxDiagnosticStatus =
  | "preserved"
  | "approximated"
  | "unsupported"
  | "ignoredSafely"
  | "warning";

export interface DocxDiagnosticItem {
  /** Mã định danh chuẩn đoán duy nhất (vd: "OMML_CONVERTED_TEXT", "MOVE_TO_INSERT") */
  code: string;
  /** Tên phân hệ hoặc tính năng liên quan (vd: "Equation", "Shape", "TrackChanges", "Table") */
  feature: string;
  /** Trạng thái phân loại xử lý */
  status: DocxDiagnosticStatus;
  /** Mức độ nghiêm trọng */
  severity: DocxDiagnosticSeverity;
  /** Thông điệp ngắn gọn, thân thiện hiển thị cho người dùng */
  userMessage: string;
  /** Chi tiết kỹ thuật bổ sung (tên thẻ XML, thuộc tính, vị trí) để debug/report */
  technicalDetails?: string;
}

export interface DiagnosticsSummary {
  total: number;
  preserved: number;
  approximated: number;
  unsupported: number;
  ignoredSafely: number;
  warnings: number;
  errors: number;
}

/**
 * Lớp quản lý thu thập và báo cáo chuẩn đoán tương thích
 */
export class DocxDiagnosticsReporter {
  private items: DocxDiagnosticItem[] = [];

  constructor() {}

  /**
   * Thêm một mục chuẩn đoán mới
   */
  public add(item: DocxDiagnosticItem): void {
    this.items.push(item);
  }

  /**
   * Tiện ích ghi nhận trường hợp đối tượng được bảo toàn
   */
  public recordPreserved(feature: string, code: string, message: string, details?: string): void {
    this.add({
      code,
      feature,
      status: "preserved",
      severity: "info",
      userMessage: message,
      technicalDetails: details,
    });
  }

  /**
   * Tiện ích ghi nhận trường hợp chuyển đổi xấp xỉ an toàn
   */
  public recordApproximated(feature: string, code: string, message: string, details?: string): void {
    this.add({
      code,
      feature,
      status: "approximated",
      severity: "warning",
      userMessage: message,
      technicalDetails: details,
    });
  }

  /**
   * Tiện ích ghi nhận tính năng chưa hỗ trợ nhưng đã fallback an toàn
   */
  public recordUnsupported(feature: string, code: string, message: string, details?: string): void {
    this.add({
      code,
      feature,
      status: "unsupported",
      severity: "warning",
      userMessage: message,
      technicalDetails: details,
    });
  }

  /**
   * Tiện ích ghi nhận thuộc tính được bỏ qua an toàn không gây tổn thất
   */
  public recordIgnoredSafely(feature: string, code: string, message: string, details?: string): void {
    this.add({
      code,
      feature,
      status: "ignoredSafely",
      severity: "info",
      userMessage: message,
      technicalDetails: details,
    });
  }

  /**
   * Lấy toàn bộ danh sách các mục chuẩn đoán
   */
  public getItems(): readonly DocxDiagnosticItem[] {
    return this.items;
  }

  /**
   * Lọc các mục theo trạng thái
   */
  public getItemsByStatus(status: DocxDiagnosticStatus): DocxDiagnosticItem[] {
    return this.items.filter((i) => i.status === status);
  }

  /**
   * Lấy bảng tóm tắt số liệu chuẩn đoán
   */
  public getSummary(): DiagnosticsSummary {
    const summary: DiagnosticsSummary = {
      total: this.items.length,
      preserved: 0,
      approximated: 0,
      unsupported: 0,
      ignoredSafely: 0,
      warnings: 0,
      errors: 0,
    };

    for (const item of this.items) {
      if (item.status === "preserved") summary.preserved++;
      else if (item.status === "approximated") summary.approximated++;
      else if (item.status === "unsupported") summary.unsupported++;
      else if (item.status === "ignoredSafely") summary.ignoredSafely++;
      else if (item.status === "warning") summary.warnings++;

      if (item.severity === "error") summary.errors++;
      else if (item.severity === "warning" && item.status !== "warning") summary.warnings++;
    }

    return summary;
  }

  /**
   * Trích xuất danh sách thông điệp cảnh báo thân thiện để tương thích với warnings: string[]
   * Loại bỏ trùng lặp và không chứa XML technical spam
   */
  public toUserWarnings(): string[] {
    const unique = new Set<string>();
    for (const item of this.items) {
      if (item.severity === "warning" || item.severity === "error") {
        if (item.userMessage) {
          unique.add(item.userMessage);
        }
      }
    }
    return Array.from(unique);
  }

  public clear(): void {
    this.items = [];
  }

  /**
   * Tạo báo cáo tương thích (Compatibility Report) có cấu trúc, thân thiện với người dùng
   * Phân loại thành: Preserved, Approximated, Unsupported, Ignored Safely
   * Hoàn toàn không chứa technical XML spam.
   */
  public generateReport(): DocxCompatibilityReport {
    const summary = this.getSummary();
    const preserved = Array.from(new Set(this.getItemsByStatus("preserved").map((i) => i.userMessage)));
    const approximated = Array.from(new Set(this.getItemsByStatus("approximated").map((i) => i.userMessage)));
    const unsupported = Array.from(new Set(this.getItemsByStatus("unsupported").map((i) => i.userMessage)));
    const ignoredSafely = Array.from(new Set(this.getItemsByStatus("ignoredSafely").map((i) => i.userMessage)));

    const lines: string[] = [
      "=== BÁO CÁO TƯƠNG THÍCH TÀI LIỆU (COMPATIBILITY REPORT) ===",
      `Tổng số mục xử lý: ${summary.total}`,
      `- Bảo toàn (Preserved): ${summary.preserved}`,
      `- Chuyển đổi xấp xỉ an toàn (Approximated): ${summary.approximated}`,
      `- Chưa hỗ trợ (Unsupported): ${summary.unsupported}`,
      `- Bỏ qua an toàn (Ignored safely): ${summary.ignoredSafely}`,
    ];

    if (unsupported.length > 0) {
      lines.push("\n[Tính năng chưa hỗ trợ - Đã bảo vệ an toàn]");
      unsupported.forEach((msg) => lines.push(`• ${msg}`));
    }
    if (approximated.length > 0) {
      lines.push("\n[Chuyển đổi xấp xỉ an toàn]");
      approximated.forEach((msg) => lines.push(`• ${msg}`));
    }
    if (preserved.length > 0) {
      lines.push("\n[Đối tượng được bảo toàn]");
      preserved.forEach((msg) => lines.push(`• ${msg}`));
    }
    if (ignoredSafely.length > 0) {
      lines.push("\n[Thuộc tính bỏ qua an toàn]");
      ignoredSafely.forEach((msg) => lines.push(`• ${msg}`));
    }

    return {
      summary,
      preserved,
      approximated,
      unsupported,
      ignoredSafely,
      formattedText: lines.join("\n"),
    };
  }
}

export interface DocxCompatibilityReport {
  summary: DiagnosticsSummary;
  preserved: string[];
  approximated: string[];
  unsupported: string[];
  ignoredSafely: string[];
  formattedText: string;
}
