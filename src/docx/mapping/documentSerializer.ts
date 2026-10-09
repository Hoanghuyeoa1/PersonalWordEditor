import type { JSONContent } from "@tiptap/core";
import type {
  DocumentModel,
  TrackChangeItem,
  FormattingPropertyDiff,
} from "../../document/documentTypes.ts";
import type { DocxRunFormatting } from "../types/docxTypes.ts";
import type { PageSettings } from "../../page/types/pageTypes.ts";
import type { SectionHeaderFooter, HeaderFooterItem } from "../../page/types/headerFooterTypes.ts";
import { escapeXmlAttr, buildTextElement, escapeXmlText } from "../serializer/xmlBuilder.ts";
import { buildSectPrXml } from "./pageSettingsSerializer.ts";
import { buildHeaderFooterXml } from "./headerFooterSerializer.ts";
import { buildCommentsXml } from "../comments/commentSerializer.ts";
import {
  ptToHalfPoints,
  ptToTwips,
  pixelsToEmu,
  pixelsToTwips,
  cssColorToHex,
  colorToWordHighlight,
} from "../utils/xmlUtils.ts";
import { buildStyleExportMapping } from "../styles/docxStyleExportMapper.ts";
import { getDocumentXmlNamespaces } from "../constants/ooxmlNamespaces.ts";
import { RelationshipAllocator, type RelationshipScope } from "../relationships/relationshipAllocator.ts";
import { DocPrIdAllocator } from "../utils/idAllocator.ts";
import { OmmlEngine } from "../omml/ommlEngine.ts";
import { serializeDrawingContainer } from "../drawing/drawingPositionSerializer.ts";
import type { DrawingPosition } from "../drawing/drawingTypes.ts";
import { serializeFieldXml } from "./fieldSerializer.ts";
import { BookmarkService } from "../../references/services/bookmarkService.ts";
import {
  STYLE_NORMAL_ID,
  STYLE_HEADING_1_ID,
  STYLE_HEADING_2_ID,
  STYLE_HEADING_3_ID,
  STYLE_EMPHASIS_ID,
  STYLE_STRONG_ID,
} from "../../styles/services/builtInStyles.ts";
import type { CellMargins } from "../../editor/tableDimensionService.ts";
import { DEFAULT_TABLE_STYLE_OPTIONS } from "../../editor/tableStyleService.ts";
import type { TableBorderStyle, TableLayoutMode } from "../../editor/tableExtensions.ts";

export interface DocxRelationshipItem {
  id: string;
  type: string;
  target: string;
  targetMode?: "External";
}

export interface SerializedDocumentPackageData {
  documentXml: string;
  relationships: DocxRelationshipItem[];
  mediaFiles: Map<string, Uint8Array>;
  headerFiles: Map<string, string>;
  footerFiles: Map<string, string>;
  headerRelationships?: Map<string, DocxRelationshipItem[]>;
  footerRelationships?: Map<string, DocxRelationshipItem[]>;
  commentsXml?: string;
  footnotesXml?: string;
  endnotesXml?: string;
}

/**
 * Trích xuất nhị phân ảnh từ Base64 Data URL
 */
function parseDataUrl(src: string): { data: Uint8Array; extension: string } | null {
  if (!src) return null;
  const match = src.match(/^data:image\/([a-zA-Z0-9\+\-]+);base64,(.+)$/);
  if (match) {
    let ext = match[1].toLowerCase();
    if (ext === "jpeg" || ext === "jpg") ext = "jpeg";
    else if (ext === "svg+xml") ext = "svg";
    else if (ext === "png") ext = "png";
    else if (ext === "gif") ext = "gif";
    else if (ext === "webp") ext = "webp";

    try {
      const binaryString = atob(match[2]);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      return { data: bytes, extension: ext };
    } catch {
      return null;
    }
  }

  // Nếu là chuỗi base64 thuần túy không có tiền tố data:image/
  if (src.length > 100 && /^[A-Za-z0-9+/=]+$/.test(src.substring(0, 100))) {
    try {
      const binaryString = atob(src);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      return { data: bytes, extension: "png" };
    } catch {
      return null;
    }
  }

  return null;
}

/**
 * Lớp điều phối tuần tự hóa DocumentModel thành OOXML document.xml
 */
export class DocumentSerializer {
  private relAllocator = new RelationshipAllocator();
  private docPrAllocator = new DocPrIdAllocator(1);
  private mediaFiles = new Map<string, Uint8Array>();
  private mediaCounter = 1;

  private headerFiles = new Map<string, string>();
  private footerFiles = new Map<string, string>();
  private headerPartCounter = 1;
  private footerPartCounter = 1;

  private headerRelCache = new Map<string, string>();
  private footerRelCache = new Map<string, string>();

  private commentsXml?: string;
  private commentIdMap = new Map<string, string>();
  private trackChangeIdMap = new Map<string, number>();
  private trackChangeCounter = 1;
  private trackedChangesList: TrackChangeItem[] = [];
  private trackedChangesMap = new Map<string, TrackChangeItem>();

  private footnoteList: { id: number; noteId: string; content: string }[] = [];
  private endnoteList: { id: number; noteId: string; content: string }[] = [];
  private footnoteXmlCounter = 1;
  private endnoteXmlCounter = 1;
  private captionCounters = new Map<string, number>();

  private bookmarkNumericCounter = 0;
  private bookmarkIdMap = new Map<string, number>();
  private bookmarkNameMap = new Map<string, string>();
  private usedWordBookmarkNames = new Set<string>();

  private getBookmarkXmlId(internalId: string): number {
    let id = this.bookmarkIdMap.get(internalId);
    if (id === undefined) {
      id = this.bookmarkNumericCounter++;
      this.bookmarkIdMap.set(internalId, id);
    }
    return id;
  }

  private getBookmarkXmlName(internalId: string, rawName?: string): string {
    const cached = this.bookmarkNameMap.get(internalId);
    if (cached) return cached;

    let name = (rawName || "").trim();
    if (!name) name = "Bookmark";

    // Khử dấu tiếng Việt và ký tự đặc biệt theo chuẩn tên Word (chỉ a-z, A-Z, 0-9, _)
    let safe = name
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/đ/g, "d")
      .replace(/Đ/g, "D")
      .replace(/[^a-zA-Z0-9_]/g, "_")
      .replace(/_+/g, "_");

    if (!/^[a-zA-Z_]/.test(safe)) {
      safe = `bm_${safe}`;
    }
    if (safe.length > 35) {
      safe = safe.substring(0, 35);
    }
    if (!safe) safe = "Bookmark";

    let candidate = safe;
    let counter = 1;
    while (this.usedWordBookmarkNames.has(candidate.toLowerCase())) {
      candidate = `${safe}_${counter++}`;
    }
    this.usedWordBookmarkNames.add(candidate.toLowerCase());
    this.bookmarkNameMap.set(internalId, candidate);
    return candidate;
  }

  private getTrackChangeXmlId(changeId: string): number {
    if (!this.trackChangeIdMap.has(changeId)) {
      this.trackChangeIdMap.set(changeId, this.trackChangeCounter++);
    }
    return this.trackChangeIdMap.get(changeId)!;
  }

  private internalToWordIdMap = new Map<string, string>();

  public getWordStyleId(internalStyleId?: string | null): string | undefined {
    if (!internalStyleId) return undefined;
    if (this.internalToWordIdMap.has(internalStyleId)) {
      return this.internalToWordIdMap.get(internalStyleId);
    }
    if (internalStyleId === STYLE_NORMAL_ID) return "Normal";
    if (internalStyleId === STYLE_HEADING_1_ID) return "Heading1";
    if (internalStyleId === STYLE_HEADING_2_ID) return "Heading2";
    if (internalStyleId === STYLE_HEADING_3_ID) return "Heading3";
    if (internalStyleId === STYLE_EMPHASIS_ID) return "Emphasis";
    if (internalStyleId === STYLE_STRONG_ID) return "Strong";
    return undefined;
  }

  constructor(internalToWordIdMap?: Map<string, string>) {
    if (internalToWordIdMap) {
      this.internalToWordIdMap = new Map(internalToWordIdMap);
    }
    this.initDefaultRelationships();
  }

  private initDefaultRelationships(): void {
    this.relAllocator.clear();
    // Luôn đăng ký styles và numbering trong relationships
    this.addRelationship(
      "http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles",
      "styles.xml"
    );
    this.addRelationship(
      "http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering",
      "numbering.xml"
    );
  }

  private addRelationship(type: string, target: string, targetMode?: "External"): string {
    return this.relAllocator.allocate("document", type, target, targetMode);
  }

  private getOrCreateHeaderRel(item: HeaderFooterItem | null | undefined): string | undefined {
    const hasText = Boolean(item?.text && item.text.trim());
    const hasImage = Boolean(item?.image || (item?.images && item.images.length > 0));
    const hasShapes = Boolean(item?.shapes && item.shapes.length > 0);
    const hasTextBoxes = Boolean(item?.textBoxes && item.textBoxes.length > 0);
    if (!item || (!hasText && !hasImage && !hasShapes && !hasTextBoxes)) return undefined;

    const key = JSON.stringify(item);
    if (this.headerRelCache.has(key)) return this.headerRelCache.get(key);

    const partName = `header${this.headerPartCounter++}.xml`;
    const scope: RelationshipScope = `header:${partName}`;
    const xml = buildHeaderFooterXml(item, "header", {
      relAllocator: this.relAllocator,
      scope,
      mediaFiles: this.mediaFiles,
      docPrAllocator: this.docPrAllocator,
    });
    this.headerFiles.set(partName, xml);

    const relId = this.addRelationship(
      "http://schemas.openxmlformats.org/officeDocument/2006/relationships/header",
      partName
    );
    this.headerRelCache.set(key, relId);
    return relId;
  }

  private getOrCreateFooterRel(item: HeaderFooterItem | null | undefined): string | undefined {
    const hasText = Boolean(item?.text && item.text.trim());
    const hasImage = Boolean(item?.image || (item?.images && item.images.length > 0));
    const hasShapes = Boolean(item?.shapes && item.shapes.length > 0);
    const hasTextBoxes = Boolean(item?.textBoxes && item.textBoxes.length > 0);
    if (!item || (!hasText && !hasImage && !hasShapes && !hasTextBoxes)) return undefined;

    const key = JSON.stringify(item);
    if (this.footerRelCache.has(key)) return this.footerRelCache.get(key);

    const partName = `footer${this.footerPartCounter++}.xml`;
    const scope: RelationshipScope = `footer:${partName}`;
    const xml = buildHeaderFooterXml(item, "footer", {
      relAllocator: this.relAllocator,
      scope,
      mediaFiles: this.mediaFiles,
      docPrAllocator: this.docPrAllocator,
    });
    this.footerFiles.set(partName, xml);

    const relId = this.addRelationship(
      "http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer",
      partName
    );
    this.footerRelCache.set(key, relId);
    return relId;
  }

  /**
   * Tuần tự hóa một đối tượng DocumentModel hoàn chỉnh
   */
  public serialize(doc: DocumentModel): SerializedDocumentPackageData {
    const bodyXmlElements: string[] = [];

    // Khởi tạo style ID mapping nếu chưa được cung cấp qua constructor
    if (this.internalToWordIdMap.size === 0 && doc.styles) {
      const mapping = buildStyleExportMapping(doc.styles);
      this.internalToWordIdMap = mapping.internalToWordId;
    }

    // Reset maps and allocators
    this.initDefaultRelationships();
    this.docPrAllocator.reset();
    this.commentIdMap.clear();
    this.trackChangeIdMap.clear();
    this.trackChangeCounter = 1;
    this.trackedChangesList = doc.trackedChanges ? [...doc.trackedChanges] : [];
    this.trackedChangesMap.clear();
    for (const tc of this.trackedChangesList) {
      if (tc.id) {
        this.trackedChangesMap.set(tc.id, tc);
      }
    }
    // Thu thập thêm format revisions từ các node blocks trong AST nếu có
    const registerBlockFormatRevs = (nodes?: JSONContent[]) => {
      if (!nodes || !Array.isArray(nodes)) return;
      for (const n of nodes) {
        if (Array.isArray(n.attrs?.formatRevisions)) {
          for (const r of n.attrs.formatRevisions) {
            if (r.id && !this.trackedChangesMap.has(r.id)) {
              this.trackedChangesMap.set(r.id, r);
            }
          }
        }
        if (n.content && Array.isArray(n.content)) {
          registerBlockFormatRevs(n.content);
        }
      }
    };
    registerBlockFormatRevs(doc.content?.content);
    this.commentsXml = undefined;

    this.footnoteList = [];
    this.endnoteList = [];
    this.footnoteXmlCounter = 1;
    this.endnoteXmlCounter = 1;

    this.captionCounters.clear();
    this.bookmarkNumericCounter = 0;
    this.bookmarkIdMap.clear();
    this.bookmarkNameMap.clear();
    this.usedWordBookmarkNames.clear();

    // 0. Thu thập trước tất cả bookmarks trong document để pre-populate bookmark mappings (hỗ trợ forward references & stable IDs)
    if (doc.references?.bookmarks) {
      for (const bm of doc.references.bookmarks) {
        this.getBookmarkXmlName(bm.id, bm.name);
      }
    }
    if (doc.content) {
      try {
        const extracted = BookmarkService.extractBookmarks(doc.content);
        for (const loc of extracted) {
          this.getBookmarkXmlName(loc.bookmark.id, loc.bookmark.name);
        }
      } catch {
        // Safe ignore nếu content không trích xuất được
      }
    }

    // Xử lý comments (Phase 5.8)
    if (doc.comments && doc.comments.length > 0) {
      doc.comments.forEach((c, idx) => {
        this.commentIdMap.set(c.id, String(idx));
      });
      this.commentsXml = buildCommentsXml(doc.comments, this.commentIdMap);
      this.addRelationship(
        "http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments",
        "comments.xml"
      );
    }

    // Chuẩn bị danh sách sections
    let currentSettings: PageSettings = { ...doc.pageSettings };
    let currentHf: SectionHeaderFooter | undefined = doc.headerFooter;

    const blocks: JSONContent[] = doc.content?.content || [];

    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i];

      if (block.type === "sectionBreak") {
        // Ghi lại section properties của section vừa kết thúc
        const headerRelId = this.getOrCreateHeaderRel(currentHf?.header);
        const footerRelId = this.getOrCreateFooterRel(currentHf?.footer);
        const sectPr = buildSectPrXml(currentSettings, { headerRelId, footerRelId });

        bodyXmlElements.push(`<w:p><w:pPr>${sectPr}</w:pPr></w:p>`);

        // Chuyển sang section tiếp theo
        const nextSettings = block.attrs?.pageSettings as PageSettings | undefined;
        if (nextSettings) {
          currentSettings = { ...nextSettings };
        }
        const nextHf = block.attrs?.headerFooter as SectionHeaderFooter | undefined;
        if (nextHf) {
          currentHf = nextHf;
        }
        continue;
      }

      this.serializeBlockNode(block, bodyXmlElements);
    }

    // Đảm bảo luôn có ít nhất 1 paragraph trong body trước sectPr cuối
    if (bodyXmlElements.length === 0) {
      bodyXmlElements.push("<w:p/>");
    }

    // Section properties của section cuối cùng trong document
    const finalHeaderRelId = this.getOrCreateHeaderRel(currentHf?.header);
    const finalFooterRelId = this.getOrCreateFooterRel(currentHf?.footer);
    const finalSectPr = buildSectPrXml(currentSettings, {
      headerRelId: finalHeaderRelId,
      footerRelId: finalFooterRelId,
    });
    bodyXmlElements.push(finalSectPr);

    const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document ${getDocumentXmlNamespaces()}>
  <w:body>
    ${bodyXmlElements.join("\n    ")}
  </w:body>
</w:document>`;

    let footnotesXml: string | undefined;
    if (this.footnoteList.length > 0) {
      this.addRelationship(
        "http://schemas.openxmlformats.org/officeDocument/2006/relationships/footnotes",
        "footnotes.xml"
      );
      footnotesXml = this.buildFootnotesXml();
    }

    let endnotesXml: string | undefined;
    if (this.endnoteList.length > 0) {
      this.addRelationship(
        "http://schemas.openxmlformats.org/officeDocument/2006/relationships/endnotes",
        "endnotes.xml"
      );
      endnotesXml = this.buildEndnotesXml();
    }

    const headerRelationships = new Map<string, DocxRelationshipItem[]>();
    for (const partName of this.headerFiles.keys()) {
      const rels = this.relAllocator.getRelationships(`header:${partName}`);
      if (rels.length > 0) {
        headerRelationships.set(partName, rels);
      }
    }

    const footerRelationships = new Map<string, DocxRelationshipItem[]>();
    for (const partName of this.footerFiles.keys()) {
      const rels = this.relAllocator.getRelationships(`footer:${partName}`);
      if (rels.length > 0) {
        footerRelationships.set(partName, rels);
      }
    }

    return {
      documentXml,
      relationships: this.relAllocator.getRelationships("document"),
      mediaFiles: this.mediaFiles,
      headerFiles: this.headerFiles,
      footerFiles: this.footerFiles,
      headerRelationships: headerRelationships.size > 0 ? headerRelationships : undefined,
      footerRelationships: footerRelationships.size > 0 ? footerRelationships : undefined,
      commentsXml: this.commentsXml,
      footnotesXml,
      endnotesXml,
    };
  }

  private buildFootnotesXml(): string {
    const itemsXml = this.footnoteList
      .map((item) => {
        const escapedContent = escapeXmlText(item.content);
        return `  <w:footnote w:id="${item.id}">
    <w:p>
      <w:pPr><w:pStyle w:val="FootnoteText"/></w:pPr>
      <w:r><w:rPr><w:rStyle w:val="FootnoteReference"/></w:rPr><w:footnoteRef/></w:r>
      <w:r><w:t xml:space="preserve"> ${escapedContent}</w:t></w:r>
    </w:p>
  </w:footnote>`;
      })
      .join("\n");

    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:footnotes xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:footnote w:type="separator" w:id="-1">
    <w:p><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr><w:r><w:separator/></w:r></w:p>
  </w:footnote>
  <w:footnote w:type="continuationSeparator" w:id="0">
    <w:p><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr><w:r><w:continuationSeparator/></w:r></w:p>
  </w:footnote>
${itemsXml}
</w:footnotes>`;
  }

  private buildEndnotesXml(): string {
    const itemsXml = this.endnoteList
      .map((item) => {
        const escapedContent = escapeXmlText(item.content);
        return `  <w:endnote w:id="${item.id}">
    <w:p>
      <w:pPr><w:pStyle w:val="EndnoteText"/></w:pPr>
      <w:r><w:rPr><w:rStyle w:val="EndnoteReference"/></w:rPr><w:endnoteRef/></w:r>
      <w:r><w:t xml:space="preserve"> ${escapedContent}</w:t></w:r>
    </w:p>
  </w:endnote>`;
      })
      .join("\n");

    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:endnotes xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:endnote w:type="separator" w:id="-1">
    <w:p><w:r><w:separator/></w:r></w:p>
  </w:endnote>
  <w:endnote w:type="continuationSeparator" w:id="0">
    <w:p><w:r><w:continuationSeparator/></w:r></w:p>
  </w:endnote>
${itemsXml}
</w:endnotes>`;
  }

  private serializeBlockNode(node: JSONContent, out: string[]) {
    switch (node.type) {
      case "paragraph":
        out.push(this.serializeParagraph(node));
        break;

      case "heading":
        out.push(this.serializeHeading(node));
        break;

      case "bulletList":
        this.serializeList(node, 1, 0, out);
        break;

      case "orderedList":
        this.serializeList(node, 2, 0, out);
        break;

      case "table":
        out.push(this.serializeTable(node));
        break;

      case "image":
        out.push(this.serializeBlockImage(node));
        break;

      case "pageBreak":
        out.push('<w:p><w:r><w:br w:type="page"/></w:r></w:p>');
        break;

      case "horizontalRule":
        out.push(
          '<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="auto"/></w:pBdr></w:pPr></w:p>'
        );
        break;

      case "textBox": {
        if (node.attrs?.drawingPosition) {
          const drawingXml = this.serializeTextBoxDrawing(node);
          if (drawingXml) {
            const alignment = (node.attrs?.alignment as string) || "left";
            const jcVal = alignment === "justify" ? "both" : alignment;
            out.push(`<w:p><w:pPr><w:jc w:val="${jcVal}"/></w:pPr><w:r>${drawingXml}</w:r></w:p>`);
            break;
          }
        }
        // Hộp văn bản: giải nén các đoạn văn bên trong để bảo toàn nội dung văn bản
        if (node.content && Array.isArray(node.content)) {
          for (const childBlock of node.content) {
            this.serializeBlockNode(childBlock, out);
          }
        }
        break;
      }

      case "equation": {
        // Công thức toán học: xuất dạng OMML chuẩn ISO/IEC 29500 (Phase 5)
        const latex = (node.attrs?.latex as string) || "";
        if (latex) {
          const alignment = (node.attrs?.alignment as string) || "center";
          const jcVal = alignment === "justify" ? "both" : alignment;
          const ommlRes = OmmlEngine.exportToOmml(latex, {
            displayMode: true,
            alignment: alignment as any,
          });
          out.push(
            `<w:p><w:pPr><w:jc w:val="${jcVal}"/></w:pPr>${ommlRes.xml}</w:p>`
          );
        }
        break;
      }

      case "tableOfContents":
        out.push(this.serializeToc(node));
        break;

      case "caption":
        out.push(this.serializeCaption(node));
        break;

      case "captionList":
        out.push(this.serializeCaptionList(node));
        break;


      case "bibliography":
        out.push(this.serializeBibliography(node));
        break;

      case "shape": {
        const drawingXml = this.serializeShapeDrawing(node);
        if (drawingXml) {
          const alignment = (node.attrs?.alignment as string) || "center";
          const jcVal = alignment === "justify" ? "both" : alignment;
          out.push(`<w:p><w:pPr><w:jc w:val="${jcVal}"/></w:pPr><w:r>${drawingXml}</w:r></w:p>`);
        }
        break;
      }

      default:
        // Fallback: nếu node có inline content, bọc thành paragraph
        if (node.content && Array.isArray(node.content)) {
          out.push(this.serializeParagraph(node));
        }
        break;
    }
  }

  /**
   * Tuần tự hóa một đoạn văn (Paragraph)
   */
  private serializeParagraph(
    node: JSONContent,
    options?: { numPr?: { numId: number; ilvl: number } }
  ): string {
    const pPrParts: string[] = [];

    // 1. Semantic Style (<w:pStyle>)
    const styleId = (node.attrs?.styleId as string | undefined) || undefined;
    const wordStyleId = styleId ? this.getWordStyleId(styleId) : undefined;
    if (wordStyleId) {
      pPrParts.push(`<w:pStyle w:val="${wordStyleId}"/>`);
    }

    // 2. List numbering (<w:numPr>)
    if (options?.numPr) {
      pPrParts.push(
        `<w:numPr><w:ilvl w:val="${options.numPr.ilvl}"/><w:numId w:val="${options.numPr.numId}"/></w:numPr>`
      );
    }

    // 3. Direct Alignment override (<w:jc>)
    const textAlign = node.attrs?.textAlign as string | undefined;
    if (textAlign) {
      const jcVal = textAlign === "justify" ? "both" : textAlign;
      pPrParts.push(`<w:jc w:val="${jcVal}"/>`);
    }

    // 4. Direct Indents override (<w:ind>)
    const leftIndent = typeof node.attrs?.leftIndent === "number" ? node.attrs.leftIndent : undefined;
    const rightIndent = typeof node.attrs?.rightIndent === "number" ? node.attrs.rightIndent : undefined;
    const firstLineIndent = typeof node.attrs?.firstLineIndent === "number" ? node.attrs.firstLineIndent : undefined;
    const hangingIndent = typeof node.attrs?.hangingIndent === "number" ? node.attrs.hangingIndent : undefined;
    const legacyIndent = typeof node.attrs?.indent === "number" ? node.attrs.indent : 0;

    const indAttrs: string[] = [];
    if (leftIndent !== undefined && leftIndent > 0) {
      indAttrs.push(`w:left="${ptToTwips(leftIndent)}"`);
    } else if (legacyIndent > 0 && !options?.numPr) {
      indAttrs.push(`w:left="${legacyIndent * 720}"`);
    }
    if (rightIndent !== undefined && rightIndent > 0) {
      indAttrs.push(`w:right="${ptToTwips(rightIndent)}"`);
    }
    if (firstLineIndent !== undefined && firstLineIndent > 0) {
      indAttrs.push(`w:firstLine="${ptToTwips(firstLineIndent)}"`);
    }
    if (hangingIndent !== undefined && hangingIndent > 0) {
      indAttrs.push(`w:hanging="${ptToTwips(hangingIndent)}"`);
    }
    if (indAttrs.length > 0) {
      pPrParts.push(`<w:ind ${indAttrs.join(" ")}/>`);
    }

    // 5. Direct Spacing override (<w:spacing>)
    const spacingAttrs: string[] = [];
    const lineSpacing = node.attrs?.lineSpacing;
    if (lineSpacing) {
      const factor = typeof lineSpacing === "number" ? lineSpacing : parseFloat(String(lineSpacing));
      if (!isNaN(factor) && factor > 0) {
        spacingAttrs.push(`w:line="${Math.round(factor * 240)}" w:lineRule="auto"`);
      }
    }
    const spacingBefore = typeof node.attrs?.spacingBefore === "number" ? node.attrs.spacingBefore : undefined;
    const spacingAfter = typeof node.attrs?.spacingAfter === "number" ? node.attrs.spacingAfter : undefined;
    if (spacingBefore !== undefined && spacingBefore >= 0) {
      spacingAttrs.push(`w:before="${ptToTwips(spacingBefore)}"`);
    }
    if (spacingAfter !== undefined && spacingAfter >= 0) {
      spacingAttrs.push(`w:after="${ptToTwips(spacingAfter)}"`);
    }
    if (spacingAttrs.length > 0) {
      pPrParts.push(`<w:spacing ${spacingAttrs.join(" ")}/>`);
    }

    // 6. Direct Semantic Pagination Properties
    if (node.attrs?.keepWithNext === true) {
      pPrParts.push("<w:keepNext/>");
    } else if (node.attrs?.keepWithNext === false) {
      pPrParts.push('<w:keepNext w:val="0"/>');
    }
    if (node.attrs?.keepLinesTogether === true) {
      pPrParts.push("<w:keepLines/>");
    } else if (node.attrs?.keepLinesTogether === false) {
      pPrParts.push('<w:keepLines w:val="0"/>');
    }
    if (node.attrs?.pageBreakBefore === true) {
      pPrParts.push("<w:pageBreakBefore/>");
    } else if (node.attrs?.pageBreakBefore === false) {
      pPrParts.push('<w:pageBreakBefore w:val="0"/>');
    }
    if (node.attrs?.widowControl === true) {
      pPrParts.push("<w:widowControl/>");
    } else if (node.attrs?.widowControl === false) {
      pPrParts.push('<w:widowControl w:val="0"/>');
    }

    // 7. Pending Paragraph Formatting Revision (<w:pPrChange>)
    let pendingParaRev: TrackChangeItem | undefined;
    if (Array.isArray(node.attrs?.formatRevisions)) {
      pendingParaRev = node.attrs.formatRevisions.find(
        (r: any) => r.type === "format" && r.status !== "accepted" && r.status !== "rejected"
      );
    }
    if (!pendingParaRev && (node.attrs?.nodeId || node.attrs?.id)) {
      const targetId = (node.attrs?.nodeId || node.attrs?.id) as string;
      pendingParaRev = this.trackedChangesList.find(
        (r) => r.type === "format" && r.targetNodeId === targetId && r.status !== "accepted" && r.status !== "rejected"
      );
    }

    if (pendingParaRev) {
      pPrParts.push(this.buildParagraphPropertiesChangeXml(pendingParaRev));
    }

    const pPrXml = pPrParts.length > 0 ? `<w:pPr>${pPrParts.join("")}</w:pPr>` : "";
    const inlinesXml = this.serializeInlineContent(node.content || []);

    return `<w:p>${pPrXml}${inlinesXml}</w:p>`;
  }

  /**
   * Tuần tự hóa một tiêu đề (Heading 1..3)
   */
  private serializeHeading(node: JSONContent): string {
    const level = Math.min(3, Math.max(1, typeof node.attrs?.level === "number" ? node.attrs.level : 1));
    const styleId = (node.attrs?.styleId as string | undefined) || undefined;
    const wordStyleId = styleId ? this.getWordStyleId(styleId) : undefined;
    const finalStyleId = wordStyleId || `Heading${level}`;

    const pPrParts: string[] = [`<w:pStyle w:val="${finalStyleId}"/>`];

    // Direct Alignment override
    const textAlign = node.attrs?.textAlign as string | undefined;
    if (textAlign) {
      const jcVal = textAlign === "justify" ? "both" : textAlign;
      pPrParts.push(`<w:jc w:val="${jcVal}"/>`);
    }

    // Direct Indents override
    const leftIndent = typeof node.attrs?.leftIndent === "number" ? node.attrs.leftIndent : undefined;
    const rightIndent = typeof node.attrs?.rightIndent === "number" ? node.attrs.rightIndent : undefined;
    const firstLineIndent = typeof node.attrs?.firstLineIndent === "number" ? node.attrs.firstLineIndent : undefined;
    const hangingIndent = typeof node.attrs?.hangingIndent === "number" ? node.attrs.hangingIndent : undefined;
    const legacyIndent = typeof node.attrs?.indent === "number" ? node.attrs.indent : 0;

    const indAttrs: string[] = [];
    if (leftIndent !== undefined && leftIndent > 0) {
      indAttrs.push(`w:left="${ptToTwips(leftIndent)}"`);
    } else if (legacyIndent > 0) {
      indAttrs.push(`w:left="${legacyIndent * 720}"`);
    }
    if (rightIndent !== undefined && rightIndent > 0) {
      indAttrs.push(`w:right="${ptToTwips(rightIndent)}"`);
    }
    if (firstLineIndent !== undefined && firstLineIndent > 0) {
      indAttrs.push(`w:firstLine="${ptToTwips(firstLineIndent)}"`);
    }
    if (hangingIndent !== undefined && hangingIndent > 0) {
      indAttrs.push(`w:hanging="${ptToTwips(hangingIndent)}"`);
    }
    if (indAttrs.length > 0) {
      pPrParts.push(`<w:ind ${indAttrs.join(" ")}/>`);
    }

    // Direct Spacing override
    const spacingAttrs: string[] = [];
    const lineSpacing = node.attrs?.lineSpacing;
    if (lineSpacing) {
      const factor = typeof lineSpacing === "number" ? lineSpacing : parseFloat(String(lineSpacing));
      if (!isNaN(factor) && factor > 0) {
        spacingAttrs.push(`w:line="${Math.round(factor * 240)}" w:lineRule="auto"`);
      }
    }
    const spacingBefore = typeof node.attrs?.spacingBefore === "number" ? node.attrs.spacingBefore : undefined;
    const spacingAfter = typeof node.attrs?.spacingAfter === "number" ? node.attrs.spacingAfter : undefined;
    if (spacingBefore !== undefined && spacingBefore >= 0) {
      spacingAttrs.push(`w:before="${ptToTwips(spacingBefore)}"`);
    }
    if (spacingAfter !== undefined && spacingAfter >= 0) {
      spacingAttrs.push(`w:after="${ptToTwips(spacingAfter)}"`);
    }
    if (spacingAttrs.length > 0) {
      pPrParts.push(`<w:spacing ${spacingAttrs.join(" ")}/>`);
    }

    // Direct Semantic Pagination Properties
    if (node.attrs?.keepWithNext === true) {
      pPrParts.push("<w:keepNext/>");
    } else if (node.attrs?.keepWithNext === false) {
      pPrParts.push('<w:keepNext w:val="0"/>');
    }
    if (node.attrs?.keepLinesTogether === true) {
      pPrParts.push("<w:keepLines/>");
    } else if (node.attrs?.keepLinesTogether === false) {
      pPrParts.push('<w:keepLines w:val="0"/>');
    }
    if (node.attrs?.pageBreakBefore === true) {
      pPrParts.push("<w:pageBreakBefore/>");
    } else if (node.attrs?.pageBreakBefore === false) {
      pPrParts.push('<w:pageBreakBefore w:val="0"/>');
    }
    if (node.attrs?.widowControl === true) {
      pPrParts.push("<w:widowControl/>");
    } else if (node.attrs?.widowControl === false) {
      pPrParts.push('<w:widowControl w:val="0"/>');
    }

    // Pending Heading Formatting Revision (<w:pPrChange>)
    let pendingHeadingRev: TrackChangeItem | undefined;
    if (Array.isArray(node.attrs?.formatRevisions)) {
      pendingHeadingRev = node.attrs.formatRevisions.find(
        (r: any) => r.type === "format" && r.status !== "accepted" && r.status !== "rejected"
      );
    }
    if (!pendingHeadingRev && (node.attrs?.nodeId || node.attrs?.id)) {
      const targetId = (node.attrs?.nodeId || node.attrs?.id) as string;
      pendingHeadingRev = this.trackedChangesList.find(
        (r) => r.type === "format" && r.targetNodeId === targetId && r.status !== "accepted" && r.status !== "rejected"
      );
    }

    if (pendingHeadingRev) {
      pPrParts.push(this.buildParagraphPropertiesChangeXml(pendingHeadingRev));
    }

    const pPrXml = `<w:pPr>${pPrParts.join("")}</w:pPr>`;
    const inlinesXml = this.serializeInlineContent(node.content || []);

    return `<w:p>${pPrXml}${inlinesXml}</w:p>`;
  }

  /**
   * Tuần tự hóa khối Caption thành đoạn văn chuẩn phong cách Word Caption
   */
  private serializeCaption(node: JSONContent): string {
    const label = ((node.attrs?.label as string) || "Figure").trim();
    let text = (node.attrs?.text as string) || "";
    if (!text && node.content && Array.isArray(node.content)) {
      text = node.content.map((c) => c.text || "").join("").trim();
    }

    const currentCount = (this.captionCounters.get(label) || 0) + 1;
    this.captionCounters.set(label, currentCount);

    const fullText = text ? `${label} ${currentCount} — ${text}` : `${label} ${currentCount}`;

    return `<w:p><w:pPr><w:pStyle w:val="Caption"/><w:jc w:val="center"/><w:spacing w:before="120" w:after="160" w:line="240" w:lineRule="auto"/></w:pPr><w:r><w:rPr><w:i/><w:sz w:val="20"/><w:color w:val="4B5563"/></w:rPr>${buildTextElement(fullText)}</w:r></w:p>`;
  }

  /**
   * Tuần tự hóa một khối Mục lục (Table of Contents) fallback an toàn thành các đoạn văn có cấu trúc
   */
  private serializeToc(node: JSONContent): string {
    const title = (node.attrs?.title as string) || "Mục lục";
    const entries = (node.attrs?.entries as any[]) || [];
    const showPageNumbers = node.attrs?.showPageNumbers !== false;
    const parts: string[] = [];

    // 1. Tiêu đề mục lục
    parts.push(
      `<w:p><w:pPr><w:pStyle w:val="TOCHeading"/><w:spacing w:before="240" w:after="120"/><w:rPr><w:b/><w:sz w:val="28"/></w:rPr></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="28"/></w:rPr>${buildTextElement(title)}</w:r></w:p>`
    );

    // 2. Từng mục trong mục lục
    if (entries.length === 0) {
      parts.push(
        `<w:p><w:r><w:rPr><w:i/></w:rPr>${buildTextElement("(Tài liệu chưa có tiêu đề để hiển thị trong mục lục)")}</w:r></w:p>`
      );
    } else {
      for (const entry of entries) {
        const level = Math.min(3, Math.max(1, typeof entry.level === "number" ? entry.level : 1));
        const text = (entry.text as string) || "";
        const pageNum = entry.pageNumber ?? 1;
        const indentLeft = (level - 1) * 360;

        let entryXml = `<w:p><w:pPr><w:pStyle w:val="TOC${level}"/><w:ind w:left="${indentLeft}"/><w:tabs><w:tab w:val="right" w:leader="dot" w:pos="9360"/></w:tabs></w:pPr><w:r>${buildTextElement(text)}</w:r>`;
        if (showPageNumbers) {
          entryXml += `<w:r><w:tab/>${buildTextElement(String(pageNum))}</w:r>`;
        }
        entryXml += `</w:p>`;
        parts.push(entryXml);
      }
    }

    return parts.join("\n    ");
  }

  /**
   * Tuần tự hóa một khối Danh mục Chú thích (Caption List / Table of Figures) sang WordprocessingML
   */
  private serializeCaptionList(node: JSONContent): string {
    const title = (node.attrs?.title as string) || "Danh mục hình ảnh";
    const label = (node.attrs?.label as string) || "Figure";
    const entries = (node.attrs?.entries as any[]) || [];
    const showPageNumbers = node.attrs?.showPageNumbers !== false;
    const rightAlignPageNumbers = node.attrs?.rightAlignPageNumbers !== false;
    const preset = (node.attrs?.preset as string) || "classic";
    const parts: string[] = [];

    // 1. Tiêu đề danh mục
    parts.push(
      `<w:p><w:pPr><w:pStyle w:val="TOCHeading"/><w:spacing w:before="240" w:after="120"/><w:rPr><w:b/><w:sz w:val="28"/></w:rPr></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="28"/></w:rPr>${buildTextElement(title)}</w:r></w:p>`
    );

    // 2. Từng mục trong danh mục
    if (entries.length === 0) {
      parts.push(
        `<w:p><w:pPr><w:pStyle w:val="TableofFigures"/><w:spacing w:before="60" w:after="120"/></w:pPr><w:r><w:rPr><w:i/><w:color w:val="6B7280"/></w:rPr>${buildTextElement(`(Chưa có chú thích nào cho nhãn "${label}" trong tài liệu)`)}</w:r></w:p>`
      );
    } else {
      // Xác định loại dấu chấm nối (dot leader) theo preset:
      // - "classic": dot leader (w:leader="dot")
      // - "modern": không dùng leader (w:leader="none")
      // - "formal": hyphen leader (w:leader="hyphen")
      let tabLeader = "dot";
      if (preset === "modern") {
        tabLeader = "none";
      } else if (preset === "formal") {
        tabLeader = "hyphen";
      }

      for (const entry of entries) {
        let text = entry.fullTitle;
        if (!text) {
          if (entry.labelAndNumber && entry.text) {
            text = `${entry.labelAndNumber} — ${entry.text}`;
          } else if (entry.labelAndNumber) {
            text = entry.labelAndNumber;
          } else if (entry.text) {
            text = `${entry.label || label} ${entry.number || 1} — ${entry.text}`;
          } else {
            text = `Mục ${entry.number || ""}`;
          }
        }

        const pageNum = entry.pageNumber ?? 1;

        let pPrXml = `<w:pPr><w:pStyle w:val="TableofFigures"/>`;
        if (showPageNumbers && rightAlignPageNumbers) {
          pPrXml += `<w:tabs><w:tab w:val="right" w:leader="${tabLeader}" w:pos="9360"/></w:tabs>`;
        }
        pPrXml += `<w:spacing w:before="60" w:after="60" w:line="240" w:lineRule="auto"/></w:pPr>`;

        let entryXml = `<w:p>${pPrXml}<w:r>${buildTextElement(text)}</w:r>`;
        if (showPageNumbers) {
          if (rightAlignPageNumbers) {
            entryXml += `<w:r><w:tab/>${buildTextElement(String(pageNum))}</w:r>`;
          } else {
            entryXml += `<w:r>${buildTextElement(` (${pageNum})`)}</w:r>`;
          }
        }
        entryXml += `</w:p>`;
        parts.push(entryXml);
      }
    }

    return parts.join("\n    ");
  }


  /**
   * Tuần tự hóa một khối Thư mục tài liệu tham khảo (Bibliography) fallback an toàn sang WordprocessingML
   */
  private serializeBibliography(node: JSONContent): string {
    const title = (node.attrs?.title as string) || "Tài liệu tham khảo";
    const entries = (node.attrs?.entries as any[]) || [];
    const parts: string[] = [];

    // 1. Tiêu đề mục thư mục
    parts.push(
      `<w:p><w:pPr><w:pStyle w:val="Heading1"/><w:spacing w:before="240" w:after="120"/><w:rPr><w:b/><w:sz w:val="28"/><w:color w:val="1E40AF"/></w:rPr></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="28"/><w:color w:val="1E40AF"/></w:rPr>${buildTextElement(title)}</w:r></w:p>`
    );

    // 2. Từng mục tài liệu
    if (entries.length === 0) {
      parts.push(
        `<w:p><w:r><w:rPr><w:i/></w:rPr>${buildTextElement("(Chưa có tài liệu tham khảo nào được trích dẫn trong tài liệu)")}</w:r></w:p>`
      );
    } else {
      for (const entry of entries) {
        const text = (entry.text as string) || "";
        parts.push(
          `<w:p><w:pPr><w:pStyle w:val="Bibliography"/><w:spacing w:after="100" w:line="240" w:lineRule="auto"/></w:pPr><w:r>${buildTextElement(text)}</w:r></w:p>`
        );
      }
    }

    return parts.join("\n    ");
  }

  /**
   * Tuần tự hóa danh sách có thứ bậc (List / Nested List)
   */
  private serializeList(
    listNode: JSONContent,
    numId: number,
    level: number,
    out: string[]
  ) {
    const items = listNode.content || [];
    for (const item of items) {
      if (item.type !== "listItem") continue;

      const itemBlocks = item.content || [];
      for (const block of itemBlocks) {
        if (block.type === "paragraph") {
          out.push(this.serializeParagraph(block, { numPr: { numId, ilvl: level } }));
        } else if (block.type === "bulletList") {
          this.serializeList(block, 1, Math.min(8, level + 1), out);
        } else if (block.type === "orderedList") {
          this.serializeList(block, 2, Math.min(8, level + 1), out);
        } else {
          this.serializeBlockNode(block, out);
        }
      }
    }
  }

  /**
   * Tuần tự hóa Bảng (Table) sang OOXML WordprocessingML tuân thủ chuẩn ISO/IEC 29500
   * Hỗ trợ đầy đủ Table Engine 2.0:
   * - Vertical merge (w:vMerge restart & continue) với topological grid preservation
   * - Rectangular merge (gridSpan + vMerge)
   * - Semantic repeatHeader (w:tblHeader)
   * - Table Width & Layout modes (tblW, tblLayout, tblGrid, tcW)
   * - Cell margins table defaults và per-cell override (tblCellMar & tcMar)
   * - Row height and rules (trHeight exact/atLeast)
   * - Shading, borders, table styles và table caption target preservation
   */
  private serializeTable(tableNode: JSONContent): string {
    const rawRows = (tableNode.content || []).filter((r) => r && r.type === "tableRow");
    if (rawRows.length === 0) {
      return '<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/></w:tblPr><w:tr><w:tc><w:p/></w:tc></w:tr></w:tbl>';
    }

    // 1. Phân tích các thuộc tính bảng ngữ nghĩa
    const tableId =
      (typeof tableNode.attrs?.targetId === "string" && tableNode.attrs.targetId.trim()) ||
      (typeof tableNode.attrs?.id === "string" && tableNode.attrs.id.trim()) ||
      null;
    const borders = (tableNode.attrs?.borders as TableBorderStyle) || "all";
    const borderColor = (tableNode.attrs?.borderColor as string) || "D1D5DB";
    const borderColorHex = cssColorToHex(borderColor) || "D1D5DB";
    const repeatHeader = tableNode.attrs?.repeatHeader;
    const layoutMode = (tableNode.attrs?.layoutMode as TableLayoutMode) || "autoWindow";
    const tableWidth = tableNode.attrs?.tableWidth as string | number | undefined;
    const cellMargins = tableNode.attrs?.cellMargins as Partial<CellMargins> | null | undefined;
    const tableStyleId = (tableNode.attrs?.tableStyleId as string) || "grid";
    const tableStyleOptions = {
      ...DEFAULT_TABLE_STYLE_OPTIONS,
      ...(tableNode.attrs?.tableStyleOptions || {}),
    };

    // 2. Xây dựng 2D Grid Matrix để xác định chính xác vị trí topological của từng ô và continuation cells
    interface GridSlot {
      masterCell: JSONContent;
      masterRow: number;
      masterCol: number;
      isMaster: boolean;
      colspan: number;
      rowspan: number;
      colWidths?: number[];
    }

    const numRows = rawRows.length;
    const grid: (GridSlot | undefined)[][] = Array.from({ length: numRows }, () => []);

    for (let r = 0; r < numRows; r++) {
      let c = 0;
      const cells = (rawRows[r].content || []).filter(
        (cell) => cell && (cell.type === "tableCell" || cell.type === "tableHeader")
      );

      for (const cell of cells) {
        while (grid[r][c] !== undefined) {
          c++;
        }

        const colspan = Math.max(1, typeof cell.attrs?.colspan === "number" ? cell.attrs.colspan : 1);
        const maxPossibleRowspan = Math.max(1, numRows - r);
        const rawRowspan = typeof cell.attrs?.rowspan === "number" ? cell.attrs.rowspan : 1;
        const rowspan = Math.min(maxPossibleRowspan, Math.max(1, rawRowspan));
        const colWidths = Array.isArray(cell.attrs?.colwidth) ? cell.attrs.colwidth : undefined;

        for (let dr = 0; dr < rowspan; dr++) {
          const targetRow = r + dr;
          while (grid.length <= targetRow) {
            grid.push([]);
          }
          for (let dc = 0; dc < colspan; dc++) {
            const targetCol = c + dc;
            grid[targetRow][targetCol] = {
              masterCell: cell,
              masterRow: r,
              masterCol: c,
              isMaster: dr === 0 && dc === 0,
              colspan,
              rowspan,
              colWidths,
            };
          }
        }

        c += colspan;
      }
    }

    let totalCols = 0;
    for (const rowSlots of grid) {
      if (rowSlots.length > totalCols) totalCols = rowSlots.length;
    }
    totalCols = Math.max(1, totalCols);

    // 3. Xác định độ rộng từng cột cho <w:tblGrid> và <w:tcW>
    const columnWidthsPx: (number | null)[] = Array(totalCols).fill(null);
    for (let r = 0; r < numRows; r++) {
      for (let c = 0; c < totalCols; c++) {
        const slot = grid[r]?.[c];
        if (slot && slot.isMaster && slot.colWidths && slot.colWidths.length > 0) {
          if (slot.colWidths.length >= slot.colspan) {
            for (let i = 0; i < slot.colspan; i++) {
              const w = slot.colWidths[i];
              if (typeof w === "number" && w > 0 && columnWidthsPx[c + i] === null) {
                columnWidthsPx[c + i] = w;
              }
            }
          } else if (
            slot.colWidths.length === 1 &&
            typeof slot.colWidths[0] === "number" &&
            slot.colWidths[0] > 0
          ) {
            const eachW = Math.round(slot.colWidths[0] / slot.colspan);
            for (let i = 0; i < slot.colspan; i++) {
              if (columnWidthsPx[c + i] === null) {
                columnWidthsPx[c + i] = eachW;
              }
            }
          }
        }
      }
    }

    if (layoutMode === "fixed" && typeof tableWidth === "string" && tableWidth.endsWith("px")) {
      const totalFixedPx = parseFloat(tableWidth);
      const knownSum = columnWidthsPx.filter((w): w is number => w !== null).reduce((a, b) => a + b, 0);
      const missingCount = columnWidthsPx.filter((w) => w === null).length;
      if (missingCount > 0 && totalFixedPx > knownSum) {
        const eachMissing = Math.round((totalFixedPx - knownSum) / missingCount);
        for (let i = 0; i < totalCols; i++) {
          if (columnWidthsPx[i] === null) {
            columnWidthsPx[i] = Math.max(20, eachMissing);
          }
        }
      }
    }

    // 4. Khởi tạo <w:tblPr> với thứ tự các thẻ chuẩn ISO/IEC 29500
    let wordStyleId = "TableGrid";
    const cleanStyle = tableStyleId.trim().toLowerCase();
    if (cleanStyle === "plain" || cleanStyle.includes("plain") || cleanStyle === "tablenormal") {
      wordStyleId = "TableNormal";
    } else if (
      cleanStyle === "light-grid" ||
      cleanStyle.includes("lightgrid") ||
      cleanStyle.includes("light-grid")
    ) {
      wordStyleId = "LightGridAccent1";
    } else if (
      cleanStyle === "medium-accent" ||
      cleanStyle.includes("mediumaccent") ||
      cleanStyle.includes("medium-accent")
    ) {
      wordStyleId = "MediumAccent1";
    } else if (cleanStyle === "academic" || cleanStyle.includes("academic")) {
      wordStyleId = "Academic";
    } else if (cleanStyle === "grid" || cleanStyle.includes("grid")) {
      wordStyleId = "TableGrid";
    } else {
      wordStyleId = tableStyleId.replace(/[^a-zA-Z0-9]/g, "") || "TableGrid";
    }

    let tblWXml = '<w:tblW w:w="0" w:type="auto"/>';
    if (layoutMode === "autoContent" || tableWidth === "auto") {
      tblWXml = '<w:tblW w:w="0" w:type="auto"/>';
    } else if (
      layoutMode === "autoWindow" ||
      (typeof tableWidth === "string" && tableWidth.includes("%"))
    ) {
      const pctMatch =
        typeof tableWidth === "string" ? tableWidth.match(/^(\d+(?:\.\d+)?)%$/) : null;
      const pct = pctMatch ? parseFloat(pctMatch[1]) : 100;
      const pctUnits = Math.round(pct * 50); // 5000 = 100%
      tblWXml = `<w:tblW w:w="${pctUnits}" w:type="pct"/>`;
    } else if (
      layoutMode === "fixed" ||
      (typeof tableWidth === "string" && !tableWidth.includes("%")) ||
      typeof tableWidth === "number"
    ) {
      let wTwips = 0;
      if (typeof tableWidth === "string" && tableWidth.endsWith("px")) {
        wTwips = pixelsToTwips(parseFloat(tableWidth));
      } else if (typeof tableWidth === "string" && tableWidth.endsWith("pt")) {
        wTwips = ptToTwips(parseFloat(tableWidth));
      } else if (typeof tableWidth === "string" && tableWidth.endsWith("dxa")) {
        wTwips = Math.round(parseFloat(tableWidth));
      } else if (typeof tableWidth === "number") {
        wTwips = pixelsToTwips(tableWidth);
      } else {
        const knownSum = columnWidthsPx
          .filter((w): w is number => w !== null)
          .reduce((a, b) => a + b, 0);
        if (knownSum > 0) wTwips = pixelsToTwips(knownSum);
        else wTwips = pixelsToTwips(600);
      }
      tblWXml = `<w:tblW w:w="${wTwips}" w:type="dxa"/>`;
    }

    let tblBordersXml = "";
    if (borders === "none") {
      tblBordersXml = `<w:tblBorders>
        <w:top w:val="none"/><w:left w:val="none"/><w:bottom w:val="none"/><w:right w:val="none"/>
        <w:insideH w:val="none"/><w:insideV w:val="none"/>
      </w:tblBorders>`;
    } else if (borders === "outside") {
      tblBordersXml = `<w:tblBorders>
        <w:top w:val="single" w:sz="4" w:space="0" w:color="${borderColorHex}"/>
        <w:left w:val="single" w:sz="4" w:space="0" w:color="${borderColorHex}"/>
        <w:bottom w:val="single" w:sz="4" w:space="0" w:color="${borderColorHex}"/>
        <w:right w:val="single" w:sz="4" w:space="0" w:color="${borderColorHex}"/>
        <w:insideH w:val="none"/><w:insideV w:val="none"/>
      </w:tblBorders>`;
    } else {
      tblBordersXml = `<w:tblBorders>
        <w:top w:val="single" w:sz="4" w:space="0" w:color="${borderColorHex}"/>
        <w:left w:val="single" w:sz="4" w:space="0" w:color="${borderColorHex}"/>
        <w:bottom w:val="single" w:sz="4" w:space="0" w:color="${borderColorHex}"/>
        <w:right w:val="single" w:sz="4" w:space="0" w:color="${borderColorHex}"/>
        <w:insideH w:val="single" w:sz="4" w:space="0" w:color="${borderColorHex}"/>
        <w:insideV w:val="single" w:sz="4" w:space="0" w:color="${borderColorHex}"/>
      </w:tblBorders>`;
    }

    let tblLayoutXml = "";
    if (layoutMode === "fixed") {
      tblLayoutXml = '<w:tblLayout w:type="fixed"/>';
    } else {
      tblLayoutXml = '<w:tblLayout w:type="autofit"/>';
    }

    let tblCellMarXml = "";
    if (cellMargins) {
      const topTwips = pixelsToTwips(cellMargins.top ?? 0);
      const leftTwips = pixelsToTwips(cellMargins.left ?? 0);
      const bottomTwips = pixelsToTwips(cellMargins.bottom ?? 0);
      const rightTwips = pixelsToTwips(cellMargins.right ?? 0);
      tblCellMarXml = `<w:tblCellMar>
        <w:top w:w="${topTwips}" w:type="dxa"/>
        <w:left w:w="${leftTwips}" w:type="dxa"/>
        <w:bottom w:w="${bottomTwips}" w:type="dxa"/>
        <w:right w:w="${rightTwips}" w:type="dxa"/>
      </w:tblCellMar>`;
    }

    const firstRowVal = tableStyleOptions.headerRow ? "1" : "0";
    const lastRowVal = tableStyleOptions.lastColumn ? "1" : "0";
    const firstColVal = tableStyleOptions.firstColumn ? "1" : "0";
    const lastColVal = tableStyleOptions.lastColumn ? "1" : "0";
    const noHBandVal = tableStyleOptions.bandedRows ? "0" : "1";
    const noVBandVal = tableStyleOptions.bandedColumns ? "0" : "1";
    const tblLookXml = `<w:tblLook w:firstRow="${firstRowVal}" w:lastRow="${lastRowVal}" w:firstColumn="${firstColVal}" w:lastColumn="${lastColVal}" w:noHBand="${noHBandVal}" w:noVBand="${noVBandVal}"/>`;

    const tblCaptionXml = tableId ? `<w:tblCaption w:val="${escapeXmlAttr(tableId)}"/>` : "";

    const tblPr = `<w:tblPr>
      <w:tblStyle w:val="${wordStyleId}"/>
      ${tblWXml}
      ${tblBordersXml}
      ${tblLayoutXml}
      ${tblCellMarXml}
      ${tblLookXml}
      ${tblCaptionXml}
    </w:tblPr>`;

    // 5. Khởi tạo <w:tblGrid>
    const gridCols = columnWidthsPx.map((w) => {
      if (w !== null && w > 0) {
        return `<w:gridCol w:w="${pixelsToTwips(w)}"/>`;
      }
      return "<w:gridCol/>";
    });
    const tblGridXml = `<w:tblGrid>${gridCols.join("")}</w:tblGrid>`;

    // 6. Xây dựng từng hàng và ô với semantic vMerge và grid preservation
    const rowsXml: string[] = [];

    for (let r = 0; r < numRows; r++) {
      const rowNode = rawRows[r];

      // Semantic Repeat Header:
      // Xuất w:tblHeader chỉ cho hàng header thật sự khi repeatHeader != false
      const hasHeaderCells = (rowNode.content || []).some((c) => c && c.type === "tableHeader");
      const isSemanticHeaderRow =
        (r === 0 || hasHeaderCells) &&
        (repeatHeader === true || (repeatHeader === undefined && hasHeaderCells));

      const trPrParts: string[] = [];
      if (isSemanticHeaderRow) {
        trPrParts.push("<w:tblHeader/>");
      }

      if (typeof rowNode.attrs?.rowHeight === "number" && rowNode.attrs.rowHeight > 0) {
        const hTwips = pixelsToTwips(rowNode.attrs.rowHeight);
        const hRule = rowNode.attrs.rowHeightRule === "exact" ? "exact" : "atLeast";
        trPrParts.push(`<w:trHeight w:val="${hTwips}" w:hRule="${hRule}"/>`);
      }

      const trPrXml = trPrParts.length > 0 ? `<w:trPr>${trPrParts.join("")}</w:trPr>` : "";

      const cellsXml: string[] = [];
      let c = 0;

      while (c < totalCols) {
        const slot = grid[r]?.[c];
        if (!slot) {
          cellsXml.push("<w:tc><w:p/></w:tc>");
          c++;
          continue;
        }

        if (slot.isMaster) {
          const cell = slot.masterCell;
          const colspan = slot.colspan;
          const rowspan = slot.rowspan;

          const tcPrParts: string[] = [];

          // 1. tcW
          let cellWidthTwips: number | null = null;
          if (slot.colWidths && slot.colWidths.length > 0) {
            const sumPx = slot.colWidths
              .slice(0, colspan)
              .reduce((acc, curr) => acc + (typeof curr === "number" ? curr : 0), 0);
            if (sumPx > 0) cellWidthTwips = pixelsToTwips(sumPx);
          } else {
            const slice = columnWidthsPx.slice(c, c + colspan).filter((w): w is number => w !== null);
            if (slice.length === colspan) {
              cellWidthTwips = pixelsToTwips(slice.reduce((acc, curr) => acc + curr, 0));
            }
          }

          if (cellWidthTwips !== null && cellWidthTwips > 0) {
            tcPrParts.push(`<w:tcW w:w="${cellWidthTwips}" w:type="dxa"/>`);
          } else if (layoutMode === "autoContent") {
            tcPrParts.push('<w:tcW w:w="0" w:type="auto"/>');
          }

          // 2. gridSpan
          if (colspan > 1) {
            tcPrParts.push(`<w:gridSpan w:val="${colspan}"/>`);
          }

          // 3. vMerge restart
          if (rowspan > 1) {
            tcPrParts.push('<w:vMerge w:val="restart"/>');
          }

          // 4. Shading / Background color
          const bgColor = cell.attrs?.backgroundColor as string | undefined;
          if (bgColor) {
            const hex = cssColorToHex(bgColor);
            if (hex) {
              tcPrParts.push(`<w:shd w:val="clear" w:color="auto" w:fill="${hex}"/>`);
            }
          }

          // 5. Cell Margins Override (<w:tcMar>)
          const cellMar = cell.attrs?.cellMargins as Partial<CellMargins> | null | undefined;
          if (cellMar && typeof cellMar === "object") {
            const tcMarParts: string[] = [];
            if (cellMar.top !== undefined) tcMarParts.push(`<w:top w:w="${pixelsToTwips(cellMar.top)}" w:type="dxa"/>`);
            if (cellMar.left !== undefined) tcMarParts.push(`<w:left w:w="${pixelsToTwips(cellMar.left)}" w:type="dxa"/>`);
            if (cellMar.bottom !== undefined) tcMarParts.push(`<w:bottom w:w="${pixelsToTwips(cellMar.bottom)}" w:type="dxa"/>`);
            if (cellMar.right !== undefined) tcMarParts.push(`<w:right w:w="${pixelsToTwips(cellMar.right)}" w:type="dxa"/>`);
            if (tcMarParts.length > 0) {
              tcPrParts.push(`<w:tcMar>${tcMarParts.join("")}</w:tcMar>`);
            }
          }

          // 6. Vertical align (<w:vAlign>)
          const vAlign = cell.attrs?.verticalAlign as string | undefined;
          if (vAlign) {
            const mappedAlign = vAlign === "middle" ? "center" : vAlign;
            tcPrParts.push(`<w:vAlign w:val="${mappedAlign}"/>`);
          }

          const tcPrXml = tcPrParts.length > 0 ? `<w:tcPr>${tcPrParts.join("")}</w:tcPr>` : "";

          // Cell paragraphs
          const cellParagraphs: string[] = [];
          const cellBlocks = cell.content || [];
          for (const cb of cellBlocks) {
            if (cb.type === "paragraph") {
              cellParagraphs.push(this.serializeParagraph(cb));
            } else {
              this.serializeBlockNode(cb, cellParagraphs);
            }
          }
          if (cellParagraphs.length === 0) {
            cellParagraphs.push("<w:p/>");
          }

          cellsXml.push(`<w:tc>${tcPrXml}${cellParagraphs.join("")}</w:tc>`);
          c += colspan;
        } else if (slot.masterRow < r && slot.masterCol === c) {
          // Continuation cell cho vertical merge!
          const masterCell = slot.masterCell;
          const colspan = slot.colspan;

          const tcPrParts: string[] = [];

          // 1. tcW matching master
          let cellWidthTwips: number | null = null;
          if (slot.colWidths && slot.colWidths.length > 0) {
            const sumPx = slot.colWidths
              .slice(0, colspan)
              .reduce((acc, curr) => acc + (typeof curr === "number" ? curr : 0), 0);
            if (sumPx > 0) cellWidthTwips = pixelsToTwips(sumPx);
          } else {
            const slice = columnWidthsPx.slice(c, c + colspan).filter((w): w is number => w !== null);
            if (slice.length === colspan) {
              cellWidthTwips = pixelsToTwips(slice.reduce((acc, curr) => acc + curr, 0));
            }
          }
          if (cellWidthTwips !== null && cellWidthTwips > 0) {
            tcPrParts.push(`<w:tcW w:w="${cellWidthTwips}" w:type="dxa"/>`);
          } else if (layoutMode === "autoContent") {
            tcPrParts.push('<w:tcW w:w="0" w:type="auto"/>');
          }

          // 2. gridSpan matching master
          if (colspan > 1) {
            tcPrParts.push(`<w:gridSpan w:val="${colspan}"/>`);
          }

          // 3. vMerge continue!
          tcPrParts.push('<w:vMerge w:val="continue"/>');

          // 4. Shading matching master
          const bgColor = masterCell.attrs?.backgroundColor as string | undefined;
          if (bgColor) {
            const hex = cssColorToHex(bgColor);
            if (hex) {
              tcPrParts.push(`<w:shd w:val="clear" w:color="auto" w:fill="${hex}"/>`);
            }
          }

          // 5. Cell Margins matching master (<w:tcMar>)
          const cellMar = masterCell.attrs?.cellMargins as Partial<CellMargins> | null | undefined;
          if (cellMar && typeof cellMar === "object") {
            const tcMarParts: string[] = [];
            if (cellMar.top !== undefined) tcMarParts.push(`<w:top w:w="${pixelsToTwips(cellMar.top)}" w:type="dxa"/>`);
            if (cellMar.left !== undefined) tcMarParts.push(`<w:left w:w="${pixelsToTwips(cellMar.left)}" w:type="dxa"/>`);
            if (cellMar.bottom !== undefined) tcMarParts.push(`<w:bottom w:w="${pixelsToTwips(cellMar.bottom)}" w:type="dxa"/>`);
            if (cellMar.right !== undefined) tcMarParts.push(`<w:right w:w="${pixelsToTwips(cellMar.right)}" w:type="dxa"/>`);
            if (tcMarParts.length > 0) {
              tcPrParts.push(`<w:tcMar>${tcMarParts.join("")}</w:tcMar>`);
            }
          }

          // 6. Vertical align matching master (<w:vAlign>)
          const vAlign = masterCell.attrs?.verticalAlign as string | undefined;
          if (vAlign) {
            const mappedAlign = vAlign === "middle" ? "center" : vAlign;
            tcPrParts.push(`<w:vAlign w:val="${mappedAlign}"/>`);
          }

          const tcPrXml = `<w:tcPr>${tcPrParts.join("")}</w:tcPr>`;
          cellsXml.push(`<w:tc>${tcPrXml}<w:p/></w:tc>`);
          c += colspan;
        } else {
          c++;
        }
      }

      rowsXml.push(`<w:tr>${trPrXml}${cellsXml.join("")}</w:tr>`);
    }

    return `<w:tbl>${tblPr}${tblGridXml}${rowsXml.join("")}</w:tbl>`;
  }

  /**
   * Tuần tự hóa hình ảnh dạng Block
   */
  private serializeBlockImage(node: JSONContent): string {
    const alignment = (node.attrs?.alignment as string) || "center";
    const jcVal = alignment === "justify" ? "both" : alignment;
    const drawingXml = this.serializeImageDrawing(node);

    return `<w:p><w:pPr><w:jc w:val="${jcVal}"/></w:pPr><w:r>${drawingXml}</w:r></w:p>`;
  }

  /**
   * Tạo phần tử DrawingML cho hình ảnh
   */
  private serializeImageDrawing(node: JSONContent): string {
    const src = (node.attrs?.src as string) || "";
    const alt = (node.attrs?.alt as string) || "Image";
    const widthPx = typeof node.attrs?.width === "number" ? node.attrs.width : 400;
    const heightPx = typeof node.attrs?.height === "number" ? node.attrs.height : 260;

    const parsed = parseDataUrl(src);
    let relId = "";

    if (parsed) {
      const mediaFileName = `image${this.mediaCounter++}.${parsed.extension}`;
      this.mediaFiles.set(mediaFileName, parsed.data);
      relId = this.addRelationship(
        "http://schemas.openxmlformats.org/officeDocument/2006/relationships/image",
        `media/${mediaFileName}`
      );
    } else {
      // Fallback 1x1 transparent png nếu không có ảnh hợp lệ hoặc ảnh dạng SVG placeholder
      const transparentPng = new Uint8Array([
        137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1,
        0, 0, 0, 1, 8, 6, 0, 0, 0, 31, 21, 196, 137, 0, 0, 0, 10, 73, 68, 65, 84,
        120, 156, 99, 0, 1, 0, 0, 5, 0, 1, 13, 10, 45, 180, 0, 0, 0, 0, 73, 69, 78,
        68, 174, 66, 96, 130,
      ]);
      const mediaFileName = `image${this.mediaCounter++}.png`;
      this.mediaFiles.set(mediaFileName, transparentPng);
      relId = this.addRelationship(
        "http://schemas.openxmlformats.org/officeDocument/2006/relationships/image",
        `media/${mediaFileName}`
      );
    }

    const cx = pixelsToEmu(widthPx);
    const cy = pixelsToEmu(heightPx);
    const docPr = this.docPrAllocator.allocateDocPr("Picture", alt);
    const docPrId = docPr.id;

    let drawingPosition: DrawingPosition = (node.attrs?.drawingPosition as DrawingPosition);
    if (drawingPosition) {
      drawingPosition = {
        ...drawingPosition,
        width: typeof node.attrs?.width === "number" ? node.attrs.width : drawingPosition.width || widthPx,
        height: typeof node.attrs?.height === "number" ? node.attrs.height : drawingPosition.height || heightPx,
      };
    } else {
      drawingPosition = {
        placement: "inline",
        width: widthPx,
        height: heightPx,
        distT: 0,
        distB: 0,
        distL: 0,
        distR: 0,
        wrapMode: "inline",
      };
    }

    const picXml = `<pic:pic>
              <pic:nvPicPr>
                <pic:cNvPr id="${docPrId}" name="${escapeXmlAttr(docPr.name)}"/>
                <pic:cNvPicPr/>
              </pic:nvPicPr>
              <pic:blipFill>
                <a:blip r:embed="${relId}"/>
                <a:stretch><a:fillRect/></a:stretch>
              </pic:blipFill>
              <pic:spPr>
                <a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>
                <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
              </pic:spPr>
            </pic:pic>`;

    return serializeDrawingContainer({
      position: drawingPosition,
      docPrId,
      docPrName: docPr.name,
      docPrDescription: alt,
      graphicUri: "http://schemas.openxmlformats.org/drawingml/2006/picture",
      graphicContentXml: picXml,
    });
  }

  /**
   * Tạo phần tử DrawingML cho hình vẽ (Shape)
   */
  private serializeShapeDrawing(node: JSONContent): string {
    const rawType = (node.attrs?.shapeType as string) || "rectangle";
    const widthPx = typeof node.attrs?.width === "number" ? node.attrs.width : 200;
    const heightPx = typeof node.attrs?.height === "number" ? node.attrs.height : 120;
    const fillColor = (node.attrs?.fillColor as string) || "#3b82f6";
    const strokeColor = (node.attrs?.strokeColor as string) || "#1d4ed8";
    const strokeWidth = typeof node.attrs?.strokeWidth === "number" ? node.attrs.strokeWidth : 2;

    const rawPos = node.attrs?.drawingPosition as DrawingPosition | undefined;
    const drawingPosition: DrawingPosition = rawPos
      ? {
          ...rawPos,
          width: rawPos.width || widthPx,
          height: rawPos.height || heightPx,
        }
      : {
          placement: "inline",
          width: widthPx,
          height: heightPx,
          distT: 0,
          distB: 0,
          distL: 0,
          distR: 0,
          wrapMode: "inline",
        };

    const cx = pixelsToEmu(drawingPosition.width);
    const cy = pixelsToEmu(drawingPosition.height);
    const docPr = this.docPrAllocator.allocateDocPr("Shape", rawType);
    const docPrId = docPr.id;

    let prst = "rect";
    if (rawType === "roundedRectangle") prst = "roundRect";
    else if (rawType === "ellipse") prst = "ellipse";
    else if (rawType === "line") prst = "line";
    else if (rawType === "arrow") prst = "rightArrow";

    const fillHex = cssColorToHex(fillColor);
    const fillXml = fillHex && fillColor !== "none"
      ? `<a:solidFill><a:srgbClr val="${fillHex}"/></a:solidFill>`
      : "<a:noFill/>";

    let lineXml = "";
    if (strokeColor === "none" || strokeWidth <= 0) {
      lineXml = "<a:ln><a:noFill/></a:ln>";
    } else {
      const strokeHex = cssColorToHex(strokeColor) || "1D4ED8";
      const strokeWidthEmu = Math.max(9525, pixelsToEmu(strokeWidth));
      lineXml = `<a:ln w="${strokeWidthEmu}"><a:solidFill><a:srgbClr val="${strokeHex}"/></a:solidFill></a:ln>`;
    }

    const wspXml = `<wps:wsp>
              <wps:cNvSpPr/>
              <wps:spPr>
                <a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>
                <a:prstGeom prst="${prst}"><a:avLst/></a:prstGeom>
                ${fillXml}
                ${lineXml}
              </wps:spPr>
              <wps:bodyPr/>
            </wps:wsp>`;

    return serializeDrawingContainer({
      position: drawingPosition,
      docPrId,
      docPrName: docPr.name,
      docPrDescription: rawType,
      graphicUri: "http://schemas.microsoft.com/office/word/2010/wordprocessingShape",
      graphicContentXml: wspXml,
    });
  }

  /**
   * Tạo phần tử DrawingML cho hộp văn bản (TextBox)
   */
  private serializeTextBoxDrawing(node: JSONContent): string {
    const widthPx = typeof node.attrs?.width === "number" ? node.attrs.width : 320;
    const heightPx = typeof node.attrs?.minHeight === "number" ? node.attrs.minHeight : 80;
    const bgColor = (node.attrs?.backgroundColor as string) || "#ffffff";
    const borderColor = (node.attrs?.borderColor as string) || "#cbd5e1";

    const rawPos = node.attrs?.drawingPosition as DrawingPosition | undefined;
    const drawingPosition: DrawingPosition = rawPos
      ? {
          ...rawPos,
          width: rawPos.width || widthPx,
          height: rawPos.height || heightPx,
        }
      : {
          placement: "floating",
          width: widthPx,
          height: heightPx,
          distT: 0,
          distB: 0,
          distL: 0,
          distR: 0,
          wrapMode: "square",
          horizontalRelative: "column",
          verticalRelative: "paragraph",
          offsetX: 0,
          offsetY: 0,
        };

    const cx = pixelsToEmu(drawingPosition.width);
    const cy = pixelsToEmu(drawingPosition.height);
    const docPr = this.docPrAllocator.allocateDocPr("TextBox", "Text Box");
    const docPrId = docPr.id;

    const bgHex = cssColorToHex(bgColor) || "FFFFFF";
    const borderHex = cssColorToHex(borderColor) || "CBD5E1";

    // Tuần tự hóa các đoạn văn bên trong Text Box
    const innerParagraphs: string[] = [];
    if (node.content && Array.isArray(node.content)) {
      for (const child of node.content) {
        if (child.type === "paragraph") {
          innerParagraphs.push(this.serializeParagraph(child));
        } else {
          const sub: string[] = [];
          this.serializeBlockNode(child, sub);
          innerParagraphs.push(...sub);
        }
      }
    }
    if (innerParagraphs.length === 0) {
      innerParagraphs.push("<w:p/>");
    }

    const wspXml = `<wps:wsp>
              <wps:cNvSpPr txBox="1"/>
              <wps:spPr>
                <a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>
                <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
                <a:solidFill><a:srgbClr val="${bgHex}"/></a:solidFill>
                <a:ln w="9525"><a:solidFill><a:srgbClr val="${borderHex}"/></a:solidFill></a:ln>
              </wps:spPr>
              <wps:txbx>
                <w:txbxContent>
                  ${innerParagraphs.join("")}
                </w:txbxContent>
              </wps:txbx>
              <wps:bodyPr/>
            </wps:wsp>`;

    return serializeDrawingContainer({
      position: drawingPosition,
      docPrId,
      docPrName: docPr.name,
      docPrDescription: "Text Box",
      graphicUri: "http://schemas.microsoft.com/office/word/2010/wordprocessingShape",
      graphicContentXml: wspXml,
    });
  }

  /**
   * Tuần tự hóa các node nội dòng (Inline Nodes / Runs / Hyperlinks / Comments / Bookmarks / Track Changes)
   */
  private serializeInlineContent(inlines: JSONContent[]): string {
    const parts: string[] = [];
    const activeCommentIds = new Set<string>();
    const activeBookmarkIds = new Set<string>();

    for (let i = 0; i < inlines.length; i++) {
      const inline = inlines[i];

      // 1. Mở commentRangeStart cho các comments mới bắt đầu từ inline này
      const currentCommentMarks = inline.marks?.filter((m) => m.type === "comment") || [];
      const currentCommentIds = currentCommentMarks
        .map((m) => m.attrs?.commentId as string)
        .filter(Boolean);

      for (const comId of currentCommentIds) {
        if (!activeCommentIds.has(comId)) {
          const ooxmlId = this.commentIdMap.get(comId);
          if (ooxmlId !== undefined) {
            parts.push(`<w:commentRangeStart w:id="${ooxmlId}"/>`);
            activeCommentIds.add(comId);
          }
        }
      }

      // 1.1. Mở bookmarkStart cho các Range Bookmarks mới bắt đầu từ inline này
      const currentBookmarkMarks = inline.marks?.filter((m) => m.type === "bookmark") || [];
      const currentBookmarkIds = currentBookmarkMarks
        .map((m) => m.attrs?.id as string)
        .filter(Boolean);

      for (const bmId of currentBookmarkIds) {
        if (!activeBookmarkIds.has(bmId)) {
          const bmMark = currentBookmarkMarks.find((m) => m.attrs?.id === bmId);
          const numId = this.getBookmarkXmlId(bmId);
          const xmlName = this.getBookmarkXmlName(bmId, bmMark?.attrs?.name as string);
          parts.push(`<w:bookmarkStart w:id="${numId}" w:name="${escapeXmlAttr(xmlName)}"/>`);
          activeBookmarkIds.add(bmId);
        }
      }

      // 2. Tuần tự hóa nội dung phần tử (Text / HardBreak / Image / Equation / NoteReference / Bookmarks)
      if (inline.type === "text") {
        const textStr = inline.text || "";
        const marks = inline.marks || [];

        // Tách biệt giữa text changes (insert / delete) và format changes (format)
        const linkMark = marks.find((m) => m.type === "link");
        const allTrackChangeMarks = marks.filter((m) => m.type === "trackChange");
        const textRevisionMark = allTrackChangeMarks.find(
          (m) => m.attrs?.changeType === "insert" || m.attrs?.changeType === "delete"
        );
        const formatRevisionMark = allTrackChangeMarks.find(
          (m) => m.attrs?.changeType === "format"
        );

        // Kiểm tra xem format revision có đang ở trạng thái pending hay không
        const isFormatPending = Boolean(
          formatRevisionMark &&
            (() => {
              const revId = formatRevisionMark.attrs?.id as string | undefined;
              const markStatus = formatRevisionMark.attrs?.status as string | undefined;
              const itemStatus = revId ? this.trackedChangesMap.get(revId)?.status : undefined;
              const status = markStatus || itemStatus || "pending";
              return status !== "accepted" && status !== "rejected";
            })()
        );

        const rPrXml = this.buildRunPropertiesXml(
          marks,
          isFormatPending ? formatRevisionMark : undefined
        );

        const lines = textStr.split("\n");
        const runsForText: string[] = [];

        // Kiểm tra xem text change (insert/delete) có đang pending hay không
        const isTextRevPending = Boolean(
          textRevisionMark &&
            (() => {
              const revId = textRevisionMark.attrs?.id as string | undefined;
              const markStatus = textRevisionMark.attrs?.status as string | undefined;
              const itemStatus = revId ? this.trackedChangesMap.get(revId)?.status : undefined;
              const status = markStatus || itemStatus || "pending";
              return status !== "accepted" && status !== "rejected";
            })()
        );

        if (isTextRevPending && textRevisionMark) {
          const changeType = (textRevisionMark.attrs?.changeType as string) || "insert";
          const author = (textRevisionMark.attrs?.author as string) || "Author";
          const timestamp =
            (textRevisionMark.attrs?.timestamp as string) || new Date().toISOString();
          const rawId = (textRevisionMark.attrs?.id as string) || `change-${i}`;
          const tcXmlId = this.getTrackChangeXmlId(rawId);

          for (let idx = 0; idx < lines.length; idx++) {
            if (idx > 0) {
              runsForText.push("<w:r><w:br/></w:r>");
            }
            if (lines[idx].length > 0) {
              if (changeType === "delete") {
                runsForText.push(
                  `<w:del w:id="${tcXmlId}" w:author="${escapeXmlAttr(author)}" w:date="${escapeXmlAttr(timestamp)}"><w:r>${rPrXml}<w:delText xml:space="preserve">${escapeXmlText(lines[idx])}</w:delText></w:r></w:del>`
                );
              } else {
                runsForText.push(
                  `<w:ins w:id="${tcXmlId}" w:author="${escapeXmlAttr(author)}" w:date="${escapeXmlAttr(timestamp)}"><w:r>${rPrXml}${buildTextElement(lines[idx])}</w:r></w:ins>`
                );
              }
            }
          }

          if (runsForText.length === 0) {
            if (changeType === "delete") {
              runsForText.push(
                `<w:del w:id="${tcXmlId}" w:author="${escapeXmlAttr(author)}" w:date="${escapeXmlAttr(timestamp)}"><w:r>${rPrXml}<w:delText/></w:r></w:del>`
              );
            } else {
              runsForText.push(
                `<w:ins w:id="${tcXmlId}" w:author="${escapeXmlAttr(author)}" w:date="${escapeXmlAttr(timestamp)}"><w:r>${rPrXml}<w:t></w:t></w:r></w:ins>`
              );
            }
          }
        } else {
          // Văn bản thông thường (kể cả văn bản đã Accept/Reject hoặc chỉ có format revision)
          for (let idx = 0; idx < lines.length; idx++) {
            if (idx > 0) {
              runsForText.push("<w:r><w:br/></w:r>");
            }
            if (lines[idx].length > 0) {
              runsForText.push(`<w:r>${rPrXml}${buildTextElement(lines[idx])}</w:r>`);
            }
          }

          if (runsForText.length === 0) {
            runsForText.push(`<w:r>${rPrXml}<w:t></w:t></w:r>`);
          }
        }

        const combinedRuns = runsForText.join("");

        if (linkMark && linkMark.attrs?.href) {
          const href = String(linkMark.attrs.href);
          const relId = this.addRelationship(
            "http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink",
            href,
            "External"
          );
          parts.push(`<w:hyperlink r:id="${relId}" w:history="1">${combinedRuns}</w:hyperlink>`);
        } else {
          parts.push(combinedRuns);
        }
      } else if (inline.type === "hardBreak") {
        parts.push("<w:r><w:br/></w:r>");
      } else if (inline.type === "image") {
        const drawingXml = this.serializeImageDrawing(inline);
        parts.push(`<w:r>${drawingXml}</w:r>`);
      } else if (inline.type === "shape") {
        const drawingXml = this.serializeShapeDrawing(inline);
        if (drawingXml) {
          parts.push(`<w:r>${drawingXml}</w:r>`);
        }
      } else if (inline.type === "textBox") {
        const drawingXml = this.serializeTextBoxDrawing(inline);
        if (drawingXml) {
          parts.push(`<w:r>${drawingXml}</w:r>`);
        }
      } else if (inline.type === "equation") {
        const latex = (inline.attrs?.latex as string) || "";
        if (latex) {
          const ommlRes = OmmlEngine.exportToOmml(latex, { displayMode: false });
          parts.push(ommlRes.xml);
        }
      } else if (inline.type === "bookmarkAnchor") {
        // Position Bookmark: zero-length anchor trong OOXML
        const rawId = (inline.attrs?.id as string) || `bm_pos_${i}`;
        const rawName = (inline.attrs?.name as string) || "Bookmark";
        const numId = this.getBookmarkXmlId(rawId);
        const xmlName = this.getBookmarkXmlName(rawId, rawName);
        parts.push(`<w:bookmarkStart w:id="${numId}" w:name="${escapeXmlAttr(xmlName)}"/><w:bookmarkEnd w:id="${numId}"/>`);
      } else if (inline.type === "noteReference") {
        const noteType = (inline.attrs?.noteType as string) || "footnote";
        const content = (inline.attrs?.content as string) || "";
        const noteId = (inline.attrs?.noteId as string) || "";

        if (noteType === "endnote") {
          const xmlId = this.endnoteXmlCounter++;
          this.endnoteList.push({ id: xmlId, noteId, content });
          parts.push(
            `<w:r><w:rPr><w:rStyle w:val="EndnoteReference"/></w:rPr><w:endnoteReference w:id="${xmlId}"/></w:r>`
          );
        } else {
          const xmlId = this.footnoteXmlCounter++;
          this.footnoteList.push({ id: xmlId, noteId, content });
          parts.push(
            `<w:r><w:rPr><w:rStyle w:val="FootnoteReference"/></w:rPr><w:footnoteReference w:id="${xmlId}"/></w:r>`
          );
        }
      } else if (inline.type === "crossReference") {
        const customText = (inline.attrs?.customText as string) || "[Cross-reference]";
        const targetId = (inline.attrs?.targetId as string) || "";
        const targetType = (inline.attrs?.targetType as string) || "bookmark";
        const format = (inline.attrs?.format as string) || "text";

        if (targetId) {
          // Ánh xạ stable internal ID sang Word bookmark name
          let wordBookmarkName = this.bookmarkNameMap.get(targetId);
          if (!wordBookmarkName && targetType === "bookmark") {
            wordBookmarkName = this.getBookmarkXmlName(targetId);
          }

          if (wordBookmarkName) {
            const fieldCmd = format === "page" ? `PAGEREF ${wordBookmarkName} \\h` : `REF ${wordBookmarkName} \\h`;
            parts.push(
              `<w:fldSimple w:instr="${escapeXmlAttr(fieldCmd)}"><w:r><w:rPr><w:color w:val="2563EB"/><w:u w:val="single"/></w:rPr>${buildTextElement(customText)}</w:r></w:fldSimple>`
            );
          } else {
            // Broken reference / unmapped target: fallback an toàn không gây crash
            const fallbackText = customText || "[Reference not found]";
            parts.push(
              `<w:r><w:rPr><w:color w:val="2563EB"/><w:u w:val="single"/></w:rPr>${buildTextElement(fallbackText)}</w:r>`
            );
          }
        } else {
          // Không có targetId: fallback an toàn
          const fallbackText = customText || "[Reference not found]";
          parts.push(
            `<w:r><w:rPr><w:color w:val="2563EB"/><w:u w:val="single"/></w:rPr>${buildTextElement(fallbackText)}</w:r>`
          );
        }
      } else if (inline.type === "citation") {
        const customText = (inline.attrs?.customText as string) || "(Citation)";
        parts.push(
          `<w:r><w:rPr><w:color w:val="1D4ED8"/></w:rPr>${buildTextElement(customText)}</w:r>`
        );
      } else if (inline.type === "field") {
        const fieldXml = this.serializeField(inline);
        parts.push(fieldXml);
      }

      // 3. Đóng commentRangeEnd nếu phần tử kế tiếp không còn mang comment này
      const nextInline = inlines[i + 1];
      const nextCommentMarks = nextInline?.marks?.filter((m) => m.type === "comment") || [];
      const nextCommentIds = nextCommentMarks
        .map((m) => m.attrs?.commentId as string)
        .filter(Boolean);

      for (const activeComId of Array.from(activeCommentIds)) {
        if (!nextCommentIds.includes(activeComId)) {
          const ooxmlId = this.commentIdMap.get(activeComId);
          if (ooxmlId !== undefined) {
            parts.push(`<w:commentRangeEnd w:id="${ooxmlId}"/>`);
            parts.push(
              `<w:r><w:rPr><w:rStyle w:val="CommentReference"/></w:rPr><w:commentReference w:id="${ooxmlId}"/></w:r>`
            );
          }
          activeCommentIds.delete(activeComId);
        }
      }

      // 3.1 Đóng bookmarkEnd nếu phần tử kế tiếp không còn mang bookmark này
      const nextBookmarkMarks = nextInline?.marks?.filter((m) => m.type === "bookmark") || [];
      const nextBookmarkIds = nextBookmarkMarks
        .map((m) => m.attrs?.id as string)
        .filter(Boolean);

      for (const activeBmId of Array.from(activeBookmarkIds)) {
        if (!nextBookmarkIds.includes(activeBmId)) {
          const numId = this.getBookmarkXmlId(activeBmId);
          parts.push(`<w:bookmarkEnd w:id="${numId}"/>`);
          activeBookmarkIds.delete(activeBmId);
        }
      }
    }

    // Đóng các bookmarks còn mở khi kết thúc paragraph
    for (const remainingBmId of activeBookmarkIds) {
      const numId = this.getBookmarkXmlId(remainingBmId);
      parts.push(`<w:bookmarkEnd w:id="${numId}"/>`);
    }

    return parts.join("");
  }

  /**
   * Tuần tự hóa một trường động nội dòng (Field)
   * Giữ tách bạch giữa instruction và cached display result.
   * Hỗ trợ cả simple field (w:fldSimple) và complex field (w:fldChar).
   */
  private serializeField(inline: JSONContent): string {
    const attrs = inline.attrs as any;
    const rPrXml = this.buildRunPropertiesXml(inline.marks || []);
    return serializeFieldXml(attrs, rPrXml);
  }

  /**
   * Tạo phần tử <w:rPr> từ mảng marks của ProseMirror, bao gồm cả <w:rPrChange> nếu có pending Character Formatting Revision
   */
  private buildRunPropertiesXml(marks: any[], pendingFormatMark?: any): string {
    const rPrParts: string[] = [];

    // 1. Semantic Character Style (<w:rStyle>) luôn đứng đầu theo chuẩn OOXML
    const charStyleMark = marks.find((m) => m.type === "characterStyle");
    if (charStyleMark?.attrs?.styleId) {
      const charWordId = this.getWordStyleId(charStyleMark.attrs.styleId);
      if (charWordId) {
        rPrParts.push(`<w:rStyle w:val="${charWordId}"/>`);
      }
    }

    // 2. Direct formatting overrides (theo thứ tự schema ISO/IEC 29500)
    const textStyleMark = marks.find((m) => m.type === "textStyle");
    if (textStyleMark?.attrs?.fontFamily) {
      const fontFamily = textStyleMark.attrs.fontFamily as string;
      rPrParts.push(
        `<w:rFonts w:ascii="${escapeXmlAttr(fontFamily)}" w:hAnsi="${escapeXmlAttr(fontFamily)}" w:cs="${escapeXmlAttr(fontFamily)}"/>`
      );
    }

    if (marks.some((m) => m.type === "bold")) {
      rPrParts.push("<w:b/>");
    }
    if (marks.some((m) => m.type === "italic")) {
      rPrParts.push("<w:i/>");
    }
    if (marks.some((m) => m.type === "strike")) {
      rPrParts.push("<w:strike/>");
    }

    if (textStyleMark?.attrs?.color) {
      const hex = cssColorToHex(textStyleMark.attrs.color as string);
      if (hex) {
        rPrParts.push(`<w:color w:val="${hex}"/>`);
      }
    }

    if (textStyleMark?.attrs?.fontSize) {
      const fontSize = textStyleMark.attrs.fontSize;
      const pt = typeof fontSize === "number" ? fontSize : parseFloat(String(fontSize));
      if (!isNaN(pt) && pt > 0) {
        const szVal = ptToHalfPoints(pt);
        rPrParts.push(`<w:sz w:val="${szVal}"/><w:szCs w:val="${szVal}"/>`);
      }
    }

    const hlMark = marks.find((m) => m.type === "highlight");
    if (hlMark?.attrs?.color) {
      const hlName = colorToWordHighlight(hlMark.attrs.color as string);
      rPrParts.push(`<w:highlight w:val="${hlName}"/>`);
    }

    if (marks.some((m) => m.type === "underline")) {
      rPrParts.push('<w:u w:val="single"/>');
    }

    // 3. Pending Character Formatting Revision (<w:rPrChange>) luôn đứng CUỐI CÙNG trong <w:rPr>
    if (pendingFormatMark) {
      const rPrChangeXml = this.buildRunPropertiesChangeXml(pendingFormatMark);
      if (rPrChangeXml) {
        rPrParts.push(rPrChangeXml);
      }
    }

    return rPrParts.length > 0 ? `<w:rPr>${rPrParts.join("")}</w:rPr>` : "";
  }

  /**
   * Tạo phần tử <w:rPrChange> cho Character Formatting Revision theo chuẩn OOXML ISO/IEC 29500
   * Chứa trạng thái định dạng trước đó (previous formatting / before) bên trong thẻ con <w:rPr>
   */
  private buildRunPropertiesChangeXml(formatRevisionMark: any): string {
    const rawId = (formatRevisionMark.attrs?.id as string) || `fmt-r-${this.trackChangeCounter}`;
    const xmlId = this.getTrackChangeXmlId(rawId);

    const revItem = this.trackedChangesMap.get(rawId);
    const author = (formatRevisionMark.attrs?.author as string) || revItem?.author || "Author";
    const date =
      (formatRevisionMark.attrs?.timestamp as string) ||
      revItem?.timestamp ||
      new Date().toISOString();

    const diffs: FormattingPropertyDiff[] =
      formatRevisionMark.attrs?.formatChanges || revItem?.formatChange?.changes || [];
    const prevFormatting: DocxRunFormatting =
      (revItem?.formatChange as any)?.previousFormatting || {};

    const getBeforeVal = (prop: string) => {
      const diff = diffs.find((d) => d.property === prop);
      return diff !== undefined ? diff.before : undefined;
    };

    const prevRPrParts: string[] = [];

    // 1. Semantic Character Style (<w:rStyle>)
    const prevStyleId = getBeforeVal("characterStyleId");
    if (prevStyleId && typeof prevStyleId === "string" && prevStyleId !== STYLE_NORMAL_ID) {
      const charWordId = this.getWordStyleId(prevStyleId) || prevStyleId;
      if (charWordId && charWordId !== "Normal") {
        prevRPrParts.push(`<w:rStyle w:val="${escapeXmlAttr(charWordId)}"/>`);
      }
    }

    // 2. Font Family (<w:rFonts>)
    const prevFontFamily = getBeforeVal("fontFamily") ?? prevFormatting.fontFamily;
    if (prevFontFamily && typeof prevFontFamily === "string") {
      prevRPrParts.push(
        `<w:rFonts w:ascii="${escapeXmlAttr(prevFontFamily)}" w:hAnsi="${escapeXmlAttr(prevFontFamily)}" w:cs="${escapeXmlAttr(prevFontFamily)}"/>`
      );
    }

    // 3. Bold (<w:b>)
    const prevBold = getBeforeVal("bold") ?? prevFormatting.bold;
    if (prevBold === true) {
      prevRPrParts.push("<w:b/>");
    } else if (prevBold === false) {
      prevRPrParts.push('<w:b w:val="0"/>');
    }

    // 4. Italic (<w:i>)
    const prevItalic = getBeforeVal("italic") ?? prevFormatting.italic;
    if (prevItalic === true) {
      prevRPrParts.push("<w:i/>");
    } else if (prevItalic === false) {
      prevRPrParts.push('<w:i w:val="0"/>');
    }

    // 5. Strike (<w:strike>)
    const prevStrike = getBeforeVal("strike") ?? prevFormatting.strike;
    if (prevStrike === true) {
      prevRPrParts.push("<w:strike/>");
    } else if (prevStrike === false) {
      prevRPrParts.push('<w:strike w:val="0"/>');
    }

    // 6. Color (<w:color>)
    const prevColor = getBeforeVal("color") ?? prevFormatting.color;
    if (prevColor) {
      if (prevColor === "auto") {
        prevRPrParts.push('<w:color w:val="auto"/>');
      } else {
        const hex = cssColorToHex(String(prevColor));
        if (hex) {
          prevRPrParts.push(`<w:color w:val="${hex}"/>`);
        }
      }
    }

    // 7. Font Size (<w:sz>, <w:szCs>)
    const prevFontSize = getBeforeVal("fontSize") ?? prevFormatting.fontSizePt;
    if (prevFontSize !== undefined && prevFontSize !== null) {
      const pt = typeof prevFontSize === "number" ? prevFontSize : parseFloat(String(prevFontSize));
      if (!isNaN(pt) && pt > 0) {
        const szVal = ptToHalfPoints(pt);
        prevRPrParts.push(`<w:sz w:val="${szVal}"/><w:szCs w:val="${szVal}"/>`);
      }
    }

    // 8. Highlight (<w:highlight>)
    const prevHighlight = getBeforeVal("highlight") ?? prevFormatting.highlight;
    if (prevHighlight !== undefined && prevHighlight !== null) {
      if (prevHighlight === "none" || !prevHighlight) {
        prevRPrParts.push('<w:highlight w:val="none"/>');
      } else {
        const hlName = colorToWordHighlight(String(prevHighlight));
        prevRPrParts.push(`<w:highlight w:val="${hlName}"/>`);
      }
    }

    // 9. Underline (<w:u>)
    const prevUnderline = getBeforeVal("underline") ?? prevFormatting.underline;
    if (prevUnderline === true || prevUnderline === "single") {
      prevRPrParts.push('<w:u w:val="single"/>');
    } else if (prevUnderline === false || prevUnderline === "none") {
      prevRPrParts.push('<w:u w:val="none"/>');
    }

    const prevRPrXml = prevRPrParts.length > 0 ? `<w:rPr>${prevRPrParts.join("")}</w:rPr>` : "<w:rPr/>";

    return `<w:rPrChange w:id="${xmlId}" w:author="${escapeXmlAttr(author)}" w:date="${escapeXmlAttr(date)}">${prevRPrXml}</w:rPrChange>`;
  }

  /**
   * Tạo phần tử <w:pPrChange> cho Paragraph Formatting Revision theo chuẩn OOXML ISO/IEC 29500
   * Chứa trạng thái định dạng trước đó (previous paragraph formatting / before) bên trong thẻ con <w:pPr>
   */
  private buildParagraphPropertiesChangeXml(revItem: TrackChangeItem): string {
    const rawId = revItem.id || `fmt-p-${this.trackChangeCounter}`;
    const xmlId = this.getTrackChangeXmlId(rawId);
    const author = revItem.author || "Author";
    const date = revItem.timestamp || new Date().toISOString();

    const diffs: FormattingPropertyDiff[] = revItem.formatChange?.changes || [];
    const prevPPrParts: string[] = [];

    const getBeforeVal = (prop: string) => {
      const diff = diffs.find((d) => d.property === prop);
      return diff !== undefined ? diff.before : undefined;
    };

    // 1. Semantic Paragraph Style (<w:pStyle>)
    const prevStyleId = getBeforeVal("paragraphStyleId");
    if (prevStyleId && typeof prevStyleId === "string" && prevStyleId !== STYLE_NORMAL_ID) {
      const wordStyleId = this.getWordStyleId(prevStyleId) || prevStyleId;
      if (wordStyleId && wordStyleId !== "Normal") {
        prevPPrParts.push(`<w:pStyle w:val="${escapeXmlAttr(wordStyleId)}"/>`);
      }
    }

    // 2. Keep with Next (<w:keepNext>)
    const prevKeepNext = getBeforeVal("keepWithNext");
    if (prevKeepNext === true) {
      prevPPrParts.push("<w:keepNext/>");
    } else if (prevKeepNext === false) {
      prevPPrParts.push('<w:keepNext w:val="0"/>');
    }

    // 3. Keep Lines Together (<w:keepLines>)
    const prevKeepLines = getBeforeVal("keepLinesTogether");
    if (prevKeepLines === true) {
      prevPPrParts.push("<w:keepLines/>");
    } else if (prevKeepLines === false) {
      prevPPrParts.push('<w:keepLines w:val="0"/>');
    }

    // 4. Page Break Before (<w:pageBreakBefore>)
    const prevPageBreak = getBeforeVal("pageBreakBefore");
    if (prevPageBreak === true) {
      prevPPrParts.push("<w:pageBreakBefore/>");
    } else if (prevPageBreak === false) {
      prevPPrParts.push('<w:pageBreakBefore w:val="0"/>');
    }

    // 5. Widow Control (<w:widowControl>)
    const prevWidow = getBeforeVal("widowControl");
    if (prevWidow === true) {
      prevPPrParts.push("<w:widowControl/>");
    } else if (prevWidow === false) {
      prevPPrParts.push('<w:widowControl w:val="0"/>');
    }

    // 6. Spacing (<w:spacing>)
    const prevLineSpacing = getBeforeVal("lineSpacing");
    const prevSpacingBefore = getBeforeVal("spacingBefore");
    const prevSpacingAfter = getBeforeVal("spacingAfter");
    const spacingAttrs: string[] = [];

    if (prevLineSpacing !== undefined && prevLineSpacing !== null) {
      const factor = typeof prevLineSpacing === "number" ? prevLineSpacing : parseFloat(String(prevLineSpacing));
      if (!isNaN(factor) && factor > 0) {
        spacingAttrs.push(`w:line="${Math.round(factor * 240)}" w:lineRule="auto"`);
      }
    }
    if (prevSpacingBefore !== undefined && prevSpacingBefore !== null) {
      const pt = typeof prevSpacingBefore === "number" ? prevSpacingBefore : parseFloat(String(prevSpacingBefore));
      if (!isNaN(pt) && pt >= 0) {
        spacingAttrs.push(`w:before="${ptToTwips(pt)}"`);
      }
    }
    if (prevSpacingAfter !== undefined && prevSpacingAfter !== null) {
      const pt = typeof prevSpacingAfter === "number" ? prevSpacingAfter : parseFloat(String(prevSpacingAfter));
      if (!isNaN(pt) && pt >= 0) {
        spacingAttrs.push(`w:after="${ptToTwips(pt)}"`);
      }
    }
    if (spacingAttrs.length > 0) {
      prevPPrParts.push(`<w:spacing ${spacingAttrs.join(" ")}/>`);
    }

    // 7. Indents (<w:ind>)
    const prevLeftIndent = getBeforeVal("leftIndent");
    const prevRightIndent = getBeforeVal("rightIndent");
    const prevFirstLineIndent = getBeforeVal("firstLineIndent");
    const prevHangingIndent = getBeforeVal("hangingIndent");
    const prevIndent = getBeforeVal("indent");

    const indAttrs: string[] = [];
    if (prevLeftIndent !== undefined && prevLeftIndent !== null) {
      const pt = typeof prevLeftIndent === "number" ? prevLeftIndent : parseFloat(String(prevLeftIndent));
      if (!isNaN(pt) && pt > 0) {
        indAttrs.push(`w:left="${ptToTwips(pt)}"`);
      }
    } else if (prevIndent !== undefined && prevIndent !== null) {
      const lvl = typeof prevIndent === "number" ? prevIndent : parseFloat(String(prevIndent));
      if (!isNaN(lvl) && lvl > 0) {
        indAttrs.push(`w:left="${Math.round(lvl * 720)}"`);
      }
    }
    if (prevRightIndent !== undefined && prevRightIndent !== null) {
      const pt = typeof prevRightIndent === "number" ? prevRightIndent : parseFloat(String(prevRightIndent));
      if (!isNaN(pt) && pt > 0) {
        indAttrs.push(`w:right="${ptToTwips(pt)}"`);
      }
    }
    if (prevFirstLineIndent !== undefined && prevFirstLineIndent !== null) {
      const pt = typeof prevFirstLineIndent === "number" ? prevFirstLineIndent : parseFloat(String(prevFirstLineIndent));
      if (!isNaN(pt) && pt > 0) {
        indAttrs.push(`w:firstLine="${ptToTwips(pt)}"`);
      }
    }
    if (prevHangingIndent !== undefined && prevHangingIndent !== null) {
      const pt = typeof prevHangingIndent === "number" ? prevHangingIndent : parseFloat(String(prevHangingIndent));
      if (!isNaN(pt) && pt > 0) {
        indAttrs.push(`w:hanging="${ptToTwips(pt)}"`);
      }
    }
    if (indAttrs.length > 0) {
      prevPPrParts.push(`<w:ind ${indAttrs.join(" ")}/>`);
    }

    // 8. Alignment (<w:jc>)
    const prevAlign = getBeforeVal("textAlign");
    if (prevAlign && typeof prevAlign === "string") {
      const jcVal = prevAlign === "justify" ? "both" : prevAlign;
      prevPPrParts.push(`<w:jc w:val="${jcVal}"/>`);
    }

    const prevPPrXml = prevPPrParts.length > 0 ? `<w:pPr>${prevPPrParts.join("")}</w:pPr>` : "<w:pPr/>";

    return `<w:pPrChange w:id="${xmlId}" w:author="${escapeXmlAttr(author)}" w:date="${escapeXmlAttr(date)}">${prevPPrXml}</w:pPrChange>`;
  }
}
