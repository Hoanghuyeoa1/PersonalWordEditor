/**
 * Tạo nội dung tệp word/numbering.xml với các định nghĩa danh sách chuẩn
 * cho Bullet Lists và Numbered Lists hỗ trợ đa cấp lồng nhau (0..8)
 */
export function buildNumberingXml(): string {
  // Tạo định nghĩa các cấp độ cho Bullet list (abstractNumId = 1)
  const bulletLevels: string[] = [];
  const bulletChars = ["", "o", "§", "", "o", "§", "", "o", "§"];
  const bulletFonts = ["Symbol", "Courier New", "Wingdings", "Symbol", "Courier New", "Wingdings", "Symbol", "Courier New", "Wingdings"];

  for (let ilvl = 0; ilvl <= 8; ilvl++) {
    const leftIndent = (ilvl + 1) * 720;
    const bulletChar = bulletChars[ilvl] || "";
    const fontName = bulletFonts[ilvl] || "Symbol";

    bulletLevels.push(`    <w:lvl w:ilvl="${ilvl}">
      <w:start w:val="1"/>
      <w:numFmt w:val="bullet"/>
      <w:lvlText w:val="${bulletChar}"/>
      <w:lvlJc w:val="left"/>
      <w:pPr>
        <w:ind w:left="${leftIndent}" w:hanging="360"/>
      </w:pPr>
      <w:rPr>
        <w:rFonts w:ascii="${fontName}" w:hAnsi="${fontName}" w:hint="default"/>
      </w:rPr>
    </w:lvl>`);
  }

  // Tạo định nghĩa các cấp độ cho Numbered list (abstractNumId = 2)
  const numLevels: string[] = [];
  const numFmts = ["decimal", "lowerLetter", "lowerRoman", "decimal", "lowerLetter", "lowerRoman", "decimal", "lowerLetter", "lowerRoman"];

  for (let ilvl = 0; ilvl <= 8; ilvl++) {
    const leftIndent = (ilvl + 1) * 720;
    const numFmt = numFmts[ilvl] || "decimal";

    numLevels.push(`    <w:lvl w:ilvl="${ilvl}">
      <w:start w:val="1"/>
      <w:numFmt w:val="${numFmt}"/>
      <w:lvlText w:val="%${ilvl + 1}."/>
      <w:lvlJc w:val="left"/>
      <w:pPr>
        <w:ind w:left="${leftIndent}" w:hanging="360"/>
      </w:pPr>
    </w:lvl>`);
  }

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <!-- Bullet list abstract definition -->
  <w:abstractNum w:abstractNumId="1">
    <w:multiLevelType w:val="hybridMultilevel"/>
${bulletLevels.join("\n")}
  </w:abstractNum>

  <!-- Numbered list abstract definition -->
  <w:abstractNum w:abstractNumId="2">
    <w:multiLevelType w:val="hybridMultilevel"/>
${numLevels.join("\n")}
  </w:abstractNum>

  <!-- Concrete numbering instances -->
  <w:num w:numId="1">
    <w:abstractNumId w:val="1"/>
  </w:num>
  <w:num w:numId="2">
    <w:abstractNumId w:val="2"/>
  </w:num>
</w:numbering>`;
}
