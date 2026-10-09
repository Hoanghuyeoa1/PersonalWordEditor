import type { JSONContent } from "@tiptap/core";
import type {
  ReferenceAnchor,
  ReferenceTargetType,
  SemanticReferenceId,
} from "../types/referencesTypes.ts";

/**
 * Reference Anchor Service - Personal Word Editor (Phase 6.1 Architecture)
 *
 * Quản lý cơ chế định danh và neo tham chiếu ngữ nghĩa (Semantic Anchor Foundation):
 * - Đảm bảo ID duy nhất, bền vững qua Save / Open / Serialization.
 * - Không phụ thuộc vào vị trí DOM tạm thời hay chỉ số mảng nhất thời.
 * - Chuẩn hóa định dạng định danh cho Heading, Footnote, Endnote, Caption, Citation, Bookmark.
 * - Làm nền móng vững chắc cho Cross-reference và Table of Contents ở các phase tiếp theo.
 */

const ANCHOR_ID_REGEX = /^ref_(heading|caption|footnote|endnote|citation|bookmark)_[a-zA-Z0-9_-]+$/;

export class ReferenceAnchorService {
  /**
   * Sinh mã định danh neo tham chiếu ngữ nghĩa duy nhất và ổn định
   * Định dạng chuẩn: ref_<targetType>_<uuid/hash>
   */
  static generateAnchorId(type: ReferenceTargetType, customSeed?: string): string {
    if (customSeed && customSeed.trim()) {
      // Làm sạch seed thành chuỗi an toàn chỉ chứa chữ, số, gạch nối
      const sanitized = customSeed
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "") // Bỏ dấu tiếng Việt
        .replace(/[^a-z0-9_-]/g, "_")
        .replace(/_+/g, "_")
        .substring(0, 32);

      const randomSuffix = Math.random().toString(36).substring(2, 8);
      return `ref_${type}_${sanitized || "item"}_${randomSuffix}`;
    }

    // Sinh UUID an toàn
    let randomPart: string;
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      randomPart = crypto.randomUUID().replace(/-/g, "").substring(0, 16);
    } else {
      randomPart = Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
    }

    return `ref_${type}_${randomPart}`;
  }

  /**
   * Kiểm tra định dạng ID tham chiếu có hợp lệ theo chuẩn ngữ nghĩa hay không
   */
  static isValidAnchorId(id: unknown): id is string {
    if (typeof id !== "string" || !id.trim()) return false;
    return ANCHOR_ID_REGEX.test(id.trim());
  }

  /**
   * Phân tách ID tham chiếu thành các thành phần ngữ nghĩa
   */
  static parseAnchorId(id: string): SemanticReferenceId | null {
    if (!this.isValidAnchorId(id)) return null;

    const parts = id.trim().split("_");
    if (parts.length < 3 || parts[0] !== "ref") return null;

    const type = parts[1] as ReferenceTargetType;
    const uniquePart = parts.slice(2).join("_");

    return {
      prefix: "ref",
      type,
      uniquePart,
      raw: id,
    };
  }

  /**
   * Khởi tạo đối tượng ReferenceAnchor hoàn chỉnh
   */
  static createAnchor(
    targetType: ReferenceTargetType,
    label: string,
    targetId?: string,
    metadata?: Record<string, unknown>
  ): ReferenceAnchor {
    const id = targetId && this.isValidAnchorId(targetId) ? targetId : this.generateAnchorId(targetType, label);
    return {
      id,
      targetType,
      label: label.trim() || `Untitled ${targetType}`,
      targetId: id,
      metadata: metadata ? { ...metadata } : undefined,
    };
  }

  /**
   * Trích xuất văn bản thuần túy từ một node AST
   */
  private static extractNodeText(node: JSONContent): string {
    if (node.text) return node.text;
    if (Array.isArray(node.content)) {
      return node.content.map((c) => this.extractNodeText(c)).join("");
    }
    return "";
  }

  /**
   * Trích xuất toàn bộ danh sách ReferenceAnchor từ các Heading node trong cây AST
   * Không sửa đổi cây AST, thuần đọc (Pure function).
   */
  static extractHeadingAnchors(doc: JSONContent): ReferenceAnchor[] {
    const anchors: ReferenceAnchor[] = [];

    const traverse = (node: JSONContent, path: number[] = []) => {
      if (node.type === "heading") {
        const text = this.extractNodeText(node).trim();
        const level = typeof node.attrs?.level === "number" ? node.attrs.level : 1;
        const existingId = typeof node.attrs?.id === "string" ? node.attrs.id : null;

        // Nếu heading đã có id hợp lệ thì dùng lại, nếu chưa thì tạo id định danh từ text
        const anchorId = existingId && this.isValidAnchorId(existingId)
          ? existingId
          : this.generateAnchorId("heading", text || `h${level}`);

        anchors.push({
          id: anchorId,
          targetType: "heading",
          label: text || `Heading ${level}`,
          targetId: anchorId,
          metadata: {
            level,
            path: [...path],
          },
        });
      }

      if (Array.isArray(node.content)) {
        node.content.forEach((child, index) => {
          traverse(child, [...path, index]);
        });
      }
    };

    traverse(doc);
    return anchors;
  }

  /**
   * Đảm bảo mọi Heading trong cây AST đều sở hữu thuộc tính `attrs.id` bền vững.
   * Trả về cây AST mới (bất biến / immutability), KHÔNG mutate cây AST cũ trực tiếp.
   */
  static ensureHeadingAnchorIds(doc: JSONContent): { updatedDoc: JSONContent; generatedCount: number } {
    let generatedCount = 0;

    const cloneAndAssign = (node: JSONContent): JSONContent => {
      let newNode: JSONContent = { ...node };

      if (node.type === "heading") {
        const existingId = typeof node.attrs?.id === "string" ? node.attrs.id : null;
        if (!existingId || !this.isValidAnchorId(existingId)) {
          const text = this.extractNodeText(node).trim();
          const newId = this.generateAnchorId("heading", text);
          newNode = {
            ...newNode,
            attrs: {
              ...(newNode.attrs || {}),
              id: newId,
            },
          };
          generatedCount++;
        }
      }

      if (Array.isArray(node.content)) {
        newNode.content = node.content.map(cloneAndAssign);
      }

      return newNode;
    };

    const updatedDoc = cloneAndAssign(doc);
    return { updatedDoc, generatedCount };
  }

  /**
   * Tìm kiếm đối tượng tham chiếu trong cây AST dựa trên anchorId
   */
  static findAnchorInDoc(
    doc: JSONContent,
    anchorId: string
  ): { node: JSONContent; targetType: ReferenceTargetType; label: string } | null {
    if (!this.isValidAnchorId(anchorId)) return null;

    const parsed = this.parseAnchorId(anchorId);
    if (!parsed) return null;

    let result: { node: JSONContent; targetType: ReferenceTargetType; label: string } | null = null;

    const traverse = (node: JSONContent) => {
      if (result) return;

      if (node.type === "heading" && node.attrs?.id === anchorId) {
        result = {
          node,
          targetType: "heading",
          label: this.extractNodeText(node).trim() || "Untitled Heading",
        };
        return;
      }

      // Hỗ trợ kiểm tra các mark hoặc thuộc tính mở rộng cho caption / footnote / v.v.
      if (node.marks && Array.isArray(node.marks)) {
        for (const mark of node.marks) {
          if (mark.attrs?.id === anchorId || mark.attrs?.refId === anchorId) {
            result = {
              node,
              targetType: parsed.type,
              label: this.extractNodeText(node).trim(),
            };
            return;
          }
        }
      }

      if (Array.isArray(node.content)) {
        for (const child of node.content) {
          traverse(child);
          if (result) return;
        }
      }
    };

    traverse(doc);
    return result;
  }

  /**
   * Kiểm tra tính toàn vẹn và duy nhất của danh sách neo tham chiếu
   */
  static validateAnchorIntegrity(anchors: ReferenceAnchor[]): {
    valid: boolean;
    duplicateIds: string[];
    invalidFormatIds: string[];
  } {
    const seenIds = new Set<string>();
    const duplicateIds: string[] = [];
    const invalidFormatIds: string[] = [];

    for (const anchor of anchors) {
      if (!this.isValidAnchorId(anchor.id)) {
        invalidFormatIds.push(anchor.id);
      }
      if (seenIds.has(anchor.id)) {
        duplicateIds.push(anchor.id);
      } else {
        seenIds.add(anchor.id);
      }
    }

    return {
      valid: duplicateIds.length === 0 && invalidFormatIds.length === 0,
      duplicateIds,
      invalidFormatIds,
    };
  }
}
