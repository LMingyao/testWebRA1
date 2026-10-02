# Mingyao Photography

摄影作品展示站与中文内容管理后台。延续 [现有站点](https://mingyaophoto.com/) 的 Logo 设计、Lucida Sans 导航字体、白底黑字和粉色品牌细节，网站继续使用 GitHub Pages。Logo 使用 HTML/CSS 重构为文字，去掉年份，保留 MINGYAO / Photography 排列与粉色渐变。

## 本机使用

需要 Node.js 22.13 或更新版本，建议 Node.js 24。本机网站无需安装依赖；D1 开发与部署先运行 `npm ci` 安装 Wrangler。

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

“首页精选”独立于展示状态和轮播首图：主页（Selected work）只读取已展示且已勾选精选的照片，分类页读取该分类所有已展示作品。取消精选不隐藏照片，也不影响分类页；新上传照片默认隐藏且不加入精选。后台可筛选首页精选，包含已标记但暂时隐藏的照片。初始配置沿用 B 布局稿中的七张既有画廊照片及原有六张横幅，可自行调整，不导入新照片。

网站内容可编辑搜索引擎简介、摄影师名称、城市、邮箱、个人介绍、器材和社交链接。分类名称可修改，前台 WORK 菜单同步更新；分类 ID 保持稳定，有照片的分类需先转移照片再删除。

默认 Multi view 保留顶部细长轮播，箭头位于图片下方。图库算法按屏幕宽度与原始长宽比比较分行方案，每行最多三张，并提高竖图的最小观看宽度；保持顺序、同一行等高、间距统一，超宽或极窄作品单独成行。比例合适的末行铺满宽度，过高的末行限制高度并居中。手机为单列，所有照片完整展示；浏览图片的 sizes 根据实际排版宽度生成。页头可切换 Single view，逐张浏览当前分类；切换保留分类和当前照片，大图预览的选择同步回单张视图。前台省去照片标题、分类文字、数量与介绍口号；标题仅用于后台管理，图片描述保留用于无障碍阅读。白底全屏预览支持方向键、Escape 和触屏滑动。隐藏代表不在前台展示，文件和数据仍在公开仓库中。

导航与视图切换使用更清楚的字号和灰度，分类入口采用下箭头。关于页保留可编辑的简介、头像和器材信息，器材列表默认收起；联系页直接突出联系邮箱。短页面的页脚贴近视口底部，长页面随内容自然延伸。

“导出备份”下载当前内容 JSON，不包含照片文件。GitHub 提交历史保留完整修改记录，可回退整个内容提交；从收藏移除照片不会删除原图文件。

## 线上管理

已部署 [D1 免费云后台方案](docs/d1-plan.md)：Workers + D1 管理内容，自建密码登录，照片保留 GitHub 托管，无需绑定支付方式。云后台在 <https://mingyao-gallery-admin.mingyao-photography.workers.dev/admin/>，所有者已设置正式密码并成功登录。云端登录、保存冲突、退出与限速已实测；照片上传仍需配置服务端仓库令牌并验证。前台尚未启用 D1，当前仍使用以下 GitHub/本机方式。

未启用 D1 时，合并后访问 `https://mingyaophoto.com/admin/`，管理后台通过 GitHub API 保存内容与照片。启用 D1 后此页面提供独立云后台入口，由 Workers 验证管理员会话并保存数据库。

1. 在 GitHub 创建 fine-grained personal access token，仅选择 `LMingyao/testWebRA1`，授权 **Contents: read and write**，设置合理有效期。
2. 在后台连接窗口输入令牌与要编辑的分支。默认是 `main`；保存到 `main` 会触发现有 Pages 更新。可输入其他已包含重构代码的分支先审阅。
3. 令牌只保留在当前页面内存，不写入 localStorage、Cookie、项目文件或导出的内容；刷新后需重新连接。
4. 一次保存生成一个包含图片及内容的 Git 提交。检测到其他编辑改动会拒绝覆盖，提示导出草稿并重新连接。

GitHub 存储模式使用仓库令牌，本机管理不需要令牌。D1 模式使用管理员密码登录；上传令牌仅放在 Worker secret 中，不要求管理员在网页输入 GitHub 令牌。

## 代码结构

| 位置                   | 用途                                           |
| ---------------------- | ---------------------------------------------- |
| `content/gallery.json` | 静态模式内容来源及 D1 首次导入数据 |
| `content/backend.json` | 静态/D1 内容读取切换及云后台入口（不含密钥） |
| `cloudflare/`          | D1 迁移、Workers API、密码会话与上传代理 |
| `tools/prepare-d1.mjs` | 生成空库种子、媒体登记与后台部署资源 |
| `tools/set-admin-password.ps1` | 隐藏输入，设置或重置云后台密码 |
| `app/site.js`          | 公共导航、页脚、个人介绍与联系页面             |
| `app/gallery.js`       | 统一作品序列、手动横幅浏览与全屏查看           |
| `app/layout.js`        | 保留原比例与顺序的自动分行算法                 |
| `app/images.js`        | 响应式图片标记与加载策略                       |
| `app/viewer.js`        | 大图查看、键盘操作与滑动手势                   |
| `app/site.css`         | 响应式布局                                     |
| `app/wordmark.css`     | 无年份文字 Logo 与粉色渐变                     |
| `app/shared.js`        | 前后台共用内容校验和安全转义                   |
| `admin/`               | 中文管理界面、本机/GitHub 存储适配器和图片处理 |
| `tools/server.mjs`     | 仅监听本机的文件管理 API 与预览服务器          |
| `tools/page.html`      | 公共页面模板，生成现有 HTML 地址               |
| `assets/`              | 保留原始照片与原版 Logo                        |
| `media/`               | 响应式 WebP 浏览版本                           |
| `tests/`               | 数据、保存冲突、访问边界与 GitHub 提交测试     |

现有 `ptr.html`、`about_me.html` 和 `contact.html` 地址继续有效。已停用的 `BW.html` 和 `indexFR.html` 已删除，不再生成。

一次性迁移工具已清理；日常使用后台管理内容。图库仅在作品页面加载，排版与大图查看分别维护。后台配色合并在 `admin/admin.css`，品牌文字统一使用 `app/wordmark.css`，避免旧样式叠加覆盖。构建、本机保存、GitHub 保存和上传筛选共用图片路径集合。原始照片与历史 Logo 保留，四个在用入口页由构建生成。

相关平台文档：[GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)、[Git database API](https://docs.github.com/en/rest/git)、[细粒度访问令牌](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens)。
