import type { Editor } from "@tiptap/core";

export interface UrlValidationResult {
  isValid: boolean;
  normalizedUrl: string;
  error?: string;
}

export interface ActiveLinkInfo {
  from: number;
  to: number;
  text: string;
  href: string;
}

/**
 * Kiểm tra tính hợp lệ và chuẩn hóa địa chỉ URL.
 * Hỗ trợ các giao thức: https://, http://, mailto:
 * Tự động chuẩn hóa địa chỉ thông dụng (ví dụ: google.com -> https://google.com)
 * Không bao giờ gây crash ứng dụng nếu URL bị hỏng hoặc nhập ký tự lạ.
 */
export function validateAndNormalizeUrl(rawUrl: string): UrlValidationResult {
  const trimmed = (rawUrl || "").trim();
  if (!trimmed) {
    return {
      isValid: false,
      normalizedUrl: "",
      error: "Địa chỉ liên kết không được để trống.",
    };
  }

  // 1. Xử lý mailto: hoặc địa chỉ email thuần túy
  if (/^mailto:/i.test(trimmed)) {
    const email = trimmed.replace(/^mailto:/i, "").trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return {
        isValid: false,
        normalizedUrl: trimmed,
        error: "Địa chỉ email không hợp lệ (ví dụ: name@example.com).",
      };
    }
    return {
      isValid: true,
      normalizedUrl: `mailto:${email}`,
    };
  }

  // Tự động nhận diện email không có tiền tố mailto:
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    return {
      isValid: true,
      normalizedUrl: `mailto:${trimmed}`,
    };
  }

  // 2. Xử lý web URL (http / https)
  let urlToTest = trimmed;
  if (!/^[a-zA-Z][a-zA-Z\d+\-.]*:/i.test(trimmed)) {
    // Không có scheme (ví dụ: "example.com" hoặc "vnexpress.net")
    urlToTest = `https://${trimmed}`;
  }

  try {
    const parsed = new URL(urlToTest);
    const protocol = parsed.protocol.toLowerCase();

    if (protocol !== "http:" && protocol !== "https:") {
      return {
        isValid: false,
        normalizedUrl: trimmed,
        error: "Giao thức không được hỗ trợ. Vui lòng sử dụng https://, http:// hoặc mailto:.",
      };
    }

    if (!parsed.hostname || parsed.hostname.length < 3) {
      return {
        isValid: false,
        normalizedUrl: trimmed,
        error: "Tên miền (hostname) không hợp lệ.",
      };
    }

    return {
      isValid: true,
      normalizedUrl: parsed.toString(),
    };
  } catch {
    return {
      isValid: false,
      normalizedUrl: trimmed,
      error: "Địa chỉ URL không đúng định dạng chuẩn.",
    };
  }
}

/**
 * Lấy văn bản đang được bôi đen (selection) trong editor.
 */
export function getSelectedText(editor: Editor | null): string {
  if (!editor || !editor.state) return "";
  const { from, to } = editor.state.selection;
  if (from === to) return "";
  return editor.state.doc.textBetween(from, to, " ");
}

/**
 * Trích xuất thông tin liên kết đang được chọn hoặc tại vị trí con trỏ hiện tại.
 */
export function getActiveLinkInfo(editor: Editor | null): ActiveLinkInfo | null {
  if (!editor || !editor.state) return null;
  if (!editor.isActive("link")) return null;

  const { state } = editor;
  const { from, to } = state.selection;
  const href = (editor.getAttributes("link").href as string) || "";

  if (from !== to) {
    const text = state.doc.textBetween(from, to, " ");
    return { from, to, text, href };
  }

  // Trường hợp con trỏ nhấp nháy bên trong link (selection rỗng)
  const resolvedPos = state.doc.resolve(from);
  let linkStart = from;
  let linkEnd = to;
  const start = resolvedPos.start();

  resolvedPos.parent.forEach((child, childOffset) => {
    const hasLink = child.marks.some((m) => m.type.name === "link");
    if (
      hasLink &&
      childOffset <= resolvedPos.parentOffset &&
      resolvedPos.parentOffset <= childOffset + child.nodeSize
    ) {
      linkStart = start + childOffset;
      linkEnd = linkStart + child.nodeSize;
    }
  });

  const text = state.doc.textBetween(linkStart, linkEnd, " ");
  return { from: linkStart, to: linkEnd, text, href };
}
