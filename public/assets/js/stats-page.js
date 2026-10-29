/**
 * stats-page.js —— /stats 数据统计页的渲染逻辑
 *
 * 依赖：
 *   window.YukiStats            由 /assets/js/site-stats.js 提供
 *
 * 数据全部从 DOM 读取（#stats-root 的属性 + 服务端渲染好的排行行），
 * 不依赖任何内联脚本注入的全局变量 —— Swup 站内跳转时只有 DOM 是新的，
 * 内联脚本在 SPA 导航下不保证执行。
 *
 * DOM 契约（由 src/pages/stats.astro 渲染）：
 *   #stats-root[data-trend-days][data-top-n]
 *   [data-stat="pv|uv|pvToday|uvToday|hitsToday|pvWeek|uvWeek|hitsWeek"]  概览数字
 *   [data-stat="avg"]                    近 N 天日均
 *   [data-stat="total"]                  文章累计阅读量
 *   #stats-trend                         趋势图容器
 *   #stats-rank > [data-rank-id][data-published]  排行行（标题/链接/日期由服务端渲染）
 *   #stats-status                        状态/进度文字
 *   #stats-rank-toggle                   展开/收起排行
 */
(function () {
	"use strict";

	var S = window.YukiStats;

	var busy = false;

	/* ------------------------------------------------------------------ */
	/* 小工具                                                               */
	/* ------------------------------------------------------------------ */

	function el(id) {
		return document.getElementById(id);
	}

	/** 页面参数一律读 DOM，保证 SPA 导航后拿到的是当前页面的值 */
	function pageCfg() {
		var root = el("stats-root");
		var days = root ? parseInt(root.getAttribute("data-trend-days"), 10) : NaN;
		var top = root ? parseInt(root.getAttribute("data-top-n"), 10) : NaN;
		return {
			trendDays: isFinite(days) && days > 0 ? Math.min(90, days) : 30,
			topN: isFinite(top) && top > 0 ? top : 0
		};
	}

	function num(value) {
		return S && typeof S.formatNumber === "function"
			? S.formatNumber(value)
			: String(Number(value) || 0);
	}

	function setText(selector, text) {
		var nodes = document.querySelectorAll(selector);
		for (var i = 0; i < nodes.length; i++) nodes[i].textContent = text;
	}

	function status(text, kind) {
		var node = el("stats-status");
		if (!node) return;
		node.textContent = text || "";
		node.setAttribute("data-kind", kind || "");
	}

	function escapeHtml(s) {
		return String(s == null ? "" : s)
			.replace(/&/g, "&amp;")
			.replace(/</g, "&lt;")
			.replace(/>/g, "&gt;")
			.replace(/"/g, "&quot;");
	}

	function shortDate(d) {
		var parts = String(d).split("-");
		return parts.length === 3 ? parts[1] + "/" + parts[2] : d;
	}

	/** 星期几（0=周日 … 6=周六）。日期串是本地口径的 YYYY-MM-DD，别用 Date 解析字符串以免时区偏移 */
	function dowOf(d) {
		var parts = String(d).split("-");
		if (parts.length !== 3) return 1;
		return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])).getDay();
	}

	/* ------------------------------------------------------------------ */
	/* 概览卡片                                                             */
	/* ------------------------------------------------------------------ */

	/** 取不到的计数器（abacus 返回 404 → null）用「—」占位；0 要照常显示成 0 */
	function statText(value) {
		return value === null || value === undefined ? "—" : num(value);
	}

	function renderOverview() {
		var weekP = S.getWeekTotals ? S.getWeekTotals() : Promise.resolve(null);
		return Promise.all([S.getSiteTotals(), weekP]).then(function (res) {
			var t = res[0] || {};
			var w = res[1] || {};
			setText('[data-stat="pv"]', statText(t.pv));
			setText('[data-stat="uv"]', statText(t.uv));
			setText('[data-stat="pvToday"]', statText(t.pvToday));
			setText('[data-stat="uvToday"]', statText(t.uvToday));
			setText('[data-stat="hitsToday"]', statText(t.hitsToday));
			setText('[data-stat="pvWeek"]', statText(w.pvWeek));
			setText('[data-stat="uvWeek"]', statText(w.uvWeek));
			setText('[data-stat="hitsWeek"]', statText(w.hitsWeek));
			var root = el("stats-root");
			if (root) root.setAttribute("data-overview", "1");
		});
	}

	/* ------------------------------------------------------------------ */
	/* 趋势图                                                               */
	/* ------------------------------------------------------------------ */

	function renderTrend() {
		var box = el("stats-trend");
		if (!box) return Promise.resolve();

		return S.getDaySeries(pageCfg().trendDays, function (done, total) {
			status("正在读取趋势 " + done + "/" + total + " …");
		}).then(function (series) {
			var values = series.values || [];
			var max = 0;
			var sum = 0;
			var counted = 0;
			var firstDay = null; // 有记录的第一天（用于说明「数据从哪开始」）
			var todayValue = 0;

			for (var i = 0; i < values.length; i++) {
				var v = typeof values[i] === "number" ? values[i] : 0;
				if (v > max) max = v;
				if (v > 0 && !firstDay) firstDay = series.dates[i];
				if (series.dates[i] === S.today()) todayValue = v;
				sum += v;
				counted++;
			}

			setText('[data-stat="avg"]', counted ? num(Math.round(sum / counted)) : "—");

			if (!max) {
				box.innerHTML = '<p class="sp-empty">暂时没有可展示的趋势数据。</p>';
				return;
			}

			var html = [];
			var days = values.length;
			var dates = series.dates || [];
			var dowChars = ["日", "一", "二", "三", "四", "五", "六"];
			var todayKey = S.today();

			// 按自然周（周一为首）切段：底部用它画周标识与背景块
			var weeks = [];
			for (var w = 0; w < days; w++) {
				var dow = dowOf(dates[w]);
				if (!weeks.length || dow === 1) weeks.push({ start: w, end: w });
				else weeks[weeks.length - 1].end = w;
			}

			html.push('<div class="sp-chart" style="--sp-n:' + days + '">');
			for (var j = 0; j < days; j++) {
				var val = typeof values[j] === "number" ? values[j] : 0;
				var pct = Math.max(2, Math.round((val / max) * 100));
				var isToday = dates[j] === todayKey;
				var valText = num(val);
				var dowText = dowChars[dowOf(dates[j])];
				html.push(
					'<div class="sp-bar-wrap' +
						(isToday ? " is-today" : "") +
						(val > 0 ? "" : " is-zero") +
						'" style="grid-column:' +
						(j + 1) +
						'" title="' +
						escapeHtml(
							shortDate(dates[j]) +
								" 周" +
								dowText +
								(isToday ? "（今天）" : "") +
								"　" +
								val +
								" 次浏览"
						) +
						'">' +
						(val > 0 ? '<div class="sp-bar" style="height:' + pct + '%"></div>' : "") +
						// 柱顶数值：0 也标出来，不然看不出那天是真的没人来还是没取到数
						'<span class="sp-bar-val' +
						(valText.length >= 4 ? " is-long" : "") +
						'" style="bottom:' +
						(val > 0 ? pct : 0) +
						'%">' +
						valText +
						"</span>" +
						"</div>"
				);
			}
			html.push("</div>");

			// 底部轴：与柱区共用同一套列定义，第一行每柱周几，第二行每周区间
			html.push('<div class="sp-axis" style="--sp-n:' + days + '">');
			// 周分隔线先入 DOM：每周起始处一根细线，跨两行划分周界
			for (var q = 1; q < weeks.length; q++) {
				html.push(
					'<span class="sp-week-sep" style="grid-column:' +
						(weeks[q].start + 1) +
						'"></span>'
				);
			}
			for (var m = 0; m < days; m++) {
				var dIdx = dowOf(dates[m]);
				var isT = dates[m] === todayKey;
				html.push(
					'<span class="sp-axis-dow' +
						(isT ? " is-today" : "") +
						(dIdx === 0 || dIdx === 6 ? " is-weekend" : "") +
						'" style="grid-column:' +
						(m + 1) +
						'">' +
						(isT ? "今" : dowChars[dIdx]) +
						"</span>"
				);
			}
			for (var n = 0; n < weeks.length; n++) {
				var ws = weeks[n].start;
				var we = weeks[n].end;
				var isCurWeek =
					dates[ws] <= todayKey && todayKey <= dates[we];
				html.push(
					'<span class="sp-axis-week' +
						(isCurWeek ? " is-current" : "") +
						'" style="grid-column:' +
						(ws + 1) +
						" / span " +
						(we - ws + 1) +
						'"><span class="sp-axis-date">' +
						escapeHtml(shortDate(dates[ws])) +
						"</span>" +
						// 首尾残周只有一两天，写成「起 – 止」会溢出到卡片外，只留起日
						(we - ws >= 2
							? '<span class="sp-axis-range"> – ' +
								escapeHtml(shortDate(dates[we])) +
								"</span>"
							: "") +
						"</span>"
				);
			}
			html.push("</div>");

			var notes = ["最高单日 <b>" + num(max) + "</b> 次", "区间合计 <b>" + num(sum) + "</b> 次"];
			if (firstDay && firstDay !== series.dates[0]) {
				notes.push("数据从 " + escapeHtml(shortDate(firstDay)) + " 开始记录");
			}
			if (todayValue > 0) notes.push("「今天」的数据仍在增长");

			html.push('<p class="sp-chart-foot">' + notes.join(" · ") + "</p>");

			box.innerHTML = html.join("");
		});
	}

	/* ------------------------------------------------------------------ */
	/* 阅读排行                                                             */
	/* ------------------------------------------------------------------ */

	/**
	 * 阅读排行：行由服务端渲染，这里只负责
	 *   1) 按 id 批量取阅读量（增量写入，不必等全部取完）
	 *   2) 取完后按阅读量重排、画进度条、套用 topN 折叠
	 */
	function renderRank() {
		var box = el("stats-rank");
		if (!box) return Promise.resolve();

		var nodes = box.querySelectorAll("[data-rank-id]");
		if (!nodes.length) return Promise.resolve(); // 服务端已渲染空状态

		var rows = [];
		var byId = {};
		for (var i = 0; i < nodes.length; i++) {
			var row = {
				el: nodes[i],
				id: nodes[i].getAttribute("data-rank-id") || "",
				published: nodes[i].getAttribute("data-published") || "",
				value: 0
			};
			rows.push(row);
			if (row.id) byId[row.id] = row;
		}

		var ids = rows
			.map(function (r) {
				return r.id;
			})
			.filter(Boolean);

		// 只在「逐个取回」时刷新进度提示；真正的数字回填统一在 .then 里完成，
		// 这样无论 getPostValues 是实时取还是命中缓存（命中时不会触发 onEach），
		// 排行数量都不会停在占位符「…」。
		function paint(row) {
			var numNode = row.el.querySelector("[data-rank-num]");
			if (numNode) numNode.textContent = num(row.value);
			row.el.setAttribute("data-value", String(row.value));
		}

		return S.getPostValues(
			ids,
			function (done, total) {
				status("正在读取各篇文章阅读量 " + done + "/" + total + " …");
			},
			false
		).then(function (result) {
			// 用返回值把每行的阅读量写回（result.values 与 ids 一一对应）
			var values = (result && result.values) || [];
			for (var k = 0; k < ids.length; k++) {
				var v = Number(values[k]);
				if (!isFinite(v) || v < 0) v = 0;
				var r = byId[ids[k]];
				if (r) r.value = v;
			}

			rows.sort(function (a, b) {
				if (b.value !== a.value) return b.value - a.value;
				// 阅读量相同按发布日期，早的在前
				return String(a.published).localeCompare(String(b.published));
			});

			var max = rows.length ? rows[0].value : 0;
			var total = 0;
			var topN = pageCfg().topN;

			for (var i = 0; i < rows.length; i++) {
				var row = rows[i];
				total += row.value;

				var noNode = row.el.querySelector(".sp-rank-no");
				if (noNode) noNode.textContent = String(i + 1);

				var bar = row.el.querySelector(".sp-rank-track i");
				if (bar) {
					var pct = max
						? Math.max(row.value > 0 ? 3 : 0, Math.round((row.value / max) * 100))
						: 0;
					bar.style.width = pct + "%";
				}

				paint(row);

			row.el.setAttribute("data-rank", String(i + 1));
			row.el.style.display = topN > 0 && i >= topN ? "none" : "";
				box.appendChild(row.el); // 按名次重排
			}

			setText('[data-stat="total"]', num(total));

			var toggle = el("stats-rank-toggle");
			if (toggle && topN > 0 && rows.length > topN) {
				toggle.hidden = false;
				toggle.setAttribute("data-expanded", "0");
				toggle.textContent = "显示全部 " + rows.length + " 篇";
			}
		});
	}

	/* ------------------------------------------------------------------ */
	/* 主流程                                                               */
	/* ------------------------------------------------------------------ */

	function load() {
		var root = el("stats-root");
		if (!root) return Promise.resolve();

		if (!S) {
			status("统计脚本未加载，请刷新页面重试。", "error");
			var box = el("stats-trend");
			if (box) box.innerHTML = '<p class="sp-empty">统计脚本未加载。</p>';
			var rank = el("stats-rank");
			if (rank) rank.innerHTML = '<p class="sp-empty">统计脚本未加载。</p>';
			return Promise.resolve();
		}

		if (busy) return Promise.resolve();
		busy = true;

		status("正在读取数据 …");

		// 先等本次访问的计数完成，概览数字才是「含本次访问」的最新值
		return Promise.resolve(S.ready)
			.catch(function () {})
			.then(renderOverview)
			.then(renderRank)
			.then(renderTrend)
			.then(function () {
				status("数据来自站内计数服务，最近刷新：" + new Date().toLocaleTimeString(), "ok");
			})
			.catch(function (err) {
				status("部分数据读取失败：" + (err && err.message ? err.message : "未知错误"), "error");
			})
			.then(function () {
				busy = false;
			});
	}

	function bind() {
		var root = el("stats-root");
		if (!root || root.getAttribute("data-bound") === "1") return;
		root.setAttribute("data-bound", "1");

		var toggle = el("stats-rank-toggle");
		if (toggle) {
			toggle.addEventListener("click", function () {
				var expanded = toggle.getAttribute("data-expanded") === "1";
				var rows = document.querySelectorAll("#stats-rank [data-rank-id]");
				var topN = pageCfg().topN;

				for (var i = 0; i < rows.length; i++) {
					var rank = Number(rows[i].getAttribute("data-rank") || 0);
					if (rank > topN) rows[i].style.display = expanded ? "none" : "";
				}

				toggle.setAttribute("data-expanded", expanded ? "0" : "1");
				toggle.textContent = expanded
					? "显示全部 " + rows.length + " 篇"
					: "只看前 " + topN + " 篇";
			});
		}

		load();
	}

	function start() {
		if (el("stats-root")) bind();
	}

	if (document.readyState === "loading") {
		document.addEventListener("DOMContentLoaded", start);
	} else {
		start();
	}

	// Swup 站内跳转后 /stats 是新的 DOM，需要重新绑定渲染
	document.addEventListener("astro:page-load", function () {
		setTimeout(start, 0);
	});
})();
