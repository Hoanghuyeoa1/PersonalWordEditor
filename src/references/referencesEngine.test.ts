import { test } from "node:test";
import assert from "node:assert/strict";

// Imports từ References Subsystem
import {
  REFERENCE_ITEMS,
  getReferenceItemDescriptor,
  getReferenceItemsByGroup,
  getReferenceRegistryStats,
} from "./services/referencesRegistry.ts";
import { ReferenceAnchorService } from "./services/referenceAnchorService.ts";
import {
  openReferencePanelCommand,
  closeReferencePanelCommand,
  toggleReferencePanelCommand,
  selectReferenceCommand,
  dispatchReferenceCommand,
} from "./commands/referencesCommands.ts";
import { useReferencesStore } from "../stores/referencesStore.ts";
import {
  getReferenceGroupDisplayName,
  getReferenceTargetDisplayName,
  formatAnchorDisplay,
  filterAnchorsByType,
} from "./utils/referenceUtils.ts";
import type { JSONContent } from "@tiptap/core";
import {
  serializeDocumentToMwd,
  deserializeMwdToDocument,
} from "../document/documentFile.ts";
import { createInitialDocument } from "../document/documentModel.ts";

/* ==========================================================================
   1. REFERENCES REGISTRY TESTS
   ========================================================================== */

test("Phase 6.1 References Registry: 8 nhóm chức năng cốt lõi đầy đủ theo yêu cầu", () => {
  // 8 nhóm: Table of Contents, Footnotes, Endnotes, Captions, Cross-reference, Citation, Bibliography, Heading Navigation
  const tocItems = getReferenceItemsByGroup("toc");
  assert.equal(tocItems.length >= 3, true);
  assert.deepEqual(
    tocItems.map((i) => i.id),
    ["insertToc", "updateToc", "removeToc"]
  );

  const footnoteItems = getReferenceItemsByGroup("footnotes");
  assert.equal(footnoteItems.length >= 4, true);
  assert.ok(footnoteItems.some((i) => i.id === "insertFootnote"));
  assert.ok(footnoteItems.some((i) => i.id === "nextFootnote"));
  assert.ok(footnoteItems.some((i) => i.id === "previousFootnote"));
  assert.ok(footnoteItems.some((i) => i.id === "showNotes"));

  const endnoteItems = getReferenceItemsByGroup("endnotes");
  assert.equal(endnoteItems.length >= 1, true);
  assert.equal(endnoteItems[0].id, "insertEndnote");

  const captionItems = getReferenceItemsByGroup("captions");
  assert.equal(captionItems.length >= 3, true);
  assert.ok(captionItems.some((i) => i.id === "insertCaption"));
  assert.ok(captionItems.some((i) => i.id === "insertTableOfFigures"));
  assert.ok(captionItems.some((i) => i.id === "updateTableOfFigures"));

  const crossRefItems = getReferenceItemsByGroup("crossReference");
  assert.equal(crossRefItems.length >= 1, true);
  assert.equal(crossRefItems[0].id, "crossReference");

  const citationItems = getReferenceItemsByGroup("citations");
  assert.equal(citationItems.length >= 3, true);
  assert.ok(citationItems.some((i) => i.id === "insertCitation"));
  assert.ok(citationItems.some((i) => i.id === "manageSources"));
  assert.ok(citationItems.some((i) => i.id === "citationStyle"));

  const bibItems = getReferenceItemsByGroup("bibliography");
  assert.equal(bibItems.length >= 1, true);
  assert.equal(bibItems[0].id, "insertBibliography");

  const navItems = getReferenceItemsByGroup("navigation");
  assert.equal(navItems.length >= 2, true);
  assert.ok(navItems.some((i) => i.id === "headingsOutline"));
  assert.ok(navItems.some((i) => i.id === "bookmarksList"));
});

test("Phase 6.1 References Registry: Descriptors cấu trúc đầy đủ, phím tắt & planned status", () => {
  const stats = getReferenceRegistryStats();
  assert.equal(stats.total >= 18, true);
  // Phase 6.8 kích hoạt bookmarksList (toàn bộ 18 descriptors active)
  assert.equal(stats.active, 18);
  assert.equal(stats.planned, 0);

  // Kiểm tra từng descriptor có id, label, nameEn, phase, tooltip, description
  for (const item of REFERENCE_ITEMS) {
    assert.ok(item.id, "Mỗi item phải có id");
    assert.ok(item.label, `Item ${item.id} phải có label`);
    assert.ok(item.nameEn, `Item ${item.id} phải có nameEn`);
    assert.ok(item.group, `Item ${item.id} phải có group`);
    assert.ok(item.phase, `Item ${item.id} phải có phase`);
    assert.ok(item.tooltip, `Item ${item.id} phải có tooltip`);
    assert.ok(item.description, `Item ${item.id} phải có description`);
  }

  // Tra cứu theo ID
  const fnDesc = getReferenceItemDescriptor("insertFootnote");
  assert.ok(fnDesc);
  assert.equal(fnDesc.shortcut, "Ctrl+Alt+F");
  assert.equal(fnDesc.phase, "6.4");

  const enDesc = getReferenceItemDescriptor("insertEndnote");
  assert.ok(enDesc);
  assert.equal(enDesc.shortcut, "Ctrl+Alt+D");

  const capDesc = getReferenceItemDescriptor("insertCaption");
  assert.ok(capDesc);
  assert.equal(capDesc.phase, "6.5");
  assert.equal(capDesc.status, "active");

  const crDesc = getReferenceItemDescriptor("crossReference");
  assert.ok(crDesc);
  assert.equal(crDesc.phase, "6.5");
  assert.equal(crDesc.status, "active");

  const citeDesc = getReferenceItemDescriptor("insertCitation");
  assert.ok(citeDesc);
  assert.equal(citeDesc.phase, "6.6");
  assert.equal(citeDesc.status, "active");

  const bibDesc = getReferenceItemDescriptor("insertBibliography");
  assert.ok(bibDesc);
  assert.equal(bibDesc.phase, "6.6");
  assert.equal(bibDesc.status, "active");

  const updateTocDesc = getReferenceItemDescriptor("updateToc");
  assert.ok(updateTocDesc);
  assert.equal(updateTocDesc.shortcut, "F9");
});

/* ==========================================================================
   2. REFERENCES UI STATE ISOLATION TESTS
   ========================================================================== */

test("Phase 6.1 References State: quản lý trạng thái UI tinh gọn, không chứa semantic data", () => {
  const store = useReferencesStore.getState();
  store.resetReferencesState();

  // Khởi tạo
  assert.equal(useReferencesStore.getState().activeReferencePanel, "none");
  assert.equal(useReferencesStore.getState().isReferencesPanelOpen, false);
  assert.equal(useReferencesStore.getState().selectedReferenceId, null);

  // Open panel
  store.openReferencePanel("outline");
  assert.equal(useReferencesStore.getState().activeReferencePanel, "outline");
  assert.equal(useReferencesStore.getState().isReferencesPanelOpen, true);

  // Select reference ID
  store.setSelectedReferenceId("ref_heading_test_123");
  assert.equal(useReferencesStore.getState().selectedReferenceId, "ref_heading_test_123");

  // Toggle panel (cùng panel -> đóng)
  store.toggleReferencePanel("outline");
  assert.equal(useReferencesStore.getState().isReferencesPanelOpen, false);
  assert.equal(useReferencesStore.getState().activeReferencePanel, "none");

  // Toggle panel khác -> mở panel mới
  store.toggleReferencePanel("notes");
  assert.equal(useReferencesStore.getState().isReferencesPanelOpen, true);
  assert.equal(useReferencesStore.getState().activeReferencePanel, "notes");

  // Close panel
  store.closeReferencePanel();
  assert.equal(useReferencesStore.getState().isReferencesPanelOpen, false);
  assert.equal(useReferencesStore.getState().selectedReferenceId, null);
});

/* ==========================================================================
   3. SEMANTIC ID / ANCHOR FOUNDATION TESTS
   ========================================================================== */

test("Phase 6.1 Semantic Anchor ID: tính duy nhất, định dạng chuẩn và tính bền vững", () => {
  // 1. Sinh ID ngẫu nhiên cho từng loại
  const headingId = ReferenceAnchorService.generateAnchorId("heading");
  const fnId = ReferenceAnchorService.generateAnchorId("footnote");
  const enId = ReferenceAnchorService.generateAnchorId("endnote");
  const captionId = ReferenceAnchorService.generateAnchorId("caption");
  const citeId = ReferenceAnchorService.generateAnchorId("citation");

  assert.ok(ReferenceAnchorService.isValidAnchorId(headingId));
  assert.ok(ReferenceAnchorService.isValidAnchorId(fnId));
  assert.ok(ReferenceAnchorService.isValidAnchorId(enId));
  assert.ok(ReferenceAnchorService.isValidAnchorId(captionId));
  assert.ok(ReferenceAnchorService.isValidAnchorId(citeId));

  // 2. Kiểm tra tính duy nhất (Unique across 50 generated IDs)
  const ids = new Set<string>();
  for (let i = 0; i < 50; i++) {
    const id = ReferenceAnchorService.generateAnchorId("heading");
    assert.equal(ids.has(id), false, "ID không được phép trùng lặp");
    ids.add(id);
  }
  assert.equal(ids.size, 50);

  // 3. Phân tách và giải mã cấu trúc ID (Parse semantic parts)
  const parsed = ReferenceAnchorService.parseAnchorId(headingId);
  assert.ok(parsed);
  assert.equal(parsed.prefix, "ref");
  assert.equal(parsed.type, "heading");
  assert.ok(parsed.uniquePart.length > 0);

  // 4. Kiểm tra ID không hợp lệ bị từ chối
  assert.equal(ReferenceAnchorService.isValidAnchorId(""), false);
  assert.equal(ReferenceAnchorService.isValidAnchorId(null), false);
  assert.equal(ReferenceAnchorService.isValidAnchorId("invalid_id"), false);
  assert.equal(ReferenceAnchorService.isValidAnchorId("ref_unknown_123"), false);
  assert.equal(ReferenceAnchorService.parseAnchorId("invalid_id"), null);

  // 5. Sinh ID có seed hỗ trợ tiếng Việt có dấu an toàn (bỏ dấu chuẩn XML/HTML)
  const seededId = ReferenceAnchorService.generateAnchorId("heading", "Chương 1: Tổng quan dự án");
  assert.ok(ReferenceAnchorService.isValidAnchorId(seededId));
  assert.ok(seededId.includes("chuong_1_tong_quan_du_an"));
  // Không chứa ký tự đặc biệt ngoài chữ cái, số, gạch nối/dưới
  assert.match(seededId, /^[a-zA-Z0-9_-]+$/);
});

test("Phase 6.1 Semantic Anchor ID: Khởi tạo và kiểm tra tính toàn vẹn anchor", () => {
  const anchor = ReferenceAnchorService.createAnchor("heading", "Chương 1", undefined, { level: 1 });
  assert.ok(ReferenceAnchorService.isValidAnchorId(anchor.id));
  assert.equal(anchor.label, "Chương 1");
  assert.equal(anchor.targetType, "heading");
  assert.equal(anchor.metadata?.level, 1);

  // Validate integrity
  const validResult = ReferenceAnchorService.validateAnchorIntegrity([anchor]);
  assert.equal(validResult.valid, true);
  assert.equal(validResult.duplicateIds.length, 0);

  // Duplicate ID detection
  const dupResult = ReferenceAnchorService.validateAnchorIntegrity([anchor, { ...anchor }]);
  assert.equal(dupResult.valid, false);
  assert.equal(dupResult.duplicateIds.length, 1);
  assert.equal(dupResult.duplicateIds[0], anchor.id);

  // Invalid format detection
  const invalidResult = ReferenceAnchorService.validateAnchorIntegrity([
    { id: "bad-id", targetType: "heading", label: "Bad", targetId: "bad-id" },
  ]);
  assert.equal(invalidResult.valid, false);
  assert.equal(invalidResult.invalidFormatIds[0], "bad-id");
});

/* ==========================================================================
   4. HEADING ANCHORS & AST IMMUTABILITY TESTS
   ========================================================================== */

test("Phase 6.1 Heading Anchors: Trích xuất chính xác và bảo toàn tính bất biến của AST", () => {
  const sampleDoc: JSONContent = {
    type: "doc",
    content: [
      {
        type: "heading",
        attrs: { level: 1, id: "ref_heading_chuong1_custom123" },
        content: [{ type: "text", text: "Chương 1: Mở đầu" }],
      },
      {
        type: "paragraph",
        content: [{ type: "text", text: "Nội dung đoạn văn mở đầu..." }],
      },
      {
        type: "heading",
        attrs: { level: 2 },
        content: [{ type: "text", text: "Mục 1.1: Bối cảnh nghiên cứu" }],
      },
      {
        type: "heading",
        attrs: { level: 3 },
        content: [{ type: "text", text: "Tiểu mục 1.1.1: Phạm vi" }],
      },
    ],
  };

  // 1. Trích xuất anchors từ Heading
  const anchors = ReferenceAnchorService.extractHeadingAnchors(sampleDoc);
  assert.equal(anchors.length, 3);

  // Heading 1 giữ nguyên ID đã có
  assert.equal(anchors[0].id, "ref_heading_chuong1_custom123");
  assert.equal(anchors[0].label, "Chương 1: Mở đầu");
  assert.equal(anchors[0].metadata?.level, 1);

  // Heading 2 được sinh ID mới hợp lệ
  assert.ok(ReferenceAnchorService.isValidAnchorId(anchors[1].id));
  assert.equal(anchors[1].label, "Mục 1.1: Bối cảnh nghiên cứu");
  assert.equal(anchors[1].metadata?.level, 2);

  // Heading 3
  assert.ok(ReferenceAnchorService.isValidAnchorId(anchors[2].id));
  assert.equal(anchors[2].label, "Tiểu mục 1.1.1: Phạm vi");
  assert.equal(anchors[2].metadata?.level, 3);

  // 2. Bảo toàn tính bất biến (Immutability): sampleDoc không bị biến đổi
  assert.equal(sampleDoc.content![2].attrs?.id, undefined);

  // 3. ensureHeadingAnchorIds tạo AST mới, gán ID cho heading thiếu mà không mutate sampleDoc
  const { updatedDoc, generatedCount } = ReferenceAnchorService.ensureHeadingAnchorIds(sampleDoc);
  assert.equal(generatedCount, 2); // Heading 2 và 3 được gán ID
  assert.notStrictEqual(updatedDoc, sampleDoc);
  assert.equal(sampleDoc.content![2].attrs?.id, undefined); // Gốc vẫn không đổi
  assert.ok(ReferenceAnchorService.isValidAnchorId(updatedDoc.content![2].attrs?.id));

  // 4. Tìm kiếm anchor trong AST (findAnchorInDoc)
  const foundHeading = ReferenceAnchorService.findAnchorInDoc(
    sampleDoc,
    "ref_heading_chuong1_custom123"
  );
  assert.ok(foundHeading);
  assert.equal(foundHeading.targetType, "heading");
  assert.equal(foundHeading.label, "Chương 1: Mở đầu");

  // Tìm anchor không tồn tại
  const notFound = ReferenceAnchorService.findAnchorInDoc(sampleDoc, "ref_heading_non_existent");
  assert.equal(notFound, null);
});

/* ==========================================================================
   5. COMMAND DISPATCH SAFETY TESTS
   ========================================================================== */

test("Phase 6.1 References Commands: Điều phối an toàn, không thực hiện hành vi giả mạo", () => {
  // 1. Lệnh active nhưng editor null -> thất bại an toàn, không crash
  const tocResult = dispatchReferenceCommand("insertToc", null);
  assert.equal(tocResult.success, false);
  assert.equal(tocResult.itemType, "insertToc");
  assert.ok(tocResult.message?.includes("Editor"));

  // Lệnh active insertFootnote nhưng editor null -> thất bại an toàn, không crash
  const fnResult = dispatchReferenceCommand("insertFootnote", null);
  assert.equal(fnResult.success, false);
  assert.equal(fnResult.itemType, "insertFootnote");
  assert.ok(fnResult.message?.includes("Editor"));

  // Lệnh active bookmarksList nhưng editor null -> thất bại an toàn, không crash
  const bmResult = dispatchReferenceCommand("bookmarksList", null);
  assert.equal(bmResult.success, false);
  assert.equal(bmResult.itemType, "bookmarksList");
  assert.ok(bmResult.message?.includes("Editor"));

  // 2. Gọi lệnh với ID không tồn tại
  // @ts-expect-error Kiểm tra ID rác
  const invalidResult = dispatchReferenceCommand("nonExistentReferenceCommand", null);
  assert.equal(invalidResult.success, false);

  // 3. Lệnh UI Foundation: mở/đóng/đảo panel
  const openRes = openReferencePanelCommand("outline");
  assert.equal(openRes.success, true);
  assert.equal(useReferencesStore.getState().activeReferencePanel, "outline");
  assert.equal(useReferencesStore.getState().isReferencesPanelOpen, true);

  const toggleRes = toggleReferencePanelCommand("outline");
  assert.equal(toggleRes.success, true);
  assert.equal(useReferencesStore.getState().isReferencesPanelOpen, false);

  const selectRes = selectReferenceCommand("ref_heading_abc");
  assert.equal(selectRes.success, true);
  assert.equal(useReferencesStore.getState().selectedReferenceId, "ref_heading_abc");

  const closeRes = closeReferencePanelCommand();
  assert.equal(closeRes.success, true);
  assert.equal(useReferencesStore.getState().isReferencesPanelOpen, false);
});

/* ==========================================================================
   6. UTILITIES TESTS
   ========================================================================== */

test("Phase 6.1 References Utils: Định dạng nhãn và lọc anchor", () => {
  assert.equal(getReferenceGroupDisplayName("toc", "vi"), "Mục lục");
  assert.equal(getReferenceGroupDisplayName("toc", "en"), "Table of Contents");
  assert.equal(getReferenceTargetDisplayName("heading", "vi"), "Tiêu đề");

  const anchor = ReferenceAnchorService.createAnchor("heading", "Chương 2: Thiết kế", undefined, { level: 2 });
  const display = formatAnchorDisplay(anchor);
  assert.equal(display, "[H2] Chương 2: Thiết kế");

  const fnAnchor = ReferenceAnchorService.createAnchor("footnote", "Ghi chú 1");
  const fnDisplay = formatAnchorDisplay(fnAnchor);
  assert.equal(fnDisplay, "[Chú thích cuối trang] Ghi chú 1");

  const filtered = filterAnchorsByType([anchor, fnAnchor], "heading");
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].id, anchor.id);
});

/* ==========================================================================
   7. DOCUMENT MODEL & .MWD PERSISTENCE COMPATIBILITY TESTS
   ========================================================================== */

test("Phase 6.1 Persistence: Tương thích ngược tuyệt đối và bảo toàn references metadata", () => {
  // 1. Tạo document ban đầu
  const initialDoc = createInitialDocument("Tài liệu tham chiếu mẫu");
  assert.equal(initialDoc.references, undefined);

  // 2. Gán metadata references
  const docWithRefs = {
    ...initialDoc,
    references: {
      anchors: {
        "ref_heading_c1": {
          id: "ref_heading_c1",
          targetType: "heading",
          label: "Chương 1",
        },
      },
    },
  };

  // 3. Tuần tự hóa ra .mwd
  const serialized = serializeDocumentToMwd(docWithRefs);
  assert.ok(serialized.includes('"references"'));
  assert.ok(serialized.includes('"ref_heading_c1"'));

  // 4. Giải tuần tự hóa trở lại
  const deserialized = deserializeMwdToDocument(serialized);
  assert.equal(deserialized.success, true);
  if (deserialized.success) {
    assert.ok(deserialized.document.references);
    assert.ok(deserialized.document.references.anchors?.["ref_heading_c1"]);
    assert.equal(deserialized.document.references.anchors["ref_heading_c1"].label, "Chương 1");
  }

  // 5. Tương thích ngược: Tệp tin cũ không có khối "references" vẫn đọc thành công 100%
  const oldMwdJson = JSON.stringify({
    format: "PersonalWordDocument",
    version: 1,
    metadata: {
      id: "doc-old-123",
      title: "Tài liệu Phase cũ",
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    document: {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "Văn bản cũ" }] }],
    },
  });

  const oldResult = deserializeMwdToDocument(oldMwdJson);
  assert.equal(oldResult.success, true);
  if (oldResult.success) {
    assert.equal(oldResult.document.metadata.id, "doc-old-123");
    assert.equal(oldResult.document.references, undefined);
  }
});
