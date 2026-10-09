import {
  parseXmlString,
  getDirectChildrenByLocalName,
  getLocalName,
  getAttrValue,
} from "../utils/xmlUtils.ts";
import type { DocxCommentMap, DocxParsedComment } from "../types/docxTypes.ts";

/**
 * Trích xuất toàn bộ văn bản thuần từ các đoạn văn bên trong một thẻ <w:comment>
 */
function extractCommentText(commentEl: Element): string {
  const paragraphs = getDirectChildrenByLocalName(commentEl, "p");
  const paraTexts: string[] = [];

  for (const p of paragraphs) {
    const textPieces: string[] = [];
    // Duyệt qua tất cả con của paragraph (các runs w:r)
    for (let i = 0; i < p.childNodes.length; i++) {
      const child = p.childNodes[i];
      if (child.nodeType !== 1) continue;
      const local = getLocalName(child).toLowerCase();

      if (local === "r") {
        for (let j = 0; j < child.childNodes.length; j++) {
          const runChild = child.childNodes[j];
          if (runChild.nodeType !== 1) continue;
          const rLocal = getLocalName(runChild).toLowerCase();

          // Lấy text trong w:t, bỏ qua w:annotationRef
          if (rLocal === "t") {
            textPieces.push(runChild.textContent || "");
          } else if (rLocal === "tab") {
            textPieces.push("\t");
          } else if (rLocal === "br") {
            textPieces.push("\n");
          }
        }
      }
    }
    paraTexts.push(textPieces.join(""));
  }

  // Nếu không có paragraph, tìm trực tiếp các thẻ t
  if (paraTexts.length === 0) {
    const allRuns = commentEl.getElementsByTagName("w:t");
    for (let i = 0; i < allRuns.length; i++) {
      paraTexts.push(allRuns[i].textContent || "");
    }
  }

  return paraTexts.join("\n").trim();
}

/**
 * Phân tích cú pháp tệp word/comments.xml thành bản đồ DocxCommentMap
 *
 * Hỗ trợ:
 * - Trích xuất id, author, date, content, initials
 * - Nhận diện trạng thái resolved (w:done="1" hoặc w:done="true")
 * - Nhận diện quan hệ thảo luận phản hồi (parentCommentId / threaded comments)
 * - Xử lý an toàn khi thiếu thuộc tính hoặc tệp comments.xml rỗng
 */
export function parseComments(commentsXml?: string): DocxCommentMap {
  const result: DocxCommentMap = new Map();
  if (!commentsXml || !commentsXml.trim()) {
    return result;
  }

  try {
    const doc = parseXmlString(commentsXml);
    const root = doc.documentElement;
    if (!root) return result;

    const commentElements = getDirectChildrenByLocalName(root, "comment");

    for (const el of commentElements) {
      const id = getAttrValue(el, "id");
      if (!id) continue;

      const author = getAttrValue(el, "author") || "Author";
      const date = getAttrValue(el, "date") || new Date().toISOString();
      const initials = getAttrValue(el, "initials") || undefined;

      // Trạng thái đã giải quyết: w:done="1" | "true"
      const doneVal = (getAttrValue(el, "done") || "").toLowerCase();
      const resolved = doneVal === "1" || doneVal === "true";

      // Phản hồi phân cấp (Threaded Comment / replies): w16cid:paraIdParent hoặc tương đương
      let parentCommentId: string | undefined;
      const parentAttr =
        getAttrValue(el, "paraIdParent") ||
        getAttrValue(el, "parent") ||
        el.getAttribute("w16cid:paraIdParent") ||
        el.getAttribute("w:parent");
      if (parentAttr) {
        parentCommentId = parentAttr;
      }

      const content = extractCommentText(el);

      const parsedComment: DocxParsedComment = {
        id,
        author,
        date,
        content,
        resolved,
        initials,
        parentCommentId,
      };

      result.set(id, parsedComment);
    }
  } catch (err) {
    console.warn("Lỗi khi phân tích word/comments.xml:", err);
  }

  return result;
}
