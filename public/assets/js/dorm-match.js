/*
 * 新生组队匹配页交互脚本
 * 由 Yuki 的 AI 助手生成
 *
 * 说明：本页嵌在带密码的博客文章里，内容在客户端解密后才注入 DOM，
 * 因此脚本用「事件 + 轮询」两种方式等待内容就绪，并做幂等初始化
 * （swup 切页、重复加载时不会重复绑定）。
 */
(function () {
	function ready() {
		var root = document.querySelector(".match-root");
		if (!root || !root.querySelector(".card")) return null;
		return root;
	}

	function bindCopy(root) {
		if (root.dataset.matchBound === "1") return;
		root.dataset.matchBound = "1";

		root.addEventListener("click", function (e) {
			var btn = e.target && e.target.closest ? e.target.closest("[data-wx]") : null;
			if (!btn) return;
			var text = btn.getAttribute("data-wx");
			var done = function () {
				var t = btn.textContent;
				btn.textContent = "已复制 ✓";
				setTimeout(function () {
					btn.textContent = t;
				}, 1500);
			};
			if (navigator.clipboard && navigator.clipboard.writeText) {
				navigator.clipboard.writeText(text).then(done);
			} else {
				var ta = document.createElement("textarea");
				ta.value = text;
				document.body.appendChild(ta);
				ta.select();
				document.execCommand("copy");
				document.body.removeChild(ta);
				done();
			}
		});
	}

	function bindFilter(root) {
		if (root.dataset.matchFilterBound === "1") return;
		root.dataset.matchFilterBound = "1";

		function apply() {
			var g = document.getElementById("mG").value,
				b = document.getElementById("mB").value,
				o = document.getElementById("mO").value,
				k = document.getElementById("mQ").value.trim().toLowerCase();
			var n = 0;
			root.querySelectorAll(".card").forEach(function (c) {
				var ok =
					(!g || c.dataset.g === g) &&
					(!b || c.dataset.bed === b) &&
					(!o || c.dataset.owl === o);
				if (ok && k) ok = c.textContent.toLowerCase().includes(k);
				c.classList.toggle("hide", !ok);
				if (ok) n++;
			});
			document.getElementById("mCnt").textContent = "筛选结果：" + n + " 人";
		}

		["mG", "mB", "mO"].forEach(function (id) {
			document.getElementById(id).addEventListener("change", apply);
		});
		document.getElementById("mQ").addEventListener("input", apply);
		root._matchApply = apply;
	}

	function init() {
		var root = ready();
		if (!root) return false;
		bindCopy(root);
		bindFilter(root);
		if (root._matchApply) root._matchApply();
		return true;
	}

	// 解密完成后（EncryptedContent 会派发该事件）
	document.addEventListener("password:decrypted", function () {
		init();
	});
	// 非加密场景 / 密码已缓存
	if (document.readyState === "loading") {
		document.addEventListener("DOMContentLoaded", init);
	} else {
		init();
	}
	// 兜底轮询：内容注入时间不确定，成功即停
	var timer = setInterval(function () {
		if (init()) clearInterval(timer);
	}, 400);
	setTimeout(function () {
		clearInterval(timer);
	}, 20000);
})();
