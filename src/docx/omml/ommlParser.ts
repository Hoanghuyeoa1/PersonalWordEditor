import {
  getLocalName,
  getFirstChildByLocalName,
  getDirectChildrenByLocalName,
  getAttrValue,
} from "../utils/xmlUtils.ts";
import { unicodeMathToLatex, UNICODE_TO_LATEX } from "./ommlSymbols.ts";
import type { OmmlParseResult } from "./ommlTypes.ts";

/**
 * Nối các thành phần LaTeX với khoảng cách thông minh
 */
function joinMathParts(parts: string[]): string {
  let res = "";
  for (let i = 0; i < parts.length; i++) {
    const cur = parts[i].trim();
    if (!cur) continue;
    if (!res) {
      res = cur;
      continue;
    }
    const prevEndsWithCommand = /\\[a-zA-Z]+$/.test(res);
    const curStartsWithAlpha = /^[a-zA-Z]/.test(cur);
    const isOperator = /^[\+\-\=\<\>\±\×\÷]/.test(cur) || /[\+\-\=\<\>\±\×\÷]$/.test(res);

    if (prevEndsWithCommand && curStartsWithAlpha) {
      res += " " + cur;
    } else if (isOperator) {
      res += " " + cur;
    } else if (
      (res.endsWith("}") || res.endsWith(")")) &&
      (cur.startsWith("\\") || cur.startsWith("(") || cur.startsWith("{"))
    ) {
      res += " " + cur;
    } else if (res.endsWith("}") && /^[a-zA-Z0-9]/.test(cur)) {
      res += " " + cur;
    } else {
      res += cur;
    }
  }
  return res.replace(/\s+/g, " ").trim();
}

/**
 * Trình phân tích cú pháp OMML (Office Math Markup Language) sang LaTeX.
 * Tuân thủ ISO/IEC 29500 Office Math.
 */
export class OmmlParser {
  private warnings: string[] = [];

  /**
   * Phân tích một phần tử XML chứa OMML (<m:oMath> hoặc <m:oMathPara>)
   */
  public parse(mathEl: Element): OmmlParseResult {
    this.warnings = [];
    const local = getLocalName(mathEl).toLowerCase();

    let displayMode = false;
    let alignment: "left" | "center" | "right" = "center";
    let latex = "";

    try {
      if (local === "omathpara") {
        displayMode = true;
        // Kiểm tra căn lề từ <m:oMathParaPr>/<m:jc>
        const paraPr = getFirstChildByLocalName(mathEl, "omathparapr");
        if (paraPr) {
          const jc = getFirstChildByLocalName(paraPr, "jc");
          if (jc) {
            const val = (getAttrValue(jc, "val") || "").toLowerCase();
            if (val === "left") alignment = "left";
            else if (val === "right") alignment = "right";
            else if (val === "center") alignment = "center";
          }
        }

        // Gom các <m:oMath> bên trong
        const oMathChildren = getDirectChildrenByLocalName(mathEl, "omath");
        if (oMathChildren.length > 0) {
          const parts = oMathChildren.map((om) => this.parseOMathElement(om));
          latex = parts.join(" ").trim();
        } else {
          latex = this.parseOMathElement(mathEl);
        }
      } else {
        // <m:oMath> độc lập
        latex = this.parseOMathElement(mathEl);
      }
    } catch (err: any) {
      this.warnings.push(`Lỗi phân tích OMML: ${err?.message || "Không xác định"}`);
      // Fail-safe: trích xuất text thuần nếu có
      latex = mathEl.textContent?.trim() || "";
    }

    return {
      latex: latex.trim(),
      displayMode,
      alignment,
      warnings: [...this.warnings],
    };
  }

  /**
   * Phân tích nội dung bên trong một <m:oMath> hoặc phần tử chứa toán học
   */
  public parseOMathElement(container: Element): string {
    const parts: string[] = [];

    for (let i = 0; i < container.childNodes.length; i++) {
      const node = container.childNodes[i];
      if (node.nodeType !== 1) continue;
      const el = node as Element;
      const local = getLocalName(el).toLowerCase();

      switch (local) {
        // Run toán học (<m:r>) hoặc văn bản (<w:r>)
        case "r": {
          parts.push(this.parseRunElement(el));
          break;
        }

        // Phân số (<m:f>)
        case "f": {
          parts.push(this.parseFraction(el));
          break;
        }

        // Số mũ / Superscript (<m:ssup>)
        case "ssup": {
          parts.push(this.parseSuperscript(el));
          break;
        }

        // Chỉ số dưới / Subscript (<m:ssub>)
        case "ssub": {
          parts.push(this.parseSubscript(el));
          break;
        }

        // Cả trên và dưới / SubSup (<m:ssubsup>)
        case "ssubsup": {
          parts.push(this.parseSubSup(el));
          break;
        }

        // Căn thức / Radical (<m:rad>)
        case "rad": {
          parts.push(this.parseRadical(el));
          break;
        }

        // Tích phân / Tổng / N-ary (<m:nary>)
        case "nary": {
          parts.push(this.parseNary(el));
          break;
        }

        // Dấu ngoặc / Delimiter (<m:d>)
        case "d": {
          parts.push(this.parseDelimiter(el));
          break;
        }

        // Ma trận (<m:m>)
        case "m": {
          parts.push(this.parseMatrix(el));
          break;
        }

        // Giới hạn dưới (<m:limlow>)
        case "limlow": {
          parts.push(this.parseLimLow(el));
          break;
        }

        // Giới hạn trên (<m:limupp>)
        case "limupp": {
          parts.push(this.parseLimUpp(el));
          break;
        }

        // Hàm toán học (<m:func>)
        case "func": {
          parts.push(this.parseFunction(el));
          break;
        }

        // Hộp nhóm (<m:box>, <m:groupchr>, <m:borderbox>)
        case "box":
        case "groupchr":
        case "borderbox": {
          const eEl = getFirstChildByLocalName(el, "e");
          if (eEl) {
            parts.push(this.parseOMathElement(eEl));
          } else {
            parts.push(this.parseOMathElement(el));
          }
          break;
        }

        default: {
          // Thẻ không xác định: thử trích xuất phần tử <m:e> hoặc text an toàn
          const eEl = getFirstChildByLocalName(el, "e");
          if (eEl) {
            parts.push(this.parseOMathElement(eEl));
          } else {
            const rawText = el.textContent?.trim() || "";
            if (rawText) {
              parts.push(unicodeMathToLatex(rawText));
            }
          }
          break;
        }
      }
    }

    return joinMathParts(parts);
  }

  /**
   * Phân tích thẻ Run (<m:r> hoặc <w:r>)
   */
  private parseRunElement(rEl: Element): string {
    const tEl = getFirstChildByLocalName(rEl, "t");
    if (!tEl) return "";
    const raw = tEl.textContent || "";
    return unicodeMathToLatex(raw);
  }

  /**
   * Phân tích phân số (<m:f>)
   */
  private parseFraction(fEl: Element): string {
    const numEl = getFirstChildByLocalName(fEl, "num");
    const denEl = getFirstChildByLocalName(fEl, "den");

    const numLatex = numEl ? this.parseOMathElement(numEl) : "";
    const denLatex = denEl ? this.parseOMathElement(denEl) : "";

    return `\\frac{${numLatex}}{${denLatex}}`;
  }

  /**
   * Phân tích số mũ (<m:sSup>)
   */
  private parseSuperscript(sSupEl: Element): string {
    const eEl = getFirstChildByLocalName(sSupEl, "e");
    const supEl = getFirstChildByLocalName(sSupEl, "sup");

    const baseLatex = eEl ? this.parseOMathElement(eEl) : "";
    const supLatex = supEl ? this.parseOMathElement(supEl) : "";

    const formattedBase = baseLatex.length === 1 ? baseLatex : `{${baseLatex}}`;
    return `${formattedBase}^{${supLatex}}`;
  }

  /**
   * Phân tích chỉ số dưới (<m:sSub>)
   */
  private parseSubscript(sSubEl: Element): string {
    const eEl = getFirstChildByLocalName(sSubEl, "e");
    const subEl = getFirstChildByLocalName(sSubEl, "sub");

    const baseLatex = eEl ? this.parseOMathElement(eEl) : "";
    const subLatex = subEl ? this.parseOMathElement(subEl) : "";

    const formattedBase = baseLatex.length === 1 ? baseLatex : `{${baseLatex}}`;
    return `${formattedBase}_{${subLatex}}`;
  }

  /**
   * Phân tích cả chỉ số dưới và số mũ (<m:sSubSup>)
   */
  private parseSubSup(sSubSupEl: Element): string {
    const eEl = getFirstChildByLocalName(sSubSupEl, "e");
    const subEl = getFirstChildByLocalName(sSubSupEl, "sub");
    const supEl = getFirstChildByLocalName(sSubSupEl, "sup");

    const baseLatex = eEl ? this.parseOMathElement(eEl) : "";
    const subLatex = subEl ? this.parseOMathElement(subEl) : "";
    const supLatex = supEl ? this.parseOMathElement(supEl) : "";

    const formattedBase = baseLatex.length === 1 ? baseLatex : `{${baseLatex}}`;
    return `${formattedBase}_{${subLatex}}^{${supLatex}}`;
  }

  /**
   * Phân tích căn thức / radical (<m:rad>)
   */
  private parseRadical(radEl: Element): string {
    const radPr = getFirstChildByLocalName(radEl, "radpr");
    const degEl = getFirstChildByLocalName(radEl, "deg");
    const eEl = getFirstChildByLocalName(radEl, "e");

    const isDegHidden =
      radPr &&
      (getFirstChildByLocalName(radPr, "deghide") !== null ||
        getAttrValue(radPr, "deghide") === "1");

    const baseLatex = eEl ? this.parseOMathElement(eEl) : "";
    const degLatex = degEl ? this.parseOMathElement(degEl).trim() : "";

    if (isDegHidden || !degLatex) {
      return `\\sqrt{${baseLatex}}`;
    }
    return `\\sqrt[${degLatex}]{${baseLatex}}`;
  }

  /**
   * Phân tích toán tử N-ary: Tích phân, Tổng, Tích (<m:nary>)
   */
  private parseNary(naryEl: Element): string {
    const naryPr = getFirstChildByLocalName(naryEl, "narypr");
    const chrEl = naryPr ? getFirstChildByLocalName(naryPr, "chr") : null;
    const rawChr = chrEl ? getAttrValue(chrEl, "val") || "∫" : "∫";

    // Tra cứu ký hiệu toán tử sang LaTeX
    let opLatex = "\\int";
    if (rawChr === "∑" || rawChr === "\u2211") opLatex = "\\sum";
    else if (rawChr === "∏" || rawChr === "\u220F") opLatex = "\\prod";
    else if (rawChr === "∬" || rawChr === "\u222C") opLatex = "\\iint";
    else if (rawChr === "∭" || rawChr === "\u222D") opLatex = "\\iiint";
    else if (rawChr === "∮" || rawChr === "\u222E") opLatex = "\\oint";
    else if (rawChr === "∐" || rawChr === "\u2210") opLatex = "\\coprod";
    else if (UNICODE_TO_LATEX.has(rawChr)) opLatex = UNICODE_TO_LATEX.get(rawChr)!;

    const subHide = naryPr && getFirstChildByLocalName(naryPr, "subhide");
    const supHide = naryPr && getFirstChildByLocalName(naryPr, "suphide");

    const subEl = getFirstChildByLocalName(naryEl, "sub");
    const supEl = getFirstChildByLocalName(naryEl, "sup");
    const eEl = getFirstChildByLocalName(naryEl, "e");

    const subLatex = subEl && !subHide ? this.parseOMathElement(subEl) : "";
    const supLatex = supEl && !supHide ? this.parseOMathElement(supEl) : "";
    const eLatex = eEl ? this.parseOMathElement(eEl) : "";

    let res = opLatex;
    if (subLatex) res += `_{${subLatex}}`;
    if (supLatex) res += `^{${supLatex}}`;
    if (eLatex) res += ` ${eLatex}`;
    return res;
  }

  /**
   * Phân tích dấu ngoặc bao quanh (<m:d>)
   */
  private parseDelimiter(dEl: Element): string {
    const dPr = getFirstChildByLocalName(dEl, "dpr");
    const begChrEl = dPr ? getFirstChildByLocalName(dPr, "begchr") : null;
    const endChrEl = dPr ? getFirstChildByLocalName(dPr, "endchr") : null;

    const begChr = begChrEl ? getAttrValue(begChrEl, "val") || "(" : "(";
    const endChr = endChrEl ? getAttrValue(endChrEl, "val") || ")" : ")";

    const mapDelimiter = (chr: string, isLeft: boolean): string => {
      const side = isLeft ? "\\left" : "\\right";
      if (!chr) return `${side}.`;
      if (chr === "(") return `${side}(`;
      if (chr === ")") return `${side})`;
      if (chr === "[") return `${side}[`;
      if (chr === "]") return `${side}]`;
      if (chr === "{") return `${side}\\{`;
      if (chr === "}") return `${side}\\}`;
      if (chr === "|") return `${side}|`;
      if (chr === "‖" || chr === "\u2016") return `${side}\\|`;
      return `${side}${chr}`;
    };

    const left = mapDelimiter(begChr, true);
    const right = mapDelimiter(endChr, false);

    const eChildren = getDirectChildrenByLocalName(dEl, "e");
    const content = eChildren.map((e) => this.parseOMathElement(e)).join(" ");

    return `${left} ${content} ${right}`;
  }

  /**
   * Phân tích ma trận (<m:m>)
   */
  private parseMatrix(mEl: Element): string {
    const rows = getDirectChildrenByLocalName(mEl, "mr");
    const rowLatexList: string[] = [];

    for (const r of rows) {
      const cells = getDirectChildrenByLocalName(r, "e");
      const cellLatexList = cells.map((c) => this.parseOMathElement(c));
      rowLatexList.push(cellLatexList.join(" & "));
    }

    return `\\begin{matrix} ${rowLatexList.join(" \\\\ ")} \\end{matrix}`;
  }

  /**
   * Phân tích giới hạn dưới (<m:limLow>)
   */
  private parseLimLow(limLowEl: Element): string {
    const eEl = getFirstChildByLocalName(limLowEl, "e");
    const limEl = getFirstChildByLocalName(limLowEl, "lim");

    const baseLatex = eEl ? this.parseOMathElement(eEl) : "";
    const limLatex = limEl ? this.parseOMathElement(limEl) : "";

    const trimmedBase = baseLatex.trim();
    if (trimmedBase.toLowerCase() === "lim" || trimmedBase === "\\lim") {
      return `\\lim_{${limLatex}}`;
    }
    return `{${baseLatex}}_{${limLatex}}`;
  }

  /**
   * Phân tích giới hạn trên (<m:limUpp>)
   */
  private parseLimUpp(limUppEl: Element): string {
    const eEl = getFirstChildByLocalName(limUppEl, "e");
    const limEl = getFirstChildByLocalName(limUppEl, "lim");

    const baseLatex = eEl ? this.parseOMathElement(eEl) : "";
    const limLatex = limEl ? this.parseOMathElement(limEl) : "";

    return `{${baseLatex}}^{${limLatex}}`;
  }

  /**
   * Phân tích hàm toán học (<m:func>)
   */
  private parseFunction(funcEl: Element): string {
    const fNameEl = getFirstChildByLocalName(funcEl, "fname");
    const eEl = getFirstChildByLocalName(funcEl, "e");

    const name = fNameEl ? this.parseOMathElement(fNameEl).trim() : "";
    const arg = eEl ? this.parseOMathElement(eEl).trim() : "";

    const standardFuncs = new Set([
      "sin", "cos", "tan", "cot", "sec", "csc",
      "arcsin", "arccos", "arctan", "sinh", "cosh", "tanh",
      "ln", "log", "exp", "lim", "max", "min", "det",
    ]);

    if (standardFuncs.has(name.toLowerCase())) {
      return `\\${name.toLowerCase()}{${arg}}`;
    }
    return `${name}(${arg})`;
  }
}
