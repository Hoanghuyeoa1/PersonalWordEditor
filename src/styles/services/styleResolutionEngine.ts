import type { DocumentStyle } from "../types/styleTypes.ts";
import type { ResolvedDocumentStyle } from "../types/styleResolutionTypes.ts";
import { resolveStyle, collectDescendants } from "./styleResolver.ts";

/**
 * Lớp điều phối bộ nhớ đệm giải quyết kiểu dáng (Style Resolution Engine with Targeted Cache).
 *
 * Tính năng chính:
 * 1. Cache kết quả ResolvedDocumentStyle theo styleId để tránh tính toán lại trên mỗi thao tác/render.
 * 2. Invalidation cục bộ (Targeted Invalidation): khi Style A thay đổi, chỉ xóa cache của A và toàn bộ
 *    các Style hậu duệ kế thừa từ A (descendants của A). Các style độc lập không liên quan được giữ nguyên.
 * 3. Hoàn toàn không tạo trạng thái biến đổi toàn cục ngầm (no global hidden mutable state).
 */
export class StyleResolutionEngine {
  private definitions: DocumentStyle[];
  private cache: Map<string, ResolvedDocumentStyle> = new Map();

  constructor(definitions: DocumentStyle[] = []) {
    this.definitions = definitions;
  }

  /**
   * Cập nhật danh sách definitions mới của tài liệu và làm mới cache.
   */
  setDefinitions(definitions: DocumentStyle[]): void {
    this.definitions = definitions;
    this.clearCache();
  }

  /**
   * Trả về danh sách definitions hiện tại.
   */
  getDefinitions(): DocumentStyle[] {
    return this.definitions;
  }

  /**
   * Lấy Style đã giải quyết từ cache hoặc tính toán qua resolver thuần túy và ghi nhớ vào cache.
   */
  getResolvedStyle(styleId: string): ResolvedDocumentStyle {
    const cached = this.cache.get(styleId);
    if (cached) {
      return cached;
    }

    const resolved = resolveStyle(styleId, this.definitions);
    this.cache.set(styleId, resolved);
    return resolved;
  }

  /**
   * Invalidate một Style cụ thể cùng toàn bộ hậu duệ (descendants) phụ thuộc vào nó.
   * Trả về danh sách các styleId đã bị loại khỏi cache.
   */
  invalidateStyle(styleId: string): string[] {
    const descendants = collectDescendants(styleId, this.definitions);
    const affected = [styleId, ...descendants];

    for (const id of affected) {
      this.cache.delete(id);
    }

    return affected;
  }

  /**
   * Xóa toàn bộ cache hiện tại (khi nạp tài liệu mới hoặc cập nhật hàng loạt).
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Kiểm tra xem một styleId đã được lưu trong cache hay chưa.
   */
  hasCached(styleId: string): boolean {
    return this.cache.has(styleId);
  }

  /**
   * Trả về số lượng style hiện đang nằm trong cache.
   */
  getCacheSize(): number {
    return this.cache.size;
  }
}
