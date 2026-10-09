import test from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import type { DocumentModel } from "../document/documentTypes.ts";
import { exportDocumentModelToDocx } from "../docx/export/docxExporter.ts";
import { importDocxToDocumentModel } from "../docx/import/docxImporter.ts";
import { BookmarkService } from "./services/bookmarkService.ts";
import { ReferencePersistenceService } from "./services/referencePersistenceService.ts";
import { parseXmlString } from "../docx/utils/xmlUtils.ts";

function createTestDocument(contentBlocks: any[], bookmarksMetadata?: any[]): DocumentModel {
  return {
    metadata: {
      id: "doc-test-docx-bookmarks",
      title: "Kiểm thử DOCX Bookmark Interoperability",
      version: 1,
      createdAt: "2026-10-08T00:00:00.000Z",
      updatedAt: "2026-10-08T00:00:00.000Z",
    },
    pageSettings: {
      paperSize: "A4",
      orientation: "portrait",
      margins: { top: 25.4, bottom: 25.4, left: 25.4, right: 25.4 },
      marginPreset: "Normal",
    },
    headerFooter: {
      linkToPrevious: false,
    },
    content: {
      type: "doc",
      content: contentBlocks,
    },
    references: {
      bookmarks: bookmarksMetadata || [],
    },
  };
}

test("Phase 10 - 1. Position Bookmark Export: maps to zero-range bookmarkStart and bookmarkEnd without altering text", async () => {
  const doc = createTestDocument([
    {
      type: "paragraph",
      content: [
        { type: "text", text: "Trước con trỏ. " },
        {
          type: "bookmarkAnchor",
          attrs: {
            id: "ref_bookmark_pos_001",
            name: "Vị trí bắt đầu",
            createdAt: "2026-10-08T00:00:00.000Z",
          },
        },
        { type: "text", text: "Sau con trỏ." },
      ],
    },
  ]);

  const docxBytes = await exportDocumentModelToDocx(doc);
  assert.ok(docxBytes instanceof Uint8Array);

  const zip = await JSZip.loadAsync(docxBytes);
  const docXml = await zip.file("word/document.xml")!.async("string");

  // Kiểm tra bookmarkStart và bookmarkEnd liền kề nhau (zero-range)
  assert.ok(docXml.includes("<w:bookmarkStart"), "Phải xuất thẻ w:bookmarkStart");
  assert.ok(docXml.includes("<w:bookmarkEnd"), "Phải xuất thẻ w:bookmarkEnd");

  // Regex kiểm tra bookmarkStart và bookmarkEnd cùng id đi liền nhau
  const match = docXml.match(/<w:bookmarkStart w:id="(\d+)" w:name="([^"]+)"\/><w:bookmarkEnd w:id="\1"\/>/);
  assert.ok(match, "Position bookmark phải xuất dạng zero-range (bookmarkStart + bookmarkEnd cùng id)");
  assert.equal(match![2], "Vi_tri_bat_dau", "Tên tiếng Việt có dấu phải được chuyển đổi thành tên Word hợp lệ");

  // Văn bản trước và sau không bị thay đổi
  assert.ok(docXml.includes("Trước con trỏ. "));
  assert.ok(docXml.includes("Sau con trỏ."));
});

test("Phase 10 - 2. Range Bookmark Export: wraps text runs properly with bookmarkStart and bookmarkEnd", async () => {
  const doc = createTestDocument([
    {
      type: "paragraph",
      content: [
        { type: "text", text: "Đoạn văn có " },
        {
          type: "text",
          text: "vùng văn bản được đánh dấu",
          marks: [
            {
              type: "bookmark",
              attrs: {
                id: "ref_bookmark_range_001",
                name: "Vùng đánh dấu 1",
                createdAt: "2026-10-08T00:00:00.000Z",
              },
            },
            { type: "bold" },
          ],
        },
        { type: "text", text: " và phần còn lại." },
      ],
    },
  ]);

  const docxBytes = await exportDocumentModelToDocx(doc);
  const zip = await JSZip.loadAsync(docxBytes);
  const docXml = await zip.file("word/document.xml")!.async("string");

  assert.ok(docXml.includes('<w:bookmarkStart w:id="0" w:name="Vung_danh_dau_1"/>'));
  assert.ok(docXml.includes('<w:bookmarkEnd w:id="0"/>'));

  // Vị trí: bookmarkStart phải nằm trước run được bọc và bookmarkEnd nằm sau run
  const startIndex = docXml.indexOf('<w:bookmarkStart w:id="0"');
  const runTextIndex = docXml.indexOf("vùng văn bản được đánh dấu");
  const endIndex = docXml.indexOf('<w:bookmarkEnd w:id="0"/>');

  assert.ok(startIndex < runTextIndex, "bookmarkStart phải đứng trước nội dung");
  assert.ok(runTextIndex < endIndex, "bookmarkEnd phải đứng sau nội dung");
});

test("Phase 10 - 3. Numeric ID Mapping: converts internal stable ID to integer ID deterministically", async () => {
  const doc = createTestDocument([
    {
      type: "paragraph",
      content: [
        {
          type: "bookmarkAnchor",
          attrs: { id: "ref_bookmark_alpha_uuid_111", name: "Alpha" },
        },
        { type: "text", text: "Nội dung giữa " },
        {
          type: "bookmarkAnchor",
          attrs: { id: "ref_bookmark_beta_uuid_222", name: "Beta" },
        },
        { type: "text", text: " và " },
        {
          type: "text",
          text: "Gamma Range",
          marks: [{ type: "bookmark", attrs: { id: "ref_bookmark_gamma_uuid_333", name: "Gamma" } }],
        },
      ],
    },
  ]);

  const docxBytes = await exportDocumentModelToDocx(doc);
  const zip = await JSZip.loadAsync(docxBytes);
  const docXml = await zip.file("word/document.xml")!.async("string");

  // Kiểm tra ID trong OOXML là số nguyên (0, 1, 2)
  assert.ok(docXml.includes('<w:bookmarkStart w:id="0" w:name="Alpha"/>'));
  assert.ok(docXml.includes('<w:bookmarkEnd w:id="0"/>'));
  assert.ok(docXml.includes('<w:bookmarkStart w:id="1" w:name="Beta"/>'));
  assert.ok(docXml.includes('<w:bookmarkEnd w:id="1"/>'));
  assert.ok(docXml.includes('<w:bookmarkStart w:id="2" w:name="Gamma"/>'));
  assert.ok(docXml.includes('<w:bookmarkEnd w:id="2"/>'));

  // Đảm bảo không để lộ chuỗi raw internal uuid trong attribute w:id
  assert.ok(!docXml.includes('w:id="ref_bookmark_alpha_uuid_111"'));
});

test("Phase 10 - 4. Unicode & Vietnamese Name Sanitization: safely converts without crash", async () => {
  const doc = createTestDocument([
    {
      type: "paragraph",
      content: [
        {
          type: "bookmarkAnchor",
          attrs: {
            id: "ref_bookmark_uni_001",
            name: "123 Báo cáo khoa học & Kỹ thuật!",
          },
        },
        { type: "text", text: "Mẫu kiểm tra Unicode đặc biệt." },
      ],
    },
  ]);

  const docxBytes = await exportDocumentModelToDocx(doc);
  const zip = await JSZip.loadAsync(docxBytes);
  const docXml = await zip.file("word/document.xml")!.async("string");

  // Word bookmark name không được bắt đầu bằng chữ số (phải có tiền tố như bm_) và không có ký tự đặc biệt
  const match = docXml.match(/<w:bookmarkStart w:id="0" w:name="([^"]+)"\/>/);
  assert.ok(match, "Phải xuất thẻ bookmarkStart");
  const exportedName = match![1];

  // Phải bắt đầu bằng chữ cái hoặc gạch dưới
  assert.match(exportedName, /^[a-zA-Z_][a-zA-Z0-9_]*$/);
  assert.ok(exportedName.includes("Bao_cao_khoa_hoc"), "Phải giữ được ngữ nghĩa sau khi bỏ dấu");
});

test("Phase 10 - 5. Word Bookmark Name Collision: disambiguates deterministic suffixes", async () => {
  const doc = createTestDocument([
    {
      type: "paragraph",
      content: [
        {
          type: "bookmarkAnchor",
          attrs: { id: "ref_bm_1", name: "Chương 1" },
        },
        { type: "text", text: " - " },
        {
          type: "bookmarkAnchor",
          attrs: { id: "ref_bm_2", name: "Chuong 1" }, // Sẽ sanitize ra cùng "Chuong_1"
        },
        { type: "text", text: " - " },
        {
          type: "bookmarkAnchor",
          attrs: { id: "ref_bm_3", name: "Chương 1" }, // Tên y hệt
        },
      ],
    },
  ]);

  const docxBytes = await exportDocumentModelToDocx(doc);
  const zip = await JSZip.loadAsync(docxBytes);
  const docXml = await zip.file("word/document.xml")!.async("string");

  // Phải có 3 bookmarks với tên phân biệt không trùng nhau
  assert.ok(docXml.includes('w:name="Chuong_1"'));
  assert.ok(docXml.includes('w:name="Chuong_1_1"'));
  assert.ok(docXml.includes('w:name="Chuong_1_2"'));
});

test("Phase 10 - 6. Technical Word Bookmarks Policy: filters internal bookmarks, preserves user bookmarks", async () => {
  // Giả lập Word document XML chứa cả technical bookmarks và user bookmarks
  const mockDocXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:bookmarkStart w:id="0" w:name="_GoBack"/><w:bookmarkEnd w:id="0"/>
      <w:bookmarkStart w:id="1" w:name="_Toc12345678"/><w:bookmarkEnd w:id="1"/>
      <w:bookmarkStart w:id="2" w:name="_Hlk99999999"/><w:bookmarkEnd w:id="2"/>
      <w:bookmarkStart w:id="3" w:name="_Ref44444444"/><w:bookmarkEnd w:id="3"/>
      <w:bookmarkStart w:id="4" w:name="UserSectionIntro"/><w:bookmarkEnd w:id="4"/>
      <w:r><w:t>Văn bản có bookmarks kỹ thuật và người dùng.</w:t></w:r>
      <w:bookmarkStart w:id="5" w:name="ChapterSummary"/>
      <w:r><w:t>Tóm tắt chương quan trọng.</w:t></w:r>
      <w:bookmarkEnd w:id="5"/>
    </w:p>
  </w:body>
</w:document>`;

  // Đóng gói zip giả lập docx
  const zip = new JSZip();
  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>`);
  zip.file("word/document.xml", mockDocXml);
  const bytes = await zip.generateAsync({ type: "uint8array" });

  const result = await importDocxToDocumentModel(bytes, "technical_test.docx");
  assert.ok(result.success, "Import phải thành công");
  const doc = result.document!;

  // Phải có metadata references
  assert.ok(doc.references?.bookmarks, "DocumentModel phải có danh sách bookmarks");
  const importedBookmarks = doc.references.bookmarks;

  // 1. Phải GIỮ user bookmarks
  const hasUserIntro = importedBookmarks.some((b) => b.name === "UserSectionIntro");
  const hasChapterSummary = importedBookmarks.some((b) => b.name === "ChapterSummary");
  assert.ok(hasUserIntro, "Phải bảo toàn UserSectionIntro");
  assert.ok(hasChapterSummary, "Phải bảo toàn ChapterSummary");

  // 2. Phải LỌC BỎ technical bookmarks (_GoBack, _Toc*, _Hlk*, _Ref*)
  const hasGoBack = importedBookmarks.some((b) => b.name.startsWith("_GoBack"));
  const hasToc = importedBookmarks.some((b) => b.name.startsWith("_Toc"));
  const hasHlk = importedBookmarks.some((b) => b.name.startsWith("_Hlk"));
  const hasRef = importedBookmarks.some((b) => b.name.startsWith("_Ref"));

  assert.ok(!hasGoBack, "_GoBack phải bị lọc bỏ");
  assert.ok(!hasToc, "_Toc phải bị lọc bỏ");
  assert.ok(!hasHlk, "_Hlk phải bị lọc bỏ");
  assert.ok(!hasRef, "_Ref phải bị lọc bỏ");
});

test("Phase 10 - 7. Malformed OOXML: handles unclosed start, orphan end, and duplicate numeric IDs safely", async () => {
  const malformedDocXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <!-- Orphan bookmarkEnd không có start -->
      <w:bookmarkEnd w:id="999"/>
      <w:r><w:t>Văn bản trước bookmark lỗi. </w:t></w:r>
      <!-- Duplicate numeric ID 1 -->
      <w:bookmarkStart w:id="1" w:name="FirstBM"/>
      <w:r><w:t>Văn bản phần 1. </w:t></w:r>
      <w:bookmarkStart w:id="1" w:name="SecondDuplicateID"/>
      <w:r><w:t>Văn bản phần 2. </w:t></w:r>
      <w:bookmarkEnd w:id="1"/>
      <!-- BookmarkStart không bao giờ đóng (start without end) -->
      <w:bookmarkStart w:id="2" w:name="UnclosedBM"/>
      <w:r><w:t>Văn bản kết thúc đoạn.</w:t></w:r>
    </w:p>
  </w:body>
</w:document>`;

  const zip = new JSZip();
  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>`);
  zip.file("word/document.xml", malformedDocXml);
  const bytes = await zip.generateAsync({ type: "uint8array" });

  const result = await importDocxToDocumentModel(bytes, "malformed_test.docx");
  assert.ok(result.success, "Import không được crash khi gặp OOXML hỏng");
  const doc = result.document!;

  // Toàn bộ văn bản phải được giữ nguyên vẹn
  const p = doc.content.content?.[0];
  assert.ok(p);
  const allText = JSON.stringify(p);
  assert.ok(allText.includes("Văn bản trước bookmark lỗi. "));
  assert.ok(allText.includes("Văn bản phần 1. "));
  assert.ok(allText.includes("Văn bản phần 2. "));
  assert.ok(allText.includes("Văn bản kết thúc đoạn."));

  // Bookmarks được cứu vớt an toàn
  assert.ok(doc.references?.bookmarks && doc.references.bookmarks.length >= 2);
});

test("Phase 10 - 8. Round-Trip: Editor -> DOCX -> Import -> Bookmark Service extracts bookmarks", async () => {
  const initialDoc = createTestDocument([
    {
      type: "paragraph",
      content: [
        { type: "text", text: "Bắt đầu tài liệu. " },
        {
          type: "bookmarkAnchor",
          attrs: {
            id: "ref_bookmark_pos_roundtrip",
            name: "Mốc quan trọng",
            createdAt: "2026-10-08T00:00:00.000Z",
          },
        },
        { type: "text", text: "Giữa đoạn văn. " },
        {
          type: "text",
          text: "Phần văn bản được đánh dấu vùng",
          marks: [
            {
              type: "bookmark",
              attrs: {
                id: "ref_bookmark_range_roundtrip",
                name: "Khu vực tham chiếu",
                createdAt: "2026-10-08T00:00:00.000Z",
              },
            },
          ],
        },
        { type: "text", text: " Kết thúc." },
      ],
    },
  ]);

  // 1. Export sang DOCX
  const docxBytes = await exportDocumentModelToDocx(initialDoc);

  // 2. Import lại từ DOCX
  const importResult = await importDocxToDocumentModel(docxBytes, "roundtrip.docx");
  assert.ok(importResult.success, "Import DOCX phải thành công");
  const reimportedDoc = importResult.document!;

  // 3. Kiểm tra trích xuất qua BookmarkService
  const extracted = BookmarkService.extractBookmarks(reimportedDoc.content);
  assert.equal(extracted.length, 2, "Phải trích xuất được đúng 2 bookmarks từ tài liệu import");

  const posBm = extracted.find((b) => b.type === "position");
  const rangeBm = extracted.find((b) => b.type === "range");

  assert.ok(posBm, "Phải tìm thấy position bookmark");
  assert.ok(rangeBm, "Phải tìm thấy range bookmark");

  // Kiểm tra tên bookmark sau roundtrip
  assert.ok(posBm?.bookmark.name.includes("Moc_quan_trong") || posBm?.bookmark.name.includes("Mốc"), "Tên position bookmark được giữ");
  assert.ok(rangeBm?.bookmark.name.includes("Khu_vuc_tham_chieu") || rangeBm?.bookmark.name.includes("Khu"), "Tên range bookmark được giữ");

  // Kiểm tra nội dung vùng được bọc
  assert.equal(rangeBm?.text, "Phần văn bản được đánh dấu vùng");

  // Metadata documentModel.references.bookmarks cũng phải được populate
  assert.equal(reimportedDoc.references?.bookmarks.length, 2);
});

test("Phase 10 - 9. Cross-reference Compatibility: flattened text export remains intact with bookmarks present", async () => {
  const doc = createTestDocument([
    {
      type: "paragraph",
      content: [
        {
          type: "bookmarkAnchor",
          attrs: { id: "ref_bookmark_target", name: "TargetAnchor" },
        },
        { type: "text", text: "Xem mục " },
        {
          type: "crossReference",
          attrs: {
            targetId: "ref_bookmark_target",
            targetType: "bookmark",
            format: "text",
            customText: "Thẻ TargetAnchor (trang 1)",
          },
        },
        { type: "text", text: " để biết thêm chi tiết." },
      ],
    },
  ]);

  const docxBytes = await exportDocumentModelToDocx(doc);
  const zip = await JSZip.loadAsync(docxBytes);
  const docXml = await zip.file("word/document.xml")!.async("string");

  // Cả bookmark và cross-reference đều tồn tại mà không xung đột
  assert.ok(docXml.includes('w:name="TargetAnchor"'), "Bookmark target phải xuất hiện");
  assert.ok(docXml.includes("Thẻ TargetAnchor (trang 1)"), "Cross-reference flattened text phải xuất hiện");
  assert.ok(docXml.includes('w:color w:val="2563EB"'), "Cross-reference styling phải được bảo toàn");
});

test("Phase 10 - 10. Word-like Complex Fixture: table cells, list items, and headings with bookmarks", async () => {
  const doc = createTestDocument([
    {
      type: "heading",
      attrs: { level: 1 },
      content: [
        {
          type: "bookmarkAnchor",
          attrs: { id: "ref_bm_head", name: "Heading 1 Bookmark" },
        },
        { type: "text", text: "Tiêu đề chính có Bookmark" },
      ],
    },
    {
      type: "table",
      attrs: { borders: "all" },
      content: [
        {
          type: "tableRow",
          content: [
            {
              type: "tableCell",
              content: [
                {
                  type: "paragraph",
                  content: [
                    {
                      type: "bookmarkAnchor",
                      attrs: { id: "ref_bm_tbl", name: "Table Cell Bookmark" },
                    },
                    { type: "text", text: "Nội dung trong ô bảng" },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  ]);

  // Round-trip
  const docxBytes = await exportDocumentModelToDocx(doc);
  const importResult = await importDocxToDocumentModel(docxBytes, "complex_fixture.docx");
  assert.ok(importResult.success);

  const reimported = importResult.document!;
  const extracted = BookmarkService.extractBookmarks(reimported.content);
  assert.equal(extracted.length, 2, "Phải trích xuất được cả 2 bookmarks trong heading và table cell");
});
