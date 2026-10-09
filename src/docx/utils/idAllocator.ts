/**
 * Quản lý và cấp phát định danh duy nhất (Unique ID Allocators) cho các đối tượng OOXML:
 * - docPr IDs (DrawingML Object Non-Visual Properties ID)
 * - Bookmark IDs & Names (w:bookmarkStart / w:bookmarkEnd)
 * - Comment IDs (word/comments.xml)
 * - Track Changes IDs (w:ins / w:del)
 *
 * Ngăn chặn hoàn toàn lỗi Word Repair XML do trùng lặp hoặc mượn ID chéo giữa các hệ thống con.
 */

/**
 * Bộ cấp phát định danh DrawingML Non-visual Property ID (`wp:docPr id`)
 * Chuẩn OOXML yêu cầu docPr id là số nguyên dương duy nhất trong toàn bộ document.xml.
 */
export class DocPrIdAllocator {
  private counter: number;
  private usedIds = new Set<number>();

  constructor(startId: number = 1) {
    this.counter = Math.max(1, startId);
  }

  /**
   * Cấp phát một docPr ID mới duy nhất
   */
  public allocate(): number {
    while (this.usedIds.has(this.counter)) {
      this.counter++;
    }
    const id = this.counter++;
    this.usedIds.add(id);
    return id;
  }

  /**
   * Đăng ký ID đã có (tránh trùng lặp khi nạp tài liệu ngoại vi)
   */
  public register(id: number): void {
    this.usedIds.add(id);
    if (id >= this.counter) {
      this.counter = id + 1;
    }
  }

  /**
   * Sinh cặp thuộc tính docPr hoàn chỉnh với ID duy nhất và tên an toàn
   */
  public allocateDocPr(namePrefix = "Picture", descr = ""): { id: number; name: string; descr: string } {
    const id = this.allocate();
    const name = `${namePrefix} ${id}`;
    return {
      id,
      name,
      descr,
    };
  }

  public reset(): void {
    this.counter = 1;
    this.usedIds.clear();
  }
}

/**
 * Bộ cấp phát và chuẩn hóa Bookmark ID / Name
 */
export class BookmarkIdAllocator {
  private numericCounter = 0;
  private internalToNumericMap = new Map<string, number>();
  private internalToSafeNameMap = new Map<string, string>();
  private usedNamesLower = new Set<string>();

  constructor() {}

  /**
   * Lấy hoặc cấp phát numeric ID (0..N) cho một internal bookmark ID
   */
  public getNumericId(internalId: string): number {
    let id = this.internalToNumericMap.get(internalId);
    if (id === undefined) {
      id = this.numericCounter++;
      this.internalToNumericMap.set(internalId, id);
    }
    return id;
  }

  /**
   * Làm sạch và sinh tên bookmark an toàn chuẩn Word
   * (chỉ ký tự a-z, A-Z, 0-9, _, không dấu, bắt đầu bằng chữ cái hoặc _)
   */
  public getSafeXmlName(internalId: string, rawName?: string): string {
    const cached = this.internalToSafeNameMap.get(internalId);
    if (cached) return cached;

    let name = (rawName || "").trim();
    if (!name) name = "Bookmark";

    // Khử dấu tiếng Việt
    let safe = name
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/đ/g, "d")
      .replace(/Đ/g, "D")
      .replace(/[^a-zA-Z0-9_]/g, "_")
      .replace(/_+/g, "_");

    // Word yêu cầu tên bookmark phải bắt đầu bằng chữ cái hoặc gạch dưới
    if (!/^[a-zA-Z_]/.test(safe)) {
      safe = `bm_${safe}`;
    }

    // Giới hạn độ dài tối đa 40 ký tự theo chuẩn Word
    safe = safe.substring(0, 40);

    // Chống trùng lặp tên không phân biệt hoa thường
    let uniqueName = safe;
    let counter = 1;
    while (this.usedNamesLower.has(uniqueName.toLowerCase())) {
      uniqueName = `${safe}_${counter++}`;
    }

    this.usedNamesLower.add(uniqueName.toLowerCase());
    this.internalToSafeNameMap.set(internalId, uniqueName);

    return uniqueName;
  }

  public reset(): void {
    this.numericCounter = 0;
    this.internalToNumericMap.clear();
    this.internalToSafeNameMap.clear();
    this.usedNamesLower.clear();
  }
}

/**
 * Bộ cấp phát định danh Comment OOXML ID
 */
export class CommentIdAllocator {
  private counter = 0;
  private internalToOoxmlIdMap = new Map<string, string>();
  private usedOoxmlIds = new Set<string>();

  constructor() {}

  /**
   * Cấp phát hoặc lấy OOXML ID dạng chuỗi số cho một CommentItem
   */
  public allocate(internalId: string, preferredId?: string): string {
    const existing = this.internalToOoxmlIdMap.get(internalId);
    if (existing) return existing;

    let targetId = preferredId;
    if (!targetId || this.usedOoxmlIds.has(targetId)) {
      while (this.usedOoxmlIds.has(String(this.counter))) {
        this.counter++;
      }
      targetId = String(this.counter++);
    }

    this.usedOoxmlIds.add(targetId);
    this.internalToOoxmlIdMap.set(internalId, targetId);
    return targetId;
  }

  public getOoxmlId(internalId: string): string | undefined {
    return this.internalToOoxmlIdMap.get(internalId);
  }

  public reset(): void {
    this.counter = 0;
    this.internalToOoxmlIdMap.clear();
    this.usedOoxmlIds.clear();
  }
}
