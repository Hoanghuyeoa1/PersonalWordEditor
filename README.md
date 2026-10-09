# Personal Word Editor

Trình soạn thảo văn bản desktop cá nhân cho Windows xây dựng trên nền tảng **React + TypeScript + Tiptap/ProseMirror** và đóng gói bằng **Tauri 2 (Rust Shell)**. Dự án được thiết kế chuyên biệt cho trải nghiệm soạn thảo mượt mà, độc lập, tối ưu hiệu năng và an toàn dữ liệu cá nhân.

---

## Trạng thái hiện tại: Track Changes 2.0 Completed (Toàn bộ Phase 1–13 Hoàn tất)

Dự án đã chính thức hoàn thành toàn bộ **Track Changes 2.0 (Phase 1–13: Theo dõi Định dạng Ký tự Character Formatting, Theo dõi Định dạng Đoạn văn Paragraph Formatting, Theo dõi Gán Kiểu Style Assignment, Giao diện Duyệt Thay đổi Thống nhất Unified Review UI & Sidebar, Chấp nhận/Từ chối Accept/Reject Đơn lẻ & Hàng loạt, Lịch sử Hoàn tác Undo/Redo Nguyên tử, Lưu trữ Bền vững .mwd và Tương thích Hai chiều Microsoft Word DOCX OOXML w:rPrChange / w:pPrChange)**.

Toàn bộ các tính năng theo dõi thay đổi nâng cao:
- **Theo dõi Định dạng Ký tự (Character Formatting Revisions)**: Bắt vết thay đổi Font Family, Font Size, Bold, Italic, Underline, Strike, Color, Highlight mà không nhân bản hay làm mất nội dung văn bản.
- **Theo dõi Định dạng Đoạn văn (Paragraph Formatting Revisions)**: Bắt vết thay đổi Căn lề (Alignment: Left, Center, Right, Justify), Giãn dòng (Line Spacing), Thụt lề (Indents), Spacing Before/After trên từng khối đoạn văn.
- **Theo dõi Gán Kiểu Dáng (Style Assignment Revisions)**: Theo dõi chuyển đổi giữa Normal, Heading 1–3 và các kiểu dáng tùy biến (Custom Styles), bảo toàn ID kiểu dáng và phả hệ kế thừa.
- **Thanh bên Đánh giá Hợp nhất (Unified Review Sidebar)**: Hiển thị danh sách thay đổi trực quan, phân biệt rõ Before/After values, Tác giả, Thời gian, Điều hướng Trước/Sau (Previous/Next), Bộ lọc theo Loại (Insert/Delete/Format) và Tác giả.
- **Chấp nhận & Từ chối Toàn diện (Accept & Reject Engine)**: Xử lý đơn lẻ hoặc hàng loạt (`Accept All` / `Reject All`) theo thứ tự an toàn, triệt tiêu trượt vị trí (index drift), khôi phục chính xác 100% định dạng gốc khi Reject.
- **Lịch sử Undo/Redo Nhất quán (History Consistency)**: Hoàn tác và làm lại đồng bộ hoàn hảo giữa nội dung AST, siêu dữ liệu Revision và trạng thái UI; không sinh metadata mồ côi hay vòng lặp transaction.
- **Lưu trữ Tệp .mwd & Đọc/Ghi DOCX Chuyên sâu**: Lưu trữ nguyên vẹn các thay đổi đang chờ duyệt (Pending Revisions) trong tệp `.mwd`; nhập và xuất hai chiều chuẩn WordprocessingML `<w:rPrChange>` và `<w:pPrChange>`.

Toàn bộ **1250 / 1250 bài kiểm thử** (100% PASS) trên toàn dự án đã được kiểm định nghiêm ngặt với tiêu chí Zero Regression.

---

### PHẦN 1: KIẾN TRÚC & TÍNH NĂNG TABLE ENGINE 2.0 HOÀN THIỆN (PHASE 1–13)

#### 1. Cấu trúc Hình học Bảng Nâng cao (Advanced Table Topology & Merging)
- **Gộp Ô Dọc (Vertical Merge - Rowspan)**:
  - Hỗ trợ gộp các ô liên tiếp theo chiều dọc (ví dụ A1, A2, A3 thành một ô có `rowspan = 3`).
  - ProseMirror AST chỉ biểu diễn các ô ngữ nghĩa hợp lệ; các continuation cell (ô kế thừa trong lưới hiển thị) không bị lưu dư thừa hay tạo node ma trong AST, ngăn ngừa tuyệt đối nguy cơ rách vỡ topology.
- **Gộp Ô Chữ Nhật (Rectangular Merge - Rowspan & Colspan)**:
  - Hỗ trợ gộp khối ô chữ nhật (ví dụ vùng chọn 2×2 thành ô có `rowspan = 2, colspan = 2`).
  - Lệnh tách ô (`splitCells`) phân rã chính xác ô gộp thành số ô ban đầu với thuộc tính và nội dung phân phối an toàn; `TableMap` duy trì tính hợp lệ tuyệt đối.
- **Kháng Ứng suất Cấu trúc (Structural Stress Resilience)**:
  - Các thao tác chèn/xóa hàng (`addRowBefore`, `addRowAfter`, `deleteRow`), chèn/xóa cột (`addColumnBefore`, `addColumnAfter`, `deleteColumn`), và bật/tắt hàng tiêu đề (`toggleHeaderRow`) trên bảng đã gộp ô đều được kiểm soát nghiêm ngặt.
  - Ngăn ngừa tình trạng cell selection bị treo hoặc phát sinh hàng/cột dị dạng.
  - Bảo vệ ranh giới tiêu đề: Ngăn gộp ô bắc qua hàng tiêu đề (`row 0`) và thân bảng để bảo toàn tính nguyên vẹn của luồng phân trang.

#### 2. Động cơ Co giãn & Phân phối (Table Sizing Engine & Distribution)
- **Tự động Co giãn theo Nội dung (AutoFit to Contents)**:
  - Tính toán độ rộng từng cột dựa trên nội dung thực tế (văn bản ngắn, đoạn văn dài, URL dài).
  - Thuật toán phân bổ thặng dư (`calculateAutoFitContentWidths`) bảo đảm các cột hẹp không bị thu nhỏ dưới ngưỡng an toàn (`minWidth = 50px`), đồng thời tỷ lệ thặng dư được co dãn cân bằng, không bao giờ vượt quá chiều rộng khả dụng của trang và ngăn chặn triệt để hiện tượng vỡ khung (runaway width).
- **Tự động Co giãn theo Cửa sổ / Khung trang (AutoFit to Window / Usable Body Bounds)**:
  - Căn cứ độc quyền trên hình học trang của Section hiện tại (`usableBodyBounds`):
    - Khổ A4 đứng (Portrait): tự động căn chỉnh trong phạm vi khả dụng ~602px (794px - lề 2×96px).
    - Khổ A4 ngang (Landscape): tự động tái tính toán theo khung ngang ~931px (1123px - lề 2×96px).
  - Tuyệt đối không phụ thuộc vào kích thước cửa sổ trình duyệt (browser window width), đảm bảo hiển thị in ấn và phân trang chuẩn xác trên mọi độ phân giải màn hình.
- **Độ rộng Cố định & Kéo dãn Cột (Fixed Width & Column Resizing)**:
  - Hỗ trợ thiết lập độ rộng cột cố định thông qua mảng thuộc tính `colwidth` trên từng ô.
  - Thao tác kéo rê ranh giới cột phát ra transaction nguyên tử duy nhất, cập nhật tức thì độ rộng cột lân cận mà không làm gián đoạn bộ đệm con trỏ.
- **Phân phối Đều Cột & Hàng (Distribute Columns & Distribute Rows)**:
  - Lệnh "Phân phối đều cột" (`distributeColumns`): san phẳng độ rộng tất cả các cột thành kích thước bằng nhau trong tổng chiều rộng bảng.
  - Lệnh "Phân phối đều hàng" (`distributeRows`): chuẩn hóa chiều cao các hàng thành giá trị đồng đều.
  - Toàn bộ thao tác phân phối được lưu trữ trong lịch sử Undo/Redo; hoàn tác (`Ctrl+Z`) khôi phục lại chính xác 100% kích thước ban đầu của từng cột/hàng.

#### 3. Khoảng đệm Ô & Chiều cao Hàng (Cell Margins & Row Heights)
- **Khoảng đệm Ô (Cell Margins / Padding)**:
  - Hỗ trợ cấu hình khoảng đệm mặc định của toàn bảng (`cellPadding` trên node `table`, mặc định trên/dưới 6px, trái/phải 8px).
  - Hỗ trợ ghi đè khoảng đệm riêng biệt cho từng ô cụ thể (`padding: { top, right, bottom, left }` trên node `tableCell` / `tableHeader`).
  - Khoảng đệm được tích hợp trực tiếp vào thuật toán ước lượng chiều cao hàng và phân trang `PageLayoutMap`, phản ánh chính xác dòng chảy trang.
- **Kiểm soát Chiều cao Hàng (Row Height Policies)**:
  - Hỗ trợ 3 chế độ chiều cao hàng trên `tableRow`:
    - `auto`: Chiều cao tự động ôm sát nội dung.
    - `atLeast`: Chiều cao tối thiểu (ví dụ `>= 1cm` / ~37.8px). Nội dung ngắn được giữ ở mức tối thiểu này; khi nội dung dài ra, hàng tự động mở rộng mà không bị cắt chữ.
    - `exact`: Chiều cao cố định chính xác. Hiển thị đúng chiều cao chỉ định mà không gây mất mát dữ liệu ngầm (no silent data loss).
  - Công cụ ước tính chiều cao hàng `estimateTableRowHeight` hỗ trợ phổ quát cả cấu trúc JSONContent tĩnh lẫn Fragment/Node ProseMirror trực tiếp.

#### 4. Hệ thống Kiểu Bảng & Thứ tự Ưu tiên (Table Styles Engine & 4-Tier Precedence)
- **Bộ Kiểu Bảng Tích hợp (Built-in Table Style Presets)**:
  - 5 phong cách chuẩn mực: `plain` (Tối giản), `grid` (Lưới cổ điển), `lightGrid` (Lưới sáng tinh tế), `mediumAccent` (Hiện đại có viền nhấn thương hiệu), `academic` (Hàn lâm chuẩn APA).
  - Tự động áp dụng màu nền hàng tiêu đề, hàng xen kẽ (banded rows), viền bảng và dóng hàng chuyên nghiệp.
- **Mô hình Phân giải Thứ tự Ưu tiên 4 Cấp (4-Tier Precedence Hierarchy)**:
  - `Cấp 1 (Base Defaults)`: Thuộc tính mặc định của bảng.
  - `Cấp 2 (Table Style)`: Kiểu dáng bảng được chọn (Header background, banded row zebra striping, đường viền style).
  - `Cấp 3 (Direct Cell Overrides)`: Ghi đè trực tiếp trên từng ô (`attrs.backgroundColor`, `attrs.borderColor`, `attrs.padding`). Khi người dùng tô vàng ô B3 rồi đổi kiểu bảng, ô B3 vẫn giữ nguyên màu vàng ghi đè.
  - `Cấp 4 (Cell Content Formatting)`: Định dạng đoạn văn (`textAlign`, `lineSpacing`, `paragraph style`) và định dạng ký tự (`bold`, `italic`, `color`, `characterStyle`) bên trong ô được bảo vệ 100%, tuyệt đối không bị style bảng ghi đè hay xóa bỏ.
- **Tiêu trừ Giao dịch Dư thừa (Transaction Consolidation)**:
  - Thao tác áp dụng style bảng trên bảng 100 hàng chỉ phát ra **duy nhất 1 transaction nguyên tử** cập nhật thuộc tính `attrs.styleId` trên node `table`, không quét hay ghi đè thuộc tính trên hàng nghìn ô đơn lẻ.

#### 5. Bảng biểu Đa trang & Lặp lại Tiêu đề (Multi-Page Table Flow & Repeat Header)
- **Phân luồng Bảng Quy mô Lớn (Large Table Multi-Page Flow)**:
  - Bảng biểu lớn (40–100+ hàng) tự động phân luồng qua nhiều trang giấy vật lý dựa trên ranh giới hàng nguyên tử (`Row-Boundary Pagination`).
  - Tính bất biến của AST (AST Immutability): Dù bảng hiển thị trên bao nhiêu trang, trong ProseMirror AST luôn luôn chỉ tồn tại **chính xác 1 node `table` duy nhất**.
- **Lặp lại Tiêu đề Bảng Trực quan (Repeat Header - Visual Only)**:
  - Thuộc tính `repeatHeader: true` trên node `table` kích hoạt hiển thị hàng tiêu đề lặp lại ở đầu mỗi trang tiếp theo (Trang 2, Trang 3...).
  - Hàng tiêu đề lặp lại hoàn toàn mang tính thị giác (`contenteditable="false"`), không sinh ra node giả hay ô có thể sửa trùng lặp trong AST, đảm bảo an toàn tuyệt đối cho công cụ tìm kiếm, thống kê số từ và con trỏ chuột.
- **Trải nghiệm Soạn thảo Đa trang Ổn định**:
  - Hỗ trợ chọn khối ô đa trang (`CellSelection`), di chuyển con trỏ, gõ phím, điều hướng `Tab` / `Shift+Tab`, và kéo co giãn cột diễn ra trơn tru xuyên qua các ranh giới trang giấy.

#### 6. Tích hợp Tham chiếu Chéo, Chú thích & Đánh giá (Captions, References & Review Engine)
- **Gắn kết Chú thích & Tham chiếu Chéo Bền vững (Stable Table Captions & Cross-References)**:
  - Bảng biểu được chèn chú thích (ví dụ `Bảng 1: Kết quả khảo sát`) liên kết qua định danh `targetId` bền vững.
  - Các thao tác gộp ô, đổi kiểu dáng, kéo giãn kích thước hay phân trang đa trang tuyệt đối không làm thay đổi hay tái sinh `targetId`.
  - Tham chiếu chéo tới bảng (Cross-reference to Table) phân giải chuẩn xác mọi lúc mà không bị đứt gãy liên kết.
- **Bảo toàn Nhãn Đánh giá & Bình luận (Comments & Track Changes Preservation)**:
  - Các ô chứa bình luận (`commentThread`), theo dõi thay đổi (`trackedInsert`, `trackedDelete`), hoặc kiểm tra ngữ pháp không bao giờ bị mất dấu ngữ nghĩa khi thực hiện gộp/tách ô, co giãn AutoFit, đổi kiểu bảng hoặc reflow phân trang.

#### 7. Bộ gõ Tiếng Việt & An toàn Soạn thảo Cốt lõi (Vietnamese IME & Core Editing)
- **Bảo vệ Trạng thái Tổ hợp (IME Composition Guard)**:
  - Khi gõ tiếng Việt tổ hợp (Telex/VNI) bên trong các ô bảng (kể cả ô đã gộp dọc hay ô nằm ở cuối trang), sự kiện phân trang và tính toán layout được tạm hoãn cho đến khi kết thúc tổ hợp (`compositionend`).
  - Triệt tiêu hoàn toàn hiện tượng mất dấu, mất ký tự, giật nhảy con trỏ chuột hay mất focus khỏi ô bảng.
- **Thao tác Soạn thảo Cốt lõi**:
  - Sao chép / dán bảng (`copy/paste`), Tìm kiếm & Thay thế (`Find/Replace`), và Hoàn tác / Làm lại (`Undo/Redo`) hoạt động hoàn hảo và an toàn trên toàn bộ cấu trúc bảng.

#### 8. Lưu trữ Bền vững Native .mwd & Chuẩn hóa Khôi phục (Persistence & Normalization)
- **Bảo toàn Toàn vẹn Dữ liệu**:
  - Định dạng `.mwd` lưu trữ trọn vẹn toàn bộ cấu trúc bảng nâng cao: `rowspan`, `colspan`, `colwidth`, `cellPadding`, `padding`, `rowHeight`, `rowHeightType`, `repeatHeader`, `styleId`, `backgroundColor`, `borderColor`.
- **Dịch vụ Chuẩn hóa & Tự động Sửa chữa (`TablePersistenceService`)**:
  - Khi mở tệp từ bên ngoài hoặc khôi phục dữ liệu: tự động kiểm tra tính hợp lệ của lưới bảng, tự động bù đắp ô bị thiếu, sửa chữa các giá trị `rowspan`/`colspan` vượt quá kích thước bảng, và chuẩn hóa các kiểu dáng không hợp lệ về mặc định.

#### 9. Tương thích Hai chiều với Microsoft Word (DOCX OOXML Round-Trip)
- **Xuất Gộp ô Dọc & Chữ nhật Chuẩn mực (WordprocessingML Grid Compliance)**:
  - Ô bắt đầu gộp dọc xuất thành `<w:vMerge w:val="restart"/>`.
  - Các ô tiếp nối bên dưới (continuation cells) được tự động sinh đầy đủ với `<w:vMerge w:val="continue"/>` và `<w:tcPr>`, đảm bảo tuân thủ nghiêm ngặt chuẩn cấu trúc lưới của Microsoft Word; không bỏ sót continuation cell làm hỏng hoặc cảnh báo corrupt tệp Word.
  - Ô gộp chữ nhật kết hợp hoàn hảo `<w:gridSpan w:val="N"/>` và `<w:vMerge>`.
- **Xuất Tiêu đề Lặp lại & Thuộc tính Nâng cao**:
  - Hàng tiêu đề có `repeatHeader: true` xuất thành thẻ `<w:tblHeader/>` trên hàng tiêu đề ngữ nghĩa duy nhất. Tuyệt đối không xuất các hàng lặp lại thị giác thành dữ liệu văn bản Word.
  - Xuất chuẩn xác khoảng đệm ô `<w:tblCellMar>` (toàn bảng) và `<w:tcMar>` (từng ô).
  - Xuất chiều cao hàng `<w:trHeight w:val="..." w:hRule="atLeast|exact"/>`.
  - Xuất màu nền ô `<w:shd w:fill="..."/>` và kiểu dáng bảng.
- **Nhập Bảng Nâng cao từ DOCX (Advanced DOCX Table Import)**:
  - Phân tích chính xác `<w:vMerge restart/continue>` và `<w:gridSpan>` thành `rowspan` và `colspan` chuẩn xác của Table Engine 2.0; loại bỏ an toàn các continuation cell thừa trong AST.
  - Đọc chính xác `<w:tblHeader>`, lề ô, chiều cao hàng và kiểu dáng bảng từ tài liệu Word gốc.

#### 10. Tối ưu Hiệu năng, Bộ nhớ đệm & Giao dịch (Performance, Caching & Transactions)
- **Bộ nhớ đệm Hình học & Phân trang Thông minh (Geometry & TableMap Caching)**:
  - `PageLayoutMap` lưu trữ bộ nhớ đệm chiều cao hàng (`cachedTableRowHeight`). Khi gõ một ký tự trong một ô, chỉ hàng đó được đánh dấu đo đạc lại; các hàng khác tái sử dụng kết quả đệm tức thì.
  - Tránh tính toán lại TableMap hoặc kiểu bảng không cần thiết trong các transaction nhập văn bản thông thường.
- **Kiểm định Bảng Quy mô Lớn (Real-World Stress Testing)**:
  - Thử nghiệm thực tế với bảng 50 hàng, 100 hàng, 20 cột, bảng gộp ô phức tạp và bảng đa trang: phản hồi cuộn trang mượt mà, gõ phím tức thì (< 5ms per keystroke), và thời gian phân trang toàn bộ bảng 100 hàng diễn ra trong chớp mắt.

#### 11. Ranh giới Rõ ràng & Giới hạn Nhận biết Còn lại (Out of Scope / Known Limitations)
- **Không nằm trong phạm vi (Explicit Out of Scope)**:
  - **Spreadsheet / Formulas Engine**: Không hỗ trợ công thức tính toán bảng tính Excel (`SUM(A1:B2)`, hàm toán học, v.v.). Bảng phục vụ trình bày văn bản chuẩn Word.
  - **Database Sorting & Filtering**: Không tích hợp bộ máy sắp xếp cột hoặc bộ lọc dữ liệu cơ sở dữ liệu.
  - **PivotTable**: Không hỗ trợ bảng tổng hợp xoay chiều.
  - **Conditional Formatting**: Không hỗ trợ quy tắc định dạng có điều kiện tự động theo giá trị số.
  - **Floating Tables with Complex Wrap**: Bảng được đặt theo dòng khối văn bản (block layout); chưa hỗ trợ bảng nổi tự do kéo thả với văn bản uốn lượn xung quanh.
  - **Full Word Theme Colors Ecosystem**: Bảng sử dụng 5 preset kiểu dáng tinh tuyển và bảng màu tích hợp; chưa hỗ trợ hệ thống Theme XML phức tạp toàn diện của Office.
  - **Collaborative Real-time Tables**: Chưa hỗ trợ phân giải xung đột gộp ô đồng thời thời gian thực qua WebSockets/CRDT.
  - **Dedicated PDF Engine**: Chưa tích hợp bộ xuất file PDF độc lập.

---

### PHẦN 2: KIẾN TRÚC & TÍNH NĂNG REFERENCES ENGINE HOÀN THIỆN (PHASE 1–11)

#### 1. Hệ thống Danh mục Hình ảnh, Bảng biểu & Công thức (Caption Lists / Table of Figures)
- **Hỗ trợ Đa Nhãn Độc lập (Multi-Label Isolation)**:
  - Hỗ trợ tạo danh mục cho tất cả các loại nhãn: `Figure` (Danh mục hình), `Table` (Danh mục bảng), `Equation` (Danh mục công thức), và các nhãn tùy biến (Custom labels).
  - Khử nhiễm chéo tuyệt đối: Danh mục hình chỉ chứa các mục `Figure`, danh mục bảng chỉ chứa `Table`; cập nhật danh mục này không làm ảnh hưởng hay xáo trộn danh mục khác.
- **Node Ngữ nghĩa Bất biến AST (`captionList`)**:
  - Lưu trữ dưới dạng Block Atom Node với các thuộc tính: `id`, `title`, `label`, `preset` (`classic`, `modern`, `formal`), `options` (`showPageNumbers`, `rightAlignPageNumbers`, `tabLeader`, `includeLabelAndNumber`), và mảng `entries` được lưu trữ để kết xuất tức thì (0ms scan per render).
- **Tùy biến Bố cục & Trực quan Chuyên nghiệp**:
  - Dấu chấm dẫn hướng linh hoạt: `dots` (`.......`), `dashes` (`-------`), `underline` (`_______`), hoặc `none`.
  - Hiển thị hoặc ẩn số trang, dóng hàng số trang sát lề phải chuẩn mực xuất bản.
- **Điều hướng Một chạm (One-Click Navigation)**:
  - Nhấp chuột vào bất kỳ mục nào trong danh mục tự động cuộn trang và di chuyển con trỏ soạn thảo chính xác vào khối chú thích (`caption`) tương ứng mà không làm biến đổi văn bản.

#### 2. Cập nhật Danh mục & Phím tắt F9 Nhạy Ngữ cảnh (Update Caption List & Contextual F9)
- **Nút Ribbon Thông minh**:
  - Nút "Cập nhật danh mục" trên References Ribbon tự động nhận diện tài liệu có danh mục chú thích hay không, hiển thị tooltip hướng dẫn chi tiết và phím tắt `F9`.
- **Bộ điều phối F9 Nhạy Ngữ cảnh (Contextual Dispatcher)**:
  - Khi con trỏ nằm trong khối **Table of Contents (Mục lục)** $\to$ F9 cập nhật Mục lục.
  - Khi con trỏ nằm trong khối **Caption List (Danh mục hình/bảng)** $\to$ F9 cập nhật đúng Danh mục đó.
  - Khi con trỏ nằm trong khối **Bibliography (Tài liệu tham khảo)** $\to$ F9 cập nhật Danh mục tài liệu tham khảo.
  - Khi con trỏ nằm ngoài $\to$ ưu tiên cập nhật danh mục gần nhất hoặc thông báo hướng dẫn rõ ràng, không gây xung đột lệnh.
- **Tự động Cập nhật Động (Real-time Re-indexing)**:
  - Khi chèn thêm hình ảnh ở giữa các hình hiện có, xóa hình ảnh, hoặc đổi số trang, lệnh cập nhật tự động đánh số lại (`Figure 1`, `Figure 2`, `Figure 3`), cập nhật văn bản chú thích, và đồng bộ số trang chính xác theo công cụ phân trang trung tâm `PageLayoutMap`.

#### 3. Hệ thống Thẻ Đánh dấu Ngữ nghĩa (Bookmark Engine)
- **Kiến trúc Neo Kép (Dual Anchor Architecture)**:
  - **Position Bookmark (Caret Anchor)**: Neo tại vị trí con trỏ (độ dài 0) bằng Inline Atom Node `bookmarkAnchor` (`ref_bookmark_<id>`).
  - **Range Bookmark (Selection Mark)**: Neo bao bọc dải văn bản được chọn bằng Mark `bookmark` (`ref_bookmark_<id>`).
- **Hộp thoại Quản lý Thẻ đánh dấu (`BookmarkManagerDialog`)**:
  - Thêm thẻ mới (`Add Bookmark`), đổi tên (`Rename`), xóa (`Delete`), và đi đến vị trí thẻ (`Go To`).
  - Sắp xếp linh hoạt theo Tên thẻ (Alphabetical) hoặc Vị trí xuất hiện trong tài liệu (Location).
  - Tự động điền tên thẻ từ văn bản đang bôi đen; hỗ trợ đầy đủ tiếng Việt có dấu.
  - Kiểm tra trùng lặp không phân biệt hoa thường (Case-insensitive validation) và khử xung đột tên an toàn.
- **An toàn Lịch sử (Undo/Redo History Safety)**:
  - Toàn bộ thao tác thêm, xóa, đổi tên bookmark được tích hợp vào ProseMirror transaction, hoàn tác/làm lại trơn tru và bảo vệ tuyệt đối không bao giờ làm mất văn bản tài liệu của người dùng.

#### 4. Tham Chiếu Chéo tới Thẻ Đánh dấu (Bookmark Cross-References)
- **Mở rộng Hộp thoại Tham chiếu chéo**:
  - Bổ sung loại mục tiêu "Thẻ đánh dấu" (Bookmark) song song với Heading, Caption, Footnote, Endnote.
  - 3 chế độ hiển thị: "Văn bản thẻ đánh dấu" (Bookmark text), "Số trang" (Page number), "Số đoạn/vị trí" (Paragraph/relative position).
- **Liên kết bằng Định danh Bền vững (Stable ID Tracking)**:
  - Tham chiếu chéo liên kết tới bookmark thông qua `ref_bookmark_<id>`. Khi người dùng đổi tên bookmark, liên kết tham chiếu vẫn duy trì 100% độ chính xác.
- **Cơ chế Chống Sập khi Mất Mục tiêu (Broken Reference Protection)**:
  - Khi bookmark bị xóa, tham chiếu chéo hiển thị cảnh báo `[Reference not found]`. Khi người dùng Undo thao tác xóa, liên kết tự động phân giải lại chính xác.

#### 5. Phân trang Chính thống (Authoritative Page Flow Integration)
- **Nguồn Chân lý Duy nhất**:
  - Mọi số trang hiển thị trong Caption Lists và Bookmark Cross-References được truy vấn trực tiếp từ `PageLayoutMap` thông qua `usePaginationStore`.
  - Khi hình ảnh hoặc thẻ đánh dấu di chuyển trang (ví dụ từ Trang 5 sang Trang 6 do chèn nội dung phía trước), cập nhật danh mục hoặc trường tham chiếu sẽ phản ánh số trang mới chính xác.

#### 6. Lưu trữ Bền vững Native .mwd & Chuẩn hóa Khôi phục
- **Bảo toàn Toàn vẹn Cấu trúc**:
  - Lưu và nạp chuẩn xác `doc.references.captionLists` và `doc.references.bookmarks` cùng toàn bộ nodes/marks trong ProseMirror AST.
- **Tự động Sửa chữa Dị tật (Sanitization & Repair)**:
  - Chuẩn hóa hai chiều: Tự động dọn dẹp các bookmark mồ côi (chỉ có trong metadata mà không có trong AST) và tự động bù đắp metadata cho các node/mark bookmark hợp lệ trong AST.
  - Tương thích ngược: Nạp an toàn tệp `.mwd` cũ từ các phiên bản trước mà không làm hỏng cấu trúc tài liệu.

#### 7. Tương thích Hai chiều với Microsoft Word (DOCX OOXML Interoperability)
- **Xuất Bookmark sang OOXML Chuẩn mực**:
  - Ánh xạ Stable ID nội bộ sang định danh số nguyên Word `w:id` một cách tất định.
  - Làm sạch và chuẩn hóa tên thẻ sang định dạng hợp lệ của Word (`^[a-zA-Z_][a-zA-Z0-9_]*$`, tối đa 35 ký tự, tự động khử trùng lặp có thứ tự).
  - Xuất cặp thẻ `<w:bookmarkStart>` và `<w:bookmarkEnd>` liền kề cho Position Bookmark hoặc bao bọc run văn bản cho Range Bookmark.
- **Nhập Bookmark từ DOCX của Word**:
  - Phân tích chính xác cặp thẻ bookmarkStart/bookmarkEnd, tự động nhận diện Position vs Range Bookmark.
  - Lọc bỏ chính xác các bookmark kỹ thuật tự sinh của Word: `_GoBack`, `_Toc*`, `_Ref*`, `_Hlk*`.
  - Kháng lỗi OOXML dị dạng: Thẻ đóng không mở, thẻ mở không đóng, hoặc trùng ID đều được xử lý an toàn mà không làm mất văn bản.

#### 8. Ranh giới Rõ ràng & Giới hạn Nhận biết Còn lại (Out of Scope / Limitations)
- **Không nằm trong phạm vi (Explicit Out of Scope)**:
  - **Index / Subject Index**: Chưa hỗ trợ bảng tra cứu từ khóa chữ cái cuối tài liệu.
  - **Table of Authorities**: Chưa hỗ trợ bảng trích dẫn án lệ/văn bản pháp luật.
  - **Full Word Fields Engine**: Chưa có bộ máy thông dịch trường Word tổng quát (`{ SEQ }`, `{ PAGEREF }`, v.v.).
  - **Advanced Hyperlink Bookmarks**: Chưa hỗ trợ liên kết hyperlink trực tiếp tới bookmark.
  - **AI References & Cloud Sharing**: Không sử dụng AI tạo tham khảo, không hỗ trợ bookmark chia sẻ đám mây.
  - **PDF Engine**: Xuất file định dạng in ấn PDF chuyên dụng chưa được tích hợp.

---

### PHẦN 3: KIẾN TRÚC & TÍNH NĂNG PAGINATION ENGINE 2.0 (HOÀN TẤT)

#### 1. Mô hình Phân trang Luồng Trang Thực tế (True Page Flow & Runtime Layout Model)
- **Bất biến Tuyệt đối ProseMirror AST (Strict AST Immutability)**:
  - ProseMirror AST chỉ đại diện cho mô hình dữ liệu ngữ nghĩa (Semantic Document Model): một đoạn văn dài qua nhiều trang vẫn là **chính xác 1 node `paragraph`**, một bảng biểu 50 hàng qua 3 trang vẫn là **chính xác 1 node `table`**.
  - Tuyệt đối không tự động cắt xén, không chèn node `pageBreak` giả, không nhân bản các hàng bảng trong AST chỉ để phục vụ hiển thị.
- **Mô hình Phân mảnh Thị giác Thời gian Chạy (Runtime Visual Layout Fragments)**:
  - `PageLayoutMap` tính toán và quản lý tập hợp các `LayoutFragment`: mỗi fragment mang tọa độ kết xuất vật lý `(x, y, width, height)` trên một trang cụ thể, liên kết với dải vị trí `[from, to)` trong AST tài liệu.
  - Áp dụng quy ước dải vị trí nửa mở (Half-Open Interval `[from, to)`) đồng bộ hoàn hảo với hệ tọa độ con trỏ của ProseMirror.
  - Phân mảnh dòng văn bản (`lineIndex`, `isFirstFragment`, `isLastFragment`, `continuedFromPreviousPage`, `continuesToNextPage`) cho phép hiển thị mượt mà liên tục qua các trang giấy.
- **Nguồn Chân lý Duy nhất cho Số trang (Single Source of Truth - Central Page Mapping)**:
  - Toàn bộ ứng dụng (Thanh trạng thái StatusBar "Trang X / Y", Mục lục TOC, Tham chiếu chéo Cross-references, Thống kê Document Statistics, Đề mục Heading Navigation) truy vấn số trang độc quyền từ `PageLayoutMap` thông qua `usePaginationStore`.
  - Loại bỏ hoàn toàn các thuật toán ước tính phân trang rời rạc cạnh tranh; các hàm cũ (`calculatePaginationState`) chỉ được giữ lại làm compatibility fallback adapter khi cần thiết.

#### 2. Quy tắc Phân trang Đoạn văn Nâng cao (Paragraph Pagination Rules)
- **Giữ Liền Đoạn Kế Tiếp (`keepWithNext`)**:
  - Tự động gom cụm khối hiện tại và khối tiếp theo; nếu khoảng trống ở trang hiện tại không đủ, chuyển toàn bộ khối sang trang sau.
  - Hỗ trợ chuỗi kế tiếp liên hoàn (Chained `keepWithNext`: Heading 1 $\to$ Heading 2 $\to$ Paragraph follower) di chuyển liền mạch cùng nhau.
  - Thiết kế generic block policy: áp dụng cho Heading, Đoạn văn, Bảng biểu, Hình ảnh, và Chú thích (Caption).
- **Giữ Toàn bộ Dòng trong Đoạn (`keepLinesTogether`)**:
  - Nếu đoạn văn có thể nằm trọn trong trang trống khả dụng, chuyển toàn bộ đoạn văn sang trang sau thay vì cắt đôi.
  - Cơ chế phòng thủ ngoại cỡ (Oversized Fallback): nếu đoạn văn dài hơn toàn bộ một trang, hệ thống tự động thư giãn quy tắc để phân mảnh qua các trang, triệt tiêu nguy cơ treo lặp vô hạn.
- **Kiểm soát Dòng Đơn độc (Widow / Orphan Control)**:
  - Mặc định chuẩn in ấn: tối thiểu 2 dòng đầu đoạn ở trang trước (`minOrphanLines = 2`) và tối thiểu 2 dòng cuối đoạn ở trang sau (`minWidowLines = 2`).
  - Tự động nhường dòng giữa các trang để không để lại bất kỳ dòng mồ côi đơn độc nào ở đáy trang hoặc đầu trang.
- **Bắt đầu ở Trang Mới (`pageBreakBefore`)**:
  - Khối có `pageBreakBefore: true` luôn bắt đầu tại đỉnh trang mới nếu trang hiện tại đã có nội dung.
  - Không sinh ra node `pageBreak` giả trong AST; nếu khối đã ở đầu trang mới, không tạo trang trống thừa thãi.
- **Thứ tự Ưu tiên Định dạng (Precedence Hierarchy)**:
  - `Built-in Defaults (Normal: widowControl)` $\to$ `Style Definitions (Heading: keepWithNext)` $\to$ `Direct Paragraph Attributes Overrides`.

#### 3. Bảng biểu Đa trang & Dòng chảy Hàng (Multi-Page Table Flow)
- **Phân trang theo Ranh giới Hàng Nguyên tử (Row-Boundary Pagination)**:
  - Hàng bảng (`tableRow`) là đơn vị phân trang nguyên tử: các hàng không bao giờ bị cắt ngang giữa chừng.
  - Bảng biểu lớn (40–100+ hàng) tự động phân luồng qua nhiều trang giấy vật lý; AST giữ nguyên vẹn 1 table duy nhất.
- **Lặp lại Tiêu đề Bảng Trực quan (Repeated Table Header - Visual Only)**:
  - Khi bật `repeatHeader: true`, các phân mảnh bảng từ trang thứ 2 trở đi hiển thị hàng tiêu đề lặp lại để người đọc dễ theo dõi.
  - Hàng tiêu đề lặp lại hoàn toàn chỉ mang tính thị giác (visual presentation), không thể chỉnh sửa (`contenteditable="false"`), không sinh node giả trong AST.
- **An toàn Tương tác Soạn thảo Bảng (Table Editing Safety)**:
  - Lựa chọn ô đa trang (`CellSelection`) hoạt động chính xác qua các trang giấy.
  - Điều hướng bàn phím (`Tab`, `Shift+Tab`, phím mũi tên) chuyển ô mượt mà giữa đáy trang trước và đầu trang tiếp theo.
  - Các thao tác cấu trúc bảng (thêm/xóa hàng, thêm/xóa cột, gộp ô `mergeCells`, tách ô `splitCells`, co giãn cột `column resize`) tự động reflow layout mà không làm rách vỡ phân mảnh.

#### 4. Đa Phân phần & Hình học Trang Hỗn hợp (Sections & Mixed Geometry)
- **Cách ly Ranh giới Section Tuyệt đối (Strict Section Isolation)**:
  - Phân mảnh nội dung tuyệt đối không vượt qua (cross) ranh giới Section Break.
  - Mỗi section có thể sở hữu cấu hình độc lập: Khổ giấy (A4, A3, Letter, Legal), Hướng trang (Portrait, Landscape), và Lề trang tùy chỉnh (Normal, Narrow, Wide, Custom mm).
- **Tính toán Vùng Thân Khả dụng Chuẩn xác (Usable Body Bounds)**:
  - `usableBodyBounds` tính toán độc lập cho từng trang dựa trên cấu hình Section của trang đó, loại trừ lề trên, lề dưới, vùng Header và Footer.
  - Trường số trang động `{PAGE}` và `{NUMPAGES}` tự động đồng bộ theo thời gian thực từ `PageLayoutMap`.

#### 5. Khối Đối tượng Nguyên tử & Gom nhóm Chú thích (Non-Splittable Objects & Captions)
- **Khối Đối tượng Không Phân mảnh (Atomic Blocks)**:
  - Hình ảnh (`image`), Khối hình (`shape`), Công thức toán (`equation`), Đường kẻ ngang (`horizontalRule`), Hộp văn bản (`textBox`), Khối Mục lục (`tableOfContents`), và Danh mục tham khảo (`bibliography`) di chuyển nguyên tử sang trang mới khi không đủ chỗ.
  - Xử lý khối ngoại cỡ (Controlled Overflow): nếu chiều cao đối tượng lớn hơn dung tích toàn bộ một trang, đặt tại đầu trang mới và chấp nhận tràn vùng hiển thị có kiểm soát, ngăn chặn 100% vòng lặp sinh trang vô hạn.
- **Gom nhóm Chú thích Ngữ nghĩa (Generic Semantic Caption Grouping)**:
  - Nhận biết liên kết `targetId` và chính sách vị trí `positionPolicy`:
    - `below`: Đối tượng (Hình/Bảng/Công thức) đi trước, Caption đi sau $\to$ tự động gom nhóm di chuyển cùng nhau nếu đáy trang không đủ chỗ, không để hình ở đáy trang 1 và chú thích ở đầu trang 2.
    - `above`: Caption đi trước, Đối tượng đi sau $\to$ gom nhóm di chuyển cùng nhau sang trang sau.

#### 6. Tái Phân trang Tăng dần & Tối ưu Hiệu năng (Incremental Reflow & Performance)
- **Phát hiện Thay đổi Ảnh hưởng Bố cục (Layout-Affecting Detection)**:
  - Chỉ kích hoạt đo đạc lại bố cục khi có thay đổi ảnh hưởng kích thước (nhập văn bản, xóa, đổi font, giãn dòng, lề, khổ giấy, thay đổi kích thước bảng/ảnh).
  - Các thao tác không đổi bố cục (di chuyển con trỏ, bôi đen văn bản, rê chuột vào bình luận, bấm nút Ribbon) phản hồi tức thì với thời gian xử lý **0ms remeasure**.
- **Vùng Bẩn Tăng dần & Bộ nhớ đệm Đo đạc (Dirty Range & DOM Measurement Cache)**:
  - `reflowManager` theo dõi vị trí bẩn sớm nhất (`dirtyFromPos`); các khối ổn định trước vùng bẩn tái sử dụng kết quả đo đạc từ bộ nhớ đệm (`cachedLines`, `cachedTableRowHeight`), đạt tỷ lệ cache hit > 95% khi gõ phím.
- **Bảo vệ Bộ gõ Tiếng Việt (Vietnamese IME Safety Guard)**:
  - Trong quá trình gõ tiếng Việt tổ hợp (Telex/VNI composition), hook tự động tạm hoãn (defer) các tính toán reflow nặng cho tới sự kiện `compositionend`, bảo đảm không rớt chữ, không nhảy con trỏ hay gián đoạn trải nghiệm gõ.
- **Phòng vệ Chống Vòng lặp Layout (Convergence Guard & Max Pass Limiter)**:
  - Giới hạn tối đa số lượt reflow liên tiếp và tự động phát hiện trạng thái hội tụ (`checkConvergence`) để ngăn chặn tuyệt đối tình trạng layout ping-pong hay đơ giao diện.

#### 7. An toàn Khi Thất bại (Failure Safety & Fault Tolerance)
- Khi quá trình đo đạc DOM thời gian thực gặp sự cố ngoại lệ bất khả kháng, hệ thống tự động fallback về thuật toán ước lượng phân trang an toàn.
- Trình soạn thảo **tiếp tục hiển thị nội dung, cho phép chọn, sao chép, chỉnh sửa và lưu tệp bình thường, không làm sập ứng dụng và không làm hỏng cấu trúc ProseMirror AST**.

#### 8. Lưu trữ Bền vững Native .mwd & Chuẩn hóa OOXML DOCX
- **Tuyệt đối Không Lưu Bố cục Thời gian Chạy (Semantic-Only Persistence)**:
  - Tệp `.mwd` chỉ lưu trữ các thuộc tính ngữ nghĩa (`keepWithNext`, `keepLinesTogether`, `pageBreakBefore`, `widowControl`) trong thuộc tính đoạn văn hoặc Style Definitions.
  - Tuyệt đối không lưu chỉ số trang, tọa độ pixel, kích thước DOM hay các fragment vào tệp đĩa.
- **Tương thích Hai chiều với Microsoft Word (DOCX OOXML)**:
  - Nhập/Xuất chính xác: `<w:keepNext>`, `<w:keepLines>`, `<w:pageBreakBefore>`, `<w:widowControl>`.
  - Luồng phân trang tự động tuyệt đối không bị xuất thành các thẻ ngắt trang cưỡng bức `<w:br w:type="page"/>`.

#### 9. Giới hạn Nhận biết Còn lại (Known Limitations / Out of Scope)
- **Floating Objects with Text Wrapping**: Chưa hỗ trợ các chế độ bao quanh văn bản phức tạp kiểu Tight/Through (hiện hỗ trợ In Line with Text và Top/Bottom block flow).
- **Multi-column Layout**: Chưa hỗ trợ chia nhiều cột văn bản độc lập trong cùng một trang (hiện hỗ trợ bố cục 1 cột tiêu chuẩn).
- **Per-Page Footnotes**: Chú thích chân trang hiện được tập trung tại thanh điều hướng hoặc cuối phần/văn bản.
- **Desktop Publishing / Master Pages**: Chưa hỗ trợ lưới dàn trang tạp chí chuyên biệt hay master pages.

---

### PHẦN 4: KIẾN TRÚC & TÍNH NĂNG STYLES ENGINE 2.0 (HOÀN TẤT)

#### 1. Kiến trúc Cốt lõi (Core Architecture)
- **Nguồn Chân lý Duy nhất (Single Source of Truth)**:
  - Danh mục style được lưu trữ tập trung tại `DocumentModel.styles.definitions` (`DocumentStyle[]`).
  - Giao diện và các thành phần UI **tuyệt đối không mutate DocumentModel trực tiếp** mà đi qua các Service & Command chuẩn (`styleCommands.ts`, `applyStyleService.ts`, `styleManagementService.ts`).
- **AST Ngữ nghĩa Phân biệt Diện mạo (Semantic vs Visual Separation)**:
  - ProseMirror AST lưu trữ các tham chiếu style: thuộc tính `attrs.styleId` trên các textblock node (`paragraph`, `heading`) và mark `characterStyle` (`attrs.styleId`) trên text runs.
  - Các cấp đề mục Heading 1/2/3 luôn giữ nguyên bản chất node ngữ nghĩa `{ type: "heading", attrs: { level: 1 | 2 | 3 } }`, không bị suy thoái thành paragraph thông thường khi tùy biến visual style.
  - Tài liệu vẫn bảo toàn 100% chức năng phân cấp đề mục: Document Outline Sidebar, Table of Contents (TOC), và Cross-references.
- **Tiêm Stylesheet Động (Dynamic Stylesheet Injection)**:
  - Dịch vụ `styleStylesheetService.ts` tạo động và chèn thẻ `<style id="editor-document-styles">` vào DOM.
  - Khi người dùng chỉnh sửa định nghĩa style, chỉ cần cập nhật stylesheet scoped; **không cần quét lại hay mutate toàn bộ ProseMirror document AST**.
- **Bộ máy Phân giải & Kế thừa Hiệu năng cao (Style Resolution Engine)**:
  - `StyleResolutionEngine` hỗ trợ kế thừa đa cấp (`basedOn`) cho cả Paragraph và Character properties.
  - Hỗ trợ lưu bộ nhớ đệm (caching) với thời gian truy xuất dưới 1ms cho các style đã phân giải.
  - Hủy bộ nhớ đệm có mục tiêu (`invalidateCache` / `collectDescendants`): khi một style cha thay đổi, chỉ xóa cache của các style con cháu kế thừa trực tiếp hoặc gián tiếp.
  - Phòng thủ chu trình: Tự động ngắt và hóa giải kế thừa vòng (`circular basedOn`), xử lý an toàn khi thiếu cha (`missing parent fallback`).
- **Thứ tự Ưu tiên Định dạng (Precedence Hierarchy)**:
  - Định dạng đoạn văn: `Default (Normal)` $\to$ `Inherited Paragraph Style` $\to$ `Direct Paragraph Attributes (attrs.textAlign, attrs.lineSpacing, attrs.spacingBefore/After, indents, pagination rules)`.
  - Định dạng ký tự: `Default Font/Size` $\to$ `Paragraph Style Character Props` $\to$ `Inherited Character Style` $\to$ `Direct Character Marks (bold, italic, underline, strike, textStyle, highlight)`.

#### 2. Tính năng Người dùng (User-Facing Features)
- **Styles Gallery 2.0 (Thanh Phong cách Trực quan)**:
  - Tích hợp trên tab Home Ribbon: Hiển thị nhanh các built-in styles thông dụng (`Normal`, `Heading 1`, `Heading 2`, `Heading 3`) và các custom styles được dùng thường xuyên.
  - Tự động nhận diện và làm nổi bật style đang áp dụng tại vị trí con trỏ hoặc vùng chọn hỗn hợp (mixed selection).
  - Menu mở rộng: Hỗ trợ truy cập nhanh các tính năng "Create Style", "Manage Styles", "Clear Formatting", "Update Style to Match Selection".
- **Quản lý Style Toàn diện (Style Management)**:
  - **Tạo Style mới (Create Style)**: Tạo Paragraph Style hoặc Character Style với tên hợp lệ, chọn kiểu kế thừa `basedOn`, cấu hình phông chữ, cỡ chữ, màu sắc, giãn dòng, căn lề, thụt lề.
  - **Chỉnh sửa Style (Modify Style)**: Cập nhật định nghĩa style theo thời gian thực; toàn bộ các đoạn văn hoặc chuỗi văn bản đang áp dụng style đó sẽ tự động cập nhật diện mạo tức thì.
  - **Đổi tên & Nhân bản (Rename / Duplicate Style)**: Đổi tên style an toàn, sinh bản sao với định danh duy nhất (Unique ID).
  - **Xóa Style An toàn (Delete Safety)**: Bảo vệ tuyệt đối các built-in styles (`Normal`, `Heading 1..3`, `Emphasis`, `Strong`) không thể bị xóa; khi xóa custom style đang sử dụng, hệ thống tự động tái gán các đoạn văn về `Normal` để tránh lỗi styleId mồ côi (Orphan styleId).
  - **Cập nhật Style theo Vùng chọn (Update Style to Match Selection)**: Đồng bộ định dạng thực tế đang chọn vào định nghĩa style tương ứng, đồng thời dọn sạch các direct overrides dư thừa.
- **Định dạng Đoạn văn Nâng cao**:
  - Khoảng cách trước đoạn (`spacingBefore`) và sau đoạn (`spacingAfter`) theo đơn vị point chuẩn.
  - Giãn dòng (`lineSpacing`): Đơn, 1.15, 1.5, Đôi, và tùy chỉnh tự do.
  - Thụt lề chuyên nghiệp: Thụt lề trái (`leftIndent`), Thụt lề phải (`rightIndent`), Thụt lề dòng đầu (`firstLineIndent`), và Nhô lề dòng đầu (`hangingIndent`) loại trừ lẫn nhau, chuyển đổi chính xác giữa cm, inch, pt và twips.
- **Đồng tồn tại An toàn với Review Engine**:
  - Áp dụng hoặc thay thế Character Style tuyệt đối không làm mất các semantic marks lân cận: Bình luận (Comments), Theo dõi thay đổi (Track Changes insert/delete), Kiểm tra chính tả/ngữ pháp (Proofing decorations), và Siêu liên kết (Hyperlinks).

#### 3. Lưu trữ Tệp Native .mwd & Tương thích Ngược
- Định dạng `.mwd` (v1) lưu trữ nguyên vẹn `doc.styles.definitions` cùng các thuộc tính ngữ nghĩa.
- Tự động nhận diện và mở an toàn các tệp `.mwd` cũ thiếu khối styles, tự động bổ sung 4 styles hệ thống mặc định mà không làm thay đổi cấu trúc tài liệu.
- Cơ chế chuẩn hóa phòng thủ (`normalizeStyleCollection`): Tự động sửa chữa dị tật khi mở tệp từ nguồn bên ngoài (tên rỗng, ID trùng lặp, kế thừa vòng).

#### 4. Nhập & Xuất DOCX Chuẩn mực (OOXML ISO/IEC 29500)
- **DOCX Semantic Import**:
  - Đọc trực tiếp `word/styles.xml`, phân tích các khối `<w:style w:type="paragraph">` và `<w:style w:type="character">`.
  - Ánh xạ chính xác các thuộc tính đoạn văn (`<w:jc>`, `<w:spacing>`, `<w:ind>`) và ký tự (`<w:rFonts>`, `<w:sz>`, `<w:b>`, `<w:i>`, `<w:u>`, `<w:color>`, `<w:highlight>`).
  - Phân tích kế thừa `w:basedOn`, gán `w:pStyle` thành `attrs.styleId` trên paragraph/heading, gán `w:rStyle` thành mark `characterStyle`.
- **DOCX Semantic Export**:
  - Tạo cấu trúc `word/styles.xml` chuẩn với các thẻ `<w:style>`, bảo toàn toàn bộ cây kế thừa.
  - Phát ra `<w:pStyle w:val="...">` trên đoạn văn và `<w:rStyle w:val="...">` trên text run.
  - Chuẩn hóa định danh style thành XML NCName an toàn, loại bỏ dấu tiếng Việt và ký tự đặc biệt, chống 100% va chạm ID.
  - Bảo lưu chính xác định dạng ghi đè trực tiếp (direct formatting) song song với semantic styles.

---

### PHẦN 5: CÁC PHÂN HỆ ĐÃ HOÀN THÀNH TRƯỚC ĐÓ

#### 1. Chế độ Tập trung (Focus Mode — Phase 7.3)
- Trải nghiệm viết tối giản, ẩn hoàn toàn Ribbon, Headers, Sidebars và Popups.
- Kích hoạt qua phím `F11`, `Ctrl+Shift+D`, Command Palette hoặc `/focus`.
- Nút điều khiển nổi tinh tế với gợi ý phím `Esc` để thoát tức thì.

#### 2. Unified Commands, Version History & Autosave (Phase 7.1 & 7.2)
- Hệ thống Command Registry thống nhất (`commandRegistry.ts`), Command Palette (`Ctrl+Shift+P`), Slash Commands (`/`).
- Lịch sử phiên bản đa snapshot theo thời gian thực (`Ctrl+Shift+H`), tự động tạo bản sao lưu pre-restore an toàn.
- Cơ chế Autosave chống mất dữ liệu (debounce 2000ms), Clean shutdown markers, và Crash Recovery Dialog.

#### 3. References Engine (Phase 6)
- Sơ đồ đề mục & điều hướng nhanh (`DocumentOutlineSidebar`).
- Mục lục tự động (`Table of Contents`) 3 phong cách chuyên nghiệp.
- Chú thích cuối trang (`Footnotes`) và Chú thích cuối tài liệu (`Endnotes`).
- Chú thích hình ảnh/bảng/công thức (`Captions`) & Tham chiếu chéo động (`Cross-references`).
- Trích dẫn học thuật (`Citations`) & Danh mục tài liệu tham khảo tự động (`Bibliography`).

---

### Kết quả Kiểm thử & Biên dịch Tổng thể (879 Tests — 100% PASS)

- Toàn bộ **879 / 879 bài kiểm thử PASS (100%)** trên tất cả các test suites:
  - Phase 1: Core Editor & Formatting (64 tests)
  - Phase 2: Page Engine, Pagination, Layout & Sections (115 tests)
  - Phase 3: Insert Engine (Tables, Images, Equations, Shapes, Text Boxes) (87 tests)
  - Phase 4: DOCX Import/Export Foundation & Review Integration (54 tests)
  - Phase 5: Review Engine (Spell, Grammar, Comments, Track Changes, Stats) (76 tests)
  - Phase 6: References Engine Foundation (Headings, TOC, Notes, Captions, Citations) (71 tests)
  - Phase 7: Unified Commands, Version History, Autosave, Focus Mode (28 tests)
  - Styles Engine 2.0 (Phases 1–10): Foundation, Resolution, Paragraph, Character, UI, Persistence, DOCX, Final Audit (122 tests)
  - Pagination Engine 2.0 (Phases 1–14): Paragraph Flow, Table Flow, Rules, Mixed Geometry, Non-Splittable Objects, Incremental Reflow, Persistence, DOCX, Final Audit (144 tests)
  - **References Engine Completion (Phases 1–11): Caption Lists Core, Contextual Update & F9, Caption List UX & Dialog, DOCX Export, Bookmark Core, Bookmark Cross-References, Bookmark UX & Manager Dialog, Bookmark DOCX Interoperability, Final Integration & Zero Regression (118 tests)**
- `npm run build` (`tsc && vite build`) biên dịch sản xuất hoàn thành sạch sẽ 0 lỗi (964ms).
- `cargo check` backend Tauri hoàn thành thành công 0 lỗi (0.56s).

---

## Trạng thái trước: Phase 7.2 — Local Version History + Autosave + Crash Recovery Completed

## Trạng thái trước: Phase 6 — References Engine Completed

Dự án đã hoàn thành toàn bộ **Phase 6 — References Engine**, xây dựng hệ thống Tham chiếu học thuật và Xuất bản tài liệu toàn diện cho Personal Word Editor. Toàn bộ kiến trúc tuân thủ nghiêm ngặt nguyên tắc **ProseMirror AST là nguồn chân lý duy nhất (Single Source of Truth)**, hoàn toàn cục bộ (**Local-first**, không phụ thuộc cloud hay CSL bên ngoài), tương tác mượt mà với Review Engine và Page Engine, bảo vệ chống rò rỉ metadata mồ côi (Zero Orphan Leakage), bảo toàn lưu trữ `.mwd` và xuất DOCX (OOXML) chuẩn mực.

### Cấu trúc Toàn diện của References Engine (Phase 6)

1. **Sơ đồ Đề mục & Điều hướng (Heading Navigation - Phase 6.2)**:
   - Trích xuất động cây phân cấp Heading 1–3 trực tiếp từ AST, phân biệt text hoạt động với phần xóa trong Track Changes.
   - Thanh bên `DocumentOutlineSidebar`: Tìm kiếm nhanh, thu gọn/mở rộng, điều hướng mượt mà và đồng bộ vị trí con trỏ thời gian thực.
   - Neo hóa đề mục tự động với ID bền vững (`ref_heading_<seed>_<suffix>`).

2. **Mục lục Tự động (Table of Contents - Phase 6.3)**:
   - `TableOfContentsExtension`: Block Atom Node (`tableOfContents`) độc lập, chống đệ quy (No Recursion).
   - 3 phong cách chuyên nghiệp: Cổ điển (`classic`), Hiện đại (`modern`), Trang trọng (`formal`).
   - Tính toán số trang động theo ngắt trang vật lý và luồng phân trang. Cập nhật một chạm (`F9 / Update TOC`) tức thì.

3. **Chú thích Chân trang & Cuối bài (Footnotes & Endnotes - Phase 6.4)**:
   - `NoteReferenceExtension`: Inline Atom Node (`noteReference`) với ID ngữ nghĩa `ref_fn_<uuid>` và `ref_en_<uuid>`.
   - Đánh số tự động liên tục và xác định (1, 2, 3... cho Footnotes; i, ii, iii... cho Endnotes).
   - Điều hướng hai chiều (văn bản <-> chú thích), bảo vệ không để lại chú thích mồ côi khi xóa marker.

4. **Nhãn Chú thích Đối tượng (Captions - Phase 6.5)**:
   - `CaptionExtension`: Block Node (`caption`) gắn kết với Bảng (Table), Hình ảnh (Image), Công thức (Equation), Hình vẽ (Shape).
   - Bộ đếm độc lập theo từng loại nhãn (`Figure 1, 2... Table 1, 2... Equation 1, 2...`). Đánh số tự động động theo vị trí xuất hiện.
   - Vị trí linh hoạt: Phía trên (`above` cho Bảng) hoặc Phía dưới (`below` cho Hình ảnh, Công thức).

5. **Tham chiếu Chéo Ngữ nghĩa (Cross-Reference - Phase 6.5)**:
   - `CrossReferenceExtension`: Inline Atom Node (`crossReference`) liên kết tới Heading, Caption, Footnote, Endnote.
   - Chế độ hiển thị đa dạng: Toàn bộ nội dung, Nhãn & Số, Chỉ số, Số trang.
   - **Chống sập ứng dụng khi mất mục tiêu (Broken Reference Protection)**: Tự động hiển thị `[Reference not found]` kèm viền cảnh báo khi mục tiêu bị xóa; tự phục hồi khi hoàn tác (Undo).

6. **Trích dẫn & Danh mục Tài liệu Tham khảo (Citations & Bibliography - Phase 6.6)**:
   - Quản lý 4 loại nguồn phổ biến: Sách (`book`), Bài báo (`journalArticle`), Trang web (`website`), Kỷ yếu (`conferencePaper`).
   - Hai chuẩn trích dẫn xác định: **APA 7th** (Tác giả, Năm) và **IEEE** (Chỉ số số học `[1], [2]`).
   - Hộp thoại `ManageSourcesDialog`: Thêm, sửa, xóa nguồn kèm chính sách bảo vệ nguồn đang được trích dẫn trong văn bản.
   - `BibliographyExtension`: Block Atom Node tự động tổng hợp danh mục tham khảo từ các nguồn đã trích dẫn, chống trùng lặp tuyệt đối, hỗ trợ làm mới một chạm (F9).

7. **Kiểm định Toàn diện & Tích hợp Hệ thống (Final Audit - Phase 6.7)**:
   - Vòng đời tài liệu thực tế toàn diện từ Soạn thảo -> TOC -> Captions -> Cross-refs -> Footnotes -> Citations -> Bibliography -> Lưu/Mở `.mwd` -> Xuất DOCX.
   - Hoàn tác/Làm lại (Undo/Redo) bảo toàn 100% metadata trên tất cả các phân hệ.
   - Đồng tồn tại an toàn tuyệt đối với Track Changes, Comments, Proofing, Page Breaks, Section Breaks và các đối tượng đồ họa.
   - Tương thích ngược: Mở an toàn các tệp cũ từ Phase 1–5 không có trường references.
   - Hiệu năng vượt trội: Xử lý tài liệu học thuật mật độ cao (< 50ms).
   - Đạt **434/434 bài kiểm thử tự động PASS (100%)**.

---

## Trạng thái trước: Phase 6.6 — Citation + Bibliography Core (Completed)

Dự án đã chính thức hoàn thành **Phase 6.6 — Citation + Bibliography Core**, xây dựng hệ thống Quản lý Trích dẫn (Citation Manager) và Danh mục Tài liệu tham khảo (Bibliography) ngữ nghĩa toàn diện. Thiết kế chuẩn mực, deterministic và hoàn toàn local-first (không yêu cầu cloud server hay CSL engine cồng kềnh), gắn kết trực tiếp với Document Model (`.mwd`), hỗ trợ định dạng APA 7th và IEEE, cập nhật động một chạm (F9), bảo vệ nguồn đang cited, chống trùng lặp, phòng chống lỗi nguồn bị hỏng, và xuất DOCX an toàn không làm hỏng tệp.

### Citation & Bibliography Features (Tính năng Trích dẫn & Tài liệu tham khảo)

1. **Mô hình Nguồn Ngữ nghĩa (Semantic Bibliography Source Model)**:
   - Hỗ trợ 4 loại tài liệu phổ biến: Sách (`book`), Bài báo khoa học (`journalArticle`), Trang web (`website`), Kỷ yếu hội thảo (`conferencePaper`).
   - Chuẩn hóa các trường: `id`, `type`, `title`, `authors`, `year`, `publisher`, `city`, `journal`, `volume`, `issue`, `pages`, `url`, `accessedAt`, `conferenceName`, `doi`.
   - Xác thực dữ liệu chặt chẽ (`CitationService.validateSource`) với thông báo lỗi rõ ràng theo từng loại nguồn.
   - Định danh bền vững `src_<uuid>` duy trì nhất quán qua các phiên Lưu/Mở.

2. **Quản lý Nguồn & Chính sách Bảo vệ (Manage Sources & Protection Policy)**:
   - Quản lý tập trung trong Zustand store và `DocumentModel.references.bibliographySources`.
   - Hộp thoại `ManageSourcesDialog`: Thêm, Sửa, Xóa nguồn kèm khung xem trước trực tiếp (Live Preview) theo định dạng APA và IEEE.
   - **Bảo vệ Nguồn đang được Trích dẫn**: Quét AST để phát hiện nếu nguồn đang được dùng trong văn bản và yêu cầu người dùng xác nhận trước khi xóa, tránh làm mất liên kết.

3. **Chèn Trích dẫn Ngữ nghĩa trong Văn bản (Semantic In-Text Citation)**:
   - `CitationExtension`: Inline Atom Node (`citation`) lưu trữ `sourceId`, `style`, `prefix`, `suffix`, `customText`.
   - NodeView hiển thị động định dạng trích dẫn theo dữ liệu thời gian thực.
   - **Chống lỗi Nguồn bị hỏng (Broken Source Protection)**: Hiển thị an toàn `[Citation not found]` với viền đỏ cảnh báo khi nguồn bị xóa hoặc thiếu, không gây lỗi hệ thống.

4. **Định dạng Kiểu Trích dẫn Chuẩn (Deterministic Citation Styles)**:
   - **APA 7th (Author, Year)**: Định dạng trong văn bản `(Tác giả, Năm)`, tự động xử lý tác giả đơn lẻ, 2 tác giả (`&`), hoặc nhiều hơn 2 tác giả (`et al.`); danh mục sắp xếp theo thứ tự bảng chữ cái của tên tác giả (hỗ trợ Unicode tiếng Việt có dấu).
   - **IEEE (Numerical)**: Định dạng trong văn bản `[1]`, `[2]`, `[3]`; tự động tính toán chỉ số theo thứ tự xuất hiện đầu tiên trong tài liệu; danh mục sắp xếp theo đúng thứ tự đánh số `[1], [2], ...`.

5. **Sinh và Cập nhật Danh mục Tham khảo (Bibliography Generation & Refresh)**:
   - `BibliographyExtension`: Block Atom Node (`bibliography`) lưu trữ cấu hình và danh sách mục tham khảo đã sinh.
   - Bộ lọc linh hoạt: Chỉ các nguồn được trích dẫn trong văn bản (`citedOnly`) hoặc toàn bộ danh sách nguồn (`allSources`).
   - **Chống Trùng lặp (Duplicate Prevention)**: Tự động gom cụm các trích dẫn lặp lại thành một mục duy nhất trong danh mục.
   - **Cập nhật một chạm (Single-click / F9 Update)**: Nút "Cập nhật (F9)" làm mới ngay danh mục khi metadata nguồn thay đổi.

6. **Tương thích Lưu trữ & DOCX (OOXML Mapping)**:
   - Định dạng `.mwd`: Lưu trữ và phục hồi trọn vẹn `bibliographySources`, `citationStyle`, cùng các node `citation` và `bibliography`.
   - Tương thích ngược: Tài liệu cũ không có bibliography được nạp an toàn với mảng rỗng mặc định.
   - Xuất DOCX: Xuất trích dẫn thành Word text run màu xanh rõ nét, xuất khối tài liệu tham khảo thành các đoạn văn Word kèm style `Bibliography` chuẩn mực.

---

## Trạng thái trước: Phase 6.5 — Captions + Cross-reference (Completed)

Dự án đã chính thức hoàn thành **Phase 6.5 — Captions + Cross-reference**, xây dựng hệ thống Nhãn chú thích đối tượng (Captions) và Tham chiếu chéo (Cross-reference) ngữ nghĩa toàn diện dựa trên ProseMirror AST làm nguồn chân lý duy nhất (Single Source of Truth), tích hợp sâu với References Ribbon, hỗ trợ đánh số tự động độc lập, tự động cập nhật khi thêm/xóa/đổi vị trí đối tượng, bảo vệ an toàn trước tham chiếu bị hỏng (Broken Reference Protection), liên kết neo hai chiều với Table/Image/Equation/Shape/TextBox/Heading/Notes, hoàn tác/làm lại, bảo toàn lưu trữ `.mwd` và xuất/nhập tệp DOCX (OOXML) chuẩn mực.

### Captions & Cross-Reference Features (Tính năng Nhãn & Tham chiếu chéo)

1. **Mô hình Dữ liệu Ngữ nghĩa trong AST (Semantic AST Model)**:
   - `CaptionExtension`: Block Node (`caption`) chuẩn mực chứa nội dung inline có thể chỉnh sửa trực tiếp, hỗ trợ thuộc tính `id` (`ref_cap_<uuid>`), `label` (`Figure`, `Table`, `Equation` hoặc tùy chỉnh), `targetId` liên kết với đối tượng, `positionPolicy` (`above` hoặc `below`).
   - `CrossReferenceExtension`: Inline Atom Node (`crossReference`) chuẩn mực lưu trữ `targetId`, `targetType`, `format` (`text`, `labelAndNumber`, `number`, `pageNumber`) và `customText` phân giải dự phòng.
   - `ObjectAnchorExtension`: Tự động gắn mã neo toàn cục bền vững `id` (`ref_obj_<uuid>`) cho các đối tượng `image`, `table`, `equation`, `shape`, `textBox` trong tài liệu.
   - **Tuyệt đối không dùng overlay DOM hay bản sao song song**: AST ProseMirror là nguồn dữ liệu duy nhất.

2. **Đánh số Tự động Độc lập (Independent Auto-Numbering)**:
   - Các nhãn sở hữu bộ đếm riêng biệt (Figure 1, Figure 2; Table 1, Table 2; Equation 1...).
   - **Số thứ tự không bị hardcode thành nguồn chân lý**: Được tính toán động theo thứ tự xuất hiện thực tế của đối tượng trong tài liệu. Khi thêm, xóa hoặc hoán đổi vị trí nhãn ở giữa tài liệu, toàn bộ các số hiệu phía sau tự động cập nhật lại chính xác mà không bị trùng số.

3. **Phân giải Tham chiếu Động & Trạng thái An toàn khi Mất Mục tiêu**:
   - `CrossReferenceService`: Phân giải động chuỗi hiển thị theo mục tiêu và định dạng yêu cầu từ tài liệu hiện tại, không phụ thuộc cache cũ.
   - Khi mục tiêu bị xóa hoặc không tìm thấy, tham chiếu hiển thị an toàn `[Reference not found]` kèm viền đỏ cảnh báo, tuyệt đối không gây sập ứng dụng (Crash-Proof).
   - Hỗ trợ đầy đủ các định dạng: Toàn bộ nội dung, Nhãn & Số, Chỉ số, Số trang.

4. **Điều hướng Hai chiều & Tương tác Trực quan**:
   - Nhấp chuột vào tham chiếu chéo để cuộn mượt và đưa con trỏ tới đúng vị trí của mục tiêu trong tài liệu (Heading, Caption hoặc Note) mà không đột biến AST.
   - Điều hướng tới Caption thông qua `CaptionService.navigateToCaption`.

5. **Giao diện Người dùng & Tích hợp References Ribbon**:
   - Kích hoạt 2 nút công cụ trên References Ribbon: **Chèn nhãn chú thích (Insert Caption)** và **Tham chiếu chéo (Cross-reference)**.
   - Hộp thoại `CaptionDialog`: Tự động phát hiện đối tượng đang chọn, chọn nhãn, chọn vị trí (Phía trên/Phía dưới), xem trước trực tiếp (Live Preview).
   - Hộp thoại `CrossReferenceDialog`: Lọc loại mục tiêu (Heading, Figure, Table, Equation, Footnote, Endnote), chọn định dạng hiển thị, hiển thị danh sách mục tiêu thực tế trong tài liệu.

6. **Không gây Vòng lặp với Track Changes (Zero-Loop Coexistence)**:
   - NodeView chỉ đọc và cách ly hoàn toàn, không tạo transaction giả mạo gây xung đột với Track Changes, Comments hay TOC.

7. **Tương thích Lưu trữ & DOCX (OOXML Round-Trip)**:
   - Định dạng `.mwd`: Lưu trữ và phục hồi nguyên vẹn các node `caption` và `crossReference`, bảo toàn 100% ID và liên kết ngữ nghĩa; tương thích ngược hoàn toàn.
   - Nhập/Xuất DOCX: Xuất caption với kiểu dáng Word chuẩn `Caption` (`<w:pStyle w:val="Caption"/>`), xuất cross-reference thành text run rõ ràng; nhập các đoạn văn có style `Caption` thành node `caption` trong AST.

---

## Trạng thái trước: Phase 6.4 — Footnotes + Endnotes (Completed)

Dự án đã chính thức hoàn thành **Phase 6.4 — Footnotes + Endnotes**, xây dựng hệ thống Chú thích chân trang (Footnotes) và Chú thích cuối bài (Endnotes) ngữ nghĩa toàn diện dựa trên ProseMirror AST làm nguồn chân lý duy nhất (Single Source of Truth), tích hợp sâu với References Ribbon, hỗ trợ đánh số tự động xác định, điều hướng hai chiều, hoàn tác/làm lại, bảo toàn lưu trữ `.mwd` và xuất/nhập tệp DOCX (OOXML) chuẩn mực.

### Footnotes & Endnotes Features (Tính năng Chú thích)

1. **Mô hình Dữ liệu Ngữ nghĩa (Semantic Data Model)**:
   - `NoteReferenceExtension`: Inline Atom Node (`noteReference`) chuẩn mực trong ProseMirror AST.
   - Định danh bền vững (Stable Semantic IDs): `ref_fn_<uuid>` cho Footnote và `ref_en_<uuid>` cho Endnote, không phụ thuộc DOM ID hay offset cứng.
   - Nội dung chú thích được lưu trữ ngay trong thuộc tính `content` của node, đồng bộ hóa tuyệt đối với lịch sử giao dịch ProseMirror.
   - **Triệt tiêu metadata mồ côi (Zero Orphan Metadata)**: Xóa marker sẽ loại bỏ hoàn toàn chú thích khỏi tài liệu; hoàn tác (Undo) khôi phục cả marker lẫn nội dung nguyên vẹn.

2. **Đánh số Tự động Xác định (Deterministic Continuous Numbering)**:
   - Footnotes: Đánh số thập phân liên tục `1, 2, 3...`.
   - Endnotes: Đánh số La Mã chữ thường liên tục `i, ii, iii...`.
   - Số hiển thị được tính toán động từ thứ tự xuất hiện của marker trong AST, tuyệt đối không hardcode vào nội dung văn bản. Khi thêm/xóa/di chuyển chú thích ở giữa tài liệu, các số hiển thị tự động cập nhật ngay lập tức.

3. **Thao tác Chèn & Phím tắt Nhanh**:
   - **Chèn Footnote**: `Ctrl+Alt+F` (References Ribbon -> Insert Footnote).
   - **Chèn Endnote**: `Ctrl+Alt+D` (References Ribbon -> Insert Endnote).
   - Chèn ngay tại vị trí caret hoặc sau vùng chọn; tự động mở thanh bên và focus vào ô soạn thảo nội dung chú thích.

4. **Điều hướng Hai chiều Ngữ nghĩa (Bidirectional Navigation)**:
   - Marker -> Note: Nhấp vào số chú thích trong văn bản để mở thanh bên và cuộn/focus vào nội dung ghi chú tương ứng.
   - Note -> Marker: Nhấp vào số hiệu hoặc nút "Quay lại vị trí trong bài" để đưa con trỏ (caret) chính xác về vị trí marker trong thân bài.
   - Điều hướng tuần tự: Hỗ trợ nút **Chú thích tiếp theo (Next Footnote)** và **Chú thích trước (Previous Footnote)**.

5. **Giao diện Trực quan & Tích hợp Khung nhìn Tài liệu**:
   - Thanh bên `NotesSidebar`: Quản lý danh sách chú thích tập trung, hỗ trợ chỉnh sửa nội dung, đếm số lượng và xóa nhanh.
   - Chân trang văn bản `DocumentNotesView`: Hiển thị chân trang chuẩn Word với đường phân cách 2-inch cho Footnotes và đường phân cách toàn phần kèm tiêu đề cho Endnotes.
   - **Chính sách Phân trang An toàn**: Triển khai Semantic Footnote Core ổn định cao, không hack pagination để giả lập footer và không phá vỡ Page Engine hiện tại.

6. **Tương thích Lưu trữ & DOCX (OOXML Round-Trip)**:
   - Tệp `.mwd`: Lưu trữ và phục hồi nguyên vẹn các node `noteReference`, bảo toàn ID, type, content và liên kết hai chiều; tương thích ngược 100%.
   - Nhập/Xuất DOCX: Đọc và ghi trực tiếp `word/footnotes.xml`, `word/endnotes.xml`, `<w:footnoteReference>`, `<w:endnoteReference>`, liên kết `.rels`, kiểu dáng chuẩn và separator theo tiêu chuẩn ECMA-376 / ISO/IEC 29500.

---

## Trạng thái trước: Phase 6.3 — Table of Contents Engine (Completed)

Dự án đã chính thức hoàn thành **Phase 6.3 — Table of Contents Engine**, xây dựng hệ thống Mục lục ngữ nghĩa tự động dựa trên cây cấu trúc Heading trong ProseMirror AST làm nguồn chân lý duy nhất (Single Source of Truth), tích hợp sâu với References Ribbon, hỗ trợ đầy đủ số trang, hoàn tác/làm lại, và xuất bản DOCX chuẩn mực.

### Table of Contents Features (Tính năng Mục lục)

1. **Mô hình Dữ liệu Ngữ nghĩa Chống Đệ quy**:
   - `TableOfContentsExtension`: Block Atom Node (`tableOfContents`) độc lập, không phải là đoạn HTML rendered tạm thời.
   - Lưu trữ cấu hình toàn diện: `title`, `includedLevels`, `showPageNumbers`, `rightAlignPageNumbers`, `preset` ("classic", "modern", "formal"), `entries` và `lastUpdated`.
   - **Triệt tiêu 100% Rủi ro Đệ quy (Zero Recursion)**: Tiêu đề TOC không phải là node heading, ngăn chặn tuyệt đối việc TOC tự chèn chính nó vào mục lục.
2. **Quản lý Đề mục & Cập nhật Linh hoạt (F9 / Update TOC)**:
   - Tự động quét và sinh mục lục từ Heading 1-3 thật trong AST thông qua `HeadingService`.
   - Hỗ trợ cập nhật toàn bộ mục lục (phản ánh ngay lập tức khi đổi tên, thêm/xóa đề mục, đổi cấp độ H1-H3) hoặc chỉ cập nhật lại số trang.
   - Thao tác xóa mục lục (`Remove TOC`) gỡ bỏ sạch sẽ mà không làm thay đổi các khối văn bản khác.
3. **Tính toán Số trang Động (Dynamic Page Numbers)**:
   - Đồng bộ chính xác với hệ thống ngắt trang vật lý (`pageBreak`, `sectionBreak`) và phân trang của `usePaginationStore`.
   - Số trang được tính toán động, không hardcode vào tài liệu gốc.
4. **Điều hướng Nhanh & Bảo toàn Tuyệt đối Nội dung**:
   - Nhấp vào bất kỳ mục nào trong TOC sẽ đưa con trỏ tới đầu đề mục và cuộn mượt vào viewport mà **tuyệt đối không đột biến nội dung hay AST**.
5. **Giao diện Người dùng & Tích hợp References Ribbon**:
   - Kích hoạt bộ công cụ Mục lục trên References Ribbon: **Chèn mục lục**, **Cập nhật mục lục (F9)**, **Xóa mục lục**.
   - Hộp thoại `TocDialog`: Tùy biến tiêu đề, lọc cấp độ hiển thị, chọn phong cách hiển thị và căn phải số trang kèm dấu chấm nối.
   - NodeView tương tác: Hiển thị giao diện trực quan, hỗ trợ nút bấm cập nhật nhanh ngay trên đầu khối.
6. **Bảo tồn Lưu trữ & Xuất DOCX An toàn**:
   - Tệp `.mwd`: Lưu và nạp nguyên vẹn cấu hình mục lục và các mục liên kết; tương thích ngược 100% với tệp cũ.
   - Xuất DOCX: Tự động chuyển đổi thành các đoạn văn chuẩn WordprocessingML (`TOCHeading`, `TOC1`-`TOC3`, tab leader dots), tương thích tuyệt đối với Microsoft Word và LibreOffice.
   - Bảo toàn trạng thái: Cập nhật TOC không gây ra hàng trăm tracked changes giả mạo và không làm hỏng các Comments bên ngoài.

---

## Trạng thái trước: Phase 6.2 — Heading Navigation / Document Outline (Completed)

## Trạng thái trước: Phase 6.1 — References Engine Foundation + References Ribbon (Completed)

### References Foundation Features (Nền tảng Tham chiếu & Trích dẫn)

1. **Kiến trúc Phân tầng Tham chiếu (References Architecture)**:
   - Module độc lập `src/references/` được tổ chức sạch sẽ gồm `types`, `services`, `commands`, `hooks`, `components`, `utils`, `extensions`.
   - Luồng tương tác chuẩn mực: `References Ribbon UI -> References Commands/Services -> Tiptap/ProseMirror AST -> Internal Document Model -> .mwd / DOCX Persistence`.
   - UI hoàn toàn không đột biến trực tiếp DOM của editor.

2. **Danh mục Tham chiếu Tập trung (References Registry)**:
   - Quản lý 18 tính năng thuộc 8 nhóm chức năng cốt lõi: Table of Contents, Footnotes, Endnotes, Captions, Cross-reference, Citation, Bibliography, Heading Navigation.
   - Toàn bộ các tính năng thuộc các phase tiếp theo được biểu thị minh bạch ở trạng thái `planned` kèm số hiệu phase tương ứng, ngăn chặn tuyệt đối các nút bấm thao tác giả.

3. **Cơ chế Định danh Ngữ nghĩa Bền vững (Semantic Anchor Foundation)**:
   - Định dạng ID chuẩn hóa: `ref_<targetType>_<uuid/hash>`.
   - Định danh duy nhất, bền vững qua Save/Open, độc lập với vị trí DOM và không phụ thuộc chỉ số mảng nhất thời.
   - Bộ tiện ích `ReferenceAnchorService` trích xuất và đảm bảo ID cho Heading mà không làm biến đổi cây AST gốc (AST Immutability).

4. **Thanh công cụ References Ribbon Tiêu chuẩn**:
   - Thay thế hoàn toàn tab placeholder bằng giao diện Ribbon 5 nhóm công cụ chuẩn mực: Mục lục, Chú thích, Trích dẫn & Thư mục, Nhãn & Tham chiếu, Điều hướng.
   - Đảm bảo cơ chế bảo vệ dấu nháy soạn thảo (`preventBlur`), phím tắt trực quan, tooltip chi tiết và nhãn tiếp cận (`aria-label`).

5. **Cách ly Trạng thái & Tương thích Lưu trữ**:
   - `useReferencesStore` chỉ quản lý trạng thái hiển thị giao diện thuần túy (`activeReferencePanel`, `isReferencesPanelOpen`, `selectedReferenceId`); không lưu dữ liệu ngữ nghĩa song song trong Zustand.
   - Hỗ trợ lưu trữ siêu dữ liệu tham chiếu trong mô hình `DocumentModel` và gói tệp `.mwd`, tương thích ngược 100% với các phiên bản trước.

---

## Trạng thái trước: Phase 5 — Review & Proofing Engine (Completed)

### Review Features (Tính năng Kiểm duyệt & Soát lỗi)

1. **Kiểm tra Chính tả (Spell Check)**:
   - Phát hiện từ viết sai bằng từ điển tiếng Anh (`en-US`) và tiếng Việt (`vi-VN`).
   - Gạch chân đỏ dạng lượn sóng (`spelling-error-decoration`), popup ngữ cảnh khi nhấp chuột.
   - Gợi ý từ thay thế thông minh (thuật toán Levenshtein distance), bảo toàn quy tắc viết hoa (Capitalized/Uppercase).
   - Cơ chế **Bỏ qua một lần (Ignore Once)**, **Bỏ qua tất cả (Ignore All)** trong phiên làm việc.
   - **Từ điển người dùng (User Dictionary)**: Thêm/xóa từ riêng, lưu trữ bền vững trong `localStorage`.
   - Cơ chế phân tách mapping và debounce 350ms, đảm bảo **hoàn toàn không gây typing lag** ngay cả với tài liệu dài hàng nghìn từ.

2. **Kiểm tra Ngữ pháp (Grammar Check)**:
   - Bộ quy tắc cục bộ offline (`LocalGrammarProvider`): khoảng trắng thừa, khoảng trắng trước dấu câu, thiếu khoảng trắng sau dấu câu, từ lặp lại hai lần liên tiếp, viết hoa đầu câu, dấu chấm đôi bất thường.
   - Gạch chân xanh dương (`grammar-error-decoration`).
   - Khả năng **Vô hiệu hóa quy tắc (Disable Rule)** và **Bỏ qua lỗi (Ignore Once)**.
   - **Độ chính xác cao & Triệt tiêu False Positives**: Tự động bỏ qua an toàn địa chỉ URL, Email, số thập phân (ví dụ: `3.14`), số phiên bản (ví dụ: `v2.5`), tên file mở rộng (ví dụ: `report.docx`, `style.css`), dấu chấm lửng (`...`), ký tự viết tắt thông dụng (`e.g.`, `etc.`, `dr.`).

3. **Hệ thống Bình luận (Comments)**:
   - Thêm bình luận trên vùng văn bản chọn, chỉnh sửa nội dung, xóa, đánh dấu giải quyết (`Resolve`) và mở lại (`Reopen`).
   - Thanh bên Sidebar hiển thị trực quan danh sách bình luận kèm người tạo, thời gian và trích dẫn văn bản.
   - Điều hướng tuần tự **Bình luận trước (Previous)** / **Bình luận tiếp (Next)**.
   - **Bảo toàn Anchor & An toàn Mồ côi (Orphan Safety)**: Vùng neo co giãn tự nhiên theo thao tác soạn thảo; khi đoạn văn bản neo bị xóa, bình luận chuyển sang trạng thái mồ côi mà **tuyệt đối không làm mất nội dung thảo luận**; khi Undo văn bản, anchor tự động tái kết nối.

4. **Theo dõi Thay đổi Toàn diện (Track Changes 2.0)**:
   - **Chế độ Theo dõi**: BẬT/TẮT rõ ràng trên Review Ribbon và thanh trạng thái StatusBar (`Track Changes: ON/OFF`).
   - **Thay đổi Nội dung (Content Revisions)**:
     - Văn bản chèn mới (`insert`): hiển thị gạch chân màu xanh, tác giả và thời gian thực hiện.
     - Văn bản bị xóa (`delete`): giữ nguyên vẹn trong Document AST, hiển thị gạch ngang màu đỏ (phân biệt rạch ròi với Strikethrough của người dùng).
   - **Thay đổi Định dạng Ký tự (Character Formatting Revisions)**:
     - Bắt vết thay đổi phông chữ (Font Family, Font Size, Bold, Italic, Underline, Strike, Color, Highlight).
     - Lưu trữ trạng thái trước (`previousProperties`) và sau (`currentProperties`).
     - Hiển thị viền trang trí nhẹ và thẻ thay đổi trong Review Sidebar.
   - **Thay đổi Định dạng Đoạn văn (Paragraph Formatting Revisions)**:
     - Bắt vết thay đổi Căn lề (`textAlign`: Left, Center, Right, Justify), Giãn dòng (`lineSpacing`), Thụt lề (`indent`, `firstLineIndent`), Khoảng cách (`spaceBefore`, `spaceAfter`).
     - Neo chính xác vào đoạn văn mục tiêu qua `targetNodeId`.
   - **Thay đổi Gán Kiểu Dáng (Style Assignment Revisions)**:
     - Theo dõi thao tác chuyển đổi kiểu (Normal $\to$ Heading 1–3 hoặc Custom Styles) mà không phá vỡ cấu trúc nút hay phả hệ thừa kế.
   - **Điều hướng & Bộ lọc**:
     - Điều hướng tuần tự **Thay đổi trước (Previous Change)** / **Thay đổi tiếp (Next Change)**.
     - Bộ lọc theo loại (`All`, `Insertions`, `Deletions`, `Formatting`) và theo tác giả (`Authors`).

5. **Chấp nhận / Từ chối Thay đổi (Accept / Reject Engine)**:
   - `Accept Insert`: Giữ lại văn bản, gỡ bỏ metadata thay đổi, trở thành văn bản thông thường.
   - `Reject Insert`: Xóa bỏ văn bản đã chèn khỏi cây cú pháp AST.
   - `Accept Delete`: Xóa vĩnh viễn văn bản khỏi tài liệu.
   - `Reject Delete`: Khôi phục văn bản, gỡ bỏ metadata thay đổi.
   - `Accept Format`: Giữ lại định dạng mới, gỡ bỏ revision metadata.
   - `Reject Format`: Khôi phục 100% định dạng ban đầu (`previousProperties`), không làm thay đổi nội dung văn bản.
   - `Accept All` / `Reject All`: Xử lý hàng loạt trong một transaction nguyên tử (Atomic Batch) theo thứ tự an toàn (Format $\to$ Insert $\to$ Delete), triệt tiêu 100% lỗi lệch vị trí (index drift).
   - Tương thích 100% với **Hoàn tác / Làm lại (Undo / Redo)**.

6. **Thống kê Tài liệu (Document Statistics)**:
   - Trang (Pages) đọc trực tiếp từ Physical Page Engine; Từ (Words); Ký tự có/không khoảng trắng; Đoạn văn (Paragraphs); Dòng ước tính.
   - Cấu trúc mở rộng: Tiêu đề (Headings), Bảng (Tables), Hình ảnh (Images).
   - Thống kê vùng chọn (Selection Statistics) tức thời trên StatusBar (`Words: X / Y`).
   - Tổng quan kiểm duyệt (Review Summary): Lỗi chính tả, Ngữ pháp, Bình luận chưa giải quyết, Thay đổi theo dõi.
   - **Chính sách đếm từ chuẩn mực**: Tracked Deletions bị loại bỏ khỏi số từ; Tracked Insertions được tính; bình luận sidebar không cộng dồn vào thân bài.

7. **Tích hợp Siêu dữ liệu DOCX & Định dạng .mwd (Track Changes 2.0 Persistence)**:
   - Nhập/Xuất Comments qua `word/comments.xml` chuẩn WordprocessingML ISO/IEC 29500.
   - Nhập/Xuất Track Changes nội dung qua `<w:ins>` và `<w:del>` kèm `<w:delText xml:space="preserve">`.
   - Nhập/Xuất Track Changes định dạng qua `<w:rPrChange>` (định dạng ký tự) và `<w:pPrChange>` (định dạng đoạn văn) với đầy đủ định danh số nguyên hợp lệ (`w:id`), tác giả (`w:author`) và thời gian ISO-8601 (`w:date`).
   - Lưu trữ trọn vẹn trạng thái duyệt dở (Pending Revisions) trong tệp tin native `.mwd`.

### Known Limitations (Giới hạn đã biết theo Implementation)

1. **Phạm vi Ngữ pháp (Grammar Scope)**:
   - Bộ máy ngữ pháp hiện tại là bộ quy tắc cục bộ offline (`LocalGrammarProvider`) tập trung vào dấu câu và chính tả ngữ pháp cơ bản, không sử dụng AI đám mây hay mô hình ngôn ngữ lớn (LLM). Chưa hỗ trợ phân tích cấu trúc cú pháp câu phức tạp hoặc ngữ nghĩa ngữ cảnh sâu.
2. **Làm phẳng Thảo luận Phân cấp (Threaded Comments Flattening)**:
   - Khi nhập tệp DOCX có chứa các chuỗi bình luận phân cấp (Replies/Threads), do mô hình Document Model của Personal Word Editor quản lý danh sách bình luận phẳng, các câu trả lời con sẽ được làm phẳng an toàn thành các bình luận độc lập và ghi nhận cảnh báo tương thích, bảo toàn 100% nội dung và tác giả.
3. **Phạm vi Track Changes Ngoài Lề (Out-of-Scope Track Changes)**:
   - Hệ thống hỗ trợ hoàn chỉnh Text Insertions/Deletions, Character Formatting Revisions (`<w:rPrChange>`), Paragraph Formatting Revisions (`<w:pPrChange>`), và Style Assignment Revisions.
   - Các phạm vi ngoài lề chưa hỗ trợ: Biên tập đồng thời thời gian thực (Real-time collaboration), So sánh tài liệu độc lập (Document comparison diff), Theo dõi cấu trúc bảng nâng cao (Structural Table Revisions - thêm/xóa cột bảng dưới dạng thẻ revision riêng trong OOXML), Đối tượng đồ họa nổi độc lập (Object-level revisions), và Di chuyển toàn phần (Full Move Revisions `<w:moveFrom>`/`<w:moveTo>` được xử lý an toàn dưới dạng delete + insert).
4. **Equation & Shapes Metadata**:
   - Bộ soát lỗi (Proofing) không can thiệp soát chính tả vào công thức toán học KaTeX, hình khối vector hoặc mã nhị phân hình ảnh.
---

## Trạng thái trước: Phase 5.7 — Document Statistics + Review UX (Completed)

Dự án đã hoàn thành giai đoạn **Phase 5.7 — Document Statistics + Review UX**, nâng cấp toàn diện tính năng Đếm từ (Word Count) thành bảng Thống kê tài liệu (Document Statistics) chuẩn mực Microsoft Word và tối ưu hóa trải nghiệm kiểm duyệt (Review UX).

### 1. Bảng Thống kê Tài liệu Toàn diện (Document Statistics)
- **Chỉ số Văn bản Cốt lõi**:
  - **Trang (Pages)**: Đọc trực tiếp từ Page Engine vật lý (`calculatePaginationState`), phản ánh chính xác số trang dàn trang thực tế; tuyệt đối không dùng công thức giả lập `Math.ceil(characters / X)`.
  - **Từ (Words)**: Tính toán chính xác theo chuẩn phân tách từ ngữ Unicode, hỗ trợ hoàn hảo tiếng Việt có dấu.
  - **Ký tự (Characters)**: Thống kê cả hai chế độ: *Có khoảng trắng* (with spaces) và *Không khoảng trắng* (without spaces).
  - **Đoạn văn (Paragraphs)** và **Dòng ước tính (Lines)**.
- **Cấu trúc Thành phần Mở rộng**:
  - Thống kê chi tiết số lượng: **Tiêu đề (Headings)**, **Bảng (Tables)**, và **Hình ảnh (Images)**.
- **Thống kê Vùng chọn (Selection Statistics)**:
  - Khi người dùng bôi đen văn bản trong tài liệu, hệ thống tự động hiển thị số từ và ký tự được chọn:
    - Trên **StatusBar**: Định dạng `Words: X / Y` và `Characters: A / B`.
    - Trong **Hộp thoại Thống kê**: Khối màu xanh làm nổi bật `Văn bản đang chọn (Selection)` (`X từ / Y ký tự`).
- **Tổng quan Kiểm duyệt (Review Summary)**:
  - Báo cáo số lượng: **Lỗi chính tả (Spelling Issues)**, **Lỗi ngữ pháp (Grammar Issues)**.
  - **Bình luận (Comments)**: Tổng số nhận xét và số nhận xét đang chờ xử lý (`Unresolved`).
  - **Theo dõi Thay đổi (Tracked Changes)**: Tổng số thay đổi, số đoạn chèn mới (+Insertions) và số đoạn xóa bỏ (-Deletions).

### 2. Chuẩn hóa Chính sách Đếm từ (Word Count Policy)
- **Tracked Deletions**: **KHÔNG TÍNH** vào số từ và ký tự chính của tài liệu (văn bản bị xóa khi track changes bật coi như sẽ bị loại bỏ, thống kê riêng trong mục Review Summary).
- **Tracked Insertions**: **CÓ TÍNH** vào số từ và ký tự chính (nội dung mới đề xuất).
- **Comments**: Nội dung ghi chú trong sidebar **KHÔNG TÍNH** vào số từ tài liệu; văn bản neo trên trang được tính bình thường đúng 1 lần.
- **Header / Footer**: Khung mẫu trang **KHÔNG TÍNH** vào số từ thân bài tài liệu.
- **HTML tags & Metadata**: Hoàn toàn bóc tách cấu trúc AST, chỉ duyệt text nodes hợp lệ, bỏ qua pageBreak, sectionBreak, horizontalRule.

### 3. Tối ưu Hiệu năng & Chống Quét Lặp (Performance & Memoization)
- Lưu cache `WeakMap` trên `JSONContent` AST reference trong `extractDocumentStats` và `StatisticsService`.
- Tốc độ truy xuất cache O(1) < 0.05ms, loại bỏ hoàn toàn hiện tượng quét lặp full document trên mỗi keystroke.

### 4. Hoàn thiện Trải nghiệm Kiểm duyệt (Review UX Polish)
- **Disabled State**: Vô hiệu hóa đúng lúc các nút Thay đổi (`Accept`, `Reject`, `Accept All`, `Reject All`, `Prev`, `Next`), nút Bình luận và nút Lỗi kiểm tra khi danh sách rỗng.
- **Active Track Changes State**: Nổi bật trên Review Ribbon và thanh StatusBar (`Track Changes: ON` / `OFF`, có thể nhấp để chuyển đổi nhanh).
- **Điều hướng Lỗi Kiểm tra (Next/Previous Proofing Issue)**: Phím tắt chuẩn Word `F7` (Lỗi tiếp) và `Shift+F7` (Lỗi trước), kèm cặp nút điều hướng trên Ribbon.
- **Phím tắt Mở Thống kê**: `Ctrl+Shift+G` hoặc nhấp trực tiếp vào badge `Words` / `Characters` trên StatusBar.

---

## Trạng thái trước: Phase 5.6 — Accept / Reject Tracked Changes (Completed)

Dự án đã hoàn thành giai đoạn **Phase 5.6 — Accept / Reject Tracked Changes**, cung cấp giải pháp toàn diện cho việc duyệt, chấp nhận và từ chối các thay đổi đã theo dõi trong tài liệu cá nhân. Hệ thống hỗ trợ xử lý từng thay đổi đơn lẻ dựa trên ngữ cảnh con trỏ/điều hướng cũng như xử lý hàng loạt an toàn (`Accept All` / `Reject All`), bảo đảm an toàn dữ liệu, tương thích 100% với Undo/Redo và không gây hỏng hệ thống Bình luận (Comments).

### 1. Cơ chế Chấp nhận và Từ chối Thay đổi (Accept / Reject Mechanics)
- **Chấp nhận Chèn mới (`Accept Insert`)**:
  - Giữ lại nội dung văn bản.
  - Gỡ bỏ mark `trackChange` (`changeType: "insert"`).
  - Nội dung trở thành văn bản bình thường (normal content).
- **Từ chối Chèn mới (`Reject Insert`)**:
  - Xóa bỏ hoàn toàn khối văn bản đã chèn khỏi cây cú pháp tài liệu (AST).
  - Gỡ bỏ metadata thay đổi tương ứng.
- **Chấp nhận Xóa (`Accept Delete`)**:
  - Xóa bỏ hoàn toàn khối văn bản đã bị đánh dấu xóa khỏi tài liệu.
  - Nội dung biến mất vĩnh viễn khỏi AST và giao diện.
- **Từ chối Xóa (`Reject Delete`)**:
  - Giữ lại và khôi phục nội dung văn bản.
  - Gỡ bỏ mark `trackChange` (`changeType: "delete"`).
  - Văn bản trở về trạng thái bình thường (không còn gạch ngang đỏ review).

### 2. Xác định Ngữ cảnh Thay đổi Hiện tại (Current Change Resolution)
- **Ưu tiên Vị trí Con trỏ / Vùng chọn (Caret / Selection Priority)**:
  - Khi con trỏ chuột hoặc vùng bôi đen nằm bên trong một thay đổi có mark `trackChange`, hệ thống tự động xác định chính xác `changeId` tại vị trí đó để áp dụng Accept/Reject.
- **Fallback về `activeChangeId` từ Điều hướng**:
  - Nếu con trỏ nằm ở vị trí văn bản thông thường, hệ thống sử dụng `activeChangeId` đang kích hoạt từ các lệnh điều hướng (`Next Change` / `Previous Change`) hoặc thay đổi đầu tiên trong tài liệu.
  - Tuyệt đối không chấp nhận hay từ chối nhầm thay đổi.

### 3. Xử lý Hàng loạt An toàn (`Accept All` & `Reject All`)
- **Thuật toán Duyệt Đảo chiều (Descending Traversal)**:
  - Khi thực hiện `Accept All` hoặc `Reject All`, hệ thống thu thập toàn bộ các phân đoạn thay đổi trong tài liệu và sắp xếp theo vị trí `from` giảm dần (`b.from - a.from`).
  - Toàn bộ quá trình biến đổi được thực thi trong **một ProseMirror Transaction duy nhất (Atomic Batch)**.
  - Loại bỏ hoàn toàn lỗi trôi lệch chỉ mục (index drift) khi xóa các khối văn bản ở đầu tài liệu làm dịch chuyển vị trí của các khối văn bản phía sau.

### 4. Tích hợp Hoàn hảo với Hoàn tác / Làm lại (Undo / Redo)
- Mọi thao tác `Accept`, `Reject`, `Accept All`, `Reject All` đều phát sinh transaction hợp lệ trong lịch sử ProseMirror.
- Người dùng có thể hoàn tác (`Ctrl+Z`) ngay lập tức để phục hồi lại mark `trackChange` hoặc nội dung văn bản đã xóa.
- Làm lại (`Ctrl+Y`) tái thiết lập chính xác trạng thái sau khi duyệt.

### 5. An toàn Tương tác với Bình luận (Comments Interaction & Orphan Safety)
- Khi `Accept Delete` hoặc `Reject Insert` xóa một đoạn văn bản có chứa mark `comment`, hệ thống không bị crash hay lỗi đồng bộ dữ liệu.
- Bình luận được chuyển sang trạng thái mồ côi (`isOrphan: true`) một cách an toàn và hiển thị thông báo rõ ràng trên thanh bên Comments.
- Khi người dùng Undo thao tác review, văn bản và mark `comment` được khôi phục, đưa bình luận trở lại trạng thái neo ngữ nghĩa bình thường.

### 6. Lưu trữ Trạng thái Duyệt một phần (Partial Review Persistence)
- Người dùng có thể duyệt một số thay đổi (chấp nhận một số, từ chối một số) và để lại các thay đổi còn lại.
- Tệp `.mwd` lưu trữ trọn vẹn trạng thái sau khi duyệt một phần; khi mở lại tệp, các thay đổi còn lại vẫn hiển thị đầy đủ và có thể tiếp tục review.

### 7. Giao diện Review Ribbon
- Tab **Review** bổ sung các nút điều khiển trực quan:
  - **Chấp nhận (`Accept`)**: Áp dụng cho thay đổi hiện tại.
  - **Từ chối (`Reject`)**: Áp dụng cho thay đổi hiện tại.
  - **Nhận tất cả (`Accept All`)**: Chấp nhận toàn bộ thay đổi còn lại trong tài liệu.
  - **Bỏ tất cả (`Reject All`)**: Từ chối toàn bộ thay đổi còn lại trong tài liệu.
  - **Thay đổi trước (`Previous Change`)** & **Thay đổi tiếp (`Next Change`)**: Điều hướng xoay vòng giữa các vùng thay đổi.

---

## Trạng thái trước: Phase 5.5 — Track Changes Core (Completed)

Dự án đã hoàn thành giai đoạn **Phase 5.5 — Track Changes Core**, xây dựng nền tảng vững chắc cho tính năng Theo dõi Thay đổi (**Track Changes**):
- **Phạm vi Hỗ trợ**: Chèn văn bản mới (`insert`) và đánh dấu xóa văn bản (`delete`) khi bật Track Changes. Phân biệt rạch ròi giữa gạch ngang người dùng (`strike`) và nội dung xóa theo dõi (`trackChange` delete).
- **Mô hình Dữ liệu Thay đổi (`TrackChangeItem`)**: Gồm `id`, `type`, `author`, `timestamp`, `text` tích hợp trong `DocumentModel` và ProseMirror mark `trackChange`.
- **Cơ chế Bật / Tắt Theo dõi**: Nút chuyển đổi trên Review Ribbon (`Ctrl+Shift+E`). BẬT: ghi nhận insert/delete; TẮT: soạn thảo bình thường.
- **Nền tảng Điều hướng**: Hỗ trợ tìm kiếm và di chuyển qua các vùng thay đổi với `Previous Change` và `Next Change`.
- **Undo/Redo & Lưu trữ**: Tương thích 100% với lịch sử ProseMirror và lưu trữ bền vững trong file `.mwd`.

---

## Trạng thái trước: Phase 5.4 — Comments Core (Completed)

### 1. Kiến trúc Mô hình Bình luận (Comment Data Model)
Bình luận được chuẩn hóa qua giao diện [`CommentItem`](file:///c:/Users/hoang/.gemini/antigravity-ide/scratch/PersonalWordEditor/src/document/documentTypes.ts) tích hợp trực tiếp vào `DocumentModel`:
```ts
export interface CommentItem {
  id: string;           // Định danh duy nhất (comment-${timestamp}-${random})
  author: string;       // Tên tác giả (mặc định "Tác giả" cho app cá nhân)
  createdAt: string;    // Thời điểm tạo (ISO 8601)
  updatedAt: string;    // Thời điểm cập nhật (ISO 8601)
  content: string;      // Nội dung ghi chú nhận xét
  resolved: boolean;    // Trạng thái đã giải quyết
  selectedText?: string;// Đoạn văn bản trích dẫn tại thời điểm gắn nhận xét
}
```

### 2. Cơ chế Neo Ngữ nghĩa (Semantic Anchor qua ProseMirror Mark)
Thay vì lưu trữ offset cứng (`from`, `to`) dễ bị sai lệch khi gõ phím, Personal Word Editor sử dụng cơ chế **ProseMirror Mark `comment`** ([`CommentExtension.ts`](file:///c:/Users/hoang/.gemini/antigravity-ide/scratch/PersonalWordEditor/src/review/comments/commentExtension.ts)):
- **Tự động co giãn theo giao dịch soạn thảo**: Khi người dùng gõ thêm hoặc xóa bớt ký tự bên trong hoặc xung quanh đoạn văn bản, mark tự động bám theo mà không bị lệch vị trí.
- **Tồn tại song song với định dạng văn bản**: Khai báo `excludes: ""` cho phép mark comment cùng tồn tại song song với `bold`, `italic`, `underline`, `color`, `fontFamily`, `fontSize`, v.v.
- **Tương thích DOCX**: Bỏ qua an toàn trong quá trình tuần tự hóa OOXML (`documentSerializer.ts`), bảo toàn 100% văn bản gốc khi xuất sang Microsoft Word.

### 3. Giao diện Thanh bên Bình luận (Comments Sidebar Panel)
Thanh bên [`CommentsSidebar.tsx`](file:///c:/Users/hoang/.gemini/antigravity-ide/scratch/PersonalWordEditor/src/review/comments/components/CommentsSidebar.tsx) được tích hợp trực quan bên phải vùng làm việc:
- **Hộp soạn thảo nháp (Draft Box)**: Tự động xuất hiện khi người dùng chọn văn bản và nhấn **Review → Thêm nhận xét** (hoặc phím tắt `Ctrl+Alt+M`). Hiển thị trích dẫn văn bản, khung soạn thảo và hỗ trợ phím tắt `Ctrl+Enter` để lưu nhanh.
- **Danh sách nhận xét sắp xếp theo thứ tự văn bản**: Tự động duyệt cây AST để xếp các bình luận theo vị trí xuất hiện từ trên xuống dưới trong tài liệu.
- **Bộ lọc 3 chế độ**: *Tất cả*, *Chờ xử lý*, *Đã xong*.
- **Điều hướng Tiếp / Trước (`Next / Previous Comment`)**: Cho phép duyệt nhanh qua các bình luận trên Ribbon hoặc Sidebar, tự động cuộn trang và bôi đen vùng văn bản tương ứng.
- **Highlight trực quan trên trang**: Văn bản có comment được phủ highlight vàng nhạt (`.comment-highlight`); khi được chọn sẽ sáng rõ (`.comment-active`); khi đã giải quyết sẽ chuyển sang màu xám mờ (`.comment-resolved`). Khi nhấp vào vùng highlight trên trang, Sidebar tự động mở và chuyển tiêu điểm tới thẻ bình luận tương ứng.

### 4. Quản trị Bình luận (Edit, Delete, Resolve, Reopen)
- **Sửa nhận xét (`Edit`)**: Chỉnh sửa trực tiếp nội dung trên thẻ và cập nhật trường `updatedAt`.
- **Xóa nhận xét (`Delete`)**: Gỡ bỏ mark `comment` khỏi văn bản tài liệu nhưng **bảo toàn 100% văn bản gốc**, đồng thời xóa metadata khỏi store.
- **Giải quyết & Mở lại (`Resolve / Reopen`)**: Đánh dấu hoàn thành hoặc mở lại ghi chú đang giải quyết dở dang.

### 5. An toàn Undo/Redo & Xử lý Bình luận Mồ côi (Orphan Comments)
- Khi văn bản chứa comment bị người dùng xóa, comment chuyển sang trạng thái **Mồ côi (`Orphan Comment`)**: hiển thị cảnh báo *(Văn bản gắn kèm không còn trong tài liệu)* nhưng tuyệt đối không gây lỗi hoặc làm sập ứng dụng.
- Khi người dùng nhấn Undo (`Ctrl+Z`), đoạn văn bản và anchor được khôi phục nguyên vẹn ngay lập tức.

### 6. Lưu trữ Bền vững (.mwd Persistence)
- Tệp tin `.mwd` lưu trữ trọn vẹn mảng `comments` kèm cấu trúc AST. Khi mở tệp, toàn bộ vị trí neo, nội dung, tác giả, thời gian và trạng thái giải quyết được phục hồi 100%.
- Tương thích ngược: Mở các tệp tin `.mwd` cũ không có bình luận tự động áp dụng `comments: []` an toàn.

---

## Trạng thái trước: Phase 5.3 — Grammar Check Core (Completed)

### 1. Kiến trúc Kiểm lỗi Thống nhất (Unified Proofing Architecture)
Hệ thống hợp nhất luồng kiểm tra chính tả (Spelling) và ngữ pháp (Grammar) trong một kiến trúc phi xâm lấn (Non-destructive):
```text
Document Text (ProseMirror Doc Node)
             ↓
    Proofing Subsystems
    ├─ SpellCheckerEngine    (Dictionary Providers)
    └─ GrammarCheckerEngine  (Pluggable Grammar Providers)
             ↓
  Unified Proofing Issues (ProofingIssue: SpellingIssue | GrammarIssue)
             ↓
ProseMirror Inline Decorations
  ├─ Red wavy underline   (.spelling-error-decoration) -> Lỗi chính tả
  └─ Blue wavy underline  (.grammar-error-decoration)  -> Lỗi ngữ pháp & dấu câu
```
- **Proofing Issue Model**:
  ```ts
  type ProofingIssueType = "spelling" | "grammar";

  interface GrammarIssue {
    id: string;             // Định danh issue duy nhất (grammar-${ruleId}-${from}-${to})
    type: "grammar";
    from: number;           // Vị trí bắt đầu trong ProseMirror document
    to: number;             // Vị trí kết thúc trong ProseMirror document
    ruleId: string;         // Mã định danh quy tắc (double-spaces, repeated-word, ...)
    ruleName?: string;      // Tên thân thiện hiển thị trên giao diện
    matchedText: string;    // Chuỗi ký tự gây lỗi
    message: string;        // Thông điệp giải thích ngữ pháp
    suggestions: string[];  // Danh sách đề xuất sửa lỗi
    severity: "error" | "warning" | "info";
  }
  ```
- **Dấu gạch chân phân biệt trực quan**:
  - **Lỗi chính tả (Spelling)**: Gạch răng cưa đỏ (`underline wavy #ef4444`).
  - **Lỗi ngữ pháp (Grammar)**: Gạch răng cưa xanh dương (`underline wavy #3b82f6`).

### 2. Bộ quy tắc Ngữ pháp Cục bộ (Local Grammar Rules - Precision > Quantity)
Triển khai bộ quy tắc cục bộ offline qua [`LocalGrammarProvider`](file:///c:/Users/hoang/.gemini/antigravity-ide/scratch/PersonalWordEditor/src/review/proofing/grammar/localGrammarProvider.ts), ưu tiên độ chính xác tuyệt đối để tránh làm phiền người dùng:
1. **Khoảng trắng thừa (`double-spaces`)**: Bắt 2 hoặc nhiều khoảng trắng liên tiếp trong văn bản; gợi ý thay bằng 1 khoảng trắng đơn.
2. **Khoảng trắng trước dấu câu (`space-before-punctuation`)**: Bắt khoảng trắng đặt trước các dấu `,`, `;`, `:`, `!`, `?`, `.`.
3. **Thiếu khoảng trắng sau dấu câu (`missing-space-after-punctuation`)**: Bắt dấu câu dính liền với từ tiếp theo mà không có khoảng trắng.
4. **Từ lặp lại (`repeated-word`)**: Bắt từ ngữ bị gõ lặp lại hai lần liên tiếp (hỗ trợ cả tiếng Anh lẫn tiếng Việt có dấu Unicode, ví dụ: `the the`, `và và`, `của của`).
5. **Viết hoa đầu câu (`capitalization`)**: Bắt chữ cái đầu câu viết thường sau dấu chấm kết câu `.`, `!`, `?`.
6. **Dấu chấm đôi bất thường (`double-period`)**: Bắt hai dấu chấm `..` liền kề không phải là dấu chấm lửng (`...`).

### 3. Khử Nhiễu & Xử lý Trường hợp Biên (Edge Cases & False Positives Suppression)
- **Bảo vệ tuyệt đối (Exclusion Zones)**: Tự động bỏ qua URL (`https://...`, `www...`), địa chỉ email, số thập phân (`3.14`), số hàng nghìn (`10,000`), định danh phiên bản (`v2.0`), tên tệp mở rộng (`.docx`, `.mwd`, `.png`, `.ts`), dấu chấm lửng (`...`) và các từ viết tắt thông dụng (`e.g.`, `etc.`, `mr.`, `dr.`, `tp.`).
- **Khối đối tượng đặc thù**: Bỏ qua hoàn toàn khối công thức toán học (`equation`), mã lệnh (`codeBlock`), ảnh (`image`), ngắt trang (`pageBreak`), ngắt phần (`sectionBreak`).

### 4. Tùy chỉnh & Khả năng mở rộng (Customization & Pluggable Architecture)
- **Kiến trúc cắm rút (`IGrammarProvider`)**: Chuẩn bị sẵn sàng để tích hợp thêm các dịch vụ mở rộng (như LanguageTool cục bộ hoặc AI) trong tương lai mà không cần viết lại giao diện hoặc ProseMirror plugin.
- **Bỏ qua lỗi (`Ignore Once`)**: Ẩn cảnh báo gạch xanh cho vị trí đó trong phiên làm việc hiện tại.
- **Tắt quy tắc (`Disable Rule`)**: Cho phép người dùng tắt một quy tắc cụ thể ngay từ menu ngữ cảnh, cấu hình được lưu bền bỉ trên máy cục bộ qua `localStorage`.

### 5. Giao diện & Thao tác sửa lỗi (UI & User Interaction)
- **Menu ngữ cảnh thông minh ([`SpellingContextMenu.tsx`](file:///c:/Users/hoang/.gemini/antigravity-ide/scratch/PersonalWordEditor/src/review/proofing/components/SpellingContextMenu.tsx))**: Tự động chuyển đổi giao diện tương ứng theo loại lỗi:
  - Hiển thị nhãn quy tắc màu xanh dương, thông điệp giải thích lỗi chi tiết.
  - Nút áp dụng gợi ý (`Apply Suggestion`) thực thi qua ProseMirror transaction chuẩn xác, bảo toàn định dạng xung quanh (In đậm, In nghiêng...), hỗ trợ đầy đủ Undo/Redo và cập nhật dirty state (`isDirty = true`).
  - Nút Bỏ qua lỗi này (`Ignore`).
  - Nút Tắt quy tắc này (`Disable Rule`).
- **Thanh công cụ Ribbon ([`ReviewRibbon.tsx`](file:///c:/Users/hoang/.gemini/antigravity-ide/scratch/PersonalWordEditor/src/components/ribbon/ReviewRibbon.tsx))**: Kích hoạt nút **Ngữ pháp (`Grammar`)** thuộc nhóm Kiểm lỗi, cho phép bật/tắt toàn bộ tính năng kiểm tra ngữ pháp độc lập với kiểm tra chính tả.

### 6. Hiệu năng (Performance & Non-blocking)
- Tích hợp chung vào cùng một lượt duyệt AST và cùng một cơ chế **Debounce (350ms)** với Spell Check.
- Quét đồng thời toàn bộ chính tả và ngữ pháp trên tài liệu lớn trong thời gian $< 15\text{ms}$, đảm bảo trải nghiệm gõ phím mượt mà không độ trễ.

### 4. Hiệu năng (Performance & Responsiveness)
- Không quét đồng bộ full-document trên mỗi phím gõ.
- Cơ chế **Debounce (350ms)**: Tự động gom thao tác gõ phím và chỉ quét lại khi người dùng dừng gõ.
- Khi văn bản thay đổi, ProseMirror `DecorationSet.map(tr.mapping)` tự động di chuyển vị trí gạch chân tức thì theo offset con trỏ mà không gây lag giật. Thời gian quét trung bình $< 15\text{ms}$ cho các tài liệu tiêu chuẩn.

### 5. Giới hạn thực tế (Known Limitations)
- **Chưa có Grammar Check**: Phase 5.2 chỉ tập trung vào kiểm tra chính tả từ ngữ đơn lẻ; kiểm tra ngữ pháp hoặc văn cảnh câu sẽ được xem xét ở các giai đoạn sau.
- **Từ điển dựa trên từ vựng cốt lõi**: Bộ từ điển nhúng được tinh gọn để chạy mượt mà trên desktop offline. Một số thuật ngữ kỹ thuật chuyên sâu hiếm gặp có thể cần người dùng chọn "Thêm vào từ điển" (`Add to Dictionary`).
- **Tiếng Việt**: Kiểm tra tính hợp lệ của từng âm tiết độc lập; chưa phân tích ngữ nghĩa kết hợp cụm từ đa âm tiết.

---

## Phạm vi tương thích DOCX (DOCX Compatibility Scope)

### Supported DOCX (Tính năng hỗ trợ chính thức)

- **Văn bản & Đoạn văn (Text & Paragraphs)**:
  - Paragraph, text run, line breaks, bảo toàn 100% trật tự văn bản và dấu tiếng Việt Unicode UTF-8.
  - Căn lề: Trái (Left), Giữa (Center), Phải (Right), Căn đều (Justify / `<w:jc w:val="both"/>`).
  - Giãn dòng (Line spacing: 1.0, 1.15, 1.5, 2.0) và thụt lề đoạn văn (Indents: 0..8 cấp).
- **Định dạng ký tự (Character Formatting)**:
  - In đậm (Bold), In nghiêng (Italic), Gạch chân (Underline), Gạch ngang (Strikethrough).
  - Phông chữ (Font family), cỡ chữ (Font size pt $\leftrightarrow$ half-points `w:sz`).
  - Màu chữ (Text color hex), Màu tô sáng (Highlight colors).
- **Kiểu dáng & Tiêu đề (Styles & Headings)**:
  - Normal paragraph style.
  - Semantic Heading 1, Heading 2, Heading 3 (`<w:pStyle w:val="Heading{1..3}"/>`).
- **Danh sách (Lists)**:
  - Bullet list (danh sách dấu chấm) và Numbered list (danh sách đánh số).
  - Đa cấp thụt lề (Nested multi-level lists, 0..8 levels) qua `word/numbering.xml`.
- **Liên kết (Hyperlinks)**:
  - Semantic mark `link` $\leftrightarrow$ `<w:hyperlink>` và external relationships (`TargetMode="External"`).
- **Bảng biểu (Tables)**:
  - Cấu trúc `w:tbl`, `w:tr`, `w:tc`.
  - Hàng tiêu đề bảng (`<w:tblHeader/>`).
  - Độ rộng cột (`colwidth` $\leftrightarrow$ `w:tcW` twips).
  - Gộp ô ngang (`colspan` $\leftrightarrow$ `<w:gridSpan>`).
  - Màu nền ô (`backgroundColor` $\leftrightarrow$ `<w:shd>`).
  - Căn lề dọc ô (`verticalAlign` $\leftrightarrow$ `<w:vAlign>`).
  - Tự động đảm bảo mỗi ô luôn chứa ít nhất một đoạn văn hợp lệ.
- **Hình ảnh (Images)**:
  - Trích xuất ảnh nhị phân (PNG, JPEG) thành Data URL độc lập, tự chứa trong `.mwd`.
  - Xuất ảnh sang `word/media/image*.png/jpeg` chuẩn DrawingML (`w:drawing`, `wp:inline`, `wp:extent`, `pic:pic`).
  - Tài liệu hoàn toàn self-contained, không phụ thuộc đường dẫn file ngoài.
- **Thiết lập trang (Page Settings)**:
  - Khổ giấy: A4, A3, Letter, Legal.
  - Hướng trang: Portrait (Dọc) và Landscape (Ngang).
  - Lề trang (Margins): Normal, Narrow, Wide và Custom Margins (quy đổi chính xác giữa mm và twips).
- **Ngắt trang (Page Break)**:
  - Semantic atom node `pageBreak` $\leftrightarrow$ `<w:r><w:br w:type="page"/></w:r>`.
- **Phân đoạn (Sections & Section Breaks)**:
  - Ngắt phần `sectionBreak` (Next Page).
  - Hỗ trợ tài liệu đa section với khổ giấy, hướng trang và lề trang khác nhau.
  - Tuân thủ quy tắc vị trí `<w:sectPr>` trong chuẩn OOXML.
- **Tiêu đề đầu trang & chân trang (Header / Footer)**:
  - Header và Footer riêng biệt từng section (`word/header*.xml`, `word/footer*.xml`).
  - Kế thừa section (`linkToPrevious`).
  - Số trang động: Nhận diện trường `{PAGE}` và `{NUMPAGES}` $\leftrightarrow$ `<w:fldSimple w:instr="PAGE"/>` và `<w:fldSimple w:instr="NUMPAGES"/>`.
- **Độ bền bỉ & Chống lỗi tệp (Fault Tolerance & Integrity)**:
  - Xử lý an toàn các tệp hỏng: file rỗng, file không phải ZIP, thiếu `document.xml`, thiếu styles/numbering, broken XML. Không làm sập ứng dụng, không làm mất tài liệu đang mở.
  - Unknown OOXML nodes: Bỏ qua an toàn (`skip safely`), không throw lỗi ngoại lệ làm gián đoạn import.
  - Tracked Changes & Fields: Trích xuất an toàn text trong `<w:ins>`, `<w:smartTag>`, `<w:fldSimple>`.
  - Save Failure: Bảo toàn `isDirty = true` nếu quá trình ghi file thất bại.

### Not Yet Supported (Giới hạn thực tế & Tính năng chưa hỗ trợ)

> **Thông báo trung thực**: Personal Word Editor **không tuyên bố tương thích 100% với toàn bộ hệ sinh thái Microsoft Word** (Not fully compatible with Microsoft Word). Chuẩn OOXML gồm hàng nghìn đặc tả phức tạp; ứng dụng tập trung vào bảo toàn toàn vẹn nội dung, cấu trúc và các đối tượng ngữ nghĩa mà editor hỗ trợ.

Các tính năng Word chưa được hỗ trợ và chính sách xử lý:
1. **Biểu đồ & Đồ họa phức tạp (Chart, SmartArt, WordArt)**: Bỏ qua an toàn khi đọc DOCX (`ignore safely`), không gây lỗi gián đoạn.
2. **Theo dõi thay đổi & Bình luận (Tracked Changes & Comments)**: Khi import, trích xuất an toàn nội dung văn bản bên trong `<w:ins>` và bỏ qua thẻ xóa `<w:del>` cũng như khối comments mà không làm mất text chính.
3. **Chú thích cuối trang & cuối tài liệu (Footnotes & Endnotes)**: Chưa hỗ trợ cấu trúc footnote/endnote chuyên biệt.
4. **Công thức toán học phức tạp trong DOCX (OMML / MathML)**: Trích xuất an toàn chuỗi ký tự hiển thị từ `<m:oMath>`; trong editor, công thức toán học sử dụng LaTeX và KaTeX làm Source of Truth trong `.mwd`. Khi xuất DOCX, công thức được xuất dưới dạng văn bản in nghiêng sạch sẽ.
5. **Khối vẽ nâng cao & Chữ ôm hình (Shapes, Text Wrapping)**: Trong editor, Shape và TextBox được định vị an toàn dạng block. Chưa hỗ trợ chế độ chữ ôm hình uốn lượn (Tight / Through wrapping) hay vị trí trôi tự do (Absolute Floating) trên trang giấy.
6. **Macro & Mã lập trình (Macros, VBA, OLE Objects)**: Tự động loại bỏ hoàn toàn để bảo đảm an toàn bảo mật.
7. **Gộp ô dọc trong bảng (Rowspan)**: Chưa hỗ trợ gộp ô theo chiều dọc khi xuất sang Word (hỗ trợ gộp ô ngang `colspan` / `gridSpan`).

---

### Bảng kết quả kiểm định tương thích tổng thể (Final Compatibility Matrix)

| Hạng mục kiểm thử | Tiêu chuẩn đánh giá | Kết quả |
| :--- | :--- | :---: |
| **DOCX Import** | Đọc các tệp `.docx` thực tế: text, heading, định dạng, danh sách, bảng biểu, hình ảnh, ngắt trang, đa section, header/footer. Chống chịu lỗi tệp hỏng, file rỗng, thiếu part. | **PASS** |
| **DOCX Export** | Tạo gói ZIP DOCX chuẩn ISO/IEC 29500 với XML, relationships, media hợp lệ. Mở thành công 100% trên Microsoft Word và phần mềm tương thích Word. | **PASS** |
| **Text** | Nhập/xuất đoạn văn, dấu xuống dòng, khoảng trắng, bảo toàn 100% Unicode tiếng Việt. | **PASS** |
| **Formatting** | Bold, Italic, Underline, Strikethrough, Font, Size, Color, Highlight không bị mất hay lây lan format. | **PASS** |
| **Styles/Headings** | Ánh xạ ngữ nghĩa Heading 1, 2, 3 và Normal style kế thừa chuẩn. | **PASS** |
| **Lists** | Numbering thực tế, Bullet, Numbered và thụt lề đa cấp (nested lists 0..8). | **PASS** |
| **Hyperlinks** | Bảo toàn URL đích và anchor text hiển thị qua relationships đối ngoại. | **PASS** |
| **Tables** | Cấu trúc hàng/cột, tiêu đề bảng, độ rộng cột, gộp ô ngang, màu nền, căn lề ô. | **PASS** |
| **Images** | Tách trích Data URL nhị phân, lưu `word/media/`, DrawingML chuẩn Word, self-contained. | **PASS** |
| **Page Settings** | Chuyển đổi chính xác khổ giấy (A4, A3, Letter, Legal), hướng trang và lề trang mm $\leftrightarrow$ twips. | **PASS** |
| **Page Break** | Bảo toàn ngắt trang semantic `pageBreak` $\leftrightarrow$ `<w:br w:type="page"/>`. | **PASS** |
| **Sections** | Đa section với thiết lập trang riêng biệt, tuân thủ vị trí `<w:sectPr>` OOXML. | **PASS** |
| **Header/Footer** | Tiêu đề đầu/chân trang riêng từng section, liên kết kế thừa, không ghi đè body. | **PASS** |
| **Page Number** | Trường động `{PAGE}` và `{NUMPAGES}` $\leftrightarrow$ `<w:fldSimple>`. | **PASS** |
| **DOCX → Editor** | Nhập DOCX chuyển đổi an toàn thành Internal Document Model. | **PASS** |
| **Editor → DOCX** | Xuất Internal Document Model thành DOCX hợp lệ chuẩn mở. | **PASS** |
| **Editor → DOCX → Editor** | Round-Trip A hoàn chỉnh, bảo toàn trọn vẹn ngữ nghĩa, cấu trúc và dữ liệu. | **PASS** |
| **Old .mwd Compatibility** | Tương thích ngược 100% với tài liệu `.mwd` tạo từ Phase 1, Phase 2, Phase 3. | **PASS** |
| **Phase 1 Regression** | New, Open, Save, History, Formatting, Paragraph, Search/Replace, Zoom, Dirty State, Status Bar. | **PASS** |
| **Phase 2 Regression** | Paper Size, Orientation, Margins, Pagination, Sections, Header/Footer. | **PASS** |
| **Phase 3 Regression** | Link, Line, Symbol, Table, Image, Text Box, Shape, Equation được bảo toàn nguyên vẹn trong `.mwd`. | **PASS** |
| **Production Build** | `npm run build` (`tsc && vite build`) hoàn thành 0 lỗi; `cargo check` backend Rust đạt chuẩn 100%. | **PASS** |

---

## Kiến trúc & Đặc tả kỹ thuật các đối tượng Insert

### 1. Chiến lược lưu trữ hình ảnh (Image Persistence Strategy)
- **Độc lập và tự chứa (Self-Contained Embedded Data)**: Hình ảnh tải lên từ máy tính qua Native File Dialog được chuyển đổi ngay lập tức thành chuỗi `data:image/...;base64,...` bằng `FileReader` và lưu trực tiếp trong thuộc tính `src` của node `image` bên trong file `.mwd`.
- **Không phụ thuộc đường dẫn cục bộ**: Tránh hoàn toàn lỗi mất ảnh khi tệp ảnh gốc trên đĩa cứng bị di chuyển, đổi tên hoặc khi chia sẻ file `.mwd` sang máy tính khác.
- **Giới hạn an toàn**: Áp dụng giới hạn dung lượng tối đa **10MB** cho mỗi tệp hình ảnh để tối ưu hóa hiệu năng nạp/lưu và quản lý bộ nhớ RAM.

### 2. Hiện thực Công thức Toán học (Equation Implementation)
- **Kiến trúc 3 tầng**: `ProseMirror Equation Atom Node` $\to$ `LaTeX Source Attribute` $\to$ `KaTeX Render Engine`.
- **Source of Truth**: Mã nguồn LaTeX thô (ví dụ: `\int_{-\infty}^{\infty} e^{-x^2} dx = \sqrt{\pi}`) là dữ liệu duy nhất được lưu trong `.mwd`. Tuyệt đối không lưu cây DOM rendered của KaTeX vào file để tránh phình to kích thước và xung đột phiên bản.
- **Bảo mật**: Sử dụng `katex.render` trực tiếp, không sử dụng `eval` hoặc `innerHTML` không kiểm soát, chế độ `throwOnError: false` ngăn chặn sập app khi cú pháp LaTeX sai.

### 3. Giới hạn hiện tại (Architectural Constraints & Known Limitations)
1. **Table Limitations**:
   - Độ rộng cột dựa trên `colwidth` và tỷ lệ phần trăm vùng soạn thảo; chưa hỗ trợ lặp lại hàng tiêu đề (Repeat Header Row) khi bảng bị phân tách tự động qua nhiều trang.
2. **Text Box & Shapes Limitations**:
   - Định vị an toàn cấp block (`alignment: "left" | "center" | "right"`), không áp dụng mô hình absolute floating tùy ý trên toàn trang giấy (nhằm tránh phá vỡ luồng lựa chọn, con trỏ phím và engine phân trang hai tầng).
   - Chưa hỗ trợ chế độ chữ bao quanh hình vẽ dạng uốn lượn phức tạp (Tight/Through text wrapping).
3. **Pagination & Reflow**:
   - Hệ thống áp dụng công thức ước lượng chiều cao trực giao có chặn trên/dưới trong `estimateContentHeightPx` để đảm bảo không xảy ra hiện tượng reflow lặp vô hạn.

---

## Danh mục chức năng tổng thể đã hoàn thành

| Nhóm chức năng | Chi tiết tính năng đã triển khai | Trạng thái |
| :--- | :--- | :---: |
| **DOCX FIDELITY 2.0 (7–11)** | • **Phase 7 (Drawing Anchor Foundation)**: Unified drawing anchor model, parser & serializer DrawingML `<wp:anchor>` / `<wp:inline>`, tọa độ chuẩn EMU/Twips/Points/Pixels, z-index, behindDoc, relative horizontal/vertical positioning.<br>• **Phase 8 (Floating Images)**: Nhập/xuất ảnh floating và inline, căn chỉnh hình học, bounding box, export DrawingML không flatten.<br>• **Phase 9 (Floating Object Text Wrapping)**: Semantic wrap modes (Inline, Square, Tight contour & safe fallback, Top & Bottom, None), wrap distance validation, reflow phân trang an toàn.<br>• **Phase 10 (Floating TextBox Import / Export)**: Hỗ trợ TextBox floating và block mode, bảo toàn 100% rich text paragraphs & formatting, DrawingML `<wps:txbx><w:txbxContent>`, VML legacy fallback, caret/selection/IME safety.<br>• **Phase 11 (Core Shape DrawingML Mapping)**: Nhập/xuất các hình học semantic cơ bản (Rectangle, Rounded Rectangle, Ellipse, Line, Arrow), ánh xạ DrawingML `<wps:wsp>` và `<a:prstGeom>`, bảo toàn màu tô (sRGB, Office Theme schemeClr, noFill), đường viền (strokeColor, strokeWidth, noFill), kích thước, floating offsets, wrap modes; chính sách bảo vệ hình học phức tạp (custom geometry `<a:custGeom>`, WordArt, SmartArt, preset unsupported không bị ánh xạ sai thành Rectangle); tương thích VML legacy shape `<v:rect>`, `<v:roundrect>`, `<v:oval>`, `<v:line>`, `<v:shape>`; cấp phát docPr ID duy nhất chống Word repair; an toàn Undo/Redo.<br>• **54 bài test chuyên sâu** (Phase 7–11), nâng tổng số test lên **1089/1089 bài test tự động (100% PASS)**. | **PASS** |
| **REVIEW ENGINE (5.1)** | • **Kiến trúc phân tầng Review Engine (`src/review/`)**: Tách bạch `proofing/`, `comments/`, `trackChanges/`, `statistics/`, `commands/`, `services/`, `hooks/`, `components/`, `types/`, `utils/`.<br>• **Review Registry (`reviewRegistry.ts`)**: Quản lý tập trung 11 phần tử thuộc 5 nhóm chuẩn Office (Proofing, Comments, Tracking, Changes, Document).<br>• **Review Ribbon (`ReviewRibbon.tsx`)**: Thanh công cụ đầy đủ 5 nhóm với cơ chế bảo vệ dấu nháy editor (`preventBlur`), nút disabled/planned rõ ràng.<br>• **Document Statistics Modal (`DocumentStatisticsModal.tsx`)**: Hộp thoại thống kê chi tiết đếm Trang, Từ, Ký tự (có/không khoảng trắng), Đoạn văn, Dòng ước tính từ AST theo thời gian thực.<br>• **Subsystem Isolation**: Tách biệt hoàn toàn trạng thái và dịch vụ giữa Proofing, Comments, và Track Changes.<br>• **6 bài test chuyên sâu** (`reviewEngine.test.ts`), nâng tổng số test lên **275/275 đạt chuẩn 100%**. | **PASS** |
| **SHAPES & EQUATION (3.8)** | • **Shapes (5 loại core)**: Rectangle, Rounded Rectangle, Ellipse, Line, Arrow.<br>• **Shape Model**: Node `shape` atom block, lưu `shapeType`, `width`, `height`, `fillColor`, `strokeColor`, `strokeWidth`, `alignment`. Render SVG vector sạch sẽ.<br>• **Shape Editing**: Insert, select, resize, đổi màu fill/stroke, stroke width, căn lề, xóa.<br>• **Equation Node**: Node `equation` atom block lưu `latex`, `displayMode`, `alignment`. LaTeX là Source of Truth trong `.mwd`.<br>• **KaTeX Renderer**: Kết xuất công thức an toàn, không eval, sanitize bảo mật, live preview, 9 mẫu template toán học.<br>• **Pagination Safety**: Đo lường chiều cao hữu hạn, không loop.<br>• **14 bài test chuyên sâu** (`phase3_8.test.ts`), nâng tổng số test lên **221/221 đạt chuẩn 100%**. | **PASS** |
| **TEXT BOX (3.7)** | • **Semantic Block Node**: Node `textBox` (`group: "block"`, `content: "block+"`, `isolating: true`), không dùng contenteditable tách rời.<br>• **Insert Ribbon**: Nút `Text Box` trên tab Insert, chèn hộp kích thước 320×80px, tự động đưa caret vào bên trong hộp.<br>• **Formatting & Editing**: Gõ chữ, format in đậm, in nghiêng, đổi màu, căn lề văn bản bên trong; chọn hộp và xóa bằng `deleteTextBox`; hỗ trợ Undo/Redo toàn diện.<br>• **Safe Positioning**: Căn lề Trái, Giữa, Phải qua thuộc tính `alignment` trong giới hạn trang giấy.<br>• **Validation**: Chuẩn hóa kích thước 120–800px width, 40–600px height qua `validateTextBoxDimensions`.<br>• **Save/Open**: Lưu trữ đầy đủ attrs và nội dung trong `.mwd`.<br>• **12 bài test chuyên sâu** (`phase3_7.test.ts`), nâng tổng số test lên **207/207 đạt chuẩn 100%**. | **PASS** |
| **TABLE ADVANCED (3.4)** | • **Merge & Split Cells**: Lệnh `mergeCells`, `splitCell` qua ProseMirror transactions và CellSelection native.<br>• **Column Resizing**: Kéo thả viền cột mượt mà, lưu `colwidth` vào node attributes `.mwd`, độc lập với zoom.<br>• **Cell Alignment & Shading**: Căn lề Trái/Giữa/Phải, Đỉnh/Giữa/Đáy; bảng màu nền pastel; Undo/Redo an toàn.<br>• **Table Borders**: Hỗ trợ All Borders, Outside Borders, No Borders.<br>• **Contextual Toolbar**: Thanh công cụ ngữ cảnh `TableContextualToolbar` tự động xuất hiện/ẩn khi ra vào bảng.<br>• **195 bài test nền tảng** đạt chuẩn 100%. | **PASS** |
| **TABLE CORE (3.3)** | • **Table Extensions**: Tích hợp `@tiptap/extension-table`, `@tiptap/extension-table-row`, `@tiptap/extension-table-cell`, `@tiptap/extension-table-header`.<br>• **Insert Table**: Popover Grid 8×8 và Dialog tạo bảng với validation ($1 \le \text{rows} \le 50$, $1 \le \text{cols} \le 20$).<br>• **Table Editing**: Điều hướng phím `Tab`/`Shift+Tab`, thêm/xóa hàng/cột, toggle header row, xóa bảng.<br>• **183 bài test nền tảng** đạt chuẩn 100%. | **PASS** |
| **HYPERLINK, LINE & SYMBOL (3.2)** | • **Hyperlink Semantic Mark**: Nút bấm `Ribbon → Insert → Link`, phím tắt `Ctrl+K`, đánh dấu link đang active trên Ribbon.<br>• **Hyperlink Dialog**: Hộp thoại nổi nhập văn bản hiển thị và URL; tự động điền vùng chọn; hỗ trợ `https://`, `http://`, `mailto:`, tự chuẩn hóa domain; nút "Xóa liên kết" khi đang chọn link; báo lỗi thân thiện không crash.<br>• **Horizontal Rule Node**: Chèn đường kẻ ngang ngữ nghĩa `horizontalRule`; tách đoạn văn sạch sẽ; undo/redo mượt mà; hiển thị nét kẻ tinh tế và outline chọn.<br>• **Symbol Picker**: Dialog chọn ký tự đặc biệt với danh mục phân loại, tìm kiếm, xem trước mã Unicode, chèn tại caret giữ nguyên font/style và an toàn với tiếng Việt.<br>• **169/169 bài test tự động** đạt chuẩn 100%. | **PASS** |
| **INSERT ENGINE (3.1)** | • **Kiến trúc mô-đun Insert Engine (`src/insert/`)**: Tách bạch `types/`, `commands/`, `services/`, `hooks/`, `components/`.<br>• **Insert Registry (`src/insert/services/insertRegistry.ts`)**: Quản lý tập trung 13 phần tử chèn thuộc 7 nhóm với trạng thái `active` vs `planned`.<br>• **Command Abstraction Layer (`src/insert/commands/insertCommands.ts`)**: Chuẩn hóa luồng điều phối lệnh `dispatchInsertCommand`, kiểm tra hỗ trợ schema `isItemSupportedInSchema` và khả năng thực thi `canInsertItem`.<br>• **Insert Ribbon UI (`src/components/ribbon/InsertRibbon.tsx`)**: 7 nhóm công cụ chuẩn Word: Pages, Tables, Illustrations, Links, Header & Footer, Text, Symbols.<br>• **Active Features**: Page Break, Section Break, Header, Footer, Page Number, Link, Horizontal Line, Symbol.<br>• **Planned Placeholders**: Table (3.3), Pictures (3.x), Shapes (3.x), Text Box (3.x), Equation (3.x) với trạng thái disabled minh bạch, không nút giả.<br>• **153 bài test nền tảng** kế thừa đạt chuẩn 100%. | **PASS** |
| **FINAL AUDIT (2.9)** | • **End-to-End Workflow Audit**: Tạo doc Section 1 (A4 Portrait Normal) + Section 2 (A4 Landscape Custom) + Header + Footer + PageNum, Save/Open `.mwd` bảo toàn 100%.<br>• **Reflow Stability**: Thêm/xóa text, đổi font/size/heading/line spacing không gây vòng lặp vô hạn, không mất text.<br>• **Phase 1 Zero-Regression**: Toàn bộ thao tác File, History, Formatting, Paragraph, Search, Zoom hoạt động hoàn hảo.<br>• **144/144 bài test tự động** đạt chuẩn 100%. | **PASS** |
| **HEADER, FOOTER & PAGE NUMBER (2.8)** | • **Header/Footer Data Model**: Thuộc document model (`document.headerFooter` cho Section 1, `attrs.headerFooter` cho Section $k > 1$), lưu trữ và mở an toàn qua `.mwd`.<br>• **Trình chỉnh sửa trực quan (Inline Interactive Editor)**: Mở bằng nhấp đúp vào lề hoặc qua Ribbon; hỗ trợ gõ text, căn lề Trái/Giữa/Phải, In đậm, In nghiêng; phân định ranh giới rõ ràng; thân trang làm mờ (`is-dimmed`), nhấn Esc hoặc nhấp vào thân trang để thoát.<br>• **Số trang động (Dynamic Page Numbers)**: Token `{PAGE}` và `{NUMPAGES}`, tính toán tự động qua `formatHeaderFooterText`, cập nhật ngay khi reflow.<br>• **Section Linking & Inheritance**: Kế thừa mặc định từ section trước (`linkToPrevious: true`), nút chuyển đổi ngắt/kết nối liên kết để tùy biến tiêu đề riêng từng mục.<br>• **Zero-Regression & Kiểm thử**: Bảo toàn 100% editor body, formatting, pagination, dirty state, save/open. | **PASS** |
| **SECTION MODEL (2.7)** | • **Section Model & Architecture**: Khái niệm Section logic (`Document -> Section 1 -> Section 2`), bảo toàn 1 ProseMirror document duy nhất làm Single Source of Truth.<br>• **Semantic Node `sectionBreak`**: Block atom node lưu `sectionType: "nextPage"`, `sectionId`, và `pageSettings` riêng biệt.<br>• **Section-specific Page Settings**: Tự động kế thừa thiết lập từ section trước; cho phép tùy biến độc lập khổ giấy, hướng trang và lề cho từng section.<br>• **Mixed Sheet Rendering**: Render chuẩn xác các trang giấy có khổ và hướng khác nhau (ví dụ: A4 Portrait kết hợp A4 Landscape).<br>• **UI Ribbon Breaks**: Thêm mục `Section Break (Next Page)` trong menu Layout → Breaks; hiển thị Section badge trên Ribbon và Status Bar.<br>• **Edge Cases & Stability**: Xử lý đầu/cuối doc, tách block, adjacent breaks, xóa break tự động gộp section, undo/redo 1 chạm.<br>• **Persistence & Backward Compatibility**: Lưu/mở `.mwd` bảo toàn section; tương thích ngược 100% với file cũ.<br>• **129/129 bài test tự động** đạt chuẩn 100%. | **PASS** |
| **REAL PAGINATION (2.6)** | • **Hệ thống hiển thị đa trang vật lý (Multi-Page Sheets)**: Hiển thị Page 1, Page 2, Page 3... với kích thước chuẩn mm, hướng giấy, lề trang, viền đổ bóng và khoảng cách 24px.<br>• **Kiến trúc 2 tầng (Two-Layer)**: Giữ nguyên 1 ProseMirror document duy nhất, bảo toàn 100% caret, selection xuyên trang, IME tiếng Việt, undo/redo, Find/Replace.<br>• **Ngắt trang Explicit chuẩn xác**: `calculateBreakSpacerForPages` đẩy nội dung sau ngắt trang bắt đầu chính xác tại lề trên trang tiếp theo.<br>• **Automatic Overflow**: Tự động tính toán số trang từ kích thước render thực tế mà không mutate AST.<br>• **Reflow & RAF Batching**: Debounce tính toán layout qua `requestAnimationFrame`, reflow theo text/style/margins/size/orientation.<br>• **Dynamic Status Bar**: Hiển thị `Trang {currentPage} / {pageCount}` theo vị trí con trỏ thực tế. | **PASS** |

| **PAGE BREAK (2.5)** | • **Semantic Atom Node `pageBreak`**: Node ngắt trang block atom, serialize và deserialize qua `.mwd`, không gõ chữ bên trong.<br>• **Insert Command Abstraction**: `insertPageBreak(editor)` qua ProseMirror transaction nguyên tử, Ribbon không chạm DOM.<br>• **UI Ribbon Layout**: `Layout → Breaks → Page Break` với icon chuyên biệt và shortcut badge.<br>• **Phím tắt `Ctrl + Enter`**: Chèn ngắt trang tức thời.<br>• **Visual Marker**: `──────── PAGE BREAK ────────` trang trí UI, không lưu text vào doc, không tính vào thống kê từ.<br>• **Edge Cases & An toàn cấu trúc**: Xử lý đầu/cuối doc, tách paragraph, giữa headings/lists, undo/redo 1 chạm, save/open roundtrip. | **PASS** |
| **CUSTOM MARGINS (2.4)** | • **Custom Margins Dialog**: Hộp thoại tùy chỉnh lề Top, Bottom, Left, Right đơn vị cm, quy đổi chuẩn mm.<br>• **Validation vật lý**: Chặn số âm, NaN, Infinity, lề triệt tiêu nội dung; báo lỗi không corrupt doc.<br>• **Preset Detection**: Tự động nhận diện preset nếu trùng chuẩn, hoặc gán Custom.<br>• **Save/Open Round-Trip**: Lưu và nạp lại chính xác từ file `.mwd`, dirty state chuẩn xác. | **PASS** |
| **LAYOUT RIBBON (2.3)** | • **Page Setup Group**: Nút & Dropdown chọn Hướng trang, Khổ giấy (A4, A3, Letter, Legal), Preset lề (Normal, Narrow, Wide).<br>• **UX Hoàn thiện**: Đóng khi chọn, đóng bằng Escape/Click-outside, bảo toàn focus/selection editor.<br>• **No Duplication**: Dùng 100% preset trung tâm, không hardcode số liệu.<br>• **Dirty State & Save/Open**: Theo dõi dirty state chuẩn xác, kiểm thử chuỗi A4→A3→Letter→Legal, Portrait↔Landscape, Normal→Narrow→Wide. | **PASS** |
| **PAGE ENGINE (2.2)** | • **Paper Size & Orientation**: Render giấy vật lý thực tế theo A4, A3, Letter, Legal và Portrait / Landscape.<br>• **PageRenderer Architecture**: Tách biệt `PageSettings` → `PageRenderer` → `Editor Page`. Ribbon không chạm DOM.<br>• **Workspace & Scrolling**: Căn giữa trang, thanh cuộn 2 chiều mượt mà cho A3/Landscape, không tràn Ribbon.<br>• **Zoom độc lập**: Thu phóng 50%–200% không làm biến đổi Document Model. | **PASS** |
| **PAGE MODEL (2.1)** | • **Page Settings Model**: Hỗ trợ khổ giấy A4, A3, Letter, Legal; Hướng Portrait & Landscape; Lề mm độc lập.<br>• **Presets lề**: Normal (25.4mm), Narrow (12.7mm), Wide (25.4/50.8mm), Custom.<br>• **Tích hợp Model**: Lưu vào `.mwd`, đồng bộ Store, dirty state, tương thích ngược file Phase 1.<br>• **Hiển thị linh hoạt**: Trang giấy tự co giãn theo khổ & lề qua CSS variables. | **PASS** |
| **FILE** | • **New (`Ctrl+N`)**: Khởi tạo tài liệu mới, xóa đường dẫn tệp và đưa editor về trạng thái ban đầu.<br>• **Open (`Ctrl+O`)**: Hộp thoại chọn tệp native Windows lọc file `*.mwd`, nạp và kiểm tra tính hợp lệ AST.<br>• **Save (`Ctrl+S`)**: Ghi đè trực tiếp vào file hiện tại; nếu chưa có tệp thì tự chuyển hướng sang Save As.<br>• **Save As (`Ctrl+Shift+S`)**: Hộp thoại lưu tệp native Windows, xuất file `*.mwd`, đồng bộ title và gán đường dẫn mới. | **PASS** |
| **HISTORY** | • **Undo (`Ctrl+Z`)**: Hoàn tác thay đổi qua ProseMirror history.<br>• **Redo (`Ctrl+Y` / `Ctrl+Shift+Z`)**: Làm lại thao tác.<br>• **Trạng thái động**: Nút tự động vô hiệu hóa (disabled) khi ngăn xếp rỗng. | **PASS** |
| **CLIPBOARD** | • **Cut (`Ctrl+X`)**: Cắt vùng chọn văn bản.<br>• **Copy (`Ctrl+C`)**: Sao chép nội dung vào Clipboard hệ thống.<br>• **Paste (`Ctrl+V`)**: Dán văn bản giữ nguyên an toàn, tích hợp native clipboard. | **PASS** |
| **FONT** | • **In đậm (Bold - `Ctrl+B`)**, **In nghiêng (Italic - `Ctrl+I`)**, **Gạch chân (Underline - `Ctrl+U`)**, **Gạch ngang (Strikethrough)**.<br>• **Font Family**: Hỗ trợ font phổ biến (Calibri, Arial, Times New Roman, Verdana, Georgia, Courier New) kèm CSS fallback an toàn.<br>• **Font Size**: Danh sách preset (8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 72 pt) và ô nhập tùy biến với validation nghiêm ngặt (4–144 pt).<br>• **Text Color & Highlight**: Bảng màu trực quan, hỗ trợ tô sáng đa màu sắc. | **PASS** |
| **PARAGRAPH** | • **Căn lề**: Căn trái (Left), Căn giữa (Center), Căn phải (Right), Căn đều (Justify).<br>• **Danh sách**: Danh sách dấu chấm (Bullet List), Danh sách đánh số (Numbered List) dùng cấu trúc ProseMirror node thật.<br>• **Thụt lề (Indent / Outdent)**: Lồng cấp danh sách (sink/lift) hoặc thụt lề đoạn văn (data-indent 0–8).<br>• **Line Spacing**: Khoảng cách dòng (1.0, 1.15, 1.5, 2.0) lưu trực tiếp vào node attributes của paragraph và heading. | **PASS** |
| **STYLES** | • **Normal**: Đoạn văn chuẩn.<br>• **Heading 1, 2, 3**: Node tiêu đề semantic thật (level 1–3), hỗ trợ định dạng lề và giãn dòng. | **PASS** |
| **EDITING** | • **Find (`Ctrl+F`)**: Hộp thoại tìm kiếm nổi, highlight bằng ProseMirror Decorations không làm bẩn document, hiển thị số kết quả (X/Y), điều hướng Next/Previous vòng lặp, tùy chọn Case-Sensitive.<br>• **Replace (`Ctrl+H`)**: Thay thế kết quả hiện tại hoặc Thay thế tất cả (Replace All) nguyên tử.<br>• **Select All (`Ctrl+A`)** & **Xem AST JSON**: Modal hiển thị trực tiếp cây dữ liệu tài liệu. | **PASS** |
| **APP SHELL & LAYOUT** | • **Workspace Canvas**: Khung hiển thị trang giấy vật lý tự động co giãn theo `PageSettings` với đổ bóng trang giấy chân thực.<br>• **Ribbon**: Thanh công cụ 7 tab (File, Home, Insert, Layout, References, Review, View) với Home đầy đủ tính năng.<br>• **Status Bar**: Hiển thị số từ (`Words`), số ký tự (`Characters`) từ nội dung thực tế; thông tin trang `Trang 1 (Visual)`; hiển thị khổ giấy & hướng trang `A4 · Dọc`.<br>• **Zoom (50% – 200%)**: Nút `[-]`, slider, nút `[+]`, nhãn `%`, phím tắt `Ctrl+=` / `Ctrl+-` / `Ctrl+0`. Thu phóng qua CSS variable `--editor-zoom`, không làm biến đổi font size tài liệu.<br>• **Dirty State**: Nhận diện thay đổi chưa lưu (kể cả khi đổi PageSettings), hiển thị dấu `*` trên tiêu đề và thanh trạng thái.<br>• **Close Protection**: Ngăn đóng app hoặc chuyển tệp khi chưa lưu với hộp thoại Save / Don't Save / Cancel.<br>• **Bảo toàn focus**: Áp dụng `preventBlur` trên toàn bộ controls tránh mất dấu nháy hay selection. | **PASS** |

---

## Định dạng tệp tin nội bộ (*.mwd)

Ứng dụng sử dụng định dạng tài liệu cá nhân có phiên bản **`*.mwd`** (Personal Word Document):

```json
{
  "format": "PersonalWordDocument",
  "version": 1,
  "metadata": {
    "id": "doc-uuid-string",
    "title": "BaoCaoTongKet",
    "version": 3,
    "createdAt": "2026-10-06T14:00:00.000Z",
    "updatedAt": "2026-10-06T15:30:00.000Z"
  },
  "pageSettings": {
    "paperSize": "A4",
    "orientation": "portrait",
    "margins": {
      "top": 25.4,
      "right": 25.4,
      "bottom": 25.4,
      "left": 25.4
    },
    "marginPreset": "Normal"
  },
  "document": {
    "type": "doc",
    "content": [
      {
        "type": "heading",
        "attrs": { "level": 1, "textAlign": "center", "lineSpacing": "1.5" },
        "content": [{ "type": "text", "text": "Tiêu đề tài liệu" }]
      },
      {
        "type": "paragraph",
        "attrs": { "lineSpacing": "1.15", "indent": 0 },
        "content": [
          { "type": "text", "text": "Đoạn văn chứa từ " },
          { "type": "text", "marks": [{ "type": "bold" }], "text": "in đậm" }
        ]
      }
    ]
  }
}
```

---

## Mức phân trang thực tế đã đạt (Pagination Implementation Level) & Giới hạn

- **Mức phân trang đã đạt ở Phase 2.6**:
  1. **Hệ thống hiển thị đa trang vật lý (Multi-Sheet Physical Canvas)**: Render `Page 1`, `Page 2`, `Page 3`, ... với kích thước mm chuẩn theo khổ giấy (`A4`, `A3`, `Letter`, `Legal`), hướng (`Portrait`, `Landscape`), lề trang (`Normal`, `Narrow`, `Wide`, `Custom`) và khoảng cách giữa các trang $24\text{px}$.
  2. **Bảo toàn 100% ProseMirror document**: 1 document duy nhất làm nguồn dữ liệu, không tạo nhiều editor instance, bảo toàn trọn vẹn caret, selection xuyên trang, typing, gõ tiếng Việt IME, undo/redo, Find/Replace.
  3. **Ngắt trang Explicit hoàn chỉnh**: Node `pageBreak` semantic tự động tính toán spacer chính xác để đẩy nội dung tiếp theo bắt đầu ngay tại lề trên của trang kế tiếp (`content A -> pageBreak -> content B`).
  4. **Automatic Overflow**: Tự động tăng số trang vật lý khi nội dung vượt chiều cao khả dụng dựa trên rendered dimensions thực tế (`scrollHeight`).
  5. **Status Bar năng động**: Hiển thị `Trang {currentPage} / {pageCount}` theo vị trí con trỏ thực tế trong tài liệu.
  6. **Reflow & RAF Batching**: Tính toán bố cục phân trang tối ưu bằng `requestAnimationFrame`, reflow theo text, style, margins, paper size, orientation.

- **Giới hạn an toàn kiến trúc trang (Architectural Boundaries)**:
  1. **Không bẻ dòng đoạn văn giữa khe trang vật lý khi không có explicit break**: Việc cắt một đoạn văn bản duy nhất thành hai nửa qua khe hở DOM mà không có node ngắt trang rõ ràng có nguy cơ phá vỡ bộ gõ tiếng Việt (IME), con trỏ bàn phím và selection của ProseMirror. Do đó, hệ thống ưu tiên ngắt trang explicit chính xác và tự động mở rộng trang vật lý theo chiều cao nội dung tổng thể.
  2. **Section Breaks**: Hỗ trợ đầy đủ Section Breaks (`nextPage`, `continuous`) với các thiết lập khổ giấy, hướng xoay và lề riêng biệt cho từng phần theo chuẩn Page Engine 2.0.
  3. **Header / Footer động**: Tích hợp các trường động (`PAGE`, `NUMPAGES`) và phân tách header/footer theo từng Section.
  4. **Xuất / Nhập tệp**: Hỗ trợ định dạng native `.mwd` và DOCX OOXML 2.0 hai chiều với độ trung thực ngữ nghĩa cao (Semantic Fidelity).

---

## DOCX Fidelity 2.0 — Kiến trúc & Ma trận Tương thích OOXML

Hệ thống **DOCX Fidelity 2.0** cung cấp khả năng chuyển đổi hai chiều (Round-trip) giữa mô hình ngữ nghĩa nội bộ (ProseMirror AST / DocumentModel) và định dạng chuẩn Microsoft Word Open Packaging Conventions (WordprocessingML / DrawingML / OMML).

### 1. Kiến trúc Tổng thể (Architecture Overview)
- **DocumentMapper & DocumentExporter**: Điều phối quá trình chuyển đổi AST $\leftrightarrow$ WordprocessingML với chiến lược giữ nguyên kiểu ngữ nghĩa (Semantic Type Invariance).
- **StyleService & StyleSerializer**: Quản lý phả hệ styles (`basedOn`), kế thừa đa cấp, thuộc tính đoạn văn và ký tự, khử vòng lặp phân giải.
- **FieldEngine & FieldSerializer**: Nhận diện và tuần hoàn các trường động Word (`PAGE`, `NUMPAGES`, `DATE`, `TITLE`, `AUTHOR`, `REF`, `PAGEREF`), phân tách lệnh trường ngữ nghĩa (`w:instrText`) và giá trị bộ nhớ đệm (`w:t`).
- **OmmlEngine**: Chuyển đổi hai chiều giữa công thức nội bộ và Office Math Markup Language (`<m:oMath>`, `<m:f>`, `<m:nary>`, `<m:sSup>`, `<m:sSub>`, `<m:rad>`, `<m:m>`).
- **DrawingPositionService & Serializer**: Quản lý hình học neo nổi (`wp:anchor`), căn lề tương đối (`relativeHeight`, `page`, `margin`, `column`), và các chế độ bao quanh văn bản (`wrapSquare`, `wrapTight`, `wrapTopAndBottom`, `wrapThrough`, `wrapNone`).
- **TextBox & Shape Subsystems**: Nhập/xuất các khung văn bản nổi chứa văn bản phong phú (`w:txbx`) và các hình dạng cốt lõi (`w:drawing` $\to$ `wps:wsp` / `a:prstGeom`).
- **TablePersistenceService**: Xử lý gộp ô dọc (`w:vMerge`), gộp ngang (`w:gridSpan`), phân bổ kích thước cột, chiều cao hàng và lặp lại hàng tiêu đề (`w:tblHeader`).
- **UnsupportedPreservationService**: Bảo tồn an toàn các phần mở rộng OOXML không chỉnh sửa (Charts, SmartArt, WordArt, OLE, VBA), ngăn chặn làm hỏng gói zip hoặc rơi rụng nội dung chính.
- **PackageValidator**: Kiểm tra tính toàn vẹn gói OPC (ZIP hợp lệ, XML parseable, Relationship ID duy nhất, Content Types hợp chuẩn, docPr ID và Bookmark ID không trùng lặp).

### 2. Ma trận Tính năng & Chính sách Xử lý (Fidelity Matrix)

| Phân hệ / Tính năng | Trạng thái (Supported / Partial / Unsupported) | Phạm vi Hỗ trợ & Hành vi Chi tiết | Chính sách Dự phòng (Fallback Policy) |
| :--- | :--- | :--- | :--- |
| **OMML (Office Math)** | **Supported** (Subset cốt lõi) | Hỗ trợ phân số (`m:f`), tích phân/tổng (`m:nary`), số mũ (`m:sSup`), chỉ số dưới (`m:sSub`), căn số (`m:rad`), ma trận (`m:m`), công thức nội dòng & khối (`m:oMathPara`). Chuyển đổi tương đương 100% sang editable Equation node. | Công thức OMML phức tạp ngoài subset được trích xuất biểu diễn văn bản/ký hiệu toán học an toàn, không làm hỏng văn bản xung quanh. |
| **Floating Images & DrawingML** | **Supported** | Hỗ trợ ảnh nổi với thẻ neo `<wp:anchor>`, vị trí tuyệt đối (H/V offsets bằng EMUs) và tương đối (`relativeFrom`: `page`, `margin`, `column`), căn lề (`left`, `center`, `right`). Chuyển đổi hai chiều bảo toàn tọa độ và kích thước. | Nếu thiếu thông số neo hoặc tọa độ lỗi, chuyển thành ảnh nội dòng (`<wp:inline>`) an toàn. |
| **Text Wrapping Modes** | **Supported** | Hỗ trợ các chế độ bao quanh: `Square` (`wp:wrapSquare`), `Tight` (`wp:wrapTight`), `Top and Bottom` (`wp:wrapTopAndBottom`), `Through` (`wp:wrapThrough`), `In Front of Text` (`behindDoc="0"`), `Behind Text` (`behindDoc="1"`). Văn bản được cách ly chính xác, không tràn hai bên trong chế độ Top & Bottom. | Fallback về `Square` hoặc `Top & Bottom` đối với chế độ bao quanh đa giác phức tạp. |
| **Floating Text Boxes** | **Supported** | Nhận diện và tuần hoàn `<w:drawing>` chứa `<wps:wsp>` / `<w:txbx>`. Nội dung rich text bên trong (nhiều đoạn văn, in đậm, nghiêng, màu sắc) được duy trì nguyên vẹn thành editable `textBox` node, không bị làm phẳng (no flattening). | Hộp văn bản VML cũ (`v:textbox`) được chuyển thành khung đoạn văn bản định dạng phong phú tương ứng. |
| **DrawingML Core Shapes** | **Supported** (Subset 5 hình) | Hỗ trợ 5 hình cơ bản: Hình chữ nhật (`rect`), Hình chữ nhật bo góc (`roundRect`), Hình elip/tròn (`ellipse`), Đường thẳng (`line`), Mũi tên (`arrow`). Bảo toàn kích thước, màu nền (`fill`), viền (`stroke`), độ dày viền (`strokeWidth`), và vị trí neo nổi. | Các hình dạng hình học phức tạp khác (3D, callout) được ghi nhận cảnh báo chẩn đoán và chuyển thành shape placeholder giữ kích thước. |
| **Table Vertical Merge (vMerge)** | **Supported** | Hỗ trợ gộp ô dọc qua nhiều hàng (`w:vMerge restart` / `w:vMerge continue`) thành `rowspan`. Hỗ trợ gộp ô chữ nhật $2 \times 2$ kết hợp `rowspan` & `colspan`. Khi xuất, tự động tạo continuation cells hợp lệ cho Microsoft Word. | Các ô gộp khuyết thiếu hoặc lỗi topology được tự động sửa chữa lưới ô bởi `TablePersistenceService`. |
| **Custom Styles & Inheritance** | **Supported** | Hỗ trợ kiểu đoạn văn và ký tự tùy biến, kế thừa `basedOn`, phông chữ, cỡ chữ, căn lề, khoảng cách dòng, thụt đầu dòng (ví dụ Thesis Body dựa trên Normal). Bảo toàn phân cấp kiểu dáng và định dạng trực tiếp (direct overrides). | Kiểu thiếu style cha fallback an toàn về `Normal` mặc định; phát hiện và bẻ gãy vòng lặp kế thừa tuần hoàn. |
| **Dynamic Fields Engine** | **Supported** | Hỗ trợ các trường trong Header/Footer: `PAGE`, `NUMPAGES`; trong Thân văn bản: `DATE`, `TITLE`, `AUTHOR`, `REF`, `PAGEREF`. Lưu trữ lệnh ngữ nghĩa chuẩn (`w:instrText`) song song với giá trị kết xuất hiện thời (`w:t`). | Các trường phức tạp ngoài danh mục (`MERGEFIELD`, `DATABASE`, v.v.) bảo tồn lệnh gốc dạng văn bản kèm giá trị bộ đệm gần nhất. |
| **Unsupported OOXML (Charts, SmartArt, WordArt)** | **Partially Supported** (Pass-through / Safe extraction) | **Không có trình chỉnh sửa**. Áp dụng chính sách bảo tồn an toàn: Phần dữ liệu package và relationship được giữ nguyên dạng pass-through. WordArt trích xuất văn bản hiển thị an toàn kèm chẩn đoán. | Không làm hỏng gói ZIP OPC, không mất đoạn văn chính, không sinh cấu trúc XML dị dạng. |
| **OLE Objects, ActiveX, Macros & VBA** | **Unsupported** | **Hoàn toàn ngoài phạm vi**. Không thực thi mã macro, không nhúng container OLE tương tác. | Bỏ qua an toàn hoặc bảo lưu luồng nhị phân nguyên trạng; xuất log chẩn đoán cảnh báo người dùng. |

### 3. Ranh giới Rõ ràng Ngoài Phạm vi (Explicit Out-of-Scope)
Hệ thống DOCX Fidelity 2.0 tập trung tuyệt đối vào tính toàn vẹn dữ liệu, ngữ nghĩa văn bản học thuật và cấu trúc tài liệu. Các tính năng sau **không** nằm trong phạm vi dự án:
1. Trình chỉnh sửa biểu đồ tương tác đầy đủ (Interactive Chart Editor).
2. Trình chỉnh sửa sơ đồ thông minh (SmartArt Editor).
3. Trình biên tập nghệ thuật chữ cổ điển (WordArt Styler / Transform Editor).
4. Thực thi macro hoặc kịch bản Visual Basic for Applications (VBA Execution Engine).
5. Trình nhúng và kích hoạt đối tượng OLE / ActiveX.
6. Hệ thống chủ đề Microsoft Office Theme XML toàn diện đa bảng màu.
7. Toàn bộ danh mục 180+ hình dạng DrawingML (chỉ hỗ trợ 5 hình cơ bản).
8. Clone giao diện Word điểm ảnh chính xác (Pixel-perfect Word clone) hoặc DTP (Desktop Publishing) chuyên nghiệp.

---

## Hướng dẫn chạy và kiểm thử

Mở terminal trong thư mục `PersonalWordEditor/`:

### 1. Khởi chạy môi trường phát triển (Development)
```powershell
npm install
npm run tauri dev
```

### 2. Chạy bộ kiểm thử tự động (Test Suite)
```powershell
npm test
```
*Chạy toàn bộ **1250 bài test tự động** (100% PASS) bao gồm kiểm thử Document Model, File Round-trip, Error Resilience, Editor Core, Extensions, Formatting, Paragraph, Lists, Search & Replace, Zoom, Content Stats, Close Protection, End-to-End Workflow, Page Engine 2.0 (True Page Flow, Rules, Tables, Sections, Reflow), Insert Engine (Table, Image, Equation, Shape, TextBox, Hyperlink, Symbol), DOCX Import/Export/Interoperability, Review Engine (Spell, Grammar, Comments, Track Changes 2.0: Character/Paragraph/Style Formatting Revisions, Unified Review Sidebar, Undo/Redo Consistency, .mwd Persistence, và DOCX OOXML w:rPrChange / w:pPrChange Round-Trip), Unified Commands, Styles Engine 2.0, Version History & Autosave, Focus Mode, References Engine, Table Engine 2.0, Floating Object Text Wrapping, và DOCX Fidelity 2.0.*

### 3. Kiểm tra kiểm tra kiểu dữ liệu & Build Frontend
```powershell
npm run build
```

---

## Cấu trúc thư mục mã nguồn

```text
PersonalWordEditor/
├─ src/
│  ├─ app/                 # App.tsx: app shell + phím tắt + close protection
│  ├─ page/                # [PHASE 2.1–2.7] Kiến trúc Page Engine & Section Model
│  │  ├─ types/            # pageTypes.ts, paginationTypes.ts, sectionTypes.ts
│  │  ├─ services/         # pageConstants.ts, pageSettingsService.ts, paginationService.ts, sectionService.ts
│  │  ├─ hooks/            # usePageSettings.ts, usePagination.ts
│  │  ├─ components/       # PageRenderer.tsx, PageContainer.tsx (đa khổ giấy, mixed sections)
│  │  ├─ extensions/       # pageBreakExtension.ts, sectionBreakExtension.ts
│  │  ├─ pageSettings.test.ts # Unit test mô hình Page Settings
│  │  ├─ pageRendering.test.ts # Unit test render khổ giấy & hướng trang
│  │  ├─ layoutRibbonSequences.test.ts # Unit test chuỗi thao tác Layout Ribbon
│  │  ├─ customMargins.test.ts # Unit test kiểm tra lề tùy chỉnh & validation
│  │  ├─ pageBreak.test.ts # Unit test semantic page break node
│  │  ├─ pagination.test.ts # Unit test phân trang vật lý đa trang
│  │  ├─ section.test.ts   # [PHASE 2.7] Unit test mô hình Section & Section Break
│  │  └─ index.ts          # Entry point xuất khẩu Page Engine

│  ├─ components/
│  │  ├─ page/             # PageRenderer, PageContainer re-export wrappers
│  │  ├─ dialogs/          # CustomMarginsDialog.tsx, FindReplaceDialog.tsx, ConfirmSaveDialog.tsx
│  │  ├─ ribbon/           # Thanh công cụ Ribbon (HomeRibbon, LayoutRibbon, FileMenuShell)
│  │  └─ layout/           # AppHeader, Workspace, StatusBar
│  ├─ editor/              # Lõi soạn thảo Tiptap & abstraction
│  │  ├─ Editor.tsx        # Trang soạn thảo tích hợp PageRenderer
│  │  ├─ paragraphExtensions.ts
│  │  ├─ searchExtensions.ts
│  │  ├─ editorExtensions.ts
│  │  ├─ editorCommands.ts
│  │  ├─ phase1EndToEndWorkflow.test.ts
│  │  └─ ...test.ts
│  ├─ document/            # Mô hình dữ liệu tài liệu & định dạng tệp .mwd
│  │  ├─ documentTypes.ts  # DocumentMetadata, DocumentModel (kèm PageSettings)
│  │  ├─ documentModel.ts  # Khởi tạo, validation, thống kê từ/ký tự
│  │  └─ documentFile.ts   # Serialization/deserialization .mwd versioned có PageSettings
│  ├─ stores/              # Zustand stores (document, editor, findReplace, confirmDialog, zoom)
│  ├─ file/                # Quản lý tương tác tệp native Tauri & Action Protection
│  ├─ styles/
│  │  └─ global.css        # Giao diện shell, trang A4 zoom, slider và status bar
│  └─ main.tsx
├─ src-tauri/
├─ package.json
├─ vite.config.ts
├─ tsconfig.json
├─ README.md
└─ CHANGELOG.md
```
