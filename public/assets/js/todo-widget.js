/**
 * todo-widget.js —— 待办清单卡片的交互
 * 纯前端：勾选状态用 localStorage 持久化（key: yuki.todo.<id>），刷新不丢。
 * 同步进度条、计数与「全部完成」提示。幂等，兼容 Astro/Swup 的 SPA 站内跳转。
 */
(function () {
	"use strict";

	function key(id) {
		return "yuki.todo." + id;
	}
	function save(id, val) {
		try {
			localStorage.setItem(key(id), val ? "1" : "0");
		} catch (e) {}
	}
	function read(id) {
		try {
			return localStorage.getItem(key(id)) === "1";
		} catch (e) {
			return false;
		}
	}

	function init() {
		var roots = document.querySelectorAll(".todo-root");
		for (var r = 0; r < roots.length; r++) {
			var root = roots[r];
			if (root.dataset.todoBound === "1") continue; // 只绑一次
			root.dataset.todoBound = "1";

			var checks = root.querySelectorAll(".todo-check[data-todo-id]");
			var bar = root.querySelector("[data-todo-bar]");
			var count = root.querySelector("[data-todo-count]");
			var note = root.querySelector("[data-todo-note]");

			function refresh() {
				var total = checks.length;
				var done = 0;
				for (var i = 0; i < total; i++) if (checks[i].checked) done++;
				if (count) count.textContent = done + " / " + total + " 已完成";
				if (bar) bar.style.width = total ? (done / total) * 100 + "%" : "0%";
				if (note) note.classList.toggle("show", total > 0 && done === total);
			}

			for (var j = 0; j < checks.length; j++) {
				(function (c) {
					var id = c.getAttribute("data-todo-id");
					if (read(id)) c.checked = true;
					c.addEventListener("change", function () {
						save(id, c.checked);
						refresh();
					});
				})(checks[j]);
			}
			refresh();
		}
	}

	if (document.readyState === "loading") {
		document.addEventListener("DOMContentLoaded", init);
	} else {
		init();
	}
	// SPA 站内跳转后，新 DOM 需要重新绑定
	document.addEventListener("astro:page-load", init);
})();
