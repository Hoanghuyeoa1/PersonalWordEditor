import { test } from "node:test";
import assert from "node:assert/strict";
import type { JSONContent } from "@tiptap/core";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";

// Imports từ References Subsystem
import { HeadingService, type HeadingItem } from "./services/headingService.ts";
import { HeadingAnchorExtension } from "./extensions/headingAnchorExtension.ts";
import { ReferenceAnchorService } from "./services/referenceAnchorService.ts";
import {
  getReferenceItemDescriptor,
  getReferenceItemsByGroup,
} from "./services/referencesRegistry.ts";
import { useReferencesStore } from "../stores/referencesStore.ts";
import { dispatchReferenceCommand } from "./commands/referencesCommands.ts";
import {
  serializeDocumentToMwd,
  deserializeMwdToDocument,
} from "../document/documentFile.ts";
import { createInitialDocument } from "../document/documentModel.ts";
import type { SectionModel } from "../page/types/sectionTypes.ts";
import { DEFAULT_PAGE_SETTINGS } from "../page/index.ts";

/* ==========================================================================
   1. HEADING EXTRACTION & MIXED MARKS TESTS
   ========================================================================== */

test("Phase 6.2 Heading Extraction: Trích xuất chính xác Heading 1, 2, 3 và mixed marks", () => {
  const sampleDoc: JSONContent = {
    type: "doc",
    content: [
      {
        type: "heading",
        attrs: { level: 1, id: "ref_heading_c1" },
        content: [
          { type: "text", text: "Chương 1: " },
          { type: "text", text: "Tổng quan", marks: [{ type: "bold" }, { type: "italic" }] },
        ],
      },
      {
        type: "paragraph",
        content: [{ type: "text", text: "Nội dung thân bài..." }],
      },
      {
        type: "heading",
        attrs: { level: 2, id: "ref_heading_m11" },
        content: [
          { type: "text", text: "Mục 1.1: " },
          { type: "text", text: "Màu sắc", marks: [{ type: "textStyle", attrs: { color: "#ff0000" } }] },
        ],
      },
      {
        type: "heading",
        attrs: { level: 3 },
        content: [{ type: "text", text: "Tiểu mục 1.1.1: Chi tiết" }],
      },
    ],
  };

  const headings = HeadingService.extractHeadings(sampleDoc);
  assert.equal(headings.length, 3);

  // Heading 1
  assert.equal(headings[0].id, "ref_heading_c1");
  assert.equal(headings[0].level, 1);
  assert.equal(headings[0].text, "Chương 1: Tổng quan");
  assert.equal(headings[0].hasMixedMarks, true);

  // Heading 2
  assert.equal(headings[1].id, "ref_heading_m11");
  assert.equal(headings[1].level, 2);
  assert.equal(headings[1].text, "Mục 1.1: Màu sắc");
  assert.equal(headings[1].hasMixedMarks, true);

  // Heading 3: tự sinh ID hợp lệ vì chưa có
  assert.ok(ReferenceAnchorService.isValidAnchorId(headings[2].id));
  assert.equal(headings[2].level, 3);
  assert.equal(headings[2].text, "Tiểu mục 1.1.1: Chi tiết");
});

test("Phase 6.2 Heading Extraction: Xử lý an toàn Heading rỗng", () => {
  const emptyHeadingsDoc: JSONContent = {
    type: "doc",
    content: [
      {
        type: "heading",
        attrs: { level: 1 },
        content: [],
      },
      {
        type: "heading",
        attrs: { level: 2 },
        content: [{ type: "text", text: "   " }],
      },
    ],
  };

  const headings = HeadingService.extractHeadings(emptyHeadingsDoc);
  assert.equal(headings.length, 2);
  assert.equal(headings[0].text, "(Tiêu đề trống)");
  assert.equal(headings[1].text, "(Tiêu đề trống)");
  assert.ok(ReferenceAnchorService.isValidAnchorId(headings[0].id));
  assert.ok(ReferenceAnchorService.isValidAnchorId(headings[1].id));
});

/* ==========================================================================
   2. HIERARCHY & IRREGULAR SEQUENCES TESTS
   ========================================================================== */

test("Phase 6.2 Hierarchy: Chuỗi chuẩn H1 -> H2 -> H3 tạo cây phân cấp chuẩn mực", () => {
  const flatHeadings: HeadingItem[] = [
    { id: "h1", level: 1, text: "Chương 1", from: 0, to: 10 },
    { id: "h1_1", level: 2, text: "Mục 1.1", from: 11, to: 20 },
    { id: "h1_1_1", level: 3, text: "Tiểu mục 1.1.1", from: 21, to: 30 },
    { id: "h1_2", level: 2, text: "Mục 1.2", from: 31, to: 40 },
    { id: "h2", level: 1, text: "Chương 2", from: 41, to: 50 },
  ];

  const tree = HeadingService.buildHeadingHierarchy(flatHeadings);
  assert.equal(tree.length, 2); // 2 root nodes (Chương 1 và Chương 2)

  // Chương 1
  assert.equal(tree[0].id, "h1");
  assert.equal(tree[0].children?.length, 2);
  assert.equal(tree[0].children![0].id, "h1_1");
  assert.equal(tree[0].children![0].children?.length, 1);
  assert.equal(tree[0].children![0].children![0].id, "h1_1_1");
  assert.equal(tree[0].children![1].id, "h1_2");

  // Chương 2
  assert.equal(tree[1].id, "h2");
  assert.equal(tree[1].children?.length, 0);
});

test("Phase 6.2 Hierarchy: Kháng 100% các chuỗi bất thường (H1 -> H3, H2 ở đầu doc, nhiều H1)", () => {
  // Case A: H1 nhảy cóc sang H3 (H1 -> H3)
  const skipLevelHeadings: HeadingItem[] = [
    { id: "h1", level: 1, text: "Chương 1", from: 0, to: 10 },
    { id: "h3", level: 3, text: "Tiểu mục nhảy cóc", from: 11, to: 20 },
  ];
  const treeA = HeadingService.buildHeadingHierarchy(skipLevelHeadings);
  assert.equal(treeA.length, 1);
  assert.equal(treeA[0].id, "h1");
  assert.equal(treeA[0].children?.length, 1);
  assert.equal(treeA[0].children![0].id, "h3");

  // Case B: H2 hoặc H3 đứng ở đầu document không có H1 dẫn trước
  const orphanSubHeadings: HeadingItem[] = [
    { id: "h2_root", level: 2, text: "Mục mở đầu không có H1", from: 0, to: 10 },
    { id: "h3_sub", level: 3, text: "Tiểu mục dưới H2", from: 11, to: 20 },
    { id: "h1_next", level: 1, text: "Chương chính thức", from: 21, to: 30 },
  ];
  const treeB = HeadingService.buildHeadingHierarchy(orphanSubHeadings);
  assert.equal(treeB.length, 2);
  assert.equal(treeB[0].id, "h2_root");
  assert.equal(treeB[0].children?.length, 1);
  assert.equal(treeB[0].children![0].id, "h3_sub");
  assert.equal(treeB[1].id, "h1_next");

  // Case C: Nhiều H1 liên tiếp
  const consecutiveH1s: HeadingItem[] = [
    { id: "h1_a", level: 1, text: "Chương 1", from: 0, to: 10 },
    { id: "h1_b", level: 1, text: "Chương 2", from: 11, to: 20 },
    { id: "h1_c", level: 1, text: "Chương 3", from: 21, to: 30 },
  ];
  const treeC = HeadingService.buildHeadingHierarchy(consecutiveH1s);
  assert.equal(treeC.length, 3);
  assert.deepEqual(
    treeC.map((i) => i.id),
    ["h1_a", "h1_b", "h1_c"]
  );

  // Case D: Mảng rỗng
  const emptyTree = HeadingService.buildHeadingHierarchy([]);
  assert.deepEqual(emptyTree, []);
});

/* ==========================================================================
   3. TRACK CHANGES INTERACTION & DELETED HEADINGS
   ========================================================================== */

test("Phase 6.2 Track Changes: Xử lý đề mục chứa text bị xóa hoặc bị xóa toàn bộ", () => {
  const docWithTrackChanges: JSONContent = {
    type: "doc",
    content: [
      // 1. Heading có 1 phần text bị đánh dấu xóa trong Track Changes
      {
        type: "heading",
        attrs: { level: 1, id: "ref_heading_partial" },
        content: [
          { type: "text", text: "Chương 1: " },
          {
            type: "text",
            text: "Cũ kỹ ",
            marks: [{ type: "trackChange", attrs: { changeType: "delete", id: "del-1" } }],
          },
          { type: "text", text: "Hiện đại" },
        ],
      },
      // 2. Heading bị xóa toàn bộ văn bản trong Track Changes
      {
        type: "heading",
        attrs: { level: 2, id: "ref_heading_fully_del" },
        content: [
          {
            type: "text",
            text: "Mục này đã bị xóa bỏ hoàn toàn",
            marks: [{ type: "trackChange", attrs: { changeType: "delete", id: "del-2" } }],
          },
        ],
      },
    ],
  };

  const headings = HeadingService.extractHeadings(docWithTrackChanges);
  assert.equal(headings.length, 2);

  // Heading 1: Text hoạt động loại bỏ đoạn "Cũ kỹ ", hiển thị "Chương 1: Hiện đại"
  assert.equal(headings[0].text, "Chương 1: Hiện đại");
  assert.equal(headings[0].isDeleted, false);

  // Heading 2: Bị xóa toàn bộ -> isDeleted = true, giữ text thô để nhận diện
  assert.equal(headings[1].isDeleted, true);
  assert.equal(headings[1].text, "Mục này đã bị xóa bỏ hoàn toàn");
});

/* ==========================================================================
   4. DUPLICATE ID DETECTION & NORMALIZATION
   ========================================================================== */

test("Phase 6.2 Normalization: Khử trùng lặp ID và gán ID duy nhất cho Heading thiếu", () => {
  const corruptDoc: JSONContent = {
    type: "doc",
    content: [
      {
        type: "heading",
        attrs: { level: 1, id: "ref_heading_dup1" },
        content: [{ type: "text", text: "Tiêu đề 1" }],
      },
      {
        type: "heading",
        attrs: { level: 2, id: "ref_heading_dup1" }, // TRÙNG ID
        content: [{ type: "text", text: "Tiêu đề 2" }],
      },
      {
        type: "heading",
        attrs: { level: 3 }, // THIẾU ID
        content: [{ type: "text", text: "Tiêu đề 3" }],
      },
    ],
  };

  const { updatedContent, hasChanged, normalizedCount } =
    HeadingService.normalizeHeadingIds(corruptDoc);

  assert.equal(hasChanged, true);
  assert.equal(normalizedCount, 2); // 1 duplicate + 1 missing

  const headings = HeadingService.extractHeadings(updatedContent);
  assert.equal(headings.length, 3);

  // Kiểm tra tính duy nhất tuyệt đối của ID sau khi chuẩn hóa
  const ids = new Set(headings.map((h) => h.id));
  assert.equal(ids.size, 3);

  // Heading 1 giữ nguyên ID gốc
  assert.equal(headings[0].id, "ref_heading_dup1");
  // Heading 2 có ID mới hợp lệ
  assert.notEqual(headings[1].id, "ref_heading_dup1");
  assert.ok(ReferenceAnchorService.isValidAnchorId(headings[1].id));
  // Heading 3 có ID mới hợp lệ
  assert.ok(ReferenceAnchorService.isValidAnchorId(headings[2].id));
});

/* ==========================================================================
   5. PERSISTENCE ROUND-TRIP & BACKWARD COMPATIBILITY
   ========================================================================== */

test("Phase 6.2 Persistence: Lưu và nạp .mwd bảo toàn trọn vẹn Heading IDs", () => {
  const initialDoc = createInitialDocument("Tài liệu kiểm thử Heading");
  initialDoc.content = {
    type: "doc",
    content: [
      {
        type: "heading",
        attrs: { level: 1, id: "ref_heading_chuong_1_save_test" },
        content: [{ type: "text", text: "Chương 1: Đề mục kiểm thử" }],
      },
      {
        type: "paragraph",
        content: [{ type: "text", text: "Thân bài..." }],
      },
      {
        type: "heading",
        attrs: { level: 2, id: "ref_heading_muc_1_1_save_test" },
        content: [{ type: "text", text: "Mục 1.1: Chi tiết" }],
      },
    ],
  };

  // 1. Serialize
  const serialized = serializeDocumentToMwd(initialDoc);
  assert.ok(serialized.includes("ref_heading_chuong_1_save_test"));
  assert.ok(serialized.includes("ref_heading_muc_1_1_save_test"));

  // 2. Deserialize
  const deserialized = deserializeMwdToDocument(serialized);
  assert.equal(deserialized.success, true);
  if (deserialized.success) {
    const headings = HeadingService.extractHeadings(deserialized.document.content);
    assert.equal(headings.length, 2);
    assert.equal(headings[0].id, "ref_heading_chuong_1_save_test");
    assert.equal(headings[1].id, "ref_heading_muc_1_1_save_test");
  }

  // 3. Backward Compatibility: Tệp .mwd cũ chưa từng có id trong heading
  const legacyDocJson = JSON.stringify({
    format: "PersonalWordDocument",
    version: 1,
    metadata: {
      id: "doc-legacy",
      title: "Tệp tin cũ",
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    document: {
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 1 }, // KHÔNG CÓ ID
          content: [{ type: "text", text: "Tiêu đề tệp cũ" }],
        },
      ],
    },
  });

  const legacyRes = deserializeMwdToDocument(legacyDocJson);
  assert.equal(legacyRes.success, true);
  if (legacyRes.success) {
    const legacyHeadings = HeadingService.extractHeadings(legacyRes.document.content);
    assert.equal(legacyHeadings.length, 1);
    // Tự động được sinh ID semantic an toàn khi mở tệp
    assert.ok(ReferenceAnchorService.isValidAnchorId(legacyHeadings[0].id));
  }
});

/* ==========================================================================
   6. NAVIGATION & EDITOR RUNTIME INTERACTION
   ========================================================================== */

test("Phase 6.2 Navigation: Điều hướng editor đưa caret tới heading mà không mutate nội dung", () => {
  const editor = new Editor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      HeadingAnchorExtension,
    ],
    content: {
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 1, id: "ref_heading_nav_h1" },
          content: [{ type: "text", text: "Tiêu đề đầu tiên" }],
        },
        {
          type: "paragraph",
          content: [{ type: "text", text: "Nội dung đoạn văn giữa..." }],
        },
        {
          type: "heading",
          attrs: { level: 2, id: "ref_heading_nav_h2" },
          content: [{ type: "text", text: "Tiêu đề thứ hai" }],
        },
      ],
    },
  });

  const headings = HeadingService.extractHeadings(editor.state.doc);
  assert.equal(headings.length, 2);

  // Ban đầu caret ở đầu văn bản (pos 0 hoặc 1)
  const initialJson = JSON.stringify(editor.getJSON());

  // Thực hiện điều hướng tới Heading 2
  const targetHeading = headings[1];
  const success = HeadingService.navigateToHeading(editor, targetHeading);
  assert.equal(success, true);

  // Con trỏ phải nằm trong phạm vi của Heading 2
  const currentSelection = editor.state.selection;
  assert.ok(currentSelection.from >= targetHeading.from);
  assert.ok(currentSelection.from <= targetHeading.to);

  // Store phải cập nhật selectedReferenceId
  assert.equal(useReferencesStore.getState().selectedReferenceId, "ref_heading_nav_h2");

  // TUYỆT ĐỐI KHÔNG làm biến đổi nội dung văn bản (Zero mutation)
  assert.equal(JSON.stringify(editor.getJSON()), initialJson);

  editor.destroy();
});

/* ==========================================================================
   7. LIVE UPDATE SIMULATION: RENAME, DELETE, LEVEL CHANGE
   ========================================================================== */

test("Phase 6.2 Live Updates: Outline phản hồi chính xác khi đổi tên, đổi level hoặc xóa heading", () => {
  const editor = new Editor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      HeadingAnchorExtension,
    ],
    content: {
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 1, id: "ref_heading_live_1" },
          content: [{ type: "text", text: "Tên ban đầu" }],
        },
      ],
    },
  });

  // 1. Initial
  let headings = HeadingService.extractHeadings(editor.state.doc);
  assert.equal(headings.length, 1);
  assert.equal(headings[0].text, "Tên ban đầu");
  assert.equal(headings[0].level, 1);

  // 2. Đổi tên Heading (Edit text)
  editor.view.dispatch(editor.state.tr.insertText("Tên mới sau khi sửa", 1, 12));
  headings = HeadingService.extractHeadings(editor.state.doc);
  assert.equal(headings[0].text, "Tên mới sau khi sửa");

  // 3. Đổi Level Heading (H1 -> H2)
  editor.commands.setNode("heading", { level: 2 });
  headings = HeadingService.extractHeadings(editor.state.doc);
  assert.equal(headings[0].level, 2);

  // 4. Đổi Heading sang Paragraph thường (Normal text)
  editor.commands.setNode("paragraph");
  headings = HeadingService.extractHeadings(editor.state.doc);
  assert.equal(headings.length, 0); // Không còn heading nào

  // 5. Thêm Heading mới
  editor.commands.insertContent({
    type: "heading",
    attrs: { level: 3, id: "ref_heading_live_3" },
    content: [{ type: "text", text: "Tiêu đề mới chèn" }],
  });
  headings = HeadingService.extractHeadings(editor.state.doc);
  assert.equal(headings.length, 1);
  assert.equal(headings[0].text, "Tiêu đề mới chèn");
  assert.equal(headings[0].level, 3);

  editor.destroy();
});

/* ==========================================================================
   8. REFERENCES RIBBON & REGISTRY STATUS
   ========================================================================== */

test("Phase 6.2 Ribbon & Registry: headingsOutline đã ACTIVE và điều phối mở/đóng Outline", () => {
  // 1. Kiểm tra Registry descriptor
  const outlineDesc = getReferenceItemDescriptor("headingsOutline");
  assert.ok(outlineDesc);
  assert.equal(outlineDesc.status, "active");
  assert.equal(outlineDesc.phase, "6.2");

  // 2. Danh mục Navigation
  const navItems = getReferenceItemsByGroup("navigation");
  const activeNav = navItems.find((i) => i.id === "headingsOutline");
  assert.ok(activeNav);
  assert.equal(activeNav.status, "active");

  // 3. Điều phối lệnh mở/đóng
  useReferencesStore.getState().closeReferencePanel();
  assert.equal(useReferencesStore.getState().isReferencesPanelOpen, false);

  // Lần 1: Dispatch -> Mở outline
  const res1 = dispatchReferenceCommand("headingsOutline", null);
  assert.equal(res1.success, true);
  assert.equal(useReferencesStore.getState().isReferencesPanelOpen, true);
  assert.equal(useReferencesStore.getState().activeReferencePanel, "outline");

  // Lần 2: Dispatch -> Đóng outline
  const res2 = dispatchReferenceCommand("headingsOutline", null);
  assert.equal(res2.success, true);
  assert.equal(useReferencesStore.getState().isReferencesPanelOpen, false);
});
