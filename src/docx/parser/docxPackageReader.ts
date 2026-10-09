import JSZip from "jszip";
import type { DocxPackageParts } from "../types/docxTypes.ts";

/**
 * Đọc toàn bộ các phần XML và Media cần thiết từ gói ZIP .docx
 */
export async function readDocxPackage(
  data: ArrayBuffer | Uint8Array
): Promise<DocxPackageParts> {
  if (
    !data ||
    (data instanceof Uint8Array && data.length === 0) ||
    (data instanceof ArrayBuffer && data.byteLength === 0)
  ) {
    throw new Error("Tệp DOCX rỗng hoặc không có dữ liệu.");
  }

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(data);
  } catch (err) {
    throw new Error(
      `Không thể đọc tệp .docx (không phải tệp ZIP hợp lệ hoặc tệp bị hỏng: ${
        err instanceof Error ? err.message : String(err)
      })`
    );
  }

  // Tìm kiếm file không phân biệt hoa thường hoặc tiền tố đường dẫn
  function findZipFile(predicate: (path: string) => boolean) {
    for (const relativePath of Object.keys(zip.files)) {
      if (predicate(relativePath)) {
        return zip.files[relativePath];
      }
    }
    return null;
  }

  // 1. Đọc word/document.xml (bắt buộc)
  const docFile = findZipFile(
    (p) => p.toLowerCase() === "word/document.xml"
  );
  if (!docFile || docFile.dir) {
    throw new Error("Tệp DOCX không hợp lệ: Thiếu thành phần word/document.xml bắt buộc.");
  }
  const documentXml = await docFile.async("string");

  // 2. Đọc word/styles.xml (tùy chọn)
  const stylesFile = findZipFile(
    (p) => p.toLowerCase() === "word/styles.xml"
  );
  const stylesXml = stylesFile && !stylesFile.dir ? await stylesFile.async("string") : undefined;

  // 3. Đọc word/numbering.xml (tùy chọn)
  const numFile = findZipFile(
    (p) => p.toLowerCase() === "word/numbering.xml"
  );
  const numberingXml = numFile && !numFile.dir ? await numFile.async("string") : undefined;

  // 4. Đọc word/_rels/document.xml.rels (tùy chọn)
  const relsFile = findZipFile(
    (p) => p.toLowerCase() === "word/_rels/document.xml.rels"
  );
  const documentRelsXml = relsFile && !relsFile.dir ? await relsFile.async("string") : undefined;

  // 5. Đọc _rels/.rels (tùy chọn)
  const coreRelsFile = findZipFile(
    (p) => p.toLowerCase() === "_rels/.rels"
  );
  const coreRelsXml = coreRelsFile && !coreRelsFile.dir ? await coreRelsFile.async("string") : undefined;

  // 6. Đọc các tệp header (word/header*.xml)
  const headersXml = new Map<string, string>();
  for (const [path, entry] of Object.entries(zip.files)) {
    if (!entry.dir && /^word\/header\d*\.xml$/i.test(path)) {
      const content = await entry.async("string");
      headersXml.set(path.toLowerCase(), content);
    }
  }

  // 7. Đọc các tệp footer (word/footer*.xml)
  const footersXml = new Map<string, string>();
  for (const [path, entry] of Object.entries(zip.files)) {
    if (!entry.dir && /^word\/footer\d*\.xml$/i.test(path)) {
      const content = await entry.async("string");
      footersXml.set(path.toLowerCase(), content);
    }
  }

  // 8. Đọc word/_rels/header*.xml.rels và word/_rels/footer*.xml.rels (Phase 12)
  const headerRelsXml = new Map<string, string>();
  for (const [path, entry] of Object.entries(zip.files)) {
    if (!entry.dir && /^word\/_rels\/header\d*\.xml\.rels$/i.test(path)) {
      const content = await entry.async("string");
      headerRelsXml.set(path.toLowerCase(), content);
    }
  }

  const footerRelsXml = new Map<string, string>();
  for (const [path, entry] of Object.entries(zip.files)) {
    if (!entry.dir && /^word\/_rels\/footer\d*\.xml\.rels$/i.test(path)) {
      const content = await entry.async("string");
      footerRelsXml.set(path.toLowerCase(), content);
    }
  }

  // 8.1 Đọc word/comments.xml (tùy chọn - Phase 5.8)
  const commentsFile = findZipFile(
    (p) => p.toLowerCase() === "word/comments.xml"
  );
  const commentsXml = commentsFile && !commentsFile.dir ? await commentsFile.async("string") : undefined;

  // 8.2 Đọc word/footnotes.xml & word/endnotes.xml (Phase 6.4)
  const footnotesFile = findZipFile(
    (p) => p.toLowerCase() === "word/footnotes.xml"
  );
  const footnotesXml = footnotesFile && !footnotesFile.dir ? await footnotesFile.async("string") : undefined;

  const endnotesFile = findZipFile(
    (p) => p.toLowerCase() === "word/endnotes.xml"
  );
  const endnotesXml = endnotesFile && !endnotesFile.dir ? await endnotesFile.async("string") : undefined;

  // 9. Đọc các tệp media (word/media/*)
  const mediaFiles = new Map<string, Uint8Array>();
  for (const [path, entry] of Object.entries(zip.files)) {
    if (!entry.dir && /^word\/media\/.+/i.test(path)) {
      const bytes = await entry.async("uint8array");
      mediaFiles.set(path.toLowerCase(), bytes);
    }
  }

  // 10. Thu thập các unsupported parts (charts, diagrams, themes, settings...) & phát hiện Macro
  const unsupportedParts = new Map<string, string | Uint8Array>();
  let hasMacro = false;

  for (const [path, entry] of Object.entries(zip.files)) {
    if (entry.dir) continue;
    const lower = path.toLowerCase();

    if (/vbaproject\.bin|vbadata\.xml/i.test(lower)) {
      hasMacro = true;
      continue; // Không bảo toàn executable macro binaries
    }

    // Bỏ qua các thành phần đã được quản lý chuyên biệt
    if (
      lower === "word/document.xml" ||
      lower === "word/styles.xml" ||
      lower === "word/numbering.xml" ||
      lower === "word/_rels/document.xml.rels" ||
      lower === "_rels/.rels" ||
      lower === "word/comments.xml" ||
      lower === "word/footnotes.xml" ||
      lower === "word/endnotes.xml" ||
      lower === "[content_types].xml" ||
      /^word\/header\d*\.xml$/.test(lower) ||
      /^word\/footer\d*\.xml$/.test(lower) ||
      /^word\/_rels\/header\d*\.xml\.rels$/.test(lower) ||
      /^word\/_rels\/footer\d*\.xml\.rels$/.test(lower) ||
      /^word\/media\//.test(lower)
    ) {
      continue;
    }

    // Các parts cần bảo toàn: charts, diagrams, theme, fontTable, settings, embeddings...
    if (
      lower.startsWith("word/charts/") ||
      lower.startsWith("word/diagrams/") ||
      lower.startsWith("word/theme/") ||
      lower.startsWith("word/embeddings/") ||
      lower === "word/settings.xml" ||
      lower === "word/websettings.xml" ||
      lower === "word/fonttable.xml"
    ) {
      const isXml = lower.endsWith(".xml") || lower.endsWith(".rels");
      if (isXml) {
        const textContent = await entry.async("string");
        unsupportedParts.set(path, textContent);
      } else {
        const bytes = await entry.async("uint8array");
        unsupportedParts.set(path, bytes);
      }
    }
  }

  return {
    documentXml,
    stylesXml,
    numberingXml,
    documentRelsXml,
    coreRelsXml,
    commentsXml,
    footnotesXml,
    endnotesXml,
    headersXml,
    footersXml,
    headerRelsXml,
    footerRelsXml,
    mediaFiles,
    unsupportedParts,
    hasMacro,
  };
}
