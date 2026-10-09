import type { DocumentModel } from "../../document/documentTypes.ts";
import { buildStylesXml } from "../mapping/styleSerializer.ts";
import { buildNumberingXml } from "../mapping/numberingSerializer.ts";
import { DocumentSerializer } from "../mapping/documentSerializer.ts";
import { buildDocxPackage } from "./docxPackageBuilder.ts";

import { buildStyleExportMapping } from "../styles/docxStyleExportMapper.ts";

/**
 * Xuất Internal Document Model hiện tại thành mảng byte Uint8Array của tệp .docx chuẩn OOXML
 * Tuân thủ ISO/IEC 29500 WordprocessingML để tương thích hoàn toàn với Microsoft Word và LibreOffice.
 */
export async function exportDocumentModelToDocx(
  doc: DocumentModel
): Promise<Uint8Array> {
  if (!doc) {
    throw new Error("Không thể xuất tệp DOCX: DocumentModel không tồn tại hoặc rỗng.");
  }

  // 1. Ánh xạ Style IDs ngữ nghĩa từ Styles Engine 2.0 sang Word styleIds an toàn
  const styleIdMapping = buildStyleExportMapping(doc.styles);

  // 2. Tạo styles.xml ngữ nghĩa chứa đầy đủ các định nghĩa style
  const stylesXml = buildStylesXml(doc.styles, styleIdMapping);

  // 3. Tạo numbering.xml
  const numberingXml = buildNumberingXml();

  // 4. Tuần tự hóa cây nội dung và cấu hình tài liệu sang OOXML document.xml
  const serializer = new DocumentSerializer(styleIdMapping.internalToWordId);
  const serialized = serializer.serialize(doc);

  // 4. Đóng gói các thành phần thành tệp ZIP .docx chuẩn
  const docxBytes = await buildDocxPackage({
    documentXml: serialized.documentXml,
    stylesXml,
    numberingXml,
    commentsXml: serialized.commentsXml,
    footnotesXml: serialized.footnotesXml,
    endnotesXml: serialized.endnotesXml,
    relationships: serialized.relationships,
    mediaFiles: serialized.mediaFiles,
    headerFiles: serialized.headerFiles,
    footerFiles: serialized.footerFiles,
    headerRelationships: serialized.headerRelationships,
    footerRelationships: serialized.footerRelationships,
    unsupportedParts: doc.unsupportedParts,
    validate: true,
  });

  return docxBytes;
}
