# Mingyao Photography

摄影作品展示站与中文内容管理后台。延续 [现有站点](https://mingyaophoto.com/) 的 Logo 设计、Lucida Sans 导航字体、白底黑字和粉色品牌细节，网站继续使用 GitHub Pages。Logo 使用 HTML/CSS 重构为文字，年份按照多伦多时区自动更新，无需每年更换图片。

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

照片库支持批量上传、编辑标题与图片描述、分类、隐藏/展示、设置首页封面、顺序调整和搜索。上传会在浏览器生成 640 / 1280 / 1920 像素 WebP 浏览版本；新上传的照片默认隐藏，确认后再开启展示并保存。每批最多 20 张，每次保存的编码上传数据不超过 28 MB；超过限制可先移除部分未保存记录，分批添加。

网站内容可编辑首页标题、介绍、摄影师名称、城市、邮箱、个人介绍、器材和社交链接。分类名称可修改；分类 ID 保持稳定，有照片的分类需先转移照片再删除。照片记录按数组顺序展示；瀑布流在桌面按列排列。隐藏代表不在画廊展示，文件和数据仍在公开仓库中。

“导出备份”下载当前内容 JSON，不包含照片文件。GitHub 提交历史保留完整修改记录，可回退整个内容提交；从收藏移除照片不会删除原图文件。

## 线上管理

合并后访问 `https://mingyaophoto.com/admin/`。GitHub Pages 是静态托管，因此管理后台通过 GitHub API 保存内容与照片，不运行数据库或账户服务器。

1. 在 GitHub 创建 fine-grained personal access token，仅选择 `LMingyao/testWebRA1`，授权 **Contents: read and write**，设置合理有效期。
2. 在后台连接窗口输入令牌与要编辑的分支。默认是 `main`；保存到 `main` 会触发现有 Pages 更新。可输入其他已包含重构代码的分支先审阅。
3. 令牌只保留在当前页面内存，不写入 localStorage、Cookie、项目文件或导出的内容；刷新后需重新连接。
4. 一次保存生成一个包含图片及内容的 Git 提交。检测到其他编辑改动会拒绝覆盖，提示导出草稿并重新连接。

如需真正的“点击 GitHub 登录”体验，可在之后接入自有 OAuth 认证服务或 GitHub App；当前版本提供可工作的仓库令牌连接与无令牌的本机管理，不包含尚未配置的 OAuth 按钮。

## 代码结构

| 位置                                  | 用途                                           |
| ------------------------------------- | ---------------------------------------------- |
| `content/gallery.json`                | 网站内容、分类与照片的唯一数据来源             |
| `app/site.js`                         | 前台渲染、分类、全屏查看、键盘和触屏交互       |
| `app/site.css`                        | 响应式布局                                     |
| `app/brand.css`、`app/typography.css` | 品牌布局、颜色与字体规则                       |
| `app/wordmark.css`                    | 文字 Logo 与粉色渐变，年份由公共代码自动更新   |
| `app/shared.js`                       | 前后台共用内容校验和安全转义                   |
| `admin/`                              | 中文管理界面、本机/GitHub 存储适配器和图片处理 |
| `tools/server.mjs`                    | 仅监听本机的文件管理 API 与预览服务器          |
| `tools/page.html`                     | 公共页面模板，生成现有 HTML 地址               |
| `assets/`                             | 保留原始照片与原版 Logo                        |
| `media/`                              | 响应式 WebP 浏览版本                           |
| `tests/`                              | 数据、保存冲突、访问边界与 GitHub 提交测试     |

现有 `ptr.html`、`about_me.html` 和 `contact.html` 地址继续有效。原来已停用的 `BW.html` 和 `indexFR.html` 导向首页。

`tools/migrate.py` 与 `tools/curate.mjs` 是已完成的一次性迁移工具；日常管理不要重新运行，它们会覆盖当前内容。迁移图片处理使用 Pillow，不是运行网站的依赖。

相关平台文档：[GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)、[Git database API](https://docs.github.com/en/rest/git)、[细粒度访问令牌](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens)。
