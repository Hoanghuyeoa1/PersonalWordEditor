import test from "node:test";
import assert from "node:assert/strict";
import { useDocumentStore } from "../stores/documentStore.ts";
import { useConfirmDialogStore } from "../stores/confirmDialogStore.ts";
import { executeWithProtection } from "./fileOperations.ts";
import { createDefaultDocumentContent } from "../document/documentModel.ts";
import type { JSONContent } from "@tiptap/core";

test("Dirty State: initial document starts in clean state", () => {
  const store = useDocumentStore.getState();
  store.resetDocument();

  const current = useDocumentStore.getState();
  assert.equal(current.isDirty, false, "Initial document must not be dirty");
  assert.equal(current.filePath, null);
  assert.equal(current.currentFilePath, null);
  assert.equal(typeof current.documentTitle, "string");
});

test("Dirty State: editing content flags document as dirty", () => {
  const store = useDocumentStore.getState();
  store.resetDocument();

  const modifiedContent: JSONContent = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Nội dung vừa chỉnh sửa" }],
      },
    ],
  };

  store.updateContent(modifiedContent);

  const current = useDocumentStore.getState();
  assert.equal(current.isDirty, true, "Modified document must be dirty");
});

test("Dirty State: undoing back to saved content returns to clean state", () => {
  const store = useDocumentStore.getState();
  store.resetDocument();

  const originalContent = useDocumentStore.getState().document.content;
  assert.equal(useDocumentStore.getState().isDirty, false);

  // Người dùng gõ chữ -> dirty = true
  const edit1: JSONContent = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Văn bản sửa lần 1" }],
      },
    ],
  };
  store.updateContent(edit1);
  assert.equal(useDocumentStore.getState().isDirty, true);

  // Người dùng hoàn tác (Undo) trở lại nội dung gốc -> dirty = false!
  store.updateContent(originalContent);
  assert.equal(
    useDocumentStore.getState().isDirty,
    false,
    "Undoing back to initial/saved content must restore clean isDirty = false"
  );

  // Người dùng làm lại (Redo) -> dirty = true trở lại
  store.updateContent(edit1);
  assert.equal(useDocumentStore.getState().isDirty, true);
});

test("Dirty State: markSaved resets isDirty and updates snapshots", () => {
  const store = useDocumentStore.getState();
  store.resetDocument();

  const edit: JSONContent = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Tài liệu quan trọng" }],
      },
    ],
  };
  store.updateContent(edit);
  assert.equal(useDocumentStore.getState().isDirty, true);

  store.markSaved("C:\\Users\\test\\Documents\\report.mwd");

  const current = useDocumentStore.getState();
  assert.equal(current.isDirty, false, "Saved document must not be dirty");
  assert.equal(current.filePath, "C:\\Users\\test\\Documents\\report.mwd");
  assert.equal(current.currentFilePath, "C:\\Users\\test\\Documents\\report.mwd");
  assert.equal(current.documentTitle, "report");

  // Chỉnh sửa thêm sau khi lưu -> dirty = true
  const edit2: JSONContent = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Tài liệu quan trọng + thêm dòng" }],
      },
    ],
  };
  store.updateContent(edit2);
  assert.equal(useDocumentStore.getState().isDirty, true);

  // Undo về lúc vừa lưu -> dirty = false
  store.updateContent(edit);
  assert.equal(useDocumentStore.getState().isDirty, false);
});

test("Close Protection: clean document executes action immediately without prompt", async () => {
  const store = useDocumentStore.getState();
  store.resetDocument();
  assert.equal(store.isDirty, false);

  let executed = false;
  const result = await executeWithProtection(
    "new",
    async () => {
      executed = true;
    },
    null
  );

  assert.equal(result.success, true);
  assert.equal(executed, true, "Callback should execute immediately when document is clean");
  assert.equal(useConfirmDialogStore.getState().isOpen, false, "Confirm dialog must not open");
});

test("Close Protection: dirty document prompts user, Cancel aborts action", async () => {
  const store = useDocumentStore.getState();
  store.resetDocument();

  store.updateContent({
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text: "Dữ liệu chưa lưu" }] }],
  });
  assert.equal(useDocumentStore.getState().isDirty, true);

  let executed = false;
  const actionPromise = executeWithProtection(
    "open",
    async () => {
      executed = true;
    },
    null
  );

  // Kiểm tra dialog mở
  assert.equal(useConfirmDialogStore.getState().isOpen, true);
  assert.equal(useConfirmDialogStore.getState().actionType, "open");

  // Người dùng bấm Hủy (Cancel)
  useConfirmDialogStore.getState().confirmChoice("cancel");

  const result = await actionPromise;
  assert.equal(result.success, false);
  assert.equal(result.cancelled, true);
  assert.equal(executed, false, "Action must NOT be executed when cancelled");
  assert.equal(useConfirmDialogStore.getState().isOpen, false);
});

test("Close Protection: dirty document prompts user, Don't Save proceeds without saving", async () => {
  const store = useDocumentStore.getState();
  store.resetDocument();

  store.updateContent({
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text: "Bỏ qua thay đổi này" }] }],
  });
  assert.equal(useDocumentStore.getState().isDirty, true);

  let executed = false;
  const actionPromise = executeWithProtection(
    "close",
    async () => {
      executed = true;
    },
    null
  );

  assert.equal(useConfirmDialogStore.getState().isOpen, true);

  // Người dùng bấm Không lưu (Don't Save)
  useConfirmDialogStore.getState().confirmChoice("dontsave");

  const result = await actionPromise;
  assert.equal(result.success, true);
  assert.equal(executed, true, "Action must proceed when Don't Save is chosen");
});
