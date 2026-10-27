---
title: "FSP · 大肥鱼学习平台"
published: 2026-10-27
draft: false
order: 92
description: "AI 驱动的个性化学习平台：一句话说出想学的东西，模型访谈摸清基础后生成技能关卡与学习资料，每天推一关、学完即测、按掌握度重排路径。为华为开发者竞赛「AI 自主学习系统设计大赛」开发，已结赛。"
image: "https://opengraph.githubassets.com/1/cixiy1/Fatfish-Study-Platform"
status: "published"
tags:
  - Nuxt 4
  - Vue
  - TypeScript
  - SQLite
  - AI
link:
  - label: "GitHub"
    icon: "fa7-brands:github"
    value: "https://github.com/cixiy1/Fatfish-Study-Platform"
---

## 项目简介

一个 AI 驱动的个性化学习平台。学习者用一句话说出想学的东西——日语、吉他、统计、考研专业课、前端开发都行——系统通过 3~5 轮追问摸清基础与节奏，给出 1~3 个学习方向；选定后把方向拆成 3~8 个技能关卡，并为每关生成学习资料。按「每日时长」每天推一关，学完即测，掌握度变化会重排后续关卡。

为华为开发者竞赛「AI 自主学习系统设计大赛」开发，已结赛。

## 核心功能

| 功能 | 说明 |
|---|---|
| **方向访谈** | 大模型一次一问（3~5 轮），摸清「想学什么 / 基础 / 每周时间 / 偏好」后给出 1~3 个方向 |
| **任意领域** | 技能点不限定技能库：模型可现场提出新技能，选中后自动落库并挂到方向下 |
| **关卡路径** | 选定方向后一次生成 3~8 个技能关卡与每关学习资料（严格模式，生成不全就报错，不塞模板） |
| **今日仪表盘** | 今日目标、进度环、连胜、XP、下一关 |
| **阶段测评** | 每 5 关一次，按掌握度重排后续关卡 |
| **智能答疑** | 带引用的问答，答案可追溯到站内资料 |
| **学习复盘** | 汇总完成度、耗时与掌握情况 |

## 账号与部署

- 邮箱注册 + 邮件验证激活、GitHub OAuth 登录（邮箱一致自动绑定）、「记住我」7 天会话。
- 管理后台可配置 SMTP、GitHub 凭证、大模型；大模型未配置时全站阻断并给出配置引导。
- 首次部署走 `/install` 向导：数据库、管理员、站点、SMTP、大模型、OAuth 一步配完，配置持久化后向导自动关闭。

## 技术栈

- **框架**：Nuxt 4 + Nitro 一体部署（页面与接口同进程），Vue 3
- **数据**：SQLite（better-sqlite3 / WAL）
- **UI**：@nuxt/ui + TailwindCSS 4，富文本 TipTap
- **测试**：Vitest 单元测试 + Playwright E2E 三层测试体系
- **安全**：scrypt 密码哈希、HMAC-SHA256 签名会话、AES-256-GCM 加密敏感配置、防账号枚举、注册限流

大模型走 OpenAI 兼容或 Anthropic Messages 协议，不绑定单一厂商。
