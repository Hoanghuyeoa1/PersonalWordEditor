import { Node, mergeAttributes } from "@tiptap/core";
import type { SupportedFieldType } from "../types/fieldTypes.ts";

/**
 * FieldExtension - Personal Word Editor (Phase 4 Semantic Field Engine)
 *
 * Đại diện cho một trường động nội dòng (inline atom node `field`) trong ProseMirror AST.
 * Giữ tách bạch giữa chỉ thị gốc (`instruction`) và kết quả hiển thị (`result`).
 */
export const FieldExtension = Node.create({
  name: "field",
  group: "inline",
  inline: true,
  atom: true,

  addAttributes() {
    return {
      fieldType: {
        default: "UNKNOWN",
        parseHTML: (element) =>
          (element.getAttribute("data-field-type") as SupportedFieldType) || "UNKNOWN",
        renderHTML: (attributes) => ({
          "data-field-type": attributes.fieldType || "UNKNOWN",
        }),
      },
      instruction: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-instruction") || "",
        renderHTML: (attributes) => ({
          "data-instruction": attributes.instruction || "",
        }),
      },
      result: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-result") || element.textContent || "",
        renderHTML: (attributes) => ({
          "data-result": attributes.result || "",
        }),
      },
      argument: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-argument") || null,
        renderHTML: (attributes) =>
          attributes.argument ? { "data-argument": attributes.argument } : {},
      },
      switches: {
        default: [],
        parseHTML: (element) => {
          const raw = element.getAttribute("data-switches");
          return raw ? raw.split(";") : [];
        },
        renderHTML: (attributes) =>
          attributes.switches && attributes.switches.length > 0
            ? { "data-switches": attributes.switches.join(";") }
            : {},
      },
      rawInstruction: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-raw-instruction") || null,
        renderHTML: (attributes) =>
          attributes.rawInstruction ? { "data-raw-instruction": attributes.rawInstruction } : {},
      },
      isComplex: {
        default: false,
        parseHTML: (element) => element.getAttribute("data-complex") === "true",
        renderHTML: (attributes) =>
          attributes.isComplex ? { "data-complex": "true" } : {},
      },
    };
  },

  parseHTML() {
    return [
      { tag: "span[data-field-type]" },
      { tag: "span.editor-field" },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const displayText =
      HTMLAttributes["data-result"] ||
      HTMLAttributes["data-instruction"] ||
      "[Field]";

    return [
      "span",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        class: "editor-field",
        title: `Trường động Word: { ${HTMLAttributes["data-instruction"] || ""} }`,
      }),
      displayText,
    ];
  },
});
