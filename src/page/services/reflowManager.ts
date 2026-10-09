/**
 * PAGINATION ENGINE 2.0 — INCREMENTAL REFLOW & PERFORMANCE ARCHITECTURE (PHASE 11)
 *
 * Quản lý dirty range, cache đạc đạc (measurement cache), convergence detection,
 * RAF batching, ResizeObserver dedupe và convergence guard (bảo vệ chống vòng lặp vô tận).
 *
 * Nguyên tắc:
 * 1. Correctness trước Optimization.
 * 2. Không làm thay đổi semantics của tài liệu hoặc AST.
 * 3. Bảo toàn stable layout trước dirty range.
 * 4. Khử nhiễu các tương tác phi-layout (comment selection, hover, toolbar).
 */

import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { PageLayoutMap } from "./pageLayoutMap.ts";
import type { RenderedLineBox } from "./lineMeasurementService.ts";

export type ReflowScope = "block" | "section" | "document";

/**
 * Bản ghi phạm vi dơ (Dirty Range) cần tính toán lại layout
 */
export interface DirtyRange {
  /** Vị trí bắt đầu sớm nhất bị ảnh hưởng trong ProseMirror doc (0-indexed) */
  fromPos: number;
  /** Vị trí kết thúc của biến đổi (nếu biết) */
  toPos?: number;
  /** Phạm vi tác động: block cục bộ, toàn bộ section, hoặc toàn bộ document */
  scope: ReflowScope;
  /** Lý do gây dirty để phục vụ diagnostics và dev logs */
  reason?: string;
}

/**
 * Chỉ số đo đạc hiệu năng và chẩn đoán phân trang (Development Diagnostics)
 */
export interface ReflowDiagnostics {
  /** Thời gian thực thi đợt reflow gần nhất (ms) */
  lastDurationMs: number;
  /** Phạm vi dirty range được xử lý */
  dirtyRange: DirtyRange | null;
  /** Số lượng layout passes đã thực hiện */
  layoutPassCount: number;
  /** Số block thực sự phải gọi DOM remeasure */
  blocksRemeasured: number;
  /** Tổng số block trong tài liệu */
  totalBlocks: number;
  /** Tỷ lệ tái sử dụng cache đo đạc (0.0 đến 1.0) */
  cacheHitRate: number;
  /** Layout có đạt trạng thái hội tụ (convergence) không */
  converged: boolean;
  /** Thời điểm thực hiện (epoch ms) */
  timestamp: number;
}

/**
 * Giới hạn tối đa số lần layout pass trong một chu kỳ reflow (Convergence Guard)
 * Ngăn chặn tuyệt đối hiện tượng feedback loop gây đóng băng trình duyệt.
 */
export const MAX_LAYOUT_PASSES = 3;

/**
 * Quản lý quy trình tính toán phân trang tăng dần (Incremental Reflow Manager)
 */
export class ReflowManager {
  /** Cache đo đạc dòng văn bản của các block paragraph */
  private blockLinesCache = new Map<number, RenderedLineBox[]>();
  /** Cache chiều cao đo đạc của các hàng trong table */
  private tableRowsCache = new Map<number, number>();

  /** Phạm vi dirty đang chờ xử lý */
  private pendingDirtyRange: DirtyRange | null = null;
  /** Bản chụp layout map ổn định gần nhất */
  private lastStableLayout: PageLayoutMap | null = null;

  /** Cờ đánh dấu layout đang trong quá trình apply vào DOM (để chặn ResizeObserver loop) */
  private isApplyingLayout = false;
  /** Bộ đếm layout pass hiện tại */
  private currentPassCount = 0;

  /** Thông số chẩn đoán hiệu năng gần nhất */
  private diagnostics: ReflowDiagnostics = {
    lastDurationMs: 0,
    dirtyRange: null,
    layoutPassCount: 0,
    blocksRemeasured: 0,
    totalBlocks: 0,
    cacheHitRate: 1,
    converged: true,
    timestamp: Date.now(),
  };

  /**
   * Đánh dấu một vùng tài liệu là dơ (dirty)
   */
  public markDirty(range: DirtyRange): void {
    if (!this.pendingDirtyRange) {
      this.pendingDirtyRange = { ...range };
    } else {
      // Gộp dirty range: lấy điểm bắt đầu sớm nhất
      this.pendingDirtyRange.fromPos = Math.min(
        this.pendingDirtyRange.fromPos,
        range.fromPos
      );
      if (typeof range.toPos === "number" && typeof this.pendingDirtyRange.toPos === "number") {
        this.pendingDirtyRange.toPos = Math.max(this.pendingDirtyRange.toPos, range.toPos);
      }
      // Nâng cấp scope nếu một trong hai là document hoặc section
      if (this.pendingDirtyRange.scope === "document" || range.scope === "document") {
        this.pendingDirtyRange.scope = "document";
      } else if (this.pendingDirtyRange.scope === "section" || range.scope === "section") {
        this.pendingDirtyRange.scope = "section";
      }
      if (range.reason) {
        this.pendingDirtyRange.reason = range.reason;
      }
    }

    // Invalidate cache tương ứng
    if (this.pendingDirtyRange.scope === "document") {
      this.clearCache();
    } else {
      this.invalidateFrom(this.pendingDirtyRange.fromPos);
    }
  }

  /**
   * Lấy dirty range hiện tại và chuẩn bị cho đợt reflow
   */
  public getPendingDirtyRange(): DirtyRange | null {
    return this.pendingDirtyRange;
  }

  /**
   * Xóa dirty range sau khi đã hoàn thành reflow
   */
  public clearPendingDirtyRange(): void {
    this.pendingDirtyRange = null;
  }

  /**
   * Phân tích transaction giữa oldDoc và newDoc để trích xuất earliest affected position
   */
  public computeDirtyRangeFromTransaction(
    oldDoc: ProseMirrorNode | null | undefined,
    newDoc: ProseMirrorNode | null | undefined
  ): DirtyRange | null {
    if (!oldDoc || !newDoc) {
      return { fromPos: 0, scope: "document", reason: "initial-doc" };
    }

    if (oldDoc.eq(newDoc)) {
      // Nội dung hoàn toàn giống nhau (chỉ có selection / mark phi-layout thay đổi)
      return null;
    }

    // Tìm điểm khác biệt đầu tiên giữa hai cây ProseMirror
    const diffStart = oldDoc.content.findDiffStart(newDoc.content);
    if (diffStart === null) {
      return null;
    }

    return {
      fromPos: diffStart,
      scope: "block",
      reason: "doc-mutation",
    };
  }

  /**
   * Kiểm tra xem transaction có tác động tới layout hay không.
   * Lọc bỏ hoàn toàn các transaction chỉ thay đổi con trỏ, vùng chọn,
   * hover, active comment, hoặc metadata không làm đổi cấu trúc.
   */
  public isLayoutAffectingChange(
    oldDoc: ProseMirrorNode | null | undefined,
    newDoc: ProseMirrorNode | null | undefined
  ): boolean {
    if (!oldDoc || !newDoc) return true;
    return !oldDoc.eq(newDoc);
  }

  /**
   * Invalidate toàn bộ cache từ một vị trí trở đi
   */
  public invalidateFrom(pos: number): void {
    for (const key of this.blockLinesCache.keys()) {
      if (key >= pos) {
        this.blockLinesCache.delete(key);
      }
    }
    for (const key of this.tableRowsCache.keys()) {
      if (key >= pos) {
        this.tableRowsCache.delete(key);
      }
    }
  }

  /**
   * Xóa sạch toàn bộ cache đo đạc
   */
  public clearCache(): void {
    this.blockLinesCache.clear();
    this.tableRowsCache.clear();
  }

  /**
   * Kiểm tra và bảo vệ số lần layout passes không vượt quá giới hạn (Convergence Guard)
   * Trả về true nếu an toàn để tiếp tục, false nếu đã chạm ngưỡng tối đa.
   */
  public executePassGuard(): boolean {
    this.currentPassCount++;
    if (this.currentPassCount > MAX_LAYOUT_PASSES) {
      if (process.env.NODE_ENV !== "production") {
        console.warn(
          `[ReflowManager] Convergence guard triggered: maximum layout passes (${MAX_LAYOUT_PASSES}) reached. Halting reflow to prevent freeze.`
        );
      }
      return false;
    }
    return true;
  }

  /**
   * Reset bộ đếm layout pass sau khi kết thúc chu kỳ tính toán
   */
  public resetPassCounter(): void {
    this.currentPassCount = 0;
  }

  /**
   * Lấy số lượng layout passes hiện tại
   */
  public getLayoutPassCount(): number {
    return this.currentPassCount;
  }

  /**
   * Kiểm tra xem hai layout có hội tụ (converged) hay không
   */
  public checkConvergence(
    prevLayout: PageLayoutMap | null,
    newLayout: PageLayoutMap
  ): boolean {
    if (!prevLayout) return false;
    if (prevLayout.getPageCount() !== newLayout.getPageCount()) return false;

    const prevFrags = prevLayout.getAllFragments();
    const newFrags = newLayout.getAllFragments();
    if (prevFrags.length !== newFrags.length) return false;

    // So sánh ranh giới của từng fragment
    for (let i = 0; i < prevFrags.length; i++) {
      const pf = prevFrags[i];
      const nf = newFrags[i];
      if (
        pf.pageIndex !== nf.pageIndex ||
        pf.from !== nf.from ||
        pf.to !== nf.to ||
        Math.abs(pf.top - nf.top) > 1 ||
        Math.abs(pf.height - nf.height) > 1
      ) {
        return false;
      }
    }

    return true;
  }

  /**
   * Kiểm tra điều kiện ResizeObserver có thực sự cần reflow hay không
   * - Bỏ qua nếu đang trong quá trình apply layout (tránh feedback loop)
   * - Bỏ qua nếu chiều rộng không đổi (chỉ có chiều cao đổi do spacer)
   */
  public shouldTriggerResize(
    prevWidth: number,
    newWidth: number,
    _prevHeight: number,
    _newHeight: number
  ): boolean {
    if (this.isApplyingLayout) {
      return false;
    }

    // Chiều rộng là yếu tố cốt lõi quyết định ngắt dòng (line wrap).
    // Bỏ qua biến thiên subpixel < 1px.
    const widthChanged = Math.abs(newWidth - prevWidth) >= 1;
    return widthChanged;
  }

  public isLayoutApplicationInProgress(): boolean {
    return this.isApplyingLayout;
  }

  public setLayoutApplicationInProgress(value: boolean): void {
    this.isApplyingLayout = value;
  }

  public setLastStableLayout(layout: PageLayoutMap): void {
    this.lastStableLayout = layout;
  }

  public getLastStableLayout(): PageLayoutMap | null {
    return this.lastStableLayout;
  }

  // --- Cache accessors ---

  public getCachedLines(pos: number): RenderedLineBox[] | undefined {
    return this.blockLinesCache.get(pos);
  }

  public setCachedLines(pos: number, lines: RenderedLineBox[]): void {
    this.blockLinesCache.set(pos, lines);
  }

  public getCachedTableRowHeight(pos: number): number | undefined {
    return this.tableRowsCache.get(pos);
  }

  public setCachedTableRowHeight(pos: number, height: number): void {
    this.tableRowsCache.set(pos, height);
  }

  public getCachedLinesCount(): number {
    return this.blockLinesCache.size;
  }

  public getCachedTableRowHeightsCount(): number {
    return this.tableRowsCache.size;
  }

  // --- Diagnostics ---

  public recordDiagnostics(diag: Partial<ReflowDiagnostics>): void {
    this.diagnostics = {
      ...this.diagnostics,
      ...diag,
      timestamp: Date.now(),
    };
  }

  public getDiagnostics(): Readonly<ReflowDiagnostics> {
    return this.diagnostics;
  }

  public resetDiagnostics(): void {
    this.diagnostics = {
      lastDurationMs: 0,
      dirtyRange: null,
      layoutPassCount: 0,
      blocksRemeasured: 0,
      totalBlocks: 0,
      cacheHitRate: 1,
      converged: true,
      timestamp: Date.now(),
    };
  }
}

/** Singleton instance mặc định của ReflowManager */
export const reflowManager = new ReflowManager();
