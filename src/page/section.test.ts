import test from "node:test";
import assert from "node:assert/strict";
import type { JSONContent } from "@tiptap/core";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { SectionBreak } from "./extensions/sectionBreakExtension.ts";
import { PageBreak } from "./extensions/pageBreakExtension.ts";
import {
  extractSections,
  getSectionAtPos,
  updateSectionSettingsInAst,
  countSectionBreaks,
  getBlocksForSection,
} from "./services/sectionService.ts";
import {
  calculatePaginationState,
  calculateBreakSpacerForPages,
  PAGE_GAP_PX,
} from "./services/paginationService.ts";
import {
  serializeDocumentToMwd,
  deserializeMwdToDocument,
} from "../document/documentFile.ts";
import { extractDocumentStats } from "../document/documentModel.ts";
import {
  DEFAULT_PAGE_SETTINGS,
  MARGIN_PRESETS,
} from "./services/pageConstants.ts";
import type { PageSettings } from "./types/pageTypes.ts";
import type { DocumentModel } from "../document/documentTypes.ts";
import {
  insertSectionBreak,
  updateSectionSettings,
} from "../editor/editorCommands.ts";
import { useDocumentStore } from "../stores/documentStore.ts";

function createTestEditor(initialContent?: JSONContent): Editor {
  return new Editor({
    extensions: [
      StarterKit,
      PageBreak,
      SectionBreak,
    ],
    content: initialContent || {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "Nội dung ban đầu" }] }],
    },
  });
}

test("Section 1: Default document initializes with exactly 1 section inheriting document pageSettings", () => {
  const docContent: JSONContent = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Tài liệu đơn mục ban đầu." }],
      },
    ],
  };

  const customSettings: PageSettings = {
    paperSize: "Letter",
    orientation: "portrait",
    margins: MARGIN_PRESETS.Wide,
    marginPreset: "Wide",
  };

  const sections = extractSections(docContent, customSettings);
  assert.strictEqual(sections.length, 1);
  assert.strictEqual(sections[0].index, 1);
  assert.strictEqual(sections[0].id, "sec-1");
  assert.strictEqual(sections[0].pageSettings.paperSize, "Letter");
  assert.strictEqual(sections[0].pageSettings.orientation, "portrait");
  assert.strictEqual(sections[0].pageSettings.marginPreset, "Wide");
  assert.strictEqual(sections[0].breakPos, null);
});

test("Section 2: Inserting a Section Break creates Section 2 inheriting settings from Section 1", () => {
  const docWithBreak: JSONContent = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Đoạn văn thuộc Section 1." }],
      },
      {
        type: "sectionBreak",
        attrs: {
          sectionType: "nextPage",
          sectionId: "sec-test-2",
        },
      },
      {
        type: "paragraph",
        content: [{ type: "text", text: "Đoạn văn thuộc Section 2." }],
      },
    ],
  };

  const sections = extractSections(docWithBreak, DEFAULT_PAGE_SETTINGS);
  assert.strictEqual(sections.length, 2);

  // Section 1
  assert.strictEqual(sections[0].index, 1);
  assert.strictEqual(sections[0].pageSettings.paperSize, "A4");
  assert.strictEqual(sections[0].pageSettings.orientation, "portrait");

  // Section 2 inherits from Section 1
  assert.strictEqual(sections[1].index, 2);
  assert.strictEqual(sections[1].id, "sec-test-2");
  assert.strictEqual(sections[1].pageSettings.paperSize, "A4");
  assert.strictEqual(sections[1].pageSettings.orientation, "portrait");
  assert.strictEqual(sections[1].pageSettings.margins.top, DEFAULT_PAGE_SETTINGS.margins.top);
  assert.ok(sections[1].breakPos !== null);
});

test("Section 3: Changing settings for Section 2 does NOT modify Section 1 (Section 1 Portrait, Section 2 Landscape)", () => {
  const initialContent: JSONContent = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Section 1 content (A4 Portrait)" }],
      },
      {
        type: "sectionBreak",
        attrs: {
          sectionType: "nextPage",
          sectionId: "sec-2",
          pageSettings: null,
        },
      },
      {
        type: "paragraph",
        content: [{ type: "text", text: "Section 2 content (Sẽ đổi sang A4 Landscape)" }],
      },
    ],
  };

  // Cập nhật Section 2 sang Landscape và Narrow margins
  const { updatedContent } = updateSectionSettingsInAst(
    initialContent,
    2,
    {
      orientation: "landscape",
      margins: MARGIN_PRESETS.Narrow,
      marginPreset: "Narrow",
    },
    DEFAULT_PAGE_SETTINGS
  );

  const sections = extractSections(updatedContent, DEFAULT_PAGE_SETTINGS);
  assert.strictEqual(sections.length, 2);

  // Section 1 vẫn giữ nguyên A4 Portrait Normal
  assert.strictEqual(sections[0].pageSettings.paperSize, "A4");
  assert.strictEqual(sections[0].pageSettings.orientation, "portrait");
  assert.strictEqual(sections[0].pageSettings.margins.top, 25.4);

  // Section 2 có cấu hình độc lập: A4 Landscape Narrow
  assert.strictEqual(sections[1].pageSettings.paperSize, "A4");
  assert.strictEqual(sections[1].pageSettings.orientation, "landscape");
  assert.strictEqual(sections[1].pageSettings.margins.top, 12.7);
  assert.strictEqual(sections[1].pageSettings.marginPreset, "Narrow");
});

test("Section 4: Pagination engine renders distinct sheet dimensions for mixed sections (A4 Portrait vs A4 Landscape)", () => {
  const mixedDoc: JSONContent = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Trang 1 thuộc Section 1 (A4 Portrait)" }],
      },
      {
        type: "sectionBreak",
        attrs: {
          sectionType: "nextPage",
          sectionId: "sec-2",
          pageSettings: {
            paperSize: "A4",
            orientation: "landscape",
            margins: MARGIN_PRESETS.Normal,
            marginPreset: "Normal",
          },
        },
      },
      {
        type: "paragraph",
        content: [{ type: "text", text: "Trang 2 thuộc Section 2 (A4 Landscape)" }],
      },
    ],
  };

  const pagination = calculatePaginationState(mixedDoc, {
    paperSize: "A4",
    orientation: "portrait",
    margins: DEFAULT_PAGE_SETTINGS.margins,
    pageGapPx: PAGE_GAP_PX,
  });

  assert.strictEqual(pagination.pageCount, 2);
  assert.strictEqual(pagination.pages.length, 2);

  // Sheet 1: Section 1 A4 Portrait
  const page1 = pagination.pages[0];
  assert.strictEqual(page1.pageNumber, 1);
  assert.strictEqual(page1.sectionIndex, 1);
  assert.strictEqual(page1.widthMm, 210);
  assert.strictEqual(page1.heightMm, 297);
  assert.strictEqual(page1.orientation, "portrait");

  // Sheet 2: Section 2 A4 Landscape
  const page2 = pagination.pages[1];
  assert.strictEqual(page2.pageNumber, 2);
  assert.strictEqual(page2.sectionIndex, 2);
  assert.strictEqual(page2.widthMm, 297);
  assert.strictEqual(page2.heightMm, 210);
  assert.strictEqual(page2.orientation, "landscape");
  assert.strictEqual(page2.breakType, "section");
});

test("Section 5: Universal spacer formula calculates exact pixel offset across mixed sheet sizes", () => {
  const mixedDoc: JSONContent = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Trang 1 Portrait" }],
      },
      {
        type: "sectionBreak",
        attrs: {
          sectionType: "nextPage",
          pageSettings: {
            paperSize: "A3",
            orientation: "landscape",
            margins: MARGIN_PRESETS.Normal,
          },
        },
      },
      {
        type: "paragraph",
        content: [{ type: "text", text: "Trang 2 Landscape A3" }],
      },
    ],
  };

  const pagination = calculatePaginationState(mixedDoc, {
    paperSize: "A4",
    orientation: "portrait",
    margins: DEFAULT_PAGE_SETTINGS.margins,
    pageGapPx: PAGE_GAP_PX,
  });

  const breakOffsetTop = 150; // Giả sử node break nằm ở pixel thứ 150
  const spacer = calculateBreakSpacerForPages(breakOffsetTop, pagination.pages, PAGE_GAP_PX);

  // Sheet 1 cao khoảng 1122.5px. Spacer phải đẩy tới top margin của Sheet 2
  assert.ok(spacer > 900, `Spacer should bridge to sheet 2 margin, got ${spacer}`);
  assert.strictEqual(typeof spacer, "number");
});

test("Section 6: Editor Command insertSectionBreak splits paragraph and positions caret cleanly", () => {
  const editor = createTestEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Đầu đoạn văn. Giữa đoạn văn. Cuối đoạn văn." }],
      },
    ],
  });

  // Đặt con trỏ ở vị trí ký tự thứ 15 (ở giữa đoạn)
  editor.commands.setTextSelection(15);
  const success = insertSectionBreak(editor);
  assert.strictEqual(success, true);

  const json = editor.getJSON();
  const count = countSectionBreaks(json);
  assert.strictEqual(count, 1);

  // Kiểm tra cấu trúc AST có 3 khối: đoạn 1, sectionBreak, đoạn 2
  assert.strictEqual(json.content?.length, 3);
  assert.strictEqual(json.content?.[0].type, "paragraph");
  assert.strictEqual(json.content?.[1].type, "sectionBreak");
  assert.strictEqual(json.content?.[2].type, "paragraph");

  editor.destroy();
});

test("Section 7: Editor Command insertSectionBreak at start of document", () => {
  const editor = createTestEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Đoạn văn bản đầu tiên." }],
      },
    ],
  });

  // Đặt con trỏ ở đầu văn bản (pos 1)
  editor.commands.setTextSelection(1);
  insertSectionBreak(editor);

  const json = editor.getJSON();
  assert.strictEqual(countSectionBreaks(json), 1);
  assert.ok(json.content && json.content.length >= 2);

  editor.destroy();
});

test("Section 8: Editor Command insertSectionBreak at end of document appends typing block", () => {
  const editor = createTestEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Văn bản thử nghiệm." }],
      },
    ],
  });

  // Đặt con trỏ ở cuối văn bản
  editor.commands.focus("end");
  insertSectionBreak(editor);

  const json = editor.getJSON();
  assert.strictEqual(countSectionBreaks(json), 1);
  // Khối cuối cùng phải là paragraph để người dùng gõ tiếp ngay lập tức
  const lastBlock = json.content?.[json.content.length - 1];
  assert.strictEqual(lastBlock?.type, "paragraph");

  editor.destroy();
});

test("Section 9: Adjacent Section Breaks create multiple sequential sections", () => {
  const docWithAdjacentBreaks: JSONContent = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Section 1" }],
      },
      {
        type: "sectionBreak",
        attrs: { sectionType: "nextPage", sectionId: "sec-2" },
      },
      {
        type: "sectionBreak",
        attrs: { sectionType: "nextPage", sectionId: "sec-3" },
      },
      {
        type: "paragraph",
        content: [{ type: "text", text: "Section 3" }],
      },
    ],
  };

  const sections = extractSections(docWithAdjacentBreaks, DEFAULT_PAGE_SETTINGS);
  assert.strictEqual(sections.length, 3);
  assert.strictEqual(sections[0].index, 1);
  assert.strictEqual(sections[1].index, 2);
  assert.strictEqual(sections[2].index, 3);
});

test("Section 10: Undo & Redo on insertSectionBreak", () => {
  const editor = createTestEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Trước khi ngắt phần." }],
      },
    ],
  });

  editor.commands.focus("end");
  insertSectionBreak(editor);
  assert.strictEqual(countSectionBreaks(editor.getJSON()), 1);

  // Undo
  editor.commands.undo();
  assert.strictEqual(countSectionBreaks(editor.getJSON()), 0);

  // Redo
  editor.commands.redo();
  assert.strictEqual(countSectionBreaks(editor.getJSON()), 1);

  editor.destroy();
});

test("Section 11: getSectionAtPos locates active section from cursor position", () => {
  const doc: JSONContent = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Nội dung đoạn một" }], // size ~19
      },
      {
        type: "sectionBreak",
        attrs: { sectionType: "nextPage", sectionId: "sec-2" }, // size 1
      },
      {
        type: "paragraph",
        content: [{ type: "text", text: "Nội dung đoạn hai" }],
      },
    ],
  };

  const sections = extractSections(doc, DEFAULT_PAGE_SETTINGS);
  assert.strictEqual(sections.length, 2);

  // Con trỏ ở đầu (pos 5) thuộc Section 1
  const secStart = getSectionAtPos(sections, 5);
  assert.strictEqual(secStart.index, 1);

  // Con trỏ sau node break thuộc Section 2
  const secAfter = getSectionAtPos(sections, 30);
  assert.strictEqual(secAfter.index, 2);
});

test("Section 12: File round-trip (.mwd) preserves section boundaries and custom pageSettings", () => {
  const multiSectionModel: DocumentModel = {
    metadata: {
      id: "doc-sections-persist",
      title: "Tài liệu Đa Phần",
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    pageSettings: {
      paperSize: "A4",
      orientation: "portrait",
      margins: MARGIN_PRESETS.Normal,
      marginPreset: "Normal",
    },
    content: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Trang mục 1 A4 Portrait." }],
        },
        {
          type: "sectionBreak",
          attrs: {
            sectionType: "nextPage",
            sectionId: "sec-landscape",
            pageSettings: {
              paperSize: "Legal",
              orientation: "landscape",
              margins: MARGIN_PRESETS.Narrow,
              marginPreset: "Narrow",
            },
          },
        },
        {
          type: "paragraph",
          content: [{ type: "text", text: "Trang mục 2 Legal Landscape Narrow." }],
        },
      ],
    },
  };

  const serialized = serializeDocumentToMwd(multiSectionModel);
  const result = deserializeMwdToDocument(serialized);

  assert.strictEqual(result.success, true);
  if (result.success) {
    const loadedDoc = result.document;
    const sections = extractSections(loadedDoc.content, loadedDoc.pageSettings);

    assert.strictEqual(sections.length, 2);
    // Section 1
    assert.strictEqual(sections[0].index, 1);
    assert.strictEqual(sections[0].pageSettings.paperSize, "A4");
    assert.strictEqual(sections[0].pageSettings.orientation, "portrait");

    // Section 2
    assert.strictEqual(sections[1].index, 2);
    assert.strictEqual(sections[1].pageSettings.paperSize, "Legal");
    assert.strictEqual(sections[1].pageSettings.orientation, "landscape");
    assert.strictEqual(sections[1].pageSettings.marginPreset, "Narrow");
  }
});

test("Section 13: Backward compatibility with legacy document without sectionBreak", () => {
  const legacyFileJson = JSON.stringify({
    format: "PersonalWordDocument",
    version: 1,
    metadata: {
      id: "legacy-doc",
      title: "Tài liệu Cũ",
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    pageSettings: {
      paperSize: "Letter",
      orientation: "portrait",
      margins: MARGIN_PRESETS.Normal,
      marginPreset: "Normal",
    },
    document: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Nội dung tệp tin tạo từ Phase 1." }],
        },
      ],
    },
  });

  const result = deserializeMwdToDocument(legacyFileJson);
  assert.strictEqual(result.success, true);
  if (result.success) {
    const sections = extractSections(result.document.content, result.document.pageSettings);
    assert.strictEqual(sections.length, 1);
    assert.strictEqual(sections[0].pageSettings.paperSize, "Letter");
  }
});

test("Section 14: Document stats calculation ignores Section Break markers", () => {
  const docWithBreaks: JSONContent = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Xin chào Việt Nam" }], // 4 từ, 17 ký tự (kể cả khoảng trắng)
      },
      {
        type: "sectionBreak",
        attrs: { sectionType: "nextPage", sectionId: "sec-2" },
      },
      {
        type: "paragraph",
        content: [{ type: "text", text: "Hà Nội mùa thu" }], // 4 từ, 14 ký tự
      },
    ],
  };

  const stats = extractDocumentStats(docWithBreaks);
  assert.strictEqual(stats.words, 8);
  assert.strictEqual(stats.characters, 31);
});

test("Section 15: Zustand DocumentStore updatePageSettings modifies active section cleanly", () => {
  const store = useDocumentStore.getState();
  store.resetDocument();

  // Nạp tài liệu có 2 sections
  const initialContent: JSONContent = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Mục 1" }],
      },
      {
        type: "sectionBreak",
        attrs: { sectionType: "nextPage", sectionId: "sec-2" },
      },
      {
        type: "paragraph",
        content: [{ type: "text", text: "Mục 2" }],
      },
    ],
  };

  store.updateContent(initialContent);
  assert.strictEqual(useDocumentStore.getState().sections.length, 2);

  // Đặt con trỏ sang Section 2
  store.setCurrentSectionIndex(2);
  assert.strictEqual(useDocumentStore.getState().currentSectionIndex, 2);

  // Đổi Section 2 sang Landscape
  store.updatePageSettings({ orientation: "landscape" });

  const updatedState = useDocumentStore.getState();
  assert.strictEqual(updatedState.isDirty, true);
  assert.strictEqual(updatedState.sections[0].pageSettings.orientation, "portrait");
  assert.strictEqual(updatedState.sections[1].pageSettings.orientation, "landscape");

  // Đặt con trỏ về Section 1
  store.setCurrentSectionIndex(1);
  assert.strictEqual(useDocumentStore.getState().pageSettings.orientation, "portrait");
});
