---
title: "在 macOS 上从零解密微信本地数据库：完整可复现流程"
published: 2026-10-27
description: 从定位数据目录到页面上显示出聊天记录，逐步给出每一条命令、每一个文件路径、每一处输出和报错含义。包含 SIP 关闭与恢复、CCKeyDerivationPBKDF 钩子脚本、密钥验证脚本、明文导出、zstd 消息体解析、两把密钥各自的生命周期，以及图片密钥为什么不用抓——六条弯路逐条实测全部失败之后，它其实由 uin 和 wxid 直接算出来。
tags:
  - macOS
  - 逆向
  - SQLCipher
  - 微信
category: 技术
slug: macos-wechat-db-decrypt
comment: true
---

微信 4.x for Mac 把聊天数据存在 SQLCipher 4 加密库里。这篇文章把我从一台干净机器开始、到屏幕上显示出聊天记录的**全部操作**按顺序写下来：每条命令、每个文件放在哪、每条输出什么意思、报错怎么读。

前面几节是准备工作和为什么常规方法不行，从「步骤二」开始是纯操作。每一步都给了命令和真实输出，包括我这台机器上的具体路径和账号目录，照着换成你自己的即可。

**实测环境**

| 项 | 值 |
|---|---|
| 机器 | MacBook Air M2（arm64） |
| 系统 | macOS 26.7.1 |
| 微信 | 4.1.13（App Store 版） |
| sqlcipher | 4.19.0（Homebrew） |
| Python | 3.13 |

**边界**：只读本机、自己登录的账号；源库全程 `-readonly`；不改微信文件、不改签名、不拦截网络；读完密钥立即 detach。没有本机登录态，这套流程一步都走不动。

---

## 步骤零：装工具

```bash
brew install sqlcipher
sqlcipher --version        # 期望：4.19.0 或更高
```

`lldb` 随 Xcode Command Line Tools 提供，检查一下：

```bash
xcode-select -p            # /Library/Developer/CommandLineTools
lldb --version
DevToolsSecurity -status   # 期望 Developer mode is enabled
```

如果显示 disabled：

```bash
sudo DevToolsSecurity -enable
```

Python 侧只需要标准库 + `zstandard`：

```bash
pip install zstandard
```

---

## 步骤一：定位数据目录

```bash
ls ~/Library/Containers/com.tencent.xinWeChat/Data/Documents/xwechat_files/
```

输出类似：

```text
wxid_vq1vikkrc0jr19_ab91
wxid_4ouo7i3njh6622_cfb4
```

每个 `wxid_*` 就是一个登录过的账号。里面结构固定：

```text
wxid_xxx/
├── db_storage/
│   ├── session/session.db          会话列表
│   ├── contact/contact.db          联系人
│   ├── message/message_0.db        消息（分片）
│   ├── message/message_1.db
│   ├── message/biz_message_0.db
│   └── ... 一共 19 个 .db
├── msg/                            图片、语音等附件（按 md5 分目录）
└── ...
```

数一下有多少库、哪个是当前登录的号：

```bash
R="$HOME/Library/Containers/com.tencent.xinWeChat/Data/Documents/xwechat_files"
for d in "$R"/*/db_storage; do
  echo "$(basename $(dirname $d)): $(find "$d" -name '*.db' | wc -l | tr -d ' ') 个库"
done
# 当前登录的号，mtime 最新
ls -dt "$R"/*/db_storage | head -1
```

:::warning
`~/Library/Containers/...` 里可能残留多个账号目录。**每个账号的密钥不同**，本机上旧号的 17 个库用新号的密码试是 0/17。后面所有步骤都要对准「当前登录」的那个目录。
:::

---

## 步骤二：确认加密方式

拿最小的库，看文件头 16 字节：

```bash
DB=~/Library/Containers/com.tencent.xinWeChat/Data/Documents/xwechat_files/wxid_xxx/db_storage/session/session.db
xxd -l 32 "$DB"
```

如果是明文 SQLite，前 16 字节是：

```text
00000000: 5351 4c69 7465 2066 6f72 6d61 7420 3300  SQLite format 3.
```

微信的实际输出是随机字节：

```text
00000000: 8f3a 1c05 9b7e 42d1 08a6 5f33 c7e0 1b94  ..:..~B..._3....
```

这 16 字节就是 **salt**，后面派生密钥要用。每个库的 salt 都不一样，这一点是后面最大的坑。

---

## 步骤三：先试最常规的路，确认它在你的机器上是否可用

常规做法是读进程内存找密钥。macOS 上要先能拿到进程的 task port：

```bash
pgrep -x WeChat                     # 确认微信在跑，拿到 PID
lldb -b -p <PID> -o "process status" -o quit
```

SIP 开启时输出：

```text
error: attach failed (Not allowed to attach to process.)
```

我们的封装接口返回更细的码：

```text
task_for_pid 被拒（kern_return=5）
```

`kern_return=5` 是 `KERN_FAILURE`，来自 `taskgated`。判定规则：一个进程要被调试器拿 task port，要么签名里带 `com.apple.security.get-task-allow`，要么 SIP 关闭。

查微信签名：

```bash
codesign -dv /Applications/WeChat.app 2>&1
codesign -d --entitlements - /Applications/WeChat.app 2>&1
```

关键三行：

```text
flags=0x10000(runtime)
Authority=Apple Mac OS Application Signing
[Bool] app-sandbox = true
```

没有 `get-task-allow`。它是 App Store 分发的（`_MASReceipt` 存在），Apple 的签名不可能给第三方留调试位。

### 3.1 四条改签名路线，我全试过了

如果你也想「自己签一份带 `get-task-allow` 的」，先看这张表，别再花时间：

| 做法 | 结果 |
|---|---|
| 原地重签 `/Applications/WeChat.app` | `Operation not permitted`，`sudo` 也一样 |
| 复制到 `/tmp` + ad-hoc 签名（带 sandbox + get-task-allow） | 签名成功，进程崩在 `_libsecinit_appsandbox`（SIGTRAP） |
| 复制 + Apple Development 证书签名 | 进程能起，数秒后被 `containermanagerd` SIGKILL |
| lldb 直接 launch（不 attach） | `process exited with status -1` |

失败原因各不相同，值得记一下：

- **原地重签**被 macOS 的 App Management 拦。`/Applications` 下的应用不允许第三方改签名。好在是原子失败，原签名没被破坏。
- **ad-hoc 副本**过不了沙盒初始化：二进制声明的身份和它要访问的容器对不上。
- **开发证书副本**过了沙盒，但数据容器属于腾讯的 Team ID，跨 Team 访问被 `containermanagerd` 判定越权，直接杀。
- **launch 模式**没用，因为拦住它的不是「谁启动的」，而是 `taskgated` 对带 `com.apple.application-identifier` 的 MAS 签名一律要求 `get-task-allow`。我拿另一个 App Store 应用做对照，同样被拒。

:::warning
别用裸 `codesign --force --sign -` 去改微信。它会把原 entitlements 整个清空，微信直接打不开。任何改签名的操作，先备份：

```bash
codesign -d --entitlements :- /Applications/WeChat.app > /tmp/wechat.ent.plist
codesign -dv --verbose=4 /Applications/WeChat.app > /tmp/wechat.sig.txt 2>&1
```
:::

结论：**SIP 开启状态下没有一条路能走通**，这是机制问题，不是代码问题。

---

## 步骤四：关闭 SIP

```bash
csrutil status
# System Integrity Protection status: enabled.
```

关闭流程（Apple Silicon 是长按电源键）：

1. 完全关机（不是重启）。
2. 按住**电源键 / Touch ID 键**约 10 秒，直到出现「正在载入启动选项」，松手。
3. 点「选项」→「继续」，选管理员账户，输入密码。
4. 菜单栏 **工具程序 → 终端**。
5. 执行：

   ```bash
   csrutil disable
   ```

   确认 `y`，输入密码。看到 `System Integrity Protection is off.` 成功。
6. `reboot` 重启。

回到桌面后确认：

```bash
csrutil status
# System Integrity Protection status: disabled.
```

:::warning
SIP 关闭期间系统失去对系统文件和代码签名的保护。这段时间不要安装任何来源不明的软件，抓完立刻恢复（步骤九）。
:::

---

## 步骤五：写钩子脚本

不用扫内存找密钥，直接在**密钥派生函数**上截参数。SQLCipher 4 在 macOS 上用 CommonCrypto 做 PBKDF2，符号是系统动态库里的 `CCKeyDerivationPBKDF`——不受微信静态链接和 strip 的影响。

### 5.1 为什么不是 `sqlite3_key`

我第一版断点就打在 `sqlite3_key` 上，结果：

```text
(lldb) breakpoint set -n sqlite3_key
Breakpoint 1: where = libsqlite3.dylib`sqlite3_key
```

断点解析成功，然后**一次都没命中**。查依赖才知道原因：

```bash
otool -L /Applications/WeChat.app/Contents/MacOS/WeChat | grep -i sqlite
# 无输出

otool -L /Applications/WeChat.app/Contents/Frameworks/libwxld.dylib | grep -i sqlite
# 无输出
```

微信不链接系统的 `libsqlite3`。SQLCipher 是**静态链进** `Frameworks/ld/WCDY.framework` 的，而且符号已经 strip：

```bash
nm -gU /Applications/WeChat.app/Contents/Frameworks/ld/WCDY.framework/WCDY 2>/dev/null | grep -c sqlite3_key
# 0
```

你在系统库里下的断点，和微信执行的那份代码不是同一份。

:::tip
断点「已解析」不等于「会命中」。下断点前先 `otool -L` 看目标进程到底链了什么。
:::

### 5.2 函数签名与寄存器对应

```c
int CCKeyDerivationPBKDF(CCPBKDFAlgorithm algorithm,
                         const char *password, size_t passwordLen,
                         const uint8_t *salt, size_t saltLen,
                         CCPseudoRandomAlgorithm prf, uint rounds,
                         uint8_t *derivedKey, size_t derivedKeyLen);
```

AArch64 调用约定下前 8 个参数在 `x0..x7`。于是断点命中时可以这样读：

| 寄存器 | 参数 | 实际值 |
|---|---|---|
| `x0` | algorithm | 2（`kCCPBKDF2`） |
| `x1` | password 指针 | 指向 32 字节内存 |
| `x2` | passwordLen | 32 |
| `x3` | salt 指针 | 指向库头那 16 字节 |
| `x4` | saltLen | 16 |
| `x5` | prf | 5（SHA512） |
| `x6` | rounds | 256000 |
| `x7` | derivedKey 指针 | 输出缓冲区 |

`prf=5` 和 `rounds=256000` 就是 SQLCipher 4 的默认参数，从寄存器里实读，不用猜。

### 5.3 存两个文件

**文件一：`/tmp/keyx_hook.py`**（lldb 的 Python 回调）

```python
import lldb
import time

START = time.time()
HITS = 0
SEEN = set()
MAX_HITS = 80          # 命中多少次后自动 detach
BUDGET = 300           # 最长等 300 秒

def hook(frame, bp_loc, internal_dict):
    global HITS
    proc = frame.GetThread().GetProcess()
    reg = frame.FindRegister
    err = lldb.SBError()

    # 按 AArch64 调用约定取参数
    try:
        pw   = reg("x1").GetValueAsUnsigned()   # password 指针
        plen = reg("x2").GetValueAsUnsigned()   # passwordLen
        salt = reg("x3").GetValueAsUnsigned()   # salt 指针
        slen = reg("x4").GetValueAsUnsigned()   # saltLen
    except Exception:
        return False

    if not pw or not plen or plen > 128:
        return False

    key = proc.ReadMemory(pw, plen, err)
    s   = proc.ReadMemory(salt, min(slen, 32), err) if salt and slen else b""
    if key:
        HITS += 1
        SEEN.add(bytes(key))
        print("KEYX len=%d %s SALTX %s" % (
            plen,
            bytes(key).hex(),
            bytes(s).hex() if s else "-"), flush=True)

    if HITS >= MAX_HITS or time.time() - START > BUDGET:
        print("KEYX done hits=%d unique=%d" % (HITS, len(SEEN)), flush=True)
        proc.Detach()     # 拿够就走，别让微信挂在调试器下
    return False
```

为什么用 Python 回调而不是断点命令 `memory read`：断点命令列表里的 `memory read` 输出会被 lldb 吞掉（实测），而 Python 里 `SBError` + 原始字节最稳。

**文件二：`/tmp/attach.lldb`**（lldb 命令脚本）

```text
settings set target.process.stop-on-sharedlibrary-events false
command script import /tmp/keyx_hook.py
breakpoint set --name CCKeyDerivationPBKDF
breakpoint command add -s python -F keyx_hook.hook 1
continue
```

第一行必须加，也不用改：默认情况下 lldb 会在每个 dylib 加载时停一次，微信启动过程会停几十次，钩子根本等不到密钥派生那一刻。

---

## 步骤六：执行抓取

时序很重要：**先让微信跑起来，attach 之后再触发登录**。太早 attach（沙盒初始化前）会崩，太晚（密钥已派生完）会错过窗口。

### 6.1 起微信

```bash
open -a WeChat
sleep 5
pgrep -x WeChat          # 例如 8099
```

此时微信停在登录页（二维码或「进入微信」按钮），数据目录还没被打开。验证一下：

```bash
lsof -p $(pgrep -x WeChat) | grep -c db_storage
# 0
```

### 6.2 attach 并挂断点

```bash
PID=$(pgrep -x WeChat)
lldb -b -p "$PID" -s /tmp/attach.lldb
```

终端会停在 `continue` 上不返回，这是正常的——它在等函数被调用。

成功时的输出：

```text
(lldb) command script import /tmp/keyx_hook.py
(lldb) breakpoint set --name CCKeyDerivationPBKDF
Breakpoint 1: where = libcommonCrypto.dylib`CCKeyDerivationPBKDF, ...
(lldb) breakpoint command add -s python -F keyx_hook.hook 1
(lldb) continue
Process 8099 resuming
KEYX len=32 13bf3855...b7efda SALTX 8f3a1c059b7e42d108a65f33c7e01b94
KEYX len=32 13bf3855...b7efda SALTX 2b7c04de8819af5521c0bb9e4d3f6a70
...
KEYX done hits=61 unique=21
Process 8099 detached
```

### 6.3 现在去登录

保持终端窗口别看它。**打开微信窗口完成登录**（扫码，或点已有头像直接进入）。

登录的瞬间 WCDB 会逐个打开 19 个库，每个库做一次 PBKDF2，于是 19 次命中，密码相同、salt 各不相同。

:::note
本地有登录态时，微信启动会**自动登录**，即使不扫码也会走完整的密钥派生。所以 attach 后几秒内就可能开始命中。
:::

### 6.4 判读输出

- 每个 `KEYX` 行就是一次密钥派生：`len=32` 是密码长度，中间是密码 hex，`SALTX` 后面是这个库的 salt。
- 同一个密码 + 不同 salt = 正常。**`len=32` 且密码部分全部相同**，说明抓对了。
- `unique=21` 是去重后的候选数，比密码数多，因为除了主密码还有别的 KDF（比如某些子库用不同参数）。
- `Process detached` 之后 lldb 自动退出，微信继续正常运行，不受影响。

把输出存下来备查：

```bash
# 如果跑的时候没重定向，重新跑一次加上
lldb -b -p "$PID" -s /tmp/attach.lldb 2>&1 | tee /tmp/keyx_hits.log
```

### 6.5 一直没有命中怎么办

按这个顺序查，基本能定位：

| 现象 | 检查 | 原因 |
|---|---|---|
| 断点显示 `where = libsqlite3.dylib\`...` | 你打的是 `sqlite3_key` | 微信不链接它，改 `CCKeyDerivationPBKDF` |
| 断点报了 30 多个 | 忘加 `stop-on-sharedlibrary-events false` | 每个 dylib 加载都停一次，钩子等不到 |
| 完全不输出，进程活着 | `lsof -p $PID \| grep -c db_storage` | 返回 0 说明微信还没打开库，等登录 |
| attach 直接失败 | `csrutil status` | 还是 enabled，SIP 没关成功 |
| `Process detached` 但没 KEYX | 看 `keyx_hits.log` 里有没有 traceback | Python 回调导入失败，检查文件路径 |
| 只命中一两次就结束 | 登录后不会重新派生 | 登出微信再登入，重新触发 |

最常见的是第三种：钩子挂上了，但微信停在登录页没动，数据库一个都没打开。这时候 `lsof` 的输出就是判断依据。

---

## 步骤七：验证密钥并入库

### 7.1 易错点：抓到的 32 字节是「密码」，不是 raw key

这是整个流程最耗时的一个坑。第一版直接把抓到的 hex 当 raw key 用：

```sql
PRAGMA key = "x'13bf3855...b7efda'";
SELECT count(*) FROM sqlite_master;
```

19 个库全部返回：

```text
Error: file is not a database
```

报错极其含糊，很容易误判成「密码抓错了」「hook 读到的是别的值」。

真实原因：微信把这 32 字节交给 `sqlite3_key`，SQLCipher 内部还要拿它 + **库头 16 字节 salt** 做一轮 PBKDF2，才得到真正的 AES-256 密钥。钩子里读到的 `prf=5` / `rounds=256000` 就是这个过程。

所以正确姿势是两步：

```python
raw = PBKDF2-HMAC-SHA512(password, salt=db_header[:16], rounds=256000, dklen=32)
PRAGMA key = "x'<raw.hex()>'"      # 这一步才是 raw key 模式
```

:::note
`PRAGMA key = "x'...'"` 和 `PRAGMA key = '密码'` 不是一回事。前者是 raw key 模式，跳过 KDF，字节直接当 AES 密钥；后者把字符串当密码，SQLCipher 再派生一次。微信既不是纯前者也不是纯后者：先给一个 32 字节密码，再由 SQLCipher 派生。所以必须自己先把派生算出来。
:::

### 7.2 完整验证脚本

存成 `/tmp/verify.py`，改掉 `PW` 和 `ACCT` 就能跑：

```python
import hashlib, pathlib, shutil, subprocess

# 换成步骤六里抓到的密码：64 位 hex，就是 KEYX 行中间那段
PW   = bytes.fromhex("在此填入你自己的 64 位 hex")
ACCT = "wxid_vq1vikkrc0jr19_ab91"
ROUNDS, SALT_LEN = 256000, 16

base = pathlib.Path.home() / "Library/Containers/com.tencent.xinWeChat/Data/Documents/xwechat_files" / ACCT / "db_storage"
cli  = shutil.which("sqlcipher")
assert cli, "先 brew install sqlcipher"

def open_db(db: pathlib.Path):
    """派生 raw key 并试读 sqlite_master。成功返回表数，失败返回 None。"""
    salt = db.read_bytes()[:SALT_LEN]
    raw  = hashlib.pbkdf2_hmac("sha512", PW, salt, ROUNDS, dklen=32).hex()
    # SQL 必须走 stdin：sqlcipher CLI 会把参数里的 ; 当语句分隔符
    sql  = f'PRAGMA key = "x\'{raw}\'";\nSELECT count(*) FROM sqlite_master;\n'
    r = subprocess.run([cli, "-readonly", str(db)], input=sql,
                       capture_output=True, text=True, timeout=60)
    out = (r.stdout or "") + (r.stderr or "")
    if "not a database" in out.lower():
        return None
    lines = [x.strip() for x in (r.stdout or "").splitlines() if x.strip()]
    return lines[-1] if lines and lines[-1].isdigit() else None

ok = bad = 0
for db in sorted(base.rglob("*.db")):
    if db.stat().st_size < 4096:
        continue
    n = open_db(db)
    if n:
        ok += 1
        print(f"✅ {db.relative_to(base)}  表={n}  {db.stat().st_size//1024}KB")
    else:
        bad += 1
        print(f"❌ {db.relative_to(base)}")
print(f"\n可用 {ok} / 失败 {bad}")
```

执行：

```bash
python3 /tmp/verify.py
```

实测输出：

```text
✅ bizchat/bizchat.db  表=6  28KB
✅ chatbot/chatbot_message.db  表=18  76KB
✅ contact/contact.db  表=26  2688KB
✅ emoticon/emoticon.db  表=17  576KB
✅ favorite/favorite.db  表=26  116KB
✅ message/message_0.db  表=20  108KB
✅ session/session.db  表=16  68KB
✅ sns/sns.db  表=26  3292KB
...
可用 19 / 失败 0
```

19/19 全过，密码确认正确。整轮含 sqlcipher 进程启动约 1.5 秒。

### 7.3 报错对照

| 输出 | 含义 | 怎么办 |
|---|---|---|
| `file is not a database` | raw key 不对 | 检查是不是漏了 PBKDF2 派生，或者 salt 取错 |
| 输出为空、无报错 | SQL 没传进去 | 确认 SQL 走的是 stdin，不是命令行参数 |
| `unable to open database file` | 路径错或权限不足 | `ls -l` 看文件；确认是当前账号目录 |
| 全部库都失败但密码看着对 | 拿错账号了 | 每个账号密钥不同，对准当前登录的号 |
| 只有个别库失败 | 该库用了不同 KDF 参数 | 从 hook 输出里挑对应的候选试 |

### 7.4 密钥存哪里

验证通过后把密码存成一个文件。我在项目里放的是：

```text
~/.config/yuki-wb/wechat_keys.json
```

结构（已脱敏）：

```json
{
  "extracted_at": "2026-10-27T10:53:35",
  "meta": {
    "method": "lldb_hook",
    "source": "pbkdf2",
    "account_dir": "wxid_vq1vikkrc0jr19_ab91"
  },
  "password": "13bf3855...(64 hex)",
  "keys": {
    "db_storage/session/session.db": "13bf3855...(64 hex)",
    "db_storage/contact/contact.db": "13bf3855...(64 hex)"
  }
}
```

`keys` 里存的是每个库的相对路径，值是**密码**（不是派生后的 key）。派生在读取时按各库 salt 现算。

权限必须收紧：

```bash
mkdir -p ~/.config/yuki-wb
chmod 700 ~/.config/yuki-wb
# 写入后
chmod 600 ~/.config/yuki-wb/wechat_keys.json
ls -l ~/.config/yuki-wb/wechat_keys.json
# -rw------- 1 yuki staff ...
```

:::warning
这个文件等价于你全部聊天记录。不要提交进 Git、不要放进云同步目录、不要贴到聊天窗口里。项目里的 `.gitignore` 已经排除 `data/` 和 `*.key`，但仍然建议把它放在仓库之外的 `~/.config`。
:::

### 7.5 两把密钥的生命周期：哪些会变、哪些根本不用管

同一条链路其实要用两把 key，性质完全不同。混着记，最容易在「昨天还能看图、今天全是灰块」的时候查错方向。

| | 数据库密钥（密码 → PBKDF2） | 图片 Image Key（16 字节 AES） |
|---|---|---|
| 从哪来 | 钩子抓到的 32 字节密码（64 个 hex 字符），按各库 salt 现派生 | 由 `uin` 和 `wxid` 算出来，见 7.6 |
| 能不能落盘复用 | 能，长期有效 | 不用存，随时重算，几毫秒 |
| 重启微信 | 不变 | 不变 |
| 退出登录 / 换号 | 同账号不变 | `uin` 变了，重算一次即可 |
| 失效之后要做什么 | 重新抓一次密码 | **什么都不用做**，程序自己算新的 |
| 作用域 | 每账号一套 | 每账号一套（绑 `wxid`） |

**数据库密钥为什么稳定**：PBKDF2 的输入只有密码和库头那 16 字节 salt，两者都不随登录变化，派生结果自然固定。我这台机器上的密码是 10 月 24 日抓的，10 月 27 日还在正常解密当天 WAL 里新写入的消息，中间微信重启过多次，一次都没重抓。

**图片密钥为什么也不用抓**：它绑的是 `uin`，`uin` 就写在 `kvcomm/key_<uin>_*.statistic` 的**文件名**里。微信重新登录会换 `uin`，但同时磁盘上也就出现了新的文件名，重算一次就是了。于是「抓一次存起来用一辈子」这个思路从一开始就没必要——不存在会丢的东西。

真正需要动手的时机只剩两种情况：

1. **微信升大版本后推导规则被改**：表现为自检突然解不开任何图，但 `.dat` 文件都在、`uin` 也读得到。这时才需要重新逆一遍公式
2. **换机器 / 换账号**：不需要任何操作，程序按新的 `uin`、`wxid` 自动重算

不需要重抓的场景可以直接划掉一长串：重启 Mac、退出登录、切换账号、合盖睡眠唤醒、切页面、翻历史消息——这些对图片 key 都没有影响。

工程上仍然要做三件事，但理由和以前不一样了：

- **解出来就落盘**：解成功的图存成明文 JPEG 缓存（按内容 md5 命名）。理由不是「key 会丢」，而是**微信会清理原图**——`.dat` 被删掉之后，缓存是唯一还留着这张图的地方
- **启动自检**：拿算出来的 key 试解几张真实 `.dat`，一张都不开就明确报「密钥推导失败」。判定要收紧到「解出来以 `FFD8FF` 开头」，因为 AES-ECB 没有完整性校验，错 key 也会吐出一堆看起来正常的字节，静默降级成灰块比报错难查得多
- **别把 uin 当常量**：`kvcomm` 目录下可能同时存在多个 `key_<uin>_*`，要按文件 mtime 取最新的，再用真实样本验证一遍

:::warning
图片 key 不用抓、也不该写死在配置里。唯一的输入是 `uin`，而 `uin` 是运行期从文件名读出来的——存一份反而会在换号后变成脏数据。
:::

### 7.6 图片密钥：六条路全败之后，发现它不用抓

数据库那条链路到 7.5 就完整了。图片是另一条独立链路。我先把能想到的六条路全试了一遍，全部没成；后来发现是方向错了——**这把 key 不需要抓，它可以算出来**。

#### 结论先放前面

```python
import hashlib

def derive_key(uin: int, wxid: str) -> bytes:
    # AES key：md5(str(uin) + wxid) 的 hex 前 16 个字符，当 ASCII 用
    return hashlib.md5(f"{uin}{wxid}".encode()).hexdigest()[:16].encode()

def xor_key(uin: int) -> int:
    return uin & 0xFF
```

两个输入，全都在磁盘上，不需要 attach 进程：

- **`uin`**：在 `Documents/app_data/{net,ilink}/kvcomm/` 下，文件名形如 `key_3455241991_*.statistic`，中间那串数字就是
- **`wxid`**：账号目录名 `wxid_vq1vikkrc0jr19_ab91`。**末尾 4 位 hex 是安装标识，必须剥掉**，正则 `^(.*)_([0-9a-f]{4})$` 取出 `wxid_vq1vikkrc0jr19`

整个推导几毫秒。微信重新登录后 `uin` 会变，重算一次就是新 key；`_ab91` 这个安装标识不跟着变，所以别把整个目录名当 wxid 拼进去。

#### 怎么确认这不是巧合

`3455241991 & 0xFF = 7`。而我在完全没碰过 uin 之前，是从 JPEG 尾部反推出 XOR key 的：`tail[-2] ^ 0xFF = 0x07`。两条互不相关的路径落在同一个数字上，这比单张图解出来像张图要硬得多。

再加一层：本机 `.dat` 文件的头部结构，113 个文件全部吻合。

```text
07085632 | aes_size(4) | xor_size(4) | 00 | AES-ECB 密文段 | 补齐 | XOR 段
  6字节       小端          小端        1字节
```

- `aes_size` 实测恒为 1024：只有前 1KB 走 AES，剩下走单字节 XOR
- 密文段长度是 `aes_size` 补齐到 16 的倍数；`aes_size` 本身是 16 的倍数时要**多补一整块**（PKCS7 语义）
- 校验式：`15 + aligned(aes_size) + xor_size == 文件长度`，13/13 精确相等
- XOR 段：`data[i] ^ xor_key`，`xor_key = uin & 0xFF`

#### 顺带解决的三个坑

**坑一：解出来不是 JPEG，是 `wxgf`。** 13/14 张图解完头部是 `77786766`（ASCII `wxgf`），微信私有的 HEVC 容器。我一开始以为 key 错了，其实是容器格式没认。要喂 ffmpeg 得先截断：从 `00 00 00 01 40 01`（VPS）开始才是能解的裸流，前面可能还裹着 SEI（NAL type 10），直接丢给 ffmpeg 会报 `Invalid data found`。另外临时文件后缀别用 `.wxgf`——ffmpeg 按扩展名挑 demuxer，不认识就直接失败，改 `.bin` 就好。

**坑二：消息和文件对不上。** `message_resource.db` 里有「消息 → 文件名」的映射，但那张表只有 55 行，图片消息有 73 条，覆盖不全，还有一半的图靠它找不到。真正的规律是：**解密后的图片内容 md5，等于消息 XML 里的 `md5` 字段**。本机 14/14 精确对应。文件名那个 hash 和内容毫无关系。所以正确的索引是「解密 → 算内容 md5 → 反查」，不是「查表拿文件名」。

**坑三：`aeskey` 和本地 key 是两套东西。** XML 里那个 32 位 `aeskey` 是 CDN 传输用的，不是本地 `.dat` 的解密 key。我拿 45 个唯一值 × 3 种派生 × 13 张图 × 3 种模式共 5265 次尝试，0 命中，可以彻底放弃这条。

#### 那六条弯路为什么全败

保留在这里，因为它们的失败方式本身有信息量。

| 试过的路 | 做法 | 结果 |
|---|---|---|
| 1. 静态 key | `cfcd208495d565ef` 是公开资料里 format1（`07085631`）的固定 key | 本机 `.dat` 全是 `07085632`（V4-format2），格式对不上 |
| 2. XML 里的 aeskey | 试了 13 种派生（md5 各形式、前后 16 字节、base64）× 33 个偏移 | 全部未命中，它是 CDN 下载密钥 |
| 3. CommonCrypto 钩子 | `lldb` 挂 `CCCrypt`/`CCCryptorCreate`，日志 545KB | 6922 次调用全是 32 字节 key，12 把唯一值，对 20 张真实图 **0/20** |
| 4. 数据库短字段 | 遍历明文库所有 16/32 字节 blob，加 `key_info.db` 滑动窗口 | 870 个候选，**0 命中** |
| 5. 全内存扫描 | 自写工具扫微信进程，14.8 亿个 16 字节窗口 | 11 个命中，交叉验证**全是假阳性** |
| 6. 微信明文残留 | 扫账号目录下所有 JPEG/PNG 开头的文件 | 只有 150×150 缩略图和 `wxgf`，没有原图 |

六条路都在回答同一个问题：「key 存在哪里」。而正确答案是**它不存在于任何地方**——每次用的时候现算。所以钩子抓不到（不走 CommonCrypto，`wechat.dylib` 里 AES 是静态链接的）、内存扫不到（不常驻，也不进任何库表）、数据库里也没有。

顺带一条工程教训：`lldb` 的条件断点（`$x4 == 16`）在 arm64 上不可用，JIT 表达式求值会卡在 `Couldn't materialize` 死循环，比无条件断点更糟——微信会卡到点不开图片。这轮排查里我确实把微信搞卡死过，别再走一遍。

#### 落地时必要的两件事

**解出来就落盘。** 按图片内容 md5 命名存明文 JPEG，放 `data/cache/images/`。理由不只是省 CPU：原图会被微信清理，key 也会随登录轮换，缓存是唯一能跨过这两件事的东西。

**启动时自检。** 拿当前算出来的 key 试解几张真实 `.dat`，一张都解不开就明确报「密钥推导失败」，而不是静默返回灰色占位。这个坑很费时间——页面上一片灰，你分不清是没图、没 key、还是 key 错了。判定条件也要收紧到「解出来以 `FFD8FF` 开头」：AES-ECB 没有完整性校验，错 key 也会吐出一堆字节，看起来很正常。

#### 云端那条路，实测到这里为止

既然本地能算，为什么还要云端？因为本地没有的图（没下载、被清理）只能问 CDN。测下来的边界很清楚：

- **表情（`<emoji cdnurl="…">`）：可以。** XML 里给的是完整 URL，带 `storeid`/`ef`/`bizid`，服务器不校验登录态，直接 GET 就是明文 PNG。这条路我把 47 张表情全部拉下来了
- **聊天原图（`<img cdnthumburl="305f0201…">`）：不行。** XML 只给 hex 编码的 filekey，没有 URL，也没有签名参数。`vweixinf`/`wxapp`/`szc.y` 三个 host、`262/20304` 与 `110/20401` 两种路径、`filekey`/`encfilekey`/`m` 三种参数名拼下来，**全是 400**。它需要客户端在发消息时拿到的那份 token，本机数据里没有

所以工作台里的策略是：本地优先，云端只在「消息里本来就带完整直链」时生效，拿不到就明确标 `unavailable`，不假装成功。诚实报缺，比给个灰块强。


---

## 步骤八：导出明文并读数据

### 8.1 导出明文副本

**不要**在源库上直接操作，也不要 `VACUUM INTO` 到原目录。用 `sqlcipher_export` 导到自己的目录：

```bash
SRC=~/Library/.../wxid_xxx/db_storage/session/session.db
DST=~/proj/data/plain/wxid_xxx/session/session.db
mkdir -p "$(dirname "$DST")"
```

派生 + 导出（Python 里做，避免手算出错）：

```python
import hashlib, pathlib, shutil, subprocess

def export_plain(src: pathlib.Path, dst: pathlib.Path, pw: bytes):
    salt = src.read_bytes()[:16]
    raw  = hashlib.pbkdf2_hmac("sha512", pw, salt, 256000, dklen=32).hex()
    dst.parent.mkdir(parents=True, exist_ok=True)
    if dst.exists():
        dst.unlink()
    sql = (
        f'PRAGMA key = "x\'{raw}\'";\n'
        f"ATTACH DATABASE '{dst}' AS plaintext KEY '';\n"
        "SELECT sqlcipher_export('plaintext');\n"
        "DETACH DATABASE plaintext;\n"
    )
    r = subprocess.run([shutil.which("sqlcipher"), str(src)],
                       input=sql, capture_output=True, text=True, timeout=300)
    ok = r.returncode == 0 and dst.exists() and dst.stat().st_size > 0
    print(("✅ " if ok else "❌ ") + str(dst))
    if not ok:
        print((r.stdout or "") + (r.stderr or ""))
    return ok
```

导出后验证是明文：

```bash
xxd -l 16 data/plain/wxid_xxx/session/session.db
# 00000000: 5351 4c69 7465 2066 6f72 6d61 7420 3300  SQLite format 3.
```

源库的 mtime 不变就复用旧副本，别每次同步都重导一遍（19 个库导一次要几秒）。

### 8.2 表结构（微信 4.1.13 / macOS 实测）

```text
session/session.db   → SessionTable(username, type, unread_count, summary,
                                     last_timestamp, sort_timestamp, last_msg_type)
contact/contact.db   → contact(username, nick_name, remark, alias, local_type)
message/message_N.db → Name2Id(user_name, is_session)
                     + Msg_<md5(username)>
                       (local_id, server_id, local_type, real_sender_id,
                        create_time, message_content)
```

:::warning
`Name2Id` 的列名是 **`user_name`**，而 `contact` 表用的是 `username`。两张表的命名不一致，写成 `username` 时 `SELECT` 会抛 `no such column`——如果你把异常吞掉（返回空字典），表现就是「消息读出来了但发送者全是空」，很难联想到列名。用 `PRAGMA table_info` 确认一下最省事：

```bash
sqlite3 db.sqlite "PRAGMA table_info(Name2Id);"
```
:::

先看有哪些表：

```bash
sqlite3 data/plain/wxid_xxx/session/session.db ".tables"
sqlite3 data/plain/wxid_xxx/message/message_0.db ".tables"
```

消息库的表名有两类，别混：

```text
Msg_4d2d6325778735d137548eb5445c745c              ← 主表，消息在这
Msg_4d2d6325778735d137548eb5445c745c_SENDERID     ← 索引表，只有 id
Msg_4d2d6325778735d137548eb5445c745c_SERVERID
Msg_4d2d6325778735d137548eb5445c745c_SORTSEQ
Msg_4d2d6325778735d137548eb5445c745c_TYPE_SEQ
```

用 `LIKE 'Msg_%'` 筛表会把索引表一起捞出来，对它们查 `message_content` 会报列不存在。判断主表：

```sql
SELECT name FROM sqlite_master
WHERE type='table' AND name LIKE 'Msg_%'
  AND name NOT LIKE '%_SENDERID' AND name NOT LIKE '%_SERVERID'
  AND name NOT LIKE '%_SORTSEQ'  AND name NOT LIKE '%_TYPE_SEQ';
```

消息表名不是 `Msg_1`、`Msg_2`，而是 **`Msg_<md5(会话 username)>`**。验证一下：

```bash
echo -n "44964857002@chatroom" | md5
# 输出就是某个 Msg_ 后缀
```

同库里的 `Name2Id` 负责把 `real_sender_id` 还原成 wxid：

```bash
sqlite3 data/plain/wxid_xxx/message/message_0.db "SELECT rowid, user_name FROM Name2Id;"
# 1|44964857002@chatroom|1
# 2|wxid_vq1vikkrc0jr19|0
# 3|wxid_pun4qlbtoyhl12|0
# 4|wxid_nhpjjmcfh0x422|1
# 5|48886366695@chatroom|1
```

### 8.3 读会话

```bash
sqlite3 -header -column data/plain/wxid_xxx/session/session.db \
  "SELECT username, type, unread_count, sort_timestamp FROM SessionTable ORDER BY sort_timestamp DESC LIMIT 10;"
```

本机实际输出：

```text
username              type  unread_count  sort_timestamp
--------------------  ----  ------------  --------------
48886366695@chatroom  0     0             1793070186
wxid_nhpjjmcfh0x422   0     0             1793069959
44964857002@chatroom  0     0             1793068999
brandsessionholder    0     0             0
```

`username` 后缀决定类型：`@chatroom` 群聊，`gh_` 公众号，其余单聊。最后那行 `brandsessionholder` 是服务号占位，不是真会话，入库时过滤掉。

`SessionTable` 里只有 username，**没有可读名字**。名字要从 `contact` 表取，优先级是「备注 > 昵称 > username」：

```bash
sqlite3 data/plain/wxid_xxx/contact/contact.db \
  "SELECT username, remark, nick_name FROM contact WHERE username='wxid_nhpjjmcfh0x422';"
```

```python
def display_name(sid, contacts):
    c = contacts.get(sid) or {}
    return (c.get("remark") or c.get("name") or sid).strip()
```

`contact` 表里 3260 条记录不代表 3260 个好友，群成员、公众号、已删除的联系人都在这张表里。按 `local_type` 和 `delete_flag` 能再筛，但做展示用途时直接用备注兜底 username 就够。

### 8.4 消息内容是 zstd 压缩的

`message_content` 直接读出来是二进制：

```bash
sqlite3 data/plain/wxid_xxx/message/message_0.db \
  "SELECT hex(message_content) FROM Msg_xxx LIMIT 1;"
```

```text
28B52FFD28B52FFD6807...
```

`28 B5 2F FD` 是 **zstd** 的 magic number（RFC 8878）。解压后：

```text
wxid_nhpjjmcfh0x422:<msg><img aeskey="..." .../></msg>
```

群聊消息带 `<发送者 wxid>:` 前缀，单聊直接是 XML 或纯文本。

完整读取脚本：

```python
import re, zstandard
from xml.etree import ElementTree as ET

SENDER = re.compile(r"^([a-zA-Z0-9_@\-]{3,64}):\s*(<[\s\S]*)$")

def decode(blob: bytes, local_type: int):
    if blob[:4] == b"\x28\xb5\x2f\xfd":
        blob = zstandard.ZstdDecompressor().decompress(blob, max_output_size=8 << 20)
    body = blob.decode("utf-8", "replace")
    sender = ""
    m = SENDER.match(body)
    if m:
        sender, body = m.group(1), m.group(2)
    return sender, parse_xml(body)

def parse_xml(xml: str):
    root = ET.fromstring(xml)
    if root.tag == "msg" and len(root):   # <msg> 只是外壳
        root = root[0]
    if root.tag == "img":      return "image",  "[图片]"
    if root.tag == "voicemsg": return "voice",  "[语音]"
    if root.tag == "videomsg": return "video",  "[视频]"
    if root.tag == "emoji":    return "sticker","[表情]"
    if root.tag == "appmsg":
        t = (root.findtext("type") or "").strip()
        title = (root.findtext("title") or "").strip()
        if t in ("6", "19", "74"): return "file", title or "[文件]"
        if t == "5":               return "link", title or "[链接]"
        return "appmsg", title or "[卡片消息]"
    return "text", "".join(root.itertext()).strip()
```

`local_type` → 类型：

| local_type | 含义 |
|---|---|
| 1 | 文本 |
| 3 | 图片 |
| 34 | 语音 |
| 42 | 名片 |
| 43 | 视频 |
| 47 | 表情 |
| 48 | 位置 |
| 49 | appmsg（看 XML 里的 `<appmsg type>` 再细分） |
| 10000 / 10002 | 系统消息 |

`local_type=49` 只是外壳，真正的类型在 XML：`<type>6</type>` 文件、`<type>5</type>` 链接、`<type>19</type>` 合并转发。

### 8.5 四个会静默丢数据的解析细节

**`message_content` 不一定是 bytes。** 多数行是 BLOB（zstd），但少数行存成了 TEXT（未压缩的纯文本）。`sqlite3` 对 BLOB 返回 `bytes`、对 TEXT 返回 `str`，同一列混着两种类型，直接 `.decode()` 就会在跑到第 N 条时炸掉整轮同步：

```text
AttributeError: 'str' object has no attribute 'decode'
```

入口处先归一：

```python
def _decompress(blob) -> bytes:
    if not blob:
        return b""
    if isinstance(blob, str):
        blob = blob.encode("utf-8", "replace")
    if blob[:4] == b"\x28\xb5\x2f\xfd":
        import zstandard
        return zstandard.ZstdDecompressor().decompress(blob, max_output_size=8 << 20)
    return blob
```

**`<msg>` 是外壳。** 类型信息在第一个子元素上，不往下走一层就永远解析成 `text`：

```python
root = ET.fromstring(xml)
if root.tag == "msg" and len(root):
    root = root[0]
```

**发送者前缀要允许冒号后换行。** 第一版我写的是：

```python
SENDER_PREFIX = re.compile(r"^(\w{3,64}):(<.*)$")       # 错
```

`wxid_xxx:\n<msg>...` 这种带换行的整条丢成空文本。改成：

```python
SENDER_PREFIX = re.compile(r"^([a-zA-Z0-9_@\-]{3,64}):\s*(<[\s\S]*)$")
```

**`real_sender_id` 只在群聊里可靠。** 单聊消息的发送者往往指向自己，别指望靠它区分谁说的。本机数据里三个会话的分布：

```text
Msg_4d2d6325778735d137548eb5445c745c  real_sender_id=3  × 3   群「537宿舍」
Msg_c8240d30f153962341a163f0d35444bb  real_sender_id=2  × 8   私聊「sin.」
Msg_0ab0e3720f4010a0422d8c606497c4af  real_sender_id=2  × 8   群「研究院学生总群」
```

`2` 是当前账号自己（`Name2Id` rowid=2 → `wxid_vq1vikkrc0jr19`），`3` 是群里的陈业成。所以群聊的发送者可以靠 `real_sender_id` 还原，单聊里对方的信息得靠会话本身，不要在消息行上找。

**发送者前缀要允许冒号后换行。** 第一版我写的是：

```python
SENDER_PREFIX = re.compile(r"^(\w{3,64}):(<.*)$")       # 错
```

`wxid_xxx:\n<msg>...` 这种带换行的整条丢成空文本。改成：

```python
SENDER_PREFIX = re.compile(r"^([a-zA-Z0-9_@\-]{3,64}):\s*(<[\s\S]*)$")
```

本机跑通后的实际结果：

| 会话 | 类型 | 消息数 | 发送者 |
|---|---|---|---|
| 537宿舍 | 群聊 | 3 | 陈业成（`wxid_pun4qlbtoyhl12`） |
| sin. | 私聊 | 8 | 自己 |
| 研究院学生总群 | 群聊 | 8 | 自己 |

合计 3 个会话、19 条消息、3260 个联系人。消息少是因为这个号用得不多。

---

## 步骤九：恢复 SIP

数据已经解密完了，密钥也存下来了。恢复 SIP 不影响后续使用——同步只是读文件 + 用已保存的密码解密，不需要再碰进程。

关机 → 长按电源键进恢复模式 → 工具程序 → 终端：

```bash
csrutil enable
```

确认后 `reboot`。回到桌面检查：

```bash
csrutil status
# System Integrity Protection status: enabled.
```

确认微信本身完好：

```bash
codesign -dv /Applications/WeChat.app 2>&1 | grep flags
# flags=0x10000(runtime)     ← 和最开始一致，说明没被改过
pgrep -x WeChat
```

---

## 步骤十：把它变成一个能重复跑的流程

一次性脚本留在终端历史里没意义。要变成能用的东西，三件事必须工程化。

### 10.1 抓取不能阻塞 HTTP 请求

抓密钥要等用户登录，可能几分钟。写成同步接口会让前端一个请求挂死。改成后台任务 + 轮询：

```text
POST /keys/capture        → 立即返回 {id, state: "running"}
GET  /keys/capture/{id}   → {state, phase: "已附加，请现在登录", result}
```

前端 1.5 秒轮询，把 `phase` 显示出来。用户能看到「正在等登录」，而不是一个转圈的按钮。

### 10.2 派生结果必须缓存

单次 PBKDF2-SHA512 × 256000 轮在 M2 上实测 **54.6 ms**。19 个库每次都重算就是 1 秒出头，每个接口调用都付一遍这个成本，体验会明显变差：

```python
from functools import lru_cache

@lru_cache(maxsize=512)
def derive_cached(password_hex: str, salt_hex: str) -> str:
    dk = hashlib.pbkdf2_hmac("sha512", bytes.fromhex(password_hex),
                             bytes.fromhex(salt_hex), 256000, dklen=32)
    return dk.hex()
```

### 10.3 账号遍历不能想当然

`accounts[0]` 不一定是你要的号。第一版代码取第一个，正好撞上打不开的旧号，白跑 17×21 次 PBKDF2。正确做法：遍历所有账号，每个账号**只用最小的库**当试金石：

```python
for acct in accounts:
    dbs = [d for d in list_dbs(acct) if d.encrypted]
    dbs.sort(key=lambda d: d.size)       # 小库先试，命中快
    probe = dbs[0]
    for pw in candidates:
        if verify(probe.path, pw):
            return acct, {d.rel: pw for d in dbs if verify(d.path, pw)}
```

---

## 踩坑清单

按浪费时间的程度排序。

1. **`not a database` 不等于密码错。** 先确认自己用的是「密码模式」还是「raw key 模式」，再怀疑密钥。这一步卡得最久，代价是重抓两次。
2. **断点解析成功 ≠ 会命中。** `otool -L` 先看依赖。静态链接 + strip 的框架（WCDY）会让系统库上的断点全程沉默。
3. **改签名在 macOS 26 上是死路。** App Management 拦原地改，沙盒拦 ad-hoc 副本，`containermanagerd` 拦跨 Team 签名。别在这上面花时间。
4. **优先 hook 算法函数，不是业务函数。** `CCKeyDerivationPBKDF` 是系统符号，跨版本比微信内部函数稳定。Linux 上对应 `EVP_BytesToKey` / `PKCS5_PBKDF2_HMAC`，Windows 上是 `bcrypt` 系列。
5. **`sqlcipher` CLI 会把参数里的 `;` 当语句分隔符。** SQL 一律走 stdin，别拼命令行。
6. **`stop-on-sharedlibrary-events` 不能忘。** 忘了就等不到命中，看起来像「钩子没生效」。
7. **每个账号、每个库的密钥都不同。** 同一个密码在 19 个库上派生 19 个不同 raw key，这是设计如此，不是出错。
8. **`message_content` 是压缩的。** 看到 `28 B5 2F FD` 就上 zstd，不要试图当文本读。
9. **同一列可能混着 BLOB 和 TEXT。** 少数行没压缩、直接存成 TEXT，`sqlite3` 返回 `str`，`.decode()` 当场炸。入口处 `isinstance(blob, str)` 归一。
10. **`Name2Id` 的列是 `user_name`，`contact` 表是 `username`。** 写错再加上异常被吞，症状是「消息有了但发送者全空」，很容易误判成数据缺失。

---

## 最后

真正难的不是「解密」。SQLCipher 是开源标准实现，`sqlcipher_export` 一行就能把库转成明文。难的是拿到那 32 个字节，以及**搞对它到底是什么**。

拿到它的过程，本质上是在和 macOS 的代码完整性机制对话：`taskgated` 认 entitlement，`containermanagerd` 认 Team ID，沙盒认容器身份，SIP 兜底。每条拒绝背后都有明确的设计意图，理解了才知道哪条是死路、哪条只是要等一个时机。

最后重申边界：数据是你自己的，机器是你自己的，也仅限如此。这套流程建立在「本机已登录」的前提上，任何试图把它变成远程工具的想法都是另一个问题——那个问题不该用技术解决。

---

**参考**

- SQLCipher：`PRAGMA key` / `sqlcipher_export` 官方文档
- Apple：`taskgated(8)`、`csrutil(1)`、Code Signing Guide 中的 `get-task-allow`
- CommonCrypto：`CCKeyDerivationPBKDF`（`<CommonCrypto/CommonKeyDerivation.h>`）
- zstd 帧格式：RFC 8878
