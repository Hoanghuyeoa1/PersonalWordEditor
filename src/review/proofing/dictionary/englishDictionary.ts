import type { IDictionaryProvider } from "../proofingTypes.ts";

/**
 * Thuật toán tính khoảng cách Levenshtein giữa 2 chuỗi
 */
function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  const d: number[][] = [];
  for (let i = 0; i <= m; i++) {
    d[i] = [i];
  }
  for (let j = 0; j <= n; j++) {
    d[0][j] = j;
  }

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(
        d[i - 1][j] + 1, // deletion
        d[i][j - 1] + 1, // insertion
        d[i - 1][j - 1] + cost // substitution
      );
    }
  }

  return d[m][n];
}

/**
 * Tập từ vựng tiếng Anh thông dụng mở rộng (Core English Vocabulary)
 */
const COMMON_ENGLISH_WORDS: string[] = [
  // Pronouns, prepositions, conjunctions, articles
  "the", "be", "to", "of", "and", "a", "in", "that", "have", "i", "it", "for", "not", "on", "with",
  "he", "as", "you", "do", "at", "this", "but", "his", "by", "from", "they", "we", "say", "her",
  "she", "or", "an", "will", "my", "one", "all", "would", "there", "their", "what", "so", "up",
  "out", "if", "about", "who", "get", "which", "go", "me", "when", "make", "can", "like", "time",
  "no", "just", "him", "know", "take", "people", "into", "year", "your", "good", "some", "could",
  "them", "see", "other", "than", "then", "now", "look", "only", "come", "its", "over", "think",
  "also", "back", "after", "use", "two", "how", "our", "work", "first", "well", "way", "even",
  "new", "want", "because", "any", "these", "give", "day", "most", "us", "is", "are", "was", "were",
  "been", "has", "had", "did", "does", "done", "am",

  // Contractions
  "don't", "doesn't", "can't", "won't", "it's", "that's", "we're", "they're", "i'm", "you're",
  "isn't", "aren't", "haven't", "hasn't", "hadn't", "wasn't", "weren't", "couldn't", "shouldn't",
  "wouldn't", "let's", "who's", "what's", "there's", "here's",

  // Office, Document, Editor, Typing vocabulary
  "document", "documents", "documentation", "editor", "editors", "edit", "editing", "editable",
  "word", "words", "paragraph", "paragraphs", "heading", "headings", "page", "pages", "paper",
  "size", "sizes", "margin", "margins", "preset", "presets", "orientation", "portrait", "landscape",
  "break", "breaks", "section", "sections", "header", "headers", "footer", "footers", "number",
  "numbers", "numbering", "count", "counting", "line", "lines", "spacing", "indent", "indents",
  "text", "texts", "font", "fonts", "family", "families", "color", "colors", "highlight",
  "bold", "italic", "underline", "strike", "strikethrough", "align", "alignment", "center",
  "left", "right", "justify", "bullet", "bullets", "ordered", "list", "lists", "item", "items",
  "table", "tables", "row", "rows", "column", "columns", "cell", "cells", "border", "borders",
  "shading", "merge", "split", "resize", "resizing", "width", "height", "image", "images",
  "picture", "pictures", "photo", "photos", "shape", "shapes", "rectangle", "ellipse", "circle",
  "arrow", "box", "boxes", "equation", "equations", "formula", "formulas", "math", "symbol",
  "symbols", "link", "links", "hyperlink", "hyperlinks", "url", "file", "files", "folder",
  "folders", "open", "opening", "save", "saving", "close", "closing", "new", "create", "creating",
  "export", "exporting", "import", "importing", "print", "printing", "find", "finding", "replace",
  "replacing", "undo", "redo", "history", "cut", "copy", "paste", "clipboard", "selection",
  "select", "zoom", "scale", "view", "review", "proofing", "spell", "spelling", "grammar",
  "check", "checking", "checker", "comment", "comments", "track", "tracking", "change", "changes",
  "accept", "reject", "status", "ready", "dirty", "clean", "window", "windows", "desktop",
  "personal", "system", "app", "application", "software", "tool", "tools", "help", "about",
  "setting", "settings", "option", "options", "dialog", "modal", "button", "buttons", "menu",
  "ribbon", "bar", "canvas", "sheet", "format", "formatting", "data", "source", "package",
  "builder", "reader", "writer", "service", "services", "engine", "engines", "test", "testing",
  "audit", "compatibility", "model", "models", "store", "state", "command", "commands",
  "extension", "extensions", "plugin", "plugins", "node", "nodes", "mark", "marks", "attribute",
  "attributes", "schema", "version", "metadata", "title", "author", "date", "time", "id",

  // Common Verbs & Adjectives
  "write", "written", "writing", "read", "reading", "type", "typing", "start", "starting",
  "stop", "stopping", "finish", "finished", "complete", "completed", "error", "errors", "issue",
  "issues", "problem", "problems", "fix", "fixed", "update", "updated", "delete", "deleted",
  "remove", "removed", "insert", "inserted", "add", "added", "show", "showing", "hide", "hiding",
  "clear", "clearing", "reset", "resetting", "apply", "applied", "cancel", "cancelled", "ok",
  "yes", "true", "false", "valid", "invalid", "safe", "safely", "fast", "slow", "high", "low",
  "big", "small", "long", "short", "simple", "complex", "easy", "hard", "great", "fine",
  "hello", "world", "welcome", "please", "thanks", "thank", "here", "where", "why", "again",
  "always", "never", "often", "sometimes", "already", "together", "both", "either", "neither",
  "between", "under", "above", "below", "inside", "outside", "before", "while", "during",
  "until", "since", "against", "among", "through", "across", "around", "behind", "beyond",
  "more", "less", "many", "much", "few", "several", "enough", "full", "empty", "total",
  "detail", "details", "summary", "report", "result", "results", "success", "successful",
  "failure", "failed", "pass", "passed", "fail", "warning", "info", "notice",
  "worry", "worried", "worries", "worrying", "performance", "perform", "performs", "performed",
  "performing", "visit", "visits", "visited", "visiting", "visitor", "visitors",
  "code", "codes", "coded", "coding", "coder", "coders",
  "email", "emails", "mail", "mails", "another", "repeat", "repeats", "repeated", "repeating",
  "doc", "docs", "hi", "hey", "zero", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
  "concurrent", "concurrently", "correct", "incorrect", "sentence", "sentences", "spelled"
];

export class EnglishDictionaryProvider implements IDictionaryProvider {
  public readonly language = "en-US";
  public readonly languageName = "English (United States)";

  private wordsSet: Set<string>;

  constructor() {
    this.wordsSet = new Set(COMMON_ENGLISH_WORDS.map((w) => w.toLowerCase()));
  }

  public isWordValid(word: string): boolean {
    if (!word) return false;
    const lower = word.toLowerCase();
    return this.wordsSet.has(lower);
  }

  public getSuggestions(word: string, maxSuggestions = 3): string[] {
    if (!word) return [];
    const lower = word.toLowerCase();

    // Tìm các ứng viên có khoảng cách Levenshtein <= 2
    const candidates: Array<{ candidate: string; dist: number }> = [];

    for (const dictWord of this.wordsSet) {
      // Tối ưu sơ loại theo chênh lệch độ dài
      if (Math.abs(dictWord.length - lower.length) > 2) continue;

      const dist = levenshteinDistance(lower, dictWord);
      if (dist <= 2) {
        candidates.push({ candidate: dictWord, dist });
      }
    }

    // Sắp xếp theo khoảng cách nhỏ nhất
    candidates.sort((a, b) => a.dist - b.dist);

    const topWords = candidates.slice(0, maxSuggestions).map((c) => c.candidate);

    // Bảo toàn quy tắc viết hoa nếu từ gốc viết hoa
    const isCapitalized = /^[A-Z][a-z]/.test(word);
    const isUpper = word.length > 1 && word === word.toUpperCase();

    return topWords.map((w) => {
      if (isUpper) return w.toUpperCase();
      if (isCapitalized) return w.charAt(0).toUpperCase() + w.slice(1);
      return w;
    });
  }
}
