import type { DocumentModel } from "../../document/documentTypes.ts";
import { generateDocumentId } from "../../document/documentModel.ts";
import { extractSections } from "../../page/services/sectionService.ts";
import { readDocxPackage } from "../parser/docxPackageReader.ts";
import { parseRelationships } from "../relationships/relationshipParser.ts";
import { parseStyles } from "../styles/styleParser.ts";
import { mapDocxStylesToDocumentStyles } from "../styles/docxStyleMapper.ts";
import { normalizeDocumentContentStyles } from "../../styles/validation/styleValidator.ts";
import { parseNumbering } from "../numbering/numberingParser.ts";
import { parseMediaItems } from "../media/mediaParser.ts";
import { parseComments } from "../comments/commentParser.ts";
import {
  mapDocxXmlToDocumentModel,
  parseDocxNotesXml,
  type DocumentMapperContext,
} from "../mapping/documentMapper.ts";
import { ReferencePersistenceService } from "../../references/services/referencePersistenceService.ts";
import { TablePersistenceService } from "../../editor/tablePersistenceService.ts";
import { DocxDiagnosticsReporter } from "../diagnostics/docxDiagnostics.ts";
import type { DocxImportResult, DocxRelationshipMap } from "../types/docxTypes.ts";

/**
 * Nhập một tệp tin .docx (dưới dạng mảng byte nhị phân) và chuyển đổi
 * thành Internal Document Model hoàn chỉnh của Personal Word Editor.
 *
 * Luồng thực thi:
 * 1. DOCX Package Reader (giải nén ZIP package, trích xuất các part XML & media & comments)
 * 2. Relationships Parser (trích xuất bản đồ liên kết nội bộ và đối ngoại)
 * 3. Styles & Numbering Parsers (phân tích bảng kiểu dáng và danh sách phân cấp)
 * 4. Media Parser (chuyển đổi tệp ảnh sang Data URLs tự chứa)
 * 5. Comments Parser (phân tích bình luận từ word/comments.xml - Phase 5.8)
 * 6. Document Mapper (chuyển đổi cây OOXML sang ProseMirror AST, PageSettings, Comments & Track Changes)
 * 7. Internal Document Model Generator (tạo DocumentModel đầy đủ metadata, sections, comments và tracked changes)
 */
export async function importDocxToDocumentModel(
  data: ArrayBuffer | Uint8Array,
  filename?: string
): Promise<DocxImportResult> {
  const warnings: string[] = [];
  const diagnostics = new DocxDiagnosticsReporter();

  try {
    // 1. Đọc gói ZIP
    const packageParts = await readDocxPackage(data);

    if (!packageParts.documentXml) {
      return {
        success: false,
        error: "Tệp DOCX thiếu phần word/document.xml bắt buộc.",
        warnings,
        diagnostics,
        compatibilityReport: diagnostics.generateReport(),
      };
    }

    if (packageParts.hasMacro) {
      diagnostics.recordIgnoredSafely(
        "Security",
        "MACRO_EXECUTION_BLOCKED",
        "Tệp DOCX có chứa macro/VBA; macro đã bị vô hiệu hóa thực thi vì lý do an toàn bảo mật."
      );
      warnings.push("Tệp DOCX có chứa macro (VBA). Vì lý do bảo mật, macro đã bị vô hiệu hóa và không được thực thi.");
    }

    // 2. Phân tích Relationships
    const relationships = parseRelationships(packageParts.documentRelsXml);

    // 3. Phân tích Styles & Ánh xạ sang Styles Engine 2.0
    const styles = parseStyles(packageParts.stylesXml);
    const { stylesMetadata, wordStyleIdToInternalId } = mapDocxStylesToDocumentStyles(styles);

    // 4. Phân tích Numbering
    const numbering = parseNumbering(packageParts.numberingXml);

    // 5. Phân tích Media
    const { mediaByPath, mediaByRelId } = parseMediaItems(
      packageParts.mediaFiles,
      relationships
    );

    // 5.1 Phân tích Comments (Phase 5.8)
    const comments = parseComments(packageParts.commentsXml);

    // 5.2 Phân tích Footnotes & Endnotes (Phase 6.4)
    const footnotes = parseDocxNotesXml(packageParts.footnotesXml, "footnote");
    const endnotes = parseDocxNotesXml(packageParts.endnotesXml, "endnote");

    // 5.3 Phân tích Header / Footer Relationships (Phase 12)
    const headerRelsMap = new Map<string, DocxRelationshipMap>();
    if (packageParts.headerRelsXml) {
      for (const [path, xml] of packageParts.headerRelsXml.entries()) {
        const partRels = parseRelationships(xml);
        const match = path.match(/header\d*\.xml/i);
        if (match) {
          headerRelsMap.set(match[0].toLowerCase(), partRels);
          headerRelsMap.set(`word/${match[0].toLowerCase()}`, partRels);
        }
      }
    }

    const footerRelsMap = new Map<string, DocxRelationshipMap>();
    if (packageParts.footerRelsXml) {
      for (const [path, xml] of packageParts.footerRelsXml.entries()) {
        const partRels = parseRelationships(xml);
        const match = path.match(/footer\d*\.xml/i);
        if (match) {
          footerRelsMap.set(match[0].toLowerCase(), partRels);
          footerRelsMap.set(`word/${match[0].toLowerCase()}`, partRels);
        }
      }
    }

    // 6. Ngữ cảnh Mapper
    const mapperCtx: DocumentMapperContext = {
      styles,
      styleIdMap: wordStyleIdToInternalId,
      documentStyles: stylesMetadata,
      relationships,
      mediaByRelId,
      mediaByPath,
      numbering,
      headersXmlMap: packageParts.headersXml,
      footersXmlMap: packageParts.footersXml,
      headerRelsMap,
      footerRelsMap,
      warnings,
      diagnostics,
      comments,
      footnotes,
      endnotes,
      activeCommentIds: new Set<string>(),
      commentAnchorTexts: new Map<string, string[]>(),
      trackedChangesMap: new Map(),
    };

    // 7. Chuyển đổi OOXML Body -> ProseMirror AST & PageSettings & Review Metadata
    const mapped = mapDocxXmlToDocumentModel(packageParts.documentXml, mapperCtx);

    // Chuẩn hóa an toàn các tham chiếu styleId và characterStyle trong cây AST
    const validStyleIds = new Set(stylesMetadata.definitions.map((s) => s.id));
    const normalizedStylesContent = normalizeDocumentContentStyles(mapped.content, validStyleIds);
    const normalizedContent = TablePersistenceService.normalizeTableAst(normalizedStylesContent);

    // 8. Trích xuất tiêu đề từ filename
    let docTitle = "Tài liệu DOCX";
    if (filename) {
      const cleanName = filename.split(/[/\\]/).pop() || filename;
      docTitle = cleanName.replace(/\.docx$/i, "") || "Tài liệu DOCX";
    }

    const now = new Date().toISOString();

    // 9. Trích xuất Sections logic
    const sections = extractSections(
      normalizedContent,
      mapped.initialPageSettings,
      mapped.initialHeaderFooter
    );

    // 10. Hoàn thiện DocumentModel
    const references = ReferencePersistenceService.reconcileReferencesMetadata(normalizedContent);

    const documentModel: DocumentModel = {
      metadata: {
        id: generateDocumentId(),
        title: docTitle,
        version: 1,
        createdAt: now,
        updatedAt: now,
      },
      content: normalizedContent,
      pageSettings: mapped.initialPageSettings,
      headerFooter: mapped.initialHeaderFooter,
      sections,
      comments: mapped.comments,
      trackedChanges: mapped.trackedChanges,
      references,
      styles: stylesMetadata,
      unsupportedParts: packageParts.unsupportedParts,
    };

    // Đồng bộ warnings thân thiện từ diagnostics
    for (const w of diagnostics.toUserWarnings()) {
      if (!warnings.includes(w)) {
        warnings.push(w);
      }
    }

    return {
      success: true,
      document: documentModel,
      warnings,
      diagnostics,
      compatibilityReport: diagnostics.generateReport(),
    };
  } catch (err) {
    const errorMsg = `Lỗi phân tích cú pháp DOCX: ${err instanceof Error ? err.message : String(err)}`;
    return {
      success: false,
      error: errorMsg,
      warnings,
      diagnostics,
      compatibilityReport: diagnostics.generateReport(),
    };
  }
}
