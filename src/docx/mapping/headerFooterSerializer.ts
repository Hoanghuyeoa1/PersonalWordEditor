import type {
  HeaderFooterItem,
  HeaderFooterImage,
} from "../../page/types/headerFooterTypes.ts";
import { buildTextElement, escapeXmlAttr } from "../serializer/xmlBuilder.ts";
import { parseFieldInstruction } from "../../fields/services/fieldEngine.ts";
import { serializeFieldXml } from "./fieldSerializer.ts";
import { RelationshipAllocator, type RelationshipScope } from "../relationships/relationshipAllocator.ts";
import { DocPrIdAllocator } from "../utils/idAllocator.ts";
import { serializeDrawingContainer } from "../drawing/drawingPositionSerializer.ts";
import { pixelsToEmu } from "../utils/xmlUtils.ts";
import type { DrawingPosition } from "../drawing/drawingTypes.ts";

export interface HeaderFooterSerializationOptions {
  relAllocator?: RelationshipAllocator;
  scope?: RelationshipScope;
  mediaFiles?: Map<string, Uint8Array>;
  docPrAllocator?: DocPrIdAllocator;
}

/**
 * Trích xuất nhị phân ảnh từ Base64 Data URL (dùng chung cho Header/Footer và Document)
 */
export function parseImageDataUrl(src: string): { data: Uint8Array; extension: string } | null {
  if (!src) return null;
  const match = src.match(/^data:image\/([a-zA-Z0-9\+\-]+);base64,(.+)$/);
  if (match) {
    let ext = match[1].toLowerCase();
    if (ext === "jpeg" || ext === "jpg") ext = "jpeg";
    else if (ext === "svg+xml") ext = "svg";
    else if (ext === "png") ext = "png";
    else if (ext === "gif") ext = "gif";
    else if (ext === "webp") ext = "webp";

    try {
      const binaryString = atob(match[2]);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      return { data: bytes, extension: ext };
    } catch {
      return null;
    }
  }

  if (src.length > 100 && /^[A-Za-z0-9+/=]+$/.test(src.substring(0, 100))) {
    try {
      const binaryString = atob(src);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      return { data: bytes, extension: "png" };
    } catch {
      return null;
    }
  }

  return null;
}

const FALLBACK_1X1_PNG = new Uint8Array([
  137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1,
  0, 0, 0, 1, 8, 6, 0, 0, 0, 31, 21, 196, 137, 0, 0, 0, 10, 73, 68, 65, 84,
  120, 156, 99, 0, 1, 0, 0, 5, 0, 1, 13, 10, 45, 180, 0, 0, 0, 0, 73, 69, 78,
  68, 174, 66, 96, 130,
]);

let headerImageCounter = 1;

/**
 * Tạo nội dung XML cho header hoặc footer part trong gói DOCX
 * Tái sử dụng Field Engine, Drawing Engine, và Relationship Allocator (Phase 12).
 */
export function buildHeaderFooterXml(
  item: HeaderFooterItem | null | undefined,
  type: "header" | "footer",
  options?: HeaderFooterSerializationOptions
): string {
  const rootTag = type === "header" ? "w:hdr" : "w:ftr";

  const hasText = Boolean(item?.text && item.text.trim());
  const hasImage = Boolean(item?.image || (item?.images && item.images.length > 0));
  const hasShapes = Boolean(item?.shapes && item.shapes.length > 0);
  const hasTextBoxes = Boolean(item?.textBoxes && item.textBoxes.length > 0);

  if (!item || (!hasText && !hasImage && !hasShapes && !hasTextBoxes)) {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<${rootTag} xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
       xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
       xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
       xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
       xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
  <w:p>
    <w:pPr>
      <w:jc w:val="center"/>
    </w:pPr>
  </w:p>
</${rootTag}>`;
  }

  const alignment = item.alignment || "center";
  const rPrParts: string[] = [];
  if (item.bold) rPrParts.push("<w:b/>");
  if (item.italic) rPrParts.push("<w:i/>");
  rPrParts.push('<w:sz w:val="18"/>');
  rPrParts.push('<w:szCs w:val="18"/>');
  rPrParts.push('<w:color w:val="6B7280"/>');
  const rPrXml = rPrParts.length > 0 ? `<w:rPr>${rPrParts.join("")}</w:rPr>` : "";

  const elementsXml: string[] = [];

  // 1. Phân tách chuỗi để nhận diện các trường động qua Shared Field Engine (Phase 12)
  if (item.text) {
    const tokens = item.text.split(
      /(\{PAGE\}|\{NUMPAGES\}|\{SECTION\}|\{SECTIONPAGES\}|\{TITLE\}|\{AUTHOR\}|\{DATE\}|\{TIME\})/gi
    );

    for (const token of tokens) {
      if (!token) continue;
      const upper = token.toUpperCase();
      if (upper === "{PAGE}") {
        const fieldAttrs = parseFieldInstruction("PAGE", "1");
        elementsXml.push(serializeFieldXml(fieldAttrs, rPrXml));
      } else if (upper === "{NUMPAGES}") {
        const fieldAttrs = parseFieldInstruction("NUMPAGES", "1");
        elementsXml.push(serializeFieldXml(fieldAttrs, rPrXml));
      } else if (upper === "{SECTION}") {
        const fieldAttrs = parseFieldInstruction("SECTION", "1");
        elementsXml.push(serializeFieldXml(fieldAttrs, rPrXml));
      } else if (upper === "{SECTIONPAGES}") {
        const fieldAttrs = parseFieldInstruction("SECTIONPAGES", "1");
        elementsXml.push(serializeFieldXml(fieldAttrs, rPrXml));
      } else if (upper === "{TITLE}") {
        const fieldAttrs = parseFieldInstruction("TITLE", "Document");
        elementsXml.push(serializeFieldXml(fieldAttrs, rPrXml));
      } else if (upper === "{AUTHOR}") {
        const fieldAttrs = parseFieldInstruction("AUTHOR", "Author");
        elementsXml.push(serializeFieldXml(fieldAttrs, rPrXml));
      } else if (upper === "{DATE}") {
        const fieldAttrs = parseFieldInstruction("DATE", new Date().toISOString().slice(0, 10));
        elementsXml.push(serializeFieldXml(fieldAttrs, rPrXml));
      } else if (upper === "{TIME}") {
        const fieldAttrs = parseFieldInstruction("TIME", "12:00");
        elementsXml.push(serializeFieldXml(fieldAttrs, rPrXml));
      } else {
        elementsXml.push(`<w:r>${rPrXml}${buildTextElement(token)}</w:r>`);
      }
    }
  }

  // 2. Tuần tự hóa Images nếu có (Phase 12 Requirement 3)
  const imageList: HeaderFooterImage[] = [];
  if (item.image) imageList.push(item.image);
  if (item.images && Array.isArray(item.images)) imageList.push(...item.images);

  if (imageList.length > 0) {
    const relAllocator = options?.relAllocator || new RelationshipAllocator();
    const scope: RelationshipScope = options?.scope || (type === "header" ? "header:header1.xml" : "footer:footer1.xml");
    const mediaFiles = options?.mediaFiles;
    const docPrAllocator = options?.docPrAllocator || new DocPrIdAllocator();

    for (const img of imageList) {
      const parsedData = parseImageDataUrl(img.src);
      const ext = parsedData?.extension || "png";
      const bytes = parsedData?.data || FALLBACK_1X1_PNG;
      const mediaFileName = `image_hf_${headerImageCounter++}.${ext}`;

      if (mediaFiles) {
        mediaFiles.set(mediaFileName, bytes);
      }

      // Đăng ký quan hệ trong header/footer relationship scope
      const relId = relAllocator.allocate(
        scope,
        "http://schemas.openxmlformats.org/officeDocument/2006/relationships/image",
        `media/${mediaFileName}`
      );

      const widthPx = typeof img.width === "number" && img.width > 0 ? img.width : 120;
      const heightPx = typeof img.height === "number" && img.height > 0 ? img.height : 40;
      const cx = pixelsToEmu(widthPx);
      const cy = pixelsToEmu(heightPx);

      const docPr = docPrAllocator.allocateDocPr("Picture", img.alt || "Header Image");
      const docPrId = docPr.id;

      const drawingPosition: DrawingPosition = img.drawingPosition || {
        placement: "inline",
        width: widthPx,
        height: heightPx,
        distT: 0,
        distB: 0,
        distL: 0,
        distR: 0,
        wrapMode: "inline",
      };

      const picXml = `<pic:pic>
              <pic:nvPicPr>
                <pic:cNvPr id="${docPrId}" name="${escapeXmlAttr(docPr.name)}"/>
                <pic:cNvPicPr/>
              </pic:nvPicPr>
              <pic:blipFill>
                <a:blip r:embed="${relId}"/>
                <a:stretch><a:fillRect/></a:stretch>
              </pic:blipFill>
              <pic:spPr>
                <a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>
                <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
              </pic:spPr>
            </pic:pic>`;

      const drawingXml = serializeDrawingContainer({
        position: drawingPosition,
        docPrId,
        docPrName: docPr.name,
        docPrDescription: img.alt || "Header Image",
        graphicUri: "http://schemas.openxmlformats.org/drawingml/2006/picture",
        graphicContentXml: picXml,
      });

      elementsXml.push(`<w:r>${drawingXml}</w:r>`);
    }
  }

  // 3. Tuần tự hóa Simple Shapes nếu có (Phase 12 Requirement 4)
  if (hasShapes && item.shapes) {
    const docPrAllocator = options?.docPrAllocator || new DocPrIdAllocator();
    for (const shp of item.shapes) {
      const shapeType = shp.shapeType || "rectangle";
      let prst = "rect";
      if (shapeType === "roundedRectangle") prst = "roundRect";
      else if (shapeType === "ellipse") prst = "ellipse";
      else if (shapeType === "line") prst = "line";
      else if (shapeType === "arrow") prst = "rightArrow";

      const widthPx = typeof shp.width === "number" ? shp.width : 100;
      const heightPx = typeof shp.height === "number" ? shp.height : 50;
      const cx = pixelsToEmu(widthPx);
      const cy = pixelsToEmu(heightPx);
      const docPr = docPrAllocator.allocateDocPr("Shape", shapeType);

      const drawingPos: DrawingPosition = shp.drawingPosition || {
        placement: "inline",
        width: widthPx,
        height: heightPx,
        distT: 0,
        distB: 0,
        distL: 0,
        distR: 0,
        wrapMode: "inline",
      };

      const wspXml = `<wps:wsp xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape">
              <wps:cNvSpPr/>
              <wps:spPr>
                <a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>
                <a:prstGeom prst="${prst}"><a:avLst/></a:prstGeom>
                <a:solidFill><a:srgbClr val="3B82F6"/></a:solidFill>
                <a:ln w="12700"><a:solidFill><a:srgbClr val="1D4ED8"/></a:solidFill></a:ln>
              </wps:spPr>
              <wps:bodyPr/>
            </wps:wsp>`;

      const drawingXml = serializeDrawingContainer({
        position: drawingPos,
        docPrId: docPr.id,
        docPrName: docPr.name,
        docPrDescription: shapeType,
        graphicUri: "http://schemas.microsoft.com/office/word/2010/wordprocessingShape",
        graphicContentXml: wspXml,
      });

      elementsXml.push(`<w:r>${drawingXml}</w:r>`);
    }
  }

  // 4. Tuần tự hóa Simple TextBox nếu có (Phase 12 Requirement 4)
  if (hasTextBoxes && item.textBoxes) {
    const docPrAllocator = options?.docPrAllocator || new DocPrIdAllocator();
    for (const tb of item.textBoxes) {
      const widthPx = typeof tb.width === "number" ? tb.width : 150;
      const heightPx = typeof tb.minHeight === "number" ? tb.minHeight : 40;
      const cx = pixelsToEmu(widthPx);
      const cy = pixelsToEmu(heightPx);
      const docPr = docPrAllocator.allocateDocPr("TextBox", "Text Box");

      const drawingPos: DrawingPosition = tb.drawingPosition || {
        placement: "inline",
        width: widthPx,
        height: heightPx,
        distT: 0,
        distB: 0,
        distL: 0,
        distR: 0,
        wrapMode: "inline",
      };

      const text = tb.text || "";
      const wspXml = `<wps:wsp xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape">
              <wps:cNvSpPr/>
              <wps:spPr>
                <a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>
                <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
                <a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill>
                <a:ln w="12700"><a:solidFill><a:srgbClr val="CBD5E1"/></a:solidFill></a:ln>
              </wps:spPr>
              <wps:txbx>
                <w:txbxContent>
                  <w:p><w:r><w:t>${escapeXmlAttr(text)}</w:t></w:r></w:p>
                </w:txbxContent>
              </wps:txbx>
              <wps:bodyPr/>
            </wps:wsp>`;

      const drawingXml = serializeDrawingContainer({
        position: drawingPos,
        docPrId: docPr.id,
        docPrName: docPr.name,
        docPrDescription: "TextBox",
        graphicUri: "http://schemas.microsoft.com/office/word/2010/wordprocessingShape",
        graphicContentXml: wspXml,
      });

      elementsXml.push(`<w:r>${drawingXml}</w:r>`);
    }
  }

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<${rootTag} xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
       xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
       xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
       xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
       xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
  <w:p>
    <w:pPr>
      <w:jc w:val="${alignment}"/>
    </w:pPr>
    ${elementsXml.join("\n    ")}
  </w:p>
</${rootTag}>`;
}
