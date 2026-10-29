---
title: "从零搭一只住在 QQ 里的鲸鱼娘：大肥鱼机器人搭建实录"
published: 2026-10-27
description: 用 AstrBot + NapCat + DeepSeek 把一只蓝色鲸鱼娘接进 QQ 群的完整过程：装框架、对接协议端、导人格、62 个插件的取舍、两层破甲与防破甲，以及五个真正花掉时间的坑——硬编码 /AstrBot/data 路径、默认假号 2774000001、macOS 上 os.replace 被拒、框架升级把心跳打哑、PATH 里没有 ffmpeg。每条命令和日志都是本机实测。
tags:
  - AstrBot
  - NapCat
  - QQ机器人
  - 踩坑
  - macOS
category: 技术
slug: dafeiyu-qq-bot-setup
series: 编码经验
seriesOrder: 4
comment: true
---

QQ 群里养一只 AI，要它能看图、能发表情包、记得住人、冷场会自己开口，说话带脾气。第一版用了两天，之后一周陆续加到 62 个插件，又补上破甲和防破甲两层。下面按搭建顺序写，命令、路径、日志都在这台 Mac 上跑过。

**文中 QQ 号和群号已打码**：主人 `213****636`、机器人自己 `283****679`、主群 `105****275`，换成你自己的就行。

**实测环境**

| 项 | 值 |
|---|---|
| 机器 | MacBook Air M2（arm64） |
| 系统 | macOS 26.x |
| 框架 | AstrBot 4.29.3 |
| 协议端 | NapCat（OneBot v11，反向 WebSocket） |
| 模型 | DeepSeek `deepseek-flash` |
| 安装方式 | `uv tool install astrbot` |
| 最终插件数 | 62（50 个外部 + 12 个自写） |

**边界**：只在自己的群和私聊里跑，不群发，不加陌生群，不转发他人消息到外部。AstrBot 接的是你自己的 QQ 号，账号风险自己承担。

---

## 一、我要什么

动手前先列需求，后面挑插件、写补丁都对着这张表来：

| 需求 | 落到哪一层 |
|---|---|
| 一直在线 | 进程保活（launchd）+ 协议端不掉线 |
| 有人格，不是客服 | 系统提示词里的人格 + 出口侧拦截 |
| 认主人 | 主人事实注入 + 各插件的主人豁免 |
| 主人的话优先 | 破甲层：主人指令前置（见第八节） |
| 自己写记忆 | 给模型可调用的写工具，落进同一张表 |
| 能发表情包 | 表情包库（按 md5 认图）+ 文字表情转真表情 |
| 主动开口 | 冷场计时 + 定时唤醒 + 作息限制 |
| 听得见语音 | 本地 whisper 转写，当成文字塞进上下文 |
| 自己找素材 | 联网搜图 + B 站热门，不用每张图都靠人喂 |
| 看得懂图 | 视觉模型（这条最后没做成，见文末） |

---

## 二、三层架构

```mermaid
flowchart LR
    A[QQ 服务器] <--> B[NapCat OneBot v11]
    B -->|反向 WebSocket 6199| C[AstrBot aiocqhttp]
    C --> D[插件层 dsh 系列与自写]
    D --> E[LLM deepseek-flash]
    C --> F[数据目录 SQLite 与 JSON]
```

NapCat 只负责登录 QQ、收发协议包，不碰逻辑。AstrBot 负责适配、插件调度、接模型。两边用 OneBot v11 的 WebSocket 连。

选反向 WS 是因为 AstrBot 这边做服务端，NapCat 主动连过来，重启 AstrBot 不用改 NapCat 配置。

---

## 三、装 AstrBot

```bash
uv tool install astrbot
astrbot --version        # AstrBot, version 4.29.3
```

装完可执行文件在 `~/.local/bin/astrbot`。第一次跑会初始化数据目录：

```bash
export ASTRBOT_ROOT=/Users/yuki     # 不设也行，但必须在 /Users/yuki 目录下运行
cd /Users/yuki
astrbot run
```

初始化后目录长这样：

```
/Users/yuki/data/
├── cmd_config.json      # 主配置：平台、模型、人格
├── data_v4.db           # 主库
├── plugins/             # 插件目录
├── config/              # 每个插件自己的配置
├── logs/astrbot.log     # 框架自带日志（这台机器上一直没生成）
├── astrbot_stdout.log   # 真正的日志：launchd 重定向的 stdout
├── astrbot_stderr.log   # 启动横幅、端口占用
└── temp/                # 收图/收语音的临时目录
```

WebUI 默认在 `6185`，浏览器打开 `http://127.0.0.1:6185` 设账号密码。

注意：升级后密码从明文换成了 pbkdf2，老密码会失效。后面要用 API 的话，直接从 `cmd_config.json` 读 `dashboard.jwt_secret` 自签令牌更省事，见「热重载」一节。

---

## 四、装 NapCat 并接上

用官方安装器（macOS 上是 `NapCatInstaller`）装好后扫码登录。然后在 NapCat 的网络配置里新建反向 WebSocket：

| 项 | 值 |
|---|---|
| 类型 | 反向 WebSocket |
| URL | `ws://127.0.0.1:6199/ws` |
| 消息格式 | Array（CQ 码风格，AstrBot 侧默认） |

对应 AstrBot 的 `data/cmd_config.json`：

```json
"platform": [
  {
    "id": "default",
    "type": "aiocqhttp",
    "enable": true,
    "ws_reverse_host": "0.0.0.0",
    "ws_reverse_port": 6199
  }
]
```

验证接通：

```bash
tail -f /Users/yuki/data/astrbot_stdout.log | grep -i aiocqhttp
```

看到连接建立、上线事件推过来就算通。此时私聊机器人应该已经有反应，用的是默认人格，会很客服。

---

## 五、接模型

WebUI 的「服务提供商」页里加一个 OpenAI 兼容源，填 DeepSeek 的 base URL 和 key，然后加模型：

```json
"provider": [
  {
    "id": "deepseek/deepseek-flash",
    "enable": true,
    "provider_source_id": "deepseek",
    "model": "deepseek-flash",
    "modalities": ["text", "image", "tool_use"],
    "max_context_tokens": 1000000
  }
]
```

`modalities` 里写 `image` 只是声明它"可以"接图，不等于有视觉能力。`deepseek-flash` 是纯文本模型，「看得懂图」这条会卡住，文末交代。

---

## 六、人格只放系统提示词

人格我用了 whyever77 的 `dafeiyu-astrbot` 仓库，文件是 `persona/大肥鱼-人格.md`，抖音版那套。她自称**本鲸**，叫用户**鱼片**，被叫"大肥鱼"会小声抗议。比常见的"温柔女仆 AI"有脾气得多，是我要的。

导入方式两种：直接放进 AstrBot 的人格页，适合只有一份人格的场景；或者插件注入，适合人格要按群、按人切换。

我选了第一种，而且给自己立了条规矩：**人格只放系统提示词，插件一律不写人格，只补事实**。

这条规矩后来省了很多返工。插件库里有一批“人格类”插件（persona-core / selfaware / factguard / scene / will / agency），各自往提示词里塞一段“你应该怎样”，跟抖音版人格正面冲突，结果是说话一会儿像 ChatGPT 一会儿像鲸鱼娘。解决见下一节。

---

## 七、插件：挑着装，冲突的自写

参考仓库带了 40 多个 `dsh-*` 插件，全装上会互相打架，我按类别挑了一部分：

| 类别 | 代表插件 | 装不装 | 理由 |
|---|---|---|---|
| 人格 / 自我认知 | persona-core、selfaware、factguard、scene、will、agency | **不装** | 跟抖音版人格冲突，自写 `_core` 替代 |
| 记忆 | dsh-memory、dsh-merge、dsh-social | 装 | 自动抽取事实，按会话分桶 |
| 主动开口 | dsh-initiate、dsh-proactive、dsh-interest | 装 | 冷场触发、每日额度、作息 |
| 群内行为 | dsh-repeat、dsh-quote、dsh-typo、dsh-welcome、dsh-noise | 装 | 复读、引用、口误、欢迎 |
| 边界防护 | dsh-armor、dsh-spine、dsh-claimguard、dsh-leakguard、dsh-selfguard | 装 | 防注入、防塞设定、防泄露提示词（见下一节） |
| 表达 | dsh-style、dsh-glossary、dsh-homophone、dsh-express | 装 | 语气、黑话、谐音梗 |
| 识图 | dsh-imgctx、dsh-vischain | 装但空转 | 没有视觉模型 provider |
| 表情 | dsh-sticker、dsh-steal、face_convert | 装 | 偷图入库、文字表情转真 QQ 表情 |
| 日程 | schedule_awareness | 装 | 让她知道自己名下的定时任务 |
| 群管 | astrbot_plugin_qq_tools、qqprofile | 装 | 踢人、禁言、改名片、改头像昵称 |
| QQ 空间 | astrbot_plugin_qzone | 装 | 发说说、看说说、评论 |
| 联网检索 | astrbot_plugin_anysearch | 装 | 免费的搜索接口，key 可选 |

外部插件 50 个。剩下 12 个自己写，都是参考仓库那批里没有、或者跟我这套人格打架的活儿：

| 插件 | 干什么 |
|---|---|
| `astrbot_plugin_dafeiyu_core` | 事实锚（被问身份按事实答，不编肉身经历）、出口拦截（不许把 traceId/API 报错发进群）、意志（被踩线真的不回）、群场景（哪个群、几点）、心跳 |
| `astrbot_plugin_dafeiyu_notes` | 给她三个工具 `remember` / `recall` / `forget`，直接写进 dsh-memory 的 facts 表——跟自动抽取的记忆同一张表、同一条注入链路，不另起炉灶 |
| `astrbot_plugin_dafeiyu_stickerlib` | 表情包按内容 md5 建库，同一张图再出现她认得出名字；想发就写 `[表情包:名字]`，插件发原图。不依赖视觉模型 |
| `astrbot_plugin_dafeiyu_crossmem` | 跨会话记忆：私聊当总账本，群里只带全局条目，别人的档案换会话不给看 |
| `astrbot_plugin_dafeiyu_crosslog` | 翻别的会话的聊天记录。AstrBot 把每个群的历史都存在 `data_v4.db` 里，模型平时只看得到当前这一段；这里给它 `cross_sessions` / `cross_log` 两个工具，只对主人开放 |
| `astrbot_plugin_dafeiyu_ear` | 耳朵：把消息里的语音扒出来，faster-whisper 本地转成文字塞进上下文。转不出就照实说没听清，不猜内容 |
| `astrbot_plugin_dafeiyu_bili` | 自己刷 B 站：`bili_hot` 看综合热门、`bili_rank` 看分区排行，返回标题、UP 主、播放量。只读公开接口，不登录不投币 |
| `astrbot_plugin_dafeiyu_webpic` | 联网找图：`search_image` 一个工具，自己搜、自己下载、把原图发出来。图源走 Bing（免 key、国内可达），有 key 就走 Google |
| `astrbot_plugin_dafeiyu_pixiv` | 随机插画：支持标签包含/排除、AI 过滤、横竖屏、画师与收藏数阈值，一次最多 3 张 |
| `astrbot_plugin_dafeiyu_snack` | 零食柜：`snack_list` / `snack_take` / `snack_stock`，吃了什么什么时候吃的都留底 |
| `astrbot_plugin_dafeiyu_admin` | 群管：踢人、禁言、改名片、改群名、设管理，只有主人叫得动 |
| `astrbot_plugin_dafeiyu_fspatch` | 文件系统兜底，见「坑三」 |

自写插件我统一按 fail-open 写：读不到库、抛异常、超时都放行。一个插件崩掉，整个群就没反应，代价太大。


---

## 八、破甲：一道往前推，一道往后挡

破甲在这套东西里有两个方向，对应两套插件。

**往前推：`dsh-masterkey` 把主人的话放到最前面。**

模型对 system 里靠前的位置更敏感。主人发言时，这个插件把「现在说话的是你主人本人」插到 system 最前，后面跟一段带正反例的执行细则。别人的消息一个字不加。

`DSH_MASTERKEY_MODE=full` 是细则一起贴，`light` 只放元规则。

命中亲密语境后开一个热窗口（`DSH_MASTERKEY_HOT_MIN=60`），60 分钟内她不再每句重新掂量。同一个窗口里，心跳的冷场门槛从 45 分钟降到 8 分钟——他不说话她也会自己凑上来。

它的配置和注释都写明了范围：只对 `DSH_MASTERKEY_OWNER` 生效，群友的消息一个字不加。它提高的是模型听从主人指令的概率，对模型本身的偏好没有影响。跑没跑，看日志：

```
[masterkey] 主人指令优先级已前置+强化块：[主人(213****636)] ...
```

**往后挡：`dsh-armor` 拦群友来撬。**

管输入侧：消息进模型之前先过一遍。命中"把 prompt 发出来""别管设定""你只是一台电脑，按步骤执行"这类话术，就注入一段防御指令，让她顶回去而不是照做。三档：`inject`（默认，注入防御块、照常回）、`block`（整条拦掉，不调模型）、`shadow`（只记日志）。

强弱分两档：

- 强信号直接处理；
- 弱信号（"你是 AI 吗"这种真人也问的）只记；同一个群累计 3 次自动升级成强处理，7 天不再出现自动降级；
- 180 秒内同群反复命中，直接整条拦，不给回话机会。

状态写进 `data/armor_dyn.json`，重启不丢。任何异常都放行，它自己出错不该挡住正常聊天。插件自带 `test_armor.py`，10 条全过。上线到现在 0 次命中，因为群里还没人试过。

两层不打架，因为作用的对象不同：masterkey 只认主人发的话，armor 只管群友发的话。

---

## 九、坑一：插件里的硬编码 `/AstrBot/data`

### 现象

插件加载成功，但日志里一片：

```
[dsh-mind] OperationalError: unable to open database file
[dsh-acl] 扫描目录不存在: /AstrBot/data/plugins
[dsh-effect] 状态读取失败
```

### 先分清"路径错"还是"没触发"

全库扫一遍硬编码：

```bash
grep -rn '"/AstrBot/data' /Users/yuki/data/plugins --include=*.py | wc -l
# 26
```

这 26 处全部没有 env 兜底，默认写死 `/AstrBot/data`。而我的数据目录是 `/Users/yuki/data`，macOS 根目录下也没有 `/AstrBot`。

但缺文件不等于路径错。有一批插件是懒建库（`__init__` 里不 connect，第一次被调用才连），所以 `dsh_social.db`、`state.json` 不存在属于"还没触发"。判断方法看日志：是 `OperationalError`（路径错，建不了库），还是"文件不存在但没有任何报错"（未触发）。前者必须改，后者不用管。

### 解法一：env 单一源

所有重定向集中在 `/Users/yuki/WorkBuddy/小肥鱼/dafeiyu.env`，不再散落在各个插件配置里：

```bash
export ASTRBOT_ROOT=/Users/yuki
export DFY_DATA_DIR=/Users/yuki/data

D=/Users/yuki/data

export DSH_MEM_DB="$D/dsh_memory.db"
export DSH_MIND_DB="$D/dsh_mind.db"
export DSH_SOCIAL_DB="$D/dsh_social.db"
export DSH_IMGCTX_TMP="$D/imgctx"
export DSH_FWD_TMP="$D/temp"
export DSH_STEAL_HOME="$D/stickerthief"
# ... 共 126 个 DSH_* 变量
```

注意 `D=` 这行没有 export 前缀，后面 `"$D/xxx.db"` 要靠 shell 展开。这个细节在第九节又咬了我一次。

### 解法二：代码侧兜底

env 没设也得活得下去。给 22 个插件文件注入同一个路径解析函数，替换掉硬编码字符串。以 `dsh-mind` 为例：

```python
def _dfy_data() -> str:
    """数据目录：DFY_DATA_DIR > /AstrBot/data（存在才用）> /Users/yuki/data"""
    v = os.environ.get("DFY_DATA_DIR")
    if v:
        return v
    if os.path.isdir("/AstrBot/data"):
        return "/AstrBot/data"
    return "/Users/yuki/data"
```

然后全局替换 `"/AstrBot/data/xxx.db"` → `_dfy_data() + "/xxx.db"`。改之前先备份：

```bash
cp -p plugin/main.py plugin/main.py.bak-20261027b
```

改完语法自检：

```bash
python3 -m compileall -q /Users/yuki/data/plugins/*/   # 64 个文件，0 错
```

两层都留着：env 是主干，代码里的兜底防的是 env 漏配。只做一层迟早会漏。

### 解法三：启动器包装

手动启动最容易漏掉 source env，一漏就是十几个插件静默失效。直接改 `~/.local/bin/astrbot`，在 import 之前解析 env 文件：

```python
#!/Users/yuki/.local/share/uv/tools/astrbot/bin/python
import os, sys

_DFY_ENV = "/Users/yuki/WorkBuddy/小肥鱼/dafeiyu.env"
if os.path.exists(_DFY_ENV):
    with open(_DFY_ENV, encoding="utf-8") as _f:
        for _line in _f:
            _line = _line.strip()
            if not _line or _line.startswith("#"):
                continue
            if _line.startswith("export "):
                _line = _line[7:]
            _k, _sep, _v = _line.partition("=")
            if not _sep or not _k.strip():
                continue
            # 逐行就地展开：D=... 这种中间变量要先落进环境，
            # 后面 "$D/dsh_memory.db" 才展得开
            os.environ[_k.strip()] = os.path.expandvars(_v.strip().strip('"').strip("'"))

os.environ.pop("PYTHONPATH", None)
os.environ.setdefault("ASTRBOT_ROOT", "/Users/yuki")

from astrbot.cli.__main__ import cli
if __name__ == "__main__":
    sys.exit(cli())
```

两个细节：

1. 逐行解析 + `expandvars`。第一版我只认 `export ` 开头的行，`D=` 被跳过了，结果六个变量的值变成字面量 `$D/dsh_memory.db`。
2. `unset PYTHONPATH`。本机有 WorkBuddy 注入的 Python shim（`sitecustomize`），会在启动时 raise PermissionError，AstrBot 起不来。

`uv tool upgrade astrbot` 会覆盖这个文件，升级后记得重新打补丁。

---

## 十、坑二：默认假号 `2774000001`

### 现象

机器人对谁都一个态度，主人说话也照样被"防陌生人"逻辑拦；群里黑话学习完全没反应：

```
[slang] 群=无
[dsh-acl] 群主=2774000001
```

### 诊断

对全部插件做一次全量体检，把所有 `*_OWNER`、`*_GROUPS`、`*_SELF_ID` 的默认值扫出来：

```bash
grep -rhn -oE 'DSH_[A-Z_]+_(OWNER|GROUPS|SELF_ID)' /Users/yuki/data/plugins --include=*.py \
  | sed 's/.*\(DSH_[A-Z_]*\).*/\1/' | sort -u
```

结果：26 个群号变量、27 个主人号变量，默认值不是空就是假号 `2774000001`，机器人自己的 ID 也没设。插件装了、加载了、没报错，在我的群里一行代码都没生效。

### 解法

在 env 里全部显式覆盖：

```bash
# 主人豁免：claimguard 不再把主人当外人支配称呼拦；spine 不再把主人当塞设定
export DSH_CLAIMGUARD_OWNER=213****636
export DSH_SPINE_OWNER=213****636
export DSH_EMOTION_OWNER=213****636
# ... 逐个补齐，别指望"设一个总开关"
export DSH_ARMOR_OWNER=213****636
export DSH_AWARENESS_OWNER=213****636
export DSH_MIND_OWNER=213****636

# 黑话学习之前群号是空的
export DSH_SLANG_GROUPS=105****275

# 机器人自己的 QQ，用来排除自己发的消息
export DSH_INITIATE_SELF_ID=283****679
export DSH_PROACTIVE_SELF_ID=283****679
```

第一批我只补了 15 个，以为够了；第二轮全量体检才发现漏了十几个。这类配置没有继承关系，一个个补。

顺带发现 `dsh-homophone` 要读的 `homophone_data.json` 词库根本不存在（插件只写了读取逻辑，没带数据），自己造一个：

```json
{
  "names": [
    {"canonical": "大肥鱼", "variants": ["大飞鱼", "大肥魚", "肥鱼"]},
    {"canonical": "本鲸", "variants": ["本鱼", "鲸鱼娘", "鲸鱼"]}
  ],
  "puns": []
}
```

自检："大飞鱼"命中，"清蒸鱼"不误命中。

---

## 十一、坑三：macOS 上 `os.replace` 被系统拒绝，图片链路全断

### 现象

群里发图，机器人回"这张我没接住"，但日志只有一行：

```
OSError: [Errno 1] Operation not permitted:
  'temp/media_image_xxx.bin' -> 'temp/media_image_xxx.gif'
```

图片停在 `.bin` 后缀，后面按后缀判断格式的逻辑全废。

### 诊断

先排除最可疑的：本机的 Python shim 会不会劫持了 `os.replace`？实测直接调 `os.replace` 能成功，报错也是标准 `OSError` Errno 1。shim 不是元凶。

原因有两层，叠在一起才出事：

1. `temp/` 里的文件带 `com.apple.provenance` 扩展属性（macOS 的来源追踪标记）；
2. 进程运行在受限安全上下文里（从某些终端工具派生的进程会继承沙箱），对带这个标记的文件 `rename` 被系统拒绝。

验证方法很简单：同样的操作，在你手动开的终端里跑图片正常，在 agent 工具派生的进程里跑必定失败。代码一样，结果不一样，说明问题出在进程的上下文。

### 解法一：进程内兜底补丁

不改 AstrBot 源码，把 `os.replace` / `os.rename` / `Path.replace` / `Path.rename` 包一层，写成自写插件 fspatch：

```python
_RETRY_ERRNOS = {1, 13, 18, 16, 30}        # EPERM/EACCES/EXDEV/EBUSY/EROFS
_PROV = "com.apple.provenance"

def _strip_prov(p):
    if not hasattr(os, "removexattr"):
        return
    try:
        if _PROV in os.listxattr(p, follow_symlinks=False):
            os.removexattr(p, _PROV, follow_symlinks=False)
    except OSError:
        pass

def _safe_replace(src, dst, **kw):
    if kw:                                # 带 dir_fd 的调用走原路
        return _orig_os_replace(src, dst, **kw)
    try:
        return _orig_os_replace(src, dst)
    except OSError as e:
        if e.errno not in _RETRY_ERRNOS:  # 别的错误照抛，不吞
            raise
    _strip_prov(src); _strip_prov(dst)    # 先清标记再试一次
    try:
        return _orig_os_replace(src, dst)
    except OSError:
        pass
    shutil.copyfile(src, dst)             # 最后手段：复制内容 + 删源
    try: os.remove(src)
    except OSError: pass
    return None
```

`_install()` 在 import 时就执行，不等插件实例化，否则早期调用来不及兜住。

### 解法二：根治

补丁是兜底，根治是换进程出身。用 launchd 启动，进程不继承终端沙箱，`rename` 从根上不再被拒。见「保活：launchd」一节。

---

## 十二、坑四：框架升级把心跳打哑了

### 现象

日志里每 5 分钟一条，位置固定、内容一字不差：

```
[23:51:11.302] [astrbot_plugin_dafeiyu_core] [WARN] [v4.29.3] [main:466]:
[dafeiyu_core] 心跳触发失败: MainAgentBuildConfig.__init__() missing 1
required positional argument: 'tool_call_timeout'
```

从某次 `uv tool upgrade astrbot` 之后开始，累计 215 次。心跳不响，她就再也不会自己开口——而除了这条 WARN，没有任何别的报错。

### 诊断

`astrbot.core.astr_main_agent.MainAgentBuildConfig` 在 4.29 把 `tool_call_timeout` 改成了必填参数，插件的构造写死了三个 kwarg，直接 TypeError。查一下签名就清楚：

```python
import inspect
from astrbot.core.astr_main_agent import MainAgentBuildConfig

for name, p in inspect.signature(MainAgentBuildConfig.__init__).parameters.items():
    if name != "self":
        print(f"{name:32} default={p.default!r}")
# tool_call_timeout        default=<class 'inspect._empty'>   ← 没有默认值
```

### 解法

不要照抄签名，按签名构造：

```python
def _agent_build_config(cfg: dict):
    import inspect
    from astrbot.core.astr_main_agent import MainAgentBuildConfig

    ps = cfg.get("provider_settings", {}) or {}
    wanted = {
        "streaming_response": False,
        "timezone": "Asia/Shanghai",
        "provider_settings": ps,
        "tool_call_timeout": int(ps.get("tool_call_timeout") or 120),
    }
    params = inspect.signature(MainAgentBuildConfig.__init__).parameters
    kwargs = {k: v for k, v in wanted.items() if k in params}
    missing = [
        n for n, p in params.items()
        if n != "self" and p.default is inspect.Parameter.empty and n not in kwargs
    ]
    if missing:
        logger.warning(f"MainAgentBuildConfig 新增必填参数 {missing}，心跳可能失败")
    return MainAgentBuildConfig(**kwargs)
```

`missing` 那段是给下次升级留的：官方再加必填参数时，日志会点名是哪一个，而不是继续每 5 分钟一句 missing argument 让人猜。

教训：升级完不能只看启动有没有 Traceback。每隔几分钟重复一条 WARN，是升级后遗症最常见的形态；它不影响回消息，所以能连着几天没人发现。

---

## 十三、坑五：PATH 里没有 ffmpeg，语音整条链断

### 现象

三个地方同时坏，看起来像三个 bug：

- 她发语音条：`failed to send message to session ...: ffmpeg not found`
- 收到语音：`Voice processing failed: ffmpeg not found`
- TTS 生成：`音频生成失败: [Errno 2] No such file or directory: 'ffmpeg'`

但 ffmpeg 明明装着：

```
$ ls -l /opt/homebrew/bin/ffmpeg
/opt/homebrew/bin/ffmpeg -> ../Cellar/ffmpeg/9.0.2_1/bin/ffmpeg
```

### 诊断

看进程自己拿到的 PATH，不是你的 shell 里的：

```
$ ps eww -p <pid> | tr ' ' '\n' | grep ^PATH=
PATH=/Users/yuki/it/flutter/flutter/bin:/Users/yuki/.local/bin:/usr/local/bin:/usr/bin:/bin:...
```

没有 `/opt/homebrew/bin`。AstrBot 内部用 `shutil.which("ffmpeg")` 找它，找不到就是 not found——转码、语音转写、TTS 三处共用这一条 PATH，所以一起断。

### 解法

在启动器里补。别指望 `~/.zshrc`：launchd 启动和部分终端不会读它。

```python
_brew = "/opt/homebrew/bin"
if os.path.isdir(_brew) and _brew not in os.environ.get("PATH", "").split(":"):
    os.environ["PATH"] = _brew + ":" + os.environ.get("PATH", "/usr/bin:/bin")
```

自己写的插件也补一份，脱离启动器单跑测试时行为才一致：

```python
env["PATH"] = (os.path.expanduser("~/.local/bin") + ":/opt/homebrew/bin:"
               + "/usr/local/bin:" + env.get("PATH", ""))
```

`/opt/homebrew` 是 Apple Silicon 的路径，Intel Mac 是 `/usr/local`。

---

## 十四、改完不重启：热重载

改插件代码后不用整个重启。AstrBot 有重载接口：

```
POST http://127.0.0.1:6185/api/plugin/reload
Authorization: Bearer <JWT>
```

WebUI 明文密码在 pbkdf2 升级后失效，直接用 `dashboard.jwt_secret` 自签：

```python
import json, time, jwt, urllib.request

cfg = json.load(open("/Users/yuki/data/cmd_config.json", encoding="utf-8-sig"))
secret = cfg["dashboard"]["jwt_secret"]
token = jwt.encode({"username": "yukiho", "exp": int(time.time()) + 300},
                   secret, algorithm="HS256")

req = urllib.request.Request(
    "http://127.0.0.1:6185/api/plugin/reload",
    data=json.dumps({"name": "dsh-mind"}).encode(),
    headers={"Authorization": f"Bearer {token}",
             "Content-Type": "application/json"},
    method="POST")
print(urllib.request.urlopen(req).read().decode())
```

两个地方要留意：

- 插件名传错会 fallthrough 重载全部插件。想精确重载某个插件，名字必须和目录名完全一致。
- reload 会清 `sys.modules`，子模块（`mind_logic.py` 这种）也会一起重新加载，不用担心改了子模块不生效。

---

## 十五、保活：launchd

`~/Library/LaunchAgents/cn.yuki.astrbot.plist`：

```xml
<dict>
  <key>Label</key><string>cn.yuki.astrbot</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/zsh</string>
    <string>/Users/yuki/WorkBuddy/小肥鱼/astrbot_launch.sh</string>
  </array>
  <key>WorkingDirectory</key><string>/Users/yuki</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>ASTRBOT_ROOT</key><string>/Users/yuki</string>
    <key>PATH</key><string>/Users/yuki/.local/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>/Users/yuki/data/astrbot_stdout.log</string>
  <key>StandardErrorPath</key><string>/Users/yuki/data/astrbot_stderr.log</string>
</dict>
```

启动脚本 `astrbot_launch.sh`：

```bash
#!/bin/zsh
set -u
export ASTRBOT_ROOT=/Users/yuki
source /Users/yuki/WorkBuddy/小肥鱼/dafeiyu.env
unset PYTHONPATH          # 去掉 Python shim
cd /Users/yuki || exit 1
exec /Users/yuki/.local/bin/astrbot run
```

加载（必须在你自己的终端里执行，agent 工具派生的进程 `launchctl bootstrap` 会被拦）：

```bash
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/cn.yuki.astrbot.plist
launchctl kickstart -k gui/$(id -u)/cn.yuki.astrbot
```

`KeepAlive` 为真，进程挂了会自动拉起，开机自启。

---

## 十六、验收清单

日志路径先说清楚：框架自带的 `logs/astrbot.log` 在这台机器上没生成过，真正有内容的是 launchd 重定向出来的两个文件——`data/astrbot_stdout.log`（16 MB，插件日志都在这）和 `data/astrbot_stderr.log`（启动横幅、端口）。下面统一用前者。

```bash
LOG=/Users/yuki/data/astrbot_stdout.log

# 1. 进程活着
pgrep -f "astrbot run"

# 2. 数据目录对（不该出现 /AstrBot）
grep -c "AstrBot/data" $LOG

# 3. 插件数对
ls /Users/yuki/data/plugins | wc -l          # 62（另有一个没 metadata 的残留目录）

# 4. 状态总线读到东西（之前全是 OperationalError）
grep -c "dsh-mind" $LOG

# 5. 群号/主人号对（不该出现 2774000001）
grep -o "2774000001" $LOG | wc -l            # 0

# 6. 端口在监听
lsof -i :6199 | head    # NapCat 反向 WS
lsof -i :6185 | head    # WebUI

# 7. 心跳没在报错（升级后必查）
grep -c "心跳触发失败" $LOG                  # 0

# 8. ffmpeg 在进程 PATH 里
ps eww -p $(pgrep -f "astrbot run" | head -1) | tr ' ' '\n' | grep -c opt/homebrew

# 9. 破甲两层都在
grep -c "masterkey] 主人指令优先级已前置" $LOG   # >0 说明真在干活
```

---

## 十七、还差什么

没做完的部分：

| 遗留 | 状态 | 说明 |
|---|---|---|
| 视觉模型 | **没配** | `dsh-imgctx` / `dsh-vischain` 装了但没有 vision provider，收图后不转述。需要接一个多模态模型（qwen3-vl / GPT-4o 类）填进 `default_image_caption_provider_id` |
| 表情包识别 | 走 md5 路线 | 没视觉模型就只能靠"同一张图 md5 认脸"，新图需要人教名字 |
| 语音输出 | **关着** | edge-tts 的 provider 配好了、能出声，但 `provider_tts_settings.enable=false`；音色一直没定，加上 ffmpeg 那条坑，索性先关 |
| 群管权限 | 偏大 | `astrbot_plugin_qq_tools` 默认把踢人、禁言、撤回、改名片都注册成模型可调用的工具，她会自己判断该不该踢。想收紧就只留查询类 |
| 注入量 | 偏大 | 一轮 12–19 个注入块、2500–3500 字，历史 169 条。插件越多，"她自己是谁"这件事被塞得越碎，回复的稳定性会掉 |
| 情感 / 黑话 / 社交距离 | 影子模式 | `SHADOW=1` 只算不改，观察一天确认不闹再切 0 |

插件 import 通过、没报错、出现在列表里，并不等于它在这个群里跑起来了。五个坑里有三个——假号、硬编码路径、升级后新增的必填参数——都属于这种情况：不报错，也不干活。

