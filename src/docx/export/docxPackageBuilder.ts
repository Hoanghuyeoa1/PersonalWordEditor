import JSZip from "jszip";
import type { DocxRelationshipItem } from "../mapping/documentSerializer.ts";
import { ContentTypesManager } from "../packaging/contentTypesManager.ts";
import { validateDocxPackageData } from "../packaging/packageValidator.ts";
import { getPackageRelationshipsNamespace } from "../constants/ooxmlNamespaces.ts";

export interface PackageBuildData {
  documentXml: string;
  stylesXml: string;
  numberingXml: string;
  commentsXml?: string;
  footnotesXml?: string;
  endnotesXml?: string;
  relationships: DocxRelationshipItem[];
  mediaFiles: Map<string, Uint8Array>;
  headerFiles: Map<string, string>;
  footerFiles: Map<string, string>;
  headerRelationships?: Map<string, DocxRelationshipItem[]>;
  footerRelationships?: Map<string, DocxRelationshipItem[]>;
  unsupportedParts?: Map<string, string | Uint8Array>;
  /** Tùy chọn kiểm tra tính hợp lệ trước khi đóng gói */
  validate?: boolean;
}

export interface BuildDocxPackageOptions {
  validate?: boolean;
}

/**
 * Tạo nội dung tệp [Content_Types].xml thông qua ContentTypesManager tập trung
 */
export function buildContentTypesXml(
  headerPartNames: string[],
  footerPartNames: string[],
  hasComments?: boolean,
  hasFootnotes?: boolean,
  hasEndnotes?: boolean
): string {
  const manager = ContentTypesManager.createStandardWordPackage({
    headerPartNames,
    footerPartNames,
    hasComments,
    hasFootnotes,
    hasEndnotes,
  });
  return manager.buildXml();
}

/**
 * Tạo nội dung tệp _rels/.rels
 */
function buildRootRelsXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships ${getPackageRelationshipsNamespace()}>
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;
}

/**
 * Tạo nội dung tệp quan hệ (.rels) cho bất kỳ part nào
 */
export function buildRelationshipsXml(relationships: DocxRelationshipItem[]): string {
  const relItems = relationships.map((rel) => {
    const targetModeAttr = rel.targetMode ? ` TargetMode="${rel.targetMode}"` : "";
    return `  <Relationship Id="${rel.id}" Type="${rel.type}" Target="${rel.target}"${targetModeAttr}/>`;
  });

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships ${getPackageRelationshipsNamespace()}>
${relItems.join("\n")}
</Relationships>`;
}

/**
 * Đóng gói tất cả các thành phần XML và Media thành tệp DOCX (ZIP Uint8Array)
 * Tuân thủ ISO/IEC 29500 WordprocessingML & Open Packaging Conventions.
 */
export async function buildDocxPackage(
  data: PackageBuildData,
  options?: BuildDocxPackageOptions
): Promise<Uint8Array> {
  // Kiểm tra an toàn tính toàn vẹn gói nếu được yêu cầu
  if (data.validate || options?.validate) {
    const validation = validateDocxPackageData(data);
    if (!validation.valid) {
      throw new Error(`Gói DOCX không hợp lệ trước khi đóng gói:\n- ${validation.errors.join("\n- ")}`);
    }
  }

  const zip = new JSZip();

  // 1. [Content_Types].xml (Quản lý tập trung qua ContentTypesManager)
  const headerPartNames = Array.from(data.headerFiles.keys());
  const footerPartNames = Array.from(data.footerFiles.keys());

  const contentTypesManager = ContentTypesManager.createStandardWordPackage({
    headerPartNames,
    footerPartNames,
    hasComments: Boolean(data.commentsXml),
    hasFootnotes: Boolean(data.footnotesXml),
    hasEndnotes: Boolean(data.endnotesXml),
  });

  // Đảm bảo phần mở rộng media đều có Default ContentType
  for (const mediaName of data.mediaFiles.keys()) {
    contentTypesManager.ensureMediaExtension(mediaName);
  }

  // Đảm bảo các unsupported parts (charts, diagrams, settings, themes...) có ContentType chuẩn
  if (data.unsupportedParts) {
    for (const partPath of data.unsupportedParts.keys()) {
      const clean = partPath.replace(/^\/?/, "/");
      const lower = clean.toLowerCase();
      if (lower === "/word/settings.xml") {
        contentTypesManager.addOverride(clean, "application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml");
      } else if (lower.startsWith("/word/theme/")) {
        contentTypesManager.addOverride(clean, "application/vnd.openxmlformats-officedocument.theme+xml");
      } else if (lower === "/word/fonttable.xml") {
        contentTypesManager.addOverride(clean, "application/vnd.openxmlformats-officedocument.wordprocessingml.fontTable+xml");
      } else if (lower.startsWith("/word/charts/")) {
        contentTypesManager.addOverride(clean, "application/vnd.openxmlformats-officedocument.drawingml.chart+xml");
      } else if (lower.startsWith("/word/diagrams/")) {
        contentTypesManager.addOverride(clean, "application/vnd.openxmlformats-officedocument.drawingml.diagramData+xml");
      }
    }
  }

  zip.file("[Content_Types].xml", contentTypesManager.buildXml());

  // 2. _rels/.rels
  zip.file("_rels/.rels", buildRootRelsXml());

  // 3. word/document.xml
  zip.file("word/document.xml", data.documentXml);

  // 4. word/styles.xml
  zip.file("word/styles.xml", data.stylesXml);

  // 5. word/numbering.xml
  zip.file("word/numbering.xml", data.numberingXml);

  // 6. word/comments.xml
  if (data.commentsXml) {
    zip.file("word/comments.xml", data.commentsXml);
  }

  // 6.1 word/footnotes.xml & word/endnotes.xml
  if (data.footnotesXml) {
    zip.file("word/footnotes.xml", data.footnotesXml);
  }
  if (data.endnotesXml) {
    zip.file("word/endnotes.xml", data.endnotesXml);
  }

  // 7. word/_rels/document.xml.rels
  zip.file("word/_rels/document.xml.rels", buildRelationshipsXml(data.relationships));

  // 8. Header and Footer parts & header/footer .rels
  for (const [partName, xmlContent] of data.headerFiles.entries()) {
    zip.file(`word/${partName}`, xmlContent);
  }
  for (const [partName, xmlContent] of data.footerFiles.entries()) {
    zip.file(`word/${partName}`, xmlContent);
  }

  if (data.headerRelationships) {
    for (const [partName, rels] of data.headerRelationships.entries()) {
      if (rels.length > 0) {
        zip.file(`word/_rels/${partName}.rels`, buildRelationshipsXml(rels));
      }
    }
  }

  if (data.footerRelationships) {
    for (const [partName, rels] of data.footerRelationships.entries()) {
      if (rels.length > 0) {
        zip.file(`word/_rels/${partName}.rels`, buildRelationshipsXml(rels));
      }
    }
  }

  // 9. Media items (word/media/*)
  for (const [mediaName, mediaBytes] of data.mediaFiles.entries()) {
    zip.file(`word/media/${mediaName}`, mediaBytes);
  }

  // 10. Unsupported parts preservation (nếu có giữ lại từ file gốc)
  if (data.unsupportedParts) {
    for (const [partPath, partContent] of data.unsupportedParts.entries()) {
      const cleanPath = partPath.replace(/^\//, "");
      zip.file(cleanPath, partContent);
    }
  }

  // Nén ZIP và sinh byte array
  const buffer = await zip.generateAsync({
    type: "uint8array",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });

  return buffer;
}
