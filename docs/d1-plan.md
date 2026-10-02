# D1 免费云后台

选定日期：2026-10-01。使用 Cloudflare D1、Workers Free 和自建单管理员密码登录；前台及照片沿用 GitHub 托管。不启用 R2、Access 或付费套餐，不要求绑定支付方式。

## 当前状态

- 云数据库：`mingyao-gallery`，ID `650f4849-a44f-415c-ae31-b725b6277266`。已导入原有 37 张作品、149 个媒体文件记录。
- 云后台：<https://mingyao-gallery-admin.mingyao-photography.workers.dev/admin/>。
- 云端实测通过：正确/错误密码、受保护会话、跨域拦截、内容读取、原样保存、旧版本冲突、退出后撤销会话和登录限速。临时测试凭据与会话已清除；所有者已设置正式密码并成功登录，云端配置已确认生效，匿名管理请求返回 401。
- 初始云库备份在本机 `.local/cloudflare/initial-cloud-backup.sql`，不提交或部署。
- 审阅分支的 `content/backend.json` 已准备云 API 配置；main 和现有公开站点尚未切换。当前已部署 Worker 的照片及上传目标仍为 `refactor/gallery-admin`，仓库中的生产部署配置已准备切换为 `main`，须在合并发布后部署。
- 未配置服务端 GitHub 上传令牌；现有照片的内容管理可用，新增照片上传暂不可用，仍需实测。
- 新版前台通过隔离的本机预览读取真实云端数据，首页精选、顶部横幅和完整分类导航已验证；29 项测试及静态构建通过。发布前云库备份保存于本机 `.local/cloudflare/pre-release-backup.sql`。

## 设置或重置密码

在项目目录的本机 PowerShell 终端运行，输入会隐藏。密码长度为 8–128 个字符，可使用密码管理器生成的密码或长口令。不要把密码发到聊天中。

```powershell
& '.\tools\set-admin-password.ps1'
```

脚本先检查 Wrangler 授权和网站所属账号。尚未授权时，会打开浏览器完成 OAuth 授权，并使用 Windows 凭据管理器保存加密凭据；浏览器已登录 Cloudflare 并不等于 Wrangler 已授权。确认后才提示输入密码，不需要手工创建 API Token。

脚本通过 stdin 将密码交给本机 Node 工具，以随机盐执行 PBKDF2-HMAC-SHA256（600,000 次），再加服务端随机 pepper 的 HMAC。盐、校验结果、pepper 和随机凭据版本组成的 `AUTH_CREDENTIALS` 只写入 Worker secret。不保存明文密码、临时密码文件、命令行参数或仓库变量。写入后核对公开接口返回的盐和迭代次数，确认云端生效才显示成功。

登录时浏览器在用户设备执行同样的 PBKDF2，服务器进行 HMAC 校验，避免昂贵的密码派生消耗 Workers Free 的 CPU。派生结果通过 HTTPS 提交，仍是密码等价的凭据：不得记录或复制到日志，也不要在不可信页面输入密码。公开配置接口只返回盐和迭代次数。密码字段不写入 localStorage 或导出内容。

重设密码会更换凭据版本，旧会话立即失效，无需邮件找回。设置脚本会协助完成 `wrangler login`；网站访客没有密码重置入口。

## 会话与访问边界

- 32 字节随机会话令牌，D1 只存 SHA-256 哈希、凭据版本及到期时间。Cookie 使用 `__Host-`、Secure、HttpOnly、SameSite=Strict；8 小时过期，退出会撤销会话，最多保留 10 个有效会话。
- 每个 IP 每 15 分钟最多 5 次登录，整体最多 30 次，包含成功尝试。D1 条件更新原子限制并发，IP 用服务端 HMAC 匿名标记，过期计数自动清除。分布式恶意尝试可能短暂阻止管理员登录，下一窗口恢复。
- 登录及所有管理修改要求同源 Origin 和自定义请求头，跨域预检不放行。页面禁止嵌入框架，登录页面使用仅同源的 CSP。
- 登录页、登录模块、品牌样式、图标及 `/api/content` 公开；后台、内容管理与上传需要有效会话。未设置密码时拒绝管理访问。
- 本地 `dev` 免登录仅对 `localhost` / `127.0.0.1` 生效，部署到互联网不能绕过登录。

## 数据和保存

`gallery_content` 保存配置、分类、照片组成的有序文档，通过版本号条件更新防止覆盖其他编辑。`gallery_photos` / `gallery_categories` 是 SQL 只读视图。

`gallery_media` 登记路径、大小、SHA-256，保存内容不能引用未登记文件。`gallery_history` 保留最近 20 次修改前的内容。D1 免费 Time Travel 当前保留七天，还需独立备份照片。内容文档限制 1 MB，照片不存进数据库。

公开 `/api/content` 只返回已展示照片；不缓存，云端故障不回退旧 JSON，避免重新展示隐藏照片。照片及旧内容仍存在于公开 GitHub 仓库和历史，隐藏不是保密机制。不上传 RAW，新上传仅保存浏览器生成的 WebP。

## 本机测试

```sh
npm ci
npm run prepare:d1
npx wrangler d1 migrations apply mingyao-gallery-dev --local --env dev --config cloudflare/wrangler.jsonc
npx wrangler d1 execute mingyao-gallery-dev --local --env dev --config cloudflare/wrangler.jsonc --file .local/cloudflare/seed.sql
npm run dev:d1
```

本机 D1 后台为 `http://127.0.0.1:8787/admin/`，隔离于云库，不写入 `content/gallery.json`。初始化种子仅用于空库，重复导入拒绝覆盖；数据库已有数据时只应用新增迁移。网站本机预览继续运行 `npm start`。

## 部署与切换

当前云库与 Worker 已创建，后续更新只应用新增迁移并部署，不重新导入种子：

```sh
npx wrangler d1 migrations apply mingyao-gallery --remote --config cloudflare/wrangler.jsonc
npm run deploy:d1
```

新账号首次部署先 `wrangler login`，创建 D1，替换配置的 account ID 和 database ID；运行 `npm run prepare:d1`，确认空库后导入种子，随后部署并设置密码。

所有者登录、保存和页面读取已验证；生产照片上传仍待令牌及实测。审阅分支的 `content/backend.json` 已准备以下配置，完成上传验证后才合并发布：

```json
{
  "apiBase": "https://mingyao-gallery-admin.mingyao-photography.workers.dev",
  "adminURL": "https://mingyao-gallery-admin.mingyao-photography.workers.dev/admin/"
}
```

配置不含密钥。公开 API 只允许 `SITE_ORIGIN` 指定的精确前台 origin 通过浏览器跨域读取。先合并前台代码到 `main`，再部署准备好的 Worker 配置，将 `GITHUB_BRANCH`、`MEDIA_BASE` 同时切至 `main`。部署前 Worker 继续使用审阅分支。

`npm start` 的 loopback 服务器为本机预览返回静态读取配置，且不修改存储的 `content/backend.json`；本机编辑与预览始终读取本机内容。真实云数据已通过隔离的本机代理验证。

## 照片上传

Worker 使用仅当前仓库 Contents 读写权限的 `GITHUB_TOKEN` secret。在 GitHub 创建 fine-grained personal access token：资源所有者为 `LMingyao`，Repository access 选择 **Only select repositories → testWebRA1**，Repository permissions 只开启 **Contents: Read and write**（Metadata 的只读权限自动包含）。设置有效期，到期前通过同一工具更换令牌。

在本机 PowerShell 运行隐藏输入工具：

```powershell
& '.\tools\set-upload-token.ps1'
```

工具先检查 Wrangler 授权，再隐藏读取令牌，经 GitHub 验证有效性及目标分支读取后，通过 stdin 写入 Worker secret，并检查云端 secret 名称确认配置。令牌不发送到聊天、不写入文件、命令行参数、源码或前端。读取验证不能代替 Contents 写入验证，首次上传仍需实测。

每次上传单个 WebP，最多 1 MB。文件先提交目标分支，再登记 D1，全部成功后才保存内容。路径不可覆盖，相同文件可重试；每个文件一个提交。失败可能留下未引用文件，GitHub 和 D1 不是同一个事务。

D1 模式从配置的 raw GitHub 地址读取照片，不必等待 Pages 重建；沿用 GitHub 免费托管及限额，不适合无限量分发。上传仍受 GitHub API、Pages 和 Workers CPU 限制，应分批并实测；受限时调整方案，不自动升级付费。

## 免费额度与备份

当前官方额度：D1 单库 500 MB、账户合计 5 GB，每天读 500 万行/写 10 万行；Workers Free 每天 10 万次请求、每次 10 ms CPU。超额可能导致请求失败，免费不代表无限。域名续费另计。

```sh
npx wrangler d1 export mingyao-gallery --remote --config cloudflare/wrangler.jsonc --output .local/cloudflare/backup.sql
```

切回静态模式前，从云后台导出最新 JSON、还原至 `content/gallery.json` 并构建，再清空 `apiBase` / `adminURL`，避免回退陈旧内容。

官方资料：[D1 价格](https://developers.cloudflare.com/d1/platform/pricing/)、[D1 限制](https://developers.cloudflare.com/d1/platform/limits/)、[Workers 价格](https://developers.cloudflare.com/workers/platform/pricing/)、[GitHub 专用令牌](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens)、[OWASP 密码存储](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)。
