# Birthday Tree

一个沉浸式 3D 生日庆祝体验 —— 通过摄像头手势识别与华丽的粒子生日树实时互动，还能上传照片生成专属拍立得装饰。

**在线体验**: [birthday-tree-swart.vercel.app](https://birthday-tree-swart.vercel.app)

![Birthday Tree preview](public/screenshots/birthday-tree-preview.png)

![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React_19-61DAFB?logo=react&logoColor=black)
![Three.js](https://img.shields.io/badge/Three.js-000000?logo=threedotjs&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-646CFF?logo=vite&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-06B6D4?logo=tailwindcss&logoColor=white)
![Vercel](https://img.shields.io/badge/Deployed_on-Vercel-000?logo=vercel)

---

## Features

### 3D Birthday Tree

- 数千粒子构成的豪华生日树，配有自定义 GLSL 着色器实现呼吸光效
- 金色彩球、礼物盒、闪烁灯串等多层装饰物
- 树顶星星、蝴蝶结、生日蛋糕、气球、小熊等派对场景装饰
- 彩色字母牌（HAPPY BDAY WISH）和三角旗装饰
- Bloom 后处理带来柔和辉光效果

### Hand Gesture Control

通过摄像头实时识别手势，无需触摸屏幕即可操控整棵树：

| 手势 | 效果 |
|------|------|
| **张开手** | 树散开进入 CHAOS 模式，手离镜头越近旋转越快 |
| **握拳** | 树重新聚合为完整形态（FORMED） |
| **捏合（拇指+食指）** | 抓取并在画面中心展示已上传的照片 |

- 基于 [MediaPipe Hand Landmarker](https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker) 实现 21 个手部关键点追踪
- 优先使用 GPU 推理，自动回退到 CPU
- 实时手势状态面板：追踪就绪状态、手势类型、捏合检测

### Photo Upload

- 最多上传 **52 张**照片，自动生成拍立得风格装饰挂件
- 照片自动压缩至 1024px 并转换为 JPEG，减轻纹理开销
- 并发优化（4 worker）确保大批量上传流畅
- 捏合手势可依次抓取每张照片到画面中央展示

### UI / UX

- 响应式布局，适配桌面和移动端
- 实时摄像头画面预览，镜像显示
- 状态仪表盘：追踪状态、手势识别、捏合检测、照片计数
- CHAOS 模式下 UI 自动淡出，沉浸体验不受干扰
- 渐变背景 + 毛玻璃面板的高级视觉风格

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | React 19 |
| 3D Engine | Three.js + React Three Fiber + Drei |
| Post-processing | @react-three/postprocessing (Bloom) |
| Hand Tracking | MediaPipe Tasks Vision (Hand Landmarker) |
| Language | TypeScript |
| Build Tool | Vite |
| Styling | Tailwind CSS |
| Deployment | Vercel |

## Getting Started

```bash
# Clone
git clone https://github.com/CY-CPU1011/Birthday-tree.git
cd Birthday-tree

# Install
npm install

# Dev
npm run dev
```

打开浏览器访问 `http://localhost:5173`，授权摄像头权限后即可体验。

## Requirements

- 支持 WebGL 2 的现代浏览器（Chrome / Edge / Firefox）
- 摄像头访问权限
- 手势模型需从 `storage.googleapis.com` 加载，请确保网络可达

## License

MIT
