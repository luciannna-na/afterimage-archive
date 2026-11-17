# AFTERIMAGE / 余像

Astro 静态个人档案和仅在本机运行的 Studio。站点共有日记、碎碎念、文化档案、摄影和关于五个栏目。预置内容是虚构示例，照片出处见 [素材说明](IMAGE-SOURCES.md)。

## 启动与访问

在本目录使用 Node.js 24 和 pnpm 11 安装依赖。运行下面的命令后，在 Edge 打开终端显示的网址。

```sh
pnpm install --frozen-lockfile
pnpm studio
```

默认网址为 `http://127.0.0.1:4321/`，编辑室为 `http://127.0.0.1:4321/studio/`。指定其他端口可使用 `pnpm studio --port 4330`。`pnpm preview` 用于检查静态构建产物，编辑室由 `pnpm studio` 提供。

## 新建、编辑或删除日记

1. 打开首页导航的 **STUDIO 编辑室**，选择「日记」和「＋ 新建」。
2. 填标题、日期、摘要、标签和 Markdown 正文。可上传封面或从素材列表选择图片。请填写替代文字，可另填图注。
3. 点击「预览」查看标题、正文、封面和附图。选择「保存草稿」会写入内容文件，刷新浏览器后仍可从左侧重新打开。选择「发布到本地」后，日记会进入公开页面和搜索。
4. 从左侧打开已有条目继续编辑。删除时会弹出确认框，输入「删除」后才会移除文件。

碎碎念可以省略标题，支持多图、标签和草稿。文化档案需选择 CINEMA、MUSIC 或 READING，可填写个人评价并在正文中写笔记。摄影专题支持封面、器材记录、多图及上下移排序。可在「首页」标签中选择各栏目的已发布条目、调整顺序或隐藏区块。

## 上传、插入和替换图片

- 在日记等编辑表单中，通过封面或附图的「上传本地图片」选择文件。可用「批量上传为附图」一次加入多张图。上传后，还需要保存条目来保留图片引用。
- 对已选附图点击「插入正文」，Markdown 语法会插入到正文光标处，并带上图注文字。正文中的项目图片路径可写成 `![替代文字](media/uploads/文件名.jpg)`，构建会按站点根路径或 GitHub Pages 子路径解析。若某张附图已经内嵌，保存前可从附图清单移除它，避免重复出现。
- 在「素材」中选中自己的上传文件，点击「管理」。在这里可以填写分类、说明、替代文字、作者和来源，或选择同格式文件替换，引用会继续有效。未被引用的图片可修改文件名或删除，已被条目引用的图片需要先解除引用。
- 可上传 JPEG、PNG、WebP、GIF 和 AVIF，单张上限 12 MB。演示素材放在 `public/media/`，可通过站点配置更换首页主图、拼贴小图、头图与关于配图。

## 文件保存位置

| 内容 | 位置 |
| --- | --- |
| 日记、碎碎念、文化档案、摄影 | `src/content/<栏目>/<条目 ID>.md` |
| 上传原图及素材元数据 | `.archive-media/` 与 `.archive-media/catalog.json` |
| 首页顺序与精选 | `src/config/home.json` |
| 站名、Logo、副标题、头尾文案、全站选图 | `src/config/site.ts` |
| 主题与字体 | `src/styles/main.css`、`public/fonts/` |
| Studio 界面、本地 API、内容读写 | `studio/ui/`、`studio/server.mjs`、`studio/store.mjs` |

Studio 按 Markdown 状态生成公开内容。构建时只从上传素材库复制已发布内容或站点配置引用的图像。原始 Markdown 和素材目录仍是本地源文件。如需保存完整工作区历史，可使用本地 Git 或私有备份。公开仓库请只提交审查过的公开文件，否则源文件仍会暴露草稿或个人照片。

## 字体与视觉维护

标题和正文由 Fontsource 的 Noto Serif SC / Noto Sans SC 提供，系统已装思源宋体、思源黑体时优先使用。正文旁注采用 Cormorant Garamond、IBM Plex Mono 和 LXGW WenKai TC。首页封面另用本地 Bodoni Moda 与 Caveat。Fontsource 包各自附有许可，本地字体的 OFL 文件位于 `public/fonts/`。修改 `main.css` 的字体变量或色板即可调整对应版式。

## GitHub Pages 发布

此目录是单独的公开副本。首次推送到 `main` 时，Actions 运行构建。部署以仓库变量 `PAGES_AUTO_DEPLOY=true` 为开启条件。

1. 在仓库 **Settings → Pages → Build and deployment → Source** 选择 **GitHub Actions**。
2. 在 **Settings → Secrets and variables → Actions → Variables** 添加仓库变量 `PAGES_AUTO_DEPLOY`，值为 `true`。
3. 在 **Actions → 余像 · GitHub Pages → Run workflow** 选择 `main` 并运行。部署完成后，工作流的 `github-pages` 环境会显示访问链接。
4. 此后向 `main` 推送审核过的更新，工作流会自动构建并部署。

发布地址预计为 https://luciannna-na.github.io/afterimage-archive/ 。工作流固定了这个项目的 `AFTERIMAGE_BASE`，本地开发默认从根路径运行。

在原本地工作区写草稿、存放原图。发布更新时，将确认可公开的 Markdown 和导出图片复制到这个副本，图片放在 `public/media/`，正文或元数据引用 `media/文件名.jpg`。检查标题、正文、首页配置、图片内容和元数据后，用 `git add -f -- <已审核文件>` 显式加入新的内容或素材，再用 `git diff --cached` 审查。已跟踪的演示文件在修改后也会出现在 Git 差异中。`.archive-media/` 始终保留在本机。
