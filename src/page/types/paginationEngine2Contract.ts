/**
 * PAGINATION ENGINE 2.0 — ARCHITECTURAL CONTRACT & FOUNDATION INTERFACES
 *
 * Invariants bắt buộc:
 * 1. ONE ProseMirror Document: Luôn luôn chỉ có duy nhất một ProseMirror Doc instance.
 * 2. ONE Editor Instance: Không tạo editor per page, không chia cắt editor DOM.
 * 3. ONE Document AST: Toàn bộ cấu trúc lưu trữ và undo/redo nằm trong 1 AST duy nhất.
 * 4. NO AST Mutation: Quá trình đo đạc layout tuyệt đối KHÔNG mutate AST hay tự chèn node pageBreak.
 * 5. NO Persisted Coordinates: Mọi tọa độ px, rect, line, page chỉ là runtime ephemeral layout cache.
 * 6. ZERO-FAILURE FALLBACK: Nếu layout engine 2.0 gặp lỗi hoặc ngoại lệ DOM, tài liệu vẫn soạn thảo được,
 *    không mất dữ liệu, và tự động degrade sang legacy visual flow.
 */

import type { Editor as TiptapEditor } from "@tiptap/core";
import type { PaperSizeName, PageOrientation, PageMargins } from "./pageTypes.ts";
import type { PageLayoutInfo, PaginationState } from "./paginationTypes.ts";
import type { TableFragmentMetadata, TableRowLayoutInfo } from "./layoutModelTypes.ts";

export type { TableFragmentMetadata, TableRowLayoutInfo };

/**
 * Tọa độ và kích thước hình chữ nhật trong không gian toạ độ layout (pixel)
 */
export interface LayoutRect {
  left: number;
  top: number;
  width: number;
  height: number;
  right: number;
  bottom: number;
}

/**
 * Định vị dòng văn bản trong một trang layout
 */
export interface LineLayoutBox {
  /** Vị trí bắt đầu trong ProseMirror doc (0-indexed offset) */
  fromPos: number;
  /** Vị trí kết thúc trong ProseMirror doc (0-indexed offset) */
  toPos: number;
  /** Hình chữ nhật hiển thị dòng trên trang tương ứng */
  rect: LayoutRect;
  /** Số thứ tự dòng trong block */
  lineIndex: number;
}

/**
 * Định vị một khối nội dung (Block Node) trên hệ thống trang
 */
export interface BlockLayoutBox {
  /** Node type name trong ProseMirror schema */
  nodeType: string;
  /** Vị trí bắt đầu của node trong ProseMirror doc */
  nodePos: number;
  /** Kích thước node (nodeSize) */
  nodeSize: number;
  /** Số trang mà phần đầu khối xuất hiện */
  startPage: number;
  /** Số trang mà phần đuôi khối xuất hiện (nếu bị phân mảnh/tràn qua nhiều trang) */
  endPage: number;
  /** Danh sách các phân mảnh (fragments) của block theo từng trang */
  fragments: BlockFragmentLayout[];
}

/**
 * Phân mảnh của một block trên một trang cụ thể
 */
export interface BlockFragmentLayout {
  /** Số thứ tự trang chứa phân mảnh này (1-indexed) */
  pageNumber: number;
  /** Vị trí tương đối so với lề trên của trang (px) */
  contentTopPx: number;
  /** Chiều cao khả dụng mà phân mảnh chiếm trên trang (px) */
  heightPx: number;
  /** Danh sách dòng thuộc phân mảnh này (nếu là textblock) */
  lines?: LineLayoutBox[];
  /** Đánh dấu phân mảnh có bị cắt giữa chừng (overflow) không */
  isSplit: boolean;
  /** Metadata chi tiết của phân mảnh nếu block là table */
  tableMetadata?: TableFragmentMetadata;
}

/**
 * Thông tin mô tả một trang vật lý trong Runtime Layout Model 2.0
 */
export interface RuntimePageBox {
  /** Số thứ tự trang (1-indexed) */
  pageNumber: number;
  /** Section chứa trang này (1-indexed) */
  sectionIndex: number;
  /** Section ID */
  sectionId: string;
  /** Cấu hình khổ giấy của trang */
  paperSize: PaperSizeName;
  /** Hướng trang */
  orientation: PageOrientation;
  /** Kích thước trang chuẩn mm */
  dimensionsMm: {
    width: number;
    height: number;
  };
  /** Lề trang chuẩn mm */
  marginsMm: PageMargins;
  /** Tọa độ bắt đầu trên Canvas (px) */
  topPx: number;
  /** Tọa độ kết thúc trên Canvas (px) */
  bottomPx: number;
  /** Chiều cao tổng thể của trang (px) */
  heightPx: number;
  /** Chiều rộng tổng thể của trang (px) */
  widthPx: number;
  /** Vùng nội dung khả dụng (Usable Content Area Rect) */
  contentRectPx: LayoutRect;
  /** Dải vị trí ProseMirror doc nằm trên trang này [minPos, maxPos] */
  docRange: {
    from: number;
    to: number;
  };
}

/**
 * Runtime Layout Model - Mô hình layout toàn vẹn của Pagination Engine 2.0
 */
export interface RuntimeLayoutModel {
  /** Mã định danh phiên bản của layout snapshot */
  version: number;
  /** Thời điểm đo đạc layout (timestamp) */
  timestamp: number;
  /** Tổng số trang vật lý */
  pageCount: number;
  /** Danh sách hình học của tất cả các trang */
  pages: RuntimePageBox[];
  /** Ánh xạ theo vị trí node để tra cứu nhanh O(log N) */
  blockBoxes: BlockLayoutBox[];
  /** Cờ cho biết layout được tính từ DOM thật hay chế độ ước tính Headless/Fallback */
  isRealDomMeasured: boolean;
  /** Lỗi nếu có xảy ra trong quá trình layout measurement */
  error?: string | null;
}

/**
 * Contract tra cứu vị trí con trỏ và ánh xạ trang (Authoritative Runtime Page Mapping)
 */
export interface PageMappingQuery {
  /**
   * Tra cứu số trang chính xác chứa vị trí con trỏ ProseMirror `pos`
   */
  getPageAtPos: (pos: number) => number;

  /**
   * Tra cứu section index chứa vị trí con trỏ ProseMirror `pos`
   */
  getSectionAtPos: (pos: number) => number;

  /**
   * Lấy dải vị trí ProseMirror [from, to] của một trang cụ thể
   */
  getPosRangeForPage: (pageNumber: number) => { from: number; to: number } | null;

  /**
   * Lấy hình chữ nhật của trang vật lý theo số trang
   */
  getPageBox: (pageNumber: number) => RuntimePageBox | null;

  /**
   * Chuyển đổi tọa độ màn hình hoặc viewport (clientX, clientY) thành vị trí ProseMirror pos
   */
  getPosFromCoords: (coords: { x: number; y: number }) => number | null;
}

/**
 * Policy xử lý khi Layout Engine 2.0 gặp lỗi (Failure Fallback Policy)
 */
export interface LayoutFailurePolicy {
  /** Có tự động kích hoạt fallback khi runtime ném exception không */
  enableFallback: boolean;
  /** Chế độ hiển thị khi bị lỗi */
  fallbackMode: "legacy-flow" | "single-sheet-safe";
  /** Callback thông báo lỗi để logging/telemetry */
  onLayoutError?: (error: unknown) => void;
}

/**
 * Interface lõi của Pagination Engine 2.0
 */
export interface IPaginationEngine2 {
  /** Tên và phiên bản engine */
  readonly name: string;
  readonly version: string;

  /** Khởi tạo hoặc gắn engine vào Tiptap Editor & Container DOM */
  attach: (editor: TiptapEditor, containerEl: HTMLElement) => void;

  /** Hủy lắng nghe và dọn dẹp tài nguyên (RAF, ResizeObserver) */
  detach: () => void;

  /** Yêu cầu tính toán lại layout (được debounce / RAF batching an toàn) */
  invalidateLayout: (reason?: string) => void;

  /** Lấy layout snapshot hiện tại */
  getLayoutModel: () => RuntimeLayoutModel;

  /** Truy vấn ánh xạ vị trí <-> trang */
  getQuery: () => PageMappingQuery;

  /** Trả về fallback state khi engine gặp lỗi */
  getFallbackState: () => PaginationState;
}

/**
 * Compatibility Adapter: Chuyển đổi RuntimeLayoutModel 2.0 sang PaginationState 1.0
 * để duy trì tính tương thích ngược tuyệt đối với toàn bộ codebase hiện tại.
 */
export function adaptRuntimeModelToLegacyPagination(
  model: RuntimeLayoutModel,
  currentPage = 1,
  currentSectionIndex = 1
): PaginationState {
  const legacyPages: PageLayoutInfo[] = model.pages.map((p) => ({
    pageNumber: p.pageNumber,
    sectionIndex: p.sectionIndex,
    sectionId: p.sectionId,
    paperSize: p.paperSize,
    orientation: p.orientation,
    margins: p.marginsMm,
    widthMm: p.dimensionsMm.width,
    heightMm: p.dimensionsMm.height,
    widthPx: p.widthPx,
    heightPx: p.heightPx,
    topPx: p.topPx,
    bottomPx: p.bottomPx,
    breakType: p.pageNumber === 1 ? "start" : "overflow",
  }));

  const firstPage = model.pages[0];
  const usableWidthPx = firstPage ? firstPage.contentRectPx.width : 600;
  const usableHeightPx = firstPage ? firstPage.contentRectPx.height : 900;
  const pageWidthPx = firstPage ? firstPage.widthPx : 794;
  const pageHeightPx = firstPage ? firstPage.heightPx : 1123;

  return {
    pageCount: Math.max(1, model.pageCount),
    currentPage: Math.max(1, Math.min(model.pageCount, currentPage)),
    currentSectionIndex: Math.max(1, currentSectionIndex),
    pages: legacyPages,
    usableWidthPx,
    usableHeightPx,
    pageWidthPx,
    pageHeightPx,
    pageGapPx: 24,
    marginsPx: {
      top: firstPage ? firstPage.contentRectPx.top : 96,
      bottom: firstPage ? pageHeightPx - firstPage.contentRectPx.bottom : 96,
      left: firstPage ? firstPage.contentRectPx.left : 96,
      right: firstPage ? pageWidthPx - firstPage.contentRectPx.right : 96,
    },
  };
}
