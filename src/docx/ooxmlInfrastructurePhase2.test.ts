import test from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";

import {
  OOXML_NAMESPACES,
  buildNamespaceAttributes,
  getDocumentXmlNamespaces,
  getHeaderFooterXmlNamespaces,
  RelationshipAllocator,
  DocPrIdAllocator,
  BookmarkIdAllocator,
  CommentIdAllocator,
  ContentTypesManager,
  WELL_KNOWN_CONTENT_TYPES,
  validateDocxPackageData,
  DocxDiagnosticsReporter,
  validateNodeOoxmlHook,
  buildDocxPackage,
  exportDocumentModelToDocx,
} from "./index.ts";
import type { DocumentModel } from "../document/documentTypes.ts";
import { DEFAULT_PAGE_SETTINGS } from "../page/index.ts";

test("PHASE 2 - 1. Namespace Management: Centralized URIs & attribute generator", () => {
  assert.equal(
    OOXML_NAMESPACES.w,
    "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
  );
  assert.equal(
    OOXML_NAMESPACES.r,
    "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
  );
  assert.equal(
    OOXML_NAMESPACES.m,
    "http://schemas.openxmlformats.org/officeDocument/2006/math"
  );
  assert.equal(
    OOXML_NAMESPACES.wp,
    "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
  );
  assert.equal(
    OOXML_NAMESPACES.pic,
    "http://schemas.openxmlformats.org/drawingml/2006/picture"
  );

  const docNamespaces = getDocumentXmlNamespaces();
  assert.ok(docNamespaces.includes('xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'));
  assert.ok(docNamespaces.includes('xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"'));
  assert.ok(docNamespaces.includes('xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"'));
  assert.ok(docNamespaces.includes('xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"'));
  assert.ok(docNamespaces.includes('xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"'));
  assert.ok(docNamespaces.includes('xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"'));
  assert.ok(docNamespaces.includes('xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"'));
  assert.ok(docNamespaces.includes('xmlns:v="urn:schemas-microsoft-com:vml"'));
  assert.ok(docNamespaces.includes('xmlns:o="urn:schemas-microsoft-com:office:office"'));
  assert.ok(docNamespaces.includes('xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"'));

  // Không duplicate khi gọi buildNamespaceAttributes với danh sách có trùng
  const custom = buildNamespaceAttributes(["w", "w", "r", "r"]);
  const wMatches = (custom.match(/xmlns:w=/g) || []).length;
  assert.equal(wMatches, 1, "Namespace w chỉ được định nghĩa một lần");
});

test("PHASE 2 - 2. Relationship Allocator: Scopes, rId generation & deduplication", () => {
  const allocator = new RelationshipAllocator();

  // Document scope
  const rId1 = allocator.allocate("document", "http://example.com/rel", "media/img1.png");
  const rId2 = allocator.allocate("document", "http://example.com/rel", "media/img2.png");
  assert.equal(rId1, "rId1");
  assert.equal(rId2, "rId2");

  // Deduplication: cùng type, target, targetMode trong cùng scope phải trả về rId cũ
  const rId1Dup = allocator.allocate("document", "http://example.com/rel", "media/img1.png");
  assert.equal(rId1Dup, "rId1", "Phải tái sử dụng rId1 khi quan hệ giống hệt");

  // Header scope độc lập
  const headerRelId1 = allocator.allocate("header:header1.xml", "http://example.com/rel", "media/logo.png");
  assert.equal(headerRelId1, "rId1", "Header scope phải có bộ đếm độc lập bắt đầu từ rId1");

  const headerRelId2 = allocator.allocate("header:header1.xml", "http://example.com/rel", "http://google.com", "External");
  assert.equal(headerRelId2, "rId2");

  // Footer scope độc lập
  const footerRelId1 = allocator.allocate("footer:footer1.xml", "http://example.com/rel", "media/footer.png");
  assert.equal(footerRelId1, "rId1", "Footer scope phải có bộ đếm độc lập bắt đầu từ rId1");

  // Kiểm tra buildRelsXml
  const headerXml = allocator.buildRelsXml("header:header1.xml");
  assert.ok(headerXml.includes('<Relationship Id="rId1" Type="http://example.com/rel" Target="media/logo.png"/>'));
  assert.ok(headerXml.includes('TargetMode="External"'));
});

test("PHASE 2 - 3. Drawing / Object IDs: docPr, bookmark, and comment unique allocators", () => {
  const docPrAllocator = new DocPrIdAllocator();
  const id1 = docPrAllocator.allocate();
  const id2 = docPrAllocator.allocate();
  const id3 = docPrAllocator.allocate();

  assert.equal(id1, 1);
  assert.equal(id2, 2);
  assert.equal(id3, 3);
  assert.notEqual(id1, id2);

  const docPrObj = docPrAllocator.allocateDocPr("Diagram", "Chart Description");
  assert.equal(docPrObj.id, 4);
  assert.equal(docPrObj.name, "Diagram 4");
  assert.equal(docPrObj.descr, "Chart Description");

  // Bookmark ID Allocator
  const bmAllocator = new BookmarkIdAllocator();
  const bmId1 = bmAllocator.getNumericId("bm_intro");
  const bmId2 = bmAllocator.getNumericId("bm_conclusion");
  const bmId1Again = bmAllocator.getNumericId("bm_intro");

  assert.equal(bmId1, 0);
  assert.equal(bmId2, 1);
  assert.equal(bmId1Again, 0, "Phải tái sử dụng cùng ID số nguyên");

  // Bookmark Safe Name Sanitization
  const safeName1 = bmAllocator.getSafeXmlName("bm_vn", "Mục Lục Tài Liệu");
  assert.equal(safeName1, "Muc_Luc_Tai_Lieu");

  const safeNameDup = bmAllocator.getSafeXmlName("bm_vn_dup", "Mục Lục Tài Liệu");
  assert.equal(safeNameDup, "Muc_Luc_Tai_Lieu_1", "Phải tự động thêm hậu tố để tránh đụng tên");

  // Comment ID Allocator
  const commentAllocator = new CommentIdAllocator();
  const c1 = commentAllocator.allocate("comment-uuid-1");
  const c2 = commentAllocator.allocate("comment-uuid-2");
  const c1Cached = commentAllocator.allocate("comment-uuid-1");

  assert.equal(c1, "0");
  assert.equal(c2, "1");
  assert.equal(c1Cached, "0");
});

test("PHASE 2 - 4. Content Types Manager: Defaults, Overrides, Deduplication & Extensions", () => {
  const manager = new ContentTypesManager();

  // Kiểm tra defaults có sẵn
  assert.ok(manager.hasDefault("png"));
  assert.ok(manager.hasDefault("jpeg"));
  assert.ok(manager.hasDefault("webp"));
  assert.ok(manager.hasDefault("emf"));
  assert.ok(manager.hasDefault("wmf"));
  assert.ok(manager.hasDefault("tiff"));

  // Thêm override
  manager.addOverride("word/document.xml", WELL_KNOWN_CONTENT_TYPES.documentMain);
  manager.addOverride("/word/document.xml", WELL_KNOWN_CONTENT_TYPES.documentMain);
  manager.addOverride("/WORD/DOCUMENT.XML", WELL_KNOWN_CONTENT_TYPES.documentMain);

  const xml = manager.buildXml();
  const matchCount = (xml.match(/PartName="\/word\/document\.xml"/g) || []).length;
  assert.equal(matchCount, 1, "Tuyệt đối không được duplicate part entry trong [Content_Types].xml");

  // Auto-detection media extension
  manager.ensureMediaExtension("chart.wmf");
  manager.ensureMediaExtension("custom_asset.xyz");
  assert.ok(manager.hasDefault("xyz"));
});

test("PHASE 2 - 5. Package Validation: Dangling relationship and corrupt XML detection", () => {
  // Trường hợp hợp lệ
  const validData = {
    documentXml: '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p/></w:body></w:document>',
    stylesXml: '<?xml version="1.0"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"/>',
    numberingXml: '<?xml version="1.0"?><w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"/>',
    relationships: [
      { id: "rId1", type: "http://example.com/styles", target: "styles.xml" },
      { id: "rId2", type: "http://example.com/image", target: "media/image1.png" },
    ],
    mediaFiles: new Map([["image1.png", new Uint8Array([1, 2, 3])]]),
    headerFiles: new Map(),
    footerFiles: new Map(),
  };

  const validRes = validateDocxPackageData(validData);
  assert.equal(validRes.valid, true);
  assert.equal(validRes.errors.length, 0);

  // Trường hợp Dangling Relationship: rId trỏ đến ảnh không tồn tại
  const danglingData = {
    ...validData,
    relationships: [
      ...validData.relationships,
      { id: "rId3", type: "http://example.com/image", target: "media/non_existent.png" },
    ],
  };

  const danglingRes = validateDocxPackageData(danglingData);
  assert.equal(danglingRes.valid, false);
  assert.ok(danglingRes.errors.some((e) => e.includes("non_existent.png")));

  // Trường hợp duplicate docPr ID trong document.xml
  const duplicateDocPrData = {
    ...validData,
    documentXml: `<?xml version="1.0"?>
    <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">
      <w:body>
        <w:p><w:r><w:drawing><wp:inline><wp:docPr id="10" name="Pic 1"/></wp:inline></w:drawing></w:r></w:p>
        <w:p><w:r><w:drawing><wp:inline><wp:docPr id="10" name="Pic 2"/></wp:inline></w:drawing></w:r></w:p>
      </w:body>
    </w:document>`,
  };

  const dupRes = validateDocxPackageData(duplicateDocPrData);
  assert.equal(dupRes.valid, false);
  assert.ok(dupRes.errors.some((e) => e.includes("wp:docPr id='10'")));
});

test("PHASE 2 - 6. Compatibility Diagnostics Model: Structured classification & clean warnings", () => {
  const reporter = new DocxDiagnosticsReporter();

  reporter.recordPreserved("Bookmark", "BOOKMARK_PRESERVED", "Bảo toàn bookmark 'MucLuc'.");
  reporter.recordApproximated("TrackChanges", "MOVE_TO_INSERT", "Chuyển đổi moveTo thành Tracked Insertion.", "<w:moveTo id='123'/>");
  reporter.recordUnsupported("Equation", "OMML_FALLBACK_TEXT", "Công thức toán được hiển thị dưới dạng văn bản thay thế.", "<m:oMath>...</m:oMath>");
  reporter.recordIgnoredSafely("Styles", "RPRCHANGE_IGNORED", "Bỏ qua rPrChange định dạng.", "<w:rPrChange/>");

  const summary = reporter.getSummary();
  assert.equal(summary.total, 4);
  assert.equal(summary.preserved, 1);
  assert.equal(summary.approximated, 1);
  assert.equal(summary.unsupported, 1);
  assert.equal(summary.ignoredSafely, 1);

  // Kiểm tra warnings người dùng
  const userWarnings = reporter.toUserWarnings();
  assert.equal(userWarnings.length, 2, "Chỉ cảnh báo approximated và unsupported ra UI");
  assert.ok(userWarnings.includes("Chuyển đổi moveTo thành Tracked Insertion."));
  assert.ok(!userWarnings.some((w) => w.includes("<w:moveTo")), "Không được lộ technical XML markup ra user warnings");
});

test("PHASE 2 - 7. Raw / Unsupported Metadata Hook: Validation & semantic check", () => {
  // Hook hợp lệ với XML chuẩn
  const validHook = {
    kind: "omml",
    rawXml: '<m:oMath xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"><m:r><m:t>E=mc^2</m:t></m:r></m:oMath>',
  };
  assert.equal(validateNodeOoxmlHook(validHook), true);

  // Hook không hợp lệ: XML hỏng
  const invalidXmlHook = {
    kind: "omml",
    rawXml: '<m:oMath><m:unclosed>',
  };
  assert.equal(validateNodeOoxmlHook(invalidXmlHook), false);

  // Hook không hợp lệ: sai kind
  const invalidKindHook = {
    kind: "arbitraryJavascript",
    rawXml: "<root/>",
  };
  assert.equal(validateNodeOoxmlHook(invalidKindHook), false);
});

test("PHASE 2 - 8. End-to-End Package Generation: Valid package with scoped headers & independent docPr IDs", async () => {
  const model: DocumentModel = {
    metadata: {
      id: "doc-phase2-test",
      title: "Test Phase 2 Infrastructure",
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    pageSettings: DEFAULT_PAGE_SETTINGS,
    content: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Kiểm tra tích hợp hạ tầng OOXML Phase 2." }],
        },
        {
          type: "image",
          attrs: {
            src: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
            width: 100,
            height: 100,
            alt: "Hình ảnh 1",
          },
        },
        {
          type: "image",
          attrs: {
            src: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
            width: 120,
            height: 120,
            alt: "Hình ảnh 2",
          },
        },
      ],
    },
  };

  const docxBytes = await exportDocumentModelToDocx(model);
  assert.ok(docxBytes.length > 0);

  const zip = await JSZip.loadAsync(docxBytes);
  const docXml = await zip.file("word/document.xml")?.async("string");
  assert.ok(docXml, "document.xml phải tồn tại");

  // Kiểm tra namespaces tập trung tại root
  assert.ok(docXml.includes('xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'));
  assert.ok(docXml.includes('xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"'));

  // Kiểm tra docPr IDs độc lập và tuần tự
  assert.ok(docXml.includes('wp:docPr id="1" name="Picture 1"'));
  assert.ok(docXml.includes('wp:docPr id="2" name="Picture 2"'));

  // Kiểm tra không duplicate xmlns:pic bên trong drawing
  const picXmlMatches = (docXml.match(/xmlns:pic=/g) || []).length;
  assert.equal(picXmlMatches, 1, "Chỉ khai báo xmlns:pic duy nhất một lần tại root");

  // Kiểm tra [Content_Types].xml có đủ extension
  const ctXml = await zip.file("[Content_Types].xml")?.async("string");
  assert.ok(ctXml?.includes('Extension="png"'));
  assert.ok(ctXml?.includes('PartName="/word/document.xml"'));
});
