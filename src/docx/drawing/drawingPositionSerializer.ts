import type { DrawingPosition } from "./drawingTypes.ts";
import { validateDrawingDistances } from "./drawingTypes.ts";
import { pixelsToEmu } from "../utils/xmlUtils.ts";
import { escapeXmlAttr } from "../serializer/xmlBuilder.ts";
import { pixelsToSignedEmu } from "./drawingPositionService.ts";

export interface DrawingContainerSerializationOptions {
  position: DrawingPosition;
  docPrId: number;
  docPrName: string;
  docPrDescription?: string;
  graphicUri: string;
  graphicContentXml: string;
}

/**
 * Tuần tự hóa một đối tượng DrawingML thành XML của thẻ <w:drawing>
 * Tự động chọn <wp:anchor> nếu là floating hoặc <wp:inline> nếu là inline.
 * Đảm bảo:
 * - Tuân thủ nghiêm ngặt ISO/IEC 29500 WordprocessingDrawing schema sequence.
 * - Tái sử dụng docPr ID được cấp phát từ DocPrIdAllocator tập trung.
 * - Không hardcode tọa độ DOM hay ID quan hệ.
 */
export function serializeDrawingContainer(options: DrawingContainerSerializationOptions): string {
  const { position, docPrId, docPrName, docPrDescription, graphicUri, graphicContentXml } = options;

  const validatedDist = validateDrawingDistances(position);
  const isFloating = position.placement === "floating";
  const cx = pixelsToEmu(Math.max(10, position.width));
  const cy = pixelsToEmu(Math.max(10, position.height));

  const distT = pixelsToEmu(validatedDist.distT);
  const distB = pixelsToEmu(validatedDist.distB);
  const distL = pixelsToEmu(validatedDist.distL);
  const distR = pixelsToEmu(validatedDist.distR);

  const descrAttr = docPrDescription ? ` descr="${escapeXmlAttr(docPrDescription)}"` : "";
  const docPrXml = `<wp:docPr id="${docPrId}" name="${escapeXmlAttr(docPrName)}"${descrAttr}/>`;
  const graphicXml = `<a:graphic>
        <a:graphicData uri="${graphicUri}">
          ${graphicContentXml}
        </a:graphicData>
      </a:graphic>`;

  if (!isFloating) {
    // Xuất thẻ <wp:inline>
    return `<w:drawing>
      <wp:inline distT="${distT}" distB="${distB}" distL="${distL}" distR="${distR}">
        <wp:extent cx="${cx}" cy="${cy}"/>
        <wp:effectExtent b="0" l="0" r="0" t="0"/>
        ${docPrXml}
        <wp:cNvGraphicFramePr/>
        ${graphicXml}
      </wp:inline>
    </w:drawing>`;
  }

  // Xuất thẻ <wp:anchor>
  const behindDoc = position.behindDoc ? "1" : "0";
  const allowOverlap = position.allowOverlap !== false ? "1" : "0";
  const relHeight = position.relativeHeight || 251658240;

  // PositionH (Ngang)
  const relH = position.horizontalRelative || "column";
  let posHContent = "";
  if (position.horizontalAlign) {
    posHContent = `<wp:align>${position.horizontalAlign}</wp:align>`;
  } else {
    const offXEmu = pixelsToSignedEmu(position.offsetX || 0);
    posHContent = `<wp:posOffset>${offXEmu}</wp:posOffset>`;
  }
  const posHXml = `<wp:positionH relativeFrom="${relH}">${posHContent}</wp:positionH>`;

  // PositionV (Dọc)
  const relV = position.verticalRelative || "paragraph";
  let posVContent = "";
  if (position.verticalAlign) {
    posVContent = `<wp:align>${position.verticalAlign}</wp:align>`;
  } else {
    const offYEmu = pixelsToSignedEmu(position.offsetY || 0);
    posVContent = `<wp:posOffset>${offYEmu}</wp:posOffset>`;
  }
  const posVXml = `<wp:positionV relativeFrom="${relV}">${posVContent}</wp:positionV>`;

  // Wrap Element (OOXML Text Wrapping)
  const wrapTextSide = position.wrapTextSide || "bothSides";
  let wrapXml = "<wp:wrapNone/>";

  const serializePolygonXml = (pts: { x: number; y: number }[]): string => {
    const startPt = pts[0];
    let body = `<wp:start x="${pixelsToSignedEmu(startPt.x)}" y="${pixelsToSignedEmu(startPt.y)}"/>`;
    for (let i = 1; i < pts.length; i++) {
      body += `<wp:lineTo x="${pixelsToSignedEmu(pts[i].x)}" y="${pixelsToSignedEmu(pts[i].y)}"/>`;
    }
    return `<wp:wrapPolygon edited="0">${body}</wp:wrapPolygon>`;
  };

  switch (position.wrapMode) {
    case "square":
      wrapXml = `<wp:wrapSquare wrapText="${wrapTextSide}"/>`;
      break;
    case "tight":
      if (position.wrapPolygon && position.wrapPolygon.length >= 3) {
        wrapXml = `<wp:wrapTight wrapText="${wrapTextSide}">${serializePolygonXml(position.wrapPolygon)}</wp:wrapTight>`;
      } else {
        wrapXml = `<wp:wrapTight wrapText="${wrapTextSide}"/>`;
      }
      break;
    case "through":
      if (position.wrapPolygon && position.wrapPolygon.length >= 3) {
        wrapXml = `<wp:wrapThrough wrapText="${wrapTextSide}">${serializePolygonXml(position.wrapPolygon)}</wp:wrapThrough>`;
      } else {
        wrapXml = `<wp:wrapThrough wrapText="${wrapTextSide}"/>`;
      }
      break;
    case "topAndBottom":
    case "topBottom" as any:
      wrapXml = "<wp:wrapTopAndBottom/>";
      break;
    case "none":
    default:
      wrapXml = "<wp:wrapNone/>";
      break;
  }

  return `<w:drawing>
      <wp:anchor distT="${distT}" distB="${distB}" distL="${distL}" distR="${distR}"
                 simplePos="0" relativeHeight="${relHeight}"
                 behindDoc="${behindDoc}" locked="0" layoutInCell="1" allowOverlap="${allowOverlap}">
        <wp:simplePos x="0" y="0"/>
        ${posHXml}
        ${posVXml}
        <wp:extent cx="${cx}" cy="${cy}"/>
        <wp:effectExtent b="0" l="0" r="0" t="0"/>
        ${wrapXml}
        ${docPrXml}
        <wp:cNvGraphicFramePr/>
        ${graphicXml}
      </wp:anchor>
    </w:drawing>`;
}
