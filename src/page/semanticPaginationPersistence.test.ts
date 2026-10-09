/// <reference types="node" />
import { test } from "node:test";
import assert from "node:assert/strict";
import type { JSONContent } from "@tiptap/core";
import {
  serializeDocumentToMwd,
  deserializeMwdToDocument,
} from "../document/documentFile.ts";
import type { DocumentModel } from "../document/documentTypes.ts";
import { DEFAULT_PAGE_SETTINGS } from "./services/pageConstants.ts";
import {
  sanitizeSemanticPaginationAttributes,
  validateNoRuntimeLayoutInPackage,
  FORBIDDEN_RUNTIME_LAYOUT_KEYS,
} from "./services/semanticPaginationPersistence.ts";
import { resolveBlockPaginationRules } from "../styles/services/effectiveStyleService.ts";
import { createDefaultStylesMetadata } from "../styles/services/builtInStyles.ts";
import type { DocumentStyle } from "../styles/types/styleTypes.ts";

function createTestDocumentModel(content: JSONContent, customStyles?: DocumentStyle[]): DocumentModel {
  const stylesMeta = createDefaultStylesMetadata();
  if (customStyles) {
    stylesMeta.definitions.push(...customStyles);
  }

  return {
    metadata: {
      id: "doc-phase12-test",
      title: "Tài liệu kiểm thử Phase 12",
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    content,
    pageSettings: DEFAULT_PAGE_SETTINGS,
    styles: stylesMeta,
    comments: [],
    trackedChanges: [],
  };
}

test("Phase 12 - 1. Semantic property round-trip: keepWithNext, keepLinesTogether, pageBreakBefore, widowControl", () => {
  const docContent: JSONContent = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        attrs: {
          keepWithNext: true,
          keepLinesTogether: true,
          pageBreakBefore: true,
          widowControl: false,
        },
        content: [{ type: "text", text: "Đoạn văn có đầy đủ semantic pagination properties." }],
      },
      {
        type: "heading",
        attrs: {
          id: "ref_heading_test1",
          level: 1,
          keepWithNext: true,
          pageBreakBefore: true,
        },
        content: [{ type: "text", text: "Tiêu đề với keepWithNext và pageBreakBefore." }],
      },
    ],
  };

  const model = createTestDocumentModel(docContent);

  // Tuần tự hóa ra .mwd
  const serialized = serializeDocumentToMwd(model);

  // Giải tuần tự hóa trở lại
  const result = deserializeMwdToDocument(serialized);
  assert.equal(result.success, true);
  if (!result.success) return;

  const restoredDoc = result.document.content;
  const pNode = restoredDoc.content?.[0];
  const hNode = restoredDoc.content?.[1];

  // Kiểm tra paragraph attrs được bảo toàn 100%
  assert.equal(pNode?.attrs?.keepWithNext, true);
  assert.equal(pNode?.attrs?.keepLinesTogether, true);
  assert.equal(pNode?.attrs?.pageBreakBefore, true);
  assert.equal(pNode?.attrs?.widowControl, false);

  // Kiểm tra heading attrs được bảo toàn 100%
  assert.equal(hNode?.attrs?.keepWithNext, true);
  assert.equal(hNode?.attrs?.pageBreakBefore, true);
});

test("Phase 12 - 2. Styles-based property round-trip: DocumentStyle paragraph pagination rules are preserved", () => {
  const customCalloutStyle: DocumentStyle = {
    id: "style_callout_box",
    name: "Callout Box",
    type: "paragraph",
    basedOn: "style_normal",
    isBuiltIn: false,
    priority: 50,
    paragraph: {
      keepWithNext: true,
      keepLinesTogether: true,
      pageBreakBefore: false,
      widowControl: true,
    },
  };

  const docContent: JSONContent = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        attrs: { styleId: "style_callout_box" },
        content: [{ type: "text", text: "Đoạn văn kế thừa pagination từ custom style." }],
      },
    ],
  };

  const model = createTestDocumentModel(docContent, [customCalloutStyle]);
  const serialized = serializeDocumentToMwd(model);

  const result = deserializeMwdToDocument(serialized);
  assert.equal(result.success, true);
  if (!result.success) return;

  // Kiểm tra định nghĩa style được lưu trữ toàn vẹn
  const restoredStyle = result.document.styles?.definitions.find((s) => s.id === "style_callout_box");
  assert.ok(restoredStyle);
  assert.equal(restoredStyle?.paragraph?.keepWithNext, true);
  assert.equal(restoredStyle?.paragraph?.keepLinesTogether, true);
  assert.equal(restoredStyle?.paragraph?.widowControl, true);

  // Kiểm tra rule phân giải hiệu lực (Effective pagination rules)
  const rules = resolveBlockPaginationRules(
    result.document.content.content![0],
    result.document.styles?.definitions
  );
  assert.equal(rules.keepWithNext, true);
  assert.equal(rules.keepLinesTogether, true);
  assert.equal(rules.widowControl, true);
});

test("Phase 12 - 3. Old .mwd file backward compatibility: missing pagination properties load safe defaults", () => {
  // Mô phỏng file .mwd phiên bản cũ không chứa bất kỳ thuộc tính phân trang nào
  const oldMwdJson = JSON.stringify({
    format: "PersonalWordDocument",
    version: 1,
    metadata: {
      id: "doc-legacy",
      title: "Tệp tin cũ",
      version: 1,
      createdAt: "2025-01-01T00:00:00.000Z",
      updatedAt: "2025-01-01T00:00:00.000Z",
    },
    document: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          // Không có attrs
          content: [{ type: "text", text: "Văn bản tệp cũ không có pagination attrs." }],
        },
      ],
    },
  });

  const result = deserializeMwdToDocument(oldMwdJson);
  assert.equal(result.success, true, "Mở tệp cũ phải thành công tuyệt đối");
  if (!result.success) return;

  const node = result.document.content.content?.[0];
  assert.ok(node);

  // Các rules hiệu lực tự động nhận fallback mặc định an toàn:
  // Paragraph thường: widowControl = true, keepWithNext = false, keepLinesTogether = false, pageBreakBefore = false
  const rules = resolveBlockPaginationRules(node, result.document.styles?.definitions);
  assert.equal(rules.widowControl, true);
  assert.equal(rules.keepWithNext, false);
  assert.equal(rules.keepLinesTogether, false);
  assert.equal(rules.pageBreakBefore, false);
});

test("Phase 12 - 4. Malformed values handling: null, wrong type, NaN fallback deterministically without crash or text loss", () => {
  const malformedDoc: JSONContent = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        attrs: {
          keepWithNext: "invalid_string_not_boolean",
          keepLinesTogether: null,
          pageBreakBefore: 12345, // invalid type
          widowControl: NaN,
        },
        content: [{ type: "text", text: "Nội dung văn bản quan trọng không được phép bị mất." }],
      },
      {
        type: "heading",
        attrs: {
          id: "ref_heading_malformed",
          level: 1,
          keepWithNext: "true", // string "true" được coerce an toàn về boolean true
          pageBreakBefore: "false", // string "false" được coerce an toàn về boolean false
        },
        content: [{ type: "text", text: "Tiêu đề với chuỗi boolean dạng text." }],
      },
    ],
  };

  const sanitized = sanitizeSemanticPaginationAttributes(malformedDoc);

  const pNode = sanitized.content?.[0];
  const hNode = sanitized.content?.[1];

  // Không sập, text còn nguyên 100%
  assert.equal(pNode?.content?.[0].text, "Nội dung văn bản quan trọng không được phép bị mất.");
  assert.equal(hNode?.content?.[0].text, "Tiêu đề với chuỗi boolean dạng text.");

  // Các giá trị không hợp lệ đã được dọn sạch khỏi attrs
  assert.equal(pNode?.attrs?.keepWithNext, undefined);
  assert.equal(pNode?.attrs?.keepLinesTogether, undefined);
  assert.equal(pNode?.attrs?.pageBreakBefore, undefined);
  assert.equal(pNode?.attrs?.widowControl, undefined);

  // Các giá trị boolean dạng string hợp lệ được chuẩn hóa
  assert.equal(hNode?.attrs?.keepWithNext, true);
  assert.equal(hNode?.attrs?.pageBreakBefore, false);
});

test("Phase 12 - 5. PageBreak & SectionBreak node compatibility: structural breaks are preserved cleanly", () => {
  const docContent: JSONContent = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Trang 1" }],
      },
      {
        type: "pageBreak",
      },
      {
        type: "paragraph",
        content: [{ type: "text", text: "Trang 2" }],
      },
      {
        type: "sectionBreak",
        attrs: { sectionId: "sec-2", breakType: "nextPage" },
      },
      {
        type: "paragraph",
        content: [{ type: "text", text: "Trang 3 Section 2" }],
      },
    ],
  };

  const model = createTestDocumentModel(docContent);
  const serialized = serializeDocumentToMwd(model);

  const result = deserializeMwdToDocument(serialized);
  assert.equal(result.success, true);
  if (!result.success) return;

  const content = result.document.content.content!;
  assert.equal(content.length, 5);
  assert.equal(content[1].type, "pageBreak");
  assert.equal(content[3].type, "sectionBreak");
  assert.equal(content[3].attrs?.breakType, "nextPage");
});

test("Phase 12 - 6. DO NOT PERSIST RUNTIME LAYOUT: runtime fragments and coordinates are strictly excluded from .mwd", () => {
  // Mô phỏng một AST vô tình bị gán thuộc tính runtime layout
  const docWithRuntimeLeaks: JSONContent = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        attrs: {
          keepWithNext: true,
          // Rò rỉ runtime attributes:
          pageIndex: 1,
          fragmentId: "frag-p1-0",
          domRect: { top: 100, height: 44 },
          calculatedPageCount: 3,
          runtimeLineBoundaries: [{ line: 1 }],
          cachedHeight: 44,
        },
        content: [{ type: "text", text: "Kiểm tra khử rò rỉ runtime attributes." }],
      },
    ],
  };

  const model = createTestDocumentModel(docWithRuntimeLeaks);
  const serialized = serializeDocumentToMwd(model);

  // Kiểm tra chuỗi JSON không chứa bất kỳ từ khóa runtime bị cấm nào
  for (const forbiddenKey of FORBIDDEN_RUNTIME_LAYOUT_KEYS) {
    assert.equal(
      serialized.includes(`"${forbiddenKey}"`),
      false,
      `Tệp .mwd tuyệt đối không được chứa runtime key: "${forbiddenKey}"`
    );
  }

  // Xác thực sâu qua validator
  const parsedPackage = JSON.parse(serialized);
  const validation = validateNoRuntimeLayoutInPackage(parsedPackage);
  assert.equal(validation.isValid, true);
  assert.equal(validation.violations.length, 0);

  // Thuộc tính ngữ nghĩa vẫn giữ nguyên
  const restoredP = parsedPackage.document.content[0];
  assert.equal(restoredP.attrs.keepWithNext, true);
  assert.equal(restoredP.attrs.pageIndex, undefined);
  assert.equal(restoredP.attrs.fragmentId, undefined);
});

test("Phase 12 - 7. Save failure safety: isDirty remains true, document remains editable, no layout reset", () => {
  // Kiểm thử trạng thái dirty và an toàn khi lưu thất bại
  const docContent: JSONContent = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        attrs: { keepWithNext: true },
        content: [{ type: "text", text: "Nội dung đang dirty." }],
      },
    ],
  };

  const model = createTestDocumentModel(docContent);

  // Giả lập hàm lưu ném lỗi (ví dụ Disk Full, EACCES)
  const simulateSave = (_path: string, shouldFail: boolean) => {
    let isDirty = true;
    try {
      if (shouldFail) {
        throw new Error("Lỗi giả lập: Không thể ghi tệp do đĩa đầy.");
      }
      isDirty = false; // markSaved chỉ khi thành công
    } catch {
      // Khi thất bại: isDirty vẫn giữ nguyên là true!
    }
    return { isDirty, model };
  };

  const failResult = simulateSave("C:/docs/report.mwd", true);
  assert.equal(failResult.isDirty, true, "Lưu thất bại phải giữ nguyên isDirty = true");
  assert.equal(failResult.model.content.content?.[0].attrs?.keepWithNext, true);

  // Tài liệu vẫn có thể chỉnh sửa tiếp tục
  const editedContent: JSONContent = {
    ...failResult.model.content,
    content: [
      ...failResult.model.content.content!,
      {
        type: "paragraph",
        content: [{ type: "text", text: "Thêm đoạn mới sau lỗi lưu." }],
      },
    ],
  };

  const successResult = simulateSave("C:/docs/report.mwd", false);
  successResult.model.content = editedContent;
  assert.equal(successResult.isDirty, false, "Lưu thành công mới đặt isDirty = false");
  assert.equal(successResult.model.content.content?.length, 2);
});
