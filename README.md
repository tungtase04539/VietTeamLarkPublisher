<div align="center">

# VietTeamLarkPublisher

**Công cụ soạn thảo Markdown & xuất bản lên Lark (Feishu) — nhanh, thông minh, giữ nguyên chất lượng ảnh.**

[![Live Demo](https://img.shields.io/badge/Live%20Demo-Truy%20cập-2ea44f?style=for-the-badge&logo=vercel)](https://publish.raphael.app)
[![License](https://img.shields.io/badge/Giấy%20phép-MIT-blue?style=for-the-badge)](LICENSE)
[![React](https://img.shields.io/badge/React-18-61DAFB?style=for-the-badge&logo=react)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=for-the-badge&logo=typescript)](https://typescriptlang.org)

</div>

---

## ✨ Tính năng chính

| Tính năng | Mô tả |
|-----------|-------|
| 📝 **Soạn thảo Markdown** | Editor thời gian thực, preview đa thiết bị (điện thoại / máy tính bảng / PC) |
| 🎨 **30+ Phong cách** | 5 theme Lark chuyên dụng + 25+ theme đa phong cách |
| 🌐 **Dịch tự động** | Tích hợp Gemini, GPT-4, Claude — dịch song song toàn bộ bài viết |
| 🖼️ **Upload ảnh thông minh** | Tự động match ảnh theo tên file, dịch ảnh có chữ, không resize |
| 📤 **Đăng Lark 1 click** | Publish lên Lark Doc / Wiki, ảnh tự upload, H1 tự làm tiêu đề tài liệu |
| 🗂️ **Chế độ nhiều thẻ** | Quản lý nhiều bài viết cùng lúc theo dạng dashboard |
| 📊 **Thống kê sử dụng** | Theo dõi chi phí API, số lần dịch theo từng thẻ |

---

## 📸 Giao diện

![Giao diện VietTeamLarkPublisher](media/screenshot.png)

---

## 🚀 Cài đặt & Chạy

```bash
# Cài phụ thuộc
pnpm install

# Khởi động môi trường dev
pnpm dev

# Build production
pnpm build
```

---

## 🏗️ Công nghệ sử dụng

- **React 18** + **TypeScript 5** + **Vite**
- **Tailwind CSS** + **Framer Motion**
- **markdown-it** + **highlight.js**
- **Electron** (hỗ trợ chạy như ứng dụng desktop)
- AI: **Gemini / OpenAI / Anthropic / 302.ai**

---

## 📋 Luồng hoạt động

```
Nhập Markdown
    ↓
Dịch (Gemini/GPT/Claude) — song song tất cả đoạn văn
    ↓
Upload ảnh → imageStore (lưu img:// keys, persist localStorage)
    ↓
Áp dụng Theme → Xem trước
    ↓
Đăng lên Lark
  ├── H1 → Tiêu đề tài liệu (tự động xóa khỏi nội dung)
  ├── Ảnh trong danh sách → Image block (không bị mất)
  └── Ảnh lớn → Tự động chia nhỏ, không vượt giới hạn 100k ký tự
```

---

## ⚡ Tối ưu hiệu năng

- **Dịch**: Toàn bộ đoạn văn dịch **song song** (Promise.all)
- **Lưu trữ ảnh**: Tách khỏi `markdownInput`, lưu riêng → thẻ nhỏ gọn
- **localStorage**: Debounce 800ms, không ghi mỗi lần nhấn phím
- **Giải mã Base64→Blob**: Dùng `Uint8Array.from` (~10× nhanh hơn vòng lặp thủ công)
- **Cache log**: In-memory, flush debounce 200ms

---

## 📁 Cấu trúc thư mục

```
src/
├── components/        # Giao diện (Header, DashboardCard, ThemeSelector…)
├── lib/
│   ├── larkPublish.ts # Parser Markdown → Lark blocks
│   ├── larkRunner.ts  # Điều phối xuất bản (wiki + doc)
│   ├── translate.ts   # Dịch đa nhà cung cấp, song song
│   ├── imageStore.ts  # Lưu trữ ảnh bền vững (in-memory + localStorage)
│   ├── cardLog.ts     # Nhật ký hoạt động với bộ nhớ đệm
│   └── themes/        # 30+ phong cách giao diện
└── App.tsx
electron/              # Electron main + preload (chế độ desktop)
```

---

<div align="center">

Được phát triển bởi ❤️ **VietTeam**

</div>
