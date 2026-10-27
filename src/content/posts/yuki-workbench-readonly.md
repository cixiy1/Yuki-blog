---
title: "只读微信本地数据工作台：设计与实现"
published: 2026-10-27
description: 一份完整的系统文档：三条只读约束如何落成代码、从微信加密库到页面消息的六步链路、自有库表结构与增量游标、消息 XML 的解析规则、图片与语音两条媒体管线、全部 HTTP 接口与错误码、配置项、测试策略和实测性能。密钥提取与解密操作流程在另一篇，这里只讲系统本身怎么搭起来。
tags:
  - Vue
  - FastAPI
  - 微信
  - 工程实践
category: 技术
slug: yuki-workbench-readonly
series: 微信本地数据实践
seriesOrder: 2
comment: true
---

微信 PC 端收到的文件不少：课程表、通知、报名表、群里的附件。官方客户端只按时间排，不提供「按聊天框看文件」的视图。所以我做了一个只读的本地工作台：把微信的加密库读出来、按会话重组、在浏览器里浏览，顺手把文件按会话归档、把语音和图片还原成能看能听的东西。

这篇是系统文档，讲建成之后的结构。内容包括：约束怎么落成代码、数据从密文库到页面经过了哪几步、表结构、解析规则、媒体管线、接口清单、错误码、配置、测试和实测数据。密钥怎么提取、SQLCipher 怎么解密，属于操作流程，写在[另一篇](/posts/macos-wechat-db-decrypt/)里，本文只在接口处引用结论。

除特别注明，数据均来自本机实测（macOS，微信 4.1.13，2026-10-27）。

## 1. 范围与前提

**它是什么。** 一个跑在本机的单进程服务：FastAPI 后端 + Vue 3 前端，读微信数据目录，写自己的 SQLite，页面上按会话浏览消息与文件。

**它不是什么。** 不是微信客户端替代品，不发消息、不自动回复、不改配置、不拦截网络。不做多用户、不做分布式。

**硬性前提。**

| 前提 | 影响 |
|---|---|
| macOS，微信 4.x | 目录结构、库名、`.dat` 格式都按 4.x 实测 |
| `sqlcipher` CLI | 没有它无法解密，`brew install sqlcipher` |
| 微信数据库主密码 | 从 `~/.config/yuki-wb/wechat_keys.json` 读，缺失时所有会话功能返回 400 |
| `ffmpeg` / `pilk`（可选） | 缺 ffmpeg 图片只剩 `wxgf` 原始码流、语音不能播；两者都不影响文本链路 |

规模（本机当前）：后端 `app/` 8035 行 Python，测试 1122 行，前端 3275 行 Vue/TS。后端运行依赖六个包：fastapi、uvicorn、sqlalchemy、httpx、cryptography、pytest；前端三个：vue、vue-router、pinia。刻意没有 Celery、Redis、消息队列——单机单用户，多一层就多一处故障点。

## 2. 三条约束如何落成代码

「只读」写在 README 里迟早会被自己破坏，所以它被拆成三层，任意一层单独失效都还有兜底。

### 2.1 第一层：唯一入口

微信目录的所有访问必须走 `integrations/wechat/guard.py`。写模式在白名单之外直接抛异常：

```python
_WRITE_CHARS = set("wax+")

def open_any(path, mode, *, action="open"):
    if is_wechat_path(path) and _is_write_mode(mode):
        raise WeChatWriteDenied(...)
```

配套的只读原语：`read_bytes()`（模式写死 `rb`，不接受参数）、`read_head()`、`sqlite_ro_uri()`（返回 `file:...?mode=ro`）、`iter_entries()`（遍历同时记审计）、`walk_files()`（带文件数上限）。上层没有「自己 open」这个选项。

审计记录跟着入口走：`record(action, path, **kw)` 把路径、行数、字节数、耗时写进上下文里的 `AuditRecorder`，由 `audit_sink.flush()` 统一落 `audit_log` 表。这样每个调用点不必记得写日志。

### 2.2 第二层：进程级兜底

万一有人绕过 guard 直接 `open(微信路径, "w")`，PEP 578 的审计钩子会在系统调用之前拦下。安装顺序有讲究，`main.py` 的第一条语句就是它：

```python
from app.core import audit_hook
audit_hook.install()          # 必须早于任何模块打开文件
```

钩子只处理 `event == "open"`，做前缀判断和抛异常，**不写日志文件、不碰数据库**——审计钩子自己也会触发 `open`，一不小心就递归。被拦下的尝试进内存里的 `deque(maxlen=50)`，重启清空，通过 `/api/v1/sources/overview` 的 `violations` 字段露出。

### 2.3 第三层：可核对

`/sources` 页面把「我读了什么」摊开：微信版本、每个账号的库清单与加密状态、每次读取的路径/行数/耗时、被拦下的写入尝试。审计表只增不删，前端按 `trigger` 过滤。

三层叠加的效果：代码写错也改不动微信的文件。

### 2.4 明确不做的事

- 不发消息、不自动回复、不同步通讯录
- 不改客户端二进制、不改签名、不拦截网络
- 调试器 attach、内存扫描只用于手动排障，不进运行时链路；工作台运行期间对微信进程零接触
- 数据不出本机；模型调用只走用户自己配置的端点，且发送前脱敏
- 明文库、快照、密钥全在 `data/` 与 `~/.config` 下，已 gitignore

## 3. 总体架构

### 3.1 进程模型

单进程，两条执行线：

```text
浏览器 (Vue 3, :5173 或 :8000)
   │  HTTP /api/v1/*            │  SSE /api/v1/chats/live
   ▼                            ▼
FastAPI (uvicorn, 单 worker)
   ├── 路由线程池              ← 请求处理，同步函数走 anyio 线程池
   └── wechat-live 后台线程    ← 每 2s stat 源库，变了才同步并广播
```

后台线程不碰事件循环，事件循环不跑同步逻辑。原因很直接：SSE 是长连接，一旦事件循环被解密阻塞，连接就断。

### 3.2 代码分层

```text
backend/app/
├── core/          paths（数据目录/微信根）、config（环境变量）、errors（错误码）、audit_hook
├── db/            models（10 张表）、session（引擎、PRAGMA、幂等迁移）
├── integrations/
│   ├── wechat/    guard locator snapshot keyx/ reader sync live media imageindex imagekey cloud voice plain_index
│   └── llm/       providers client mask ledger secrets presets types
├── modules/       chats files sources llm_api settings_api wechat_api（各一个 APIRouter）
├── shared/        api（统一响应信封）
└── main.py        审计钩子 → 路由注册 → 静态托管
```

`modules/` 只做参数校验、编排和序列化，业务都在 `integrations/`。这样 CLI（`python -m app.integrations.wechat`）和 HTTP 共用同一套实现。

### 3.3 数据流

```text
微信数据目录（只读）
  ├─ db_storage/**/*.db ──┐
  │   + -wal              │  ① 快照（db + -wal 复制到 data/snap）
  │                       ▼
  │                  ② SQLCipher 导出 ──→ data/plain/<account>/**/*.db（明文）
  │                       ▼
  │                  ③ 解析 XML/行 ──→ ④ 自有库 data/workbench.db
  │
  ├─ msg/attach/**/*.dat ──→ ⑤ 图片解密 ──→ data/cache/images/
  ├─ msg/file/**、msg/video/**（不加密）──→ ⑥ 文件索引（FileAsset）
  └─ db_storage/message/media_0.db ──→ ⑦ 语音 SILK ──→ data/cache/voice/*.mp3

自有库 ──→ HTTP（列表/时间线/媒体）──→ 页面
        └─ SSE（只送「有新消息」信号）──→ 页面按需增量拉
```

### 3.4 目录布局

```text
yuki_workbench/
├── backend/           后端
├── frontend/          Vue 源码 + dist
├── data/              ← 全部运行时产物，gitignored
│   ├── workbench.db   自有库
│   ├── snap/          源库快照（同步过程中存在，用完即删）
│   ├── plain/         <account>/db_storage/**  明文库
│   ├── cache/images/  图片缓存（内容寻址）
│   ├── cache/voice/   语音 mp3 缓存
│   ├── avatars/       <username>.jpg
│   ├── logs/
│   └── backup/
└── docs/              设计与方案文档
```

密钥不在项目里：`~/.config/yuki-wb/wechat_keys.json`。

## 4. 数据接入

### 4.1 定位

`locator.discover()` 做三件事：找微信安装（`/Applications/WeChat.app` 读 Info.plist 拿版本）、找数据根（4.x 容器目录优先，3.x 兜底）、枚举账号目录。结果是 `env.accounts`，本机有两个容器：旧号 17 个库，当前号 20 个库。

库是否加密靠文件头判定，不看后缀：

```python
SQLITE_MAGIC = b"SQLite format 3\x00"
```

头 16 字节等于它就是明文库，否则算加密库。这一条决定了后面「哪些库要解密、哪些直接扫」。

### 4.2 密钥

密钥不是「每个库一把」，而是一个主密码 + 每个库自己的 salt 现场派生：

```text
raw_key = PBKDF2-HMAC-SHA512(password, salt=库头前 16 字节, iterations=256000, dklen=32)
```

单库派生约 55ms，20 个库全量约 1.1s。所以「要不要解密」必须先判断，不能每轮都试。密钥文件结构：

```json
{
  "password": "…",
  "extracted_at": "2026-10-27T10:53:35",
  "meta": { "account_dir": "wxid_…_ab91" },
  "keys": { "<相对路径>": "…" }
}
```

`keys` 只用于展示覆盖情况，不是解密依据——任何库都能用主密码试开。这一点在加 `media_0.db`（语音库，不在当初提取的清单里）时省了事。

提取方式有五种（手动、ad-hoc 重签名、关 SIP、lldb 挂钩、外部工具），按对账号和系统的影响分成三档风险，具体链路见[另一篇](/posts/macos-wechat-db-decrypt/)。系统侧只要求一件事：提取动作跑在独立子进程里（`python -m app.integrations.wechat.keyx extract`），主进程不加载任何 Mach 代码。需要动客户端的步骤必须带确认短语 `I UNDERSTAND`。

### 4.3 快照

微信常驻 WAL 模式，新消息先写 `-wal`，主库 mtime 可能几小时不动。直接在源文件上解密有两个问题：SQLCipher 打开库时可能触发 checkpoint（那是写操作），带 `-wal` 的库在别处打开也可能读到不一致状态。

所以统一复制到自己的目录再读：

```python
def snapshot_db(account_dir, src, rel):
    dst = snap_root(account_dir) / rel
    shutil.copyfile(src, dst)
    wal = src.with_name(src.name + "-wal")
    if wal.exists() and wal.stat().st_size > 0:
        shutil.copyfile(wal, dst.with_name(dst.name + "-wal"))
    else:
        dst.with_name(dst.name + "-wal").unlink(missing_ok=True)  # 旧 wal 会被当新事务重放
```

不带 `-shm`：副本目录可写，SQLite 会按 wal 自己重建，反而避免把源进程的共享内存状态抄过来。同步结束后快照即删。

### 4.4 明文导出与指纹

导出走 `sqlcipher.export_plain(snap, dst, password)`，即标准的 `ATTACH … KEY …; sqlcipher_export()`。**必须在快照上跑**，不能在源库上跑——这是只读约束里最隐蔽的破口：它不在写入路径上，而在读取时的副作用里。

明文副本复用靠指纹，指纹把 `-wal` 算进去：

```python
def source_fingerprint(src: Path) -> str:
    parts = []
    for p in (src, src.with_name(src.name + "-wal")):
        st = p.stat()
        parts.append(f"{st.st_mtime_ns}.{st.st_size}")
    return "|".join(parts)
```

指纹存成明文库旁边的 `.fingerprint` 文件。指纹没变就整库跳过，不做无谓的 PBKDF2。

要同步的库是白名单，只认需要的：`session.db`、`contact.db`、`head_image.db`、`message_resource.db`、`media_0.db`、`message/message_N.db`。`message_fts.db`（全文索引）和 `biz_message_0.db`（公众号）表结构不同，混进来只会白读一遍。

## 5. 数据模型

自有库是 SQLite（WAL + `synchronous=NORMAL` + 外键开启），10 张表。这里存的是「读出来的副本」，与微信库无写入关系。

| 表 | 作用 | 关键约束 |
|---|---|---|
| `wechat_account` | 登录过的账号、库数量、密钥校验时间 | `account_dir` 唯一 |
| `conversation` | 会话（群/私聊/公众号） | `(source, source_id)` 唯一 |
| `message` | 消息 | `(conversation_id, source_msg_id)` 唯一；`(conversation_id, sent_at)` 索引 |
| `attachment` | 消息与文件的关联 | `message_id`、`file_asset_id` 外键 |
| `file_asset` | 明文文件索引 | `source_path` 唯一；`name/ext/mtime/sha256` 索引 |
| `llm_provider` | 模型端点 | `name` 唯一 |
| `llm_route` | 任务 → 端点 | `task` 唯一 |
| `llm_call` | 调用记账 | `created_at`、`task` 索引 |
| `audit_log` | 读取审计 | `at` 索引 |
| `app_setting` | 键值配置 | 主键 `key` |

字段语义里有几处不是望文生义能猜到的：

- `message.source_msg_id` 格式是 `local_id:server_id`，由解析层拼好；语音回查靠它对齐 `media_0.db`
- `message.raw_json` 存 `{"local_type": N, ...资源元信息}`，图片的 `md5`/`file_md5`/`cdnurl`、文件的 `totallen`/`file_name` 都在这里，页面渲染和媒体定位都读它
- `file_asset.conversation_id` 允许为空：`msg/file` 目录本身不含会话信息，要等消息解出来再回填
- `attachment.file_asset_id` 是后加的列，早期只存 `sha256` 反查，同内容文件会有多条，既慢又不唯一

迁移是幂等的 `create_all` + 手写补列（`PRAGMA table_info` 判断存在性）。没有迁移框架——单机单库，加一个 Alembic 不如十行代码。

保留策略：消息与审计不删除；图片缓存上限 4000 张按 mtime 淘汰；语音缓存按内容 sha1 命名不淘汰。

## 6. 同步引擎

### 6.1 一轮做什么

```text
① 读密钥文件 → ② 定位账号 → ③ 逐库 ensure_plain（快照→派生→导出，指纹复用）
→ ④ 解析会话与联系人 → ⑤ 逐库逐会话按游标读消息 → ⑥ 附件匹配 + 头像 + 统计
```

返回的统计直接就是接口响应：`conversations_created`、`messages_created`、`messages_updated`、`plain_dbs`、`avatars`、`files_attached`、`duration_ms`，以及 `new`（会话 id → 新消息 id 列表，给 SSE 用）。

### 6.2 增量游标

状态存在 `data/plain/<account>/.sync_state.json`，结构是 `库相对路径 → {会话 sid: 最大 local_id}`：

```python
cursor = 0 if force else int(cursors.get(sid, 0))
max_of_sid = reader.max_local_id(plain_path, [sid])
if cursor and max_of_sid and max_of_sid < cursor:
    cursor = 0                     # 库被重建，local_id 从头来过
rows = reader.read_messages(plain_path, sid, n2i, res_map, after_local_id=cursor)
```

三个决定值得记下来：

1. **游标按会话，不按库。** 一个 `message_0.db` 里装着所有会话的 `Msg_<md5(sid)>` 表，各自 `local_id` 独立自增。按库取最大值，小会话永远追不上大群（大群推到 3000，只有 5 条的私聊再也不会被扫到）。
2. **游标用 `local_id` 不用时间戳。** 同一秒会写多条，时间戳会漏。
3. **反向自愈。** 算出来的 `max_local_id` 小于游标，说明库被微信重建过，归零重读。旧格式（`rel → int`）语义已不可信，加载时识别到类型不是 dict 就直接作废。

### 6.3 空闲时只做 stat

`source_signature()` 把所有待同步库的指纹拼成一个字符串，只 stat、不解密。后台线程每 2 秒算一次：

```python
sig = wechat_sync.source_signature()
if sig != self._last_sig:
    self._last_sig = sig
    self._sync_once()
```

指纹没变整轮跳过，空闲开销在微秒级；变了才解密入库。实测单轮 124–330ms，取决于新增消息量。

### 6.4 并发与线程

- `sync()` 用模块级 `threading.Lock` 串行化：后台线程和「从微信同步」按钮可能同时触发，SQLite 写写会撞锁。
- `SQLAlchemy` 的 `Session` 不跨线程。后台线程每轮自建 `SessionLocal()`、`finally` 关闭；请求线程用 `Depends(get_db)`。
- 同步是同步函数，跑在 anyio 线程池里，不占事件循环。

### 6.5 SSE 协议

`GET /api/v1/chats/live` 返回 `text/event-stream`，事件负载是 JSON：

| 事件 | 触发 | 载荷 |
|---|---|---|
| `hello` | 连接建立 | 线程状态（`running`/`interval`/`last_sync_at`/`subscribers`） |
| `sync` | 有新消息入库 | `{"type":"sync","at":…,"stats":{…,"new":{"<conv_id>":[id,…]}}}` |
| `tick` | 指纹变了但没新消息 | 同上，`type` 为 `tick` |
| 注释心跳 | 15s 无事件 | `: ping\n\n` |

设计上最重要的一条：**只送信号，不送数据**。事件里只有新增消息 id，前端拿 `after_id` 回 `/messages` 增量拉一次，序列化逻辑只保留在 HTTP 层一份。如果 SSE 自己拼一份、接口再拼一份，字段迟早不一致，而这种不一致只有前端渲染出错时才暴露。

工程细节：订阅者是 `asyncio.Queue(maxsize=128)`，消费端卡住时丢事件而不是堆积；`publish()` 通过 `loop.call_soon_threadsafe` 跨线程投递；响应头带 `X-Accel-Buffering: no` 防中间层缓冲。

### 6.6 触发点

两个入口共用同一套逻辑：后台线程（自动）与 `POST /chats/sync?force=false`（手动）。手动同步在写库之后同样 `hub.publish()`——广播要挂在数据写入的那一层，否则开两个标签页时 A 页点了同步、B 页不动。

`force=true` 忽略游标与指纹整段重扫，用在换账号、迁移目录、怀疑漏消息的场合。

## 7. 消息解析

### 7.1 表定位

每个会话一张表，表名是会话 id 的 md5：

```python
table = "Msg_" + hashlib.md5(source_id.encode()).hexdigest()
```

表里关心的列：`local_id`、`server_id`、`local_type`、`real_sender_id`、`create_time`、`message_content`。`message_content` 是 zstd 压缩的 BLOB，解压后是纯文本或 XML。

### 7.2 类型映射

```python
LOCAL_TYPE_KIND = {
    1: "text", 3: "image", 34: "voice", 42: "card", 43: "video",
    47: "sticker", 48: "location", 49: "appmsg", 10000: "system", 10002: "system",
}
APPMSG_KIND = {"5": "link", "6": "file", "19": "file", "33": "appmsg",
               "36": "appmsg", "57": "appmsg", "74": "file"}
```

`local_type=49` 是「appmsg 壳」，真实类型要再看 XML 的 `<appmsg type>`：6 是文件、19 是合并转发的聊天记录、5 是链接。解析时有个取舍：XML 能给出更具体的信息，但 `local_type` 对图片/语音/视频/表情更可靠（有些 XML 只是通用 `msg` 壳），所以这两类以 `local_type` 为准。

本机当前分布：text 701、sticker 158、image 87、appmsg 73、voice 49、file 15、system 8、link 5、video 1，合计 1097 条。

### 7.3 XML 结构

`<msg>` 只是外壳，真正的类型在第一个子元素上。解析时先剥壳，再按标签分派：

| 标签 | kind | 取出的元信息 |
|---|---|---|
| `img` | image | `md5`、`aeskey`、`cdnthumburl`、`cdnbigimgurl`、`length`、`hdlength` |
| `emoji` | sticker | `md5`、`cdnurl`、`thumbwidth/height` |
| `voicemsg` | voice | `voicelength`（毫秒）、`voiceformat`、`voiceurl`、`clientmsgid` |
| `videomsg` | video | `playlength`、`length`、`cdnthumburl` |
| `appmsg` | file/link/appmsg | `type`、`title`、`appattach/totallen`、`appattach/fileext`、`md5` |
| `sysmsg` | system | 走模板渲染（见 7.5） |

解析失败不抛异常：先整体 `ET.fromstring`，失败就把第一个 `<` 之前的内容剥掉重试，再失败就退化成纯文本取前 200 字。一条脏消息不该让整个会话读不出来。

### 7.4 群消息前缀

群消息正文前带发送者，两种格式：`wxid_xxx:\n内容` 和 `wxid_xxx:<msg>`。正则要求匹配 id 形态，避免误伤「12:30 开会」这类正文：

```python
SENDER_PREFIX = re.compile(
    r"^(wxid_[A-Za-z0-9]{6,}|gh_[A-Za-z0-9]{6,}"
    r"|[A-Za-z0-9_]{5,}@chatroom|\d{5,}@chatroom):\s*([\s\S]*)$"
)
```

单聊没有前缀，发送者由 `real_sender_id` 经 `Name2Id` 映射得到。注意单聊里 `real_sender_id` 恒为自己，所以「谁在说话」只能靠群前缀区分；`is_self` 由 `sender == 本账号 wxid` 判定，本账号从 `wechat_account` 取最近校验过密钥的那一行。

### 7.5 系统消息

入群、撤回、拍一拍是 `local_type=10000` + `<sysmsg>`。正文只是模板，真名在另外的节点：

```text
模板    content_template/template   →  "$username$"邀请"$names$"加入了群聊
真名    link_list/link/memberlist/member/nickname
分隔符  link/separator              →  "、"
```

处理分三步：先把 `link_list` 里的 nickname 填进占位符，多人用 `separator` 连接；再把已知上下文（wxid、群 id）替换掉；最后 `_polish_sysmsg()` 做空格与标点的收尾。不做替换就是满屏 `$username$`。

撤回消息是个例外：内容在 `<revokemsg><content>`，不是 `<replacemsg>`；同一节点还有 `<revoketime>`，用 `itertext()` 会把时间戳粘在正文后面（「你撤回了一条消息1793071056」）。所以按 `sysmsg/@type` 分支取 `content`，不用全文迭代。

### 7.6 时间

`create_time` 是标准 Unix 秒。`datetime.fromtimestamp(ts)` 就是对的，不要用 SQLite 的 `datetime(create_time,'unixepoch','localtime')`——`localtime` 修饰符依赖进程 TZ，在容器或不同 shell 里结果不一致，看着像数据错了。

### 7.7 幂等

同一 `(conversation_id, source_msg_id)` 可能被重扫多次。命中已有行时，只有 `raw_json`/`kind`/`text`/`sent_at` 任一变化才更新：

```python
if old.raw_json != raw or old.kind != r["kind"] or old.text != r["text"] or old.sent_at != sent:
    ...; msg_updated += 1
```

留这个分支是为了补历史：早期版本存过没有资源元信息的行，全量重扫时顺手补齐，否则图片永远定位不到本地文件。

## 8. 文件与附件

`msg/file`、`msg/video` 下的文件本来就不加密，不需要密钥，直接扫：

```text
plain_index.scan(account, db)
  ├─ 遍历（guard.walk_files，上限 20000）
  ├─ 分类：pdf/word/excel/ppt/text/archive/image/video/other
  ├─ sha256 + 字节数 + mtime + 月份桶
  └─ upsert FileAsset（source_path 唯一）
```

这些目录不含会话信息，所以 `conversation_id` 先留空，页面把它们归到「未归属文件」组（`conv_id=0`）。

消息与文件的关联靠「文件名 + 大小」：

```text
消息 XML  <title>原始文件名</title> + <appattach><totallen>字节数
磁盘      微信会加 "(1)" 之类防重名后缀 → _norm_filename() 反复剥掉
匹配      归一化名相等 且 字节数相等，两个条件都满足才认
```

只处理还没关联的消息，幂等可反复跑。关联动作两步：回填 `FileAsset.conversation_id`（文件资料库能按会话分组）、建 `Attachment`（气泡里显示文件名 + 下载按钮）。附件不存文件内容，只存 `file_asset_id`，下载走 `/files/{id}/raw` 流式读原文件。

本机当前：882 个文件、5.09 GiB，`pdf/word/excel` 占多数；已挂上附件 2 条——数量少是因为大部分文件消息的原始文件名在 XML 里被截断（微信对超长文件名只存前若干字节），拿不到完整名就宁可不关联，也不猜。

## 9. 图片管线

### 9.1 `.dat` 结构

本机 113 个文件全部吻合下面这个布局：

| 偏移 | 长度 | 含义 |
|---|---|---|
| 0 | 6 | 签名 `07 08 56 32 08 07` |
| 6 | 4 | `aes_size`（uint32 LE），AES 段明文长度，实测恒为 1024 |
| 10 | 4 | `xor_size`（uint32 LE），XOR 段长度 |
| 14 | 1 | 占位 |
| 15 | aligned(`aes_size`) | AES-ECB 密文，按 PKCS7 补到 16 的倍数 |
| 之后 | `xor_size` | XOR 段，逐字节异或同一个 key |

长度关系：`15 + align16(aes_size) + xor_size == 文件长度`，13/13 吻合。这个公式比「解出来看对不对」有用得多——它能提前判断文件是否被截断。

### 9.2 密钥推导

**图片 key 不需要从进程里抓，可以算出来**：

```python
def derive_key(uin: int, wxid: str) -> bytes:
    return hashlib.md5(f"{uin}{wxid}".encode()).hexdigest()[:16].encode()

xor_key = uin & 0xFF
```

两个输入都在磁盘上：

- `uin`：`kvcomm/key_<uin>_*.statistic` 文件名第一段（`monitordata_<uin>_<pid>` 作补充来源）
- `wxid`：账号目录名剥掉末尾 4 位安装标识（`wxid_xxx_ab91` → `wxid_xxx`）

两条互相印证的证据：`uin & 0xFF` 与从 JPEG 尾部反推的 `tail[-2] ^ 0xFF` 一致；用推导 key 解 14 张真实图片 14/14 头部正确。

所以早期那些「挂 lldb 抓 `CCCrypt`」「扫内存找 16 字节窗口」全走了弯路：它是账号级派生值，不在内存里也能算。原先抓不到，是因为它压根不需要抓。

### 9.3 解密与转码

AES 段用 ECB 解（无 IV、无完整性校验），XOR 段逐字节异或。解出来的字节两种：标准 JPEG/PNG，或微信私有 `wxgf`（内含 HEVC 码流，本机 13/14 是这种）。`wxgf` 要喂 ffmpeg 转一帧，且必须从 `00 00 00 01 40 01`（VPS）处截断，否则遇到前面的 SEI 就报 `Invalid data found`。

判定「解成功」的标准是文件头，不是「没抛异常」：

```python
SIGS = ((b"\xff\xd8\xff", "jpg"), (b"\x89PNG\r\n\x1a\n", "png"),
        (b"GIF8", "gif"), (b"RIFF", "webp"), (b"BM", "bmp"))
```

AES-ECB 错 key 也会吐出一堆看起来正常的字节，只认合法头部才能把「密钥错」和「文件坏」分开。

### 9.4 索引：解密 md5 反查

微信不保存「消息 → 文件名」的完整映射：

- `message_resource.db` 的 `packed_info` 里确实有文件名（protobuf），但表只有几十行，图片消息有七十多条
- `MessageResourceDetail.data_index` 全是字符串 `'0'`
- `.dat` 的文件名是 32 位 hex，既不是原图 md5 也不是密文 md5

实测规律是：**解密后的内容 md5 == 消息 XML 里的 `md5`**。本机 14/14 一一对应。所以索引的做法是「解密 → 算 md5 → 建表」，消息带 XML md5 来查：

```text
imageindex.build(attach, key_info)
  ├─ rglob("*.dat")，单轮上限 2000
  ├─ size+mtime 指纹没变 → reused
  ├─ 解密 → 内容 md5 → 算 md5 建索引
  └─ 同名 md5 有多份时原图优先（`_h`/`_t` 后缀是高清/缩略变体）
```

索引落 `data/cache/image_index.json`，与图片缓存分开：一个记「哪个 .dat 能变成哪张图」，一个记「这张图已经解好了」。

### 9.5 取图接口

`GET /api/v1/chats/media/{msg_id}?source=auto|local|cloud`。三条路：

| source | 行为 |
|---|---|
| `auto`（默认） | 缓存 → 本地解密 → 云端直链，依次尝试 |
| `local` | 只走本地 `.dat` + 推导密钥，不联网 |
| `cloud` | 只走消息里的 CDN 直链 |

失败不返回笼统的 500，而是各种「拿不到」分别给码：

| 情况 | 响应 |
|---|---|
| 本地没有文件（未下载/被清理） | 409 `IMAGE_LOCAL_UNAVAILABLE` |
| 消息里没有云端直链 | 409 `IMAGE_CLOUD_UNAVAILABLE` |
| `auto` 两条路都失败 | 404，`message` 把两条路的原因拼成一句 |

密钥推导失败不单独给码，它只是 `local` 那条路的一个失败原因。这个改动的动机很实际：早期「本地没有图」和「密钥解不开」在页面上长得一模一样，排查花了一整晚。

### 9.6 缓存

不管走哪条路，成功一次就落盘：

```text
data/cache/images/<图片md5>.<ext>
```

- 内容寻址，同一张图不会重复解码
- 写入先 `.tmp` 再 `os.replace`，避免半个文件被读到
- 读出时校验内容与扩展名是否匹配，不符（被截断、磁盘错误）就删掉重解
- 上限 4000 张，超了按 mtime 淘汰

顺序是**先查缓存，再判密钥**：

```python
hit = cache_hit(cache_key)
if hit:
    return hit      # key 轮换了、原图被清了，历史图照样能看
```

当前缓存 81 张。

### 9.7 启动自检

密钥可以从磁盘算出来，但推导链依赖 kvcomm。换账号、清缓存、微信改目录结构都可能让 uin 枚举不到，症状统一是「所有图片变灰块」。所以启动 2 秒后后台拿最近几张真实 `.dat` 试解：

| 状态 | 含义 |
|---|---|
| `ok` | 试解成功，头部合法 |
| `missing` | 推不出 key（kvcomm 里没有 uin） |
| `invalid` | 有 key 但解不开，记 WARNING |
| `no_sample` | 没有可用的 `.dat` 样本 |

状态写 `data/cache/image_key_state.json`，暴露成 `GET /chats/image-key/status`（`refresh=1` 现场重验），前端据此在顶部显示红条与「重新校验」按钮。测试环境用 `WB_DISABLE_IMAGE_CHECK=1` 关掉——它是启动副作用，会干扰用例断言。

### 9.8 一键预热

`POST /chats/media/warm?limit=500&force=false&cloud=true` 把图片和表情一次性备进缓存，网页端就一个按钮。统计口径分开记，为的是让「为什么某些图还是没有」一眼看出来：

```text
cached      命中缓存
decoded     本地解密成功
from_cloud  云端取到
unavailable 两边都没有
failed      云端请求失败（网络/500）
```

### 9.9 云端路径的范围

云端只做「有直链就下」，不做万能兜底。URL 来自本地数据库，所以必须过主机白名单，不能让人篡改一条记录就把请求引到内网：

```python
ALLOWED_HOST_SUFFIX = (".tc.qq.com", ".qq.com", ".qpic.cn", ".weixin.qq.com")
MAX_BYTES = 20 * 1024 * 1024
```

两类消息的差别在 XML 里就分好了：

- `<emoji cdnurl="http://vweixinf.tc.qq.com/…">` 给完整 URL，服务器不校验登录态，直接 GET 拿到明文 PNG
- `<img cdnthumburl="305f0201…">` 只给 hex 编码的 filekey，没有 URL 也没有签名参数。三个 host、两种路径、三种参数名拼下来全是 400——它需要发消息时客户端拿到的 token，本机数据里没有

所以本机 109 条表情全部能显示，59 条聊天图片只有 28 条能出图。这不是实现没做完，是数据里缺参数；拿不到就返回 `unavailable`，页面上写「本地无原图，云端也不给地址」。

## 10. 语音管线

微信 macOS 版不把语音写成文件（点开才播放，播完不留痕），数据在明文库里：

```text
db_storage/message/media_0.db
  ├─ Name2Id(rowid, user_name)                       会话标识
  └─ VoiceInfo(chat_name_id, local_id, svr_id,
               voice_data BLOB, create_time)         语音本体
```

`chat_name_id` 是 `Name2Id` 的 rowid，`(local_id, svr_id)` 与消息表的 `source_msg_id`（`local_id:svr_id`）对齐——这就是消息与音频的锚点。`voice_data` 以 `02 23 21 53 49 4c 4b 5f 56 33` 开头，即带 `0x02` 前缀的 `#!SILK_V3`，24kHz 单声道 16bit。

解码两步：`SILK --pilk--> PCM s16le --ffmpeg--> mp3`。mp3 按音频内容 sha1 落盘缓存，解一次就够。接口 `GET /chats/voice/{msg_id}` 返回 mp3；`GET /chats/voice-state` 报告解码链是否就绪（pilk 装没装、ffmpeg 在不在），前端据此决定显示播放器还是说明文字。

微信只保留近期语音，更早的只剩时长（`voicelength`），列表里标 `playable: false`。

## 11. 模型对接

聊天数据要上云，所以这一块的设计目标是「可关、可查、可算钱」。

| 层 | 职责 |
|---|---|
| `providers` | 三种协议适配：`openai`（OpenAI 兼容，覆盖 MaaS/DeepSeek/vLLM 等）、`anthropic`、`ollama` |
| `client` | 解析端点 → 预算检查 → 脱敏 → 请求（含重试）→ 结构化校验 → 回填 → 记账 |
| `mask` | 身份证/手机号/邮箱/银行卡/学号替换成 ASCII 方括号占位符，回填时还原 |
| `ledger` | 每次调用一行：模型、token、耗时、成本、状态；不存 prompt 原文，只存 sha256 与字符数 |
| `secrets` | API key 本地加密存储，接口返回时打码 |

调用方只认 `client.complete()`，不关心背后是哪家。任务路由让「分类」「抽取课表」可以用不同模型：`llm_route.task` 唯一，未配路由时落到默认端点。预算按月累计 `llm_call.cost_est`，超了抛 `LLM_BUDGET_EXCEEDED`（429）。

这一块目前只有「配置 + 测试连接 + 试调用」在用，分类与抽取流程还没接上（见第 16 节）。

## 12. HTTP 接口

统一信封：

```json
{"ok": true,  "data": {...}, "meta": {...}}
{"ok": false, "error": {"code": "...", "message": "...", "detail": {}}}
```

`/api/docs` 是 FastAPI 自带的交互文档。

### 12.1 chats

| 方法 | 路径 | 关键参数 | 说明 |
|---|---|---|---|
| POST | `/chats/sync` | `force=false` | 解密并同步，返回统计与新增 id |
| GET | `/chats/live` | — | SSE 事件流 |
| GET | `/chats/live/status` | — | 后台线程状态 |
| GET | `/chats/pipeline` | — | 五步链路逐步体检（定位/密码/派生/明文/入库） |
| GET | `/chats` | `q`、`kind` | 会话列表 + 预览 + 头像标记；含「未归属文件」组 |
| GET | `/chats/{id}/messages` | `before_id`、`after_id`、`limit≤500` | 时间线；`id=0` 为未归属文件列表 |
| GET | `/chats/avatar/{username}` | — | 头像 JPEG，缓存 1 天 |
| GET | `/chats/media/{msg_id}` | `source=auto\|local\|cloud` | 单张图片 |
| GET | `/chats/voice/{msg_id}` | — | 语音 mp3 |
| GET | `/chats/voice-state` | — | 解码链状态 |
| POST | `/chats/media/warm` | `limit`、`force`、`cloud` | 批量预热图片缓存 |
| POST | `/chats/image-key/reload` | — | 丢弃推导缓存并重算 |
| GET | `/chats/image-key/status` | `refresh` | 图片密钥状态 |
| POST | `/chats/image-key/check` | — | 现场重验 |

`/chats/pipeline` 是排障入口：它把「定位账号 → 读主密码 → PBKDF2 试开 → 明文副本 → 入库」五步逐条返回 `ok/detail/耗时`，卡在哪一环直接看得见。

### 12.2 files / sources / settings / wechat / llm

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/files/scan` | 重新索引明文文件 |
| GET | `/files` | `q`、`kind`、`group`、`conversation_id`、`unassigned`、`month`、`page`、`page_size` |
| GET | `/files/summary` | 按类型/月份汇总与总量 |
| GET | `/files/{id}/raw` | 原文件流式读取，`download=1` 走附件下载 |
| GET | `/sources/overview` | 微信版本、账号、库清单、拦截记录、数据目录 |
| GET | `/sources/audit` | 审计记录，`limit`、`trigger` 过滤 |
| GET | `/settings` | 可编辑项 + 运行时路径 |
| PUT | `/settings` | 预算、回溯天数、自动分类、密钥提取方式 |
| GET | `/wechat/keys/methods` | 五种提取方式 + 可用性 + 风险 |
| GET | `/wechat/keys/status` | 当前密钥状态 |
| GET | `/wechat/keys/preflight` | 子进程预检（sqlcipher、权限、SIP 等） |
| POST | `/wechat/keys/extract` | 触发提取；动客户端的步骤要求 `I UNDERSTAND` |
| POST | `/wechat/keys/capture` | 起抓取任务，返回 `job_id` |
| GET | `/wechat/keys/capture/{job_id}` | 任务轮询 |
| GET | `/llm/presets` | 厂商预设 |
| GET/POST | `/llm/providers` | 端点列表 / 新建 |
| PUT/DELETE | `/llm/providers/{id}` | 修改 / 删除 |
| POST | `/llm/providers/{id}/test` | 测试连接 |
| POST | `/llm/test-call` | 试调用 |
| GET/PUT | `/llm/routes` | 任务路由 |
| GET | `/llm/calls` | 调用日志 |
| GET | `/llm/stats` | token/成本汇总 |
| GET | `/api/v1/health` | 存活检查，返回 `readonly: true` |

## 13. 错误码

| code | HTTP | 触发 | 前端处置 |
|---|---|---|---|
| `WECHAT_WRITE_DENIED` | 403 | 试图写微信目录 | 红线提示，视为程序缺陷 |
| `WECHAT_UNAVAILABLE` | 503 | 找不到微信安装/账号 | 引导检查安装与登录 |
| `WECHAT_KEYS_MISSING` | 409 | 没有密钥文件 | 引导到设置页提取 |
| `IMAGE_LOCAL_UNAVAILABLE` | 409 | 本地无 `.dat` | 占位「本地无原图」 |
| `IMAGE_CLOUD_UNAVAILABLE` | 409 | 消息无直链 | 占位「云端也不给地址」 |
| `IMAGE_KEY_MISSING` / `IMAGE_KEY_INVALID` | 409 | 推不出 key / key 失效 | 顶部红条 + 重新校验 |
| `VOICE_UNAVAILABLE` | 409 | 音频不在 media_0.db | 只显示时长 |
| `LLM_NOT_CONFIGURED` | 409 | 没有端点 | 引导配置 |
| `LLM_SCHEMA_INVALID` | 502 | 结构化输出不合 schema | 显示原始返回 |
| `LLM_BUDGET_EXCEEDED` | 429 | 月度预算超限 | 提示调整预算 |
| `LLM_TRANSPORT_ERROR` | 502 | 网络/上游错误 | 重试按钮 |
| `SYS_NOT_FOUND` | 404 | 资源不存在 | 空态 |
| `SYS_BAD_REQUEST` | 400 | 参数错误 / 密钥缺失导致的同步失败 | 提示原因 |
| `SYS_ERROR` | 500 | 未捕获异常 | 通用错误条 |

## 14. 前端

| 路由 | 视图 | 要点 |
|---|---|---|
| `/chats` | 会话 + 时间线 | SSE 消费、增量补拉、图片/语音/文件卡片 |
| `/files` | 文件资料库 | 搜索、类型/月份筛选、预览、下载 |
| `/sources` | 数据源审计 | 库清单、审计流水、拦截记录 |
| `/llm` | 模型调用 | 试调用 + 调用日志 |
| `/settings` | 设置 | 端点增删改、预算、密钥方式与风险 |

三个技术选择：不用 UI 框架（整套样式 400 行 CSS，按需改）；pinia 只用于 toast，业务状态在组件里；接口层统一解信封，`ok:false` 直接抛成 toast。

时间线的几个细节：

- 默认取最新一屏，`before_id` 向前翻；`after_id` 只取增量，按 id 正序，没有「更早」的概念
- `EventSource` 断线会自动重连，但重连期间的增量会丢，所以 `onopen` 之后按最后一条消息 id 补拉一次
- 自动滚动只在用户已贴底时执行，否则翻历史会被新消息顶走
- 图片先看 `media.has_local` 决定要不要发 `<img>`：这个字段同时检查缓存与索引，只看 `file_md5` 会误判（记录在，原图已被微信清掉）
- `kind==='system'` 居中灰字，不带头像气泡

## 15. 运行与配置

```bash
# 后端
cd yuki_workbench/backend
uv venv .venv --python 3.13
uv pip install --python .venv/bin/python fastapi uvicorn sqlalchemy httpx cryptography pytest
.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000

# 前端（开发模式）
cd ../frontend && npm install && npm run dev     # :5173，已配 /api 代理

# 或构建后由后端托管
npm run build                                    # 之后访问 :8000
```

环境变量：

| 变量 | 默认 | 作用 |
|---|---|---|
| `WB_DATA_DIR` | `<项目>/data` | 数据目录 |
| `WB_TOKEN` | 空 | 预留的会话令牌 |
| `WB_READONLY_ENFORCE` | `1` | 只读守卫总开关，测试里才关 |
| `WB_LIVE` | `1` | 实时同步线程开关 |
| `WB_DISABLE_IMAGE_CHECK` | 未设 | 关掉启动自检，只在测试里设 |
| `LLM_MODE` | `live` | 模型调用模式 |
| `LLM_TIMEOUT` | `60` | 模型请求超时 |

外部依赖：`sqlcipher`（必需）、`ffmpeg`（图片 `wxgf` 转码、语音转 mp3）、`pilk`（SILK 解码）。后两个缺失时对应功能降级，不影响文本。

服务默认只监听 `127.0.0.1`，没有登录鉴权——单机单用户的前提。要放到局域网必须先加认证层，否则等于把微信聊天记录挂在网上。

## 16. 测试

三层，79 个用例，连跑两轮稳定：

| 层 | 覆盖 |
|---|---|
| 单元 | `.dat` 解密与头部判定、`derive_key`、XML 解析、系统消息渲染、前缀剥离、文件名归一化、脱敏与回填、成本估算 |
| 接口 | 会话列表/时间线形状、分页、媒体错误码、缓存自愈、图片密钥状态机、设置校验 |
| 冒烟 | 真实库只读打开、快照指纹、导出复用、同步幂等 |

测试里两个必须知道的约定：

1. `tests/conftest.py` 设 `WB_DISABLE_IMAGE_CHECK=1`。启动自检挂在 `startup` 上，`TestClient` 会触发它，于是每次建客户端都多跑一次 `locator.discover`，把「探测只跑一次」的断言从 3 变成 4。症状是单跑通过、全量必挂——因为单独跑那个用例时没有别的 `TestClient` 先启动过。
2. 造 `.dat` 样本时把 `aes_size` 设成 14，正好绕开「对齐到 16 的整数倍」分支，样本最短。

```bash
cd backend && .venv/bin/python -m pytest tests -q     # 79 passed
```

## 17. 实测

| 项 | 数据 |
|---|---|
| 微信版本 | 4.1.13 |
| 账号容器 | 2 个（旧号 17 库不可读，当前号 20 库） |
| 密钥覆盖 | 19 个库，提取于 2026-10-27 10:53 |
| PBKDF2 | 单库 55ms（SHA512 / 256000 轮） |
| 明文库 | 8 个文件（按需导出，不是全量 20 个） |
| 会话 | 22 个（群 9 / 私聊 10 / 公众号 3） |
| 消息 | 1097 条 |
| 文件索引 | 882 个 / 5.09 GiB |
| 头像 | 295 张 |
| 图片缓存 | 81 张 |
| 单轮同步 | 124–330ms（依赖新增量） |
| 空闲开销 | 微秒级（只 stat） |
| 轮询间隔 | 2s |
| 测试 | 79 passed |

## 18. 已知限制

- **单机单用户，无鉴权。** 只监听回环地址；对外必须先加认证。
- **聊天原图的云端路径不通。** 缺发消息时的签名 token，只能走本地 `.dat`；微信清理过原图的图片就永远拿不回来。
- **语音只保留近期。** 微信自己会丢弃旧语音，更早的只剩时长。
- **附件关联保守。** 文件名被截断就宁可不关联，本机只挂上 2 条；宁可少显示，不张冠李戴。
- **图片索引单轮上限 2000 个 `.dat`。** 图库里超过这个量要跑两轮。
- **分类与抽取流程未接。** 模型层（端点、路由、脱敏、记账）已就绪，但「自动分类会话」「从聊天里抽课表」还没实现。
- **只支持 macOS 4.x。** 目录结构、库名、`.dat` 格式都按实测写死；Windows 版和历史版本未验证。

## 19. 排障速查

现象 → 原因 → 处置。这些都是在同一套链路上踩过的，按定位顺序排。

| 现象 | 根因 | 处置 |
|---|---|---|
| 接口 200、会话列表正常、一条消息都没有 | 消息库匹配用了 `^message_\d+\.db$` 去套完整相对路径，永远不匹配 | 只取 `Path(rel).name` 再匹配；补用例锁住 |
| 新消息永远读不到，主库 mtime 不动 | 微信常驻 WAL，指纹只算主库；`-wal` 里已有 255KB 新数据 | 指纹与快照都带上 `-wal` |
| 小会话一直不更新消息 | 游标按库记，被大群的最大 `local_id` 顶住 | 游标键改成 `rel@session_id`，加反向自愈 |
| 页面「最新消息」停在几小时前 | 空闲跳过逻辑复用了旧副本 | 见上一行；`/chats/pipeline` 看第 5 步时间 |
| 群里正文前面挂着 `wxid_xxx:` | 前缀正则要求冒号后紧跟 `<`，纯文本群消息不匹配 | 放宽到任意内容，前缀收窄成 id 形态 |
| 满屏 `$username$` | 系统消息只取了模板，没替换占位符 | 渲染 `memberlist/*/nickname`，分隔符取 `link/separator` |
| 撤回消息后面粘着一串数字 | 用 `itertext()` 取正文，把 `<revoketime>` 一起带出来 | 按 `sysmsg/@type` 分支取 `<content>` |
| 消息时间差 8 小时 | 以为存的是「本地墙钟当 UTC」，多算一层；或用了 SQLite `localtime` | `datetime.fromtimestamp()` 直接转，删掉 `fix_ts()` |
| 所有图片灰块，但 `.dat` 明明在 | 推不出图片 key（kvcomm 无 uin），或密钥已轮换 | 看 `/chats/image-key/status`；`refresh=1` 重验 |
| 图片解出来不是 JPEG | 解成了 `wxgf`（HEVC 容器），直接喂 ffmpeg 会报 `Invalid data found` | 从 `00 00 00 01 40 01` 截断再转码 |
| 两个标签页，一个点了同步另一个不动 | 手动同步只写库没广播 | 写入层统一 `hub.publish()` |
| 测试单跑通过、全量必挂 | `TestClient` 触发 startup 自检，多跑一次 `locator.discover` | `conftest.py` 设 `WB_DISABLE_IMAGE_CHECK=1` |
| 图片接口 409 但看不出原因 | 「没有文件」和「解不开」共用一个错误 | 拆成 `IMAGE_LOCAL_UNAVAILABLE` / `IMAGE_CLOUD_UNAVAILABLE` / 404 带原因 |

## 20. 结语

这套东西的复杂度不在功能，而在约束：一旦「只读」是硬要求，读取路径上每一个副作用都得重新审视——SQLCipher 打开库会 checkpoint、`-wal` 不带走就读不到新消息、审计钩子自己会触发 `open`。这些都不是能靠小心避开的，只能靠分层强制和可核对的审计。

单机、单用户、只读。这三个词决定了上面所有选择：不需要分布式，不需要权限系统，不需要多租户。如果哪天要做成给别人用的工具，整套约束都得重新想一遍。
