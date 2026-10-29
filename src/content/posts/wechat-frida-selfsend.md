---
title: "让脚本自己发微信消息：frida 绕开界面与一次性对象的完整实现"
published: 2026-10-29
description: 不模拟按键、不替换你发的内容、不需要先手动发一条预热。用 frida 借一条微信自己的 mars 任务当壳，把 522 任务模板、请求对象和 protobuf 正文逐层塞进去，由微信自己完成组包、加密和投递。含 4.1.12 完整地址表、protobuf 手工编码、四个注入点、六条踩坑记录，以及可单独运行的入口脚本全文。
tags:
  - macOS
  - 逆向
  - frida
  - 微信
  - protobuf
category: 技术
slug: wechat-frida-selfsend
comment: true
---

目标只有一句话：跑一条命令，微信把消息发出去。

```bash
python3 wxsend.py "hello"              # 发到文件传输助手
python3 wxsend.py "hello" wxid_xxxxx   # 发给指定收件人
```

跑通时的输出：

```
[*] 等待载体任务（后台流量，通常几秒）...
[*] 载体就绪 0x7ff0cf880，开始发送
[+] 发送文本消息成功! Req2Buf 已将 X24+0x60 指向新地址
[+] BLR X8 命中! taskId=536873386 sendMsgType=text
[+] autoBufferWrite 调用完成, protobuf长度: 102
[+] buf2resp: 收到响应, taskId=536873386 len=59
[OK] 结果=1  服务端响应=True
```

最后一行的 `len=59` 是服务端真实返回的报文长度，这是判断“真的发出去了”的唯一硬证据。中间几条日志分别是四个注入点各自命中一次。

**实测环境**

| 项 | 值 |
|---|---|
| 机器 | MacBook Air M2（arm64） |
| 系统 | macOS 26.7.1 |
| 微信 | 4.1.12（build 269365，非 App Store 版） |
| frida | 17.x（Python 绑定） |
| 业务库 | `WeChat.app/Contents/Resources/wechat.dylib` |

**边界**：只处理本机、自己已登录的账号；只在发送瞬间改写入站缓冲区里那一条报文的正文；不替换你手动发出的消息，不改微信文件，不改签名，不碰 mmtls 密钥。发出去的消息在服务端看来与客户端自己发的完全一致。

---

## 一、先排除的几条路

在写出上面那 100 行之前，有四条路被逐个试死。列出来是因为它们看起来都比最终方案“正规”。

**V8 注入**。微信 4.x 的 UI 是 Chromium Views（`QNSWindow` → `FlueEmbeddedWindow`），渲染层跑在内嵌浏览器里。但业务对象（会话、消息、mars 服务）全在原生的 `wechat.dylib` 里，V8 里拿不到它们的引用。这条路只能做 UI 层面的自动化，等于绕回模拟点击。

**改写出站报文**。这个能成，而且验过：手机端收到过 60 个 A，任意长度、任意收件人。但它需要一个载体——你先手动发一条，脚本把那条的正文换掉。这正是“替换”，不符合目标。

**辅助触控 / 定向键盘事件**。`CGEventPostToPid` 能把按键送进微信窗口，实测可用。但它依赖界面状态：微信没在前台、会话没打开、输入框没焦点，全都发不出去。属于自动化，不属于“脚本自己发”。

**直接调微信的发送函数**。4.1.13 上找到了会话对象的发送虚方法（`base+0x2dabe84`，签名 `(this, shared_ptr<报文>)`），frida 调它能真的生成第二个 `newsendmsg` 任务。但三个变体全部崩在同一个地方：

```
手动发送：session+8 = { service=0x7fad5c8e8, ctx=0x7fb71e328, ... }
重放：    session+8 = { 0x64c150, 0, 0, 0, ... }      ← 发完即被清空
```

`service` 还能自己从单例取到（`0x4304070()` → `vt[0x18]()`，返回值和真实发送时完全一致），但 `ctx` 是每次发送现造的会话上下文，函数一返回就被清掉。拿旧指针去调，必然解引用已释放内存。

**4.1.13 的发送链里，从会话到报文全是这种一次性对象**。这就是为什么必须先退一步。

---

## 二、退到 4.1.12

退版本不是为了省事，是因为两个版本对“任务”的要求根本不同。

4.1.13 的业务库以 rwx 匿名映射加载（在容器 `Magicdy/874/extracted/wechat.dylib` 里），不进 dyld 的 image list，虚表和跳转在加载期被重定位过，静态 xref 全是 0 命中。4.1.12 的 `wechat.dylib` 是正常 dyld 模块，`enumerateModules()` 能直接看到，基址和文件偏移一一对应，反汇编结果可信。

更关键的是投递时的差别。4.1.12 的路径是：

```
MMStartTask(manager, task)
  → [manager+0x18] 取 service
  → service->Send(service, task)
  → service+0x60 的映射表里查 taskId
```

查不到就直接崩（`access violation accessing 0x191`）。而唯一会往这张表里登记的，是会话对象那条路径：

```
0x413db60(service, msg)
  node = new(0x30)
  node+0x20 = taskId
  node+0x28 = msg            ← msg 被指针引用，不是拷贝
  插入 map[service+0x60]     ← 登记
```

所以自己造 task 再调 `MMStartTask`，永远缺这一步。想补这一步，就得把 msg 对象的完整布局和生命周期都复刻出来——msgsource、内嵌子对象、虚表长度，一样不能少。

而这条路可以完全绕开：**不造任务，借一条现成的**。

---

## 三、借壳

微信后台一直在跑 mars 任务：心跳、同步、上报，每隔几秒就有一条。这些任务对象的结构和发送任务同源，都是 0x198 到 0x1a0 字节的通用壳，区别只在 `+0x04` 的 cmdId。

方案由此变成三步：

1. 挂住 `MMStartTask`，抓一条**任意**任务的 `x0`（manager）和 `x1`（task 指针），记下捕获序号；
2. 把 `x1` 指向的对象内容改写为 522（newsendmsg）任务模板，换一个新 taskId，调用 `MMStartTask` 投递；
3. 在组包和编码两个位置，把微信要写的请求对象和正文换成自己的。

任务对象是微信自己造的、已经在它自己的表里、生命周期由它管理——我们只是改写了内存内容再让它重投一次。这一层不涉及对象构造，所以不会崩。

### 四个注入点

| 位置 | 偏移（4.1.12） | 做什么 |
|---|---|---|
| `MMStartTask` | `0x53e4ecc` | 抓载体：`x0`=manager，`x1`=task |
| `req2buf` 入口 | `0x413e9b4` | `x1`=taskId，`x24+0x60` 换成自己的消息对象 |
| `blr x8` | `0x413ea34` | `x20`=taskId，`x1`=AutoBuffer，写入自己的 protobuf |
| `AutoBuffer::Write` | `0x4165368` | 校验用：确认正文确实进了报文缓冲 |
| `buf2Resp` | `0x4163f4c` | 校验用：服务端响应到达 |

`req2buf` 那一步是整套方案的关键。反汇编看得很清楚：

```asm
0x413ea1c  ldr x0, [x23, #0x28]    ; 取消息对象
0x413ea24  ldr x8, [x8, #0x10]     ; 取虚方法 [0x10]
0x413ea38  blr x8                  ; 编码——正文在这里才产生
```

`x24+0x60` 就是那个“消息对象”的槽位。把指针换成自己的，接下来的编码调用流就会跑到我们准备的对象上。

### 522 任务模板

模板不必推导，直接从一次真实发送里整块抓 0x1a0 字节，实测**完全自包含**：没有任何外部指针，`+0x04` 是 cmdId=522，`+0x68` 内联 `"default-longlink"` 共 18 字节，`+0xb8` 和 `+0x190` 两个自指字段指向自身 +0xc0 / +0x198。

文本消息只改四个字节：

```python
t[0]  = 0x0A; t[1]  = 0x02     # +0x00 附近
t[16] = 0x01                    # +0x10
t[28] = 0x20                    # +0x1c
t[92] = 0x0A; t[93] = 0x02     # +0x5c
```

每次发送前在最前面写 4 字节新 taskId，两个自指字段按新地址重算，就能用一次。

---

## 四、正文：手写 protobuf

编码调用被我们的对象接管后，内容完全由脚本提供。正文格式是标准 protobuf，一次真实发送抓下来就定型了：

```
08 01 12 <len>
  0a 0c 0a 0a "filehelper"
  12 08 "testbody"
  18 01
  20 <timestamp>
  28 <msgid>
  32 32 "<msgsource><alnode><fr>1</fr></alnode></msgsource>"
```

含一个 102 字节的实例，字段含义：`08 01` 是协议版本，`12` 是消息体，内层 `0a` 是收件人（再套一层 `0a` 包长度）、`12` 是正文、`18` 是消息类型、`20` 是时间戳、`28` 是消息 ID、`32` 是设备来源。

编码只用 varint，不需要 protobuf 库：

```python
def varint(n):
    o = bytearray()
    while n >= 128:
        o.append((n & 0x7f) | 0x80); n //= 128
    o.append(n); return bytes(o)

def build_proto(to, text):
    r = to.encode(); c = text.encode()
    b  = b'\x0a' + bytes([len(r)+2]) + b'\x0a' + bytes([len(r)]) + r
    b += b'\x12' + varint(len(c)) + c
    b += b'\x18\x01\x20' + varint(int(time.time()))
    b += b'\x28' + varint(int.from_bytes(os.urandom(4), 'little') & 0xfffffff)
    ms = b'<msgsource><alnode><fr>1</fr></alnode></msgsource>'
    b += b'\x32' + varint(len(ms)) + ms
    return (b'\x08\x01\x12' + varint(len(b)) + b).hex()
```

收件人就是这个字符串。换会话不用换代码，只换参数——`filehelper`、`wxid_xxxxx`、`12345678@chatroom` 都走同一条路径。实测发给一个好友时服务端响应是 68 字节，发给文件传输助手是 59 字节，长度不同正好说明收件人字段被服务端认了。

---

## 五、载体过期与重试

这套方案唯一不稳的地方是载体。

`MMStartTask` 抓到的是一条正在被投递的任务，它属于某次后台请求。抓得太意外味着：等你准备好正文，那个任务可能已经被回收，或者已经走完了组包。这时在 `req2buf` 里改写 `x24+0x60`，取到的就是一片已经不归你管的内存：

```
access violation accessing 0x22
```

修法是两条，都在 `wxsend.py` 里：

**抓到即刻发**。脚本不去“等一个任务然后慢慢准备”，而是记一个捕获序号，一旦发现序号变大就立刻用当前这条发，把两次操作压到毫秒级。序号通过 `trigger_seq()` 从 frida 侧读出来，`wxsend.py` 用 0.1 秒的间隔轮询。

**失效自动换壳**。返回不是 `1` 就换下一条载体重试，最多四次。第一次失败很常见，第二次基本就成。日志里会看到：

```
    第 1 次载体失效，换一个重试
```

这也解释了为什么“先等后台任务再发”能成立：微信空闲时也一直有流量，通常几秒内就有新任务，不需要你先发一条预热消息。

---

## 六、六条踩过的坑

| 现象 | 原因 | 处理 |
|---|---|---|
| 所有偏移全错，读出来是别的指令 | `~/Applications/WeChat.app` 被 Sparkle 自动更新到 4.2.0 | 重装 4.1.12，`defaults write com.tencent.xinWeChat SUAutomaticallyUpdate -bool false` |
| 脚本加载后 `baseAddr` 指向主可执行文件 | 上游脚本默认取 `MacOS/WeChat`，但函数在 `wechat.dylib` 里 | 改成按 `Resources/wechat.dylib` 匹配 |
| 后续 attach 全部卡死超时 | 前一次 frida 会话被 kill，留下 `frida-helper` 进程占着注入点 | 先 `kill -9` 所有 helper，再重启微信 |
| 崩在 `pc=0x173665540 udf #0x1e` | 自建虚表只拷了 0x80 字节，实际至少 0x178，后面的槽位读到堆数据 | 放弃换虚表，改用微信自己的对象，只换正文 |
| 重放发送入口的旧参数让微信直接退出 | 参数指向栈上临时对象，函数返回即失效 | 不做参数重放；只借任务对象，不借调用参数 |
| 一次只能发一条 | 复用了同一个 taskId | 每次 `0x20000000 + (时间戳毫秒 & 0xffff)` |

前三条是环境问题，后三条是理解问题。第 4 条当时用 lldb 才看清——frida 把异常包装成 JS 错误，拿不到出错指令：

```bash
lldb -p $PID -b -o "process continue" -o "bt" -o "register read x19 x20 x21"
```

崩在 `coroutine` 线程，`pc` 落在堆地址上，指向的字节是 `udf #0x1e`。这就是虚调用跳飞了的典型样子。

---

## 七、连发与复用

一次载体能发多条吗？能，但要换 taskId。

实测连发三条（`multi-1/2/3`），每条都有服务端响应：

```
第 1 条 multi-1 taskId=0x20000091 → BLR命中 → 响应 len=59
第 2 条 multi-2 taskId=0x20000092 → BLR命中 → 响应 len=59
第 3 条 multi-3 taskId=0x20000093 → BLR命中 → 响应 len=59
```

同一个 taskId 复用会冲突——微信的映射表以 taskId 为键，重复插入会覆盖前一条的 msg 节点。

---

## 八、限制

**只对 4.1.12 有效**。地址表来自 `wechat_version/4_1_12_53_mac.json`，换版本必须重找。4.1.13 的链完全不同（协程 + 一次性上下文），这套思路平移不过去。

**依赖 frida 注入**。要求微信进程可 attach，SIP 关闭或对微信签名做处理。这在 macOS 上是前提条件，绕不过。

**任务模板来自抓包**。模板里那些非零字节是真实发送时微信填的，含义没有逐字段验证。换账号、换版本后如果发现发不出去，先把模板重抓一次。

**不要拿去群发**。发送由微信自己完成，服务端看到的是正常客户端行为，但频率过高仍然会触发风控。这个是账号风险，不是技术问题。

---

## 附：wxsend.py 全文

```python
#!/usr/bin/env python3
"""wxsend.py —— 脚本直接发微信文本（无需界面操作、无需你先发消息）

用法:
    python3 wxsend.py "内容"            # 默认发到文件传输助手
    python3 wxsend.py "内容" wxid_xxx   # 发到指定 wxid

原理（4.1.12）:
    复用 mars 任务对象：等一个后台任务当载体，把 522 任务模板写进去，
    在 req2buf 把请求对象换成自己的，在 blrX8 处写入自己的 protobuf 正文。
"""
import os, sys, time, struct, subprocess
import frida

HERE = os.path.dirname(os.path.abspath(__file__))


def varint(n):
    o = bytearray()
    while n >= 128:
        o.append((n & 0x7f) | 0x80); n //= 128
    o.append(n); return bytes(o)


def build_proto(to, text):
    r = to.encode(); c = text.encode()
    b  = b'\x0a' + bytes([len(r)+2]) + b'\x0a' + bytes([len(r)]) + r
    b += b'\x12' + varint(len(c)) + c
    b += b'\x18\x01\x20' + varint(int(time.time()))
    b += b'\x28' + varint(int.from_bytes(os.urandom(4), 'little') & 0xfffffff)
    ms = b'<msgsource><alnode><fr>1</fr></alnode></msgsource>'
    b += b'\x32' + varint(len(ms)) + ms
    return (b'\x08\x01\x12' + varint(len(b)) + b).hex()


def build_payload(taskid):
    t = bytearray(open(os.path.join(HERE, 'payload_text.bin'), 'rb').read())
    t[0] = 0x0A; t[1] = 0x02; t[16] = 0x01; t[28] = 0x20; t[92] = 0x0A; t[93] = 0x02
    return (struct.pack('<I', taskid) + bytes(t)).hex()


def wechat_pid():
    out = subprocess.run(['pgrep', '-f', 'WeChat.app/Contents/MacOS/WeChat$'],
                         capture_output=True, text=True).stdout.split()
    return int(out[0]) if out else None


def main():
    if len(sys.argv) < 2:
        print(__doc__); return 1
    content = sys.argv[1]
    target = sys.argv[2] if len(sys.argv) > 2 else 'filehelper'
    pid = wechat_pid()
    if not pid:
        print('[!] 微信没在运行'); return 1

    s = frida.attach(pid)
    sc = s.create_script(open(os.path.join(HERE, 'wx412-any.js'), encoding='utf-8').read())
    state = {'ok': False, 'resp': False}
    def on(m, d):
        p = m.get('payload')
        t = p.get('type') if isinstance(p, dict) else None
        if t == 'buf2resp':
            state['resp'] = True
            print('[+] 服务端返回，%d 字节' % len(p.get('data') or []))
        elif isinstance(p, str) and ('发送文本消息成功' in p or 'protoHex 为空' in p):
            print('[+] ' + p)
    sc.on('message', on)
    sc.load()

    print('[*] 等待载体任务（后台流量，通常几秒）...')
    last_seq = -1
    try: last_seq = sc.exports_sync.trigger_seq()
    except Exception: pass

    result = 'fail'
    for attempt in range(1, 5):
        # 等到“新”的一次捕获，然后立刻发（避免用过期的任务对象）
        got = False
        for _ in range(240):
            time.sleep(0.1)
            try: seq = sc.exports_sync.trigger_seq()
            except Exception: seq = last_seq
            if seq > last_seq:
                last_seq = seq; got = True; break
        if not got:
            print('[!] 60 秒内没有新任务'); break
        tid = 0x20000000 + ((int(time.time()) * 1000 + attempt) & 0xffff)
        proto = build_proto(target, content)
        payload = build_payload(tid)
        try:
            r = sc.exports_sync.trigger_send_text_message(tid, target, content, '', proto, payload)
        except Exception as e:
            print('[!] 第 %d 次调用异常: %s' % (attempt, e)); continue
        if r == '1':
            result = '1'
            break
        print('    第 %d 次载体失效，换一个重试' % attempt)
    for _ in range(20):
        time.sleep(0.25)
        if state['resp']: break
    print('[%s] 结果=%s  服务端响应=%s' % ('OK' if result == '1' else 'FAIL', result, state['resp']))
    time.sleep(0.5)
    try: s.detach()
    except Exception: pass
    return 0 if result == '1' else 1


if __name__ == '__main__':
    sys.exit(main())
```

同目录下还需要两个文件：`wx412-any.js`（渲染后的 frida 脚本，含四个钩子与 `trigger_send_text_message` 导出）和 `payload_text.bin`（412 字节的 522 任务模板）。两者都由上游 `wechat_chatter` 的 Go 模板 + 版本配置生成，模板字节从 `text_builder.go` 的 `payloadData` 里提取。
