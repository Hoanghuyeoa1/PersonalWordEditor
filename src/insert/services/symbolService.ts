export interface SymbolItem {
  char: string;
  name: string;
  category: "special" | "currency" | "math" | "arrows" | "marks" | "greek";
  codePoint: string;
}

export interface SymbolCategoryDef {
  id: SymbolItem["category"];
  label: string;
}

export const SYMBOL_CATEGORIES: SymbolCategoryDef[] = [
  { id: "special", label: "Bản quyền & Ký hiệu" },
  { id: "currency", label: "Tiền tệ" },
  { id: "math", label: "Toán học" },
  { id: "arrows", label: "Mũi tên" },
  { id: "marks", label: "Đánh dấu & Biểu tượng" },
  { id: "greek", label: "Ký tự Hy Lạp" },
];

export const POPULAR_SYMBOLS: SymbolItem[] = [
  // 1. Bản quyền & Ký hiệu đặc biệt
  { char: "©", name: "Bản quyền (Copyright)", category: "special", codePoint: "U+00A9" },
  { char: "®", name: "Nhãn hiệu đăng ký (Registered)", category: "special", codePoint: "U+00AE" },
  { char: "™", name: "Nhãn hiệu (Trademark)", category: "special", codePoint: "U+2122" },
  { char: "§", name: "Mục (Section)", category: "special", codePoint: "U+00A7" },
  { char: "¶", name: "Đoạn văn (Pilcrow)", category: "special", codePoint: "U+00B6" },
  { char: "•", name: "Dấu chấm đầu dòng (Bullet)", category: "special", codePoint: "U+2022" },
  { char: "…", name: "Dấu ba chấm (Ellipsis)", category: "special", codePoint: "U+2026" },
  { char: "‰", name: "Phần nghìn (Per mille)", category: "special", codePoint: "U+2030" },
  { char: "№", name: "Số hiệu (Numero)", category: "special", codePoint: "U+2116" },
  { char: "℃", name: "Độ C (Degree Celsius)", category: "special", codePoint: "U+2103" },
  { char: "℉", name: "Độ F (Degree Fahrenheit)", category: "special", codePoint: "U+2109" },

  // 2. Tiền tệ
  { char: "₫", name: "Việt Nam Đồng (VND)", category: "currency", codePoint: "U+20AB" },
  { char: "$", name: "Đô la Mỹ (Dollar)", category: "currency", codePoint: "U+0024" },
  { char: "€", name: "Đồng Euro", category: "currency", codePoint: "U+20AC" },
  { char: "£", name: "Bảng Anh (Pound)", category: "currency", codePoint: "U+00A3" },
  { char: "¥", name: "Yên Nhật / Nhân dân tệ", category: "currency", codePoint: "U+00A5" },
  { char: "¢", name: "Cent", category: "currency", codePoint: "U+00A2" },
  { char: "₹", name: "Rupee Ấn Độ", category: "currency", codePoint: "U+20B9" },
  { char: "₩", name: "Won Hàn Quốc", category: "currency", codePoint: "U+20A9" },
  { char: "₽", name: "Rúp Nga", category: "currency", codePoint: "U+20BD" },
  { char: "฿", name: "Baht Thái", category: "currency", codePoint: "U+0E3F" },

  // 3. Toán học
  { char: "±", name: "Cộng trừ (Plus-minus)", category: "math", codePoint: "U+00B1" },
  { char: "×", name: "Dấu nhân (Multiply)", category: "math", codePoint: "U+00D7" },
  { char: "÷", name: "Dấu chia (Divide)", category: "math", codePoint: "U+00F7" },
  { char: "≤", name: "Nhỏ hơn hoặc bằng", category: "math", codePoint: "U+2264" },
  { char: "≥", name: "Lớn hơn hoặc bằng", category: "math", codePoint: "U+2265" },
  { char: "≠", name: "Khác (Not equal)", category: "math", codePoint: "U+2260" },
  { char: "≈", name: "Xấp xỉ (Almost equal)", category: "math", codePoint: "U+2248" },
  { char: "≡", name: "Đồng nhất (Identical)", category: "math", codePoint: "U+2261" },
  { char: "∞", name: "Vô cực (Infinity)", category: "math", codePoint: "U+221E" },
  { char: "°", name: "Độ (Degree)", category: "math", codePoint: "U+00B0" },
  { char: "√", name: "Căn bậc hai (Square root)", category: "math", codePoint: "U+221A" },
  { char: "∑", name: "Tổng (Summation)", category: "math", codePoint: "U+2211" },
  { char: "∏", name: "Tích (Product)", category: "math", codePoint: "U+220F" },
  { char: "π", name: "Số Pi", category: "math", codePoint: "U+03C0" },
  { char: "µ", name: "Micro", category: "math", codePoint: "U+00B5" },
  { char: "∂", name: "Đạo hàm riêng (Partial diff)", category: "math", codePoint: "U+2202" },
  { char: "∫", name: "Tích phân (Integral)", category: "math", codePoint: "U+222B" },
  { char: "∆", name: "Delta (Increment)", category: "math", codePoint: "U+2206" },

  // 4. Mũi tên
  { char: "←", name: "Mũi tên trái", category: "arrows", codePoint: "U+2190" },
  { char: "↑", name: "Mũi tên lên", category: "arrows", codePoint: "U+2191" },
  { char: "→", name: "Mũi tên phải", category: "arrows", codePoint: "U+2192" },
  { char: "↓", name: "Mũi tên xuống", category: "arrows", codePoint: "U+2193" },
  { char: "↔", name: "Mũi tên hai chiều", category: "arrows", codePoint: "U+2194" },
  { char: "↕", name: "Mũi tên lên xuống", category: "arrows", codePoint: "U+2195" },
  { char: "⇐", name: "Mũi tên đôi trái", category: "arrows", codePoint: "U+21D0" },
  { char: "⇒", name: "Mũi tên đôi phải", category: "arrows", codePoint: "U+21D2" },
  { char: "⇔", name: "Mũi tên tương đương", category: "arrows", codePoint: "U+21D4" },

  // 5. Đánh dấu & Biểu tượng
  { char: "✓", name: "Dấu tích (Checkmark)", category: "marks", codePoint: "U+2713" },
  { char: "✗", name: "Dấu chéo (Cross)", category: "marks", codePoint: "U+2717" },
  { char: "★", name: "Ngôi sao đặc (Black star)", category: "marks", codePoint: "U+2605" },
  { char: "☆", name: "Ngôi sao rỗng (White star)", category: "marks", codePoint: "U+2606" },
  { char: "♥", name: "Trái tim (Heart)", category: "marks", codePoint: "U+2665" },
  { char: "♦", name: "Rô (Diamond)", category: "marks", codePoint: "U+2666" },
  { char: "♠", name: "Bích (Spade)", category: "marks", codePoint: "U+2660" },
  { char: "♣", name: "Tép (Club)", category: "marks", codePoint: "U+2663" },
  { char: "▲", name: "Tam giác lên", category: "marks", codePoint: "U+25B2" },
  { char: "▼", name: "Tam giác xuống", category: "marks", codePoint: "U+25BC" },
  { char: "◆", name: "Hình thoi đặc", category: "marks", codePoint: "U+25C6" },

  // 6. Ký tự Hy Lạp
  { char: "α", name: "Alpha", category: "greek", codePoint: "U+03B1" },
  { char: "β", name: "Beta", category: "greek", codePoint: "U+03B2" },
  { char: "γ", name: "Gamma", category: "greek", codePoint: "U+03B3" },
  { char: "δ", name: "Delta", category: "greek", codePoint: "U+03B4" },
  { char: "θ", name: "Theta", category: "greek", codePoint: "U+03B8" },
  { char: "λ", name: "Lambda", category: "greek", codePoint: "U+03BB" },
  { char: "σ", name: "Sigma", category: "greek", codePoint: "U+03C3" },
  { char: "ω", name: "Omega", category: "greek", codePoint: "U+03C9" },
  { char: "Ω", name: "Omega hoa", category: "greek", codePoint: "U+03A9" },
  { char: "Σ", name: "Sigma hoa", category: "greek", codePoint: "U+03A3" },
  { char: "Δ", name: "Delta hoa", category: "greek", codePoint: "U+0394" },
];

/**
 * Lọc danh sách symbol theo chuyên mục hoặc từ khóa tìm kiếm
 */
export function filterSymbols(category?: string, searchTerm?: string): SymbolItem[] {
  let list = POPULAR_SYMBOLS;

  if (category && category !== "all") {
    list = list.filter((s) => s.category === category);
  }

  if (searchTerm && searchTerm.trim()) {
    const query = searchTerm.trim().toLowerCase();
    list = list.filter(
      (s) =>
        s.char.includes(query) ||
        s.name.toLowerCase().includes(query) ||
        s.codePoint.toLowerCase().includes(query)
    );
  }

  return list;
}

/**
 * Lấy thông tin symbol theo ký tự
 */
export function getSymbolByChar(char: string): SymbolItem | undefined {
  return POPULAR_SYMBOLS.find((s) => s.char === char);
}
