import type { Editor, JSONContent } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { ReferenceAnchorService } from "./referenceAnchorService.ts";
import type { SectionModel } from "../../page/types/sectionTypes.ts";
import { useReferencesStore } from "../../stores/referencesStore.ts";
import { usePaginationStore } from "../../stores/paginationStore.ts";
import { buildPageLayoutMap, getNodeSize, type PageLayoutMap } from "../../page/services/pageLayoutMap.ts";
import { DEFAULT_PAGE_SETTINGS } from "../../page/services/pageConstants.ts";

/**
 * HeadingItem - Bản ghi cấu trúc một đề mục tài liệu (Phase 6.2)
 */
export interface HeadingItem {
  /** Định danh neo tham chiếu ngữ nghĩa bền vững */
  id: string;
  /** Cấp độ đề mục: 1 (H1), 2 (H2), 3 (H3) */
  level: 1 | 2 | 3;
  /** Văn bản hiển thị của đề mục (đã xử lý mixed marks & text xóa) */
  text: string;
  /** Văn bản thô ban đầu (kể cả phần bị đánh dấu xóa trong Track Changes) */
  rawText?: string;
  /** Vị trí bắt đầu của node trong ProseMirror doc (runtime only) */
  from: number;
  /** Vị trí kết thúc của node trong ProseMirror doc (runtime only) */
  to: number;
  /** Thứ tự section chứa đề mục (nếu xác định được) */
  sectionIndex?: number;
  /** Định danh section chứa đề mục */
  sectionId?: string;
  /** Cờ đánh dấu đề mục bị xóa hoàn toàn trong Track Changes */
  isDeleted?: boolean;
  /** Cờ đánh dấu đề mục chứa nhiều định dạng ký tự khác nhau */
  hasMixedMarks?: boolean;
  /** Danh sách đề mục con phân cấp (Hierarchy children) */
  children?: HeadingItem[];
}

export class HeadingService {
  /**
   * Trích xuất danh sách Heading từ ProseMirror Node hoặc JSONContent AST
   * Hoàn toàn không lưu vị trí tĩnh; vị trí luôn được suy ra động tại runtime.
   */
  static extractHeadings(
    doc: ProseMirrorNode | JSONContent,
    sections?: SectionModel[]
  ): HeadingItem[] {
    const headings: HeadingItem[] = [];

    // 1. Trường hợp là ProseMirror Document Node (Runtime Editor)
    if (this.isProseMirrorNode(doc)) {
      doc.descendants((node, pos) => {
        if (node.type.name === "heading") {
          const level = (node.attrs.level >= 1 && node.attrs.level <= 3
            ? node.attrs.level
            : 1) as 1 | 2 | 3;

          let rawText = "";
          let activeText = "";
          let hasMixedMarks = false;
          let deletedChunksCount = 0;
          let totalChunksCount = 0;

          // Duyệt inline nodes để trích xuất text chính xác kể cả khi có mixed marks hoặc Track Changes
          node.forEach((child) => {
            if (child.isText && child.text) {
              totalChunksCount++;
              rawText += child.text;
              if (child.marks.length > 0) {
                hasMixedMarks = true;
              }

              const isTrackedDelete = child.marks.some(
                (m) =>
                  m.type.name === "trackChange" &&
                  m.attrs.changeType === "delete"
              );

              if (isTrackedDelete) {
                deletedChunksCount++;
              } else {
                activeText += child.text;
              }
            }
          });

          const isFullyDeleted =
            totalChunksCount > 0 && deletedChunksCount === totalChunksCount;

          let finalText = activeText.trim();
          if (!finalText && isFullyDeleted) {
            finalText = rawText.trim() || "(Đề mục đã xóa)";
          } else if (!finalText) {
            finalText = "(Tiêu đề trống)";
          }

          // Kiểm tra và sử dụng ID ổn định
          const rawId = node.attrs.id;
          const id =
            typeof rawId === "string" && ReferenceAnchorService.isValidAnchorId(rawId)
              ? rawId
              : ReferenceAnchorService.generateAnchorId("heading", finalText);

          // Xác định Section nếu có thông tin sections
          let secIndex: number | undefined;
          let secId: string | undefined;
          if (sections && sections.length > 0) {
            const foundSec = this.resolveSectionAtPos(sections, pos);
            if (foundSec) {
              secIndex = foundSec.index;
              secId = foundSec.id;
            }
          }

          headings.push({
            id,
            level,
            text: finalText,
            rawText: rawText.trim() || undefined,
            from: pos,
            to: pos + node.nodeSize,
            sectionIndex: secIndex,
            sectionId: secId,
            isDeleted: isFullyDeleted,
            hasMixedMarks,
          });
        }
      });

      return headings;
    }

    // 2. Trường hợp là JSONContent AST (Static / Serialization)
    const jsonDoc = doc as JSONContent;
    let currentOffset = 0;

    const traverseJson = (node: JSONContent) => {
      const nodeStart = currentOffset;

      if (node.type === "heading") {
        const level = (typeof node.attrs?.level === "number" &&
        node.attrs.level >= 1 &&
        node.attrs.level <= 3
          ? node.attrs.level
          : 1) as 1 | 2 | 3;

        let rawText = "";
        let activeText = "";
        let hasMixedMarks = false;
        let deletedChunksCount = 0;
        let totalChunksCount = 0;

        if (Array.isArray(node.content)) {
          for (const child of node.content) {
            if (child.type === "text" && child.text) {
              totalChunksCount++;
              rawText += child.text;
              if (child.marks && child.marks.length > 0) {
                hasMixedMarks = true;
              }

              const isTrackedDelete = child.marks?.some(
                (m) =>
                  m.type === "trackChange" &&
                  m.attrs?.changeType === "delete"
              );

              if (isTrackedDelete) {
                deletedChunksCount++;
              } else {
                activeText += child.text;
              }
            }
          }
        }

        const isFullyDeleted =
          totalChunksCount > 0 && deletedChunksCount === totalChunksCount;

        let finalText = activeText.trim();
        if (!finalText && isFullyDeleted) {
          finalText = rawText.trim() || "(Đề mục đã xóa)";
        } else if (!finalText) {
          finalText = "(Tiêu đề trống)";
        }

        const rawId = node.attrs?.id;
        const id =
          typeof rawId === "string" && ReferenceAnchorService.isValidAnchorId(rawId)
            ? rawId
            : ReferenceAnchorService.generateAnchorId("heading", finalText);

        const nodeLength = this.estimateNodeSize(node);

        headings.push({
          id,
          level,
          text: finalText,
          rawText: rawText.trim() || undefined,
          from: nodeStart,
          to: nodeStart + nodeLength,
          isDeleted: isFullyDeleted,
          hasMixedMarks,
        });

        currentOffset += nodeLength;
        return;
      }

      if (Array.isArray(node.content)) {
        for (const child of node.content) {
          traverseJson(child);
        }
      } else {
        currentOffset += this.estimateNodeSize(node);
      }
    };

    if (Array.isArray(jsonDoc.content)) {
      for (const child of jsonDoc.content) {
        traverseJson(child);
      }
    }

    return headings;
  }

  /**
   * Chuẩn hóa và làm sạch Heading IDs trong AST:
   * - Gán ID semantic duy nhất cho heading thiếu ID
   * - Xử lý triệt tiêu ID trùng lặp (Duplicate IDs) khi load dữ liệu lỗi
   * - Hoàn toàn không mutate object ban đầu (Immutability)
   */
  static normalizeHeadingIds(content: JSONContent): {
    updatedContent: JSONContent;
    hasChanged: boolean;
    normalizedCount: number;
  } {
    let hasChanged = false;
    let normalizedCount = 0;
    const seenIds = new Set<string>();

    const cloneAndNormalize = (node: JSONContent): JSONContent => {
      let newNode = { ...node };

      if (node.type === "heading") {
        const rawId = node.attrs?.id;
        const text = this.extractSimpleText(node);

        const isMissingOrInvalid =
          !rawId ||
          typeof rawId !== "string" ||
          !ReferenceAnchorService.isValidAnchorId(rawId);

        const isDuplicate = typeof rawId === "string" && seenIds.has(rawId);

        if (isMissingOrInvalid || isDuplicate) {
          const freshId = ReferenceAnchorService.generateAnchorId("heading", text);
          newNode = {
            ...newNode,
            attrs: {
              ...(newNode.attrs || {}),
              id: freshId,
            },
          };
          seenIds.add(freshId);
          hasChanged = true;
          normalizedCount++;
        } else {
          seenIds.add(rawId);
        }
      }

      if (Array.isArray(node.content)) {
        newNode.content = node.content.map(cloneAndNormalize);
      }

      return newNode;
    };

    const updatedContent = cloneAndNormalize(content);
    return { updatedContent, hasChanged, normalizedCount };
  }

  /**
   * Xây dựng cấu trúc cây phân cấp (Hierarchy Tree) từ danh sách heading phẳng
   * Thuật toán sử dụng stack tổ tiên, kháng 100% mọi chuỗi bất thường (H1 -> H3, H2 ở đầu doc, v.v.)
   */
  static buildHeadingHierarchy(headings: HeadingItem[]): HeadingItem[] {
    const root: HeadingItem[] = [];
    const stack: { item: HeadingItem; level: number }[] = [];

    for (const raw of headings) {
      const item: HeadingItem = { ...raw, children: [] };

      // Loại bỏ các mục trong stack có cấp độ sâu hơn hoặc bằng mục hiện tại
      while (stack.length > 0 && stack[stack.length - 1].level >= item.level) {
        stack.pop();
      }

      if (stack.length === 0) {
        root.push(item);
      } else {
        const parent = stack[stack.length - 1].item;
        if (!parent.children) parent.children = [];
        parent.children.push(item);
      }

      stack.push({ item, level: item.level });
    }

    return root;
  }

  /**
   * Lấy số trang (1-indexed) của một Heading dựa trên ID ngữ nghĩa
   * Sử dụng authoritative PageLayoutMap tập trung; tuyệt đối không persist page index vào Heading node (Phase 10).
   */
  static getPageForHeading(
    headingId: string,
    doc?: ProseMirrorNode | JSONContent,
    layoutMap?: PageLayoutMap | null
  ): number {
    if (!headingId) return 1;

    // 1. Nếu caller truyền layoutMap trực tiếp, hoặc lấy từ usePaginationStore
    let effectiveLayout = layoutMap || usePaginationStore.getState().layoutMap;

    // 2. Nếu chưa có layoutMap nhưng có doc, tính layout map động
    if (!effectiveLayout && doc) {
      const json =
        doc && typeof (doc as any).toJSON === "function"
          ? (doc as any).toJSON()
          : doc;
      effectiveLayout = buildPageLayoutMap(json, DEFAULT_PAGE_SETTINGS);
    }

    // 3. Tìm vị trí (pos) của heading trong doc
    if (doc) {
      const headings = this.extractHeadings(doc);
      const target = headings.find((h) => h.id === headingId);
      if (target) {
        if (effectiveLayout) {
          return effectiveLayout.getPageNumberForPosition(target.from);
        }
        return 1;
      }
    }

    return 1;
  }

  /**
   * Điều hướng editor tới vị trí của một heading
   * Focus editor, đưa caret tới heading, scroll vào viewport và cập nhật selectedReferenceId
   * TUYỆT ĐỐI KHÔNG làm biến đổi nội dung văn bản.
   */
  static navigateToHeading(
    editor: Editor | null | undefined,
    headingOrId: HeadingItem | string
  ): boolean {
    if (!editor || !editor.state) return false;

    let heading: HeadingItem | undefined;
    if (typeof headingOrId === "string") {
      const headings = this.extractHeadings(editor.state.doc);
      heading = headings.find((h) => h.id === headingOrId);
      if (!heading) return false;
    } else {
      heading = headingOrId;
    }

    try {
      // 1. Focus editor
      editor.commands.focus();

      // 2. Đưa con trỏ soạn thảo tới vị trí đầu nội dung của heading
      const maxPos = editor.state.doc.content.size;
      const targetPos = Math.min(maxPos, Math.max(0, heading.from + 1));
      editor.commands.setTextSelection(targetPos);

      // 3. Cuộn heading vào giữa khung nhìn (scrollIntoView)
      if (typeof window !== "undefined" && editor.view) {
        const domNode = editor.view.nodeDOM(heading.from);
        if (domNode instanceof HTMLElement) {
          domNode.scrollIntoView({ behavior: "smooth", block: "center" });
        } else {
          // Fallback qua DOM querySelector dựa trên id hoặc data attribute
          const headingEl = editor.view.dom.querySelector(`[id="${heading.id}"]`);
          if (headingEl instanceof HTMLElement) {
            headingEl.scrollIntoView({ behavior: "smooth", block: "center" });
          }
        }
      }

      // 4. Cập nhật ID tham chiếu đang chọn trên Store
      useReferencesStore.getState().setSelectedReferenceId(heading.id);

      // 5. Cập nhật trang hiện tại từ authoritative LayoutMap (Phase 10)
      const { pageCount, layoutMap } = usePaginationStore.getState();
      if (layoutMap) {
        const targetPage = layoutMap.getPageNumberForPosition(targetPos);
        const targetSec = layoutMap.getSectionForPage(targetPage - 1);
        usePaginationStore.getState().setPagination(pageCount, targetPage, targetSec, layoutMap);
      } else if (pageCount > 1) {
        const totalSize = Math.max(1, editor.state.doc.content.size);
        const cursorRatio = targetPos / totalSize;
        const estimatedPage = Math.min(
          pageCount,
          Math.max(1, Math.ceil(cursorRatio * pageCount))
        );
        usePaginationStore.getState().setPagination(pageCount, estimatedPage);
      }

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Helper kiểm tra đối tượng có phải là ProseMirror Node hay không
   */
  private static isProseMirrorNode(doc: unknown): doc is ProseMirrorNode {
    return (
      Boolean(doc) &&
      typeof (doc as ProseMirrorNode).descendants === "function" &&
      typeof (doc as ProseMirrorNode).type === "object"
    );
  }

  /**
   * Trích xuất văn bản đơn giản từ JSONContent
   */
  private static extractSimpleText(node: JSONContent): string {
    if (node.text) return node.text;
    if (Array.isArray(node.content)) {
      return node.content.map((c) => this.extractSimpleText(c)).join("");
    }
    return "";
  }

  /**
   * Ước tính kích thước ProseMirror node cho JSONContent
   */
  private static estimateNodeSize(node: JSONContent): number {
    return getNodeSize(node);
  }

  /**
   * Tìm section tại vị trí pos từ danh sách SectionModel
   */
  private static resolveSectionAtPos(
    sections: SectionModel[],
    pos: number
  ): SectionModel | undefined {
    // Nếu chỉ có 1 section
    if (sections.length <= 1) return sections[0];

    // Duyệt ngược từ section cuối
    for (let i = sections.length - 1; i >= 0; i--) {
      const sec = sections[i];
      if (typeof sec.breakPos === "number" && pos >= sec.breakPos) {
        return sec;
      }
    }

    return sections[0];
  }
}
