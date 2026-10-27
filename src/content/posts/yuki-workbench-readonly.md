---
title: "做一个只读的微信本地数据工作台：架构、同步链路与踩过的坑"
published: 2026-10-27
description: 一个跑在本机的 FastAPI + Vue 工作台，只读接入微信本地数据并按聊天框组织。讲清楚三条硬约束怎么落成代码、WAL 模式下快照解密的正确做法、2 秒一轮的增量同步与 SSE 推送、六个把我坑了半天的真实 bug，以及图片这条线：密钥由 uin 和 wxid 直接算出来，本地解密与云端直链两条路各自能到哪一步。
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

微信 PC 端里收到的文件不算少：课程表、通知、报名表、各种群里的附件。但它们散在几十个聊天框里，客户端的文件管理器只按时间排，找一份上周群里发的表要翻很久。

官方不提供「按聊天框看文件」的视图，所以我自己做一个。前提是**只读**——不碰微信的任何一个字节，不发消息，不改配置。

这篇文章讲三件事：三条硬约束怎么落成代码，同步链路为什么长成现在这样，以及中间踩了哪些值得记下来的坑。解密本身的技术细节在 [另一篇](/posts/macos-wechat-db-decrypt/) 里，那篇是从零开始的完整操作流程，这篇是建成之后回头看结构。

## 三条约束，靠代码不靠自觉

「只读」如果只写在 README 里，迟早会被自己破坏。所以它被拆成两层强制：

**第一层，唯一入口。** 所有对微信目录的访问必须走 `guard.py`：

```python
_WRITE_CHARS = set("wax+")

def read_bytes(path: Path) -> bytes:
    if not is_wechat_path(path):
        return path.read_bytes()
    with open(path, "rb") as f:      # 模式写死 rb，不接受参数
        return f.read()
```

写模式直接抛 `WeChatWriteDenied`，遍历目录也只能走 `iter_entries()`——这样每次读都顺手记一条审计，不需要每个调用点自己记得写日志。

**第二层，进程级兜底。** 万一有人绕过 guard 直接 `open(微信路径, "w")`，PEP 578 的审计钩子会在系统调用之前拦下：

```python
sys.addaudithook(_hook)   # 只处理 event == "open"
```

钩子里只做前缀判断和抛异常，**不写日志文件、不碰数据库**——审计钩子本身也会触发 `open` 事件，一不小心就递归。

**第三层，可核对。** `/sources` 页面列出微信版本、20 个加密库清单、每次读取的路径与行数、以及被拦截的写入尝试。违规记录只留内存里的 `deque(maxlen=50)`，不落盘，重启清空。

三层加起来的效果是：这个项目即使代码写错，也改不动微信的文件。

## 结构

后端是单进程 FastAPI，六个模块各自一个 `APIRouter`；前端 Vue 3 + Vite，没有 UI 框架，也没有状态管理库之外的东西。

```text
浏览器 (Vue 3)
   │  /api/v1/*        ── SSE /chats/live
   ▼
FastAPI 单进程
   ├── modules/        chats  files  sources  llm_api  settings_api  wechat_api
   ├── integrations/
   │     ├── wechat/   guard  locator  snapshot  keyx  reader  sync  live  media
   │     └── llm/      providers  client  mask  ledger
   └── core/           paths  config  errors  audit_hook
   │
   ▼ 只读
微信数据目录 → 快照副本 → 明文库(data/plain) → 自有库(data/yuki.db) → 页面
```

依赖只有六个：fastapi、uvicorn、sqlalchemy、httpx、cryptography、pytest。前端三个：vue、vue-router、pinia。规模上后端 6868 行 Python，前端 2365 行 Vue/TS，测试 53 个。刻意没有引入 Celery、Redis、消息队列——单机单用户，多一层就多一处故障点。

## 同步链路：WAL 是最大的坑

整条链路是六步：定位账号 → 读密钥 → 拷快照 → 派生解密 → 解析入库 → 推给前端。前两步在解密那篇文章里写透了，这里只说后面四步里最容易做错的地方。

### 快照必须带上 -wal

第一版是这么判断「要不要重新解密」的：

```python
if dst.exists() and dst.stat().st_mtime >= src.stat().st_mtime:
    return dst          # 源库没变，复用旧副本
```

看起来没问题，实测结果是**新消息永远读不到**。原因是微信在 WAL 模式下长期不做 checkpoint：`message_resource.db` 主库 98KB，而 `-wal` 已经 255KB。新消息全在 wal 里，主库 mtime 一动不动。

正确的做法是三个文件一起拷，指纹也一起算：

```python
for suffix in ("", "-wal", "-shm"):
    s = src.with_name(src.name + suffix)
    if s.exists():
        shutil.copy2(s, snap / (src.name + suffix))
```

同时 `sqlcipher_export` 也必须在快照上跑，不能在源库上跑——SQLCipher 打开库时可能触发 checkpoint，把 wal 的内容合回主库，那就是在写微信的文件了。这一条是「只读」约束里最隐蔽的破口：它不在写入路径上，而在读取时的副作用里。

### 增量靠游标，游标不能共用

每轮全量重读一次所有会话不现实。做法是在 `data/plain/<account>/.sync_state.json` 里记每个库每个会话的最大 `local_id`，下一轮只读比它大的行：

```python
rows = read_messages(conn, ...) if after is None else read_messages(conn, ..., after_local_id=after)
```

这里踩过一个难查的坑：游标最初按库记，一个库里几十个会话共用一个值。结果是小会话永远读不到新消息——大群把游标推到 3000，只有 5 条消息的私聊再也不会被扫到，因为它的 `local_id` 永远小于 3000。

改成 `rel + "@" + session_id` 之后正常。另外留了一个自愈分支：如果算出来的 `max_local_id` 小于游标，说明库被重建过，游标归零重读。

### 空闲时只做 stat

19 个库每库一次 PBKDF2-SHA512/256000 大约 55ms，每 2 秒全量跑一遍会把风扇跑起来。

所以同步线程平时只统计文件指纹，指纹没变就整轮跳过，空闲开销在微秒级；指纹变了才真正解密入库。实测单轮 124–330ms，取决于新增消息量。

线程模型上有个必须注意的点：**SQLAlchemy 的 Session 不能跨线程**，所以后台线程每轮自己建会话自己关；同时同步逻辑绝不能跑在事件循环里，否则 SSE 那条长连接会断。

### SSE 只送信号，不送数据

推送设计上纠结过：是直接把新消息序列化好推给前端，还是只告诉前端「哪个会话多了哪几条」。

选了后者。事件长这样：

```json
{"type": "sync", "stats": {"new": {"11": [363]}}}
```

理由是序列化逻辑只能有一份。如果 SSE 自己拼一份、HTTP 接口再拼一份，两边的字段迟早会不一致，而这种不一致只有在前端渲染出错时才会暴露。现在推送只带 id，前端拿 `after_id` 回 `/messages` 增量拉一次，走的是和首次加载完全相同的代码路径。

前端侧要点两条：

- `EventSource` 断线会自动重连，但重连期间的增量会丢，所以重连成功后要按最后一条消息 id 补拉一次
- 自动滚动只在用户已经贴着底部时才滚，否则翻历史的时候会被新消息顶走

SSE 还有个闲置问题：中间层可能因为长时间无数据掐断连接，所以每 15 秒发一个 `tick` 心跳。

## 六个把我坑住的 bug

按排查耗时排序，都是「代码看着对、结果不对」的类型。

### 一、正则用整条路径匹配，整段逻辑静默跳过

判断一个文件是不是消息库，写的是：

```python
MESSAGE_DB = re.compile(r"^message_\d+\.db$")
if MESSAGE_DB.search(rel):   # rel 是 "db_storage/message/message_0.db"
```

`^` 锚定了开头，而 `rel` 是带目录的相对路径，所以**永远不匹配**。后果是接口返回 200、日志没有报错、页面能显示会话列表，但一条消息都不入库。

修法是把匹配和路径拆开，并补一个用例锁住：

```python
def _is_message_db(rel: str) -> bool:
    return bool(MESSAGE_DB.match(Path(rel).name))   # 只取文件名
```

修完之后历史消息从 114 条变成 366 条。这个 bug 的教训是：`if` 不成立时不做任何事的分支，比抛异常难查得多。

### 二、静默降级比报错更贵

图片接口在缺密钥时返回 409，前端 catch 之后显示一个灰色占位。听起来合理，实际排查花了一整晚——因为「本地没有这张图」和「密钥解不开」在页面上长得一模一样。

现在把每一种「拿不到」单独给码，前端按码出文案：

| 情况 | 接口 | 页面 |
|---|---|---|
| 本地没有文件（未下载 / 被清理） | 409 `IMAGE_LOCAL_UNAVAILABLE` | 本地无原图 |
| 消息里没有云端直链 | 409 `IMAGE_CLOUD_UNAVAILABLE` | 云端也不给地址 |
| 两条路都没成（`source=auto`） | 404，把两条路的原因拼成一句 | 占位说明里直接写清缺在哪一步 |

密钥推导失败不单独给码，它只是 `local` 那条路的一个失败原因——混进上面三类里就够了。

再加上启动自检：后台拿最近用过的几张真实 `.dat` 试解，状态写日志、写状态文件、暴露成 `/chats/image-key/status`。失配时日志是 WARNING 级别，一眼能看见。

### 三、时区：被 SQLite 的 localtime 骗了一次

微信的 `create_time` 是标准 Unix 秒。我一度以为它存的是「本地墙钟当 UTC」，多算了 8 小时，还写了个 `fix_ts()` 去校正。

验证方式很简单——拿两条自己记得发送时间的消息对比 `datetime.fromtimestamp(ts)`，结果是对的。真正误导我的是 `datetime(create_time, 'unixepoch', 'localtime')` 这个 SQL 写法：`localtime` 修饰符依赖进程的 TZ 环境，在容器或不同 shell 里会不一致，看着像数据本身错了。

`fix_ts()` 已经删掉。这类「以为数据有问题、其实是自己换算多加了一层」的错误，只要补一个断言就能永久挡住。

### 四、群消息的发送者前缀和系统提示

群消息正文前面带发送者，格式有两种：`wxid_xxx:\n内容` 和 `wxid_xxx:<msg>`。第一版的正则要求冒号后紧跟 `<`，结果纯文本群消息全都残留 `wxid_c5rn42n38ug522:` 这种前缀，直接显示在气泡里。

系统提示（入群、撤回、拍一拍）更麻烦：`local_type=10000` 加一段 `<sysmsg>` XML，正文只是模板，真人名在另外的节点里：

```text
模板   content_template/template  →  "$username$邀请"$names$"加入了群聊"
真名   link_list/link/memberlist/member/nickname
分隔符 link/separator              →  "、"
```

不替换就是满屏 `$username$`。撤回消息还有个坑：内容在 `<revokemsg><content>` 里，不是 `<replacemsg>`；同节点还有 `<revoketime>`，用 `itertext()` 取文本会把时间戳粘在正文后面。

### 五、手动同步不广播，多标签页不一致

实时引擎走 SSE，手动点「同步」走 HTTP。第一版手动同步只写库不广播，于是开两个标签页时，A 页点了同步，B 页不动。

一条 `hub.publish()` 解决。教训是：状态变更的广播要挂在数据写入的那一层，而不是各个入口各写一遍。

### 六、测试里的启动副作用让用例偶发失败

图片密钥自检挂在 `startup` 上。`TestClient` 会触发 startup，于是每次建测试客户端都多跑一次 `locator.discover`，把「探测只跑一次」那个断言从 3 变成 4。

症状是：单跑通过，全量必挂。原因是单独跑那个用例时没有别的 TestClient 先启动过。

修法是 `tests/conftest.py` 里设环境变量关掉自检：

```python
os.environ.setdefault("WB_DISABLE_IMAGE_CHECK", "1")
```

生产行为不变。这类「测试之间通过全局副作用互相干扰」的问题，早发现早隔离，否则后面每加一个用例都在赌运气。

## 图片这条线：本地算得出来，云端只通了一半

图片和解密那篇讲的数据库密钥是两条独立链路。这里的关键反转是：**图片 key 不需要抓，它可以算出来**。详细实测在[解密那篇的 7.5、7.6 节](/posts/macos-wechat-db-decrypt/)。

```python
def derive_key(uin: int, wxid: str) -> bytes:
    return hashlib.md5(f"{uin}{wxid}".encode()).hexdigest()[:16].encode()

xor_key = uin & 0xFF
```

两个输入都在磁盘上：`uin` 取自 `kvcomm/key_<uin>_*.statistic` 的文件名，`wxid` 取自账号目录名（要剥掉末尾 4 位安装标识）。不用 attach 进程、不用扫内存、不用联网。

我在这条路上先错了很久：先后试过静态 key、XML 里的 `aeskey`、CommonCrypto 钩子、数据库短字段、全内存扫描、微信明文残留，六条全败。它们都在问「key 存在哪里」，而答案是「不存在于任何地方」——每次用的时候现算。那六条的失败细节留在解密那篇，这里不重复。

`.dat` 的结构和两个坑：

```text
07085632 | aes_size(4) | xor_size(4) | 00 | AES-ECB(前 1KB) | 补齐 | XOR 段
```

- 解出来大概率不是 JPEG，而是 `wxgf`（微信私有 HEVC 容器）。喂 ffmpeg 前必须从 `00 00 00 01 40 01`（VPS）截断，否则遇到前面的 SEI 就报 `Invalid data found`
- 「消息 → 文件」没有可靠的映射表（`message_resource.db` 只有 55 行，图片消息有 73 条）。真正的规律是**解密内容 md5 == 消息 XML 里的 md5**，本机 14/14 吻合。所以索引是「解密 → 算 md5 → 反查」，不是查表

### 两条路，各自能到哪

后端 `GET /chats/media/{id}?source=auto|local|cloud` 一条接口，内部两条路：

| | 覆盖 | 依赖 |
|---|---|---|
| `local` | 有 `.dat` 的图，能出原图 | 磁盘 + 推导出的 key |
| `cloud` | 消息里带**完整 CDN 直链**的（表情） | 一条 HTTP 请求 |

本机实测（219 条图片+表情消息）：

```text
cached      116   之前已经解好
decoded       4   本地新解
from_cloud   47   云端取到
unavailable  52   两边都没有
failed        0
```

按类型拆开看差异更明显：**109 条表情全部能显示，59 条聊天图片只有 28 条能出图。**

原因在 XML 里就分好了：

- `<emoji cdnurl="http://vweixinf.tc.qq.com/110/20401/stodownload?m=…&filekey=…&storeid=…">` 给的是完整 URL，服务器不校验登录态，直接 GET 就是明文 PNG
- `<img cdnthumburl="305f0201…">` 只给 hex 编码的 filekey，没有 URL 也没有签名参数。三个 host、两种路径、三种参数名拼下来全是 400——它需要发消息时客户端拿到的那份 token，本机数据里没有

所以「云端拿」没有做成万能兜底，只做成了「有直链就下」。拿不到就明确返回 `unavailable`，页面上写「本地无原图，云端也不给地址」，不假装成功。

### 缓存和自检

不管走哪条路，成功一次就落盘：

```text
data/cache/images/<图片md5>.<ext>
```

内容寻址，同一张图不会重复解码；写的时候先写 `.tmp` 再 `os.replace`；文件内容与扩展名对不上（被截断、磁盘错误）就删掉重解；上限 4000 张，超了按 mtime 淘汰。

顺序是**先查缓存，再判密钥**：

```python
hit = cache_hit(md5)
if hit:
    return hit          # key 算错了、原图被清了，历史图照样能看
```

启动自检会拿算出来的 key 试解几张真实 `.dat`，一张都解不开才报错。判定条件必须收紧到「解出来以 `FFD8FF` 开头」——AES-ECB 没有完整性校验，错 key 也会吐出一堆看起来正常的字节，静默降级成灰块比报错难查得多。

网页端就一个按钮「一键载入图片」，串完缓存、本地、云端三步。之前这些要开终端敲命令，那确实不叫能用。

## 现在的状态

| 项 | 实测 |
|---|---|
| 加密库 | 20 个，PBKDF2 派生 + 试开 598ms |
| 解密导出 | 5 个明文库，增量复用，全量导出一次几秒 |
| 会话 / 消息 | 20 个会话，643 条消息 |
| 文件索引 | 882 个文件，5.09 GB |
| 实时同步 | 2 秒轮询，变了才同步，单轮 124–330ms |
| 测试 | 68 passed，连跑两轮稳定 |
| 图片 | 表情 109/109 可显示，聊天图 28/59；本地解密 + 云端直链 + 明文缓存 |
| 图片密钥 | 由 `uin` + `wxid` 推导，无需抓取，落盘零依赖 |

## 边界

这些是明确不做的，写下来是为了以后不反复讨论：

- 不发消息、不自动回复、不同步通讯录
- 不改微信客户端二进制、不改签名、不拦截网络
- 调试器 attach、内存扫描这类动作只在我手动排障时用，不进产品链路；工作台自身运行时对微信进程零接触
- 不把数据发到任何远端；模型调用只在你配置的端点上，且可脱敏
- 明文库、快照、密钥全部在 `data/` 和 `~/.config` 下，已 gitignore

单机、单用户、只读。这三个词决定了上面所有的设计选择——不需要分布式，不需要权限系统，不需要多租户。如果哪天要做成给别人的工具，那整套约束都得重新想一遍。
