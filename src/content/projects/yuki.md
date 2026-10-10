---
title: "Yuki Agent"
published: 2026-08-29
draft: false
order: 100
description: "可嵌入的 agent 内核（yuki-kernel）+ 基于它实现的示例聊天外壳：会话管理、包管理、审批与热加载。"
image: "https://opengraph.githubassets.com/1/cixiy1/Yuki"
status: "developing"
tags:
  - Python
  - Agent
  - LLM
link:
  - label: "GitHub"
    icon: "fa7-brands:github"
    value: "https://github.com/cixiy1/Yuki"
---

## 项目简介

**Yuki** 由两个互相独立的子项目组成，合起来是一个最小可用的 agent 运行时：

- **`kernel/`（yuki-kernel）** —— 可嵌入的 agent **内核**，定位是「空白大脑」：只提供事件、记忆、上下文、策略、Provider、Skill 等通用能力，不含人格与具体业务。
- **`example/`（yuki）** —— 基于内核实现的**示例聊天外壳**，保留会话、包管理、审批与热加载。

## 内核模块

| 模块 | 职责 |
|---|---|
| `events` | 事件总线 |
| `memory` | 记忆 |
| `context` | 上下文组装 |
| `policy` | 策略与审批 |
| `providers` | 模型接入（openai / anthropic） |
| `skills` | 技能与工具 |

## 主要能力

- **会话管理**：`/save <名字>`、`/load <名字>`、`/sessions`、`/new`、`/reload`
- **包管理**：`/pkg install <目录|zip>`、`/pkg remove <id>`、`/pkg list`，支持外置工具包热加载
- **模型可切换**：`AGENT_PROVIDER` 支持 `openai`、`anthropic`

## 快速开始

```bash
pip install -e kernel
pip install -e example
yuki
```

## 目录结构

```text
kernel/     内核源码（events / memory / context / policy / providers / skills）+ 契约测试
example/    示例聊天外壳 + 外置工具包目录（packages/）+ 联调脚本
docs/       内核使用指南（kernel.md）、工具系统开发指南（tools/）
```
