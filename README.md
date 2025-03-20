# AI Chat 应用 | AI Chat Application

一个功能全面、界面美观的AI聊天应用。

A comprehensive and beautifully designed AI chat application.

## 功能特点 | Features

- 现代化界面设计 | Modern interface design
- 深色/浅色主题切换 | Dark/Light theme switching
- 响应式布局，适配移动端和桌面端 | Responsive layout for mobile and desktop
- AI聊天交互功能 | AI chat interaction
- 模拟的AI回复系统 | Simulated AI response system

## 技术栈 | Tech Stack

- Next.js 14
- React 19
- TypeScript
- Tailwind CSS
- Lucide Icons
- next-themes（主题切换 | Theme switching）

## 开始使用 | Getting Started

### 安装依赖 | Install Dependencies

```bash
npm install
```

### 运行开发服务器 | Run Development Server

```bash
npm run dev
```

然后在浏览器中打开 [http://localhost:3000](http://localhost:3000) 查看应用。

Open [http://localhost:3000](http://localhost:3000) in your browser to view the application.

### 构建生产版本 | Build for Production

```bash
npm run build
```

### 运行生产版本 | Run Production Build

```bash
npm start
```

## 项目结构 | Project Structure

- `/src/app/page.tsx` - 主应用界面 | Main application interface
- `/src/app/api/chat/route.ts` - 聊天API路由 | Chat API route
- `/src/components/theme-provider.tsx` - 主题提供者组件 | Theme provider component

## 开发说明 | Development Guide

### 自定义AI模型接入 | Custom AI Model Integration

目前应用使用模拟的API响应，要接入实际的AI模型，请修改 `/src/app/api/chat/route.ts` 文件，替换为实际的AI API调用。

Currently, the application uses simulated API responses. To integrate an actual AI model, modify `/src/app/api/chat/route.ts` and replace it with real AI API calls.

### 添加新功能 | Adding New Features

您可以扩展此应用的功能，例如：

You can extend this application's functionality with features such as:

- 添加历史会话记录 | Add conversation history
- 实现用户认证系统 | Implement user authentication
- 添加多模型支持 | Add multi-model support
- 增加对话导出功能 | Add conversation export feature

## 贡献 | Contributing

欢迎提交问题或贡献代码改进此项目。

Issues and pull requests are welcome to improve this project.
