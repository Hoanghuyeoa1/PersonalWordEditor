/**
 * Bản đồ chuyển đổi song ánh giữa ký hiệu LaTeX và Unicode trong OMML (Office Math)
 * Tuân thủ ISO/IEC 29500 Math Symbols.
 */

export interface MathSymbolDef {
  latex: string;
  unicode: string;
}

export const GREEK_SYMBOLS: MathSymbolDef[] = [
  // Chữ cái Hy Lạp thường
  { latex: "\\alpha", unicode: "α" },
  { latex: "\\beta", unicode: "β" },
  { latex: "\\gamma", unicode: "γ" },
  { latex: "\\delta", unicode: "δ" },
  { latex: "\\epsilon", unicode: "ε" },
  { latex: "\\zeta", unicode: "ζ" },
  { latex: "\\eta", unicode: "η" },
  { latex: "\\theta", unicode: "θ" },
  { latex: "\\iota", unicode: "ι" },
  { latex: "\\kappa", unicode: "κ" },
  { latex: "\\lambda", unicode: "λ" },
  { latex: "\\mu", unicode: "μ" },
  { latex: "\\nu", unicode: "ν" },
  { latex: "\\xi", unicode: "ξ" },
  { latex: "\\pi", unicode: "π" },
  { latex: "\\rho", unicode: "ρ" },
  { latex: "\\sigma", unicode: "σ" },
  { latex: "\\tau", unicode: "τ" },
  { latex: "\\upsilon", unicode: "υ" },
  { latex: "\\phi", unicode: "φ" },
  { latex: "\\chi", unicode: "χ" },
  { latex: "\\psi", unicode: "ψ" },
  { latex: "\\omega", unicode: "ω" },

  // Chữ cái Hy Lạp hoa
  { latex: "\\Gamma", unicode: "Γ" },
  { latex: "\\Delta", unicode: "Δ" },
  { latex: "\\Theta", unicode: "Θ" },
  { latex: "\\Lambda", unicode: "Λ" },
  { latex: "\\Xi", unicode: "Ξ" },
  { latex: "\\Pi", unicode: "Π" },
  { latex: "\\Sigma", unicode: "Σ" },
  { latex: "\\Upsilon", unicode: "Υ" },
  { latex: "\\Phi", unicode: "Φ" },
  { latex: "\\Psi", unicode: "Ψ" },
  { latex: "\\Omega", unicode: "Ω" },
];

export const MATH_OPERATORS: MathSymbolDef[] = [
  { latex: "\\pm", unicode: "±" },
  { latex: "\\mp", unicode: "∓" },
  { latex: "\\times", unicode: "×" },
  { latex: "\\div", unicode: "÷" },
  { latex: "\\cdot", unicode: "·" },
  { latex: "\\neq", unicode: "≠" },
  { latex: "\\leq", unicode: "≤" },
  { latex: "\\geq", unicode: "≥" },
  { latex: "\\approx", unicode: "≈" },
  { latex: "\\equiv", unicode: "≡" },
  { latex: "\\sim", unicode: "∼" },
  { latex: "\\propto", unicode: "∝" },
  { latex: "\\infty", unicode: "∞" },
  { latex: "\\partial", unicode: "∂" },
  { latex: "\\nabla", unicode: "∇" },
  { latex: "\\to", unicode: "→" },
  { latex: "\\rightarrow", unicode: "→" },
  { latex: "\\leftarrow", unicode: "←" },
  { latex: "\\Rightarrow", unicode: "⇒" },
  { latex: "\\Leftarrow", unicode: "⇐" },
  { latex: "\\Leftrightarrow", unicode: "⇔" },
  { latex: "\\in", unicode: "∈" },
  { latex: "\\notin", unicode: "∉" },
  { latex: "\\subset", unicode: "⊂" },
  { latex: "\\subseteq", unicode: "⊆" },
  { latex: "\\cup", unicode: "∪" },
  { latex: "\\cap", unicode: "∩" },
  { latex: "\\forall", unicode: "∀" },
  { latex: "\\exists", unicode: "∃" },
  { latex: "\\neg", unicode: "¬" },
  { latex: "\\dots", unicode: "…" },
  { latex: "\\ldots", unicode: "…" },
  { latex: "\\cdots", unicode: "⋯" },
  { latex: "\\vdots", unicode: "⋮" },
  { latex: "\\ddots", unicode: "⋱" },

  // N-ary operators
  { latex: "\\int", unicode: "∫" },
  { latex: "\\iint", unicode: "∬" },
  { latex: "\\iiint", unicode: "∭" },
  { latex: "\\oint", unicode: "∮" },
  { latex: "\\sum", unicode: "∑" },
  { latex: "\\prod", unicode: "∏" },
  { latex: "\\coprod", unicode: "∐" },
];

// Bản đồ tra cứu nhanh từ Unicode sang LaTeX
export const UNICODE_TO_LATEX = new Map<string, string>();
// Bản đồ tra cứu nhanh từ lệnh LaTeX sang Unicode
export const LATEX_TO_UNICODE = new Map<string, string>();

for (const sym of [...GREEK_SYMBOLS, ...MATH_OPERATORS]) {
  if (!UNICODE_TO_LATEX.has(sym.unicode)) {
    UNICODE_TO_LATEX.set(sym.unicode, sym.latex);
  }
  if (!LATEX_TO_UNICODE.has(sym.latex)) {
    LATEX_TO_UNICODE.set(sym.latex, sym.unicode);
  }
}

/**
 * Chuyển đổi một chuỗi văn bản toán học từ ký tự Unicode sang các macro LaTeX tương ứng.
 */
export function unicodeMathToLatex(text: string): string {
  if (!text) return "";
  let result = "";
  for (const char of text) {
    const macro = UNICODE_TO_LATEX.get(char);
    if (macro) {
      // Thêm khoảng trắng sau macro nếu ký tự kế tiếp có thể dính chữ
      result += `${macro} `;
    } else {
      result += char;
    }
  }
  return result.trim();
}

/**
 * Thay thế các macro LaTeX phổ biến trong chuỗi thành ký hiệu Unicode OMML
 */
export function latexMacrosToUnicode(text: string): string {
  if (!text) return "";
  let res = text;
  for (const [latex, unicode] of LATEX_TO_UNICODE.entries()) {
    // Thay thế an toàn bằng regex boundary
    const escaped = latex.replace(/\\/g, "\\\\");
    res = res.replace(new RegExp(`${escaped}(?=[^a-zA-Z]|$)`, "g"), unicode);
  }
  return res;
}
