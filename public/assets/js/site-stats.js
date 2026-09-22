/**
 * site-stats.js —— 站内访问统计运行时（计数 + 阅读量展示 + 数据读取）
 *
 * 设计要点
 * - 后端是 abacus 兼容接口（免费、免注册、带 CORS），全部数据用「整数计数器」存：
 *     site / site_YYYY-MM-DD             站点总浏览量 / 当日浏览量
 *     p_<id>                             单篇文章阅读量（id 见 src/utils/stats-utils.ts）
 *     visits / visits_YYYY-MM-DD         站点总访客数 / 当日访客数（浏览器本地去重）
 * - 该接口限流 30 次 / 10 秒 / IP，所以所有请求走同一个串行队列，按最小间隔排队。
 * - 只依赖 window.__YUKI_STATS__（由 Layout.astro 注入），不引入任何第三方库。
 * - 在 Swup 站内跳转下会重复触发，内部做了同一路径 2 秒内去重 + 可配置的分钟级去重。
 *
 * 对外 API：window.YukiStats
 *   ready                    （属性）最近一次「记录」完成的 Promise，进入 /stats 前先 await
 *   record()                 手动触发一次记录
 *   getSiteTotals()          → {pv, uv, pvToday, uvToday, date}
 *   getDaySeries(days, cb)   → {dates, values}  历史天数永久缓存，只重取「今天」
 *   getPostValues(ids, cb)   → {values, cached} 按 id 批量取，带缓存
 *   formatNumber(n)          数字格式化（1.2w）
 *   today()                  本地日期 YYYY-MM-DD
 */
(function () {
	"use strict";

	var CFG = window.__YUKI_STATS__;
	if (!CFG || !CFG.enable) return;

	/* ------------------------------------------------------------------ */
	/* 基础工具                                                             */
	/* ------------------------------------------------------------------ */

	var API = String(CFG.apiBase || "https://abacus.jasoncameron.dev").replace(/\/+$/, "");
	var NS = sanitizeKey(CFG.namespace || "site-stats");
	var INTERVAL = clampInt(CFG.requestIntervalMs, 340, 100, 5000);
	var DEDUPE = clampInt(CFG.dedupeMinutes, 30, 0, 100000);
	var POST_TTL = clampInt(CFG.leaderboardCacheTtlMs, 3600000, 60000, 7 * 86400000);
	var EXCLUDES = Array.isArray(CFG.excludePaths) ? CFG.excludePaths : [];
	var DEBUG = !!CFG.debug;

	var LS_UV_ONCE = "ykstats.uv.once";
	var LS_UV_DAY = "ykstats.uv.day";
	var LS_DAYS = "ykstats.days";
	var LS_POSTS = "ykstats.posts";
	var SS_PV = "ykstats.pv.";

	function clampInt(v, dflt, min, max) {
		var n = parseInt(v, 10);
		if (isNaN(n)) n = dflt;
		return Math.min(max, Math.max(min, n));
	}

	/** 计数服务只接受 ^[A-Za-z0-9_\-.]{3,64}$ */
	function sanitizeKey(raw) {
		var s = String(raw == null ? "" : raw).replace(/[^A-Za-z0-9_.-]/g, "-");
		while (s.length < 3) s += "_";
		return s.slice(0, 64);
	}

	function log() {
		if (!DEBUG || !window.console) return;
		var args = ["%c[stats]", "color:#888"].concat([].slice.call(arguments));
		console.log.apply(console, args);
	}

	function storeGet(store, key) {
		try {
			return store.getItem(key);
		} catch (e) {
			return null;
		}
	}

	function storeSet(store, key, value) {
		try {
			store.setItem(key, value);
		} catch (e) {
			/* 隐私模式下可能抛错，忽略 */
		}
	}

	function jsonGet(store, key) {
		var raw = storeGet(store, key);
		if (!raw) return null;
		try {
			return JSON.parse(raw);
		} catch (e) {
			return null;
		}
	}

	function jsonSet(store, key, value) {
		try {
			store.setItem(key, JSON.stringify(value));
		} catch (e) {
			/* 忽略 */
		}
	}

	function delay(ms) {
		return new Promise(function (resolve) {
			setTimeout(resolve, ms);
		});
	}

	/* ------------------------------------------------------------------ */
	/* 日期                                                                 */
	/* ------------------------------------------------------------------ */

	function dateStr(d) {
		var m = d.getMonth() + 1;
		var day = d.getDate();
		return d.getFullYear() + "-" + (m < 10 ? "0" + m : m) + "-" + (day < 10 ? "0" + day : day);
	}

	function todayStr() {
		return dateStr(new Date());
	}

	/* ------------------------------------------------------------------ */
	/* 计数器 key                                                           */
	/* ------------------------------------------------------------------ */

	var K = {
		site: function () {
			return "site";
		},
		siteDay: function (d) {
			return "site_" + d;
		},
		post: function (id) {
			return sanitizeKey("p_" + id);
		},
		uv: function () {
			return "visits";
		},
		uvDay: function (d) {
			return "visits_" + d;
		}
	};

	/* ------------------------------------------------------------------ */
	/* 请求队列（限流 30 次 / 10 秒 / IP）                                   */
	/* ------------------------------------------------------------------ */

	var queue = [];
	var pumping = false;
	var lastRequestAt = 0;

	function enqueue(task) {
		return new Promise(function (resolve) {
			queue.push({ task: task, resolve: resolve });
			pump();
		});
	}

	function pump() {
		if (pumping) return;
		var item = queue.shift();
		if (!item) return;

		pumping = true;
		var wait = Math.max(0, lastRequestAt + INTERVAL - Date.now());
		setTimeout(function () {
			lastRequestAt = Date.now();
			Promise.resolve()
				.then(item.task)
				.catch(function () {
					return null;
				})
				.then(function (result) {
					pumping = false;
					item.resolve(result);
					pump();
				});
		}, wait);
	}

	function rawRequest(path) {
		return fetch(API + path, {
			method: "GET",
			credentials: "omit",
			cache: "no-store"
		}).then(function (res) {
			if (res.status === 429) {
				var after = parseFloat(res.headers.get("Retry-After"));
				if (!isFinite(after) || after <= 0) after = 1200;
				else if (after < 100) after = after * 1000; // 兼容「秒」单位
				return { retryAfter: Math.min(5000, Math.max(400, after)) };
			}
			if (res.status === 404) return null; // 计数器还没被创建过
			if (!res.ok) throw new Error("HTTP " + res.status);
			return res.json();
		});
	}

	function request(path, attempt) {
		attempt = attempt || 0;
		return rawRequest(path).then(function (res) {
			if (res && res.retryAfter && attempt < 3) {
				log("429, retry in", res.retryAfter);
				return delay(res.retryAfter).then(function () {
					return request(path, attempt + 1);
				});
			}
			if (!res || res.retryAfter || res.error) return null;
			return res;
		});
	}

	function hit(key) {
		return enqueue(function () {
			return request("/hit/" + NS + "/" + key);
		});
	}

	function get(key) {
		return enqueue(function () {
			return request("/get/" + NS + "/" + key);
		});
	}

	function valueOf(res) {
		if (!res) return null;
		var v = Number(res.value);
		return isFinite(v) ? v : null;
	}

	/* ------------------------------------------------------------------ */
	/* 页面识别 / 计数条件                                                  */
	/* ------------------------------------------------------------------ */

	function currentPath() {
		var p = location.pathname || "/";
		if (p.length > 1 && p.charAt(p.length - 1) === "/") p = p.slice(0, -1);
		return p.toLowerCase() || "/";
	}

	function isExcluded(path) {
		for (var i = 0; i < EXCLUDES.length; i++) {
			if (EXCLUDES[i] && path.indexOf(String(EXCLUDES[i]).toLowerCase()) === 0) return true;
		}
		return false;
	}

	function canCount() {
		var host = location.hostname;
		if (!host) return false;
		if (host === "localhost" || host === "127.0.0.1" || /\.local$/.test(host)) return false;
		if (navigator.webdriver) return false; // 自动化/爬虫
		if (document.visibilityState === "prerender") return false;
		if (/(^|[?&])(nopv|preview|draft)(=|&|$)/.test(location.search)) return false;
		return true;
	}

	function postIdsOnPage() {
		var nodes = document.querySelectorAll("[data-post-stats][data-stats-id]");
		var seen = {};
		var out = [];
		for (var i = 0; i < nodes.length; i++) {
			var id = nodes[i].getAttribute("data-stats-id");
			if (id && !seen[id]) {
				seen[id] = true;
				out.push(id);
			}
		}
		return out;
	}

	/* ------------------------------------------------------------------ */
	/* 阅读量展示                                                           */
	/* ------------------------------------------------------------------ */

	function formatNumber(n) {
		var v = Number(n);
		if (!isFinite(v) || v < 0) return "0";
		if (v >= 100000) return Math.round(v / 10000) + "w";
		if (v >= 10000) return (v / 10000).toFixed(1).replace(/\.0$/, "") + "w";
		return String(Math.round(v));
	}

	function setBadge(id, value) {
		var nodes = document.querySelectorAll('[data-post-stats][data-stats-id="' + id + '"]');
		if (!nodes.length) return;
		var text = formatNumber(value);
		for (var i = 0; i < nodes.length; i++) {
			var slot = nodes[i].querySelector("[data-post-stats-value]");
			if (slot) slot.textContent = text;
			nodes[i].style.display = "";
			nodes[i].setAttribute("data-loaded", "1");
		}
	}

	function refreshBadges(ids, liveValues) {
		if (!ids.length) return Promise.resolve();

		var pending = [];
		for (var i = 0; i < ids.length; i++) {
			var id = ids[i];
			if (liveValues && typeof liveValues[id] === "number") {
				setBadge(id, liveValues[id]);
			} else {
				pending.push(fetchBadge(id));
			}
		}
		return Promise.all(pending);
	}

	function fetchBadge(id) {
		return get(K.post(id)).then(function (res) {
			var v = valueOf(res);
			if (v !== null) setBadge(id, v);
		});
	}

	/* ------------------------------------------------------------------ */
	/* 记录一次访问                                                         */
	/* ------------------------------------------------------------------ */

	var lastPath = "";
	var lastPathAt = 0;

	/** 结束一次记录：把阅读量刷上去（无论这次有没有真的计数） */
	function finishBadges(ids, live) {
		return refreshBadges(ids, live).then(function () {
			return ids;
		});
	}

	function record() {
		var ids = postIdsOnPage();

		if (!canCount()) return finishBadges(ids, null);

		var path = currentPath();
		if (isExcluded(path)) return finishBadges(ids, null);

		var now = Date.now();
		if (lastPath === path && now - lastPathAt < 2000) {
			log("skip: 同一路径 2 秒内重复触发");
			return finishBadges(ids, null);
		}
		lastPath = path;
		lastPathAt = now;

		var ssKey = SS_PV + path;
		var prev = Number(storeGet(sessionStorage, ssKey) || 0);
		if (DEDUPE > 0 && prev && now - prev < DEDUPE * 60000) {
			log("skip: 去重窗口内", path);
			return finishBadges(ids, null);
		}
		storeSet(sessionStorage, ssKey, String(now));

		var today = todayStr();
		var jobs = [hit(K.site()), hit(K.siteDay(today))];
		for (var i = 0; i < ids.length; i++) jobs.push(hit(K.post(ids[i])));

		if (!storeGet(localStorage, LS_UV_ONCE)) {
			storeSet(localStorage, LS_UV_ONCE, "1");
			jobs.push(hit(K.uv()));
		}
		if (storeGet(localStorage, LS_UV_DAY) !== today) {
			storeSet(localStorage, LS_UV_DAY, today);
			jobs.push(hit(K.uvDay(today)));
		}

		log("record", path, ids);
		return Promise.all(jobs).then(function (res) {
			var live = {};
			for (var j = 0; j < ids.length; j++) live[ids[j]] = valueOf(res[2 + j]);
			return finishBadges(ids, live);
		});
	}

	/* ------------------------------------------------------------------ */
	/* 对外数据接口                                                         */
	/* ------------------------------------------------------------------ */

	function getSiteTotals() {
		var today = todayStr();
		return Promise.all([
			get(K.site()),
			get(K.uv()),
			get(K.siteDay(today)),
			get(K.uvDay(today))
		]).then(function (res) {
			return {
				date: today,
				pv: valueOf(res[0]),
				uv: valueOf(res[1]),
				pvToday: valueOf(res[2]),
				uvToday: valueOf(res[3])
			};
		});
	}

	/**
	 * 近 N 天浏览量。
	 * 历史天数一旦取到就永久缓存（历史值不会再变），每次只重新取「今天」。
	 */
	function getDaySeries(days, onEach) {
		var total = clampInt(days, 30, 1, 90);
		var today = todayStr();
		var cache = jsonGet(localStorage, LS_DAYS) || {};
		var base = new Date();
		base.setHours(0, 0, 0, 0);

		var dates = [];
		var missing = [];
		for (var i = total - 1; i >= 0; i--) {
			var d = dateStr(new Date(base.getTime() - i * 86400000));
			dates.push(d);
			if (d === today || typeof cache[d] !== "number") missing.push(d);
		}

		var done = 0;
		return Promise.all(
			missing.map(function (d) {
				return get(K.siteDay(d)).then(function (res) {
					var v = valueOf(res);
					if (v === null) v = 0;
					cache[d] = v;
					done++;
					if (typeof onEach === "function") onEach(done, missing.length, d, v);
					return v;
				});
			})
		).then(function () {
			// 持久化历史值（今天不写，它还会涨）
			var persisted = jsonGet(localStorage, LS_DAYS) || {};
			for (var i = 0; i < dates.length; i++) {
				var key = dates[i];
				if (key !== today && typeof cache[key] === "number") persisted[key] = cache[key];
			}
			jsonSet(localStorage, LS_DAYS, persisted);

			return {
				dates: dates,
				values: dates.map(function (d) {
					return typeof cache[d] === "number" ? cache[d] : null;
				}),
				fetched: missing.length
			};
		});
	}

	/**
	 * 批量取文章阅读量（带缓存）。
	 * @param {string[]} ids
	 * @param {function} [onEach] 每取到一个就回调 (done, total, id, value)
	 * @param {boolean} [force]   忽略缓存强制重取
	 */
	function getPostValues(ids, onEach, force) {
		if (!ids || !ids.length) return Promise.resolve({ values: [], cached: true });

		var cache = jsonGet(localStorage, LS_POSTS);
		if (!force && cache && cache.v && Date.now() - Number(cache.at || 0) < POST_TTL) {
			var complete = true;
			for (var i = 0; i < ids.length; i++) {
				if (typeof cache.v[ids[i]] !== "number") {
					complete = false;
					break;
				}
			}
			if (complete) {
				log("leaderboard: 命中缓存");
				return Promise.resolve({
					cached: true,
					values: ids.map(function (id) {
						return cache.v[id];
					})
				});
			}
		}

		var out = {};
		var done = 0;
		return Promise.all(
			ids.map(function (id) {
				return get(K.post(id)).then(function (res) {
					var v = valueOf(res);
					if (v === null) v = 0;
					out[id] = v;
					done++;
					if (typeof onEach === "function") onEach(done, ids.length, id, v);
					return v;
				});
			})
		).then(function () {
			jsonSet(localStorage, LS_POSTS, { at: Date.now(), v: out });
			return {
				cached: false,
				values: ids.map(function (id) {
					return out[id];
				})
			};
		});
	}

	function clearCache() {
		try {
			localStorage.removeItem(LS_DAYS);
			localStorage.removeItem(LS_POSTS);
		} catch (e) {
			/* 忽略 */
		}
	}

	/* ------------------------------------------------------------------ */
	/* 生命周期                                                             */
	/* ------------------------------------------------------------------ */

	var readyPromise = Promise.resolve();

	function boot() {
		readyPromise = record().catch(function () {
			return [];
		});
		return readyPromise;
	}

	window.YukiStats = {
		config: CFG,
		record: boot,
		getSiteTotals: getSiteTotals,
		getDaySeries: getDaySeries,
		getPostValues: getPostValues,
		clearCache: clearCache,
		formatNumber: formatNumber,
		postIdsOnPage: postIdsOnPage,
		queueLength: function () {
			return queue.length;
		},
		today: todayStr
	};

	Object.defineProperty(window.YukiStats, "ready", {
		get: function () {
			return readyPromise;
		}
	});

	if (document.readyState === "loading") {
		document.addEventListener("DOMContentLoaded", boot);
	} else {
		boot();
	}

	// Swup 站内跳转后重新记录（内部有去重保护）
	document.addEventListener("astro:page-load", function () {
		setTimeout(boot, 0);
	});
})();
