export { importDocxToDocumentModel } from "./import/docxImporter.ts";
export { exportDocumentModelToDocx } from "./export/docxExporter.ts";
export { buildDocxPackage } from "./export/docxPackageBuilder.ts";
export { DocumentSerializer } from "./mapping/documentSerializer.ts";
export { buildStylesXml } from "./mapping/styleSerializer.ts";
export { buildNumberingXml } from "./mapping/numberingSerializer.ts";
export { buildSectPrXml } from "./mapping/pageSettingsSerializer.ts";
export { buildHeaderFooterXml } from "./mapping/headerFooterSerializer.ts";
export { readDocxPackage } from "./parser/docxPackageReader.ts";
export { parseRelationships } from "./relationships/relationshipParser.ts";
export { parseStyles } from "./styles/styleParser.ts";
export { mapDocxStylesToDocumentStyles } from "./styles/docxStyleMapper.ts";
export { buildStyleExportMapping, sanitizeToXmlNcName } from "./styles/docxStyleExportMapper.ts";
export { parseNumbering } from "./numbering/numberingParser.ts";
export { parseMediaItems } from "./media/mediaParser.ts";
export { mapDocxXmlToDocumentModel } from "./mapping/documentMapper.ts";
export { parseSectionPageSettings, detectPaperSizeFromTwips } from "./mapping/pageSettingsMapper.ts";
export { parseHeaderFooterXml, extractSectionHeaderFooter } from "./mapping/headerFooterMapper.ts";

export { parseComments } from "./comments/commentParser.ts";
export { buildCommentsXml } from "./comments/commentSerializer.ts";
export { checkDocxExportReviewCompatibility } from "./utils/docxWarningUtils.ts";
export { OmmlEngine } from "./omml/ommlEngine.ts";

// Phase 2 Shared OOXML Infrastructure
export {
  OOXML_NAMESPACES,
  buildNamespaceAttributes,
  getDocumentXmlNamespaces,
  getStylesXmlNamespaces,
  getNumberingXmlNamespaces,
  getHeaderFooterXmlNamespaces,
  getCommentsXmlNamespaces,
  getNotesXmlNamespaces,
  getPackageRelationshipsNamespace,
  getContentTypesNamespace,
} from "./constants/ooxmlNamespaces.ts";

export {
  RelationshipAllocator,
  type RelationshipScope,
} from "./relationships/relationshipAllocator.ts";

export {
  DocPrIdAllocator,
  BookmarkIdAllocator,
  CommentIdAllocator,
} from "./utils/idAllocator.ts";

export {
  ContentTypesManager,
  WELL_KNOWN_CONTENT_TYPES,
} from "./packaging/contentTypesManager.ts";

export {
  validateDocxPackageData,
  type PackageValidationInput,
  type PackageValidationResult,
} from "./packaging/packageValidator.ts";

export {
  DocxDiagnosticsReporter,
  type DocxDiagnosticItem,
  type DocxDiagnosticStatus,
  type DocxDiagnosticSeverity,
  type DiagnosticsSummary,
} from "./diagnostics/docxDiagnostics.ts";

export {
  validateNodeOoxmlHook,
  type NodeOoxmlMetadataHook,
  type UnsupportedNodeHookKind,
  type PackagePartPreservation,
} from "./types/unsupportedOoxmlHook.ts";

export type {
  DocxImportResult,
  DocxStyle,
  DocxStyleMap,
  DocxRelationship,
  DocxRelationshipMap,
  DocxMediaItem,
  DocxMediaMap,
  DocxNumberingRegistry,
  DocxPackageParts,
  DocxParsedComment,
  DocxCommentMap,
} from "./types/docxTypes.ts";
