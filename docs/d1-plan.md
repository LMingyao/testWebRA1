# D1 免费云后台

选定日期：2026-10-01。数据库采用 Cloudflare D1，后台/API 采用 Workers Free，管理员认证采用 Cloudflare Access Free。前台和照片仍由现有 GitHub Pages 仓库托管；不启用 R2，不开通付费套餐。

## 当前状态

代码已实现 D1 内容读写、管理员认证检查、照片上传代理、前台读取切换和后台管理适配器。尚无 Cloudflare 账号，未创建或部署云资源，现有站点和本机管理仍使用原来的方式。真实 Access 登录、云端权限、生产上传与发布效果需要创建账号后验证。Access 可用邮箱一次性验证码或身份提供商登录；当前没有自建固定密码系统。

## 数据和保存方式

- `gallery_content` 保存一个有顺序的内容文档，结构与现有后台一致：网站配置、分类、照片信息。一次保存通过版本号条件更新，防止覆盖其他编辑。
- `gallery_photos` / `gallery_categories` 是 SQL 只读视图，便于检查分类、照片位置及精选状态。当前编辑器总是读取并整体保存内容，保留文档结构比为每个字段建立独立接口更容易维护；需要海量查询时可以再拆表。
- `gallery_media` 登记已存在的图片路径、大小和 SHA-256；保存内容不允许引用未登记文件。
- `gallery_history` 自动保留最近 20 次修改前的内容，可检查或恢复。D1 免费 Time Travel 当前保留七天；另需定期导出数据库。照片仍需独立备份。
- 内容文档限制 1 MB。照片不存进数据库；原始 37 张作品及分类、精选、顺序不变。
- `/api/content` 只返回已展示照片，省去隐藏记录；不缓存且不在云 API 故障时回退旧 JSON，以免重新展示已经隐藏的照片。

照片和旧内容仍存在于公开 GitHub 仓库及其提交历史里，隐藏不是照片保密机制。不上传 RAW；新上传仅保存浏览器生成的 WebP。

## 登录及访问边界

后台单独部署在 Worker 主机，页面和管理 API 同源。设置 Access 自托管应用，覆盖后台 Worker 的全部路径；另为 **`/api/content` 单独配置 Bypass 应用** 供公开网站读取。不要放行整个 `/api/*`，也不要把后台应用的策略设为 Bypass。

Access Allow 策略只加入管理员邮箱，建议同时要求身份提供商的 MFA。Worker 还会验证 `Cf-Access-Jwt-Assertion` 的 RSA 签名、issuer、audience、到期时间和邮箱白名单，不能仅伪造邮箱头进入。未配置认证时拒绝管理访问。所有修改还要求同源 Origin 和自定义请求头，跨域预检不能通过。

本地 `dev` 环境允许无登录测试，但仅在 `localhost` / `127.0.0.1` 生效；即使误把 `LOCAL_DEV=1` 部署到互联网，也不能绕过认证。

## 本机测试

网站本机预览继续运行 `npm start`。Cloudflare 的开发工具需要安装开发依赖：

```sh
npm ci
npm run prepare:d1
npx wrangler d1 migrations apply mingyao-gallery-dev --local --env dev --config cloudflare/wrangler.jsonc
npx wrangler d1 execute mingyao-gallery-dev --local --env dev --config cloudflare/wrangler.jsonc --file .local/cloudflare/seed.sql
npm run dev:d1
```

后台：`http://127.0.0.1:8787/admin/`。这是隔离的本地 D1 数据库，不写入 `content/gallery.json`。初始化种子只能用于空数据库，重复导入会拒绝覆盖。

默认不提供照片上传凭据。管理已有照片、分类与网站信息不需要 GitHub 令牌。

## 首次部署

1. 注册 Cloudflare 免费账号，运行 `npx wrangler login`，在浏览器授权。
2. 运行 `npx wrangler d1 create mingyao-gallery --config cloudflare/wrangler.jsonc`。将返回的 database ID 填入配置顶层 `d1_databases`；开发数据库 ID 不需要替换。
3. 在 Zero Trust 中选择 **Free**，建立 Access 应用/策略。它可能要求支付资料，仍应确认选的是 Free；不要选择按用户付费套餐。
4. 配置 `ACCESS_TEAM_DOMAIN`（例如 `myteam.cloudflareaccess.com`）、后台应用的 `ACCESS_AUD`、`ADMIN_EMAILS`（逗号分隔）、`SITE_ORIGIN`（前台的精确 origin）。这几项不是密钥。
5. `npm run prepare:d1`，应用迁移并首次导入：

```sh
npx wrangler d1 migrations apply mingyao-gallery --remote --config cloudflare/wrangler.jsonc
npx wrangler d1 execute mingyao-gallery --remote --config cloudflare/wrangler.jsonc --file .local/cloudflare/seed.sql
npm run deploy:d1
```

6. 验证未登录用户不能读取管理 API，只有白名单账号可登录，公开 API 不含隐藏照片。完成保存冲突、登录到期、照片上传与生产页面验证后再切换前台。
7. 在 `content/backend.json` 填入 Worker origin `apiBase` 和 `https://<worker-host>/admin/` 的 `adminURL`。公开前台将读取 D1；现有 `/admin/` 会提供云后台入口。配置文件没有密钥。

**顺序很重要：先导入与验证云后台，再发布前台切换配置。** 本次不会合并 main 或更改公开域名。

## 新照片上传

Worker 使用 `GITHUB_TOKEN` secret（仅当前仓库 Contents 读写）代理上传。运行以下交互命令，在终端输入密钥，不写入源码或前端：

```sh
npx wrangler secret put GITHUB_TOKEN --config cloudflare/wrangler.jsonc
```

每张 WebP 单独上传，每次最多 1 MB，以控制 Workers Free 的请求负载。文件先提交到 `GITHUB_BRANCH`，然后登记 D1；所有文件成功后才保存内容。路径不允许覆盖，重试相同文件可继续，冲突则拒绝。每文件一个提交，上传过程中失败可能留下未引用文件，后续可清理；数据库与 GitHub 不是同一个事务。

`GITHUB_BRANCH`、`MEDIA_BASE` 应指向同一份照片，默认 main。首次测试应改成已包含当前照片的审阅分支，避免写入生产 main。后台与 D1 模式前台都从配置的 raw GitHub 地址读取照片，新文件无需等待 Pages 重新构建。静态模式仍使用站点相对地址。该方式继续使用 GitHub 的免费托管及其限额，不适合无限量图片分发；有需要时再单独评估图片存储。

## 免费额度与备份

当前官方额度：D1 单库 500 MB、账户合计 5 GB，每天读 500 万行/写 10 万行；Workers Free 每天 10 万次请求、每次 10 ms CPU；Access Free 最多 50 用户。超额或耗尽计算预算可能导致请求失败，不代表免费无限资源。本方案不订阅 R2 或 Workers Paid；域名续费另计。

20 次内容历史有界，照片不占 D1；现有内容约 20 KB，数据库需求很小。服务器端 GitHub 上传仍受 API 速率限制及 Pages 发布限制。大量连续上传需分批；若云上实测触及 CPU 限制，应调整上传方式，不能擅自升级付费套餐。

导出云数据库：

```sh
npx wrangler d1 export mingyao-gallery --remote --config cloudflare/wrangler.jsonc --output .local/cloudflare/backup.sql
```

切换回静态内容时，先从云后台导出最新 JSON、还原到 `content/gallery.json` 并构建；然后清空 `apiBase` / `adminURL`。不要直接回退陈旧快照。

官方资料：[D1 价格](https://developers.cloudflare.com/d1/platform/pricing/)、[D1 限制](https://developers.cloudflare.com/d1/platform/limits/)、[Workers 价格](https://developers.cloudflare.com/workers/platform/pricing/)、[Access JWT 校验](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/)、[邮箱验证码登录](https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/one-time-pin/)、[Access 免费套餐](https://www.cloudflare.com/plans/)。
