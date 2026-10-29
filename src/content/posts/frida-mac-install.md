---
title: macOS 装 Frida：两条命令，两个可选项
published: 2026-10-29
description: frida 管核心和 CLI，frida-tools 管 trace/ps/ls，一个 pip 命令装完；gadget 和 Node 绑定是可选项，用不到不装。
tags:
  - Frida
  - 逆向
  - macOS
category: 工具
slug: frida-mac-install
comment: true
---

Frida 在 Mac 上没有安装器，装的就是两个 pip 包。

## 必装

```bash
pip3 install frida frida-tools
```

分工：

| 包 | 提供什么 | 验证 |
|---|---|---|
| `frida` | 核心库 + `frida` CLI | `pip show frida` |
| `frida-tools` | `frida-trace` / `frida-ps` / `frida-ls` 等工具 | `pip show frida-tools` |

`frida-tools` 依赖 `frida`，所以一条命令装两个和只装 `frida-tools` 等价——单独先装 `frida` 只是习惯问题。

装完确认：

```bash
which frida
# /opt/homebrew/bin/frida   （Apple Silicon 上 pip 装到 Homebrew 路径）
frida --version
# 16.4.5
```

## 可选一：Gadget

给**未越狱 iOS** 用的注入库。跑 `frida-ios-dump` 报 `need Gadget to attach on jailed iOS` 时才需要，其他场景跳过。

三步：从 [Frida releases](https://github.com/frida/frida/releases) 下载对应版本的 `frida-gadget-<版本>-ios-universal.dylib.gz`，解压，放进缓存目录：

```bash
gunzip frida-gadget-16.0.8-ios-universal.dylib.gz
mkdir -p ~/.cache/frida
cp frida-gadget-16.0.8-ios-universal.dylib ~/.cache/frida/gadget-ios.dylib
```

文件名必须是 `gadget-ios.dylib`，Frida 按这个固定路径找。

## 可选二：Node.js 绑定

```bash
npm install frida
```

只在用 JS 写 Node 侧脚本驱动 Frida 时才装。默认不用。

## 常见的坑

- **系统 Python 报 `externally-managed-environment`**：macOS 新版 Python 按 PEP 668 拒绝全局 pip。用 `pipx install frida-tools` 或建 venv，别加 `--break-system-packages`。
- **版本对不上**：Mac 端 `frida` 与越狱设备端 `frida-server` 必须同版本，不然握手失败。升级就两边一起升。
- **找不到 USB 设备**：先跑 `frida-ls-devices` 确认设备枚举得到，Mac 端不需要额外装 usbmuxd 工具。
