import test from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import type { DocumentModel } from "../document/documentTypes.ts";
import { exportDocumentModelToDocx } from "./export/docxExporter.ts";
import { importDocxToDocumentModel } from "./import/docxImporter.ts";
import { buildHeaderFooterXml } from "./mapping/headerFooterSerializer.ts";
import { parseHeaderFooterXml } from "./mapping/headerFooterMapper.ts";
import { serializeFieldXml } from "./mapping/fieldSerializer.ts";
import { parseFieldInstruction } from "../fields/services/fieldEngine.ts";
import { BookmarkService } from "../references/services/bookmarkService.ts";
import { RelationshipAllocator } from "./relationships/relationshipAllocator.ts";
import { validateDocxPackageData } from "./packaging/packageValidator.ts";
import { DocumentSerializer } from "./mapping/documentSerializer.ts";

const SAMPLE_TINY_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function createBaseDocument(options?: {
  headerText?: string;
  headerImage?: any;
  footerText?: string;
  footerImage?: any;
  contentBlocks?: any[];
  bookmarks?: any[];
}): DocumentModel {
  return {
    metadata: {
      id: "doc-phase12-test",
      title: "Kiểm thử Phase 12 Header/Footer & References",
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
      header: {
        text: options?.headerText !== undefined ? options.headerText : "Đầu trang mẫu",
        alignment: "center",
        image: options?.headerImage,
      },
      footer: {
        text: options?.footerText !== undefined ? options.footerText : "Chân trang mẫu",
        alignment: "center",
        image: options?.footerImage,
      },
    },
    content: {
      type: "doc",
      content: options?.contentBlocks || [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Nội dung thân tài liệu thử nghiệm." }],
        },
      ],
    },
    references: {
      bookmarks: options?.bookmarks || [],
    },
  };
}

test("Phase 12 - 1. Header PAGE Field: uses shared Field Engine and emits w:fldSimple", () => {
  // Test direct buildHeaderFooterXml with {PAGE}
  const xml = buildHeaderFooterXml(
    {
      text: "Tài liệu kỹ thuật - Trang {PAGE}",
      alignment: "right",
      bold: true,
    },
    "header"
  );

  assert.ok(xml.includes("<w:hdr"), "Phải có thẻ root w:hdr");
  assert.ok(xml.includes('<w:jc w:val="right"/>'), "Phải căn lề phải");
  assert.ok(xml.includes("<w:b/>"), "Phải giữ định dạng in đậm");
  assert.ok(
    xml.includes('<w:fldSimple w:instr="PAGE">'),
    "Phải tạo thẻ w:fldSimple với instruction PAGE"
  );

  // Test parseFieldInstruction and serializeFieldXml interoperability
  const fieldAttrs = parseFieldInstruction("PAGE", "1");
  const fieldXml = serializeFieldXml(fieldAttrs, "<w:rPr><w:b/></w:rPr>");
  assert.ok(fieldXml.includes('<w:fldSimple w:instr="PAGE">'));
  assert.ok(fieldXml.includes("<w:b/>"));
});

test("Phase 12 - 2. Footer NUMPAGES Field: shared Field Engine & round-trip preserves tokens", async () => {
  const doc = createBaseDocument({
    footerText: "Trang {PAGE} trên {NUMPAGES}",
  });

  const docxBytes = await exportDocumentModelToDocx(doc);
  assert.ok(docxBytes instanceof Uint8Array);

  const zip = await JSZip.loadAsync(docxBytes);
  const footerFile = zip.file("word/footer1.xml");
  assert.ok(footerFile, "word/footer1.xml phải tồn tại trong gói ZIP");

  const footerXml = await footerFile.async("string");
  assert.ok(footerXml.includes('<w:fldSimple w:instr="PAGE">'), "Footer phải có trường PAGE");
  assert.ok(
    footerXml.includes('<w:fldSimple w:instr="NUMPAGES">'),
    "Footer phải có trường NUMPAGES"
  );

  // Import lại từ DOCX
  const importRes = await importDocxToDocumentModel(docxBytes, "FooterTest.docx");
  assert.equal(importRes.success, true);
  const importedFooter = importRes.document!.headerFooter.footer;
  assert.ok(importedFooter.text.includes("{PAGE}"), "Phải bảo toàn token {PAGE} khi import");
  assert.ok(
    importedFooter.text.includes("{NUMPAGES}"),
    "Phải bảo toàn token {NUMPAGES} khi import"
  );
});

test("Phase 12 - 3. Header Image & Relationships: correctly scoped to header1.xml.rels", async () => {
  const doc = createBaseDocument({
    headerText: "Báo cáo công ty",
    headerImage: {
      src: SAMPLE_TINY_PNG,
      width: 100,
      height: 30,
      alt: "Logo công ty",
    },
  });

  const docxBytes = await exportDocumentModelToDocx(doc);
  const zip = await JSZip.loadAsync(docxBytes);

  // 1. Kiểm tra word/header1.xml chứa DrawingML và r:embed
  const headerXml = await zip.file("word/header1.xml")!.async("string");
  assert.ok(headerXml.includes("<w:drawing>"), "Header phải chứa thẻ w:drawing");
  assert.ok(headerXml.includes("<pic:pic>"), "Header phải chứa phần tử DrawingML Picture pic:pic");
  assert.ok(headerXml.includes("r:embed="), "Header drawing phải tham chiếu quan hệ r:embed");

  // Lấy relationship ID từ header XML
  const matchRel = headerXml.match(/r:embed="(rId\d+)"/);
  assert.ok(matchRel, "Phải tìm thấy thuộc tính r:embed trong header1.xml");
  const relId = matchRel![1];

  // 2. Kiểm tra word/_rels/header1.xml.rels
  const headerRelsFile = zip.file("word/_rels/header1.xml.rels");
  assert.ok(headerRelsFile, "Tệp word/_rels/header1.xml.rels phải được đóng gói vào ZIP");

  const headerRelsXml = await headerRelsFile.async("string");
  assert.ok(
    headerRelsXml.includes(`Id="${relId}"`),
    `word/_rels/header1.xml.rels phải chứa Relationship Id="${relId}"`
  );
  assert.ok(
    headerRelsXml.includes("relationships/image"),
    "Relationship Type phải là chuẩn image OOXML"
  );

  // Trích xuất target file từ header1.xml.rels
  const matchTarget = headerRelsXml.match(/Target="([^"]+)"/);
  assert.ok(matchTarget, "Phải tìm thấy Target của ảnh trong header1.xml.rels");
  const headerMediaTarget = matchTarget![1];

  // 3. Đảm bảo quan hệ của ảnh header KHÔNG bị lẫn lộn vào document.xml.rels
  const docRelsXml = await zip.file("word/_rels/document.xml.rels")!.async("string");
  assert.ok(
    !docRelsXml.includes(headerMediaTarget),
    "Target của ảnh header không được xuất hiện trong document.xml.rels (phải thuộc header1.xml.rels)"
  );

  // 4. Kiểm tra tệp media tồn tại
  const mediaEntries = Object.keys(zip.files).filter((k) => k.startsWith("word/media/"));
  assert.ok(mediaEntries.length > 0, "Ảnh header phải được lưu vào word/media/");

  // 5. Re-import: ảnh header phải được phục hồi
  const importRes = await importDocxToDocumentModel(docxBytes, "HeaderImage.docx");
  assert.equal(importRes.success, true);
  const importedHeader = importRes.document!.headerFooter.header;
  assert.ok(importedHeader.image, "Header import phải trích xuất được ảnh");
  assert.ok(
    importedHeader.image.src.startsWith("data:image/"),
    "Ảnh header phải là data URL hợp lệ"
  );
});

test("Phase 12 - 4. Simple Shapes & TextBoxes in Header: safe DrawingML mapping without crashing", () => {
  const xml = buildHeaderFooterXml(
    {
      text: "Đầu trang có hình vẽ",
      alignment: "left",
      shapes: [
        {
          shapeType: "rectangle",
          width: 80,
          height: 25,
        },
      ],
      textBoxes: [
        {
          width: 120,
          minHeight: 30,
          text: "Hộp ghi chú",
        },
      ],
    },
    "header"
  );

  assert.ok(xml.includes("<w:hdr"));
  assert.ok(xml.includes("wordprocessingShape"), "Phải chứa namespace shape DrawingML");
  assert.ok(xml.includes('prst="rect"'), "Phải có geometry rect");
  assert.ok(xml.includes("<wps:txbx>"), "Phải có nội dung hộp văn bản");
  assert.ok(xml.includes("Hộp ghi chú"), "Nội dung text của textbox phải được bảo toàn");
});

test("Phase 12 - 5. Bookmark Round-Trip: maps stable UUIDs to Word numeric IDs & preserves semantics", async () => {
  const doc = createBaseDocument({
    contentBlocks: [
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Đoạn văn bắt đầu với " },
          {
            type: "bookmarkAnchor",
            attrs: {
              id: "ref_bm_stable_pos_uuid_123",
              name: "Mục_Đầu_Tiên",
              createdAt: "2026-10-08T00:00:00.000Z",
            },
          },
          { type: "text", text: "vị trí đánh dấu và vùng văn bản " },
          {
            type: "text",
            text: "được tô màu đánh dấu",
            marks: [
              {
                type: "bookmark",
                attrs: {
                  id: "ref_bm_stable_range_uuid_456",
                  name: "Vùng_Quan_Trọng",
                  createdAt: "2026-10-08T00:00:00.000Z",
                },
              },
            ],
          },
          { type: "text", text: " kết thúc." },
        ],
      },
    ],
  });

  const docxBytes = await exportDocumentModelToDocx(doc);
  const zip = await JSZip.loadAsync(docxBytes);
  const docXml = await zip.file("word/document.xml")!.async("string");

  // Kiểm tra w:id là số nguyên tuần tự, không để lộ chuỗi raw uuid
  assert.ok(docXml.includes('w:bookmarkStart w:id="0"'));
  assert.ok(docXml.includes('w:bookmarkEnd w:id="0"'));
  assert.ok(docXml.includes('w:bookmarkStart w:id="1"'));
  assert.ok(docXml.includes('w:bookmarkEnd w:id="1"'));
  assert.ok(!docXml.includes("ref_bm_stable_pos_uuid_123"));

  // Kiểm tra Round-trip qua importDocxToDocumentModel và BookmarkService
  const importRes = await importDocxToDocumentModel(docxBytes, "BookmarkRoundTrip.docx");
  assert.equal(importRes.success, true);
  const extracted = BookmarkService.extractBookmarks(importRes.document!.content);

  assert.equal(extracted.length, 2, "Phải trích xuất được cả 2 bookmarks từ tài liệu import");
  const posBm = extracted.find((b) => b.type === "position");
  const rangeBm = extracted.find((b) => b.type === "range");
  assert.ok(posBm, "Position bookmark phải tồn tại");
  assert.ok(rangeBm, "Range bookmark phải tồn tại");
  assert.equal(rangeBm?.text, "được tô màu đánh dấu");
});

test("Phase 12 - 6. REF Field Cross-Reference: maps to REF field using Word bookmark name and round-trips", async () => {
  const doc = createBaseDocument({
    contentBlocks: [
      {
        type: "paragraph",
        content: [
          {
            type: "bookmarkAnchor",
            attrs: {
              id: "ref_bm_target_999",
              name: "Chuong_Gioi_Thieu",
            },
          },
          { type: "text", text: "Xem thêm chi tiết tại " },
          {
            type: "crossReference",
            attrs: {
              targetId: "ref_bm_target_999",
              targetType: "bookmark",
              format: "text",
              customText: "Chương Giới Thiệu",
            },
          },
          { type: "text", text: " để nắm rõ hơn." },
        ],
      },
    ],
  });

  const docxBytes = await exportDocumentModelToDocx(doc);
  const zip = await JSZip.loadAsync(docxBytes);
  const docXml = await zip.file("word/document.xml")!.async("string");

  // Kiểm tra field instruction sử dụng Word bookmark name
  assert.ok(
    docXml.includes('<w:fldSimple w:instr="REF Chuong_Gioi_Thieu \\h">'),
    "Phải tạo trường REF với tên bookmark hợp lệ"
  );
  assert.ok(docXml.includes("Chương Giới Thiệu"), "Phải giữ lại văn bản hiển thị đã lưu");

  // Re-import và kiểm tra khôi phục thành node crossReference
  const importRes = await importDocxToDocumentModel(docxBytes, "RefTest.docx");
  assert.equal(importRes.success, true);

  const p = importRes.document!.content.content![0];
  const crossRefNode = p.content?.find((c: any) => c.type === "crossReference");
  assert.ok(crossRefNode, "Phải ánh xạ trường REF thành node crossReference ngữ nghĩa");
  assert.equal(crossRefNode.attrs.format, "text");
  assert.equal(crossRefNode.attrs.targetType, "bookmark");
  assert.equal(crossRefNode.attrs.customText, "Chương Giới Thiệu");
});

test("Phase 12 - 7. PAGEREF Field Cross-Reference: maps format='page' to PAGEREF field", async () => {
  const doc = createBaseDocument({
    contentBlocks: [
      {
        type: "paragraph",
        content: [
          {
            type: "bookmarkAnchor",
            attrs: {
              id: "ref_bm_page_target",
              name: "Phu_Luc_A",
            },
          },
          { type: "text", text: "Tham khảo Phụ lục A tại trang " },
          {
            type: "crossReference",
            attrs: {
              targetId: "ref_bm_page_target",
              targetType: "bookmark",
              format: "page",
              customText: "12",
            },
          },
          { type: "text", text: "." },
        ],
      },
    ],
  });

  const docxBytes = await exportDocumentModelToDocx(doc);
  const zip = await JSZip.loadAsync(docxBytes);
  const docXml = await zip.file("word/document.xml")!.async("string");

  // Kiểm tra field instruction sử dụng PAGEREF
  assert.ok(
    docXml.includes('<w:fldSimple w:instr="PAGEREF Phu_Luc_A \\h">'),
    "Phải tạo trường PAGEREF với tên bookmark"
  );
  assert.ok(docXml.includes("<w:t>12</w:t>"), "Phải giữ lại số trang hiển thị");

  // Re-import
  const importRes = await importDocxToDocumentModel(docxBytes, "PageRefTest.docx");
  assert.equal(importRes.success, true);

  const p = importRes.document!.content.content![0];
  const crossRefNode = p.content?.find((c: any) => c.type === "crossReference");
  assert.ok(crossRefNode, "Phải chuyển đổi thành node crossReference");
  assert.equal(crossRefNode.attrs.format, "page");
  assert.equal(crossRefNode.attrs.customText, "12");
});

test("Phase 12 - 8. Broken Reference Resilience: does not crash on missing or broken targets", async () => {
  const doc = createBaseDocument({
    contentBlocks: [
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Tham chiếu hỏng: " },
          {
            type: "crossReference",
            attrs: {
              targetId: "", // targetId rỗng
              targetType: "bookmark",
              format: "text",
              customText: "[Reference not found]",
            },
          },
          { type: "text", text: " và " },
          {
            type: "crossReference",
            attrs: {
              targetId: "target_khong_ton_tai_12345",
              targetType: "heading",
              format: "text",
              customText: null,
            },
          },
        ],
      },
    ],
  });

  // Xuất không được crash
  const docxBytes = await exportDocumentModelToDocx(doc);
  assert.ok(docxBytes instanceof Uint8Array);

  const zip = await JSZip.loadAsync(docxBytes);
  const docXml = await zip.file("word/document.xml")!.async("string");

  assert.ok(
    docXml.includes("[Reference not found]"),
    "Phải hiển thị fallback [Reference not found] mà không làm hỏng XML"
  );

  // Import lại cũng không được crash
  const importRes = await importDocxToDocumentModel(docxBytes, "BrokenRefTest.docx");
  assert.equal(importRes.success, true);
  assert.ok(importRes.document);
});

test("Phase 12 - 9. Package Validation: clean ZIP archive structure & valid header relationships", async () => {
  const doc = createBaseDocument({
    headerText: "Header {PAGE}",
    headerImage: {
      src: SAMPLE_TINY_PNG,
      width: 80,
      height: 20,
    },
    footerText: "Footer {NUMPAGES}",
    contentBlocks: [
      {
        type: "paragraph",
        content: [
          {
            type: "bookmarkAnchor",
            attrs: { id: "bm_valid_1", name: "DiemNeo" },
          },
          {
            type: "crossReference",
            attrs: {
              targetId: "bm_valid_1",
              targetType: "bookmark",
              format: "text",
              customText: "Điểm Neo",
            },
          },
        ],
      },
    ],
  });

  const serializer = new DocumentSerializer();
  const serialized = serializer.serialize(doc);

  // Kiểm tra headerRelationships tồn tại và được populate đúng
  assert.ok(serialized.headerRelationships, "headerRelationships phải tồn tại");
  assert.ok(serialized.headerRelationships.size > 0, "headerRelationships phải có ít nhất 1 quan hệ");

  const validation = validateDocxPackageData({
    documentXml: serialized.documentXml,
    stylesXml: "<w:styles xmlns:w=\"http://schemas.openxmlformats.org/wordprocessingml/2006/main\"/>",
    numberingXml: "<w:numbering xmlns:w=\"http://schemas.openxmlformats.org/wordprocessingml/2006/main\"/>",
    relationships: serialized.relationships,
    mediaFiles: serialized.mediaFiles,
    headerFiles: serialized.headerFiles,
    footerFiles: serialized.footerFiles,
    headerRelationships: serialized.headerRelationships,
    footerRelationships: serialized.footerRelationships,
  });

  assert.equal(validation.valid, true, `Gói tài liệu phải hợp lệ: ${validation.errors.join("; ")}`);
  assert.equal(validation.errors.length, 0);
});
