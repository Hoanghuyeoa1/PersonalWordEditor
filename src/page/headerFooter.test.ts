import test from "node:test";
import assert from "node:assert/strict";
import type { JSONContent } from "@tiptap/core";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { SectionBreak } from "./extensions/sectionBreakExtension.ts";
import { PageBreak } from "./extensions/pageBreakExtension.ts";
import {
  DEFAULT_HEADER_CONTENT,
  DEFAULT_FOOTER_CONTENT,
  DEFAULT_SECTION_HEADER_FOOTER,
  formatHeaderFooterText,
  hasPageNumberToken,
  type SectionHeaderFooter,
} from "./types/headerFooterTypes.ts";
import {
  extractSections,
  getEffectiveHeaderFooter,
  updateSectionHeaderFooterInAst,
} from "./services/sectionService.ts";
import {
  serializeDocumentToMwd,
  deserializeMwdToDocument,
} from "../document/documentFile.ts";
import { DEFAULT_PAGE_SETTINGS } from "./services/pageConstants.ts";
import type { DocumentModel } from "../document/documentTypes.ts";
import {
  insertSectionBreak,
  updateSectionHeaderFooter as updateSectionHFCmd,
} from "../editor/editorCommands.ts";
import { useDocumentStore } from "../stores/documentStore.ts";

function createTestEditor(initialContent?: JSONContent): Editor {
  return new Editor({
    extensions: [StarterKit, PageBreak, SectionBreak],
    content: initialContent || {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Nội dung tài liệu thử nghiệm" }],
        },
      ],
    },
  });
}

test("Phase 2.8 - Header/Footer Type Defaults: default configuration has empty text and center alignment", () => {
  assert.equal(DEFAULT_HEADER_CONTENT.text, "");
  assert.equal(DEFAULT_HEADER_CONTENT.alignment, "center");
  assert.equal(DEFAULT_FOOTER_CONTENT.text, "");
  assert.equal(DEFAULT_FOOTER_CONTENT.alignment, "center");
  assert.equal(DEFAULT_SECTION_HEADER_FOOTER.linkToPrevious, false);
});

test("Phase 2.8 - Page Number Tokens: formatHeaderFooterText dynamically replaces {PAGE} and {NUMPAGES}", () => {
  const template = "Trang {PAGE} / {NUMPAGES}";
  assert.equal(formatHeaderFooterText(template, 1, 1), "Trang 1 / 1");
  assert.equal(formatHeaderFooterText(template, 3, 10), "Trang 3 / 10");

  // Case-insensitivity ({page}, {numpages})
  const lowerTemplate = "Page {page} of {numpages}";
  assert.equal(formatHeaderFooterText(lowerTemplate, 2, 5), "Page 2 of 5");

  // Custom static text with token
  const prefixTemplate = "Báo cáo nội bộ - {PAGE}";
  assert.equal(formatHeaderFooterText(prefixTemplate, 4, 8), "Báo cáo nội bộ - 4");

  // Empty string template
  assert.equal(formatHeaderFooterText("", 1, 1), "");
});

test("Phase 2.8 - Page Number Tokens: hasPageNumberToken detects {PAGE} presence", () => {
  assert.equal(hasPageNumberToken("{PAGE}"), true);
  assert.equal(hasPageNumberToken("Trang {PAGE} / {NUMPAGES}"), true);
  assert.equal(hasPageNumberToken("Trang {page}"), true);
  assert.equal(hasPageNumberToken("Chỉ có tiêu đề thường"), false);
  assert.equal(hasPageNumberToken(""), false);
});

test("Phase 2.8 - Section Model: extractSections parses headerFooter for Section 1 and Section 2", () => {
  const content: JSONContent = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Đoạn văn thuộc Section 1" }],
      },
      {
        type: "sectionBreak",
        attrs: {
          sectionId: "sec-2",
          headerFooter: {
            linkToPrevious: false,
            header: { text: "Header riêng mục 2", alignment: "right", bold: true },
            footer: { text: "{PAGE}", alignment: "center" },
          },
        },
      },
      {
        type: "paragraph",
        content: [{ type: "text", text: "Đoạn văn thuộc Section 2" }],
      },
    ],
  };

  const defaultHF: SectionHeaderFooter = {
    linkToPrevious: false,
    header: { text: "Header mặc định mục 1", alignment: "left" },
    footer: { text: "Footer mục 1 - {PAGE}", alignment: "center" },
  };

  const sections = extractSections(content, DEFAULT_PAGE_SETTINGS, defaultHF);
  assert.equal(sections.length, 2);

  // Section 1
  assert.equal(sections[0].headerFooter?.header.text, "Header mặc định mục 1");
  assert.equal(sections[0].headerFooter?.header.alignment, "left");

  // Section 2
  assert.equal(sections[1].headerFooter?.linkToPrevious, false);
  assert.equal(sections[1].headerFooter?.header.text, "Header riêng mục 2");
  assert.equal(sections[1].headerFooter?.header.alignment, "right");
  assert.equal(sections[1].headerFooter?.header.bold, true);
});

test("Phase 2.8 - Inheritance: Section 2 inherits header/footer from Section 1 by default when linkToPrevious is true", () => {
  const content: JSONContent = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Nội dung phần 1" }],
      },
      {
        type: "sectionBreak",
        attrs: {
          sectionId: "sec-2",
          // Không truyền headerFooter -> mặc định linkToPrevious = true
        },
      },
      {
        type: "paragraph",
        content: [{ type: "text", text: "Nội dung phần 2" }],
      },
    ],
  };

  const defaultHF: SectionHeaderFooter = {
    linkToPrevious: false,
    header: { text: "Tiêu đề chung công ty", alignment: "center" },
    footer: { text: "{PAGE}", alignment: "right" },
  };

  const sections = extractSections(content, DEFAULT_PAGE_SETTINGS, defaultHF);
  assert.equal(sections.length, 2);
  assert.equal(sections[1].headerFooter?.linkToPrevious, true);

  // getEffectiveHeaderFooter for Section 2 resolves to Section 1's values
  const effectiveSec2 = getEffectiveHeaderFooter(sections, 2);
  assert.equal(effectiveSec2.header.text, "Tiêu đề chung công ty");
  assert.equal(effectiveSec2.footer.text, "{PAGE}");
  assert.equal(effectiveSec2.footer.alignment, "right");
  assert.equal(effectiveSec2.linkToPrevious, true);
});

test("Phase 2.8 - Unlink Section: Section 2 resolves to its own header/footer when linkToPrevious is false", () => {
  const content: JSONContent = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Nội dung phần 1" }],
      },
      {
        type: "sectionBreak",
        attrs: {
          sectionId: "sec-2",
          headerFooter: {
            linkToPrevious: false,
            header: { text: "Phụ lục A - Thống kê", alignment: "left" },
            footer: { text: "Trang phụ lục {PAGE}", alignment: "left" },
          },
        },
      },
      {
        type: "paragraph",
        content: [{ type: "text", text: "Nội dung phụ lục" }],
      },
    ],
  };

  const defaultHF: SectionHeaderFooter = {
    linkToPrevious: false,
    header: { text: "Báo cáo chính", alignment: "center" },
    footer: { text: "{PAGE}", alignment: "center" },
  };

  const sections = extractSections(content, DEFAULT_PAGE_SETTINGS, defaultHF);
  const effectiveSec2 = getEffectiveHeaderFooter(sections, 2);

  assert.equal(effectiveSec2.header.text, "Phụ lục A - Thống kê");
  assert.equal(effectiveSec2.footer.text, "Trang phụ lục {PAGE}");
  assert.equal(effectiveSec2.linkToPrevious, false);

  // Section 1 remains untouched
  const effectiveSec1 = getEffectiveHeaderFooter(sections, 1);
  assert.equal(effectiveSec1.header.text, "Báo cáo chính");
  assert.equal(effectiveSec1.linkToPrevious, false);
});

test("Phase 2.8 - AST Update: updateSectionHeaderFooterInAst updates Section 1 and Section 2 correctly", () => {
  const content: JSONContent = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Nội dung phần 1" }],
      },
      {
        type: "sectionBreak",
        attrs: {
          sectionId: "sec-2",
        },
      },
      {
        type: "paragraph",
        content: [{ type: "text", text: "Nội dung phần 2" }],
      },
    ],
  };

  // 1. Cập nhật Section 1
  const sec1Update = updateSectionHeaderFooterInAst(
    content,
    1,
    {
      header: { text: "Header cập nhật phần 1", alignment: "right" },
    },
    DEFAULT_SECTION_HEADER_FOOTER
  );

  assert.equal(
    sec1Update.updatedDefaultHeaderFooter.header.text,
    "Header cập nhật phần 1"
  );
  assert.equal(
    sec1Update.updatedDefaultHeaderFooter.header.alignment,
    "right"
  );

  // 2. Cập nhật Section 2
  const sec2Update = updateSectionHeaderFooterInAst(
    content,
    2,
    {
      linkToPrevious: false,
      footer: { text: "Footer tùy chỉnh phần 2", alignment: "left" },
    },
    sec1Update.updatedDefaultHeaderFooter
  );

  const sectionBreakNode = sec2Update.updatedContent.content?.find(
    (n) => n.type === "sectionBreak"
  );
  assert.ok(sectionBreakNode);
  const hfAttrs = sectionBreakNode.attrs?.headerFooter as SectionHeaderFooter;
  assert.equal(hfAttrs.linkToPrevious, false);
  assert.equal(hfAttrs.footer.text, "Footer tùy chỉnh phần 2");
  assert.equal(hfAttrs.footer.alignment, "left");
});

test("Phase 2.8 - Editor Command: updateSectionHeaderFooter command updates ProseMirror node attributes", () => {
  const editor = createTestEditor();
  insertSectionBreak(editor, {
    pageSettings: DEFAULT_PAGE_SETTINGS,
  });

  const success = updateSectionHFCmd(editor, 2, {
    linkToPrevious: false,
    header: { text: "Header qua Editor Command", alignment: "center", bold: true },
  });
  assert.equal(success, true);

  const json = editor.getJSON();
  const sectionBreakNode = json.content?.find((n) => n.type === "sectionBreak");
  assert.ok(sectionBreakNode);
  const hf = sectionBreakNode.attrs?.headerFooter as SectionHeaderFooter;
  assert.equal(hf.linkToPrevious, false);
  assert.equal(hf.header.text, "Header qua Editor Command");
  assert.equal(hf.header.bold, true);
  editor.destroy();
});

test("Phase 2.8 - Persistence (.mwd): serializeDocumentToMwd and deserializeMwdToDocument preserves Header, Footer, and Page Numbers", () => {
  const doc: DocumentModel = {
    id: "doc-hf-123",
    metadata: {
      id: "doc-hf-123",
      title: "Tài liệu kiểm tra Header Footer",
      version: 1,
      author: "Antigravity",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      tags: ["header", "footer"],
    },
    content: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Thân bài trang 1" }],
        },
        {
          type: "sectionBreak",
          attrs: {
            sectionId: "sec-2",
            headerFooter: {
              linkToPrevious: false,
              header: { text: "Phần 2 - Khảo sát", alignment: "left", italic: true },
              footer: { text: "{PAGE} / {NUMPAGES}", alignment: "right" },
            },
          },
        },
        {
          type: "paragraph",
          content: [{ type: "text", text: "Thân bài trang 2" }],
        },
      ],
    },
    pageSettings: DEFAULT_PAGE_SETTINGS,
    headerFooter: {
      linkToPrevious: false,
      header: { text: "Tiêu đề trang đầu", alignment: "center", bold: true },
      footer: { text: "Trang {PAGE}", alignment: "center" },
    },
  };

  const serialized = serializeDocumentToMwd(doc);
  assert.ok(serialized.includes("headerFooter"));

  const deserialized = deserializeMwdToDocument(serialized);
  assert.equal(deserialized.success, true);
  if (!deserialized.success) return;

  assert.equal(deserialized.document.headerFooter?.header.text, "Tiêu đề trang đầu");
  assert.equal(deserialized.document.headerFooter?.header.alignment, "center");
  assert.equal(deserialized.document.headerFooter?.header.bold, true);
  assert.equal(deserialized.document.headerFooter?.footer.text, "Trang {PAGE}");

  // Check section 2 headerFooter in AST
  const sec2Break = deserialized.document.content.content?.find((n) => n.type === "sectionBreak");
  assert.ok(sec2Break);
  const sec2Hf = sec2Break.attrs?.headerFooter as SectionHeaderFooter;
  assert.equal(sec2Hf.linkToPrevious, false);
  assert.equal(sec2Hf.header.text, "Phần 2 - Khảo sát");
  assert.equal(sec2Hf.header.italic, true);
  assert.equal(sec2Hf.footer.text, "{PAGE} / {NUMPAGES}");
  assert.equal(sec2Hf.footer.alignment, "right");
});

test("Phase 2.8 - Backward Compatibility: legacy .mwd file without headerFooter loads with valid default headerFooter", () => {
  const legacyDoc: DocumentModel = {
    id: "legacy-doc",
    metadata: {
      id: "legacy-doc",
      title: "Legacy Phase 1 Doc",
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    content: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Tài liệu phiên bản cũ không có headerFooter." }],
        },
      ],
    },
    pageSettings: DEFAULT_PAGE_SETTINGS,
  };

  const serialized = serializeDocumentToMwd(legacyDoc);
  const deserialized = deserializeMwdToDocument(serialized);
  assert.equal(deserialized.success, true);
  if (!deserialized.success) return;

  assert.ok(deserialized.document.headerFooter);
  assert.equal(deserialized.document.headerFooter.header.text, "");
  assert.equal(deserialized.document.headerFooter.footer.text, "");
  assert.equal(deserialized.document.headerFooter.linkToPrevious, false);
});

test("Phase 2.8 - Store Operations: updateSectionHeader, updateSectionFooter, and insertPageNumber mark dirty state", () => {
  useDocumentStore.getState().resetDocument();

  // Ban đầu isDirty = false
  assert.equal(useDocumentStore.getState().isDirty, false);

  // 1. Cập nhật header cho Section 1
  useDocumentStore.getState().updateSectionHeader(1, {
    text: "Header Mới",
    alignment: "left",
  });
  assert.equal(useDocumentStore.getState().isDirty, true);
  assert.equal(useDocumentStore.getState().headerFooter.header.text, "Header Mới");
  assert.equal(useDocumentStore.getState().headerFooter.header.alignment, "left");

  // 2. Chèn số trang vào Footer
  useDocumentStore.getState().insertPageNumber(1, "footer", "right");
  assert.equal(useDocumentStore.getState().headerFooter.footer.text, "{PAGE}");
  assert.equal(useDocumentStore.getState().headerFooter.footer.alignment, "right");

  // 3. Không trùng lặp token {PAGE} khi chèn lại
  useDocumentStore.getState().insertPageNumber(1, "footer", "right");
  assert.equal(useDocumentStore.getState().headerFooter.footer.text, "{PAGE}");

  // 4. Xóa số trang (xóa footer)
  useDocumentStore.getState().updateSectionFooter(1, { text: "" });
  assert.equal(useDocumentStore.getState().headerFooter.footer.text, "");
});
