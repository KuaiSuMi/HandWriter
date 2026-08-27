# HandWriter

纯前端中文手写字 Variant Engine 与可编辑手写文档实验项目。

## 当前稳定 MVP

稳定版入口：`standalone.html`

已验证功能：

- handwriting-web 5 个字体预设
- TTF / OTF / WOFF 本地字体导入
- opentype.js 解析 Glyph Bézier Path
- 4×4 deformation grid + bilinear interpolation 非刚性局部形变
- 相同字符的可复现随机差异
- 每字 6 个 Variant 候选
- 候选选择后保持当前候选池稳定
- 字体基线对齐
- 单字 / 多字选择
- 多选拖动与旋转
- 颜色、粗细、字号编辑
- Undo / Redo
- PNG 导出

## 文件结构

```text
HandWriter/
├── index.html                 # 默认入口，转到稳定 MVP
├── standalone.html            # 稳定 MVP 页面结构
├── assets/
│   └── standalone.css         # MVP 样式
├── src/
│   └── mvp.js                 # MVP Variant Engine 与交互逻辑
├── fonts/
│   ├── presets.js             # 字体预设元数据
│   └── README.md              # 字体文件存放说明
└── README.md
```

Editor v0.2 的开发工作在独立 feature 分支 / PR 中进行，不直接破坏稳定 MVP。

## 字体存储

字体已经从 HTML 配置中独立出来：`fonts/presets.js` 只保存字体名称、文件名和远程回退源。

运行时加载顺序：

1. `./fonts/<字体文件>`
2. handwriting-web 的 jsDelivr 镜像
3. 用户手动选择本地 TTF / OTF / WOFF

当前仓库不提交第三方字体二进制。若后续确认某字体允许再分发，可直接把对应 `.ttf` 文件放入 `fonts/`，无需修改加载逻辑。

预设文件名：

- `云烟体.ttf`
- `华阳手写体.ttf`
- `李国夫手写体.ttf`
- `神韵英子楷书.ttf`
- `青叶手写体.ttf`

## 本地运行

```bash
python -m http.server 8080
```

然后访问：

```text
http://localhost:8080/
```

不要直接使用 `file://` 打开，因为字体加载使用 `fetch()`。

## 后续路线

1. Background / paper layer
2. 任意位置 TextBlock
3. TextBlock 拖动 / 旋转 / 对齐
4. 将现有 Variant Engine 接入 TextBlock 的 Glyph 子节点
5. 项目 JSON 保存 / 加载
6. ink-paper fusion 与笔类型
