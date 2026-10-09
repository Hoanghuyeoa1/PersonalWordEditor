import { Extension } from "@tiptap/core";

/**
 * ObjectAnchorExtension - Personal Word Editor (Phase 6.5 Architecture)
 *
 * Mở rộng thuộc tính `id` toàn cục cho các đối tượng đa phương tiện và khối nhúng:
 * - image, table, equation, shape, textBox.
 * - Cho phép các Caption và Cross-reference liên kết chính xác tới object ID.
 * - Tương thích ngược 100% với các tài liệu cũ chưa có ID.
 */
export const ObjectAnchorExtension = Extension.create({
  name: "objectAnchor",

  addGlobalAttributes() {
    return [
      {
        types: ["image", "table", "equation", "shape", "textBox"],
        attributes: {
          id: {
            default: null,
            rendered: true,
            keepOnSplit: false,
            parseHTML: (element) =>
              element.getAttribute("id") || element.getAttribute("data-object-id"),
            renderHTML: (attributes) => {
              if (!attributes.id) {
                return {};
              }
              return {
                id: attributes.id,
                "data-object-id": attributes.id,
              };
            },
          },
        },
      },
    ];
  },
});
