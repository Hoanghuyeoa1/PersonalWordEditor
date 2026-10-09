import type { JSONContent } from "@tiptap/core";
import type { PageSettings } from "../types/pageTypes.ts";
import type { SectionModel } from "../types/sectionTypes.ts";
import type {
  SectionHeaderFooter,
  HeaderFooterItem,
} from "../types/headerFooterTypes.ts";
import {
  DEFAULT_HEADER_CONTENT,
  DEFAULT_FOOTER_CONTENT,
  DEFAULT_SECTION_HEADER_FOOTER,
} from "../types/headerFooterTypes.ts";
import { validateAndNormalizePageSettings } from "./pageSettingsService.ts";

/**
 * Trích xuất danh sách các Section logic từ cây ProseMirror AST JSON.
 * - Section 1 luôn bắt đầu từ đầu tài liệu và sử dụng defaultPageSettings & defaultHeaderFooter.
 * - Mỗi node `sectionBreak` sẽ kết thúc section hiện tại và bắt đầu section tiếp theo.
 * - Section mới kế thừa pageSettings và headerFooter từ section trước đó nếu chưa được gán thuộc tính riêng.
 * - Hoàn toàn tương thích ngược với tài liệu Phase 1 và Phase 2.1-2.7 (trả về 1 section duy nhất).
 */
export function extractSections(
  content: JSONContent | null | undefined,
  defaultPageSettings: PageSettings,
  defaultHeaderFooter?: SectionHeaderFooter
): SectionModel[] {
  const normalizedDefault = validateAndNormalizePageSettings(defaultPageSettings);
  const normalizedHeaderFooter: SectionHeaderFooter = defaultHeaderFooter
    ? {
        linkToPrevious: false,
        header: { ...DEFAULT_HEADER_CONTENT, ...defaultHeaderFooter.header },
        footer: { ...DEFAULT_FOOTER_CONTENT, ...defaultHeaderFooter.footer },
      }
    : { ...DEFAULT_SECTION_HEADER_FOOTER };

  const sections: SectionModel[] = [
    {
      index: 1,
      id: "sec-1",
      pageSettings: { ...normalizedDefault },
      headerFooter: normalizedHeaderFooter,
      fromPos: 0,
      toPos: 0,
      breakPos: null,
    },
  ];

  if (!content || !content.content || !Array.isArray(content.content)) {
    return sections;
  }

  let currentSectionIndex = 1;
  let currentPos = 0;

  for (const block of content.content) {
    // Ước tính kích thước ProseMirror node
    // Một block thông thường chiếm text.length + 2 (thẻ mở + thẻ đóng)
    const blockSize = calculateNodeSize(block);

    if (block.type === "sectionBreak") {
      const prevSection = sections[currentSectionIndex - 1];
      prevSection.toPos = currentPos;

      // Section mới kế thừa settings từ section trước nếu không có pageSettings riêng
      const rawSettings = block.attrs?.pageSettings as PageSettings | undefined;
      const sectionSettings = rawSettings
        ? validateAndNormalizePageSettings(rawSettings)
        : {
            paperSize: prevSection.pageSettings.paperSize,
            orientation: prevSection.pageSettings.orientation,
            margins: { ...prevSection.pageSettings.margins },
            marginPreset: prevSection.pageSettings.marginPreset,
          };

      // Header/Footer: kế thừa từ section trước nếu linkToPrevious hoặc chưa có riêng
      const rawHeaderFooter = block.attrs?.headerFooter as SectionHeaderFooter | undefined;
      const sectionHeaderFooter: SectionHeaderFooter = rawHeaderFooter
        ? {
            linkToPrevious: rawHeaderFooter.linkToPrevious ?? true,
            header: {
              ...(prevSection.headerFooter?.header || DEFAULT_HEADER_CONTENT),
              ...rawHeaderFooter.header,
            },
            footer: {
              ...(prevSection.headerFooter?.footer || DEFAULT_FOOTER_CONTENT),
              ...rawHeaderFooter.footer,
            },
          }
        : {
            linkToPrevious: true,
            header: { ...(prevSection.headerFooter?.header || DEFAULT_HEADER_CONTENT) },
            footer: { ...(prevSection.headerFooter?.footer || DEFAULT_FOOTER_CONTENT) },
          };

      currentSectionIndex++;
      const sectionId =
        (block.attrs?.sectionId as string) || `sec-${currentSectionIndex}`;

      sections.push({
        index: currentSectionIndex,
        id: sectionId,
        pageSettings: sectionSettings,
        headerFooter: sectionHeaderFooter,
        fromPos: currentPos + blockSize,
        toPos: currentPos + blockSize,
        breakPos: currentPos,
      });
    }

    currentPos += blockSize;
  }

  // Cập nhật toPos cho section cuối cùng
  const lastSection = sections[sections.length - 1];
  lastSection.toPos = Math.max(lastSection.fromPos, currentPos);

  return sections;
}


/**
 * Tính toán kích thước (nodeSize) của một block node trong cây JSON
 */
function calculateNodeSize(node: JSONContent): number {
  if (node.type === "pageBreak" || node.type === "sectionBreak") {
    return 1;
  }
  let size = 2; // Thẻ mở + thẻ đóng của block node
  if (node.text) {
    size += node.text.length;
  }
  if (node.content && Array.isArray(node.content)) {
    for (const child of node.content) {
      size += calculateNodeSize(child);
    }
  }
  return size;
}

/**
 * Tìm section chứa vị trí con trỏ (cursor position)
 */
export function getSectionAtPos(
  sections: SectionModel[],
  pos: number
): SectionModel {
  if (sections.length === 0) {
    throw new Error("Tài liệu phải có ít nhất 1 section");
  }

  for (let i = sections.length - 1; i >= 0; i--) {
    const sec = sections[i];
    if (pos >= sec.fromPos) {
      return sec;
    }
  }

  return sections[0];
}

/**
 * Cập nhật thiết lập trang của một Section cụ thể trong cây JSON AST.
 * - Nếu là Section 1: Cập nhật defaultPageSettings (document-level).
 * - Nếu là Section k (k > 1): Cập nhật attribute `pageSettings` của node `sectionBreak` tương ứng.
 */
export function updateSectionSettingsInAst(
  content: JSONContent,
  sectionIndex: number,
  newSettings: Partial<PageSettings>,
  currentDefaultSettings: PageSettings
): {
  updatedContent: JSONContent;
  updatedDocSettings: PageSettings;
} {
  const clonedContent = JSON.parse(JSON.stringify(content)) as JSONContent;

  if (sectionIndex <= 1) {
    // Cập nhật cho Section 1
    const merged = validateAndNormalizePageSettings({
      ...currentDefaultSettings,
      ...newSettings,
      margins: newSettings.margins
        ? { ...currentDefaultSettings.margins, ...newSettings.margins }
        : currentDefaultSettings.margins,
    });

    return {
      updatedContent: clonedContent,
      updatedDocSettings: merged,
    };
  }

  // Tìm node sectionBreak thứ (sectionIndex - 1)
  let breakCount = 0;
  const targetBreakIndex = sectionIndex - 1;

  function traverseAndModify(node: JSONContent): boolean {
    if (node.type === "sectionBreak") {
      breakCount++;
      if (breakCount === targetBreakIndex) {
        const existingSettings = (node.attrs?.pageSettings as PageSettings) || currentDefaultSettings;
        const merged = validateAndNormalizePageSettings({
          ...existingSettings,
          ...newSettings,
          margins: newSettings.margins
            ? { ...existingSettings.margins, ...newSettings.margins }
            : existingSettings.margins,
        });

        node.attrs = {
          ...node.attrs,
          pageSettings: merged,
        };
        return true;
      }
    }

    if (node.content && Array.isArray(node.content)) {
      for (const child of node.content) {
        if (traverseAndModify(child)) return true;
      }
    }

    return false;
  }

  traverseAndModify(clonedContent);

  return {
    updatedContent: clonedContent,
    updatedDocSettings: currentDefaultSettings,
  };
}

/**
 * Đếm số lượng node sectionBreak xuất hiện trong tài liệu
 */
export function countSectionBreaks(content?: JSONContent | null): number {
  if (!content || !content.content || !Array.isArray(content.content)) return 0;
  let count = 0;
  for (const block of content.content) {
    if (block.type === "sectionBreak") {
      count++;
    }
  }
  return count;
}

/**
 * Trích xuất danh sách các block node thuộc về một section cụ thể (0-indexed).
 */
export function getBlocksForSection(
  content: JSONContent | null | undefined,
  sectionIndexZeroBased: number
): JSONContent[] {
  if (!content || !content.content || !Array.isArray(content.content)) {
    return [];
  }

  const result: JSONContent[] = [];
  let currentSection = 0;

  for (const block of content.content) {
    if (block.type === "sectionBreak") {
      if (currentSection === sectionIndexZeroBased) {
        break;
      }
      currentSection++;
      continue;
    }

    if (currentSection === sectionIndexZeroBased) {
      result.push(block);
    }
  }

  return result;
}

/**
 * Trả về cấu hình Header và Footer thực tế áp dụng cho section (xử lý linkToPrevious).
 * Nếu section kế thừa từ mục trước, truy vết ngược về section cha gần nhất có cấu hình độc lập.
 */
export function getEffectiveHeaderFooter(
  sections: SectionModel[],
  sectionIndex: number
): { header: HeaderFooterItem; footer: HeaderFooterItem; linkToPrevious: boolean } {
  const targetSection = sections.find((s) => s.index === sectionIndex) || sections[0];
  if (!targetSection || !targetSection.headerFooter) {
    return {
      header: { ...DEFAULT_HEADER_CONTENT },
      footer: { ...DEFAULT_FOOTER_CONTENT },
      linkToPrevious: false,
    };
  }

  const isLinked = targetSection.index > 1 && !!targetSection.headerFooter.linkToPrevious;

  if (!isLinked) {
    return {
      header: { ...targetSection.headerFooter.header },
      footer: { ...targetSection.headerFooter.footer },
      linkToPrevious: false,
    };
  }

  // Truy vết ngược để tìm header/footer từ section trước
  for (let i = targetSection.index - 1; i >= 1; i--) {
    const prevSec = sections.find((s) => s.index === i);
    if (prevSec && prevSec.headerFooter) {
      if (!prevSec.headerFooter.linkToPrevious || prevSec.index === 1) {
        return {
          header: { ...prevSec.headerFooter.header },
          footer: { ...prevSec.headerFooter.footer },
          linkToPrevious: true,
        };
      }
    }
  }

  return {
    header: { ...targetSection.headerFooter.header },
    footer: { ...targetSection.headerFooter.footer },
    linkToPrevious: isLinked,
  };
}

/**
 * Cập nhật cấu hình Header và Footer của một Section cụ thể trong cây JSON AST.
 * - Section 1: Cập nhật defaultHeaderFooter (document-level).
 * - Section k (k > 1): Cập nhật attribute `headerFooter` của node `sectionBreak` tương ứng.
 */
export function updateSectionHeaderFooterInAst(
  content: JSONContent,
  sectionIndex: number,
  partialHeaderFooter: {
    linkToPrevious?: boolean;
    header?: Partial<HeaderFooterItem>;
    footer?: Partial<HeaderFooterItem>;
  },
  currentDefaultHeaderFooter?: SectionHeaderFooter
): {
  updatedContent: JSONContent;
  updatedDefaultHeaderFooter: SectionHeaderFooter;
} {
  const clonedContent = JSON.parse(JSON.stringify(content)) as JSONContent;
  const baseDefault = currentDefaultHeaderFooter || DEFAULT_SECTION_HEADER_FOOTER;

  if (sectionIndex <= 1) {
    const merged: SectionHeaderFooter = {
      linkToPrevious: false,
      header: {
        ...baseDefault.header,
        ...(partialHeaderFooter.header || {}),
      },
      footer: {
        ...baseDefault.footer,
        ...(partialHeaderFooter.footer || {}),
      },
    };

    return {
      updatedContent: clonedContent,
      updatedDefaultHeaderFooter: merged,
    };
  }

  let breakCount = 0;
  const targetBreakIndex = sectionIndex - 1;

  function traverseAndModify(node: JSONContent): boolean {
    if (node.type === "sectionBreak") {
      breakCount++;
      if (breakCount === targetBreakIndex) {
        const existing = (node.attrs?.headerFooter as SectionHeaderFooter) || {
          linkToPrevious: true,
          header: { ...baseDefault.header },
          footer: { ...baseDefault.footer },
        };

        const updated: SectionHeaderFooter = {
          linkToPrevious:
            partialHeaderFooter.linkToPrevious !== undefined
              ? partialHeaderFooter.linkToPrevious
              : existing.linkToPrevious,
          header: {
            ...existing.header,
            ...(partialHeaderFooter.header || {}),
          },
          footer: {
            ...existing.footer,
            ...(partialHeaderFooter.footer || {}),
          },
        };

        node.attrs = {
          ...node.attrs,
          headerFooter: updated,
        };
        return true;
      }
    }

    if (node.content && Array.isArray(node.content)) {
      for (const child of node.content) {
        if (traverseAndModify(child)) return true;
      }
    }

    return false;
  }

  traverseAndModify(clonedContent);

  return {
    updatedContent: clonedContent,
    updatedDefaultHeaderFooter: baseDefault,
  };
}

