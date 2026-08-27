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
- 多选整体旋转
- Delete 删除
- Undo / Redo
- PNG 导出

## 运行

最直接的入口是 `standalone.html`。推荐通过本地 HTTP 服务打开：

```bash
python -m http.server 8080
```

然后访问：

```text
http://localhost:8080/standalone.html
```

根目录 `index.html` 会自动跳转到 standalone MVP。

## handwriting-web 字体

预设来源为 `14790897/handwriting-web` 仓库根目录下的 `ttf_files`：

- `云烟体.ttf`
- `华阳手写体.ttf`
- `李国夫手写体.ttf`
- `神韵英子楷书.ttf`
- `青叶手写体.ttf`

当前采用“本地优先、CDN 回退”的方式集成。如果需要完全离线，可将对应字体文件放进 `fonts/` 目录。

> 商业使用前应单独确认每份字体的原始许可。

## 关键参数

默认 `warpStrength = 0.018`，建议验证范围：`0.010–0.024`。另提供“重复字差异”滑块，用于增强同字不同形的默认随机差异。

## 下一阶段：Editor v0.2

MVP 已通过验证，后续开发进入编辑器化阶段：

- 背景图片层
- 任意位置 TextBlock
- TextBlock / Glyph 两级编辑
- 项目 JSON 保存与恢复
- 复制、删除、对齐、层级管理
- 墨迹与纸张融合
