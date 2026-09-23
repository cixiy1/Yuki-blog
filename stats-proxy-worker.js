/**
 * stats-proxy-worker.js —— 站内访问统计的反向代理 Worker
 *
 * 用途
 * ----
 * 原统计后端 abacus.jasoncameron.dev 是个人 Cloudflare Worker，国内浏览器常不可达/不稳定，
 * 且作者正在迁移到 v2。本站博客（yiyu14.top，同在 Cloudflare）的浏览器若直连 abacus 就会
 * 出现「访问文章但统计数字不涨」。
 *
 * 本 Worker 部署在【你自己 yiyu14.top 的子域】下（例如 stats.yiyu14.top，经 Cloudflare 代理，
 * 国内必达），由它服务端去拉/写 abacus，浏览器只访问本 Worker。历史计数
 * （namespace = yiyu14.top）全部保留，无需迁移数据。
 *
 * 部署后，把 src/config/statsConfig.ts 的 apiBase 改成该 Worker 地址即可
 * （例如 "https://stats.yiyu14.top"）。
 *
 * 路由
 * ----
 *   /get/{ns}/{key}  ->  https://abacus.jasoncameron.dev/get/{ns}/{key}
 *   /hit/{ns}/{key}  ->  https://abacus.jasoncameron.dev/hit/{ns}/{key}
 * 仅转发这两个前缀，其余路径返回 404。
 */

const TARGET = "https://abacus.jasoncameron.dev";
const PATH_RE = /^\/(get|hit)\/([A-Za-z0-9_.\-/]+)$/;

export default {
	async fetch(request, env, ctx) {
		const url = new URL(request.url);
		const m = url.pathname.match(PATH_RE);
		if (!m) return new Response("Not Found", { status: 404 });

		const action = m[1]; // "get" | "hit"
		const rest = m[2]; // 形如 yiyu14.top/site_2026-09-24

		try {
			const upstream = `${TARGET}/${action}/${rest}`;
			const resp = await fetch(upstream);
			const body = await resp.text();
			return new Response(body, {
				status: resp.status,
				headers: {
					"content-type": "application/json; charset=utf-8",
					"access-control-allow-origin": "*",
					"access-control-allow-methods": "GET,OPTIONS",
					"cache-control": "no-store",
				},
			});
		} catch (e) {
			return new Response(
				JSON.stringify({ error: "upstream_error", detail: String(e) }),
				{
					status: 502,
					headers: {
						"content-type": "application/json",
						"access-control-allow-origin": "*",
					},
				},
			);
		}
	},
};
