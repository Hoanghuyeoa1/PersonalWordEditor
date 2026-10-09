import type { Editor, JSONContent } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { HeadingService } from "./headingService.ts";
import type { SectionModel } from "../../page/types/sectionTypes.ts";
import { usePaginationStore } from "../../stores/paginationStore.ts";
import type {
  TocConfig,
  TocEntry,
  TocNodeAttrs,
  TocPreset,
} from "../types/tocTypes.ts";
import type { ReferenceCommandResult } from "../types/referencesTypes.ts";
import { ensureEditorPlugins } from "../../editor/editorCommands.ts";
import { buildPageLayoutMap, type PageLayoutMap } from "../../page/services/pageLayoutMap.ts";
import { DEFAULT_PAGE_SETTINGS } from "../../page/services/pageConstants.ts";

/**
 * Table of Contents Service - Personal Word Editor (Phase 6.3)
 *
 * Chịu trách nhiệm:
 * 1. Sinh danh sách TocEntry từ ProseMirror AST (Heading 1-3 là source of truth).
 * 2. Tính toán và đồng bộ số trang (Page numbers) cho từng đề mục.
 * 3. Chèn, Cập nhật (F9 / Update TOC), và Xóa khối Mục lục qua ProseMirror transaction.
 * 4. Điều hướng con trỏ và cuộn tới Heading tương ứng khi nhấp vào mục lục.
 * 5. Ngăn chặn tuyệt đối hiện tượng đệ quy (TOC tự chèn vào chính nó) hoặc nested TOC.
 */
export class TocService {

  /**
   * Tính toán số trang cho một vị trí Heading trong tài liệu
   * Sử dụng authoritative PageLayoutMap để bảo đảm tính chính xác và không có stale cache (Phase 10).
   */
  static resolveHeadingPageNumber(
    headingPos: number,
    doc?: ProseMirrorNode | JSONContent,
    layoutMapOrPageCount?: number | PageLayoutMap | null
  ): number {
    // 1. Nếu caller truyền layoutMap trực tiếp
    if (
      layoutMapOrPageCount &&
      typeof (layoutMapOrPageCount as any).getPageNumberForPosition === "function"
    ) {
      return (layoutMapOrPageCount as PageLayoutMap).getPageNumberForPosition(headingPos);
    }

    // 2. Tra cứu từ Zustand store tập trung
    const storeLayout = usePaginationStore.getState().layoutMap;
    if (storeLayout && typeof storeLayout.getPageNumberForPosition === "function") {
      return storeLayout.getPageNumberForPosition(headingPos);
    }

    // 3. Nếu chưa có layoutMap nhưng có doc AST, tính layout map động
    if (doc) {
      try {
        const json =
          doc && typeof (doc as any).toJSON === "function"
            ? (doc as any).toJSON()
            : doc;
        if (json && typeof json === "object") {
          const freshLayout = buildPageLayoutMap(json, DEFAULT_PAGE_SETTINGS);
          return freshLayout.getPageNumberForPosition(headingPos);
        }
      } catch {
        // Fallback an toàn nếu doc không hợp lệ
      }
    }

    // 4. Fallback qua pageCount nếu là số
    if (typeof layoutMapOrPageCount === "number" && layoutMapOrPageCount > 1) {
      const pageCount = layoutMapOrPageCount;
      const totalSize = (doc && typeof (doc as any).content?.size === "number")
        ? (doc as any).content.size
        : 1000;
      const ratio = Math.max(0, Math.min(1, headingPos / totalSize));
      return Math.min(pageCount, Math.max(1, Math.ceil(ratio * pageCount)));
    }

    return 1;
  }

  /**
   * Sinh danh sách các mục trong TOC từ cấu trúc Heading hiện tại
   */
  static generateTocEntries(
    doc: ProseMirrorNode | JSONContent,
    config?: TocConfig,
    sections?: SectionModel[],
    layoutMapOrPageCount?: number | PageLayoutMap | null
  ): TocEntry[] {
    const includedLevels = config?.includedLevels || [1, 2, 3];
    const rawHeadings = HeadingService.extractHeadings(doc, sections);

    // Lọc theo các level được người dùng cấu hình (mặc định 1, 2, 3)
    const filteredHeadings = rawHeadings.filter((h) =>
      includedLevels.includes(h.level)
    );

    return filteredHeadings.map((h) => {
      const pageNumber = this.resolveHeadingPageNumber(
        h.from,
        doc,
        layoutMapOrPageCount
      );
      return {
        headingId: h.id,
        level: h.level,
        text: h.text,
        pageNumber,
      };
    });
  }

  /**
   * Tìm node TableOfContents đầu tiên trong tài liệu
   */
  static findTocNode(
    doc: ProseMirrorNode
  ): { pos: number; node: ProseMirrorNode } | null {
    let result: { pos: number; node: ProseMirrorNode } | null = null;
    doc.descendants((node, pos) => {
      if (node.type.name === "tableOfContents") {
        result = { pos, node };
        return false; // Dừng duyệt sâu vào node này
      }
      return true;
    });
    return result;
  }

  /**
   * Kiểm tra tài liệu hiện tại đã có khối Mục lục hay chưa
   */
  static hasToc(doc: ProseMirrorNode): boolean {
    return this.findTocNode(doc) !== null;
  }

  /**
   * Chèn khối Mục lục mới vào tài liệu
   */
  static insertToc(
    editor: Editor,
    config?: TocConfig,
    sections?: SectionModel[]
  ): ReferenceCommandResult {
    if (!editor || !editor.state) {
      return {
        success: false,
        itemType: "insertToc",
        message: "Editor chưa sẵn sàng để chèn mục lục.",
      };
    }

    ensureEditorPlugins(editor);

    const { schema } = editor.state;
    const tocNodeType = schema.nodes.tableOfContents;
    if (!tocNodeType) {
      return {
        success: false,
        itemType: "insertToc",
        message: "Schema editor chưa đăng ký TableOfContents extension.",
      };
    }

    const freshLayout = buildPageLayoutMap(editor.getJSON(), DEFAULT_PAGE_SETTINGS);
    const entries = this.generateTocEntries(
      editor.state.doc,
      config,
      sections,
      freshLayout
    );

    const title = config?.title?.trim() || "Mục lục";
    const includedLevels = config?.includedLevels || [1, 2, 3];
    const showPageNumbers = config?.showPageNumbers !== false;
    const rightAlignPageNumbers = config?.rightAlignPageNumbers !== false;
    const preset: TocPreset = config?.preset || "classic";
    const lastUpdated = new Date().toISOString();

    const tocAttrs: TocNodeAttrs = {
      title,
      includedLevels,
      showPageNumbers,
      rightAlignPageNumbers,
      preset,
      entries,
      lastUpdated,
    };

    const tocNode = tocNodeType.create(tocAttrs);

    // Chèn qua transaction chuẩn ProseMirror
    const { tr } = editor.state;
    tr.replaceSelectionWith(tocNode);
    tr.setMeta("addToHistory", true);
    tr.setMeta("isTocInsert", true);

    editor.view.dispatch(tr);

    return {
      success: true,
      itemType: "insertToc",
      message: `Đã chèn Mục lục thành công với ${entries.length} đề mục.`,
      details: { entriesCount: entries.length, title },
    };
  }

  /**
   * Cập nhật khối Mục lục (F9 / Update TOC)
   */
  static updateToc(
    editor: Editor,
    options?: {
      updatePageNumbersOnly?: boolean;
      sections?: SectionModel[];
    }
  ): ReferenceCommandResult {
    if (!editor || !editor.state) {
      return {
        success: false,
        itemType: "updateToc",
        message: "Editor chưa sẵn sàng để cập nhật mục lục.",
      };
    }

    ensureEditorPlugins(editor);

    const found = this.findTocNode(editor.state.doc);
    if (!found) {
      return {
        success: false,
        itemType: "updateToc",
        message: "Không tìm thấy khối Mục lục nào trong tài liệu để cập nhật.",
      };
    }

    const currentAttrs = found.node.attrs as TocNodeAttrs;
    // Xây dựng fresh PageLayoutMap từ JSON hiện tại để bảo đảm không stale cache (Phase 10)
    const freshLayout = buildPageLayoutMap(editor.getJSON(), DEFAULT_PAGE_SETTINGS);

    let newEntries: TocEntry[];

    if (options?.updatePageNumbersOnly) {
      // Chỉ cập nhật lại số trang cho các heading hiện hữu
      const latestHeadings = HeadingService.extractHeadings(
        editor.state.doc,
        options?.sections
      );
      const headingPosMap = new Map<string, number>();
      latestHeadings.forEach((h) => headingPosMap.set(h.id, h.from));

      newEntries = currentAttrs.entries.map((entry) => {
        const pos = headingPosMap.get(entry.headingId);
        if (pos !== undefined) {
          const updatedPage = this.resolveHeadingPageNumber(
            pos,
            editor.state.doc,
            freshLayout
          );
          return { ...entry, pageNumber: updatedPage };
        }
        return entry;
      });
    } else {
      // Cập nhật toàn bộ bảng mục lục (heading text mới, heading mới thêm/xóa, cấp độ mới)
      newEntries = this.generateTocEntries(
        editor.state.doc,
        currentAttrs,
        options?.sections,
        freshLayout
      );
    }

    const updatedAttrs: TocNodeAttrs = {
      ...currentAttrs,
      entries: newEntries,
      lastUpdated: new Date().toISOString(),
    };

    // Sử dụng setNodeMarkup để cập nhật trực tiếp attributes của atom node
    // Đảm bảo không làm thay đổi các khối text khác hay phát sinh tracked changes không mong muốn
    const { tr } = editor.state;
    tr.setNodeMarkup(found.pos, undefined, updatedAttrs);
    tr.setMeta("addToHistory", true);
    tr.setMeta("isTocUpdate", true);

    editor.view.dispatch(tr);

    return {
      success: true,
      itemType: "updateToc",
      message: `Đã cập nhật Mục lục thành công (${newEntries.length} đề mục).`,
      details: {
        entriesCount: newEntries.length,
        isPageNumbersOnly: Boolean(options?.updatePageNumbersOnly),
      },
    };
  }

  /**
   * Xóa khối Mục lục khỏi tài liệu
   */
  static removeToc(editor: Editor): ReferenceCommandResult {
    if (!editor || !editor.state) {
      return {
        success: false,
        itemType: "removeToc",
        message: "Editor chưa sẵn sàng để xóa mục lục.",
      };
    }

    ensureEditorPlugins(editor);

    const found = this.findTocNode(editor.state.doc);
    if (!found) {
      return {
        success: false,
        itemType: "removeToc",
        message: "Không tìm thấy khối Mục lục nào để xóa.",
      };
    }

    const { tr } = editor.state;
    tr.delete(found.pos, found.pos + found.node.nodeSize);
    tr.setMeta("addToHistory", true);
    tr.setMeta("isTocRemove", true);

    editor.view.dispatch(tr);

    return {
      success: true,
      itemType: "removeToc",
      message: "Đã xóa khối Mục lục thành công.",
    };
  }

  /**
   * Điều hướng con trỏ tới Heading khi người dùng nhấp vào một mục trong TOC
   */
  static navigateToEntry(editor: Editor, headingId: string): boolean {
    return HeadingService.navigateToHeading(editor, headingId);
  }
}
