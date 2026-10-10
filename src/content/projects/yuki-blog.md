---
title: "雪穗博客（本站）"
published: 2026-08-08
draft: false
order: 90
description: "本站源码：基于 Astro + Firefly 主题二次开发的静态博客，托管在 Cloudflare Pages，推送即自动上线。"
image: "https://opengraph.githubassets.com/1/cixiy1/Yuki-blog"
status: "published"
tags:
  - Astro
  - Firefly
  - 博客
link:
  - label: "GitHub"
    icon: "fa7-brands:github"
    value: "https://github.com/cixiy1/Yuki-blog"
  - label: "在线访问"
    icon: "material-symbols:open-in-new"
    value: "https://yiyu14.top"
---

## 关于本站

**雪穗博客**（Yuki Blog）是一个基于 **Astro** 构建、托管在 **Cloudflare Pages** 上的静态博客。主题来自开源项目 [Firefly](https://github.com/CuteLeaf/Firefly)（Fuwari 的二次开发），并在此基础上做了持续的个性化改造。

## 技术栈

- **Astro 7** —— 静态站点生成，输出纯静态资源
- **Svelte + TypeScript** —— 交互组件
- **Tailwind CSS** —— 样式方案
- **Pagefind** —— 客户端全文搜索
- **Cloudflare Pages** —— 托管，推送 `master` 即自动构建上线

## 自建内容

- **班级动态课表** —— 按周次自动判断本周课程，支持临时调课 / 换教室 / 停课 / 新增安排标注
- **教材书单与购买统计**、**新生组队匹配**等班级事务页面
- **站点统计** —— 文章数 / 分类 / 标签 / 总字数 / 运行时长
- 文章 **系列**、**项目展示**、**待办清单** 等交互组件

## 本地运行

```bash
corepack pnpm@9.14.4 install
corepack pnpm@9.14.4 dev
```
