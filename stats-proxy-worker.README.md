# 统计代理 Worker 部署指南

解决：国内访问博客时统计数字不增长（直连 abacus.jasoncameron.dev 不可达/不稳定）。

## 思路

把计数请求改走一个**部署在你自己 `yiyu14.top` 子域下的 Cloudflare Worker**，由它服务端去拉/写 abacus。
浏览器只访问你自己的子域（国内必达），历史计数（namespace=`yiyu14.top`）保留。

## 方式一：Cloudflare 控制台（无需命令行）

1. 登录 Cloudflare → **Workers & Pages** → **创建** → **Worker**。
2. 名称随便取，例如 `stats-proxy-yiyu14`。
3. 把 `stats-proxy-worker.js` 的内容**整段粘贴**进编辑器，点 **部署**。
4. 关键：给它绑一个**你自己的域名子域**（不要只用默认的 `*.workers.dev`，那个也可能被墙）。
   - 进入该 Worker → **设置** → **触发器 / 自定义域** → 添加 `stats.yiyu14.top`。
   - 按提示在 DNS 加一条 `stats` 的 **CNAME / A 记录并开启代理（橙云）**。因为 yiyu14.top 已在 Cloudflare，这一步很快。
5. 部署完成后，把 `src/config/statsConfig.ts` 的 `apiBase` 改成
   `"https://stats.yiyu14.top"`，提交并推送（博客重新构建上线即可）。

## 方式二：wrangler 命令行（需要 Cloudflare API Token）

```bash
# 设置好 CLOUDFLARE_API_TOKEN 后
npx wrangler deploy stats-proxy-worker.js --name stats-proxy-yiyu14 \
  --route "stats.yiyu14.top/*"
```

## 验证

部署并改完 apiBase 后，访问一次文章页，然后看：

```bash
curl "https://stats.yiyu14.top/get/yiyu14.top/site"
# 应返回 {"value": <数字>}
curl "https://stats.yiyu14.top/hit/yiyu14.top/probe"
# 应返回 {"value": 1}（测试键，无害）
```

再硬刷新文章页，统计数字即开始正常增长。
