# HandWriter

HandWriter 当前主分支已升级到 **v0.2 编辑器雏形**。

## 当前能力

- handwriting-web 预设字体 + 本地字体导入
- 自定义画布尺寸与预设尺寸（A4、Letter、HD、正方形）
- 上传背景图后，画布默认切换为图片像素尺寸
- 背景图支持三种适配：缩放（contain）/ 裁切（cover）/ 拉伸（stretch）
- 画布显示缩放
- 拖拽创建文本框
- 在文本框范围内自动换行生成手写字
- 文本框整体移动、缩放、整体旋转
- 文本框内文字的整体字号、字间距、行距、内边距、整体偏移调节
- 单字颜色、粗细、大小调节
- 单字 Variant 候选
- 导出 PNG

## 使用方式

建议通过本地 HTTP 服务运行：

```bash
python -m http.server 8080
```

然后访问：

```text
http://localhost:8080/
```

## 目录说明

```text
HandWriter/
├── index.html
├── standalone.html
├── assets/
│   └── standalone.css
├── src/
│   ├── mvp-core.js
│   └── mvp-ui.js
├── fonts/
│   ├── presets.js
│   └── README.md
└── README.md
```

字体预设仍独立保存在 `fonts/presets.js`。运行时优先读取 `fonts/*.ttf`，本地不存在时再使用配置中的 CDN fallback。

## 当前交互

1. 上传背景图后，画布实际尺寸自动使用图片像素尺寸。
2. 不上传图片时，可设置自定义宽高或选择 A4 等尺寸预设。
3. 点击“新建文本框”后，在画布中拖出范围，文字只在该框内自动换行排版。
4. 文本框可整体移动、缩放、旋转。
5. 可整体调整文本框中文字的字号、内边距、字间距、行距和 X/Y 偏移。
6. 点击单字后继续使用 Variant 候选以及颜色、粗细、大小编辑。

## 后续路线

- 项目保存 / 载入
- 多文本框列表管理
- 背景图可视化裁剪框与透视校正
- 纸张纹理融合与笔型渲染
- 用户个人手写字库
