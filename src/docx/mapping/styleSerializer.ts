/**
 * Tạo nội dung tệp word/styles.xml với các định nghĩa kiểu dáng chuẩn
 * và các kiểu dáng tùy biến từ Styles Engine 2.0 (DocumentStylesMetadata).
 *
 * Tuân thủ chuẩn ISO/IEC 29500 WordprocessingML để tương thích hoàn toàn
 * với Microsoft Word và LibreOffice.
 */

import type {
  DocumentStylesMetadata,
  DocumentStyle,
  ParagraphStyleProperties,
  CharacterStyleProperties,
} from "../../styles/types/styleTypes.ts";
import {
  STYLE_NORMAL_ID,
  STYLE_HEADING_1_ID,
  STYLE_HEADING_2_ID,
  STYLE_HEADING_3_ID,
  STYLE_EMPHASIS_ID,
  STYLE_STRONG_ID,
} from "../../styles/services/builtInStyles.ts";
import {
  ptToHalfPoints,
  ptToTwips,
  cssColorToHex,
  colorToWordHighlight,
} from "../utils/xmlUtils.ts";
import { escapeXmlAttr } from "../serializer/xmlBuilder.ts";
import {
  buildStyleExportMapping,
  type StyleExportMappingResult,
} from "../styles/docxStyleExportMapper.ts";

/**
 * Xây dựng chuỗi XML cho <w:pPr> của định nghĩa style
 */
export function buildParagraphPropertiesXml(props?: ParagraphStyleProperties): string {
  if (!props) return "";
  const parts: string[] = [];

  // 1. Căn lề (<w:jc>)
  if (props.textAlign) {
    const jcVal = props.textAlign === "justify" ? "both" : props.textAlign;
    parts.push(`<w:jc w:val="${jcVal}"/>`);
  }

  // 2. Khoảng cách đoạn & Giãn dòng (<w:spacing>)
  const spacingAttrs: string[] = [];
  if (props.lineSpacing !== undefined) {
    const factor =
      typeof props.lineSpacing === "number"
        ? props.lineSpacing
        : parseFloat(String(props.lineSpacing));
    if (!isNaN(factor) && factor > 0) {
      spacingAttrs.push(`w:line="${Math.round(factor * 240)}" w:lineRule="auto"`);
    }
  }
  if (typeof props.spacingBefore === "number" && props.spacingBefore >= 0) {
    spacingAttrs.push(`w:before="${ptToTwips(props.spacingBefore)}"`);
  }
  if (typeof props.spacingAfter === "number" && props.spacingAfter >= 0) {
    spacingAttrs.push(`w:after="${ptToTwips(props.spacingAfter)}"`);
  }

  if (spacingAttrs.length > 0) {
    parts.push(`<w:spacing ${spacingAttrs.join(" ")}/>`);
  }

  // 3. Thụt lề (<w:ind>)
  const indAttrs: string[] = [];
  if (typeof props.leftIndent === "number" && props.leftIndent > 0) {
    indAttrs.push(`w:left="${ptToTwips(props.leftIndent)}"`);
  }
  if (typeof props.rightIndent === "number" && props.rightIndent > 0) {
    indAttrs.push(`w:right="${ptToTwips(props.rightIndent)}"`);
  }
  if (typeof props.firstLineIndent === "number" && props.firstLineIndent > 0) {
    indAttrs.push(`w:firstLine="${ptToTwips(props.firstLineIndent)}"`);
  }
  if (typeof props.hangingIndent === "number" && props.hangingIndent > 0) {
    indAttrs.push(`w:hanging="${ptToTwips(props.hangingIndent)}"`);
  }

  if (indAttrs.length > 0) {
    parts.push(`<w:ind ${indAttrs.join(" ")}/>`);
  }

  // 4. Semantic Pagination Properties
  if (props.keepWithNext === true) {
    parts.push("<w:keepNext/>");
  } else if (props.keepWithNext === false) {
    parts.push('<w:keepNext w:val="0"/>');
  }

  if (props.keepLinesTogether === true) {
    parts.push("<w:keepLines/>");
  } else if (props.keepLinesTogether === false) {
    parts.push('<w:keepLines w:val="0"/>');
  }

  if (props.pageBreakBefore === true) {
    parts.push("<w:pageBreakBefore/>");
  } else if (props.pageBreakBefore === false) {
    parts.push('<w:pageBreakBefore w:val="0"/>');
  }

  if (props.widowControl === true) {
    parts.push("<w:widowControl/>");
  } else if (props.widowControl === false) {
    parts.push('<w:widowControl w:val="0"/>');
  }

  // 5. Cấp độ outline của heading (<w:outlineLvl>)
  if (props.headingLevel && [1, 2, 3].includes(props.headingLevel)) {
    parts.push(`<w:outlineLvl w:val="${props.headingLevel - 1}"/>`);
  }

  return parts.length > 0 ? `<w:pPr>${parts.join("")}</w:pPr>` : "";
}

/**
 * Xây dựng chuỗi XML cho <w:rPr> của định nghĩa style
 */
export function buildRunPropertiesXml(props?: CharacterStyleProperties): string {
  if (!props) return "";
  const parts: string[] = [];

  // 1. Phông chữ (<w:rFonts>)
  if (props.fontFamily && props.fontFamily.trim()) {
    const font = escapeXmlAttr(props.fontFamily.trim());
    parts.push(`<w:rFonts w:ascii="${font}" w:hAnsi="${font}" w:cs="${font}"/>`);
  }

  // 2. Chữ đậm (<w:b>)
  if (props.bold === true) {
    parts.push("<w:b/>");
  } else if (props.bold === false) {
    parts.push('<w:b w:val="0"/>');
  }

  // 3. Chữ nghiêng (<w:i>)
  if (props.italic === true) {
    parts.push("<w:i/>");
  } else if (props.italic === false) {
    parts.push('<w:i w:val="0"/>');
  }

  // 4. Gạch ngang (<w:strike>)
  if (props.strike === true) {
    parts.push("<w:strike/>");
  } else if (props.strike === false) {
    parts.push('<w:strike w:val="0"/>');
  }

  // 5. Màu sắc (<w:color>)
  if (props.color) {
    const hex = cssColorToHex(props.color);
    if (hex) {
      parts.push(`<w:color w:val="${hex}"/>`);
    }
  }

  // 6. Cỡ chữ (<w:sz>, <w:szCs>)
  if (props.fontSize !== undefined) {
    const pt = typeof props.fontSize === "number" ? props.fontSize : parseFloat(String(props.fontSize));
    if (!isNaN(pt) && pt > 0) {
      const halfPt = ptToHalfPoints(pt);
      parts.push(`<w:sz w:val="${halfPt}"/><w:szCs w:val="${halfPt}"/>`);
    }
  }

  // 7. Màu highlight (<w:highlight>)
  if (props.highlight) {
    const hl = colorToWordHighlight(props.highlight);
    parts.push(`<w:highlight w:val="${hl}"/>`);
  }

  // 8. Gạch chân (<w:u>)
  if (props.underline === true) {
    parts.push('<w:u w:val="single"/>');
  } else if (props.underline === false) {
    parts.push('<w:u w:val="none"/>');
  }

  return parts.length > 0 ? `<w:rPr>${parts.join("")}</w:rPr>` : "";
}

/**
 * Tạo nội dung tệp word/styles.xml hoàn chỉnh từ Styles Engine 2.0
 */
export function buildStylesXml(
  stylesMetadata?: DocumentStylesMetadata,
  styleIdMapping?: StyleExportMappingResult
): string {
  const mapping = styleIdMapping || buildStyleExportMapping(stylesMetadata);
  const internalToWord = mapping.internalToWordId;

  const defsMap = new Map<string, DocumentStyle>();
  if (stylesMetadata?.definitions) {
    for (const def of stylesMetadata.definitions) {
      defsMap.set(def.id, def);
    }
  }

  // Lấy các style built-in từ tài liệu hoặc fallback mặc định
  const normalDef = defsMap.get(STYLE_NORMAL_ID);
  const h1Def = defsMap.get(STYLE_HEADING_1_ID);
  const h2Def = defsMap.get(STYLE_HEADING_2_ID);
  const h3Def = defsMap.get(STYLE_HEADING_3_ID);
  const emphasisDef = defsMap.get(STYLE_EMPHASIS_ID);
  const strongDef = defsMap.get(STYLE_STRONG_ID);

  // 1. Phân giải cấu hình Normal style
  const normalPPr = buildParagraphPropertiesXml(
    normalDef?.paragraph || {
      lineSpacing: 1.15,
      spacingAfter: 8,
    }
  );
  const normalRPr = buildRunPropertiesXml(
    normalDef?.character || {
      fontFamily: "Calibri",
      fontSize: 11,
    }
  );

  // 2. Phân giải cấu hình Heading 1 style
  const h1PPr = buildParagraphPropertiesXml(
    h1Def?.paragraph || {
      lineSpacing: 1.15,
      spacingBefore: 12,
      spacingAfter: 6,
      headingLevel: 1,
    }
  );
  const h1RPr = buildRunPropertiesXml(
    h1Def?.character || {
      bold: true,
      fontSize: 16,
      color: "#1E40AF",
    }
  );

  // 3. Phân giải cấu hình Heading 2 style
  const h2PPr = buildParagraphPropertiesXml(
    h2Def?.paragraph || {
      lineSpacing: 1.15,
      spacingBefore: 10,
      spacingAfter: 5,
      headingLevel: 2,
    }
  );
  const h2RPr = buildRunPropertiesXml(
    h2Def?.character || {
      bold: true,
      fontSize: 14,
      color: "#1E40AF",
    }
  );

  // 4. Phân giải cấu hình Heading 3 style
  const h3PPr = buildParagraphPropertiesXml(
    h3Def?.paragraph || {
      lineSpacing: 1.15,
      spacingBefore: 8,
      spacingAfter: 4,
      headingLevel: 3,
    }
  );
  const h3RPr = buildRunPropertiesXml(
    h3Def?.character || {
      bold: true,
      fontSize: 12,
      color: "#1E40AF",
    }
  );

  // 5. Phân giải Emphasis và Strong
  const emphasisRPr = buildRunPropertiesXml(
    emphasisDef?.character || { italic: true }
  );
  const strongRPr = buildRunPropertiesXml(
    strongDef?.character || { bold: true }
  );

  // 6. Xây dựng các Style tùy biến (custom paragraph/character styles)
  const customStylesXml: string[] = [];

  if (stylesMetadata?.definitions) {
    for (const style of stylesMetadata.definitions) {
      // Bỏ qua các built-ins đã được render ở phần trên
      if (
        [
          STYLE_NORMAL_ID,
          STYLE_HEADING_1_ID,
          STYLE_HEADING_2_ID,
          STYLE_HEADING_3_ID,
          STYLE_EMPHASIS_ID,
          STYLE_STRONG_ID,
        ].includes(style.id as any)
      ) {
        continue;
      }

      const wordStyleId = internalToWord.get(style.id) || style.id;
      const styleType = style.type === "character" ? "character" : "paragraph";

      // Xác định basedOn
      let basedOnVal: string | null = null;
      if (style.basedOn) {
        basedOnVal = internalToWord.get(style.basedOn) || style.basedOn;
      } else if (styleType === "paragraph") {
        basedOnVal = "Normal";
      } else {
        basedOnVal = "DefaultParagraphFont";
      }

      // Xác định nextStyleId
      let nextVal: string | null = null;
      if (style.nextStyleId) {
        nextVal = internalToWord.get(style.nextStyleId) || style.nextStyleId;
      }

      // Xác định linkStyleId
      let linkVal: string | null = null;
      if (style.linkStyleId) {
        linkVal = internalToWord.get(style.linkStyleId) || style.linkStyleId;
      }

      const defaultAttr = style.isDefault ? ' w:default="1"' : "";
      const styleParts: string[] = [
        `<w:style w:type="${styleType}"${defaultAttr} w:styleId="${wordStyleId}">`,
        `  <w:name w:val="${escapeXmlAttr(style.name || wordStyleId)}"/>`,
      ];

      if (basedOnVal) {
        styleParts.push(`  <w:basedOn w:val="${basedOnVal}"/>`);
      }
      if (nextVal && styleType === "paragraph") {
        styleParts.push(`  <w:next w:val="${nextVal}"/>`);
      }
      if (linkVal) {
        styleParts.push(`  <w:link w:val="${linkVal}"/>`);
      }

      if (style.qFormat !== false) {
        styleParts.push("  <w:qFormat/>");
      }

      if (styleType === "paragraph") {
        const pPrXml = buildParagraphPropertiesXml(style.paragraph);
        if (pPrXml) {
          styleParts.push(`  ${pPrXml}`);
        }
      }

      const rPrXml = buildRunPropertiesXml(style.character);
      if (rPrXml) {
        styleParts.push(`  ${rPrXml}`);
      }

      styleParts.push("</w:style>");
      customStylesXml.push(styleParts.join("\n"));
    }
  }

  // 7. Ghép toàn bộ nội dung word/styles.xml
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
          xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <!-- Default document style -->
  <w:docDefaults>
    <w:rPrDefault>
      <w:rPr>
        <w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/>
        <w:sz w:val="22"/>
        <w:szCs w:val="22"/>
        <w:lang w:val="vi-VN"/>
      </w:rPr>
    </w:rPrDefault>
    <w:pPrDefault>
      <w:pPr>
        <w:spacing w:after="160" w:line="276" w:lineRule="auto"/>
      </w:pPr>
    </w:pPrDefault>
  </w:docDefaults>

  <!-- Default Paragraph Font -->
  <w:style w:type="character" w:default="1" w:styleId="DefaultParagraphFont">
    <w:name w:val="Default Paragraph Font"/>
    <w:uiPriority w:val="1"/>
    <w:semiHidden/>
    <w:unhideWhenUsed/>
  </w:style>

  <!-- Style Normal -->
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal">
    <w:name w:val="Normal"/>
    <w:qFormat/>
    ${normalPPr ? `${normalPPr}\n    ` : ""}${normalRPr || ""}
  </w:style>

  <!-- Style Heading 1 -->
  <w:style w:type="paragraph" w:styleId="Heading1">
    <w:name w:val="heading 1"/>
    <w:basedOn w:val="Normal"/>
    <w:next w:val="Normal"/>
    <w:qFormat/>
    ${h1PPr ? `${h1PPr}\n    ` : ""}${h1RPr || ""}
  </w:style>

  <!-- Style Heading 2 -->
  <w:style w:type="paragraph" w:styleId="Heading2">
    <w:name w:val="heading 2"/>
    <w:basedOn w:val="Normal"/>
    <w:next w:val="Normal"/>
    <w:qFormat/>
    ${h2PPr ? `${h2PPr}\n    ` : ""}${h2RPr || ""}
  </w:style>

  <!-- Style Heading 3 -->
  <w:style w:type="paragraph" w:styleId="Heading3">
    <w:name w:val="heading 3"/>
    <w:basedOn w:val="Normal"/>
    <w:next w:val="Normal"/>
    <w:qFormat/>
    ${h3PPr ? `${h3PPr}\n    ` : ""}${h3RPr || ""}
  </w:style>

  <!-- Style Emphasis -->
  <w:style w:type="character" w:styleId="Emphasis">
    <w:name w:val="Emphasis"/>
    <w:basedOn w:val="DefaultParagraphFont"/>
    <w:qFormat/>
    ${emphasisRPr || ""}
  </w:style>

  <!-- Style Strong -->
  <w:style w:type="character" w:styleId="Strong">
    <w:name w:val="Strong"/>
    <w:basedOn w:val="DefaultParagraphFont"/>
    <w:qFormat/>
    ${strongRPr || ""}
  </w:style>

  <!-- Custom Styles từ Styles Engine 2.0 -->
  ${customStylesXml.join("\n\n  ")}

  <!-- Style FootnoteReference -->
  <w:style w:type="character" w:styleId="FootnoteReference">
    <w:name w:val="Footnote Reference"/>
    <w:basedOn w:val="DefaultParagraphFont"/>
    <w:semiHidden/>
    <w:rPr>
      <w:vertAlign w:val="superscript"/>
    </w:rPr>
  </w:style>

  <!-- Style FootnoteText -->
  <w:style w:type="paragraph" w:styleId="FootnoteText">
    <w:name w:val="footnote text"/>
    <w:basedOn w:val="Normal"/>
    <w:semiHidden/>
    <w:pPr>
      <w:spacing w:after="0" w:line="240" w:lineRule="auto"/>
    </w:pPr>
    <w:rPr>
      <w:sz w:val="20"/>
    </w:rPr>
  </w:style>

  <!-- Style EndnoteReference -->
  <w:style w:type="character" w:styleId="EndnoteReference">
    <w:name w:val="Endnote Reference"/>
    <w:basedOn w:val="DefaultParagraphFont"/>
    <w:semiHidden/>
    <w:rPr>
      <w:vertAlign w:val="superscript"/>
    </w:rPr>
  </w:style>

  <!-- Style EndnoteText -->
  <w:style w:type="paragraph" w:styleId="EndnoteText">
    <w:name w:val="endnote text"/>
    <w:basedOn w:val="Normal"/>
    <w:semiHidden/>
    <w:pPr>
      <w:spacing w:after="0" w:line="240" w:lineRule="auto"/>
    </w:pPr>
    <w:rPr>
      <w:sz w:val="20"/>
    </w:rPr>
  </w:style>

  <!-- Style Caption -->
  <w:style w:type="paragraph" w:styleId="Caption">
    <w:name w:val="caption"/>
    <w:basedOn w:val="Normal"/>
    <w:next w:val="Normal"/>
    <w:pPr>
      <w:jc w:val="center"/>
      <w:spacing w:before="120" w:after="160" w:line="240" w:lineRule="auto"/>
    </w:pPr>
    <w:rPr>
      <w:i/>
      <w:sz w:val="20"/>
      <w:color w:val="4B5563"/>
    </w:rPr>
  </w:style>

  <!-- Style Bibliography -->
  <w:style w:type="paragraph" w:styleId="Bibliography">
    <w:name w:val="bibliography"/>
    <w:basedOn w:val="Normal"/>
    <w:next w:val="Normal"/>
    <w:pPr>
      <w:spacing w:after="100" w:line="240" w:lineRule="auto"/>
      <w:ind w:left="480" w:hanging="480"/>
    </w:pPr>
    <w:rPr>
      <w:sz w:val="22"/>
    </w:rPr>
  </w:style>

  <!-- Style TOCHeading -->
  <w:style w:type="paragraph" w:styleId="TOCHeading">
    <w:name w:val="TOC Heading"/>
    <w:basedOn w:val="Heading1"/>
    <w:qFormat/>
    <w:pPr>
      <w:spacing w:before="240" w:after="120"/>
    </w:pPr>
    <w:rPr>
      <w:b/>
      <w:sz w:val="28"/>
    </w:rPr>
  </w:style>

  <!-- Style TableofFigures (Table of Figures / List of Captions) -->
  <w:style w:type="paragraph" w:styleId="TableofFigures">
    <w:name w:val="table of figures"/>
    <w:basedOn w:val="Normal"/>
    <w:next w:val="Normal"/>
    <w:pPr>
      <w:spacing w:before="60" w:after="60" w:line="240" w:lineRule="auto"/>
    </w:pPr>
    <w:rPr>
      <w:sz w:val="22"/>
    </w:rPr>
  </w:style>

  <!-- Table Styles -->
  <w:style w:type="table" w:default="1" w:styleId="TableNormal">
    <w:name w:val="Normal Table"/>
    <w:uiPriority w:val="99"/>
    <w:semiHidden/>
    <w:unhideWhenUsed/>
    <w:tblPr>
      <w:tblInd w:w="0" w:type="dxa"/>
      <w:tblCellMar>
        <w:top w:w="0" w:type="dxa"/>
        <w:left w:w="108" w:type="dxa"/>
        <w:bottom w:w="0" w:type="dxa"/>
        <w:right w:w="108" w:type="dxa"/>
      </w:tblCellMar>
    </w:tblPr>
  </w:style>

  <w:style w:type="table" w:styleId="TableGrid">
    <w:name w:val="Table Grid"/>
    <w:basedOn w:val="TableNormal"/>
    <w:uiPriority w:val="39"/>
    <w:pPr>
      <w:spacing w:after="0" w:line="240" w:lineRule="auto"/>
    </w:pPr>
    <w:tblPr>
      <w:tblBorders>
        <w:top w:val="single" w:sz="4" w:space="0" w:color="auto"/>
        <w:left w:val="single" w:sz="4" w:space="0" w:color="auto"/>
        <w:bottom w:val="single" w:sz="4" w:space="0" w:color="auto"/>
        <w:right w:val="single" w:sz="4" w:space="0" w:color="auto"/>
        <w:insideH w:val="single" w:sz="4" w:space="0" w:color="auto"/>
        <w:insideV w:val="single" w:sz="4" w:space="0" w:color="auto"/>
      </w:tblBorders>
    </w:tblPr>
  </w:style>

  <w:style w:type="table" w:styleId="LightGridAccent1">
    <w:name w:val="Light Grid Accent 1"/>
    <w:basedOn w:val="TableNormal"/>
    <w:uiPriority w:val="40"/>
  </w:style>

  <w:style w:type="table" w:styleId="MediumAccent1">
    <w:name w:val="Medium Accent 1"/>
    <w:basedOn w:val="TableNormal"/>
    <w:uiPriority w:val="41"/>
  </w:style>

  <w:style w:type="table" w:styleId="Academic">
    <w:name w:val="Academic"/>
    <w:basedOn w:val="TableNormal"/>
    <w:uiPriority w:val="42"/>
  </w:style>
</w:styles>`;
}
