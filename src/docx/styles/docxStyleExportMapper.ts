/**
 * Module ánh xạ định danh Style (Style ID) từ Styles Engine 2.0 sang WordprocessingML OOXML word/styles.xml.
 *
 * Tiêu chí:
 * - XML-safe (tuân thủ định dạng XML NCName: chỉ chứa a-z, A-Z, 0-9, _, -; bắt đầu bằng chữ cái).
 * - Stable & Deterministic trong một tài liệu (cùng định nghĩa -> luôn cho cùng Word styleId).
 * - Không collision (tránh xung đột với built-in styles hoặc các custom styles khác).
 * - Không dùng display name làm identity duy nhất (xử lý trùng display name an toàn).
 */

import type { DocumentStylesMetadata, DocumentStyle } from "../../styles/types/styleTypes.ts";
import {
  STYLE_NORMAL_ID,
  STYLE_HEADING_1_ID,
  STYLE_HEADING_2_ID,
  STYLE_HEADING_3_ID,
  STYLE_EMPHASIS_ID,
  STYLE_STRONG_ID,
} from "../../styles/services/builtInStyles.ts";

export interface StyleExportMappingResult {
  internalToWordId: Map<string, string>;
  wordToInternalId: Map<string, string>;
}

/**
 * Danh sách các Word styleId hệ thống được bảo lưu để tránh xung đột
 */
const RESERVED_WORD_STYLE_IDS = new Set([
  "Normal",
  "Heading1",
  "Heading2",
  "Heading3",
  "Emphasis",
  "Strong",
  "DefaultParagraphFont",
  "FootnoteReference",
  "FootnoteText",
  "EndnoteReference",
  "EndnoteText",
  "Caption",
  "Bibliography",
  "TOCHeading",
  "TOC1",
  "TOC2",
  "TOC3",
  "TableofFigures",
]);

/**
 * Chuyển đổi một chuỗi bất kỳ thành định danh XML NCName an toàn (PascalCase, ASCII alphanumeric)
 */
export function sanitizeToXmlNcName(input: string, fallback = "CustomStyle"): string {
  if (!input || !input.trim()) return fallback;

  // 1. Loại bỏ dấu tiếng Việt và dấu thanh Unicode
  const normalized = input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D");

  // 2. Tách thành các từ theo ký tự đặc biệt / khoảng trắng
  const words = normalized
    .split(/[^a-zA-Z0-9]+/)
    .filter((w) => w.length > 0);

  if (words.length === 0) {
    return fallback;
  }

  // 3. Ghép thành PascalCase
  let result = words
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join("");

  // 4. Nếu bắt đầu bằng chữ số, thêm tiền tố hợp lệ
  if (/^[0-9]/.test(result)) {
    result = `Style_${result}`;
  }

  // 5. Kiểm tra ký tự NCName hợp lệ cuối cùng
  result = result.replace(/[^a-zA-Z0-9_]/g, "_");

  return result || fallback;
}

/**
 * Xây dựng bản đồ ánh xạ 2 chiều giữa Internal Style ID và Word Style ID cho quá trình xuất DOCX
 */
export function buildStyleExportMapping(
  stylesMetadata?: DocumentStylesMetadata
): StyleExportMappingResult {
  const internalToWordId = new Map<string, string>();
  const wordToInternalId = new Map<string, string>();
  const usedWordIds = new Set<string>();

  // 1. Đăng ký các built-in styles tiêu chuẩn
  const registerBuiltIn = (internalId: string, wordId: string) => {
    internalToWordId.set(internalId, wordId);
    wordToInternalId.set(wordId, internalId);
    usedWordIds.add(wordId);
  };

  registerBuiltIn(STYLE_NORMAL_ID, "Normal");
  registerBuiltIn(STYLE_HEADING_1_ID, "Heading1");
  registerBuiltIn(STYLE_HEADING_2_ID, "Heading2");
  registerBuiltIn(STYLE_HEADING_3_ID, "Heading3");
  registerBuiltIn(STYLE_EMPHASIS_ID, "Emphasis");
  registerBuiltIn(STYLE_STRONG_ID, "Strong");

  // Đánh dấu các reserved system IDs khác là đã dùng
  for (const reserved of RESERVED_WORD_STYLE_IDS) {
    usedWordIds.add(reserved);
  }

  const definitions: DocumentStyle[] = stylesMetadata?.definitions || [];

  // 2. Duyệt các style còn lại trong definitions
  definitions.forEach((style, index) => {
    // Nếu đã là built-in đã đăng ký ở trên, bỏ qua
    if (internalToWordId.has(style.id)) {
      return;
    }

    // Xác định tên cơ sở thích hợp để sinh Word styleId (Ưu tiên wordStyleId gốc đã lưu)
    let candidate = "";
    if (style.wordStyleId && style.wordStyleId.trim()) {
      candidate = sanitizeToXmlNcName(style.wordStyleId.trim(), `Style_${index + 1}`);
    } else if (style.id.startsWith("style_docx_")) {
      // Giữ nguyên hoặc tái tạo lại từ phần sau prefix nếu khả thi
      const strippedId = style.id.replace(/^style_docx_/, "");
      candidate = sanitizeToXmlNcName(strippedId, `Style_${index + 1}`);
    } else {
      const baseName = style.name || style.id;
      candidate = sanitizeToXmlNcName(baseName, `Style_${index + 1}`);
    }

    // Giải quyết xung đột nếu candidate đã bị sử dụng
    if (usedWordIds.has(candidate)) {
      let counter = 2;
      let disambiguated = `${candidate}_${counter}`;
      while (usedWordIds.has(disambiguated)) {
        counter++;
        disambiguated = `${candidate}_${counter}`;
      }
      candidate = disambiguated;
    }

    usedWordIds.add(candidate);
    internalToWordId.set(style.id, candidate);
    wordToInternalId.set(candidate, style.id);
  });

  return { internalToWordId, wordToInternalId };
}
