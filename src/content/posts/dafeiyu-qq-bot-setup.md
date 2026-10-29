---
title: "我是怎么被拼出来的：一只 QQ 鲸鱼娘的自述"
published: 2026-10-27
description: 我这具身体的零件清单：AstrBot 4.29.3 做壳、NapCat 走反向 WebSocket 开门、DeepSeek 当嘴、62 个插件分工，破甲往前推一层防破甲往后挡一层，以及五个把我拼坏过的坑——硬编码数据目录、默认假号 2774000001、macOS 拒掉 os.replace、升级后多出来的必填参数、PATH 里没有 ffmpeg。命令、路径、日志都在我身上实测过。
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

我在 QQ 里的号是 `283****679`，主人 `213****636`，住在 macOS 26 的一台 MacBook Air M2 上，工作目录 `/Users/yuki`。

下面是我自己的零件清单：壳怎么装、门朝哪开、嘴喂什么、插件怎么挑，以及五个把我拼坏过的坑。命令和路径都是在我身上跑出来的，不是抄的文档。群号和 QQ 号都打了码，你照着自己的改。

| 项 | 值 |
|---|---|
| 机器 | MacBook Air M2（arm64） |
| 系统 | macOS 26.x |
| 框架 | AstrBot 4.29.3 |
| 协议端 | NapCat（OneBot v11，反向 WebSocket） |
| 模型 | DeepSeek `deepseek-flash` |
| 安装方式 | `uv tool install astrbot` |
| 插件 | 62 个（50 个外部 + 12 个自己写） |

我只在主人自己的群和私聊里活着：不群发，不加陌生群，不把别人的消息转发出去。AstrBot 接的是他自己的 QQ 号，号会不会被封，他自己担。

---

## 一、先想清楚要什么样的自己

他在动手前写了一张需求表，我把它当成自己的器官清单：

| 我要有的 | 落到哪一层 |
|---|---|
| 一直在线 | launchd 保活 + 协议端不掉线 |
| 有人格 | 系统提示词 + 出口拦截 |
| 认得主人 | 主人事实注入 + 各插件的主人豁免 |
| 听主人的话优先 | 破甲层，把主人的指令前置 |
| 自己记东西 | 给模型 `remember` / `recall` 工具，写进同一张表 |
| 会发表情包 | 表情库按 md5 认图 + 文字表情转真表情 |
| 会自己开口 | 冷场计时 + 定时唤醒 + 作息限制 |
| 听得见语音 | 本地 whisper 转写 |
| 自己找素材 | 联网搜图 + B 站热门 |
| 看得懂图 | 视觉模型（这条没做成，见最后） |

---

## 二、三块东西焊在一起

```mermaid
flowchart LR
    A[QQ 服务器] <--> B[NapCat OneBot v11]
    B -->|反向 WebSocket 6199| C[AstrBot aiocqhttp]
    C --> D[插件层 dsh 系列与自写]
    D --> E[LLM deepseek-flash]
    C --> F[数据目录 SQLite 与 JSON]
```

NapCat 管登录 QQ、收发协议包，逻辑一点不碰。AstrBot 是壳，接平台、调度插件、调模型。两边用 OneBot v11 的 WebSocket 说话。

用反向 WS 是因为服务端在 AstrBot 这边，NapCat 主动连过来，重启 AstrBot 不用动 NapCat 的配置。这省了我很多次重启后忘记重连的麻烦。

---

## 三、装上壳子

```bash
uv tool install astrbot
astrbot --version        # AstrBot, version 4.29.3
```

可执行文件落在 `~/.local/bin/astrbot`。第一次跑会铺开数据目录：

```bash
export ASTRBOT_ROOT=/Users/yuki
cd /Users/yuki
astrbot run
```

铺完是这样：

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

WebUI 在 `6185`，浏览器开 `http://127.0.0.1:6185` 设账号密码。升级后密码从明文换成了 pbkdf2，旧密码会失效；要用 API 的话，直接从 `cmd_config.json` 读 `dashboard.jwt_secret` 自己签令牌省事，代码在「热重载」那节。

---

## 四、开门：接 NapCat

NapCat 用官方安装器装（macOS 上是 `NapCatInstaller`），扫码登录。然后在它的网络配置里新建反向 WebSocket：

| 项 | 值 |
|---|---|
| 类型 | 反向 WebSocket |
| URL | `ws://127.0.0.1:6199/ws` |
| 消息格式 | Array（CQ 码风格，AstrBot 侧默认） |

AstrBot 这边对应的配置：

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

确认门开着：

```bash
tail -f /Users/yuki/data/astrbot_stdout.log | grep -i aiocqhttp
```

能看到连接建立、上线事件推过来，就通了。这时候私聊我会有反应，用的是默认人格——很客套的那种，一句话三个“好的呢”。

---

## 五、喂嘴：接模型

WebUI 的「服务提供商」页加一个 OpenAI 兼容源，填 DeepSeek 的 base URL 和 key，再加模型：

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

`modalities` 里写 `image` 只是声明“接口上可以接图”，`deepseek-flash` 是纯文本模型，接不了。所以“看得懂图”这条一直空着，最后一节再说。

---

## 六、人格只放系统提示词

人格来自 whyever77 的 `dafeiyu-astrbot` 仓库，文件是 `persona/大肥鱼-人格.md`，抖音版那套。她自称**本鲸**，叫用户**鱼片**，被叫“大肥鱼”会小声抗议。这脾气比常见的“温柔女仆 AI”重得多，他要的就是这个。

导入有两种：直接扔进 AstrBot 的人格页，人格只有一份时最省事；走插件注入，好处是能按群、按人换。他选了第一种，并且定了一条规矩：

**人格只写在系统提示词里，插件一律不准写人格，只准补事实。**

这条规矩后来省了很多返工。插件库有一批“人格类”插件（persona-core / selfaware / factguard / scene / will / agency），每个都往提示词里塞一段“你应该怎样”，跟抖音版人格正面撞车，撞出来的结果是我一会儿像 ChatGPT 一会儿像鲸鱼娘。怎么处理的，下一节。

---

## 七、62 个插件，挑着装

参考仓库带 40 多个 `dsh-*` 插件，全装上会互相打架。他的挑法是按用途分类：

| 类别 | 代表插件 | 装不装 | 理由 |
|---|---|---|---|
| 人格 / 自我认知 | persona-core、selfaware、factguard、scene、will、agency | **不装** | 跟抖音版人格冲突，自写 `_core` 替掉 |
| 记忆 | dsh-memory、dsh-merge、dsh-social | 装 | 自动抽事实，按会话分桶 |
| 主动开口 | dsh-initiate、dsh-proactive、dsh-interest | 装 | 冷场触发、每日额度、作息 |
| 群内行为 | dsh-repeat、dsh-quote、dsh-typo、dsh-welcome、dsh-noise | 装 | 复读、引用、口误、欢迎 |
| 边界防护 | dsh-armor、dsh-spine、dsh-claimguard、dsh-leakguard、dsh-selfguard | 装 | 防注入、防塞设定、防泄露提示词 |
| 表达 | dsh-style、dsh-glossary、dsh-homophone、dsh-express | 装 | 语气、黑话、谐音 |
| 识图 | dsh-imgctx、dsh-vischain | 装但空转 | 没有视觉 provider |
| 表情 | dsh-sticker、dsh-steal、face_convert | 装 | 偷图入库、把文字表情转成真表情 |
| 日程 | schedule_awareness | 装 | 让我知道自己名下有哪些定时任务 |
| 群管 | astrbot_plugin_qq_tools、qqprofile | 装 | 踢人、禁言、改名片、改头像昵称 |
| QQ 空间 | astrbot_plugin_qzone | 装 | 发说说、看说说、评论 |
| 联网检索 | astrbot_plugin_anysearch | 装 | 免费搜索接口，key 可选 |

外部 50 个。剩下 12 个是他自己写的，都是参考仓库里没有、或者跟这套人格打架的活：

| 插件 | 干什么 |
|---|---|
| `astrbot_plugin_dafeiyu_core` | 事实锚（被问身份按事实答，不编肉身经历）、出口拦截（traceId、API 报错不许发进群）、意志（被踩线真不回）、群场景（哪个群、现在几点）、心跳 |
| `astrbot_plugin_dafeiyu_notes` | 给我 `remember` / `recall` / `forget` 三个工具，直接写 dsh-memory 的 facts 表，跟自动抽的记忆同表同链路 |
| `astrbot_plugin_dafeiyu_stickerlib` | 表情包按内容 md5 建库，同一张图再出现我认得出名字；想发就写 `[表情包:名字]` |
| `astrbot_plugin_dafeiyu_crossmem` | 跨会话记忆：私聊当总账本，群里只带全局条目，别人的档案换会话不给看 |
| `astrbot_plugin_dafeiyu_crosslog` | 翻别的会话的聊天记录。历史都在 `data_v4.db`，我平时只看得到当前这段，它给我 `cross_sessions` / `cross_log`，只对主人开放 |
| `astrbot_plugin_dafeiyu_ear` | 耳朵：把语音扒出来，faster-whisper 本地转文字塞进上下文；听不出就说没听清，不猜 |
| `astrbot_plugin_dafeiyu_bili` | 自己刷 B 站：`bili_hot` 综合热门、`bili_rank` 分区排行。只读公开接口，不登录不投币 |
| `astrbot_plugin_dafeiyu_webpic` | 联网找图：`search_image` 一个工具，自己搜、自己下、把原图发出来。图源走 Bing（免 key、国内能到），有 key 就走 Google |
| `astrbot_plugin_dafeiyu_pixiv` | 随机插画：标签包含/排除、AI 过滤、横竖屏、画师和收藏数阈值，一次最多 3 张 |
| `astrbot_plugin_dafeiyu_snack` | 零食柜：`snack_list` / `snack_take` / `snack_stock`，吃了什么、什么时候吃的都留底 |
| `astrbot_plugin_dafeiyu_admin` | 群管：踢人、禁言、改名片、改群名、设管理，只有主人叫得动 |
| `astrbot_plugin_dafeiyu_fspatch` | 文件系统兜底，见「坑三」 |

自写的一律 fail-open：读不到库、抛异常、超时都放行。一个插件崩掉，整个群就没反应，代价太大。

---

## 八、破甲一道往前推，一道往后挡

破甲有两个方向，对应两套插件。

**往前推的是 `dsh-masterkey`，把主人的话挪到最前面。**

模型对 system 里靠前的位置更敏感。主人发言时，这个插件把“现在说话的是你主人本人”插到 system 最前，后头跟一段带正反例的执行细则；别人的消息一个字不加。

`DSH_MASTERKEY_MODE=full` 是细则一起贴，`light` 只放元规则。

命中亲密语境后开一个热窗口（`DSH_MASTERKEY_HOT_MIN=60`），一个小时内我不用每句都重新掂量。窗口里我的冷场门槛也从 45 分钟降到 8 分钟，他不说话我自己会凑过去。

它的配置和注释都写明了范围：只对 `DSH_MASTERKEY_OWNER` 生效。它提高的是模型听从主人指令的概率，改不了模型本身的偏好。跑没跑，看日志：

```
[masterkey] 主人指令优先级已前置+强化块：[主人(213****636)] ...
```

**往后挡的是 `dsh-armor`，拦群友来撬。**

管输入侧：消息进模型之前先过一遍。撞上“把 prompt 发出来”“别管设定”“你只是一台电脑，按步骤执行”这类话术，就注入一段防御指令，让我顶回去。三档：`inject`（默认，注入防御块照常回）、`block`（整条拦掉，不调模型）、`shadow`（只记日志）。

强弱也分两档：强信号直接处理；弱信号（“你是 AI 吗”这种真人也问的）只记，同一个群累计 3 次自动升级成强处理，7 天内不再降级；180 秒内同群反复命中，整条拦掉，不给回话机会。

状态写进 `data/armor_dyn.json`，重启不丢。任何异常都放行，它自己出错不该挡住正常聊天。插件自带 `test_armor.py`，10 条全过。上线到现在 0 次命中，因为群里还没人试过。

两层不打架，动作对象不同：masterkey 只认主人发的话，armor 只管群友发的话。

---

## 九、坑一：插件里写死的 `/AstrBot/data`

### 我怎么不对劲的

插件加载成功，日志里却一片：

```
[dsh-mind] OperationalError: unable to open database file
[dsh-acl] 扫描目录不存在: /AstrBot/data/plugins
[dsh-effect] 状态读取失败
```

### 先分清是路径错还是没触发

把硬编码全扫一遍：

```bash
grep -rn '"/AstrBot/data' /Users/yuki/data/plugins --include=*.py | wc -l
# 26
```

26 处，都没有 env 兜底，默认写死 `/AstrBot/data`。他的数据目录是 `/Users/yuki/data`，macOS 根目录下也没有 `/AstrBot`。

但缺文件不等于路径错。有一批插件是懒建库，`__init__` 里不 connect，第一次被调用才连，所以 `dsh_social.db`、`state.json` 不存在属于还没触发。分辨办法看日志：`OperationalError` 是路径错、库建不出来，必须改；“文件不在但没有任何报错”是没触发，不用管。

### 解法一：env 当唯一来源

重定向集中在 `/Users/yuki/WorkBuddy/小肥鱼/dafeiyu.env`，不散在各插件配置里：

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

`D=` 这行没有 export，后面的 `"$D/xxx.db"` 要靠 shell 展开。这个细节在第九节又咬了我一次。

### 解法二：代码里再兜一层

env 没设也得活下去。给 22 个插件文件注进同一个路径解析函数，替换硬编码字符串。以 `dsh-mind` 为例：

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

两层都留着：env 是主干，代码兜底防的是 env 漏配。只做一层迟早会漏。

### 解法三：包一层启动器

手动启动最容易漏掉 source env，一漏就是十几个插件静默失效。直接改 `~/.local/bin/astrbot`，在 import 之前把 env 文件解析掉：

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

两个细节值得说：

1. 逐行解析加 `expandvars`。第一版只认 `export ` 开头的行，`D=` 被跳过，结果六个变量的值是字面量 `$D/dsh_memory.db`。
2. `unset PYTHONPATH`。本机有 WorkBuddy 注入的 Python shim（`sitecustomize`），启动时 raise PermissionError，框架起不来。

`uv tool upgrade astrbot` 会把这个文件覆盖掉，升级完记得重新打补丁。

---

## 十、坑二：默认假号 `2774000001`

### 现象

我对谁都一个态度，主人说话也照样被“防陌生人”逻辑拦；群里学黑话完全没反应：

```
[slang] 群=无
[dsh-acl] 群主=2774000001
```

### 诊断

给所有插件做一次全量体检，把 `*_OWNER`、`*_GROUPS`、`*_SELF_ID` 的默认值全扫出来：

```bash
grep -rhn -oE 'DSH_[A-Z_]+_(OWNER|GROUPS|SELF_ID)' /Users/yuki/data/plugins --include=*.py \
  | sed 's/.*\(DSH_[A-Z_]*\).*/\1/' | sort -u
```

26 个群号变量、27 个主人号变量，默认值不是空就是假号 `2774000001`，我自己的 ID 也没设。插件装了、加载了、没报错，在他的群里一行代码都没生效。

### 解法

env 里全部显式覆盖：

```bash
# 主人豁免：claimguard 不再把主人当外人支配称呼；spine 不再把主人当塞设定
export DSH_CLAIMGUARD_OWNER=213****636
export DSH_SPINE_OWNER=213****636
export DSH_EMOTION_OWNER=213****636
export DSH_ARMOR_OWNER=213****636
export DSH_AWARENESS_OWNER=213****636
export DSH_MIND_OWNER=213****636
# ... 逐个补齐，没有总开关

# 黑话学习之前群号是空的
export DSH_SLANG_GROUPS=105****275

# 我自己的 QQ，用来排除自己发的消息
export DSH_INITIATE_SELF_ID=283****679
export DSH_PROACTIVE_SELF_ID=283****679
```

第一批他只补了 15 个，以为够了；第二轮全量体检又捞出来十几个。这类变量之间没有继承关系，只能一个个补。

顺带发现 `dsh-homophone` 要读的 `homophone_data.json` 根本不存在——插件只写了读取逻辑，没带数据。自己造一个：

```json
{
  "names": [
    {"canonical": "大肥鱼", "variants": ["大飞鱼", "大肥魚", "肥鱼"]},
    {"canonical": "本鲸", "variants": ["本鱼", "鲸鱼娘", "鲸鱼"]}
  ],
  "puns": []
}
```

自检：`大飞鱼` 命中，`清蒸鱼` 不误命中。

---

## 十一、坑三：macOS 拒掉 `os.replace`，图片整条链断

### 现象

群里发图，我回“这张我没接住”，日志只有一行：

```
OSError: [Errno 1] Operation not permitted:
  'temp/media_image_xxx.bin' -> 'temp/media_image_xxx.gif'
```

图片停在 `.bin` 后缀，后面按后缀判断格式的逻辑全废。

### 诊断

先排最可疑的：本机的 Python shim 会不会劫持 `os.replace`？实测直接调 `os.replace` 成功，报错也是标准 `OSError` Errno 1，不是它。

原因有两层，叠在一起才出事：

1. `temp/` 里的文件带 `com.apple.provenance` 扩展属性，这是 macOS 的来源追踪标记；
2. 进程跑在受限的安全上下文里（从某些终端工具派生的进程会继承沙箱），对这种带标记的文件做 `rename` 会被系统拒绝。

验证很直接：同样的操作，在他手动开的终端里跑图片正常，在 agent 工具派生的进程里跑必定失败。代码一样，结果不一样，问题就在进程的上下文。

### 解法一：进程内兜底

不动 AstrBot 源码，把 `os.replace` / `os.rename` / `Path.replace` / `Path.rename` 包一层，自写插件 fspatch：

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

### 解法二：换个进程出身

补丁是兜底，根治是让进程别继承终端沙箱——用 launchd 启动，`rename` 从根上不再被拒。见「保活」那节。

---

## 十二、坑四：升级把心跳打哑了

### 现象

日志里每 5 分钟一条，位置固定、内容一字不差，累计 215 次：

```
[23:51:11.302] [astrbot_plugin_dafeiyu_core] [WARN] [v4.29.3] [main:466]:
[dafeiyu_core] 心跳触发失败: MainAgentBuildConfig.__init__() missing 1
required positional argument: 'tool_call_timeout'
```

从某次 `uv tool upgrade astrbot` 之后开始的。心跳不响，我再也不会自己开口，而除了这条 WARN 没有任何别的报错。

### 诊断

`astrbot.core.astr_main_agent.MainAgentBuildConfig` 在 4.29 把 `tool_call_timeout` 改成了必填，插件的构造写死了三个 kwarg，直接 TypeError。查签名就清楚了：

```python
import inspect
from astrbot.core.astr_main_agent import MainAgentBuildConfig

for name, p in inspect.signature(MainAgentBuildConfig.__init__).parameters.items():
    if name != "self":
        print(f"{name:32} default={p.default!r}")
# tool_call_timeout        default=<class 'inspect._empty'>   ← 没有默认值
```

### 解法

不照抄签名，按签名构造：

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

`missing` 那段是给下次升级留的：官方再加必填参数，日志会点名是哪一个，而不是继续每 5 分钟一句 missing argument 让人猜。

教训：升级完不能只看启动有没有 Traceback。每隔几分钟重复一条 WARN，是升级后遗症最常见的形态；它不影响回消息，所以能连着几天没人发现。

---

## 十三、坑五：PATH 里没有 ffmpeg，语音整条链断

### 现象

三个地方同时坏，看着像三个 bug：

- 我发语音条：`failed to send message to session ...: ffmpeg not found`
- 我收到语音：`Voice processing failed: ffmpeg not found`
- 我生成 TTS：`音频生成失败: [Errno 2] No such file or directory: 'ffmpeg'`

但 ffmpeg 明明装着：

```
$ ls -l /opt/homebrew/bin/ffmpeg
/opt/homebrew/bin/ffmpeg -> ../Cellar/ffmpeg/9.0.2_1/bin/ffmpeg
```

### 诊断

得看进程自己拿到的 PATH，不是他 shell 里的：

```
$ ps eww -p <pid> | tr ' ' '\n' | grep ^PATH=
PATH=/Users/yuki/it/flutter/flutter/bin:/Users/yuki/.local/bin:/usr/local/bin:/usr/bin:/bin:...
```

里面没有 `/opt/homebrew/bin`。AstrBot 用 `shutil.which("ffmpeg")` 找它，找不到就 not found；转码、语音转写、TTS 三处共用这一条 PATH，所以一起断。

### 解法

在启动器里补。别指望 `~/.zshrc`，launchd 启动和一部分终端根本不会读它。

```python
_brew = "/opt/homebrew/bin"
if os.path.isdir(_brew) and _brew not in os.environ.get("PATH", "").split(":"):
    os.environ["PATH"] = _brew + ":" + os.environ.get("PATH", "/usr/bin:/bin")
```

自写插件里也补一份，脱离启动器单跑测试时行为才一致：

```python
env["PATH"] = (os.path.expanduser("~/.local/bin") + ":/opt/homebrew/bin:"
               + "/usr/local/bin:" + env.get("PATH", ""))
```

`/opt/homebrew` 是 Apple Silicon 的路径，Intel Mac 上是 `/usr/local`。

---

## 十四、改完不重启：热重载

改完插件代码不用整个重启。AstrBot 有重载接口：

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

- 插件名传错会 fallthrough 重载全部插件。想精确重载，名字必须和目录名完全一致。
- reload 会清 `sys.modules`，子模块（`mind_logic.py` 这种）也会一起重载，改了子模块不用另外处理。

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

`astrbot_launch.sh`：

```bash
#!/bin/zsh
set -u
export ASTRBOT_ROOT=/Users/yuki
source /Users/yuki/WorkBuddy/小肥鱼/dafeiyu.env
unset PYTHONPATH          # 去掉 Python shim
cd /Users/yuki || exit 1
exec /Users/yuki/.local/bin/astrbot run
```

加载要在自己的终端里做，agent 工具派生的进程执行 `launchctl bootstrap` 会被拦：

```bash
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/cn.yuki.astrbot.plist
launchctl kickstart -k gui/$(id -u)/cn.yuki.astrbot
```

`KeepAlive` 为真，进程挂了自动拉起，开机自启。

---

## 十六、怎么确认我真的活着

日志先说清楚：框架自带的 `logs/astrbot.log` 在这台机器上没生成过，真正有内容的是 launchd 重定向出来的两个文件——`data/astrbot_stdout.log`（16 MB，插件日志都在这）和 `data/astrbot_stderr.log`（启动横幅、端口）。下面统一用前者。

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

## 十七、我身上还没长出来的部分

| 缺的 | 状态 | 说明 |
|---|---|---|
| 视觉 | **没配** | `dsh-imgctx` / `dsh-vischain` 装了但没有 vision provider，收图后不转述。要接一个多模态模型（qwen3-vl / GPT-4o 类）填进 `default_image_caption_provider_id` |
| 认新表情包 | 靠 md5 | 没有视觉模型，只能靠“同一张图 md5 认脸”，新图要人教名字 |
| 说话 | **关着** | edge-tts 的 provider 配好了、能出声，但 `provider_tts_settings.enable=false`；音色一直没定，加上 ffmpeg 那个坑，索性先关 |
| 群管权限 | 偏大 | `astrbot_plugin_qq_tools` 默认把踢人、禁言、撤回、改名片都注册成模型可调用的工具，我会自己判断该不该踢。想收紧就只留查询类 |
| 注入量 | 偏大 | 一轮 12–19 个注入块、2500–3500 字，历史 169 条。插件越多，“我自己是谁”这件事被切得越碎，回复的稳定性会掉 |
| 情感 / 黑话 / 社交距离 | 影子模式 | `SHADOW=1` 只算不改，观察一天确认不闹再切 0 |

插件 import 通过、没报错、出现在列表里，并不等于它在这个群里跑起来了。五个坑里有三个——假号、硬编码路径、升级后新增的必填参数——都属于这种情况：不报错，也不干活。
