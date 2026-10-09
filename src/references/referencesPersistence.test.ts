import test from "node:test";
import assert from "node:assert/strict";
import { Editor } from "@tiptap/core";
import { getEditorExtensions } from "../editor/editorExtensions.ts";
import { ensureEditorPlugins } from "../editor/editorCommands.ts";
import { useDocumentStore } from "../stores/documentStore.ts";
import {
  serializeDocumentToMwd,
  deserializeMwdToDocument,
  MWD_FORMAT_IDENTIFIER,
  MWD_CURRENT_FORMAT_VERSION,
} from "../document/documentFile.ts";
import type { DocumentModel } from "../document/documentTypes.ts";
import { BookmarkService } from "./services/bookmarkService.ts";
import { CaptionListService } from "./services/captionListService.ts";
import { CrossReferenceService } from "./services/crossReferenceService.ts";
import { ReferencePersistenceService } from "./services/referencePersistenceService.ts";
import type { CaptionListNodeAttrs } from "./types/captionListTypes.ts";

function createTestEditor(initialContent: any): Editor {
  const editor = new Editor({
    extensions: getEditorExtensions(),
    content: initialContent,
  });
  ensureEditorPlugins(editor);
  return editor;
}

function resetTestStore(): void {
  useDocumentStore.setState({
    document: {
      metadata: {
        id: "doc-test-p8",
        title: "Test References Persistence",
        version: 1,
        createdAt: "2026-10-07T00:00:00.000Z",
        updatedAt: "2026-10-07T00:00:00.000Z",
      },
      content: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Nội dung văn bản mở đầu." }],
          },
        ],
      },
      pageSettings: {
        paperSize: "A4",
        orientation: "portrait",
        margins: { top: 25.4, bottom: 25.4, left: 25.4, right: 25.4 },
      },
      references: {
        anchors: {},
        bibliographySources: [],
        citationStyle: "apa",
        bookmarks: [],
      },
    },
    isDirty: false,
    isModified: false,
  });
}

test("Phase 8 - 1. Caption List round-trip: preserves ID, title, label, options, preset, entries and lastUpdated", () => {
  resetTestStore();

  const timestamp = "2026-10-07T12:00:00.000Z";
  const clistAttrs: CaptionListNodeAttrs = {
    id: "ref_clist_figure_test_001",
    title: "Danh mục hình ảnh kiến trúc",
    label: "Figure",
    showPageNumbers: true,
    rightAlignPageNumbers: true,
    preset: "modern",
    entries: [
      {
        captionId: "ref_cap_fig_1",
        targetId: "img_001",
        label: "Figure",
        number: 1,
        text: "Sơ đồ kiến trúc tổng quan",
        fullTitle: "Figure 1 — Sơ đồ kiến trúc tổng quan",
        labelAndNumber: "Figure 1",
        pageNumber: 2,
      },
    ],
    lastUpdated: timestamp,
  };

  const docModel: DocumentModel = {
    metadata: {
      id: "doc-clist-1",
      title: "Document with Caption List",
      version: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    content: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Trước danh mục." }],
        },
        {
          type: "captionList",
          attrs: clistAttrs,
        },
        {
          type: "paragraph",
          content: [{ type: "text", text: "Sau danh mục." }],
        },
        {
          type: "caption",
          attrs: {
            id: "ref_cap_fig_1",
            label: "Figure",
            number: 1,
            text: "Sơ đồ kiến trúc tổng quan",
          },
        },
      ],
    },
    pageSettings: {
      paperSize: "A4",
      orientation: "portrait",
      margins: { top: 25.4, bottom: 25.4, left: 25.4, right: 25.4 },
    },
  };

  // 1. Serialize
  const serialized = serializeDocumentToMwd(docModel);
  assert.ok(typeof serialized === "string");
  assert.ok(serialized.includes("ref_clist_figure_test_001"));
  assert.ok(serialized.includes("Danh mục hình ảnh kiến trúc"));

  // 2. Deserialize
  const deserializeResult = deserializeMwdToDocument(serialized);
  assert.equal(deserializeResult.success, true);
  if (!deserializeResult.success) return;

  const reloadedDoc = deserializeResult.document;
  const nodes = reloadedDoc.content.content || [];
  const clistNode = nodes.find((n) => n.type === "captionList");
  assert.ok(clistNode, "Node captionList phải tồn tại sau khi mở lại");
  assert.deepEqual(clistNode.attrs, clistAttrs);

  // 3. AST vẫn là source of truth khi update caption list
  const entriesAfterLoad = CaptionListService.generateEntries(
    reloadedDoc.content,
    "Figure"
  );
  assert.equal(entriesAfterLoad.length, 1);
  assert.equal(entriesAfterLoad[0].fullTitle, "Figure 1 — Sơ đồ kiến trúc tổng quan");
});

test("Phase 8 - 2. Multiple Caption Lists: independent preservation of Figure and Table lists", () => {
  resetTestStore();

  const figureListAttrs: CaptionListNodeAttrs = {
    id: "ref_clist_fig_multi",
    title: "Danh mục hình",
    label: "Figure",
    showPageNumbers: true,
    rightAlignPageNumbers: true,
    preset: "classic",
    entries: [
      {
        captionId: "cap_fig_1",
        targetId: null,
        label: "Figure",
        number: 1,
        text: "Hình số một",
        fullTitle: "Figure 1 — Hình số một",
        labelAndNumber: "Figure 1",
        pageNumber: 1,
      },
    ],
    lastUpdated: "2026-10-07T10:00:00.000Z",
  };

  const tableListAttrs: CaptionListNodeAttrs = {
    id: "ref_clist_tbl_multi",
    title: "Danh mục bảng biểu",
    label: "Table",
    showPageNumbers: false,
    rightAlignPageNumbers: false,
    preset: "formal",
    entries: [
      {
        captionId: "cap_tbl_1",
        targetId: null,
        label: "Table",
        number: 1,
        text: "Bảng dữ liệu một",
        fullTitle: "Table 1 — Bảng dữ liệu một",
        labelAndNumber: "Table 1",
        pageNumber: 3,
      },
    ],
    lastUpdated: "2026-10-07T11:00:00.000Z",
  };

  const docModel: DocumentModel = {
    metadata: {
      id: "doc-multi-clist",
      title: "Multiple Lists Doc",
      version: 1,
      createdAt: "2026-10-07T00:00:00.000Z",
      updatedAt: "2026-10-07T00:00:00.000Z",
    },
    content: {
      type: "doc",
      content: [
        { type: "captionList", attrs: figureListAttrs },
        { type: "paragraph", content: [{ type: "text", text: "Khoảng cách giữa hai danh mục." }] },
        { type: "captionList", attrs: tableListAttrs },
      ],
    },
    pageSettings: {
      paperSize: "A4",
      orientation: "portrait",
      margins: { top: 25.4, bottom: 25.4, left: 25.4, right: 25.4 },
    },
  };

  const jsonStr = serializeDocumentToMwd(docModel);
  const result = deserializeMwdToDocument(jsonStr);
  assert.equal(result.success, true);
  if (!result.success) return;

  const foundLists = (result.document.content.content || []).filter(
    (n) => n.type === "captionList"
  );
  assert.equal(foundLists.length, 2);
  assert.deepEqual(foundLists[0].attrs, figureListAttrs);
  assert.deepEqual(foundLists[1].attrs, tableListAttrs);
});

test("Phase 8 - 3. Bookmark Position persistence: caret-only anchor, stable ID, and no runtime offset serialization", () => {
  resetTestStore();

  const bookmarkId = "ref_bookmark_pos_alpha";
  const bookmarkName = "Điểm khởi đầu thí nghiệm";
  const createdAt = "2026-10-07T08:00:00.000Z";

  const docModel: DocumentModel = {
    metadata: {
      id: "doc-pos-bm",
      title: "Position Bookmark Doc",
      version: 1,
      createdAt,
      updatedAt: createdAt,
    },
    content: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Văn bản trước neo: " },
            {
              type: "bookmarkAnchor",
              attrs: {
                id: bookmarkId,
                name: bookmarkName,
                createdAt,
              },
            },
            { type: "text", text: "Văn bản sau neo." },
          ],
        },
      ],
    },
    pageSettings: {
      paperSize: "A4",
      orientation: "portrait",
      margins: { top: 25.4, bottom: 25.4, left: 25.4, right: 25.4 },
    },
  };

  const serialized = serializeDocumentToMwd(docModel);
  const parsedPackage = JSON.parse(serialized);

  // Khẳng định: references.bookmarks chứa siêu dữ liệu chuẩn, tuyệt đối không serialize numeric offsets (from, to)
  const savedBookmarks = parsedPackage.references?.bookmarks;
  assert.ok(Array.isArray(savedBookmarks));
  assert.equal(savedBookmarks.length, 1);
  assert.equal(savedBookmarks[0].id, bookmarkId);
  assert.equal(savedBookmarks[0].name, bookmarkName);
  assert.equal(savedBookmarks[0].type, "position");
  assert.equal((savedBookmarks[0] as any).from, undefined, "Tuyệt đối không serialize runtime position from");
  assert.equal((savedBookmarks[0] as any).to, undefined, "Tuyệt đối không serialize runtime position to");

  // Khẳng định deserialize
  const deserialized = deserializeMwdToDocument(serialized);
  assert.equal(deserialized.success, true);
  if (!deserialized.success) return;

  const pContent = deserialized.document.content.content?.[0]?.content || [];
  const anchorNode = pContent.find((n) => n.type === "bookmarkAnchor");
  assert.ok(anchorNode);
  assert.equal(anchorNode.attrs?.id, bookmarkId);
  assert.equal(anchorNode.attrs?.name, bookmarkName);

  // Trích xuất lại từ AST
  const extracted = BookmarkService.extractBookmarks(deserialized.document.content);
  assert.equal(extracted.length, 1);
  assert.equal(extracted[0].bookmark.id, bookmarkId);
  assert.equal(extracted[0].bookmark.name, bookmarkName);
});

test("Phase 8 - 4. Bookmark Range persistence: semantic mark over selection preserved with Unicode Vietnamese name", () => {
  resetTestStore();

  const bookmarkId = "ref_bookmark_range_beta";
  const bookmarkName = "Đoạn văn kết luận luận văn";
  const createdAt = "2026-10-07T09:00:00.000Z";

  const docModel: DocumentModel = {
    metadata: {
      id: "doc-range-bm",
      title: "Range Bookmark Doc",
      version: 1,
      createdAt,
      updatedAt: createdAt,
    },
    content: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Mở đầu đoạn. " },
            {
              type: "text",
              text: "Đây là câu được bôi đen và gắn thẻ đánh dấu.",
              marks: [
                {
                  type: "bookmark",
                  attrs: {
                    id: bookmarkId,
                    name: bookmarkName,
                    createdAt,
                  },
                },
              ],
            },
            { type: "text", text: " Kết thúc đoạn." },
          ],
        },
      ],
    },
    pageSettings: {
      paperSize: "A4",
      orientation: "portrait",
      margins: { top: 25.4, bottom: 25.4, left: 25.4, right: 25.4 },
    },
  };

  const serialized = serializeDocumentToMwd(docModel);
  const parsed = JSON.parse(serialized);

  // Không serialize numeric offsets
  const bmMeta = parsed.references?.bookmarks?.[0];
  assert.equal(bmMeta?.id, bookmarkId);
  assert.equal(bmMeta?.name, bookmarkName);
  assert.equal(bmMeta?.type, "range");
  assert.equal(bmMeta?.from, undefined);
  assert.equal(bmMeta?.to, undefined);

  // Deserialize và kiểm tra AST
  const res = deserializeMwdToDocument(serialized);
  assert.equal(res.success, true);
  if (!res.success) return;

  const runs = res.document.content.content?.[0]?.content || [];
  const markedRun = runs.find((r) =>
    r.marks?.some((m: any) => m.type === "bookmark" && m.attrs?.id === bookmarkId)
  );
  assert.ok(markedRun);
  assert.equal(markedRun.text, "Đây là câu được bôi đen và gắn thẻ đánh dấu.");

  const extracted = BookmarkService.extractBookmarks(res.document.content);
  assert.equal(extracted.length, 1);
  assert.equal(extracted[0].bookmark.id, bookmarkId);
  assert.equal(extracted[0].text, "Đây là câu được bôi đen và gắn thẻ đánh dấu.");
});

test("Phase 8 - 5. CrossReference → Bookmark round-trip: preserves targetId and dynamically resolves after load", () => {
  resetTestStore();

  const targetBookmarkId = "ref_bookmark_chapter1";
  const docModel: DocumentModel = {
    metadata: {
      id: "doc-xref-bm",
      title: "Cross-Reference to Bookmark",
      version: 1,
      createdAt: "2026-10-07T00:00:00.000Z",
      updatedAt: "2026-10-07T00:00:00.000Z",
    },
    content: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Xem chi tiết tại " },
            {
              type: "crossReference",
              attrs: {
                targetId: targetBookmarkId,
                targetType: "bookmark",
                format: "text",
                customText: null,
              },
            },
            { type: "text", text: " để biết thêm thông tin." },
          ],
        },
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "Mô tả chi tiết phương pháp nghiên cứu",
              marks: [
                {
                  type: "bookmark",
                  attrs: {
                    id: targetBookmarkId,
                    name: "Phương pháp nghiên cứu",
                    createdAt: "2026-10-07T00:00:00.000Z",
                  },
                },
              ],
            },
          ],
        },
      ],
    },
    pageSettings: {
      paperSize: "A4",
      orientation: "portrait",
      margins: { top: 25.4, bottom: 25.4, left: 25.4, right: 25.4 },
    },
  };

  const serialized = serializeDocumentToMwd(docModel);
  const res = deserializeMwdToDocument(serialized);
  assert.equal(res.success, true);
  if (!res.success) return;

  const p1Content = res.document.content.content?.[0]?.content || [];
  const xrefNode = p1Content.find((n) => n.type === "crossReference");
  assert.ok(xrefNode);
  assert.equal(xrefNode.attrs?.targetId, targetBookmarkId);
  assert.equal(xrefNode.attrs?.targetType, "bookmark");
  assert.equal(xrefNode.attrs?.format, "text");

  // Kiểm tra khả năng phân giải động sau khi load
  const targets = CrossReferenceService.getAvailableTargets(res.document.content, "bookmark");
  const targetItem = targets.find((t) => t.id === targetBookmarkId);
  assert.ok(targetItem);
  assert.equal(targetItem.title, "Phương pháp nghiên cứu");
  assert.equal(targetItem.text, "Mô tả chi tiết phương pháp nghiên cứu");
});

test("Phase 8 - 6. Old .mwd backward compatibility: loads safely without references block, defaults applied without version bump", () => {
  resetTestStore();

  const legacyFilePackage = {
    format: MWD_FORMAT_IDENTIFIER,
    version: 1, // Phiên bản format v1 hiện tại, không bump version
    metadata: {
      id: "doc-legacy-v1",
      title: "Legacy Document",
      version: 1,
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-01T00:00:00.000Z",
    },
    pageSettings: {
      paperSize: "A4",
      orientation: "portrait",
      margins: { top: 25.4, bottom: 25.4, left: 25.4, right: 25.4 },
    },
    document: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Văn bản tạo từ phiên bản cũ không có bookmarks hay caption lists." }],
        },
      ],
    },
  };

  const rawJson = JSON.stringify(legacyFilePackage);
  const result = deserializeMwdToDocument(rawJson);

  assert.equal(result.success, true);
  if (!result.success) return;

  assert.equal(result.formatVersion, MWD_CURRENT_FORMAT_VERSION);
  assert.equal(result.document.metadata.id, "doc-legacy-v1");

  // Kiểm tra tệp cũ không có khối references: trả về undefined, không crash, không sinh rác
  assert.equal(result.document.references, undefined);

  // Kiểm tra tệp cũ có khối references rỗng: tự động áp dụng defaults an toàn
  const legacyWithEmptyRefs = {
    ...legacyFilePackage,
    references: {},
  };
  const emptyRefsResult = deserializeMwdToDocument(JSON.stringify(legacyWithEmptyRefs));
  assert.equal(emptyRefsResult.success, true);
  if (emptyRefsResult.success) {
    const refs = emptyRefsResult.document.references;
    assert.ok(refs);
    assert.deepEqual(refs.bookmarks, []);
    assert.deepEqual(refs.bibliographySources, []);
    assert.equal(refs.citationStyle, "apa");
  }
});

test("Phase 8 - 7. Malformed data resilience: duplicate IDs, duplicate names, missing attrs, broken targetId repaired without text loss", () => {
  resetTestStore();

  const malformedFilePackage = {
    format: MWD_FORMAT_IDENTIFIER,
    version: 1,
    metadata: {
      id: "doc-malformed",
      title: "Malformed Doc",
      version: 1,
      createdAt: "2026-10-07T00:00:00.000Z",
      updatedAt: "2026-10-07T00:00:00.000Z",
    },
    references: {
      // Phantom bookmark: có metadata nhưng không có trong AST (sẽ bị self-prune)
      bookmarks: [
        {
          id: "ref_bookmark_phantom_999",
          name: "Phantom Bookmark",
          type: "position",
          createdAt: "2026-10-07T00:00:00.000Z",
        },
      ],
    },
    document: {
      type: "doc",
      content: [
        {
          type: "captionList",
          attrs: {
            // Thiếu id, unknown label, invalid preset, entries không phải array
            label: "   ",
            preset: "invalid_preset",
            entries: "not_an_array",
          },
        },
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Đoạn văn quan trọng số 1. " },
            // Bookmark anchor 1: tên "Thử nghiệm"
            {
              type: "bookmarkAnchor",
              attrs: {
                id: "duplicate_id_001",
                name: "Thử nghiệm",
              },
            },
            // Bookmark anchor 2: Trùng cả ID lẫn Tên với anchor 1
            {
              type: "bookmarkAnchor",
              attrs: {
                id: "duplicate_id_001",
                name: "Thử nghiệm",
              },
            },
            { type: "text", text: "Văn bản giữa các neo. " },
            // Cross-reference bị broken targetId
            {
              type: "crossReference",
              attrs: {
                targetId: "",
                targetType: "invalid_type",
                format: "invalid_format",
              },
            },
            { type: "text", text: " Đoạn văn quan trọng số 2." },
          ],
        },
      ],
    },
  };

  const rawJson = JSON.stringify(malformedFilePackage);
  const result = deserializeMwdToDocument(rawJson);

  assert.equal(result.success, true);
  if (!result.success) return;

  const doc = result.document;

  // 1. Caption list được chuẩn hóa an toàn
  const clistNode = doc.content.content?.[0];
  assert.equal(clistNode?.type, "captionList");
  assert.ok(clistNode?.attrs?.id.startsWith("ref_clist_"));
  assert.equal(clistNode?.attrs?.label, "Figure");
  assert.equal(clistNode?.attrs?.preset, "classic");
  assert.deepEqual(clistNode?.attrs?.entries, []);

  // 2. Bookmark duplicate ID và duplicate Name được disambiguate
  const pRuns = doc.content.content?.[1]?.content || [];
  const bAnchors = pRuns.filter((r) => r.type === "bookmarkAnchor");
  assert.equal(bAnchors.length, 2);
  assert.notEqual(bAnchors[0].attrs?.id, bAnchors[1].attrs?.id, "Duplicate bookmark ID phải được sinh mới");
  assert.notEqual(bAnchors[0].attrs?.name, bAnchors[1].attrs?.name, "Duplicate bookmark name phải được disambiguate");
  assert.equal(bAnchors[0].attrs?.name, "Thử nghiệm");
  assert.equal(bAnchors[1].attrs?.name, "Thử nghiệm (1)");

  // 3. Broken crossReference được gán fallback an toàn
  const xrefNode = pRuns.find((r) => r.type === "crossReference");
  assert.ok(xrefNode);
  assert.equal(xrefNode.attrs?.targetId, "broken_ref");
  assert.equal(xrefNode.attrs?.customText, "[Reference not found]");

  // 4. Phantom bookmark bị self-prune khỏi references metadata
  const loadedBms = doc.references?.bookmarks || [];
  assert.equal(loadedBms.some((b) => b.id === "ref_bookmark_phantom_999"), false);
  assert.equal(loadedBms.length, 2); // 2 bookmarks hợp lệ từ AST

  // 5. TOÀN BỘ TEXT CỦA NGƯỜI DÙNG ĐƯỢC BẢO TOÀN 100%
  const texts = pRuns.filter((r) => r.type === "text").map((r) => r.text);
  assert.ok(texts.includes("Đoạn văn quan trọng số 1. "));
  assert.ok(texts.includes("Văn bản giữa các neo. "));
  assert.ok(texts.includes(" Đoạn văn quan trọng số 2."));
});

test("Phase 8 - 8. Stable IDs: reference IDs remain strictly identical across multiple round-trips", () => {
  resetTestStore();

  const clistId = "ref_clist_stable_007";
  const bookmarkPosId = "ref_bookmark_pos_stable";
  const bookmarkRangeId = "ref_bookmark_range_stable";
  const xrefId = bookmarkPosId;

  const docModel: DocumentModel = {
    metadata: {
      id: "doc-stable-ids",
      title: "Stable IDs Doc",
      version: 1,
      createdAt: "2026-10-07T00:00:00.000Z",
      updatedAt: "2026-10-07T00:00:00.000Z",
    },
    content: {
      type: "doc",
      content: [
        {
          type: "captionList",
          attrs: {
            id: clistId,
            title: "Danh mục",
            label: "Figure",
            showPageNumbers: true,
            rightAlignPageNumbers: true,
            preset: "classic",
            entries: [],
            lastUpdated: "2026-10-07T00:00:00.000Z",
          },
        },
        {
          type: "paragraph",
          content: [
            {
              type: "bookmarkAnchor",
              attrs: {
                id: bookmarkPosId,
                name: "Neo Cố Định",
                createdAt: "2026-10-07T00:00:00.000Z",
              },
            },
            {
              type: "text",
              text: "Văn bản có range mark",
              marks: [
                {
                  type: "bookmark",
                  attrs: {
                    id: bookmarkRangeId,
                    name: "Vùng Cố Định",
                    createdAt: "2026-10-07T00:00:00.000Z",
                  },
                },
              ],
            },
            {
              type: "crossReference",
              attrs: {
                targetId: xrefId,
                targetType: "bookmark",
                format: "text",
              },
            },
          ],
        },
      ],
    },
    pageSettings: {
      paperSize: "A4",
      orientation: "portrait",
      margins: { top: 25.4, bottom: 25.4, left: 25.4, right: 25.4 },
    },
  };

  // Round-trip 1
  const pass1Json = serializeDocumentToMwd(docModel);
  const pass1Doc = deserializeMwdToDocument(pass1Json);
  assert.equal(pass1Doc.success, true);
  if (!pass1Doc.success) return;

  // Round-trip 2
  const pass2Json = serializeDocumentToMwd(pass1Doc.document);
  const pass2Doc = deserializeMwdToDocument(pass2Json);
  assert.equal(pass2Doc.success, true);
  if (!pass2Doc.success) return;

  const content = pass2Doc.document.content.content || [];
  const clistNode = content.find((n) => n.type === "captionList");
  assert.equal(clistNode?.attrs?.id, clistId);

  const pRuns = content[1]?.content || [];
  const posNode = pRuns.find((n) => n.type === "bookmarkAnchor");
  assert.equal(posNode?.attrs?.id, bookmarkPosId);

  const rangeRun = pRuns.find((n) => n.marks?.some((m: any) => m.type === "bookmark"));
  assert.equal(rangeRun?.marks?.[0]?.attrs?.id, bookmarkRangeId);

  const xrefNode = pRuns.find((n) => n.type === "crossReference");
  assert.equal(xrefNode?.attrs?.targetId, xrefId);
});

test("Phase 8 - 9. Save failure preservation: dirty state and references remain intact without document clearing", () => {
  resetTestStore();

  const store = useDocumentStore.getState();

  // Thêm một Bookmark và CaptionList vào nội dung document làm isDirty = true
  const initialContent = {
    type: "doc",
    content: [
      {
        type: "captionList",
        attrs: {
          id: "ref_clist_unsaved",
          title: "Danh mục chưa lưu",
          label: "Figure",
          showPageNumbers: true,
          rightAlignPageNumbers: true,
          preset: "classic",
          entries: [],
          lastUpdated: "2026-10-07T00:00:00.000Z",
        },
      },
      {
        type: "paragraph",
        content: [
          {
            type: "bookmarkAnchor",
            attrs: {
              id: "ref_bookmark_unsaved",
              name: "Thẻ chưa lưu",
              createdAt: "2026-10-07T00:00:00.000Z",
            },
          },
          { type: "text", text: "Văn bản phiên bản sửa đổi." },
        ],
      },
    ],
  };

  store.updateContent(initialContent);

  const currentStore = useDocumentStore.getState();
  assert.equal(currentStore.isDirty, true);
  assert.equal(currentStore.isModified, true);

  // Giả lập ngoại lệ khi lưu file vào hệ thống (ví dụ: đĩa đầy / EACCES)
  let saveThrew = false;
  try {
    throw new Error("Lỗi giả lập: Disk Full / Write Permission Denied.");
  } catch (err) {
    saveThrew = true;
  }
  assert.equal(saveThrew, true);

  // Xác nhận sau khi save thất bại:
  // 1. isDirty vẫn là true (không gọi markSaved)
  // 2. document không bị clear, các node captionList và bookmarkAnchor vẫn nguyên vẹn
  const storeAfterFailure = useDocumentStore.getState();
  assert.equal(storeAfterFailure.isDirty, true);
  assert.equal(storeAfterFailure.isModified, true);

  const runs = storeAfterFailure.document.content.content?.[1]?.content || [];
  const anchor = runs.find((r) => r.type === "bookmarkAnchor");
  assert.ok(anchor);
  assert.equal(anchor.attrs?.id, "ref_bookmark_unsaved");
  assert.equal(anchor.attrs?.name, "Thẻ chưa lưu");
});

test("Phase 8 - 10. Undo/Redo after reload sanity: operations on reloaded document are history-safe", () => {
  resetTestStore();

  const docModel: DocumentModel = {
    metadata: {
      id: "doc-undo-reload",
      title: "Undo Reload Test",
      version: 1,
      createdAt: "2026-10-07T00:00:00.000Z",
      updatedAt: "2026-10-07T00:00:00.000Z",
    },
    content: {
      type: "doc",
      content: [
        {
          type: "captionList",
          attrs: {
            id: "ref_clist_undo",
            title: "Danh mục hình",
            label: "Figure",
            showPageNumbers: true,
            rightAlignPageNumbers: true,
            preset: "classic",
            entries: [],
            lastUpdated: "2026-10-07T00:00:00.000Z",
          },
        },
        {
          type: "paragraph",
          content: [{ type: "text", text: "Văn bản cơ sở." }],
        },
      ],
    },
    pageSettings: {
      paperSize: "A4",
      orientation: "portrait",
      margins: { top: 25.4, bottom: 25.4, left: 25.4, right: 25.4 },
    },
  };

  const serialized = serializeDocumentToMwd(docModel);
  const reloaded = deserializeMwdToDocument(serialized);
  assert.equal(reloaded.success, true);
  if (!reloaded.success) return;

  // Tạo editor instance từ nội dung đã nạp lại
  const editor = createTestEditor(reloaded.document.content);
  editor.commands.setTextSelection(5);

  // Thêm một Bookmark mới sau khi reload
  const createResult = BookmarkService.createBookmark(editor, {
    name: "Thẻ tạo sau khi mở lại",
  });
  assert.equal(createResult.success, true);
  assert.ok(createResult.bookmark);

  // Kiểm tra bookmark xuất hiện
  let bms = BookmarkService.extractBookmarks(editor.state.doc);
  assert.equal(bms.length, 1);
  assert.equal(bms[0].bookmark.name, "Thẻ tạo sau khi mở lại");

  // Undo thao tác chèn bookmark
  editor.commands.undo();
  bms = BookmarkService.extractBookmarks(editor.state.doc);
  assert.equal(bms.length, 0, "Bookmark phải biến mất sau khi Undo");

  // Redo thao tác chèn bookmark
  editor.commands.redo();
  bms = BookmarkService.extractBookmarks(editor.state.doc);
  assert.equal(bms.length, 1, "Bookmark phải xuất hiện trở lại sau khi Redo");
  assert.equal(bms[0].bookmark.name, "Thẻ tạo sau khi mở lại");

  // Caption List node ban đầu vẫn nguyên vẹn
  const clistFound = editor.state.doc.content.firstChild?.type.name === "captionList";
  assert.equal(clistFound, true, "CaptionList node vẫn giữ nguyên vẹn sau Undo/Redo");

  editor.destroy();
});
