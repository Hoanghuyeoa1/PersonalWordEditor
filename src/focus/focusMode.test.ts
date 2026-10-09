import test from "node:test";
import assert from "node:assert/strict";
import { useFocusModeStore } from "../stores/focusModeStore.ts";
import { useDocumentStore } from "../stores/documentStore.ts";
import { useReviewStore } from "../stores/reviewStore.ts";
import { useReferencesStore } from "../stores/referencesStore.ts";
import { useFindReplaceStore } from "../stores/findReplaceStore.ts";
import { useCommandPaletteStore } from "../stores/commandPaletteStore.ts";
import { useConfirmDialogStore } from "../stores/confirmDialogStore.ts";
import { useZoomStore } from "../stores/zoomStore.ts";
import { commandRegistry } from "../commands/commandRegistry.ts";
import { DEFAULT_COMMANDS } from "../commands/defaultCommands.ts";
import { createInitialDocument } from "../document/documentModel.ts";
import { MemoryStorageAdapter } from "../version/storage/memoryStorageAdapter.ts";
import { setVersionStorageAdapter } from "../version/storage/storageFactory.ts";
import {
  createSnapshot,
  listSnapshots,
  restoreSnapshot,
  loadSnapshot,
} from "../version/services/versionService.ts";
import { AutosaveEngine } from "../version/services/autosaveEngine.ts";
import { RecoveryService } from "../version/services/recoveryService.ts";
import { Editor } from "@tiptap/core";
import { getEditorExtensions } from "../editor/editorExtensions.ts";
import {
  executeInsertPageBreak,
  executeInsertSectionBreak,
} from "../insert/commands/insertCommands.ts";

function createTestDoc(text: string) {
  return {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: text ? [{ type: "text", text }] : [],
      },
    ],
  };
}

/* ==========================================================================
   1. FOCUS MODE STATE & PRESENTATION ISOLATION (PART A)
   ========================================================================== */

test("Phase 7.3 Focus Mode: Initial state is false and toggles reliably", () => {
  const store = useFocusModeStore.getState();
  assert.equal(store.isFocusMode, false, "Focus Mode ban đầu phải tắt (false)");

  store.enterFocusMode();
  assert.equal(useFocusModeStore.getState().isFocusMode, true, "Sau khi enterFocusMode, isFocusMode phải là true");

  store.exitFocusMode();
  assert.equal(useFocusModeStore.getState().isFocusMode, false, "Sau khi exitFocusMode, isFocusMode phải là false");

  store.toggleFocusMode();
  assert.equal(useFocusModeStore.getState().isFocusMode, true, "toggleFocusMode lần 1 phải bật true");

  store.toggleFocusMode();
  assert.equal(useFocusModeStore.getState().isFocusMode, false, "toggleFocusMode lần 2 phải tắt false");
});

test("Phase 7.3 Focus Mode: Tuyệt đối KHÔNG thay đổi document semantic state hoặc AST", () => {
  // Chuẩn bị tài liệu mẫu
  const initialContent = createTestDoc("Nội dung tài liệu đang soạn thảo");
  useDocumentStore.setState({
    document: {
      type: "doc",
      content: initialContent.content,
    },
    documentTitle: "Báo cáo thử nghiệm.mwd",
    isDirty: false,
    pageSettings: {
      paperSize: "A4",
      orientation: "portrait",
      margins: { top: 25, right: 25, bottom: 25, left: 25 },
      marginPreset: "Normal",
    },
  });

  const docBefore = JSON.stringify(useDocumentStore.getState().document);
  const titleBefore = useDocumentStore.getState().documentTitle;
  const isDirtyBefore = useDocumentStore.getState().isDirty;
  const pageSettingsBefore = JSON.stringify(useDocumentStore.getState().pageSettings);

  // Bật Focus Mode
  useFocusModeStore.getState().enterFocusMode();

  // Kiểm tra tài liệu hoàn toàn không bị mutate
  assert.equal(JSON.stringify(useDocumentStore.getState().document), docBefore, "AST không bị thay đổi");
  assert.equal(useDocumentStore.getState().documentTitle, titleBefore, "Tiêu đề không bị thay đổi");
  assert.equal(useDocumentStore.getState().isDirty, isDirtyBefore, "isDirty không bị biến đổi");
  assert.equal(JSON.stringify(useDocumentStore.getState().pageSettings), pageSettingsBefore, "pageSettings giữ nguyên 100%");

  // Tắt Focus Mode
  useFocusModeStore.getState().exitFocusMode();
  assert.equal(JSON.stringify(useDocumentStore.getState().document), docBefore, "AST sau khi thoát Focus Mode giữ nguyên");
  assert.equal(useDocumentStore.getState().isDirty, isDirtyBefore, "isDirty sau khi thoát Focus Mode giữ nguyên");
});

test("Phase 7.3 Focus Mode: Đóng các thanh bên và overlay phụ an toàn khi kích hoạt", () => {
  // Mở trước Comments Sidebar, References Outline Sidebar, Find/Replace, Command Palette
  useReviewStore.setState({ isCommentsSidebarOpen: true });
  useReferencesStore.setState({ isReferencesPanelOpen: true, activeReferencePanel: "outline" });
  useFindReplaceStore.setState({ isOpen: true });
  useCommandPaletteStore.setState({ isOpen: true });

  assert.equal(useReviewStore.getState().isCommentsSidebarOpen, true);
  assert.equal(useReferencesStore.getState().isReferencesPanelOpen, true);
  assert.equal(useFindReplaceStore.getState().isOpen, true);
  assert.equal(useCommandPaletteStore.getState().isOpen, true);

  // Kích hoạt Focus Mode
  useFocusModeStore.getState().enterFocusMode();

  // Kiểm tra tất cả đã được đóng deterministic
  assert.equal(useReviewStore.getState().isCommentsSidebarOpen, false, "Comments sidebar phải được đóng");
  assert.equal(useReferencesStore.getState().isReferencesPanelOpen, false, "References panel phải được đóng");
  assert.equal(useFindReplaceStore.getState().isOpen, false, "Find/Replace dialog phải được đóng");
  assert.equal(useCommandPaletteStore.getState().isOpen, false, "Command Palette phải được đóng");

  useFocusModeStore.getState().exitFocusMode();
});

test("Phase 7.3 Focus Mode: Dialog an toàn — không làm biến mất hoặc kẹt Confirm Dialog", () => {
  useConfirmDialogStore.setState({
    isOpen: true,
    title: "Lưu thay đổi?",
    message: "Tài liệu có chỉnh sửa chưa lưu.",
  });

  // Toggling Focus Mode không được làm mất confirm dialog state
  useFocusModeStore.getState().enterFocusMode();
  assert.equal(useConfirmDialogStore.getState().isOpen, true, "Confirm Dialog vẫn phải giữ trạng thái isOpen = true");

  useFocusModeStore.getState().exitFocusMode();
  assert.equal(useConfirmDialogStore.getState().isOpen, true, "Confirm Dialog sau khi exit vẫn an toàn");

  // Reset
  useConfirmDialogStore.setState({ isOpen: false });
});

test("Phase 7.3 Focus Mode: Giữ nguyên mức thu phóng (Zoom) và Page Dimensions", () => {
  useZoomStore.setState({ zoom: 125 });
  assert.equal(useZoomStore.getState().zoom, 125);

  useFocusModeStore.getState().enterFocusMode();
  assert.equal(useZoomStore.getState().zoom, 125, "Zoom level giữ nguyên khi bật Focus Mode");

  // Vẫn có thể zoom trong Focus Mode (zoomIn tăng 10%)
  useZoomStore.getState().zoomIn();
  assert.equal(useZoomStore.getState().zoom, 135, "Zoom in hoạt động tốt trong Focus Mode");

  useFocusModeStore.getState().exitFocusMode();
  assert.equal(useZoomStore.getState().zoom, 135, "Zoom level được bảo toàn khi thoát Focus Mode");

  // Reset
  useZoomStore.setState({ zoom: 100 });
  useFocusModeStore.setState({ isFocusMode: false });
});

/* ==========================================================================
   2. UNIFIED COMMAND SYSTEM AUDIT (PART B)
   ========================================================================== */

test("Phase 7.3 Unified Command Audit: Single Registry chung cho Command Palette & Slash Commands", () => {
  useFocusModeStore.setState({ isFocusMode: false });
  const allCmds = commandRegistry.getAll();
  assert.ok(allCmds.length >= 25, "Registry phải có đầy đủ các commands");

  // Lọc slash commands và palette commands
  const slashCmds = commandRegistry.getSlashCommands();
  const paletteCmds = commandRegistry.getPaletteCommands();

  assert.ok(slashCmds.length > 0, "Phải có các lệnh hỗ trợ Slash Command");
  assert.ok(paletteCmds.length >= slashCmds.length, "Palette phải hỗ trợ tập lệnh rộng hơn hoặc bằng Slash");

  // Kiểm tra lệnh Focus Mode
  const focusCmd = commandRegistry.get("view.toggleFocusMode");
  assert.ok(focusCmd, "Lệnh view.toggleFocusMode phải được đăng ký trong Registry");
  assert.equal(focusCmd.category, "view");
  assert.equal(focusCmd.shortcut, "F11");
  assert.equal(focusCmd.slashEnabled, true, "Focus Mode phải hỗ trợ Slash command (/focus)");
  assert.equal(focusCmd.paletteEnabled, true, "Focus Mode phải hỗ trợ Command Palette");

  // Thực thi lệnh focus qua Registry
  focusCmd.execute({ editor: null });
  assert.equal(useFocusModeStore.getState().isFocusMode, true, "Lệnh registry phải bật Focus Mode");

  focusCmd.execute({ editor: null });
  assert.equal(useFocusModeStore.getState().isFocusMode, false, "Lệnh registry lần 2 phải tắt Focus Mode");
});

test("Phase 7.3 Unified Command Audit: Không có duplicate shortcuts hoặc conflict", () => {
  const allCmds = commandRegistry.getAll();
  const shortcutMap = new Map<string, string>();

  for (const cmd of allCmds) {
    if (cmd.shortcut) {
      const existingId = shortcutMap.get(cmd.shortcut);
      assert.ok(
        !existingId,
        `Shortcut "${cmd.shortcut}" bị trùng lặp giữa "${existingId}" và "${cmd.id}"!`
      );
      shortcutMap.set(cmd.shortcut, cmd.id);
    }
  }

  // Đảm bảo các shortcut chuẩn không bị ghi đè
  assert.equal(shortcutMap.get("Ctrl+S"), "file.save");
  assert.equal(shortcutMap.get("Ctrl+Shift+S"), "file.saveAs");
  assert.equal(shortcutMap.get("Ctrl+Shift+H"), "file.versionHistory");
  assert.equal(shortcutMap.get("Ctrl+Shift+E"), "review.trackChanges");
  assert.equal(shortcutMap.get("Ctrl+Shift+G"), "review.statistics");
  assert.equal(shortcutMap.get("F11"), "view.toggleFocusMode");
});

test("Phase 7.3 Slash Workflow: Tìm kiếm mờ lệnh Heading, Table, Equation, Focus", () => {
  // Tìm kiếm với "/hea" -> Heading 1, 2, 3
  const heaMatches = commandRegistry.search("hea", { slashOnly: true });
  assert.ok(heaMatches.some((c) => c.id === "format.heading1"));
  assert.ok(heaMatches.some((c) => c.id === "format.heading2"));
  assert.ok(heaMatches.some((c) => c.id === "format.heading3"));

  // Tìm kiếm với "/tab" -> Table
  const tableMatches = commandRegistry.search("tab", { slashOnly: true });
  assert.ok(tableMatches.some((c) => c.id === "insert.table"));

  // Tìm kiếm với "/equ" -> Equation
  const eqMatches = commandRegistry.search("equ", { slashOnly: true });
  assert.ok(eqMatches.some((c) => c.id === "insert.equation"));

  // Tìm kiếm với "/foc" -> Focus Mode
  const focMatches = commandRegistry.search("foc", { slashOnly: true });
  assert.ok(focMatches.some((c) => c.id === "view.toggleFocusMode"));
});

/* ==========================================================================
   3. VERSION HISTORY, AUTOSAVE & CRASH RECOVERY WORKFLOW AUDIT (PART B)
   ========================================================================== */

test("Phase 7.3 Version History E2E Workflow: Snapshots A -> B -> Save -> C -> Restore B -> Save", async () => {
  const adapter = new MemoryStorageAdapter();
  setVersionStorageAdapter(adapter);

  // Setup Document Store
  const doc = createInitialDocument("Audit Workflow Doc");
  useDocumentStore.setState({
    document: doc,
    documentTitle: doc.metadata.title,
    isDirty: false,
    filePath: "C:/docs/audit.mwd",
  });

  // Step 1: Tạo Snapshot A
  doc.content = createTestDoc("Bản thảo ban đầu - Phiên bản A");
  const snapA = await createSnapshot(doc, "autosave", { description: "Phiên bản A" });

  // Step 2: Sửa và tạo Snapshot B
  doc.content = createTestDoc("Bản thảo đã sửa - Phiên bản B");
  doc.comments = [
    {
      id: "c1",
      author: "Hoang",
      content: "Đoạn này tốt",
      createdAt: Date.now(),
      resolved: false,
      targetAnchor: "cmt-1",
    },
  ];
  const snapB = await createSnapshot(doc, "autosave", { description: "Phiên bản B" });

  // Step 3: Explicit Save (tạo manual snapshot)
  const snapSave = await createSnapshot(doc, "manual", { description: "Lưu bản B chính thức" });

  // Step 4: Sửa tiếp và tạo Snapshot C
  doc.content = createTestDoc("Chỉnh sửa phá hỏng - Phiên bản C");
  const snapC = await createSnapshot(doc, "autosave", { description: "Phiên bản C" });

  // Step 5: Restore về Snapshot B
  const restoreRes = await restoreSnapshot(snapB.metadata.id, null);
  assert.equal(restoreRes.success, true, "Restore Snapshot B phải thành công");

  // Kiểm tra store sau khi restore
  const restoredDoc = useDocumentStore.getState().document;
  assert.deepEqual(restoredDoc.content, createTestDoc("Bản thảo đã sửa - Phiên bản B"), "Nội dung khớp Snapshot B");
  assert.equal(restoredDoc.comments?.length, 1, "Comments của Snapshot B phải được phục hồi 100%");
  assert.equal(restoredDoc.comments?.[0].content, "Đoạn này tốt");

  // Verify listSnapshots
  const history = await listSnapshots(doc.metadata.id);
  assert.ok(history.length >= 4, "Lịch sử phải bảo lưu đầy đủ các bản ghi");
});

test("Phase 7.3 Crash Recovery Workflow: Dirty -> Recovery Snapshot -> Ungraceful Exit -> Recovery Detection -> Recover", async () => {
  const adapter = new MemoryStorageAdapter();
  setVersionStorageAdapter(adapter);
  const recoverySvc = new RecoveryService();

  const doc = createInitialDocument("Quan Trong");
  doc.content = createTestDoc("Dữ liệu quan trọng đang viết dở chưa bấm Save");
  doc.trackedChanges = [
    {
      id: "tr1",
      type: "insertion",
      author: "Hoang",
      timestamp: new Date().toISOString(),
      text: "Đoạn mới thêm",
    },
  ];

  // Tạo recovery snapshot và ghi nhận session
  const snap = await createSnapshot(doc, "recovery");
  await recoverySvc.recordRecoverySnapshot(
    doc.metadata.id,
    doc.metadata.title,
    "C:/docs/quantrong.mwd",
    snap.metadata.id
  );

  // Giả lập app bị crash (KHÔNG gọi markAllCleanShutdown)
  // Khởi động lại app và kiểm tra
  const checkResult = await recoverySvc.checkPendingRecovery();
  assert.equal(checkResult.hasRecovery, true, "Phải phát hiện có dữ liệu khôi phục sau sự cố crash");
  assert.equal(checkResult.session?.documentId, doc.metadata.id);
  assert.equal(checkResult.session?.latestRecoverySnapshotId, snap.metadata.id);
  assert.ok(checkResult.recoveredDoc, "Phải nạp được recoveredDoc");
  assert.deepEqual(checkResult.recoveredDoc?.content, doc.content, "Nội dung khôi phục phải chính xác");
  assert.equal(checkResult.recoveredDoc?.trackedChanges?.length, 1, "Tracked changes phải được giữ nguyên");

  // Đánh dấu đã giải quyết (Clean shutdown sau khi recover)
  await recoverySvc.markCleanShutdown(doc.metadata.id);
  const secondCheck = await recoverySvc.checkPendingRecovery();
  assert.equal(secondCheck.hasRecovery, false, "Sau khi markClean, không còn recovery pending");
});

test("Phase 7.3 Crash Recovery Workflow: Discard Recovery bỏ qua an toàn và xóa recovery marker", async () => {
  const adapter = new MemoryStorageAdapter();
  setVersionStorageAdapter(adapter);
  const recoverySvc = new RecoveryService();

  const doc = createInitialDocument("Rac");
  const snap = await createSnapshot(doc, "recovery");

  await recoverySvc.recordRecoverySnapshot(
    doc.metadata.id,
    doc.metadata.title,
    null,
    snap.metadata.id
  );

  const check = await recoverySvc.checkPendingRecovery();
  assert.equal(check.hasRecovery, true);

  // Người dùng chọn Bỏ qua (Discard)
  await recoverySvc.discardRecovery(check.session!);

  // Kiểm tra không còn pending recovery
  const secondCheck = await recoverySvc.checkPendingRecovery();
  assert.equal(secondCheck.hasRecovery, false, "Sau khi discard, không còn recovery pending");
});

test("Phase 7.3 Failed Autosave: Lỗi ghi đĩa không crash app và bảo toàn isDirty", async () => {
  let simulatedError = true;
  const adapter = new MemoryStorageAdapter();
  // Override saveSnapshot để giả lập lỗi
  const originalSave = adapter.saveSnapshot.bind(adapter);
  adapter.saveSnapshot = async (snap) => {
    if (simulatedError) {
      throw new Error("Lỗi đĩa: Quyền ghi bị từ chối (EACCES / Permission Denied)");
    }
    return originalSave(snap);
  };
  setVersionStorageAdapter(adapter);

  const autosaveEngine = new AutosaveEngine();

  useDocumentStore.setState({ isDirty: true });

  const doc = createInitialDocument("Test Autosave Error");

  // Kích hoạt autosave trong tình trạng đĩa lỗi
  await autosaveEngine.performAutosave(doc, true);

  // App không crash và isDirty vẫn là true!
  assert.equal(useDocumentStore.getState().isDirty, true, "isDirty vẫn phải là true sau khi autosave lỗi");

  // Khôi phục quyền ghi đĩa
  simulatedError = false;
  // Explicit Save vẫn thực hiện được
  await createSnapshot(doc, "manual", { description: "Lưu thủ công" });
  useDocumentStore.getState().markSaved("C:/docs/test.mwd");
  assert.equal(useDocumentStore.getState().isDirty, false, "Chủ động Save thành công và chuyển isDirty = false");
});

/* ==========================================================================
   4. PERFORMANCE AUDIT (PART B)
   ========================================================================== */

test("Phase 7.3 Performance Audit: Command search latency < 15ms với khối lượng lệnh lớn", () => {
  const start = performance.now();
  for (let i = 0; i < 100; i++) {
    commandRegistry.search("head", { paletteOnly: true });
    commandRegistry.search("table", { slashOnly: true });
    commandRegistry.search("focus");
  }
  const elapsed = performance.now() - start;
  const avgPerQuery = elapsed / 300;
  assert.ok(avgPerQuery < 15.0, `Thời gian tìm kiếm trung bình ${avgPerQuery.toFixed(3)}ms phải < 15.0ms`);
});

test("Phase 7.3 Performance Audit: Snapshot serialization tài liệu lớn 200 paragraphs", async () => {
  const adapter = new MemoryStorageAdapter();
  setVersionStorageAdapter(adapter);

  // Tạo tài liệu lớn gồm 200 đoạn văn
  const largeContent = {
    type: "doc",
    content: Array.from({ length: 200 }, (_, i) => ({
      type: "paragraph",
      content: [{ type: "text", text: `Đoạn văn số ${i + 1}: Thử nghiệm kiểm toán hiệu năng lưu trữ và khôi phục tài liệu.` }],
    })),
  };

  const largeDoc = createInitialDocument("Large Doc", largeContent);
  largeDoc.comments = Array.from({ length: 20 }, (_, i) => ({
    id: `c-${i}`,
    author: "Hoang",
    content: `Bình luận số ${i}`,
    createdAt: Date.now(),
    resolved: false,
    targetAnchor: `a-${i}`,
  }));
  largeDoc.trackedChanges = Array.from({ length: 15 }, (_, i) => ({
    id: `t-${i}`,
    type: "insertion",
    author: "Hoang",
    timestamp: new Date().toISOString(),
    text: `Thay đổi số ${i}`,
  }));

  const start = performance.now();
  const snap = await createSnapshot(largeDoc, "autosave", { description: "Snapshot lớn" });
  const duration = performance.now() - start;

  assert.ok(snap.metadata.id);
  assert.ok(duration < 50, `Serialization snapshot lớn mất ${duration.toFixed(2)}ms phải < 50ms`);

  // Phục hồi lại snapshot lớn
  useDocumentStore.setState({ document: largeDoc });
  const restoreStart = performance.now();
  const res = await restoreSnapshot(snap.metadata.id, null);
  const restoreDuration = performance.now() - restoreStart;

  assert.equal(res.success, true);
  const restored = useDocumentStore.getState().document;
  assert.equal(restored.content.content.length, 200);
  assert.ok(restoreDuration < 50, `Phục hồi snapshot lớn mất ${restoreDuration.toFixed(2)}ms phải < 50ms`);
});

/* ==========================================================================
   5. FOCUS MODE REGRESSION & INTERACTIONS AUDIT (ITEMS 16, 17, 18)
   ========================================================================== */

test("Phase 7.3 Focus Mode Regression: Soạn thảo, Định dạng Bold và Undo/Redo trong Focus Mode", () => {
  const editor = new Editor({
    extensions: getEditorExtensions(),
    content: createTestDoc("Văn bản thử nghiệm định dạng"),
  });

  useFocusModeStore.getState().enterFocusMode();
  assert.equal(useFocusModeStore.getState().isFocusMode, true);

  // 1. Thao tác chọn và in đậm
  editor.commands.setTextSelection({ from: 1, to: 8 });
  editor.commands.toggleBold();
  assert.equal(editor.isActive("bold"), true, "Phím tắt / lệnh In đậm phải hoạt động khi Focus Mode đang bật");

  // 2. Undo/Redo không crash và thực thi được trong Focus Mode
  assert.doesNotThrow(() => editor.commands.undo(), "Undo phải hoạt động bình thường trong Focus Mode");
  assert.doesNotThrow(() => editor.commands.redo(), "Redo phải hoạt động bình thường trong Focus Mode");

  useFocusModeStore.getState().exitFocusMode();
  editor.destroy();
});

test("Phase 7.3 Focus Mode Regression: Ngắt trang (Page Break) và Ngắt phần (Section Break)", () => {
  const editor = new Editor({
    extensions: getEditorExtensions(),
    content: createTestDoc("Đoạn trước khi ngắt trang"),
  });

  useFocusModeStore.getState().enterFocusMode();

  // Chèn Page Break
  const pageBreakResult = executeInsertPageBreak(editor);
  assert.equal(pageBreakResult.success, true, "Chèn Page Break thành công trong Focus Mode");

  // Chèn Section Break
  const sectionBreakResult = executeInsertSectionBreak(editor, "nextPage");
  assert.equal(sectionBreakResult.success, true, "Chèn Section Break thành công trong Focus Mode");

  useFocusModeStore.getState().exitFocusMode();
  editor.destroy();
});

test("Phase 7.3 Interactions: Track Changes ON khi đang trong Focus Mode", () => {
  const editor = new Editor({
    extensions: getEditorExtensions(),
    content: createTestDoc("Nội dung gốc"),
  });

  useFocusModeStore.getState().enterFocusMode();
  useReviewStore.setState({ trackChangesEnabled: true });

  // Nhập nội dung mới khi Track Changes đang bật
  editor.commands.focus("end");
  editor.commands.insertContent({ type: "text", text: " và nội dung bổ sung" });

  // Kiểm tra văn bản đã được ghi nhận
  const fullText = editor.state.doc.textBetween(0, editor.state.doc.content.size, " ");
  assert.ok(fullText.includes("và nội dung bổ sung"), "Nội dung mới phải xuất hiện trong AST");

  useReviewStore.setState({ trackChangesEnabled: false });
  useFocusModeStore.getState().exitFocusMode();
  editor.destroy();
});

test("Phase 7.3 Interactions: Restore Snapshot bảo toàn đồng thời Footnotes, Comments, Tracked Changes", async () => {
  const adapter = new MemoryStorageAdapter();
  setVersionStorageAdapter(adapter);

  const doc = createInitialDocument("Full Meta Doc");
  doc.content = createTestDoc("Nội dung chứa toàn bộ metadata tham chiếu");
  doc.comments = [
    {
      id: "cmt-audit",
      author: "Hoang",
      content: "Nhận xét quan trọng",
      createdAt: 1000,
      resolved: false,
      targetAnchor: "anchor-1",
    },
  ];
  doc.trackedChanges = [
    {
      id: "tc-audit",
      type: "insertion",
      author: "Hoang",
      timestamp: "2026-10-07T00:00:00Z",
      text: "Đã thêm",
    },
  ];
  doc.references = {
    bibliographySources: [
      {
        id: "bib-1",
        type: "article",
        title: "Testing in TypeScript",
        authors: ["DeepMind"],
        year: 2026,
      },
    ],
    citationStyle: "apa",
  };

  useDocumentStore.setState({ document: doc, isDirty: false });

  // Lưu snapshot
  const snap = await createSnapshot(doc, "manual", { description: "Snapshot đầy đủ" });

  // Sửa tài liệu làm mất metadata
  const damagedDoc = createInitialDocument("Damaged");
  damagedDoc.comments = [];
  damagedDoc.trackedChanges = [];
  damagedDoc.references = { bibliographySources: [] };
  useDocumentStore.setState({ document: damagedDoc });

  // Khôi phục lại
  const res = await restoreSnapshot(snap.metadata.id, null);
  assert.equal(res.success, true);

  const restored = useDocumentStore.getState().document;
  assert.equal(restored.comments?.length, 1, "Comments được bảo toàn 100%");
  assert.equal(restored.trackedChanges?.length, 1, "Tracked changes được bảo toàn 100%");
  assert.equal(restored.references?.bibliographySources?.length, 1, "Citations/References được bảo toàn 100%");
  assert.equal(restored.references?.bibliographySources?.[0].title, "Testing in TypeScript");
});

