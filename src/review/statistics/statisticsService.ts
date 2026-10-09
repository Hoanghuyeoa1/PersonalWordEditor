import type { JSONContent } from "@tiptap/core";
import type { DocumentStatisticsData } from "../types/reviewTypes.ts";
import type { CommentItem, TrackChangeItem } from "../../document/documentTypes.ts";
import { extractDocumentStats } from "../../document/documentModel.ts";
import { TrackChangesService } from "../trackChanges/trackChangesService.ts";
import { useDocumentStore } from "../../stores/documentStore.ts";

export interface DetailedStatsOptions {
  comments?: CommentItem[];
  trackedChanges?: TrackChangeItem[];
  spellingIssues?: number;
  grammarIssues?: number;
  selectedText?: string;
}

/**
 * Statistics Service - Personal Word Editor (Phase 5.7 Architecture)
 *
 * Tính toán thống kê định lượng chi tiết của tài liệu từ ProseMirror AST:
 * - Số từ (Words)
 * - Số ký tự không tính khoảng trắng (Characters no spaces)
 * - Số ký tự tính cả khoảng trắng (Characters with spaces)
 * - Số đoạn văn (Paragraphs)
 * - Số trang thực tế (Pages - từ Page Engine vật lý, không làm tròn giả lập)
 * - Số dòng ước tính (Lines)
 * - Tiêu đề (Headings), Bảng (Tables), Hình ảnh (Images)
 * - Thống kê kiểm duyệt (Review Summary: Lỗi chính tả, Ngữ pháp, Bình luận, Thay đổi theo dõi)
 * - Thống kê vùng chọn (Selection Statistics: Từ & Ký tự đang bôi đen)
 *
 * Tái sử dụng extractDocumentStats - Tuyệt đối không duplicate word-count logic.
 */
export class StatisticsService {
  /** Cache memoize thống kê chi tiết theo AST node và pageCount để tối ưu hóa hiệu năng */
  private static detailedCache = new WeakMap<
    JSONContent,
    { stats: DocumentStatisticsData; pageCount: number }
  >();

  /**
   * Tính toán thống kê cho một chuỗi văn bản thuần túy (dùng cho Selection Statistics)
   */
  public static calculateTextStats(text: string): {
    words: number;
    characters: number;
    charactersNoSpaces: number;
  } {
    if (!text) {
      return { words: 0, characters: 0, charactersNoSpaces: 0 };
    }
    const characters = text.length;
    const charactersNoSpaces = text.replace(/\s/g, "").length;
    const trimmed = text.trim();
    const words = trimmed ? trimmed.split(/\s+/).filter(Boolean).length : 0;
    return { words, characters, charactersNoSpaces };
  }

  /**
   * Tính toán thống kê đầy đủ từ JSONContent và số trang vật lý hiện tại
   */
  public static calculateDetailedStats(
    content: JSONContent | undefined | null,
    pageCount = 1,
    options?: DetailedStatsOptions
  ): DocumentStatisticsData {
    if (!content) {
      return {
        words: 0,
        characters: 0,
        charactersNoSpaces: 0,
        paragraphs: 0,
        pages: Math.max(1, pageCount),
        lines: 0,
      };
    }

    const safePageCount = Math.max(1, pageCount);

    // Kiểm tra cache nếu không có options tùy biến ngoài
    const isStandardQuery = !options || Object.keys(options).length === 0;
    if (isStandardQuery) {
      const cached = this.detailedCache.get(content);
      if (cached && cached.pageCount === safePageCount) {
        return cached.stats;
      }
    }

    // Tái sử dụng duy nhất một nguồn extractDocumentStats trong documentModel.ts
    const baseStats = extractDocumentStats(content);

    // Ước tính số dòng: trung bình khoảng 65 ký tự / dòng (chuẩn trang giấy Word) hoặc tối thiểu bằng số đoạn văn
    const estimatedLines = Math.max(
      baseStats.paragraphs,
      Math.ceil(baseStats.characters / 65) || (baseStats.characters > 0 ? 1 : 0)
    );

    // Xử lý Review Summary (Bình luận, Thay đổi theo dõi, Kiểm lỗi)
    let commentsList: CommentItem[] = [];
    if (options?.comments) {
      commentsList = options.comments;
    } else {
      try {
        commentsList = useDocumentStore.getState().comments || [];
      } catch {
        commentsList = [];
      }
    }

    const comments = commentsList.length;
    const unresolvedComments = commentsList.filter((c) => !c.resolved).length;

    let changesList: TrackChangeItem[] = [];
    if (options?.trackedChanges) {
      changesList = options.trackedChanges;
    } else {
      try {
        const storeChanges = useDocumentStore.getState().trackedChanges;
        if (storeChanges && storeChanges.length > 0) {
          changesList = storeChanges;
        } else {
          changesList = TrackChangesService.getTrackedChangesFromDoc(content);
        }
      } catch {
        changesList = TrackChangesService.getTrackedChangesFromDoc(content);
      }
    }

    const trackedChanges = changesList.length;
    const trackedInsertions = changesList.filter(
      (c) => c.type === "insert" || (c.type as string) === "insertion"
    ).length;
    const trackedDeletions = changesList.filter(
      (c) => c.type === "delete" || (c.type as string) === "deletion"
    ).length;

    const spellingIssues = options?.spellingIssues ?? 0;
    const grammarIssues = options?.grammarIssues ?? 0;

    // Xử lý Thống kê vùng chọn (Selection Statistics) nếu có văn bản được chọn
    let selectedWords: number | undefined;
    let selectedCharacters: number | undefined;
    let selectedCharactersNoSpaces: number | undefined;

    if (options?.selectedText) {
      const selStats = this.calculateTextStats(options.selectedText);
      selectedWords = selStats.words;
      selectedCharacters = selStats.characters;
      selectedCharactersNoSpaces = selStats.charactersNoSpaces;
    }

    const result: DocumentStatisticsData = {
      words: baseStats.words,
      characters: baseStats.characters,
      charactersNoSpaces: baseStats.charactersNoSpaces ?? baseStats.characters,
      paragraphs: baseStats.paragraphs,
      pages: safePageCount,
      lines: estimatedLines,
      headings: baseStats.headings ?? 0,
      tables: baseStats.tables ?? 0,
      images: baseStats.images ?? 0,
      comments,
      unresolvedComments,
      trackedChanges,
      trackedInsertions,
      trackedDeletions,
      spellingIssues,
      grammarIssues,
      selectedWords,
      selectedCharacters,
      selectedCharactersNoSpaces,
    };

    if (isStandardQuery) {
      this.detailedCache.set(content, { stats: result, pageCount: safePageCount });
    }

    return result;
  }
}
