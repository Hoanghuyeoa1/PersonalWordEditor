/**
 * Quản lý tập trung các mục Default và Override trong [Content_Types].xml
 * Tuân thủ ISO/IEC 29500-2 Open Packaging Conventions (OPC).
 */

import { getContentTypesNamespace } from "../constants/ooxmlNamespaces.ts";
import { parseXmlString, getDirectChildrenByLocalName, getAttrValue } from "../utils/xmlUtils.ts";

export const WELL_KNOWN_CONTENT_TYPES = {
  // Document Parts
  documentMain: "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml",
  styles: "application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml",
  numbering: "application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml",
  header: "application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml",
  footer: "application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml",
  comments: "application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml",
  footnotes: "application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml",
  endnotes: "application/vnd.openxmlformats-officedocument.wordprocessingml.endnotes+xml",
  settings: "application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml",
  theme: "application/vnd.openxmlformats-officedocument.theme+xml",
  fontTable: "application/vnd.openxmlformats-officedocument.wordprocessingml.fontTable+xml",

  // Packaging primitives
  relationships: "application/vnd.openxmlformats-package.relationships+xml",
  xml: "application/xml",

  // Media
  png: "image/png",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  emf: "image/x-emf",
  wmf: "image/x-wmf",
  tiff: "image/tiff",
  tif: "image/tiff",
  bmp: "image/bmp",
} as const;

export class ContentTypesManager {
  private defaults = new Map<string, string>(); // ext (lowercase) -> contentType
  private overrides = new Map<string, { partName: string; contentType: string }>(); // normalizedPartName -> { partName, contentType }

  constructor() {
    this.initStandardDefaults();
  }

  /**
   * Khởi tạo các phần mở rộng mặc định chuẩn
   */
  private initStandardDefaults(): void {
    this.defaults.set("rels", WELL_KNOWN_CONTENT_TYPES.relationships);
    this.defaults.set("xml", WELL_KNOWN_CONTENT_TYPES.xml);
    this.defaults.set("png", WELL_KNOWN_CONTENT_TYPES.png);
    this.defaults.set("jpeg", WELL_KNOWN_CONTENT_TYPES.jpeg);
    this.defaults.set("jpg", WELL_KNOWN_CONTENT_TYPES.jpg);
    this.defaults.set("gif", WELL_KNOWN_CONTENT_TYPES.gif);
    this.defaults.set("webp", WELL_KNOWN_CONTENT_TYPES.webp);
    this.defaults.set("svg", WELL_KNOWN_CONTENT_TYPES.svg);
    this.defaults.set("emf", WELL_KNOWN_CONTENT_TYPES.emf);
    this.defaults.set("wmf", WELL_KNOWN_CONTENT_TYPES.wmf);
    this.defaults.set("tiff", WELL_KNOWN_CONTENT_TYPES.tiff);
    this.defaults.set("tif", WELL_KNOWN_CONTENT_TYPES.tif);
    this.defaults.set("bmp", WELL_KNOWN_CONTENT_TYPES.bmp);
  }

  /**
   * Chuẩn hóa PartName theo chuẩn OPC: phải bắt đầu bằng "/"
   */
  private normalizePartName(partName: string): string {
    let clean = partName.trim().replace(/\\/g, "/");
    if (!clean.startsWith("/")) {
      clean = `/${clean}`;
    }
    return clean;
  }

  /**
   * Thêm một kiểu mặc định theo phần mở rộng file (Extension)
   */
  public addDefault(extension: string, contentType: string): this {
    const ext = extension.toLowerCase().replace(/^\./, "").trim();
    if (ext && contentType) {
      this.defaults.set(ext, contentType);
    }
    return this;
  }

  /**
   * Thêm một mục Override cho một Part cụ thể.
   * Ngăn chặn hoàn toàn việc duplicate part entry.
   */
  public addOverride(partName: string, contentType: string): this {
    if (!partName || !contentType) return this;
    const normalized = this.normalizePartName(partName);
    const key = normalized.toLowerCase();
    const existing = this.overrides.get(key);
    if (existing) {
      existing.contentType = contentType;
    } else {
      this.overrides.set(key, {
        partName: normalized,
        contentType,
      });
    }
    return this;
  }

  /**
   * Kiểm tra xem một partName đã có override chưa
   */
  public hasOverride(partName: string): boolean {
    const normalized = this.normalizePartName(partName);
    return this.overrides.has(normalized.toLowerCase());
  }

  /**
   * Kiểm tra xem một extension đã có default contentType chưa
   */
  public hasDefault(extension: string): boolean {
    const ext = extension.toLowerCase().replace(/^\./, "").trim();
    return this.defaults.has(ext);
  }

  /**
   * Tự động thêm Default cho file media nếu extension chưa có
   */
  public ensureMediaExtension(filename: string): void {
    const ext = filename.split(".").pop()?.toLowerCase();
    if (ext && !this.defaults.has(ext)) {
      const wellKnown = (WELL_KNOWN_CONTENT_TYPES as Record<string, string>)[ext];
      if (wellKnown) {
        this.addDefault(ext, wellKnown);
      } else {
        this.addDefault(ext, "application/octet-stream");
      }
    }
  }

  /**
   * Nạp từ chuỗi XML có sẵn (ví dụ đọc từ file docx ban đầu)
   */
  public parseXml(xmlContent: string): void {
    if (!xmlContent || !xmlContent.trim()) return;
    try {
      const doc = parseXmlString(xmlContent);
      const root = doc.documentElement;
      if (!root) return;

      const defaultNodes = getDirectChildrenByLocalName(root, "default");
      for (const d of defaultNodes) {
        const ext = getAttrValue(d, "extension") || getAttrValue(d, "Extension");
        const ct = getAttrValue(d, "contenttype") || getAttrValue(d, "ContentType");
        if (ext && ct) {
          this.addDefault(ext, ct);
        }
      }

      const overrideNodes = getDirectChildrenByLocalName(root, "override");
      for (const o of overrideNodes) {
        const pn = getAttrValue(o, "partname") || getAttrValue(o, "PartName");
        const ct = getAttrValue(o, "contenttype") || getAttrValue(o, "ContentType");
        if (pn && ct) {
          this.addOverride(pn, ct);
        }
      }
    } catch (err) {
      console.warn("Lỗi khi phân tích cú pháp [Content_Types].xml:", err);
    }
  }

  /**
   * Tạo chuỗi XML hợp lệ chuẩn ISO/IEC 29500 [Content_Types].xml
   */
  public buildXml(): string {
    const defaultLines: string[] = [];
    for (const [ext, ct] of this.defaults.entries()) {
      defaultLines.push(`  <Default Extension="${ext}" ContentType="${ct}"/>`);
    }

    const overrideLines: string[] = [];
    for (const { partName, contentType } of this.overrides.values()) {
      overrideLines.push(`  <Override PartName="${partName}" ContentType="${contentType}"/>`);
    }

    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types ${getContentTypesNamespace()}>
${defaultLines.join("\n")}
${overrideLines.join("\n")}
</Types>`;
  }

  /**
   * Tạo bản sao quản lý mới cho gói tài liệu chuẩn
   */
  public static createStandardWordPackage(options?: {
    headerPartNames?: string[];
    footerPartNames?: string[];
    hasComments?: boolean;
    hasFootnotes?: boolean;
    hasEndnotes?: boolean;
  }): ContentTypesManager {
    const manager = new ContentTypesManager();

    // Các thành phần bắt buộc
    manager.addOverride("/word/document.xml", WELL_KNOWN_CONTENT_TYPES.documentMain);
    manager.addOverride("/word/styles.xml", WELL_KNOWN_CONTENT_TYPES.styles);
    manager.addOverride("/word/numbering.xml", WELL_KNOWN_CONTENT_TYPES.numbering);

    // Thành phần tùy chọn
    if (options?.hasComments) {
      manager.addOverride("/word/comments.xml", WELL_KNOWN_CONTENT_TYPES.comments);
    }
    if (options?.hasFootnotes) {
      manager.addOverride("/word/footnotes.xml", WELL_KNOWN_CONTENT_TYPES.footnotes);
    }
    if (options?.hasEndnotes) {
      manager.addOverride("/word/endnotes.xml", WELL_KNOWN_CONTENT_TYPES.endnotes);
    }

    if (options?.headerPartNames) {
      for (const h of options.headerPartNames) {
        const clean = h.replace(/^\/?word\//, "");
        manager.addOverride(`/word/${clean}`, WELL_KNOWN_CONTENT_TYPES.header);
      }
    }

    if (options?.footerPartNames) {
      for (const f of options.footerPartNames) {
        const clean = f.replace(/^\/?word\//, "");
        manager.addOverride(`/word/${clean}`, WELL_KNOWN_CONTENT_TYPES.footer);
      }
    }

    return manager;
  }
}
