import type {
  EditorCommandDescriptor,
  CommandSearchOptions,
  CommandExecutionContext,
} from "./types.ts";

/**
 * Chuẩn hóa chuỗi tìm kiếm:
 * - Chuyển chữ thường
 * - Loại bỏ dấu tiếng Việt (Accents / Diacritics)
 * - Cắt khoảng trắng thừa
 */
export function normalizeSearchText(str: string): string {
  if (!str) return "";
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "d")
    .trim();
}

/**
 * CommandRegistry - Unified Command Registry cho Personal Word Editor (Phase 7.1)
 *
 * Quản lý tập trung toàn bộ command descriptors trong ứng dụng.
 * Dùng chung duy nhất cho:
 * 1. Command Palette (Ctrl+Shift+P)
 * 2. Slash Commands (/)
 * 3. Ribbon / Toolbar Shortcuts
 *
 * Tuyệt đối không duplicate business logic hay tạo command registry thứ hai.
 */
export class CommandRegistry {
  private commands = new Map<string, EditorCommandDescriptor>();

  /**
   * Đăng ký một command descriptor vào Registry.
   * Đảm bảo id là duy nhất (Unique ID validation).
   */
  register(descriptor: EditorCommandDescriptor): void {
    if (!descriptor.id) {
      throw new Error("Command descriptor id không được để trống.");
    }
    if (this.commands.has(descriptor.id)) {
      throw new Error(`Command id "${descriptor.id}" đã được đăng ký trước đó. ID phải là duy nhất.`);
    }
    this.commands.set(descriptor.id, descriptor);
  }

  /**
   * Đăng ký hàng loạt descriptors
   */
  registerAll(descriptors: EditorCommandDescriptor[]): void {
    for (const desc of descriptors) {
      this.register(desc);
    }
  }

  /**
   * Lấy command theo id
   */
  get(id: string): EditorCommandDescriptor | undefined {
    return this.commands.get(id);
  }

  /**
   * Lấy tất cả commands đã đăng ký
   */
  getAll(): EditorCommandDescriptor[] {
    return Array.from(this.commands.values());
  }

  /**
   * Lấy danh sách lệnh hỗ trợ Command Palette
   */
  getPaletteCommands(ctx?: CommandExecutionContext): EditorCommandDescriptor[] {
    const list = this.getAll().filter((cmd) => cmd.paletteEnabled !== false);
    if (!ctx) return list;
    return list;
  }

  /**
   * Lấy danh sách lệnh hỗ trợ Slash Command
   */
  getSlashCommands(ctx?: CommandExecutionContext): EditorCommandDescriptor[] {
    const list = this.getAll().filter((cmd) => cmd.slashEnabled === true);
    if (!ctx) return list;
    return list;
  }

  /**
   * Tìm kiếm lệnh theo truy vấn người dùng (hỗ trợ tiếng Việt không dấu & tiếng Anh)
   */
  search(query: string, options: CommandSearchOptions = {}): EditorCommandDescriptor[] {
    const trimmed = query.trim();
    const normalizedQuery = normalizeSearchText(trimmed);

    // Lọc danh sách ban đầu theo options
    let pool = this.getAll();
    if (options.slashOnly) {
      pool = pool.filter((cmd) => cmd.slashEnabled === true);
    } else if (options.paletteOnly) {
      pool = pool.filter((cmd) => cmd.paletteEnabled !== false);
    }

    if (options.category) {
      pool = pool.filter((cmd) => cmd.category === options.category);
    }

    // Nếu query rỗng, trả về toàn bộ danh sách pool
    if (!normalizedQuery) {
      return pool;
    }

    // Tính điểm phù hợp (relevance score) cho từng command
    const scored: { cmd: EditorCommandDescriptor; score: number }[] = [];

    for (const cmd of pool) {
      const normLabel = normalizeSearchText(cmd.label);
      const normLabelEn = cmd.labelEn ? normalizeSearchText(cmd.labelEn) : "";
      const normDesc = cmd.description ? normalizeSearchText(cmd.description) : "";
      const normCategory = normalizeSearchText(cmd.category);
      const normKeywords = (cmd.keywords || []).map((k) => normalizeSearchText(k));

      let score = 0;

      // 1. Khớp chính xác label
      if (normLabel === normalizedQuery || normLabelEn === normalizedQuery) {
        score += 100;
      }
      // 2. Bắt đầu bằng query (Prefix match) trên label
      else if (normLabel.startsWith(normalizedQuery) || normLabelEn.startsWith(normalizedQuery)) {
        score += 60;
      }
      // 3. Khớp một từ trong label
      else if (
        normLabel.split(/\s+/).some((w) => w.startsWith(normalizedQuery)) ||
        normLabelEn.split(/\s+/).some((w) => w.startsWith(normalizedQuery))
      ) {
        score += 45;
      }
      // 4. Chứa query trong label
      else if (normLabel.includes(normalizedQuery) || normLabelEn.includes(normalizedQuery)) {
        score += 30;
      }

      // 5. Khớp từ khóa (Keywords)
      for (const kw of normKeywords) {
        if (kw === normalizedQuery) {
          score += 50;
        } else if (kw.startsWith(normalizedQuery)) {
          score += 35;
        } else if (kw.includes(normalizedQuery)) {
          score += 20;
        }
      }

      // 6. Khớp mô tả (Description)
      if (normDesc.includes(normalizedQuery)) {
        score += 10;
      }

      // 7. Khớp danh mục (Category)
      if (normCategory.startsWith(normalizedQuery)) {
        score += 8;
      }

      if (score > 0) {
        scored.push({ cmd, score });
      }
    }

    // Sắp xếp giảm dần theo điểm số
    scored.sort((a, b) => b.score - a.score);

    return scored.map((item) => item.cmd);
  }

  /**
   * Xóa toàn bộ commands (dùng cho testing hoặc reset)
   */
  clear(): void {
    this.commands.clear();
  }
}

/**
 * Registry Singleton dùng chung cho toàn bộ ứng dụng
 */
export const commandRegistry = new CommandRegistry();
