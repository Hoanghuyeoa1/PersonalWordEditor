import test from "node:test";
import assert from "node:assert/strict";
import { Editor } from "@tiptap/core";
import { getEditorExtensions } from "../editor/editorExtensions.ts";
import { ensureEditorPlugins } from "../editor/editorCommands.ts";
import { CitationService } from "./services/citationService.ts";
import { useDocumentStore } from "../stores/documentStore.ts";
import {
  serializeDocumentToMwd,
  deserializeMwdToDocument,
} from "../document/documentFile.ts";
import type { DocumentModel } from "../document/documentTypes.ts";
import { DocumentSerializer } from "../docx/mapping/documentSerializer.ts";
import type { BibliographySource } from "./types/citationTypes.ts";

function createCitationTestEditor(content?: any): Editor {
  const editor = new Editor({
    content: content || {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Văn bản thử nghiệm hệ thống Citation & Bibliography." }],
        },
      ],
    },
    extensions: getEditorExtensions(),
  });
  ensureEditorPlugins(editor);
  return editor;
}

test("PHASE 6.6 — 1. Source Model & Validation: Sách, Bài báo, Website, Kỷ yếu & lỗi trường bắt buộc", () => {
  // Nguồn Sách hợp lệ
  const validBook: BibliographySource = {
    id: "ref_src_book_1",
    type: "book",
    title: "Lập trình TypeScript Nâng cao",
    authors: "Nguyễn Văn A, Trần Thị B",
    year: 2023,
    publisher: "NXB Khoa học",
    city: "Hà Nội",
  };
  const valBook = CitationService.validateSource(validBook);
  assert.equal(valBook.valid, true);
  assert.equal(valBook.errors.length, 0);

  // Nguồn Bài báo hợp lệ
  const validArticle: BibliographySource = {
    id: "ref_src_article_1",
    type: "journalArticle",
    title: "Ứng dụng AI trong Soạn thảo Ngữ nghĩa",
    authors: "Smith, John and Doe, Jane",
    year: "2024",
    journal: "Journal of Computer Science",
    volume: "12",
    issue: "3",
    pages: "45-56",
    doi: "10.1234/jcs.2024.03",
  };
  const valArticle = CitationService.validateSource(validArticle);
  assert.equal(valArticle.valid, true);

  // Nguồn Website hợp lệ
  const validWeb: BibliographySource = {
    id: "ref_src_web_1",
    type: "website",
    title: "Hướng dẫn Trích dẫn Khoa học APA 7th",
    authors: "Đại học Bách Khoa",
    year: 2022,
    url: "https://example.edu.vn/apa7",
    accessedAt: "2024-10-07",
  };
  const valWeb = CitationService.validateSource(validWeb);
  assert.equal(valWeb.valid, true);

  // Nguồn thiếu tiêu đề
  const missingTitle = CitationService.validateSource({
    type: "book",
    authors: "Nguyễn Văn A",
    year: 2021,
  });
  assert.equal(missingTitle.valid, false);
  assert.ok(missingTitle.errors.some((e) => e.includes("Tiêu đề")));

  // Nguồn thiếu tác giả
  const missingAuthors = CitationService.validateSource({
    type: "book",
    title: "Sách mẫu",
    year: 2021,
  });
  assert.equal(missingAuthors.valid, false);
  assert.ok(missingAuthors.errors.some((e) => e.includes("Tác giả")));

  // Nguồn năm không hợp lệ
  const invalidYear = CitationService.validateSource({
    type: "book",
    title: "Sách mẫu",
    authors: "Tác giả",
    year: "abc",
  });
  assert.equal(invalidYear.valid, false);
  assert.ok(invalidYear.errors.some((e) => e.includes("Năm xuất bản")));
});

test("PHASE 6.6 — 2. Source Management: Thêm, Sửa, Xóa và Chính sách Bảo vệ Nguồn đang được trích dẫn", () => {
  const store = useDocumentStore.getState();
  store.resetDocument();

  const src1: BibliographySource = {
    id: "ref_src_test_manage_1",
    type: "book",
    title: "Cấu trúc Dữ liệu và Giải thuật",
    authors: "Đinh Mạnh Tường",
    year: 2020,
    publisher: "NXB ĐHQG Hà Nội",
  };

  const src2: BibliographySource = {
    id: "ref_src_test_manage_2",
    type: "journalArticle",
    title: "Kiến trúc Hướng Dịch vụ",
    authors: "Lê Văn C",
    year: 2021,
    journal: "Tạp chí Tin học",
  };

  // Thêm nguồn
  const addRes1 = CitationService.saveSource(src1);
  assert.equal(addRes1.success, true);
  CitationService.saveSource(src2);

  const sources = CitationService.getSources();
  assert.equal(sources.length, 2);
  assert.equal(CitationService.getSource("ref_src_test_manage_1")?.title, "Cấu trúc Dữ liệu và Giải thuật");

  // Chỉnh sửa nguồn
  const updatedSrc1: BibliographySource = {
    ...src1,
    title: "Cấu trúc Dữ liệu Nâng cao",
    year: 2022,
  };
  const editRes = CitationService.saveSource(updatedSrc1);
  assert.equal(editRes.success, true);
  assert.equal(CitationService.getSource("ref_src_test_manage_1")?.title, "Cấu trúc Dữ liệu Nâng cao");
  assert.equal(CitationService.getSource("ref_src_test_manage_1")?.year, 2022);

  // Tạo tài liệu có trích dẫn nguồn 1
  const editor = createCitationTestEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Theo nghiên cứu " },
          {
            type: "citation",
            attrs: { sourceId: "ref_src_test_manage_1", style: "apa" },
          },
          { type: "text", text: " thì kết quả rất khả quan." },
        ],
      },
    ],
  });

  // Kiểm tra trích dẫn
  assert.equal(CitationService.isSourceCited(editor.state.doc, "ref_src_test_manage_1"), true);
  assert.equal(CitationService.isSourceCited(editor.state.doc, "ref_src_test_manage_2"), false);

  // Thử xóa nguồn 1 mà không ép buộc (force = false) -> Bị từ chối an toàn
  const deleteFail = CitationService.deleteSource("ref_src_test_manage_1", editor.state.doc, false);
  assert.equal(deleteFail.success, false);
  assert.equal(deleteFail.isCited, true);
  assert.ok(deleteFail.message.includes("đang được trích dẫn"));

  // Xóa nguồn 2 (chưa trích dẫn) -> Thành công
  const deleteOk = CitationService.deleteSource("ref_src_test_manage_2", editor.state.doc, false);
  assert.equal(deleteOk.success, true);
  assert.equal(CitationService.getSources().length, 1);

  // Xóa nguồn 1 với force = true (người dùng xác nhận) -> Thành công
  const deleteForce = CitationService.deleteSource("ref_src_test_manage_1", editor.state.doc, true);
  assert.equal(deleteForce.success, true);
  assert.equal(CitationService.getSources().length, 0);

  editor.destroy();
});

test("PHASE 6.6 — 3. In-text Citation Formatting: APA 7th (Tác giả, Năm) và IEEE ([1], [2])", () => {
  const sourceSingle: BibliographySource = {
    id: "ref_src_author_single",
    type: "book",
    title: "Sách một tác giả",
    authors: "Nguyễn Văn An",
    year: 2021,
  };

  const sourceTwo: BibliographySource = {
    id: "ref_src_author_two",
    type: "book",
    title: "Sách hai tác giả",
    authors: "Trần Quốc Tuấn, Lê Lợi",
    year: 2022,
  };

  const sourceMany: BibliographySource = {
    id: "ref_src_author_many",
    type: "journalArticle",
    title: "Bài báo nhiều tác giả",
    authors: "Smith, John, Doe, Jane, Johnson, Bob",
    year: 2023,
  };

  // APA: Đơn tác giả
  const apaSingle = CitationService.formatInTextCitation(sourceSingle, "apa");
  assert.equal(apaSingle, "(Nguyễn Văn An, 2021)");

  // APA: Hai tác giả
  const apaTwo = CitationService.formatInTextCitation(sourceTwo, "apa");
  assert.equal(apaTwo, "(Trần Quốc Tuấn & Lê Lợi, 2022)");

  // APA: Ba tác giả trở lên -> et al.
  const apaMany = CitationService.formatInTextCitation(sourceMany, "apa");
  assert.ok(apaMany.includes("et al."));
  assert.ok(apaMany.includes("2023"));

  // APA: Kèm tiền tố và hậu tố
  const apaWithOptions = CitationService.formatInTextCitation(sourceSingle, "apa", {
    prefix: "xem",
    suffix: "tr. 45",
  });
  assert.equal(apaWithOptions, "(xem Nguyễn Văn An, 2021, tr. 45)");

  // IEEE: Đánh số
  const ieee1 = CitationService.formatInTextCitation(sourceSingle, "ieee", { index: 1 });
  assert.equal(ieee1, "[1]");

  const ieee2WithOptions = CitationService.formatInTextCitation(sourceTwo, "ieee", {
    index: 2,
    suffix: "tr. 88",
  });
  assert.equal(ieee2WithOptions, "[2, tr. 88]");

  // Khi nguồn không tồn tại (broken source)
  const brokenCitation = CitationService.formatInTextCitation(undefined, "apa");
  assert.equal(brokenCitation, "[Citation not found]");
});

test("PHASE 6.6 — 4. IEEE Auto-Numbering in Document Order: Thứ tự trích dẫn xác định [1], [2], [3]", () => {
  const store = useDocumentStore.getState();
  store.resetDocument();

  const srcA: BibliographySource = { id: "src_A", type: "book", title: "A", authors: "Tác giả A", year: 2020 };
  const srcB: BibliographySource = { id: "src_B", type: "book", title: "B", authors: "Tác giả B", year: 2021 };
  const srcC: BibliographySource = { id: "src_C", type: "book", title: "C", authors: "Tác giả C", year: 2022 };
  store.setBibliographySources([srcA, srcB, srcC]);

  const docAst = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Trích dẫn đầu tiên " },
          { type: "citation", attrs: { sourceId: "src_B", style: "ieee" } }, // xuất hiện trước -> phải là [1]
          { type: "text", text: " và tiếp theo " },
          { type: "citation", attrs: { sourceId: "src_A", style: "ieee" } }, // xuất hiện thứ 2 -> phải là [2]
          { type: "text", text: " lặp lại " },
          { type: "citation", attrs: { sourceId: "src_B", style: "ieee" } }, // lặp lại -> vẫn là [1]
          { type: "text", text: " và mới " },
          { type: "citation", attrs: { sourceId: "src_C", style: "ieee" } }, // xuất hiện thứ 3 -> [3]
        ],
      },
    ],
  };

  assert.equal(CitationService.getSourceIndex(docAst, "src_B"), 1);
  assert.equal(CitationService.getSourceIndex(docAst, "src_A"), 2);
  assert.equal(CitationService.getSourceIndex(docAst, "src_C"), 3);
});

test("PHASE 6.6 — 5. Bibliography Generation: APA sắp xếp bảng chữ cái, IEEE sắp xếp theo số thứ tự", () => {
  const store = useDocumentStore.getState();
  store.resetDocument();

  const srcZ: BibliographySource = { id: "src_Z", type: "book", title: "Zebra Book", authors: "Vũ Văn Z", year: 2020 };
  const srcA: BibliographySource = { id: "src_A", type: "book", title: "Alpha Book", authors: "An Ngọc A", year: 2021 };
  const srcM: BibliographySource = { id: "src_M", type: "book", title: "Mid Book", authors: "Mai Văn M", year: 2022 };
  store.setBibliographySources([srcZ, srcA, srcM]);

  // Tài liệu trích dẫn Z trước, sau đó M, không trích dẫn A
  const docAst = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          { type: "citation", attrs: { sourceId: "src_Z" } },
          { type: "text", text: " và " },
          { type: "citation", attrs: { sourceId: "src_M" } },
        ],
      },
    ],
  };

  // APA với filter = "citedOnly": chỉ lấy Z và M, sắp xếp theo tên tác giả: Mai Văn M -> Vũ Văn Z
  const apaEntries = CitationService.generateBibliographyEntries(
    docAst,
    [srcZ, srcA, srcM],
    "apa",
    "citedOnly"
  );
  assert.equal(apaEntries.length, 2);
  assert.equal(apaEntries[0].id, "src_M");
  assert.equal(apaEntries[1].id, "src_Z");
  assert.ok(apaEntries[0].text.includes("Mai Văn M"));
  assert.ok(apaEntries[1].text.includes("Vũ Văn Z"));

  // IEEE với filter = "citedOnly": sắp xếp theo thứ tự xuất hiện: src_Z [1] -> src_M [2]
  const ieeeEntries = CitationService.generateBibliographyEntries(
    docAst,
    [srcZ, srcA, srcM],
    "ieee",
    "citedOnly"
  );
  assert.equal(ieeeEntries.length, 2);
  assert.equal(ieeeEntries[0].id, "src_Z");
  assert.equal(ieeeEntries[0].number, 1);
  assert.ok(ieeeEntries[0].text.startsWith("[1]"));

  assert.equal(ieeeEntries[1].id, "src_M");
  assert.equal(ieeeEntries[1].number, 2);
  assert.ok(ieeeEntries[1].text.startsWith("[2]"));

  // APA với filter = "all": bao gồm cả A, sắp xếp An -> Mai -> Vũ
  const allApaEntries = CitationService.generateBibliographyEntries(
    docAst,
    [srcZ, srcA, srcM],
    "apa",
    "all"
  );
  assert.equal(allApaEntries.length, 3);
  assert.equal(allApaEntries[0].id, "src_A");
  assert.equal(allApaEntries[1].id, "src_M");
  assert.equal(allApaEntries[2].id, "src_Z");
});

test("PHASE 6.6 — 6. Duplicate Prevention: Trích dẫn một nguồn nhiều lần không sinh trùng trong Bibliography", () => {
  const store = useDocumentStore.getState();
  store.resetDocument();

  const src1: BibliographySource = {
    id: "src_rep",
    type: "book",
    title: "Sách Trùng Lặp",
    authors: "Lê Quý Đôn",
    year: 1776,
  };
  store.setBibliographySources([src1]);

  const docAst = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          { type: "citation", attrs: { sourceId: "src_rep" } },
          { type: "text", text: " lặp lại " },
          { type: "citation", attrs: { sourceId: "src_rep" } },
          { type: "text", text: " lần 3 " },
          { type: "citation", attrs: { sourceId: "src_rep" } },
        ],
      },
    ],
  };

  const entries = CitationService.generateBibliographyEntries(docAst, [src1], "apa", "citedOnly");
  assert.equal(entries.length, 1);
  assert.equal(entries[0].id, "src_rep");
});

test("PHASE 6.6 — 7. Insert & Update Bibliography qua Editor: Node AST và cập nhật khi sửa metadata", () => {
  const store = useDocumentStore.getState();
  store.resetDocument();

  const src: BibliographySource = {
    id: "src_dynamic",
    type: "book",
    title: "Tiêu đề Ban đầu",
    authors: "Tác giả Gốc",
    year: 2020,
    publisher: "NXB Cũ",
  };
  store.setBibliographySources([src]);

  const editor = createCitationTestEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Nội dung bài viết " },
          { type: "citation", attrs: { sourceId: "src_dynamic" } },
        ],
      },
    ],
  });

  // Chèn Bibliography
  const insertBibRes = CitationService.insertBibliography(editor, { title: "Tài liệu tham khảo" });
  assert.equal(insertBibRes.success, true);

  // Kiểm tra node bibliography có trong AST
  let bibFound = false;
  let bibEntriesCount = 0;
  editor.state.doc.descendants((node) => {
    if (node.type.name === "bibliography") {
      bibFound = true;
      bibEntriesCount = (node.attrs.entries || []).length;
      assert.ok(node.attrs.entries[0].text.includes("Tiêu đề Ban đầu"));
    }
  });
  assert.equal(bibFound, true);
  assert.equal(bibEntriesCount, 1);

  // Cập nhật metadata nguồn trong store
  store.updateBibliographySource("src_dynamic", {
    title: "Tiêu đề Mới Đã Cập Nhật",
    year: 2024,
  });

  // Chạy Update Bibliography
  const updateRes = CitationService.updateBibliography(editor);
  assert.equal(updateRes.success, true);

  // Kiểm tra node bibliography đã phản ánh tiêu đề mới mà không cần sửa manual text run
  editor.state.doc.descendants((node) => {
    if (node.type.name === "bibliography") {
      assert.ok(node.attrs.entries[0].text.includes("Tiêu đề Mới Đã Cập Nhật"));
      assert.ok(node.attrs.entries[0].text.includes("2024"));
    }
  });

  editor.destroy();
});

test("PHASE 6.6 — 8. Broken Source & Empty Bibliography Edge Cases: Không crash và an toàn 100%", () => {
  const store = useDocumentStore.getState();
  store.resetDocument();

  // Tài liệu trích dẫn nguồn không tồn tại
  const docAst = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          { type: "citation", attrs: { sourceId: "non_existent_source_id" } },
        ],
      },
    ],
  };

  const citations = CitationService.extractCitations(docAst);
  assert.equal(citations.length, 1);
  assert.equal(citations[0].sourceId, "non_existent_source_id");

  // Format in-text an toàn
  const missingSource = CitationService.getSource("non_existent_source_id");
  const inTextText = CitationService.formatInTextCitation(missingSource, "apa");
  assert.equal(inTextText, "[Citation not found]");

  // Bibliography rỗng an toàn
  const emptyEntries = CitationService.generateBibliographyEntries(docAst, [], "apa", "citedOnly");
  assert.equal(emptyEntries.length, 0);
});

test("PHASE 6.6 — 9. Vietnamese Unicode: Tên tác giả tiếng Việt có dấu, sắp xếp & hiển thị chuẩn xác", () => {
  const store = useDocumentStore.getState();
  store.resetDocument();

  const srcVN1: BibliographySource = {
    id: "src_vn_1",
    type: "book",
    title: "Đại Việt Sử Ký Toàn Thư",
    authors: "Ngô Sĩ Liên",
    year: 1479,
  };

  const srcVN2: BibliographySource = {
    id: "src_vn_2",
    type: "book",
    title: "Truyện Kiều",
    authors: "Nguyễn Du",
    year: 1820,
  };

  const inText1 = CitationService.formatInTextCitation(srcVN1, "apa");
  assert.equal(inText1, "(Ngô Sĩ Liên, 1479)");

  const inText2 = CitationService.formatInTextCitation(srcVN2, "apa");
  assert.equal(inText2, "(Nguyễn Du, 1820)");

  // Sắp xếp tiếng Việt: Ngô Sĩ Liên -> Nguyễn Du
  const docAst = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          { type: "citation", attrs: { sourceId: "src_vn_1" } },
          { type: "citation", attrs: { sourceId: "src_vn_2" } },
        ],
      },
    ],
  };

  const sorted = CitationService.generateBibliographyEntries(docAst, [srcVN2, srcVN1], "apa", "citedOnly");
  assert.equal(sorted[0].id, "src_vn_1"); // Ngô đứng trước Nguyễn
  assert.equal(sorted[1].id, "src_vn_2");
});

test("PHASE 6.6 — 10. Undo / Redo: Chèn Citation và hoàn tác/làm lại bảo toàn ProseMirror AST", () => {
  const store = useDocumentStore.getState();
  store.resetDocument();

  const testSrc: BibliographySource = {
    id: "src_undo_test",
    type: "book",
    title: "Kiến trúc Phần mềm",
    authors: "Martin Fowler",
    year: 2018,
  };
  store.setBibliographySources([testSrc]);

  const editor = createCitationTestEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Đoạn văn khởi đầu. " }],
      },
    ],
  });

  // Chèn citation
  editor.commands.setTextSelection(19);
  CitationService.insertCitation(editor, { sourceId: "src_undo_test", style: "apa" });

  let hasCitation = false;
  editor.state.doc.descendants((node) => {
    if (node.type.name === "citation") hasCitation = true;
  });
  assert.equal(hasCitation, true);

  // Undo -> Citation bị loại bỏ
  editor.commands.undo();
  hasCitation = false;
  editor.state.doc.descendants((node) => {
    if (node.type.name === "citation") hasCitation = true;
  });
  assert.equal(hasCitation, false);

  // Redo -> Citation được khôi phục nguyên vẹn
  editor.commands.redo();
  hasCitation = false;
  let restoredSourceId = "";
  editor.state.doc.descendants((node) => {
    if (node.type.name === "citation") {
      hasCitation = true;
      restoredSourceId = node.attrs.sourceId;
    }
  });
  assert.equal(hasCitation, true);
  assert.equal(restoredSourceId, "src_undo_test");

  editor.destroy();
});

test("PHASE 6.6 — 11. Persistence (.mwd): Lưu và Nạp đầy đủ bibliographySources, style và AST nodes", () => {
  const sources: BibliographySource[] = [
    {
      id: "ref_src_pers_1",
      type: "book",
      title: "Clean Architecture",
      authors: "Robert C. Martin",
      year: 2017,
      publisher: "Prentice Hall",
    },
    {
      id: "ref_src_pers_2",
      type: "journalArticle",
      title: "Design Patterns",
      authors: "Erich Gamma, Richard Helm",
      year: 1994,
    },
  ];

  const docContent = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Kiến trúc sạch theo " },
          {
            type: "citation",
            attrs: { sourceId: "ref_src_pers_1", style: "apa" },
          },
        ],
      },
      {
        type: "bibliography",
        attrs: {
          title: "Tài liệu tham khảo",
          style: "apa",
          filter: "citedOnly",
          entries: [
            { id: "ref_src_pers_1", text: "Robert C. Martin (2017). Clean Architecture. Prentice Hall." },
          ],
        },
      },
    ],
  };

  const originalDocModel: DocumentModel = {
    metadata: {
      id: "doc_citations_pers_test",
      title: "Báo cáo Đồ án Tốt nghiệp",
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    content: docContent,
    pageSettings: {
      paperSize: "A4",
      orientation: "portrait",
      margins: { top: 20, right: 20, bottom: 20, left: 20 },
      marginPreset: "normal",
    },
    references: {
      bibliographySources: sources,
      citationStyle: "apa",
    },
  };

  // Tuần tự hóa ra chuỗi .mwd JSON
  const mwdString = serializeDocumentToMwd(originalDocModel);
  assert.ok(mwdString.length > 0);
  assert.ok(mwdString.includes("ref_src_pers_1"));
  assert.ok(mwdString.includes("Clean Architecture"));

  // Giải tuần tự hóa trở lại DocumentModel
  const desRes = deserializeMwdToDocument(mwdString);
  assert.equal(desRes.success, true);
  if (!desRes.success) return;

  const loadedModel = desRes.document;
  assert.ok(loadedModel.references?.bibliographySources);
  assert.equal(loadedModel.references?.bibliographySources?.length, 2);
  assert.equal(loadedModel.references?.bibliographySources?.[0].title, "Clean Architecture");
  assert.equal(loadedModel.references?.citationStyle, "apa");

  // Kiểm tra AST content
  const citNode = loadedModel.content.content?.[0].content?.[1];
  assert.equal(citNode?.type, "citation");
  assert.equal(citNode?.attrs?.sourceId, "ref_src_pers_1");

  const bibNode = loadedModel.content.content?.[1];
  assert.equal(bibNode?.type, "bibliography");
  assert.equal(bibNode?.attrs?.title, "Tài liệu tham khảo");
});

test("PHASE 6.6 — 12. DOCX Serialization Fallback: Xuất Citation và Bibliography an toàn sang WordprocessingML", async () => {
  const docContent = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Nghiên cứu về hệ thống " },
          {
            type: "citation",
            attrs: {
              sourceId: "src_docx_test",
              style: "apa",
              customText: "(Nguyễn Văn A, 2024)",
            },
          },
        ],
      },
      {
        type: "bibliography",
        attrs: {
          title: "Tài liệu tham khảo",
          style: "apa",
          entries: [
            { id: "src_docx_test", text: "Nguyễn Văn A (2024). Nghiên cứu về hệ thống." },
          ],
        },
      },
    ],
  };

  const docModel: DocumentModel = {
    metadata: {
      id: "doc_docx_citation_test",
      title: "DOCX Export Citation Test",
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    content: docContent,
    pageSettings: {
      paperSize: "A4",
      orientation: "portrait",
      margins: { top: 20, right: 20, bottom: 20, left: 20 },
      marginPreset: "normal",
    },
  };

  const docxPackage = new DocumentSerializer().serialize(docModel);
  assert.ok(docxPackage.documentXml.length > 0);

  // Kiểm tra văn bản citation trong DOCX run
  assert.ok(docxPackage.documentXml.includes("(Nguyễn Văn A, 2024)"));
  assert.ok(docxPackage.documentXml.includes("1D4ED8")); // Màu xanh citation

  // Kiểm tra khối bibliography trong DOCX
  assert.ok(docxPackage.documentXml.includes("Tài liệu tham khảo"));
  assert.ok(docxPackage.documentXml.includes("Bibliography"));
  assert.ok(docxPackage.documentXml.includes("Nguyễn Văn A (2024). Nghiên cứu về hệ thống."));
});

test("PHASE 6.6 — 13. System Interactions: Đồng tồn tại an toàn cùng Headings, TOC, Comments, Track Changes, Notes và Captions", () => {
  const store = useDocumentStore.getState();
  store.resetDocument();

  const src: BibliographySource = {
    id: "src_full_system",
    type: "book",
    title: "Hệ thống Toàn diện",
    authors: "Hoàng Văn H",
    year: 2024,
  };
  store.setBibliographySources([src]);

  // Cấu trúc document phức tạp chứa tất cả các thành phần
  const complexDoc = {
    type: "doc",
    content: [
      {
        type: "heading",
        attrs: { id: "h1_intro", level: 1 },
        content: [{ type: "text", text: "1. Giới thiệu" }],
      },
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            marks: [{ type: "comment", attrs: { commentId: "com_1" } }],
            text: "Đoạn văn có bình luận ",
          },
          {
            type: "citation",
            attrs: { sourceId: "src_full_system" },
          },
          {
            type: "noteReference",
            attrs: { noteId: "ref_fn_1", noteType: "footnote", content: "Nội dung footnote" },
          },
        ],
      },
      {
        type: "caption",
        attrs: { id: "cap_1", label: "Figure", text: "Sơ đồ kiến trúc" },
      },
      {
        type: "bibliography",
        attrs: {
          title: "Tài liệu tham khảo",
          style: "apa",
          entries: [{ id: "src_full_system", text: "Hoàng Văn H (2024). Hệ thống Toàn diện." }],
        },
      },
    ],
  };

  const editor = createCitationTestEditor(complexDoc);
  assert.ok(editor);

  // Không có xung đột schema
  assert.equal(editor.state.doc.childCount, 4);

  // TOC scan headings không bị nhầm Citation hay Bibliography thành Heading
  let headingCount = 0;
  editor.state.doc.descendants((node) => {
    if (node.type.name === "heading") headingCount++;
  });
  assert.equal(headingCount, 1);

  editor.destroy();
});
