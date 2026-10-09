import test from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import type { DocumentModel, CommentItem } from "../document/documentTypes.ts";
import {
  importDocxToDocumentModel,
  exportDocumentModelToDocx,
  parseComments,
  buildCommentsXml,
  checkDocxExportReviewCompatibility,
} from "./index.ts";
import { parseXmlString } from "./utils/xmlUtils.ts";

/**
 * Helper: Tạo tệp DOCX mẫu trong bộ nhớ kèm Comments và Track Changes
 */
async function createDocxWithReviewMarkup(options: {
  commentsXml?: string;
  documentBodyXml: string;
}): Promise<Uint8Array> {
  const zip = new JSZip();

  const hasComments = Boolean(options.commentsXml);
  const commentOverrides = hasComments
    ? '<Override PartName="/word/comments.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml"/>'
    : "";

  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
      <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
      <Default Extension="xml" ContentType="application/xml"/>
      <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
      <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
      <Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>
      ${commentOverrides}
    </Types>`
  );

  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
      <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
    </Relationships>`
  );

  const commentRel = hasComments
    ? '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments" Target="comments.xml"/>'
    : "";

  zip.file(
    "word/_rels/document.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
      <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
      <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>
      ${commentRel}
    </Relationships>`
  );

  zip.file(
    "word/styles.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
      <w:style w:type="paragraph" w:default="1" w:styleId="Normal">
        <w:name w:val="Normal"/>
      </w:style>
    </w:styles>`
  );

  zip.file(
    "word/numbering.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"/>`
  );

  if (options.commentsXml) {
    zip.file("word/comments.xml", options.commentsXml);
  }

  zip.file(
    "word/document.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
                xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
      <w:body>
        ${options.documentBodyXml}
      </w:body>
    </w:document>`
  );

  return await zip.generateAsync({ type: "uint8array" });
}

function createBaseModel(): DocumentModel {
  return {
    metadata: {
      id: "doc-rev-1",
      title: "Tài liệu kiểm thử Review",
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    pageSettings: {
      paperSize: "A4",
      orientation: "portrait",
      margins: { top: 25.4, bottom: 25.4, left: 25.4, right: 25.4 },
      marginPreset: "Normal",
    },
    content: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Nội dung ban đầu." }],
        },
      ],
    },
  };
}

// -----------------------------------------------------------------------------
// 1. DOCX COMMENTS IMPORT
// -----------------------------------------------------------------------------
test("PHASE 5.8 — 1. DOCX Comments Import: trích xuất comment id, author, date, content, range anchor và resolved", async () => {
  const commentsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
  <w:comments xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
    <w:comment w:id="0" w:author="Hoàng Dev" w:date="2026-10-07T08:00:00Z" w:initials="HD">
      <w:p>
        <w:r><w:annotationRef/></w:r>
        <w:r><w:t>Đề nghị kiểm tra kỹ phần này.</w:t></w:r>
      </w:p>
    </w:comment>
    <w:comment w:id="1" w:author="Reviewer A" w:date="2026-10-07T08:30:00Z" w:done="1">
      <w:p>
        <w:r><w:t>Bình luận này đã được xử lý xong.</w:t></w:r>
      </w:p>
    </w:comment>
  </w:comments>`;

  const bodyXml = `
    <w:p>
      <w:r><w:t>Đây là </w:t></w:r>
      <w:commentRangeStart w:id="0"/>
      <w:r><w:t>văn bản có bình luận</w:t></w:r>
      <w:commentRangeEnd w:id="0"/>
      <w:r><w:commentReference w:id="0"/></w:r>
      <w:r><w:t> trong trang.</w:t></w:r>
    </w:p>
  `;

  const docxBytes = await createDocxWithReviewMarkup({
    commentsXml,
    documentBodyXml: bodyXml,
  });

  const res = await importDocxToDocumentModel(docxBytes, "review-doc.docx");
  assert.equal(res.success, true);
  if (!res.success) return;

  const doc = res.document;
  assert.ok(doc.comments && doc.comments.length === 2, "Phải import đủ 2 bình luận");

  const com0 = doc.comments.find((c) => c.id === "comment-0");
  assert.ok(com0, "Phải tìm thấy comment-0");
  assert.equal(com0.author, "Hoàng Dev");
  assert.equal(com0.content, "Đề nghị kiểm tra kỹ phần này.");
  assert.equal(com0.resolved, false);
  assert.equal(com0.selectedText, "văn bản có bình luận");

  const com1 = doc.comments.find((c) => c.id === "comment-1");
  assert.ok(com1, "Phải tìm thấy comment-1");
  assert.equal(com1.author, "Reviewer A");
  assert.equal(com1.resolved, true, "w:done=1 phải được map thành resolved = true");

  // Kiểm tra mark comment trong ProseMirror AST
  const pNode = doc.content.content?.[0];
  const commentedTextNode = pNode?.content?.find(
    (n) => n.type === "text" && n.text === "văn bản có bình luận"
  );
  assert.ok(commentedTextNode, "Phải có text node mang nội dung neo");
  const commentMark = commentedTextNode.marks?.find((m) => m.type === "comment");
  assert.ok(commentMark, "Phải có mark comment");
  assert.equal(commentMark.attrs?.commentId, "comment-0");
});

// -----------------------------------------------------------------------------
// 2. DOCX COMMENTS EXPORT
// -----------------------------------------------------------------------------
test("PHASE 5.8 — 2. DOCX Comments Export: xuất comments.xml, content-types, rels và anchor tags chuẩn Word", async () => {
  const model = createBaseModel();
  const testComment: CommentItem = {
    id: "com-export-1",
    author: "Thu Trang",
    createdAt: "2026-10-07T08:45:00Z",
    updatedAt: "2026-10-07T08:45:00Z",
    content: "Ý kiến phản hồi từ tác giả.",
    resolved: false,
    selectedText: "Đoạn văn quan trọng",
  };
  model.comments = [testComment];
  model.content = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Mở đầu " },
          {
            type: "text",
            text: "Đoạn văn quan trọng",
            marks: [{ type: "comment", attrs: { commentId: "com-export-1" } }],
          },
          { type: "text", text: " kết thúc." },
        ],
      },
    ],
  };

  const exportedBytes = await exportDocumentModelToDocx(model);
  const zip = await JSZip.loadAsync(exportedBytes);

  // 1. Kiểm tra [Content_Types].xml
  const contentTypesXml = await zip.file("[Content_Types].xml")?.async("string");
  assert.ok(contentTypesXml?.includes('PartName="/word/comments.xml"'), "Phải đăng ký Override comments.xml");

  // 2. Kiểm tra word/_rels/document.xml.rels
  const relsXml = await zip.file("word/_rels/document.xml.rels")?.async("string");
  assert.ok(relsXml?.includes('Target="comments.xml"'), "Phải có relationship trỏ tới comments.xml");

  // 3. Kiểm tra word/comments.xml
  const commentsXml = await zip.file("word/comments.xml")?.async("string");
  assert.ok(commentsXml, "Tệp word/comments.xml phải tồn tại");
  assert.ok(commentsXml.includes('w:author="Thu Trang"'), "Phải giữ đúng tác giả");
  assert.ok(commentsXml.includes("Ý kiến phản hồi từ tác giả."), "Phải giữ đúng nội dung comment");

  // 4. Kiểm tra word/document.xml (Range anchor)
  const docXml = await zip.file("word/document.xml")?.async("string");
  assert.ok(docXml, "Phải có document.xml");
  assert.ok(docXml.includes("<w:commentRangeStart"), "Phải có thẻ commentRangeStart");
  assert.ok(docXml.includes("<w:commentRangeEnd"), "Phải có thẻ commentRangeEnd");
  assert.ok(docXml.includes("<w:commentReference"), "Phải có thẻ commentReference");
});

// -----------------------------------------------------------------------------
// 3. TRACKED INSERT IMPORT
// -----------------------------------------------------------------------------
test("PHASE 5.8 — 3. Tracked Insert Import: chuyển w:ins thành mark trackChange type=insert", async () => {
  const bodyXml = `
    <w:p>
      <w:r><w:t>Trước </w:t></w:r>
      <w:ins w:id="101" w:author="Hồng Sơn" w:date="2026-10-07T09:00:00Z">
        <w:r><w:t>nội dung chèn mới</w:t></w:r>
      </w:ins>
      <w:r><w:t> sau.</w:t></w:r>
    </w:p>
  `;

  const docxBytes = await createDocxWithReviewMarkup({ documentBodyXml: bodyXml });
  const res = await importDocxToDocumentModel(docxBytes, "test-ins.docx");
  assert.equal(res.success, true);
  if (!res.success) return;

  const doc = res.document;
  const pNode = doc.content.content?.[0];
  const insTextNode = pNode?.content?.find((n) => n.text === "nội dung chèn mới");
  assert.ok(insTextNode, "Phải tìm thấy text node chèn mới");

  const tcMark = insTextNode.marks?.find((m) => m.type === "trackChange");
  assert.ok(tcMark, "Phải mang mark trackChange");
  assert.equal(tcMark.attrs?.changeType, "insert");
  assert.equal(tcMark.attrs?.author, "Hồng Sơn");

  assert.ok(doc.trackedChanges && doc.trackedChanges.length > 0, "DocumentModel phải ghi nhận trackedChanges");
  const changeEntry = doc.trackedChanges.find((c) => c.type === "insert");
  assert.ok(changeEntry, "Phải có bản ghi insert trong trackedChanges");
  assert.equal(changeEntry.author, "Hồng Sơn");
});

// -----------------------------------------------------------------------------
// 4. TRACKED DELETE IMPORT
// -----------------------------------------------------------------------------
test("PHASE 5.8 — 4. Tracked Delete Import: chuyển w:del thành mark trackChange type=delete và KHÔNG biến thành normal text", async () => {
  const bodyXml = `
    <w:p>
      <w:r><w:t>Đầu câu </w:t></w:r>
      <w:del w:id="202" w:author="Thu Trang" w:date="2026-10-07T09:10:00Z">
        <w:r><w:delText>từ ngữ đã xóa</w:delText></w:r>
      </w:del>
      <w:r><w:t> cuối câu.</w:t></w:r>
    </w:p>
  `;

  const docxBytes = await createDocxWithReviewMarkup({ documentBodyXml: bodyXml });
  const res = await importDocxToDocumentModel(docxBytes, "test-del.docx");
  assert.equal(res.success, true);
  if (!res.success) return;

  const doc = res.document;
  const pNode = doc.content.content?.[0];

  // Văn bản bị xóa vẫn BẮT BUỘC phải tồn tại trong AST
  const delTextNode = pNode?.content?.find((n) => n.text === "từ ngữ đã xóa");
  assert.ok(delTextNode, "Văn bản bị xóa vẫn phải tồn tại trong AST (không bị biến mất)");

  const tcMark = delTextNode.marks?.find((m) => m.type === "trackChange");
  assert.ok(tcMark, "Phải mang mark trackChange");
  assert.equal(tcMark.attrs?.changeType, "delete");
  assert.equal(tcMark.attrs?.author, "Thu Trang");

  assert.ok(doc.trackedChanges && doc.trackedChanges.length > 0, "DocumentModel phải có trackedChanges");
  const delEntry = doc.trackedChanges.find((c) => c.type === "delete");
  assert.ok(delEntry, "Phải có bản ghi delete trong trackedChanges");
  assert.equal(delEntry.author, "Thu Trang");
});

// -----------------------------------------------------------------------------
// 5. TRACKED INSERT EXPORT
// -----------------------------------------------------------------------------
test("PHASE 5.8 — 5. Tracked Insert Export: xuất mark insert thành thẻ <w:ins> với author và date", async () => {
  const model = createBaseModel();
  model.content = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Bắt đầu " },
          {
            type: "text",
            text: "văn bản bổ sung",
            marks: [
              {
                type: "trackChange",
                attrs: {
                  id: "ins-55",
                  changeType: "insert",
                  author: "Nguyễn Văn A",
                  timestamp: "2026-10-07T09:20:00Z",
                },
              },
            ],
          },
        ],
      },
    ],
  };

  const exportedBytes = await exportDocumentModelToDocx(model);
  const zip = await JSZip.loadAsync(exportedBytes);
  const docXml = await zip.file("word/document.xml")?.async("string");

  assert.ok(docXml, "Phải có document.xml");
  assert.ok(docXml.includes("<w:ins"), "Phải xuất thẻ w:ins");
  assert.ok(docXml.includes('w:author="Nguyễn Văn A"'), "Phải giữ tên author trong w:ins");
  assert.ok(docXml.includes("văn bản bổ sung"), "Nội dung văn bản phải nằm trong w:ins");
});

// -----------------------------------------------------------------------------
// 6. TRACKED DELETE EXPORT
// -----------------------------------------------------------------------------
test("PHASE 5.8 — 6. Tracked Delete Export: xuất mark delete thành thẻ <w:del> và <w:delText>", async () => {
  const model = createBaseModel();
  model.content = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "nội dung gạch bỏ",
            marks: [
              {
                type: "trackChange",
                attrs: {
                  id: "del-66",
                  changeType: "delete",
                  author: "Trần Thị B",
                  timestamp: "2026-10-07T09:25:00Z",
                },
              },
            ],
          },
        ],
      },
    ],
  };

  const exportedBytes = await exportDocumentModelToDocx(model);
  const zip = await JSZip.loadAsync(exportedBytes);
  const docXml = await zip.file("word/document.xml")?.async("string");

  assert.ok(docXml, "Phải có document.xml");
  assert.ok(docXml.includes("<w:del"), "Phải xuất thẻ w:del");
  assert.ok(docXml.includes('w:author="Trần Thị B"'), "Phải giữ author trong w:del");
  assert.ok(docXml.includes("<w:delText"), "Phải sử dụng thẻ w:delText cho nội dung bị xóa");
  assert.ok(docXml.includes("nội dung gạch bỏ"), "Phải giữ nội dung văn bản bị xóa");
});

// -----------------------------------------------------------------------------
// 7. ACCEPTED / REJECTED CHANGES EXPORT
// -----------------------------------------------------------------------------
test("PHASE 5.8 — 7. Accepted / Rejected Changes Export: thay đổi đã giải quyết xuất như văn bản bình thường, không chứa thẻ w:ins/w:del", async () => {
  const model = createBaseModel();
  // Sau khi Accept Insert hoặc Reject Delete, văn bản trở thành text thông thường không còn mark trackChange
  model.content = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Văn bản đã được duyệt chấp nhận hoàn toàn." },
        ],
      },
    ],
  };

  const exportedBytes = await exportDocumentModelToDocx(model);
  const zip = await JSZip.loadAsync(exportedBytes);
  const docXml = await zip.file("word/document.xml")?.async("string");

  assert.ok(docXml, "Phải có document.xml");
  assert.equal(docXml.includes("<w:ins"), false, "Không được chứa thẻ w:ins khi đã accept/reject");
  assert.equal(docXml.includes("<w:del"), false, "Không được chứa thẻ w:del khi đã accept/reject");
  assert.ok(docXml.includes("Văn bản đã được duyệt chấp nhận hoàn toàn."), "Nội dung bình thường phải nguyên vẹn");
});

// -----------------------------------------------------------------------------
// 8. FULL ROUND-TRIP
// -----------------------------------------------------------------------------
test("PHASE 5.8 — 8. Round-trip: Personal Word Editor -> DOCX -> Personal Word Editor bảo toàn đầy đủ comments và track changes", async () => {
  const originalModel = createBaseModel();
  const testComment: CommentItem = {
    id: "roundtrip-c1",
    author: "Tác giả Roundtrip",
    createdAt: "2026-10-07T09:30:00Z",
    updatedAt: "2026-10-07T09:30:00Z",
    content: "Bình luận kiểm thử chu trình đầy đủ.",
    resolved: true,
    selectedText: "văn bản neo",
  };
  originalModel.comments = [testComment];
  originalModel.content = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Bắt đầu " },
          {
            type: "text",
            text: "văn bản neo",
            marks: [{ type: "comment", attrs: { commentId: "roundtrip-c1" } }],
          },
          { type: "text", text: " " },
          {
            type: "text",
            text: "đoạn chèn mới",
            marks: [
              {
                type: "trackChange",
                attrs: {
                  id: "rt-ins-1",
                  changeType: "insert",
                  author: "Người thêm",
                  timestamp: "2026-10-07T09:35:00Z",
                },
              },
            ],
          },
          { type: "text", text: " " },
          {
            type: "text",
            text: "đoạn gạch xóa",
            marks: [
              {
                type: "trackChange",
                attrs: {
                  id: "rt-del-1",
                  changeType: "delete",
                  author: "Người xóa",
                  timestamp: "2026-10-07T09:40:00Z",
                },
              },
            ],
          },
          { type: "text", text: " kết thúc." },
        ],
      },
    ],
  };

  // 1. Export sang DOCX
  const exportedDocx = await exportDocumentModelToDocx(originalModel);

  // 2. Import lại từ DOCX
  const importRes = await importDocxToDocumentModel(exportedDocx, "roundtrip.docx");
  assert.equal(importRes.success, true);
  if (!importRes.success) return;

  const roundtripDoc = importRes.document;

  // Kiểm tra Comments
  assert.ok(roundtripDoc.comments && roundtripDoc.comments.length === 1);
  const reimportedComment = roundtripDoc.comments[0];
  assert.equal(reimportedComment.author, "Tác giả Roundtrip");
  assert.equal(reimportedComment.content, "Bình luận kiểm thử chu trình đầy đủ.");
  assert.equal(reimportedComment.resolved, true);
  assert.equal(reimportedComment.selectedText, "văn bản neo");

  // Kiểm tra Track Changes
  assert.ok(roundtripDoc.trackedChanges && roundtripDoc.trackedChanges.length === 2);
  const hasIns = roundtripDoc.trackedChanges.some(
    (c) => c.type === "insert" && c.author === "Người thêm"
  );
  const hasDel = roundtripDoc.trackedChanges.some(
    (c) => c.type === "delete" && c.author === "Người xóa"
  );
  assert.ok(hasIns, "Phải giữ nguyên tracked insertion trong round-trip");
  assert.ok(hasDel, "Phải giữ nguyên tracked deletion trong round-trip");
});

// -----------------------------------------------------------------------------
// 9. UNSUPPORTED REVIEW DATA GRACEFUL FALLBACK
// -----------------------------------------------------------------------------
test("PHASE 5.8 — 9. Unsupported Review Data: xử lý an toàn threaded comments, move revisions, rPrChange không crash và ghi nhận warning", async () => {
  const commentsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
  <w:comments xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
              xmlns:w16cid="http://schemas.microsoft.com/office/word/2016/wordml/cid">
    <w:comment w:id="10" w:author="Quản lý" w:date="2026-10-07T08:00:00Z">
      <w:p><w:r><w:t>Bình luận gốc</w:t></w:r></w:p>
    </w:comment>
    <w:comment w:id="11" w:author="Nhân viên" w:date="2026-10-07T08:05:00Z" w16cid:paraIdParent="10">
      <w:p><w:r><w:t>Phản hồi cấp 2 (Reply)</w:t></w:r></w:p>
    </w:comment>
  </w:comments>`;

  const bodyXml = `
    <w:p>
      <w:pPr>
        <w:pPrChange w:id="999" w:author="Auto" w:date="2026-10-07T08:00:00Z"/>
      </w:pPr>
      <w:r>
        <w:rPr>
          <w:b/>
          <w:rPrChange w:id="998" w:author="Auto" w:date="2026-10-07T08:00:00Z"/>
        </w:rPr>
        <w:t>Đoạn có rPrChange. </w:t>
      </w:r>
      <w:moveTo w:id="301" w:author="Reviewer" w:date="2026-10-07T08:10:00Z">
        <w:r><w:t>Văn bản được di chuyển tới đây. </w:t></w:r>
      </w:moveTo>
      <w:moveFrom w:id="302" w:author="Reviewer" w:date="2026-10-07T08:10:00Z">
        <w:r><w:delText>Văn bản bị di chuyển khỏi đây.</w:delText></w:r>
      </w:moveFrom>
    </w:p>
  `;

  const docxBytes = await createDocxWithReviewMarkup({
    commentsXml,
    documentBodyXml: bodyXml,
  });

  const res = await importDocxToDocumentModel(docxBytes, "unsupported-test.docx");
  assert.equal(res.success, true, "Không được crash khi gặp metadata phức tạp");
  if (!res.success) return;

  // Cả bình luận cha lẫn phản hồi con đều được bảo toàn thành comments độc lập
  assert.ok(res.document.comments && res.document.comments.length === 2);
  assert.ok(res.document.comments.some((c) => c.content === "Phản hồi cấp 2 (Reply)"));

  // moveTo được map sang insert, moveFrom sang delete
  assert.ok(res.document.trackedChanges && res.document.trackedChanges.length >= 2);
  assert.ok(res.document.trackedChanges.some((c) => c.type === "insert"));
  assert.ok(res.document.trackedChanges.some((c) => c.type === "delete"));

  // Phải ghi nhận cảnh báo tương thích rõ ràng
  assert.ok(res.warnings.length > 0, "Phải ghi nhận warning");
  assert.ok(res.warnings.some((w) => w.includes("Threaded Comment") || w.includes("phản hồi phân cấp")));
  assert.ok(res.warnings.some((w) => w.includes("Move Revision") || w.includes("di chuyển văn bản")));
});

// -----------------------------------------------------------------------------
// 10. DATA LOSS SAFETY
// -----------------------------------------------------------------------------
test("PHASE 5.8 — 10. Data Loss Safety: checkDocxExportReviewCompatibility không cảnh báo sai đối với tính năng đã hỗ trợ", () => {
  const model = createBaseModel();
  model.comments = [
    {
      id: "com-ok",
      author: "Tác giả",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      content: "Bình luận chuẩn",
      resolved: false,
    },
  ];
  model.trackedChanges = [
    {
      id: "tc-ins",
      type: "insert",
      author: "Tác giả",
      timestamp: new Date().toISOString(),
      text: "chèn",
    },
    {
      id: "tc-del",
      type: "delete",
      author: "Tác giả",
      timestamp: new Date().toISOString(),
      text: "xóa",
    },
  ];

  const warnings = checkDocxExportReviewCompatibility(model);
  assert.equal(warnings.length, 0, "Không được cảnh báo giả cho các tính năng đã hỗ trợ");

  // Giả định có thay đổi định dạng không hỗ trợ
  const unsupportedModel = createBaseModel();
  unsupportedModel.trackedChanges = [
    {
      id: "tc-format",
      type: "format" as any,
      author: "Tác giả",
      timestamp: new Date().toISOString(),
    },
  ];
  const formatWarnings = checkDocxExportReviewCompatibility(unsupportedModel);
  assert.ok(formatWarnings.length > 0, "Phải cảnh báo khi có loại thay đổi chưa hỗ trợ");
});

// -----------------------------------------------------------------------------
// 11. DOCX REGRESSION (PHASE 4 FEATURES)
// -----------------------------------------------------------------------------
test("PHASE 5.8 — 11. DOCX Regression: Định dạng, danh sách, bảng, sections, header/footer vẫn hoạt động 100%", async () => {
  const richDoc: DocumentModel = {
    metadata: {
      id: "doc-regression",
      title: "Regression Test",
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    pageSettings: {
      paperSize: "A4",
      orientation: "portrait",
      margins: { top: 20, bottom: 20, left: 20, right: 20 },
      marginPreset: "Narrow",
    },
    headerFooter: {
      linkToPrevious: false,
      header: { text: "Tiêu đề đầu trang {PAGE}", alignment: "right" },
      footer: { text: "Trang {PAGE} / {NUMPAGES}", alignment: "center" },
    },
    content: {
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 1, textAlign: "center" },
          content: [{ type: "text", text: "TIÊU ĐỀ CHÍNH" }],
        },
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Chữ đậm ", marks: [{ type: "bold" }] },
            { type: "text", text: "chữ nghiêng ", marks: [{ type: "italic" }] },
            { type: "text", text: "gạch chân.", marks: [{ type: "underline" }] },
          ],
        },
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Mục 1 danh sách" }],
                },
              ],
            },
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
                  content: [
                    {
                      type: "paragraph",
                      content: [{ type: "text", text: "Cột A" }],
                    },
                  ],
                },
                {
                  type: "tableHeader",
                  content: [
                    {
                      type: "paragraph",
                      content: [{ type: "text", text: "Cột B" }],
                    },
                  ],
                },
              ],
            },
            {
              type: "tableRow",
              content: [
                {
                  type: "tableCell",
                  content: [
                    {
                      type: "paragraph",
                      content: [{ type: "text", text: "Dữ liệu 1" }],
                    },
                  ],
                },
                {
                  type: "tableCell",
                  content: [
                    {
                      type: "paragraph",
                      content: [{ type: "text", text: "Dữ liệu 2" }],
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

  const docxBytes = await exportDocumentModelToDocx(richDoc);
  const importRes = await importDocxToDocumentModel(docxBytes, "regression.docx");
  assert.equal(importRes.success, true);
  if (!importRes.success) return;

  const imported = importRes.document;
  const blocks = imported.content.content || [];

  assert.equal(blocks[0].type, "heading");
  assert.equal(blocks[1].type, "paragraph");
  assert.equal(blocks[2].type, "bulletList");
  assert.equal(blocks[3].type, "table");

  // Kiểm tra header/footer
  assert.ok(imported.headerFooter?.header?.text?.includes("{PAGE}"));
  assert.ok(imported.headerFooter?.footer?.text?.includes("{NUMPAGES}"));
});
