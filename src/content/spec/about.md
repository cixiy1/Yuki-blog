# 关于我 / About Me

<p align="center">
  <img src="/assets/images/avatar.jpg" alt="雪穗（Yuki）" width="140" style="border-radius:50%;" />
</p>

<p align="center">
  <b>雪穗（Yuki）</b><br/>
  某高校软件工程专业 2026 级大一学生 · 全栈开发 / LLM Agent / 移动端跨平台 / AI 训练工程<br/>
  技术博客 <a href="https://yiyu14.top">yiyu14.top</a>　·　GitHub <a href="https://github.com/cixiy1">cixiy1</a>
</p>

<p align="center">
  <a href="/files/resume-yuki.pdf"><b>📄 下载 PDF 简历</b></a>　·　<a href="/files/resume-yuki.docx"><b>📝 下载 Word 简历</b></a>
</p>

---

## 一、基本信息

| 项 | 内容 |
|---|---|
| 姓名 | 雪穗（Yuki） |
| 身份 | 某高校软件工程专业 大一学生（2026 级） |
| 技术博客 | [yiyu14.top](https://yiyu14.top) |
| GitHub | [cixiy1](https://github.com/cixiy1) |
| 主要方向 | 全栈开发 · LLM Agent · 移动端跨平台 · AI 训练工程 |

## 二、技术栈与能力自测

| 领域 | 自评分 | 代表工具 / 框架 | 说明 |
|---|---|---|---|
| Python | ★★★★★ | asyncio、LLM SDK、SQLite | Agent 内核、校园系统服务端主力 |
| TypeScript / Astro | ★★★★★ | Astro 7、Svelte、Tailwind | 个人博客全站二次开发 |
| Dart / Flutter | ★★★★★ | Flutter 3、Material 3、go_router | 跨五端班级应用，自研沉浸式标题栏 |
| 前端框架 | ★★★★☆ | Vue 3、Nuxt 4（在研） | EduSync 前台、fsp 在研 |
| LLM / Agent | ★★★★☆ | OpenAI / Anthropic、自建 kernel | 事件/记忆/上下文/策略/技能内核 |
| CI/CD 与云 | ★★★★☆ | Cloudflare Pages、GitHub Actions | 推送即上线、APK 自动发版 |
| 移动端工程 | ★★★★☆ | 应用内更新、离线优先同步 | 三源回退 + 本地兜底 |
| 训练工程 | ★★★☆☆ | 多卡调度、进程管理（在研） | ChestSmartDiagnosis 在研 |

## 三、项目经历

### 1. 雪穗博客（Yuki Blog）· 已上线
- 基于 Astro 7 + Firefly 主题二次开发的静态博客，Cloudflare Pages 托管，推送 master 即自动构建上线。
- 班级动态课表（按周次推算、六种调课调整、数据驱动）；教材书单、新生组队匹配、站点统计等页面；文章系列、项目展示、待办清单等交互组件；长期维护主题升级与线上 bug。

### 2. Yuki-Blog App（Flutter 班级应用）· 开发中
- 一套代码跑 Android / iOS / macOS / Windows / Web，核心为动态课程表（与博客同源，改一次 JSON 两端更新，无需发版）。
- 光感沉浸标题栏（自研分带 BackdropFilter）；应用内更新（版本比对 + 流式下载 + 系统安装器，CI 自动构建签名 APK）；离线优先同步（站点 / raw / jsDelivr 三源回退）。

### 3. Yuki Agent（Python Agent 内核）· 开发中
- 可嵌入的 agent 运行时：事件总线、记忆、上下文组装、策略与审批、模型接入、技能与工具。
- 会话管理（/save、/load、/sessions）、外置工具包热加载（/pkg install）、Provider 可切换。

### 4. EduSync · 学校多媒体设备互联系统 · 已归档
- Vue 3 + Python，设备实时状态检测与上报、服务端远程介入终端、教育资源多端共享。
- 2025 粤港澳学生信息科技创新大赛二等奖作品。

### 5. fsp · AI 自主学习系统 · 竞赛 / 在研
- Nuxt 4 + @nuxt/ui + @nuxt/content + better-sqlite3，计划接入华为云 MaaS。

### 6. ChestSmartDiagnosis · 多卡训练调度 · 在研
- 多卡训练调度服务及网页控制台，覆盖终端子命令，支持远程显卡、日志与训练管理。

## 四、技术博客与写作（代表性作品）

> 全部发布于本站，持续更新；按能力维度归类，作为对应能力的可验证佐证。

- **[在 macOS 上从零解密微信本地数据库](/posts/macos-wechat-db-decrypt/)**（2026-10-27）— SQLCipher 4 密钥验证、CCKeyDerivationPBKDF2 钩子、zstd 消息体解析。*体现：逆向分析、密码学实践、跨平台取证。*
- **[做一个只读的微信本地数据工作台](/posts/yuki-workbench-readonly/)**（2026-10-27）— FastAPI + Vue，WAL 快照解密、2 秒增量同步 + SSE 推送。*体现：全栈开发、实时同步架构。*
- **[从零搭一只住在 QQ 里的鲸鱼娘：大肥鱼机器人](/posts/dafeiyu-qq-bot-setup/)**（2026-10-27）— AstrBot + NapCat + DeepSeek 接入 QQ 群。*体现：Agent / 机器人工程、协议端对接、插件开发。*
- **[让 AI 生成的代码不再满屏警告：IDEA 无头静态检查](/posts/idea-headless-inspection/)**（2026-08-27）— 把命令行检查器接入 Agent 工作流。*体现：工具链自动化。*
- **[软件2615 动态课表](/posts/software-2615-schedule/)**（2026-09-21）— 按周次推算、支持调课 / 换教室 / 停课 / 新增，数据驱动。*体现：数据驱动交互组件。*
- **[新生组队匹配](/posts/dorm-match/)**（2026-09-13，AES-256-GCM 加密）— 问卷数据组队视图，支持筛选与微信号复制。*体现：前端交互 + 前端加密。*
- **[真・一键激活 JetBrains 全家桶](/posts/jetbrains-activation-ckey-run/)**（2026-09-08，转载整理）— 跨平台全自动激活方案。*体现：资料甄别与系统化整理。*

## 五、我能解决什么

- **个人站点与内容平台**：从零搭建并长期维护生产级静态博客（CI/CD 自动上线、站内搜索、数据驱动组件、主题定制）。
- **跨平台移动应用**：用 Flutter 交付可离线、可应用内更新的真实应用，打通 GitHub Actions 自动构建与分发。
- **LLM Agent 基础设施**：事件/记忆/上下文/策略/技能/工具内核，支持外置工具热加载与多模型切换。
- **校园 / 教育类系统**：设备监控、远程控制、资源分发等中心化运维场景的全栈实现。
- **AI 训练工程**：多卡训练任务调度、显卡与日志的远程可视化管理。
- **技术写作与逆向探索**：在博客输出原创技术文章，具备独立排查与文档化能力。

## 六、奖项与荣誉

| 时间 | 赛事 / 奖项 | 等级 | 作品 | 备注 |
|---|---|---|---|---|
| 2025-07 | 2025 年粤港澳学生信息科技创新大赛（计算思维类代码编程 高中组） | **二等奖** | 《学校多媒体设备互联系统》 | 广东省教育厅；与同学合作 |
| 2024-08 | 2024 年粤澳学生信息科技创新大赛（计算思维类代码编程 高中组） | 三等奖 | 《校园语声》 | 广东省教育厅 |
| 2025-01 | 第三届市级青少年编程大赛（信息学算法挑战赛 高中组） | 三等奖 | — | 市级科协、教育局等六单位 |
| 2025-06 | 2025 年市级普通高中信息技术学科（高二）竞赛 | 三等奖 | — | 市级教师发展中心 |

> 应本人要求，奖项署名与所属单位已隐去，可提供原件核验。

## 七、教育经历

- 高中：广东省某中学（2025 年毕业），期间连续在省级、市级信息科技赛事获奖。
- 大学：某高校软件工程专业 大一（2026 级，在读）。

---

## 📮 联系我

- **QQ**：2132539636
- **邮箱**：[2132539636@qq.com](mailto:2132539636@qq.com)
- **GitHub**：[cixiy1](https://github.com/cixiy1)

## 🛠️ 关于本站

本站使用 **Astro** 构建，基于 [Firefly](https://github.com/CuteLeaf/Firefly) 主题（Fuwari 二次开发），部署在 Cloudflare Pages，由 GitHub 自动构建。支持文章写作、音乐播放器、相册与书签、评论系统、亮暗主题切换。

## 📎 附件

- [📄 个人开发简历（PDF）](/files/resume-yuki.pdf)
- [📝 个人开发简历（Word）](/files/resume-yuki.docx)

---

*感谢你的来访！希望在这里能找到对你有用的内容！*
