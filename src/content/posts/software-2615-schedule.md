---
title: 软件2615 动态课表
published: 2026-09-21
description: 软件2615（北校区）2026-2027 学年第 1 学期课表，按周次自动判断本周上哪些课，支持切换任意一周，并标注临时调课、换教室、停课与新增安排。
tags:
  - 课表
  - 软件2615
  - 人工智能学院
  - 北校区
category: 校园
slug: software-2615-schedule
comment: true
---

<div class="tt-root">
<style>
.tt-root{--tt-panel:#fff;--tt-panel2:#f6f8f9;--tt-line:rgba(0,0,0,.09);--tt-tx:#23282e;--tt-tx2:#6a7480;--tt-on-bg:#e4f5f3;--tt-on-bd:#7cc9c0;--tt-on-tx:#12655e;--tt-off-bg:#f2f4f6;--tt-off-tx:#a3abb4;--tt-add-bg:#e8f4e2;--tt-add-bd:#8fc46b;--tt-add-tx:#3f6b1f;--tt-cx-bg:#fdecec;--tt-cx-tx:#a33;--tt-f-room-bg:#fff2d9;--tt-f-room:#b26a00;--tt-f-cx-bg:#fdecec;--tt-f-cx:#b03030;--tt-f-add-bg:#e8f4e2;--tt-f-add:#3f6b1f;--tt-f-mv-bg:#efe9fd;--tt-f-mv:#6a4fc0;--tt-today-bd:#5b8def;--tt-study-bg:#e9eefc;--tt-study-bd:#9bb6e8;--tt-study-tx:#2f4f8f}
html.dark .tt-root{--tt-panel:#181c1f;--tt-panel2:#20262a;--tt-line:rgba(255,255,255,.1);--tt-tx:#e6edf3;--tt-tx2:#9aa6b2;--tt-on-bg:#123c3a;--tt-on-bd:#3f9c93;--tt-on-tx:#a7e5dc;--tt-off-bg:#1d2226;--tt-off-tx:#5f6a75;--tt-add-bg:#1f3319;--tt-add-bd:#4f8a3a;--tt-add-tx:#a8d68a;--tt-cx-bg:#3a1a1a;--tt-cx-tx:#f29a9a;--tt-f-room-bg:#4a3410;--tt-f-room:#f5c46b;--tt-f-cx-bg:#4a1a1a;--tt-f-cx:#f29a9a;--tt-f-add-bg:#23391a;--tt-f-add:#a8d68a;--tt-f-mv-bg:#2e2748;--tt-f-mv:#c0b0f0;--tt-today-bd:#5b8def;--tt-study-bg:#1d2740;--tt-study-bd:#3f5fa8;--tt-study-tx:#aebfe6}
.tt-root{margin:18px 0;font-size:13px;line-height:1.6;color:var(--tt-tx)}
.tt-panel{background:var(--tt-panel);border:1px solid var(--tt-line);border-radius:14px;padding:16px}
.tt-top{display:flex;flex-wrap:wrap;align-items:baseline;gap:8px}
.tt-title{font-size:15px;font-weight:500}
.tt-sub{font-size:12px;color:var(--tt-tx2)}
.tt-bar{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:14px 0 10px}
.tt-bar button,.tt-bar select{font:inherit;font-size:12px;padding:4px 10px;border:1px solid var(--tt-line);background:var(--tt-panel2);color:var(--tt-tx);border-radius:8px;cursor:pointer}
.tt-bar button:hover{border-color:var(--tt-on-bd)}
#tt-week{display:flex;align-items:center;gap:8px;font-size:14px}
.tt-wdate{font-size:12px;color:var(--tt-tx2)}
.tt-now{font-style:normal;font-size:11px;padding:1px 6px;border-radius:6px;background:var(--tt-on-bg);color:var(--tt-on-tx)}
.tt-changes{margin:10px 0;padding:10px 12px;border:1px dashed var(--tt-line);border-radius:10px;background:var(--tt-panel2)}
.tt-changes.is-empty{display:none}
.tt-h4{font-size:13px;font-weight:500;margin:0 0 6px}
.tt-changes ul{margin:0;padding-left:18px}
.tt-changes li{font-size:12px}
.tt-grid{display:grid;grid-template-columns:52px repeat(var(--tt-cols,5),minmax(84px,1fr));gap:6px;overflow-x:auto;padding-bottom:2px}
.tt-row{display:contents}
.tt-sl{font-size:11px;color:var(--tt-tx2);display:flex;flex-direction:column;justify-content:center;line-height:1.35}
.tt-sl em{font-style:normal;font-size:10px;opacity:.75}
.tt-dh{font-size:12px;color:var(--tt-tx2);text-align:center;display:flex;flex-direction:column;line-height:1.35;padding-bottom:2px}
.tt-dh em{font-style:normal;font-size:10px;opacity:.75}
.tt-dh.is-today{color:var(--tt-today-bd);font-weight:500}
.tt-cell{position:relative;min-height:54px;border-radius:9px;padding:7px 8px;border:1px solid transparent;display:flex;flex-direction:column;justify-content:center}
.tt-cell b{font-weight:500;font-size:13px}
.tt-cell span{font-size:11px;margin-top:2px;opacity:.85;word-break:break-all}
.is-on{background:var(--tt-on-bg);border-color:var(--tt-on-bd);color:var(--tt-on-tx)}
.is-off{background:var(--tt-off-bg);color:var(--tt-off-tx)}
.is-add{background:var(--tt-add-bg);border-color:var(--tt-add-bd);color:var(--tt-add-tx)}
.is-study{background:var(--tt-study-bg);border-color:var(--tt-study-bd);color:var(--tt-study-tx)}
.is-cancel{background:var(--tt-cx-bg);color:var(--tt-cx-tx)}
.is-cancel b{text-decoration:line-through}
.is-empty{background:transparent}
.tt-cell.is-today{box-shadow:inset 0 0 0 2px var(--tt-today-bd)}
.tt-flag{position:absolute;top:4px;right:4px;font-size:9px;text-decoration:none;border-radius:4px;padding:0 4px;line-height:14px}
.f-room{background:var(--tt-f-room-bg);color:var(--tt-f-room)}
.f-move,.f-swap{background:var(--tt-f-mv-bg);color:var(--tt-f-mv)}
.f-cancel{background:var(--tt-f-cx-bg);color:var(--tt-f-cx)}
.f-add{background:var(--tt-f-add-bg);color:var(--tt-f-add)}
.f-off{background:transparent;border:1px solid currentColor;opacity:.7}
.tt-list{display:none;list-style:none;margin:14px 0 0;padding:0}
.tt-list li{display:flex;justify-content:space-between;gap:10px;padding:6px 0;border-top:1px solid var(--tt-line);font-size:12px}
.tt-list b{font-weight:500}
.tt-list span{color:var(--tt-tx2)}
.tt-legend{display:flex;flex-wrap:wrap;gap:12px;margin-top:12px;font-size:11px;color:var(--tt-tx2)}
.tt-legend i{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:5px;vertical-align:-1px}
.tt-foot{margin-top:10px;font-size:11px;color:var(--tt-tx2)}
.tt-sec{margin-top:18px}
.tt-periods{display:grid;grid-template-columns:repeat(auto-fill,minmax(104px,1fr));gap:6px;list-style:none;margin:8px 0 0;padding:0}
.tt-periods li{background:var(--tt-panel2);border-radius:8px;padding:6px 9px;font-size:12px;display:flex;justify-content:space-between;gap:6px}
.tt-periods span{color:var(--tt-tx2);font-size:11px}
.tt-periods li.tt-per-empty{background:transparent;border:1px dashed var(--tt-line);opacity:.7}
.tt-err{font-size:12px;color:var(--tt-cx-tx)}
.tt-cell[data-id]{cursor:pointer}
.tt-cell.is-sel{outline:2px solid var(--tt-today-bd);outline-offset:-2px}
.tt-cell[data-id]:focus-visible{outline:2px solid var(--tt-today-bd);outline-offset:-2px}
.tt-detail{margin-top:12px;border:1px solid var(--tt-line);border-radius:10px;background:var(--tt-panel2);overflow:hidden}
.tt-detail.is-empty{display:none}
.tt-dtop{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 12px;border-bottom:1px solid var(--tt-line)}
.tt-dname{font-size:13px;font-weight:500}
.tt-dclose{border:none;background:transparent;color:var(--tt-tx2);font-size:16px;line-height:1;cursor:pointer;padding:2px 6px;border-radius:6px}
.tt-dclose:hover{background:var(--tt-line)}
.tt-dbody{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:8px;padding:10px 12px}
.tt-dbody>div{display:flex;flex-direction:column;gap:2px}
.tt-dbody b{font-size:11px;font-weight:400;color:var(--tt-tx2)}
.tt-dbody span{font-size:12px}
.tt-old{font-style:normal;font-size:11px;opacity:.7;margin-left:4px}
.tt-dnote{padding:0 12px 10px;font-size:12px;color:var(--tt-tx2);line-height:1.6}
@media(max-width:640px){.tt-list{display:block}.tt-panel{padding:12px}}
.tt-notices-panel{margin-bottom:14px}
.tt-notices-panel .tt-top{margin-bottom:10px}
.tt-notices{display:flex;flex-direction:column;gap:10px}
.tt-nt{border-left:3px solid var(--tt-on-bd);background:var(--tt-panel2);border-radius:8px;padding:8px 12px}
.tt-nt-head{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;margin-bottom:2px}
.tt-nt-date{font-size:11px;color:var(--tt-tx2)}
.tt-nt-title{font-size:13px;font-weight:500}
.tt-nt-text{font-size:12px;color:var(--tt-tx);line-height:1.6;white-space:pre-wrap}
</style>
<div class="tt-panel tt-notices-panel">
<div class="tt-top"><span class="tt-title">通知</span><span class="tt-sub">重要安排与提醒</span></div>
<div id="tt-notices" class="tt-notices"></div>
</div>
<div class="tt-panel">
<div class="tt-top"><span class="tt-title">软件2615 课表</span><span class="tt-sub">北校区 · 2026-2027 学年第 1 学期</span></div>
<div class="tt-bar">
<button id="tt-prev" type="button">← 上一周</button>
<div id="tt-week"></div>
<button id="tt-next" type="button">下一周 →</button>
<button id="tt-today" type="button">回到本周</button>
<select id="tt-select" aria-label="选择周次"></select>
</div>
<div id="tt-changes" class="tt-changes is-empty"></div>
<div id="tt-grid" class="tt-grid"></div>
<div id="tt-detail" class="tt-detail is-empty"></div>
<ul id="tt-list" class="tt-list"></ul>
<div class="tt-legend"><span><i style="background:var(--tt-on-bg);border:1px solid var(--tt-on-bd)"></i>本周有课</span><span><i style="background:var(--tt-off-bg)"></i>本周不上</span><span><i style="background:var(--tt-f-room-bg)"></i>改地点</span><span><i style="background:var(--tt-f-mv-bg)"></i>调课 / 对调</span><span><i style="background:var(--tt-f-cx-bg)"></i>停课</span><span><i style="background:var(--tt-add-bg);border:1px solid var(--tt-add-bd)"></i>临时新增</span><span><i style="background:var(--tt-study-bg);border:1px solid var(--tt-study-bd)"></i>晚自习</span></div>
<div class="tt-foot"><span id="tt-meta"></span></div>
<div class="tt-sec"><div class="tt-h4">北校区作息时间</div><ul id="tt-periods" class="tt-periods"></ul></div>
</div>
<script src="/assets/js/timetable-2615.js"></script>
</div>

课表数据来自教务系统的班级课程表，节次时间以学院《关于公布各校区作息时间的通知》为准。北校区作息表一天排到第十一节，其中**第八节、第十一节是空白**（不排课）；教务课表上写的「第七八节」实际就是第七节这一大节，16:05–17:25 连上，中间没有第八节。第 13-14 周是军事技能整周实践，不按这张周课表上课。
