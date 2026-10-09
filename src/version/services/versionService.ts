import type { Editor } from "@tiptap/core";
import type {
  DocumentSnapshot,
  DocumentSnapshotMetadata,
  SnapshotReason,
  RetentionPolicyConfig,
  RestoreResult,
} from "../types.ts";
import type { DocumentModel } from "../../document/documentTypes.ts";
import {
  serializeDocumentToMwd,
  deserializeMwdToDocument,
} from "../../document/documentFile.ts";
import {
  isValidDocumentModel,
  extractDocumentStats,
} from "../../document/documentModel.ts";
import { useDocumentStore } from "../../stores/documentStore.ts";
import { getVersionStorageAdapter } from "../storage/storageFactory.ts";
import { validateAndNormalizePageSettings } from "../../page/index.ts";
import { extractSections } from "../../page/services/sectionService.ts";
import { DEFAULT_SECTION_HEADER_FOOTER } from "../../page/types/headerFooterTypes.ts";
import { ReferencePersistenceService } from "../../references/services/referencePersistenceService.ts";

export const DEFAULT_RETENTION_POLICY: RetentionPolicyConfig = {
  maxSnapshotsPerDocument: 20,
  preserveMilestones: true,
};

/**
 * Sinh UUID ngẫu nhiên cho snapshot (snap-xxx).
 */
export function generateSnapshotId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `snap-${crypto.randomUUID()}`;
  }
  return `snap-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * So sánh ngữ nghĩa 2 tài liệu để kiểm tra trùng lặp (Deduplication).
 * Tránh ghi đĩa snapshot nếu nội dung không có bất kỳ thay đổi nào.
 */
export function isDocumentIdenticalToSnapshot(
  doc: DocumentModel,
  snapshot: DocumentSnapshot
): boolean {
  try {
    const res = deserializeMwdToDocument(snapshot.mwdPackage);
    if (!res.success) return false;
    const snapDoc = res.document;

    const currentContentJson = JSON.stringify(doc.content);
    const snapContentJson = JSON.stringify(snapDoc.content);
    if (currentContentJson !== snapContentJson) return false;

    if (doc.metadata.title !== snapDoc.metadata.title) return false;

    const currentPageSettingsJson = JSON.stringify(validateAndNormalizePageSettings(doc.pageSettings));
    const snapPageSettingsJson = JSON.stringify(validateAndNormalizePageSettings(snapDoc.pageSettings));
    if (currentPageSettingsJson !== snapPageSettingsJson) return false;

    const currentCommentsJson = JSON.stringify(doc.comments ?? []);
    const snapCommentsJson = JSON.stringify(snapDoc.comments ?? []);
    if (currentCommentsJson !== snapCommentsJson) return false;

    const normalizeTracked = (items?: any[]) =>
      (items ?? []).map((t) => ({
        id: t.id,
        type: t.type,
        author: t.author,
        text: t.text ?? "",
      }));
    if (
      JSON.stringify(normalizeTracked(doc.trackedChanges)) !==
      JSON.stringify(normalizeTracked(snapDoc.trackedChanges))
    ) {
      return false;
    }

    const currentRefs = ReferencePersistenceService.reconcileReferencesMetadata(doc.content, doc.references);
    const snapRefs = ReferencePersistenceService.reconcileReferencesMetadata(snapDoc.content, snapDoc.references);
    const currentRefsJson = JSON.stringify(currentRefs ?? {});
    const snapRefsJson = JSON.stringify(snapRefs ?? {});
    if (currentRefsJson !== snapRefsJson) return false;

    return true;
  } catch {
    return false;
  }
}

/**
 * Tạo một bản chụp snapshot mới cho tài liệu và lưu vào vùng lưu trữ phục hồi.
 */
export async function createSnapshot(
  doc: DocumentModel,
  reason: SnapshotReason,
  options?: {
    description?: string;
    filePath?: string | null;
    retentionPolicy?: Partial<RetentionPolicyConfig>;
  }
): Promise<DocumentSnapshot> {
  const adapter = getVersionStorageAdapter();
  await adapter.init();

  const snapshotId = generateSnapshotId();
  const now = new Date().toISOString();
  const stats = extractDocumentStats(doc.content);
  const serialized = serializeDocumentToMwd(doc);

  const metadata: DocumentSnapshotMetadata = {
    id: snapshotId,
    documentId: doc.metadata.id,
    createdAt: now,
    reason,
    documentTitle: doc.metadata.title,
    originalFilePath: options?.filePath ?? null,
    wordCount: stats.words,
    characterCount: stats.characters,
    paragraphCount: stats.paragraphs,
    version: doc.metadata.version,
    description: options?.description,
  };

  const snapshot: DocumentSnapshot = {
    metadata,
    mwdPackage: serialized,
  };

  await adapter.saveSnapshot(snapshot);

  // Áp dụng Retention Policy sau khi ghi thành công snapshot mới
  try {
    await pruneSnapshots(doc.metadata.id, options?.retentionPolicy);
  } catch (err) {
    console.warn("Lỗi khi áp dụng snapshot retention policy:", err);
  }

  return snapshot;
}

/**
 * Nạp và kiểm tra tính toàn vẹn của một bản chụp snapshot.
 */
export async function loadSnapshot(
  documentId: string,
  snapshotId: string
): Promise<
  | { success: true; document: DocumentModel; snapshot: DocumentSnapshot }
  | { success: false; error: string }
> {
  const adapter = getVersionStorageAdapter();
  await adapter.init();

  const snapshot = await adapter.getSnapshot(documentId, snapshotId);
  if (!snapshot) {
    return { success: false, error: "Bản chụp không tồn tại hoặc đã bị xóa." };
  }

  const result = deserializeMwdToDocument(snapshot.mwdPackage);
  if (!result.success) {
    return {
      success: false,
      error: `Bản chụp bị hỏng hoặc định dạng không hợp lệ: ${result.error}`,
    };
  }

  if (!isValidDocumentModel(result.document)) {
    return {
      success: false,
      error: "Dữ liệu bản chụp không cấu thành DocumentModel hợp lệ.",
    };
  }

  return {
    success: true,
    document: result.document,
    snapshot,
  };
}

/**
 * Lấy danh sách metadata của các bản chụp thuộc về một tài liệu, sắp xếp theo thời gian mới nhất.
 */
export async function listSnapshots(documentId: string): Promise<DocumentSnapshotMetadata[]> {
  const adapter = getVersionStorageAdapter();
  await adapter.init();
  return adapter.listSnapshots(documentId);
}

/**
 * Xóa một bản chụp snapshot cụ thể.
 */
export async function deleteSnapshot(documentId: string, snapshotId: string): Promise<void> {
  const adapter = getVersionStorageAdapter();
  await adapter.init();
  await adapter.deleteSnapshot(documentId, snapshotId);
}

/**
 * Thu dọn (prune) các bản chụp cũ theo chính sách lưu giữ (Retention Policy).
 * Không xóa bản chụp phục hồi hiện tại hoặc bản chụp quan trọng (manual, pre-restore) nếu preserveMilestones = true.
 */
export async function pruneSnapshots(
  documentId: string,
  policyConfig?: Partial<RetentionPolicyConfig>
): Promise<number> {
  const config = { ...DEFAULT_RETENTION_POLICY, ...policyConfig };
  const adapter = getVersionStorageAdapter();
  await adapter.init();

  const snapshots = await adapter.listSnapshots(documentId);
  if (snapshots.length <= config.maxSnapshotsPerDocument) {
    return 0;
  }

  // Sắp xếp thời gian từ cũ nhất đến mới nhất
  const sorted = [...snapshots].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  let deleteCount = 0;
  let currentTotal = snapshots.length;

  for (const snap of sorted) {
    if (currentTotal <= config.maxSnapshotsPerDocument) {
      break;
    }

    // Nếu cấu hình bảo lưu milestones: giữ lại manual và pre-restore
    if (config.preserveMilestones && (snap.reason === "manual" || snap.reason === "pre-restore")) {
      continue;
    }

    await adapter.deleteSnapshot(documentId, snap.id);
    deleteCount++;
    currentTotal--;
  }

  return deleteCount;
}

/**
 * Khôi phục tài liệu về một bản chụp lịch sử.
 * - Nếu tài liệu hiện tại đang có thay đổi chưa lưu (isDirty): tự động tạo bản chụp "pre-restore" trước khi khôi phục để bảo vệ dữ liệu.
 * - Khôi phục đầy đủ AST, page settings, headers/footers, comments, tracked changes, references.
 * - Cập nhật editor ProseMirror.
 * - Đánh giá lại isDirty: Restore KHÔNG giả định = Save! Nếu khác bản lưu đĩa gốc (lastSavedSnapshot), isDirty = true.
 */
export async function restoreSnapshot(
  snapshotId: string,
  editor: Editor | null
): Promise<RestoreResult> {
  const store = useDocumentStore.getState();
  const currentDoc = store.document;
  const currentDocId = currentDoc.metadata.id;

  // 1. Tải và kiểm chứng bản snapshot
  const loadRes = await loadSnapshot(currentDocId, snapshotId);
  if (!loadRes.success) {
    return { success: false, error: loadRes.error };
  }

  const restoredDoc = loadRes.document;

  // 2. Bảo vệ dữ liệu hiện tại nếu đang Dirty: tạo snapshot "pre-restore"
  let backupSnapshotId: string | undefined;
  if (store.isDirty) {
    try {
      const backupSnap = await createSnapshot(currentDoc, "pre-restore", {
        description: `Bản sao lưu an toàn trước khi khôi phục snapshot ${snapshotId}`,
        filePath: store.filePath,
      });
      backupSnapshotId = backupSnap.metadata.id;
    } catch (err) {
      console.warn("Không thể tạo bản sao lưu pre-restore:", err);
    }
  }

  // 3. Chuẩn hóa và nạp tài liệu phục hồi vào Document Store
  const pageSettings = validateAndNormalizePageSettings(restoredDoc.pageSettings);
  const headerFooter = restoredDoc.headerFooter || DEFAULT_SECTION_HEADER_FOOTER;
  const sections = extractSections(restoredDoc.content, pageSettings, headerFooter);
  const comments = restoredDoc.comments ?? [];
  const trackedChanges = restoredDoc.trackedChanges ?? [];
  const bibliographySources = restoredDoc.references?.bibliographySources ?? [];
  const citationStyle = restoredDoc.references?.citationStyle ?? "apa";

  const normalizedRestored: DocumentModel = {
    ...restoredDoc,
    metadata: {
      ...restoredDoc.metadata,
      id: currentDocId, // Giữ nguyên ID phiên làm việc của document
    },
    pageSettings,
    headerFooter,
    sections,
    comments,
    trackedChanges,
    references: {
      ...(restoredDoc.references || {}),
      bibliographySources,
      citationStyle,
    },
  };

  // 4. Đánh giá tính Dirty so với bản lưu đĩa chính thức (lastSavedSnapshot)
  const restoredContentJson = JSON.stringify(normalizedRestored.content);
  const restoredSettingsJson = JSON.stringify(pageSettings);
  const isDirtyAfterRestore =
    restoredContentJson !== store.lastSavedSnapshot.contentJson ||
    normalizedRestored.metadata.title !== store.lastSavedSnapshot.title ||
    restoredSettingsJson !== store.lastSavedSnapshot.pageSettingsJson;

  useDocumentStore.setState({
    document: normalizedRestored,
    pageSettings,
    headerFooter: sections[0]?.headerFooter || headerFooter,
    sections,
    currentSectionIndex: 1,
    documentTitle: normalizedRestored.metadata.title,
    stats: extractDocumentStats(normalizedRestored.content),
    comments,
    trackedChanges,
    bibliographySources,
    citationStyle,
    isModified: isDirtyAfterRestore,
    isDirty: isDirtyAfterRestore,
  });

  // 5. Cập nhật nội dung lên Tiptap Editor
  if (editor) {
    editor.commands.setContent(normalizedRestored.content);
    editor.commands.focus();
  }

  return {
    success: true,
    backupSnapshotId,
  };
}
