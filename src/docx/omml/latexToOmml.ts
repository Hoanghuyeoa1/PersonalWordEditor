import { LATEX_TO_UNICODE } from "./ommlSymbols.ts";
import { escapeXmlText, escapeXmlAttr } from "../serializer/xmlBuilder.ts";
import type { OmmlExportOptions, OmmlExportResult } from "./ommlTypes.ts";

/**
 * Token trong biểu thức LaTeX
 */
interface Token {
  type:
    | "COMMAND"
    | "LBRACE"
    | "RBRACE"
    | "LBRACKET"
    | "RBRACKET"
    | "SUPER"
    | "SUB"
    | "AMP"
    | "NEWLINE"
    | "CHAR"
    | "WHITESPACE";
  value: string;
}

/**
 * Nút trong cây cú pháp toán học
 */
type MathNode =
  | { type: "RUN"; text: string }
  | { type: "FRACTION"; num: MathNode[]; den: MathNode[] }
  | { type: "SUP"; base: MathNode[]; sup: MathNode[] }
  | { type: "SUB"; base: MathNode[]; sub: MathNode[] }
  | { type: "SUB_SUP"; base: MathNode[]; sub: MathNode[]; sup: MathNode[] }
  | { type: "RADICAL"; degree?: MathNode[]; radicand: MathNode[] }
  | { type: "NARY"; operator: string; chr: string; sub?: MathNode[]; sup?: MathNode[]; body?: MathNode[] }
  | { type: "DELIMITER"; left: string; right: string; body: MathNode[] }
  | { type: "MATRIX"; rows: MathNode[][][]; fence?: { left: string; right: string } }
  | { type: "LIMIT"; base: string; limit: MathNode[] }
  | { type: "FUNC"; name: string; arg: MathNode[] };

/**
 * Tách chuỗi LaTeX thành danh sách các token
 */
function tokenizeLatex(latex: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const len = latex.length;

  while (i < len) {
    const ch = latex[i];

    if (/\s/.test(ch)) {
      tokens.push({ type: "WHITESPACE", value: ch });
      i++;
      continue;
    }

    if (ch === "\\") {
      // Nhận diện ký tự thoát đặc biệt như \\, \{, \}, \&, \|, etc.
      if (i + 1 < len) {
        const next = latex[i + 1];
        if (next === "\\") {
          tokens.push({ type: "NEWLINE", value: "\\\\" });
          i += 2;
          continue;
        }
        if (next === "{" || next === "}" || next === "&" || next === "%" || next === "$" || next === "#" || next === "_") {
          tokens.push({ type: "CHAR", value: next });
          i += 2;
          continue;
        }
        if (next === "|") {
          tokens.push({ type: "COMMAND", value: "\\|" });
          i += 2;
          continue;
        }
      }

      // Đọc tên lệnh LaTeX gồm các chữ cái
      let j = i + 1;
      while (j < len && /[a-zA-Z]/.test(latex[j])) {
        j++;
      }
      const cmd = latex.slice(i, j);
      tokens.push({ type: "COMMAND", value: cmd });
      i = j;
      continue;
    }

    if (ch === "{") {
      tokens.push({ type: "LBRACE", value: "{" });
      i++;
      continue;
    }
    if (ch === "}") {
      tokens.push({ type: "RBRACE", value: "}" });
      i++;
      continue;
    }
    if (ch === "[") {
      tokens.push({ type: "LBRACKET", value: "[" });
      i++;
      continue;
    }
    if (ch === "]") {
      tokens.push({ type: "RBRACKET", value: "]" });
      i++;
      continue;
    }
    if (ch === "^") {
      tokens.push({ type: "SUPER", value: "^" });
      i++;
      continue;
    }
    if (ch === "_") {
      tokens.push({ type: "SUB", value: "_" });
      i++;
      continue;
    }
    if (ch === "&") {
      tokens.push({ type: "AMP", value: "&" });
      i++;
      continue;
    }

    tokens.push({ type: "CHAR", value: ch });
    i++;
  }

  return tokens;
}

/**
 * Trình phân tích cú pháp LaTeX sang AST toán học có cấu trúc
 */
class LatexParser {
  private tokens: Token[];
  private pos = 0;
  public warnings: string[] = [];

  constructor(latex: string) {
    // Lọc bỏ khoảng trắng thừa nhưng giữ khoảng trắng có ý nghĩa
    this.tokens = tokenizeLatex(latex).filter(
      (t) => t.type !== "WHITESPACE"
    );
  }

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }

  private consume(): Token | undefined {
    return this.tokens[this.pos++];
  }

  public parse(): MathNode[] {
    const nodes: MathNode[] = [];
    while (this.pos < this.tokens.length) {
      const node = this.parseExpression();
      if (node) {
        nodes.push(node);
      } else {
        // Bỏ qua token không xác định
        this.consume();
      }
    }
    return this.postProcessSubSup(nodes);
  }

  /**
   * Đọc một nhóm trong ngoặc nhọn `{...}`
   */
  public parseGroup(): MathNode[] {
    const cur = this.peek();
    if (cur && cur.type === "LBRACE") {
      this.consume(); // {
      const groupNodes: MathNode[] = [];
      while (this.pos < this.tokens.length) {
        const top = this.peek();
        if (top && top.type === "RBRACE") {
          this.consume(); // }
          break;
        }
        const n = this.parseExpression();
        if (n) groupNodes.push(n);
        else this.consume();
      }
      return this.postProcessSubSup(groupNodes);
    }
    // Nếu không có ngoặc nhọn, chỉ đọc 1 expression đơn
    const single = this.parseExpression();
    return single ? [single] : [];
  }

  /**
   * Đọc đối số tùy chọn trong ngoặc vuông `[...]`
   */
  public parseOptionalGroup(): MathNode[] | undefined {
    const cur = this.peek();
    if (cur && cur.type === "LBRACKET") {
      this.consume(); // [
      const groupNodes: MathNode[] = [];
      while (this.pos < this.tokens.length) {
        const top = this.peek();
        if (top && top.type === "RBRACKET") {
          this.consume(); // ]
          break;
        }
        const n = this.parseExpression();
        if (n) groupNodes.push(n);
        else this.consume();
      }
      return this.postProcessSubSup(groupNodes);
    }
    return undefined;
  }

  /**
   * Phân tích một nút biểu thức
   */
  private parseExpression(): MathNode | null {
    const token = this.peek();
    if (!token) return null;

    if (token.type === "COMMAND") {
      const cmd = token.value;

      // 1. Phân số \frac{A}{B}
      if (cmd === "\\frac") {
        this.consume();
        const num = this.parseGroup();
        const den = this.parseGroup();
        return { type: "FRACTION", num, den };
      }

      // 2. Căn thức \sqrt[N]{A} hoặc \sqrt{A}
      if (cmd === "\\sqrt") {
        this.consume();
        const degree = this.parseOptionalGroup();
        const radicand = this.parseGroup();
        return { type: "RADICAL", degree, radicand };
      }

      // 3. Giới hạn \lim
      if (cmd === "\\lim") {
        this.consume();
        let limitNodes: MathNode[] = [];
        if (this.peek()?.type === "SUB") {
          this.consume(); // _
          limitNodes = this.parseGroup();
        }
        return { type: "LIMIT", base: "lim", limit: limitNodes };
      }

      // 4. Toán tử N-ary: Tích phân, Tổng, Tích
      const naryOps: Record<string, string> = {
        "\\int": "∫",
        "\\iint": "∬",
        "\\iiint": "∭",
        "\\oint": "∮",
        "\\sum": "∑",
        "\\prod": "∏",
        "\\coprod": "∐",
      };
      if (naryOps[cmd]) {
        this.consume();
        const chr = naryOps[cmd];
        let subNodes: MathNode[] | undefined = undefined;
        let supNodes: MathNode[] | undefined = undefined;

        // Đọc subscript hoặc superscript đi kèm
        for (let k = 0; k < 2; k++) {
          const next = this.peek();
          if (next?.type === "SUB" && !subNodes) {
            this.consume();
            subNodes = this.parseGroup();
          } else if (next?.type === "SUPER" && !supNodes) {
            this.consume();
            supNodes = this.parseGroup();
          }
        }

        return {
          type: "NARY",
          operator: cmd,
          chr,
          sub: subNodes,
          sup: supNodes,
        };
      }

      // 5. Dấu ngoặc \left ... \right
      if (cmd === "\\left") {
        this.consume();
        const leftToken = this.consume();
        let leftChr = "(";
        if (leftToken) {
          if (leftToken.value === "." || leftToken.value === "") leftChr = "";
          else if (leftToken.value === "\\{") leftChr = "{";
          else if (leftToken.value === "\\|") leftChr = "‖";
          else leftChr = leftToken.value;
        }

        const body: MathNode[] = [];
        let rightChr = ")";

        while (this.pos < this.tokens.length) {
          const top = this.peek();
          if (top && top.type === "COMMAND" && top.value === "\\right") {
            this.consume();
            const rightToken = this.consume();
            if (rightToken) {
              if (rightToken.value === "." || rightToken.value === "") rightChr = "";
              else if (rightToken.value === "\\}") rightChr = "}";
              else if (rightToken.value === "\\|") rightChr = "‖";
              else rightChr = rightToken.value;
            }
            break;
          }
          const expr = this.parseExpression();
          if (expr) body.push(expr);
          else this.consume();
        }

        return {
          type: "DELIMITER",
          left: leftChr,
          right: rightChr,
          body: this.postProcessSubSup(body),
        };
      }

      // 6. Môi trường \begin{matrix} / pmatrix / bmatrix / vmatrix ... \end{...}
      if (cmd === "\\begin") {
        this.consume();
        const envNameNodes = this.parseGroup();
        const envName = envNameNodes.map((n) => (n.type === "RUN" ? n.text : "")).join("").trim();

        const isMatrixEnv = ["matrix", "pmatrix", "bmatrix", "Bmatrix", "vmatrix", "Vmatrix"].includes(envName);
        if (isMatrixEnv) {
          return this.parseMatrixEnvironment(envName);
        }
      }

      // 7. Hàm toán học tiêu chuẩn (\sin, \cos, \tan, \ln, \log, ...)
      const mathFuncs = new Set([
        "\\sin", "\\cos", "\\tan", "\\cot", "\\sec", "\\csc",
        "\\arcsin", "\\arccos", "\\arctan", "\\sinh", "\\cosh", "\\tanh",
        "\\ln", "\\log", "\\exp", "\\max", "\\min", "\\det",
      ]);
      if (mathFuncs.has(cmd)) {
        this.consume();
        const funcName = cmd.replace("\\", "");
        let argNodes: MathNode[] = [];
        if (this.peek()?.type === "LBRACE") {
          argNodes = this.parseGroup();
        }
        return { type: "FUNC", name: funcName, arg: argNodes };
      }

      // 8. Ký hiệu chữ cái Hy Lạp hoặc toán tử LaTeX sang Unicode
      if (LATEX_TO_UNICODE.has(cmd)) {
        this.consume();
        const unicode = LATEX_TO_UNICODE.get(cmd)!;
        return { type: "RUN", text: unicode };
      }

      // Lệnh không nhận diện
      this.consume();
      this.warnings.push(`Chưa hỗ trợ đầy đủ lệnh toán học ${cmd}; chuyển sang dạng text an toàn.`);
      return { type: "RUN", text: cmd };
    }

    if (token.type === "LBRACE") {
      const group = this.parseGroup();
      if (group.length === 1) return group[0];
      return { type: "DELIMITER", left: "", right: "", body: group };
    }

    if (token.type === "CHAR") {
      this.consume();
      return { type: "RUN", text: token.value };
    }

    if (token.type === "SUPER" || token.type === "SUB" || token.type === "AMP" || token.type === "NEWLINE") {
      // Các token này được xử lý theo ngữ cảnh
      this.consume();
      return { type: "RUN", text: token.value };
    }

    this.consume();
    return null;
  }

  /**
   * Phân tích ma trận từ môi trường \begin{...matrix}
   */
  private parseMatrixEnvironment(envName: string): MathNode {
    const rows: MathNode[][][] = [];
    let currentRow: MathNode[][] = [];
    let currentCell: MathNode[] = [];

    while (this.pos < this.tokens.length) {
      const top = this.peek();
      if (top && top.type === "COMMAND" && top.value === "\\end") {
        this.consume();
        this.parseGroup(); // Bỏ qua {matrix}
        break;
      }

      if (top && top.type === "AMP") {
        this.consume();
        currentRow.push(this.postProcessSubSup(currentCell));
        currentCell = [];
        continue;
      }

      if (top && top.type === "NEWLINE") {
        this.consume();
        currentRow.push(this.postProcessSubSup(currentCell));
        rows.push(currentRow);
        currentRow = [];
        currentCell = [];
        continue;
      }

      const expr = this.parseExpression();
      if (expr) currentCell.push(expr);
      else this.consume();
    }

    if (currentCell.length > 0 || currentRow.length > 0) {
      currentRow.push(this.postProcessSubSup(currentCell));
      rows.push(currentRow);
    }

    let fence: { left: string; right: string } | undefined = undefined;
    if (envName === "pmatrix") fence = { left: "(", right: ")" };
    else if (envName === "bmatrix") fence = { left: "[", right: "]" };
    else if (envName === "Bmatrix") fence = { left: "{", right: "}" };
    else if (envName === "vmatrix") fence = { left: "|", right: "|" };
    else if (envName === "Vmatrix") fence = { left: "‖", right: "‖" };

    return { type: "MATRIX", rows, fence };
  }

  /**
   * Hậu xử lý các nút kề nhau để ghép toán tử mũ (^) và chỉ số dưới (_)
   */
  private postProcessSubSup(nodes: MathNode[]): MathNode[] {
    const result: MathNode[] = [];
    let i = 0;

    const extractArg = (n?: MathNode): MathNode[] => {
      if (!n) return [];
      if (n.type === "DELIMITER" && !n.left && !n.right) {
        return n.body;
      }
      return [n];
    };

    while (i < nodes.length) {
      const current = nodes[i];
      const next = nodes[i + 1];
      const afterNext = nodes[i + 2];

      if (
        current &&
        next &&
        next.type === "RUN" &&
        (next.text === "^" || next.text === "_")
      ) {
        const isSuper = next.text === "^";
        let supNodes: MathNode[] = [];
        let subNodes: MathNode[] = [];
        let consumed = 2;

        if (isSuper) {
          supNodes = extractArg(afterNext);
        } else {
          subNodes = extractArg(afterNext);
        }

        const next3 = nodes[i + 3];
        const next4 = nodes[i + 4];
        if (
          next3 &&
          next3.type === "RUN" &&
          ((isSuper && next3.text === "_") || (!isSuper && next3.text === "^"))
        ) {
          if (isSuper) {
            subNodes = extractArg(next4);
          } else {
            supNodes = extractArg(next4);
          }
          consumed = 4;
        }

        if (subNodes.length > 0 && supNodes.length > 0) {
          result.push({
            type: "SUB_SUP",
            base: [current],
            sub: subNodes,
            sup: supNodes,
          });
        } else if (supNodes.length > 0) {
          result.push({
            type: "SUP",
            base: [current],
            sup: supNodes,
          });
        } else if (subNodes.length > 0) {
          result.push({
            type: "SUB",
            base: [current],
            sub: subNodes,
          });
        } else {
          result.push(current);
          consumed = 0;
        }

        i += 1 + consumed;
        continue;
      }

      result.push(current);
      i++;
    }

    return result;
  }
}

/**
 * Tuần tự hóa một MathNode thành chuỗi XML OMML
 */
function serializeMathNodeToOmml(node: MathNode): string {
  switch (node.type) {
    case "RUN": {
      const text = node.text;
      return `<m:r><m:t xml:space="preserve">${escapeXmlText(text)}</m:t></m:r>`;
    }

    case "FRACTION": {
      const numXml = node.num.map(serializeMathNodeToOmml).join("");
      const denXml = node.den.map(serializeMathNodeToOmml).join("");
      return `<m:f><m:num>${numXml}</m:num><m:den>${denXml}</m:den></m:f>`;
    }

    case "SUP": {
      const baseXml = node.base.map(serializeMathNodeToOmml).join("");
      const supXml = node.sup.map(serializeMathNodeToOmml).join("");
      return `<m:sSup><m:e>${baseXml}</m:e><m:sup>${supXml}</m:sup></m:sSup>`;
    }

    case "SUB": {
      const baseXml = node.base.map(serializeMathNodeToOmml).join("");
      const subXml = node.sub.map(serializeMathNodeToOmml).join("");
      return `<m:sSub><m:e>${baseXml}</m:e><m:sub>${subXml}</m:sub></m:sSub>`;
    }

    case "SUB_SUP": {
      const baseXml = node.base.map(serializeMathNodeToOmml).join("");
      const subXml = node.sub.map(serializeMathNodeToOmml).join("");
      const supXml = node.sup.map(serializeMathNodeToOmml).join("");
      return `<m:sSubSup><m:e>${baseXml}</m:e><m:sub>${subXml}</m:sub><m:sup>${supXml}</m:sup></m:sSubSup>`;
    }

    case "RADICAL": {
      const radXml = node.radicand.map(serializeMathNodeToOmml).join("");
      if (node.degree && node.degree.length > 0) {
        const degXml = node.degree.map(serializeMathNodeToOmml).join("");
        return `<m:rad><m:deg>${degXml}</m:deg><m:e>${radXml}</m:e></m:rad>`;
      }
      return `<m:rad><m:radPr><m:degHide/></m:radPr><m:deg/><m:e>${radXml}</m:e></m:rad>`;
    }

    case "NARY": {
      const subXml = node.sub ? node.sub.map(serializeMathNodeToOmml).join("") : "";
      const supXml = node.sup ? node.sup.map(serializeMathNodeToOmml).join("") : "";
      const bodyXml = node.body ? node.body.map(serializeMathNodeToOmml).join("") : "";

      let prXml = `<m:naryPr><m:chr m:val="${escapeXmlAttr(node.chr)}"/><m:limLoc m:val="undOvr"/>`;
      if (!node.sub) prXml += "<m:subHide/>";
      if (!node.sup) prXml += "<m:supHide/>";
      prXml += "</m:naryPr>";

      return `<m:nary>${prXml}<m:sub>${subXml}</m:sub><m:sup>${supXml}</m:sup><m:e>${bodyXml}</m:e></m:nary>`;
    }

    case "DELIMITER": {
      const bodyXml = node.body.map(serializeMathNodeToOmml).join("");
      if (!node.left && !node.right) {
        return bodyXml;
      }
      const dPrXml = `<m:dPr><m:begChr m:val="${escapeXmlAttr(node.left)}"/><m:endChr m:val="${escapeXmlAttr(node.right)}"/><m:grow m:val="1"/></m:dPr>`;
      return `<m:d>${dPrXml}<m:e>${bodyXml}</m:e></m:d>`;
    }

    case "MATRIX": {
      const rowsXml = node.rows
        .map((r) => {
          const cellsXml = r.map((c) => `<m:e>${c.map(serializeMathNodeToOmml).join("")}</m:e>`).join("");
          return `<m:mr>${cellsXml}</m:mr>`;
        })
        .join("");

      const matrixXml = `<m:m><m:mPr/>${rowsXml}</m:m>`;
      if (node.fence) {
        const dPrXml = `<m:dPr><m:begChr m:val="${escapeXmlAttr(node.fence.left)}"/><m:endChr m:val="${escapeXmlAttr(node.fence.right)}"/></m:dPr>`;
        return `<m:d>${dPrXml}<m:e>${matrixXml}</m:e></m:d>`;
      }
      return matrixXml;
    }

    case "LIMIT": {
      const limXml = node.limit.map(serializeMathNodeToOmml).join("");
      return `<m:limLow><m:e><m:r><m:t>lim</m:t></m:r></m:e><m:lim>${limXml}</m:lim></m:limLow>`;
    }

    case "FUNC": {
      const argXml = node.arg.map(serializeMathNodeToOmml).join("");
      return `<m:func><m:fName><m:r><m:t>${escapeXmlText(node.name)}</m:t></m:r></m:fName><m:e>${argXml}</m:e></m:func>`;
    }

    default:
      return "";
  }
}


/**
 * Chuyển đổi biểu thức LaTeX sang chuỗi OMML XML hoàn chỉnh
 */
export function convertLatexToOmml(
  latex: string,
  options?: OmmlExportOptions
): OmmlExportResult {
  const warnings: string[] = [];
  const trimmed = (latex || "").trim();

  if (!trimmed) {
    return {
      xml: `<m:oMath xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"/>`,
      isSupported: true,
      warnings: [],
    };
  }

  try {
    const parser = new LatexParser(trimmed);
    const ast = parser.parse();
    warnings.push(...parser.warnings);

    // Chuyển AST sang các phần tử OMML
    let innerOmml = ast.map(serializeMathNodeToOmml).join("");

    if (!innerOmml.trim()) {
      innerOmml = `<m:r><m:t>${escapeXmlText(trimmed)}</m:t></m:r>`;
    }

    const displayMode = Boolean(options?.displayMode);
    const alignment = options?.alignment || "center";

    let finalXml = "";
    if (displayMode) {
      finalXml = `<m:oMathPara xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"><m:oMathParaPr><m:jc m:val="${alignment}"/></m:oMathParaPr><m:oMath>${innerOmml}</m:oMath></m:oMathPara>`;
    } else {
      finalXml = `<m:oMath xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math">${innerOmml}</m:oMath>`;
    }

    return {
      xml: finalXml,
      isSupported: warnings.length === 0,
      warnings,
    };
  } catch (err: any) {
    warnings.push(`Không thể phân tích cú pháp LaTeX đầy đủ: ${err?.message || "Lỗi không xác định"}`);
    // Safe textual math fallback
    const fallbackXml = `<m:oMath xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"><m:r><m:t>${escapeXmlText(trimmed)}</m:t></m:r></m:oMath>`;
    return {
      xml: fallbackXml,
      isSupported: false,
      warnings,
    };
  }
}
