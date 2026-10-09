/**
 * Quản lý tập trung các Không gian tên OOXML (OOXML Namespaces)
 * Tuân thủ ISO/IEC 29500 WordprocessingML, DrawingML, VML và Office Math.
 */

export const OOXML_NAMESPACES = {
  /** WordprocessingML Main */
  w: "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
  /** Office Document Relationships */
  r: "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
  /** Office Math Markup Language (OMML) */
  m: "http://schemas.openxmlformats.org/officeDocument/2006/math",
  /** Wordprocessing Drawing (DrawingML for Word) */
  wp: "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing",
  /** DrawingML Main */
  a: "http://schemas.openxmlformats.org/drawingml/2006/main",
  /** DrawingML Picture */
  pic: "http://schemas.openxmlformats.org/drawingml/2006/picture",
  /** Wordprocessing Shape (Office 2010+) */
  wps: "http://schemas.microsoft.com/office/word/2010/wordprocessingShape",
  /** Vector Markup Language (Legacy VML) */
  v: "urn:schemas-microsoft-com:vml",
  /** Office VML Extensions */
  o: "urn:schemas-microsoft-com:office:office",
  /** Markup Compatibility */
  mc: "http://schemas.openxmlformats.org/markup-compatibility/2006",
  /** Package Relationships (_rels) */
  packageRelationships: "http://schemas.openxmlformats.org/package/2006/relationships",
  /** Package Content Types ([Content_Types].xml) */
  contentTypes: "http://schemas.openxmlformats.org/package/2006/content-types",
} as const;

export type OoxmlNamespacePrefix = keyof typeof OOXML_NAMESPACES;

/**
 * Xây dựng chuỗi thuộc tính XML namespace từ danh sách tiền tố được chỉ định.
 * Tránh việc định nghĩa lặp lại hoặc thiếu sót namespace.
 */
export function buildNamespaceAttributes(
  prefixes: (keyof typeof OOXML_NAMESPACES)[],
  options?: { defaultPrefix?: keyof typeof OOXML_NAMESPACES }
): string {
  const seen = new Set<string>();
  const attrs: string[] = [];

  if (options?.defaultPrefix) {
    const defaultUri = OOXML_NAMESPACES[options.defaultPrefix];
    if (defaultUri) {
      attrs.push(`xmlns="${defaultUri}"`);
      seen.add(options.defaultPrefix);
    }
  }

  for (const prefix of prefixes) {
    if (seen.has(prefix)) continue;
    seen.add(prefix);
    const uri = OOXML_NAMESPACES[prefix];
    if (uri) {
      attrs.push(`xmlns:${prefix}="${uri}"`);
    }
  }

  return attrs.join("\n            ");
}

/**
 * Tập hợp namespace chuẩn cho word/document.xml
 * Bao gồm đầy đủ w, r, m, wp, a, pic, wps, v, o, mc để hỗ trợ Math, Drawing, Shapes, VML an toàn.
 */
export function getDocumentXmlNamespaces(): string {
  return buildNamespaceAttributes(["w", "r", "m", "wp", "a", "pic", "wps", "v", "o", "mc"]);
}

/**
 * Tập hợp namespace chuẩn cho word/styles.xml
 */
export function getStylesXmlNamespaces(): string {
  return buildNamespaceAttributes(["w", "r"]);
}

/**
 * Tập hợp namespace chuẩn cho word/numbering.xml
 */
export function getNumberingXmlNamespaces(): string {
  return buildNamespaceAttributes(["w"]);
}

/**
 * Tập hợp namespace chuẩn cho Header / Footer XML parts
 */
export function getHeaderFooterXmlNamespaces(): string {
  return buildNamespaceAttributes(["w", "r", "wp", "a", "pic"]);
}

/**
 * Tập hợp namespace chuẩn cho word/comments.xml
 */
export function getCommentsXmlNamespaces(): string {
  return buildNamespaceAttributes(["w", "r"]);
}

/**
 * Tập hợp namespace chuẩn cho Footnotes / Endnotes
 */
export function getNotesXmlNamespaces(): string {
  return buildNamespaceAttributes(["w", "r"]);
}

/**
 * Namespace chuẩn cho các tệp quan hệ .rels
 */
export function getPackageRelationshipsNamespace(): string {
  return `xmlns="${OOXML_NAMESPACES.packageRelationships}"`;
}

/**
 * Namespace chuẩn cho tệp [Content_Types].xml
 */
export function getContentTypesNamespace(): string {
  return `xmlns="${OOXML_NAMESPACES.contentTypes}"`;
}
