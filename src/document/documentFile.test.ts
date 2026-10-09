import test from "node:test";
import assert from "node:assert/strict";
import {
  serializeDocumentToMwd,
  deserializeMwdToDocument,
  MWD_FORMAT_IDENTIFIER,
  MWD_CURRENT_FORMAT_VERSION,
} from "./documentFile.ts";
import type { DocumentModel } from "./documentTypes.ts";

test("Document File System: serializes document to versioned .mwd package", () => {
  const doc: DocumentModel = {
    metadata: {
      id: "doc-123",
      title: "Tài liệu mẫu",
      version: 1,
      createdAt: "2026-03-30T10:00:00.000Z",
      updatedAt: "2026-03-30T10:00:00.000Z",
    },
    content: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Nội dung kiểm tra lưu file." }],
        },
      ],
    },
  };

  const mwdString = serializeDocumentToMwd(doc);
  assert.ok(typeof mwdString === "string");

  const parsed = JSON.parse(mwdString);
  assert.equal(parsed.format, MWD_FORMAT_IDENTIFIER);
  assert.equal(parsed.version, MWD_CURRENT_FORMAT_VERSION);
  assert.equal(parsed.metadata.id, "doc-123");
  assert.equal(parsed.metadata.title, "Tài liệu mẫu");
  assert.equal(parsed.document.type, "doc");
  assert.equal(parsed.document.content[0].content[0].text, "Nội dung kiểm tra lưu file.");
});

test("Document File System: round-trip preserves all formatting (text, marks, font, size, color, headings, align, lists, line spacing)", () => {
  const fullFeaturedDoc: DocumentModel = {
    metadata: {
      id: "doc-full-test",
      title: "Tài liệu toàn diện",
      version: 2,
      createdAt: "2026-03-30T00:00:00.000Z",
      updatedAt: "2026-03-30T00:00:00.000Z",
    },
    content: {
      type: "doc",
      content: [
        // Heading cấp 1 có căn giữa
        {
          type: "heading",
          attrs: { level: 1, textAlign: "center", lineSpacing: "1.5" },
          content: [{ type: "text", text: "Tiêu đề Báo Cáo Cấp 1" }],
        },
        // Đoạn văn có đầy đủ formatting ký tự: bold, italic, underline, strike, font, size, color, highlight
        {
          type: "paragraph",
          attrs: { textAlign: "justify", lineSpacing: "1.15", indent: 1 },
          content: [
            {
              type: "text",
              marks: [
                { type: "bold" },
                { type: "italic" },
                { type: "underline" },
                { type: "strike" },
                { type: "textStyle", attrs: { fontFamily: "Georgia, serif", fontSize: "16pt", color: "#dc2626" } },
                { type: "highlight", attrs: { color: "#fef08a" } },
              ],
              text: "Văn bản định dạng cao cấp",
            },
          ],
        },
        // Danh sách lồng cấp: Bullet list và Ordered list
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Mục danh sách cấp 1" }],
                },
                {
                  type: "orderedList",
                  content: [
                    {
                      type: "listItem",
                      content: [
                        {
                          type: "paragraph",
                          content: [{ type: "text", text: "Mục con đánh số cấp 2" }],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  };

  // Tuần tự hóa (Save)
  const savedMwdString = serializeDocumentToMwd(fullFeaturedDoc);

  // Giải tuần tự hóa (Open)
  const openResult = deserializeMwdToDocument(savedMwdString);
  assert.equal(openResult.success, true);

  if (!openResult.success) return;

  const loadedDoc = openResult.document;

  // Xác nhận metadata
  assert.equal(loadedDoc.metadata.id, "doc-full-test");
  assert.equal(loadedDoc.metadata.title, "Tài liệu toàn diện");

  // Xác nhận Heading 1
  const headingNode = loadedDoc.content.content?.[0];
  assert.equal(headingNode?.type, "heading");
  assert.equal(headingNode?.attrs?.level, 1);
  assert.equal(headingNode?.attrs?.textAlign, "center");
  assert.equal(headingNode?.attrs?.lineSpacing, "1.5");
  assert.equal(headingNode?.content?.[0]?.text, "Tiêu đề Báo Cáo Cấp 1");

  // Xác nhận Paragraph và marks
  const pNode = loadedDoc.content.content?.[1];
  assert.equal(pNode?.type, "paragraph");
  assert.equal(pNode?.attrs?.textAlign, "justify");
  assert.equal(pNode?.attrs?.lineSpacing, "1.15");
  assert.equal(pNode?.attrs?.indent, 1);

  const textNode = pNode?.content?.[0];
  assert.equal(textNode?.text, "Văn bản định dạng cao cấp");
  const marks = textNode?.marks || [];
  assert.ok(marks.some((m) => m.type === "bold"));
  assert.ok(marks.some((m) => m.type === "italic"));
  assert.ok(marks.some((m) => m.type === "underline"));
  assert.ok(marks.some((m) => m.type === "strike"));
  assert.ok(marks.some((m) => m.type === "textStyle" && m.attrs?.fontFamily === "Georgia, serif"));
  assert.ok(marks.some((m) => m.type === "textStyle" && m.attrs?.fontSize === "16pt"));
  assert.ok(marks.some((m) => m.type === "textStyle" && m.attrs?.color === "#dc2626"));
  assert.ok(marks.some((m) => m.type === "highlight" && m.attrs?.color === "#fef08a"));

  // Xác nhận cấu trúc danh sách lồng cấp
  const listNode = loadedDoc.content.content?.[2];
  assert.equal(listNode?.type, "bulletList");
  const topListItem = listNode?.content?.[0];
  assert.equal(topListItem?.type, "listItem");
  const subList = topListItem?.content?.[1];
  assert.equal(subList?.type, "orderedList");
  assert.equal(subList?.content?.[0]?.content?.[0]?.content?.[0]?.text, "Mục con đánh số cấp 2");
});

test("Document File System: error handling for corrupt and invalid files without crashing", () => {
  // 1. File rỗng
  let res = deserializeMwdToDocument("");
  assert.equal(res.success, false);
  assert.ok(res.error.includes("rỗng"));

  // 2. File JSON bị hỏng (corrupted syntax)
  res = deserializeMwdToDocument("{ broken json content: invalid... [");
  assert.equal(res.success, false);
  assert.ok(res.error.includes("hỏng") || res.error.includes("JSON"));

  // 3. Sai định dạng format identifier
  res = deserializeMwdToDocument(
    JSON.stringify({
      format: "UnknownFormat",
      version: 1,
      metadata: {},
      document: {},
    })
  );
  assert.equal(res.success, false);
  assert.ok(res.error.includes("không được hỗ trợ"));

  // 4. Phiên bản mới hơn không tương thích
  res = deserializeMwdToDocument(
    JSON.stringify({
      format: MWD_FORMAT_IDENTIFIER,
      version: 99,
      metadata: {},
      document: {},
    })
  );
  assert.equal(res.success, false);
  assert.ok(res.error.includes("mới hơn"));

  // 5. Thiếu metadata hợp lệ
  res = deserializeMwdToDocument(
    JSON.stringify({
      format: MWD_FORMAT_IDENTIFIER,
      version: 1,
      document: { type: "doc", content: [] },
    })
  );
  assert.equal(res.success, false);
  assert.ok(res.error.includes("metadata"));

  // 6. Thiếu document AST hợp lệ
  res = deserializeMwdToDocument(
    JSON.stringify({
      format: MWD_FORMAT_IDENTIFIER,
      version: 1,
      metadata: {
        id: "id",
        title: "title",
        version: 1,
        createdAt: "2026-01-01",
        updatedAt: "2026-01-01",
      },
      document: { type: "not_a_doc" },
    })
  );
  assert.equal(res.success, false);
  assert.ok(res.error.includes("AST ProseMirror"));
});
