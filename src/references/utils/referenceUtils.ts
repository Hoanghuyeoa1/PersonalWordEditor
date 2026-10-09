import type {
  ReferenceGroup,
  ReferenceTargetType,
  ReferenceAnchor,
} from "../types/referencesTypes.ts";

/**
 * References Utilities - Personal Word Editor (Phase 6.1 Architecture)
 */

export const REFERENCE_GROUP_NAMES: Record<ReferenceGroup, { vi: string; en: string }> = {
  toc: { vi: "Mục lục", en: "Table of Contents" },
  footnotes: { vi: "Chú thích chân trang", en: "Footnotes" },
  endnotes: { vi: "Chú thích cuối tài liệu", en: "Endnotes" },
  citations: { vi: "Trích dẫn", en: "Citations" },
  bibliography: { vi: "Thư mục tài liệu", en: "Bibliography" },
  captions: { vi: "Nhãn đối tượng & Bảng", en: "Captions" },
  crossReference: { vi: "Tham chiếu chéo", en: "Cross-reference" },
  navigation: { vi: "Điều hướng đề mục", en: "Heading Navigation" },
};

export const REFERENCE_TARGET_NAMES: Record<ReferenceTargetType, { vi: string; en: string }> = {
  heading: { vi: "Tiêu đề", en: "Heading" },
  caption: { vi: "Chú thích đối tượng", en: "Caption" },
  footnote: { vi: "Chú thích cuối trang", en: "Footnote" },
  endnote: { vi: "Chú thích cuối văn bản", en: "Endnote" },
  citation: { vi: "Trích dẫn nguồn", en: "Citation" },
  bookmark: { vi: "Thẻ đánh dấu", en: "Bookmark" },
};

/**
 * Lấy tên nhóm tham chiếu theo ngôn ngữ
 */
export function getReferenceGroupDisplayName(group: ReferenceGroup, lang: "vi" | "en" = "vi"): string {
  return REFERENCE_GROUP_NAMES[group]?.[lang] ?? group;
}

/**
 * Lấy tên loại mục tiêu theo ngôn ngữ
 */
export function getReferenceTargetDisplayName(type: ReferenceTargetType, lang: "vi" | "en" = "vi"): string {
  return REFERENCE_TARGET_NAMES[type]?.[lang] ?? type;
}

/**
 * Định dạng nhãn hiển thị của anchor
 */
export function formatAnchorDisplay(anchor: ReferenceAnchor): string {
  const typeName = getReferenceTargetDisplayName(anchor.targetType, "vi");
  if (anchor.targetType === "heading" && anchor.metadata?.level) {
    return `[H${anchor.metadata.level}] ${anchor.label}`;
  }
  return `[${typeName}] ${anchor.label}`;
}

/**
 * Lọc danh sách anchor theo loại mục tiêu
 */
export function filterAnchorsByType(anchors: ReferenceAnchor[], type: ReferenceTargetType): ReferenceAnchor[] {
  return anchors.filter((a) => a.targetType === type);
}
