---
title: 真・一键激活 JetBrains 全家桶！
published: 2026-09-08
description: 整合自腾讯云开发者社区的全自动激活方案，适配 Windows / Linux / macOS 三大系统，覆盖 IDEA、PyCharm、GoLand 等全系列，附工具包下载。
tags:
  - JetBrains
  - 开发工具
  - 效率工具
category: 工具
slug: jetbrains-activation-ckey-run
author: 腾讯云开发者社区
sourceLink: "https://cloud.tencent.com/developer/article/2532994"
licenseName: "转载"
comment: true
---

> **本文整理转载自腾讯云开发者社区**
> 原文标题：《真・一键激活 JetBrains 全家桶！》
> 原文链接：<https://cloud.tencent.com/developer/article/2532994>
> 原文最后更新：2025-09-27

---

## 前言

✨【技术神器】真・一键激活 JetBrains 全家桶！三系统通用，0 手动操作超省心 ✨

先感谢开源社区大佬们的技术积累～

这里整合了一套**全自动激活方案**，适配 Win / Linux / Mac 三大系统，实测覆盖 IDEA、PyCharm、GoLand 等全系列工具，激活有效期直接拉满到 **2099 年 12 月 31 日**！

---

## 一、无需下载文件的激活新姿势

传统的激活方式往往需要手动下载补丁、改配置文件、找 `vmoptions` 路径，步骤繁琐还容易出错。这套方案把这些全部脚本化，只需要一行命令。

---

## 二、三系统操作指南（附保姆级命令）

### ▶ Windows 系统

1. **打开管理员权限 PowerShell**：按 `Win + X`，选择 `Windows PowerShell(管理员)`
2. **复制执行激活命令**（切勿手输！）：

```powershell
irm ckey.run|iex
```

- **Debug 模式**（查看详细日志）：

```powershell
irm ckey.run/debug|iex
```

- **查看脚本源码**：

```powershell
irm ckey.run
```

### ▶ Linux 系统

```bash
wget --no-check-certificate ckey.run -O ckey.run && bash ckey.run
```

- **Debug 模式**：

```bash
wget --no-check-certificate ckey.run/debug -O ckey.run && bash ckey.run
```

### ▶ macOS 系统

```bash
curl -L -o ckey.run ckey.run && bash ckey.run
```

- **Debug 模式**：

```bash
curl -L -o ckey.run ckey.run/debug && bash ckey.run
```

> 📌 **注意**：Mac 默认无 wget，推荐用 curl；若已安装 wget，可直接使用 Linux 命令。

---

## 三、实测环境与激活效果

### ✅ 测试系统

- Windows 10
- Ubuntu 24.04.2 LTS
- macOS Sequoia 15.2

### ✅ 激活示例（IDEA 2025.1.1.1）

```
License: IntelliJ IDEA Active until December 31, 2099

Licensed to: JetBrains / ckey.run

License ID: 792D98F6C2
```

（此处可插入激活截图，显示授权到期时间）

---

## 四、执行日志与细节说明

### ▶ 正常模式运行日志

```
[2025-06-02 15:57:41][INFO] 处理: IntelliJ IDEA 2025.1

[2025-06-02 15:57:43][SUCCESS] IntelliJ IDEA 2025.1 激活成功!

[2025-06-02 15:57:47][SUCCESS] PyCharm 2025.1 激活成功!

...（更多产品激活日志）
```

### ▶ 自定义激活信息

如需修改授权名称或日期，执行脚本后按提示输入：

```
自定义授权名称(回车默认ckey.run):

自定义授权日期(回车默认2099-12-31, 格式 yyyy-MM-dd):
```

---

## 五、附件下载

文中涉及的工具包（含 `ja-netfilter.jar`、`plugins-jetbrains/`、`vmoptions/`、`scripts/` 等完整目录结构）已打包，方便离线使用：

📦 **[ckey_run.zip 下载](/files/ckey_run.zip)**（约 385 KB）

> 下载后解压即可看到完整目录，无需再通过远程命令拉取。

---

## 六、注意事项与常见问题

1. **激活前准备**：请关闭所有 JetBrains 软件，避免冲突。
2. **Mac 激活失败解决方案**：若之前使用过其他工具，需彻底删除缓存文件（路径示例：`~/Library/Application Support/JetBrains`）。
3. **安全提示**：脚本源码可通过 `irm ckey.run` 查看，建议在执行前确认代码安全性。

---

## 七、最后提醒

技术工具仅供学习交流，**请支持正版软件**～如需长期使用，建议通过 JetBrains 官方渠道获取授权！

### 附：合法的低成本 / 免费途径

如果你只是想省下授权费，下面这几条**完全正当**，而且大多比折腾激活更省事：

| 途径 | 适用人群 | 说明 |
| --- | --- | --- |
| **Community 社区版** | 所有人 | IDEA / PyCharm 均有免费社区版，JVM、Python 等基础开发够用 |
| **学生 / 教师免费授权** | 在校学生、教师 | 用教育邮箱申请，全家桶全功能免费，每年续期 |
| **开源项目授权** | 活跃的开源维护者 | 项目满足一定 star / 活跃度即可申请，免费一年可续 |
| **Fallback 回退许可证** | 连续订阅满 12 个月的老用户 | 停订后可永久保留订阅期内某一版本的永久使用权 |
| **30 天试用 + 官方折扣** | 所有人 | 新版本试用重置；黑五、开学季常有折扣 |

> 顺带一提，`irm ckey.run | iex` 这类"下载远程脚本立即执行"的命令，本质是把本机权限交给一个外部域名。执行前务必先 `irm ckey.run` 看清源码，别直接管道给 `iex` / `bash`。

---

> 本文内容整理自腾讯云开发者社区，原文链接：<https://cloud.tencent.com/developer/article/2532994>，版权归原作者所有。
