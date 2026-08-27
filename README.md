# Handwriting Variant MVP

纯前端中文手写字 Variant Engine 验证项目。

## 已实现

- 内置 handwriting-web 5 个字体预设：云烟体、华阳手写体、李国夫手写体、神韵英子楷书、青叶手写体
- 页面打开后自动加载默认字体（云烟体），无需手动选择
- 字体加载顺序：`./fonts/<字体文件>` → handwriting-web 的 jsDelivr CDN → 本地字体选择器兜底
- 浏览器本地加载 TTF / OTF / WOFF
- opentype.js 解析 Glyph Bézier Path
- 每个字符独立 `GlyphInstance`
- 4×4 deformation grid + bilinear interpolation 的平滑非刚性局部形变
- 默认排版按字体基线对齐，修复不同字上下高低不齐的问题
- 生成时会自动把内容贴近上边距，去除页面上方大块空白
- 增强重复字符的随机差异：重复出现的同一字会自动使用更高的形变多样性
- 边界控制点衰减，降低字形外轮廓崩坏概率
- Seed 可复现 Variant
- 单字 6 个候选；候选池用 deformation signature 做多样性筛选
- 候选面板在点选某个候选后保持稳定，不会因为点击一次就把 6 个候选全部刷新
- 侧栏支持对所选字符批量编辑颜色、粗细、大小等属性
- 单击选择、Shift/Ctrl/Cmd 多选、空白框选
- 多选整体拖动
- 多选整体旋转（React 版使用 Konva Transformer；standalone 版实现等价交互）
- Delete 删除
- Undo / Redo
- PNG 导出

## handwriting-web 字体

预设来源为 `14790897/handwriting-web` 仓库根目录下的 `ttf_files`：

- `云烟体.ttf`
- `华阳手写体.ttf`
- `李国夫手写体.ttf`
- `神韵英子楷书.ttf`
- `青叶手写体.ttf`

当前执行环境无法直接把这些较大的 GitHub 二进制字体下载进生成的 ZIP，因此工程采用“本地优先、CDN 回退”的方式集成：用户打开页面后会自动获取字体，不需要手动导入。

如果需要**完全离线**：把上述 5 个 `.ttf` 放入 `fonts/` 目录即可，现有代码会优先加载它们，无需改代码。

> 许可提醒：handwriting-web 仓库本身使用 MIT License，但仓库许可证不必然代表其中每一份第三方字体均允许商业再分发。商业使用前应单独确认字体原始许可。

## React / Vite 版运行

```bash
npm install
npm run dev
```

打开页面后会自动尝试加载“云烟体”。可以用右上角下拉菜单切换 5 个预设字体，也可以选择本地字体。

## 零构建版

`standalone.html` 用于最快验证算法/交互：

```bash
python -m http.server 8080
```

然后访问：

```text
http://localhost:8080/standalone.html
```

由于浏览器对 `file://` 下 `fetch()` 有限制，请通过本地 HTTP 服务打开，而不是直接双击 HTML。

## 关键参数

默认 `warpStrength = 0.018`，即扰动幅度约为字号的 1.8%。建议验证范围：`0.010–0.024`。另提供“重复字差异”滑块，用于增强同字不同形的默认随机差异。

## 当前算法边界

MVP 直接对 OpenType Bézier 的端点/控制点施加同一平滑 deformation field。严格数学意义上，这不等价于对完整 Bézier 曲线做非线性映射，但在小幅平滑扰动下适合产品验证。

下一步可加入：

- 曲线自适应 subdivision 后再 warp
- 轮廓自交/笔画碰撞检测
- 64×64 mask IoU/SSIM 候选过滤
- 基于部件/笔画的结构约束
- Web Worker 预生成候选
- 实拍纸张与墨迹融合
