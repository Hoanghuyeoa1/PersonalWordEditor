import type {
  SupportedFieldType,
  FieldAttributes,
  FieldResolutionContext,
} from "../types/fieldTypes.ts";

const KNOWN_FIELD_TYPES: ReadonlySet<SupportedFieldType> = new Set([
  "PAGE",
  "NUMPAGES",
  "DATE",
  "TIME",
  "TITLE",
  "AUTHOR",
  "SECTION",
  "SECTIONPAGES",
  "REF",
  "PAGEREF",
]);

/**
 * Phân tích chuỗi chỉ thị trường (Field Instruction) thành cấu trúc FieldAttributes
 */
export function parseFieldInstruction(
  rawInstruction: string,
  cachedResult: string = ""
): FieldAttributes {
  const trimmed = (rawInstruction || "").trim();
  if (!trimmed) {
    return {
      fieldType: "UNKNOWN",
      instruction: "",
      result: cachedResult,
      rawInstruction: "",
    };
  }

  // Tách token đầu tiên (tên loại trường)
  const tokens = trimmed.split(/\s+/);
  const firstToken = (tokens[0] || "").toUpperCase() as SupportedFieldType;

  const isKnown = KNOWN_FIELD_TYPES.has(firstToken);
  const fieldType: SupportedFieldType = isKnown ? firstToken : "UNKNOWN";

  // Trích xuất các switches (bắt đầu bằng dấu \)
  const switches: string[] = [];
  const switchRegex = /\\[*#@a-zA-Z0-9]+(?:\s+(?:"[^"]*"|[^\s\\]+))?/g;
  let match: RegExpExecArray | null;
  while ((match = switchRegex.exec(trimmed)) !== null) {
    switches.push(match[0].trim());
  }

  // Trích xuất argument (các token đứng sau tên trường và trước switch đầu tiên)
  let argument: string | undefined = undefined;
  const firstSwitchIndex = tokens.findIndex((t, idx) => idx > 0 && t.startsWith("\\"));
  const argTokens = firstSwitchIndex > 0
    ? tokens.slice(1, firstSwitchIndex)
    : tokens.slice(1);

  if (argTokens.length > 0) {
    const rawArg = argTokens.join(" ").replace(/^["']|["']$/g, "").trim();
    if (rawArg) {
      argument = rawArg;
    }
  }

  // Chuẩn hóa instruction
  const normalizedInstruction = trimmed;

  return {
    fieldType,
    instruction: normalizedInstruction,
    argument,
    switches: switches.length > 0 ? switches : undefined,
    result: cachedResult,
    rawInstruction: trimmed,
  };
}

/**
 * Định dạng một ngày Date theo format cơ bản
 */
function formatDate(d: Date, formatSwitch?: string): string {
  if (formatSwitch && formatSwitch.includes("yyyy-MM-dd")) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }
  if (formatSwitch && formatSwitch.includes("dd/MM/yyyy")) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${day}/${m}/${y}`;
  }
  // Mặc định chuẩn định dạng ngày tháng
  const day = String(d.getDate()).padStart(2, "0");
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const y = d.getFullYear();
  return `${day}/${m}/${y}`;
}

/**
 * Định dạng thời gian Time
 */
function formatTime(d: Date, formatSwitch?: string): string {
  if (formatSwitch && formatSwitch.includes("HH:mm:ss")) {
    const h = String(d.getHours()).padStart(2, "0");
    const min = String(d.getMinutes()).padStart(2, "0");
    const s = String(d.getSeconds()).padStart(2, "0");
    return `${h}:${min}:${s}`;
  }
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${min}`;
}

/**
 * Giải quyết và tính toán giá trị động (Dynamic Evaluation) của Field theo ngữ cảnh thực tế
 */
export function resolveFieldValue(
  attrs: FieldAttributes,
  ctx?: FieldResolutionContext
): string {
  const now = ctx?.now || new Date();

  switch (attrs.fieldType) {
    case "PAGE":
      return String(ctx?.pageNumber !== undefined ? ctx.pageNumber : attrs.result || "1");

    case "NUMPAGES":
      return String(ctx?.pageCount !== undefined ? ctx.pageCount : attrs.result || "1");

    case "DATE": {
      const formatSw = attrs.switches?.find((s) => s.startsWith("\\@"));
      if (ctx?.createdAt) {
        const parsed = new Date(ctx.createdAt);
        if (!isNaN(parsed.getTime())) {
          return formatDate(parsed, formatSw);
        }
      }
      return formatDate(now, formatSw);
    }

    case "TIME": {
      const formatSw = attrs.switches?.find((s) => s.startsWith("\\@"));
      return formatTime(now, formatSw);
    }

    case "TITLE":
      return ctx?.documentTitle || attrs.result || "Tài liệu DOCX";

    case "AUTHOR":
      return ctx?.documentAuthor || attrs.result || "Người dùng";

    case "SECTION":
      return String(
        ctx?.sectionIndex !== undefined ? ctx.sectionIndex + 1 : attrs.result || "1"
      );

    case "SECTIONPAGES":
      return String(
        ctx?.sectionPageCount !== undefined
          ? ctx.sectionPageCount
          : ctx?.pageCount !== undefined
          ? ctx.pageCount
          : attrs.result || "1"
      );

    case "REF": {
      if (attrs.argument && ctx?.bookmarks?.has(attrs.argument)) {
        const bm = ctx.bookmarks.get(attrs.argument)!;
        return bm.text || attrs.result || "[Reference]";
      }
      return attrs.result || "[Reference not found]";
    }

    case "PAGEREF": {
      if (attrs.argument && ctx?.bookmarks?.has(attrs.argument)) {
        const bm = ctx.bookmarks.get(attrs.argument)!;
        return String(bm.pageNumber !== undefined ? bm.pageNumber : attrs.result || "1");
      }
      return attrs.result || "1";
    }

    case "UNKNOWN":
    default:
      // An toàn: giữ nguyên kết quả hiển thị đã lưu, không làm hỏng tài liệu
      return attrs.result || "";
  }
}

/**
 * Xây dựng chuỗi XML cho chỉ thị trường (dùng cho w:instr hoặc w:instrText)
 */
export function formatFieldInstruction(attrs: FieldAttributes): string {
  if (attrs.rawInstruction && attrs.rawInstruction.trim()) {
    return attrs.rawInstruction.trim();
  }
  if (attrs.instruction && attrs.instruction.trim() && (attrs.fieldType === "UNKNOWN" || attrs.instruction !== attrs.fieldType)) {
    return attrs.instruction.trim();
  }
  let res = attrs.fieldType;
  if (attrs.argument) {
    res += ` ${attrs.argument}`;
  }
  if (attrs.switches && attrs.switches.length > 0) {
    res += ` ${attrs.switches.join(" ")}`;
  }
  return res;
}
