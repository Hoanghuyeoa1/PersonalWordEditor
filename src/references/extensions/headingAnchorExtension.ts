import { Extension } from "@tiptap/core";

/**
 * HeadingAnchorExtension - Personal Word Editor (Phase 6.2 Architecture)
 *
 * Mở rộng thuộc tính cho node `heading` trong ProseMirror / Tiptap schema:
 * - Bổ sung attribute `id` kiểu string để lưu trữ semantic anchor ID bền vững (e.g. `ref_heading_...`).
 * - Hỗ trợ parseHTML và renderHTML (`<h1 id="...">`, `<h2 id="...">`, `<h3 id="...">`).
 * - Không làm xáo trộn options và levels của StarterKit.
 * - Tương thích ngược 100% với các tài liệu cũ chưa có ID.
 */
export const HeadingAnchorExtension = Extension.create({
  name: "headingAnchor",

  addGlobalAttributes() {
    return [
      {
        types: ["heading"],
        attributes: {
          id: {
            default: null,
            rendered: true,
            keepOnSplit: false,
            parseHTML: (element) => element.getAttribute("id"),
            renderHTML: (attributes) => {
              if (!attributes.id) {
                return {};
              }
              return { id: attributes.id };
            },
          },
        },
      },
    ];
  },
});
