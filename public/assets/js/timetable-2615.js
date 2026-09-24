/* 软件2615 动态课表 —— 读取 /assets/data/schedule-2615.json 渲染，支持周次切换与临时调整。 */
(function () {
	var DATA_URL = "/assets/data/schedule-2615.json";
	var root = document.querySelector(".tt-root");
	if (!root) return;

	var DAYS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
	var SLOTS = ["1-2", "3-4", "5-6", "7-8", "9-10"];
	var DATA = null;
	var CUSTOM_SLOTS = {};
	var week = 1;
	var realWeek = 1;
	var selId = null;
	var today = new Date();

	function slotInfo(key) {
		return (DATA.meta.slots && DATA.meta.slots[key]) || CUSTOM_SLOTS[key] || {};
	}
	/* 支持"临时新增"落在非标准时段（如 15:45），行按起始时间排序。 */
	function sortKey(t) {
		var m = String(t || "").match(/(\d{1,2}:\d{2})/);
		return m ? m[1] : "99:99";
	}
	function buildRows() {
		var rows = SLOTS.map(function (sk) {
			var st = slotInfo(sk);
			return { key: sk, label: st.label || sk, time: st.time || "" };
		});
		Object.keys(CUSTOM_SLOTS).forEach(function (k) {
			var st = CUSTOM_SLOTS[k];
			rows.push({ key: k, label: st.label || "临时", time: st.time || "" });
		});
		rows.sort(function (a, b) {
			var ka = sortKey(a.time), kb = sortKey(b.time);
			return ka < kb ? -1 : ka > kb ? 1 : 0;
		});
		return rows;
	}

	function esc(s) {
		return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
			return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
		});
	}
	function monday(w) {
		var p = DATA.meta.week1Monday.split("-");
		var d = new Date(+p[0], +p[1] - 1, +p[2]);
		d.setDate(d.getDate() + (w - 1) * 7);
		return d;
	}
	function fmt(d) {
		return d.getMonth() + 1 + "/" + d.getDate();
	}
	function parseWeeks(v) {
		var out = [];
		if (Array.isArray(v)) {
			v.forEach(function (x) { out.push(+x); });
			return out;
		}
		String(v || "").split(/[,，]/).forEach(function (p) {
			p = p.trim();
			if (!p) return;
			var m = p.match(/^(\d+)\s*[-~—]\s*(\d+)$/);
			if (m) { for (var i = +m[1]; i <= +m[2]; i++) out.push(i); }
			else if (/^\d+$/.test(p)) out.push(+p);
		});
		return out;
	}
	function calcRealWeek() {
		var t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
		return Math.floor(Math.round((t - monday(1)) / 86400000) / 7) + 1;
	}

	function build(w) {
		var notes = [];
		var entries = [];
		CUSTOM_SLOTS = {};
		DATA.courses.forEach(function (c) {
			entries.push({
				id: c.id, day: c.day, slot: c.slot, name: c.name,
				short: c.short || c.name, room: c.room || "", teacher: c.teacher || "",
				weeks: c.weeks || "",
				active: parseWeeks(c.weeks).indexOf(w) >= 0, cancelled: false,
				temp: false, changes: []
			});
		});
		var byId = {};
		entries.forEach(function (e) { byId[e.id] = e; });
		(DATA.overrides || []).forEach(function (ov) {
			if (parseWeeks(ov.weeks).indexOf(w) < 0) return;
			var t = ov.type || "note";
			if (t === "note") { notes.push(ov.text || ov.note || ""); return; }
			if (t === "add") {
				if (ov.time && !(DATA.meta.slots && DATA.meta.slots[ov.slot])) {
					CUSTOM_SLOTS[ov.slot] = { label: ov.slotLabel || "临时", time: ov.time };
				}
				entries.push({
					id: ov.id || "tmp" + entries.length, day: ov.day, slot: ov.slot,
					name: ov.name || "", short: ov.short || ov.name || "", room: ov.room || "",
					teacher: ov.teacher || "", time: ov.time || "",
					weeks: Array.isArray(ov.weeks) ? ov.weeks.join(",") : String(ov.weeks || ""),
					active: true, cancelled: false, temp: true,
					changes: [{ t: "add", note: ov.note || "" }]
				});
				return;
			}
			if (t === "swap") {
				var a = byId[ov.a], b = byId[ov.b];
				if (a && b) {
					var ad = a.day, as = a.slot;
					a.day = b.day; a.slot = b.slot; b.day = ad; b.slot = as;
					a.changes.push({ t: "swap", note: ov.note || "", with: b.short || b.name });
					b.changes.push({ t: "swap", note: ov.note || "", with: a.short || a.name });
				}
				return;
			}
			var e = byId[ov.id];
			if (!e) return;
		if (t === "cancel") { e.active = false; e.cancelled = true; e.changes.push({ t: "cancel", note: ov.note || "" }); }
		else if (t === "room") {
			var oldRoom = e.room;
			e.room = ov.room || e.room;
			e.changes.push({ t: "room", note: ov.note || "", old: oldRoom });
		}
		else if (t === "move") {
			var oldPos = { day: e.day, slot: e.slot, room: e.room };
			if (ov.day) e.day = ov.day;
			if (ov.slot) e.slot = ov.slot;
			if (ov.room) e.room = ov.room;
			e.active = true;
			e.changes.push({ t: "move", note: ov.note || "", old: oldPos });
		}
		});
		/* 晚自习：晚上没正课时默认安排（19:00–20:30）。
		   规则：周一~周五的 9-10 节，若当天该节「本来没排过课」（既无生效正课、也无停课/调课等原计划占用），
		   且该周有教学安排（排除整周放假 / 非教学周 offWeeks），则注入晚自习。
		   注意：原来有课、后来停课（cancel）的晚上不算"没课"——学生本就不必到课，也不另行安排晚自习。 */
		var ss = DATA.meta.selfStudy;
		if (ss && ss.enabled) {
			var off = ss.offWeeks || [];
			if (off.indexOf(w) < 0) {
				var hasClass = entries.some(function (e) { return e.active; });
				if (hasClass) {
				var offDays = ss.offDays || [];
				(ss.days || [1, 2, 3, 4, 5]).forEach(function (d) {
					var offDay = offDays.some(function (p) { return p[0] === w && p[1] === d; });
					if (offDay) return;
					var occupied = entries.some(function (e) {
						return e.day === d && e.slot === ss.slot && !e.selfStudy &&
							(e.active || e.cancelled);
					});
					if (!occupied) {
						entries.push({
							id: "selfstudy-d" + d, day: d, slot: ss.slot,
							name: ss.name || "晚自习", short: ss.short || ss.name || "晚自习",
							room: "", teacher: "", weeks: String(w),
							active: true, cancelled: false, temp: false,
							selfStudy: true, changes: []
						});
					}
				});
				}
			}
		}
		return { entries: entries, notes: notes };
	}

	function changeText(e, ch) {
		var s = e.short || e.name;
		if (ch.t === "room") return s + " 上课地点改为 " + e.room;
		if (ch.t === "move") return s + " 调整到 " + DAYS[e.day - 1] + " " + e.slot + " 节" + (e.room ? "（" + e.room + "）" : "");
		if (ch.t === "cancel") return s + " 停课";
		if (ch.t === "swap") return s + (ch.with ? " 与 " + ch.with + " 对调上课时间" : " 与其他课程对调上课时间");
		if (ch.t === "add") {
			var s2 = "临时新增：" + (e.name || s);
			if (e.room) s2 += "（" + e.room + "）";
			if (e.time) s2 += " " + e.time;
			return s2;
		}
		return s + " 有调整";
	}

	function detailHtml(e) {
		var st = slotInfo(e.slot);
		var wk = parseWeeks(e.weeks);
		var oldRoom = "", oldPos = null;
		e.changes.forEach(function (c) {
			if (c.t === "room") oldRoom = c.old || "";
			if (c.t === "move" && c.old) { oldPos = c.old; oldRoom = c.old.room || oldRoom; }
		});
		var state = e.selfStudy ? "晚自习（默认安排）" : e.cancelled ? "本周停课" : e.active ? (e.temp ? "临时安排" : "本周有课") : "本周不上";
		var timeTxt = SLOTS.indexOf(e.slot) < 0
			? (st.time || e.slot)
			: (st.label || e.slot) + " " + (st.time || "");
		var rows = [
			["任课教师", esc(e.teacher || "—")],
			["上课地点", esc(e.room || "—") +
				(oldRoom && oldRoom !== e.room ? '<i class="tt-old">原 ' + esc(oldRoom) + "</i>" : "")],
			["上课时间", DAYS[e.day - 1] + " " + timeTxt +
				(slotInfo(e.slot).note ? '<i class="tt-old">' + esc(slotInfo(e.slot).note) + "</i>" : "")],
			["上课周次", e.weeks ? "第 " + esc(String(e.weeks)).replace(/,/g, "、") + " 周" : "—"],
			["本学期周数", wk.length ? "共 " + wk.length + " 周" : "—"],
			["本周状态", state]
		];
		if (oldPos && (oldPos.day !== e.day || oldPos.slot !== e.slot)) {
			rows.splice(3, 0, ["原时间", DAYS[oldPos.day - 1] + " " +
				(slotInfo(oldPos.slot).label || oldPos.slot)]);
		}
		var notes = e.changes.map(function (c) {
			return esc(changeText(e, c) + (c.note ? "：" + c.note : ""));
		});
		return '<div class="tt-dtop"><span class="tt-dname">' + esc(e.name || e.short) +
			'</span><button type="button" class="tt-dclose" data-close="1" aria-label="关闭详情">×</button></div>' +
			'<div class="tt-dbody">' + rows.map(function (r) {
				return "<div><b>" + r[0] + "</b><span>" + r[1] + "</span></div>";
			}).join("") + "</div>" +
			(notes.length ? '<div class="tt-dnote">' + notes.join("<br>") + "</div>" : "");
	}

	function render() {
		var res = build(week);
		var mon = monday(week);
		var sun = new Date(mon.getTime());
		sun.setDate(sun.getDate() + 6);
		var todayIdx = today.getDay() === 0 ? 7 : today.getDay();
		var isNow = week === realWeek;

		var maxDay = 5;
		res.entries.forEach(function (e) { if (e.day > maxDay) maxDay = e.day; });
		if (maxDay > 7) maxDay = 7;

		var head = document.getElementById("tt-week");
		if (head) {
			head.innerHTML =
				'<b>第 ' + week + ' 周</b>' +
				'<span class="tt-wdate">' + fmt(mon) + " – " + fmt(sun) + "</span>" +
				(isNow ? '<i class="tt-now">本周</i>' : "");
		}

		var html = '<div class="tt-row tt-row-h"><i class="tt-sl"></i>';
		for (var d = 1; d <= maxDay; d++) {
			var dd = new Date(mon.getTime());
			dd.setDate(dd.getDate() + d - 1);
			html += '<span class="tt-dh' + (isNow && d === todayIdx ? " is-today" : "") + '">' +
				DAYS[d - 1] + '<em>' + fmt(dd) + "</em></span>";
		}
		html += "</div>";

		var rows = buildRows();
		rows.forEach(function (row) {
			var sk = row.key;
			var st = slotInfo(sk);
			html += '<div class="tt-row"><i class="tt-sl">' + (st.label || sk) +
				"<em>" + (st.time || "") + "</em></i>";
			for (var d = 1; d <= maxDay; d++) {
				var cell = null;
				res.entries.forEach(function (e) { if (e.day === d && e.slot === sk) cell = e; });
				if (!cell) { html += '<div class="tt-cell is-empty"></div>'; continue; }
				var cls = "tt-cell " + (cell.cancelled ? "is-cancel" : cell.selfStudy ? "is-study" : cell.active ? (cell.temp ? "is-add" : "is-on") : "is-off");
				var flag = "";
				if (cell.changes.length) {
					/* 停课优先：一门课可能既有长期「改地点」又有本周「停课」，
					   若只取 changes[0] 会把停课的格子标成「改地点」，误导学生。 */
					var t = cell.cancelled ? "cancel" : cell.changes[0].t;
					var lb = t === "room" ? "改地点" : t === "move" ? "调课" : t === "cancel" ? "停课" : t === "add" ? "新增" : "对调";
					flag = '<u class="tt-flag f-' + t + '">' + lb + "</u>";
				} else if (!cell.active && !cell.cancelled) {
					flag = '<u class="tt-flag f-off">非本周</u>';
				}
				var tip = cell.name + (cell.teacher ? " · " + cell.teacher : "") +
					(cell.room ? " · " + cell.room : "") + " · " + DAYS[d - 1] + " " + (st.label || sk) + " " + (st.time || "");
				html += '<div class="' + cls + (isNow && d === todayIdx ? " is-today" : "") +
					(cell.id === selId ? " is-sel" : "") +
					'" data-id="' + esc(cell.id) + '" tabindex="0" role="button"' +
					' aria-label="' + esc(cell.name + " 详情") + '" title="' + esc(tip) + '"><b>' +
					esc(cell.short) + "</b>" +
					(cell.room ? "<span>" + esc(cell.room) + "</span>" : "") + flag + "</div>";
			}
			html += "</div>";
		});

		var grid = document.getElementById("tt-grid");
		if (grid) { grid.style.setProperty("--tt-cols", maxDay); grid.innerHTML = html; }

		var chg = [];
		var seen = {};
		res.entries.forEach(function (e) {
			e.changes.forEach(function (c) {
				var txt = changeText(e, c);
				if (c.note) txt += "：" + c.note;
				if (seen[txt]) return;
				seen[txt] = 1;
				chg.push({ t: c.t, txt: txt });
			});
		});
		res.notes.forEach(function (n) { if (n) chg.push({ t: "note", txt: n }); });
		(DATA.meta.practice || []).forEach(function (p) {
			if (parseWeeks(p.weeks).indexOf(week) >= 0) {
				chg.push({ t: "note", txt: "整周实践：" + p.name + (p.teacher ? "（" + p.teacher + "）" : "") + "，" + (p.note || "") });
			}
		});
		var box = document.getElementById("tt-changes");
		if (box) {
			if (!chg.length) { box.innerHTML = ""; box.className = "tt-changes is-empty"; }
			else {
				box.className = "tt-changes";
				box.innerHTML = "<h4>本周调整</h4><ul>" + chg.map(function (c) {
					return '<li class="li-' + c.t + '">' + esc(c.txt) + "</li>";
				}).join("") + "</ul>";
			}
		}

		var list = document.getElementById("tt-list");
		if (list) {
			var on = res.entries.filter(function (e) { return e.active && !e.selfStudy; }).sort(function (a, b) {
				return a.day - b.day || SLOTS.indexOf(a.slot) - SLOTS.indexOf(b.slot);
			});
			list.innerHTML = on.map(function (e) {
				var st = slotInfo(e.slot);
				return '<li><b>' + esc(e.short) + "</b><span>" + DAYS[e.day - 1] + " " +
					(st.label || e.slot) + " " + (st.time || "") + "</span><span>" + esc(e.room) + "</span></li>";
			}).join("");
		}

		var dbox = document.getElementById("tt-detail");
		if (dbox) {
			var cur = null;
			if (selId) {
				res.entries.forEach(function (e) { if (e.id === selId) cur = e; });
			}
			if (!cur) {
				selId = null;
				dbox.className = "tt-detail is-empty";
				dbox.innerHTML = "";
			} else {
				dbox.className = "tt-detail";
				dbox.innerHTML = detailHtml(cur);
			}
		}
	}

	function renderPeriods() {
		var box = document.getElementById("tt-periods");
		if (!box) return;
		box.innerHTML = (DATA.meta.periods || []).map(function (p) {
			var t = p.start ? p.start + "–" + p.end : "";
			return "<li" + (t ? "" : " class=\"tt-per-empty\"") + "><b>" + esc(p.name) + "</b><span>" +
				(t || "空白") + "</span></li>";
		}).join("");
	}

	function renderNotices() {
		var box = document.getElementById("tt-notices");
		if (!box) return;
		var panel = box.closest ? box.closest(".tt-notices-panel") : null;
		var arr = (DATA.notices || []).slice();
		if (!arr.length) { if (panel) panel.style.display = "none"; box.innerHTML = ""; return; }
		if (panel) panel.style.display = "";
		box.innerHTML = arr.map(function (n) {
			var date = n.date ? '<span class="tt-nt-date">' + esc(n.date) + "</span>" : "";
			var title = n.title ? '<span class="tt-nt-title">' + esc(n.title) + "</span>" : "";
			var text = n.text ? '<div class="tt-nt-text">' + esc(n.text) + "</div>" : "";
			var head = (date || title) ? '<div class="tt-nt-head">' + date + title + "</div>" : "";
			return '<div class="tt-nt">' + head + text + "</div>";
		}).join("");
	}

	function setWeek(w) {
		var max = DATA.meta.totalWeeks || 19;
		if (w < 1) w = 1;
		if (w > max) w = max;
		week = w;
		var sel = document.getElementById("tt-select");
		if (sel) sel.value = w;
		render();
	}

	fetch(DATA_URL, { cache: "no-store" })
		.then(function (r) { return r.json(); })
		.then(function (d) {
			DATA = d;
			realWeek = calcRealWeek();
			var sel = document.getElementById("tt-select");
			if (sel) {
				var max = d.meta.totalWeeks || 19;
				var opts = "";
				for (var i = 1; i <= max; i++) opts += '<option value="' + i + '">第 ' + i + " 周</option>";
				sel.innerHTML = opts;
				sel.addEventListener("change", function () { setWeek(+sel.value); });
			}
			var pv = document.getElementById("tt-prev");
			var nx = document.getElementById("tt-next");
			var nw = document.getElementById("tt-today");
			if (pv) pv.addEventListener("click", function () { setWeek(week - 1); });
			if (nx) nx.addEventListener("click", function () { setWeek(week + 1); });
			if (nw) nw.addEventListener("click", function () { setWeek(realWeek); });
			var gridEl = document.getElementById("tt-grid");
			if (gridEl) {
				var pick = function (ev) {
					var t = ev.target;
					var cell = t && t.closest ? t.closest(".tt-cell") : null;
					if (!cell) return;
					var id = cell.getAttribute("data-id");
					if (!id) return;
					selId = id === selId ? null : id;
					render();
				};
				gridEl.addEventListener("click", pick);
				gridEl.addEventListener("keydown", function (ev) {
					if (ev.key !== "Enter" && ev.key !== " ") return;
					ev.preventDefault();
					pick(ev);
				});
			}
			var dboxEl = document.getElementById("tt-detail");
			if (dboxEl) {
				dboxEl.addEventListener("click", function (ev) {
					if (ev.target && ev.target.getAttribute("data-close")) { selId = null; render(); }
				});
			}
			renderPeriods();
			renderNotices();
			setWeek(realWeek >= 1 ? realWeek : 1);
			var meta = document.getElementById("tt-meta");
			if (meta) {
				meta.textContent = d.meta.className + " · " + d.meta.campus + " · " + d.meta.term +
					" · 数据更新 " + d.meta.updated;
			}
		})
		.catch(function () {
			var g = document.getElementById("tt-grid");
			if (g) g.innerHTML = '<p class="tt-err">课表数据加载失败，请稍后重试。</p>';
		});
})();
