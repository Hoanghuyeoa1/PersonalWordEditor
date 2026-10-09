import type { IDictionaryProvider } from "../proofingTypes.ts";

/**
 * Thuật toán tính khoảng cách Levenshtein cho chuỗi Unicode
 */
function levenshteinDistance(a: string, b: string): number {
  const aChars = Array.from(a);
  const bChars = Array.from(b);
  const m = aChars.length;
  const n = bChars.length;
  if (m === 0) return n;
  if (n === 0) return m;

  const d: number[][] = [];
  for (let i = 0; i <= m; i++) d[i] = [i];
  for (let j = 0; j <= n; j++) d[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = aChars[i - 1] === bChars[j - 1] ? 0 : 1;
      d[i][j] = Math.min(
        d[i - 1][j] + 1,
        d[i][j - 1] + 1,
        d[i - 1][j - 1] + cost
      );
    }
  }

  return d[m][n];
}

/**
 * Tập âm tiết / từ vựng tiếng Việt chuẩn thông dụng (Common Vietnamese Lexicon)
 */
const COMMON_VIETNAMESE_SYLLABLES: string[] = [
  // Từ nối, đại từ, giới từ, trợ từ
  "và", "hoặc", "nhưng", "mà", "nếu", "thì", "vì", "do", "bởi", "tuy", "dù", "cho",
  "là", "ở", "tại", "về", "từ", "đến", "sang", "qua", "lại", "ra", "vào", "lên", "xuống",
  "trên", "dưới", "trong", "ngoài", "trước", "sau", "giữa", "cùng", "với", "như", "bằng",
  "tôi", "bạn", "chúng", "ta", "họ", "nó", "ông", "bà", "anh", "chị", "em", "người",
  "này", "kia", "đó", "đây", "nào", "gì", "ai", "đâu", "sao", "mấy", "bao", "nhiêu",
  "đã", "đang", "sẽ", "vừa", "mới", "còn", "vẫn", "cứ", "đều", "cũng", "rất", "lắm",
  "quá", "hơn", "nhất", "không", "chưa", "chẳng", "được", "bị", "phải", "nên", "hãy",
  "đừng", "chớ", "có", "rồi", "xong", "hết", "luôn", "ngay", "liền", "chỉ", "mỗi",

  // Soạn thảo văn bản, ứng dụng, tài liệu, giao diện
  "tài", "liệu", "văn", "bản", "soạn", "thảo", "trình", "trang", "giấy", "khổ", "hướng",
  "dọc", "ngang", "lề", "chuẩn", "rộng", "hẹp", "tùy", "chỉnh", "ngắt", "phần", "mục",
  "tiêu", "đề", "đoạn", "dòng", "chữ", "từ", "ký", "tự", "khoảng", "trắng", "giãn",
  "thụt", "lề", "danh", "sách", "dấu", "chấm", "đánh", "số", "bảng", "biểu", "hàng",
  "cột", "ô", "hợp", "nhất", "tách", "viền", "màu", "nền", "hình", "ảnh", "hộp",
  "vẽ", "khối", "công", "thức", "toán", "học", "liên", "kết", "kẻ", "ký", "hiệu",
  "đặc", "biệt", "đầu", "chân", "tệp", "tin", "mở", "lưu", "đóng", "mới", "xuất",
  "nhập", "in", "tìm", "kiếm", "thay", "thế", "hoàn", "tác", "làm", "lại", "cắt",
  "sao", "chép", "dán", "chọn", "tất", "cả", "thu", "phóng", "thanh", "công", "cụ",
  "trạng", "thái", "bảo", "vệ", "thay", "đổi", "chưa", "đã", "kiểm", "tra", "chính",
  "tả", "ngữ", "pháp", "bình", "luận", "nhận", "xét", "theo", "dõi", "chấp", "nhận",
  "từ", "chối", "thống", "kê", "đếm", "lỗi", "sửa", "đổi", "gợi", "ý", "bỏ", "qua",
  "thêm", "vào", "từ", "điển", "ngôn", "ngữ", "tiếng", "việt", "anh",

  // Định dạng chữ
  "đậm", "nghiêng", "gạch", "chân", "ngang", "phông", "cỡ", "tô", "sáng", "căn",
  "trái", "phải", "đều",

  // Từ vựng đời sống, công việc, kỹ thuật thông dụng
  "công", "việc", "nhiệm", "vụ", "báo", "cáo", "kết", "quả", "thực", "hiện", "kế",
  "hoạch", "dự", "án", "phát", "triển", "phần", "mềm", "máy", "tính", "hệ", "thống",
  "thiết", "kế", "xây", "dựng", "kiểm", "thử", "đánh", "giá", "chất", "lượng", "an",
  "toàn", "dữ", "liệu", "cơ", "sở", "mạng", "thông", "tin", "liên", "lạc", "thời",
  "gian", "ngày", "tháng", "năm", "giờ", "phút", "giây", "sáng", "trưa", "chiều", "tối",
  "hôm", "nay", "qua", "mai", "tuần", "tháng", "quý", "năm", "trước", "sau", "tới",
  "chào", "mừng", "xin", "cảm", "ơn", "tạm", "biệt", "hẹn", "gặp", "tốt", "đẹp",
  "hay", "dễ", "khó", "nhanh", "chậm", "cao", "thấp", "dài", "ngắn", "lớn", "nhỏ",
  "bé", "mạnh", "yếu", "đúng", "sai", "rõ", "ràng", "hoàn", "toàn", "tuyệt", "đối"
];

export class VietnameseDictionaryProvider implements IDictionaryProvider {
  public readonly language = "vi-VN";
  public readonly languageName = "Tiếng Việt";

  private syllablesSet: Set<string>;

  constructor() {
    this.syllablesSet = new Set(COMMON_VIETNAMESE_SYLLABLES.map((s) => s.toLowerCase()));
  }

  public isWordValid(word: string): boolean {
    if (!word) return false;
    const lower = word.toLowerCase();

    // 1. Kiểm tra trực tiếp âm tiết đơn
    if (this.syllablesSet.has(lower)) {
      return true;
    }

    // 2. Nếu từ ghép có dấu gạch ngang (ví dụ: "chính-tả")
    if (lower.includes("-")) {
      const parts = lower.split("-").filter(Boolean);
      return parts.length > 0 && parts.every((p) => this.syllablesSet.has(p));
    }

    return false;
  }

  public getSuggestions(word: string, maxSuggestions = 3): string[] {
    if (!word) return [];
    const lower = word.toLowerCase();

    const candidates: Array<{ candidate: string; dist: number }> = [];

    for (const syllable of this.syllablesSet) {
      if (Math.abs(syllable.length - lower.length) > 2) continue;

      const dist = levenshteinDistance(lower, syllable);
      if (dist <= 2) {
        candidates.push({ candidate: syllable, dist });
      }
    }

    candidates.sort((a, b) => a.dist - b.dist);

    const topWords = candidates.slice(0, maxSuggestions).map((c) => c.candidate);

    const isCapitalized = /^[A-Z\p{Lu}]/u.test(word);
    const isUpper = word.length > 1 && word === word.toUpperCase();

    return topWords.map((w) => {
      if (isUpper) return w.toUpperCase();
      if (isCapitalized) return w.charAt(0).toUpperCase() + w.slice(1);
      return w;
    });
  }
}
