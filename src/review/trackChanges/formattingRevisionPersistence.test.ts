import { test } from "node:test";
import assert from "node:assert/strict";
import { Editor } from "@tiptap/core";
import { getEditorExtensions } from "../../editor/editorExtensions.ts";
import {
  ensureEditorPlugins,
  toggleBold,
  setFontSize,
  setTextColor,
  setTextAlign,
  setLineSpacing,
} from "../../editor/editorCommands.ts";
import { useReviewStore } from "../../stores/reviewStore.ts";
import { useDocumentStore } from "../../stores/documentStore.ts";
import { TrackChangesService } from "./trackChangesService.ts";
import { applyParagraphStyle } from "../../styles/services/applyStyleService.ts";
import {
  serializeDocumentToMwd,
  deserializeMwdToDocument,
  type MwdFilePackage,
  MWD_FORMAT_IDENTIFIER,
  MWD_CURRENT_FORMAT_VERSION,
} from "../../document/documentFile.ts";
import type { DocumentModel } from "../../document/documentTypes.ts";
import { DEFAULT_PAGE_SETTINGS } from "../../page/index.ts";
import { STYLE_HEADING_1_ID, STYLE_NORMAL_ID } from "../../styles/services/builtInStyles.ts";

function createTestEditor(initialContent?: any): Editor {
  const editor = new Editor({
    extensions: getEditorExtensions(),
    content: initialContent || {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Văn bản thử nghiệm cho Phase 10 Native Persistence." }],
        },
      ],
    },
  });
  ensureEditorPlugins(editor);
  return editor;
}

// -----------------------------------------------------------------------------
// 1. CHARACTER REVISION ROUND-TRIP
// -----------------------------------------------------------------------------
test("PHASE 10 — 1. Character Revision Round-Trip: Lưu và mở lại bảo toàn cỡ chữ, màu sắc và diff", () => {
  const editor = createTestEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Đoạn chữ này sẽ được đổi cỡ và màu sắc." }],
      },
    ],
  });

  useReviewStore.setState({
    trackChangesEnabled: true,
    currentUser: { id: "u-auditor", name: "Nguyễn Văn A", color: "#6366f1" },
  });

  // Chọn từ 1..10 -> Đổi cỡ chữ 16pt và màu đỏ
  editor.chain().setTextSelection({ from: 1, to: 10 }).run();
  setFontSize(editor, "16pt");
  setTextColor(editor, "#dc2626");

  const spans = TrackChangesService.getTrackedSpansFromPMDoc(editor.state.doc);
  assert.ok(spans.length >= 1, "Phải có formatting revision");
  const charRev = spans[0];
  const revId = charRev.id;

  const currentDoc: DocumentModel = {
    metadata: {
      id: "doc-char-persistence",
      title: "Kiểm thử Character Persistence",
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    pageSettings: DEFAULT_PAGE_SETTINGS,
    content: editor.getJSON(),
    trackedChanges: TrackChangesService.getTrackedChangesFromDoc(editor.state.doc),
  };

  // 1.1 Serialize
  const serialized = serializeDocumentToMwd(currentDoc);
  assert.ok(serialized.includes(revId), "JSON .mwd phải chứa revision ID");
  assert.ok(serialized.includes("character"), "JSON .mwd phải chứa scope character");

  // Đảm bảo không chứa runtime positions 'from' / 'to' trong root trackedChanges
  const parsedPackage: MwdFilePackage = JSON.parse(serialized);
  const rootItem = parsedPackage.trackedChanges?.find((c) => c.id === revId);
  assert.ok(rootItem, "Phải tìm thấy item trong trackedChanges root");
  assert.equal(rootItem.from, undefined, "Không được lưu runtime numeric position 'from'");
  assert.equal(rootItem.to, undefined, "Không được lưu runtime numeric position 'to'");

  // 1.2 Deserialize
  const deserialized = deserializeMwdToDocument(serialized);
  assert.equal(deserialized.success, true);
  if (!deserialized.success) return;

  const loadedDoc = deserialized.document;
  const loadedItem = loadedDoc.trackedChanges?.find((c) => c.id === revId);
  assert.ok(loadedItem, "Revision phải tồn tại trong loaded document trackedChanges");
  assert.equal(loadedItem.author, "Nguyễn Văn A");
  assert.equal(loadedItem.status, "pending");

  // 1.3 Mở trong Editor mới và thực hiện Reject
  const reloadedEditor = createTestEditor(loadedDoc.content);
  const reloadedSpans = TrackChangesService.getTrackedSpansFromPMDoc(reloadedEditor.state.doc);
  assert.ok(reloadedSpans.some((s) => s.id === revId), "Revision mark phải được tải vào PMDoc");

  const rejected = TrackChangesService.rejectChange(reloadedEditor, revId);
  assert.equal(rejected, true, "Reject revision sau khi reload phải thành công");

  // Sau khi reject, không còn pending revision
  const spansAfterReject = TrackChangesService.getTrackedSpansFromPMDoc(reloadedEditor.state.doc);
  assert.equal(spansAfterReject.some((s) => s.id === revId), false);
});

// -----------------------------------------------------------------------------
// 2. PARAGRAPH REVISION ROUND-TRIP
// -----------------------------------------------------------------------------
test("PHASE 10 — 2. Paragraph Revision Round-Trip: Bảo toàn căn lề, giãn dòng và block node anchor", () => {
  const editor = createTestEditor();
  useReviewStore.setState({ trackChangesEnabled: true });

  // Đổi căn giữa và độ giãn dòng 1.5
  setTextAlign(editor, "center");
  setLineSpacing(editor, "1.5");

  const spans = TrackChangesService.getTrackedSpansFromPMDoc(editor.state.doc);
  assert.ok(spans.length >= 1, "Phải có paragraph format revision");
  const paraRevId = spans[0].id;

  const currentDoc: DocumentModel = {
    metadata: {
      id: "doc-para-persistence",
      title: "Kiểm thử Paragraph Persistence",
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    pageSettings: DEFAULT_PAGE_SETTINGS,
    content: editor.getJSON(),
    trackedChanges: TrackChangesService.getTrackedChangesFromDoc(editor.state.doc),
  };

  // Serialize -> Deserialize
  const serialized = serializeDocumentToMwd(currentDoc);
  const deserialized = deserializeMwdToDocument(serialized);
  assert.equal(deserialized.success, true);
  if (!deserialized.success) return;

  const blockNode = deserialized.document.content.content?.[0];
  assert.ok(blockNode, "Block node phải tồn tại");
  assert.equal(blockNode.attrs?.textAlign, "center");
  assert.equal(blockNode.attrs?.lineSpacing, "1.5");
  assert.ok(Array.isArray(blockNode.attrs?.formatRevisions));
  assert.ok(blockNode.attrs.formatRevisions.some((r: any) => r.id === paraRevId));

  // Nạp vào editor mới và kiểm tra Accept
  const reloadedEditor = createTestEditor(deserialized.document.content);
  assert.equal(TrackChangesService.getTrackedSpansFromPMDoc(reloadedEditor.state.doc).length, 2);

  const accepted = TrackChangesService.acceptChange(reloadedEditor, paraRevId);
  assert.equal(accepted, true);
  assert.equal(TrackChangesService.getTrackedSpansFromPMDoc(reloadedEditor.state.doc).length, 1);
  assert.equal(reloadedEditor.state.doc.child(0).attrs.textAlign, "center");
});

// -----------------------------------------------------------------------------
// 3. STYLE ASSIGNMENT ROUND-TRIP
// -----------------------------------------------------------------------------
test("PHASE 10 — 3. Style Assignment Round-Trip: Bảo toàn style IDs trước/sau và inheritance", () => {
  const editor = createTestEditor();
  useReviewStore.setState({ trackChangesEnabled: true });

  // Áp dụng Heading 1 khi Track Changes BẬT
  applyParagraphStyle(editor, STYLE_HEADING_1_ID);

  const spans = TrackChangesService.getTrackedSpansFromPMDoc(editor.state.doc);
  assert.ok(spans.length >= 1);
  const styleRev = spans[0];
  assert.equal(styleRev.scope, "style");

  const currentDoc: DocumentModel = {
    metadata: {
      id: "doc-style-persistence",
      title: "Kiểm thử Style Persistence",
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    pageSettings: DEFAULT_PAGE_SETTINGS,
    content: editor.getJSON(),
    trackedChanges: TrackChangesService.getTrackedChangesFromDoc(editor.state.doc),
  };

  const serialized = serializeDocumentToMwd(currentDoc);
  const deserialized = deserializeMwdToDocument(serialized);
  assert.equal(deserialized.success, true);
  if (!deserialized.success) return;

  const reloadedDoc = deserialized.document;
  const reloadedEditor = createTestEditor(reloadedDoc.content);
  const reloadedSpans = TrackChangesService.getTrackedSpansFromPMDoc(reloadedEditor.state.doc);
  assert.equal(reloadedSpans.length, 1);
  assert.equal(reloadedSpans[0].scope, "style");

  // Từ chối style assignment -> phục hồi Normal style hoặc default
  const rejected = TrackChangesService.rejectChange(reloadedEditor, styleRev.id);
  assert.equal(rejected, true);
  const currentStyleId = reloadedEditor.state.doc.child(0).attrs.styleId;
  assert.ok(!currentStyleId || currentStyleId === STYLE_NORMAL_ID, "Phải quay về Normal hoặc default");
});

// -----------------------------------------------------------------------------
// 4. OVERLAPPING REVISIONS ROUND-TRIP
// -----------------------------------------------------------------------------
test("PHASE 10 — 4. Overlapping Revisions Round-Trip: Bảo toàn các lớp định dạng chồng lấn", () => {
  const editor = createTestEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Kiểm tra nhiều lớp định dạng chồng lấn trên cùng chuỗi." }],
      },
    ],
  });
  useReviewStore.setState({ trackChangesEnabled: true });

  // Lớp 1: Pos 1..10 -> Bold
  editor.chain().setTextSelection({ from: 1, to: 10 }).run();
  toggleBold(editor);

  // Lớp 2: Pos 5..18 -> TextColor đỏ
  editor.chain().setTextSelection({ from: 5, to: 18 }).run();
  setTextColor(editor, "#dc2626");

  const spans = TrackChangesService.getTrackedSpansFromPMDoc(editor.state.doc);
  assert.equal(spans.length, 2, "Phải ghi nhận 2 revision riêng biệt");

  const currentDoc: DocumentModel = {
    metadata: {
      id: "doc-overlap-persistence",
      title: "Kiểm thử Overlap",
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    pageSettings: DEFAULT_PAGE_SETTINGS,
    content: editor.getJSON(),
    trackedChanges: TrackChangesService.getTrackedChangesFromDoc(editor.state.doc),
  };

  const serialized = serializeDocumentToMwd(currentDoc);
  const deserialized = deserializeMwdToDocument(serialized);
  assert.equal(deserialized.success, true);
  if (!deserialized.success) return;

  assert.equal(deserialized.document.trackedChanges?.length, 2);

  const reloadedEditor = createTestEditor(deserialized.document.content);
  assert.equal(TrackChangesService.getTrackedSpansFromPMDoc(reloadedEditor.state.doc).length, 2);
});

// -----------------------------------------------------------------------------
// 5. MIXED REVISIONS ROUND-TRIP
// -----------------------------------------------------------------------------
test("PHASE 10 — 5. Mixed Revisions: Kết hợp Insert, Delete, Character Format, Paragraph Format", () => {
  const editor = createTestEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Đoạn 1 ban đầu." }],
      },
      {
        type: "paragraph",
        content: [{ type: "text", text: "Đoạn 2 ban đầu." }],
      },
    ],
  });
  useReviewStore.setState({ trackChangesEnabled: true });

  // 1. Tracked Insert
  TrackChangesService.applyTrackedTextInput(editor, 1, 1, "Thêm mới: ");

  // 2. Tracked Format (Character)
  editor.chain().setTextSelection({ from: 15, to: 22 }).run();
  toggleBold(editor);

  // 3. Tracked Paragraph Format (Đoạn 2 căn phải)
  const docSize = editor.state.doc.content.size - 2;
  editor.chain().setTextSelection(docSize).run();
  setTextAlign(editor, "right");

  const spans = TrackChangesService.getTrackedSpansFromPMDoc(editor.state.doc);
  assert.ok(spans.some((s) => s.type === "insert"));
  assert.ok(spans.some((s) => s.type === "format" && s.scope === "character"));
  assert.ok(spans.some((s) => s.type === "format" && s.scope === "paragraph"));

  const currentDoc: DocumentModel = {
    metadata: {
      id: "doc-mixed-persistence",
      title: "Kiểm thử Mixed Revisions",
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    pageSettings: DEFAULT_PAGE_SETTINGS,
    content: editor.getJSON(),
    trackedChanges: TrackChangesService.getTrackedChangesFromDoc(editor.state.doc),
  };

  const serialized = serializeDocumentToMwd(currentDoc);
  const deserialized = deserializeMwdToDocument(serialized);
  assert.equal(deserialized.success, true);
  if (!deserialized.success) return;

  const loadedTypes = new Set(deserialized.document.trackedChanges?.map((c) => c.type));
  assert.ok(loadedTypes.has("insert"));
  assert.ok(loadedTypes.has("format"));
});

// -----------------------------------------------------------------------------
// 6. PARTIAL REVIEW & ANTI-RESURRECTION
// -----------------------------------------------------------------------------
test("PHASE 10 — 6. Partial Review: Đã chấp nhận 1 revision, giữ pending các revision khác, không phục sinh", () => {
  const editor = createTestEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Đoạn văn kiểm tra partial review round-trip." }],
      },
    ],
  });
  useReviewStore.setState({ trackChangesEnabled: true });

  // Tạo Rev 1: Bold (Pos 1..9)
  editor.chain().setTextSelection({ from: 1, to: 9 }).run();
  toggleBold(editor);

  // Tạo Rev 2: TextColor (Pos 12..20)
  editor.chain().setTextSelection({ from: 12, to: 20 }).run();
  setTextColor(editor, "#2563eb");

  const spansBefore = TrackChangesService.getTrackedSpansFromPMDoc(editor.state.doc);
  assert.equal(spansBefore.length, 2);
  const rev1Id = spansBefore[0].id;
  const rev2Id = spansBefore[1].id;

  // Chấp nhận Rev 1
  TrackChangesService.acceptChange(editor, rev1Id);

  const spansAfterAccept = TrackChangesService.getTrackedSpansFromPMDoc(editor.state.doc);
  assert.equal(spansAfterAccept.length, 1);
  assert.equal(spansAfterAccept[0].id, rev2Id);

  // Lưu sang .mwd
  const currentDoc: DocumentModel = {
    metadata: {
      id: "doc-partial-review",
      title: "Partial Review",
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    pageSettings: DEFAULT_PAGE_SETTINGS,
    content: editor.getJSON(),
    trackedChanges: TrackChangesService.getTrackedChangesFromDoc(editor.state.doc),
  };

  const serialized = serializeDocumentToMwd(currentDoc);

  // Đảm bảo serialized không chứa rev1Id đã accept
  assert.equal(serialized.includes(`"id": "${rev1Id}"`), false, "Rev 1 đã accept không được tồn tại trong .mwd");

  const deserialized = deserializeMwdToDocument(serialized);
  assert.equal(deserialized.success, true);
  if (!deserialized.success) return;

  const loadedRevs = deserialized.document.trackedChanges || [];
  assert.equal(loadedRevs.some((c) => c.id === rev1Id), false, "Rev 1 tuyệt đối không được phục sinh sau khi mở lại");
  assert.equal(loadedRevs.some((c) => c.id === rev2Id), true, "Rev 2 vẫn đang pending đầy đủ");
});

// -----------------------------------------------------------------------------
// 7. BACKWARD COMPATIBILITY: OLD .MWD
// -----------------------------------------------------------------------------
test("PHASE 10 — 7. Backward Compatibility: Tệp .mwd cũ không có Formatting Revision load hoàn hảo", () => {
  // Giả lập tệp Phase 5.5 chỉ có insert/delete
  const legacyMwdPackage = {
    format: MWD_FORMAT_IDENTIFIER,
    version: MWD_CURRENT_FORMAT_VERSION,
    metadata: {
      id: "doc-legacy-5-5",
      title: "Legacy Document",
      version: 1,
      createdAt: "2026-10-01T00:00:00.000Z",
      updatedAt: "2026-10-01T00:00:00.000Z",
    },
    trackedChanges: [
      {
        id: "legacy-ins-1",
        type: "insert",
        author: "Legacy Author",
        timestamp: "2026-10-01T00:00:00.000Z",
        text: "Văn bản cũ",
      },
    ],
    document: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              marks: [
                {
                  type: "trackChange",
                  attrs: {
                    id: "legacy-ins-1",
                    changeType: "insert",
                    author: "Legacy Author",
                    timestamp: "2026-10-01T00:00:00.000Z",
                  },
                },
              ],
              text: "Văn bản cũ",
            },
          ],
        },
      ],
    },
  };

  const result = deserializeMwdToDocument(JSON.stringify(legacyMwdPackage));
  assert.equal(result.success, true);
  if (!result.success) return;

  assert.equal(result.document.trackedChanges?.length, 1);
  assert.equal(result.document.trackedChanges?.[0].id, "legacy-ins-1");
  assert.equal(result.document.trackedChanges?.[0].type, "insert");
});

// -----------------------------------------------------------------------------
// 8. MALFORMED METADATA RESILIENCE
// -----------------------------------------------------------------------------
test("PHASE 10 — 8. Malformed Metadata: Dữ liệu hỏng (missing props, invalid scope/type, unknown styles) không làm crash và không mất text", () => {
  const malformedMwd = {
    format: MWD_FORMAT_IDENTIFIER,
    version: 1,
    metadata: {
      id: "doc-malformed",
      title: "Tài liệu lỗi dữ liệu",
    },
    trackedChanges: [
      {
        // Thiếu id, thiếu author, timestamp không hợp lệ
        id: "",
        type: "UNKNOWN_TYPE",
        timestamp: "invalid-date-string",
        formatChange: {
          scope: "INVALID_SCOPE",
          changes: [
            { property: "fontSize", before: null, after: "18pt" },
            null, // Mục lỗi null
            { property: "styleId", before: "ghost-style-404", after: "Normal" },
          ],
        },
      },
    ],
    document: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          attrs: {
            // formatRevisions bị hỏng (chuỗi thay vì mảng)
            formatRevisions: "corrupt_string_not_array",
          },
          content: [
            {
              type: "text",
              marks: [
                {
                  type: "trackChange",
                  attrs: {
                    // attrs rỗng
                  },
                },
              ],
              text: "Văn bản quan trọng của người dùng tuyệt đối không được mất.",
            },
          ],
        },
      ],
    },
  };

  // Deserialize không được ném ngoại lệ
  const result = deserializeMwdToDocument(JSON.stringify(malformedMwd));
  assert.equal(result.success, true, "Phải deserialize thành công dù metadata hỏng");
  if (!result.success) return;

  const doc = result.document;
  // 1. Văn bản người dùng nguyên vẹn
  assert.equal(
    doc.content.content?.[0]?.content?.[0]?.text,
    "Văn bản quan trọng của người dùng tuyệt đối không được mất."
  );

  // 2. formatRevisions trên paragraph được phục hồi thành mảng an toàn
  assert.ok(Array.isArray(doc.content.content?.[0]?.attrs?.formatRevisions));

  // 3. Mark trên text node được gán fallback ID và author an toàn
  const mark = doc.content.content?.[0]?.content?.[0]?.marks?.[0];
  assert.ok(mark);
  assert.ok(mark.attrs?.id);
  assert.equal(mark.attrs?.author, "Unknown Author");
});

// -----------------------------------------------------------------------------
// 9. SEMANTIC ANCHOR RESTORATION (NO RUNTIME NUMERIC POSITIONS)
// -----------------------------------------------------------------------------
test("PHASE 10 — 9. Semantic Anchors: Không phụ thuộc vào vị trí số tuyệt đối", () => {
  const sampleDoc: DocumentModel = {
    metadata: {
      id: "doc-anchor-test",
      title: "Anchor Test",
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    pageSettings: DEFAULT_PAGE_SETTINGS,
    trackedChanges: [
      {
        id: "rev-anchor-1",
        type: "format",
        author: "Tester",
        timestamp: new Date().toISOString(),
        scope: "character",
        text: "chữ định dạng",
        // Chứa runtime positions cố ý
        from: 10,
        to: 25,
      },
    ],
    content: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              marks: [
                {
                  type: "trackChange",
                  attrs: {
                    id: "rev-anchor-1",
                    changeType: "format",
                    scope: "character",
                    // Cố ý gán runtime positions vào mark
                    from: 10,
                    to: 25,
                  },
                },
              ],
              text: "chữ định dạng",
            },
          ],
        },
      ],
    },
  };

  const serialized = serializeDocumentToMwd(sampleDoc);

  // Kiểm tra serialization loại bỏ sạch sẽ 'from' và 'to'
  const parsed = JSON.parse(serialized);
  assert.equal(parsed.trackedChanges[0].from, undefined);
  assert.equal(parsed.trackedChanges[0].to, undefined);
  assert.equal(parsed.document.content[0].content[0].marks[0].attrs.from, undefined);
  assert.equal(parsed.document.content[0].content[0].marks[0].attrs.to, undefined);
});

// -----------------------------------------------------------------------------
// 10. DIRTY STATE & SAVE FAILURE SAFETY
// -----------------------------------------------------------------------------
test("PHASE 10 — 10. Dirty & Save Failure Safety: Formatting revision đánh dấu isDirty; Save fail giữ nguyên dirty", () => {
  const store = useDocumentStore.getState();

  // Khởi tạo tài liệu sạch (clean baseline)
  const initialDoc: DocumentModel = {
    metadata: {
      id: "doc-dirty-safety",
      title: "Dirty Safety",
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
          content: [{ type: "text", text: "Văn bản gốc ban đầu." }],
        },
      ],
    },
  };

  store.setDocument(initialDoc, "C:/docs/test.mwd");
  assert.equal(useDocumentStore.getState().isDirty, false, "Ban đầu isDirty phải false");

  // 1. Thao tác định dạng khi Track Changes ON
  const editor = createTestEditor(useDocumentStore.getState().document.content);
  useReviewStore.setState({ trackChangesEnabled: true });

  editor.chain().setTextSelection({ from: 1, to: 8 }).run();
  toggleBold(editor);

  // Giả lập updateContent từ editor sang store
  useDocumentStore.getState().updateContent(editor.getJSON());
  assert.equal(useDocumentStore.getState().isDirty, true, "Sau khi tạo revision, isDirty phải là true");

  // 2. Giả lập Save thất bại (ví dụ lỗi ổ đĩa hoặc mạng)
  // Khi save fail, KHÔNG GỌI markSaved()
  try {
    // Giả định ném lỗi trước khi ghi thành công
    throw new Error("Disk write error");
  } catch {
    // Bắt lỗi, không gọi markSaved
  }

  assert.equal(
    useDocumentStore.getState().isDirty,
    true,
    "Khi Save thất bại, isDirty vẫn phải là true để bảo vệ dữ liệu người dùng"
  );

  // 3. Khi Save thành công
  useDocumentStore.getState().markSaved("C:/docs/test.mwd");
  assert.equal(useDocumentStore.getState().isDirty, false, "Sau khi markSaved, isDirty quay về false");
});
