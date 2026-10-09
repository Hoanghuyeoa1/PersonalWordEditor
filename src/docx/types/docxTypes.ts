import type { DocumentModel } from "../../document/documentTypes.ts";
import type { HeaderFooterItem } from "../../page/types/headerFooterTypes.ts";
import type { DocxDiagnosticsReporter, DocxCompatibilityReport } from "../diagnostics/docxDiagnostics.ts";

/**
 * Định nghĩa một Relationship trong OOXML (_rels/.rels hoặc word/_rels/document.xml.rels)
 */
export interface DocxRelationship {
  id: string;
  type: string;
  target: string;
  targetMode?: "External" | "Internal";
}

export type DocxRelationshipMap = Map<string, DocxRelationship>;

/**
 * Định dạng ký tự (Run formatting) trích xuất từ w:rPr
 */
export interface DocxRunFormatting {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  fontFamily?: string;
  fontSizePt?: number;
  color?: string;
  highlight?: string;
  linkHref?: string;
}

/**
 * Định dạng đoạn văn (Paragraph formatting) trích xuất từ w:pPr
 */
export interface DocxParagraphFormatting {
  alignment?: "left" | "center" | "right" | "justify";
  lineSpacing?: 1.0 | 1.15 | 1.5 | 2.0 | number;
  indent?: number; // 0..8
  headingLevel?: 1 | 2 | 3;
  numPr?: {
    numId: number;
    ilvl: number;
  };
  pageBreakBefore?: boolean;
  spacingBefore?: number; // Khoảng cách trước đoạn văn (pt)
  spacingAfter?: number; // Khoảng cách sau đoạn văn (pt)
  leftIndent?: number; // Thụt lề trái (pt)
  rightIndent?: number; // Thụt lề phải (pt)
  firstLineIndent?: number; // Thụt lề dòng đầu (pt)
  hangingIndent?: number; // Nhô lề dòng đầu (pt)
  keepWithNext?: boolean; // Giữ liền dòng với đoạn kế tiếp
  keepLinesTogether?: boolean; // Giữ các dòng trong đoạn cùng một trang
  widowControl?: boolean; // Kiểm soát dòng mồ côi / góa phụ
}

/**
 * Định nghĩa Style trích xuất từ word/styles.xml
 */
export interface DocxStyle {
  id: string;
  name: string;
  type: "paragraph" | "character" | "table" | "numbering";
  basedOn?: string;
  nextStyleId?: string;
  linkStyleId?: string;
  isDefault?: boolean;
  qFormat?: boolean;
  headingLevel?: 1 | 2 | 3;
  runFormatting: DocxRunFormatting;
  paragraphFormatting: DocxParagraphFormatting;
  rawRunFormatting?: DocxRunFormatting;
  rawParagraphFormatting?: DocxParagraphFormatting;
}

export type DocxStyleMap = Map<string, DocxStyle>;

/**
 * Cấp độ đánh số danh sách từ word/numbering.xml
 */
export interface DocxNumberingLevel {
  level: number;
  numFmt: string; // "bullet", "decimal", "lowerLetter", etc.
  lvlText: string;
  start: number;
  isBullet: boolean;
}

/**
 * Abstract Numbering definition
 */
export interface DocxAbstractNum {
  id: string;
  levels: Map<number, DocxNumberingLevel>;
}

/**
 * Numbering instance definition
 */
export interface DocxNumInstance {
  numId: string;
  abstractNumId: string;
}

export interface DocxNumberingRegistry {
  abstractNums: Map<string, DocxAbstractNum>;
  numInstances: Map<string, DocxNumInstance>;
}

/**
 * Đối tượng Media (ảnh trích xuất từ word/media/)
 */
export interface DocxMediaItem {
  filename: string;
  zipPath: string;
  mimeType: string;
  dataUrl: string;
}

export type DocxMediaMap = Map<string, DocxMediaItem>;

/**
 * Gói DOCX unzipped đã nạp các parts XML và media
 */
export interface DocxPackageParts {
  documentXml?: string;
  stylesXml?: string;
  numberingXml?: string;
  documentRelsXml?: string;
  coreRelsXml?: string;
  commentsXml?: string;
  footnotesXml?: string;
  endnotesXml?: string;
  headersXml: Map<string, string>;
  footersXml: Map<string, string>;
  headerRelsXml?: Map<string, string>;
  footerRelsXml?: Map<string, string>;
  mediaFiles: Map<string, Uint8Array>;
  unsupportedParts?: Map<string, string | Uint8Array>;
  hasMacro?: boolean;
}

/**
 * Bình luận trích xuất từ word/comments.xml (Phase 5.8)
 */
export interface DocxParsedComment {
  id: string;
  author: string;
  date: string;
  content: string;
  resolved?: boolean;
  initials?: string;
  parentCommentId?: string;
}

export type DocxCommentMap = Map<string, DocxParsedComment>;

/**
 * Kết quả phân tích Header / Footer từ DOCX
 */
export interface DocxParsedHeaderFooter {
  header?: HeaderFooterItem;
  footer?: HeaderFooterItem;
}

/**
 * Kết quả nhập tệp DOCX (Import Result)
 */
export type DocxImportResult =
  | {
      success: true;
      document: DocumentModel;
      warnings: string[];
      diagnostics?: DocxDiagnosticsReporter;
      compatibilityReport?: DocxCompatibilityReport;
    }
  | {
      success: false;
      error: string;
      warnings: string[];
      diagnostics?: DocxDiagnosticsReporter;
      compatibilityReport?: DocxCompatibilityReport;
    };
