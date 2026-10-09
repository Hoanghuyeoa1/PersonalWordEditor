import StarterKit from "@tiptap/starter-kit";
import { TextStyle, FontFamily, FontSize, Color } from "@tiptap/extension-text-style";
import { Highlight } from "@tiptap/extension-highlight";
import TextAlign from "@tiptap/extension-text-align";
import { LineSpacing, Indent, ParagraphStyleExtension } from "./paragraphExtensions.ts";
import { CharacterStyleExtension } from "../styles/extensions/characterStyleExtension.ts";
import { SearchAndReplace } from "./searchExtensions.ts";
import { PageBreak } from "../page/extensions/pageBreakExtension.ts";
import { SectionBreak } from "../page/extensions/sectionBreakExtension.ts";
import {
  CustomTable,
  TableRow,
  CustomTableCell,
  CustomTableHeader,
} from "./tableExtensions.ts";
import { CustomImage } from "./imageExtension.ts";
import { TextBox } from "./textBoxExtension.ts";
import { Shape } from "./shapeExtension.ts";
import { Equation } from "./equationExtension.ts";
import { SpellCheck } from "../review/proofing/spellCheckExtension.ts";
import { CommentExtension } from "../review/comments/commentExtension.ts";
import { TrackChangeExtension } from "../review/trackChanges/trackChangeExtension.ts";
import { HeadingAnchorExtension } from "../references/extensions/headingAnchorExtension.ts";
import { TableOfContentsExtension } from "../references/extensions/tableOfContentsExtension.ts";
import { NoteReferenceExtension } from "../references/extensions/noteExtension.ts";
import { ObjectAnchorExtension } from "../references/extensions/objectAnchorExtension.ts";
import { CaptionExtension } from "../references/extensions/captionExtension.ts";
import { CrossReferenceExtension } from "../references/extensions/crossReferenceExtension.ts";
import { CitationExtension } from "../references/extensions/citationExtension.ts";
import { BibliographyExtension } from "../references/extensions/bibliographyExtension.ts";
import { CaptionListExtension } from "../references/extensions/captionListExtension.ts";
import {
  BookmarkAnchorExtension,
  BookmarkMarkExtension,
} from "../references/extensions/bookmarkExtension.ts";
import { SlashCommandExtension } from "../commands/slashExtension.ts";
import { FieldExtension } from "../fields/extensions/fieldExtension.ts";

import type { AnyExtension } from "@tiptap/core";

/**
 * Cấu hình danh sách extensions cho editor lõi:
 * - StarterKit: Document, Paragraph, Text, HardBreak, Heading (level 1-3),
 *   Bold, Italic, Strike, Underline, BulletList, OrderedList, ListItem, UndoRedo, Link, HorizontalRule
 * - TextStyle, FontFamily, FontSize, Color, Highlight: Định dạng ký tự
 * - TextAlign: Căn lề trái, giữa, phải, đều (left, center, right, justify)
 * - LineSpacing: Độ giãn dòng (1.0, 1.15, 1.5, 2.0) lưu vào node attribute
 * - Indent: Tăng/giảm thụt lề danh sách và đoạn văn
 * - SearchAndReplace: Tìm kiếm và thay thế qua ProseMirror Decorations
 * - PageBreak (Phase 2.5): Semantic block atom node cho ngắt trang vật lý
 * - SectionBreak (Phase 2.7): Semantic block atom node cho ngắt phần (Section Break - Next Page)
 * - Table, TableRow, TableHeader, TableCell (Phase 3.3): Semantic table engine
 * - HeadingAnchorExtension (Phase 6.2): Bổ sung attribute id cho Heading 1..3
 */
export function getEditorExtensions(): AnyExtension[] {
  return [
    StarterKit.configure({
      heading: {
        levels: [1, 2, 3],
      },
      document: undefined,
      paragraph: undefined,
      text: undefined,
      hardBreak: undefined,
      bold: undefined,
      italic: undefined,
      strike: undefined,
      underline: undefined,
      bulletList: undefined,
      orderedList: undefined,
      listItem: undefined,
      undoRedo: undefined,
      link: {
        openOnClick: false,
        HTMLAttributes: {
          class: "editor-link",
        },
      },
      horizontalRule: {},
    }),
    HeadingAnchorExtension,
    TextStyle,
    FontFamily,
    FontSize,
    Color,
    Highlight.configure({
      multicolor: true,
    }),
    TextAlign.configure({
      types: ["heading", "paragraph"],
      alignments: ["left", "center", "right", "justify"],
      defaultAlignment: "left",
    }),
    LineSpacing,
    Indent,
    ParagraphStyleExtension,
    CharacterStyleExtension,
    SearchAndReplace,
    PageBreak,
    SectionBreak,
    CustomTable,
    TableRow.configure({
      HTMLAttributes: {
        class: "editor-table-row",
      },
    }),
    CustomTableHeader,
    CustomTableCell,
    CustomImage,
    TextBox,
    Shape,
    Equation,
    SpellCheck,
    CommentExtension,
    TrackChangeExtension,
    TableOfContentsExtension,
    NoteReferenceExtension,
    ObjectAnchorExtension,
    CaptionExtension,
    CrossReferenceExtension,
    CitationExtension,
    BibliographyExtension,
    CaptionListExtension,
    BookmarkAnchorExtension,
    BookmarkMarkExtension,
    SlashCommandExtension,
    FieldExtension,
  ];
}
