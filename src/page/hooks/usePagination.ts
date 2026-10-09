import { useState, useEffect, useRef, useCallback } from "react";
import type { Editor as TiptapEditor } from "@tiptap/core";
import { usePageSettings } from "./usePageSettings.ts";
import { useDocumentStore } from "../../stores/documentStore.ts";
import { usePaginationStore } from "../../stores/paginationStore.ts";
import type { PaginationState, PageLayoutInfo } from "../types/paginationTypes.ts";
import {
  calculatePaginationState,
  calculateBreakSpacerForPages,
  PAGE_GAP_PX,
} from "../services/paginationService.ts";

import { extractSections, getSectionAtPos } from "../services/sectionService.ts";
import { buildPageLayoutMap, getNodeSize, type PageLayoutMap } from "../services/pageLayoutMap.ts";
import { adaptPageLayoutMapToPaginationState } from "../services/pageLayoutBridge.ts";
import { measureLinesFromRenderedDom, type RenderedLineBox } from "../services/lineMeasurementService.ts";
import { reflowManager } from "../services/reflowManager.ts";
import { useZoomStore } from "../../stores/zoomStore.ts";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

export interface UsePaginationOptions {
  editor?: TiptapEditor | null;
  editorContainerRef?: React.RefObject<HTMLElement | null>;
}

/**
 * Hook quản lý phân trang nhiều trang thực tế (Phase 2.6 & Phase 2.7 Multi-Section).
 *
 * Nhiệm vụ:
 * 1. Tính toán số trang và hình học các trang vật lý dựa trên PageSettings, Sections và nội dung ProseMirror.
 * 2. Đo đạc kích thước render thực tế từ DOM (tránh giật lag qua debounce requestAnimationFrame).
 * 3. Tự động tính toán chiều cao spacer cho từng node `pageBreak` và `sectionBreak` để nội dung tiếp theo bắt đầu chính xác tại lề trên của trang kế tiếp.
 * 4. Xác định trang hiện tại (currentPage) và section hiện tại (currentSectionIndex) theo vị trí con trỏ trong tài liệu.
 * 5. Giữ nguyên 100% editor model, caret, selection, history.
 */
export function usePagination({
  editor,
  editorContainerRef,
}: UsePaginationOptions = {}) {
  const { pageSettings, dimensions } = usePageSettings();
  const documentContent = useDocumentStore((state) => state.document.content);
  const documentStyles = useDocumentStore((state) => state.document.styles);

  const [paginationState, setPaginationState] = useState<PaginationState>(() =>
    calculatePaginationState(documentContent, {
      paperSize: pageSettings.paperSize,
      orientation: pageSettings.orientation,
      margins: pageSettings.margins,
      pageGapPx: PAGE_GAP_PX,
    })
  );

  const rafIdRef = useRef<number | null>(null);
  const pagesRef = useRef<PageLayoutInfo[]>(paginationState.pages);
  pagesRef.current = paginationState.pages;
  const currentLayoutMapRef = useRef<PageLayoutMap | null>(null);
  const lastDocRef = useRef<unknown>(null);
  const isComposingRef = useRef(false);
  const pendingRecalculateAfterCompositionRef = useRef(false);

  /**
   * Cập nhật kích thước spacer cho các node pageBreak và sectionBreak trong DOM thực tế
   */
  const updateBreakSpacers = useCallback(
    (containerEl: HTMLElement, pages: PageLayoutInfo[]) => {
      const pageBreaks = containerEl.querySelectorAll<HTMLElement>(".page-break");
      if (pageBreaks.length === 0) return;

      const containerRect = containerEl.getBoundingClientRect();

      pageBreaks.forEach((breakEl, idx) => {
        // Tọa độ top tương đối của node ngắt trang/phần so với đầu container soạn thảo
        const breakRect = breakEl.getBoundingClientRect();
        const breakOffsetTop = breakRect.top - containerRect.top;

        const spacer = calculateBreakSpacerForPages(
          breakOffsetTop,
          pages,
          PAGE_GAP_PX
        );

        // Gán chiều cao spacer trực tiếp vào style của element
        breakEl.style.height = `${spacer}px`;
        breakEl.style.setProperty("--page-break-spacer", `${spacer}px`);
        breakEl.setAttribute("data-page-index", String(idx + 1));
      });
    },
    []
  );

  /**
   * Tính toán lại toàn bộ layout phân trang với Incremental Reflow & Convergence Guard (Phase 11)
   */
  const recalculateLayout = useCallback(() => {
    // Defer expensive reflow nếu editor đang trong quá trình gõ IME (tiếng Việt Telex/VNI)
    if (editor?.view?.composing || isComposingRef.current) {
      pendingRecalculateAfterCompositionRef.current = true;
      return;
    }

    // Convergence Guard: Bảo vệ chống vòng lặp vô tận (feedback loop)
    if (!reflowManager.executePassGuard()) {
      return;
    }

    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
    }

    rafIdRef.current = requestAnimationFrame(() => {
      const startTime = performance.now();
      let measuredHeight: number | undefined;

      const containerEl = editorContainerRef?.current;
      const proseMirrorEl = containerEl?.querySelector<HTMLElement>(".ProseMirror") ?? null;
      if (containerEl && proseMirrorEl) {
        // Cập nhật spacer trước để đo đạc tổng chiều cao chuẩn xác
        updateBreakSpacers(containerEl, pagesRef.current);
        measuredHeight = proseMirrorEl.scrollHeight;
      }

      const content = editor ? editor.getJSON() : documentContent;
      const cursorPos = editor?.state?.selection?.from ?? 0;
      const zoomFactor = useZoomStore.getState().zoom / 100;

      let newState: PaginationState;
      let activeSectionIndex = 1;

      try {
        const dirtyRange = reflowManager.getPendingDirtyRange();
        const dirtyFromPos = dirtyRange ? dirtyRange.fromPos : 0;

        const measuredBlockLines = new Map<number, RenderedLineBox[]>();
        const measuredTableRowHeights = new Map<number, number>();

        let totalBlocks = 0;
        let blocksRemeasured = 0;
        let cacheHits = 0;

        if (containerEl && proseMirrorEl && editor && content && Array.isArray(content.content)) {
          const pElements = proseMirrorEl.querySelectorAll("p");
          const tableElements = proseMirrorEl.querySelectorAll("table");
          let pIdx = 0;
          let tblIdx = 0;
          let currentPos = 0;

          for (const block of content.content) {
            totalBlocks++;
            const blockSize = getNodeSize(block);

            if (block.type === "paragraph") {
              // Khối ổn định nằm trước dirty range: tái sử dụng cache đo đạc
              const isStable = currentPos + blockSize <= dirtyFromPos;
              const cachedLines = reflowManager.getCachedLines(currentPos);

              if (isStable && cachedLines) {
                measuredBlockLines.set(currentPos, cachedLines);
                cacheHits++;
                pIdx++;
              } else if (pElements[pIdx]) {
                const lines = measureLinesFromRenderedDom(
                  pElements[pIdx],
                  currentPos,
                  block,
                  zoomFactor
                );
                measuredBlockLines.set(currentPos, lines);
                reflowManager.setCachedLines(currentPos, lines);
                blocksRemeasured++;
                pIdx++;
              }
            } else if (block.type === "table") {
              if (tableElements[tblIdx]) {
                const trElements = tableElements[tblIdx].querySelectorAll("tr");
                let rowPos = currentPos + 1;
                if (Array.isArray(block.content)) {
                  let rIdx = 0;
                  for (const row of block.content) {
                    const rowSize = getNodeSize(row);
                    if (row.type === "tableRow") {
                      const isStable = rowPos + rowSize <= dirtyFromPos;
                      const cachedRowH = reflowManager.getCachedTableRowHeight(rowPos);

                      if (isStable && typeof cachedRowH === "number") {
                        measuredTableRowHeights.set(rowPos, cachedRowH);
                        cacheHits++;
                        rIdx++;
                      } else if (trElements[rIdx]) {
                        const rect = trElements[rIdx].getBoundingClientRect();
                        if (rect.height > 0) {
                          const normalizedH = rect.height / zoomFactor;
                          measuredTableRowHeights.set(rowPos, normalizedH);
                          reflowManager.setCachedTableRowHeight(rowPos, normalizedH);
                          blocksRemeasured++;
                        }
                        rIdx++;
                      }
                    }
                    rowPos += rowSize;
                  }
                }
              }
              tblIdx++;
            }
            currentPos += blockSize;
          }
        }

        const layoutMap = buildPageLayoutMap(content, pageSettings, {
          measuredBlockLines: measuredBlockLines.size > 0 ? measuredBlockLines : undefined,
          measuredTableRowHeights: measuredTableRowHeights.size > 0 ? measuredTableRowHeights : undefined,
          pageGapPx: PAGE_GAP_PX,
          documentStyles: documentStyles?.definitions,
        });

        const converged = reflowManager.checkConvergence(currentLayoutMapRef.current, layoutMap);
        currentLayoutMapRef.current = layoutMap;
        reflowManager.setLastStableLayout(layoutMap);
        lastDocRef.current = editor?.state?.doc ?? null;

        newState = adaptPageLayoutMapToPaginationState(layoutMap, cursorPos, PAGE_GAP_PX);
        activeSectionIndex = layoutMap.getSectionForPage(newState.currentPage - 1);

        reflowManager.recordDiagnostics({
          lastDurationMs: performance.now() - startTime,
          dirtyRange,
          layoutPassCount: reflowManager.getLayoutPassCount(),
          blocksRemeasured,
          totalBlocks,
          cacheHitRate: totalBlocks > 0 ? cacheHits / totalBlocks : 1,
          converged,
        });
        reflowManager.clearPendingDirtyRange();
      } catch {
        // Fallback an toàn về legacy flow nếu runtime đo đạc DOM gặp sự cố
        newState = calculatePaginationState(
          content,
          {
            paperSize: pageSettings.paperSize,
            orientation: pageSettings.orientation,
            margins: pageSettings.margins,
            pageGapPx: PAGE_GAP_PX,
          },
          measuredHeight
        );

        const sections = extractSections(content, pageSettings);
        if (editor && editor.state) {
          const { selection } = editor.state;
          const totalSize = Math.max(1, editor.state.doc.content.size);
          const cursorRatio = selection.from / totalSize;
          newState.currentPage = Math.min(
            newState.pageCount,
            Math.max(1, Math.ceil(cursorRatio * newState.pageCount))
          );
          const activeSec = getSectionAtPos(sections, selection.from);
          activeSectionIndex = activeSec.index;
        }
      }

      // Cập nhật spacer lần thứ 2 với mảng pages mới (bảo vệ chống feedback loop)
      if (containerEl) {
        reflowManager.setLayoutApplicationInProgress(true);
        updateBreakSpacers(containerEl, newState.pages);
        reflowManager.setLayoutApplicationInProgress(false);
      }

      newState.currentSectionIndex = activeSectionIndex;

      setPaginationState(newState);
      usePaginationStore
        .getState()
        .setPagination(
          newState.pageCount,
          newState.currentPage,
          activeSectionIndex,
          currentLayoutMapRef.current
        );

      useDocumentStore.getState().setCurrentSectionIndex(activeSectionIndex);

      reflowManager.resetPassCounter();
      rafIdRef.current = null;
    });
  }, [
    editor,
    editorContainerRef,
    documentContent,
    pageSettings,
    documentStyles,
    updateBreakSpacers,
  ]);

  // Đồng bộ trạng thái khởi tạo sang paginationStore
  useEffect(() => {
    usePaginationStore
      .getState()
      .setPagination(paginationState.pageCount, paginationState.currentPage);
  }, []);

  // Lắng nghe thay đổi thiết lập trang (paperSize, orientation, margins)
  useEffect(() => {
    reflowManager.markDirty({
      fromPos: 0,
      scope: "document",
      reason: "pageSettings",
    });
    recalculateLayout();
  }, [pageSettings, dimensions, recalculateLayout]);

  // Lắng nghe nội dung tài liệu thay đổi
  useEffect(() => {
    recalculateLayout();
  }, [documentContent, recalculateLayout]);

  // Lắng nghe thay đổi định nghĩa Style của tài liệu
  useEffect(() => {
    reflowManager.markDirty({
      fromPos: 0,
      scope: "document",
      reason: "documentStyles",
    });
    recalculateLayout();
  }, [documentStyles, recalculateLayout]);

  // Lắng nghe thay đổi kích thước container (ResizeObserver với guard chống feedback loop)
  useEffect(() => {
    const containerEl = editorContainerRef?.current;
    if (!containerEl || typeof ResizeObserver === "undefined") return;

    let lastWidth = containerEl.clientWidth;
    let lastHeight = containerEl.clientHeight;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (reflowManager.shouldTriggerResize(lastWidth, width, lastHeight, height)) {
          lastWidth = width;
          lastHeight = height;
          reflowManager.markDirty({
            fromPos: 0,
            scope: "document",
            reason: "container-resize",
          });
          recalculateLayout();
        }
      }
    });

    resizeObserver.observe(containerEl);
    return () => {
      resizeObserver.disconnect();
    };
  }, [editorContainerRef, recalculateLayout]);

  // Lắng nghe sự kiện IME composition (tiếng Việt có dấu, Unikey, Telex)
  useEffect(() => {
    if (!editor || !editor.view || !editor.view.dom) return;
    const dom = editor.view.dom;

    const onCompStart = () => {
      isComposingRef.current = true;
    };

    const onCompEnd = () => {
      isComposingRef.current = false;
      if (pendingRecalculateAfterCompositionRef.current) {
        pendingRecalculateAfterCompositionRef.current = false;
        recalculateLayout();
      }
    };

    dom.addEventListener("compositionstart", onCompStart);
    dom.addEventListener("compositionend", onCompEnd);

    return () => {
      dom.removeEventListener("compositionstart", onCompStart);
      dom.removeEventListener("compositionend", onCompEnd);
    };
  }, [editor, recalculateLayout]);

  // Lắng nghe transaction/selection từ editor Tiptap
  useEffect(() => {
    if (!editor) return;

    const handleTransaction = () => {
      if (editor.view?.composing || isComposingRef.current) {
        pendingRecalculateAfterCompositionRef.current = true;
        return;
      }

      const currentDoc = editor.state.doc;
      const lastDoc = lastDocRef.current as ProseMirrorNode | null;

      if (!reflowManager.isLayoutAffectingChange(lastDoc, currentDoc) && currentLayoutMapRef.current) {
        // Chỉ có con trỏ/vùng chọn (selection) hoặc comment hover thay đổi:
        // Cập nhật currentPage ngay lập tức mà không trigger DOM reflow hay remeasure
        const cursorPos = editor.state.selection.from;
        const targetPage = currentLayoutMapRef.current.getPageNumberForPosition(cursorPos);
        const targetSection = currentLayoutMapRef.current.getSectionForPage(targetPage - 1);

        if (
          targetPage !== paginationState.currentPage ||
          targetSection !== paginationState.currentSectionIndex
        ) {
          setPaginationState((prev) => {
            if (prev.currentPage === targetPage && prev.currentSectionIndex === targetSection) {
              return prev;
            }
            return {
              ...prev,
              currentPage: targetPage,
              currentSectionIndex: targetSection,
            };
          });

          usePaginationStore
            .getState()
            .setPagination(
              currentLayoutMapRef.current.getPageCount(),
              targetPage,
              targetSection,
              currentLayoutMapRef.current
            );
          useDocumentStore.getState().setCurrentSectionIndex(targetSection);
        }
        return;
      }

      const dirty = reflowManager.computeDirtyRangeFromTransaction(lastDoc, currentDoc);
      if (dirty) {
        reflowManager.markDirty(dirty);
      }

      lastDocRef.current = currentDoc;
      recalculateLayout();
    };

    editor.on("transaction", handleTransaction);
    return () => {
      editor.off("transaction", handleTransaction);
    };
  }, [editor, recalculateLayout, paginationState.currentPage, paginationState.currentSectionIndex]);

  // Dọn dẹp RAF khi unmount
  useEffect(() => {
    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
      }
    };
  }, []);

  return {
    paginationState,
    pageCount: paginationState.pageCount,
    currentPage: paginationState.currentPage,
    pages: paginationState.pages,
    recalculateLayout,
  };
}

export default usePagination;
