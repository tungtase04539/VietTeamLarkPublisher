export const defaultContent = `# VietTeamLarkPublisher — Xuất bản Lark chuyên nghiệp

> Công cụ soạn thảo Markdown và xuất bản lên **Lark (Feishu)** dành cho nội dung Việt Nam — nhanh, thông minh, giữ nguyên chất lượng ảnh.

## ✨ Tính năng nổi bật

### 1. Soạn thảo Markdown thời gian thực

Viết Markdown ở bên trái, xem kết quả ngay lập tức ở bên phải với **30+ theme chuyên nghiệp**:

- **5 theme Lark** tối ưu cho Lark/Feishu: Lark Blue, Jade, Violet, Amber, Teal
- **Theme kinh điển**: Mac White, Claude Oat, Medium Blog, Stripe, Linear Dark…
- **Theme sáng tạo**: Dracula, Nord, Cyberpunk, Sakura, Solarized…

> Thử chuyển theme ở thanh công cụ trên cùng — mỗi theme có màu sắc, typography và style riêng biệt.

### 2. Đăng Lark 1 click

Bấm **Đăng Lark** → tài liệu tự động được tạo trên Lark Doc / Wiki:

- **H1 tự động làm tiêu đề** tài liệu Lark
- **Ảnh tự upload** lên Lark Drive, không bị mất
- Ảnh trong list item hiển thị đúng dạng image block
- Hỗ trợ ảnh lớn, không bị lỗi giới hạn 100k ký tự

### 3. Dịch tự động thông minh

Tích hợp **Gemini, GPT-4, Claude, 302.ai**:

- Dịch song song toàn bộ các đoạn cùng lúc (Promise.all)
- Bảo vệ code block, img:// refs không bị dịch
- Theo dõi chi phí API theo từng bài

### 4. Upload & dịch ảnh

- Match ảnh theo tên file vào đúng vị trí trong Markdown
- Dịch ảnh có chữ qua Gemini Vision API
- **Không resize**, giữ nguyên chất lượng gốc

## 📊 So sánh tính năng

| Tính năng | Mô tả |
|-----------|-------|
| Markdown Editor | Real-time preview, multi-device |
| Lark Publish | Doc + Wiki, ảnh tự upload |
| AI Dịch | Gemini / GPT-4 / Claude / 302.ai |
| Multi-card | Quản lý nhiều bài cùng lúc |
| Usage Stats | Theo dõi chi phí theo card |
| Image Store | Persist localStorage, không mất khi refresh |

## 💻 Code example

\`\`\`typescript
// Publish markdown lên Lark — tự động extract H1 làm title
const url = await runLarkPublish({
  wikiEnabled: true,
  wikiSpaceId: 'your-space-id',
  wikiNodeToken: 'your-node-token',
}, markdownContent);

console.log('Published:', url);
\`\`\`

---

**Gợi ý:** Xoá nội dung này và bắt đầu soạn bài của bạn, hoặc bấm **Đăng Lark** để xem thử!
`;
