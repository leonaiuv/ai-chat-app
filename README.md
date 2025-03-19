# AI Chat 应用

一个功能全面、界面美观的AI聊天应用，参考了Qwen.ai的界面功能。

## 功能特点

- 现代化界面设计
- 深色/浅色主题切换
- 响应式布局，适配移动端和桌面端
- AI聊天交互功能
- 模拟的AI回复系统

## 技术栈

- Next.js 14
- React 19
- TypeScript
- Tailwind CSS
- Lucide Icons
- next-themes（主题切换）

## 开始使用

### 安装依赖

```bash
npm install
```

### 运行开发服务器

```bash
npm run dev
```

然后在浏览器中打开 [http://localhost:3000](http://localhost:3000) 查看应用。

### 构建生产版本

```bash
npm run build
```

### 运行生产版本

```bash
npm start
```

## 项目结构

- `/src/app/page.tsx` - 主应用界面
- `/src/app/api/chat/route.ts` - 聊天API路由
- `/src/components/theme-provider.tsx` - 主题提供者组件

## 开发说明

### 自定义AI模型接入

目前应用使用模拟的API响应，要接入实际的AI模型，请修改 `/src/app/api/chat/route.ts` 文件，替换为实际的AI API调用。

### 添加新功能

您可以扩展此应用的功能，例如：

- 添加历史会话记录
- 实现用户认证系统
- 添加多模型支持
- 增加对话导出功能

## 贡献

欢迎提交问题或贡献代码改进此项目。
