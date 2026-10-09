import type { Editor, JSONContent } from "@tiptap/core";
import type { Node as ProsemirrorNode } from "@tiptap/pm/model";
import { useDocumentStore } from "../../stores/documentStore.ts";
import type {
  BibliographyEntry,
  BibliographySource,
  CitationAttrs,
  CitationStyle,
  InsertBibliographyOptions,
  InsertCitationOptions,
} from "../types/citationTypes.ts";

/**
 * Citation Service - Personal Word Editor (Phase 6.6 Architecture)
 *
 * Dịch vụ cốt lõi quản lý Nguồn trích dẫn (Citations) và Thư mục tài liệu (Bibliography):
 * - Quản lý nguồn tham khảo (BibliographySource): Sách, Bài báo, Website, Kỷ yếu.
 * - Xác thực dữ liệu nguồn chuẩn hóa (Validation).
 * - Định dạng trích dẫn theo kiểu: APA 7th (tác giả, năm) và IEEE [1], [2].
 * - Biên tập danh mục Thư mục tham khảo tự động (Bibliography generation & update).
 * - Tránh trùng lặp nguồn (No duplicate entries).
 * - Bảo vệ an toàn khi xóa nguồn đang được trích dẫn (Safe deletion policy).
 * - Xử lý nguồn bị xóa/hỏng với trạng thái "[Citation not found]" an toàn, crash-proof.
 */
export class CitationService {
  /**
   * Sinh mã định danh duy nhất và ổn định cho nguồn tài liệu tham khảo
   */
  public static generateSourceId(): string {
    const random = Math.random().toString(36).substring(2, 9);
    return `ref_src_${Date.now()}_${random}`;
  }

  /**
   * Kiểm tra tính hợp lệ của dữ liệu nguồn tài liệu tham khảo
   */
  public static validateSource(source: Partial<BibliographySource>): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    if (!source) {
      errors.push("Dữ liệu nguồn không được để trống.");
      return { valid: false, errors };
    }

    if (!source.title || !source.title.trim()) {
      errors.push("Tiêu đề nguồn tài liệu không được để trống.");
    }

    if (!source.authors || !source.authors.trim()) {
      errors.push("Tác giả không được để trống.");
    }

    if (!source.year) {
      errors.push("Năm xuất bản không được để trống.");
    } else {
      const yearNum = Number(source.year);
      if (isNaN(yearNum) || yearNum < 1000 || yearNum > 9999) {
        errors.push("Năm xuất bản phải là số nguyên 4 chữ số hợp lệ (VD: 2024).");
      }
    }

    const validTypes = ["book", "journalArticle", "website", "conferencePaper"];
    if (!source.type || !validTypes.includes(source.type)) {
      errors.push("Loại tài liệu tham khảo không hợp lệ.");
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Lấy danh sách nguồn hiện có từ Document Store
   */
  public static getSources(): BibliographySource[] {
    try {
      return useDocumentStore.getState().bibliographySources || [];
    } catch {
      return [];
    }
  }

  /**
   * Lấy một nguồn cụ thể theo ID
   */
  public static getSource(id: string): BibliographySource | undefined {
    const sources = this.getSources();
    return sources.find((s) => s.id === id);
  }

  /**
   * Lưu hoặc cập nhật một nguồn tài liệu tham khảo
   */
  public static saveSource(source: BibliographySource): { success: boolean; message?: string } {
    const validation = this.validateSource(source);
    if (!validation.valid) {
      return { success: false, message: validation.errors.join(" ") };
    }

    const store = useDocumentStore.getState();
    const existing = store.bibliographySources.find((s) => s.id === source.id);

    if (existing) {
      store.updateBibliographySource(source.id, source);
      return { success: true, message: "Đã cập nhật nguồn tài liệu tham khảo." };
    } else {
      store.addBibliographySource(source);
      return { success: true, message: "Đã thêm nguồn tài liệu tham khảo mới." };
    }
  }

  /**
   * Xóa nguồn tài liệu tham khảo với kiểm tra trích dẫn an toàn
   */
  public static deleteSource(
    id: string,
    doc?: ProsemirrorNode | JSONContent,
    force: boolean = false
  ): { success: boolean; message: string; isCited: boolean } {
    const isCited = doc ? this.isSourceCited(doc, id) : false;

    if (isCited && !force) {
      return {
        success: false,
        isCited: true,
        message: "Nguồn này đang được trích dẫn trong tài liệu. Cần xác nhận trước khi xóa.",
      };
    }

    const store = useDocumentStore.getState();
    const ok = store.deleteBibliographySource(id);
    return {
      success: ok,
      isCited,
      message: ok
        ? "Đã xóa nguồn tài liệu tham khảo."
        : "Không tìm thấy nguồn tài liệu để xóa.",
    };
  }

  /**
   * Rút gọn danh sách tác giả cho in-text citation
   */
  public static formatInTextAuthors(rawAuthors: string, style: CitationStyle = "apa"): string {
    if (!rawAuthors || !rawAuthors.trim()) return "Không rõ tác giả";

    // Tách danh sách tác giả theo dấu phẩy hoặc chấm phẩy
    const authorList = rawAuthors
      .split(/[;,]/)
      .map((a) => a.trim())
      .filter((a) => a.length > 0);

    if (authorList.length === 0) return rawAuthors.trim();

    if (style === "apa") {
      if (authorList.length === 1) {
        return authorList[0];
      } else if (authorList.length === 2) {
        return `${authorList[0]} & ${authorList[1]}`;
      } else {
        return `${authorList[0]} et al.`;
      }
    } else {
      // IEEE
      if (authorList.length === 1) {
        return authorList[0];
      } else if (authorList.length === 2) {
        return `${authorList[0]} and ${authorList[1]}`;
      } else {
        return `${authorList[0]} et al.`;
      }
    }
  }

  /**
   * Định dạng in-text citation (chuỗi hiển thị trong thân văn bản)
   */
  public static formatInTextCitation(
    source: BibliographySource | undefined,
    style: CitationStyle = "apa",
    options?: { prefix?: string; suffix?: string; index?: number }
  ): string {
    if (!source) {
      return "[Citation not found]";
    }

    const prefix = options?.prefix ? options.prefix.trim() + " " : "";
    const suffix = options?.suffix ? options.suffix.trim() : "";

    if (style === "ieee") {
      const num = options?.index ?? 1;
      if (suffix) {
        return `[${prefix}${num}, ${suffix}]`;
      }
      return `[${prefix}${num}]`;
    }

    // APA: (Tác giả, Năm)
    const authors = this.formatInTextAuthors(source.authors, "apa");
    const year = source.year || "n.d.";

    let inner = `${authors}, ${year}`;
    if (suffix) {
      inner += `, ${suffix}`;
    }

    return `(${prefix}${inner})`;
  }

  /**
   * Định dạng toàn văn mục thư mục tài liệu tham khảo theo chuẩn
   */
  public static formatBibliographyEntry(
    source: BibliographySource,
    style: CitationStyle = "apa",
    index?: number
  ): string {
    const authors = (source.authors || "Không rõ tác giả").trim();
    const title = (source.title || "Không có tiêu đề").trim();
    const year = source.year || "n.d.";

    if (style === "ieee") {
      const num = index ?? 1;
      switch (source.type) {
        case "book": {
          const pub = source.publisher ? `${source.publisher}, ` : "";
          const city = source.city ? `${source.city}: ` : "";
          return `[${num}] ${authors}, ${title}. ${city}${pub}${year}.`;
        }
        case "journalArticle": {
          const jnl = source.journal ? `${source.journal}, ` : "";
          const vol = source.volume ? `vol. ${source.volume}, ` : "";
          const iss = source.issue ? `no. ${source.issue}, ` : "";
          const pp = source.pages ? `pp. ${source.pages}, ` : "";
          return `[${num}] ${authors}, "${title}," ${jnl}${vol}${iss}${pp}${year}.`;
        }
        case "website": {
          const urlStr = source.url ? ` ${source.url}` : "";
          const acc = source.accessedAt ? ` (Truy cập: ${source.accessedAt})` : "";
          return `[${num}] ${authors}, "${title}." [Trực tuyến]. Khả dụng:${urlStr}.${acc}`;
        }
        case "conferencePaper":
        default: {
          const conf = source.conferenceName ? `trong ${source.conferenceName}, ` : "";
          const pp = source.pages ? `pp. ${source.pages}, ` : "";
          return `[${num}] ${authors}, "${title}," ${conf}${pp}${year}.`;
        }
      }
    }

    // APA Style
    switch (source.type) {
      case "book": {
        const pub = source.publisher ? ` ${source.publisher}.` : "";
        return `${authors} (${year}). ${title}.${pub}`;
      }
      case "journalArticle": {
        const jnl = source.journal ? ` ${source.journal}` : "";
        const vol = source.volume ? `, ${source.volume}` : "";
        const iss = source.issue ? `(${source.issue})` : "";
        const pp = source.pages ? `, ${source.pages}` : "";
        const doiStr = source.doi ? ` https://doi.org/${source.doi}` : "";
        return `${authors} (${year}). ${title}.${jnl}${vol}${iss}${pp}.${doiStr}`.replace(/\.\./g, ".");
      }
      case "website": {
        const urlStr = source.url ? ` ${source.url}` : "";
        const acc = source.accessedAt ? ` (Truy cập ngày ${source.accessedAt})` : "";
        return `${authors} (${year}). ${title}.${urlStr}${acc}`;
      }
      case "conferencePaper":
      default: {
        const conf = source.conferenceName ? ` Trong ${source.conferenceName}` : "";
        const pp = source.pages ? ` (tr. ${source.pages})` : "";
        return `${authors} (${year}). ${title}.${conf}${pp}.`;
      }
    }
  }

  /**
   * Quét toàn bộ cây AST để trích xuất danh sách các node `citation`
   */
  public static extractCitations(
    doc: ProsemirrorNode | JSONContent
  ): Array<{ sourceId: string; style?: CitationStyle; prefix?: string; suffix?: string; pos?: number }> {
    const list: Array<{ sourceId: string; style?: CitationStyle; prefix?: string; suffix?: string; pos?: number }> = [];
    if (!doc) return list;

    if ((doc as any).descendants && typeof (doc as any).descendants === "function") {
      (doc as ProsemirrorNode).descendants((node, pos) => {
        if (node.type.name === "citation") {
          const attrs = (node.attrs as CitationAttrs) || {};
          if (attrs.sourceId) {
            list.push({
              sourceId: attrs.sourceId,
              style: attrs.style,
              prefix: attrs.prefix,
              suffix: attrs.suffix,
              pos,
            });
          }
        }
      });
      return list;
    }

    // JSONContent
    const scan = (node: JSONContent, currentOffset: number = 0) => {
      if (node.type === "citation") {
        const attrs = (node.attrs as CitationAttrs) || {};
        if (attrs.sourceId) {
          list.push({
            sourceId: attrs.sourceId,
            style: attrs.style,
            prefix: attrs.prefix,
            suffix: attrs.suffix,
            pos: currentOffset,
          });
        }
      }
      if (node.content && Array.isArray(node.content)) {
        let childOffset = currentOffset + 1;
        for (const child of node.content) {
          scan(child, childOffset);
          childOffset += 1;
        }
      }
    };
    scan(doc as JSONContent);
    return list;
  }

  /**
   * Kiểm tra xem một nguồn có đang được trích dẫn trong văn bản không
   */
  public static isSourceCited(doc: ProsemirrorNode | JSONContent, sourceId: string): boolean {
    const citations = this.extractCitations(doc);
    return citations.some((c) => c.sourceId === sourceId);
  }

  /**
   * Lấy số thứ tự xuất hiện của nguồn trong tài liệu (phục vụ IEEE style)
   */
  public static getSourceIndex(doc: ProsemirrorNode | JSONContent, sourceId: string): number {
    const citations = this.extractCitations(doc);
    const seen: string[] = [];
    for (const c of citations) {
      if (!seen.includes(c.sourceId)) {
        seen.push(c.sourceId);
      }
    }
    const idx = seen.indexOf(sourceId);
    return idx >= 0 ? idx + 1 : 1;
  }

  /**
   * Biên soạn danh sách mục thư mục tài liệu tham khảo (Bibliography Entries)
   */
  public static generateBibliographyEntries(
    doc: ProsemirrorNode | JSONContent,
    sources: BibliographySource[],
    style: CitationStyle = "apa",
    filter: "citedOnly" | "all" = "citedOnly"
  ): BibliographyEntry[] {
    if (!sources || sources.length === 0) return [];

    let targetSources: BibliographySource[] = [];

    if (filter === "citedOnly") {
      const citations = this.extractCitations(doc);
      const citedIds = new Set(citations.map((c) => c.sourceId));
      targetSources = sources.filter((s) => citedIds.has(s.id));
    } else {
      targetSources = [...sources];
    }

    if (targetSources.length === 0) return [];

    // Sắp xếp theo quy cách của style
    if (style === "ieee") {
      // IEEE: Sắp xếp theo thứ tự xuất hiện đầu tiên trong tài liệu
      const citations = this.extractCitations(doc);
      const orderMap = new Map<string, number>();
      let counter = 1;
      for (const c of citations) {
        if (!orderMap.has(c.sourceId)) {
          orderMap.set(c.sourceId, counter++);
        }
      }

      targetSources.sort((a, b) => {
        const orderA = orderMap.get(a.id) ?? 999999;
        const orderB = orderMap.get(b.id) ?? 999999;
        return orderA - orderB;
      });

      return targetSources.map((s, index) => {
        const num = index + 1;
        return {
          id: s.id,
          number: num,
          text: this.formatBibliographyEntry(s, "ieee", num),
          source: s,
        };
      });
    }

    // APA: Sắp xếp theo bảng chữ cái họ/tên tác giả
    targetSources.sort((a, b) => {
      const nameA = (a.authors || "").trim();
      const nameB = (b.authors || "").trim();
      return nameA.localeCompare(nameB, "vi", { sensitivity: "base" });
    });

    return targetSources.map((s) => ({
      id: s.id,
      text: this.formatBibliographyEntry(s, "apa"),
      source: s,
    }));
  }

  /**
   * Chèn một node trích dẫn semantic vào vị trí con trỏ
   */
  public static insertCitation(
    editor: Editor,
    options: InsertCitationOptions
  ): { success: boolean; message?: string } {
    if (!editor || !editor.state) {
      return { success: false, message: "Editor chưa sẵn sàng." };
    }

    const { schema } = editor.state;
    const citationType = schema.nodes.citation;

    if (!citationType) {
      return { success: false, message: "Node schema 'citation' chưa được đăng ký." };
    }

    const docStyle = useDocumentStore.getState().citationStyle || "apa";
    const chosenStyle = options.style || docStyle;
    const source = this.getSource(options.sourceId);

    // Tính toán index nếu là IEEE
    const index = chosenStyle === "ieee"
      ? this.getSourceIndex(editor.state.doc, options.sourceId)
      : undefined;

    const formattedText = this.formatInTextCitation(source, chosenStyle, {
      prefix: options.prefix,
      suffix: options.suffix,
      index,
    });

    const citationNode = citationType.create({
      sourceId: options.sourceId,
      style: chosenStyle,
      prefix: options.prefix || "",
      suffix: options.suffix || "",
      customText: formattedText,
    });

    const tr = editor.state.tr.replaceSelectionWith(citationNode);
    editor.view.dispatch(tr);

    try {
      if (editor.view && typeof (editor.view as any).focus === "function") {
        editor.view.focus();
      }
    } catch {
      // headless test
    }

    return { success: true, message: "Đã chèn trích dẫn thành công." };
  }

  /**
   * Chèn khối Thư mục tài liệu tham khảo (Bibliography) vào tài liệu
   */
  public static insertBibliography(
    editor: Editor,
    options?: InsertBibliographyOptions
  ): { success: boolean; message?: string } {
    if (!editor || !editor.state) {
      return { success: false, message: "Editor chưa sẵn sàng." };
    }

    const { schema } = editor.state;
    const bibType = schema.nodes.bibliography;

    if (!bibType) {
      return { success: false, message: "Node schema 'bibliography' chưa được đăng ký." };
    }

    const title = options?.title || "Tài liệu tham khảo";
    const style = options?.style || useDocumentStore.getState().citationStyle || "apa";
    const filter = options?.filter || "citedOnly";

    const sources = this.getSources();
    const entries = this.generateBibliographyEntries(
      editor.state.doc,
      sources,
      style,
      filter
    );

    const bibNode = bibType.create({
      title,
      style,
      filter,
      lastUpdated: new Date().toISOString(),
      entries,
    });

    const { tr, selection } = editor.state;
    const insertPos = selection.$from.after(1) || editor.state.doc.content.size;

    tr.insert(insertPos, bibNode);
    editor.view.dispatch(tr);

    try {
      if (editor.view && typeof (editor.view as any).focus === "function") {
        editor.view.focus();
      }
    } catch {
      // headless test
    }

    return {
      success: true,
      message: `Đã chèn Thư mục tài liệu tham khảo (${entries.length} nguồn).`,
    };
  }

  /**
   * Cập nhật khối Thư mục tài liệu tham khảo hiện có trong văn bản
   */
  public static updateBibliography(editor: Editor): { success: boolean; count: number; message?: string } {
    if (!editor || !editor.state) {
      return { success: false, count: 0, message: "Editor chưa sẵn sàng." };
    }

    const { doc } = editor.state;
    let foundPos: number | null = null;
    let currentAttrs: any = null;

    doc.descendants((node, pos) => {
      if (node.type.name === "bibliography") {
        foundPos = pos;
        currentAttrs = node.attrs;
        return false;
      }
    });

    if (foundPos === null || !currentAttrs) {
      return {
        success: false,
        count: 0,
        message: "Không tìm thấy khối Thư mục tài liệu tham khảo trong tài liệu.",
      };
    }

    const sources = this.getSources();
    const style = currentAttrs.style || useDocumentStore.getState().citationStyle || "apa";
    const filter = currentAttrs.filter || "citedOnly";

    const entries = this.generateBibliographyEntries(doc, sources, style, filter);

    const tr = editor.state.tr.setNodeMarkup(foundPos, undefined, {
      ...currentAttrs,
      lastUpdated: new Date().toISOString(),
      entries,
    });

    editor.view.dispatch(tr);

    return {
      success: true,
      count: entries.length,
      message: `Đã cập nhật Thư mục tài liệu tham khảo (${entries.length} nguồn).`,
    };
  }
}
