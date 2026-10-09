import type { DocumentMapperContext } from "../mapping/documentMapper.ts";
import type {
  DrawingPosition,
  DrawingPlacement,
  HorizontalRelative,
  VerticalRelative,
  HorizontalAlignment,
  VerticalAlignment,
  WrapMode,
  WrapTextSide,
  WrapPolygonPoint,
  ParsedDrawingObject,
  DrawingPayload,
} from "./drawingTypes.ts";
import { validateDrawingDistances } from "./drawingTypes.ts";
import {
  findDescendantByLocalName,
  getFirstChildByLocalName,
  getLocalName,
  getAttrValue,
  emuToPixels,
} from "../utils/xmlUtils.ts";
import {
  emuToSignedPixels,
  normalizeHorizontalRelative,
  normalizeVerticalRelative,
  normalizeHorizontalAlignment,
  normalizeVerticalAlignment,
} from "./drawingPositionService.ts";
import type { JSONContent } from "@tiptap/core";

/**
 * Shared Parser cho các đối tượng DrawingML trong OOXML (wp:inline và wp:anchor).
 * Không viết parser riêng cho mỗi loại đối tượng (Image, Shape, TextBox).
 *
 * Tuân thủ ISO/IEC 29500 WordprocessingDrawing:
 * - Trích xuất đầy đủ: positionH, positionV, extent, dist attributes, wrap mode, docPr, behindDoc, allowOverlap.
 * - Tự động nhận diện payload (Image, Shape, TextBox).
 * - Fallback an toàn: nếu thiếu dữ liệu neo, giữ kích thước và chuyển sang vị trí an toàn, không drop object.
 */
export function parseDrawingElement(
  drawingEl: Element,
  ctx: DocumentMapperContext
): ParsedDrawingObject | null {
  if (!drawingEl) return null;

  // 1. Phân biệt wp:inline vs wp:anchor
  const anchorEl = findDescendantByLocalName(drawingEl, "anchor");
  const inlineEl = findDescendantByLocalName(drawingEl, "inline");
  const containerEl = anchorEl || inlineEl;

  if (!containerEl) {
    // Có thể là DrawingML dạng thô hoặc pict VML
    return parseLegacyPictOrRawDrawing(drawingEl, ctx);
  }

  const isAnchor = Boolean(anchorEl);
  const placement: DrawingPlacement = isAnchor ? "floating" : "inline";

  // 2. Extent (wp:extent: cx, cy)
  const extentEl = findDescendantByLocalName(containerEl, "extent");
  let width = 400;
  let height = 260;

  if (extentEl) {
    const cxStr = getAttrValue(extentEl, "cx");
    const cyStr = getAttrValue(extentEl, "cy");
    if (cxStr && cyStr) {
      const cxEmu = parseInt(cxStr, 10);
      const cyEmu = parseInt(cyStr, 10);
      if (!isNaN(cxEmu) && cxEmu > 0) width = emuToPixels(cxEmu);
      if (!isNaN(cyEmu) && cyEmu > 0) height = emuToPixels(cyEmu);
      if (isNaN(cxEmu) || cxEmu <= 0 || isNaN(cyEmu) || cyEmu <= 0) {
        ctx.diagnostics?.recordApproximated(
          "Drawing",
          "DRAWING_INVALID_EXTENT",
          "Kích thước hình vẽ (extent) không hợp lệ, đã khôi phục về kích thước chuẩn an toàn."
        );
      }
    }
  }

  // 3. Distance attributes (distT, distB, distL, distR) - Validation: finite, >= 0, reasonable bound
  const distTEmu = parseInt(getAttrValue(containerEl, "distt") || "0", 10);
  const distBEmu = parseInt(getAttrValue(containerEl, "distb") || "0", 10);
  const distLEmu = parseInt(getAttrValue(containerEl, "distl") || "0", 10);
  const distREmu = parseInt(getAttrValue(containerEl, "distr") || "0", 10);

  const rawDist = {
    distT: emuToPixels(isNaN(distTEmu) ? 0 : distTEmu),
    distB: emuToPixels(isNaN(distBEmu) ? 0 : distBEmu),
    distL: emuToPixels(isNaN(distLEmu) ? 0 : distLEmu),
    distR: emuToPixels(isNaN(distREmu) ? 0 : distREmu),
  };
  const { distT, distB, distL, distR } = validateDrawingDistances(rawDist);

  // 4. Non-visual Object Properties (wp:docPr)
  const docPrEl = findDescendantByLocalName(containerEl, "docpr");
  let docPrId: number | undefined;
  let docPrName: string | undefined;
  let docPrDescription: string | undefined;

  if (docPrEl) {
    const idStr = getAttrValue(docPrEl, "id");
    if (idStr) {
      const parsedId = parseInt(idStr, 10);
      if (!isNaN(parsedId)) docPrId = parsedId;
    }
    docPrName = getAttrValue(docPrEl, "name") || undefined;
    docPrDescription = getAttrValue(docPrEl, "descr") || undefined;
  }

  // 5. Positioning & Wrap Mode cho wp:anchor
  let horizontalRelative: HorizontalRelative | undefined;
  let horizontalAlign: HorizontalAlignment | undefined;
  let offsetX: number | undefined;

  let verticalRelative: VerticalRelative | undefined;
  let verticalAlign: VerticalAlignment | undefined;
  let offsetY: number | undefined;

  let wrapMode: WrapMode = isAnchor ? "none" : "inline";
  let wrapTextSide: WrapTextSide | undefined;
  let wrapPolygon: WrapPolygonPoint[] | undefined;
  let behindDoc = false;
  let allowOverlap = true;
  let relativeHeight: number | undefined;

  if (isAnchor) {
    const behindDocAttr = getAttrValue(containerEl, "behinddoc");
    behindDoc = behindDocAttr === "1" || behindDocAttr?.toLowerCase() === "true";

    const allowOverlapAttr = getAttrValue(containerEl, "allowoverlap");
    if (allowOverlapAttr === "0" || allowOverlapAttr?.toLowerCase() === "false") {
      allowOverlap = false;
    }

    const relHeightStr = getAttrValue(containerEl, "relativeheight");
    if (relHeightStr) {
      const parsedRelHeight = parseInt(relHeightStr, 10);
      if (!isNaN(parsedRelHeight)) relativeHeight = parsedRelHeight;
    }

    // Horizontal Position (wp:positionH)
    const posHEl = findDescendantByLocalName(containerEl, "positionh");
    if (posHEl) {
      horizontalRelative = normalizeHorizontalRelative(getAttrValue(posHEl, "relativefrom"));

      const alignEl = getFirstChildByLocalName(posHEl, "align");
      if (alignEl && alignEl.textContent) {
        horizontalAlign = normalizeHorizontalAlignment(alignEl.textContent);
      }

      const offsetEl = getFirstChildByLocalName(posHEl, "posoffset");
      if (offsetEl && offsetEl.textContent) {
        const offsetEmu = parseInt(offsetEl.textContent.trim(), 10);
        if (!isNaN(offsetEmu)) {
          offsetX = emuToSignedPixels(offsetEmu);
        }
      }
    } else {
      horizontalRelative = "column";
      offsetX = 0;
    }

    // Vertical Position (wp:positionV)
    const posVEl = findDescendantByLocalName(containerEl, "positionv");
    if (posVEl) {
      verticalRelative = normalizeVerticalRelative(getAttrValue(posVEl, "relativefrom"));

      const alignEl = getFirstChildByLocalName(posVEl, "align");
      if (alignEl && alignEl.textContent) {
        verticalAlign = normalizeVerticalAlignment(alignEl.textContent);
      }

      const offsetEl = getFirstChildByLocalName(posVEl, "posoffset");
      if (offsetEl && offsetEl.textContent) {
        const offsetEmu = parseInt(offsetEl.textContent.trim(), 10);
        if (!isNaN(offsetEmu)) {
          offsetY = emuToSignedPixels(offsetEmu);
        }
      }
    } else {
      verticalRelative = "paragraph";
      offsetY = 0;
    }

    // Wrap Mode Elements
    const wrapSquareEl = findDescendantByLocalName(containerEl, "wrapsquare");
    const wrapTightEl = findDescendantByLocalName(containerEl, "wraptight");
    const wrapThroughEl = findDescendantByLocalName(containerEl, "wrapthrough");
    const wrapTopBottomEl = findDescendantByLocalName(containerEl, "wraptopandbottom");
    const wrapNoneEl = findDescendantByLocalName(containerEl, "wrapnone");

    if (wrapSquareEl) {
      wrapMode = "square";
      wrapTextSide = normalizeWrapTextSide(getAttrValue(wrapSquareEl, "wraptext"));
    } else if (wrapTightEl) {
      wrapMode = "tight";
      wrapTextSide = normalizeWrapTextSide(getAttrValue(wrapTightEl, "wraptext"));
      wrapPolygon = parseWrapPolygon(wrapTightEl);
    } else if (wrapThroughEl) {
      wrapMode = "through";
      wrapTextSide = normalizeWrapTextSide(getAttrValue(wrapThroughEl, "wraptext"));
      wrapPolygon = parseWrapPolygon(wrapThroughEl);
    } else if (wrapTopBottomEl) {
      wrapMode = "topAndBottom";
    } else if (wrapNoneEl) {
      wrapMode = "none";
    } else {
      // SECTION 6: Unknown wrap -> safe approximation + diagnostic
      let unknownWrapEl: Element | null = null;
      for (let i = 0; i < containerEl.children.length; i++) {
        const child = containerEl.children[i];
        const localName = (child.localName || child.nodeName.split(":").pop() || "").toLowerCase();
        if (localName.startsWith("wrap") && localName !== "wrapnone") {
          unknownWrapEl = child;
          break;
        }
      }

      if (unknownWrapEl) {
        const tagName = unknownWrapEl.localName || unknownWrapEl.nodeName;
        ctx.warnings.push(
          `Phát hiện kiểu text wrapping chưa xác định "${tagName}", tự động áp dụng chế độ an toàn: square.`
        );
        ctx.diagnostics?.recordApproximated(
          "Drawing",
          "DRAWING_UNKNOWN_WRAP",
          `Kiểu bao quanh văn bản chưa xác định "${tagName}", tự động áp dụng chế độ an toàn: square.`
        );
        wrapMode = "square";
        wrapTextSide = "bothSides";
      } else {
        wrapMode = "none";
      }
    }
  }

  const drawingPosition: DrawingPosition = {
    placement,
    width,
    height,
    distT,
    distB,
    distL,
    distR,
    wrapMode,
    ...(wrapTextSide !== undefined ? { wrapTextSide } : {}),
    ...(wrapPolygon !== undefined && wrapPolygon.length > 0 ? { wrapPolygon } : {}),
    behindDoc,
    allowOverlap,
    ...(relativeHeight !== undefined ? { relativeHeight } : {}),
    ...(docPrId !== undefined ? { docPrId } : {}),
    ...(docPrName !== undefined ? { docPrName } : {}),
    ...(docPrDescription !== undefined ? { docPrDescription } : {}),
    ...(isAnchor
      ? {
          ...(horizontalRelative !== undefined ? { horizontalRelative } : {}),
          ...(horizontalAlign !== undefined ? { horizontalAlign } : {}),
          ...(offsetX !== undefined ? { offsetX } : {}),
          ...(verticalRelative !== undefined ? { verticalRelative } : {}),
          ...(verticalAlign !== undefined ? { verticalAlign } : {}),
          ...(offsetY !== undefined ? { offsetY } : {}),
        }
      : {}),
  };

  // 6. Trích xuất Payload (Image, Shape, TextBox)
  const payload = extractDrawingPayload(containerEl, ctx, docPrName, docPrDescription);
  if (!payload) return null;

  return {
    position: drawingPosition,
    payload,
  };
}

/**
 * Trích xuất payload bên trong a:graphicData
 */
function extractDrawingPayload(
  containerEl: Element,
  ctx: DocumentMapperContext,
  defaultName?: string,
  defaultDescr?: string
): DrawingPayload | null {
  // 1. Kiểm tra Hình ảnh (Picture / Blip)
  const blipEl = findDescendantByLocalName(containerEl, "blip");
  if (blipEl) {
    const embedId =
      blipEl.getAttribute("r:embed") ||
      blipEl.getAttribute("embed") ||
      blipEl.getAttribute("r:id") ||
      blipEl.getAttribute("id");

    if (embedId) {
      let mediaItem = ctx.mediaByRelId.get(embedId);
      if (!mediaItem) {
        const rel = ctx.relationships.get(embedId);
        if (rel && rel.target) {
          mediaItem = ctx.mediaByPath.get(rel.target.toLowerCase());
          if (!mediaItem) {
            const clean = rel.target.replace(/\\/g, "/").toLowerCase().trim();
            const stripped = clean.replace(/^(\.\.\/)+/, "").replace(/^(\.\/)+/, "").replace(/^\/+/, "");
            const withoutWord = stripped.startsWith("word/") ? stripped.substring(5) : stripped;
            const withWord = stripped.startsWith("word/") ? stripped : `word/${stripped}`;
            const filename = stripped.split("/").pop() || stripped;
            mediaItem =
              ctx.mediaByPath.get(clean) ||
              ctx.mediaByPath.get(stripped) ||
              ctx.mediaByPath.get(withoutWord) ||
              ctx.mediaByPath.get(withWord) ||
              ctx.mediaByPath.get(filename);
          }
        }
      }

      if (mediaItem) {
        return {
          kind: "image",
          src: mediaItem.dataUrl,
          alt: defaultDescr || defaultName || "Image",
          title: defaultName || "",
        };
      } else {
        ctx.warnings.push(`Không tìm thấy hình ảnh tương ứng với relationship ID: ${embedId}`);
        ctx.diagnostics?.recordApproximated(
          "Drawing",
          "DRAWING_MISSING_MEDIA",
          `Tệp hình ảnh tương ứng với relationship ID "${embedId}" bị thiếu trong gói DOCX, đã thay thế bằng khung placeholder.`
        );
        return {
          kind: "unknown",
          graphicUri: "http://schemas.openxmlformats.org/drawingml/2006/picture",
        };
      }
    } else {
      ctx.warnings.push("Phần tử a:blip không chứa thuộc tính r:embed");
      ctx.diagnostics?.recordApproximated(
        "Drawing",
        "DRAWING_MISSING_REL",
        "Phần tử Drawing thiếu mã relationship hợp lệ, đã thay thế bằng khung placeholder."
      );
      return {
        kind: "unknown",
        graphicUri: "http://schemas.openxmlformats.org/drawingml/2006/picture",
      };
    }
  }

  // 2. Kiểm tra Hộp văn bản (TextBox: wps:txbx / w:txbxContent)
  const txbxContentEl = findDescendantByLocalName(containerEl, "txbxcontent");
  if (txbxContentEl) {
    const paragraphs = parseTxbxContentElements(txbxContentEl, ctx);

    // Trích xuất background và border từ wps:spPr nếu có
    let backgroundColor: string | undefined;
    let borderColor: string | undefined;
    const spPrEl = findDescendantByLocalName(containerEl, "sppr");
    if (spPrEl) {
      const solidFillEl = findDescendantByLocalName(spPrEl, "solidfill");
      if (solidFillEl) {
        const srgbClrEl = findDescendantByLocalName(solidFillEl, "srgbclr");
        const val = getAttrValue(srgbClrEl, "val");
        if (val) backgroundColor = `#${val}`;
      }
      const lnEl = findDescendantByLocalName(spPrEl, "ln");
      if (lnEl) {
        const lnSolidFill = findDescendantByLocalName(lnEl, "solidfill");
        if (lnSolidFill) {
          const srgbClr = findDescendantByLocalName(lnSolidFill, "srgbclr");
          const val = getAttrValue(srgbClr, "val");
          if (val) borderColor = `#${val}`;
        }
      }
    }

    return {
      kind: "textBox",
      content: paragraphs.length > 0 ? paragraphs : [{ type: "paragraph" }],
      backgroundColor,
      borderColor,
    };
  }

/**
 * Ánh xạ mã màu scheme (Office Theme Colors) thành mã màu Hex tương ứng
 */
function resolveSchemeColor(val: string): string {
  const lower = val.toLowerCase().trim();
  switch (lower) {
    case "accent1": return "#4f46e5";
    case "accent2": return "#06b6d4";
    case "accent3": return "#10b981";
    case "accent4": return "#f59e0b";
    case "accent5": return "#ef4444";
    case "accent6": return "#8b5cf6";
    case "lt1":
    case "bg1": return "#ffffff";
    case "dk1":
    case "tx1": return "#000000";
    case "lt2":
    case "bg2": return "#f1f5f9";
    case "dk2":
    case "tx2": return "#334155";
    case "hlink": return "#2563eb";
    case "folhlink": return "#7c3aed";
    default: return "#3b82f6";
  }
}

  // 3. Kiểm tra Custom Geometry không hỗ trợ (<a:custGeom>)
  const custGeomEl = findDescendantByLocalName(containerEl, "custgeom");
  if (custGeomEl) {
    ctx.warnings.push("Phát hiện custom geometry phức tạp chưa được hỗ trợ, bỏ qua an toàn thay vì ánh xạ sai thành Rectangle.");
    return {
      kind: "unknown",
      graphicUri: "http://schemas.microsoft.com/office/word/2010/wordprocessingShape",
    };
  }

  // 4. Kiểm tra Biểu đồ (Chart)
  const graphicDataEl = findDescendantByLocalName(containerEl, "graphicdata");
  const uri = graphicDataEl ? (getAttrValue(graphicDataEl, "uri") || "") : "";
  const uriLower = uri.toLowerCase();
  const chartEl = findDescendantByLocalName(containerEl, "chart");
  if (chartEl || uriLower.includes("chart")) {
    ctx.diagnostics?.recordUnsupported(
      "Chart",
      "CHART_PRESERVED_OR_SKIPPED",
      "Biểu đồ (Chart) chưa được hỗ trợ chỉnh sửa trực tiếp, đã bỏ qua an toàn để bảo vệ tài liệu."
    );
    ctx.warnings.push("Phát hiện Biểu đồ (Chart) chưa được hỗ trợ chỉnh sửa, đã bỏ qua an toàn để bảo vệ cấu trúc tài liệu.");
    return {
      kind: "chart",
      graphicUri: uri || "http://schemas.openxmlformats.org/drawingml/2006/chart",
      title: defaultName,
    };
  }

  // 5. Kiểm tra Sơ đồ SmartArt / Diagram
  if (
    uriLower.includes("diagram") ||
    uriLower.includes("smartart") ||
    Boolean(findDescendantByLocalName(containerEl, "diagram")) ||
    Boolean(findDescendantByLocalName(containerEl, "smartart")) ||
    Boolean(findDescendantByLocalName(containerEl, "relids"))
  ) {
    ctx.diagnostics?.recordUnsupported(
      "SmartArt",
      "SMARTART_PRESERVED_OR_SKIPPED",
      "Sơ đồ SmartArt chưa được hỗ trợ chỉnh sửa trực tiếp, đã bảo toàn an toàn mà không làm xáo trộn bố cục văn bản."
    );
    ctx.warnings.push("Phát hiện Sơ đồ SmartArt chưa được hỗ trợ chỉnh sửa, đã bỏ qua an toàn mà không làm xáo trộn văn bản.");
    return {
      kind: "smartart",
      graphicUri: uri || "http://schemas.openxmlformats.org/drawingml/2006/diagram",
    };
  }

  // 6. Kiểm tra Nghệ thuật chữ (WordArt)
  if (
    uriLower.includes("wordart") ||
    Boolean(findDescendantByLocalName(containerEl, "wordart")) ||
    Boolean(findDescendantByLocalName(containerEl, "textpath"))
  ) {
    const tpEl = findDescendantByLocalName(containerEl, "textpath");
    let visibleText = tpEl ? (getAttrValue(tpEl, "string") || tpEl.textContent || "").trim() : "";
    if (!visibleText) {
      const tEls = containerEl.getElementsByTagNameNS("*", "t");
      const parts: string[] = [];
      for (let i = 0; i < tEls.length; i++) {
        const txt = (tEls[i].textContent || "").trim();
        if (txt) parts.push(txt);
      }
      visibleText = parts.join(" ").trim();
    }
    if (!visibleText && defaultName) {
      visibleText = defaultName;
    }
    visibleText = visibleText || "WordArt";

    ctx.diagnostics?.recordApproximated(
      "WordArt",
      "WORDART_EXTRACTED_TEXT",
      `Nghệ thuật chữ (WordArt: "${visibleText}") được chuyển đổi thành văn bản hiển thị an toàn.`
    );
    ctx.warnings.push(`Chuyển đổi WordArt "${visibleText}" thành văn bản hiển thị an toàn.`);
    return {
      kind: "wordart",
      text: visibleText,
    };
  }

  // 7. Kiểm tra Hình vẽ (Shape: wps:wsp / prstGeom)
  const prstGeomEl = findDescendantByLocalName(containerEl, "prstgeom");
  if (prstGeomEl) {
    const prst = (getAttrValue(prstGeomEl, "prst") || "").toLowerCase().trim();
    let shapeType: "rectangle" | "roundedRectangle" | "ellipse" | "line" | "arrow" | null = null;

    if (prst === "rect") {
      shapeType = "rectangle";
    } else if (prst === "roundrect") {
      shapeType = "roundedRectangle";
    } else if (prst === "ellipse") {
      shapeType = "ellipse";
    } else if (prst === "line") {
      const lnEl = findDescendantByLocalName(containerEl, "ln");
      const headEnd = lnEl ? findDescendantByLocalName(lnEl, "headend") : null;
      const tailEnd = lnEl ? findDescendantByLocalName(lnEl, "tailend") : null;
      const headType = headEnd ? (getAttrValue(headEnd, "type") || "").toLowerCase() : "";
      const tailType = tailEnd ? (getAttrValue(tailEnd, "type") || "").toLowerCase() : "";
      const isArrowLine =
        headType === "triangle" || headType === "stealth" || headType === "arrow" ||
        tailType === "triangle" || tailType === "stealth" || tailType === "arrow";
      shapeType = isArrowLine ? "arrow" : "line";
    } else if (
      prst === "rightarrow" ||
      prst === "leftarrow" ||
      prst === "uparrow" ||
      prst === "downarrow" ||
      prst === "leftrightarrow" ||
      prst.includes("arrow")
    ) {
      shapeType = "arrow";
    } else {
      // Unsupported preset geometry: KHÔNG MAP THÀNH RECTANGLE!
      ctx.warnings.push(`Hình vẽ hình học "${prst}" không thuộc danh mục hỗ trợ (Rectangle, Rounded Rectangle, Ellipse, Line, Arrow), bỏ qua an toàn thay vì ánh xạ sai thành Rectangle.`);
      return {
        kind: "unknown",
        graphicUri: uri || "http://schemas.microsoft.com/office/word/2010/wordprocessingShape",
      };
    }

    const spPrEl = findDescendantByLocalName(containerEl, "sppr") || containerEl;

    // A. Màu tô (fillColor)
    let fillColor = shapeType === "line" || shapeType === "arrow" ? "none" : "#3b82f6";
    const noFillEl = findDescendantByLocalName(spPrEl, "nofill");
    const solidFillEl = findDescendantByLocalName(spPrEl, "solidfill");
    const gradFillEl = findDescendantByLocalName(spPrEl, "gradfill");

    if (noFillEl) {
      fillColor = "none";
    } else if (gradFillEl) {
      ctx.warnings.push("Phát hiện dải màu (gradient fill) trên hình vẽ, tự động áp dụng màu đơn sắc an toàn.");
      const srgbClr = findDescendantByLocalName(gradFillEl, "srgbclr");
      const val = getAttrValue(srgbClr, "val");
      if (val) {
        fillColor = `#${val}`;
      }
    } else if (solidFillEl) {
      const srgbClr = findDescendantByLocalName(solidFillEl, "srgbclr");
      const val = getAttrValue(srgbClr, "val");
      if (val) {
        fillColor = `#${val}`;
      } else {
        const schemeClr = findDescendantByLocalName(solidFillEl, "schemeclr");
        const schemeVal = getAttrValue(schemeClr, "val");
        if (schemeVal) {
          fillColor = resolveSchemeColor(schemeVal);
        }
      }
    }

    // B. Viền (strokeColor & strokeWidth)
    let strokeColor = "#1d4ed8";
    let strokeWidth = 2;
    const lnEl = findDescendantByLocalName(spPrEl, "ln");
    if (lnEl) {
      const wAttr = getAttrValue(lnEl, "w");
      if (wAttr) {
        const numEmu = parseInt(wAttr, 10);
        if (!isNaN(numEmu) && numEmu > 0) {
          strokeWidth = Math.max(1, Math.min(12, Math.round(numEmu / 9525)));
        }
      }

      const lnNoFill = findDescendantByLocalName(lnEl, "nofill");
      if (lnNoFill) {
        strokeColor = "none";
      } else {
        const lnSolidFill = findDescendantByLocalName(lnEl, "solidfill");
        if (lnSolidFill) {
          const srgbClr = findDescendantByLocalName(lnSolidFill, "srgbclr");
          const val = getAttrValue(srgbClr, "val");
          if (val) {
            strokeColor = `#${val}`;
          } else {
            const schemeClr = findDescendantByLocalName(lnSolidFill, "schemeclr");
            const schemeVal = getAttrValue(schemeClr, "val");
            if (schemeVal) {
              strokeColor = resolveSchemeColor(schemeVal);
            }
          }
        }
      }
    }

    // C. Hiệu ứng 3D
    const sp3dEl = findDescendantByLocalName(spPrEl, "sp3d") || findDescendantByLocalName(spPrEl, "scene3d");
    if (sp3dEl) {
      ctx.warnings.push("Hiệu ứng 3D trên hình vẽ chưa được hỗ trợ, bảo toàn hình học 2D an toàn.");
    }

    return {
      kind: "shape",
      shapeType,
      fillColor,
      strokeColor,
      strokeWidth,
    };
  }

  return {
    kind: "unknown",
    graphicUri: uri,
  };
}

/**
 * Phân tích nội dung đoạn văn phong phú (rich text) bên trong <w:txbxContent>
 */
export function parseTxbxContentElements(
  txbxContentEl: Element,
  ctx?: DocumentMapperContext
): JSONContent[] {
  const paragraphs: JSONContent[] = [];
  const pEls = txbxContentEl.getElementsByTagNameNS("*", "p");

  for (let i = 0; i < pEls.length; i++) {
    const pEl = pEls[i];
    const pPrEl = findDescendantByLocalName(pEl, "ppr") || getFirstChildByLocalName(pEl, "ppr");
    const paraAttrs: Record<string, any> = {};

    if (pPrEl) {
      const jcEl = getFirstChildByLocalName(pPrEl, "jc");
      if (jcEl) {
        const val = getAttrValue(jcEl, "val");
        if (val) {
          paraAttrs.textAlign = val === "both" ? "justify" : val;
        }
      }
      const spacingEl = getFirstChildByLocalName(pPrEl, "spacing");
      if (spacingEl) {
        const lineVal = getAttrValue(spacingEl, "line");
        const lineRule = getAttrValue(spacingEl, "lineRule");
        if (lineVal) {
          const num = parseInt(lineVal, 10);
          if (!isNaN(num) && num > 0) {
            paraAttrs.lineSpacing =
              lineRule === "exact" ? `${Math.round(num / 20)}pt` : (num / 240).toFixed(2).replace(/\.?0+$/, "");
          }
        }
      }
    }

    const inlineContent: JSONContent[] = [];

    // Duyệt các con trực tiếp của pEl
    for (let c = 0; c < pEl.childNodes.length; c++) {
      const child = pEl.childNodes[c];
      if (child.nodeType !== 1) continue;
      const childLocal = getLocalName(child).toLowerCase();

      if (childLocal === "r") {
        parseRunIntoInline(child as Element, undefined, inlineContent);
      } else if (childLocal === "hyperlink") {
        const linkEl = child as Element;
        const rId =
          linkEl.getAttribute("r:id") ||
          linkEl.getAttribute("id") ||
          linkEl.getAttribute("r:href") ||
          "";
        let linkHref = "";
        if (ctx?.relationships && rId) {
          const rel = ctx.relationships.get(rId);
          if (rel && rel.target) linkHref = rel.target;
        }
        if (!linkHref) linkHref = rId;

        for (let rIdx = 0; rIdx < linkEl.childNodes.length; rIdx++) {
          const subChild = linkEl.childNodes[rIdx];
          if (subChild.nodeType !== 1) continue;
          if (getLocalName(subChild).toLowerCase() === "r") {
            parseRunIntoInline(subChild as Element, linkHref, inlineContent);
          }
        }
      } else if (childLocal === "br" || childLocal === "cr") {
        inlineContent.push({ type: "hardBreak" });
      }
    }

    paragraphs.push({
      type: "paragraph",
      ...(Object.keys(paraAttrs).length > 0 ? { attrs: paraAttrs } : {}),
      ...(inlineContent.length > 0 ? { content: inlineContent } : {}),
    });
  }

  return paragraphs.length > 0 ? paragraphs : [{ type: "paragraph" }];
}

/**
 * Trích xuất text run và marks từ <w:r> đưa vào inlineContent
 */
function parseRunIntoInline(
  rEl: Element,
  linkHref: string | undefined,
  inlineContent: JSONContent[]
) {
  const rPrEl = getFirstChildByLocalName(rEl, "rpr");
  const marks: NonNullable<JSONContent["marks"]> = [];
  const textStyleAttrs: Record<string, string> = {};

  if (rPrEl) {
    const bEl = getFirstChildByLocalName(rPrEl, "b");
    if (bEl) {
      const val = getAttrValue(bEl, "val");
      if (val === null || val === "1" || val === "true" || val === "on") {
        marks.push({ type: "bold" });
      }
    }
    const iEl = getFirstChildByLocalName(rPrEl, "i");
    if (iEl) {
      const val = getAttrValue(iEl, "val");
      if (val === null || val === "1" || val === "true" || val === "on") {
        marks.push({ type: "italic" });
      }
    }
    const uEl = getFirstChildByLocalName(rPrEl, "u");
    if (uEl) {
      const val = getAttrValue(uEl, "val");
      if (val !== "none") {
        marks.push({ type: "underline" });
      }
    }
    const strikeEl = getFirstChildByLocalName(rPrEl, "strike");
    if (strikeEl) {
      const val = getAttrValue(strikeEl, "val");
      if (val === null || val === "1" || val === "true" || val === "on") {
        marks.push({ type: "strike" });
      }
    }
    const colorEl = getFirstChildByLocalName(rPrEl, "color");
    if (colorEl) {
      const val = getAttrValue(colorEl, "val");
      if (val && val !== "auto") {
        textStyleAttrs.color = val.startsWith("#") ? val : `#${val}`;
      }
    }
    const rFontsEl = getFirstChildByLocalName(rPrEl, "rfonts");
    if (rFontsEl) {
      const font =
        getAttrValue(rFontsEl, "ascii") ||
        getAttrValue(rFontsEl, "hansi") ||
        getAttrValue(rFontsEl, "cs");
      if (font) {
        textStyleAttrs.fontFamily = font;
      }
    }
    const szEl = getFirstChildByLocalName(rPrEl, "sz");
    if (szEl) {
      const val = getAttrValue(szEl, "val");
      if (val) {
        const halfPoints = parseInt(val, 10);
        if (!isNaN(halfPoints) && halfPoints > 0) {
          textStyleAttrs.fontSize = `${halfPoints / 2}pt`;
        }
      }
    }
    const highlightEl = getFirstChildByLocalName(rPrEl, "highlight");
    if (highlightEl) {
      const val = getAttrValue(highlightEl, "val");
      if (val && val !== "none") {
        marks.push({ type: "highlight", attrs: { color: val } });
      }
    }
  }

  if (Object.keys(textStyleAttrs).length > 0) {
    marks.push({ type: "textStyle", attrs: textStyleAttrs });
  }

  if (linkHref) {
    marks.push({ type: "link", attrs: { href: linkHref, target: "_blank" } });
  }

  for (let i = 0; i < rEl.childNodes.length; i++) {
    const rc = rEl.childNodes[i];
    if (rc.nodeType !== 1) continue;
    const rcLocal = getLocalName(rc).toLowerCase();
    if (rcLocal === "t") {
      const text = rc.textContent || "";
      if (text) {
        inlineContent.push({
          type: "text",
          text,
          ...(marks.length > 0 ? { marks: [...marks] } : {}),
        });
      }
    } else if (rcLocal === "br" || rcLocal === "cr") {
      inlineContent.push({ type: "hardBreak" });
    } else if (rcLocal === "tab") {
      inlineContent.push({
        type: "text",
        text: "\t",
        ...(marks.length > 0 ? { marks: [...marks] } : {}),
      });
    }
  }
}

/**
 * Phân tích chuỗi CSS style của VML shape
 */
function parseVmlStyle(styleStr: string): {
  width: number;
  height: number;
  offsetX: number;
  offsetY: number;
  placement: DrawingPlacement;
  wrapMode: WrapMode;
  horizontalRelative: HorizontalRelative;
  verticalRelative: VerticalRelative;
} {
  const result = {
    width: 320,
    height: 80,
    offsetX: 0,
    offsetY: 0,
    placement: "floating" as DrawingPlacement,
    wrapMode: "square" as WrapMode,
    horizontalRelative: "column" as HorizontalRelative,
    verticalRelative: "paragraph" as VerticalRelative,
  };

  if (!styleStr) return result;

  const entries = styleStr.split(";");
  for (const entry of entries) {
    const [rawKey, rawVal] = entry.split(":");
    if (!rawKey || !rawVal) continue;
    const key = rawKey.trim().toLowerCase();
    const val = rawVal.trim().toLowerCase();

    const parseCssLength = (lenStr: string): number => {
      const num = parseFloat(lenStr);
      if (isNaN(num)) return 0;
      if (lenStr.endsWith("pt")) return Math.round((num * 96) / 72); // pt -> px
      if (lenStr.endsWith("in")) return Math.round(num * 96);
      if (lenStr.endsWith("cm")) return Math.round((num * 96) / 2.54);
      if (lenStr.endsWith("mm")) return Math.round((num * 96) / 25.4);
      if (lenStr.endsWith("px")) return Math.round(num);
      return Math.round(num);
    };

    if (key === "width") {
      const w = parseCssLength(val);
      if (w > 0) result.width = w;
    } else if (key === "height") {
      const h = parseCssLength(val);
      if (h > 0) result.height = h;
    } else if (key === "margin-left" || key === "left") {
      result.offsetX = parseCssLength(val);
    } else if (key === "margin-top" || key === "top") {
      result.offsetY = parseCssLength(val);
    } else if (key === "position") {
      result.placement = val.includes("absolute") ? "floating" : "inline";
    } else if (key === "mso-wrap-style") {
      if (val === "none") result.wrapMode = "none";
      else if (val === "square") result.wrapMode = "square";
      else if (val === "tight") result.wrapMode = "tight";
      else if (val === "through") result.wrapMode = "through";
      else if (val === "topandbottom" || val.includes("top-and-bottom")) result.wrapMode = "topAndBottom";
    } else if (key === "mso-position-horizontal-relative") {
      if (val === "page") result.horizontalRelative = "page";
      else if (val === "margin") result.horizontalRelative = "margin";
      else if (val === "column") result.horizontalRelative = "column";
      else if (val === "char" || val === "character") result.horizontalRelative = "character";
    } else if (key === "mso-position-vertical-relative") {
      if (val === "page") result.verticalRelative = "page";
      else if (val === "margin") result.verticalRelative = "margin";
      else if (val === "paragraph" || val === "para") result.verticalRelative = "paragraph";
      else if (val === "line") result.verticalRelative = "line";
    }
  }

  return result;
}

/**
 * Fallback cho các phần tử VML (<w:pict>) hoặc AlternateContent
 */
function parseLegacyPictOrRawDrawing(
  drawingEl: Element,
  ctx: DocumentMapperContext
): ParsedDrawingObject | null {
  // 0. Kiểm tra VML WordArt: <v:textpath>
  const vTextpath = findDescendantByLocalName(drawingEl, "textpath");
  if (vTextpath) {
    const text = (getAttrValue(vTextpath, "string") || vTextpath.textContent || "").trim() || "WordArt";
    ctx.diagnostics?.recordApproximated(
      "WordArt",
      "WORDART_EXTRACTED_TEXT",
      `Nghệ thuật chữ (WordArt: "${text}") được chuyển đổi thành văn bản hiển thị an toàn.`
    );
    ctx.warnings.push(`Chuyển đổi WordArt "${text}" thành văn bản hiển thị an toàn.`);
    return {
      position: {
        placement: "inline",
        width: 400,
        height: 60,
        distT: 0,
        distB: 0,
        distL: 0,
        distR: 0,
        wrapMode: "inline",
      },
      payload: {
        kind: "wordart",
        text,
      },
    };
  }

  // 1. Kiểm tra VML TextBox: <v:textbox> hoặc <w:txbxContent>
  const vTextbox =
    findDescendantByLocalName(drawingEl, "textbox") ||
    findDescendantByLocalName(drawingEl, "txbxcontent");

  if (vTextbox) {
    const txbxContentEl =
      getLocalName(vTextbox).toLowerCase() === "txbxcontent"
        ? vTextbox
        : findDescendantByLocalName(vTextbox, "txbxcontent") || vTextbox;

    // Tìm shape bao quanh (v:shape, v:rect, hoặc v:group)
    const vShape =
      findDescendantByLocalName(drawingEl, "shape") ||
      findDescendantByLocalName(drawingEl, "rect") ||
      drawingEl;

    const styleStr = getAttrValue(vShape, "style") || getAttrValue(drawingEl, "style") || "";
    const parsedStyle = parseVmlStyle(styleStr);

    // Trích xuất màu nền / viền
    let backgroundColor = "#ffffff";
    const fillcolor = getAttrValue(vShape, "fillcolor") || getAttrValue(vShape, "fillColor");
    if (fillcolor) {
      backgroundColor = fillcolor.startsWith("#") ? fillcolor : `#${fillcolor}`;
    }

    let borderColor = "#cbd5e1";
    const strokecolor = getAttrValue(vShape, "strokecolor") || getAttrValue(vShape, "strokeColor");
    if (strokecolor) {
      borderColor = strokecolor.startsWith("#") ? strokecolor : `#${strokecolor}`;
    }

    const paragraphs = parseTxbxContentElements(txbxContentEl, ctx);

    ctx.warnings.push("Đã chuyển đổi VML TextBox kế thừa sang mô hình DrawingML tương thích.");

    return {
      position: {
        placement: parsedStyle.placement,
        width: parsedStyle.width,
        height: parsedStyle.height,
        distT: 0,
        distB: 0,
        distL: 0,
        distR: 0,
        wrapMode: parsedStyle.wrapMode,
        horizontalRelative: parsedStyle.horizontalRelative,
        verticalRelative: parsedStyle.verticalRelative,
        offsetX: parsedStyle.offsetX,
        offsetY: parsedStyle.offsetY,
      },
      payload: {
        kind: "textBox",
        content: paragraphs,
        backgroundColor,
        borderColor,
      },
    };
  }

  // 2. Kiểm tra VML Image (<v:imagedata>)
  const vImageData = findDescendantByLocalName(drawingEl, "imagedata");
  if (vImageData) {
    const embedId =
      vImageData.getAttribute("r:id") ||
      vImageData.getAttribute("id") ||
      vImageData.getAttribute("r:href") ||
      vImageData.getAttribute("href");

    if (embedId) {
      let mediaItem = ctx.mediaByRelId.get(embedId);
      if (!mediaItem) {
        const rel = ctx.relationships.get(embedId);
        if (rel && rel.target) {
          const clean = rel.target.replace(/\\/g, "/").toLowerCase().trim();
          const stripped = clean.replace(/^(\.\.\/)+/, "").replace(/^(\.\/)+/, "").replace(/^\/+/, "");
          const withoutWord = stripped.startsWith("word/") ? stripped.substring(5) : stripped;
          const withWord = stripped.startsWith("word/") ? stripped : `word/${stripped}`;
          const filename = stripped.split("/").pop() || stripped;
          mediaItem =
            ctx.mediaByPath.get(clean) ||
            ctx.mediaByPath.get(stripped) ||
            ctx.mediaByPath.get(withoutWord) ||
            ctx.mediaByPath.get(withWord) ||
            ctx.mediaByPath.get(filename);
        }
      }

      if (!mediaItem) {
        ctx.warnings.push(`Không tìm thấy hình ảnh tương ứng với relationship ID: ${embedId}`);
      }

      const placeholderSvg = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200" viewBox="0 0 300 200"><rect width="300" height="200" fill="%23f1f5f9" stroke="%23cbd5e1" stroke-width="2"/><text x="50%" y="45%" dominant-baseline="middle" text-anchor="middle" fill="%2364748b" font-family="sans-serif" font-size="14" font-weight="600">Missing Image</text><text x="50%" y="60%" dominant-baseline="middle" text-anchor="middle" fill="%2394a3b8" font-family="sans-serif" font-size="11">(${embedId})</text></svg>`;

      return {
        position: {
          placement: "inline",
          width: 400,
          height: 260,
          distT: 0,
          distB: 0,
          distL: 0,
          distR: 0,
          wrapMode: "inline",
        },
        payload: {
          kind: "image",
          src: mediaItem ? mediaItem.dataUrl : placeholderSvg,
          alt: "Image",
          title: "",
          isMissingMedia: !mediaItem,
        },
      };
    }
  }

  // 3. Kiểm tra VML Shape (<v:rect>, <v:roundrect>, <v:oval>, <v:line>, <v:shape>)
  const vRect = findDescendantByLocalName(drawingEl, "rect");
  const vRoundRect = findDescendantByLocalName(drawingEl, "roundrect");
  const vOval = findDescendantByLocalName(drawingEl, "oval");
  const vLine = findDescendantByLocalName(drawingEl, "line");
  const vShape = findDescendantByLocalName(drawingEl, "shape");

  const vTarget = vRect || vRoundRect || vOval || vLine || vShape;
  if (vTarget) {
    let shapeType: "rectangle" | "roundedRectangle" | "ellipse" | "line" | "arrow" | null = null;
    const tag = getLocalName(vTarget).toLowerCase();
    if (tag === "rect") shapeType = "rectangle";
    else if (tag === "roundrect") shapeType = "roundedRectangle";
    else if (tag === "oval") shapeType = "ellipse";
    else if (tag === "line") shapeType = "line";
    else if (tag === "shape") {
      const typeAttr = (getAttrValue(vTarget, "type") || "").toLowerCase();
      if (typeAttr.includes("arrow")) shapeType = "arrow";
      else if (typeAttr.includes("rect") || typeAttr.includes("box")) shapeType = "rectangle";
      else if (typeAttr.includes("oval") || typeAttr.includes("ellipse")) shapeType = "ellipse";
      else shapeType = "rectangle";
    }

    if (shapeType) {
      const styleStr = getAttrValue(vTarget, "style") || getAttrValue(drawingEl, "style") || "";
      const parsedStyle = parseVmlStyle(styleStr);

      let fillColor = shapeType === "line" || shapeType === "arrow" ? "none" : "#3b82f6";
      const fillcolorAttr = getAttrValue(vTarget, "fillcolor") || getAttrValue(vTarget, "fillColor");
      if (fillcolorAttr) {
        fillColor = fillcolorAttr.startsWith("#") ? fillcolorAttr : `#${fillcolorAttr}`;
      }

      let strokeColor = "#1d4ed8";
      const strokecolorAttr = getAttrValue(vTarget, "strokecolor") || getAttrValue(vTarget, "strokeColor");
      if (strokecolorAttr) {
        strokeColor = strokecolorAttr.startsWith("#") ? strokecolorAttr : `#${strokecolorAttr}`;
      }

      let strokeWidth = 2;
      const strokeweight = getAttrValue(vTarget, "strokeweight") || getAttrValue(vTarget, "strokeWeight");
      if (strokeweight) {
        const num = parseFloat(strokeweight);
        if (!isNaN(num) && num > 0) {
          if (strokeweight.includes("pt")) {
            strokeWidth = Math.max(1, Math.min(12, Math.round((num * 4) / 3)));
          } else {
            strokeWidth = Math.max(1, Math.min(12, Math.round(num)));
          }
        }
      }

      ctx.warnings.push("Đã chuyển đổi VML Shape kế thừa sang mô hình DrawingML tương thích.");

      return {
        position: {
          placement: parsedStyle.placement,
          width: parsedStyle.width,
          height: parsedStyle.height,
          distT: 0,
          distB: 0,
          distL: 0,
          distR: 0,
          wrapMode: parsedStyle.wrapMode,
          horizontalRelative: parsedStyle.horizontalRelative,
          verticalRelative: parsedStyle.verticalRelative,
          offsetX: parsedStyle.offsetX,
          offsetY: parsedStyle.offsetY,
        },
        payload: {
          kind: "shape",
          shapeType,
          fillColor,
          strokeColor,
          strokeWidth,
        },
      };
    }
  }

  return null;
}

/**
 * Chuẩn hóa kiểu phía bao quanh văn bản (WrapTextSide)
 */
export function normalizeWrapTextSide(raw: string | null | undefined): WrapTextSide {
  const val = (raw || "").trim().toLowerCase();
  if (val === "left" || val === "right" || val === "largest") {
    return val as WrapTextSide;
  }
  return "bothSides";
}

/**
 * Trích xuất các điểm đỉnh đa giác contour bao bọc từ wp:wrapPolygon
 */
export function parseWrapPolygon(wrapEl: Element): WrapPolygonPoint[] | undefined {
  const polyEl = findDescendantByLocalName(wrapEl, "wrappolygon");
  if (!polyEl) return undefined;

  const points: WrapPolygonPoint[] = [];

  // 1. Điểm bắt đầu <wp:start x="..." y="..."/>
  const startEl = findDescendantByLocalName(polyEl, "start");
  if (startEl) {
    const xStr = getAttrValue(startEl, "x");
    const yStr = getAttrValue(startEl, "y");
    if (xStr && yStr) {
      points.push({
        x: emuToSignedPixels(parseInt(xStr, 10) || 0),
        y: emuToSignedPixels(parseInt(yStr, 10) || 0),
      });
    }
  }

  // 2. Các điểm nối tiếp <wp:lineTo x="..." y="..."/>
  for (let i = 0; i < polyEl.children.length; i++) {
    const child = polyEl.children[i];
    const localName = (child.localName || child.nodeName.split(":").pop() || "").toLowerCase();
    if (localName === "lineto") {
      const xStr = getAttrValue(child, "x");
      const yStr = getAttrValue(child, "y");
      if (xStr && yStr) {
        points.push({
          x: emuToSignedPixels(parseInt(xStr, 10) || 0),
          y: emuToSignedPixels(parseInt(yStr, 10) || 0),
        });
      }
    }
  }

  return points.length >= 3 ? points : undefined;
}

