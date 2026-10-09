import { test } from "node:test";
import assert from "node:assert/strict";
import { Editor } from "@tiptap/core";
import { useDocumentStore } from "../../stores/documentStore.ts";
import { useReviewStore } from "../../stores/reviewStore.ts";
import { TrackChangesService } from "./trackChangesService.ts";
import { getEditorExtensions } from "../../editor/editorExtensions.ts";
import { DEFAULT_PAGE_SETTINGS } from "../../page/index.ts";
import {
  serializeDocumentToMwd,
  deserializeMwdToDocument,
} from "../../document/documentFile.ts";
import { exportDocumentModelToDocx } from "../../docx/index.ts";
import type { DocumentModel } from "../../document/documentTypes.ts";
import { ensureEditorPlugins } from "../../editor/editorCommands.ts";

function createTestEditor(initialContent?: any): Editor {
  const editor = new Editor({
    extensions: getEditorExtensions(),
    content: initialContent || {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Văn bản mẫu ban đầu dùng để kiểm thử Track Changes." }],
        },
      ],
    },
  });
  ensureEditorPlugins(editor);
  return editor;
}

test("PHASE 5.5 — 1. Tracking Toggle: Chuyển đổi trạng thái BẬT / TẮT", () => {
  const reviewState = useReviewStore.getState();

  // Mặc định Track Changes là OFF
  reviewState.setTrackChangesEnabled(false);
  assert.equal(useReviewStore.getState().trackChangesEnabled, false);

  // Bật ON
  reviewState.toggleTrackChanges();
  assert.equal(useReviewStore.getState().trackChangesEnabled, true);

  // Tắt OFF
  reviewState.toggleTrackChanges();
  assert.equal(useReviewStore.getState().trackChangesEnabled, false);

  // Bật trực tiếp qua setter
  reviewState.setTrackChangesEnabled(true);
  assert.equal(useReviewStore.getState().trackChangesEnabled, true);
  reviewState.setTrackChangesEnabled(false);
});

test("PHASE 5.5 — 2. Insert Tracking: Ghi nhận văn bản thêm mới (type = insert)", () => {
  const editor = createTestEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Nội dung gốc. " }],
      },
    ],
  });

  // BẬT Track Changes
  useReviewStore.getState().setTrackChangesEnabled(true);

  // Di chuyển con trỏ tới cuối và gõ thêm văn bản
  editor.commands.setTextSelection(15);
  const handled = TrackChangesService.applyTrackedTextInput(editor, 15, 15, "Thêm mới");
  assert.equal(handled, true);

  const json = editor.getJSON();
  const para = json.content?.[0];
  const insertedNode = para?.content?.find((node) => node.text === "Thêm mới");

  assert.ok(insertedNode, "Nút văn bản mới chèn phải tồn tại trong document AST");
  assert.ok(insertedNode.marks, "Văn bản mới phải có marks");

  const trackMark = insertedNode.marks?.find((m) => m.type === "trackChange");
  assert.ok(trackMark, "Văn bản mới phải có mark trackChange");
  assert.equal(trackMark.attrs?.changeType, "insert");
  assert.ok(trackMark.attrs?.id);
  assert.ok(trackMark.attrs?.author);
  assert.ok(trackMark.attrs?.timestamp);

  // Tắt Track Changes sau khi test
  useReviewStore.getState().setTrackChangesEnabled(false);
  editor.destroy();
});

test("PHASE 5.5 — 3. Delete Tracking: Giữ nguyên văn bản bị xóa (type = delete), khác biệt với Strikethrough", () => {
  const editor = createTestEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Đoạn văn cần xóa một phần." }],
      },
    ],
  });

  // BẬT Track Changes
  useReviewStore.getState().setTrackChangesEnabled(true);

  // Chọn vùng văn bản "cần xóa" (từ vị trí 10 đến 17)
  editor.commands.setTextSelection({ from: 10, to: 17 });

  // Nhấn Backspace khi đang chọn vùng
  const handled = TrackChangesService.applyTrackedKeyDown(editor, "Backspace");
  assert.equal(handled, true, "Phím Backspace phải được bắt và xử lý bởi Track Changes");

  // Kiểm tra: Văn bản KHÔNG bị biến mất khỏi AST
  const json = editor.getJSON();
  const textNodes = json.content?.[0]?.content || [];
  const fullText = textNodes.map((n) => n.text).join("");
  assert.ok(fullText.includes("cần xóa"), "Nội dung bị xóa KHÔNG được biến mất khỏi tài liệu");

  // Kiểm tra mark trên đoạn bị xóa
  const deletedNode = textNodes.find((n) => n.text === "cần xóa");
  assert.ok(deletedNode, "Node 'cần xóa' phải tồn tại");
  const trackMark = deletedNode.marks?.find((m) => m.type === "trackChange");
  assert.ok(trackMark, "Phải có mark trackChange");
  assert.equal(trackMark.attrs?.changeType, "delete");

  // Phân biệt rõ rệt Data Model: Strikethrough thật của người dùng là mark 'strike' (<s>),
  // trong khi Tracked Deletion là mark 'trackChange' với changeType 'delete'
  const userStrikeMark = deletedNode.marks?.find((m) => m.type === "strike");
  assert.equal(userStrikeMark, undefined, "Tracked deletion KHÔNG được nhầm lẫn thành user strike mark");

  useReviewStore.getState().setTrackChangesEnabled(false);
  editor.destroy();
});

test("PHASE 5.5 — 4. Tracking OFF: Không tạo metadata khi tắt chế độ theo dõi", () => {
  const editor = createTestEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Nội dung ban đầu. " }],
      },
    ],
  });

  // Đảm bảo Tracking là OFF
  useReviewStore.getState().setTrackChangesEnabled(false);

  // Gõ thêm văn bản khi Tracking OFF
  editor.commands.insertContent({ type: "text", text: "Văn bản bình thường" });

  const json = editor.getJSON();
  const lastNode = json.content?.[0]?.content?.find((n) => n.text?.includes("Văn bản bình thường"));
  assert.ok(lastNode);
  const trackMark = lastNode.marks?.find((m) => m.type === "trackChange");
  assert.equal(trackMark, undefined, "Không được gắn trackChange mark khi tracking OFF");

  editor.destroy();
});

test("PHASE 5.5 — 5. Navigation Foundation: Previous Change, Next Change và activeChangeId", () => {
  const editor = createTestEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Bắt đầu " },
          {
            type: "text",
            marks: [
              {
                type: "trackChange",
                attrs: {
                  id: "ch-1",
                  changeType: "insert",
                  author: "UserA",
                  timestamp: "2026-10-07T08:00:00.000Z",
                },
              },
            ],
            text: "thay đổi một",
          },
          { type: "text", text: " ở giữa " },
          {
            type: "text",
            marks: [
              {
                type: "trackChange",
                attrs: {
                  id: "ch-2",
                  changeType: "delete",
                  author: "UserB",
                  timestamp: "2026-10-07T08:05:00.000Z",
                },
              },
            ],
            text: "thay đổi hai",
          },
          { type: "text", text: " kết thúc." },
        ],
      },
    ],
  });

  // Trích xuất danh sách thay đổi từ ProseMirror doc
  const changes = TrackChangesService.getTrackedChangesFromDoc(editor.state.doc);
  assert.equal(changes.length, 2);
  assert.equal(changes[0].id, "ch-1");
  assert.equal(changes[0].type, "insert");
  assert.equal(changes[1].id, "ch-2");
  assert.equal(changes[1].type, "delete");

  // Tìm vị trí range
  const range1 = TrackChangesService.findChangeRangeInDoc(editor.state.doc, "ch-1");
  assert.ok(range1);
  assert.ok(range1.from > 0 && range1.to > range1.from);

  // Điều hướng Next Change
  const firstChange = TrackChangesService.findNextChange(editor.state.doc, null);
  assert.ok(firstChange);
  assert.equal(firstChange.id, "ch-1");

  const secondChange = TrackChangesService.findNextChange(editor.state.doc, "ch-1");
  assert.ok(secondChange);
  assert.equal(secondChange.id, "ch-2");

  // Điều hướng xoay vòng (Cycle back to first)
  const wrappedChange = TrackChangesService.findNextChange(editor.state.doc, "ch-2");
  assert.ok(wrappedChange);
  assert.equal(wrappedChange.id, "ch-1");

  // Điều hướng Previous Change
  const prevChange = TrackChangesService.findPreviousChange(editor.state.doc, "ch-2");
  assert.ok(prevChange);
  assert.equal(prevChange.id, "ch-1");

  // Thử nghiệm navigateToChange
  const navigated = TrackChangesService.navigateToChange(editor, "ch-2");
  assert.equal(navigated, true);
  assert.equal(useReviewStore.getState().activeChangeId, "ch-2");

  editor.destroy();
});

test("PHASE 5.5 — 6. Persistence: Lưu trữ và phục hồi định dạng .mwd chuẩn", () => {
  const sampleDoc: DocumentModel = {
    metadata: {
      id: "doc-track-1",
      title: "Tài liệu kiểm thử Track Changes",
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
          content: [
            {
              type: "text",
              marks: [
                {
                  type: "trackChange",
                  attrs: {
                    id: "c-persist-ins",
                    changeType: "insert",
                    author: "Tester",
                    timestamp: "2026-10-07T08:00:00.000Z",
                  },
                },
              ],
              text: "Đoạn chèn mới",
            },
            {
              type: "text",
              marks: [
                {
                  type: "trackChange",
                  attrs: {
                    id: "c-persist-del",
                    changeType: "delete",
                    author: "Reviewer",
                    timestamp: "2026-10-07T08:02:00.000Z",
                  },
                },
              ],
              text: "Đoạn đã xóa",
            },
          ],
        },
      ],
    },
    trackedChanges: [
      {
        id: "c-persist-ins",
        type: "insert",
        author: "Tester",
        timestamp: "2026-10-07T08:00:00.000Z",
        text: "Đoạn chèn mới",
      },
      {
        id: "c-persist-del",
        type: "delete",
        author: "Reviewer",
        timestamp: "2026-10-07T08:02:00.000Z",
        text: "Đoạn đã xóa",
      },
    ],
  };

  // 1. Serialize sang .mwd JSON string
  const mwdString = serializeDocumentToMwd(sampleDoc);
  assert.ok(mwdString.includes("trackedChanges"), ".mwd string phải chứa trường trackedChanges");
  assert.ok(mwdString.includes("c-persist-ins"), ".mwd string phải chứa change ID");
  assert.ok(mwdString.includes("c-persist-del"), ".mwd string phải chứa deletion change ID");

  // 2. Deserialize ngược lại
  const deserializeResult = deserializeMwdToDocument(mwdString);
  assert.equal(deserializeResult.success, true);
  if (deserializeResult.success) {
    const loadedDoc = deserializeResult.document;
    assert.equal(loadedDoc.trackedChanges?.length, 2);
    assert.equal(loadedDoc.trackedChanges?.[0].id, "c-persist-ins");
    assert.equal(loadedDoc.trackedChanges?.[0].type, "insert");
    assert.equal(loadedDoc.trackedChanges?.[1].id, "c-persist-del");
    assert.equal(loadedDoc.trackedChanges?.[1].type, "delete");
  }

  // 3. Tương thích ngược: file cũ không có trackedChanges
  const legacyMwd = JSON.stringify({
    format: "PersonalWordDocument",
    version: 1,
    metadata: sampleDoc.metadata,
    document: sampleDoc.content,
  });
  const legacyResult = deserializeMwdToDocument(legacyMwd);
  assert.equal(legacyResult.success, true);
  if (legacyResult.success) {
    assert.deepEqual(legacyResult.document.trackedChanges, []);
  }
});

test("PHASE 5.5 — 7. Undo/Redo: Hoàn tác và làm lại không làm hỏng hoặc nhân bản metadata", () => {
  const editor = createTestEditor();
  useReviewStore.getState().setTrackChangesEnabled(true);

  // 1. Thao tác chèn văn bản
  editor.commands.setTextSelection(1);
  TrackChangesService.applyTrackedTextInput(editor, 1, 1, "Thử nghiệm ");

  let textNodes = editor.getJSON().content?.[0]?.content || [];
  let insNode = textNodes.find((n) => n.text?.includes("Thử nghiệm"));
  assert.ok(insNode, "Đoạn chèn mới phải tồn tại");
  const origChangeId = insNode.marks?.find((m) => m.type === "trackChange")?.attrs?.id;
  assert.ok(origChangeId);

  // 2. Undo
  editor.commands.undo();
  textNodes = editor.getJSON().content?.[0]?.content || [];
  insNode = textNodes.find((n) => n.text?.includes("Thử nghiệm"));
  assert.equal(insNode, undefined, "Undo phải rút lại văn bản đã chèn");

  // 3. Redo
  editor.commands.redo();
  textNodes = editor.getJSON().content?.[0]?.content || [];
  insNode = textNodes.find((n) => n.text?.includes("Thử nghiệm"));
  assert.ok(insNode, "Redo phải khôi phục lại văn bản đã chèn");
  const redoneChangeId = insNode.marks?.find((m) => m.type === "trackChange")?.attrs?.id;
  assert.equal(redoneChangeId, origChangeId, "Redo phải giữ nguyên chính xác change ID ban đầu");

  // 4. Kiểm tra delete -> undo -> redo
  editor.commands.setTextSelection({ from: 1, to: 12 });
  TrackChangesService.applyTrackedKeyDown(editor, "Backspace");
  let delNodes = editor.getJSON().content?.[0]?.content || [];
  let delNode = delNodes.find((n) =>
    n.marks?.some((m) => m.type === "trackChange" && m.attrs?.changeType === "delete")
  );
  assert.ok(delNode, "Văn bản phải được đánh dấu delete khi Backspace");
  const delChangeId = delNode.marks?.find(
    (m) => m.type === "trackChange" && m.attrs?.changeType === "delete"
  )?.attrs?.id;
  assert.ok(delChangeId);

  // Undo delete
  editor.commands.undo();
  delNodes = editor.getJSON().content?.[0]?.content || [];
  let undoneDel = delNodes.find((n) =>
    n.marks?.some((m) => m.type === "trackChange" && m.attrs?.changeType === "delete")
  );
  assert.equal(undoneDel, undefined, "Undo delete phải hoàn tác trạng thái xóa");

  // Redo delete
  editor.commands.redo();
  delNodes = editor.getJSON().content?.[0]?.content || [];
  let redoneDel = delNodes.find((n) =>
    n.marks?.some((m) => m.type === "trackChange" && m.attrs?.changeType === "delete")
  );
  assert.ok(redoneDel, "Redo delete phải khôi phục trạng thái xóa");
  assert.equal(
    redoneDel.marks?.find(
      (m) => m.type === "trackChange" && m.attrs?.changeType === "delete"
    )?.attrs?.id,
    delChangeId,
    "Redo delete phải giữ nguyên change ID ban đầu"
  );

  useReviewStore.getState().setTrackChangesEnabled(false);
  editor.destroy();
});

test("PHASE 5.5 — 8. Clipboard Editing: Cắt (Cut) và Dán (Paste) khi Tracking ON", () => {
  const editor = createTestEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Đoạn văn bản để kiểm tra Cut và Paste." }],
      },
    ],
  });

  useReviewStore.getState().setTrackChangesEnabled(true);

  // Chọn vùng "kiểm tra Cut" (từ vị trí 17 đến 29)
  editor.commands.setTextSelection({ from: 17, to: 29 });

  // Mô phỏng Cut
  const cutText = TrackChangesService.applyTrackedCut(editor);
  assert.equal(cutText, "kiểm tra Cut", "Cut phải trích xuất đúng nội dung cắt");

  // Kiểm tra: Đoạn văn bản bị Cut không biến mất, mà nhận mark delete
  const cutNode = editor.getJSON().content?.[0]?.content?.find((n) => n.text === "kiểm tra Cut");
  assert.ok(cutNode, "Đoạn bị cut phải vẫn tồn tại trong AST");
  assert.equal(cutNode.marks?.find((m) => m.type === "trackChange")?.attrs?.changeType, "delete");

  // Mô phỏng Paste với vùng chọn rỗng
  editor.commands.setTextSelection(30);
  const handledPaste = TrackChangesService.applyTrackedPaste(editor, " [Nội dung dán] ");
  assert.equal(handledPaste, true, "Paste phải được xử lý qua Track Changes");

  const pastedNode = editor.getJSON().content?.[0]?.content?.find((n) =>
    n.text?.includes("[Nội dung dán]")
  );
  assert.ok(pastedNode, "Văn bản paste phải được chèn");
  assert.equal(pastedNode.marks?.find((m) => m.type === "trackChange")?.attrs?.changeType, "insert");

  useReviewStore.getState().setTrackChangesEnabled(false);
  editor.destroy();
});

test("PHASE 5.5 — 9. Regression: Cùng tồn tại với Bold, Italic, Comments, Tables và DOCX Export", async () => {
  const editor = createTestEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            marks: [
              { type: "bold" },
              { type: "italic" },
              { type: "comment", attrs: { commentId: "com-1" } },
              {
                type: "trackChange",
                attrs: {
                  id: "change-coexist",
                  changeType: "insert",
                  author: "Tester",
                  timestamp: new Date().toISOString(),
                },
              },
            ],
            text: "Văn bản vừa đậm, nghiêng, có bình luận và tracked insert.",
          },
        ],
      },
    ],
  });

  const node = editor.getJSON().content?.[0]?.content?.[0];
  assert.ok(node);
  const markTypes = node.marks?.map((m) => m.type);
  assert.ok(markTypes?.includes("bold"), "Phải giữ bold");
  assert.ok(markTypes?.includes("italic"), "Phải giữ italic");
  assert.ok(markTypes?.includes("comment"), "Phải giữ comment");
  assert.ok(markTypes?.includes("trackChange"), "Phải giữ trackChange");

  // Kiểm tra DOCX Export không bị crash khi gặp trackChange mark
  const docModel: DocumentModel = {
    metadata: {
      id: "doc-docx-test",
      title: "DOCX Export Regression Test",
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    pageSettings: DEFAULT_PAGE_SETTINGS,
    content: editor.getJSON(),
  };

  const docxBytes = await exportDocumentModelToDocx(docModel);
  assert.ok(docxBytes instanceof Uint8Array, "DOCX export phải tạo ra mảng byte hợp lệ");
  assert.ok(docxBytes.length > 500, "DOCX package phải có kích thước hợp lệ");

  editor.destroy();
});
