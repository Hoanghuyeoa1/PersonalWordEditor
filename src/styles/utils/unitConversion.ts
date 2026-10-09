/**
 * Tiện ích chuyển đổi đơn vị đo lường và xác thực khoảng cách, thụt lề cho Styles Engine 2.0.
 *
 * Tiêu chuẩn Typography:
 * 1 inch = 72 points (pt) = 2.54 cm
 * 1 cm = 72 / 2.54 ≈ 28.3465 pt
 * 1 point = 1.3333 px (tại 96 DPI tiêu chuẩn hiển thị màn hình)
 * 1 indent level (Word preset) = 0.5 inch = 36 pt
 */

export const PT_PER_INCH = 72;
export const CM_PER_INCH = 2.54;
export const PT_PER_CM = PT_PER_INCH / CM_PER_INCH; // ~28.3464567
export const PT_PER_INDENT_LEVEL = 36; // 0.5 inch
export const PX_PER_PT = 96 / 72; // 4/3 ≈ 1.3333

/**
 * Chuyển đổi Points (pt) sang Centimeters (cm).
 */
export function ptToCm(pt: number): number {
  if (!isFinite(pt)) return 0;
  return Number((pt / PT_PER_CM).toFixed(3));
}

/**
 * Chuyển đổi Centimeters (cm) sang Points (pt).
 */
export function cmToPt(cm: number): number {
  if (!isFinite(cm)) return 0;
  return Number((cm * PT_PER_CM).toFixed(1));
}

/**
 * Chuyển đổi Points sang Inches.
 */
export function ptToInch(pt: number): number {
  if (!isFinite(pt)) return 0;
  return Number((pt / PT_PER_INCH).toFixed(3));
}

/**
 * Chuyển đổi Inches sang Points.
 */
export function inchToPt(inch: number): number {
  if (!isFinite(inch)) return 0;
  return Number((inch * PT_PER_INCH).toFixed(1));
}

/**
 * Chuyển đổi Points sang Pixels (màn hình).
 */
export function ptToPx(pt: number): number {
  if (!isFinite(pt)) return 0;
  return Math.round(pt * PX_PER_PT);
}

/**
 * Xác thực và kẹp khoảng cách đoạn văn (Spacing Before / After):
 * - Phải là số hữu hạn
 * - Không âm (>= 0)
 * - Tối đa 500 pt
 */
export function validateAndClampSpacing(
  value: unknown,
  min = 0,
  max = 500
): number | null {
  if (value === null || value === undefined) return null;
  const num = typeof value === "number" ? value : parseFloat(String(value));
  if (isNaN(num) || !isFinite(num)) return null;
  const clamped = Math.max(min, Math.min(max, num));
  return Number(clamped.toFixed(1));
}

/**
 * Xác thực và kẹp mức thụt lề (Left / Right / First-line / Hanging Indent):
 * - Phải là số hữu hạn
 * - Không âm (>= 0)
 * - Tối đa 1000 pt
 */
export function validateAndClampIndent(
  value: unknown,
  min = 0,
  max = 1000
): number | null {
  if (value === null || value === undefined) return null;
  const num = typeof value === "number" ? value : parseFloat(String(value));
  if (isNaN(num) || !isFinite(num)) return null;
  const clamped = Math.max(min, Math.min(max, num));
  return Number(clamped.toFixed(1));
}

/**
 * Kiểm tra và giải quyết xung đột giữa First Line Indent và Hanging Indent.
 * Trong Word, firstLineIndent và hangingIndent là 2 trạng thái loại trừ nhau:
 * - Nếu firstLineIndent > 0 thì hangingIndent = 0.
 * - Nếu hangingIndent > 0 thì firstLineIndent = 0.
 */
export function normalizeFirstLineAndHanging(
  firstLineIndent?: number | null,
  hangingIndent?: number | null
): { firstLineIndent: number; hangingIndent: number } {
  const fl = validateAndClampIndent(firstLineIndent) || 0;
  const hg = validateAndClampIndent(hangingIndent) || 0;

  if (hg > 0 && fl === 0) {
    return { firstLineIndent: 0, hangingIndent: hg };
  }
  if (fl > 0) {
    return { firstLineIndent: fl, hangingIndent: 0 };
  }
  return { firstLineIndent: 0, hangingIndent: 0 };
}
