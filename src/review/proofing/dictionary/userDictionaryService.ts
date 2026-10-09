/**
 * User Dictionary Service - Personal Word Editor (Phase 5.2)
 *
 * Quản lý từ điển cá nhân của người dùng, lưu trữ cục bộ qua localStorage.
 * Không phụ thuộc cloud, không gửi dữ liệu ra bên ngoài.
 */

const STORAGE_KEY = "personal_word_editor_user_dict";

export class UserDictionaryService {
  private static userWords: Set<string> = new Set();
  private static isInitialized = false;

  private static init() {
    if (this.isInitialized) return;
    this.isInitialized = true;
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        const stored = window.localStorage.getItem(STORAGE_KEY);
        if (stored) {
          const list: string[] = JSON.parse(stored);
          if (Array.isArray(list)) {
            for (const w of list) {
              if (this.validateWord(w)) {
                this.userWords.add(w.toLowerCase());
              }
            }
          }
        }
      }
    } catch {
      // Bỏ qua lỗi truy cập storage
    }
  }

  /**
   * Kiểm tra tính hợp lệ của từ trước khi lưu:
   * - Tối thiểu 2 ký tự
   * - Không chứa khoảng trắng hoặc ký tự đặc biệt phá vỡ từ
   */
  public static validateWord(word: string): boolean {
    if (!word || typeof word !== "string") return false;
    const trimmed = word.trim();
    if (trimmed.length < 2 || trimmed.length > 50) return false;
    if (/\s/.test(trimmed)) return false;
    // Không cho phép toàn dấu câu hoặc toàn số
    if (/^[0-9\p{P}]+$/u.test(trimmed)) return false;
    return true;
  }

  public static addWord(word: string): boolean {
    this.init();
    if (!this.validateWord(word)) return false;
    const lower = word.trim().toLowerCase();
    this.userWords.add(lower);
    this.save();
    return true;
  }

  public static removeWord(word: string): boolean {
    this.init();
    const lower = word.trim().toLowerCase();
    const removed = this.userWords.delete(lower);
    if (removed) this.save();
    return removed;
  }

  public static hasWord(word: string): boolean {
    this.init();
    if (!word) return false;
    return this.userWords.has(word.trim().toLowerCase());
  }

  public static getAllWords(): string[] {
    this.init();
    return Array.from(this.userWords);
  }

  public static clear(): void {
    this.userWords.clear();
    this.save();
  }

  private static save(): void {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        const list = Array.from(this.userWords);
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
      }
    } catch {
      // Bỏ qua lỗi ghi storage
    }
  }
}
