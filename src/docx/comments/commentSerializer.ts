import type { CommentItem } from "../../document/documentTypes.ts";
import { escapeXmlAttr, buildTextElement } from "../serializer/xmlBuilder.ts";

/**
 * Xây dựng nội dung tệp word/comments.xml chuẩn ISO/IEC 29500 WordprocessingML
 *
 * Tương thích Microsoft Word 2013/2016/2019/365 và LibreOffice Writer:
 * - Bảo toàn id, author, date, resolved (w:done="1")
 * - Định dạng phân đoạn chuẩn CommentText và CommentReference
 */
export function buildCommentsXml(
  comments: CommentItem[],
  idMap: Map<string, string>
): string {
  if (!comments || comments.length === 0) {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:comments xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"/>`;
  }

  const commentNodes: string[] = [];

  for (let idx = 0; idx < comments.length; idx++) {
    const c = comments[idx];
    const ooxmlId = idMap.get(c.id) ?? String(idx);
    const author = escapeXmlAttr(c.author || "Author");
    const date = escapeXmlAttr(c.createdAt || new Date().toISOString());
    const doneAttr = c.resolved ? ' w:done="1"' : "";

    // Tách nội dung nhiều dòng thành nhiều đoạn văn w:p nếu có
    const paragraphs = (c.content || "").split("\n");
    const pElements = paragraphs.map((line, pIdx) => {
      if (pIdx === 0) {
        // Đoạn đầu tiên chứa thẻ tham chiếu w:annotationRef
        return `    <w:p>
      <w:pPr><w:pStyle w:val="CommentText"/></w:pPr>
      <w:r>
        <w:rPr><w:rStyle w:val="CommentReference"/></w:rPr>
        <w:annotationRef/>
      </w:r>
      <w:r>${buildTextElement(line)}</w:r>
    </w:p>`;
      } else {
        return `    <w:p>
      <w:pPr><w:pStyle w:val="CommentText"/></w:pPr>
      <w:r>${buildTextElement(line)}</w:r>
    </w:p>`;
      }
    });

    commentNodes.push(`  <w:comment w:id="${ooxmlId}" w:author="${author}" w:date="${date}"${doneAttr}>
${pElements.join("\n")}
  </w:comment>`);
  }

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:comments xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
${commentNodes.join("\n")}
</w:comments>`;
}
