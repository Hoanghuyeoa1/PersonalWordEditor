import type { GrammarIssue, GrammarRule } from "../proofingTypes.ts";

/**
 * Danh sách định nghĩa các quy tắc ngữ pháp cục bộ cơ bản (Local Grammar Rules)
 * Tiêu chí cốt lõi: Precision > Số lượng rule (Độ chính xác cao, không tạo false positives).
 */
export const LOCAL_GRAMMAR_RULES: GrammarRule[] = [
  {
    id: "double-spaces",
    name: "Khoảng trắng thừa",
    description: "Phát hiện hai hoặc nhiều khoảng trắng liên tiếp trong văn bản.",
    severity: "warning",
    enabled: true,
  },
  {
    id: "space-before-punctuation",
    name: "Khoảng trắng trước dấu câu",
    description: "Dấu câu không nên có khoảng trắng ở phía trước.",
    severity: "warning",
    enabled: true,
  },
  {
    id: "missing-space-after-punctuation",
    name: "Thiếu khoảng trắng sau dấu câu",
    description: "Cần có khoảng trắng sau dấu câu trước khi bắt đầu từ tiếp theo.",
    severity: "warning",
    enabled: true,
  },
  {
    id: "repeated-word",
    name: "Từ lặp lại",
    description: "Phát hiện từ ngữ bị gõ lặp lại hai lần liên tiếp.",
    severity: "warning",
    enabled: true,
  },
  {
    id: "capitalization",
    name: "Viết hoa đầu câu",
    description: "Chữ cái đầu câu mới sau dấu chấm hoặc ngắt câu nên được viết hoa.",
    severity: "info",
    enabled: true,
  },
  {
    id: "double-period",
    name: "Dấu chấm đôi bất thường",
    description: "Phát hiện hai dấu chấm liền kề không phải là dấu chấm lửng (...).",
    severity: "warning",
    enabled: true,
  },
];

/**
 * Regex bảo vệ để nhận diện các vùng không được coi là lỗi dấu câu (URL, email, số thập phân, tên file, v.v.)
 */
const EXCLUDED_URL_EMAIL_REGEX =
  /(?:https?:\/\/[^\s]+|www\.[^\s]+|[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi;

const EXCLUDED_FLOAT_OR_VERSION_REGEX = /\b[a-zA-Z]*\d+[\.,]\d+[a-zA-Z0-9]*\b/g;

const EXCLUDED_FILE_EXTENSION_REGEX =
  /\b[a-zA-Z0-9_-]+\.(?:mwd|docx|doc|pdf|txt|png|jpg|jpeg|gif|svg|ts|tsx|js|jsx|json|html|css|rs|c|cpp|py|xml)\b/gi;

/**
 * Danh sách chữ viết tắt phổ biến không đánh dấu kết thúc câu
 */
const COMMON_ABBREVIATIONS = new Set([
  "e.g.", "i.e.", "etc.", "vs.", "mr.", "mrs.", "ms.", "dr.", "prof.", "sr.", "jr.",
  "th.s", "ts.", "tp.", "ks.", "gs.", "st."
]);

export interface TextRange {
  start: number;
  end: number;
}

/**
 * Trích xuất các dải ký tự được bảo vệ (không áp dụng grammar rules)
 */
export function getProtectedRanges(text: string): TextRange[] {
  const ranges: TextRange[] = [];

  const collect = (regex: RegExp) => {
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      ranges.push({
        start: match.index,
        end: match.index + match[0].length,
      });
    }
  };

  collect(EXCLUDED_URL_EMAIL_REGEX);
  collect(EXCLUDED_FLOAT_OR_VERSION_REGEX);
  collect(EXCLUDED_FILE_EXTENSION_REGEX);

  return ranges;
}

function isInsideProtectedRange(start: number, end: number, protectedRanges: TextRange[]): boolean {
  return protectedRanges.some((r) => !(end <= r.start || start >= r.end));
}

/**
 * Rule 1: Khoảng trắng thừa (double-spaces)
 */
export function checkDoubleSpaces(
  text: string,
  blockPos: number,
  protectedRanges: TextRange[]
): GrammarIssue[] {
  const issues: GrammarIssue[] = [];
  const regex = / {2,}/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    const start = match.index;
    const end = start + match[0].length;

    if (isInsideProtectedRange(start, end, protectedRanges)) {
      continue;
    }

    const from = blockPos + 1 + start;
    const to = blockPos + 1 + end;

    issues.push({
      id: `grammar-doublespace-${from}-${to}`,
      type: "grammar",
      from,
      to,
      ruleId: "double-spaces",
      ruleName: "Khoảng trắng thừa",
      matchedText: match[0],
      message: "Có quá nhiều khoảng trắng liên tiếp. Nên dùng một khoảng trắng đơn.",
      suggestions: [" "],
      severity: "warning",
    });
  }

  return issues;
}

/**
 * Rule 2: Khoảng trắng trước dấu câu (space-before-punctuation)
 */
export function checkSpaceBeforePunctuation(
  text: string,
  blockPos: number,
  protectedRanges: TextRange[]
): GrammarIssue[] {
  const issues: GrammarIssue[] = [];
  // Bắt khoảng trắng trước , ; : ! ? . (nhưng không match ellipsis ...)
  const regex = / +([,;:\.!\?])/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    const start = match.index;
    const punct = match[1];
    const end = start + match[0].length;

    if (isInsideProtectedRange(start, end, protectedRanges)) {
      continue;
    }

    // Nếu dấu chấm là một phần của ellipsis "...", bỏ qua
    if (punct === ".") {
      const nextSlice = text.slice(end - 1, end + 3);
      const prevSlice = text.slice(Math.max(0, start - 2), start);
      if (nextSlice.startsWith("...") || prevSlice.endsWith("..")) {
        continue;
      }
    }

    const from = blockPos + 1 + start;
    const to = blockPos + 1 + end;

    issues.push({
      id: `grammar-spacebefore-${from}-${to}`,
      type: "grammar",
      from,
      to,
      ruleId: "space-before-punctuation",
      ruleName: "Khoảng trắng trước dấu câu",
      matchedText: match[0],
      message: `Dấu câu "${punct}" không nên có khoảng trắng ở phía trước.`,
      suggestions: [punct],
      severity: "warning",
    });
  }

  return issues;
}

/**
 * Rule 3: Thiếu khoảng trắng sau dấu câu (missing-space-after-punctuation)
 */
export function checkMissingSpaceAfterPunctuation(
  text: string,
  blockPos: number,
  protectedRanges: TextRange[]
): GrammarIssue[] {
  const issues: GrammarIssue[] = [];
  // Bắt dấu câu , ; : ! ? và . theo sau trực tiếp bởi chữ cái Unicode
  const regex = /([,;:\.!\?])([\p{L}\p{M}])/gu;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    const punct = match[1];
    const letter = match[2];
    const start = match.index;
    const end = start + match[0].length;

    if (isInsideProtectedRange(start, end, protectedRanges)) {
      continue;
    }

    // Nếu dấu chấm thuộc về chữ viết tắt quen thuộc
    if (punct === ".") {
      const precedingSlice = text.substring(Math.max(0, start - 5), end).toLowerCase();
      if ([...COMMON_ABBREVIATIONS].some((abbr) => precedingSlice.includes(abbr))) {
        continue;
      }
      // Dấu chấm lửng
      if (text.substring(Math.max(0, start - 2), start + 3).includes("...")) {
        continue;
      }
    }

    const from = blockPos + 1 + start;
    const to = blockPos + 1 + end;

    issues.push({
      id: `grammar-missingspace-${from}-${to}`,
      type: "grammar",
      from,
      to,
      ruleId: "missing-space-after-punctuation",
      ruleName: "Thiếu khoảng trắng sau dấu câu",
      matchedText: match[0],
      message: `Cần có khoảng trắng sau dấu "${punct}".`,
      suggestions: [`${punct} ${letter}`],
      severity: "warning",
    });
  }

  return issues;
}

/**
 * Rule 4: Từ lặp lại (repeated-word)
 */
export function checkRepeatedWord(
  text: string,
  blockPos: number,
  protectedRanges: TextRange[]
): GrammarIssue[] {
  const issues: GrammarIssue[] = [];
  const wordRegex = /[\p{L}\p{M}]+/gu;
  let match: RegExpExecArray | null;
  let prevWord: string | null = null;
  let prevStart = -1;
  let prevEnd = -1;

  while ((match = wordRegex.exec(text)) !== null) {
    const currentWord = match[0];
    const currentStart = match.index;
    const currentEnd = currentStart + currentWord.length;

    if (isInsideProtectedRange(currentStart, currentEnd, protectedRanges)) {
      prevWord = null;
      continue;
    }

    if (prevWord !== null && prevEnd !== -1) {
      // Khoảng giữa 2 từ phải là khoảng trắng đơn hoặc khoảng trắng
      const between = text.slice(prevEnd, currentStart);
      if (/^\s+$/.test(between) && prevWord.toLowerCase() === currentWord.toLowerCase()) {
        // Bỏ qua nếu từ chỉ có 1 ký tự
        if (currentWord.length > 1) {
          const from = blockPos + 1 + prevStart;
          const to = blockPos + 1 + currentEnd;

          issues.push({
            id: `grammar-repeated-${from}-${to}-${currentWord.toLowerCase()}`,
            type: "grammar",
            from,
            to,
            ruleId: "repeated-word",
            ruleName: "Từ lặp lại",
            matchedText: text.slice(prevStart, currentEnd),
            word: currentWord,
            message: `Từ "${currentWord}" bị lặp lại hai lần liên tiếp.`,
            suggestions: [currentWord],
            severity: "warning",
          });
        }
      }
    }

    prevWord = currentWord;
    prevStart = currentStart;
    prevEnd = currentEnd;
  }

  return issues;
}

/**
 * Rule 5: Viết hoa đầu câu (capitalization)
 */
export function checkCapitalization(
  text: string,
  blockPos: number,
  protectedRanges: TextRange[]
): GrammarIssue[] {
  const issues: GrammarIssue[] = [];
  // Bắt dấu kết thúc câu (. ! ?) theo sau bởi khoảng trắng và một chữ cái thường
  const regex = /([\.!\?])\s+([\p{Ll}\p{M}])/gu;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    const punct = match[1];
    const letter = match[2];
    const start = match.index;
    const end = start + match[0].length;

    if (isInsideProtectedRange(start, end, protectedRanges)) {
      continue;
    }

    // Bỏ qua nếu đứng sau chữ viết tắt (e.g., etc., dr.)
    if (punct === ".") {
      const precedingSlice = text.substring(Math.max(0, start - 6), start + 1).toLowerCase();
      if ([...COMMON_ABBREVIATIONS].some((abbr) => precedingSlice.endsWith(abbr))) {
        continue;
      }
      // Bỏ qua nếu dấu chấm là một phần của ellipsis "..."
      if (start >= 2 && text.substring(start - 2, start + 1) === "...") {
        continue;
      }
    }

    // Chỉ đánh dấu từ ký tự bắt đầu của chữ thường
    const letterIndex = match.index + match[0].length - letter.length;
    const from = blockPos + 1 + letterIndex;
    const to = blockPos + 1 + letterIndex + letter.length;
    const capitalized = letter.toUpperCase();

    issues.push({
      id: `grammar-capitalization-${from}-${to}`,
      type: "grammar",
      from,
      to,
      ruleId: "capitalization",
      ruleName: "Viết hoa đầu câu",
      matchedText: letter,
      message: "Chữ cái đầu câu nên được viết hoa sau dấu kết câu.",
      suggestions: [capitalized],
      severity: "info",
    });
  }

  return issues;
}

/**
 * Rule 6: Dấu chấm đôi bất thường (double-period)
 */
export function checkDoublePeriod(
  text: string,
  blockPos: number,
  protectedRanges: TextRange[]
): GrammarIssue[] {
  const issues: GrammarIssue[] = [];
  // Bắt chính xác hai dấu chấm .. không liền kề dấu chấm thứ 3
  const regex = /(?<!\.)\.\.(?!\.)/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    const start = match.index;
    const end = start + match[0].length;

    if (isInsideProtectedRange(start, end, protectedRanges)) {
      continue;
    }

    const from = blockPos + 1 + start;
    const to = blockPos + 1 + end;

    issues.push({
      id: `grammar-doubleperiod-${from}-${to}`,
      type: "grammar",
      from,
      to,
      ruleId: "double-period",
      ruleName: "Dấu chấm đôi bất thường",
      matchedText: match[0],
      message: "Phát hiện hai dấu chấm liền kề. Hãy dùng một dấu chấm hoặc ba dấu chấm (...) nếu là dấu chấm lửng.",
      suggestions: [".", "..."],
      severity: "warning",
    });
  }

  return issues;
}
