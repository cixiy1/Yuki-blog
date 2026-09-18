/*
 * 新生入学教育行程表 · 按天筛选
 * 由 Yuki 的 AI 助手生成
 *
 * 说明：组件可能嵌在普通文章里，也可能将来放进带 password 的加密文章
 * （内容在客户端解密后才注入 DOM）。因此脚本同时用「DOMContentLoaded +
 * password:decrypted 事件 + 轮询」三种方式等待内容就绪，并做幂等初始化，
 * swup 切页、重复加载时不会重复绑定。
 */
(function () {
	function ready() {
		var root = document.querySelector(".sched-root");
		if (!root || !root.querySelector("[data-day]")) return null;
		return root;
	}

	function applyFilter(root, day) {
		var blocks = root.querySelectorAll("[data-day]");
		for (var i = 0; i < blocks.length; i++) {
			var b = blocks[i];
			b.hidden = !(day === "all" || b.getAttribute("data-day") === day);
		}
	}

	function bind(root) {
		if (root.dataset.schedBound === "1") return;
		root.dataset.schedBound = "1";

		root.addEventListener("click", function (e) {
			var btn = e.target && e.target.closest ? e.target.closest("[data-filter]") : null;
			if (!btn || !root.contains(btn)) return;
			var chips = root.querySelectorAll("[data-filter]");
			for (var j = 0; j < chips.length; j++) {
				chips[j].classList.toggle("is-on", chips[j] === btn);
			}
			applyFilter(root, btn.getAttribute("data-filter"));
		});

		applyFilter(root, "all");
	}

	function init() {
		var root = ready();
		if (!root) return false;
		bind(root);
		return true;
	}

	// 加密文章解密完成后会派发该事件
	document.addEventListener("password:decrypted", function () {
		init();
	});

	// 非加密场景的正常加载路径
	if (document.readyState === "loading") {
		document.addEventListener("DOMContentLoaded", init);
	} else {
		init();
	}

	// 兜底轮询：内容注入时机不确定，成功即停
	var timer = setInterval(function () {
		if (init()) clearInterval(timer);
	}, 400);
	setTimeout(function () {
		clearInterval(timer);
	}, 20000);
})();
