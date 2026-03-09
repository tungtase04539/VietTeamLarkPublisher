# PRD — Raphael Publish

**Phiên bản:** 1.0  
**Ngày:** 09/03/2026  
**Trạng thái:** Production

---

## 1. Tổng quan sản phẩm

**Raphael Publish** là công cụ web dành cho content creators và marketing teams, giúp biên soạn, dịch, định dạng và xuất bản nội dung Markdown lên nền tảng Lark (Feishu) một cách nhanh chóng — hỗ trợ cả chế độ đơn lẻ lẫn xử lý hàng loạt nhiều tài liệu cùng lúc.

---

## 2. Đối tượng người dùng

| Nhóm             | Nhu cầu                                                          |
| ---------------- | ---------------------------------------------------------------- |
| Content creators | Soạn Markdown, dịch sang Tiếng Việt tự động, xuất lên Lark nhanh |
| Marketing teams  | Xử lý nhiều bài viết cùng lúc (multi-mode), quản lý wiki đích    |
| Quản lý nội dung | Theo dõi chi phí dịch, lịch sử xuất bản, phân tích theo model AI |

---

## 3. Tính năng

### 3.1 Chế độ Single Mode (Đơn)

| Tính năng           | Mô tả                                                                                 |
| ------------------- | ------------------------------------------------------------------------------------- |
| **Markdown Editor** | Soạn thảo với cú pháp highlight, hỗ trợ GFM                                           |
| **Live Preview**    | Xem trước rendered HTML theo theme đang chọn                                          |
| **Theme Selector**  | Chọn phong cách hiển thị (GitHub, Notion, WeChat, v.v.)                               |
| **Image Uploader**  | Drag-and-drop ảnh, tự động match tên file với `![name]()` trong markdown, chèn base64 |
| **Dịch Tiếng Việt** | Dịch markdown toàn bộ bằng AI, bảo toàn cấu trúc code blocks                          |
| **Đăng Lark**       | Xuất bản lên Lark Docs hoặc Lark Wiki (wizard nhiều bước)                             |

### 3.2 Chế độ Multi Mode (Dashboard)

| Tính năng                 | Mô tả                                                           |
| ------------------------- | --------------------------------------------------------------- |
| **Grid thẻ**              | Nhiều thẻ markdown độc lập trên dashboard (responsive 1–3 cột)  |
| **Per-card Editor**       | Mỗi thẻ: tab Soạn thảo / Xem trước                              |
| **Per-card Theme**        | Chọn theme riêng cho từng thẻ                                   |
| **Per-card Image Upload** | Tải ảnh và auto-match cho từng thẻ riêng biệt                   |
| **Per-card Translate**    | Dịch Tiếng Việt độc lập, hiện progress per-card                 |
| **Per-card Lark Publish** | Dialog đóng ngay, publish chạy ngầm, link kết quả hiện cạnh nút |
| **Open Single Mode**      | Mở một thẻ vào full Single Mode để chỉnh sửa chi tiết           |
| **Chọn Model (global)**   | Model AI áp dụng chung cho toàn bộ thẻ trong multi mode         |
| **Persistence**           | Toàn bộ cards (title, content, theme) lưu localStorage          |

### 3.3 Dịch thuật AI

| Tính năng           | Mô tả                                                   |
| ------------------- | ------------------------------------------------------- |
| **Multi-provider**  | Gemini, OpenAI, Anthropic, 302.ai, OpenAI-compatible    |
| **Code protection** | Không dịch code blocks và inline code                   |
| **Chunking**        | Tự chia văn bản lớn thành chunks với progress bar       |
| **Custom prompt**   | Người dùng tự cấu hình system prompt                    |
| **Usage tracking**  | Ghi log mỗi lần dịch: model, tokens, chi phí, thời gian |

### 3.4 Xuất bản Lark

| Tính năng              | Mô tả                                                   |
| ---------------------- | ------------------------------------------------------- |
| **Lark Docs**          | Tạo tài liệu mới trong My Space                         |
| **Lark Wiki**          | Tạo node trong Wiki space tùy chọn                      |
| **Saved Wikis**        | Bookmark wiki URL yêu thích, đồng bộ Supabase           |
| **Auto title**         | Tự extract H1 làm tiêu đề tài liệu                      |
| **Table support**      | Bảng Markdown → Lark table block (sequential insertion) |
| **Background publish** | Multi-mode: dialog đóng, chạy ngầm, trả link            |

### 3.5 Dashboard & Analytics

| Tính năng                | Mô tả                                                     |
| ------------------------ | --------------------------------------------------------- |
| **Tab Dịch thuật**       | KPIs: tổng cost, số phiên, tổng thời gian, tổng tokens    |
| **Breakdown theo model** | Progress bar cost % + TB thời lượng/lần                   |
| **Log table**            | 100 bản ghi gần nhất với model, ngày, thời lượng, cost    |
| **Tab Đăng Lark**        | Danh sách toàn bộ bài đã đăng: tiêu đề, ngày giờ, link mở |
| **Nguồn dữ liệu**        | Badge Supabase / Local, nút Refresh                       |

---

## 4. Kiến trúc kỹ thuật

### Stack

| Layer       | Công nghệ                                     |
| ----------- | --------------------------------------------- |
| Frontend    | React 18, TypeScript, Vite                    |
| Styling     | Tailwind CSS + Vanilla CSS                    |
| Animation   | Framer Motion                                 |
| Icons       | Lucide React                                  |
| Persistence | Supabase (PostgreSQL) + localStorage fallback |
| Markdown    | markdown-it + highlight.js                    |

### Supabase Schema

```
wikis              — Lark wiki bookmarks
translate_logs     — Log dịch thuật (model, tokens, cost, duration)
lark_publish_logs  — Log xuất bản (title, url, created_at)
```

### Cấu trúc thư mục

```
src/
├── components/
│   ├── DashboardCard.tsx       — Thẻ multi-mode (full featured)
│   ├── MultiDashboard.tsx      — Grid layout + top bar
│   ├── EditorPanel.tsx         — Editor single mode
│   ├── PreviewPanel.tsx        — Preview single mode
│   ├── Header.tsx              — App header + mode toggle
│   ├── Toolbar.tsx             — Single mode action bar
│   ├── ImageUploader.tsx       — Full image uploader
│   ├── LarkPublishDialog.tsx   — Wizard xuất bản Lark
│   ├── ThemeSelector.tsx       — Chọn theme
│   ├── TranslateSettingsModal.tsx — Cài đặt AI model
│   └── UsageStatsPanel.tsx     — Dashboard analytics (2 tabs)
└── lib/
    ├── translate.ts            — AI translation engine
    ├── translateSettings.ts    — Model config + local usage
    ├── translateLogStore.ts    — Supabase translate logs
    ├── larkPublish.ts          — Lark Docs API
    ├── larkWiki.ts             — Lark Wiki API
    ├── larkPublishLogStore.ts  — Supabase publish logs
    ├── useLarkPublish.ts       — Background publish hook
    ├── wikiStore.ts            — Supabase wiki bookmarks
    ├── useCardStore.ts         — Multi-mode card state
    ├── supabase.ts             — Supabase client
    ├── markdown.ts             — Render + themes
    └── themes/                 — Theme definitions
```

---

## 5. Luồng người dùng chính

```
Single Mode
  Mở app → Soạn Markdown → Chọn Theme → Tải ảnh → Dịch Việt → Đăng Lark → Xem link

Multi Mode
  Chuyển Multi → Thêm thẻ → Soạn mỗi thẻ → Chọn model (global)
  → Dịch từng thẻ → Lark → Dialog đóng → Chạy ngầm → Link cạnh nút
  → Dashboard → Xem log dịch + danh sách bài đã đăng
```

---

## 6. Roadmap đề xuất

| Ưu tiên  | Tính năng                                                |
| -------- | -------------------------------------------------------- |
| 🔴 Cao   | Auth (Supabase Auth) — mỗi user thấy data của mình       |
| 🔴 Cao   | Sync cards lên Supabase (hiện chỉ localStorage)          |
| 🟡 Trung | Quản lý wiki admin (trang riêng xem/sửa/xóa wiki đã lưu) |
| 🟡 Trung | Export PDF / HTML từ preview                             |
| 🟢 Thấp  | Chia sẻ thẻ qua link                                     |
| 🟢 Thấp  | Template library (tạo thẻ từ mẫu)                        |
| 🟢 Thấp  | Tích hợp Google Docs import                              |
