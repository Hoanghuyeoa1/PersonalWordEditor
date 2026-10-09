import type { DocxRelationshipItem } from "../mapping/documentSerializer.ts";
import { getPackageRelationshipsNamespace } from "../constants/ooxmlNamespaces.ts";

export type RelationshipScope =
  | "document"
  | "root"
  | `header:${string}`
  | `footer:${string}`
  | `part:${string}`;

/**
 * Bộ cấp phát định danh mối quan hệ (Relationship ID Allocator) có phân vùng (Scoped).
 * Đảm bảo:
 * - Không xung đột rId giữa các part khác nhau (ví dụ: header có chuỗi rId riêng, không phụ thuộc document).
 * - Tự động tái sử dụng rId nếu có cùng (type, target, targetMode) trong cùng scope.
 * - Khởi tạo từ danh sách quan hệ có sẵn nếu cần bảo toàn ID gốc từ OOXML.
 */
export class RelationshipAllocator {
  private scopeCounters = new Map<string, number>();
  private scopeRelationships = new Map<string, DocxRelationshipItem[]>();
  private scopeDeduplication = new Map<string, Map<string, string>>(); // scope -> (cacheKey -> rId)

  constructor() {}

  /**
   * Tạo khóa duy nhất cho mục đích chống trùng lặp quan hệ
   */
  private makeCacheKey(type: string, target: string, targetMode?: "External"): string {
    return `${type}|${target}|${targetMode || "Internal"}`;
  }

  /**
   * Cấp phát hoặc tái sử dụng một Relationship ID trong phạm vi chỉ định
   */
  public allocate(
    scope: RelationshipScope,
    type: string,
    target: string,
    targetMode?: "External"
  ): string {
    if (!this.scopeRelationships.has(scope)) {
      this.scopeRelationships.set(scope, []);
      this.scopeCounters.set(scope, 1);
      this.scopeDeduplication.set(scope, new Map());
    }

    const dedupMap = this.scopeDeduplication.get(scope)!;
    const cacheKey = this.makeCacheKey(type, target, targetMode);

    // Tái sử dụng rId nếu quan hệ giống hệt đã tồn tại trong scope này
    if (dedupMap.has(cacheKey)) {
      return dedupMap.get(cacheKey)!;
    }

    // Sinh ID mới
    const currentCounter = this.scopeCounters.get(scope) || 1;
    const rId = `rId${currentCounter}`;
    this.scopeCounters.set(scope, currentCounter + 1);

    const relItem: DocxRelationshipItem = {
      id: rId,
      type,
      target,
      ...(targetMode ? { targetMode } : {}),
    };

    this.scopeRelationships.get(scope)!.push(relItem);
    dedupMap.set(cacheKey, rId);

    return rId;
  }

  /**
   * Nạp trước các quan hệ đã có (dùng khi đọc file gốc hoặc muốn giữ ID cố định)
   */
  public registerExisting(scope: RelationshipScope, item: DocxRelationshipItem): void {
    if (!this.scopeRelationships.has(scope)) {
      this.scopeRelationships.set(scope, []);
      this.scopeCounters.set(scope, 1);
      this.scopeDeduplication.set(scope, new Map());
    }

    const rels = this.scopeRelationships.get(scope)!;
    const dedupMap = this.scopeDeduplication.get(scope)!;
    const cacheKey = this.makeCacheKey(item.type, item.target, item.targetMode);

    rels.push(item);
    dedupMap.set(cacheKey, item.id);

    // Cập nhật counter nếu rId có dạng rId<Number>
    const match = item.id.match(/^rId(\d+)$/);
    if (match) {
      const num = parseInt(match[1], 10);
      const cur = this.scopeCounters.get(scope) || 1;
      if (num >= cur) {
        this.scopeCounters.set(scope, num + 1);
      }
    }
  }

  /**
   * Lấy danh sách quan hệ của một scope
   */
  public getRelationships(scope: RelationshipScope): DocxRelationshipItem[] {
    return this.scopeRelationships.get(scope) || [];
  }

  /**
   * Lấy danh sách tất cả các scopes hiện có quan hệ
   */
  public getAllScopes(): RelationshipScope[] {
    return Array.from(this.scopeRelationships.keys()) as RelationshipScope[];
  }

  /**
   * Kiểm tra xem một scope có quan hệ nào không
   */
  public hasRelationships(scope: RelationshipScope): boolean {
    const list = this.scopeRelationships.get(scope);
    return Boolean(list && list.length > 0);
  }

  /**
   * Xây dựng nội dung tệp .rels hoàn chỉnh cho một scope
   */
  public buildRelsXml(scope: RelationshipScope): string {
    const rels = this.getRelationships(scope);
    if (rels.length === 0) {
      return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships ${getPackageRelationshipsNamespace()}/>`;
    }

    const relItems = rels.map((rel) => {
      const targetModeAttr = rel.targetMode ? ` TargetMode="${rel.targetMode}"` : "";
      return `  <Relationship Id="${rel.id}" Type="${rel.type}" Target="${rel.target}"${targetModeAttr}/>`;
    });

    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships ${getPackageRelationshipsNamespace()}>
${relItems.join("\n")}
</Relationships>`;
  }

  /**
   * Đặt lại trạng thái toàn bộ bộ cấp phát
   */
  public clear(): void {
    this.scopeCounters.clear();
    this.scopeRelationships.clear();
    this.scopeDeduplication.clear();
  }
}
