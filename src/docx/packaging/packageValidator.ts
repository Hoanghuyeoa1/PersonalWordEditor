/**
 * Bộ kiểm tra tính toàn vẹn gói OOXML (Package Validation Helpers)
 *
 * Kiểm tra các tiêu chí an toàn cốt lõi trước khi ghi tệp .docx:
 * - Các part bắt buộc tồn tại.
 * - Relationships không bị treo (dangling: trỏ đến tệp không có trong package).
 * - Media relationship trỏ đến tệp nhị phân hợp lệ.
 * - Các XML parts là XML hợp lệ, parseable.
 * - Không có duplicate IDs cơ bản (docPr id, bookmark id).
 */

import { parseXmlString } from "../utils/xmlUtils.ts";
import type { DocxRelationshipItem } from "../mapping/documentSerializer.ts";

export interface PackageValidationInput {
  documentXml: string;
  stylesXml?: string;
  numberingXml?: string;
  commentsXml?: string;
  footnotesXml?: string;
  endnotesXml?: string;
  relationships: DocxRelationshipItem[];
  mediaFiles: Map<string, Uint8Array>;
  headerFiles: Map<string, string>;
  footerFiles: Map<string, string>;
  headerRelationships?: Map<string, DocxRelationshipItem[]>;
  footerRelationships?: Map<string, DocxRelationshipItem[]>;
}

export interface PackageValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Kiểm tra tính hợp lệ của dữ liệu đóng gói DOCX
 */
export function validateDocxPackageData(data: PackageValidationInput): PackageValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 1. Kiểm tra các thành phần bắt buộc
  if (!data.documentXml || !data.documentXml.trim()) {
    errors.push("Thiếu thành phần bắt buộc: word/document.xml rỗng hoặc không tồn tại.");
  }

  // 2. Kiểm tra tính parseable của các XML parts
  let parsedDoc: Document | null = null;
  if (data.documentXml) {
    try {
      parsedDoc = parseXmlString(data.documentXml);
    } catch (err) {
      errors.push(`word/document.xml không phải XML hợp lệ: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (data.stylesXml) {
    try {
      parseXmlString(data.stylesXml);
    } catch (err) {
      errors.push(`word/styles.xml không phải XML hợp lệ: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (data.numberingXml) {
    try {
      parseXmlString(data.numberingXml);
    } catch (err) {
      errors.push(`word/numbering.xml không phải XML hợp lệ: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (data.commentsXml) {
    try {
      parseXmlString(data.commentsXml);
    } catch (err) {
      errors.push(`word/comments.xml không phải XML hợp lệ: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (data.footnotesXml) {
    try {
      parseXmlString(data.footnotesXml);
    } catch (err) {
      errors.push(`word/footnotes.xml không phải XML hợp lệ: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (data.endnotesXml) {
    try {
      parseXmlString(data.endnotesXml);
    } catch (err) {
      errors.push(`word/endnotes.xml không phải XML hợp lệ: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (data.headerFiles) {
    for (const [hdrName, hdrXml] of data.headerFiles.entries()) {
      try {
        parseXmlString(hdrXml);
      } catch (err) {
        errors.push(`word/${hdrName} không phải XML hợp lệ: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  if (data.footerFiles) {
    for (const [ftrName, ftrXml] of data.footerFiles.entries()) {
      try {
        parseXmlString(ftrXml);
      } catch (err) {
        errors.push(`word/${ftrName} không phải XML hợp lệ: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  // 3. Kiểm tra Dangling Relationships trong document.xml.rels
  const mediaNamesSet = new Set<string>();
  for (const k of data.mediaFiles.keys()) {
    mediaNamesSet.add(k.toLowerCase());
    mediaNamesSet.add(`media/${k}`.toLowerCase());
  }

  const headerNamesSet = new Set<string>();
  for (const k of data.headerFiles.keys()) {
    headerNamesSet.add(k.toLowerCase());
    headerNamesSet.add(`word/${k}`.toLowerCase());
  }

  const footerNamesSet = new Set<string>();
  for (const k of data.footerFiles.keys()) {
    footerNamesSet.add(k.toLowerCase());
    footerNamesSet.add(`word/${k}`.toLowerCase());
  }

  const seenRelIds = new Set<string>();

  for (const rel of data.relationships) {
    // Kiểm tra trùng lặp rId
    if (seenRelIds.has(rel.id)) {
      errors.push(`Trùng lặp Relationship ID trong document.xml.rels: '${rel.id}'`);
    }
    seenRelIds.add(rel.id);

    // Bỏ qua external links (vd: URL web)
    if (rel.targetMode === "External") {
      continue;
    }

    const targetLower = rel.target.toLowerCase();

    // Kiểm tra media target
    if (targetLower.startsWith("media/") || targetLower.includes("/media/")) {
      const cleanMedia = targetLower.replace(/^.*?media\//, "media/");
      const baseMedia = targetLower.split("/").pop() || "";
      if (!mediaNamesSet.has(cleanMedia) && !mediaNamesSet.has(baseMedia)) {
        errors.push(`Dangling relationship: '${rel.id}' trỏ đến media '${rel.target}' không tồn tại trong gói.`);
      }
    }
    // Kiểm tra header target
    else if (targetLower.startsWith("header") || targetLower.includes("header")) {
      const cleanHeader = targetLower.replace(/^word\//, "");
      if (!headerNamesSet.has(cleanHeader)) {
        errors.push(`Dangling relationship: '${rel.id}' trỏ đến header '${rel.target}' không tồn tại trong gói.`);
      }
    }
    // Kiểm tra footer target
    else if (targetLower.startsWith("footer") || targetLower.includes("footer")) {
      const cleanFooter = targetLower.replace(/^word\//, "");
      if (!footerNamesSet.has(cleanFooter)) {
        errors.push(`Dangling relationship: '${rel.id}' trỏ đến footer '${rel.target}' không tồn tại trong gói.`);
      }
    }
    // Kiểm tra comments target
    else if (targetLower.includes("comments.xml")) {
      if (!data.commentsXml) {
        errors.push(`Dangling relationship: '${rel.id}' trỏ đến comments.xml nhưng commentsXml không có.`);
      }
    }
    // Kiểm tra footnotes target
    else if (targetLower.includes("footnotes.xml")) {
      if (!data.footnotesXml) {
        errors.push(`Dangling relationship: '${rel.id}' trỏ đến footnotes.xml nhưng footnotesXml không có.`);
      }
    }
    // Kiểm tra endnotes target
    else if (targetLower.includes("endnotes.xml")) {
      if (!data.endnotesXml) {
        errors.push(`Dangling relationship: '${rel.id}' trỏ đến endnotes.xml nhưng endnotesXml không có.`);
      }
    }
  }

  // 4. Kiểm tra Header / Footer relationships nếu có
  if (data.headerRelationships) {
    for (const [hdrPart, rels] of data.headerRelationships.entries()) {
      const seenHdrRelIds = new Set<string>();
      for (const rel of rels) {
        if (seenHdrRelIds.has(rel.id)) {
          errors.push(`Trùng lặp Relationship ID trong ${hdrPart}.rels: '${rel.id}'`);
        }
        seenHdrRelIds.add(rel.id);
      }
    }
  }

  // 5. Kiểm tra duplicate IDs trong document.xml
  if (parsedDoc) {
    // 5.1 Kiểm tra duplicate docPr IDs
    const docPrElements = parsedDoc.getElementsByTagName("wp:docPr");
    const seenDocPrIds = new Set<string>();
    for (let i = 0; i < docPrElements.length; i++) {
      const id = docPrElements[i].getAttribute("id");
      if (id) {
        if (seenDocPrIds.has(id)) {
          errors.push(`Phát hiện trùng lặp wp:docPr id='${id}' trong word/document.xml`);
        }
        seenDocPrIds.add(id);
      }
    }

    // 5.2 Kiểm tra duplicate Bookmark IDs
    const bookmarkStartElements = parsedDoc.getElementsByTagName("w:bookmarkStart");
    const seenBookmarkIds = new Set<string>();
    for (let i = 0; i < bookmarkStartElements.length; i++) {
      const id = bookmarkStartElements[i].getAttribute("w:id") || bookmarkStartElements[i].getAttribute("id");
      if (id) {
        if (seenBookmarkIds.has(id)) {
          errors.push(`Phát hiện trùng lặp w:bookmarkStart w:id='${id}' trong word/document.xml`);
        }
        seenBookmarkIds.add(id);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
