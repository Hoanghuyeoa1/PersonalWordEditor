import type {
  TrackChangeItem,
  FormattingPropertyDiff,
} from "../../document/documentTypes.ts";
import { FormattingDiffService } from "./formattingDiffService.ts";
import {
  STYLE_NORMAL_ID,
  STYLE_HEADING_1_ID,
  STYLE_HEADING_2_ID,
  STYLE_HEADING_3_ID,
} from "../../styles/services/builtInStyles.ts";

/**
 * Xử lý chấp nhận (Accept) một Block Formatting / Style Revision trên paragraph hoặc heading node.
 * - Giữ nguyên formatting và style hiện hành trên node attrs.
 * - Gỡ bỏ metadata của revision được chấp nhận.
 * - Supersede / Retire các earlier revisions trên cùng block nếu có cùng property (Accept B trước A).
 */
export function processBlockAccept(tr: any, state: any, targetId: string): boolean {
  let handled = false;

  state.doc.descendants((node: any, pos: number) => {
    if (node.isText || !node.attrs || !Array.isArray(node.attrs.formatRevisions)) return;

    const revs: TrackChangeItem[] = node.attrs.formatRevisions;
    const targetIdx = revs.findIndex((r) => r && r.id === targetId);
    if (targetIdx === -1) return;

    const targetRev = revs[targetIdx];
    const targetProperties = new Set(
      (targetRev.formatChange?.changes || []).map((c) => c.property)
    );

    const nextRevs: TrackChangeItem[] = [];

    for (let i = 0; i < revs.length; i++) {
      if (i === targetIdx) {
        // targetRev được chấp nhận -> loại bỏ khỏi pending list
        continue;
      }

      const rev = revs[i];
      if (i < targetIdx) {
        // Earlier revision: loại bỏ các properties đã bị targetRev supersede
        const remainingChanges = (rev.formatChange?.changes || []).filter(
          (c) => !targetProperties.has(c.property)
        );

        if (remainingChanges.length > 0) {
          nextRevs.push({
            ...rev,
            formatChange: {
              ...rev.formatChange!,
              changes: remainingChanges,
              summary: FormattingDiffService.formatDiffSummary(remainingChanges, rev.scope),
            },
            formatDetails: FormattingDiffService.formatDiffSummary(remainingChanges, rev.scope),
          });
        }
      } else {
        // Later revision: giữ nguyên
        nextRevs.push(rev);
      }
    }

    tr.setNodeMarkup(pos, undefined, {
      ...node.attrs,
      formatRevisions: nextRevs,
    });
    handled = true;
  });

  return handled;
}

/**
 * Xử lý từ chối (Reject) một Block Formatting / Style Revision trên paragraph hoặc heading node.
 * - Khôi phục chính xác before-value cho các properties không bị later revision ghi đè.
 * - REBASE các later revisions can thiệp cùng property (Reject A trước B -> B rebase before = A.before).
 * - Phân biệt missing vs explicit values, không biến inherited style thành direct formatting vô ích.
 * - Khôi phục semantic heading level và paragraph node type an toàn.
 */
export function processBlockReject(tr: any, state: any, targetId: string): boolean {
  let handled = false;

  state.doc.descendants((node: any, pos: number) => {
    if (node.isText || !node.attrs || !Array.isArray(node.attrs.formatRevisions)) return;

    const revs: TrackChangeItem[] = node.attrs.formatRevisions;
    const targetIdx = revs.findIndex((r) => r && r.id === targetId);
    if (targetIdx === -1) return;

    const targetRev = revs[targetIdx];
    const targetChanges: FormattingPropertyDiff[] = targetRev.formatChange?.changes || [];

    // Lập bản đồ các later revisions can thiệp vào từng property
    const laterRevs = revs.slice(targetIdx + 1);
    const laterPropertyMap = new Map<string, number>();

    for (let li = 0; li < laterRevs.length; li++) {
      for (const ch of laterRevs[li].formatChange?.changes || []) {
        if (!laterPropertyMap.has(ch.property)) {
          laterPropertyMap.set(ch.property, li);
        }
      }
    }

    const restoredAttrs: Record<string, any> = { ...node.attrs };
    let restoredType = node.type;

    for (const targetDiff of targetChanges) {
      const prop = targetDiff.property;

      if (laterPropertyMap.has(prop)) {
        // Có later revision can thiệp property này: REBASE later revision!
        const laterRevIdx = laterPropertyMap.get(prop)!;
        const laterRev = laterRevs[laterRevIdx];
        const laterDiff = (laterRev.formatChange?.changes || []).find((c) => c.property === prop);
        if (laterDiff) {
          laterDiff.before = targetDiff.before;
          laterDiff.isInheritedBefore = targetDiff.isInheritedBefore;
        }
      } else {
        // Không có later revision -> Khôi phục chính xác về before
        if (prop === "paragraphStyleId") {
          const beforeId = targetDiff.before;
          if (beforeId === STYLE_HEADING_1_ID) {
            restoredType = state.schema.nodes.heading;
            restoredAttrs.level = 1;
            restoredAttrs.styleId = STYLE_HEADING_1_ID;
          } else if (beforeId === STYLE_HEADING_2_ID) {
            restoredType = state.schema.nodes.heading;
            restoredAttrs.level = 2;
            restoredAttrs.styleId = STYLE_HEADING_2_ID;
          } else if (beforeId === STYLE_HEADING_3_ID) {
            restoredType = state.schema.nodes.heading;
            restoredAttrs.level = 3;
            restoredAttrs.styleId = STYLE_HEADING_3_ID;
          } else if (beforeId === STYLE_NORMAL_ID || beforeId === null) {
            restoredType = state.schema.nodes.paragraph;
            delete restoredAttrs.level;
            restoredAttrs.styleId = null;
          } else {
            const hlChange = targetChanges.find((c) => c.property === "headingLevel");
            if (hlChange && hlChange.before) {
              restoredType = state.schema.nodes.heading;
              restoredAttrs.level = hlChange.before;
            } else if (hlChange && hlChange.before === null) {
              restoredType = state.schema.nodes.paragraph;
              delete restoredAttrs.level;
            }
            restoredAttrs.styleId = beforeId;
          }
        } else if (prop === "headingLevel") {
          if (targetDiff.before !== undefined) {
            if (targetDiff.before === null) {
              restoredType = state.schema.nodes.paragraph;
              delete restoredAttrs.level;
            } else {
              restoredType = state.schema.nodes.heading;
              restoredAttrs.level = targetDiff.before;
            }
          }
        } else {
          // Direct formatting attributes (textAlign, lineSpacing, spacingBefore, spacingAfter, leftIndent, rightIndent...)
          restoredAttrs[prop] = targetDiff.before !== undefined ? targetDiff.before : null;
        }
      }
    }

    const nextRevs = revs.filter((r) => r && r.id !== targetId);
    restoredAttrs.formatRevisions = nextRevs;

    tr.setNodeMarkup(pos, restoredType, restoredAttrs);
    handled = true;
  });

  return handled;
}

/**
 * Helper xác định thứ tự thời gian giữa 2 inline trackChange marks trên cùng text node.
 * Ưu tiên timestamp ISO. Nếu bằng nhau, xét vị trí trong mảng marks của node.
 */
function isEarlierInlineMark(other: any, target: any, nodeMarks: any[]): boolean {
  const oTs = other.attrs?.timestamp || "";
  const tTs = target.attrs?.timestamp || "";
  if (oTs !== tTs) {
    return oTs < tTs;
  }
  return nodeMarks.indexOf(other) < nodeMarks.indexOf(target);
}

function isLaterInlineMark(other: any, target: any, nodeMarks: any[]): boolean {
  const oTs = other.attrs?.timestamp || "";
  const tTs = target.attrs?.timestamp || "";
  if (oTs !== tTs) {
    return oTs > tTs;
  }
  return nodeMarks.indexOf(other) > nodeMarks.indexOf(target);
}

/**
 * Xử lý chấp nhận (Accept) một Inline Revision (insert, delete, hoặc format) trên text ranges.
 * - Insert: giữ văn bản, gỡ bỏ mark trackChange.
 * - Delete: xóa vĩnh viễn nội dung đánh dấu xóa.
 * - Format: giữ formatting hiện hành, gỡ bỏ mark revision, supersede các earlier format marks trên cùng range.
 */
export function processInlineAccept(tr: any, state: any, targetId: string): boolean {
  const markType = state.schema.marks.trackChange;
  if (!markType) return false;

  interface Span {
    from: number;
    to: number;
    type: "insert" | "delete" | "format";
    mark: any;
  }
  const spans: Span[] = [];

  state.doc.descendants((node: any, pos: number) => {
    if (!node.isText) return;
    const mark = node.marks.find((m: any) => m.type === markType && m.attrs.id === targetId);
    if (mark) {
      const rawType = mark.attrs.changeType;
      const type =
        rawType === "delete" || rawType === "deletion"
          ? "delete"
          : rawType === "format"
          ? "format"
          : "insert";
      spans.push({
        from: pos,
        to: pos + node.nodeSize,
        type,
        mark,
      });
    }
  });

  if (spans.length === 0) return false;

  const changeType = spans[0].type;

  if (changeType === "insert") {
    for (const s of spans) {
      tr.removeMark(s.from, s.to, s.mark);
    }
    return true;
  }

  if (changeType === "delete") {
    spans.sort((a, b) => a.from - b.from);
    const merged: Span[] = [];
    for (const s of spans) {
      const last = merged[merged.length - 1];
      if (last && last.to >= s.from) {
        last.to = Math.max(last.to, s.to);
      } else {
        merged.push({ ...s });
      }
    }
    merged.sort((a, b) => b.from - a.from);
    for (const s of merged) {
      tr.delete(s.from, s.to);
    }
    return true;
  }

  if (changeType === "format") {
    for (const s of spans) {
      const targetChanges: FormattingPropertyDiff[] = s.mark.attrs.formatChanges || [];
      const targetProperties = new Set(targetChanges.map((c) => c.property));

      tr.removeMark(s.from, s.to, s.mark);

      // Quét và supersede các earlier format marks trên cùng dải text (Accept B trước A)
      state.doc.nodesBetween(s.from, s.to, (textNode: any, textPos: number) => {
        if (!textNode.isText) return;
        const subFrom = Math.max(s.from, textPos);
        const subTo = Math.min(s.to, textPos + textNode.nodeSize);
        if (subFrom >= subTo) return;

        const otherTrackMarks = textNode.marks.filter(
          (m: any) => m.type === markType && m.attrs.id !== targetId && m.attrs.changeType === "format"
        );

        for (const otherMark of otherTrackMarks) {
          if (isEarlierInlineMark(otherMark, s.mark, textNode.marks)) {
            const otherChanges: FormattingPropertyDiff[] = otherMark.attrs.formatChanges || [];
            const remainingChanges = otherChanges.filter((c) => !targetProperties.has(c.property));

            tr.removeMark(subFrom, subTo, otherMark);
            if (remainingChanges.length > 0) {
              const updatedMark = markType.create({
                ...otherMark.attrs,
                formatChanges: remainingChanges,
                formatDetails: FormattingDiffService.formatDiffSummary(remainingChanges, otherMark.attrs.scope),
              });
              tr.addMark(subFrom, subTo, updatedMark);
            }
          }
        }
      });
    }

    return true;
  }

  return false;
}

/**
 * Xử lý từ chối (Reject) một Inline Revision (insert, delete, hoặc format) trên text ranges.
 * - Insert: xóa bỏ văn bản đã chèn.
 * - Delete: giữ nguyên văn bản, gỡ bỏ mark delete.
 * - Format: khôi phục chính xác các properties không bị later revision ghi đè, REBASE later revisions nếu có.
 * - Không làm mất các marks độc lập khác (comments, hyperlinks, citations, other format marks).
 */
export function processInlineReject(tr: any, state: any, targetId: string): boolean {
  const markType = state.schema.marks.trackChange;
  if (!markType) return false;

  interface Span {
    from: number;
    to: number;
    type: "insert" | "delete" | "format";
    mark: any;
  }
  const spans: Span[] = [];

  state.doc.descendants((node: any, pos: number) => {
    if (!node.isText) return;
    const mark = node.marks.find((m: any) => m.type === markType && m.attrs.id === targetId);
    if (mark) {
      const rawType = mark.attrs.changeType;
      const type =
        rawType === "delete" || rawType === "deletion"
          ? "delete"
          : rawType === "format"
          ? "format"
          : "insert";
      spans.push({
        from: pos,
        to: pos + node.nodeSize,
        type,
        mark,
      });
    }
  });

  if (spans.length === 0) return false;

  const changeType = spans[0].type;

  if (changeType === "insert") {
    spans.sort((a, b) => a.from - b.from);
    const merged: Span[] = [];
    for (const s of spans) {
      const last = merged[merged.length - 1];
      if (last && last.to >= s.from) {
        last.to = Math.max(last.to, s.to);
      } else {
        merged.push({ ...s });
      }
    }
    merged.sort((a, b) => b.from - a.from);
    for (const s of merged) {
      tr.delete(s.from, s.to);
    }
    return true;
  }

  if (changeType === "delete") {
    for (const s of spans) {
      tr.removeMark(s.from, s.to, s.mark);
    }
    return true;
  }

  if (changeType === "format") {
    for (const s of spans) {
      const targetChanges: FormattingPropertyDiff[] = s.mark.attrs.formatChanges || [];

      // 1. Quét tìm các later revisions can thiệp vào từng property
      const laterPropertyMap = new Map<string, any>();

      state.doc.nodesBetween(s.from, s.to, (textNode: any) => {
        if (!textNode.isText) return;
        const otherMarks = textNode.marks
          .filter(
            (m: any) => m.type === markType && m.attrs.id !== targetId && m.attrs.changeType === "format"
          )
          .filter((m: any) => isLaterInlineMark(m, s.mark, textNode.marks))
          .sort((a: any, b: any) => (isEarlierInlineMark(a, b, textNode.marks) ? -1 : 1));

        for (const om of otherMarks) {
          for (const ch of om.attrs.formatChanges || []) {
            if (!laterPropertyMap.has(ch.property)) {
              laterPropertyMap.set(ch.property, om);
            }
          }
        }
      });

      // 2. Gom nhóm các later revisions cần REBASE
      const laterRebasedMarks = new Map<any, FormattingPropertyDiff[]>();

      // 3. Xử lý các direct properties không thuộc textStyle (hoặc rebase later revisions)
      const textStyleChanges: FormattingPropertyDiff[] = [];

      for (const ch of targetChanges) {
        if (laterPropertyMap.has(ch.property)) {
          // REBASE later revision: cập nhật before-value của later revision thành before-value của target
          const laterMark = laterPropertyMap.get(ch.property);
          if (laterMark) {
            let changes = laterRebasedMarks.get(laterMark);
            if (!changes) {
              changes = ((laterMark.attrs?.formatChanges || []) as FormattingPropertyDiff[]).map((c: any) => ({ ...c }));
              laterRebasedMarks.set(laterMark, changes);
            }
            const matchedDiff = changes.find((c) => c.property === ch.property);
            if (matchedDiff) {
              matchedDiff.before = ch.before;
              matchedDiff.isInheritedBefore = ch.isInheritedBefore;
            }
          }
        } else {
          // Không có later revision -> Khôi phục formatting trực tiếp về before
          if (ch.property === "characterStyleId") {
            const charStyleMark = state.schema.marks.characterStyle;
            if (charStyleMark) {
              tr.removeMark(s.from, s.to, charStyleMark);
              if (ch.before) {
                tr.addMark(s.from, s.to, charStyleMark.create({ styleId: ch.before }));
              }
            }
          } else if (ch.property === "bold") {
            const m = state.schema.marks.bold;
            if (m) {
              if (ch.before) tr.addMark(s.from, s.to, m.create());
              else tr.removeMark(s.from, s.to, m);
            }
          } else if (ch.property === "italic") {
            const m = state.schema.marks.italic;
            if (m) {
              if (ch.before) tr.addMark(s.from, s.to, m.create());
              else tr.removeMark(s.from, s.to, m);
            }
          } else if (ch.property === "underline") {
            const m = state.schema.marks.underline;
            if (m) {
              if (ch.before) tr.addMark(s.from, s.to, m.create());
              else tr.removeMark(s.from, s.to, m);
            }
          } else if (ch.property === "strike") {
            const m = state.schema.marks.strike;
            if (m) {
              if (ch.before) tr.addMark(s.from, s.to, m.create());
              else tr.removeMark(s.from, s.to, m);
            }
          } else if (ch.property === "highlight") {
            const m = state.schema.marks.highlight;
            if (m) {
              if (ch.before) tr.addMark(s.from, s.to, m.create({ color: ch.before }));
              else tr.removeMark(s.from, s.to, m);
            }
          } else if (
            ch.property === "color" ||
            ch.property === "fontSize" ||
            ch.property === "fontFamily"
          ) {
            textStyleChanges.push(ch);
          }
        }
      }

      // Xử lý nhóm textStyle (color, fontSize, fontFamily) đồng thời trong một lượt duyệt
      if (textStyleChanges.length > 0) {
        const textStyleMark = state.schema.marks.textStyle;
        if (textStyleMark) {
          state.doc.nodesBetween(s.from, s.to, (textNode: any, textPos: number) => {
            if (!textNode.isText) return;
            const subFrom = Math.max(s.from, textPos);
            const subTo = Math.min(s.to, textPos + textNode.nodeSize);
            if (subFrom >= subTo) return;

            const curTS = textNode.marks.find((m: any) => m.type === textStyleMark);
            const updatedAttrs = { ...(curTS?.attrs || {}) };

            for (const tch of textStyleChanges) {
              if (tch.property === "color") {
                if (tch.before !== null && tch.before !== undefined) {
                  updatedAttrs.color = tch.before;
                } else {
                  delete updatedAttrs.color;
                }
              } else if (tch.property === "fontSize") {
                if (tch.before !== null && tch.before !== undefined) {
                  const sizeStr = typeof tch.before === "number" ? `${tch.before}pt` : String(tch.before);
                  updatedAttrs.fontSize = sizeStr.endsWith("pt") ? sizeStr : `${sizeStr}pt`;
                } else {
                  delete updatedAttrs.fontSize;
                }
              } else if (tch.property === "fontFamily") {
                if (tch.before !== null && tch.before !== undefined) {
                  updatedAttrs.fontFamily = tch.before;
                } else {
                  delete updatedAttrs.fontFamily;
                }
              }
            }

            const activeKeys = Object.keys(updatedAttrs).filter(
              (k) => updatedAttrs[k] !== undefined && updatedAttrs[k] !== null
            );

            if (activeKeys.length > 0) {
              tr.addMark(subFrom, subTo, textStyleMark.create(updatedAttrs));
            } else if (curTS) {
              tr.removeMark(subFrom, subTo, textStyleMark);
            }
          });
        }
      }

      // 4. Áp dụng các later revisions đã rebase vào transaction
      for (const [oldMark, updatedChanges] of laterRebasedMarks.entries()) {
        tr.removeMark(s.from, s.to, oldMark);
        const updatedMark = markType.create({
          ...oldMark.attrs,
          formatChanges: updatedChanges,
          formatDetails: FormattingDiffService.formatDiffSummary(updatedChanges, oldMark.attrs.scope),
        });
        tr.addMark(s.from, s.to, updatedMark);
      }

      tr.removeMark(s.from, s.to, s.mark);
    }

    return true;
  }

  return false;
}

/**
 * Helper khôi phục toàn bộ thuộc tính của một block node về trạng thái trước revision đầu tiên.
 */
function revertBlockFormattingToEarliest(tr: any, state: any, node: any, pos: number): void {
  if (!node.attrs || !Array.isArray(node.attrs.formatRevisions) || node.attrs.formatRevisions.length === 0) {
    return;
  }

  const revs: TrackChangeItem[] = node.attrs.formatRevisions;
  const earliestBefore = new Map<string, FormattingPropertyDiff>();

  // Quét từ revision đầu tiên (cũ nhất) đến mới nhất để lấy before-value gốc
  for (const rev of revs) {
    for (const ch of rev.formatChange?.changes || []) {
      if (!earliestBefore.has(ch.property)) {
        earliestBefore.set(ch.property, ch);
      }
    }
  }

  const restoredAttrs: Record<string, any> = { ...node.attrs, formatRevisions: [] };
  let restoredType = node.type;

  for (const [prop, targetDiff] of earliestBefore.entries()) {
    if (prop === "paragraphStyleId") {
      const beforeId = targetDiff.before;
      if (beforeId === STYLE_HEADING_1_ID) {
        restoredType = state.schema.nodes.heading;
        restoredAttrs.level = 1;
        restoredAttrs.styleId = STYLE_HEADING_1_ID;
      } else if (beforeId === STYLE_HEADING_2_ID) {
        restoredType = state.schema.nodes.heading;
        restoredAttrs.level = 2;
        restoredAttrs.styleId = STYLE_HEADING_2_ID;
      } else if (beforeId === STYLE_HEADING_3_ID) {
        restoredType = state.schema.nodes.heading;
        restoredAttrs.level = 3;
        restoredAttrs.styleId = STYLE_HEADING_3_ID;
      } else if (beforeId === STYLE_NORMAL_ID || beforeId === null) {
        restoredType = state.schema.nodes.paragraph;
        delete restoredAttrs.level;
        restoredAttrs.styleId = null;
      } else {
        const hlChange = earliestBefore.get("headingLevel");
        if (hlChange && hlChange.before) {
          restoredType = state.schema.nodes.heading;
          restoredAttrs.level = hlChange.before;
        } else if (hlChange && hlChange.before === null) {
          restoredType = state.schema.nodes.paragraph;
          delete restoredAttrs.level;
        }
        restoredAttrs.styleId = beforeId;
      }
    } else if (prop === "headingLevel") {
      if (targetDiff.before !== undefined) {
        if (targetDiff.before === null) {
          restoredType = state.schema.nodes.paragraph;
          delete restoredAttrs.level;
        } else {
          restoredType = state.schema.nodes.heading;
          restoredAttrs.level = targetDiff.before;
        }
      }
    } else {
      restoredAttrs[prop] = targetDiff.before !== undefined ? targetDiff.before : null;
    }
  }

  tr.setNodeMarkup(pos, restoredType, restoredAttrs);
}

/**
 * Helper khôi phục toàn bộ thuộc tính định dạng inline của một text node về trạng thái trước revision đầu tiên.
 */
function revertInlineFormattingToEarliest(
  tr: any,
  state: any,
  textNode: any,
  subFrom: number,
  subTo: number,
  fmtMarks: any[]
): void {
  // Sắp xếp các mark theo thứ tự thời gian tăng dần
  const sorted = [...fmtMarks].sort((a, b) =>
    isEarlierInlineMark(a, b, textNode.marks) ? -1 : 1
  );

  const earliestBefore = new Map<string, FormattingPropertyDiff>();
  for (const fm of sorted) {
    for (const ch of fm.attrs.formatChanges || []) {
      if (!earliestBefore.has(ch.property)) {
        earliestBefore.set(ch.property, ch);
      }
    }
  }

  // 1. Phục hồi các mark độc lập không thuộc textStyle
  for (const [prop, ch] of earliestBefore.entries()) {
    if (prop === "characterStyleId") {
      const charStyleMark = state.schema.marks.characterStyle;
      if (charStyleMark) {
        tr.removeMark(subFrom, subTo, charStyleMark);
        if (ch.before) {
          tr.addMark(subFrom, subTo, charStyleMark.create({ styleId: ch.before }));
        }
      }
    } else if (prop === "bold") {
      const m = state.schema.marks.bold;
      if (m) {
        if (ch.before) tr.addMark(subFrom, subTo, m.create());
        else tr.removeMark(subFrom, subTo, m);
      }
    } else if (prop === "italic") {
      const m = state.schema.marks.italic;
      if (m) {
        if (ch.before) tr.addMark(subFrom, subTo, m.create());
        else tr.removeMark(subFrom, subTo, m);
      }
    } else if (prop === "underline") {
      const m = state.schema.marks.underline;
      if (m) {
        if (ch.before) tr.addMark(subFrom, subTo, m.create());
        else tr.removeMark(subFrom, subTo, m);
      }
    } else if (prop === "strike") {
      const m = state.schema.marks.strike;
      if (m) {
        if (ch.before) tr.addMark(subFrom, subTo, m.create());
        else tr.removeMark(subFrom, subTo, m);
      }
    } else if (prop === "highlight") {
      const m = state.schema.marks.highlight;
      if (m) {
        if (ch.before) tr.addMark(subFrom, subTo, m.create({ color: ch.before }));
        else tr.removeMark(subFrom, subTo, m);
      }
    }
  }

  // 2. Phục hồi nhóm thuộc tính textStyle (color, fontSize, fontFamily)
  const hasTextStyleChange =
    earliestBefore.has("color") ||
    earliestBefore.has("fontSize") ||
    earliestBefore.has("fontFamily");

  if (hasTextStyleChange) {
    const textStyleMark = state.schema.marks.textStyle;
    if (textStyleMark) {
      const curTS = textNode.marks.find((m: any) => m.type === textStyleMark);
      const updatedAttrs = { ...(curTS?.attrs || {}) };

      if (earliestBefore.has("color")) {
        const ch = earliestBefore.get("color")!;
        if (ch.before !== null && ch.before !== undefined) {
          updatedAttrs.color = ch.before;
        } else {
          delete updatedAttrs.color;
        }
      }

      if (earliestBefore.has("fontSize")) {
        const ch = earliestBefore.get("fontSize")!;
        if (ch.before !== null && ch.before !== undefined) {
          const sizeStr = typeof ch.before === "number" ? `${ch.before}pt` : String(ch.before);
          updatedAttrs.fontSize = sizeStr.endsWith("pt") ? sizeStr : `${sizeStr}pt`;
        } else {
          delete updatedAttrs.fontSize;
        }
      }

      if (earliestBefore.has("fontFamily")) {
        const ch = earliestBefore.get("fontFamily")!;
        if (ch.before !== null && ch.before !== undefined) {
          updatedAttrs.fontFamily = ch.before;
        } else {
          delete updatedAttrs.fontFamily;
        }
      }

      const activeKeys = Object.keys(updatedAttrs).filter(
        (k) => updatedAttrs[k] !== undefined && updatedAttrs[k] !== null
      );

      if (activeKeys.length > 0) {
        tr.addMark(subFrom, subTo, textStyleMark.create(updatedAttrs));
      } else if (curTS) {
        tr.removeMark(subFrom, subTo, textStyleMark);
      }
    }
  }

  // 3. Gỡ bỏ tất cả các format marks trên node này
  for (const fm of fmtMarks) {
    tr.removeMark(subFrom, subTo, fm);
  }
}

/**
 * Chấp nhận toàn bộ Formatting Revisions (Selective Bulk Accept).
 * Giữ nguyên các thay đổi Insert và Delete đang chờ duyệt.
 */
export function processBulkAcceptFormatting(tr: any, state: any): boolean {
  let handled = false;

  // 1. Block nodes
  state.doc.descendants((node: any, pos: number) => {
    if (
      !node.isText &&
      node.attrs &&
      Array.isArray(node.attrs.formatRevisions) &&
      node.attrs.formatRevisions.length > 0
    ) {
      tr.setNodeMarkup(pos, undefined, {
        ...node.attrs,
        formatRevisions: [],
      });
      handled = true;
    }
  });

  // 2. Inline format marks
  const markType = state.schema.marks.trackChange;
  if (markType) {
    state.doc.descendants((node: any, pos: number) => {
      if (!node.isText) return;
      const fmtMarks = node.marks.filter(
        (m: any) => m.type === markType && m.attrs.changeType === "format"
      );
      for (const m of fmtMarks) {
        tr.removeMark(pos, pos + node.nodeSize, m);
        handled = true;
      }
    });
  }

  return handled;
}

/**
 * Từ chối toàn bộ Formatting Revisions (Selective Bulk Reject).
 * Hoàn tác định dạng về trạng thái ban đầu, giữ nguyên các thay đổi Insert và Delete.
 */
export function processBulkRejectFormatting(tr: any, state: any): boolean {
  let handled = false;

  // 1. Block nodes
  state.doc.descendants((node: any, pos: number) => {
    if (
      !node.isText &&
      node.attrs &&
      Array.isArray(node.attrs.formatRevisions) &&
      node.attrs.formatRevisions.length > 0
    ) {
      revertBlockFormattingToEarliest(tr, state, node, pos);
      handled = true;
    }
  });

  // 2. Inline format marks
  const markType = state.schema.marks.trackChange;
  if (markType) {
    state.doc.descendants((node: any, pos: number) => {
      if (!node.isText) return;
      const fmtMarks = node.marks.filter(
        (m: any) => m.type === markType && m.attrs.changeType === "format"
      );
      if (fmtMarks.length > 0) {
        revertInlineFormattingToEarliest(tr, state, node, pos, pos + node.nodeSize, fmtMarks);
        handled = true;
      }
    });
  }

  return handled;
}

/**
 * Chấp nhận toàn bộ thay đổi trong tài liệu (Accept All - Insert, Delete, Format).
 * - Format: giữ formatting hiện hành, gỡ bỏ metadata.
 * - Insert: giữ văn bản, gỡ bỏ mark insert.
 * - Delete: xóa vĩnh viễn văn bản theo thứ tự vị trí giảm dần để không lệch index.
 */
export function processBulkAcceptAll(tr: any, state: any): boolean {
  let handled = false;

  // 1. Block format revisions
  state.doc.descendants((node: any, pos: number) => {
    if (
      !node.isText &&
      node.attrs &&
      Array.isArray(node.attrs.formatRevisions) &&
      node.attrs.formatRevisions.length > 0
    ) {
      tr.setNodeMarkup(pos, undefined, {
        ...node.attrs,
        formatRevisions: [],
      });
      handled = true;
    }
  });

  // 2. Inline marks
  const markType = state.schema.marks.trackChange;
  if (!markType) return handled;

  interface Span {
    from: number;
    to: number;
  }
  const deleteSpans: Span[] = [];

  state.doc.descendants((node: any, pos: number) => {
    if (!node.isText) return;
    const trackMarks = node.marks.filter((m: any) => m.type === markType);
    if (trackMarks.length === 0) return;

    for (const m of trackMarks) {
      const cType = m.attrs.changeType;
      if (cType === "format" || cType === "insert") {
        tr.removeMark(pos, pos + node.nodeSize, m);
        handled = true;
      } else if (cType === "delete" || cType === "deletion") {
        deleteSpans.push({
          from: pos,
          to: pos + node.nodeSize,
        });
        handled = true;
      }
    }
  });

  // 3. Xóa các đoạn đánh dấu delete theo thứ tự vị trí giảm dần (descending order)
  if (deleteSpans.length > 0) {
    // Hợp nhất các dải liền kề
    deleteSpans.sort((a, b) => a.from - b.from);
    const merged: Span[] = [];
    for (const s of deleteSpans) {
      const last = merged[merged.length - 1];
      if (last && last.to >= s.from) {
        last.to = Math.max(last.to, s.to);
      } else {
        merged.push({ ...s });
      }
    }

    // Xóa từ dưới lên trên
    merged.sort((a, b) => b.from - a.from);
    for (const s of merged) {
      tr.delete(s.from, s.to);
    }
  }

  return handled;
}

/**
 * Từ chối toàn bộ thay đổi trong tài liệu (Reject All - Insert, Delete, Format).
 * - Block formatting: khôi phục về trạng thái gốc trước revision đầu tiên.
 * - Inline formatting trên surviving text: khôi phục về trạng thái gốc.
 * - Delete: khôi phục / giữ nguyên văn bản, gỡ bỏ mark delete.
 * - Insert: xóa bỏ văn bản đã chèn theo thứ tự vị trí giảm dần, triệt tiêu nguy cơ index drift.
 */
export function processBulkRejectAll(tr: any, state: any): boolean {
  let handled = false;

  // 1. Block format revisions
  state.doc.descendants((node: any, pos: number) => {
    if (
      !node.isText &&
      node.attrs &&
      Array.isArray(node.attrs.formatRevisions) &&
      node.attrs.formatRevisions.length > 0
    ) {
      revertBlockFormattingToEarliest(tr, state, node, pos);
      handled = true;
    }
  });

  // 2. Inline marks
  const markType = state.schema.marks.trackChange;
  if (!markType) return handled;

  interface Span {
    from: number;
    to: number;
  }
  const insertSpans: Span[] = [];

  state.doc.descendants((node: any, pos: number) => {
    if (!node.isText) return;
    const trackMarks = node.marks.filter((m: any) => m.type === markType);
    if (trackMarks.length === 0) return;

    const isInsert = trackMarks.some((m: any) => m.attrs.changeType === "insert");
    const delMarks = trackMarks.filter(
      (m: any) => m.attrs.changeType === "delete" || m.attrs.changeType === "deletion"
    );
    const fmtMarks = trackMarks.filter((m: any) => m.attrs.changeType === "format");

    if (isInsert) {
      // Đoạn text được chèn sẽ bị xóa bỏ hoàn toàn ở bước 4 -> không cần revert formatting
      insertSpans.push({
        from: pos,
        to: pos + node.nodeSize,
      });
      handled = true;
    } else {
      // Surviving text: nếu có formatting revision, khôi phục về before
      if (fmtMarks.length > 0) {
        revertInlineFormattingToEarliest(tr, state, node, pos, pos + node.nodeSize, fmtMarks);
        handled = true;
      }
      // Khôi phục text bị xóa: gỡ bỏ delete mark
      for (const dm of delMarks) {
        tr.removeMark(pos, pos + node.nodeSize, dm);
        handled = true;
      }
    }
  });

  // 3. Xóa các đoạn inserted text theo thứ tự vị trí giảm dần (descending order)
  if (insertSpans.length > 0) {
    // Hợp nhất các dải liền kề
    insertSpans.sort((a, b) => a.from - b.from);
    const merged: Span[] = [];
    for (const s of insertSpans) {
      const last = merged[merged.length - 1];
      if (last && last.to >= s.from) {
        last.to = Math.max(last.to, s.to);
      } else {
        merged.push({ ...s });
      }
    }

    // Xóa từ dưới lên trên
    merged.sort((a, b) => b.from - a.from);
    for (const s of merged) {
      tr.delete(s.from, s.to);
    }
  }

  return handled;
}

