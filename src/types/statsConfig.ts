// 站内访问统计（阅读量 / 数据统计页）配置类型
// 说明：这里的"统计"指的是站内可见的计数（阅读量、PV/UV），
// 与 analyticsConfig 注入的第三方行为分析脚本（Clarity / GA / Umami）是两件事。

export interface StatsPageConfig {
	/** 是否启用 /stats 数据统计页 */
	enable: boolean;
	/** 页面标题 */
	title: string;
	/** 页面描述 */
	description: string;
	/** 趋势图统计天数（1-90）；历史天数的取值不会变，会永久缓存在浏览器 */
	trendDays: number;
	/** 排行榜默认展示条数；0 表示全部平铺 */
	topN: number;
}

export interface StatsConfig {
	/** 总开关：关闭后不计数、不展示阅读量，/stats 页也不渲染 */
	enable: boolean;
	/** 计数后端地址（abacus 兼容接口） */
	apiBase: string;
	/** 计数命名空间，建议用站点域名避免与他人冲突。只允许 A-Za-z0-9_-. 且长度 3-64 */
	namespace: string;
	/** 文章页显示阅读量 */
	showPostView: boolean;
	/**
	 * 请求最小间隔（毫秒）。
	 * 计数服务限流为 30 次 / 10 秒 / IP，即约 3 次/秒。
	 * 默认 340ms 留出安全余量，太小会触发 429。
	 */
	requestIntervalMs: number;
	/** 同一路径在该分钟内重复浏览只计一次（防刷新/回退刷量），0 表示每次都计 */
	dedupeMinutes: number;
	/** 排行榜缓存时长（毫秒），避免每次进 /stats 都发几十个请求 */
	leaderboardCacheTtlMs: number;
	/** 不参与计数的路径前缀，如 ["/admin"] */
	excludePaths: string[];
	/** 控制台输出调试日志 */
	debug: boolean;
	/** 数据统计页配置 */
	page: StatsPageConfig;
}
