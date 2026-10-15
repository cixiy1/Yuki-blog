---
title: "Yuki-Blog App"
published: 2026-10-15
draft: false
order: 95
description: "给软件2615 班写的 Flutter 班级应用。核心是动态课程表：周次自动推算、六种调课类型、与博客课表数据同源，改一次课表 App 自动同步，不用发版。"
image: "https://opengraph.githubassets.com/1/cixiy1/Yuki-Blog-App"
status: "developing"
tags:
  - Flutter
  - Dart
  - 校园
  - 课表
link:
  - label: "GitHub"
    icon: "fa7-brands:github"
    value: "https://github.com/cixiy1/Yuki-Blog-App"
---

## 项目简介

**Yuki-Blog App**（包名 `yuki_blog_app`）是给软件2615 班写的班级应用，用 Flutter 开发，一套代码跑 Android / iOS / macOS / Windows / Web。当前已完成的核心模块是**动态课程表**——把博客上那套按周次自动推算、支持临时调课的课表搬到了 App 里。

## 动态课程表

- **周次自动推算**：以数据里的 `week1Monday` 为基准算出当前真实周次，默认落在「本周」，提供上一周 / 下一周 / 手动选周 / 回到本周，周次条同时显示该周周一至周日的日期区间，到边界周自动置灰。
- **六种调整类型**：换教室（room）、调课（move）、对调（swap）、停课（cancel）、临时新增（add）、提示（note），全部按周次生效，不影响基础课表。
- **格子状态与图例**：有课 / 非本周 / 新增 / 停课 / 晚自习 / 实践周各有配色，界面底部给出图例说明。
- **课程详情**：点击格子展开详情面板，再点同格或按 × 收起。
- **本周调整面板**：把本周所有调课集中列出，无调整时整块隐藏。
- **通知区**：位于课表网格下方，按真实周次过滤、过期自动消失，标题与正文同款 6 类关键词高亮。
- **数据更新历**：底部多彩面板（彩虹渐变标题、8 色循环色条与日期徽章、最新一条高亮角标），正文按 6 类关键词高亮（角色/楼宇/科目/事项/动作/负面动作）并采用竖排布局，读取与博客线同构的 `meta.changelog`；网络同步失败回退离线数据时置顶提醒「可能不是最新」。

## 数据同步：与博客同源

课表数据与博客线完全同源同格式，都是 `schedule-2615.json`，App 侧按优先级依次尝试三个地址：

1. `yiyu14.top` —— Cloudflare Pages 线上站点（首选）
2. `raw.githubusercontent.com` —— 仓库源
3. `cdn.jsdelivr.net` —— jsDelivr 镜像

任一成功即解析返回（单地址超时 8 秒）；三个全失败时回退到打包进 App 的本地 `assets/data/schedule-2615.json`，保证离线也能看课表。

页面只依赖 `TimetableRepository` 接口取数，换数据源不需要动 UI 和解析逻辑。实际效果：**调课改班时只改博客那份 JSON，App 下次打开自动同步，不用重新发版。**

## 技术栈

| 领域 | 选型 |
|---|---|
| 框架 | Flutter（Dart SDK ^3.13.5）+ Material 3 |
| 路由 | go_router（`ShellRoute` 包一层抽屉导航壳） |
| 网络 | http |
| 主题 | 亮/暗双主题跟随系统，课表状态色从 `ColorScheme` 派生 |

## 目录结构

```text
lib/
├── main.dart / app/          入口、MaterialApp.router、主题、路由表
├── core/                     数据源（远程三源回退 / 本地 asset / 内存）+ 课表解析器
├── models/timetable.dart     数据模型（meta / courses / overrides / notices）
└── features/
    ├── home/                 HomeShell 导航壳（动态课程表 / 待办 / 设置）
    ├── schedule/             课表页 + 网格 / 周次条 / 详情 / 调整 / 通知 / 图例
    ├── todo/                 待办（占位）
    └── setting/              设置（占位）
```

## 进度

- [x] 课表数据模型与解析（周次区间、六种调整）
- [x] 课表网格、周次切换、课程详情、本周调整、通知区
- [x] 三源网络同步 + 本地 asset 兜底
- [x] 数据更新历面板与「最近更新于」标识
- [x] 亮/暗主题与自适应图标
- [ ] 待办页
- [ ] 设置页
- [ ] 打包分发（APK / IPA）
