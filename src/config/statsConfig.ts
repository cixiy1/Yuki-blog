import type { StatsConfig } from "../types/statsConfig";

// ============================================================================
// 站内访问统计配置
// ============================================================================
// 计数后端使用 abacus（https://jasoncameron.dev/abacus/，免费、免注册、支持跨域读）。
// ⚠️ abacus.jasoncameron.dev 是个人 Cloudflare Worker，国内浏览器常不可达/不稳定，
//    且作者正在迁移到 v2（文档根已 308 跳转）。若国内访问时统计数字不增长，多半是此原因。
//    推荐修法：用仓库根目录的 stats-proxy-worker.js 部署一个「建在你自己 yiyu14.top 子域下的」
//    Cloudflare Worker 做反向代理（服务端去拉 abacus），再把下面 apiBase 改成该 Worker 地址即可。
//
// 数据存放在 namespace 下的若干计数器里：
//   site                 站点总浏览量
//   site_YYYY-MM-DD      当日浏览量
//   p_<id>               单篇文章阅读量（id 由 src/utils/stats-utils.ts 对 slug 做哈希得到）
//   visits               站点总访客数（浏览器**永久**去重：同一浏览器只 +1 一次）
//   visits_YYYY-MM-DD    当日访客数（浏览器**当日**去重：同一天只 +1 一次）
//   hits / hits_YYYY-MM-DD  访问人次（**完全不去重**，每次打开页面 +1，含刷新）
//
// ⚠️ 去重基线不同，三个「访客相关」数字的相互关系是：
//     · Σ visits_<日>（取一周）＝「本周去重访客」，它把同一人跨天访问重复计了 ⇒ **可能大于 visits（总访客）**。
//       这是口径差异而不是 bug（2026-10-10 用户曾就此发问），当前按用户要求保留该口径，
//       只在 /stats 页用「去重 / 未去重」标签 + 小字说明把话说清楚。
//       若要变成真正的「本周内去重」，得另开一个按周去重的计数器（visits_<周一日期>），
//       代价是本周数字会从改动生效时重新计数、历史周无法回溯。
//     · 浏览量没有这个问题：site 与 site_<日> 是同一次 record 里一起 +1，故 Σ site_<日> ≡ site。
//
// ⚠️ 换了 namespace 等于换了一套计数器，历史数据不会跟过来。
// ⚠️ 计数服务限流 30 次/10 秒/IP，requestIntervalMs 不要调太小。
// ============================================================================

export const statsConfig: StatsConfig = {
	enable: true,

	apiBase: "https://abacus.jasoncameron.dev",
	namespace: "yiyu14.top",

	// 文章页显示「N 阅读」
	showPostView: true,

	// 限流是 30 次 / 10 秒 / IP（≈3 次/秒）。这里留出余量：
	// 400ms 间隔 = 2.5 次/秒，再加上进页面时的几次写入也不会越界。
	requestIntervalMs: 400,

	// 30 分钟内重复访问同一页面只计一次
	dedupeMinutes: 30,

	// 排行榜 1 小时内复用浏览器缓存
	leaderboardCacheTtlMs: 60 * 60 * 1000,

	excludePaths: [],

	debug: false,

	page: {
		enable: true,
		title: "数据统计",
		description: "本站访问量、文章阅读排行与近期趋势",
		// 历史天数永久缓存，只有「今天」每次进入都会重新取，因此调大不会明显变慢
		trendDays: 30,
		topN: 10,
	},
};
