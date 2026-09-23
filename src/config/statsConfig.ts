import type { StatsConfig } from "../types/statsConfig";

// ============================================================================
// 站内访问统计配置
// ============================================================================
// 计数后端使用 abacus（https://jasoncameron.dev/abacus/，免费、免注册、支持跨域读）。
// 但 abacus.jasoncameron.dev 是个人 Cloudflare Worker，国内浏览器常不可达/不稳定，
// 且作者正在迁移到 v2（文档根已 308 跳转）。因此这里不再直连 abacus，而是改调
// 本站同源接口（functions/get、functions/hit 两个 CF Pages Function 做反向代理，
// 服务端去拉 abacus），既保留历史计数，又保证国内访问必达。
//
// 数据存放在 namespace 下的若干计数器里：
//   site                 站点总浏览量
//   site_YYYY-MM-DD      当日浏览量
//   p_<id>               单篇文章阅读量（id 由 src/utils/stats-utils.ts 对 slug 做哈希得到）
//   visits               站点总访客数（浏览器去重）
//   visits_YYYY-MM-DD    当日访客数
//
// ⚠️ 换了 namespace 等于换了一套计数器，历史数据不会跟过来。
// ⚠️ 计数服务限流 30 次/10 秒/IP，requestIntervalMs 不要调太小。
// ============================================================================

export const statsConfig: StatsConfig = {
	enable: true,

	// 同源入口：由 functions/get、functions/hit 代理到 abacus（见上方说明）
	apiBase: "https://yiyu14.top",
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
