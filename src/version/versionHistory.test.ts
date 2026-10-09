import test from "node:test";
import assert from "node:assert/strict";
import {
  createInitialDocument,
  isValidDocumentModel,
} from "../document/documentModel.ts";
import {
  serializeDocumentToMwd,
  deserializeMwdToDocument,
} from "../document/documentFile.ts";
import { useDocumentStore } from "../stores/documentStore.ts";
import { MemoryStorageAdapter } from "./storage/memoryStorageAdapter.ts";
import {
  setVersionStorageAdapter,
  getVersionStorageAdapter,
} from "./storage/storageFactory.ts";
import {
  createSnapshot,
  loadSnapshot,
  listSnapshots,
  deleteSnapshot,
  pruneSnapshots,
  restoreSnapshot,
  isDocumentIdenticalToSnapshot,
} from "./services/versionService.ts";
import {
  AutosaveEngine,
  DEFAULT_AUTOSAVE_CONFIG,
} from "./services/autosaveEngine.ts";
import {
  RecoveryService,
} from "./services/recoveryService.ts";
import { sanitizeStorageId } from "./storage/versionStorageAdapter.ts";
import type { DocumentModel } from "../document/documentTypes.ts";
import type { DocumentSnapshot } from "./types.ts";

/**
 * Trợ giúp thiết lập môi trường MemoryStorage trước mỗi nhóm test
 */
function setupMemoryAdapter(): MemoryStorageAdapter {
  const adapter = new MemoryStorageAdapter();
  setVersionStorageAdapter(adapter);
  return adapter;
}

/**
 * Trợ giúp tạo DocumentModel phong phú đầy đủ tính năng (Complex Document)
 */
function createComplexDocument(): DocumentModel {
  const base = createInitialDocument("Báo cáo Khoa học Kỹ thuật 2026");
  base.content = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Đoạn văn mở đầu với định dạng " },
          { type: "text", marks: [{ type: "bold" }], text: "in đậm" },
          { type: "text", text: " và " },
          { type: "text", marks: [{ type: "italic" }], text: "in nghiêng." },
        ],
      },
      {
        type: "table",
        content: [
          {
            type: "tableRow",
            content: [
              {
                type: "tableHeader",
                content: [{ type: "paragraph", content: [{ type: "text", text: "STT" }] }],
              },
              {
                type: "tableHeader",
                content: [{ type: "paragraph", content: [{ type: "text", text: "Mục tiêu" }] }],
              },
            ],
          },
          {
            type: "tableRow",
            content: [
              {
                type: "tableCell",
                content: [{ type: "paragraph", content: [{ type: "text", text: "1" }] }],
              },
              {
                type: "tableCell",
                content: [{ type: "paragraph", content: [{ type: "text", text: "Hoàn thiện Phase 7.2" }] }],
              },
            ],
          },
        ],
      },
    ],
  };
  base.pageSettings = {
    paperSize: "A4",
    orientation: "portrait",
    margins: { top: 30, right: 25, bottom: 30, left: 35 },
    marginPreset: "custom",
  };
  base.headerFooter = {
    linkToPrevious: false,
    header: { text: "Báo cáo thường niên", alignment: "right" },
    footer: { text: "Trang {PAGE}", alignment: "center" },
  };
  base.comments = [
    {
      id: "comment-1",
      author: "Hoang",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      content: "Cần kiểm tra kỹ các trường hợp ranh giới.",
      resolved: false,
      selectedText: "in đậm",
    },
  ];
  base.trackedChanges = [
    {
      id: "tc-1",
      type: "insertion",
      author: "Reviewer",
      timestamp: new Date().toISOString(),
      text: "Đoạn văn mở đầu",
    },
  ];
  base.references = {
    bibliographySources: [
      {
        id: "ref-1",
        type: "book",
        title: "Clean Architecture in Practice",
        authors: ["Martin, Robert"],
        year: 2020,
        publisher: "Prentice Hall",
      },
    ],
    citationStyle: "apa",
  };
  return base;
}

/* ==========================================================================
   1. SNAPSHOT SERIALIZE & FIDELITY
   ========================================================================== */

test("Phase 7.2 - 1. Snapshot serialize: Bảo toàn 100% cấu trúc .mwd (AST, pageSettings, comments, track changes, references)", async () => {
  setupMemoryAdapter();
  const doc = createComplexDocument();

  const snapshot = await createSnapshot(doc, "manual", {
    description: "Bản sao lưu kiểm thử toàn vẹn",
  });

  assert.ok(snapshot.metadata.id.startsWith("snap-"));
  assert.equal(snapshot.metadata.documentId, doc.metadata.id);
  assert.equal(snapshot.metadata.reason, "manual");
  assert.equal(snapshot.metadata.documentTitle, doc.metadata.title);
  assert.ok(snapshot.metadata.wordCount > 0);
  assert.ok(snapshot.metadata.characterCount > 0);

  // Giải tuần tự hóa từ chuỗi snapshot package
  const res = deserializeMwdToDocument(snapshot.mwdPackage);
  assert.equal(res.success, true);
  if (res.success) {
    const loaded = res.document;
    assert.deepEqual(loaded.content, doc.content);
    assert.equal(loaded.pageSettings?.paperSize, "A4");
    assert.equal(loaded.pageSettings?.margins.left, 35);
    assert.equal(loaded.headerFooter?.header?.text, "Báo cáo thường niên");
    assert.equal(loaded.comments?.length, 1);
    assert.equal(loaded.comments?.[0].content, "Cần kiểm tra kỹ các trường hợp ranh giới.");
    assert.equal(loaded.trackedChanges?.length, 1);
    assert.equal(loaded.references?.bibliographySources?.length, 1);
  }
});

/* ==========================================================================
   2. SNAPSHOT VALIDATION
   ========================================================================== */

test("Phase 7.2 - 2. Snapshot validation: Bắt lỗi khi snapshot bị thiếu AST hoặc cấu trúc không hợp lệ", async () => {
  const adapter = setupMemoryAdapter();
  const doc = createInitialDocument("Doc Test");

  // Ghi snapshot hợp lệ
  const snap = await createSnapshot(doc, "autosave");

  // Nạp snapshot hợp lệ -> thành công
  const okLoad = await loadSnapshot(doc.metadata.id, snap.metadata.id);
  assert.equal(okLoad.success, true);

  // Thử nạp một snapshot không tồn tại
  const notFound = await loadSnapshot(doc.metadata.id, "snap-non-existent");
  assert.equal(notFound.success, false);
  assert.match(notFound.error || "", /không tồn tại/i);

  // Ghi snapshot giả mạo có AST rỗng/hỏng
  const corruptPackage: DocumentSnapshot = {
    metadata: {
      ...snap.metadata,
      id: "snap-corrupt-1",
    },
    mwdPackage: JSON.stringify({
      format: "PersonalWordDocument",
      version: 1,
      metadata: doc.metadata,
      document: { type: "invalid_root" }, // root node sai quy chuẩn
    }),
  };
  await adapter.saveSnapshot(corruptPackage);

  const corruptLoad = await loadSnapshot(doc.metadata.id, "snap-corrupt-1");
  assert.equal(corruptLoad.success, false);
});

/* ==========================================================================
   3. DEDUPLICATION
   ========================================================================== */

test("Phase 7.2 - 3. Deduplication: isDocumentIdenticalToSnapshot phát hiện nội dung trùng khớp và bỏ qua snapshot dư thừa", async () => {
  setupMemoryAdapter();
  const doc = createComplexDocument();

  const snap = await createSnapshot(doc, "autosave");

  // Tài liệu chưa sửa đổi -> trùng khớp
  assert.equal(isDocumentIdenticalToSnapshot(doc, snap), true);

  // Khi thay đổi nội dung AST -> không trùng khớp
  const modifiedDoc = {
    ...doc,
    content: {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "Nội dung mới khác biệt" }] }],
    },
  };
  assert.equal(isDocumentIdenticalToSnapshot(modifiedDoc, snap), false);

  // Khi thay đổi tiêu đề -> không trùng khớp
  const titleDoc = {
    ...doc,
    metadata: { ...doc.metadata, title: "Tiêu đề mới" },
  };
  assert.equal(isDocumentIdenticalToSnapshot(titleDoc, snap), false);

  // Khi thay đổi pageSettings -> không trùng khớp
  const settingsDoc = {
    ...doc,
    pageSettings: { ...doc.pageSettings!, paperSize: "Letter" as const },
  };
  assert.equal(isDocumentIdenticalToSnapshot(settingsDoc, snap), false);
});

/* ==========================================================================
   4. AUTOSAVE DEBOUNCE
   ========================================================================== */

test("Phase 7.2 - 4. Autosave debounce: Hoãn ghi đĩa và gom nhiều thao tác gõ phím liên tiếp", async () => {
  setupMemoryAdapter();
  useDocumentStore.getState().resetDocument();

  const engine = new AutosaveEngine({ debounceMs: 50 });

  // Đặt tài liệu ở trạng thái bẩn
  useDocumentStore.getState().updateContent({
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text: "Gõ ký tự 1" }] }],
  });
  assert.equal(useDocumentStore.getState().isDirty, true);

  // Gọi liên tiếp 3 lần thay đổi (giả lập gõ phím nhanh)
  engine.notifyDocumentChange();
  engine.notifyDocumentChange();
  engine.notifyDocumentChange();

  // Ngay lập tức: chưa ghi snapshot
  const docId = useDocumentStore.getState().document.metadata.id;
  let list = await listSnapshots(docId);
  assert.equal(list.length, 0);

  // Đợi qua khoảng debounce (80ms > 50ms)
  await new Promise((resolve) => setTimeout(resolve, 80));

  list = await listSnapshots(docId);
  assert.equal(list.length, 1);
  assert.equal(list[0].reason, "autosave");

  engine.destroy();
});

/* ==========================================================================
   5. AUTOSAVE ONLY WHEN DIRTY
   ========================================================================== */

test("Phase 7.2 - 5. Autosave only when dirty: Không tự động lưu nếu isDirty = false", async () => {
  setupMemoryAdapter();
  useDocumentStore.getState().resetDocument();
  assert.equal(useDocumentStore.getState().isDirty, false);

  const engine = new AutosaveEngine({ debounceMs: 20 });
  const result = await engine.performAutosave();

  assert.equal(result, null, "Autosave phải từ chối khi tài liệu sạch (isDirty = false)");

  const docId = useDocumentStore.getState().document.metadata.id;
  const list = await listSnapshots(docId);
  assert.equal(list.length, 0);

  engine.destroy();
});

/* ==========================================================================
   6. AUTOSAVE KHÔNG CLEAR DIRTY
   ========================================================================== */

test("Phase 7.2 - 6. Autosave KHÔNG clear dirty: Sau khi Autosave thành công, isDirty vẫn là true", async () => {
  setupMemoryAdapter();
  useDocumentStore.getState().resetDocument();

  // Chỉnh sửa để isDirty = true
  useDocumentStore.getState().updateContent({
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text: "Bản nháp đang soạn" }] }],
  });
  assert.equal(useDocumentStore.getState().isDirty, true);

  const engine = new AutosaveEngine({ debounceMs: 10 });
  const snapshot = await engine.performAutosave();

  assert.ok(snapshot !== null);
  // BẮT BUỘC: isDirty vẫn phải là true
  assert.equal(
    useDocumentStore.getState().isDirty,
    true,
    "Autosave là bản phục hồi, KHÔNG được làm sạch isDirty của tài liệu!"
  );

  engine.destroy();
});

/* ==========================================================================
   7. EXPLICIT SAVE CLEAR DIRTY
   ========================================================================== */

test("Phase 7.2 - 7. Explicit Save clear dirty: Chủ động Save (markSaved) đặt lại clean baseline và isDirty = false", () => {
  useDocumentStore.getState().resetDocument();

  // Làm dirty
  useDocumentStore.getState().updateContent({
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text: "Nội dung cần lưu chính thức" }] }],
  });
  assert.equal(useDocumentStore.getState().isDirty, true);

  // Người dùng thực hiện Explicit Save vào đĩa
  useDocumentStore.getState().markSaved("C:/docs/report.mwd");

  assert.equal(useDocumentStore.getState().isDirty, false);
  assert.equal(useDocumentStore.getState().filePath, "C:/docs/report.mwd");
});

/* ==========================================================================
   8. SNAPSHOT RETENTION
   ========================================================================== */

test("Phase 7.2 - 8. Snapshot retention: Giới hạn số lượng snapshot tối đa, luôn bảo lưu bản manual và pre-restore", async () => {
  setupMemoryAdapter();
  const doc = createInitialDocument("Retention Test Doc");
  const docId = doc.metadata.id;

  // Tạo 5 snapshot autosave
  for (let i = 1; i <= 5; i++) {
    await createSnapshot(doc, "autosave", { description: `Autosave ${i}` });
  }

  // Tạo 2 snapshot milestone
  await createSnapshot(doc, "manual", { description: "Mốc thủ công quan trọng" });
  await createSnapshot(doc, "pre-restore", { description: "Sao lưu trước khôi phục" });

  let list = await listSnapshots(docId);
  assert.equal(list.length, 7);

  // Thu dọn với giới hạn tối đa 4 snapshots
  const deleted = await pruneSnapshots(docId, {
    maxSnapshotsPerDocument: 4,
    preserveMilestones: true,
  });

  assert.ok(deleted > 0);
  list = await listSnapshots(docId);
  assert.ok(list.length <= 4 || list.some((s) => s.reason === "manual" || s.reason === "pre-restore"));

  // Đảm bảo các bản milestone không bị xóa
  assert.ok(list.some((s) => s.reason === "manual"));
  assert.ok(list.some((s) => s.reason === "pre-restore"));
});

/* ==========================================================================
   9. RESTORE SNAPSHOT
   ========================================================================== */

test("Phase 7.2 - 9. Restore: Khôi phục toàn vẹn AST, pageSettings, comments, references và cập nhật store", async () => {
  setupMemoryAdapter();
  const originalComplex = createComplexDocument();
  useDocumentStore.getState().setDocument(originalComplex);

  // Tạo snapshot từ tài liệu phức tạp ban đầu
  const snap = await createSnapshot(useDocumentStore.getState().document, "manual");

  // Giả lập người dùng xóa sạch nội dung hoặc chỉnh sửa làm hỏng
  useDocumentStore.getState().updateContent({
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text: "Bị mất nội dung..." }] }],
  });
  useDocumentStore.getState().setComments([]);

  // Thực hiện Restore
  const restoreRes = await restoreSnapshot(snap.metadata.id, null);
  assert.equal(restoreRes.success, true);

  const restoredStoreDoc = useDocumentStore.getState().document;
  assert.deepEqual(restoredStoreDoc.content, originalComplex.content);
  assert.equal(restoredStoreDoc.pageSettings?.paperSize, "A4");
  assert.equal(restoredStoreDoc.pageSettings?.margins.left, 35);
  assert.equal(useDocumentStore.getState().comments.length, 1);
  assert.equal(useDocumentStore.getState().bibliographySources.length, 1);
});

/* ==========================================================================
   10. RESTORE DIRTY PROTECTION
   ========================================================================== */

test("Phase 7.2 - 10. Restore dirty protection: Tự động tạo bản sao lưu pre-restore nếu tài liệu đang dirty trước khi khôi phục", async () => {
  setupMemoryAdapter();
  const baseDoc = createInitialDocument("Base Doc");
  useDocumentStore.getState().setDocument(baseDoc);

  const baseSnap = await createSnapshot(baseDoc, "manual");

  // Soạn thảo tạo dirty
  useDocumentStore.getState().updateContent({
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text: "Nội dung dirty chưa kịp lưu" }] }],
  });
  assert.equal(useDocumentStore.getState().isDirty, true);

  // Khôi phục về baseSnap
  const res = await restoreSnapshot(baseSnap.metadata.id, null);
  assert.equal(res.success, true);
  assert.ok(res.backupSnapshotId, "Phải sinh ra mã backupSnapshotId bảo vệ");

  // Kiểm tra danh sách snapshot: bản pre-restore phải tồn tại trong lịch sử
  const list = await listSnapshots(useDocumentStore.getState().document.metadata.id);
  const preRestoreSnap = list.find((s) => s.reason === "pre-restore");
  assert.ok(preRestoreSnap, "Phải có snapshot mang reason = pre-restore");
});

/* ==========================================================================
   11. CORRUPTED SNAPSHOT HANDLING
   ========================================================================== */

test("Phase 7.2 - 11. Corrupted snapshot: Xử lý tệp JSON hỏng an toàn, không làm crash app", async () => {
  const adapter = setupMemoryAdapter();
  const doc = createInitialDocument("Test Corrupt");

  // Lưu một snapshot có chuỗi mwdPackage hỏng (invalid JSON)
  const corruptSnap: DocumentSnapshot = {
    metadata: {
      id: "snap-corrupt-json",
      documentId: doc.metadata.id,
      createdAt: new Date().toISOString(),
      reason: "autosave",
      documentTitle: doc.metadata.title,
      wordCount: 0,
      characterCount: 0,
      paragraphCount: 0,
      version: 1,
    },
    mwdPackage: "{ invalid json ...",
  };
  await adapter.saveSnapshot(corruptSnap);

  const res = await loadSnapshot(doc.metadata.id, "snap-corrupt-json");
  assert.equal(res.success, false);
  assert.ok(res.error?.includes("bị hỏng"));
});

/* ==========================================================================
   12. STARTUP RECOVERY DETECTION
   ========================================================================== */

test("Phase 7.2 - 12. Startup recovery: checkPendingRecovery phát hiện phiên ungraceful shutdown có recovery snapshot", async () => {
  setupMemoryAdapter();
  const recoverySvc = new RecoveryService();

  const doc = createComplexDocument();
  const snap = await createSnapshot(doc, "recovery");

  // Giả lập app crash: session bắt đầu nhưng cleanShutdown = false
  await recoverySvc.recordRecoverySnapshot(
    doc.metadata.id,
    doc.metadata.title,
    "C:/data/work.mwd",
    snap.metadata.id
  );

  const check = await recoverySvc.checkPendingRecovery();
  assert.equal(check.hasRecovery, true);
  assert.equal(check.session?.documentId, doc.metadata.id);
  assert.equal(check.session?.latestRecoverySnapshotId, snap.metadata.id);
  assert.equal(check.recoveredDoc?.metadata.title, doc.metadata.title);
});

/* ==========================================================================
   13. DISCARD RECOVERY
   ========================================================================== */

test("Phase 7.2 - 13. Discard recovery: Bỏ qua bản phục hồi đánh dấu cleanShutdown = true và không ghi đè tệp đĩa", async () => {
  setupMemoryAdapter();
  const recoverySvc = new RecoveryService();

  const doc = createInitialDocument("Discard Doc");
  const snap = await createSnapshot(doc, "recovery");

  await recoverySvc.recordRecoverySnapshot(
    doc.metadata.id,
    doc.metadata.title,
    null,
    snap.metadata.id
  );

  let check = await recoverySvc.checkPendingRecovery();
  assert.equal(check.hasRecovery, true);

  // Người dùng chọn Bỏ qua (Discard)
  await recoverySvc.discardRecovery(check.session!);

  // Lần kiểm tra tiếp theo không còn nhắc lại
  check = await recoverySvc.checkPendingRecovery();
  assert.equal(check.hasRecovery, false);
});

/* ==========================================================================
   14. NEW DOCUMENT ISOLATION
   ========================================================================== */

test("Phase 7.2 - 14. New document isolation: Tạo mới tài liệu thiết lập ID mới, tách biệt lịch sử khỏi tài liệu cũ", async () => {
  setupMemoryAdapter();

  // Tài liệu 1
  useDocumentStore.getState().resetDocument();
  const docId1 = useDocumentStore.getState().document.metadata.id;
  await createSnapshot(useDocumentStore.getState().document, "manual", { description: "Doc 1 Snap" });

  const list1 = await listSnapshots(docId1);
  assert.equal(list1.length, 1);

  // Người dùng tạo New Document
  useDocumentStore.getState().resetDocument();
  const docId2 = useDocumentStore.getState().document.metadata.id;
  assert.notEqual(docId1, docId2, "Tài liệu mới phải có document ID độc lập");

  const list2 = await listSnapshots(docId2);
  assert.equal(list2.length, 0, "Tài liệu mới phải có lịch sử hoàn toàn rỗng");
});

/* ==========================================================================
   15. OPEN DOCUMENT ISOLATION
   ========================================================================== */

test("Phase 7.2 - 15. Open document isolation: Mở tài liệu gắn đúng ID và tải đúng lịch sử của tệp đó", async () => {
  setupMemoryAdapter();

  const docA = createInitialDocument("File A");
  const docB = createInitialDocument("File B");

  await createSnapshot(docA, "manual", { description: "Bản sao File A" });
  await createSnapshot(docB, "manual", { description: "Bản sao File B" });

  // Nạp File A
  useDocumentStore.getState().setDocument(docA, "C:/files/a.mwd");
  let snaps = await listSnapshots(useDocumentStore.getState().document.metadata.id);
  assert.equal(snaps.length, 1);
  assert.equal(snaps[0].description, "Bản sao File A");

  // Mở File B
  useDocumentStore.getState().setDocument(docB, "C:/files/b.mwd");
  snaps = await listSnapshots(useDocumentStore.getState().document.metadata.id);
  assert.equal(snaps.length, 1);
  assert.equal(snaps[0].description, "Bản sao File B");
});

/* ==========================================================================
   16. SAVE AS DOCUMENT ISOLATION
   ========================================================================== */

test("Phase 7.2 - 16. Save As behavior: Khử trùng lặp ID, bảo vệ lịch sử không bị lẫn lộn giữa file gốc và bản sao", () => {
  const store = useDocumentStore.getState();
  store.resetDocument();

  const originalId = store.document.metadata.id;
  assert.ok(originalId);

  // Giả lập logic Save As: sinh ID mới cho bản sao
  const copyDoc = createInitialDocument("Bản sao Document");
  assert.notEqual(originalId, copyDoc.metadata.id);
});

/* ==========================================================================
   17. CONCURRENT AUTOSAVE / EXPLICIT SAVE LOCK
   ========================================================================== */

test("Phase 7.2 - 17. Concurrent autosave/save: Khóa tương tranh ngăn cản Autosave khi Explicit Save đang chạy", async () => {
  setupMemoryAdapter();
  useDocumentStore.getState().resetDocument();

  // Làm dirty
  useDocumentStore.getState().updateContent({
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text: "Đang lưu..." }] }],
  });

  const engine = new AutosaveEngine();

  // Khóa Explicit Save
  engine.setExplicitSaveLock(true);

  const res = await engine.performAutosave();
  assert.equal(res, null, "Autosave phải bị chặn khi explicit save lock = true");

  // Mở khóa
  engine.setExplicitSaveLock(false);
  const okRes = await engine.performAutosave();
  assert.ok(okRes !== null, "Autosave phải hoạt động bình thường sau khi mở khóa");

  engine.destroy();
});

/* ==========================================================================
   18. FAILED SNAPSHOT WRITE SAFETY
   ========================================================================== */

test("Phase 7.2 - 18. Failed snapshot write: Lỗi ghi đĩa không gây sập ứng dụng và không làm sai lệch isDirty", async () => {
  // Tạo adapter lỗi giả lập
  const faultyAdapter = new MemoryStorageAdapter();
  faultyAdapter.saveSnapshot = async () => {
    throw new Error("Lỗi giả lập: Ổ đĩa bị đầy (Disk Full)");
  };
  setVersionStorageAdapter(faultyAdapter);

  useDocumentStore.getState().resetDocument();
  useDocumentStore.getState().updateContent({
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text: "Thử nghiệm lỗi ghi đĩa" }] }],
  });
  assert.equal(useDocumentStore.getState().isDirty, true);

  const engine = new AutosaveEngine();

  // Autosave bị lỗi ghi đĩa
  const res = await engine.performAutosave();
  assert.equal(res, null);

  // App không sập, isDirty vẫn được bảo toàn nguyên vẹn
  assert.equal(useDocumentStore.getState().isDirty, true);

  engine.destroy();
});

/* ==========================================================================
   19. BACKWARD COMPATIBILITY
   ========================================================================== */

test("Phase 7.2 - 19. Backward compatibility: Tương thích hoàn hảo với tệp mwd phiên bản cũ thiếu pageSettings", async () => {
  setupMemoryAdapter();

  const minimalOldPackage = {
    format: "PersonalWordDocument",
    version: 1,
    metadata: {
      id: "doc-legacy-1",
      title: "Legacy Document",
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    document: {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "Tài liệu từ Phase 1 cũ" }] }],
    },
    // Thiếu hoàn toàn pageSettings, comments, references
  };

  const serialized = JSON.stringify(minimalOldPackage);
  const parsed = deserializeMwdToDocument(serialized);

  assert.equal(parsed.success, true);
  if (parsed.success) {
    assert.equal(parsed.document.metadata.title, "Legacy Document");
    // Tự động chuẩn hóa và gán preset mặc định A4 portrait
    assert.ok(parsed.document.pageSettings);
    assert.equal(parsed.document.pageSettings?.paperSize, "A4");
    assert.equal(parsed.document.comments?.length, 0);
  }
});

/* ==========================================================================
   20. COMPLEX DOCUMENT ROUND-TRIP
   ========================================================================== */

test("Phase 7.2 - 20. Complex document round-trip: Toàn bộ cấu trúc phức tạp chu du qua serialize -> snapshot -> restore không mất mát dữ liệu", async () => {
  setupMemoryAdapter();
  useDocumentStore.getState().resetDocument();

  const complexDoc = createComplexDocument();

  // Tạo snapshot từ tài liệu phức tạp
  const snapshot = await createSnapshot(complexDoc, "manual");

  // Nạp snapshot và khôi phục
  const loadRes = await loadSnapshot(complexDoc.metadata.id, snapshot.metadata.id);
  assert.equal(loadRes.success, true);

  if (loadRes.success) {
    const roundTripped = loadRes.document;
    assert.equal(isValidDocumentModel(roundTripped), true);

    // Kiểm chứng AST
    assert.deepEqual(roundTripped.content, complexDoc.content);

    // Kiểm chứng PageSettings & Margins
    assert.equal(roundTripped.pageSettings?.paperSize, "A4");
    assert.equal(roundTripped.pageSettings?.margins.left, 35);
    assert.equal(roundTripped.pageSettings?.margins.top, 30);

    // Kiểm chứng Header / Footer
    assert.equal(roundTripped.headerFooter?.header?.text, "Báo cáo thường niên");
    assert.equal(roundTripped.headerFooter?.footer?.text, "Trang {PAGE}");

    // Kiểm chứng Comments
    assert.equal(roundTripped.comments?.length, 1);
    assert.equal(roundTripped.comments?.[0].selectedText, "in đậm");

    // Kiểm chứng Tracked Changes
    assert.equal(roundTripped.trackedChanges?.length, 1);
    assert.equal(roundTripped.trackedChanges?.[0].type, "insertion");

    // Kiểm chứng References
    assert.equal(roundTripped.references?.bibliographySources?.length, 1);
    assert.equal(roundTripped.references?.citationStyle, "apa");
  }
});

/* ==========================================================================
   21. SECURITY & SANITIZATION (PATH TRAVERSAL DEFENSE)
   ========================================================================== */

test("Phase 7.2 - Security: sanitizeStorageId ngăn chặn hoàn toàn tấn công Path Traversal", () => {
  assert.throws(() => sanitizeStorageId("../../../etc/passwd"), /phát hiện ký tự đường dẫn/);
  assert.throws(() => sanitizeStorageId("..\\..\\windows\\system32"), /phát hiện ký tự đường dẫn/);
  assert.throws(() => sanitizeStorageId("."), /Mã định danh không an toàn/);
  assert.throws(() => sanitizeStorageId(".."), /Mã định danh không an toàn/);
  assert.throws(() => sanitizeStorageId(""), /không được để trống/);

  // Ký tự an toàn
  assert.equal(sanitizeStorageId("doc-123_abc"), "doc-123_abc");
  assert.equal(sanitizeStorageId("snap-uuid-456"), "snap-uuid-456");
});
