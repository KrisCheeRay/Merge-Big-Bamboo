# 合成大竹头

一个基于 Vite、原生 JavaScript 和 Matter.js 开发的十级合成网页小游戏。

## 游戏玩法

- 从顶部投放球体，相同等级碰撞后合成下一级。
- 第 1～4 级按照 40%、30%、20%、10% 的概率随机出现。
- 首次合成第 10 级即通关。
- 球体稳定超过顶部警戒线约 1.7 秒后游戏结束。
- 支持鼠标和手机触屏操作。

## 当前功能

- 固定十级合成与指数计分
- 本局分数和浏览器历史最高分
- 重新开始二次确认
- 合成音效开关及总音量控制
- 第 2～9 级随机播放现有合成音效
- 第 10 级固定播放通关音效
- 响应式奶黄与草绿色界面

## 本地运行

```bash
npm install
npm run dev
```

生产构建：

```bash
npm run build
npm run preview
```

## 排行榜 API

排行榜页面和成绩提交前端已经接入 API。GitHub Pages 只负责静态网页，排行榜 API 需要单独运行。

本地同时运行前端和 API：

```bash
npm run server
npm run dev
```

Vite 会把网页的 `/api` 请求代理到 `http://127.0.0.1:8787`。成绩默认保存在未提交的 `server/data.json` 中。

部署到线上服务器后，在构建 GitHub Pages 前设置环境变量：

```bash
VITE_LEADERBOARD_API_BASE=https://你的-api-域名/api
```

Cloudflare Worker + D1 的配置是 `wrangler.jsonc`，接口是 `worker/index.js`，建表文件是 `migrations/0001_leaderboard.sql`。本地测试时先建本地表，再开 Worker：

```bash
npm run db:local
npm run worker:dev
```

运行 `db:local` 时 Wrangler 会询问是否继续应用迁移；选择 **Yes**（用方向键选择后按回车，或根据提示输入 `y`）。如果最后显示 `... no`，迁移并未执行，排行榜会因缺少 `sessions`、`scores` 表而报错。确认迁移成功后再刷新网页。

另开终端运行 `npm run dev`，Vite 会将 `/api` 请求转发到本地 Worker 的 8787 端口。不要同时运行 `npm run server`，因为两个后端使用同一端口。本地 D1 数据不会写入线上数据库。

上线时先确认 Wrangler 已登录，然后按顺序执行：

```bash
npx wrangler whoami
npm run db:remote
npm run worker:deploy
```

`db:remote` 会要求确认后把迁移应用到已创建的线上 `bamboo-leaderboard`。部署完成后，从终端复制 Worker 的 `https://...workers.dev` 地址。在 GitHub 仓库的 **Settings → Secrets and variables → Actions → Variables** 中设置 `LEADERBOARD_API_BASE` 为 `https://你的-worker-地址/api`，然后推送本次代码到 `main`。现有 GitHub Pages workflow 会读取该变量重新构建网页。打开线上网页测试排行榜、提交分数和刷新后排名。

原先的 `npm run server` 保留供纯本地 Node 测试；它的 `server/data.json` 不会自动迁移到 D1。排行榜的分数来自浏览器，当前 API 只校验类型、范围和单次提交凭证，不能证明真实游戏过程，因此公开排行榜仍可能被伪造成绩污染。不要把 API 密钥或数据库密码写进前端代码。

## 素材目录

```text
public/assets/balls/level-1.png ... level-10.png
public/assets/sounds/level-5.mp3 ... level-10.mp3
```

## 说明

本项目用于个人学习和非商业体验。项目中涉及的第三方角色图片、名称及音频，其相关权利归原权利人所有；仓库维护者不主张对这些第三方素材拥有权利。如有权利相关问题，请联系仓库维护者处理。
