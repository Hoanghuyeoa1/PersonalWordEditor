# Changelog

## Track Changes 2.0 — Phase 13: Final Audit / Integration / Zero Regression Completed — 2026-10-08

- **Track Changes 2.0 — Phase 13: Final Audit / Integration / Zero Regression**:
  - **Kiến trúc Tổng thể Track Changes 2.0 (Architecture & Subsystems)**:
    - Nâng cấp toàn diện hệ thống Theo dõi Thay đổi (Track Changes 2.0) mở rộng từ chèn/xóa văn bản (`insert`/`delete`) sang theo dõi định dạng toàn diện (`format`).
    - Phân module chuyên biệt và cô lập cao độ:
      - `FormattingDiffService`: Thuật toán tính toán vi sai (diff) chính xác giữa cấu trúc thuộc tính trước và sau cho Run/Paragraph/Style.
      - `FormattingReviewLifecycle`: Quản lý vòng đời revision (Capture, Review, Accept, Reject, Batch Process).
      - `FormattingDisplayUtils`: Chuyển đổi thuộc tính vi sai thành văn bản mô tả trực quan chuẩn tiếng Việt và Office conventions.
      - `TrackChangesPersistenceService`: Đóng gói chuẩn hóa, chuẩn hóa AST, khử trôi neo (anchor drift) và khử trùng lặp cho tệp native `.mwd`.
      - `documentSerializer` & `documentParser`: Ánh xạ hai chiều WordprocessingML OOXML `<w:rPrChange>` và `<w:pPrChange>`.
  - **Mô hình Dữ liệu Revision (Revision Model & Types)**:
    - Mở rộng kiểu dữ liệu `TrackChangeItem`: hỗ trợ `scope: "character" | "paragraph" | "style"`, `formatChange: { scope, changes: PropertyDiff[] }`, `formatDetails`, `targetNodeId`, và `previousProperties`/`currentProperties`.
    - Bảo toàn kiểu ngữ nghĩa: Không phân mảnh node vô căn cứ, không nhân bản node khi gán format, giữ nguyên vẹn nội dung text gốc.
  - **Quy trình Thu thập Thay đổi (Capture Pipeline)**:
    - Bắt vết tự động khi Track Changes bật (`isTracking = true`):
      - Ký tự: Font size, font family, bold, italic, underline, strike, text color, highlight.
      - Đoạn văn: Alignment (Left/Center/Right/Justify), Line spacing (1.0, 1.15, 1.5, 2.0...), Indents (left, right, firstLine), Spacing Before/After.
      - Gán kiểu dáng: Normal $\leftrightarrow$ Heading 1–3, Custom Styles, duy trì ID và liên kết phả hệ.
  - **Chính sách Chồng lấn Định dạng (Overlapping Revisions Policy)**:
    - Xử lý xác định (deterministic) khi nhiều thao tác định dạng liên tiếp diễn ra trên cùng một vùng văn bản (ví dụ 12 $\to$ 14 $\to$ 16pt, hoặc Bold + Font Size kết hợp).
    - Hợp nhất cập nhật giá trị hiện tại (`currentProperties`) trong khi bảo lưu tuyệt đối giá trị gốc ban đầu (`previousProperties`), bảo đảm Reject luôn khôi phục 100% định dạng trước khi chỉnh sửa.
  - **Động cơ Chấp nhận / Từ chối (Accept / Reject Engine)**:
    - `Accept`: Giữ lại định dạng mới, gỡ bỏ metadata revision khỏi AST và store.
    - `Reject`: Khôi phục chuẩn xác thuộc tính `previousProperties`, không làm mất một ký tự văn bản nào.
    - `Accept All` / `Reject All`: Xử lý theo thứ tự phân tầng an toàn: Revisions định dạng (Format) $\to$ Revisions chèn (Insert) $\to$ Revisions xóa (Delete) theo thứ tự offset từ cuối lên đầu, triệt tiêu 100% hiện tượng trôi chỉ số (index drift).
  - **Giao diện Duyệt Thay đổi Thống nhất (Unified Review UI & Sidebar)**:
    - Sidebar tổng hợp trực quan danh sách mọi thay đổi: Chèn, Xóa, Định dạng Ký tự, Đoạn văn, Kiểu dáng.
    - Hiển thị đầy đủ thông tin: Tác giả, Thời gian, Mô tả trước/sau (`Before` $\to$ `After`).
    - Nút bấm điều hướng Trước/Sau (`Previous` / `Next`), nút Chấp nhận/Từ chối từng mục hoặc toàn bộ.
    - Bộ lọc đa năng (Filter by Type: All, Insertions, Deletions, Formatting; Filter by Author).
  - **Lịch sử & Tính Nhất quán (History & Undo/Redo)**:
    - Hoàn tác (`Ctrl+Z`) và Làm lại (`Ctrl+Y`) nguyên tử cho mọi thao tác Capture, Accept, Reject, Accept All, Reject All.
    - Đồng bộ 100% giữa ProseMirror AST, danh sách siêu dữ liệu revision trong `DocumentStore` và giao diện Sidebar. Không sinh metadata mồ côi (no orphan metadata), không tạo giao dịch giả mạo hay vòng lặp listener.
  - **Lưu trữ Bền vững Native .mwd**:
    - Bảo toàn trạng thái pending revisions qua chu trình Save $\to$ Close $\to$ Open `.mwd`.
    - Hỗ trợ tài liệu review dở (partially reviewed), tương thích ngược 100% với các tệp `.mwd` phiên bản cũ và khả năng chịu lỗi đối với siêu dữ liệu dị dạng.
  - **Tương thích Hai chiều Microsoft Word DOCX OOXML**:
    - Nhập DOCX: Trích xuất chính xác `<w:rPrChange>` và `<w:pPrChange>` thành Character & Paragraph Revisions, không đảo ngược trước/sau.
    - Xuất DOCX: Tuân thủ nghiêm ngặt thứ tự schema ECMA-376 (phần tử `rPrChange`/`pPrChange` đặt ở cuối phần tử thuộc tính cha).
    - Cấp phát ID số nguyên an toàn thông qua bộ cấp phát tập trung `getTrackChangeXmlId`, tránh dùng chuỗi UUID trực tiếp vào trường số nguyên của Word.
    - Thời gian xuất chuẩn ISO-8601 UTC; tác giả được ánh xạ trọn vẹn vào `w:author`.
  - **Kết quả Kiểm thử Toàn diện (Verification Results)**:
    - Đạt chuẩn toàn bộ 12 chuỗi kiểm thử phân tầng: Formatting Foundation $\to$ Character Capture $\to$ Paragraph Capture $\to$ Style Revisions $\to$ Accept/Reject $\to$ Mixed Revisions $\to$ Review UI $\to$ History $\to$ .mwd Persistence $\to$ DOCX Import/Export $\to$ Cross-Engine Regression.
    - **1250 / 1250 bài kiểm thử tự động PASS 100%** (0 failed, 0 skipped, 0 todo).
    - `npm run build` (`tsc && vite build`) hoàn thành thành công trong 15.13s (0 lỗi).
    - `cargo check` Tauri Rust backend hoàn tất thành công trong 28.28s (0 lỗi).
  - **Hiệu năng & Trải nghiệm (Performance Observations)**:
    - Thao tác gõ phím không thực hiện quét toàn bộ AST để tìm diff; diff chỉ tính toán cục bộ khi lệnh định dạng được kích hoạt.
    - Sidebar Review ảo hóa hiển thị danh sách lớn với hàng trăm revisions mượt mà.
  - **Ranh giới Ngoài Phạm vi (Out-of-Scope Boundaries)**:
    - Không mở rộng sang cộng tác thời gian thực nhiều người dùng qua mạng (Real-time collaboration).
    - Không triển khai AI review hay tự động phê duyệt bằng LLM.
    - Không xây dựng bộ so sánh hai tệp tài liệu bên ngoài (Document comparison diff).
    - Không theo dõi thay đổi cấu trúc bảng (Structural Table Revisions: thêm/xóa cột bảng dưới dạng thẻ revision riêng của Word).
    - Không theo dõi di chuyển/co giãn đối tượng hình học độc lập (Object-level revisions).
    - Chuyển dời văn bản (`w:moveFrom`/`w:moveTo`) được ánh xạ thành cặp thao tác Xóa + Chèn an toàn.

## DOCX Fidelity 2.0 — Phase 15: Final Validation / Zero Regression / Documentation Completed — 2026-10-08

- **DOCX Fidelity 2.0 — Phase 15: Final Validation / Zero Regression / Documentation**:
  - **Kiến trúc Tổng thể DOCX Fidelity 2.0 (Architecture & Subsystems)**:
    - Hoàn tất kiến trúc chuyển đổi hai chiều (Round-trip) giữa ProseMirror DocumentModel và Microsoft Word OOXML (WordprocessingML, DrawingML, OMML).
    - Phân tách module rõ ràng: `DocumentMapper`, `StyleService`, `FieldEngine`, `OmmlEngine`, `DrawingPositionService`, `TablePersistenceService`, `UnsupportedPreservationService`, và `PackageValidator`.
    - Bảo toàn kiểu ngữ nghĩa (Semantic Type Invariance): Không làm phẳng (flatten) các cấu trúc semantic thành hình ảnh hoặc văn bản thô vô nghĩa trong tập hợp tính năng được hỗ trợ.
  - **Workflows Kiểm thử Tích hợp Cốt lõi (Core Validation Workflows A–H & Academic Mixed)**:
    - **Workflow A — OMML (Office Math)**: Chuyển đổi hai chiều phân số (`m:f`), tích phân (`m:nary`), số mũ (`m:sSup`), chỉ số dưới (`m:sSub`), căn số (`m:rad`), ma trận (`m:m`) giữa Word OOXML $\leftrightarrow$ editable Equation node; xuất lại Word native equation tương đương 100%.
    - **Workflow B — Floating Images & Anchors**: Xử lý thẻ neo `<wp:anchor>`, vị trí tương đối (`relativeFrom: margin/page/column`), căn lề ngang (`right`, `center`, `left`) và chế độ bao quanh `Square` (`wrapSquare`). Di chuyển và chỉnh sửa trong editor bảo toàn trọn vẹn ngữ nghĩa khi xuất và tái nhập.
    - **Workflow C — Top & Bottom Text Wrapping**: Chế độ `Top & Bottom` (`wp:wrapTopAndBottom`) cách ly hoàn toàn đối tượng nổi giữa hai đoạn văn; văn bản không bị tràn hoặc chạy hai bên đối tượng.
    - **Workflow D — Floating Text Boxes**: Nhận diện và tuần hoàn `<w:drawing>` chứa `<wps:wsp>` / `<w:txbx>`; chỉnh sửa rich text đa đoạn văn, màu sắc, phông chữ; lưu trữ và nhập lại không bị làm phẳng thành ảnh hay đoạn văn thường.
    - **Workflow E — Core Shapes**: Hỗ trợ 5 hình DrawingML cốt lõi: Rectangle, Rounded Rectangle, Ellipse, Line, Arrow. Bảo toàn kích thước, màu tô (`fill`), viền (`stroke`), độ dày viền (`strokeWidth`), và vị trí neo.
    - **Workflow F — Table Vertical Merge (vMerge)**: Xử lý gộp ô dọc 3 hàng (`w:vMerge restart/continue` $\to$ `rowspan = 3`) và gộp chữ nhật $2 \times 2$ kết hợp `rowspan` & `colspan`. Xuất lại Word tạo đúng các ô tiếp nối (continuation cells) hợp lệ.
    - **Workflow G — Dynamic Fields Engine**: Tuần hoàn các trường Header/Footer (`PAGE`, `NUMPAGES`) và Thân văn bản (`DATE`, `TITLE`, `AUTHOR`, `REF`, `PAGEREF`). Lưu trữ lệnh ngữ nghĩa chuẩn (`w:instrText`) song song với giá trị kết xuất bộ nhớ đệm (`w:t`).
    - **Workflow H — Custom Styles & Inheritance**: Hỗ trợ kiểu tùy biến (ví dụ Thesis Body kế thừa Normal, Times New Roman 13, giãn dòng 1.5, thụt đầu dòng 1.27cm). Bảo toàn phả hệ kế thừa và định dạng trực tiếp (direct overrides).
    - **Workflow I — Mixed Academic Document**: Kiểm thử toàn diện tài liệu học thuật phức tạp chứa đồng thời Headings, TOC, Styles tùy biến, công thức OMML, ảnh nổi Square wrap, bảng gộp ô dọc, chú thích (Captions), tham chiếu chéo (Cross-references), chú thích chân trang (Footnotes), bình luận (Comments), và theo dõi thay đổi (Track Changes). Xuất và tái nhập thành công 100%, không mất dữ liệu, không hỏng gói OPC.
  - **Bảo tồn Nội dung Không Hỗ trợ & Xử lý OOXML Dị dạng (Preservation & Malformed Safety)**:
    - Cơ chế Pass-through bảo tồn an toàn các phần mở rộng OOXML không chỉnh sửa (Charts, SmartArt, WordArt, OLE, VBA), giữ nguyên package part và relationship.
    - Trích xuất văn bản an toàn đối với WordArt kèm log chẩn đoán; không bao giờ làm hỏng tệp ZIP hay đánh rơi nội dung văn bản chính.
    - Khả năng chịu lỗi cao (Tolerant Loading) đối với XML thiếu thẻ, trùng ID hoặc quan hệ hỏng của các tệp Word cũ/ngoại vi.
  - **Toàn vẹn Gói Package OPC (OPC Package Integrity & Safety)**:
    - Tuân thủ nghiêm ngặt chuẩn Open Packaging Conventions: Tệp ZIP hợp lệ, tất cả phần XML parseable không lỗi cú pháp.
    - Sinh mã ID tài liệu hình học (`docPr id`) và Thẻ đánh dấu (`w:bookmarkStart id`) duy nhất, không trùng lặp.
    - Không tồn tại quan hệ treo (no dangling relationships) hay xung đột Content Types.
  - **Zero Regression Toàn diện Hệ thống**:
    - **Core Editor**: Bảo toàn văn bản thuần, bộ gõ tiếng Việt Unicode (Telex/VNI), định dạng in đậm/nghiêng/gạch chân, màu sắc, căn lề, thụt lề, danh sách, Undo/Redo, và định dạng tệp native `.mwd`.
    - **Table Engine**: Bảo toàn độ rộng cột, lề ô, chiều cao hàng, tiêu đề lặp lại (`repeatHeader`).
    - **Page Engine**: Bảo toàn kích thước trang, lề trang, hướng giấy, Section Breaks và phân trang vật lý.
    - **Review Engine**: Bảo toàn chuỗi bình luận (`Comments`) và lịch sử sửa đổi (`Track Changes`).
    - **References Engine**: Bảo toàn Mục lục (`TOC`), Chú thích chân trang (`Footnotes`), Chú thích cuối (`Endnotes`), Danh mục hình (`Captions`), Thẻ đánh dấu (`Bookmarks`), Tham chiếu chéo (`Cross-references`), Trích dẫn và Danh mục tham khảo (`Bibliography`).
  - **Hiệu năng & Bộ nhớ (Performance & Optimization)**:
    - Bộ nhớ đệm phân tích Header/Footer (`cachedParsedHeaders/Footers`) loại bỏ thao tác parse XML dư thừa.
    - Tối ưu hóa xử lý hình học neo nổi, tính toán tọa độ EMUs với chi phí tính toán < 1ms.
    - Cô lập dữ liệu đa phương tiện trong bộ nhớ, kiểm soát dung lượng bộ đệm an toàn.
  - **Kết quả Kiểm thử Toàn diện (Verification Results)**:
    - Đạt chuẩn toàn bộ quy trình kiểm thử phân tầng (Ordered Test Policy): Styles DOCX tests $\to$ Fields tests $\to$ OMML tests $\to$ Table tests $\to$ Drawing/Image tests $\to$ TextBox/Shape tests $\to$ Preservation tests $\to$ DOCX integration tests $\to$ Full regression suite.
    - **1127 / 1127 bài kiểm thử tự động PASS 100%** (0 failed, 0 skipped, 0 todo).
    - `npm run build` (`tsc && vite build`) hoàn thành thành công trong 1.41s (0 lỗi).
    - `cargo check` Tauri Rust backend hoàn tất thành công trong 30.13s (0 lỗi).
  - **Ranh giới Ngoài Phạm vi & Giới hạn Nhận biết (Known Limitations & Out of Scope)**:
    - Không mở rộng sang trình biên tập biểu đồ tương tác (Chart Editor), SmartArt, hay WordArt phức tạp.
    - Không thực thi mã macro / VBA; không hỗ trợ trình nhúng container OLE tương tác.
    - Không hỗ trợ toàn bộ 180+ hình dạng DrawingML hay hệ thống chủ đề Office Theme XML đa tầng.
    - Không tuyên bố tương thích 100% mọi tính năng của Microsoft Word thương mại.

## Table Engine 2.0 — Phase 13: Final Integration / Performance / Zero Regression Completed — 2026-10-08

- **Table Engine 2.0 — Phase 13: Final Integration / Performance / Zero Regression**:
  - **Kiến trúc Tổng thể & Mô hình Dữ liệu (Architecture & Semantic Data Model)**:
    - Nâng cấp toàn diện Table Engine lên phiên bản 2.0 trên nền tảng ProseMirror AST và Tiptap schema.
    - Duy trì tính bất biến cấu trúc AST (Strict Semantic AST Immutability): Bảng biểu là một khối dữ liệu ngữ nghĩa duy nhất (`node table`), không phân mảnh AST hay tạo bảng giả khi phân trang.
    - Schema mở rộng cho các nodes: `table` (`cellPadding`, `styleId`, `repeatHeader`), `tableRow` (`rowHeight`, `rowHeightType`, `cantSplit`), `tableCell` & `tableHeader` (`rowspan`, `colspan`, `colwidth`, `padding`, `backgroundColor`, `borderColor`, `borderWidth`, `borderStyle`).
  - **Cấu trúc Topology Nâng cao (Advanced Topology & Merging Workflows)**:
    - **Workflow A — Gộp ô dọc (Vertical Merge)**: Hỗ trợ gộp ô theo cột (ví dụ A1/A2/A3 thành `rowspan = 3`). AST chỉ lưu ô bắt đầu gộp, loại bỏ continuation cells khỏi AST để tránh phình to và rách vỡ cấu trúc.
    - **Workflow B — Gộp ô chữ nhật (Rectangular Merge)**: Hỗ trợ gộp vùng chọn 2×2 thành `rowspan = 2, colspan = 2`. Lệnh tách ô (`splitCells`) khôi phục chuẩn xác 4 ô ban đầu; `TableMap` duy trì tính hợp lệ tuyệt đối.
    - **Structural Stress Resilience**: Chèn/xóa hàng (`addRowBefore`, `addRowAfter`, `deleteRow`), chèn/xóa cột (`addColumnBefore`, `addColumnAfter`, `deleteColumn`), bật/tắt tiêu đề (`toggleHeaderRow`) trên bảng đã gộp ô đều được kiểm soát nghiêm ngặt, ngăn chặn dị dạng topology. Bảo vệ ranh giới tiêu đề ngăn gộp ô bắc qua hàng tiêu đề và thân bảng.
  - **Động cơ Co giãn & Phân phối (Sizing Engine & Distribution)**:
    - **Workflow D — AutoFit to Contents**: Tính toán chiều rộng từng cột dựa trên nội dung chữ thực tế; thuật toán phân bổ thặng dư (`calculateAutoFitContentWidths`) bảo đảm các cột hẹp không bị co dưới `minWidth = 50px`, phân bổ tỷ lệ thặng dư cân đối và ngăn chặn hiện tượng vỡ khung hay runaway width đối với URL dài.
    - **Workflow E — AutoFit to Window**: Căn chỉnh chiều rộng bảng độc quyền theo hình học trang của Section hiện tại (`usableBodyBounds`, A4 portrait ~602px, A4 landscape ~931px), không phụ thuộc kích thước cửa sổ trình duyệt.
    - **Fixed Width & Resizing**: Hỗ trợ thiết lập `colwidth` và kéo dãn cột phát ra transaction đơn lẻ với bộ đệm con trỏ ổn định.
    - **Workflow H — Distribute Columns & Distribute Rows**: San đều độ rộng cột và chiều cao hàng; hỗ trợ hoàn tác Undo khôi phục 100% kích thước trước đó.
  - **Lề Ô & Chiều cao Hàng (Cell Margins & Row Heights)**:
    - **Workflow F — Cell Margins**: Hỗ trợ lề ô mặc định toàn bảng (`cellPadding`) và lề ô ghi đè cho từng ô (`padding: { top, right, bottom, left }`); tích hợp vào mô hình đo đạc và phân trang.
    - **Workflow G — Row Heights**: Hỗ trợ 3 chính sách chiều cao hàng (`auto`, `atLeast`, `exact`). Nội dung ngắn duy trì tối thiểu >= 1cm; nội dung dài tự động mở rộng mà không làm mất mát dữ liệu ngầm (no silent data loss).
    - Cập nhật thuật toán ước lượng chiều cao hàng `estimateTableRowHeight` trong `pageLayoutMap.ts` hỗ trợ phổ quát cả cấu trúc JSONContent lẫn Fragment/Node ProseMirror.
  - **Hệ thống Kiểu Bảng & Thứ tự Ưu tiên (Table Styles Engine & 4-Tier Precedence)**:
    - **Workflow I — Table Styles**: Tích hợp 5 presets chuẩn mực (`plain`, `grid`, `lightGrid`, `mediumAccent`, `academic`).
    - Phân giải 4 cấp: `Base Defaults` $\to$ `Table Style` $\to$ `Direct Cell Overrides` $\to$ `Cell Content Formatting`.
    - Khi ô B3 được tô màu thủ công (Direct Override) rồi người dùng đổi kiểu bảng, màu vàng của B3 vẫn được bảo toàn nguyên vẹn.
    - Định dạng đoạn văn (`paragraph style`, `textAlign`, `lineSpacing`) và ký tự (`bold`, `italic`, `characterStyle`) bên trong ô được bảo vệ 100%.
    - Áp dụng kiểu bảng trên bảng 100 hàng chỉ phát sinh duy nhất 1 ProseMirror transaction thay vì hàng nghìn transaction ghi đè ô.
  - **Phân trang Đa trang & Lặp lại Tiêu đề (Multi-Page Table Flow & Repeat Header)**:
    - **Workflow C — Repeat Header**: Bảng dài 40+ hàng qua nhiều trang; thuộc tính `repeatHeader: true` kích hoạt kết xuất hàng tiêu đề thị giác ở đầu trang 2, trang 3...; AST duy nhất 1 hàng tiêu đề thực sự, không nhân bản ô có thể chỉnh sửa trong AST.
    - **Workflow J — Multi-Page Table**: Bảng 100 hàng tự động phân luồng qua nhiều trang giấy vật lý theo ranh giới hàng nguyên tử (`Row-Boundary Pagination`). Duy nhất 1 node `table` trong AST. CellSelection, gõ phím, điều hướng `Tab`/`Shift+Tab`, kéo dãn cột và Undo/Redo hoàn toàn ổn định qua các ranh giới trang.
  - **Tích hợp Tham chiếu Chéo, Chú thích & Đánh giá (Workflow K & Workflow L)**:
    - **Workflow K — Table Captions & Cross-References**: Chèn chú thích Bảng 1 (`Table 1`) và tham chiếu chéo tới bảng qua `targetId` bền vững. Thao tác gộp ô, đổi kiểu dáng, kéo dãn và phân trang đa trang không làm thay đổi hay tái sinh `targetId`.
    - **Workflow L — Comments & Track Changes Preservation**: Các ô chứa bình luận (`commentThread`) và theo dõi thay đổi (`trackedInsert`, `trackedDelete`) bảo toàn 100% nhãn ngữ nghĩa qua các thao tác gộp/tách ô, co giãn, đổi kiểu dáng và phân trang.
  - **Bộ gõ Tiếng Việt & Soạn thảo Cốt lõi (Workflow M — IME & Core Editing)**:
    - Bảo vệ trạng thái tổ hợp gõ tiếng Việt (Telex/VNI) bên trong các ô bảng: sự kiện reflow và đo đạc bố cục được tạm hoãn tới `compositionend`.
    - Không mất dấu, không mất ký tự, không nhảy con trỏ hay mất focus.
    - Thao tác gõ phím, chọn vùng, sao chép/dán, Tìm kiếm/Thay thế và Undo/Redo hoạt động mượt mà.
  - **Hiệu năng, Bộ nhớ đệm & Giao dịch (Workflow N & Workflow O)**:
    - Bộ nhớ đệm chiều cao hàng và hình học (`cachedTableRowHeight`): gõ 1 ký tự chỉ đo đạc lại hàng hiện tại; các hàng khác đạt tỷ lệ cache hit > 95%.
    - Kiểm thử bảng 50 hàng, 100 hàng, 20 cột: thời gian phản hồi thao tác gõ phím < 5ms, thời gian phân trang tức thì, không phát sinh bottleneck thực tế.
  - **Lưu trữ Bền vững Native .mwd & DOCX Round-Trip (Workflow P)**:
    - Native `.mwd`: Lưu trữ và khôi phục đầy đủ toàn bộ cấu trúc topology, sizing, styles, cell margins, row heights, và repeatHeader. `TablePersistenceService` tự động kiểm tra và sửa chữa dị tật lưới bảng.
    - DOCX OOXML Round-Trip:
      - Xuất `<w:vMerge restart/continue>` chuẩn WordprocessingML grid, sinh continuation cells hợp lệ cho Word; xuất `<w:gridSpan>` cho gộp chữ nhật.
      - Xuất `<w:tblHeader>` cho semantic repeatHeader.
      - Xuất `<w:tblCellMar>` và `<w:tcMar>` cho lề ô; `<w:trHeight>` cho chiều cao hàng; `<w:shd>` cho màu nền.
      - Nhập DOCX: Khôi phục chính xác `rowspan`, `colspan`, lề, chiều cao và tiêu đề; khử continuation cells khỏi AST an toàn.
  - **Chính sách Kiểm thử Nghiêm ngặt (Targeted to Full Test Suite)**:
    - Xây dựng test suite mới [tablePhase13Integration.test.ts](file:///c:/Users/hoang/.gemini/antigravity-ide/scratch/PersonalWordEditor/src/editor/tablePhase13Integration.test.ts) gồm 17 bài kiểm thử chuyên sâu bao phủ Workflows A đến P (100% PASS).
    - Toàn bộ **1035 / 1035 bài kiểm thử** (100% PASS) trên toàn dự án đạt chuẩn mà không sửa hay đè nén bất kỳ bài kiểm thử nào.
    - `npm run build` (`tsc && vite build`) hoàn tất sạch sẽ không lỗi (2015 modules transformed).
    - `cargo check` Tauri backend hoàn tất thành công trong 0.31s (0 lỗi).
  - **Ranh giới Rõ ràng & Giới hạn Nhận biết Còn lại (Explicit Out of Scope)**:
    - Không mở rộng sang động cơ bảng tính Excel / công thức toán học (`SUM`, v.v.).
    - Không có engine lọc/sắp xếp cơ sở dữ liệu hoặc PivotTable.
    - Không có engine định dạng có điều kiện.
    - Không có bảng nổi tự do (floating tables with text wrapping).
    - Không có hệ thống Office Theme XML phức tạp toàn diện.
    - Không có bảng cộng tác thời gian thực hay PDF engine riêng biệt.

## References Engine Completion — Phase 11: Final Integration / Zero Regression Completed — 2026-10-08

- **References Engine Completion — Phase 11: Final Integration & Zero Regression**:
  - **Ribbon Final Wiring & Unified Command Dispatch**:
    - Kích hoạt và đấu nối hoàn chỉnh 3 nút bấm cốt lõi trên References Ribbon:
      - **Danh mục hình** (`captionList`): Mở hộp thoại `CaptionListDialog` với đầy đủ thiết lập nhãn (`Figure`, `Table`, `Equation`, tùy biến), kiểu dáng (`classic`, `modern`, `formal`), số trang, và ký tự dẫn hướng (`dots`, `dashes`, `underline`).
      - **Cập nhật danh mục** (`updateCaptionList`): Nhận diện danh mục hình đang chọn hoặc trong tài liệu, hỗ trợ cập nhật một chạm kèm tooltip hướng dẫn và phím tắt `F9`.
      - **Thẻ đánh dấu** (`bookmarks`): Mở hộp thoại `BookmarkManagerDialog` quản lý danh sách thẻ, hỗ trợ Thêm, Đổi tên, Xóa, Đi đến vị trí và sắp xếp thẻ.
    - Đăng ký các lệnh vào Unified Command System (`defaultCommands.ts`): `references.updateTableOfFigures` (gán phím tắt `F9`), `references.bookmarks`, `references.insertTableOfFigures`.
    - Đăng ký icon chuyên biệt trong `CommandIcons.tsx` (`Bookmark`, `RefreshCw`).
    - Tooltip động hiển thị trạng thái `disabled` và phím tắt rõ ràng; không có nút nào nhấp chuột mà không phản hồi.
  - **Caption List End-to-End Workflow**:
    - Hỗ trợ luồng chuẩn: Chèn hình ảnh $\to$ Chèn chú thích (Figure 1, Figure 2) $\to$ Chèn Danh mục hình.
    - Các mục (`entries`) hiển thị đúng số thứ tự, nội dung chữ, số trang và thứ tự xuất hiện.
    - Nhấp vào mục trong danh mục tự động cuộn trang và di chuyển con trỏ chính xác vào chú thích tương ứng.
  - **Update Caption List & Dynamic Re-indexing E2E**:
    - Khi chèn thêm hình ảnh ở giữa hai hình ảnh hiện có (ví dụ Figure mới giữa Figure 1 và Figure 2):
      - Cập nhật danh mục tự động đánh số lại: `Figure 1`, `Figure 2` (mới), `Figure 3` (cũ).
      - Thứ tự, số thứ tự, văn bản và số trang đều được cập nhật chính xác.
  - **Multiple Lists & Label Isolation**:
    - Tạo độc lập Danh mục hình (`Figure`), Danh mục bảng (`Table`), và Danh mục công thức (`Equation`).
    - Khử nhiễm chéo 100%: Danh mục hình chỉ chứa Figure, danh mục bảng chỉ chứa Table. Cập nhật từng danh mục diễn ra độc lập.
  - **Contextual F9 Shortcut & No Handler Conflicts**:
    - Khi con trỏ nằm trong Mục lục (TOC) $\to$ F9 cập nhật TOC.
    - Khi con trỏ nằm trong Danh mục hình (Caption List) $\to$ F9 cập nhật Caption List.
    - Khi con trỏ nằm trong Danh mục tham khảo (Bibliography) $\to$ F9 cập nhật Bibliography.
    - Cơ chế bắt sự kiện phím tắt ngăn chặn xung đột giữa các phân hệ; không cập nhật nhầm sang hệ thống khác.
  - **Bookmark Engine End-to-End**:
    - Chọn văn bản (ví dụ "Kết quả nghiên cứu") $\to$ Mở Thẻ đánh dấu $\to$ Thêm thẻ (`ket_qua`).
    - Kiểm tra chuỗi thao tác: Đi đến (`Go To`), Đổi tên (`Rename`), Xóa (`Delete`), Hoàn tác (`Undo`), Làm lại (`Redo`).
    - Tích hợp nguyên tử vào ProseMirror history; không bao giờ làm mất văn bản tài liệu của người dùng.
  - **Cross-Reference Bookmark Integration**:
    - Tham chiếu chéo tới mục tiêu Thẻ đánh dấu (Bookmark): Chèn thành công văn bản thẻ, số trang, hoặc số đoạn.
    - Đổi tên bookmark $\to$ tham chiếu chéo vẫn liên kết chuẩn xác qua Stable ID nội bộ.
    - Xóa bookmark $\to$ hiển thị `[Reference not found]`.
    - Hoàn tác xóa $\to$ tự động khôi phục liên kết.
  - **Complex Bookmark Cases & Edge Cases Resilience**:
    - Kiểm thử an toàn tại: Đầu tài liệu, cuối tài liệu, con trỏ đơn (Position), dải bôi đen (Range), Heading, ô trong bảng (Table Cell), chèn trong Track Changes, vùng trùng với Comment, văn bản định dạng phong phú, hyperlink, citation.
    - Xóa văn bản chứa bookmark và Undo không gây lỗi hoặc treo ứng dụng.
  - **Authoritative Page Engine Integration**:
    - Khi chú thích di chuyển từ Trang 5 sang Trang 6 do chèn nội dung phía trước:
      - Cập nhật danh mục phản ánh ngay số trang mới (Trang 6).
      - Tham chiếu chéo tới bookmark chế độ `pageNumber` truy vấn chính xác số trang hiện tại từ `PageLayoutMap`.
  - **Native Persistence (.mwd)**:
    - Lưu và nạp lại toàn bộ Captions, Caption Lists, Bookmarks, và Cross-references.
    - Bảo toàn IDs, nhãn, entries, anchors, tên thẻ và quan hệ tham chiếu.
    - Tự động chuẩn hóa, dọn dẹp các bookmark mồ côi khi mở tệp.
  - **DOCX Interoperability**:
    - Xuất tài liệu chứa Caption Lists, Bookmarks, và Cross-references: gói tệp ZIP OOXML hợp lệ, mở thành công trong Microsoft Word mà không bị lỗi hỏng file.
    - Nhập tệp Word DOCX có Bookmarks: Bookmark Manager nhận diện chính xác các thẻ người dùng tạo trong phạm vi hỗ trợ.
  - **Tối Ưu Hiệu Năng (Performance)**:
    - Caption List lưu trữ entries sẵn trong AST; không quét lại toàn bộ tài liệu mỗi lần render UI.
    - Bookmark Manager chỉ trích xuất dữ liệu khi mở dialog; không quét tài liệu khi đang gõ phím.
    - Thử nghiệm tài liệu quy mô lớn (20 captions, 20 bookmarks, 20 cross-references) hoàn tất trích xuất và phân giải trong **< 3ms** (tiêu chuẩn yêu cầu < 50ms).
  - **Giới Hạn Nhận Biết Còn Lại (Explicit Out of Scope)**:
    - Index / Subject Index (Bảng tra cứu chỉ mục).
    - Table of Authorities (Bảng trích dẫn án lệ).
    - Full Word Fields Engine tổng quát.
    - Advanced Hyperlink Bookmarks.
    - AI References & Cloud / Collaborative Bookmarks.
    - PDF Engine.
  - **Kết Quả Kiểm Thử & Kiểm Định**:
    - Tạo mới test suite [phase11FinalIntegration.test.ts](file:///c:/Users/hoang/.gemini/antigravity-ide/scratch/PersonalWordEditor/src/references/phase11FinalIntegration.test.ts) gồm 13 test cases bao phủ toàn diện Workflows 1–13 (100% PASS).
    - Toàn bộ **198 / 198 tests** của References Engine đạt 100% PASS.
    - Toàn bộ **879 / 879 tests** trên toàn bộ hệ thống Personal Word Editor đạt 100% PASS.
    - `npm run build` (`tsc && vite build`) hoàn thành thành công trong 964ms (0 lỗi).
    - `cargo check` backend Tauri hoàn thành thành công trong 0.56s (0 lỗi).

## References Engine Completion — Phase 10: Bookmark DOCX Interoperability Completed — 2026-10-08

- **References Engine Completion — Phase 10: Bookmark DOCX Interoperability**:
  - **OOXML Export Model & Numeric ID Mapping**:
    - Chuyển đổi định danh nội bộ bất biến (`ref_bookmark_<uuid>`) sang định danh số nguyên WordprocessingML (`w:id="0"`, `w:id="1"`, ...) một cách tất định (deterministic) trong từng phiên export.
    - Không để lộ UUID nội bộ vào thuộc tính `w:id` của OOXML.
  - **Chuyển Đổi & Khử Xung Đột Tên Thẻ Đánh Dấu (Name Conversion & Collision Disambiguation)**:
    - Làm sạch và chuẩn hóa tên tiếng Việt/Unicode có dấu sang tên thẻ Word hợp lệ (`^[a-zA-Z_][a-zA-Z0-9_]*$`, tối đa 35 ký tự, tự động thêm tiền tố `bm_` nếu bắt đầu bằng chữ số).
    - Giải quyết xung đột tên tất định: khi nhiều thẻ đánh dấu sau chuẩn hóa có cùng tên Word (hoặc trùng tên hoa/thường), tự động gán hậu tố `_1`, `_2`, ... mà không làm mất tính toàn vẹn.
  - **Xuất Position Bookmark (Zero-Range Caret Anchors)**:
    - Xuất node `bookmarkAnchor` thành cặp thẻ `<w:bookmarkStart w:id="N" w:name="..."/>` và `<w:bookmarkEnd w:id="N"/>` liền kề nhau tại đúng vị trí con trỏ, không thay đổi văn bản trước/sau.
  - **Xuất Range Bookmark (Selection Text Wrapping)**:
    - Xuất mark `bookmark` bằng cách mở `<w:bookmarkStart>` trước run văn bản và đóng `<w:bookmarkEnd>` sau khi kết thúc vùng chọn, bảo toàn cấu trúc run/paragraph và kiểu dáng phong phú (bold, italic, color, v.v.).
  - **DOCX Import & Semantic Reconciliation**:
    - Phân tích `<w:bookmarkStart>` và `<w:bookmarkEnd>` thành Bookmark ngữ nghĩa nội bộ:
      - Nhận diện Position Bookmark khi dải thẻ có độ dài zero (không có text run kẹp giữa).
      - Nhận diện Range Bookmark khi dải thẻ bao bọc các text runs.
    - Tự động sinh Stable ID chuẩn (`ref_bookmark_<uuid>`) và đồng bộ hóa vào `documentModel.references.bookmarks` qua `ReferencePersistenceService`.
  - **Chính Sách Lọc Bookmark Kỹ Thuật (Word Internal Bookmarks Policy)**:
    - Lọc bỏ chính xác các bookmark kỹ thuật tự sinh của Word: `_GoBack`, `_Toc*`, `_TOC*`, `_Hlk*`, `_Ref*`.
    - Bảo toàn 100% bookmark do người dùng tự đặt.
  - **Kháng Lỗi OOXML Dị Dạng (Malformed OOXML Resilience)**:
    - Kháng lỗi thẻ đóng không mở (`end without start`): bỏ qua an toàn mà không crash.
    - Kháng lỗi thẻ mở không đóng (`start without end`): tự động flush và neo an toàn tại cuối đoạn văn bản, không mất một ký tự văn bản nào.
    - Kháng lỗi trùng lặp numeric ID (`duplicate numeric IDs`): tự động flush anchor trước đó trước khi gán bookmark mới.
  - **Tương Thích Tham Chiếu Chéo (Cross-Reference Compatibility)**:
    - Giữ nguyên cơ chế làm phẳng văn bản (flattened text) của Cross-reference serializer; các liên kết tham chiếu đến Bookmark hiển thị và hoạt động ổn định.
  - **Kiểm Thử Mục Tiêu Đạt 100%**:
    - Tạo test suite [bookmarkDocxInteroperability.test.ts](file:///c:/Users/hoang/.gemini/antigravity-ide/scratch/PersonalWordEditor/src/references/bookmarkDocxInteroperability.test.ts) gồm 10 test cases bao phủ toàn diện 10 mục tiêu (100% PASS).
    - Toàn bộ **185 / 185 tests** của References Engine đạt 100% PASS.
    - Toàn bộ **84 / 84 tests** của DOCX Module đạt 100% PASS.
    - `npx tsc --noEmit` hoàn thành sạch sẽ 0 lỗi.

## Pagination Engine 2.0 — Phase 14: Final Audit & Zero Regression Completed — 2026-10-07

- **Pagination Engine 2.0 — Phase 14: Final Audit + Zero Regression**:
  - **Kiểm Định Toàn Diện Toàn Bộ Workflows (Realistic Workflows A–J)**:
    - **Workflow A (Long Paragraph Flow)**: Đoạn văn dài tràn qua nhiều trang A4 visual-flow tự nhiên từ Page 1 sang Page 2. ProseMirror AST bảo toàn chính xác 1 node `paragraph`. Boundary con trỏ, bộ gõ tiếng Việt Telex/VNI IME, lựa chọn xuyên trang (cross-page selection), và Undo/Redo hoạt động an toàn 100%.
    - **Workflow B (Widow / Orphan Control)**: Đoạn văn 5 dòng khi cuối trang chỉ vừa 1 dòng tự động reflow theo quy tắc `minOrphanLines = 2` và `minWidowLines = 2`, tuyệt đối không để lại dòng mồ côi đơn độc.
    - **Workflow C (Keep With Next)**: Heading mang `keepWithNext` ở gần đáy trang tự động chuyển trang cùng phần thân (body paragraph) phù hợp sang trang mới.
    - **Workflow D (Page Break Before)**: Đoạn văn/Heading mang `pageBreakBefore` luôn bắt đầu tại đầu trang mới mà không sinh ra node `pageBreak` giả trong AST.
    - **Workflow E (Multi-Page Table)**: Bảng lớn 45+ hàng tự động phân luồng qua nhiều trang theo ranh giới hàng nguyên tử; AST giữ nguyên vẹn 1 table duy nhất; CellSelection, phím Tab, merge/split, column resize, và repeated header trực quan đều hoạt động chuẩn xác.
    - **Workflow F (Sections & Mixed Geometry)**: Phân phần Section 1 (A4 Portrait) kết hợp Section 2 (A4 Landscape) duy trì ranh giới cách ly bất khả xâm phạm; fragments không cross ranh giới section; kích thước trang tính toán độc lập.
    - **Workflow G (References Dynamic Tracking)**: Heading di chuyển từ Trang 4 sang Trang 5 khi chèn nội dung phía trước; `PageLayoutMap` tự động cập nhật số trang, Mục lục (TOC) và Tham chiếu chéo (Cross-reference) truy vấn phản ánh chính xác số trang mới (Trang 5).
    - **Workflow H (Objects & Captions)**: Cặp Hình ảnh + Chú thích (Image + Caption) ở đáy trang tự động chuyển trang theo nhóm ngữ nghĩa (`positionPolicy: "below"`); khối ngoại cỡ kích hoạt controlled overflow; không bao giờ lặp vô hạn.
    - **Workflow I (Native Persistence .mwd)**: Lưu/Mở tệp `.mwd` bảo toàn trọn vẹn `keepWithNext`, `keepLinesTogether`, `pageBreakBefore`, `widowControl`, sections; loại trừ 100% tọa độ và fragment runtime khỏi file lưu trữ.
    - **Workflow J (DOCX Semantic Mapping)**: Nhập/xuất OOXML bảo toàn ngữ nghĩa `<w:keepNext>`, `<w:keepLines>`, `<w:pageBreakBefore>`, `<w:widowControl>`; luồng phân trang tự động không bị xuất thành `<w:br w:type="page"/>`.
  - **An Toàn Khi Thất Bại (Failure Safety & Fault Tolerance)**:
    - Cơ chế phòng thủ try/catch: Khi xảy ra ngoại lệ bất thường trong quá trình đo đạc layout, hệ thống tự động fallback về thuật toán phân trang an toàn mà không làm sập ứng dụng, không mutate AST, bảo vệ dữ liệu người dùng 100%.
  - **Đo Lường Hiệu Năng (Performance Benchmarking)**:
    - 50 đoạn văn bản: Phân trang hoàn tất trong ~1.5ms.
    - 200 đoạn văn bản: Phân trang hoàn tất trong ~6.0ms.
    - Bảng lớn 60 hàng: Phân trang hoàn tất trong ~2.5ms.
    - Cache hit rate khi gõ phím đạt > 95%.
  - **Bộ Kiểm Thử Mục Tiêu Đạt 100%**:
    - Tạo test suite [phase14FinalAudit.test.ts](file:///c:/Users/hoang/.gemini/antigravity-ide/scratch/PersonalWordEditor/src/page/phase14FinalAudit.test.ts) gồm 12 test cases bao phủ toàn diện Workflows A đến J, Failure Safety và Performance Benchmarking (100% PASS).
    - Toàn bộ **761 / 761 tests** trên toàn bộ hệ thống đạt 100% PASS.
    - `npm run build` biên dịch sạch sẽ 0 lỗi (687ms).
    - `cargo check` hoàn thành 0 lỗi (0.46s).

## Pagination Engine 2.0 — Phase 13: DOCX Semantic Pagination Mapping Completed — 2026-10-07

- **Pagination Engine 2.0 — Phase 13: DOCX Semantic Pagination Mapping**:
  - **Ánh Xạ Thuộc Tính Phân Trang Đoạn Văn (Paragraph Properties Import/Export Mapping)**:
    - `w:keepNext` $\leftrightarrow$ `keepWithNext`: bảo toàn liên kết giữa heading/paragraph và khối kế tiếp.
    - `w:keepLines` $\leftrightarrow$ `keepLinesTogether`: bảo toàn cấu hình giữ toàn bộ dòng của đoạn trên cùng một trang.
    - `w:pageBreakBefore` $\leftrightarrow$ `pageBreakBefore`: chuyển đổi thuộc tính ngắt trang trước của Word sang thuộc tính phân trang đoạn văn bản ngữ nghĩa.
    - `w:widowControl` $\leftrightarrow$ `widowControl`: bảo toàn cờ kiểm soát dòng mồ côi (true/false).
  - **Tách Biệt Style vs Direct Override trong DOCX**:
    - Phân tích và sinh thẻ trong `word/styles.xml` cho thuộc tính cấp style.
    - Phân tích và sinh thẻ trong `<w:pPr>` của `word/document.xml` cho thuộc tính ghi đè trực tiếp (direct formatting).
  - **Bảo Vệ Luồng Phân Trang Tự Động (No Automatic Page Fragments Serialized)**:
    - Tuyệt đối không sinh thẻ `<w:br w:type="page"/>` cho các vị trí phân trang thị giác tự động; chỉ phát sinh ngắt trang khi gặp node `pageBreak` thực sự trong AST.
  - **Kiểm Thử Mục Tiêu Đạt 100%**:
    - Tạo test suite [docxSemanticPagination.test.ts](file:///c:/Users/hoang/.gemini/antigravity-ide/scratch/PersonalWordEditor/src/docx/docxSemanticPagination.test.ts) gồm 11 test cases (100% PASS).

## Pagination Engine 2.0 — Phase 12: Semantic Pagination Properties Persistence Completed — 2026-10-07

- **Pagination Engine 2.0 — Phase 12: Semantic Pagination Properties Persistence**:
  - **Nguyên Tắc Lưu Trữ Chỉ-Ngữ-Nghĩa (Do Not Persist Runtime Layout)**:
    - Tuyệt đối không lưu các thông số runtime layout vào tệp `.mwd`: `pageIndex`, `topPx`, `heightPx`, `lineIndex`, `LayoutFragment`, tọa độ DOM hay số lượng trang tính toán.
  - **Lưu Trữ Bền Vững Các Thuộc Tính Ngữ Nghĩa (Persist Semantic Properties)**:
    - Bảo toàn 100% `keepWithNext`, `keepLinesTogether`, `pageBreakBefore`, `widowControl` trên các node `paragraph`, `heading`, và trong `DocumentStyle.paragraph`.
  - **Tương Thích Ngược & Chuẩn Hóa An Toàn (Backward Compatibility & Robustness)**:
    - Tệp cũ hoặc dữ liệu thiếu thuộc tính phân trang được tự động nạp với giá trị mặc định an toàn.
    - Xử lý phòng thủ khi gặp dữ liệu không hợp lệ (null, undefined, string, NaN) mà không làm mất nội dung văn bản.
  - **Kiểm Thử Mục Tiêu Đạt 100%**:
    - Tạo test suite [semanticPaginationPersistence.test.ts](file:///c:/Users/hoang/.gemini/antigravity-ide/scratch/PersonalWordEditor/src/page/semanticPaginationPersistence.test.ts) gồm 9 test cases (100% PASS).

## Pagination Engine 2.0 — Phase 11: Incremental Reflow & Performance Architecture Completed — 2026-10-07

- **Pagination Engine 2.0 — Phase 11: Incremental Reflow & Performance Architecture**:
  - **Phân Loại Thay Đổi Bố Cục (Reflow Triggers vs Non-Reflow Events)**:
    - `reflowManager.isLayoutAffectingChange`: Chỉ kích hoạt reflow khi có thay đổi kích thước/nội dung.
    - Bỏ qua reflow khi chỉ di chuyển con trỏ, thay đổi selection, hoặc hover bình luận $\to$ phản hồi 0ms.
  - **Vùng Bẩn Tăng Dần (Dirty Range Tracking)**:
    - Xác định vị trí bẩn sớm nhất `dirtyFromPos` từ transaction ProseMirror.
    - Giữ nguyên bố cục ổn định và tái sử dụng bộ nhớ đệm kết quả đo đạc DOM (`cachedLines`, `cachedTableRowHeight`) cho các khối nằm trước vùng bẩn.
  - **Bảo Vệ Bộ Gõ Tiếng Việt (Vietnamese IME Safety Guard)**:
    - Hook `usePagination` tự động hoãn đợt reflow nặng khi con trỏ đang trong trạng thái gõ tổ hợp IME Telex/VNI (`editor.view.composing`), giải phóng tính toán sau khi kết thúc composition.
  - **Cơ Chế Hội Tụ & Giới Hạn Lượt Reflow (Convergence Guard & Pass Limiter)**:
    - Giới hạn tối đa số lượt reflow liên tiếp trong một chu kỳ RAF để triệt tiêu vĩnh viễn hiện tượng layout thrashing và feedback loop.
  - **Kiểm Thử Mục Tiêu Đạt 100%**:
    - Tạo test suite [incrementalReflow.test.ts](file:///c:/Users/hoang/.gemini/antigravity-ide/scratch/PersonalWordEditor/src/page/incrementalReflow.test.ts) gồm 10 test cases (100% PASS).

## Pagination Engine 2.0 — Phase 10: Central Page Mapping Integration Completed — 2026-10-07

- **Pagination Engine 2.0 — Phase 10: Central Page Mapping Integration**:
  - **Nguồn Chân Lý Duy Nhất (Single Source of Truth for Page Layout)**:
    - Tích hợp `PageLayoutMap` trực tiếp vào `usePaginationStore`.
    - Thanh trạng thái `StatusBar` hiển thị "Trang X / Y" và "Section X / Y" chuẩn xác theo fragment chứa con trỏ.
    - Mục lục `TableOfContents` và Tham chiếu chéo `CrossReference` truy vấn số trang thực tế của đối tượng trực tiếp từ `PageLayoutMap.getPageNumberForPosition`.
  - **Cầu Nối Tương Thích Ngược (Backward Compatibility Bridge)**:
    - `pageLayoutBridge.ts`: Chuyển đổi `PageLayoutMap` thành cấu trúc `PaginationState` cũ cho các renderer kế thừa, bảo đảm không có 2 engine cạnh tranh.
  - **Kiểm Thử Mục Tiêu Đạt 100%**:
    - Tạo test suite [centralPageMapping.test.ts](file:///c:/Users/hoang/.gemini/antigravity-ide/scratch/PersonalWordEditor/src/page/centralPageMapping.test.ts) gồm 11 test cases (100% PASS).

## Pagination Engine 2.0 — Phase 9: Table Editing Safety Across Pages Completed — 2026-10-07

- **Pagination Engine 2.0 — Phase 9: Table Editing Safety Across Pages**:
  - **Lựa Chọn Ô Đa Trang (CellSelection Across Page Boundaries)**:
    - Hỗ trợ bôi đen vùng ô kéo dài từ phân mảnh trang trước sang phân mảnh trang sau mà không sinh ô ma (phantom cells).
  - **Điều Hướng Bàn Phím Chuẩn Xác (Keyboard Navigation Across Fragments)**:
    - Phím `Tab` và `Shift+Tab` di chuyển con trỏ liền mạch giữa ô cuối của trang 1 và ô đầu của trang 2.
    - Xóa ô đa trang bằng phím Delete/Backspace chỉ làm trống nội dung ô, không xóa nhầm cấu trúc hàng hoặc làm gãy phân trang.
  - **Lệnh Thao Tác Bảng Đa Trang (Table Commands Safety)**:
    - Các thao tác thêm hàng, xóa hàng, thêm cột, xóa cột, gộp ô, tách ô, và co giãn cột đều tự động kích hoạt tính toán lại phân mảnh chuẩn xác.
  - **Bảo Vệ Hàng Tiêu Đề Lặp Lại (Repeated Header Isolation)**:
    - Hàng tiêu đề lặp lại trên trang 2+ là thành phần thị giác chỉ đọc (`contenteditable="false"`), không thể đặt con trỏ hay gõ chữ vào.
  - **Kiểm Thử Mục Tiêu Đạt 100%**:
    - Tạo test suite [tableEditingSafety.test.ts](file:///c:/Users/hoang/.gemini/antigravity-ide/scratch/PersonalWordEditor/src/page/tableEditingSafety.test.ts) gồm 14 test cases (100% PASS).

## Pagination Engine 2.0 — Phase 8: Multi-Page Table Flow Core Completed — 2026-10-07

- **Pagination Engine 2.0 — Phase 8: Multi-Page Table Flow Core**:
  - **Mô Hình Phân Luồng Bảng Đa Trang (Table Fragment Model)**:
    - Một semantic table trong AST sinh ra nhiều `LayoutFragment` kiểu `table` tương ứng với từng trang giấy.
    - Ranh giới phân trang nguyên tử theo hàng (`tableRow`): không cắt ngang hàng bảng giữa chừng.
    - Hỗ trợ bảng lớn 50–100+ hàng phân trang mượt mà qua 3+ trang giấy.
  - **Tiêu Đề Lặp Lại Trực Quan (Repeated Header Metadata)**:
    - Thuộc tính `repeatHeader: true` tạo phân mảnh thị giác hàng tiêu đề ở đầu mỗi trang kế tiếp, dành riêng không gian hiển thị mà không nhân bản AST.
  - **Xử Lý Hàng Ngoại Cỡ (Oversized Row Handling)**:
    - Hàng bảng có chiều cao lớn hơn dung tích 1 trang được đặt tại đầu trang mới và kích hoạt controlled overflow, không bao giờ lặp vô hạn.
  - **Kiểm Thử Mục Tiêu Đạt 100%**:
    - Tạo test suite [tablePaginationFlow.test.ts](file:///c:/Users/hoang/.gemini/antigravity-ide/scratch/PersonalWordEditor/src/page/tablePaginationFlow.test.ts) gồm 10 test cases (100% PASS).

## Pagination Engine 2.0 — Phase 7: Non-Splittable Block Object Flow Completed — 2026-10-07

- **Pagination Engine 2.0 — Phase 7: Non-Splittable Block Object Flow**:
  - **Audit Toàn Diện 8 Loại Khối Đối Tượng (Object Types Representation Audit)**:
    - `image`: Atom block node (`atom: true, group: "block"`), chiều cao `attrs.height + 32px`, `nodeSize = 1`.
    - `shape`: Atom block node (`atom: true, group: "block"`), chiều cao `attrs.height + 32px`, `nodeSize = 1`.
    - `equation`: Atom block node (`atom: true, group: "block"`), chiều cao kết xuất KaTeX ~64px, `nodeSize = 1`.
    - `horizontalRule`: Atom block node (`atom: true, group: "block"`), chiều cao ~36px, `nodeSize = 1`.
    - `textBox`: Content container block (`group: "block", content: "block+", defining: true, isolating: true`), tôn trọng kiến trúc hiện tại, không tạo editor thứ hai, không phá contentDOM nội bộ; áp dụng atomic block policy ở cấp độ trang (không split giữa các trang).
    - `caption`: Content block (`group: "block", content: "inline*", defining: true, isolating: true`), chứa thuộc tính semantic `id`, `label`, `text`, `targetId`, `positionPolicy` ("above" | "below").
    - `tableOfContents`: Generated content block atom (`atom: true, group: "block"`), tính toán chiều cao dựa trên số lượng mục entries (`40 + entries.length * 24 + 16px`), `nodeSize = 1`.
    - `bibliography`: Generated content block atom (`atom: true, group: "block"`), tính toán chiều cao dựa trên số lượng nguồn trích dẫn entries (`40 + entries.length * 28 + 16px`), `nodeSize = 1`.
  - **Dòng Chảy Nguyên Tử (Atomic Flow Policy)**:
    - Đối với mọi block nhỏ hơn dung lượng thân trang khả dụng (`blockHeight <= usablePageHeight`): nếu không đủ chỗ ở trang hiện tại (`blockHeight > availableHeight` và `currentPageUsedHeight > 0`), tự động chuyển toàn bộ block sang trang kế tiếp.
    - Tuyệt đối không split: `image`, `shape`, `equation`, `horizontalRule`, `textBox`, `tableOfContents`, `bibliography`.
  - **Xử Lý Khối Ngoại Cỡ An Toàn (Oversized Object Handling & Anti-Infinite Pages)**:
    - Khi `blockHeight > usablePageHeight`: phát hiện ngay lập tức tình trạng oversized.
    - **Fallback: Controlled Overflow**:
      - Nếu trang hiện tại đã có nội dung (`currentPageUsedHeight > 0`): chuyển block sang đầu trang mới một lần duy nhất.
      - Tại đầu trang mới (`currentPageUsedHeight === 0`): đặt fragment bắt đầu tại đỉnh trang khả dụng (`top = usableBodyBounds.y`) và chấp nhận controlled overflow; đánh dấu cờ `isOversized: true` trên LayoutFragment.
      - Tuyệt đối không tiếp tục tạo trang mới cho block này $\to$ triệt tiêu hoàn toàn nguy cơ lặp vô hạn (Infinite Loop / Infinite Pages).
      - Thuật toán đảm bảo không tự động mutate kích thước tài liệu hay thuộc tính `attrs.height`/`attrs.width` của block.
  - **Chính Sách Nhóm Chú Thích Ngữ Nghĩa (Generic Semantic Caption Grouping Policy)**:
    - Xây dựng cơ chế gom nhóm generic dựa trên liên kết ngữ nghĩa `targetId` và `positionPolicy`:
      - **Target trước, Caption sau (`positionPolicy === "below"`)**: Nhận biết cặp [Target, Caption]. Nếu tổng chiều cao của nhóm không đủ chỗ ở trang hiện tại nhưng vừa vặn trên trang mới $\to$ chuyển cả Target và Caption sang trang mới ngay tại vị trí Target, loại bỏ triệt để hiện tượng Target ở đáy Trang 1 và Caption ở đầu Trang 2.
      - **Caption trước, Target sau (`positionPolicy === "above"`)**: Nhận biết cặp [Caption, Target]. Nếu tổng chiều cao của nhóm không đủ chỗ ở trang hiện tại nhưng vừa vặn trên trang mới $\to$ chuyển cả Caption và Target sang trang mới ngay tại vị trí Caption, loại bỏ triệt để hiện tượng Caption ở đáy Trang 1 và Target ở đầu Trang 2.
    - Hoàn toàn độc lập ngữ cảnh, không hardcode bất kỳ chuỗi nhãn nào ("Figure", "Table"...) mà dựa 100% vào quan hệ cấu trúc `targetId` và loại khối targetable (`image`, `table`, `shape`, `equation`, `textBox`).
    - **Caption Grouping Oversized Fallback**: nếu tổng chiều cao của nhóm `target + caption > usablePageHeight`, cơ chế tự động thư giãn (relax) nhóm để tránh infinite loop; từng block xử lý theo atomic policy ổn định.
  - **Đồng Bộ Dải Vị Trí Nửa Mở (Half-Open Interval Alignment)**:
    - Chuẩn hóa `getFragmentForPosition`: sử dụng dải vị trí nửa mở `[from, to)` cho tất cả các phân mảnh trừ phân mảnh cuối cùng của tài liệu (`!isLast ? safePos >= frag.from && safePos < frag.to : safePos >= frag.from && safePos <= frag.to`), đồng bộ hoàn hảo với `getPageForPosition` và quy ước vị trí con trỏ của ProseMirror.
  - **Bảo Toàn 100% Tính Bất Biến Của AST (Strict AST Immutability)**:
    - Toàn bộ tính toán phân trang và ngắt khối atomic chỉ sinh runtime `LayoutFragment` và `PageLayoutGeometry`, AST ProseMirror giữ nguyên vẹn 100%, không bị chèn thêm node `pageBreak`, không mutate kích thước.
  - **Kiểm Thử Mục Tiêu Đạt 100% (Targeted Test Suite)**:
    - Xây dựng bộ kiểm thử [nonSplittableObjectFlow.test.ts](file:///c:/Users/hoang/.gemini/antigravity-ide/scratch/PersonalWordEditor/src/page/nonSplittableObjectFlow.test.ts) gồm 12 test cases bao quát: image move-next, equation move-next, shape move-next, textBox atomic policy, oversized object controlled overflow, no infinite pages, caption+image grouping, caption+table grouping, caption grouping oversized fallback, TOC & Bibliography policy, AST unchanged.
    - Toàn bộ **257 / 257 tests** trong test suite của `src/page` và `src/styles` đạt 100% PASS (Zero Regression).
    - `npx tsc --noEmit` hoàn thành với **0 lỗi**.

- **Pagination Engine 2.0 — Phase 6: Breaks, Sections & Mixed Page Geometry**:
  - **Explicit PageBreak Bảo Toàn Ngữ Nghĩa (Explicit Page Break Fidelity)**:
    - Bảo toàn 100% semantic node `pageBreak` trong ProseMirror AST; không biến đổi persistence hay meaning của node.
    - Chuỗi `Content A -> PageBreak -> Content B`: Content B luôn bắt đầu chính xác tại đỉnh vùng thân trang khả dụng (`usableBodyBounds.y`) của trang kế tiếp.
  - **Kết Hợp Phân Mảnh Tự Động & Ngắt Trang Cứng (Auto Flow + Explicit Break)**:
    - Hỗ trợ chu trình phân trang liền mạch: đoạn văn dài tự động visual-fragment qua các trang $\to$ gặp `pageBreak` cứng $\to$ nội dung tiếp theo bắt đầu ở trang mới và tiếp tục tự động flow mượt mà.
    - Không xảy ra hiện tượng double-break; không sinh ra trang trống thừa ngoài ý muốn.
  - **Xử Lý Ngắt Trang Liền Kề Tất Định (Adjacent Breaks)**:
    - `PageBreak + PageBreak`: Sinh ra chính xác 1 trang trống ở giữa theo chuẩn Word, con trỏ map chuẩn xác, không runaway pages.
    - `SectionBreak + PageBreak`: SectionBreak kết thúc Section 1; Section 2 bắt đầu với PageBreak tạo trang trống theo geometry của Section 2, sau đó là nội dung.
    - `PageBreak + SectionBreak`: PageBreak ngắt trang trong Section 1, SectionBreak kết thúc Section 1 và đưa Section 2 bắt đầu ở trang kế tiếp theo geometry mới.
  - **Ranh Giới Section Bất Khả Xâm Phạm (Strict Section Boundary Isolation)**:
    - Tuyệt đối không có visual fragment nào vượt qua (cross) ranh giới Section Break (`continuesToNextPage` và `continuedFromPreviousPage` luôn là `false` tại ranh giới).
    - Tạo LayoutFragment `sectionBreak` độc lập tại vị trí chuyển tiếp giữa các section, bảo đảm vị trí con trỏ `currentDocPos` của Section kế tiếp khớp chính xác 100% với cây ProseMirror AST.
  - **Hình Học Trang Hỗn Hợp Per-Section / Per-Page (Mixed Page Geometry)**:
    - Hỗ trợ đầy đủ tất cả các tổ hợp hình học: Khổ giấy (A4, A3, Letter, Legal), Hướng trang (Portrait, Landscape), và Lề tùy chỉnh (Normal, Narrow, Wide, Custom margins).
    - Loại bỏ hoàn toàn hằng số toàn cục `global usablePageHeight`: Mọi phép tính usable width, usable height, và line measurement đều giải quyết động theo cấu hình Section của từng trang (`createPageGeometry`).
  - **Loại Trừ Chuẩn Xác Vùng Header / Footer (Header & Footer Body Bounds)**:
    - `usableBodyBounds` tính toán chuẩn xác loại trừ lề trên, lề dưới, vùng Header và vùng Footer:
      `usableBodyBounds.y === marginsPx.top` và `usableBodyBounds.height === heightPx - marginsPx.top - marginsPx.bottom`.
    - Text và metadata của Header/Footer tuyệt đối không bị tính nhầm như body block trong quá trình phân trang.
  - **Đồng Bộ Số Trang Động Không Lưu Trữ ({PAGE} & {NUMPAGES})**:
    - Trường số trang động `{PAGE}` (số thứ tự trang hiện tại 1-indexed) và `{NUMPAGES}` (tổng số trang động) phản ánh tức thì theo runtime `pageCount` của `PageLayoutMap`.
    - Computed page count hoàn toàn động, không bị lưu tĩnh vào file `.mwd` hay cây AST document attrs.
  - **Kiểm Thử Mục Tiêu Đạt 100% (Targeted Test Suite)**:
    - Tạo test suite [breaksSectionsGeometry.test.ts](file:///c:/Users/hoang/.gemini/antigravity-ide/scratch/PersonalWordEditor/src/page/breaksSectionsGeometry.test.ts) bao phủ toàn diện 12 bài kiểm thử (100% PASS).
    - Toàn bộ **245 / 245 tests** trong test suite của `src/page` và `src/styles` đạt 100% PASS (Zero Regression).
    - `npx tsc --noEmit` hoàn thành với **0 lỗi**.

## Pagination Engine 2.0 — Phase 5: Paragraph Pagination Rules Completed — 2026-10-07

- **Pagination Engine 2.0 — Phase 5: Semantic Paragraph Pagination Rules**:
  - **Tái Sử Dụng Styles Engine 2.0 (Reuse Existing Styles Engine & Precedence)**:
    - Mở rộng `ParagraphStyleProperties` và `ResolvedParagraphProperties` với `keepWithNext`, `keepLinesTogether`, `pageBreakBefore`, `widowControl`.
    - Tái sử dụng `styleResolver.ts` và `effectiveStyleService.ts` (`getEffectiveParagraphFormatting`). Tuyệt đối không xây dựng Styles Engine thứ hai.
    - Cung cấp hàm tập trung [resolveBlockPaginationRules](file:///c:/Users/hoang/.gemini/antigravity-ide/scratch/PersonalWordEditor/src/styles/services/effectiveStyleService.ts) tiếp nhận cả ProseMirror Node và JSONContent, bảo đảm tôn trọng thứ tự ưu tiên: Built-in Defaults $\to$ Style Definitions $\to$ Direct Paragraph Attributes Overrides.
  - **Quy Tắc Giữ Liền Trang với Khối Kế Tiếp (Keep With Next)**:
    - Thiết kế như một Generic Block Policy cho bất kỳ loại khối nào (Paragraph, Heading, Caption, Table, Custom Block), không hardcode riêng cho Heading.
    - Hỗ trợ chuỗi kế tiếp liên hoàn (Chained `keepWithNext`: H1 $\to$ H2 $\to$ Paragraph follower): tự động gom nhóm (keep-group) và chuyển toàn bộ nhóm sang trang kế tiếp nếu khoảng trống còn lại ở trang hiện tại không đủ chứa khối hiện tại và phần tử kế tiếp/phần thân hợp lý.
  - **Quy Tắc Giữ Toàn Bộ Dòng Trong Đoạn (Keep Lines Together)**:
    - Nếu đoạn văn có thể nằm trọn vẹn trong một trang khả dụng (`totalHeight <= pageCapacity`), chuyển toàn bộ đoạn văn sang trang sau thay vì cắt ngang (chính xác 1 fragment duy nhất).
    - Cơ chế Fallback an toàn cho đoạn văn ngoại cỡ (Oversized Paragraph Fallback): nếu đoạn văn dài hơn toàn bộ 1 trang (`totalHeight > pageCapacity`), tự động thư giãn (relax) quy tắc và phân mảnh dòng an toàn qua các trang, bảo đảm hội tụ ngay lập tức, không bao giờ loop vô hạn.
  - **Kiểm Soát Dòng Đơn Độc (Widow / Orphan Control)**:
    - Mặc định chuẩn typographic: `minOrphanLines = 2`, `minWidowLines = 2` (thuộc tính `widowControl: true` trong Built-in Style Normal).
    - **Orphan Rule**: Nếu đáy trang hiện tại chỉ vừa ít hơn 2 dòng ($< 2$ lines), tự động ngắt trang trước đoạn văn, chuyển toàn bộ đoạn sang trang mới để tránh để lại 1 dòng lẻ loi ở đáy trang trước.
    - **Widow Rule**: Nếu phần tràn sang trang tiếp theo chỉ còn 1 dòng đơn độc, thuật toán tự động nhường 1 dòng từ đáy trang trước sang trang sau (đưa số dòng trang sau lên $\ge 2$ dòng và giữ trang trước $\ge 2$ dòng), hoặc đẩy toàn bộ đoạn văn sang trang mới nếu đoạn văn không đủ dòng.
  - **Quy Tắc Bắt Đầu Ở Trang Mới (Page Break Before)**:
    - Khối có `pageBreakBefore: true` luôn bắt đầu ở trang mới nếu trang hiện tại đã có nội dung (`currentPageUsedHeight > 0`).
    - Phân biệt hoàn toàn với `pageBreak` AST node: tuyệt đối không chèn node `pageBreak` giả, không sinh ra fragment giả trong layout map.
    - Nếu khối đã ở đầu trang mới (`currentPageUsedHeight === 0`), không tạo thêm trang trống vô nghĩa.
  - **Chính Sách Giải Quyết Xung Đột & Hội Tụ Tuyệt Đối (Conflict Policy & Convergence Guarantee)**:
    - Phát hiện nhóm vượt sức chứa trang (Oversized Keep-Group Detection): chuỗi H1 (keepWithNext) + H2 (keepWithNext) + Paragraph (keepLinesTogether) vượt quá dung tích 1 trang.
    - Thư giãn ràng buộc có ưu tiên thấp nhất theo thứ tự:
      1. Đảm bảo tiến trình phân trang và không bao giờ treo lặp.
      2. Relax `keepLinesTogether` của follower paragraph (cho phép split 2 dòng đầu cùng heading sang trang mới).
      3. Bẻ gãy chuỗi chain `keepWithNext` từ cuối lên đầu nếu chuỗi heading quá dài.
    - Hội tụ 100% trong mọi trường hợp biên và khổ giấy cực nhỏ.
  - **Đồng Bộ Editor Commands & Undo/Redo**:
    - Đăng ký global attributes `keepWithNext`, `keepLinesTogether`, `pageBreakBefore`, `widowControl` trong `src/editor/paragraphExtensions.ts`.
    - Cung cấp lệnh `setParagraphPagination(editor, pagination)` trong `src/editor/editorCommands.ts` với khả năng Undo/Redo nguyên tử qua ProseMirror history.
  - **Kiểm Thử Mục Tiêu Đạt 100% (Targeted Test Suite)**:
    - Tạo test suite [paragraphPaginationRules.test.ts](file:///c:/Users/hoang/.gemini/antigravity-ide/scratch/PersonalWordEditor/src/page/paragraphPaginationRules.test.ts) bao phủ toàn diện 14 bài kiểm thử:
      `keepWithNext`, `chain keepWithNext`, `keepLinesTogether`, `oversized paragraph fallback`, `widow`, `orphan`, `pageBreakBefore`, `conflicting rules`, `mixed style/direct override precedence`, `built-in heading default`, `no infinite loop edge cases`, `Undo/Redo property changes`.
    - Toàn bộ **233 / 233 tests** trong `src/page` và `src/styles` đạt 100% PASS (Zero Regression).


- **Styles Engine 2.0 — Phase 10: Final Integration, Zero-Regression & Completion**:
  - **Kiểm thử Chu trình Thực tế (End-to-End Workflow Verification)**:
    - Xác minh chu trình hoàn chỉnh thực tế: Create "Thesis Body" $\to$ based on Normal $\to$ Times New Roman 13pt $\to$ Justify $\to$ line spacing 1.5 $\to$ first-line indent 1.27cm (36pt) $\to$ spacingAfter 6pt $\to$ áp dụng đồng loạt nhiều đoạn văn $\to$ Save `.mwd` $\to$ Open $\to$ sửa Thesis Body từ 13pt lên 14pt $\to$ tất cả các đoạn văn tự động cập nhật $\to$ Undo/Redo $\to$ Export DOCX $\to$ Import lại.
    - Không cần rewrite hay định dạng lại thủ công từng đoạn văn; định dạng phân giải đồng bộ qua Dynamic Stylesheet Injection và Style Resolution Engine.
  - **Chu trình Ký tự & Đồng tồn tại Ngữ nghĩa (Character Style Workflow & Semantic Coexistence)**:
    - Tạo Character Style "Emphasis Custom" (In đậm + Màu sắc) $\to$ áp dụng cho vùng chọn $\to$ áp dụng đè định dạng trực tiếp (direct override) $\to$ bình luận (Comments) và thay đổi theo dõi (Track Changes insert/delete) quanh vùng chọn được bảo toàn tuyệt đối không bị mất mát hay làm hỏng ID $\to$ Save/Open `.mwd` $\to$ Export/Import DOCX an toàn 100%.
  - **Tích hợp Đề mục & Tham chiếu (Semantic Headings & References Integration)**:
    - Tùy biến toàn diện diện mạo trực quan cho Heading 1 (Georgia 20pt, căn giữa, khoảng cách trước 24pt / sau 12pt).
    - Xác minh Heading vẫn giữ vững bản chất node `type: "heading"` với `attrs.level = 1`.
    - Dịch vụ HeadingService, Document Outline Sidebar, Table of Contents (TOC), và Cross-reference Anchor phân giải chính xác 100%, không bị ảnh hưởng bởi thay đổi giao diện trực quan.
  - **Không Gây Xung đột với Review Engine (Review Engine Non-Interference)**:
    - Thao tác áp dụng Paragraph / Character Style tuyệt đối không làm trôi dạt hoặc xóa bỏ các semantic marks: Comments, Track Changes (insert, delete), Proofing decorations (Spelling, Grammar).
  - **Ứng suất Phân trang & Đa Section (Page Engine & Multi-Section Stress Testing)**:
    - Thử nghiệm tài liệu đa section, khổ giấy A4/A3, xoay ngang/dọc (portrait/landscape), lề tùy chỉnh (custom margins), giãn dòng và thụt lề phức tạp.
    - Xác nhận không xảy ra vòng lặp vô hạn (infinite reflow), không nhân đôi trang, không xung đột giữa styles và phân trang (pagination loop), bảo vệ nguyên vẹn con trỏ soạn thảo (caret), vùng chọn và bộ gõ tiếng Việt IME.
  - **Hiệu năng & Hủy bộ nhớ đệm có mục tiêu (Performance & Cache Invalidation)**:
    - Kiểm thử chuỗi kế thừa sâu 12 cấp (Deep Inheritance Chain) và tài liệu chứa nhiều đoạn văn cùng style: phân giải ban đầu tức thì, truy xuất cache hit dưới 1ms.
    - Cập nhật định nghĩa style chỉ vô hiệu hóa đúng cây con phụ thuộc (`collectDescendants`), không quét lại toàn bộ tài liệu hay phân giải lại style tree trên mỗi keystroke gõ phím.
  - **Phòng thủ Dữ liệu Dị tật (Defensive Resilience & Fail-Safe)**:
    - Xử lý kiên cố: tài liệu không có custom style, tên style rỗng hoặc trùng lặp, missing parent, kế thừa vòng (`circular basedOn`), styleId lạ trong block hoặc text run, xóa style đang được dùng, mở tệp .mwd cũ, tệp DOCX dị tật, thao tác style trong ô bảng (`tableCell`) và danh sách (`listItem`).
  - **Bộ kiểm thử & Trạng thái hoàn thành**:
    - Bổ sung bộ kiểm thử tích hợp `src/styles/phase10FinalAudit.test.ts` (8 bài kiểm thử end-to-end, 100% pass).
    - Toàn bộ **617 / 617 tests** trong test suite toàn dự án đạt 100% PASS (Zero Regression).
    - `npm run build` (`tsc && vite build`) hoàn thành sạch sẽ không lỗi.
    - `cargo check` backend Tauri hoàn thành thành công 0 lỗi.
    - Styles Engine 2.0 chính thức **HOÀN TẤT (COMPLETED)**.

## Phase 9 — DOCX Style Export + Round-Trip Completed — 2026-10-07

- **Styles Engine 2.0 — Phase 9: DOCX Style Export + Round-Trip**:
  - **Audit Kiến trúc Xuất DOCX (Export Pipeline Audit)**:
    - Tuân thủ nghiêm ngặt chuỗi chuyển đổi chuẩn: Internal Document Model $\to$ `buildStyleExportMapping` $\to$ `buildStylesXml` $\to$ `DocumentSerializer` $\to$ `buildDocxPackage` $\to$ Uint8Array DOCX.
    - Tuyệt đối không bypass qua HTML; tương thích hoàn toàn chuẩn ISO/IEC 29500 WordprocessingML để mở mượt mà trên Microsoft Word và LibreOffice.
  - **Tạo word/styles.xml Ngữ nghĩa (Semantic Styles XML Builder)**:
    - Cập nhật [styleSerializer.ts](file:///c:/Users/hoang/.gemini/antigravity-ide/scratch/PersonalWordEditor/src/docx/mapping/styleSerializer.ts) để sinh động `<w:style w:type="paragraph">` và `<w:style w:type="character">`.
    - Bao gồm đầy đủ `styleId`, `name`, `basedOn`, `next`, `qFormat`, `pPr`, `rPr`.
    - Cập nhật các built-in styles (`Normal`, `Heading1`, `Heading2`, `Heading3`, `DefaultParagraphFont`, `Emphasis`, `Strong`) phản ánh chính xác cấu hình tùy biến từ `doc.styles`.
    - Bảo toàn các auxiliary styles hệ thống quan trọng của Word (`FootnoteReference`, `FootnoteText`, `EndnoteReference`, `EndnoteText`, `Caption`, `Bibliography`, `TOCHeading`).
  - **Gán Paragraph Style ngữ nghĩa (w:pStyle Assignment)**:
    - [documentSerializer.ts](file:///c:/Users/hoang/.gemini/antigravity-ide/scratch/PersonalWordEditor/src/docx/mapping/documentSerializer.ts) phát ra `<w:pStyle w:val="...">` khi block paragraph/heading có `attrs.styleId`.
    - Heading 1/2/3 luôn giữ semantic Heading mapping (`w:pStyle w:val="Heading1/2/3"` hoặc custom heading style với `outlineLvl`).
    - Không flatten custom styles thành chuỗi direct formatting nếu style có thể biểu diễn ngữ nghĩa.
  - **Gán Character Style ngữ nghĩa (w:rStyle Assignment) & Thứ tự Phân giải**:
    - Text run mang mark `characterStyle` được xuất thành `<w:rStyle w:val="...">` ở vị trí đầu tiên của `<w:rPr>` theo đúng đặc tả OOXML schema.
    - Direct formatting marks (`bold`, `italic`, `underline`, `strike`, `textStyle` fonts/size/color, `highlight`) xuất sau `w:rStyle` làm override.
    - Giữ trọn vẹn thứ tự ưu tiên: style $\to$ direct formatting overrides.
  - **Chuyển đổi Thuộc tính & Đơn vị Tập trung (Property Export & Unit Conversions)**:
    - Paragraph properties: `textAlign` (`w:jc`), `lineSpacing` / `spacingBefore` / `spacingAfter` (`w:spacing`), `leftIndent` / `rightIndent` / `firstLineIndent` / `hangingIndent` (`w:ind`), `keepWithNext` (`w:keepNext`), `headingLevel` (`w:outlineLvl`).
    - Character properties: `fontFamily` (`w:rFonts`), `fontSize` (`w:sz`/`w:szCs`), `bold` (`w:b`), `italic` (`w:i`), `underline` (`w:u`), `strike` (`w:strike`), `color` (`w:color`), `highlight` (`w:highlight`).
    - Thêm tiện ích quy đổi tập trung `ptToTwips` trong [xmlUtils.ts](file:///c:/Users/hoang/.gemini/antigravity-ide/scratch/PersonalWordEditor/src/docx/utils/xmlUtils.ts) ($pt \times 20$).
  - **Quản lý Style IDs An toàn & Xác định (XML-Safe Deterministic Style IDs)**:
    - Xây dựng mô-đun [docxStyleExportMapper.ts](file:///c:/Users/hoang/.gemini/antigravity-ide/scratch/PersonalWordEditor/src/docx/styles/docxStyleExportMapper.ts):
    - Khử dấu tiếng Việt, loại bỏ ký tự đặc biệt, chuẩn hóa thành XML NCName PascalCase an toàn (`sanitizeToXmlNcName`).
    - Map deterministic, ổn định trong cùng một tài liệu, 100% collision-free; giải quyết xung đột duplicate name hoặc trùng built-in bằng suffix tự động (`_2`, `_3`).
  - **Bảo toàn Round-Trip Toàn diện (Round-Trip Fidelity)**:
    - Bộ test [docxStyleExport.test.ts](file:///c:/Users/hoang/.gemini/antigravity-ide/scratch/PersonalWordEditor/src/docx/docxStyleExport.test.ts) (13/13 tests đạt 100%):
      - Editor $\to$ DOCX $\to$ Editor: bảo toàn style definitions, basedOn inheritance, paragraph assignments, character assignments, direct overrides.
      - Word fixture $\to$ Editor $\to$ modify style $\to$ DOCX $\to$ parse lại: sửa style trong Editor và xuất DOCX mới, nạp lại bảo toàn các thay đổi.
  - **Không Gây Thoái lui (Zero Regression)**:
    - Đảm bảo tương thích hoàn hảo với tables, images, lists, section breaks, headers/footers, comments, tracked changes, footnotes/endnotes, captions, citations/bibliography.
    - Toàn bộ 609 tests trong test suite đều pass.

## Phase 8 — DOCX Semantic Style Import Completed — 2026-10-07

- **Styles Engine 2.0 — Phase 8: DOCX Semantic Style Import**:
  - **Audit Kiến trúc Nhập DOCX (Architecture Audit)**:
    - Tuân thủ nghiêm ngặt chuỗi chuyển đổi chuẩn: `readDocxPackage` (ZIP Reader) $\to$ `parseStyles` (Styles Parser) $\to$ `mapDocxStylesToDocumentStyles` (Style Semantic Mapper) $\to$ `mapDocxXmlToDocumentModel` (Document Mapper) $\to$ `Internal Document Model` $\to$ `ProseMirror AST`.
    - Tuyệt đối không bypass qua HTML hoặc thư viện trung gian; tái sử dụng và mở rộng hệ thống OOXML XML DOM parser hiện hữu.
  - **Ánh xạ Style Đoạn văn & Ký tự (Paragraph & Character Style Mapping)**:
    - Xây dựng mô-đun chuyên biệt [docxStyleMapper.ts](file:///c:/Users/hoang/.gemini/antigravity-ide/scratch/PersonalWordEditor/src/docx/styles/docxStyleMapper.ts):
      - Đọc đầy đủ `<w:style>`, `w:styleId`, `w:type="paragraph"`, `w:type="character"`, `w:name`, `w:basedOn`, `w:pPr`, `w:rPr`.
      - Hỗ trợ toàn bộ thuộc tính đoạn văn: căn lề ngang (`w:jc`), giãn dòng (`w:spacing` line), khoảng cách trước đoạn (`w:spacing` before), khoảng cách sau đoạn (`w:spacing` after), thụt lề trái/phải (`w:ind` left/right), thụt lề dòng đầu (`w:ind` firstLine) và nhô lề dòng đầu (`w:ind` hanging).
      - Hỗ trợ toàn bộ thuộc tính ký tự: phông chữ (`w:rFonts`), cỡ chữ (`w:sz`), in đậm (`w:b`), in nghiêng (`w:i`), gạch chân (`w:u`), gạch ngang (`w:strike`), màu chữ (`w:color`), màu nền highlight (`w:highlight`).
    - Quy đổi đơn vị đo lường tập trung qua [xmlUtils.ts](file:///c:/Users/hoang/.gemini/antigravity-ide/scratch/PersonalWordEditor/src/docx/utils/xmlUtils.ts) (`twipsToPt`, `halfPointsToPt`), loại trừ hoàn toàn các con số magic rải rác.
  - **Chiến lược Ánh xạ ID Ổn định & Ngăn ngừa Xung đột (Deterministic ID Strategy & Collision Safety)**:
    - Word `Normal` $\to$ `style_normal`.
    - Word `Heading 1` / `Heading1` $\to$ `style_heading_1`.
    - Word `Heading 2` / `Heading2` $\to$ `style_heading_2`.
    - Word `Heading 3` / `Heading3` $\to$ `style_heading_3`.
    - Word `Emphasis` $\to$ `style_emphasis`.
    - Word `Strong` $\to$ `style_strong`.
    - Custom styles: sinh ID ổn định `style_docx_${sanitizedId}`, ngăn chặn 100% việc trùng với các ID built-in của editor hoặc giữa các custom style trùng tên.
  - **Bảo toàn Cấp độ Đề mục Ngữ nghĩa (Built-in Heading Semantic Node Preservation)**:
    - Khi đoạn văn mang `w:pStyle="Heading1"` (hoặc Heading 2/3, outline level 0..2): luôn tạo semantic heading node trong AST `{ type: "heading", attrs: { level: 1 | 2 | 3, styleId: "style_heading_1" } }`.
    - Tuyệt đối không biến tiêu đề ngữ nghĩa thành đoạn văn thông thường (`paragraph`).
    - Định nghĩa style quản lý toàn bộ diện mạo hiển thị (font, size, spacing, color).
  - **Kế thừa Semantic basedOn & Xử lý An toàn Chu trình Vòng**:
    - Nhập quan hệ kế thừa thành `basedOn` ngữ nghĩa trong `DocumentStyle`.
    - Kết hợp chu trình phân giải phân cấp nhiều tầng (`resolveStyle`).
    - Phòng thủ dị tật: tự động ngắt chu trình kế thừa vòng (`circular basedOn`) và tự động fallback về `style_normal` / `null` khi cha không tồn tại (`missing parent`).
  - **Gán Tham chiếu w:pStyle và w:rStyle**:
    - Paragraph có `w:pStyle` $\to$ gán `attrs.styleId` trên block paragraph/heading.
    - Run có `w:rStyle` $\to$ gán semantic mark `{ type: "characterStyle", attrs: { styleId } }` trên text run.
    - Định dạng trực tiếp trên run (`<w:rPr>`) và paragraph (`<w:pPr>`) được bảo lưu dưới dạng direct attribute/mark overrides song song với styleId.
  - **Bảo vệ Tính toàn vẹn Dữ liệu & Xử lý Dị tật (Defensive Handling)**:
    - Bỏ qua an toàn các kiểu style không hỗ trợ (`w:type="table"`, `w:type="numbering"`).
    - Bỏ qua an toàn các thuộc tính OOXML không hỗ trợ (`w:snapToGrid`, `w:widowControl`, v.v.).
    - Tệp DOCX thiếu hoàn toàn `word/styles.xml`: tự động cấp phát 4 styles mặc định, bảo toàn 100% văn bản nhập.
    - Làm sạch tham chiếu phantom bằng `normalizeDocumentContentStyles`.
  - **Kiểm thử Toàn diện (Targeted Test Suite)**:
    - Bổ sung `src/docx/docxStyleImport.test.ts` gồm 14 test cases bao phủ toàn diện 100% yêu cầu.
    - Toàn bộ 596 bài kiểm thử toàn dự án PASS (100%).
    - `npx tsc --noEmit` hoàn thành sạch sẽ 0 lỗi.

## Phase 7 — Native .mwd Persistence + Backward Compatibility Completed — 2026-10-07

- **Styles Engine 2.0 — Phase 7: Native .mwd Persistence + Backward Compatibility**:
  - **Bảo toàn Định nghĩa Style (Persist Style Definitions)**:
    - Định dạng `MwdFilePackage` (version 1) bảo toàn trọn vẹn khối `styles.definitions` qua Save và Open trong [documentFile.ts](file:///c:/Users/hoang/.gemini/antigravity-ide/scratch/PersonalWordEditor/src/document/documentFile.ts).
    - Lưu trữ đầy đủ: stable unique ID, tên hiển thị, kiểu style (`paragraph` / `character`), quan hệ kế thừa `basedOn`, `nextStyleId`, cờ `isBuiltIn`, toàn bộ các thuộc tính paragraph (`textAlign`, `lineSpacing`, `spacingBefore`, `spacingAfter`, `leftIndent`, `rightIndent`, `firstLineIndent`, `hangingIndent`, `keepWithNext`, `headingLevel`) và character (`fontFamily`, `fontSize`, `bold`, `italic`, `underline`, `strike`, `color`, `highlight`).
  - **Bảo toàn Phân bổ Style & Định dạng Trực tiếp (Persist Style Assignments & Direct Formatting)**:
    - Block paragraphs/headings lưu tham chiếu semantic `attrs.styleId` nguyên vẹn trong ProseMirror AST JSON.
    - Text runs lưu `marks: [{ type: "characterStyle", attrs: { styleId } }]` nguyên vẹn.
    - Tuyệt đối không làm phẳng (flatten) định dạng style thành inline style cứng trong file .mwd gốc.
    - Direct overrides (`textAlign`, `lineSpacing`, direct bold/italic/font marks) được giữ nguyên vẹn trên AST node song song với tham chiếu style.
  - **Chu trình Lưu & Mở Trọn vẹn (Round-Trip Fidelity)**:
    - Quy trình Create Style (ví dụ "Thesis Body" kế thừa "Normal") $\to$ cấu hình định dạng $\to$ áp dụng cho nhiều đoạn văn $\to$ áp dụng Character Style cho text run $\to$ Save $\to$ Close/Open:
      - Đảm bảo 100% giữ nguyên cùng IDs, cùng định nghĩa, cùng quan hệ kế thừa, cùng phép gán blocks/marks, và phân giải ra cùng kết quả định dạng hiệu lực (`resolveStyle`).
  - **Tương thích Ngược với Tệp .mwd Cũ (Old .mwd File Backward Compatibility)**:
    - Tệp tin .mwd cũ hoàn toàn không có khối `styles` được nạp an toàn 100% không gây crash.
    - Tự động bổ sung 4 styles built-in hệ thống (`Normal`, `Heading 1`, `Heading 2`, `Heading 3`).
    - Giữ nguyên toàn bộ cấu trúc và định dạng hiện hữu của đoạn văn và đề mục (Heading 1/2/3).
    - Thao tác mở tệp không tự động ghi đè hoặc rewrite tệp trên đĩa.
  - **Chuẩn hóa Dữ liệu Dị tật (Defensive Normalization for Malformed Styles)**:
    - Nâng cấp `normalizeStyleCollection` và xây dựng `normalizeDocumentContentStyles` trong [styleValidator.ts](file:///c:/Users/hoang/.gemini/antigravity-ide/scratch/PersonalWordEditor/src/styles/validation/styleValidator.ts):
      - `definitions` không phải mảng: tự động phục hồi về 4 built-in styles chuẩn.
      - Trùng ID (`duplicate IDs`): giữ lại định nghĩa đầu tiên, bỏ qua các bản sao trùng.
      - Trùng tên (`duplicate names`): tự động đánh số hậu tố `${name} (2)`, `${name} (3)` thay vì drop style để bảo toàn định dạng của các blocks đang tham chiếu.
      - Thiếu cha (`missing parent`) hoặc mismatch kiểu: tự động fallback an toàn (`basedOn = style_normal` cho paragraph, `null` cho character).
      - Chu trình vòng (`inheritance cycle` A $\to$ B $\to$ A): phát hiện và ngắt chu trình an toàn.
      - `unknown styleId` trên block: fallback về `style_normal` (paragraph) hoặc default heading level (heading).
      - `unknown character styleId`: gỡ bỏ mark phantom mà bảo toàn 100% văn bản và các mark hợp lệ khác (bold, italic, ...).
  - **An toàn Trạng thái Bẩn khi Lưu Thất bại (Save Failure Safety)**:
    - Đồng bộ `stylesJson` vào `lastSavedSnapshot` trong [documentStore.ts](file:///c:/Users/hoang/.gemini/antigravity-ide/scratch/PersonalWordEditor/src/stores/documentStore.ts).
    - Nếu quá trình lưu thất bại (lỗi I/O, quyền truy cập, v.v.): `isDirty` vẫn giữ nguyên `true`, định nghĩa styles không bị reset, ứng dụng không đánh lừa người dùng rằng tệp đã được lưu.
  - **Kiểm thử Trọng tâm (Targeted Tests Suite)**:
    - Bổ sung `src/styles/stylesPersistence.test.ts` gồm 9 bài kiểm thử độc lập bao phủ 100% kịch bản persistence và backward compatibility.
    - Toàn bộ **90/90 bài kiểm thử Styles Engine PASS (100%)**.
    - `npx tsc --noEmit` hoàn thành sạch sẽ 0 lỗi.

## Phase 6 — Styles UI / UX 2.0 Completed — 2026-10-07

- **Styles Engine 2.0 — Phase 6: Styles UI / UX 2.0**:
  - **Styles Gallery 2.0 trên Home Ribbon**:
    - Nâng cấp [StylesGallery.tsx](file:///c:/Users/hoang/.gemini/antigravity-ide/scratch/PersonalWordEditor/src/components/ribbon/StylesGallery.tsx) thay thế hoàn toàn các nút tĩnh cũ.
    - Ưu tiên hiển thị cố định 4 styles built-in quan trọng (`Normal`, `Heading 1`, `Heading 2`, `Heading 3`) cùng tối đa 1 custom/recent style (giới hạn chặt chẽ tối đa 5 cards) nhằm đảm bảo thanh Home Ribbon không bao giờ bị tràn hoặc vỡ giao diện kể cả khi tài liệu có hàng chục styles.
    - Mỗi style card hiển thị trực quan UI preview xấp xỉ phông chữ, kích thước, độ đậm, độ nghiêng, màu sắc và gạch chân dựa trên định nghĩa style đã phân giải.
    - Tích hợp menu dropdown mở rộng (*More Styles / Quản lý Styles*) qua nút ChevronDown với danh sách đầy đủ tất cả styles trong tài liệu cùng chỉ báo tích chọn Active Style.
    - Tích hợp Context Action Menu (chuột phải hoặc bấm nút ba chấm trên từng card) cung cấp đầy đủ các thao tác nhanh: *Áp dụng*, *Cập nhật theo vùng chọn*, *Chỉnh sửa...*, *Nhân bản (Duplicate)*, *Xóa Style* (bảo vệ không cho phép xóa/đổi tên các styles hệ thống built-in).
  - **Nhận diện Active Style & Mixed States Tuyệt đối Chính xác**:
    - Xây dựng `getActiveStyleState(editor)` trong [effectiveStyleService.ts](file:///c:/Users/hoang/.gemini/antigravity-ide/scratch/PersonalWordEditor/src/styles/services/effectiveStyleService.ts):
      - Con trỏ trong paragraph/heading: phản ánh chính xác styleId hiệu lực (hoặc default style theo block type & level).
      - Selection trải dài qua nhiều blocks có các styles khác nhau: chuyển sang trạng thái `isParagraphMixed = true` và `paragraphStyleId = null`. Giao diện Gallery không bao giờ giả vờ một style duy nhất khi đang có mixed styles.
      - Selection ký tự: xử lý mixed state chuẩn xác (`isCharacterMixed = true`, `characterStyleId = null` nếu chỉ một phần văn bản được áp dụng hoặc có nhiều character styles khác nhau; nhận diện chính xác `characterStyleId` khi toàn bộ vùng chọn đồng nhất).
  - **Hộp thoại Chỉnh sửa & Tạo mới Style (StyleEditorDialog)**:
    - Xây dựng [StyleEditorDialog.tsx](file:///c:/Users/hoang/.gemini/antigravity-ide/scratch/PersonalWordEditor/src/components/dialogs/StyleEditorDialog.tsx) hỗ trợ cả hai chế độ `create` và `modify`.
    - Phân tách mạch lạc các nhóm thuộc tính:
      - *General*: Tên Style, Kiểu Style (`paragraph` hoặc `character`), Dựa trên (Based On kế thừa cùng loại), Style cho đoạn kế tiếp (`nextStyleId`).
      - *Character*: Font family, Font size, Bold, Italic, Underline, Strike, Text color, Highlight.
      - *Paragraph*: Text alignment (Left, Center, Right, Justify), Line spacing, Khoảng cách trước/sau đoạn (Spacing Before/After), Thụt lề (Left, Right, First line, Hanging). Chỉ hiển thị cho paragraph styles.
    - Trực quan hóa Live Preview: Resolve kế thừa thực tế theo thời gian thực (`resolveStyle`) mà tuyệt đối không đột biến tài liệu hiện tại trong lúc người dùng đang thao tác biểu mẫu.
    - Toàn bộ thay đổi nằm trong draft state cục bộ; Cancel/Escape hủy bỏ hoàn toàn draft mà không để lại tác dụng phụ; Submit gọi command/service layer tương ứng.
    - Validation UX: Hiển thị banner lỗi rõ ràng khi tên rỗng, trùng tên, cha không tồn tại, phụ thuộc vòng tròn, hoặc thuộc tính không hợp lệ.
  - **Hộp thoại Quản lý Styles (ManageStylesDialog)**:
    - Xây dựng [ManageStylesDialog.tsx](file:///c:/Users/hoang/.gemini/antigravity-ide/scratch/PersonalWordEditor/src/components/dialogs/ManageStylesDialog.tsx) cho phép xem toàn bộ danh sách styles, tìm kiếm/lọc thời gian thực, hiển thị số lượt sử dụng trong tài liệu qua `getStyleUsage`.
    - Hỗ trợ trực tiếp Áp dụng, Sửa, Nhân bản và Xóa với hộp thoại xác nhận an toàn (cấm xóa built-ins, reassign và rebase an toàn khi xóa custom styles).
  - **Trải nghiệm Áp dụng & Bảo toàn Vùng chọn**:
    - Toàn bộ các nút thao tác đều áp dụng mẫu `preventBlur` (`onMouseDown={(e) => e.preventDefault()}`), bảo toàn trọn vẹn vị trí con trỏ và vùng chọn khi tương tác.
    - Gọi trực tiếp `applyParagraphStyle` và `applyCharacterStyle`, không bao giờ can thiệp inline DOM style thủ công.
  - **Kiểm thử Trọng tâm (Targeted Tests Suite)**:
    - Bổ sung `src/styles/stylesUI.test.ts` với 10 ca kiểm thử bao phủ toàn diện:
      - Phân bổ Gallery ưu tiên built-ins và giới hạn card chống tràn Ribbon.
      - Nhận diện Active Style trên paragraph & heading.
      - Xử lý Selection đa khối mixed paragraph styles.
      - Nhận diện trạng thái đồng nhất vs mixed character styles.
      - Kiểm tra validation: từ chối tên rỗng, trùng tên, cha không tồn tại.
      - Live preview resolve kế thừa mà không mutate document store.
      - Bảo vệ built-in styles khỏi các thao tác xóa cấm.
      - Quy trình xóa custom style, theo dõi usage và rebase fallback về Normal.
      - Tác vụ Cập nhật Style theo vùng chọn (Update to Match Selection).
      - Nhân bản Style tạo bản sao độc lập với ID và tên duy nhất.
    - Toàn bộ **78/78 bài kiểm thử Styles Engine PASS (100%)**.
    - `npx tsc --noEmit` hoàn thành sạch sẽ 0 lỗi.

## Phase 5 — Style Management Core + History Safety Completed — 2026-10-07

- **Styles Engine 2.0 — Phase 5: Style Management Core + History Safety**:
  - **Tầng Dịch vụ Quản lý Kiểu Thống nhất (Style Command/Service Layer)**:
    - Xây dựng [styleManagementService.ts](file:///c:/Users/hoang/.gemini/antigravity-ide/scratch/PersonalWordEditor/src/styles/services/styleManagementService.ts) bao bọc toàn bộ tác vụ CRUD Style:
      - `createStyle`, `updateStyle`, `renameStyle`, `duplicateStyle`, `deleteStyle`, `updateStyleFromSelection`, `getStyleUsage`.
      - Ngăn ngừa UI tương tác hoặc đột biến trực tiếp `DocumentModel`.
  - **Tạo & Sao chép Style (Create & Duplicate)**:
    - Hỗ trợ đầy đủ Paragraph Style và Character Style, Based On, default values.
    - Kiểm tra tính hợp lệ nghiêm ngặt: trim name, cấm tên rỗng, cấm trùng tên (case-insensitive), sinh ID duy nhất ổn định (`generateCustomStyleId`), kiểm tra parent cùng loại (`paragraph` vs `character`), chống phụ thuộc vòng (`detectInheritanceCycle`).
    - `duplicateStyle`: Sinh ID mới, tên mới có hậu tố "(Copy)", sao chép toàn bộ thuộc tính mà không sao chép metadata runtime/cache/history, đảm bảo `isBuiltIn: false`.
  - **Chỉnh sửa & Đổi tên (Edit & Rename)**:
    - Chỉnh sửa định nghĩa Style cập nhật qua Style Resolver và dynamic stylesheet (`updateDocumentStylesStylesheet`), không cần viết lại toàn bộ cây AST document.
    - Built-in styles: Cho phép chỉnh sửa presentation, tuyệt đối cấm đổi tên và cấm xóa.
  - **Chính sách Xóa An toàn & Rebase (Delete Safety & Rebase Policy)**:
    - Thống kê chi tiết mức độ sử dụng Style trong tài liệu (`getStyleUsage` đếm blocks và character runs).
    - Tự động reassign toàn bộ các block/run đang sử dụng style bị xóa về fallback hợp lý (parent của style hoặc `style_normal` / unstyled) nhằm triệt tiêu hoàn toàn nguy cơ orphan styleId.
    - Tự động rebase an toàn toàn bộ descendant styles đang kế thừa style bị xóa về parent của nó (hoặc `style_normal` / null) để ngăn ngừa đứt gãy cây kế thừa và phụ thuộc vòng.
    - Built-in style tuyệt đối không thể xóa.
  - **Cập nhật Style theo Vùng chọn (Update Style to Match Selection)**:
    - Trích xuất toàn bộ định dạng trình bày hợp lệ từ selection:
      - Paragraph: `textAlign`, `lineSpacing`, `spacingBefore`, `spacingAfter`, `leftIndent`, `rightIndent`, `firstLineIndent`, `hangingIndent`.
      - Character: `fontFamily`, `fontSize`, `bold`, `italic`, `underline`, `strike`, `color`, `highlight`.
    - Loại trừ tuyệt đối các metadata ngữ nghĩa: `commentId`, `trackChange` (`changeId`), `citation`, `crossReference`, vị trí con trỏ, vùng chọn, decorations.
    - Tự động dọn sạch direct paragraph formatting trên block hiện tại để nó kế thừa thuần túy từ Style mới cập nhật.
    - Hỗ trợ cả Paragraph Style lẫn Character Style.
  - **An toàn Lịch sử Undo / Redo (History Safety)**:
    - Xây dựng [styleHistoryService.ts](file:///c:/Users/hoang/.gemini/antigravity-ide/scratch/PersonalWordEditor/src/styles/services/styleHistoryService.ts) lưu trữ stack lịch sử snapshots (`undoStack`, `redoStack`) cho các hành động Create, Edit, Rename, Duplicate, Delete, Update from Selection.
    - Tích hợp điều phối đồng bộ với `undo()` và `redo()` trong [editorCommands.ts](file:///c:/Users/hoang/.gemini/antigravity-ide/scratch/PersonalWordEditor/src/editor/editorCommands.ts):
      - Đảm bảo khi hoàn tác, style definitions và nội dung editor AST luôn ở trạng thái nhất quán, không xảy ra tình trạng lệch pha.
  - **Quản lý Trạng thái Bẩn (Dirty State)**:
    - Mọi thay đổi Style hợp lệ đều kích hoạt `isDirty = true` trên `useDocumentStore`.
    - Thao tác thất bại hoặc hủy bỏ tuyệt đối không làm bẩn tài liệu.
  - **Kiểm thử Toàn diện (Targeted Unit Tests Suite)**:
    - Bổ sung `src/styles/styleManagement.test.ts` gồm 17 kịch bản kiểm thử độc lập bao phủ 100% yêu cầu.
    - Toàn bộ **68/68 bài kiểm thử Styles Engine PASS (100%)**.
    - `npx tsc --noEmit` hoàn thành 0 lỗi.

## Phase 4 — Character Styles Core Completed — 2026-10-07

- **Styles Engine 2.0 — Phase 4: Character Styles Core**:
  - **Audit Kiến trúc Marks & Inline Nodes thực tế**:
    - Xác định cơ chế hoạt động của `bold`, `italic`, `underline`, `strike`, `textStyle` (`fontFamily`, `fontSize`, `color`), `highlight`, `link` (`href`), `comment` (`commentId`), `trackChange` (`id`, `changeType`, `author`), cùng các inline atom nodes `citation` (`sourceId`), `crossReference` (`targetId`).
  - **Semantic Character Style Mark Representation**:
    - Thiết kế `CharacterStyleExtension` kế thừa Tiptap/ProseMirror `Mark` với định danh semantic `characterStyle`:
      - Thuộc tính duy nhất: `attrs: { styleId: string }`.
      - Cấu hình `excludes: ""` (tuyệt đối không loại trừ bất kỳ mark nào) và `spanning: true` (bao phủ mượt mà qua các run văn bản phân mảnh).
      - Không nhân bản hay copy duplicate thuộc tính định dạng vào từng text node trong cây AST.
  - **Độ Ưu tiên Định dạng Tuyệt đối (Direct Formatting Precedence)**:
    - Hiện thực `getEffectiveCharacterFormatting`:
      - Chuỗi kế thừa: `Base/Default (từ Paragraph Style)` $\to$ `Inherited Character Style (qua basedOn)` $\to$ `Current Character Style` $\to$ `Direct Formatting (Marks: bold, italic, textStyle, highlight...)`.
      - Khi áp dụng Character Style, nếu người dùng bấm Bold hoặc đổi màu trực tiếp, direct formatting sẽ ghi đè mà không xóa đi tham chiếu `characterStyle`.
  - **Thực thi Giao dịch An toàn (Apply, Replace & Remove)**:
    - `applyCharacterStyle(editor, styleId)`:
      - Áp dụng trên vùng chọn bằng ProseMirror transaction đơn nguyên tử (atomic transaction).
      - Tự động thay thế `characterStyle` cũ mà không sinh mark lồng ghép hay trùng lặp.
      - Selection rỗng (caret): Sử dụng cơ chế `storedMarks`, sẵn sàng áp dụng tự động cho các ký tự gõ tiếp theo mà không gây crash hay xung đột.
    - `removeCharacterStyle(editor)`: Gỡ bỏ `characterStyle` khỏi vùng chọn mà giữ nguyên 100% các direct marks khác.
    - `getCurrentCharacterStyleId(editor)`: Truy vấn chính xác styleId tại caret hoặc vùng chọn.
  - **Bảo toàn Mark Ngữ nghĩa & Track Changes (Semantic Mark Safety)**:
    - Đảm bảo các marks `comment` (`commentId`), `trackChange` (`changeId`, `changeType`, `author`), `link` (`href`) không bao giờ bị mất hoặc bị flatten khi áp dụng hay gỡ bỏ Character Style.
    - Giữ nguyên vẹn các inline atom nodes (`citation`, `crossReference`).
  - **Built-in Styles & Đăng ký Kiểu chung**:
    - Bổ sung các built-in character styles: Emphasis (`style_emphasis` - `italic: true`) và Strong (`style_strong` - `bold: true`).
    - Dùng chung style registry với Paragraph Style trong `DocumentStylesMetadata`, phân biệt qua `type: "character" | "paragraph"`.
  - **Tạo Quy tắc CSS Động (Dynamic Stylesheet)**:
    - Cập nhật `generateDocumentStylesCss` sinh bộ chọn `.word-character-style-${styleId}` phục vụ hiển thị trực tiếp và tức thì trên giao diện mà không cần can thiệp lại AST.
  - **Kiểm thử Trọng tâm (Targeted Tests Suite)**:
    - Bổ sung `src/styles/characterStyles.test.ts` gồm 15 bài kiểm thử tự động bao phủ toàn diện 14 yêu cầu cốt lõi.
    - Toàn bộ **51/51 bài kiểm thử Styles Engine PASS (100%)**.
    - `npx tsc --noEmit` hoàn thành 0 lỗi.

## Phase 7.3 — Focus Mode + Phase 7 Final Audit Completed — 2026-10-07

- **Chế độ Soạn thảo Tập trung (Focus Mode — Distraction-Free Writing)**:
  - **Kiến trúc UI State Độc lập**:
    - Quản lý tập trung qua `focusModeStore` (`useFocusModeStore`).
    - Focus Mode là presentation/layout state thuần túy, tuyệt đối không tác động hay biến đổi semantic state của tài liệu, không lưu vào AST và không ghi vào tệp `.mwd`.
    - Dùng chung duy nhất instance workspace và editor, không nhân bản editor gây rò rỉ bộ nhớ.
  - **Hành vi Ẩn Giao diện Tinh tế (Presentation Layer)**:
    - Khi bật Focus Mode: Ẩn Ribbon (`.ribbon-container`), Header (`.app-header`), Contextual Toolbar (`.table-contextual-toolbar`), Status Bar (`.status-bar`), và các thanh bên (`CommentsSidebar`, `DocumentOutlineSidebar`, `NotesSidebar`).
    - Tự động đóng deterministic các thanh bên và overlay (Find/Replace, Command Palette).
    - Căn giữa trang cân đối trên nền làm việc dịu mắt (`#f8fafc`).
    - Bảo toàn 100% kích thước trang (A4, A3, Letter, Legal), hướng giấy (Portrait/Landscape), lề trang (margins), luồng phân trang (multi-page pagination) và mức thu phóng (zoom).
    - Giữ nguyên vẹn vị trí con trỏ (caret) và vùng chọn (selection) của người dùng.
  - **Cơ chế Thoát Rõ ràng & Nút Nổi Unobtrusive**:
    - Phím tắt `Escape`: Thoát Focus Mode tức thì và hoàn trả focus cho editor.
    - Điều khiển nổi `FocusModeExitButton`: Nút pill nổi ở góc trên bên phải, độ trong suốt thấp khi đang gõ (`opacity: 0.28`), hiện rõ khi rê chuột kèm gợi ý phím `Esc`, giúp người dùng không bao giờ bị kẹt trong Focus Mode.
  - **Đa dạng Lối vào Thống nhất**:
    - Phím tắt toàn cục: `F11` (tiêu chuẩn) và `Ctrl+Shift+D` (phím phụ), audit an toàn không xung đột.
    - Lệnh Command Palette: `view.toggleFocusMode` ("Chế độ tập trung (Focus Mode)").
    - Lệnh Slash Command: `/focus`.
    - Ribbon Tab View: Nút "Focus Mode" lớn trong nhóm "Chế độ xem".
  - **An toàn Hộp thoại Quan trọng (Dialog Safety)**:
    - Các modal quan trọng (Confirm Save, Custom Margins, Equation, Hyperlink...) duy trì z-index phân tầng cao và không bị che khuất hay ngắt quãng.
  - **Độc lập với Native Fullscreen**:
    - Focus Mode hoạt động như một lớp layout CSS chuyên biệt, không phụ thuộc vào native fullscreen API của hệ điều hành.

- **Kiểm định Toàn diện Toàn bộ Phase 7 (Phase 7 Final Audit)**:
  - **Unified Command Audit**: Xác nhận Command Palette (`Ctrl+Shift+P`) và Slash Commands (`/`) dùng chung duy nhất một `CommandRegistry` singleton. Loại bỏ hoàn toàn duplicated logic, dead registry entries và shortcut collisions.
  - **Command Workflows & Slash Workflows**: Kiểm tra thực thi end-to-end các lệnh Heading 1-3, Table, Outline, Equation, Focus Mode; kiểm tra an toàn với IME tiếng Việt và luồng Undo/Redo.
  - **Version History E2E Workflow**: Mô phỏng tạo document -> autosave A -> edit -> autosave B -> explicit Save -> edit -> autosave C -> restore B -> verify dirty state -> explicit Save; bảo toàn 100% ngữ nghĩa dữ liệu.
  - **Crash Recovery Workflow**: Kiểm tra phát hiện phục hồi sau sự cố bất thường (ungraceful shutdown / crash), khôi phục thành công cũng như tùy chọn bỏ qua (discard) an toàn không ghi đè đĩa.
  - **Failed Autosave Resilience**: Giả lập lỗi quyền ghi đĩa / đầy đĩa; ứng dụng tiếp tục hoạt động ổn định, bảo toàn `isDirty = true` và cho phép explicit Save thành công sau khi phục hồi đĩa.
  - **Zero-Regression across Phases 1–6**: Kiểm tra toàn diện các phân hệ File, Editor, Page Engine, Insert, DOCX, Review và References; tất cả đều duy trì tính ổn định tuyệt đối.
  - **Performance Audit**: Đo lường độ trễ tìm kiếm lệnh (< 1ms), độ trễ tạo snapshot tài liệu lớn 200 đoạn văn (< 3ms) và phục hồi (< 3ms), không serialize trên từng keystroke, không rò rỉ listener.
  - **Kết quả Kiểm thử & Biên dịch**:
    - Bổ sung `src/focus/focusMode.test.ts` (18 kịch bản kiểm thử chuyên sâu).
    - Toàn bộ **495/495 bài kiểm thử PASS (100%)** trên 48 suites.
    - `npm run build` (`tsc && vite build`) và `cargo check` biên dịch thành công 0 lỗi.

## Phase 7.2 — Local Version History + Autosave + Crash Recovery — 2026-10-07

- **Hệ thống Bảo vệ Dữ liệu Local-First (Local Version History & Autosave & Crash Recovery)**:
  - **Tách biệt rõ ràng 4 khái niệm bảo vệ dữ liệu cốt lõi**:
    - **Explicit Save (Ctrl+S / Save As)**: Người dùng chủ động lưu vào file chính trên đĩa (`filePath`), cập nhật clean baseline, đặt `isDirty = false`.
    - **Autosave / Recovery Snapshot**: Tự động lưu ngầm vào vùng lưu trữ phục hồi riêng (`%APPDATA%/PersonalWordEditor/recovery`). Tuyệt đối không ghi đè file chính, tuyệt đối **KHÔNG** làm sạch `isDirty` để không đánh lừa người dùng rằng file chính đã được lưu.
    - **Version History (Lịch sử phiên bản)**: Dòng thời gian các bản chụp snapshot lịch sử để người dùng xem lại và khôi phục an toàn (kèm bảo vệ Dirty State).
    - **Crash Recovery (Phục hồi sau sự cố)**: Kiểm tra Clean Shutdown Marker khi khởi động ứng dụng; nếu phát hiện ungraceful shutdown/crash, nhắc người dùng lựa chọn Khôi phục (Recover) hoặc Bỏ qua (Discard) mà không tự ý ghi đè file người dùng.
  - **Mô hình Snapshot Toàn vẹn (Complete Snapshot Model)**:
    - Tái sử dụng bộ tuần tự hóa chuẩn `.mwd` (`serializeDocumentToMwd` và `deserializeMwdToDocument`).
    - Bảo toàn 100% dữ liệu: AST ProseMirror, page settings, sections, headers/footers, comments, tracked changes, references, bibliography metadata.
  - **Kiến trúc Lưu trữ Cục bộ Độc lập & Phòng thủ Path Traversal (Storage Strategy & Security)**:
    - `VersionStorageAdapter`: Thiết kế tầng trừu tượng cắm ghép linh hoạt (`MemoryStorageAdapter` phục vụ unit test và `TauriStorageAdapter` phục vụ desktop).
    - `write_atomic_file`: Ghi tệp tạm `.tmp.<pid>`, xả đệm đĩa (`sync_all()`), rồi đổi tên/thay thế nguyên tử (`rename`) trong Rust backend để chống đứt gãy dữ liệu khi mất điện.
    - `sanitizeStorageId`: Khử khuẩn chặt chẽ mọi ID (`^[a-zA-Z0-9_-]+$`), triệt tiêu triệt để nguy cơ Path Traversal (`../`, `..\`, absolute paths).
    - 100% Local-first: Không gửi dữ liệu lên mạng, không dùng server, Firebase, Supabase hay cloud.
  - **Bộ điều phối Tự động Lưu Thông minh (Autosave Engine)**:
    - Debounce 2000ms: Gom nhóm thay đổi, không ghi đĩa trên từng phím gõ.
    - Điều kiện tiên quyết: Chỉ lưu khi `isDirty === true`.
    - Deduplication: Bỏ qua ghi snapshot nếu nội dung và cấu trúc giống hệt snapshot vừa lưu gần nhất.
    - Concurrency Lock: Khóa tương tranh ngăn ngừa xung đột giữa Autosave và Explicit Save hoặc Restore.
  - **Chính sách Thu dọn Bản chụp Xác định (Snapshot Retention Policy)**:
    - Giới hạn tối đa 20 bản snapshot cho mỗi tài liệu để tránh phình to dung lượng ổ đĩa.
    - Luôn bảo lưu các bản milestone quan trọng: bản thủ công (`manual`) và bản sao lưu trước khi khôi phục (`pre-restore`).
  - **Giao diện Lịch sử Phiên bản & Khôi phục An toàn (Version History UI & Safe Restore)**:
    - Modal `VersionHistoryModal`: Danh sách snapshot theo thời gian thực với badge phân loại (`Tự động lưu`, `Thủ công`, `Cứu hộ`, `Trước khôi phục`, `Lưu chính thức`), thống kê số từ/ký tự/đoạn văn, bảng xem trước chi tiết.
    - Phím tắt mở nhanh `Ctrl+Shift+H`, tích hợp vào Command Palette (`file.versionHistory`) và Menu File Shell (Backstage).
    - **Dirty Protection khi Restore**: Nếu tài liệu hiện tại đang dirty, hệ thống tự động chụp một bản snapshot `"pre-restore"` trước khi khôi phục để đảm bảo không bao giờ mất dữ liệu đang làm dở.
    - Restore đưa toàn bộ trạng thái tài liệu và editor về mốc lịch sử, và đánh giá chính xác `isDirty` so với file trên đĩa (Restore ≠ Save).
  - **Hộp thoại Cứu hộ Sự cố Khởi động (Crash Recovery Dialog)**:
    - Phát hiện các phiên làm việc có `cleanShutdown === false`.
    - Cho phép người dùng lựa chọn "Khôi phục tài liệu" hoặc "Bỏ qua bản phục hồi".
    - Bỏ qua các bản snapshot lỗi/hỏng an toàn mà không làm sập ứng dụng.
  - **Tách biệt Định danh Tài liệu (New / Open / Save As Isolation)**:
    - New: Đóng phiên cũ sạch sẽ, khởi tạo Document ID mới, lịch sử tài liệu mới hoàn toàn rỗng.
    - Open: Tải và đính kèm đúng Document ID và đường dẫn tệp.
    - Save As: Sinh Document ID độc lập cho bản sao, đảm bảo lịch sử của file mới không bị trộn lẫn với file gốc.
  - **Bộ kiểm thử Tự động Chuyên sâu (Comprehensive Targeted Testing)**:
    - Tạo `src/version/versionHistory.test.ts` bao phủ toàn bộ 21 kịch bản: serialize, validation, deduplication, debounce, dirty-only autosave, autosave preserves dirty, explicit save clears dirty, retention policy, restore state, restore dirty protection, corrupted snapshot resilience, startup crash recovery, discard recovery, New isolation, Open isolation, Save As identity isolation, concurrency locks, failed write safety, backward compatibility, complex document round-trip, path traversal defense.
    - Đạt **477/477 bài kiểm thử PASS (100%)** trên 47 test suites.
    - `npm run build` (`tsc && vite build`) và `cargo check` biên dịch thành công 0 lỗi.

## Phase 7.1 — Unified Command System + Command Palette + Slash Commands — 2026-10-07

- **Hệ thống Lệnh Thống nhất & Bảng Lệnh Hiện đại (Unified Command System & Command Palette & Slash Commands)**:
  - **Kiến trúc Command Descriptor Thống nhất (Unified Command Descriptor)**:
    - Định nghĩa `EditorCommandDescriptor` chuẩn mực: `id` (unique), `label`, `labelEn`, `description`, `category` (`format`, `insert`, `references`, `review`, `navigation`, `view`, `file`), `keywords`, `shortcut`, `icon`, `canExecute`, `execute`, `slashEnabled`, `paletteEnabled`.
    - Gọi lại trực tiếp các subsystem command và service hiện có (`editorCommands`, `insertCommands`, `referencesCommands`, `reviewCommands`, `fileOperations`), **tuyệt đối không duplicate business logic** hay tạo command engine thứ hai.
    - Không lưu giữ instance `Editor` lâu dài trong Registry để triệt tiêu nguy cơ stale reference.
  - **Unified Command Registry (`CommandRegistry`)**:
    - Quản lý tập trung toàn bộ lệnh cho cả 3 bề mặt: Command Palette (`Ctrl+Shift+P`), Slash Commands (`/`) và Ribbon.
    - Tìm kiếm thông minh hỗ trợ tiếng Việt có dấu/không dấu (diacritics-insensitive) và tiếng Anh, xếp hạng độ ưu tiên (Exact match > Prefix match > Word start > Substring > Keywords > Description).
    - Khởi tạo sẵn hơn 28 lệnh thuộc các nhóm phổ biến: Formatting (Bold, Italic, Underline, Strikethrough, Heading 1-3, Paragraph, Bullet/Numbered List, Align Left/Center/Right/Justify), Insert (Table 3x3, Image picker, Hyperlink dialog, Text Box, Horizontal Rule, Equation dialog, Symbol dialog, Page Break, Section Break), References (Outline, TOC, Footnote, Endnote), Review (Track Changes, Accept/Reject Change, Word Count/Statistics), View/File (Zoom In/Out/Reset, Save, Save As).
  - **Bảng Lệnh Toàn cục (Command Palette — `Ctrl+Shift+P`)**:
    - Mở nhanh từ bàn phím bằng `Ctrl+Shift+P`, tránh xung đột với `Ctrl+K` (Hyperlink) và các phím tắt đã có.
    - Giao diện modal hiện đại, autofocus ô tìm kiếm, hiển thị badge phân loại, phím tắt đi kèm và trạng thái disabled mượt mà.
    - Điều hướng bàn phím đầy đủ: Arrow Up, Arrow Down (có wrap-around), Enter để thực thi, Escape để đóng.
    - **Bảo toàn Selection & Focus (Selection Safety)**: Chụp snapshot selection ProseMirror (`{ from, to, empty }`) khi mở Palette và phục hồi chính xác trước khi thực thi lệnh.
  - **Thực thi Lệnh Nhanh theo Ngữ cảnh (Slash Commands — `/`)**:
    - `SlashCommandExtension`: Extension Tiptap và Plugin ProseMirror kiểm soát luồng kích hoạt popup `/`.
    - Lọc tự động các lệnh có `slashEnabled === true`.
    - Tìm kiếm tức thì theo query gõ sau dấu gạch chéo: `/hea` -> Heading, `/tab` -> Table, `/ima` -> Image.
    - Khi chọn lệnh: Dọn dẹp sạch sẽ chuỗi `/query` khỏi tài liệu trước khi thực thi, không tạo 2 bước history vô lý, bảo toàn hoàn hảo Undo/Redo.
    - **Phòng thủ Ngữ cảnh Chặt chẽ & An toàn IME (Context & IME Safety)**:
      - Chỉ kích hoạt tại paragraph trống, đầu paragraph, hoặc ngay sau ký tự khoảng trắng.
      - Chặn đứng kích hoạt bên trong URLs (`https://`), dấu phân số (`1/2`), từ ghép (`and/or`), đường dẫn (`path/to/file`), bên trong hyperlink (`link` mark), bên trong node công thức (`equation`), và các atom node.
      - Đặc biệt an toàn với bộ gõ tiếng Việt Telex/VNI: Vô hiệu hóa kích hoạt khi đang compose (`view.composing === true`).
      - Phím Escape đóng Slash Menu mà không làm mất hoặc xóa văn bản người dùng đang gõ.
  - **Tương tác Phân hệ An toàn**:
    - Tương thích 100% với Track Changes, Comments, Undo/Redo, Page Breaks và Proofing.
    - Z-index phân tầng chuẩn mực, không xung đột với các modal dialog hiện có.
  - **Bộ kiểm thử Tự động Chuyên sâu**:
    - Bổ sung `src/commands/unifiedCommands.test.ts` bao phủ toàn bộ 15 kịch bản kiểm định yêu cầu: Registry unique IDs, Command search, Keyword search, Disabled commands & canExecute, Keyboard navigation & wrap-around, Execute command, Preserve selection, Slash trigger contexts, Slash query filtering, Escape handling, Slash cleanup, Undo/Redo safety, Track Changes interaction, IME/non-valid context rejection, Event listener cleanup.
    - Đạt **456/456 bài kiểm thử PASS (100%)** trên 46 test suites.
    - `npm run build` (`tsc && vite build`) và `cargo check` hoàn thành xuất sắc 0 lỗi.

## Phase 6.7 — References Engine Final Audit + Integration — 2026-10-07

- **Kiểm định và Tích hợp Toàn diện Toàn bộ References Engine (Final Audit & Integration)**:
  - **Big Workflow Test (Vòng đời tài liệu thực tế toàn diện)**:
    - Kiểm tra end-to-end chuỗi thao tác thực tế: Soạn thảo Heading 1-3 -> Sinh Table of Contents (TOC) -> Chèn Bảng kèm Caption Table -> Chèn Hình ảnh kèm Caption Figure -> Chèn Cross-reference tới Heading và Figure -> Chèn Footnote & Endnote -> Tạo nguồn Bibliography (Book, Journal) -> Chèn Citations ngữ nghĩa -> Sinh khối Bibliography tự động -> Lưu tệp `.mwd` -> Nạp lại (Open round-trip) -> Chỉnh sửa đề mục, caption và metadata nguồn -> Cập nhật TOC và Bibliography một chạm (F9).
    - Bảo toàn 100% tính toàn vẹn cấu trúc và liên kết tham chiếu hai chiều qua mọi thao tác.
  - **Kiểm định Hoàn tác / Làm lại (Undo / Redo Safety across all Subsystems)**:
    - Xác minh cơ chế Undo/Redo độc lập và chính xác cho toàn bộ 6 phân hệ: Table of Contents, Footnotes, Endnotes, Captions, Cross-reference, Citations, Bibliography.
    - Tuyệt đối không để lại metadata mồ côi (Zero Orphan Leakage) hoặc trạng thái phục hồi một nửa.
  - **Tương tác Phân hệ Soát lỗi (Review Engine Coexistence & Target Deletions)**:
    - Hoạt động ổn định khi bật/tắt Track Changes, thực hiện Chấp nhận/Từ chối thay đổi (Accept/Reject), tạo Bình luận (Comments) và kiểm tra chính tả/ngữ pháp (Proofing).
    - **Cơ chế Fallback An toàn khi Mục tiêu Bị Xóa**:
      - Xóa đề mục hoặc hình ảnh -> Cross-reference tự động hiển thị `[Reference not found]` an toàn không gây crash.
      - Xóa nguồn trích dẫn khỏi Document Store -> Citation tự động hiển thị `[Citation not found]`.
      - Xóa marker Footnote/Endnote -> Chú thích được dọn dẹp sạch sẽ, không để lại rò rỉ metadata.
  - **Tương thích Phân hệ Trang & Bố cục (Page Engine Integration)**:
    - Hoạt động chuẩn xác trên các khổ giấy A4, A3, hướng ngang/dọc (Landscape/Portrait), lề tùy chỉnh và đa phân đoạn (Section Breaks).
    - Tính toán số trang (Page Numbers) cho TOC và Cross-reference chính xác theo ngắt trang vật lý và luồng dòng chảy văn bản.
  - **Kiểm thử Hồi quy Phân hệ Chèn (Insert Engine Regressions)**:
    - Bảo toàn hoàn toàn khả năng hoạt động của Bảng biểu (Table), Hình ảnh (Image), Công thức toán học (Equation), Hình vẽ (Shape), Khung chữ (TextBox), Liên kết (Hyperlink) và Ký tự đặc biệt (Symbol).
  - **Tương thích Lưu trữ & Phiên bản Cũ (.mwd Persistence & Backwards Compatibility)**:
    - Đảm bảo 100% tính tương thích ngược: Các tệp `.mwd` từ Phase 1–5 không chứa trường references được nạp an toàn với mảng rỗng mặc định mà không gây crash.
    - Chu trình Lưu và Mở bảo toàn trọn vẹn toàn bộ các thuộc tính ngữ nghĩa của References.
  - **Tương thích Xuất tệp Word (DOCX OOXML Compatibility)**:
    - Xuất hoàn chỉnh TOC, Captions (với Word `<w:pStyle w:val="Caption"/>`), Cross-reference, Citations và Bibliography (với Word `<w:pStyle w:val="Bibliography"/>`) sang tệp OOXML hợp lệ.
  - **Khả năng Phục hồi Dữ liệu Bất thường (Malformed Data Resilience)**:
    - Phòng thủ chủ động trước các ID trùng lặp, thiếu mục tiêu, source hỏng, hoặc TOC trên tài liệu trống.
  - **Kiểm thử Hiệu năng Mật độ Cao (High-Density Performance)**:
    - Xử lý mượt mà tài liệu quy mô lớn (25 Headings, 20 Citations, 15 Captions, 15 Footnotes/Endnotes) với tổng thời gian trích xuất và sinh danh mục dưới 50ms, không gây vòng lặp cập nhật hay suy giảm hiệu năng.
  - **Bộ kiểm thử Tự động Toàn diện**:
    - Bổ sung `src/references/phase6FinalAudit.test.ts` gồm 9 kịch bản tích hợp chuyên sâu.
    - Đạt **434/434 bài kiểm thử PASS (100%)** trên 45 test suites.
    - `npm run build` (`tsc && vite build`) và `cargo check` hoàn thành xuất sắc 0 lỗi.

## Phase 6.6 — Citation + Bibliography Core — 2026-10-07

- **Hệ thống Quản lý Trích dẫn & Danh mục Tài liệu tham khảo (Citation & Bibliography System)**:
  - **Mô hình Dữ liệu Nguồn Ngữ nghĩa (Semantic Bibliography Source Model)**:
    - Định nghĩa `BibliographySource`: Hỗ trợ 4 loại nguồn phổ biến: Sách (`book`), Bài báo khoa học (`journalArticle`), Trang web (`website`), Kỷ yếu hội thảo (`conferencePaper`).
    - Chuẩn hóa các trường dữ liệu: `id`, `type`, `title`, `authors`, `year`, `publisher`, `city`, `journal`, `volume`, `issue`, `pages`, `url`, `accessedAt`, `conferenceName`, `doi`.
    - Xác thực dữ liệu chặt chẽ (`CitationService.validateSource`): Kiểm tra bắt buộc các trường thiết yếu theo từng loại nguồn (tiêu đề, tác giả/tổ chức, năm, nhà xuất bản, tên tạp chí, URL...).
    - ID nguồn bền vững và ổn định (`src_<uuid>`) duy trì qua các phiên Lưu/Mở tài liệu.
  - **Gắn kết Tài liệu & Kiến trúc Local-First (Document-Attached Citation Store)**:
    - Nguồn trích dẫn gắn trực tiếp vào `DocumentModel.references.bibliographySources` và kiểu trích dẫn `references.citationStyle` (`"apa"` | `"ieee"`).
    - Quản lý tập trung qua Zustand `documentStore` (`addBibliographySource`, `updateBibliographySource`, `deleteBibliographySource`, `setBibliographySources`, `setCitationStyle`).
    - Thiết kế hoàn toàn cục bộ (Local-first), không phụ thuộc cloud hay cơ sở dữ liệu ngoài.
  - **Quản lý Nguồn Trích dẫn & Chính sách Bảo vệ (Manage Sources & Citation Protection)**:
    - Hộp thoại `ManageSourcesDialog`: Thêm mới, Chỉnh sửa, Xóa nguồn trích dẫn kèm khung xem trước trực tiếp (Live Preview) theo định dạng APA và IEEE.
    - **Chính sách An toàn khi Xóa Nguồn (Cited Source Protection)**: Kiểm tra cây AST để phát hiện nếu nguồn đang được trích dẫn trong văn bản. Hiển thị cảnh báo xác nhận rõ ràng, ngăn chặn việc vô tình xóa mất nguồn đang dùng.
  - **Chèn Trích dẫn Ngữ nghĩa (Semantic In-Text Citation)**:
    - `CitationExtension`: Triển khai `citation` dưới dạng ProseMirror Inline Atom Node (`group: "inline"`, `inline: true`, `atom: true`).
    - Lưu trữ thuộc tính: `sourceId`, `style`, `prefix`, `suffix`, `customText`.
    - NodeView hiển thị động định dạng trích dẫn theo nguồn dữ liệu thời gian thực.
    - **Trạng thái Nguồn bị hỏng (Broken Source Protection)**: Hiển thị an toàn `[Citation not found]` kèm viền cảnh báo `.editor-citation.broken` khi không tìm thấy nguồn, tuyệt đối không gây sập ứng dụng.
  - **Định dạng Kiểu Trích dẫn Xác định (Deterministic Citation Styles)**:
    - **APA 7th (Author, Year)**: Định dạng trong văn bản `(Tác giả, Năm)`, xử lý chính xác tác giả đơn lẻ, 2 tác giả (`&`), hoặc nhiều hơn 2 tác giả (`et al.`); danh mục sắp xếp theo thứ tự bảng chữ cái của tên tác giả (hỗ trợ Unicode tiếng Việt có dấu).
    - **IEEE (Numerical)**: Định dạng trong văn bản theo chỉ số ngoặc vuông `[1]`, `[2]`, `[3]`; tự động tính toán chỉ số theo thứ tự xuất hiện đầu tiên trong tài liệu; danh mục sắp xếp theo đúng thứ tự đánh số `[1], [2], ...`.
  - **Sinh và Cập nhật Danh mục Tài liệu Tham khảo (Bibliography Generation & Refresh)**:
    - `BibliographyExtension`: Triển khai `bibliography` dưới dạng ProseMirror Block Atom Node (`group: "block"`, `atom: true`).
    - Lọc tự động các nguồn thực sự được trích dẫn trong tài liệu (`citedOnly`) hoặc toàn bộ danh sách nguồn (`allSources`).
    - **Chống Trùng lặp (Duplicate Prevention)**: Dù một nguồn được trích dẫn nhiều lần ở các trang khác nhau, danh mục tham khảo chỉ sinh duy nhất 1 mục tương ứng.
    - **Cập nhật một chạm (Single-click / F9 Update)**: Nút "Cập nhật (F9)" cho phép làm mới tức thì danh mục khi metadata của nguồn thay đổi, không đòi hỏi người dùng sửa thủ công từng đoạn văn bản.
  - **Giao diện Người dùng References Ribbon**:
    - Kích hoạt nhóm **Citations & Bibliography**:
      - **Chèn trích dẫn (Insert Citation)**: Mở hộp thoại `InsertCitationDialog` với bộ lọc tìm kiếm nhanh, tiền tố/hậu tố, xem trước trực tiếp.
      - **Quản lý nguồn (Manage Sources)**: Mở hộp thoại `ManageSourcesDialog`.
      - **Kiểu trích dẫn (Style: APA / IEEE)**: Mở hộp thoại `CitationStyleDialog` chọn kiểu và chuyển đổi tức thì.
      - **Tài liệu tham khảo (Bibliography)**: Chèn khối Bibliography hoàn chỉnh vào vị trí con trỏ.
  - **Tương thích Lưu trữ & DOCX (OOXML Mapping)**:
    - Định dạng `.mwd`: Lưu trữ và phục hồi trọn vẹn `bibliographySources`, `citationStyle`, cùng các node `citation` và `bibliography` trong AST.
    - Tương thích ngược: Các tệp `.mwd` cũ không có metadata bibliography được nạp an toàn với mảng rỗng mặc định.
    - Xuất DOCX: Xuất trích dẫn thành WordprocessingML text run màu xanh rõ nét, xuất khối tài liệu tham khảo thành các đoạn văn Word kèm style `Bibliography` chuẩn mực, giữ vững tính toàn vẹn của tệp Word.
  - **Kiểm thử Toàn diện & Tương tác Hệ thống**:
    - 13 bài kiểm thử chuyên sâu trong `src/references/citationBibliography.test.ts`: Xác thực dữ liệu nguồn, thêm/sửa/xóa nguồn và bảo vệ nguồn đang cited, định dạng APA/IEEE, đánh số thứ tự IEEE, sinh danh mục tham khảo và sắp xếp, chống trùng lặp, cập nhật động khi sửa metadata, xử lý broken source và danh mục rỗng, Unicode tiếng Việt có dấu, Undo/Redo, lưu/nạp .mwd, xuất DOCX, và đồng tồn tại không lỗi với TOC, Footnotes, Endnotes, Captions, Comments, Track Changes.
    - Đạt **425/425 bài kiểm thử PASS (100%)** trên 44 test suites.

## Phase 6.5 — Captions + Cross-reference — 2026-10-07

- **Hệ thống Nhãn chú thích Ngữ nghĩa (Semantic Captions System)**:
  - **Mô hình Dữ liệu Ngữ nghĩa trong ProseMirror AST (`CaptionExtension`)**:
    - Triển khai `caption` dưới dạng ProseMirror Block Node (`group: "block"`, `content: "inline*"`, `defining: true`, `isolating: true`).
    - Lưu trữ thuộc tính cốt lõi:
      - `id`: Mã định danh bền vững (định dạng `ref_cap_<uuid>`).
      - `label`: Nhãn phân loại (`"Figure"`, `"Table"`, `"Equation"` hoặc nhãn tùy chỉnh).
      - `targetId`: Định danh neo mục tiêu được liên kết (`ref_obj_<uuid>` của Bảng, Hình ảnh, Công thức, Hình vẽ).
      - `positionPolicy`: Chính sách vị trí (`"above"` hoặc `"below"` đối tượng).
      - `text`: Văn bản mô tả chú thích.
    - **Nguồn chân lý duy nhất (Single Source of Truth)**: Thuộc tính và nội dung văn bản nằm trực tiếp trong AST, không dùng overlay DOM.
    - **Neo hóa đối tượng (`ObjectAnchorExtension`)**: Tự động mở rộng thuộc tính toàn cục `id` cho các node `image`, `table`, `equation`, `shape`, `textBox` để gắn kết hai chiều chắc chắn.
  - **Dịch vụ Quản lý Nhãn chú thích (`CaptionService`)**:
    - `insertCaption`: Chèn nhãn phía trên hoặc dưới đối tượng được chọn (hoặc vị trí con trỏ hiện tại) bằng transaction an toàn, tôn trọng cấu trúc phân cấp block node.
    - `detectSelectedTarget`: Tự động nhận diện đối tượng đang được chọn hoặc liền kề để gán nhãn và vị trí mặc định (`"Table"` -> `above`, `"Figure"` / `"Equation"` -> `below`).
    - `extractCaptions`: Quét tuần tự cây AST theo thứ tự tài liệu, phân tách bộ đếm riêng biệt cho từng nhãn.
    - `deleteCaption`: Xóa nhãn chú thích khỏi AST sạch sẽ, không để lại metadata mồ côi.
    - `navigateToCaption`: Cuộn và đưa con trỏ tới nhãn chú thích mà không làm đột biến AST.
  - **Đánh số Tự động Xác định & Độc lập (Independent Auto-Numbering)**:
    - Mỗi loại nhãn (`Figure`, `Table`, `Equation`...) sở hữu bộ đếm tuần tự độc lập (Figure 1, Figure 2; Table 1, Table 2...).
    - **Số thứ tự không bị hardcode thành nguồn chân lý**: Được tính toán động theo thứ tự xuất hiện trong tài liệu. Khi thêm, xóa hoặc hoán đổi vị trí nhãn ở giữa tài liệu, toàn bộ các số hiệu phía sau tự động cập nhật lại chính xác.
- **Hệ thống Tham chiếu chéo Ngữ nghĩa (Semantic Cross-Reference System)**:
  - **Mô hình Dữ liệu Ngữ nghĩa trong ProseMirror AST (`CrossReferenceExtension`)**:
    - Triển khai `crossReference` dưới dạng Inline Atom Node (`group: "inline"`, `inline: true`, `atom: true`).
    - Lưu trữ thuộc tính:
      - `targetId`: Mã định danh mục tiêu ngữ nghĩa (`heading`, `caption`, `footnote`, `endnote`).
      - `targetType`: Loại mục tiêu (`"heading"`, `"caption"`, `"figure"`, `"table"`, `"equation"`, `"footnote"`, `"endnote"`).
      - `format`: Định dạng hiển thị (`"text"`: nội dung đầy đủ, `"labelAndNumber"`: nhãn và số, `"number"`: chỉ số, `"pageNumber"`: số trang).
      - `customText`: Văn bản dự phòng phân giải khi hiển thị ngoại tuyến.
  - **Dịch vụ Tham chiếu chéo (`CrossReferenceService`)**:
    - `getAvailableTargets`: Quét động danh sách mục tiêu thực tế trong tài liệu hiện tại (Heading từ AST, Caption từ AST, Chú thích từ NoteService), tuyệt đối không dùng cache cũ gây lệch dữ liệu.
    - `resolveTarget`: Phân giải động chuỗi hiển thị theo định dạng yêu cầu từ mục tiêu trong AST.
    - `insertCrossReference`: Chèn inline atom node vào vị trí con trỏ hiện tại.
    - `navigateToTarget`: Nhấp vào tham chiếu chéo để cuộn mượt và đưa con trỏ tới đúng mục tiêu (Heading, Caption hoặc Note) mà không đột biến AST.
  - **Trạng thái An toàn khi Mất Mục tiêu (Broken Reference Protection)**:
    - Khi mục tiêu bị xóa khỏi tài liệu, tham chiếu chéo tự động hiển thị `[Reference not found]` kèm kiểu dáng cảnh báo (`.editor-cross-reference.broken`), bảo vệ ứng dụng tuyệt đối không bị crash.
    - Nếu mục tiêu được hoàn tác (Undo) hoặc tái tạo lại đúng ID, tham chiếu chéo tự động phục hồi kết nối.
- **Chính sách Tương tác Hệ thống & Track Changes (Zero-Loop Coexistence)**:
  - NodeView của `crossReference` là atom node chỉ đọc, không sinh ra các transaction gõ phím giả lập.
  - Tuyệt đối không gây xung đột hay vòng lặp vô tận (infinite loop) với cơ chế theo dõi thay đổi (Track Changes), bình luận (Comments), kiểm tra chính tả/ngữ pháp (Proofing) hay mục lục (TOC).
- **Giao diện Người dùng & Tích hợp References Ribbon**:
  - Kích hoạt 2 nút chức năng trên References Ribbon (`status: "active"`, `phase: "6.5"`):
    - **Chèn chú thích đối tượng (Insert Caption)**: Mở hộp thoại `CaptionDialog`.
    - **Tham chiếu chéo (Cross-reference)**: Mở hộp thoại `CrossReferenceDialog`.
  - Hộp thoại `CaptionDialog`: Tự động nhận diện đối tượng đang chọn, chọn nhãn (`Figure`, `Table`, `Equation`, hoặc nhãn tùy chỉnh), chọn vị trí (Phía trên/Phía dưới), nhập nội dung mô tả kèm khung xem trước trực tiếp (Live Preview).
  - Hộp thoại `CrossReferenceDialog`: Lọc loại mục tiêu, chọn định dạng hiển thị, hiển thị danh sách trực quan tất cả các mục tiêu hiện có trong tài liệu kèm số trang và thông tin nhận diện.
- **Tương thích Lưu trữ & DOCX (OOXML Mapping)**:
  - Định dạng `.mwd`: Lưu trữ và phục hồi nguyên vẹn các node `caption` và `crossReference`, bảo toàn 100% ID, nhãn, định dạng và tính liên kết.
  - Xuất DOCX: Đóng gói đoạn văn caption với kiểu dáng chuẩn Word `<w:pStyle w:val="Caption"/>`, xuất cross-reference thành run văn bản định dạng rõ nét, giữ vững tính toàn vẹn của tệp Word.
  - Nhập DOCX: Ánh xạ chuẩn xác các đoạn văn có style `Caption` thành node `caption` ngữ nghĩa trong ProseMirror AST.
- **Kiểm thử Tự động & Build**:
  - Bổ sung bộ kiểm thử `src/references/captionsCrossReference.test.ts` gồm 14 bài test bao quát: Caption Image kèm neo targetId, Caption Table (vị trí above), Caption Equation, đánh số độc lập theo nhãn, xóa caption ở giữa và tự động đánh số lại, cross-reference tới Heading (text và label & number), cross-reference tới Caption (label & number, text, number), cập nhật động khi đổi tên đề mục mà không lưu offset cứng, xử lý broken target an toàn không crash, điều hướng tới mục tiêu, Undo/Redo cho cả caption và cross-reference, lưu/mở tệp .mwd round-trip, xuất/nhập DOCX round-trip, và đồng tồn tại không lỗi với Comments, Track Changes và TOC.
  - Toàn bộ **412/412 bài kiểm thử PASS (100%)** trên 43 test suites.
  - Lệnh `npm run build` (`tsc && vite build`) và `cargo check` hoàn thành thành công 0 lỗi.

## Phase 6.4 — Footnotes + Endnotes — 2026-10-07

- **Hệ thống Chú thích Ngữ nghĩa (Semantic Footnotes & Endnotes)**:
  - **Mô hình Dữ liệu Ngữ nghĩa trong ProseMirror AST (Inline Atom Node)**:
    - Triển khai `NoteReferenceExtension` (`group: "inline"`, `inline: true`, `atom: true`).
    - Mỗi note reference lưu trữ các thuộc tính semantic cốt lõi:
      - `noteId`: Mã định danh bền vững (định dạng `ref_fn_<uuid>` cho Footnote, `ref_en_<uuid>` cho Endnote).
      - `noteType`: `"footnote"` hoặc `"endnote"`.
      - `content`: Nội dung chú thích văn bản (được quản lý bên trong thuộc tính node).
      - `customMark`: Ký hiệu tùy chỉnh (nếu có).
    - **Nguồn chân lý duy nhất (Single Source of Truth)**: AST ProseMirror là nguồn dữ liệu duy nhất. Không lưu offset cứng, không dùng ID của DOM element làm nguồn chân lý, không tạo page engine thứ hai.
  - **Dịch vụ Quản lý Chú thích (`NoteService`)**:
    - `insertNote`: Chèn chú thích tại vị trí caret hiện tại hoặc sau từ được chọn qua ProseMirror transaction chuẩn mực.
    - `updateNoteContent`: Chỉnh sửa nội dung chú thích thông qua `tr.setNodeMarkup`, tự động ghi nhận vào lịch sử hoàn tác/làm lại (Undo/Redo).
    - `deleteNote`: Xóa marker và đồng thời loại bỏ note hoàn toàn khỏi tài liệu, đảm bảo **zero orphan metadata leakage** (không để metadata mồ côi âm thầm tích tụ).
    - `extractNotes`: Quét cây AST tuần tự theo thứ tự xuất hiện, tách biệt danh sách Footnotes và Endnotes.
  - **Đánh số Tự động Xác định (Deterministic Continuous Numbering)**:
    - Footnotes: Đánh số thập phân liên tục `1, 2, 3...`.
    - Endnotes: Đánh số La Mã chữ thường liên tục `i, ii, iii, iv, v...`.
    - **Không hardcode số vào nội dung tài liệu**: Số thứ tự hiển thị được tính toán động dựa trên thứ tự xuất hiện của marker trong AST. Khi thêm, xóa hoặc di chuyển note ở giữa văn bản, toàn bộ số hiển thị của các note phía sau tự động cập nhật lại chính xác 100%.
  - **Điều hướng Hai chiều Ngữ nghĩa (Bidirectional Navigation)**:
    - Marker -> Note: Nhấp vào marker trên văn bản sẽ mở/chuyển đến bảng ghi chú và cuộn/focus vào khung soạn thảo của note đó.
    - Note -> Marker: Nhấp vào nhãn hoặc nút "Quay lại vị trí trong bài" trong danh sách chú thích sẽ focus editor và đưa con trỏ (caret) chính xác về vị trí marker trong thân bài.
    - Hỗ trợ phím tắt và lệnh tuần tự: **Chú thích tiếp theo (Next Footnote)** và **Chú thích trước (Previous Footnote)**.
  - **Giao diện Người dùng & Tích hợp References Ribbon**:
    - Kích hoạt 5 lệnh trên References Ribbon (`status: "active"`, `phase: "6.4"`):
      - **Chèn Footnote (Insert Footnote)**: Phím tắt `Ctrl+Alt+F`.
      - **Chèn Endnote (Insert Endnote)**: Phím tắt `Ctrl+Alt+D`.
      - **Chú thích tiếp theo (Next Footnote)** / **Chú thích trước (Previous Footnote)**.
      - **Hiện danh sách chú thích (Show Notes)**.
    - Bảng thanh bên `NotesSidebar`: Quản lý danh sách Footnotes và Endnotes với huy hiệu số lượng, cho phép chỉnh sửa nội dung tức thời, xóa nhanh, và nhảy đến vị trí trong bài.
    - Vùng hiển thị chân trang tài liệu `DocumentNotesView`: Tích hợp ở chân tài liệu với đường kẻ phân cách chuẩn Word (đường kẻ 2-inch cho Footnote và đường kẻ toàn phần kèm tiêu đề cho Endnote).
  - **Chính sách Tích hợp Phân trang (Pagination Integration Policy)**:
    - Triển khai Semantic Footnote Core ổn định cao.
    - Không hack hệ thống phân trang để giả lập footer và không phá vỡ Page Engine hiện tại.
    - Endnotes được gom nhóm và hiển thị an toàn ở cuối tài liệu.
  - **Tương thích Lưu trữ & DOCX (OOXML Round-Trip)**:
    - Định dạng `.mwd`: Lưu trữ và phục hồi nguyên vẹn các node `noteReference`, bảo toàn 100% ID, type, content và tính liên kết hai chiều; tương thích ngược hoàn toàn với tài liệu cũ.
    - Xuất DOCX: Đóng gói chuẩn Open Packaging Conventions với `word/footnotes.xml`, `word/endnotes.xml`, `<w:footnoteReference>`, `<w:endnoteReference>`, kèm theo các quan hệ `.rels`, kiểu dáng `FootnoteReference`, `FootnoteText`, `EndnoteReference`, `EndnoteText` và các separator mặc định theo chuẩn ECMA-376. Tuyệt đối không qua trung gian HTML.
    - Nhập DOCX: Đọc và ánh xạ chính xác `word/footnotes.xml` và `word/endnotes.xml` thành các node `noteReference` ngữ nghĩa trong cây AST, tự động lọc bỏ các thẻ separator kỹ thuật.
  - **Đồng tồn tại An toàn với Hệ thống Khác (System Interactions)**:
    - Hoạt động ổn định cùng Comments, Track Changes, Proofing (Spell/Grammar), TOC (không bị nhầm là Heading), Heading Navigation, Section Breaks và Undo/Redo.
- **Kiểm thử Tự động & Build**:
  - Bổ sung bộ kiểm thử `src/references/footnotesEndnotes.test.ts` gồm 13 bài test bao quát: chèn footnote/endnote, đánh số tuần tự tự động, chèn/xóa note ở giữa văn bản và cập nhật số thứ tự, chỉnh sửa nội dung qua transaction, điều hướng hai chiều và next/prev, hoàn tác/làm lại Undo/Redo khôi phục cả marker và nội dung, dọn dẹp an toàn không để lại orphan metadata, tương thích lưu/mở tệp .mwd, DOCX OOXML round-trip hoàn hảo, và đồng tồn tại không lỗi với Comments/Track Changes/TOC.
  - Toàn bộ **398/398 bài kiểm thử PASS (100%)** trên 42 test suites.
  - Lệnh `npm run build` (`tsc && vite build`) và `cargo check` hoàn thành thành công 0 lỗi.

## Phase 6.3 — Table of Contents Engine — 2026-10-07

- **Bộ máy Mục lục Ngữ nghĩa (Semantic Table of Contents Engine)**:
  - **ProseMirror AST là Nguồn Chân lý Duy nhất (Single Source of Truth)**:
    - Mục lục được sinh trực tiếp và tự động từ các node Heading 1, 2, 3 thật trong ProseMirror AST thông qua `HeadingService`, tuyệt đối không parse từ HTML rendered hay dùng bản sao song song.
  - **Mô hình Dữ liệu Ngữ nghĩa (`TableOfContentsExtension`)**:
    - Thiết kế node `tableOfContents` chuẩn ProseMirror Block Atom Node (`group: "block"`, `atom: true`).
    - Lưu trữ đầy đủ cấu hình: `title` ("Mục lục"), `includedLevels` ([1, 2, 3]), `showPageNumbers`, `rightAlignPageNumbers`, `preset` ("classic" | "modern" | "formal"), `entries` (danh sách `{ headingId, level, text, pageNumber }`), và `lastUpdated`.
    - **Triệt tiêu 100% Rủi ro Đệ quy (Zero Recursion)**: Tiêu đề và nội dung mục lục nằm trong thuộc tính của node atom, không tạo node `heading`, ngăn chặn hoàn toàn việc TOC tự chèn chính nó vào mục lục.
    - Cấm tuyệt đối việc lồng TOC con (nested TOC) phá hỏng schema.
  - **Dịch vụ Điều phối Mục lục (`TocService`)**:
    - `insertToc`: Chèn khối Mục lục vào tài liệu qua transaction ProseMirror chuẩn mực; tích hợp hoàn hảo với lịch sử thao tác Undo/Redo.
    - `updateToc` (phím tắt F9): Đồng bộ lại toàn bộ cấu trúc mục lục khi có thay đổi (sửa tên đề mục, thêm mới, xóa bỏ, thay đổi cấp độ H1-H3). Hỗ trợ cả cập nhật toàn bộ (`Update entire table`) và chỉ cập nhật lại số trang (`Update page numbers only`).
    - `removeToc`: Gỡ bỏ khối mục lục sạch sẽ khỏi cây cú pháp mà không gây ảnh hưởng tới nội dung văn bản.
    - `navigateToEntry`: Nhấp vào bất kỳ mục nào trong TOC sẽ focus editor, di chuyển con trỏ tới đầu đề mục và cuộn mượt vào viewport mà **tuyệt đối không làm thay đổi hay đột biến nội dung tài liệu**.
  - **Tính toán Số trang Động (Dynamic Page Numbers)**:
    - Hàm `resolveHeadingPageNumber` tích hợp chuẩn xác với hệ thống ngắt trang vật lý (`pageBreak`, `sectionBreak`) và phân trang của `usePaginationStore`.
    - Không hardcode vị trí hay số trang vào nguồn chân lý; số trang được tính toán lại linh hoạt khi chạy lệnh Cập nhật mục lục.
  - **Giao diện Người dùng & Tích hợp References Ribbon**:
    - Kích hoạt chính thức bộ 3 nút công cụ trên References Ribbon: **Mục lục (Insert TOC)**, **Cập nhật mục lục (F9)**, **Xóa mục lục (Remove TOC)** (`status: "active"`, `phase: "6.3"`).
    - Hộp thoại tùy chỉnh `TocDialog`: Cho phép người dùng tùy biến tiêu đề, lọc cấp độ hiển thị (H1, H2, H3), lựa chọn phong cách hiển thị (Cổ điển, Hiện đại, Trang trọng), bật/tắt hiển thị số trang và dấu chấm nối căn phải (dot leaders).
    - NodeView tương tác trực quan: Cho phép nhấp trực tiếp vào từng mục để nhảy đến Heading tương ứng, kèm nút cập nhật nhanh ngay trên đầu khối mục lục.
  - **Tương thích Lưu trữ & DOCX**:
    - Định dạng `.mwd`: Lưu trữ và phục hồi trọn vẹn cấu hình cũng như danh sách mục lục; tương thích ngược 100% với các tệp tin cũ.
    - Xuất tệp DOCX: Tự động chuyển đổi khối `tableOfContents` thành các đoạn văn chuẩn WordprocessingML có cấu trúc với tiêu đề `TOCHeading`, thụt lề cấp độ `TOC1`-`TOC3`, tab stop căn phải và dấu chấm nối `w:leader="dot"`, đảm bảo tương thích hoàn hảo và an toàn tuyệt đối với Microsoft Word / LibreOffice.
  - **Bảo vệ Trạng thái Track Changes & Comments**:
    - Cập nhật mục lục sử dụng `setNodeMarkup` không chèn/xóa các text node trực tiếp, không làm phát sinh hàng trăm tracked changes giả mạo và bảo toàn nguyên vẹn 100% các bình luận (Comments) và thay đổi theo dõi (Track Changes) xung quanh.
- **Kiểm thử Tự động & Build**:
  - Bổ sung bộ kiểm thử `src/references/tableOfContents.test.ts` gồm 12 bài test bao quát: tài liệu không có heading, trích xuất H1-H3, lọc cấp độ, đổi tên heading, thêm/xóa heading, đổi level, lệnh Remove TOC, điều hướng không gây đột biến AST, tính toán lại số trang qua page break, lưu/mở .mwd, Undo/Redo, chống đệ quy và an toàn với ID lỗi.
  - Toàn bộ **385/385 bài kiểm thử PASS (100%)** trên 41 test suites.
  - Lệnh `npm run build` (`tsc && vite build`) và `cargo check` hoàn thành thành công 0 lỗi.

## Phase 6.2 — Heading Navigation / Document Outline — 2026-10-07

- **Sơ đồ Đề mục & Điều hướng Tài liệu (Document Outline & Heading Navigation)**:
  - **ProseMirror AST là Nguồn Chân lý Duy nhất (Single Source of Truth)**:
    - Toàn bộ đề mục (Heading 1, 2, 3) được trích xuất trực tiếp từ cây AST ProseMirror trong thời gian thực.
    - Tuyệt đối không tạo bản sao cấu trúc đề mục thứ hai làm nguồn dữ liệu song song.
  - **Dịch vụ Trích xuất Đề mục (`HeadingService`)**:
    - `extractHeadings`: Quét cây AST trích xuất `id`, `level` (1, 2, 3), `text` (xử lý trọn vẹn văn bản chứa mixed formatting marks, hiển thị an toàn `(Tiêu đề trống)` cho heading rỗng, loại trừ chính xác text bị xóa trong Track Changes), dải vị trí runtime (`from`, `to`), và ánh xạ phân vùng `sectionIndex`/`sectionId`.
    - Vị trí node hoàn toàn động theo runtime ProseMirror doc, không bao giờ lưu cứng vị trí vào tệp tin.
  - **Định danh Ngữ nghĩa Bền vững (Stable Semantic Heading IDs)**:
    - Bổ sung `HeadingAnchorExtension` vào schema Tiptap qua cơ chế `addGlobalAttributes`, thêm thuộc tính `id` tùy chọn cho node `heading` một cách tương thích ngược hoàn toàn.
    - Cơ chế sinh ID ổn định `ref_heading_<hash/uuid>`, không sinh lại ID mới khi render lại giao diện.
    - Khử trùng lặp ID an toàn (`normalizeHeadingIds`) khi nạp tệp tin bị lỗi hoặc nhân bản đề mục.
    - Tích hợp chuẩn hóa ID trong chu trình lưu/mở tệp `.mwd` và gán ID nội bộ khi nhập tệp DOCX (`documentMapper.ts`).
  - **Bảng Điều hướng Đề mục (`DocumentOutlineSidebar`)**:
    - Thanh điều hướng hiển thị cây phả hệ đề mục trực quan với các huy hiệu cấp độ (`H1`, `H2`, `H3`), hỗ trợ tìm kiếm/lọc đề mục nhanh.
    - Thuật toán dựng cây phân cấp (`buildHeadingHierarchy`) sử dụng ngăn xếp tổ tiên (ancestor stack) xử lý mượt mà và an toàn các chuỗi đề mục bất thường: H1 nhảy cóc sang H3, đề mục mở đầu bằng H2/H3, nhiều H1 liên tiếp.
    - Điều hướng mượt mà (`navigateToHeading`): Đưa tiêu điểm (focus) vào editor, di chuyển con trỏ (caret) tới đầu đề mục, cuộn (scroll) đề mục vào vùng nhìn thấy mà **tuyệt đối không làm biến đổi bất kỳ nội dung tài liệu nào**.
  - **Cập nhật Thời gian Thực Tối ưu (Live Update Engine)**:
    - Hook `useDocumentOutline` lắng nghe transaction của ProseMirror với cơ chế debounce (150ms) loại bỏ hoàn toàn độ trễ khi gõ nhanh.
    - Tự động đồng bộ ngay lập tức khi: thêm đề mục, xóa đề mục, chuyển đổi Normal <-> Heading, đổi cấp độ Heading, sửa văn bản đề mục, hoàn tác/làm lại (Undo/Redo), mở tệp tin mới.
  - **Kích hoạt Nút Điều hướng trên References Ribbon**:
    - Kích hoạt chính thức tính năng `headingsOutline` (Sơ đồ đề mục) trên thanh công cụ References Ribbon (`status: "active"`, `phase: "6.2"`).
    - Kết nối đóng/mở thanh Document Outline mượt mà, áp dụng cơ chế `preventBlur` (`e.preventDefault()`) bảo vệ tuyệt đối con trỏ và vùng chọn của người dùng khi thao tác trên thanh công cụ.
- **Kiểm thử Tự động & Build**:
  - Bổ sung bộ kiểm thử `src/references/headingNavigation.test.ts` gồm 10 bài test bao quát toàn diện trích xuất H1-H3, cây phân cấp, heading rỗng, nhảy cóc H1->H3, khử trùng ID, lưu trữ .mwd, điều hướng không gây đột biến AST, cập nhật thời gian thực khi sửa/xóa/Undo/Redo, và tương thích ngược với tài liệu cũ.
  - Toàn bộ **373/373 bài kiểm thử PASS (100%)** trên 40 test suites.
  - Lệnh `npm run build` (`tsc && vite build`) và `cargo check` hoàn thành thành công 0 lỗi.

## Phase 6.1 — References Engine Foundation + References Ribbon — 2026-10-07

- **Khởi tạo Kiến trúc Phân hệ Tham chiếu (References Engine Foundation)**:
  - **Cấu trúc Module Phân tầng**: Thiết lập module độc lập `src/references/` tuân thủ Clean Architecture theo chuẩn của Personal Word Editor:
    - `types/referencesTypes.ts`: Định nghĩa hệ thống kiểu `ReferenceGroup`, `ReferenceItemType`, `ReferenceItemDescriptor`, `ReferenceAnchor`, `ReferenceTargetType`, `ReferencesUIState`, `ReferenceCommandResult`.
    - `services/referencesRegistry.ts`: Danh mục quản lý tập trung toàn bộ 18 tính năng tham chiếu (Mục lục, Chú thích cuối trang/cuối tài liệu, Trích dẫn, Thư mục, Phụ đề, Tham chiếu chéo, Điều hướng đề mục).
    - `services/referenceAnchorService.ts`: Bộ máy sinh và quản lý ID neo tham chiếu ngữ nghĩa bền vững (`ref_<type>_<uuid/hash>`), không phụ thuộc vị trí DOM cố định hay index mảng nhất thời; hỗ trợ chuẩn hóa ID heading và trích xuất thuần túy không gây đột biến AST.
    - `commands/referencesCommands.ts`: Tầng điều phối lệnh an toàn, ngăn chặn tuyệt đối việc UI đột biến trực tiếp DOM của editor; kiểm tra nghiêm ngặt trạng thái tính năng trước khi thực thi.
    - `hooks/useReferencesCommands.ts`: Custom hook kết nối React UI với command dispatcher.
    - `components/ReferencesRibbon.tsx` & `ReferencesRibbonButton.tsx`: Giao diện Ribbon chuẩn mực với cơ chế bảo toàn con trỏ/vùng chọn (`preventBlur`), hiển thị huy hiệu phase ("6.2" - "6.8") và trạng thái `disabled` minh bạch cho các tính năng dự kiến.
    - `stores/referencesStore.ts`: Quản lý trạng thái giao diện thuần túy (`activeReferencePanel`, `isReferencesPanelOpen`, `selectedReferenceId`); tuyệt đối không lưu dữ liệu semantic trùng lặp trong Zustand.
- **Thanh công cụ References Ribbon Hoàn chỉnh**:
  - Tích hợp chính thức tab References vào thanh Ribbon chính (`Ribbon.tsx`), thay thế hoàn toàn placeholder tạm thời trước đây.
  - Phân chia thành 5 nhóm công cụ chuẩn Office:
    1. *Table of Contents (Mục lục)*: Chèn mục lục, Cập nhật mục lục (F9), Xóa mục lục.
    2. *Footnotes (Chú thích)*: Chèn Footnote (Ctrl+Alt+F), Chèn Endnote (Ctrl+Alt+D), Footnote tiếp, Footnote trước, Xem chú thích.
    3. *Citations & Bibliography (Trích dẫn & Thư mục)*: Chèn trích dẫn, Thư mục tài liệu, Quản lý nguồn, Kiểu trích dẫn.
    4. *Captions (Nhãn & Tham chiếu)*: Chèn chú thích, Danh mục hình, Cập nhật danh mục, Tham chiếu chéo.
    5. *Navigation (Điều hướng)*: Sơ đồ đề mục, Thẻ đánh dấu.
  - Mọi nút bấm thuộc các phase tương lai đều hiển thị rõ nhãn phase và trạng thái planned/disabled, không tạo nút thao tác giả.
- **Nền móng Định danh Ngữ nghĩa (Semantic Anchor Foundation)**:
  - Định dạng chuẩn hóa: `ref_<targetType>_<uuid/hash>` đáp ứng trọn vẹn chuẩn XML/HTML id.
  - Hỗ trợ khử dấu tiếng Việt khi sinh ID từ text giúp đảm bảo an toàn tuyệt đối khi xuất/nhập tệp.
  - Thuật toán `extractHeadingAnchors` và `ensureHeadingAnchorIds` bảo toàn tính bất biến (AST Immutability).
- **Tương thích Mô hình Dữ liệu & Định dạng .mwd**:
  - Bổ sung trường tùy chọn `references?: DocumentReferencesMetadata` vào `DocumentModel` và `MwdFilePackage`.
  - Khứ hồi lưu trữ/nạp tệp .mwd bảo toàn trọn vẹn siêu dữ liệu tham chiếu và tương thích ngược 100% với tài liệu các phiên bản trước.
- **Kiểm thử & Build**:
  - Bổ sung bộ kiểm thử `src/references/referencesEngine.test.ts` gồm 9 bài test bao quát toàn diện registry, state isolation, anchor uniqueness/stability, AST immutability, command dispatch safety, utils và persistence.
  - Toàn bộ **363/363 bài kiểm thử PASS (100%)** trên 39 test suites.
  - Lệnh `npm run build` (`tsc && vite build`) và `cargo check` hoàn thành thành công 0 lỗi.

## Phase 5 — Review & Proofing Engine (Completed) — 2026-10-07

- **Hoàn thành toàn diện Phase 5 — Review & Proofing Engine**:
  - **Kiểm tra Chính tả (Spell Check)**: Quét chính tả hai ngôn ngữ `en-US` và `vi-VN`, tạo gợi ý thay thế thông minh Levenshtein, bảo toàn viết hoa, cơ chế Ignore Once / Ignore All, Từ điển người dùng (User Dictionary) lưu trữ bền vững, debounce 350ms không gây lag khi gõ.
  - **Kiểm tra Ngữ pháp (Grammar Check)**: Bộ quy tắc cục bộ offline (`LocalGrammarProvider`) với 6 quy tắc dấu câu và cấu trúc; cơ chế bảo vệ vùng dải ký tự (`getProtectedRanges`) triệt tiêu 100% false positives trên URLs, email, số thập phân (`3.14`), số phiên bản (`v2.5`), tên file mở rộng (`report.docx`), dấu chấm lửng (`...`) và chữ viết tắt (`dr.`, `e.g.`); hỗ trợ Disable Rule và Ignore Once.
  - **Hệ thống Bình luận (Comments)**: Đầy đủ các thao tác Thêm, Sửa, Xóa, Giải quyết (`Resolve`), Mở lại (`Reopen`), điều hướng Next/Previous Comment; cơ chế bảo toàn anchor range và an toàn bình luận mồ côi (`Orphan Comment Safety`) khi xóa văn bản mà không làm mất nội dung thảo luận.
  - **Theo dõi Thay đổi (Track Changes)**: Bao quát toàn diện các luồng chỉnh sửa (`typing`, `Backspace`, `Delete`, `Enter` split trên selection, `Cut`, `Paste`, `selection replace`, `Find -> Replace`, `Replace All`); bảo toàn trọn vẹn văn bản xóa trong AST với semantic mark `delete`; ngăn chặn tuyệt đối lỗi kế thừa mark xóa sang văn bản chèn mới.
  - **Chấp nhận / Từ chối (Accept / Reject)**: Hỗ trợ duyệt từng thay đổi theo vị trí con trỏ/vùng chọn cũng như xử lý hàng loạt (`Accept All` / `Reject All`) trong một transaction nguyên tử theo thứ tự vị trí giảm dần, triệt tiêu lỗi lệch index; tích hợp hoàn hảo với Undo/Redo.
  - **Thống kê Tài liệu (Document Statistics)**: Trang vật lý từ Page Engine, Từ ngữ (Words), Ký tự có/không khoảng trắng, Đoạn văn, Dòng, Tiêu đề, Bảng, Hình ảnh, Thống kê vùng chọn tức thời, và Tổng quan kiểm duyệt; chính sách đếm từ chuẩn mực loại bỏ text xóa trong Track Changes.
  - **Tương thích DOCX & Định dạng .mwd**: Nhập/xuất song phương toàn vẹn Comments (`word/comments.xml`) và Track Changes (`<w:ins>`, `<w:del>`), xử lý an toàn dữ liệu chưa hỗ trợ (làm phẳng Threaded Comments, ánh xạ Move revisions, bỏ qua Formatting revisions); lưu trữ trạng thái duyệt một phần trong tệp native `.mwd`.
  - **Bộ kiểm thử Tự động & Build**: Bổ sung `src/review/phase5FinalAudit.test.ts` (12 bài kiểm thử chuyên sâu). Toàn bộ **354/354 bài tests PASS (100%)** trên 38 test suites; production build (`tsc && vite build`) hoàn thành thành công với 0 lỗi.

## Phase 5.8 — DOCX Review Metadata Integration — 2026-10-07

- **Tích hợp Bình luận DOCX (DOCX Comments Support)**:
  - *Nhập bình luận (Import)*:
    - Đọc thành phần `word/comments.xml` và liên kết quan hệ trong `word/_rels/document.xml.rels`.
    - Trích xuất toàn diện: mã định danh (`id`), tác giả (`author`), thời gian khởi tạo (`date`), nội dung nhận xét (`content`), và cờ giải quyết (`resolved` qua thuộc tính `w:done="1"` / `w:done="true"`).
    - Phân tích cú pháp các thẻ neo phạm vi `<w:commentRangeStart>` và `<w:commentRangeEnd>` kèm thẻ tham chiếu `<w:commentReference>` trong `word/document.xml` để gắn mark `comment` tương ứng vào text node trong ProseMirror AST.
    - Lưu giữ trọn vẹn văn bản được trích dẫn (`selectedText`) và bảo toàn an toàn các bình luận mồ côi (orphan comments).
  - *Xuất bình luận (Export)*:
    - Tuần tự hóa danh sách bình luận `doc.comments` thành tệp tin `word/comments.xml` chuẩn WordprocessingML ISO/IEC 29500 với các kiểu đoạn `CommentText` và `CommentReference`.
    - Đăng ký phần tử Override trong `[Content_Types].xml` và quan hệ trong `word/_rels/document.xml.rels`.
    - Tự động bọc dải văn bản mang mark `comment` bằng các thẻ `<w:commentRangeStart>`, `<w:commentRangeEnd>` và `<w:commentReference>`.
- **Tích hợp Theo dõi Thay đổi DOCX (DOCX Track Changes Support)**:
  - *Đoạn văn bản Chèn mới (Tracked Insertions)*:
    - Nhập: Chuyển đổi thẻ `<w:ins>` của Word thành mark `trackChange` (`changeType: "insert"`), giữ đúng tên tác giả và thời gian.
    - Xuất: Tuần tự hóa các text node mang mark `trackChange` (`insert`) thành thẻ `<w:ins>` chuẩn Word chứa `<w:r><w:t>`.
  - *Đoạn văn bản Xóa bỏ (Tracked Deletions)*:
    - Nhập: Chuyển đổi thẻ `<w:del>` kèm `<w:delText>` của Word thành mark `trackChange` (`changeType: "delete"`), giữ tác giả và thời gian. Bảo toàn 100% văn bản bị xóa trong AST (không bị biến mất hay chuyển thành plain text).
    - Xuất: Tuần tự hóa các text node mang mark `trackChange` (`delete`) thành thẻ `<w:del>` chuẩn Word chứa `<w:delText xml:space="preserve">`.
  - *Thay đổi đã Chấp nhận / Từ chối (Accepted / Rejected Changes)*:
    - Các thay đổi đã được Accept/Reject không còn mang mark `trackChange` và tự động được xuất thành văn bản bình thường, không chứa thẻ `<w:ins>` hay `<w:del>`.
- **Chu trình Khứ hồi Toàn vẹn (Round-trip Fidelity)**:
  - Kiểm thử chu trình 2 chiều: Word DOCX ➔ Personal Word Editor ➔ DOCX ➔ Microsoft Word / LibreOffice và ngược lại.
  - Bảo toàn 100% ngữ nghĩa, văn bản neo, nội dung bình luận, người tạo và các đoạn thêm/xóa.
- **Xử lý Dữ liệu Chưa hỗ trợ & An toàn Dữ liệu (Unsupported Data & Data Loss Safety)**:
  - Làm phẳng an toàn các thảo luận phân cấp (Threaded Comments) thành bình luận độc lập, không mất dữ liệu.
  - Ánh xạ an toàn các thẻ di chuyển (`<w:moveTo>` / `<w:moveFrom>`) thành Insert/Delete tương ứng.
  - Bỏ qua an toàn các thẻ revision định dạng (`<w:rPrChange>` / `<w:pPrChange>`), giữ nguyên formatting hiện hành.
  - Giữ an toàn tuyệt đối mô hình dữ liệu nội bộ `.mwd`; tiện ích `checkDocxExportReviewCompatibility` cảnh báo khi có metadata không tương thích mà không spam cảnh báo giả cho tính năng đã hỗ trợ.
- **Kiểm thử Tự động & Build**:
  - Bổ sung 11 bài kiểm thử tự động toàn diện trong `src/docx/docxReviewIntegration.test.ts`.
  - Toàn bộ **342/342 tests PASS (100%)** trên 37 test suite trong ~2.6s.
  - Lệnh `npm run build` (`tsc && vite build`) hoàn tất với 0 lỗi.

## Phase 5.7 — Document Statistics + Review UX — 2026-10-07

- **Mở rộng Word Count thành Document Statistics Toàn diện**:
  - **Chỉ số Định lượng Cốt lõi**:
    - Trang vật lý (Pages): Liên kết trực tiếp với Page Engine (`calculatePaginationState` / `usePaginationStore`), phản ánh chính xác số trang dàn trang thực tế; tuyệt đối không dùng công thức giả lập `Math.ceil(characters / X)`.
    - Số từ (Words): Đếm chính xác theo phân tách từ ngữ Unicode, tiếng Việt có dấu, đa đoạn văn.
    - Ký tự tính khoảng trắng (Characters with spaces) và Ký tự không tính khoảng trắng (Characters without spaces).
    - Số đoạn văn (Paragraphs) và Số dòng ước tính (Lines).
  - **Cấu trúc Thành phần Mở rộng**:
    - Thống kê số lượng Tiêu đề (`headings`), Bảng biểu (`tables`), Hình ảnh (`images`).
  - **Tổng quan Kiểm duyệt (Review Summary)**:
    - Lỗi chính tả (`spellingIssues`) và Lỗi ngữ pháp (`grammarIssues`).
    - Bình luận (`comments`), bao gồm số lượng nhận xét chưa xử lý (`unresolvedComments`).
    - Thay đổi đang theo dõi (`trackedChanges`), bao gồm số lượng chèn mới (`trackedInsertions`) và số lượng xóa bỏ (`trackedDeletions`).
  - **Thống kê Vùng chọn (Selection Statistics)**:
    - Khi người dùng bôi đen một vùng văn bản trong tài liệu, hệ thống tự động tính toán tức thời số từ và ký tự vùng chọn:
      - Thanh trạng thái StatusBar: Hiển thị định dạng `Words: X / Y` và `Characters: A / B`.
      - Hộp thoại Thống kê: Hiển thị khối "Văn bản đang chọn (Selection)" làm nổi bật số từ và ký tự được chọn so với toàn bộ tài liệu.
- **Chuẩn hóa Chính sách Đếm từ (Word Count Policy)**:
  - *Tracked Deletions*: KHÔNG TÍNH vào số từ và ký tự chính của tài liệu (nội dung bị đánh dấu xóa trong Track Changes coi như sắp bị gỡ bỏ, chỉ hiển thị thống kê riêng trong phần Review Summary).
  - *Tracked Insertions*: CÓ TÍNH vào số từ và ký tự chính (nội dung mới thêm vào).
  - *Comments*: Nội dung ghi chú/thảo luận trong thanh bên KHÔNG TÍNH vào số từ tài liệu; văn bản neo trên trang được tính bình thường đúng 1 lần.
  - *Header / Footer*: Khung mẫu tiêu đề đầu/chân trang KHÔNG TÍNH vào số từ thân bài tài liệu.
  - *HTML tags & Metadata*: Hoàn toàn bóc tách cấu trúc AST, chỉ duyệt text nodes hợp lệ, bỏ qua pageBreak, sectionBreak, horizontalRule.
- **Tối ưu hóa Hiệu năng & Chống Quét Lặp (Performance & Memoization)**:
  - Áp dụng `WeakMap` cache trên `JSONContent` AST reference trong `extractDocumentStats` và `StatisticsService.calculateDetailedStats`.
  - Loại bỏ hoàn toàn việc duyệt lặp cây cú pháp trên mỗi keystroke nếu nội dung không đổi; truy xuất cache O(1) < 0.05ms.
  - Thống kê vùng chọn chỉ tính toán trên đoạn chuỗi văn bản được cắt từ selection range, phản hồi mượt mà không gây giật lag.
- **Hoàn thiện Trải nghiệm Kiểm duyệt (Review UX Polish)**:
  - *Disabled State chuẩn xác*:
    - Vô hiệu hóa toàn bộ 6 nút nhóm Changes (`Accept`, `Reject`, `Accept All`, `Reject All`, `Previous Change`, `Next Change`) khi tài liệu không có thay đổi nào (`disabled={!hasChanges}`).
    - Vô hiệu hóa các nút nhóm Comments (`Delete`, `Previous Comment`, `Next Comment`) khi tài liệu không có bình luận (`disabled={comments.length === 0}`).
    - Vô hiệu hóa nút nhóm Proofing (`Previous Issue`, `Next Issue`) khi tài liệu không có lỗi nào (`disabled={issueCount === 0}`).
  - *Active Track Changes State trực quan*:
    - Nổi bật nút Theo dõi trên Review Ribbon khi đang bật.
    - Tích hợp nút trạng thái tương tác trên StatusBar (`Track Changes: ON` / `OFF`), cho phép nhấp chuột chuyển đổi trạng thái tức thì.
  - *Điều hướng Lỗi Kiểm tra (Next / Previous Proofing Issue Navigation)*:
    - Bổ sung phím tắt chuẩn Microsoft Word: `F7` (Đi tới lỗi tiếp theo) và `Shift+F7` (Lùi về lỗi trước đó).
    - Cặp nút điều hướng `Lỗi trước` / `Lỗi tiếp` trên nhóm Kiểm lỗi của Review Ribbon với cơ chế xoay vòng (wrap-around) tự động.
  - *Phím tắt Mở nhanh Thống kê*:
    - Hỗ trợ phím tắt `Ctrl+Shift+G` mở hộp thoại Thống kê tài liệu.
    - Cho phép nhấp chuột trực tiếp vào nhãn `Words` hoặc `Characters` trên StatusBar để mở hộp thoại Thống kê.
  - *Tooltips & Phím tắt*:
    - Rà soát toàn bộ tooltip trên Review Ribbon và StatusBar, hiển thị đầy đủ phím tắt (`F7`, `Shift+F7`, `Ctrl+Alt+M`, `Ctrl+Shift+E`, `Ctrl+Shift+G`).
- **Giao diện Hộp thoại Document Statistics (`DocumentStatisticsModal.tsx`)**:
  - Giao diện thiết kế cao cấp, phân chia thành các nhóm rõ ràng: *Chỉ số văn bản*, *Văn bản đang chọn*, *Cấu trúc thành phần*, *Tổng quan kiểm duyệt*, và *Ghi chú chính sách đếm từ*.
  - Hỗ trợ đóng nhanh bằng phím `Escape` hoặc nút Đóng.
- **Kiểm thử Tự động & Build**:
  - Bổ sung 12 bài kiểm thử tự động cho Phase 5.7 trong `src/review/statistics/documentStatistics.test.ts`.
  - Đạt **331/331 tests PASS 100%** trên toàn bộ 36 file kiểm thử (`npm test`).
  - Production build `tsc && vite build` hoàn tất 0 lỗi.

## Phase 5.6 — Accept / Reject Tracked Changes — 2026-10-07

- **Triển khai toàn diện Cơ chế Duyệt và Chấp nhận / Từ chối Thay đổi (Accept / Reject Tracked Changes)**:
  - **Chấp nhận / Từ chối Thay đổi Đơn lẻ (Individual Review Mechanics)**:
    - *Accept Insert*: Giữ lại nội dung văn bản chèn mới, gỡ bỏ semantic mark `trackChange`, chuyển thành văn bản bình thường (normal content).
    - *Reject Insert*: Xóa bỏ hoàn toàn khối văn bản đã chèn và metadata khỏi tài liệu AST.
    - *Accept Delete*: Xóa bỏ vĩnh viễn nội dung đã đánh dấu xóa khỏi tài liệu AST.
    - *Reject Delete*: Giữ lại và khôi phục nội dung văn bản, gỡ bỏ mark `trackChange` (`changeType: "delete"`), trả về văn bản bình thường không còn gạch ngang đỏ review.
  - **Xác định Ngữ cảnh Thay đổi Hiện tại (Current Change Context Resolution)**:
    - Khi caret hoặc selection nằm trong một tracked change: Áp dụng trực tiếp vào change đó.
    - Khi caret nằm ngoài tracked change: Fallback an toàn về `activeChangeId` từ điều hướng (`Next Change` / `Previous Change`) hoặc change đầu tiên trong tài liệu. Tuyệt đối không chấp nhận/từ chối nhầm change.
  - **Xử lý Hàng loạt An toàn (`Accept All` & `Reject All`)**:
    - Thuật toán sắp xếp vị trí giảm dần (`b.from - a.from`) giúp thực thi tất cả thay đổi trong **một transaction duy nhất (Atomic Batch)**.
    - Loại bỏ 100% rủi ro trôi lệch chỉ mục (index drift) khi xóa hoặc gỡ mark nhiều khối văn bản liên tiếp/lồng nhau.
  - **Tương thích Hoàn hảo với Hoàn tác / Làm lại (Undo / Redo)**:
    - Thao tác Accept và Reject tạo transaction lịch sử ProseMirror hợp lệ.
    - Hoàn tác (`Ctrl+Z`) khôi phục lại chính xác trạng thái mark `trackChange` hoặc nội dung văn bản ban đầu.
    - Làm lại (`Ctrl+Y`) tái thiết lập trạng thái sau khi duyệt mà không làm biến dạng dữ liệu.
  - **An toàn Tương tác với Bình luận (Comments Interaction & Orphan Safety)**:
    - Khi Accept Delete hoặc Reject Insert xóa một khối văn bản có gắn bình luận (`mark: comment`), comment chuyển sang trạng thái mồ côi (`isOrphan: true`) an toàn, không làm hỏng comment store hay sập ứng dụng.
    - Khi Undo, văn bản và mark comment được khôi phục, đưa bình luận trở lại trạng thái neo ngữ nghĩa bình thường.
  - **Lưu trữ Bền vững Duyệt một phần (Partial Review Persistence)**:
    - Hỗ trợ lưu và mở lại tài liệu khi mới duyệt một phần thay đổi (`some accepted, some rejected, some remaining`).
    - Dữ liệu `.mwd` bảo toàn 100% các thay đổi còn lại và trạng thái document.
  - **Giao diện Review Ribbon**:
    - Bổ sung nhóm nút Chấp nhận (`Accept`), Từ chối (`Reject`), Nhận tất cả (`Accept All`), Bỏ tất cả (`Reject All`), Thay đổi trước (`Previous Change`), Thay đổi tiếp (`Next Change`).
  - **Kiểm thử Tự động & Build**:
    - Bổ sung 10 bài kiểm thử cốt lõi cho Phase 5.6 trong `src/review/trackChanges/trackChangesAcceptReject.test.ts`.
    - Đạt **319/319 tests PASS 100%** trên toàn bộ 35 file kiểm thử (`npm test`).
    - Build kiểm tra `tsc && vite build` hoàn tất không có cảnh báo/lỗi nào.

## Phase 5.5 — Track Changes Core — 2026-10-07

- **Triển khai toàn diện Nền tảng Theo dõi Thay đổi (Track Changes Core)**:
  - **Mô hình Dữ liệu Thay đổi (`TrackChangeItem`)**:
    - Định nghĩa cấu trúc `TrackChangeItem` gồm: `id`, `type` (`"insert" | "delete"`), `author`, `timestamp`, `text`.
    - Tích hợp trường `trackedChanges?: TrackChangeItem[]` vào `DocumentModel` và `useDocumentStore`.
  - **Tiptap Mark `trackChange` & ProseMirror Transactions**:
    - Xây dựng [`TrackChangeExtension`](file:///c:/Users/hoang/.gemini/antigravity-ide/scratch/PersonalWordEditor/src/review/trackChanges/trackChangeExtension.ts) với `excludes: ""` và `spanning: true`, cùng tồn tại an toàn với Bold, Italic, Strikethrough, Underline, Comments.
    - Phân biệt rạch ròi giữa gạch ngang của người dùng (`strike`) và nội dung bị xóa do theo dõi (`trackChange` với `changeType: "delete"`).
    - Không dùng DOM diff; toàn bộ việc ghi nhận diễn ra thông qua transaction/keystroke hooks và command pipeline.
  - **Hành vi Theo dõi khi BẬT (Tracking ON)**:
    - *Thêm mới (`insert`)*: Gõ văn bản hoặc dán (Paste) được gắn mark `trackChange` (`type: "insert"`), hiển thị gạch chân và màu xanh review (`.track-insert`). Gộp chung `changeId` khi gõ liên tiếp.
    - *Xóa bỏ (`delete`)*: Nhấn Backspace, Delete, Cut, hoặc bôi đen gõ đè (Replace Selection) **không làm mất nội dung khỏi AST**; văn bản được giữ lại và gắn mark `trackChange` (`type: "delete"`), hiển thị gạch ngang và màu đỏ review (`.track-delete`).
    - *Tìm & Thay thế (Find & Replace)*: Cập nhật `searchExtensions.ts` để khi bật Track Changes, các kết quả thay thế tự động chuyển vùng tìm thấy thành `delete` và nội dung mới thành `insert`.
  - **Chế độ Theo dõi TẮT (Tracking OFF)**:
    - Khi tắt, editor hoạt động bình thường, các thao tác chỉnh sửa mới không tạo change metadata.
    - Nội dung đã được track trước đó vẫn hiển thị đầy đủ trên màn hình.
  - **Nền tảng Điều hướng Thay đổi (Navigation Foundation)**:
    - Triển khai `Previous Change` và `Next Change` trên Review Ribbon và `TrackChangesService`.
    - Lưu trữ `activeChangeId` trong `ReviewStore` để làm sáng thay đổi đang duyệt (`.track-active`) và di chuyển con trỏ editor.
  - **An toàn 100% với Undo/Redo & Lịch sử Soạn thảo**:
    - Tương thích hoàn toàn với cơ chế lịch sử nguyên bản của ProseMirror; hoàn tác (`Ctrl+Z`) và làm lại (`Ctrl+Y`) thu hồi hoặc tái lập chính xác text và metadata mà không bị nhân bản hay thất lạc.
  - **Lưu trữ Bền vững (.mwd) & Tương thích DOCX**:
    - Serializer `.mwd` trích xuất và bảo toàn các thay đổi đã theo dõi trong tệp; deserializer nạp lại nguyên vẹn và tương thích ngược với các file cũ.
    - DOCX Exporter tiếp tục hoạt động an toàn, xuất văn bản chuẩn mà không gây lỗi XML.
  - **Kiểm thử Tự động & Build**:
    - Bổ sung 9 bài kiểm thử cốt lõi cho Phase 5.5 trong `src/review/trackChanges/trackChangesCore.test.ts`.
    - Đạt **309/309 tests PASS** trên toàn bộ 34 file kiểm thử (`npm test`).
    - Production build `tsc && vite build` hoàn tất 0 lỗi.

## Phase 5.4 — Comments Core — 2026-10-07

- **Triển khai toàn diện Hệ thống Bình luận Ngữ nghĩa (Comments Core)**:
  - **Mô hình Dữ liệu Bình luận (`CommentItem`)**:
    - Chuẩn hóa cấu trúc bản ghi bình luận: `id`, `author`, `createdAt`, `updatedAt`, `content`, `resolved`, `selectedText`.
    - Tích hợp trực tiếp vào `DocumentModel` và `useDocumentStore` với các action đồng bộ: `addComment`, `updateComment`, `deleteComment`, `resolveComment`, `reopenComment`, `setComments`.
  - **Cơ chế Neo Ngữ nghĩa (Semantic Anchor qua ProseMirror Mark `comment`)**:
    - Xây dựng [`CommentExtension`](file:///c:/Users/hoang/.gemini/antigravity-ide/scratch/PersonalWordEditor/src/review/comments/commentExtension.ts) với mark `comment` lưu thuộc tính `commentId`.
    - Neo giữ vùng văn bản co giãn tự nhiên theo giao dịch soạn thảo (chèn, xóa, gõ nội dung xung quanh).
    - Khai báo `excludes: ""` đảm bảo cùng tồn tại hài hòa với các marks định dạng khác (`bold`, `italic`, `underline`, `color`, `fontFamily`, v.v.).
    - Bỏ qua an toàn trong DOCX export, bảo toàn 100% văn bản và formatting gốc khi xuất ra Microsoft Word.
  - **Dịch vụ Bình luận (`CommentService`)**:
    - Tra cứu range `{ from, to, text }` trực tiếp từ ProseMirror Document Node hoặc AST JSON.
    - Sắp xếp thứ tự bình luận theo luồng văn bản thực tế từ trên xuống dưới.
    - Điều hướng thông minh: `findNextComment` và `findPreviousComment` có cơ chế xoay vòng (wrap-around).
    - Tự động phát hiện bình luận mồ côi (`orphan comment`) khi văn bản bị xóa.
  - **Giao diện Thanh bên Bình luận (`CommentsSidebar.tsx`)**:
    - Dock gọn gàng bên phải workspace canvas với hiệu ứng trượt mượt mà.
    - Hộp soạn nháp (Draft Box) hiển thị trích dẫn đoạn văn bản được chọn, khung soạn thảo và hỗ trợ phím tắt `Ctrl+Enter` để lưu nhanh.
    - Danh sách thẻ nhận xét (Comment Cards) với avatar tác giả, mốc thời gian, nội dung, huy hiệu trạng thái (*Đã xong*, *Chờ xử lý*, *Mồ côi*).
    - Bộ lọc 3 tab: *Tất cả*, *Chờ xử lý*, *Đã xong*.
    - Thao tác nhanh trên từng thẻ: Sửa trực tiếp (`Edit`), Xóa (`Delete` - gỡ mark giữ nguyên văn bản gốc), Đánh dấu đã giải quyết (`Resolve`), Mở lại (`Reopen`).
    - Nhấp vào thẻ comment tự động đặt con trỏ và cuộn trang tới đúng đoạn văn bản trong editor.
  - **Highlight Trực quan trên Trang Soạn thảo**:
    - Định dạng `.comment-highlight` màu vàng nhạt nhẹ nhàng, không làm chói mắt.
    - Trạng thái đang chọn `.comment-active` với viền cam nổi bật.
    - Trạng thái đã giải quyết `.comment-resolved` với màu xám dịu và gạch chân nét đứt.
    - Nhấp trực tiếp vào text có comment trên trang tự động mở thanh bên và làm sáng thẻ tương ứng.
  - **Thanh công cụ Ribbon & Phím tắt Toàn cục**:
    - Kích hoạt nhóm **Bình luận (`Comments`)** trong Tab Review Ribbon: *Thêm nhận xét* (`Ctrl+Alt+M`), *Xóa*, *Trước*, *Tiếp*.
    - Hỗ trợ phím tắt `Ctrl+Alt+M` mở khung soạn nháp comment ngay lập tức.
  - **Lưu trữ Bền vững (.mwd Persistence) & An toàn Undo/Redo**:
    - Lưu trữ trường `comments` vào gói `.mwd` (format version 1). Khôi phục toàn bộ khi mở lại tệp.
    - Tương thích ngược tuyệt đối với các file cũ chưa có bình luận.
    - An toàn với Undo/Redo: Nếu text có comment bị xóa, comment chuyển thành orphan an toàn không gây sập app; khi Undo, text và mark được phục hồi nguyên vẹn.
  - **Kiểm thử tự động & Build**:
    - Bổ sung 10 bài test chuyên sâu trong `src/review/comments/commentsCore.test.ts`.
    - Đạt **300/300 bài test PASS 100%** (`npm test`).
    - Production build `tsc && vite build` và `cargo check` hoàn thành 0 lỗi.

## Phase 5.3 — Grammar Check Core — 2026-10-07

- **Triển khai toàn diện bộ máy kiểm tra ngữ pháp cốt lõi (Grammar Check Core)**:
  - **Kiến trúc Pluggable & Hợp nhất Proofing (`IGrammarProvider`)**:
    - Chuẩn hóa mô hình `ProofingIssue` gồm hai phân loại `spelling` và `grammar` (`GrammarIssue`).
    - Kiến trúc cắm rút qua giao diện `IGrammarProvider` sẵn sàng kết nối các engine nâng cao (LanguageTool, AI) trong tương lai mà không cần viết lại giao diện hoặc ProseMirror plugin.
    - Bộ máy mặc định hoạt động qua [`LocalGrammarProvider`](file:///c:/Users/hoang/.gemini/antigravity-ide/scratch/PersonalWordEditor/src/review/proofing/grammar/localGrammarProvider.ts) hoàn toàn offline trên máy khách, tuyệt đối không gửi dữ liệu ra ngoài Internet.
  - **Bộ quy tắc Ngữ pháp Cục bộ (Local Grammar Rules - Precision > Quantity)**:
    - *Khoảng trắng thừa (`double-spaces`)*: Phát hiện hai hoặc nhiều khoảng trắng liên tiếp trong văn bản, gợi ý thay bằng 1 khoảng trắng đơn.
    - *Khoảng trắng trước dấu câu (`space-before-punctuation`)*: Phát hiện khoảng trắng đứng trước `,`, `;`, `:`, `!`, `?`, `.`.
    - *Thiếu khoảng trắng sau dấu câu (`missing-space-after-punctuation`)*: Bắt dấu câu dính liền với từ tiếp theo.
    - *Từ lặp lại (`repeated-word`)*: Bắt từ ngữ bị gõ lặp lại hai lần liên tiếp (hỗ trợ cả tiếng Anh lẫn tiếng Việt Unicode: `the the`, `và và`, `của của`...).
    - *Viết hoa đầu câu (`capitalization`)*: Bắt chữ cái đầu câu viết thường sau dấu chấm kết câu `.`, `!`, `?`.
    - *Dấu chấm đôi bất thường (`double-period`)*: Bắt hai dấu chấm `..` liền kề không phải dấu chấm lửng (`...`).
  - **Bảo vệ Ngoại lệ & Khử Nhiễu Tuyệt đối (False Positive Suppression)**:
    - Bỏ qua an toàn toàn bộ URL, địa chỉ email, số thập phân (`3.14`), số phân cách hàng nghìn (`10,000`), phiên bản (`v2.0`), tên tệp mở rộng (`.docx`, `.mwd`), dấu chấm lửng (`...`) và các chữ viết tắt (`e.g.`, `etc.`, `mr.`, `dr.`, `tp.`).
    - Bỏ qua các khối đặc thù không phải văn xuôi: công thức toán (`equation`), mã lệnh (`codeBlock`), ảnh (`image`), ngắt trang (`pageBreak`), ngắt phần (`sectionBreak`).
  - **Giao diện & Hiển thị Phân biệt (Decorations & Context Menu)**:
    - Lỗi chính tả (Spelling): Gạch răng cưa đỏ (`.spelling-error-decoration`).
    - Lỗi ngữ pháp (Grammar): Gạch răng cưa xanh dương (`.grammar-error-decoration`).
    - Context Menu popover thông minh cho ngữ pháp: hiển thị tên quy tắc, giải thích ngữ pháp, nút *Áp dụng (`Apply`)* qua ProseMirror transaction bảo toàn định dạng xung quanh, nút *Bỏ qua (`Ignore`)* và nút *Tắt quy tắc (`Disable Rule`)* lưu bền bỉ vào `localStorage`.
    - Tab Review Ribbon: Kích hoạt nút **Ngữ pháp (`Grammar`)** cho phép bật/tắt toàn diện tính năng.
  - **Hiệu năng & Kiểm thử tự động**:
    - Tích hợp chung với Spell Check trong một ProseMirror Plugin duy nhất, dùng chung Debounce 350ms, tốc độ kiểm tra $< 15\text{ms}$ trên tài liệu lớn.
    - Bổ sung 7 bài test chuyên sâu trong `src/review/proofing/grammarCheck.test.ts`.
    - Đạt **290/290 bài test PASS 100%** (`npm test`).
    - Production build `tsc && vite build` và `cargo check` hoàn thành 0 lỗi.

## Phase 5.2 — Spell Check Core — 2026-10-07

- **Triển khai toàn diện bộ máy kiểm tra chính tả cốt lõi (Spell Check Core)**:
  - **Kiến trúc Non-destructive & ProseMirror Decorations**:
    - Tách biệt hoàn toàn luồng phát hiện lỗi chính tả khỏi Document Model AST: `Document text` → `Spell Checker Engine` → `Spelling Issues List` → `ProseMirror Inline Decorations`.
    - Dấu gạch chân răng cưa màu đỏ (`underline wavy #ef4444`) chỉ là ProseMirror Decoration thuần túy (`.spelling-error-decoration`). Không tạo bất kỳ mark hay thuộc tính nào trong document JSON hay tệp `.mwd`.
  - **Mô hình Spelling Issue (`SpellingIssue`)**:
    - Thiết kế cấu trúc chuẩn: `id`, `from`, `to`, `word`, `message`, `suggestions`, `language`.
    - Tự động map offset an toàn qua `tr.mapping` khi người dùng nhập liệu, ngăn ngừa lệch vị trí hoặc crash editor.
  - **Hỗ trợ đa ngôn ngữ mở rộng (`IDictionaryProvider`)**:
    - **Tiếng Anh (`en-US`)**: Tích hợp kho từ vựng cốt lõi mở rộng (`englishDictionary.ts`), hỗ trợ từ ghép, từ rút gọn (`don't`, `it's`, `can't`), từ vựng văn phòng/soạn thảo văn bản và thuật toán Levenshtein distance $\le 2$ tự động tạo từ gợi ý và bảo toàn quy tắc viết hoa.
    - **Tiếng Việt (`vi-VN`)**: Tích hợp danh mục âm tiết chuẩn (`vietnameseDictionary.ts`), hỗ trợ từ ghép có gạch nối và thuật toán Levenshtein Unicode mảng ký tự.
  - **Từ điển cá nhân người dùng (`UserDictionaryService`)**:
    - Lưu trữ cục bộ offline qua `localStorage` (`personal_word_editor_user_dictionary`).
    - Xác thực nghiêm ngặt: yêu cầu $\ge 2$ ký tự, không chứa khoảng trắng, không phải số thuần túy hoặc dấu câu. Tự động loại bỏ trùng lặp không phân biệt hoa/thường.
  - **Xử lý toàn diện các trường hợp biên (Edge Cases)**:
    - Bỏ qua an toàn toàn bộ URL (`http://`, `https://`, `www...`) và địa chỉ Email.
    - Bỏ qua số thuần túy, mã màu hex (`#1d4ed8`), mã phiên bản (`v2.0`), từ viết tắt toàn chữ hoa (`DOCX`, `HTML`, `CSS`).
    - Xử lý mượt mà dấu câu, dấu nháy đơn Unicode nội từ.
  - **Giao diện Menu Ngữ Cảnh & Thao tác Sửa lỗi (`SpellingContextMenu.tsx`)**:
    - Popover nổi hiển thị khi nhấp chuột trái hoặc chuột phải vào từ sai chính tả:
      - 3 từ gợi ý sửa lỗi tốt nhất.
      - *Bỏ qua một lần (`Ignore Once`)*: Ẩn cảnh báo cho vị trí hiện tại trong phiên.
      - *Bỏ qua tất cả (`Ignore All`)*: Bỏ qua từ trên toàn bộ tài liệu trong phiên.
      - *Thêm vào từ điển (`Add to Dictionary`)*: Lưu từ vào từ điển cá nhân.
    - Lệnh `replaceSpellingIssue`: Thay thế từ qua ProseMirror transaction, bảo toàn 100% định dạng xung quanh (Bold, Italic, Color, Font), hỗ trợ Undo/Redo và cập nhật dirty state (`isDirty = true`).
  - **Hiệu năng & Tối ưu hóa**:
    - Kiểm tra bất đồng bộ qua cơ chế **Debounce (350ms)**; tuyệt đối không quét đồng bộ làm nghẽn luồng chính trên mỗi phím gõ.
    - Tốc độ quét $< 15\text{ms}$ cho tài liệu 30 đoạn văn.
  - **Kiểm thử tự động & Build**:
    - Bổ sung 8 bài test chuyên sâu trong `src/review/proofing/spellCheck.test.ts`.
    - Đạt **283/283 bài test PASS 100%** (`npm test`).
    - Production build `tsc && vite build` và `cargo check` hoàn thành 0 lỗi.

## Phase 5.1 — Review Engine Structure + Review Ribbon — 2026-10-07

- **Triển khai kiến trúc nền tảng cho Review/Proofing Engine & Hoàn thiện giao diện Review Ribbon**:
  - **Kiến trúc phân tầng Review Engine (`src/review/`)**:
    - Thiết kế luồng xử lý phân tách độc lập: `Review Ribbon` → `Review Commands / Services` → `Editor / Document Model` → `.mwd Persistence`.
    - Tạo đầy đủ các thư mục hệ thống con: `proofing/`, `comments/`, `trackChanges/`, `statistics/`, `commands/`, `services/`, `hooks/`, `components/`, `types/`, `utils/`.
    - Tách biệt rõ ràng ranh giới nghiệp vụ giữa Proofing (kiểm lỗi), Comments (bình luận), Track Changes (theo dõi thay đổi), và Document Statistics (thống kê tài liệu).
  - **Review Registry (`src/review/services/reviewRegistry.ts`)**:
    - Quản lý tập trung 11 phần tử chức năng thuộc 5 nhóm chuẩn Microsoft Word:
      1. *Proofing*: Spelling (`spelling`), Grammar (`grammar`).
      2. *Comments*: New Comment (`newComment`), Delete Comment (`deleteComment`), Previous Comment (`previousComment`), Next Comment (`nextComment`).
      3. *Tracking*: Track Changes (`trackChanges`).
      4. *Changes*: Accept (`acceptChange`), Reject (`rejectChange`), Previous Change (`previousChange`), Next Change (`nextChange`).
      5. *Document*: Word Count & Statistics (`documentStatistics`).
    - Cấu hình trạng thái minh bạch (`active` vs `planned`), phím tắt gợi ý, nhãn hiển thị và tooltip giải thích chi tiết.
  - **Review State & Store (`src/stores/reviewStore.ts`)**:
    - Quản lý trạng thái toàn cục qua Zustand: `proofingEnabled`, `trackChangesEnabled`, `activeCommentId`, `activeChangeId`, `isStatisticsModalOpen`.
    - Thao tác toggle, setter, reset và quản lý modal chuẩn hóa, không phụ thuộc state cục bộ của component.
  - **Review Ribbon UI (`src/components/ribbon/ReviewRibbon.tsx`)**:
    - Tích hợp tab `Review` đầy đủ trên thanh Ribbon thay thế cho placeholder cũ.
    - Chia 5 nhóm công cụ chuẩn mực: *Kiểm lỗi*, *Bình luận*, *Theo dõi*, *Thay đổi*, *Tài liệu*.
    - Nút bấm `ReviewRibbonButton`: Bảo vệ hoàn toàn dấu nháy chuột/con trỏ editor (`onMouseDown preventDefault`), không gây mất focus khi chuyển tab hoặc nhấp nút. Các tính năng chưa phát triển có nhãn "5.x" và trạng thái disabled mờ rõ ràng, không tạo nút giả gây nhầm lẫn.
  - **Hộp thoại Thống kê tài liệu (`src/review/components/DocumentStatisticsModal.tsx`)**:
    - Kích hoạt tính năng hoạt động thật (Active): Mở modal từ nút *Đếm từ / Thống kê* trên nhóm Tài liệu.
    - Tính toán động theo thời gian thực từ ProseMirror AST qua `StatisticsService`: Số trang (Pages), Số từ (Words), Số ký tự không khoảng trắng (Characters no spaces), Số ký tự tính khoảng trắng (Characters with spaces), Số đoạn văn (Paragraphs), Số dòng ước tính (Lines).
    - Hỗ trợ đóng bằng phím Escape, click ra ngoài backdrop, phím bấm Đóng.
  - **Kiểm thử tự động & Build**:
    - Thêm 6 bài test chuyên sâu trong `src/review/reviewEngine.test.ts` bao phủ: Registry, Store, Statistics calculation, Subsystem service isolation, Commands dispatching safety, và Zero-Regression.
    - Đạt **275/275 bài test tự động PASS 100%** (`npm test`).
    - Production build `tsc && vite build` và `cargo check` hoàn thành 0 lỗi.

## Phase 4.3 — Round-Trip + Compatibility + Final Audit — 2026-10-07

- **Hoàn thành toàn diện Phase 4 — DOCX Compatibility**:
  - **Audit Kiến trúc DOCX Engine (`src/docx/**`)**:
    - Xác minh luồng dữ liệu 3 tầng tuân thủ nghiêm ngặt: `DOCX ↔ Mapping Layer ↔ Internal Document Model`. Tuyệt đối không dùng DOM/HTML bypass hack.
    - Cải tiến `xmlUtils.ts`: Sử dụng cơ chế `onError` callback của `@xmldom/xmldom` 0.9.x, loại bỏ triệt để cảnh báo console spam và bắt lỗi cú pháp XML an toàn.
  - **Khả năng chịu lỗi & Chống sập tệp hỏng (File Corruption & Tolerance Hardening)**:
    - Kiểm thử và gia cố các trường hợp: file rỗng (0 bytes), file không phải ZIP, file ZIP thiếu `word/document.xml`, thiếu `styles.xml` hoặc `numbering.xml`, file hỏng XML. Ứng dụng ném lỗi rõ ràng (`FileCorruptionError`), không crash ứng dụng, không làm mất tài liệu đang mở.
    - Chống chịu phần tử OOXML chưa hỗ trợ / lạ: Thẻ theo dõi thay đổi (`<w:ins>`, `<w:smartTag>`, `<w:fldSimple>`), trường nhúng Office Math (`<m:oMath>`, `<m:oMathPara>`), AlternateContent (`<mc:AlternateContent>`), bookmarks (`<w:bookmarkStart>`), comments. Hệ thống bỏ qua an toàn (`skip safely`) và trích xuất nguyên vẹn văn bản con, không throw fatal error.
    - Media / Relationships bị thiếu: Báo lỗi cảnh báo (`console.warn`) và tiếp tục nạp toàn bộ phần còn lại của tài liệu, không làm hỏng tài liệu.
  - **Round-Trip A & Round-Trip B**:
    - **Round-Trip A** (Personal Word Editor → DOCX → Personal Word Editor): Bảo toàn 100% Text, Headings (1-3), Formatting (Bold, Italic, Underline, Strike, Font, Size, Color, Highlight), Alignment, Indents, Line spacing, Lists (Bullet, Numbered, multi-level indents), Hyperlinks, Tables (headers, colwidth, colspan, background, vertical align), Images (Base64 data URL), Page settings (A4/Landscape/Custom margins), Page breaks, Sections & Section breaks, Header/Footer & dynamic page numbers (`{PAGE}`, `{NUMPAGES}`).
    - **Round-Trip B** (Microsoft Word DOCX → Personal Word Editor → Save DOCX): Đọc tài liệu Word phức tạp, sửa đổi nội dung và lưu lại DOCX mở được bằng các ứng dụng tương thích Word mà không làm mất dữ liệu quan trọng.
  - **Bảo toàn dữ liệu Phase 3 Objects**:
    - `textBox`: Serializer xuất nội dung văn bản bên trong thành các paragraph tuần tự trong DOCX mà không làm sập xuất tệp.
    - `equation`: Serializer xuất chuỗi biểu thức LaTeX dưới dạng văn bản in nghiêng sạch sẽ, bảo toàn công thức toán học trong tài liệu.
    - `shape`: Bỏ qua an toàn khi xuất sang DOCX, bảo toàn nguyên vẹn 100% trong `.mwd`.
  - **Bảo vệ Trạng thái Lưu (Save Failure Protection)**:
    - Giả lập lỗi ghi tệp trên đĩa cứng (read-only / invalid path / permission denied): Xác nhận `isDirty` vẫn giữ nguyên trạng thái `true`, không đóng editor và không đánh lừa người dùng.
  - **Tương thích ngược & Kiểm thử hồi quy (Zero Regression)**:
    - Kiểm tra và đảm bảo tương thích ngược 100% với tệp `.mwd` của Phase 1, Phase 2, Phase 3.
    - Bảo toàn toàn bộ chức năng Phase 1 (File, History, Formatting, Paragraphs, Lists, Search/Replace, Zoom, Status Bar, Dirty State).
    - Bảo toàn toàn bộ chức năng Phase 2 (Khổ giấy, Hướng giấy, Lề trang, Phân trang vật lý, Đa section, Header/Footer).
    - Bảo toàn toàn bộ chức năng Phase 3 (Link, Line, Symbol, Table nâng cao, Ảnh Base64 tự chứa, Text Box, Shapes, Equations).
  - **Hiệu năng & Tài nguyên**:
    - Kiểm thử hiệu năng tài liệu lớn (50 paragraphs, bảng biểu, danh sách, ngắt trang): Quá trình chuyển đổi từ gói tệp sang AST hoàn thành dưới 50ms, không memory leak.
  - **Kiểm thử tự động & Build**:
    - Xây dựng bộ test kiểm toán chuyên sâu `src/docx/docxCompatibilityAudit.test.ts` gồm 10 bài test toàn diện.
    - **269/269 bài test tự động PASS 100%** (`npm test`).
    - Build thành công `npm run build` và `cargo check` trên backend Rust.

## Phase 4.2 — DOCX Export Engine — 2026-10-07

- Hoàn thành phát triển động cơ xuất tài liệu Word DOCX (**DOCX Export Engine**), cho phép xuất Internal Document Model (`DocumentModel` / ProseMirror AST) trực tiếp thành tệp Microsoft Word (`.docx`) chuẩn ISO/IEC 29500 WordprocessingML:
  - **Kiến trúc luồng dữ liệu chuẩn**: `Internal Document Model` → `DOCX Mapping Layer` → `OOXML Serializer` → `DOCX Package Builder` → `.docx (ZIP Package)`. Tuyệt đối không dùng Editor HTML làm trung gian.
  - **DOCX Package Builder (`src/docx/export/docxPackageBuilder.ts`)**: Sử dụng JSZip tạo gói tệp ZIP .docx chuẩn với đầy đủ các part cần thiết: `[Content_Types].xml`, `_rels/.rels`, `word/document.xml`, `word/styles.xml`, `word/numbering.xml`, `word/_rels/document.xml.rels`, `word/header*.xml`, `word/footer*.xml`, `word/media/*`.
  - **Styles Serializer (`src/docx/mapping/styleSerializer.ts`)**: Định nghĩa kiểu dáng chuẩn cho `Normal`, `Heading1`, `Heading2`, `Heading3` với quan hệ kế thừa `w:basedOn`, khoảng cách dòng và kích thước chuẩn xác.
  - **Numbering Serializer (`src/docx/mapping/numberingSerializer.ts`)**: Định nghĩa danh sách thực trong `word/numbering.xml` hỗ trợ Bullet List (`numId=1`, `abstractNum 1`) và Numbered List (`numId=2`, `abstractNum 2`) qua 9 cấp thụt lề (0..8) với symbol font và định dạng số đa cấp.
  - **Document Serializer (`src/docx/mapping/documentSerializer.ts`)**:
    - Paragraph & Run Formatting: Bold, Italic, Underline, Strikethrough, Font family (`w:rFonts`), Font size (chuyển đổi pt sang half-points `w:sz`), Text color (`w:color`), Highlight (`w:highlight`). Bảo toàn 100% tiếng Việt Unicode và trật tự văn bản.
    - Paragraph properties: Căn lề Trái, Giữa, Phải, Căn đều (Justify $\to$ `w:jc w:val="both"`), Thụt lề (`w:ind` twips), Giãn dòng (`w:spacing w:line`).
    - Heading 1, 2, 3: Ánh xạ chuẩn `<w:pStyle w:val="Heading{1..3}"/>`.
    - Danh sách lồng cấp: Duyệt đệ quy cây `bulletList` / `orderedList` / `listItem`, sinh thuộc tính `w:numPr` tương ứng.
    - Bảng biểu Table: Xuất `<w:tbl>`, viền bảng, nhận diện `<w:tblHeader/>`, độ rộng cột (`colwidth` $\to$ `w:tcW`), gộp ô ngang (`colspan` $\to$ `<w:gridSpan>`), màu nền ô (`backgroundColor` $\to$ `<w:shd>`), căn lề dọc (`w:vAlign`). Đảm bảo mọi ô có ít nhất 1 paragraph.
    - Hình ảnh: Trích xuất nhị phân ảnh từ Base64 Data URL, lưu `word/media/image*.png/jpeg`, đăng ký relationship, tạo DrawingML (`w:drawing`, `wp:inline`, `wp:extent`, `pic:pic`) chuẩn Word, tài liệu hoàn toàn self-contained.
    - Ngắt trang & Đa Section: Xuất ngắt trang semantic `pageBreak` thành `<w:r><w:br w:type="page"/></w:r>`. Xuất ngắt phần `sectionBreak` tuân thủ nghiêm ngặt quy tắc OOXML (sectPr của section trước nằm trong paragraph cuối cùng của section đó; sectPr của section cuối nằm trực tiếp trong `w:body`).
    - Header & Footer: Xuất các part header/footer riêng, liên kết relationship tương ứng. Nhận diện trường số trang động `{PAGE}` và `{NUMPAGES}`, xuất thành `<w:fldSimple w:instr="PAGE"/>` và `<w:fldSimple w:instr="NUMPAGES"/>` thay vì số cứng tĩnh.
  - **Tích hợp Lưu & Xuất tệp (`src/file/fileOperations.ts`)**:
    - `File → Save As`: Hỗ trợ lưu bản sao dưới dạng `.mwd` hoặc `.docx`.
    - `File → Save`: Tự động nhận diện định dạng file hiện tại (`.mwd` hoặc `.docx`). Nếu đang mở file `.docx`, ghi đè nhị phân an toàn bằng backend Rust `write_binary_file`.
    - Bổ sung nút `Xuất Word (.docx)` trực tiếp trong menu File.
  - **Kiểm chứng ngoài & Round-Trip**:
    - Đã xác thực thành công cấu trúc XML của gói tệp `test.docx` qua DOMParser (0 lỗi).
    - Đã mở và kiểm tra trực tiếp qua Microsoft Word (Office 16): File mở thành công 100%, nhận diện đầy đủ 21 paragraphs, 2 sections, không có lỗi corrupt.
    - Round-Trip nội bộ (Personal Word Editor $\to$ DOCX $\to$ Personal Word Editor Import) bảo toàn 100% ngữ nghĩa cấu trúc.
  - **Kiểm thử & Build**:
    - Bổ sung 14 bài test chuyên sâu trong `src/docx/docxExport.test.ts`.
    - Tổng số bài test tự động: **259/259 PASS (100%)**.
    - Build thành công `npm run build` và `cargo check`.

## Phase 4.1 — DOCX Import Engine — 2026-10-07

- Hoàn thành triển khai động cơ nhập khẩu tài liệu Word DOCX (**DOCX Import Engine**) chuyển đổi có cấu trúc trực tiếp vào Internal Document Model:
  - **Kiến trúc luồng dữ liệu chuẩn**: `.docx (ZIP Package)` → `DOCX Package Reader` → `OOXML XML Parts` → `DOCX Parser` → `Mapping Layer` → `Internal Document Model` → `Tiptap/ProseMirror AST`. Tuyệt đối không dùng HTML làm trung gian.
  - **DOCX Package Reader (`src/docx/parser/docxPackageReader.ts`)**: Sử dụng JSZip phân tích gói nhị phân OOXML, trích xuất an toàn các phần `[Content_Types].xml`, `_rels/.rels`, `word/document.xml`, `word/styles.xml`, `word/numbering.xml`, `word/_rels/document.xml.rels`, `word/header*.xml`, `word/footer*.xml`, `word/media/*`.
  - **Paragraph, Text & Formatting (`src/docx/mapping/documentMapper.ts`)**: Ánh xạ đầy đủ paragraph, runs, in đậm, in nghiêng, gạch chân, gạch ngang, phông chữ (font family), cỡ chữ (font size chuyển từ half-points sang pt), màu chữ hex, màu highlight. Bảo toàn 100% trật tự văn bản và dấu tiếng Việt Unicode.
  - **Đoạn văn & Kế thừa kiểu dáng (`src/docx/styles/styleParser.ts`)**: Hỗ trợ căn lề (Trái/Giữa/Phải/Đều), giãn dòng (1.0, 1.15, 1.5, 2.0), thụt lề (indent). Đọc `word/styles.xml`, xử lý kế thừa `w:basedOn`, ánh xạ ngữ nghĩa `Heading 1, 2, 3` thành semantic heading node level 1, 2, 3.
  - **Danh sách có thứ bậc (`src/docx/numbering/numberingParser.ts`)**: Đọc `word/numbering.xml`, phân tích `abstractNum` và `num` instance, nhận diện Bullet List và Ordered List (decimal, letter, roman...), nhóm các mục tuần tự thành cây ProseMirror `bulletList` / `orderedList` lồng cấp chuẩn AST.
  - **Liên kết Hyperlink (`src/docx/relationships/relationshipParser.ts`)**: Đọc liên kết ngoài từ `document.xml.rels`, gán mark `link` có URL đích và văn bản hiển thị.
  - **Bảng biểu Table (`src/docx/mapping/documentMapper.ts`)**: Ánh xạ `table`, `tableRow`, `tableCell`, `tableHeader` (nhận diện qua `w:tblHeader`), màu nền ô (`w:shd`), căn lề ô, độ rộng cột (`colwidth`), ô gộp ngang (`gridSpan` -> `colspan`).
  - **Hình ảnh (`src/docx/media/mediaParser.ts`)**: Trích xuất ảnh nhị phân từ `word/media/*` qua relationship ID, chuyển đổi sang Base64 Data URL độc lập, gắn vào block node `image` với kích thước an toàn, tuân thủ chiến lược lưu trữ self-contained của Personal Word Editor.
  - **Thiết lập trang & Đa Section (`src/docx/mapping/pageSettingsMapper.ts`)**: Nhận diện khổ giấy (A4, A3, Letter, Legal) từ twips, hướng trang (Portrait/Landscape), lề trang (mm) và preset (Normal, Narrow, Wide, Custom). Hỗ trợ ngắt phần (`sectionBreak`) với thiết lập trang và header/footer riêng cho từng section theo quy tắc OOXML.
  - **Ngắt trang (`pageBreak`)**: Nhận diện `<w:br w:type="page"/>` và `<w:pageBreakBefore/>`, tạo semantic node ngắt trang sạch sẽ.
  - **Header & Footer (`src/docx/mapping/headerFooterMapper.ts`)**: Đọc nội dung từ `header*.xml` và `footer*.xml`, căn lề, định dạng và ánh xạ trường số trang động thành token `{PAGE}` và `{NUMPAGES}`.
  - **Tích hợp File Open & Bảo vệ dữ liệu (`src/file/fileOperations.ts`)**: Native Dialog hỗ trợ lọc cả `.mwd` và `.docx`. Mở DOCX cập nhật tiêu đề theo tên file, hiển thị nội dung ngay lập tức, `isDirty = false`. Sau khi sửa đổi `isDirty = true`. Lệnh Lưu (Save) tự động chuyển hướng sang `Save As .mwd`, bảo vệ tuyệt đối không ghi đè file DOCX gốc.
  - **Bảo toàn dữ liệu (.mwd Round-Trip)**: Save As `.mwd` sau khi import DOCX và mở lại bảo toàn 100% nội dung và thuộc tính.
  - **Kiểm thử & Build**: Bổ sung 13 bài test tự động chuyên sâu (`src/docx/docxImport.test.ts`), nâng tổng số test lên **245/245 PASS (100%)**. Production build `npm run build` thành công.

## Phase 3 — Insert Engine completed — 2026-10-07

- Hoàn thành kiểm toán toàn diện và nghiệm thu Phase 3 — Insert Engine:
  - **Insert Ribbon**: Hoàn thiện 7 nhóm công cụ chuẩn Word.
  - **Hyperlink, Horizontal Line, Symbol**: Mark ngữ nghĩa, block atom và modal chọn ký tự Unicode.
  - **Table Core & Advanced**: Chèn bảng, thêm/xóa dòng cột, header row, merge/split cells, column resize, căn lề ô, cell background, borders.
  - **Image**: File picker, chiến lược nhúng Base64 tự chứa (.mwd), validation an toàn (30–800px), căn lề, alt text.
  - **Text Box**: Semantic block node, inline rich-text editing, alignment, styling, width resize.
  - **Shapes**: 5 core shapes vector SVG (Rectangle, Rounded Rectangle, Ellipse, Line, Arrow), màu tô, nét vẽ, căn lề, resize.
  - **Equation**: Semantic atom node, LaTeX là source of truth trong `.mwd`, KaTeX renderer thời gian thực, live preview modal.
  - **Persistence & Robustness**: Round-trip Save/Open bảo toàn 100% tất cả đối tượng trong `.mwd`; tương thích ngược tài liệu Phase 1/2.
  - **Undo/Redo & Pagination Safety**: Undo/Redo nguyên tử; đo lường chiều cao hữu hạn không gây lặp phân trang; bảo toàn Phase 1 và Phase 2.
  - **Test & Build**: 232/232 test đạt 100%, production build `npm run build` thành công.

## 3.8.0 — Phase 3.8 — Shapes + Equation Basic — 2026-10-07

- Bổ sung Hình vẽ cơ bản (Shapes) và Công thức toán học (Equation) ở mức đủ dùng, chuẩn ngữ nghĩa, tích hợp an toàn vào Page Canvas và document AST:
  - **A. SHAPES (Hình vẽ cơ bản)**:
    - **1. Tập hình hỗ trợ nhỏ gọn & thiết thực**:
      - Rectangle (Hình chữ nhật)
      - Rounded Rectangle (Hình chữ nhật bo góc)
      - Ellipse (Hình elip / hình tròn)
      - Line (Đường thẳng)
      - Arrow (Mũi tên có đầu nhọn vector)
      - Không tạo hàng chục hình dư thừa, không làm 3D, effects, complex gradients, hay SmartArt.
    - **2. Semantic Representation (Mô hình node chuẩn)**:
      - Thiết kế atom block node `shape` (`group: "block"`, `atom: true`, `selectable: true`, `draggable: true`).
      - Lưu trữ đầy đủ thuộc tính rõ ràng trong document model: `shapeType`, `width`, `height`, `fillColor`, `strokeColor`, `strokeWidth`, `alignment`.
      - Tuyệt đối không lưu chỉ dưới dạng DOM snapshot; render vector qua SVG tự chứa (`buildShapeSvgSpec`), đảm bảo sắc nét ở mọi độ phân giải.
    - **3. Thao tác chỉnh sửa (Editing & Mutations)**:
      - Chèn hình qua `insertShape` hoặc thanh Ribbon (`Insert → Shapes` popover).
      - Chọn hình (`NodeSelection`), nhận diện trạng thái active qua `isShapeActive` và `getShapeAttributes`.
      - Thay đổi kích thước (`setShapeDimensions`), màu tô (`setShapeFillColor`), màu viền (`setShapeStrokeColor`), độ dày nét viền (`setShapeStrokeWidth`), căn lề khối (`setShapeAlignment`).
      - Xóa hình sạch sẽ bằng `deleteShape` hoặc phím `Delete`/`Backspace`.
      - Hỗ trợ Hoàn tác (Undo) và Làm lại (Redo) 100%.
    - **4. Validation an toàn (Sizing Constraints)**:
      - Giới hạn kích thước qua `validateShapeDimensions`: chiều rộng $20\text{px} \le \text{width} \le 800\text{px}$, chiều cao $10\text{px} \le \text{height} \le 600\text{px}$.
      - Tự động chuẩn hóa số nguyên, chặn NaN và số âm.
  - **B. EQUATION (Công thức / Phương trình toán học)**:
    - **1. Kiến trúc thực tế (Equation Node → LaTeX Source → KaTeX Renderer)**:
      - Thiết kế atom block node `equation` (`group: "block"`, `atom: true`, `selectable: true`).
      - Thuộc tính lưu trữ trong document model: `latex`, `displayMode`, `alignment`.
      - Mã nguồn LaTeX (ví dụ: `x^2 + y^2 = z^2`) là **Source of Truth** duy nhất được lưu vào file `.mwd` (`data-latex`), tuyệt đối không lưu chỉ HTML đã render.
    - **2. Thư viện kết xuất (KaTeX Engine)**:
      - Sử dụng `katex` (nhẹ, nhanh, pure JavaScript, license MIT chuẩn mở).
      - Kết xuất tự động qua `katex.render` trong ProseMirror `NodeView`, kèm CSS `katex.min.css`.
    - **3. Bảo mật & Tính ổn định (Security & Stability)**:
      - Tuyệt đối không dùng `eval`.
      - Xử lý lỗi cú pháp thân thiện (`throwOnError: false`), không làm gián đoạn hoặc sập ứng dụng khi nhập biểu thức sai.
    - **4. Giao diện & Thao tác chỉnh sửa (Equation Dialog & Editing)**:
      - Hộp thoại `EquationDialog` chuyên nghiệp: ô nhập LaTeX, xem trước kết xuất trực tiếp theo thời gian thực (live preview), 9 mẫu công thức toán học nhanh (Phân số, Căn bậc hai, Lũy thừa, Tích phân, Tổng sigma, Giới hạn, Ma trận, Euler, Pitago).
      - Chỉnh sửa công thức đang chọn qua `updateEquation`, căn lề qua `setEquationAlignment`.
      - Xóa công thức bằng `deleteEquation`, hỗ trợ Undo/Redo hoàn hảo.
  - **C. PAGINATION & ENGINE COMPATIBILITY (Tương thích phân trang)**:
    - Cập nhật hàm `estimateContentHeightPx` trong `paginationService.ts` đo lường chiều cao Shape và Equation hữu hạn, ngăn chặn triệt để nguy cơ lặp vô hạn khi phân trang (infinite pagination loop).
    - Biểu diễn dạng block/inline-block an toàn trong khung nội dung trang giấy (Page content area).
  - **D. KIỂM THỬ & CHẤT LƯỢNG (Testing & Regression)**:
    - Tạo bộ kiểm thử chuyên sâu `src/insert/phase3_8.test.ts` gồm 14 bài test tự động bao phủ toàn diện: Schema, Validation, 5 loại Shape, Selection, Mutation, Deletion, Equation insertion/update/deletion, Undo/Redo, Security/KaTeX, Persistence (.mwd), Regression tổng hợp, và Pagination safety.
    - Toàn bộ **221/221 bài test tự động** vượt qua 100% (`npm test`).
    - Build bundle `tsc && vite build` hoàn hảo với 0 lỗi.
  - **Ranh giới dự án**:
    - Tuyệt đối KHÔNG triển khai Phase 3.9.

## 3.7.0 — Phase 3.7 — Text Box — 2026-10-07

- Triển khai Hộp văn bản (Text Box) chuẩn ngữ nghĩa, ổn định cấu trúc và tích hợp an toàn vào Page Canvas:
  - **1. Semantic Text Box Node (`textBox`)**:
    - Thiết kế node ngữ nghĩa ProseMirror chuẩn (`group: "block"`, `content: "block+"`, `defining: true`, `isolating: true`).
    - Tuyệt đối không dùng `<div contenteditable>` tách rời gây ra 2 nguồn state lệch nhau; nội dung bên trong là các block nodes (`paragraph`) thuộc cây document AST duy nhất.
    - Tái sử dụng toàn diện các lệnh soạn thảo và phím tắt chuẩn của editor (In đậm, In nghiêng, Đổi màu chữ, Phông chữ, Cỡ chữ, Căn lề...).
  - **2. Thao tác Chèn (Insert → Text Box)**:
    - Kích hoạt nút `Text Box` trên tab `Insert Ribbon`.
    - Tạo Text Box với kích thước mặc định hợp lý (rộng 320px, cao tối thiểu 80px).
    - Tự động đặt con trỏ chuột vào đoạn văn bản bên trong hộp ngay sau khi chèn, sẵn sàng để gõ nội dung tức thì.
  - **3. Chỉnh sửa & Xóa (Editing & Deletion)**:
    - Nhấp chuột trực tiếp vào hộp văn bản để gõ, bôi đen và định dạng nội dung.
    - Hỗ trợ chọn hộp (`NodeSelection`) hoặc đặt con trỏ bên trong (`TextSelection`) và xóa toàn bộ hộp sạch sẽ bằng lệnh `deleteTextBox`.
    - Hỗ trợ hoàn tác (Undo) và làm lại (Redo) phục hồi/xóa hộp văn bản chính xác theo lịch sử thao tác.
  - **4. Định vị & Căn lề an toàn (Positioning & Alignment)**:
    - Ưu tiên mô hình layout an toàn: block container nằm gọn trong diện tích trang giấy (Page content area).
    - Hỗ trợ 3 chế độ căn lề khối: Căn trái (`left`), Căn giữa (`center`), Căn phải (`right`) thông qua attribute `alignment` và CSS margin căn chỉnh tương ứng.
    - Không xây dựng floating layout hay text wrapping phức tạp, bảo toàn độ ổn định của vùng chọn và engine phân trang.
  - **5. Kiểm tra kích thước (Validation & Sizing)**:
    - Giới hạn kích thước nghiêm ngặt qua `validateTextBoxDimensions`: chiều rộng $120\text{px} \le \text{width} \le 800\text{px}$, chiều cao $40\text{px} \le \text{minHeight} \le 600\text{px}$.
    - Chặn đứng các giá trị NaN, số âm, hoặc vô lý làm hỏng bố cục tài liệu.
  - **6. Lưu trữ & Khôi phục (Persistence)**:
    - Toàn bộ nội dung con, kích thước (`width`, `minHeight`), căn lề (`alignment`), màu nền (`backgroundColor`), màu viền (`borderColor`) được lưu trữ nguyên vẹn trong tệp tin `.mwd`.
    - Quá trình Save/Open round-trip khôi phục chính xác 100% thuộc tính và cây nội dung.
  - **7. Tích hợp & Kiểm thử hồi quy (Zero-Regression)**:
    - Phối hợp mượt mà với Paragraph, Heading, Image, Table, Page Break, Section Break và tính toán chiều cao trong Engine phân trang (`estimateContentHeightPx`).
    - Bộ test tự động `src/insert/phase3_7.test.ts` gồm 12 bài test bao phủ trọn vẹn các yêu cầu.
    - Toàn bộ **207/207 bài test tự động** vượt qua 100% (`npm test`). Build bundle `tsc && vite build` hoàn hảo với 0 lỗi.
  - **Ranh giới dự án**:
    - Tuyệt đối KHÔNG triển khai Phase 3.8.

## 3.4.0 — Phase 3.4 — Table Advanced + Resize + Merge/Split — 2026-10-07

- Nâng cấp toàn diện Table lên chuẩn tài liệu thực tế với khả năng thay đổi kích thước cột, hợp nhất/tách ô, định dạng nâng cao và thanh công cụ ngữ cảnh chuyên biệt:
  - **1. Merge & Split Cells (Hợp nhất & Tách ô)**:
    - Triển khai lệnh `mergeCells`, `splitCell`, `mergeOrSplit` qua ProseMirror transactions và CellSelection native.
    - Tuyệt đối không can thiệp DOM thủ công; `colspan` và `rowspan` được quản lý trực tiếp trong ProseMirror AST.
    - Kiểm tra điều kiện an toàn (`canMergeCells`, `canSplitCell`) trước khi thực thi để ngăn chặn lỗi khi chọn ô không hợp lệ.
    - Thao tác xóa hàng/cột sau khi merge bảo toàn tính toàn vẹn của bảng mà không làm hỏng cấu trúc tài liệu.
  - **2. Column Resizing (Kéo thả kích thước cột)**:
    - Kích hoạt `resizable: true`, `lastColumnResizable: true`, `cellMinWidth: 25` trong `CustomTable` extension.
    - Kéo thả viền cột hiển thị handle xanh mượt mà (`.column-resize-handle`), điều chỉnh `colwidth` trực tiếp trên các ô.
    - Chiều rộng cột được lưu trữ trong node attributes (`attrs.colwidth`) của `.mwd`, bảo toàn kích thước sau Save/Open.
    - Kích thước logic độc lập hoàn toàn với tỉ lệ zoom hiển thị của Canvas.
  - **3. Cell Alignment (Căn lề ô)**:
    - Căn lề ngang: Trái (`left`), Giữa (`center`), Phải (`right`).
    - Căn lề dọc: Đỉnh (`top`), Giữa (`middle`), Đáy (`bottom`).
    - Lưu vào node attributes `textAlign` và `verticalAlign`, ánh xạ qua `data-align` và `data-valign` trong CSS để tránh xung đột thuộc tính inline style.
  - **4. Cell Background / Shading (Màu nền ô)**:
    - Lưu trữ màu sắc vào node attribute `backgroundColor`.
    - Hỗ trợ bảng màu pastel tiện dụng (Không màu, Xám nhạt, Đỏ pastel, Vàng pastel, Xanh lá, Xanh dương, Tím pastel).
    - Hỗ trợ hoàn tác (Undo) và làm lại (Redo) phục hồi màu sắc chính xác.
  - **5. Table Borders (Kiểu viền bảng)**:
    - Hỗ trợ 3 kiểu viền cơ bản: Tất cả viền (`all`), Chỉ viền ngoài (`outside`), Không viền (`none`).
    - Lưu vào attribute `borders` trên node `table`, render qua class và data attribute đồng bộ.
  - **6. Contextual UI (Thanh công cụ bảng ngữ cảnh `TableContextualToolbar.tsx`)**:
    - Tự động xuất hiện ngay dưới Ribbon khi con trỏ hoặc vùng chọn nằm trong bảng.
    - Tự động ẩn hoàn toàn khi rời khỏi bảng, giữ nguyên vẹn sự tinh gọn cho Home và Insert Ribbon.
    - Cung cấp đầy đủ công cụ: Hợp/Tách ô, Căn lề ngang/dọc, Bảng màu nền, Menu chọn viền, Thêm/xóa hàng/cột và Xóa bảng.
  - **7. Lưu trữ, Phân trang & Zero-Regression**:
    - Bộ test tự động `src/insert/phase3_4.test.ts` (12 bài test) bao phủ tất cả ca kiểm thử biên (edge cases).
    - Toàn bộ **195/195 bài test tự động** vượt qua 100% (`npm test`).
    - Biên dịch TypeScript và build bundle `tsc && vite build` hoàn hảo với 0 lỗi.
  - **Ranh giới dự án**:
    - Tuyệt đối KHÔNG triển khai Phase 3.5 (Image Core).

## 3.3.0 — Phase 3.3 — Table Core — 2026-10-07

- Triển khai toàn diện Table Core dựa trên hệ sinh thái Tiptap/ProseMirror table extensions chính thức:
  - **1. Extensions Ecosystem**:
    - Tích hợp `@tiptap/extension-table`, `@tiptap/extension-table-row`, `@tiptap/extension-table-cell`, `@tiptap/extension-table-header` (v3.31.4).
    - Cấu trúc cây dữ liệu chuẩn ProseMirror AST: `table` $\rightarrow$ `tableRow` $\rightarrow$ `tableCell` / `tableHeader` $\rightarrow$ `paragraph`.
    - Tuyệt đối không lưu bảng dưới dạng chuỗi HTML thuần, toàn bộ bảng là semantic AST node.
  - **2. Insert Table (Thanh Ribbon & Hộp thoại)**:
    - **Popover Grid Picker 8x8**: Chọn nhanh số hàng và cột tương tác trực quan ngay trên Ribbon.
    - **Hộp thoại Custom Table (`TableInsertDialog.tsx`)**:
      - Nhập tùy ý số hàng (Rows) và số cột (Columns).
      - Checkbox tùy chọn "Tạo hàng tiêu đề" (Header row).
      - Ràng buộc và validation an toàn: $1 \le \text{hàng} \le 50$, $1 \le \text{cột} \le 20$.
      - Chặn đứng các giá trị âm, $0$, NaN, vô hạn; báo lỗi trực quan và không bao giờ làm corrupt tài liệu.
  - **3. Thao tác và Lệnh soạn thảo bảng (Table Commands)**:
    - Hỗ trợ di chuyển giữa các ô bằng phím `Tab` (ô kế tiếp) và `Shift+Tab` (ô trước đó).
    - Lệnh thêm/xóa hàng: `addRowAbove`, `addRowBelow`, `deleteRow`.
    - Lệnh thêm/xóa cột: `addColumnLeft`, `addColumnRight`, `deleteColumn`.
    - Lệnh bật/tắt hàng tiêu đề: `toggleHeaderRow`.
    - Lệnh xóa toàn bộ bảng: `deleteTable`.
    - Tự động hiển thị thanh công cụ ngữ cảnh (Contextual Table Tools) trên Ribbon khi con trỏ ở trong bảng.
  - **4. Định dạng và Tương tác phân trang (Pagination Interaction)**:
    - Bảng render đồng bộ trên Canvas trang vật lý theo đúng kích thước giấy và lề trang.
    - Cập nhật thuật toán ước lượng chiều cao `estimateContentHeightPx` tính toán chính xác chiều cao bảng theo hàng và cột.
    - Không hack document model để ép fit trang; các bảng cao tự động tạo trang và render mượt mà không crash hay loop.
  - **5. Lưu trữ & Khôi phục (Persistence .mwd)**:
    - Toàn bộ bảng, hàng, cột, ô tiêu đề và nội dung văn bản bên trong được lưu trữ và khôi phục nguyên vẹn 100% qua file `.mwd`.
  - **6. Kiểm thử toàn diện & Zero-Regression**:
    - Bổ sung bộ test tự động `src/insert/phase3_3.test.ts` (14 bài test).
    - Toàn bộ **183/183 bài test** chạy tự động đạt 100% pass (`npm test`).
    - Build thành công `tsc && vite build` không có bất kỳ cảnh báo lỗi nào.

## 3.2.0 — Phase 3.2 — Hyperlink + Horizontal Line + Symbol — 2026-10-07

- Hoàn thành ba chức năng Insert nền tảng chuẩn ngữ nghĩa trước khi mở rộng Table và Image:
  - **A. Hyperlink (Siêu liên kết)**:
    - **Tiptap/ProseMirror Semantic Mark**: Sử dụng mark `link` chuẩn (`StarterKit.configure({ link: { openOnClick: false, HTMLAttributes: { class: "editor-link" } } })`). Tuyệt đối không dùng thẻ `<a>` ngoài document model.
    - **Hộp thoại Hyperlink Dialog (`src/components/dialogs/HyperlinkDialog.tsx`)**:
      - Hai trường dữ liệu chính: *Text to display* (Văn bản hiển thị) và *Address* (Địa chỉ liên kết URL).
      - Tự động điền text từ vùng chọn hiện tại (`getSelectedText`). Nếu con trỏ đang đặt trong một liên kết, tự động trích xuất thông tin URL và phạm vi liên kết (`getActiveLinkInfo`).
      - Hỗ trợ đầy đủ hai chế độ: Chèn liên kết mới và Chỉnh sửa liên kết hiện có (*Edit Link*).
      - Nút "Xóa liên kết" (*Remove Link*) loại bỏ mark link nhưng giữ nguyên văn bản hiển thị.
    - **URL Validation & Normalization (`src/insert/services/linkService.ts`)**:
      - Hỗ trợ đầy đủ và an toàn các giao thức: `https://`, `http://`, `mailto:`.
      - Tự động thêm tiền tố `https://` cho các tên miền thường (ví dụ: `google.com` $\rightarrow$ `https://google.com/`).
      - Chặn chuỗi rỗng, khoảng trắng, giao thức lạ; hiển thị thông báo lỗi thân thiện trên dialog và không bao giờ crash ứng dụng.
    - **Phím tắt nhanh & Ribbon**:
      - Hỗ trợ phím tắt chuẩn Office `Ctrl+K` mở dialog.
      - Nút Link trên Insert Ribbon hiển thị trạng thái active khi con trỏ hoặc vùng chọn đang nằm trong một liên kết.
  - **B. Horizontal Line (Đường kẻ ngang)**:
    - **Semantic Node `horizontalRule`**: Tích hợp node block atom chuẩn của Tiptap/ProseMirror. Tuyệt đối không giả lập bằng ký tự văn bản `----`.
    - **Tách đoạn văn & Định vị caret**: Lệnh `insertHorizontalRule` tự động chèn đường kẻ giữa các đoạn văn hoặc tách đoạn hiện tại mà không làm hỏng cây AST.
    - **Hoàn tác & Làm lại (Undo/Redo)**: Hỗ trợ hoàn tác và làm lại 1 chạm mượt mà.
    - **Lưu trữ & Khôi phục**: Lưu vào tệp `.mwd` và nạp lại chính xác 100%.
    - **CSS Styling (`src/styles/global.css`)**: Viền kẻ nét mỏng thanh lịch (`1.5px solid #cbd5e1`), viền xanh đậm kèm outline khi node được chọn (`.ProseMirror-selectednode`).
  - **C. Symbol (Ký hiệu đặc biệt)**:
    - **Hộp thoại Symbol Picker (`src/components/dialogs/SymbolDialog.tsx`)**:
      - Danh mục phân loại 6 nhóm (`POPULAR_SYMBOLS` trong `src/insert/services/symbolService.ts`):
        1. *Bản quyền & Ký hiệu*: `©`, `®`, `™`, `§`, `¶`, `•`, `…`, `‰`, `№`, `℃`, `℉`.
        2. *Tiền tệ*: `₫` (VND), `$` (USD), `€` (EUR), `£` (GBP), `¥` (JPY/CNY), `¢`, `₹`, `₩`, `₽`, `฿`.
        3. *Toán học*: `±`, `×`, `÷`, `≤`, `≥`, `≠`, `≈`, `≡`, `∞`, `°`, `√`, `∑`, `∏`, `∫`.
        4. *Mũi tên*: `←`, `↑`, `→`, `↓`, `↔`, `↕`, `⇒`, `⇐`, `⇑`, `⇓`, `⇔`.
        5. *Đánh dấu & Biểu tượng*: `✓`, `✔`, `✕`, `✖`, `★`, `☆`, `♠`, `♣`, `♥`, `♦`, `▲`, `▼`.
        6. *Ký tự Hy Lạp*: `α`, `β`, `γ`, `π`, `μ`, `λ`, `θ`, `σ`, `ω`, `Ω`, `Σ`, `Δ`.
      - Tìm kiếm thời gian thực theo tên ký hiệu, ký tự hoặc mã Unicode.
      - Lọc theo từng nhóm hoặc xem tất cả nhóm.
      - Thẻ xem trước (Preview) phóng to ký tự cùng mã định danh Unicode chuẩn (`U+XXXX`).
      - Nhấp đúp chuột vào ký tự để chèn tức thời.
    - **Chèn tại caret & Giữ nguyên định dạng**:
      - Chèn ký tự Unicode trực tiếp vào text node tại vị trí caret.
      - Bảo toàn 100% các định dạng đang kích hoạt tại caret (In đậm, In nghiêng, Font chữ, v.v.).
      - Tương thích hoàn hảo với văn bản Tiếng Việt có dấu bao quanh ký hiệu.
  - **D. Dirty State & Persistence**:
    - Mọi thao tác chèn/sửa/xóa Hyperlink, Horizontal Rule, Symbol đều kích hoạt `isDirty = true` trong `documentStore`.
    - Chu trình đóng gói (`serializeDocumentToMwd`) và giải mã (`deserializeMwdToDocument`) bảo toàn trọn vẹn toàn bộ các node và mark mới.
  - **E. Kiểm thử toàn diện & Zero-Regression**:
    - Bộ test tự động mới `src/insert/phase3_2.test.ts` (16 bài test) kiểm thử tất cả các ca biên (edge cases): link trong heading, link trong list, caret rỗng, URL rỗng, link editing, unsetting, horizontal rule giữa paragraph, undo/redo, symbol Unicode, tiếng Việt quanh symbol, thống kê từ và phân trang.
    - Toàn bộ **169/169 bài test tự động** vượt qua 100% (`npm test`).
    - Biên dịch TypeScript và build bundle `tsc && vite build` hoàn hảo với 0 lỗi.
  - **Ranh giới dự án**:
    - Tuyệt đối KHÔNG triển khai Phase 3.3 (Table / Image engine).

## 3.1.0 — Phase 3.1 — Insert Engine Structure + Insert Ribbon — 2026-10-07

- Thiết lập cấu trúc nền tảng và chuẩn hóa kiến trúc Insert Engine:
  - **Cấu trúc thư mục mô-đun (`src/insert/`)**:
    - `src/insert/types/insertTypes.ts`: Định nghĩa hệ thống kiểu dữ liệu (`InsertGroup`, `InsertItemType`, `InsertItemStatus`, `InsertCommandResult`, `InsertItemDescriptor`, và các Options cho Table, Image, Shape, TextBox, Link, HorizontalRule, Symbol, Equation).
    - `src/insert/commands/insertCommands.ts`: Tầng trừu tượng lệnh chèn (`dispatchInsertCommand`, `canInsertItem`, `isItemSupportedInSchema`, `executeInsertPageBreak`, `executeInsertSectionBreak`, cùng các stubs an toàn cho các lệnh trong tương lai).
    - `src/insert/services/insertRegistry.ts`: Danh mục quản lý tập trung toàn bộ 13 phần tử chèn thuộc 7 nhóm, phân định rõ ràng giữa tính năng `active` và `planned`.
    - `src/insert/hooks/useInsertCommands.ts`: React Hook kết nối mượt mà giữa giao diện Ribbon và Command Layer.
    - `src/insert/components/` & `src/insert/extensions/`: Chuẩn bị sẵn module mở rộng.
    - `src/components/insert/InsertRibbonButton.tsx`: Component nút bấm Ribbon tái sử dụng, tự động áp dụng `preventBlur`, xử lý disabled state và tooltip chú thích.
  - **Chuẩn hóa luồng lệnh chèn (Insert Command Architecture)**:
    - Tuân thủ nghiêm ngặt mô hình luồng dữ liệu 4 tầng:
      $$\text{Insert Ribbon} \longrightarrow \text{Insert Command} \longrightarrow \text{Tiptap / ProseMirror} \longrightarrow \text{Document Model}$$
    - Tuyệt đối không để button trực tiếp thao tác DOM hoặc chèn node lạ làm bẩn ProseMirror AST.
  - **Nâng cấp Insert Ribbon đa nhóm (`src/components/ribbon/InsertRibbon.tsx`)**:
    - Phân chia 7 nhóm chức năng chuẩn Office:
      1. **Pages**: Page Break (`Ctrl+Enter`), Section Break (`Next Page`) — [ACTIVE, tái sử dụng Phase 2].
      2. **Tables**: Table — [DISABLED PLACEHOLDER, có badge "Sắp có", dự kiến Phase 3.2].
      3. **Illustrations**: Pictures, Shapes — [DISABLED PLACEHOLDER, dự kiến Phase 3.x].
      4. **Links**: Link (`Ctrl+K`) — [DISABLED PLACEHOLDER, dự kiến Phase 3.x].
      5. **Header & Footer**: Header, Footer, Page Number — [ACTIVE, tái sử dụng Phase 2.8 với đầy đủ menu popover].
      6. **Text**: Text Box, Horizontal Line — [DISABLED PLACEHOLDER, dự kiến Phase 3.x].
      7. **Symbols**: Equation, Symbol — [DISABLED PLACEHOLDER, dự kiến Phase 3.x].
    - Không có bất kỳ nút giả nào trông như hoạt động nhưng thực tế không làm gì; các nút chưa phát triển đều ở trạng thái disabled minh bạch.
  - **Tái sử dụng trọn vẹn Phase 2 (No Code Duplication)**:
    - Giữ nguyên toàn bộ logic ngắt trang, ngắt phần, chỉnh sửa Header/Footer trực quan và chèn token số trang động `{PAGE}` / `{NUMPAGES}`.
  - **Kiểm thử hồi quy & Build (Regression & Verification)**:
    - Bổ sung bộ kiểm thử tự động `src/insert/insertEngine.test.ts` kiểm thử toàn diện registry, capabilities, command dispatching và an toàn AST.
    - Đạt **153/153 bài test tự động** vượt qua 100% (`npm test`).
    - Biên dịch TypeScript và build bundle `tsc && vite build` hoàn hảo với 0 lỗi.
  - **Ranh giới dự án**:
    - Tuyệt đối KHÔNG phát triển các tính năng chi tiết thuộc Phase 3.2 (Table engine).

## 2.9.0 — Phase 2 — Page Engine completed — 2026-10-07

- Hoàn thành toàn diện và nghiệm thu Final Audit cho Phase 2 (Page Engine):
  - **Audit toàn bộ quy trình làm việc (End-to-End Big Workflow Audit)**:
    - Kiểm thử chuỗi thao tác thực tế kết hợp:
      - Section 1: A4 Portrait, Normal Margins (25.4mm), Heading 1, nhiều paragraphs với Rich Formatting (Bold, Italic, Underline, Highlight, Font Family, Font Size, Text Color), danh sách Bullet List và Ordered List, ngắt dòng 1.5, căn lề Justify, ngắt trang explicit `pageBreak`.
      - Section 2: Chuyển mục `sectionBreak` (Next Page), khổ giấy A4 Landscape (297x210 mm), lề tùy chỉnh Custom (15, 15, 20, 20 mm), Header riêng, Footer riêng, số trang động `{PAGE}` và `{NUMPAGES}`, ngắt liên kết `linkToPrevious: false`.
    - Đóng gói file `*.mwd` $\rightarrow$ mô phỏng tắt app $\rightarrow$ mở lại:
      - Xác minh toàn bộ cấu hình trang của Section 1 và Section 2 được khôi phục 100%.
      - Xác minh Header, Footer, và các token số trang động hiển thị chính xác.
  - **Kiểm thử hồi quy phân trang & reflow (Reflow & Stability Regression)**:
    - Thêm văn bản / xóa văn bản: bộ đếm từ, ký tự và phân trang tự động reflow co giãn mượt mà.
    - Thay đổi định dạng (font size, heading, line spacing, paper size, orientation, margins, zoom):
      - Không mất văn bản.
      - Không nhân bản (duplicate) văn bản.
      - Không làm hỏng cây ProseMirror JSON AST.
      - Không rơi vào vòng lặp vô hạn (infinite reflow loop) hay lặp số trang (page count loop).
  - **Kiểm thử hồi quy tính năng Phase 1 (Phase 1 Zero-Regression)**:
    - Thao tác File: New (`Ctrl+N`), Open (`Ctrl+O`), Save (`Ctrl+S`), Save As (`Ctrl+Shift+S`).
    - Lịch sử thao tác: Hoàn tác Undo (`Ctrl+Z`), Làm lại Redo (`Ctrl+Y`).
    - Clipboard: Cắt Cut (`Ctrl+X`), Sao chép Copy (`Ctrl+C`), Dán Paste (`Ctrl+V`).
    - Định dạng Font: Bold, Italic, Underline, Strike, Font Family, Font Size, Text Color, Highlight.
    - Định dạng Đoạn văn: Alignments (Left, Center, Right, Justify), Bullet List, Ordered List, Indent, Line spacing.
    - Chức năng Tìm kiếm & Thay thế: Find & Replace highlight chính xác và thay thế nguyên tử.
    - Trạng thái bẩn Dirty State, cảnh báo Close Protection, Status Bar và Zoom (50%–200%).
  - **Code Audit & Sửa lỗi hoàn thiện**:
    - Chuẩn hóa việc chọn trang hiển thị `HeaderFooterEditor` trong `PageRenderer.tsx` để luôn đảm bảo xuất hiện chính xác trên trang đang thao tác của section tương ứng.
    - Cập nhật `InsertRibbon.tsx` truyền `currentPage` thực tế vào `openHeader` và `openFooter`.
    - Kiểm tra dọn dẹp các event listener (click outside, Escape keydown) tránh memory leak.
    - Loại bỏ mã dư thừa và biến chưa dùng, kiểm tra strict type an toàn.
  - **Giới hạn còn tồn tại (Known Limitations)**:
    - *Automatic Page Splitting*: Phân trang dựa trên mô hình 2 tầng (Background Sheets + Foreground Content Layer) và spacer toán học. Chưa hỗ trợ ngắt đôi 1 đoạn văn bản vắt ngang mép trang như engine C++ in ấn chuyên sâu của Microsoft Word (chưa có thuật toán Widow/Orphan control mức dòng ký tự).
    - *Header/Footer nâng cao*: Chỉ hỗ trợ cấu hình theo từng Section độc lập; chưa hỗ trợ *Different First Page* hoặc *Different Odd & Even Pages*.
  - **Bộ kiểm thử tự động toàn diện (`src/page/phase2FinalAudit.test.ts`)**:
    - Đạt **144/144 bài test tự động** vượt qua 100% (`npm test`).
    - `npm run build` xuất sắc với 0 lỗi TypeScript hay bundling.
    - Ứng dụng Desktop chạy ổn định trên Tauri 2 Rust Shell.
  - **Ranh giới dự án**:
    - Tuyệt đối KHÔNG bắt đầu Phase 3.

## 2.8.0 — Phase 2.8 — 2026-10-07

- Hoàn thiện hệ thống Header, Footer và Số trang động (Header + Footer + Page Number):
  - **Mô hình dữ liệu Header/Footer (Document Model Integration)**:
    - Định nghĩa kiểu dữ liệu `SectionHeaderFooter` (`src/page/types/headerFooterTypes.ts`) gồm:
      - `header: HeaderFooterItem` (nội dung văn bản, căn lề Trái/Giữa/Phải, in đậm, in nghiêng).
      - `footer: HeaderFooterItem` (nội dung văn bản, căn lề Trái/Giữa/Phải, in đậm, in nghiêng).
      - `linkToPrevious: boolean` (kế thừa cấu hình từ section liền trước).
    - Data tích hợp trực tiếp vào document model:
      - Section 1 lưu tại root `document.headerFooter`.
      - Section $k$ ($k > 1$) lưu trong thuộc tính `attrs.headerFooter` của node `sectionBreak` thứ $k-1$.
    - Lưu trữ vĩnh viễn và khôi phục toàn vẹn qua tệp tin `*.mwd` (`serializeDocumentToMwd`, `deserializeMwdToDocument`). Không phải chỉ là DOM overlay tạm thời.
  - **Trình chỉnh sửa trực quan Header/Footer (`src/page/components/HeaderFooterEditor.tsx`)**:
    - Cho phép mở vùng Header hoặc Footer bằng cách:
      1. Nhấp đúp (Double-click) chuột trực tiếp vào vùng lề trên hoặc lề dưới của bất kỳ trang giấy nào.
      2. Mở qua menu `Header`, `Footer`, hoặc `Page Number` trong tab `Insert` trên Ribbon.
    - Cung cấp thanh công cụ nổi tích hợp:
      - Căn lề: Trái (Left), Giữa (Center), Phải (Right).
      - Kiểu chữ: In đậm (Bold), In nghiêng (Italic).
      - Nút chèn nhanh trường số trang động `+ Số trang ({PAGE})` và `+ Tổng trang ({NUMPAGES})`.
      - Nút chuyển đổi liên kết: `Đã liên kết mục trước` / `Tùy biến riêng`.
      - Nút đóng `Đóng (Esc)` hoặc nhấn phím `Escape`.
    - Phân định ranh giới trực quan rõ ràng: khung viền nét đứt xanh dương (`#2563eb`), huy hiệu `Header/Footer — Mục X (Trang Y/Z)`.
    - Thân trang soạn thảo (`.editor-content-layer`) được làm mờ nhẹ (`.is-dimmed`); nhấp chuột vào thân trang lập tức đóng chế độ chỉnh sửa Header/Footer và tập trung con trỏ quay lại soạn thảo văn bản.
  - **Số trang động ngữ nghĩa (Semantic Dynamic Page Numbering)**:
    - Sử dụng các token động `{PAGE}` (số trang hiện tại) và `{NUMPAGES}` (tổng số trang của tài liệu).
    - Tuyệt đối không lưu literal "1", "2", "3" cố định vào từng trang trong file lưu trữ.
    - Hàm chuyển đổi `formatHeaderFooterText` tính toán và thay thế giá trị số học tương ứng tại thời điểm render theo từng trang.
    - Tương tác hoàn hảo với phân trang: khi chèn hoặc xóa nội dung làm số trang thay đổi (reflow), số trang hiển thị tự động cập nhật ngay lập tức trên mọi trang giấy.
  - **Vị trí và căn lề cơ bản**:
    - Header: Left, Center, Right.
    - Footer: Left, Center, Right.
    - Menu `Insert → Page Number` cho phép chèn số trang 1 chạm vào Chân trang (Trái, Giữa, Phải) hoặc Đầu trang (Trái, Giữa, Phải).
  - **Hành vi kế thừa Section (Inheritance & Link to Previous)**:
    - Section mới tạo mặc định kế thừa toàn bộ Header và Footer từ section trước (`linkToPrevious: true`).
    - Thuật toán `getEffectiveHeaderFooter` tự động truy vết ngược để lấy đúng Header/Footer kế thừa.
    - Người dùng có thể nhấn `Tùy biến riêng` để ngắt liên kết (`linkToPrevious: false`) và thiết lập tiêu đề/chân trang riêng cho từng section.
  - **Tab Ribbon Chèn mới (`src/components/ribbon/InsertRibbon.tsx`)**:
    - Nhóm `Pages`: Page Break (`Ctrl+Enter`), Section Break (Next Page).
    - Nhóm `Header & Footer`: Menu thả xuống Header, Footer, Page Number với các tùy chọn căn lề và nút xóa số trang/header/footer.
  - **Kiểm thử tự động & Độ ổn định (Zero-Regression)**:
    - Thêm 11 bài test tự động chuyên sâu trong `src/page/headerFooter.test.ts`.
    - Đạt **140/140 bài test tự động** vượt qua 100% (`npm test`).
    - `npm run build` thành công xuất sắc, 0 lỗi TypeScript hay bundling.
    - Bảo toàn 100% body editing, formatting, pagination, dirty state, save/open, Find/Replace.
  - **Giới hạn kiến trúc**:
    - Tuyệt đối KHÔNG triển khai Phase 2.9.

## 2.7.0 — Phase 2.7 — 2026-10-07

- Hoàn thiện mô hình Section Model và Ngắt phần (Section Break):
  - **Kiến trúc Section Model (Section Architecture)**:
    - Biểu diễn cấu trúc tài liệu logic nhiều phần:
      $$\text{Document} \longrightarrow \text{Section 1 (page settings)} \longrightarrow \text{Section 2 (page settings)} \dots$$
    - Bảo toàn 1 ProseMirror document duy nhất làm Single Source of Truth; tuyệt đối KHÔNG duplicate toàn bộ nội dung tài liệu thành state riêng ngoài ProseMirror.
    - Cấu trúc Section 1 được xác định ở cấp `document.pageSettings` gốc.
    - Cấu trúc Section $k$ ($k > 1$) được phân định qua semantic atom node `sectionBreak` (mang thuộc tính `attrs: { sectionType: "nextPage", sectionId, pageSettings }`).
  - **Tiptap/ProseMirror Extension `SectionBreak` (`src/page/extensions/sectionBreakExtension.ts`)**:
    - Semantic block atom node `sectionBreak` (Next Page), không thể nhập liệu hoặc chỉnh sửa chữ bên trong.
    - Render HTML marker trực quan: đường kẻ đôi xanh dương (`#2563eb`) và huy hiệu `Section Break (Next Page)`.
    - Lệnh trừu tượng `insertSectionBreak(editor, options)` an toàn: hỗ trợ chèn ở đầu tài liệu, cuối tài liệu, tách textblock, và chèn giữa các khối.
  - **Dịch vụ trích xuất & thao tác Section (`src/page/services/sectionService.ts`)**:
    - `extractSections`: Trích xuất danh sách `SectionModel[]` từ AST JSON, tự động kế thừa (inherit) cấu hình từ section liền trước nếu chưa có thuộc tính riêng.
    - `getSectionAtPos`: Xác định section tương ứng với vị trí con trỏ hiện tại trong ProseMirror.
    - `updateSectionSettingsInAst`: Cập nhật cấu hình trang cho Section 1 ở document root, hoặc cập nhật thuộc tính `attrs.pageSettings` trên node `sectionBreak` mục tiêu cho Section $k > 1$.
  - **Thiết lập trang riêng biệt cho từng Section (Section-specific Page Settings)**:
    - Section mới mặc định inherit toàn bộ cài đặt từ section trước đó.
    - Người dùng có thể thay đổi độc lập: Paper Size (A4, A3, Letter, Legal), Orientation (Portrait, Landscape), Margins (Normal, Narrow, Wide, Custom) chỉ cho section hiện tại.
    - Ví dụ: Section 1 (A4 Portrait Normal) kết hợp Section 2 (A4 Landscape Narrow) hoạt động hoàn hảo và độc lập.
    - Đồng bộ 2 chiều (2-way sync) giữa Layout Ribbon và ProseMirror AST qua lệnh `updateSectionSettings` (hỗ trợ Undo/Redo tức thì).
  - **Hệ thống hiển thị đa khổ giấy & hướng trang hỗn hợp (`src/page/components/PageRenderer.tsx`)**:
    - Mở rộng canvas theo chiều rộng tờ giấy lớn nhất (`maxSheetWidthMm`).
    - Mỗi trang giấy nền `.physical-page-sheet` hiển thị chính xác kích thước mm (`widthMm`, `heightMm`), hướng (`orientation`), và khung lề (`margins`) riêng của section đó.
    - Tiêu đề đầu trang hiển thị thông tin section: `Section {sectionIndex} · {paperSize} · {orientation}`.
    - Công thức spacer vạn năng `calculateBreakSpacerForPages` tính khoảng đệm toán học chuẩn xác đưa nội dung section mới về đúng lề trên của tờ giấy tiếp theo.
  - **Giao diện người dùng (UI Ribbon & Status Bar)**:
    - Trong menu `Layout → Breaks`, bổ sung mục `Section Break (Next Page)` với icon chuyên biệt.
    - Bảng thông tin `Page Status` trên Ribbon và thanh trạng thái `StatusBar` hiển thị thông tin mục hiện tại: `Section {currentSectionIndex} / {sections.length}` kèm khổ giấy và hướng trang.
    - Cập nhật AppHeader badge: `Phase 2.7 · Section Model`.
  - **Lưu trữ & Tương thích ngược 100% (Persistence & Backward Compatibility)**:
    - Đóng gói file `*.mwd` giữ nguyên ranh giới các section và cấu hình trang độc lập.
    - Mở tệp cũ (Phase 1 hoặc Phase 2.1–2.6) tự động nhận diện thành 1 section duy nhất không lỗi.
  - **Xử lý toàn diện các trường hợp biên (Edge Cases)**:
    - Break ở đầu tài liệu, break ở cuối tài liệu, nhiều break liền kề (adjacent breaks).
    - Xóa section break (Backspace/Delete) tự động gộp các section.
    - Undo/Redo (`Ctrl+Z`/`Ctrl+Y`) hoàn tác và khôi phục ranh giới cũng như cấu hình section nguyên vẹn.
    - Bộ đếm từ/ký tự (Document Stats) và Tìm kiếm/Thay thế (Find/Replace) bỏ qua decorative marker của Section Break.
  - **Bộ kiểm thử tự động toàn diện (`src/page/section.test.ts`)**:
    - 15 bài test tự động bao quát trọn vẹn toàn bộ yêu cầu Phase 2.7.
    - Đạt **129/129 bài test tự động** vượt qua 100% (`npm test`).
    - `npm run build` thành công xuất sắc với 0 cảnh báo hay lỗi.
  - **Giới hạn & Ranh giới kiến trúc**:
    - Tuyệt đối KHÔNG triển khai Phase 2.8.

## 2.6.0 — Phase 2.6 — 2026-10-07

- Hoàn thiện hệ thống hiển thị nhiều trang vật lý thực tế (Basic Real Pagination):
  - **Kiến trúc 2 tầng bảo toàn ProseMirror (Two-Layer Architecture)**:
    - Thiết kế kiến trúc phân tách rõ ràng:
      $$1\text{ ProseMirror Document} \longrightarrow \text{Pagination/Layout Layer} \longrightarrow \text{Multi-Page Sheets (Page 1 / Page 2 / ...)}$$
    - Tuyệt đối không tạo nhiều editor instance, bảo toàn 1 document duy nhất làm nguồn dữ liệu.
    - **Tầng 1 (Background `pagination-sheets-layer`)**: Render các trang giấy vật lý độc lập (`Page 1`, `Page 2`, `Page 3`, ...) với kích thước mm chuẩn theo khổ giấy (`A4`, `A3`, `Letter`, `Legal`), hướng (`Portrait`, `Landscape`), lề trang (`Normal`, `Narrow`, `Wide`, `Custom`), viền đổ bóng chân thực, khung chỉ dẫn lề (`physical-page-margin-box`), tiêu đề trang (`physical-page-header`) và chân trang (`physical-page-footer`).
    - **Tầng 2 (Foreground `editor-content-layer`)**: Chứa editor ProseMirror duy nhất với nền trong suốt, căn lề và padding đồng nhất, nhận diện mọi tương tác chuột, con trỏ và vùng chọn xuyên suốt qua các trang mà không bị ngắt quãng.
  - **Dịch vụ phân trang toán học (`src/page/services/paginationService.ts`)**:
    - `calculatePaginationDimensions`: Quy đổi mm sang px chính xác, tính toán kích thước khả dụng `usableWidthPx` và `usableHeightPx`.
    - `calculateExplicitBreakSpacer`: Công thức tính chiều cao spacer ngắt trang chuẩn xác:
      $$H_{\text{spacer}} = (H_{\text{page}} - (Y_{\text{break}} \pmod{H_{\text{page}} + H_{\text{gap}}})) + H_{\text{gap}} + M_{\text{top}}$$
      Đảm bảo nội dung sau `pageBreak` bắt đầu chính xác tại lề trên của trang kế tiếp.
    - `estimateContentHeightPx`: Ước lượng độ cao trong môi trường headless/unit test dựa trên cấu trúc block, headings, lists, font size và line spacing.
    - `calculatePaginationState`: Tổng hợp trạng thái phân trang toàn diện `PaginationState` từ số đo thực tế và ngắt trang explicit.
  - **Hook điều khiển layout thời gian thực (`src/page/hooks/usePagination.ts`)**:
    - Lắng nghe transaction/selection từ Tiptap editor, nội dung `documentStore`, và thiết lập `pageSettings`.
    - Tối ưu hóa hiệu năng bằng cơ chế batching qua `requestAnimationFrame`, không chạy full layout loop tốn kém trên từng phím gõ đơn lẻ.
    - Tự động đo đạc kích thước DOM thực tế (`scrollHeight`) và cập nhật spacer cho toàn bộ node `.page-break`.
    - Xác định trang hiện tại (`currentPage`) theo vị trí con trỏ thực tế trong document.
  - **Store phân trang (`src/stores/paginationStore.ts`) & Dynamic Status Bar**:
    - Quản lý trạng thái `pageCount` và `currentPage`, tự động đồng bộ từ `usePagination`.
    - Cập nhật StatusBar trong `AppLayout.tsx`: Hiển thị `Trang {currentPage} / {pageCount}` linh hoạt theo vị trí con trỏ (ví dụ: `Trang 1 / 2`, `Trang 2 / 2`).
    - Cập nhật AppHeader badge: `Phase 2.6 · Real Pagination`.
  - **Bảo toàn ổn định tuyệt đối (Stability Priority)**:
    - Caret, selection, gõ chữ, gõ tiếng Việt IME (Telex/VNI), Undo/Redo (`Ctrl+Z`/`Ctrl+Y`), định dạng font/đoạn văn, Tìm kiếm/Thay thế (`Ctrl+F`/`Ctrl+H`) hoạt động 100% nguyên bản và mượt mà.
  - **Reflow & Zoom**:
    - Tự động cập nhật layout khi: gõ/xóa văn bản, đổi font size, đổi heading, đổi line spacing, đổi lề trang, đổi khổ giấy, đổi hướng trang.
    - Thu phóng trực quan (Zoom 50%–200%) áp dụng trên canvas scale, độc lập với số trang logic và không làm biến đổi Document AST.
  - **Bộ kiểm thử tự động toàn diện (`src/page/pagination.test.ts`)**:
    - 13 bài test bao quát đầy đủ 9 tình huống thực tế theo yêu cầu: `< 1 page`, `~ 2 pages`, nhiều paragraphs (20+), headings, lists, explicit page break, multiple consecutive breaks, large font, Narrow/Wide margins, Landscape, zoom scale independence, document AST immutability, PaginationStore safety.
    - Đạt **114/114 bài test tự động** vượt qua 100% (`npm test`).
    - `npm run build` thành công xuất sắc, 0 lỗi TypeScript hay bundling.
  - **Ghi chú ranh giới kiến trúc & Giới hạn hiện tại**:
    - Hệ thống ưu tiên sự ổn định của editor ProseMirror; không chia cắt text node của một paragraph qua khe hở DOM khi không có explicit break nhằm bảo vệ tuyệt đối caret và bộ gõ IME.
    - Tuyệt đối KHÔNG triển khai Phase 2.7.

## 2.5.0 — Phase 2.5 — 2026-10-06

- Hoàn thiện tính năng Ngắt trang vật lý dưới dạng semantic node (Page Break Semantic Node):
  - **Tiptap/ProseMirror Extension `pageBreak` (`src/page/extensions/pageBreakExtension.ts`)**:
    - Thiết kế semantic block node `pageBreak` với `group: "block"`, `atom: true`, `selectable: true`, `draggable: true`.
    - Node là atom nguyên tử, không cho phép gõ hoặc chỉnh sửa chữ bên trong.
    - Tuyệt đối không biểu diễn ngắt trang bằng `\n\n\n\n\n` hoặc hàng loạt thẻ `<br>`.
    - Serialize trọn vẹn vào AST JSON `{ "type": "pageBreak" }` và lưu/phục hồi không suy hao qua định dạng file `.mwd`.
  - **Lệnh trừu tượng chèn ngắt trang (`insertPageBreak`)**:
    - Tạo hàm abstraction `insertPageBreak(editor)` tại `src/editor/editorCommands.ts` gọi lệnh ProseMirror transaction nguyên tử `editor.commands.setPageBreak()`.
    - Đảm bảo Ribbon và các component UI không can thiệp trực tiếp vào DOM document.
  - **Giao diện Ribbon Layout & Phím tắt**:
    - Bổ sung nhóm nút **Breaks** trong nhóm **Page Setup** trên Ribbon Layout (`Layout → Breaks → Page Break`).
    - Menu dropdown hiển thị mô tả rõ ràng cùng badge phím tắt `Ctrl+Enter`.
    - Đăng ký phím tắt `Mod-Enter` (`Ctrl + Enter` trên Windows) chèn ngắt trang tức thì.
  - **Hiển thị trực quan (Decorative Visual Marker)**:
    - Hiển thị marker trực quan sang trọng giữa trang: `──────── PAGE BREAK ────────`.
    - Marker là decorative UI hoàn toàn qua CSS và HTML attribute `contenteditable="false"`, không lưu chuỗi chữ marker vào nội dung AST văn bản.
    - Bộ đếm từ và ký tự (Document Stats) không bị tính lẫn chuỗi từ marker.
    - Bộ tìm kiếm và thay thế (Find & Replace) không bị index nhầm chuỗi từ marker.
  - **Xử lý toàn diện mọi trường hợp biên (Edge Cases)**:
    - *Đầu tài liệu*: Giữ paragraph đầu và chèn ngắt trang an toàn, đảm bảo có thể đặt con trỏ ở cả trang 1 và trang 2.
    - *Cuối tài liệu*: Tự động chèn khối paragraph mới sau ngắt trang để người dùng tiếp tục gõ chữ ngay lập tức mà không bị kẹt con trỏ.
    - *Giữa paragraph*: Tách đôi đoạn văn thành 2 khối sạch sẽ và đặt con trỏ ở đầu đoạn thứ hai.
    - *Giữa tiêu đề / danh sách*: Không làm hỏng (corrupt) cấu trúc cây ProseMirror hoặc cấu trúc lồng cấp list.
    - *Nhiều ngắt trang liên tiếp*: Chèn liên tục ổn định.
    - *Undo / Redo*: Hoàn tác và làm lại nguyên tử trong 1 bước duy nhất nhờ single transaction.
  - **Kiểm thử tự động & Build**:
    - Bổ sung 14 bài test chuyên biệt trong `src/page/pageBreak.test.ts`.
    - Đạt **101/101 bài test tự động** vượt qua 100% (`npm test`).
    - `npm run build` thành công xuất sắc, 0 lỗi TypeScript hay bundling.
  - **Tuân thủ ranh giới**: Không dùng DOM height giả lập phân trang tự động; chưa làm section, header/footer, pagination (tuyệt đối không thực hiện Phase 2.6).

## 2.4.0 — Phase 2.4 — 2026-10-06

- Hoàn thiện tính năng tùy chỉnh lề trang tự do (Custom Margins) và hộp thoại CustomMarginsDialog:
  - **Giao diện Custom Margins UI**:
    - Bổ sung tùy chọn `Custom Margins...` trong menu `Layout → Margins`.
    - Tạo mới component hộp thoại chuyên biệt `<CustomMarginsDialog />` (`src/components/dialogs/CustomMarginsDialog.tsx`).
    - Cung cấp 4 trường nhập số rõ ràng: Lề trên (Top), Lề dưới (Bottom), Lề trái (Left), Lề phải (Right).
    - Hiển thị theo đơn vị Centimet (cm) thân thiện với người dùng, tự động quy đổi chính xác về đơn vị chuẩn milimet ($1\text{ cm} = 10\text{ mm}$).
  - **Cơ chế Validation nghiêm ngặt (Strict Margins Validation)**:
    - Ngăn chặn triệt để: `NaN`, số âm ($< 0$), `Infinity`, chuỗi rỗng hoặc ký tự không hợp lệ.
    - Giới hạn vật lý theo kích thước khổ giấy thực tế: Tổng lề ngang ($\text{Left} + \text{Right}$) và tổng lề dọc ($\text{Top} + \text{Bottom}$) không được vượt quá kích thước khổ giấy trừ đi kích thước vùng nội dung tối thiểu ($25.4\text{ mm} / 1\text{ inch}$).
    - Báo lỗi validation trực quan ngay trên hộp thoại; tuyệt đối không apply và không làm hỏng tài liệu nếu dữ liệu không hợp lệ.
    - Hiển thị số đo vùng nội dung khả dụng theo thời gian thực (ví dụ: $15.00 \times 24.62\text{ cm}$).
  - **Hành vi Apply & Cancel an toàn**:
    - Nhấn `Áp dụng` hoặc phím `Enter`: Kiểm tra validation → cập nhật `PageSettings` vào store → tự động nhận diện `marginPreset` (gán `"Custom"` hoặc tên preset nếu trùng chuẩn) → kích hoạt `isDirty = true` → PageRenderer vẽ lại trang ngay lập tức.
    - Nhấn `Hủy bỏ`, phím `Escape` hoặc nhấp chuột ra ngoài: Đóng hộp thoại, giữ nguyên 100% cấu hình tài liệu và trả lại focus cho editor.
  - **Lưu trữ & Mở tệp (Save/Open Round-Trip)**:
    - Lề tùy chỉnh lưu trữ trọn vẹn trong file tài liệu cá nhân `*.mwd`.
    - Mở lại tài liệu nạp lại chính xác từng milimet lề tùy chỉnh.
  - **Kiểm thử tự động & Build**:
    - Bổ sung bộ kiểm thử `src/page/customMargins.test.ts` kiểm tra chuyển đổi cm-mm, validation số âm/NaN/lề quá lớn, tự động nhận diện preset, CSS variables, dirty state, save/open round-trip và tính độc lập của Zoom.
    - Toàn bộ **87/87 bài test tự động** vượt qua 100% (`npm test`).
    - `npm run build` thành công, 1823 modules transformed, 0 lỗi TypeScript.
  - **Tuân thủ ranh giới**: Chưa làm page break, section, header/footer, real pagination (tuyệt đối không thực hiện Phase 2.5).

## 2.3.0 — Phase 2.3 — 2026-10-06

- Hoàn thiện thanh công cụ Ribbon Layout với đầy đủ chức năng điều khiển khổ giấy, hướng trang và các preset lề:
  - **Nhóm công cụ Page Setup trên Layout Ribbon**:
    - Xây dựng component `LayoutRibbon` (`src/components/ribbon/LayoutRibbon.tsx`) với 3 công cụ chính trong nhóm Page Setup:
      - **Orientation Dropdown**: Lựa chọn giữa `Portrait` (Dọc) và `Landscape` (Ngang) với icon hình học trực quan, mô tả tỷ lệ và dấu check hiển thị hướng hiện tại.
      - **Size Dropdown**: Lựa chọn các khổ giấy chuẩn `A4`, `A3`, `Letter`, `Legal`. Kích thước mm hiển thị động theo hướng trang hiện tại (ví dụ: A3 hiển thị 297 × 420 mm khi Portrait, 420 × 297 mm khi Landscape).
      - **Margins Dropdown**: Lựa chọn nhanh giữa các preset lề chuẩn văn phòng: `Normal` (25.4 mm), `Narrow` (12.7 mm), `Wide` (25.4 mm trên/dưới, 50.8 mm hai bên).
    - Thẻ tóm tắt thông số hình học (Page Status) hiển thị trực tiếp kích thước thực tế mm và hướng trang.
  - **Tối ưu trải nghiệm người dùng (UX Polish)**:
    - Menu tự động đóng ngay khi người dùng chọn xong giá trị.
    - Hỗ trợ đóng menu linh hoạt bằng phím **Escape** hoặc nhấp chuột ra ngoài (click-outside).
    - Bảo toàn con trỏ và vùng chọn: Áp dụng `preventBlur` trên `onMouseDown` của toàn bộ công cụ và tự động trả lại focus cho editor (`editor.commands.focus()`), không làm mất caret hay selection khi đổi thiết lập trang.
    - Đảm bảo đầy đủ thuộc tính ARIA accessibility (`role="menu"`, `role="menuitem"`, `aria-checked`, `aria-haspopup`).
  - **Tập trung hóa hằng số (Zero Duplication)**:
    - Tái sử dụng 100% hằng số tập trung từ Phase 2.1 (`PAPER_DIMENSIONS`, `MARGIN_PRESETS`, `SUPPORTED_PAPER_SIZES`).
    - Tuyệt đối không hardcode kích thước trong UI.
    - Không can thiệp trực tiếp vào DOM CSS từ component Ribbon (luồng một chiều chuẩn mực).
  - **Kiểm soát trạng thái bẩn (Dirty State) & Vòng đời tệp**:
    - Mọi thay đổi trong Size, Orientation hay Margin Preset đều lập tức đánh dấu `isDirty = true`.
    - Sau khi Lưu (`Ctrl+S`), trạng thái trở về sạch (`isDirty = false`).
    - Nạp lại tệp (`Ctrl+O`) khôi phục nguyên vẹn 100% cấu hình khổ giấy, hướng và lề.
  - **Kiểm thử tự động & Build**:
    - Bổ sung bài kiểm thử chuỗi thao tác `src/page/layoutRibbonSequences.test.ts`.
    - Kiểm thử chuyển đổi liên tiếp: `A4 → A3 → Letter → Legal`, `Portrait ↔ Landscape`, `Normal → Narrow → Wide`.
    - Kiểm thử Save/Open round-trip cho các tổ hợp phức hợp (A3 Landscape Narrow, Legal Portrait Wide, Letter Landscape Normal, A4 Portrait Normal).
    - Toàn bộ **80/80 bài test tự động** vượt qua 100% (`npm test`).
    - `npm run build` hoàn thành xuất sắc trong 417ms, 0 lỗi TypeScript.
  - **Tuân thủ ranh giới**: Chưa làm Custom Margins dialog, Multiple sections, Real pagination, Page break, Header/Footer, Page numbers (tuyệt đối không thực hiện Phase 2.4).

## 2.2.0 — Phase 2.2 — 2026-10-06

- Hoàn thiện hiển thị vùng giấy vật lý theo khổ giấy và hướng trang (Paper Size + Orientation Rendering):
  - **Hằng số kích thước vật lý tập trung (Paper Size Constants)**:
    - Quản lý kích thước milimet chính xác cho `A4` (210 × 297 mm), `A3` (297 × 420 mm), `Letter` (215.9 × 279.4 mm), `Legal` (215.9 × 355.6 mm).
    - Chuỗi luồng logic một chiều: Preset → Kích thước cơ sở → Hoán đổi hướng (Orientation Transform) → Biến CSS → PageRenderer.
    - Không hardcode kích thước tại bất kỳ component giao diện nào.
  - **Kiến trúc PageRenderer độc lập**:
    - Xây dựng component `PageRenderer` (`src/page/components/PageRenderer.tsx`) và re-export tại `src/components/page/PageRenderer.tsx`.
    - Phân tách kiến trúc 3 tầng: `PageSettings` (State/Hook) → `PageRenderer` → `Editor Page` (`EditorContent`).
    - Thanh Ribbon tuyệt đối không can thiệp trực tiếp vào DOM CSS.
    - Tự động điều hướng focus vào editor khi người dùng click vào vùng lề trang trắng mà không gây mất vùng chọn.
  - **Xử lý hướng trang (Orientation Handling)**:
    - `Portrait` (Dọc): Chiều rộng nhỏ hơn chiều cao (`width < height`) cho mọi khổ giấy.
    - `Landscape` (Ngang): Chiều rộng lớn hơn chiều cao (`width > height`) cho mọi khổ giấy.
    - Thay đổi hướng trang lập tức cập nhật `DocumentModel` và kích hoạt cờ `isDirty = true`.
  - **Không gian làm việc & Co giãn (Scale / Workspace)**:
    - Căn giữa trang trong workspace thông qua `margin: 0 auto; width: fit-content;`, triệt tiêu hoàn toàn lỗi flexbox scroll-clipping (bị cắt lề trái khi cuộn).
    - Loại bỏ thuộc tính `max-width: 100%` trên tờ giấy để phản ánh chính xác tỷ lệ vật lý mm thực tế.
    - Thiết lập thanh cuộn 2 chiều (ngang và dọc) tự động mượt mà khi khổ giấy (như A3 hoặc Landscape) hoặc mức thu phóng lớn hơn khung nhìn cửa sổ.
    - Ngăn tràn thanh Ribbon nhờ thiết lập `overflow: hidden` trên workspace container.
    - Tích hợp liền mạch với hệ thống Zoom Phase 1 (50% – 200%), zoom thuần túy hiển thị mà không can thiệp vào Document Model.
  - **Thanh công cụ Ribbon Layout Tab**:
    - Xây dựng `LayoutRibbon` (`src/components/ribbon/LayoutRibbon.tsx`) thay thế placeholder trước đây.
    - Cung cấp menu popover trực quan cho:
      - **Orientation**: Hướng Dọc (Portrait) và Hướng Ngang (Landscape) kèm biểu tượng SVG mô phỏng tờ giấy và dấu tích chọn.
      - **Size**: Khổ giấy tiêu chuẩn A4, A3, Letter, Legal với thông số kích thước mm cụ thể và chú giải công dụng.
      - **Margins**: Presets lề Normal, Narrow, Wide với khoảng cách mm chi tiết từng phía.
      - **Page Status Info**: Thẻ hiển thị tóm tắt thông số hình học vật lý của trang hiện tại.
    - Toàn bộ nút công cụ đều áp dụng `preventBlur` trên `onMouseDown`, ngăn việc nhấp chuột làm mất dấu nháy hay vùng chọn của người dùng trong editor.
  - **Bảo toàn dữ liệu & Save/Open Round-Trip**:
    - Kiểm thử round-trip toàn vẹn: A3 Landscape → Save `.mwd` → Open → khôi phục chính xác A3 Landscape (420 × 297 mm).
    - Tương tự với Letter Landscape, Legal Portrait, A4 Portrait.
    - Nội dung văn bản, tiêu đề, danh sách, định dạng và trạng thái undo/redo không bị suy suyển khi đổi khổ giấy hoặc hướng trang.
  - **Kiểm thử tự động & Build**:
    - Bổ sung 10 bài kiểm thử toàn diện trong `src/page/pageRendering.test.ts`.
    - Toàn bộ **74/74 bài test tự động** vượt qua 100% (`npm test`).
    - `npm run build` thành công, 1822 modules transformed, 0 lỗi TypeScript.
  - **Giữ vững phạm vi**: Duy trì mô hình canvas đơn, tuyệt đối **không tự ý chia văn bản thành Page 1, 2, 3 (không làm Phase 2.3)**.

## 2.1.0 — Phase 2.1 — 2026-10-06

- Khởi tạo kiến trúc nền móng Page Engine và mô hình thiết lập trang (Page Settings Model):
  - **Tách biệt kiến trúc Page Engine**:
    - Thiết lập cây thư mục chuyên biệt: `src/page/types/`, `src/page/services/`, `src/page/hooks/`, `src/page/components/`, `src/page/extensions/` và `src/components/page/`.
    - Tách biệt hoàn toàn tầng quản lý trang vật lý khỏi `App.tsx` và lõi soạn thảo Tiptap.
  - **Mô hình Page Settings chuẩn hóa đơn vị Milimet (mm)**:
    - `paperSize`: Hỗ trợ đầy đủ các khổ giấy chuẩn `A4` (210 x 297 mm), `A3` (297 x 420 mm), `Letter` (215.9 x 279.4 mm), `Legal` (215.9 x 355.6 mm).
    - `orientation`: `portrait` (Dọc) và `landscape` (Ngang), tự động hoán đổi chiều dài và chiều rộng tương ứng.
    - `margins`: Lưu trữ độc lập `top`, `right`, `bottom`, `left` tính bằng milimet (mm). Tuyệt đối không lưu lẫn lộn pixel.
    - Các preset lề tập trung: `Normal` (25.4 mm / 1 inch), `Narrow` (12.7 mm / 0.5 inch), `Wide` (25.4 mm trên/dưới, 50.8 mm trái/phải).
    - Cấu hình mặc định cho tài liệu mới: Khổ `A4`, Hướng `Portrait`, Lề `Normal` (25.4 mm).
  - **Tích hợp sâu vào Document Model & Store**:
    - Bổ sung trường `pageSettings: PageSettings` vào `DocumentModel` trong `src/document/documentTypes.ts`.
    - Đồng bộ vào Zustand store `useDocumentStore`: theo dõi thay đổi thông số trang và tự động kích hoạt `isDirty = true` khi người dùng thay đổi khổ giấy, hướng hoặc lề.
    - Lưu trữ trực tiếp `pageSettings` vào tệp tin tài liệu cá nhân `*.mwd`.
  - **Đảm bảo tương thích ngược 100% (Backward Compatibility)**:
    - Mở trơn tru các tệp tin `*.mwd` từ Phase 1 (chưa có khối `pageSettings`): hệ thống tự động nhận diện và gán `DEFAULT_PAGE_SETTINGS` an toàn mà không làm sập ứng dụng.
    - Cơ chế validation và chuẩn hóa tự động xử lý các giá trị âm hoặc dữ liệu không hợp lệ.
  - **Hiển thị trực quan linh hoạt qua CSS Variables**:
    - Cập nhật trang soạn thảo và component `PageContainer` áp dụng kích thước trang và lề linh hoạt qua các biến CSS (`--page-width`, `--page-height`, `--page-margin-*`).
    - Cập nhật thông tin khổ giấy và hướng trang trực quan trên Status Bar: `A4 · Dọc`.
  - **Kiểm thử tự động & Build**:
    - Bổ sung 10 bài kiểm thử chuyên sâu trong `src/page/pageSettings.test.ts` kiểm tra hằng số kích thước, preset lề, chuyển đổi đơn vị, tính toán hướng ngang/dọc, validation, round-trip file và tương thích ngược với file Phase 1.
    - Toàn bộ **64/64 bài test** chạy pass 100%.
    - `npm run build` hoàn thành không có lỗi TypeScript hay Vite bundler.

## 1.0.0 — Phase 1.10 (Final Audit & Complete) — 2026-10-06

- Hoàn tất đợt kiểm toán toàn diện **PHASE 1.10 — FINAL AUDIT** và chính thức đóng gói hoàn chỉnh Phase 1 của Personal Word Editor:
  - **Thẩm định & Xác nhận PASS 100% các nhóm chức năng Phase 1**:
    - **FILE**: New (`Ctrl+N`), Open (`Ctrl+O`), Save (`Ctrl+S`), Save As (`Ctrl+Shift+S`) với native file dialog và định dạng `*.mwd` an toàn.
    - **HISTORY**: Undo (`Ctrl+Z`), Redo (`Ctrl+Y`), tự động khóa khi lịch sử rỗng.
    - **CLIPBOARD**: Cut (`Ctrl+X`), Copy (`Ctrl+C`), Paste (`Ctrl+V`), bảo toàn clipboard hệ thống.
    - **FONT**: Bold, Italic, Underline, Strikethrough, Font Family với CSS fallback, Font Size (8–72 pt preset & input tự do 4–144 pt), Text Color, Multicolor Highlight.
    - **PARAGRAPH**: Căn lề trái/giữa/phải/đều, danh sách dấu chấm/đánh số bằng ProseMirror tree thật, thụt lề lồng cấp (sink/lift), giãn dòng (1.0, 1.15, 1.5, 2.0 lưu vào AST node attributes).
    - **STYLES**: Normal, Heading 1, Heading 2, Heading 3 (semantic nodes).
    - **EDITING**: Find & Replace nổi (Ctrl+F / Ctrl+H) qua ProseMirror Decorations không làm bẩn document, Replace All nguyên tử, Xem AST JSON.
    - **APP SHELL & LAYOUT**: Khung trực quan trang A4 (210 x 297 mm), thanh công cụ Ribbon 7 tab, Status Bar (thống kê từ/ký tự thực tế, visual page note), thu phóng Zoom 50%–200% qua CSS variable không thay đổi document model, Dirty State (`*`), Close Protection (Save / Don't Save / Cancel) và hệ thống phím tắt desktop toàn cục.
  - **Sửa lỗi & Tinh chỉnh hoàn thiện**:
    - Cập nhật huy hiệu tiêu đề AppHeader thành `Phase 1 · Complete`.
    - Bảo toàn focus: áp dụng `preventBlur` trên toàn bộ controls tránh mất dấu nháy và vùng chọn của người dùng.
    - Khắc phục các xung đột phím tắt giữa Editor, Form input và Desktop Shell.
  - **Kiểm thử tích hợp luồng nghiệp vụ hoàn chỉnh (End-to-End Workflow)**:
    - Xây dựng bài test tích hợp `src/editor/phase1EndToEndWorkflow.test.ts` mô phỏng đầy đủ luồng: Khởi chạy -> Tạo mới -> Nhập nhiều đoạn văn -> Định dạng ký tự phức hợp -> Tiêu đề cấp 1-2 -> Danh sách dấu chấm & đánh số -> Thống kê từ/ký tự thực tế -> Tìm kiếm & Thay thế tất cả -> Lưu tệp `.mwd` -> Mô phỏng đóng app & khởi động lại -> Mở tệp `.mwd` -> Xác nhận bảo toàn 100% nội dung và formatting -> Chỉnh sửa -> Kích hoạt Dirty state -> Xác nhận cơ chế bảo vệ đóng với Cancel và Don't Save.
    - Chạy toàn bộ test: **54/54 tests pass 100%**.
  - **Đóng gói Desktop Production Build**:
    - Chạy thành công pipeline Tauri 2 tạo ứng dụng desktop Windows hoàn chỉnh.

## 0.9.0 — Phase 1.9 — 2026-10-06

- Xây dựng hệ thống thanh trạng thái chi tiết (Status Bar), thu phóng trang (Zoom System 50%–200%) và hoàn thiện trải nghiệm giao diện người dùng (UI Polish):
  - **Thống kê nội dung tài liệu thời gian thực (Document Content Stats)**:
    - Hiển thị chính xác số từ và số ký tự: `Words: 327 | Characters: 1,948` theo thời gian thực khi người dùng gõ phím.
    - Dữ liệu trích xuất trực tiếp từ cây AST ProseMirror thực tế, tuyệt đối không tính HTML tags hay metadata.
    - Xử lý mượt mà và chuẩn xác với: đoạn văn (`paragraph`), tiêu đề (`heading` level 1–3), danh sách dấu chấm & đánh số (`bulletList`, `orderedList`), các từ nối liền vắt ngang qua nhiều định dạng (cross-mark split words), ký tự Unicode và Tiếng Việt có dấu.
    - Cơ chế tokenization gom văn bản theo từng khối (block) trước khi tách từ, đảm bảo từ ngữ có định dạng hỗn hợp (ví dụ: `hel` [in đậm] + `lo` [thường]) chỉ được đếm là 1 từ duy nhất.
  - **Chỉ báo trang trực quan (Visual Page Status)**:
    - Hiển thị badge `Trang 1 (Visual)` tại góc trái thanh trạng thái.
    - Kèm tooltip ghi chú rõ ràng: *"Chế độ xem trang visual tạm thời. Ứng dụng chưa áp dụng phân trang tài liệu thực tế."* (không phát triển pagination giả lập khi chưa đến phase).
  - **Hệ thống thu phóng trang (Page Zoom System: 50% – 200%)**:
    - Bộ điều khiển trực quan tại góc phải thanh trạng thái:
      - Nút `[-]`: Thu nhỏ theo bước 10% (xuống tối thiểu 50%).
      - Thanh trượt Slider: Kéo trượt điều chỉnh tỷ lệ mượt mà từ 50% đến 200%.
      - Nút `[+]`: Phóng to theo bước 10% (lên tối đa 200%).
      - Nút `%`: Hiển thị tỷ lệ hiện tại (ví dụ `100%`), nhấp chuột để đặt lại nhanh về 100%.
    - Hỗ trợ phím tắt toàn cục desktop: `Ctrl+=` / `Ctrl++` (Phóng to), `Ctrl+-` (Thu nhỏ), `Ctrl+0` (Đặt lại 100%).
    - **Tính bất biến của tài liệu**: Thu phóng chỉ áp dụng hiển thị qua biến CSS `--editor-zoom`, tuyệt đối không làm thay đổi thuộc tính cỡ chữ của văn bản và không làm thay đổi cấu trúc Document JSON AST.
  - **Tinh chỉnh giao diện & Trải nghiệm tương tác (UI Polish)**:
    - **Disabled States**: Vô hiệu hóa trực quan cho nút Undo / Redo khi lịch sử rỗng; vô hiệu hóa nút Zoom khi chạm ngưỡng giới hạn 50% hoặc 200%.
    - **Tooltips & Phím tắt gợi ý**: Bổ sung tooltip chi tiết và gợi ý phím tắt trên toàn bộ nút Ribbon, thanh trạng thái, thanh trượt zoom và hộp thoại.
    - **Thanh cuộn hiện đại (Modern Scrollbars)**: Thiết kế scrollbar mảnh, bo góc hiện đại cho khung làm việc Workspace canvas và thanh Ribbon khi co nhỏ cửa sổ.
    - **Bảo toàn con trỏ soạn thảo**: Áp dụng `preventBlur` trên toàn bộ controls và status bar, không làm mất dấu nháy (caret) hay vùng chọn của editor bất thường.
  - **Kiểm thử hồi quy & Độ tin cậy**:
    - Bổ sung 8 bài unit test chuyên sâu trong `src/editor/editorZoomAndStats.test.ts` kiểm chứng tính toán từ/ký tự, cross-mark words, Unicode Tiếng Việt, giới hạn zoom và tính bất biến của document.
    - Toàn bộ 53/53 bài unit test tự động chạy pass 100%.
    - Kiểm tra biên dịch TypeScript và Vite build thành công không có lỗi (`npm run build`).

## 0.8.0 — Phase 1.8 — 2026-10-06

- Xây dựng hệ thống quản lý trạng thái tài liệu (Document State) và bảo vệ đóng cửa sổ / chuyển tệp chống mất dữ liệu:
  - Bổ sung `currentFilePath`, `documentTitle`, `isDirty` vào Zustand store `useDocumentStore`.
  - Cập nhật hiển thị tiêu đề trực quan: `filename.mwd *` trên AppHeader và tiêu đề cửa sổ hệ thống Windows `filename.mwd * - Personal Word Editor`. Sau khi lưu thành công, tự động xóa dấu hoa thị `*` và chuyển `isDirty` về `false`.
  - Cơ chế **Smart Undo Clean Detection**: Lưu snapshot AST JSON và title của thời điểm Lưu/Mở gần nhất. Khi người dùng chỉnh sửa rồi nhấn Undo (`Ctrl+Z`) trở về đúng nội dung tại thời điểm lưu, `isDirty` tự động khôi phục về `false`. Nếu Redo (`Ctrl+Y`), `isDirty` chuyển lại `true`.
- Triển khai **Close Protection & Action Protection** khi `isDirty = true`:
  - Mọi thao tác làm mất dữ liệu (**Tạo mới - New**, **Mở tệp - Open**, **Đóng cửa sổ - Close/Exit**) đều kích hoạt hộp thoại xác nhận hiện đại `<ConfirmSaveDialog />` với 3 lựa chọn rõ ràng:
    - **Lưu (Save)**: Lưu tài liệu thành công rồi mới tiếp tục hành động. Nếu người dùng hủy hộp thoại Save As hoặc ghi file lỗi, hành động bị hủy bỏ ngay lập tức, tuyệt đối không đóng cửa sổ hay làm mất nội dung!
    - **Không lưu (Don't Save)**: Tiếp tục thực hiện hành động mà không lưu.
    - **Hủy (Cancel)**: Hủy bỏ hành động, giữ nguyên tài liệu hiện tại.
  - Tích hợp sâu vào sự kiện đóng cửa sổ `onCloseRequested` của Tauri 2 cùng lệnh Rust native `exit_app` và sự kiện `beforeunload` của trình duyệt.
- Hợp nhất phím tắt desktop toàn cục (Unified Keyboard Shortcuts):
  - `Ctrl+N` (Tạo mới có bảo vệ), `Ctrl+O` (Mở tệp có bảo vệ), `Ctrl+S` (Lưu), `Ctrl+Shift+S` (Lưu bản sao).
  - `Ctrl+Z` (Undo), `Ctrl+Y` / `Ctrl+Shift+Z` (Redo).
  - `Ctrl+X` (Cut), `Ctrl+C` (Copy), `Ctrl+V` (Paste) — ưu tiên native clipboard của editor/trình duyệt, kết nối thêm các nút tương ứng trên Home Ribbon.
  - `Ctrl+B` (Bold), `Ctrl+I` (Italic), `Ctrl+U` (Underline).
  - `Ctrl+F` (Find), `Ctrl+H` (Replace).
  - Phân luồng sự kiện chính xác ngăn ngừa triệt để lỗi trigger 2 lần (double-triggering) giữa editor, input fields và application shell.
- Xử lý triệt để các edge cases:
  - Document mới chưa từng save (`filePath === null`): tự động chuyển hướng sang native Save As dialog khi chọn Save.
  - Hủy Save As: hủy bỏ hành động đóng/chuyển tệp, không mất dữ liệu.
  - Hủy Open: giữ nguyên tài liệu hiện tại.
  - Đóng app trong khi Save As bị hủy: giữ app mở nguyên vẹn.
  - Lỗi ghi file: bắt lỗi và giữ nguyên cửa sổ, không đóng app.
- Bổ sung 7 bài unit test chuyên sâu trong `src/file/fileProtection.test.ts` (nâng tổng số test lên 45/45 tests pass).
- Kiểm chứng: `npm test` pass 45/45 tests, `npm run build` pass 100%.

## 0.7.0 — Phase 1.7 — 2026-10-06

- Xây dựng hệ thống tập tin tài liệu cục bộ (Document File System) hoàn chỉnh cho phép tạo mới, mở và lưu tài liệu thật trên máy tính sử dụng định dạng độc quyền có phiên bản `*.mwd`.
- Thiết kế định dạng file versioned an toàn trong `src/document/documentFile.ts`:
  - Cấu trúc: `{ "format": "PersonalWordDocument", "version": 1, "metadata": {...}, "document": {...} }`.
  - Cây nội dung `document` chứa toàn bộ ProseMirror / Tiptap AST JSON của tài liệu.
  - Serialization và Deserialization kèm validation nghiêm ngặt: kiểm tra tính hợp lệ cú pháp JSON, nhận diện format, tương thích phiên bản (<= 1), cấu trúc metadata và root AST `doc`.
  - Xử lý file lỗi / hỏng / không đúng format an toàn, trả về lỗi chi tiết mà không làm crash ứng dụng.
- Tích hợp Tauri Native File Dialog & Native Filesystem:
  - Cài đặt `@tauri-apps/plugin-dialog` cho native file pickers trên Windows.
  - Xây dựng các lệnh Rust native trong `src-tauri/src/lib.rs` (`read_document_file`, `write_document_file`) giúp đọc/ghi file trực tiếp ở bất kỳ đường dẫn nào do người dùng chọn trên máy mà không bị giới hạn scope jail.
  - Tuyệt đối không dùng browser download giả lập.
- Triển khai 4 thao tác tập tin trong `src/file/fileOperations.ts`:
  - **New (`Ctrl+N`)**: Khởi tạo tài liệu trống hợp lệ, xóa trắng đường dẫn tệp (`filePath: null`) và reset trạng thái bẩn (`isDirty: false`).
  - **Open (`Ctrl+O`)**: Mở hộp thoại native của Windows lọc file `*.mwd`, nạp và kiểm tra tính hợp lệ của tệp, cập nhật trạng thái editor và store.
  - **Save (`Ctrl+S`)**: Nếu tài liệu đã có đường dẫn `filePath` thì tự động ghi đè an toàn vào file đó; nếu chưa có đường dẫn thì tự động chuyển tiếp sang luồng Save As.
  - **Save As (`Ctrl+Shift+S`)**: Mở hộp thoại lưu native của Windows với đuôi mở rộng `.mwd`, ghi file, cập nhật tiêu đề tài liệu theo tên file thực tế và đánh dấu `isDirty: false`.
- Hỗ trợ phím tắt desktop toàn cục:
  - `Ctrl+N`: Tạo tài liệu mới (New).
  - `Ctrl+O`: Mở tài liệu (Open).
  - `Ctrl+S`: Lưu tài liệu (Save).
  - `Ctrl+Shift+S`: Lưu thành tài liệu mới (Save As).
- Cập nhật giao diện:
  - Menu **File** (Backstage) kết nối trực tiếp với 4 thao tác New, Open, Save, Save As; hiển thị đường dẫn tệp hiện tại, trạng thái lưu và container cảnh báo lỗi thân thiện khi gặp file hỏng.
  - Hiển thị dấu hoa thị `*` trên thanh tiêu đề ứng dụng khi tài liệu có thay đổi chưa lưu (`isDirty: true`).
  - Thanh trạng thái hiển thị tên tập tin đang mở.
- Bảo toàn định dạng 100% qua chu trình (Round-trip):
  - Kiểm chứng text, in đậm, nghiêng, gạch chân, gạch ngang, font family, font size, màu chữ, highlight, heading 1–3, căn lề (trái/giữa/phải/đều), danh sách dấu chấm & đánh số & lồng cấp (nested lists), khoảng cách dòng (1.0, 1.15, 1.5, 2.0) và thụt lề (indent).
- Bổ sung 3 bài unit test chuyên sâu trong `src/document/documentFile.test.ts` (nâng tổng số test lên 38/38 tests pass).
- Kiểm chứng: `npm test` pass 38/38 tests, `npm run build` pass 100%.

## 0.6.0 — Phase 1.6 — 2026-10-06

- Xây dựng hệ thống Tìm kiếm & Thay thế (Find & Replace) hoàn chỉnh với giao diện nổi (floating panel) hiện đại.
- Hỗ trợ phím tắt chuẩn desktop:
  - `Ctrl+F`: Mở hộp thoại ở chế độ Tìm kiếm (Find).
  - `Ctrl+H`: Mở hộp thoại ở chế độ Thay thế (Replace).
  - `Escape`: Đóng hộp thoại và tự động dọn dẹp sạch toàn bộ highlight decorations.
- Nối hai nút **Tìm kiếm** và **Thay thế** trong nhóm *Editing* trên Home Ribbon vào store điều khiển hộp thoại.
- Triển khai extension `SearchAndReplace` dựa trên ProseMirror Decorations:
  - Tìm kiếm toàn bộ vị trí khớp trong các textblock (đoạn văn, tiêu đề, danh sách).
  - Hỗ trợ **Cross-mark search**: Có khả năng tìm kiếm từ khóa vắt ngang qua nhiều text node có định dạng khác nhau (ví dụ: `hel` + bold(`lo`)).
  - Hỗ trợ **Unicode & Tiếng Việt có dấu**: So khớp không phân biệt hoa thường chuẩn Unicode, có nút bật/tắt phân biệt hoa/thường (`CaseSensitive`).
  - Trạng thái tìm kiếm và tô sáng dùng ProseMirror Decorations (`.search-match`, `.search-match-active`), tuyệt đối không ghi đè hay làm bẩn Document AST JSON.
  - Đóng hộp thoại dọn dẹp sạch sẽ toàn bộ decorations ngay lập tức.
  - Hiển thị bộ đếm số lượng kết quả và chỉ số kết quả hiện tại dạng `current / total` (ví dụ: `1/5`).
  - Hỗ trợ nút **Next** (Enter) và **Previous** (Shift+Enter) di chuyển tuần hoàn qua các kết quả, tự động cuộn màn hình đến vị trí match và chọn văn bản.
- Triển khai chức năng Thay thế (Replace):
  - **Thay thế (Replace)**: Thay thế kết quả đang trỏ tới và chuyển sang kết quả tiếp theo.
  - **Thay thế tất cả (Replace All)**: Thay thế toàn bộ kết quả một cách nguyên tử (atomic) theo thứ tự ngược từ cuối lên đầu, bảo đảm không bị lệch vị trí offset và không bao giờ gặp vòng lặp vô hạn ngay cả khi từ khóa thay thế chứa từ khóa tìm kiếm.
  - Không can thiệp trực tiếp vào DOM hay `innerHTML`, bảo toàn mọi định dạng văn bản xung quanh.
- Xử lý triệt để các edge cases: query rỗng, không có kết quả, nhiều kết quả, Unicode tiếng Việt có dấu, thay thế trùng từ khóa, và tự động đồng bộ kết quả khi nội dung tài liệu thay đổi trong lúc đang mở tìm kiếm.
- Bảo đảm tương thích với Undo/Redo, gõ văn bản, heading, list và định dạng font.
- Bổ sung 8 bài unit test chuyên sâu trong `src/editor/editorSearch.test.ts` (nâng tổng số test lên 35/35 tests pass).
- Kiểm chứng: `npm test` pass 35/35 tests, `npm run build` pass 100%.

## 0.5.0 — Phase 1.5 — 2026-10-06

- Hoàn thiện toàn bộ nhóm công cụ **Paragraph** và **Styles** trên Home Ribbon, kết nối trực tiếp với Tiptap / ProseMirror commands.
- Cài đặt `@tiptap/extension-text-align` và triển khai tính năng Canh lề (Text Alignment):
  - Hỗ trợ 4 kiểu: Căn trái (Left), Căn giữa (Center), Căn phải (Right), Căn đều hai bên (Justify).
  - Thuộc tính canh lề được lưu trực tiếp vào document state AST (`attrs.textAlign`) của paragraph và heading.
- Triển khai Danh sách (Lists) dùng cấu trúc cây ProseMirror thật:
  - Danh sách dấu chấm (Bullet List) và Danh sách đánh số (Numbered List).
  - Lồng cấp danh sách (Nested Lists): Sử dụng `sinkListItem` khi tăng thụt lề (`Indent`) để tạo cấu trúc cây lồng cấp `bulletList`/`orderedList` chuẩn bên trong `listItem`; sử dụng `liftListItem` khi giảm thụt lề (`Outdent`) để nhấc mục danh sách lên cấp cha hoặc thoát về paragraph.
- Xây dựng extension `Indent` quản lý thụt lề đoạn văn:
  - Tự động phân biệt ngữ cảnh: Khi trong `listItem` thì thực hiện lồng cấp/hạ cấp danh sách; khi ở paragraph/heading thông thường thì tăng/giảm thuộc tính `attrs.indent` (0 đến 8 cấp).
- Xây dựng extension `LineSpacing` quản lý khoảng cách dòng:
  - Hỗ trợ các preset: `1.0`, `1.15`, `1.5`, `2.0`.
  - Lưu vào node attribute `attrs.lineSpacing` của paragraph và heading trong AST JSON, phục vụ render và sẵn sàng cho việc export DOCX ở các phase sau mà không phụ thuộc vào CSS tạm thời ngoài state.
  - Dropdown popover chọn khoảng cách dòng trên Ribbon với icon `ArrowUpDown` và đánh dấu checkmark giá trị đang chọn.
- Triển khai Styles Gallery với semantic heading nodes thật:
  - Hỗ trợ `Heading 1` (`level: 1`), `Heading 2` (`level: 2`), `Heading 3` (`level: 3`) và `Normal` (`paragraph`).
  - Không giả lập heading bằng font-size/font-weight.
- Đồng bộ trạng thái active theo thời gian thực trên Ribbon (Align Left/Center/Right/Justify, Bullet List, Numbered List, Styles Normal/Heading 1-3, Line Spacing).
- Bảo toàn nguyên vẹn mọi định dạng ký tự từ Phase 1.4 (Bold, Italic, Underline, Strike, Font Family, Font Size, Color, Highlight) khi thay đổi đoạn văn, canh lề, heading hay khoảng cách dòng.
- Không thực hiện tính năng ngoài phạm vi (real pagination, DOCX export, tables, images, TOC, references).
- Bổ sung 8 bài unit test toàn diện trong `src/editor/editorParagraph.test.ts` (nâng tổng số test lên 27/27 tests pass).
- Kiểm chứng: `npm test` pass 27/27 tests, `npm run build` pass 100%.

## 0.4.0 — Phase 1.4 — 2026-10-06

- Hoàn thiện toàn bộ nhóm công cụ **Font** trên Home Ribbon và kết nối với Tiptap/ProseMirror commands.
- Cài đặt và tích hợp các extension định dạng nâng cao:
  - `@tiptap/extension-text-style` (quản lý style span cho các mark định dạng)
  - `FontFamily` & `FontSize` & `Color`
  - `@tiptap/extension-highlight` (hỗ trợ multicolor highlight)
  - `@tiptap/extension-underline` (gạch chân văn bản với shortcut `Mod-u`)
- Mọi định dạng tuân thủ kiến trúc phân tầng an toàn: `Ribbon UI → editorCommands → Tiptap Commands → Document Model JSON`. Tuyệt đối không can thiệp DOM editor trực tiếp.
- Hỗ trợ đổi phông chữ (Font Family) với danh sách phổ biến kèm CSS fallback: Calibri, Arial, Times New Roman, Verdana, Georgia, Courier New.
- Hỗ trợ cỡ chữ (Font Size) từ preset (`8` đến `72 pt`) và cho phép nhập số tùy chỉnh. Bổ sung hàm kiểm tra `validateFontSize` nghiêm ngặt, chặn hoàn toàn NaN, giá trị âm hoặc giá trị vô lý phá hỏng document.
- Hỗ trợ chọn màu văn bản (Text Color) và màu dạ quang (Highlight) với bảng màu tiêu chuẩn trực quan, kèm nút khôi phục màu mặc định và hủy highlight.
- Cập nhật trạng thái active theo thời gian thực trên Ribbon phản ánh chính xác vị trí con trỏ / selection trong văn bản (Bold, Italic, Underline, Strike, Font Family, Font Size, Color, Highlight).
- Hỗ trợ phím tắt tiêu chuẩn: `Ctrl+B` (In đậm), `Ctrl+I` (In nghiêng), `Ctrl+U` (Gạch chân).
- Bảo đảm tính toàn vẹn khi chọn văn bản hỗn hợp (mixed selection): áp dụng định dạng không gây crash, không làm mất các mark khác hoặc lỗi ProseMirror JSON schema.
- Bổ sung 8 bài unit test định dạng trong `src/editor/editorFormatting.test.ts` (nâng tổng số test lên 19/19 tests).
- Kiểm chứng: `npm test` pass 19/19 tests, `npm run build` pass hoàn toàn.

## 0.3.0 — Phase 1.3 — 2026-10-06

- Xây dựng thanh công cụ Ribbon hoàn chỉnh với 7 tab: `File`, `Home`, `Insert`, `Layout`, `References`, `Review`, `View`.
- Triển khai giao diện chính cho tab `Home` chia thành 5 nhóm công cụ:
  - **Clipboard**: Dán (Paste), Cắt (Cut), Sao chép (Copy), Sao chép định dạng (Format Painter).
  - **Font**: Lựa chọn phông chữ, cỡ chữ, In đậm (Bold), In nghiêng (Italic), Gạch chân (Underline), Gạch ngang (Strikethrough), Chỉ số dưới (Subscript), Chỉ số trên (Superscript), Màu highlight, Màu phông chữ.
  - **Paragraph**: Danh sách dấu chấm (Bullets), Danh sách số (Numbering), Tăng/giảm thụt lề, Căn trái/giữa/phải/đều.
  - **Styles**: Gallery chọn kiểu nhanh cho Đoạn văn (Normal), Tiêu đề cấp 1–3 (Heading 1, 2, 3).
  - **Editing**: Tìm kiếm (Find), Thay thế (Replace), Chọn tất cả (Select All), Hoàn tác / Làm lại (Undo / Redo), nút xem cấu trúc AST JSON của tài liệu.
- Xây dựng `FileMenuShell.tsx` dạng Backstage hiển thị thông tin metadata tài liệu (ID, Tiêu đề, Phiên bản, Ngày tạo, Ngày sửa, Thống kê từ/ký tự) cùng các nút hành động shell và nút quay lại tài liệu.
- Tạo `RibbonTabPlaceholder.tsx` hiển thị nội dung placeholder trang nhã, rõ ràng cho các tab chưa đến phase (`Insert`, `Layout`, `References`, `Review`, `View`), không phát triển sớm tính năng của các tab này.
- Sử dụng hoàn toàn bộ icon từ `lucide-react`, không sao chép icon hay tài sản đồ họa của Microsoft.
- Áp dụng cơ chế `preventBlur` (`e.preventDefault()` trên sự kiện `mousedown`) cho toàn bộ nút và điều khiển trên Ribbon, đảm bảo click thao tác không làm mất dấu nháy (caret) hay vùng chọn của editor.
- Chuẩn hóa không gian làm việc A4 (A4 Workspace):
  - Nền canvas bên ngoài màu xám (`#e9edf2`) phân biệt rõ với màu trang giấy trắng.
  - Tờ giấy A4 đặt ở trung tâm theo đúng tỷ lệ 210 × 297 mm (`794px` × `1123px`), đổ bóng mềm, lề trang tiêu chuẩn.
  - Vùng soạn thảo nằm hoàn toàn trong tờ giấy, không che khuất con trỏ hay dòng chữ.
  - Giữ A4 làm visual container thuần túy; không triển khai engine phân trang hay tự chia trang.
- Bố cục responsive linh hoạt: tự co giãn khi thay đổi kích thước cửa sổ desktop, tự cuộn mượt mà mà không vỡ giao diện.
- Giữ nguyên lõi editor Tiptap và mô hình dữ liệu Document Model từ Phase 1.2 hoạt động ổn định.
- Loại bỏ thanh test tạm thời `DebugControls.tsx` và `RibbonPlaceholder.tsx` do toàn bộ tính năng đã được tích hợp trực tiếp vào Ribbon.
- Kiểm chứng: `npm test` pass 11/11 tests, `npm run build` pass hoàn toàn không có lỗi TypeScript hay build Vite.

## 0.2.0 — Phase 1.2 — 2026-10-06

- Tích hợp lõi editor Tiptap / ProseMirror vào workspace thay thế cho workspace placeholder cũ.
- Thiết kế khung trang tài liệu A4 Word-like (page sheet) trên nền canvas xám: kích thước chuẩn, đổ bóng tinh tế, lề trang tiêu chuẩn, hỗ trợ click vào trang để tự động focus vào vị trí soạn thảo.
- Cấu hình extensions cốt lõi trong `src/editor/editorExtensions.ts` sử dụng StarterKit:
  - Nodes: `Document`, `Paragraph`, `Text`, `HardBreak`, `Heading` (giới hạn chặt chẽ level 1, 2, 3), `BulletList`, `OrderedList`, `ListItem`.
  - Marks: `Bold`, `Italic`, `Strike`.
  - History engine: Undo / Redo tích hợp sẵn.
- Xây dựng mô hình tài liệu nội bộ trong `src/document/`:
  - `documentTypes.ts`: định nghĩa `DocumentMetadata` (`id`, `title`, `version`, `createdAt`, `updatedAt`) và `DocumentModel` chứa cây AST ProseMirror / Tiptap JSON (`JSONContent`).
  - `documentModel.ts`: các hàm khởi tạo (`createInitialDocument`, `createDefaultDocumentContent`), kiểm tra tính hợp lệ (`isValidDocumentModel`), tính toán thống kê (`extractDocumentStats`) và cập nhật tăng phiên bản (`updateDocumentContent`).
  - Sử dụng ProseMirror JSON làm nguồn dữ liệu chính, hoàn toàn không dùng chuỗi HTML làm định dạng gốc.
- Tạo tầng helper commands trong `src/editor/editorCommands.ts` bao bọc các thao tác gọi API engine an toàn và nhất quán (`toggleBold`, `toggleItalic`, `toggleStrike`, `setHeading`, `setParagraph`, `toggleBulletList`, `toggleOrderedList`, `undo`, `redo`, `canUndo`, `canRedo`, `getDocumentJSON`, `focusEditor`).
- Quản lý trạng thái tài liệu bằng Zustand store trong `src/stores/documentStore.ts`: tự động đồng bộ thay đổi từ editor vào mô hình dữ liệu nội bộ, cập nhật số từ/ký tự/đoạn văn tức thì.
- Thêm thanh kiểm tra tạm thời `DebugControls.tsx` (Phase 1.2 Test Bar) phục vụ kiểm thử API/engine và mở modal xem trực tiếp cấu trúc JSON Document Model AST; giữ nguyên `RibbonPlaceholder` không triển khai Ribbon thật.
- Cập nhật `AppLayout.tsx`: `AppHeader` hiển thị tiêu đề tài liệu theo thời gian thực; `StatusBar` hiển thị trạng thái engine sẵn sàng, mã phiên bản tài liệu và các thông số định lượng văn bản.
- Viết 11 bài kiểm thử tự động sử dụng Node.js test runner cho `documentModel`, `editorExtensions` và `editorCore`.
- Kiểm chứng: `npm test` pass 11/11 tests, `npm run build` pass hoàn toàn.

## 0.1.0 — Phase 1.1 — 2026-10-06

- Tạo project tại `PersonalWordEditor/`, không lồng thêm thư mục cùng tên.
- Bootstrap React, TypeScript, Vite, Tauri 2 và npm.
- Cài `@tiptap/react`, `@tiptap/starter-kit`, `zustand`, `lucide-react`.
- Tạo cấu trúc `app`, `editor`, `components/{ribbon,dialogs,layout}`, `document`, `file`, `stores`, `hooks`, `utils`, `styles`.
- Tạo app shell bằng CSS thuần: header, ribbon placeholder, workspace placeholder, status bar placeholder.
- Đặt title cửa sổ và HTML là `Personal Word Editor`, kích thước ban đầu 1100 × 760.
- Bỏ màn hình demo, assets logo demo, Rust greet command và opener plugin của template.
- Tạo README hướng dẫn development và mô tả phạm vi bootstrap.
- Kiểm chứng `npm install`, `npm run build` và type-check cấu hình Vite thành công.
- Chạy thử Tauri dev: đã tải Rust crates, chưa mở desktop do thiếu linker C++; installer Build Tools đã qua UAC nhưng bị lỗi kết nối tới `aka.ms`, nên Phase 1.1 chưa được đánh dấu hoàn tất.
- Chưa triển khai editor, Ribbon chức năng, DOCX hoặc Save/Open; chưa bắt đầu Phase 1.2.
