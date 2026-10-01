# Mingyao Photography

摄影作品展示站与中文内容管理后台。延续 [现有站点](https://mingyaophoto.com/) 的 Logo 设计、Lucida Sans 导航字体、白底黑字和粉色品牌细节，网站继续使用 GitHub Pages。Logo 使用 HTML/CSS 重构为文字，去掉年份，保留 MINGYAO / Photography 排列与粉色渐变。

## 本机使用

需要 Node.js 22 或更新版本，无需安装依赖。

```sh
npm start
```

- 网站：<http://127.0.0.1:4173/>
- 后台：<http://127.0.0.1:4173/admin/>
- 校验：`npm test`
- 更新页面模板后生成入口：`npm run build`

本机后台直接保存项目文件，不会自动推送 GitHub。保存后可立即预览。上线时提交、审阅并合并到 `main`，沿用已有 Pages 的 `main /` 发布配置与 `CNAME`，不需要更换域名或购买服务器。

## 后台操作

照片库支持批量上传、编辑标题与图片描述、分类、隐藏/展示、展示位置、轮播首图、顺序调整和搜索。上传会在浏览器生成 640 / 1280 / 1920 像素 WebP 浏览版本；新上传的照片默认隐藏，确认后再开启展示并保存。每批最多 20 张，每次保存的编码上传数据不超过 28 MB；超过限制可先移除部分未保存记录，分批添加。

每张照片的“展示位置”可选“作品画廊”或“顶部轮播”。原站 6 张细长横幅作为作品序列的开篇，下方不重复显示。前台 WORK 菜单中的分类同时控制开篇横幅和其余作品；横幅支持明显的左右按钮、键盘和滑动切换，默认不自动播放。点击横幅或作品均进入同一分类的大图序列。后台可分别筛选两种展示位置，排序仅调整同一位置的照片；“轮播首图”优先显示在开篇。从某个区域上传时，新照片默认使用该区域。

网站内容可编辑搜索引擎简介、摄影师名称、城市、邮箱、个人介绍、器材和社交链接。分类名称可修改，前台 WORK 菜单同步更新；分类 ID 保持稳定，有照片的分类需先转移照片再删除。作品在桌面以两列自然比例排布，极宽照片占整行，手机为单列，不裁切、不加灰色画框。前台省去照片标题、分类文字、数量与介绍口号；标题仅用于后台管理，图片描述保留用于无障碍阅读。白底全屏预览支持方向键、Escape 和触屏滑动。隐藏代表不在前台展示，文件和数据仍在公开仓库中。

“导出备份”下载当前内容 JSON，不包含照片文件。GitHub 提交历史保留完整修改记录，可回退整个内容提交；从收藏移除照片不会删除原图文件。

## 线上管理

合并后访问 `https://mingyaophoto.com/admin/`。GitHub Pages 是静态托管，因此管理后台通过 GitHub API 保存内容与照片，不运行数据库或账户服务器。

1. 在 GitHub 创建 fine-grained personal access token，仅选择 `LMingyao/testWebRA1`，授权 **Contents: read and write**，设置合理有效期。
2. 在后台连接窗口输入令牌与要编辑的分支。默认是 `main`；保存到 `main` 会触发现有 Pages 更新。可输入其他已包含重构代码的分支先审阅。
3. 令牌只保留在当前页面内存，不写入 localStorage、Cookie、项目文件或导出的内容；刷新后需重新连接。
4. 一次保存生成一个包含图片及内容的 Git 提交。检测到其他编辑改动会拒绝覆盖，提示导出草稿并重新连接。

如需真正的“点击 GitHub 登录”体验，可在之后接入自有 OAuth 认证服务或 GitHub App；当前版本提供可工作的仓库令牌连接与无令牌的本机管理，不包含尚未配置的 OAuth 按钮。

## 代码结构

| 位置                   | 用途                                           |
| ---------------------- | ---------------------------------------------- |
| `content/gallery.json` | 网站内容、分类与照片的唯一数据来源             |
| `app/site.js`          | 公共导航、页脚、个人介绍与联系页面             |
| `app/gallery.js`       | 统一作品序列、手动横幅浏览与全屏查看           |
| `app/site.css`         | 响应式布局                                     |
| `app/wordmark.css`     | 无年份文字 Logo 与粉色渐变                     |
| `app/shared.js`        | 前后台共用内容校验和安全转义                   |
| `admin/`               | 中文管理界面、本机/GitHub 存储适配器和图片处理 |
| `tools/server.mjs`     | 仅监听本机的文件管理 API 与预览服务器          |
| `tools/page.html`      | 公共页面模板，生成现有 HTML 地址               |
| `assets/`              | 保留原始照片与原版 Logo                        |
| `media/`               | 响应式 WebP 浏览版本                           |
| `tests/`               | 数据、保存冲突、访问边界与 GitHub 提交测试     |

现有 `ptr.html`、`about_me.html` 和 `contact.html` 地址继续有效。原来已停用的 `BW.html` 和 `indexFR.html` 导向首页。

`tools/migrate.py` 与 `tools/curate.mjs` 是已完成的一次性迁移工具，已阻止重复运行；日常使用后台管理内容。迁移图片处理使用 Pillow，不是运行网站的依赖。

相关平台文档：[GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)、[Git database API](https://docs.github.com/en/rest/git)、[细粒度访问令牌](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens)。
