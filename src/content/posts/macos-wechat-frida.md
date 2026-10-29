---
title: MacOS 微信逆向分析 - Frida（全文转写）
published: 2026-10-29
description: 用 Frida 对 Mac 版微信做二次开发：class-dump 出头文件、筛选类名定位 MessageService、hook 发送与监听消息，附 Hopper 伪代码与完整脚本。
tags:
  - 逆向
  - Frida
  - 微信
  - macOS
category: 逆向
author: 胡家二少
sourceLink: https://bbs.kanxue.com/thread-266041-1.htm
slug: macos-wechat-frida
comment: true
---

> 转载自看雪论坛，作者胡家二少，2021-02-15 发布、2022-01-25 更新。以下为全文转写，原文截图位置以 `[图]` 标注。

## 0. 前言

PC下的微信二次开发相信大家都会了，那么本篇文章将带领大家使用Frida框架对Mac下微信来进行二次开发！

PS：还有一种静态注入的方式也不错，但是考虑到大家xcode安装包太大就不在这里展开啦。

PS：frida如何去使用大家得自己去学，本文不过多展开。

PS：文章编写不易，转载请标注出处

PS：欢迎大家跟帖交流

主要功能涉及如下：

1. 微信消息发送
2. 微信消息监听

## 1. 微信版本

（原文此处为版本截图）[图]

## 2. 工具

预先善其事，必先利其器！请先准备如下分析工具

1. Hopper Disassembler
2. Class-dump
3. Frida
4. Pycharm（可选）
5. Vscode（可选）

## 3. Dump出头文件

首先利用Class-Dump拿到微信的头文件，打开终端执行：

```
class-dump -H /Applications/WeChat.app
```

成功执行之后会生成很多的头文件了，如下所示：

```
-rw-r--r--  1 n  staff   927B  2 15 19:19 WXCPbQcwxtalkPackage.h
-rw-r--r--  1 n  staff   975B  2 15 19:19 WXCPbReportItem.h
-rw-r--r--  1 n  staff   1.7K  2 15 19:19 WXCPbSCAddVoiceGroupMemberResp.h
-rw-r--r--  1 n  staff   772B  2 15 19:19 WXCPbSCCancelCreateVoiceGroupResp.h
-rw-r--r--  1 n  staff   7.2K  2 15 19:19 WXCPbSCCreateVoiceGroupResp.h
-rw-r--r--  1 n  staff   6.9K  2 15 19:19 WXCPbSCEnterVoiceRoomResp.h
-rw-r--r--  1 n  staff   1.1K  2 15 19:19 WXCPbSCExitVoiceRoomResp.h
-rw-r--r--  1 n  staff   1.2K  2 15 19:19 WXCPbSCModifyVoiceGroupInfoResp.h
-rw-r--r--  1 n  staff   872B  2 15 19:19 WXCPbSCSubscribeLargeVideoResp.h
-rw-r--r--  1 n  staff   867B  2 15 19:19 WXCPbSCSubscribeVideoResp.h
-rw-r--r--  1 n  staff   2.0K  2 15 19:19 WXCPbSCVoiceClientSceneReportResp.h
-rw-r--r--  1 n  staff   864B  2 15 19:19 WXCPbSCVoiceGetGroupInfoBatchResp.h
-rw-r--r--  1 n  staff   637B  2 15 19:19 WXCPbSCVoiceMemberWhisperResp.h
-rw-r--r--  1 n  staff   5.9K  2 15 19:19 WXCPbSCVoiceRedirectResp.h
-rw-r--r--  1 n  staff   1.1K  2 15 19:19 WXCPbSCVoiceRoomHelloResp.h
-rw-r--r--  1 n  staff   904B  2 15 19:19 WXCPbSKBuiltinBuffer_t.h
-rw-r--r--  1 n  staff   686B  2 15 19:19 WXCPbSubscribeVideoMember.h
-rw-r--r--  1 n  staff   2.7K  2 15 19:19 WXCPbSwitchVideoGroupResp.h
-rw-r--r--  1 n  staff   1.4K  2 15 19:19 WXCPbVideoGroupMember.h
-rw-r--r--  1 n  staff   671B  2 15 19:19 WXCPbVoiceClientScene.h
-rw-r--r--  1 n  staff   1.2K  2 15 19:19 WXCPbVoiceClientSceneExt.h
-rw-r--r--  1 n  staff   2.9K  2 15 19:19 WXCPbVoiceConf.h

# n @ localhost in ~/vscodewsp/wechat/dump [20:58:22]
$ ll |wc -l
    4922
```

## 4. 分析

首先那么多的文件我们肯定不能一个个的去看，那样效率太低。相信大家做开发为了自己好维护代码，肯定不会给对象随便命名为abc这种吧！但是我相信腾讯的程序员肯定不会这么做！微信核心的功能是啥？是发消息哦，那么消息的英文是啥？**Message**！对就是他。所以我们就先筛选下这个**Message**！

```
$ ll -l |grep Message|wc -l
     157
```

执行如上命令我们把文件数从 4922 个转变到 157 了，这样就缩小了范围啦！如何再次缩小范围呢？那么就得看大家的开发习惯啦，我一般做业务都喜欢写 service、controller 这种业务类名，于是我再次……

```
$ ll -l |grep Message|grep Service|wc -l
       9
$ ll -l |grep Message|grep Service
-rw-r--r--  1 n  staff   5.1K  2 15 19:19 FTSFileMessageService.h
-rw-r--r--  1 n  staff   382B  2 15 19:19 IMessageServiceAppExt-Protocol.h
-rw-r--r--  1 n  staff   980B  2 15 19:19 IMessageServiceFileExt-Protocol.h
-rw-r--r--  1 n  staff   381B  2 15 19:19 IMessageServiceFileReTransferExt-Protocol.h
-rw-r--r--  1 n  staff   755B  2 15 19:19 IMessageServiceImageExt-Protocol.h
-rw-r--r--  1 n  staff   780B  2 15 19:19 IMessageServiceVideoExt-Protocol.h
-rw-r--r--  1 n  staff   407B  2 15 19:19 IMessageServiceVideoReTransferExt-Protocol.h
-rw-r--r--  1 n  staff   3.1K  2 15 19:19 MMFTSMessageService.h
-rw-r--r--  1 n  staff    20K  2 15 19:19 MessageService.h
```

就剩 9 个文件了，一个个看也不碍事。最终定位到 **MessageService.h**，打开一看，果然！真是运气好！

你看这功能不就来了嘛？Send 开头的都是发送消息的函数。OK完事，那么就开始搞它！

```
- (id)SendLocationMsgFromUser:(id)arg1 toUser:(id)arg2 withLatitude:(double)arg3 longitude:(double)arg4 poiName:(id)arg5 label:(id)arg6;
- (id)SendNamecardMsgFromUser:(id)arg1 toUser:(id)arg2 containingContact:(id)arg3;
- (id)SendStickerStoreEmoticonMsgFromUsr:(id)arg1 toUsrName:(id)arg2 md5:(id)arg3 productID:(id)arg4;
- (id)SendEmoticonMsgFromUsr:(id)arg1 toUsrName:(id)arg2 md5:(id)arg3 emoticonType:(unsigned int)arg4;
- (id)SendImgMessage:(id)arg1 toUsrName:(id)arg2 thumbImgData:(id)arg3 midImgData:(id)arg4 imgData:(id)arg5 imgInfo:(id)arg6;
- (id)SendTextMessage:(id)arg1 toUsrName:(id)arg2 msgText:(id)arg3 atUserList:(id)arg4;
- (id)SendAppMusicMessageFromUser:(id)arg1 toUsrName:(id)arg2 withTitle:(id)arg3 url:(id)arg4 description:(id)arg5 thumbnailData:(id)arg6;
- (id)SendAppURLMessageFromUser:(id)arg1 toUsrName:(id)arg2 withTitle:(id)arg3 url:(id)arg4 description:(id)arg5 thumbnailData:(id)arg6;
- (id)SendAppURLMessageFromUser:(id)arg1 toUsrName:(id)arg2 withTitle:(id)arg3 url:(id)arg4 description:(id)arg5 thumbUrl:(id)arg6 sourceUserName:(id)arg7 sourceDisplayName:(id)arg8;
```

PS：其实分析时候还是挺费事的，但是大家自己多动手肯定能找到的！

## 5. Frida Hook 验证

为了验证自己的分析是不是正确的，我们得进行验证。怎么验证？frida 大法好！执行以下命令：

```
frida-trace -m "-[MessageService Send*]" 微信
```

```
$ frida-trace -m "-[MessageService Send*]" 微信
Instrumenting...
-[MessageService SendTextMessageWithString:toUser:]: Auto-generated handler at "/Users/n/vscodewsp/wechat/__handlers__/MessageService/SendTextMessageWithString_toUser_.js"
-[MessageService SendAppURLMessageFromUser:toUsrName:withTitle:url:description:thumbUrl:sourceUserName:sourceDisplayName:]: Auto-generated handler at "/Users/n/vscodewsp/wechat/__handlers__/MessageService/SendAppURLMessageFromUser_toUsrN_eaefd0af.js"
------------------------------------------------------------------------------
-[MessageService SendNamecardMsgFromUser:toUser:containingContact:]: Auto-generated handler at "/Users/n/vscodewsp/wechat/__handlers__/MessageService/SendNamecardMsgFromUser_toUser_c_b5899e8d.js"
Started tracing 18 functions. Press Ctrl+C to stop.
```

然后会在当前目录生成 **__handlers__** 文件夹，里面是 frida 为我们自动生成的 hook 脚本文件。我们使用微信发送一条消息试试。

然后终端会输出一条信息：

```
195323 ms  -[MessageService SendTextMessage:0x600000b6fae0 toUsrName:0x6503cfa934d442eb msgText:0x6000002ec860 atUserList:0x600000a73570]
```

这个就是触发了发送消息的 hook 信息啦。**SendTextMessage** 是不是跟我们在头文件信息里面看到的一样。

我们找到 handlers 文件夹下 **SendTextMessage** 这个 js 文件，试试修改 log 输出然后再执行：

```
frida-trace -m "-[MessageService Send*]" 微信
```

我们可以看到输出变啦：

```
2908 ms  -[我的消息测试 SendTextMessage:0x600000b6fae0 toUsrName:0x6503cfa934d442eb msgText:0x6722df8306c2767b atUserList:0x6000009c2760]
```

如此可以确定我们找到的函数就是发送消息的函数。那么看看能不能打印出自己发送的消息内容：

```objc
- (id)SendTextMessage:(id)arg1 toUsrName:(id)arg2 msgText:(id)arg3 atUserList:(id)arg4;
```

可以看到这个函数一共有 4 个参数：参数一暂时不知道；参数二 toUsrName，是消息发送给谁的；参数三 msgText 消息内容；参数四暂时不知道。

分别把这四个参数给打印出来试试！修改 js 文件：

```js
onEnter(log, args, state) {
    console.log(`-[我的消息测试 SendTextMessage:${args[2]} toUsrName:${args[3]} msgText:${args[4]} atUserList:${args[5]}]`);
    console.log("arg[1] -> " + new ObjC.Object(args[2]))
    console.log("arg[2] -> " + new ObjC.Object(args[3]))
    console.log("arg[3] -> " + new ObjC.Object(args[4]))
    console.log("arg[4] -> " + new ObjC.Object(args[5]))
},
```

然后执行 `frida-trace -m "-[MessageService Send*]" 微信` 发送一条消息：

[图]

```
arg[1] -> wxid_*****63i822
arg[2] -> filehelper
arg[3] -> 这个是消息测试
arg[4] ->

           /* TID 0x307 */
 14534 ms  -[我的消息测试 SendTextMessage:0x600000b6fae0 toUsrName:0x6503cfa934d442eb msgText:0x600000adefd0 atUserList:0x600000add470]
```

我们可以看到终端正确响应了，输出的正是我们发送的消息。那么我修改发送内容试试？？添加如下代码：

```js
args[4] = ObjC.classes.NSString.stringWithString_("MacOS微信分析")
```

然后微信发送任何消息，对方都将收到的是 MacOS微信分析：

[图]

这样我们就确定了发送文本消息的函数就是这个。那么我们如何主动调用它呢？

## 6. Hopper 分析程序代码

从上面的分析我们看到发送消息需要四个参数。第一个：通过分析应该是我们自己的微信 id；第二个：对方的微信 id；第三个：消息内容；第四个：可以为 null。

那么就打开 hopper 拖入微信具体分析吧。

应用程序 → 微信 → 显示包内容 → Contents → MacOS → WeChat，拖进 hopper 然后默认选项即可。

[图]

在左边输入 SendTextMessage 搜索，我们可以看到上面四个应该是我们所需要的，都打开看下伪代码。（我们分析需要找到函数调用的地方就能知道传参，然后再去分析参数是如何而来。那么除了函数定义地方代码，其余的都可以找到。）

**MMMessageSendLogic**：

这个伪代码看的就比较清楚了：

```objc
objc_unsafeClaimAutoreleasedReturnValue([[[r12 getService:[MessageService class]] retain] SendTextMessage:r15 toUsrName:r14 msgText:r13 atUserList:stack[-64]]);
```

我们可以看到第一个参数是 r15，往上追溯 r15：

```objc
r15 = [[rax CurrentUserName] retain];
```

r15 是这里赋值的，那么再看看 CurrentUserName 方法内容。可以看到是先判断是不是已经登录，然后调用 CUtility 类里面的 GetCurrentUserName 方法获得的：

```objc
-(void *)CurrentUserName {
    if ([self isLoggedIn] != 0x0) {
        rdi = [[CUtility GetCurrentUserName] retain];
    }
    else {
        rdi = 0x0;
    }
    rax = [rdi autorelease];
    return rax;
}
```

那么第一个参数我们就知道了。其余三个参数我们也很容易地可以手动构造。我们编写 js 脚本代码。

（完整 Hopper 伪代码 MMMessageSendLogic.sendTextMessageWithString:mentionedUsers: 如下：）

```objc
/* @class MMMessageSendLogic */
-(unsigned char)sendTextMessageWithString:(void *)arg2 mentionedUsers:(void *)arg3 {
    r14 = self;
    r15 = [arg2 retain];
    r12 = [arg3 retain];
    r13 = [[CUtility filterStringForTextMessage:r15] retain];
    [r15 release];
    if ([r13 length] != 0x0) {
            stack[-64] = r12;
            rax = [r13 lengthOfBytesUsingEncoding:0x4];
            rbx = rax;
            if (rax >= 0x4001) {
                    rax = [[NSString alloc] initWithFormat:@"ERROR: Text too long, length: %lu, utf8 length: %lu", [r13 length], rbx];
                    stack[0] = "-[MMMessageSendLogic sendTextMessageWithString:mentionedUsers:]";
                    [MMLogger logWithMMLogLevel:0x2 module:"ComposeInputView" file:0x103e0e162 line:0x112 func:stack[0] message:rax];
                    [rax release];
                    rax = [NSBundle mainBundle];
                    rax = [rax retain];
                    stack[-72] = rax;
                    r15 = [[rax localizedStringForKey:@"Message.Input.Too.Long.Title" value:@"" table:0x0] retain];
                    rax = [NSBundle mainBundle];
                    rax = [rax retain];
                    r14 = rax;
                    rax = [rax localizedStringForKey:@"Message.Input.Too.Long.Content" value:@"" table:0x0];
                    rax = [rax retain];
                    [NSAlert showAlertSheetWithTitle:r15 message:rax completion:0x0];
                    [rax release];
                    [r14 release];
                    [r15 release];
                    [stack[-72] release];
                    r14 = 0x0;
                    r12 = stack[-64];
            }
            else {
                    rax = [WeChat sharedInstance];
                    rax = [rax retain];
                    r15 = [[rax CurrentUserName] retain];
                    [rax release];
                    rax = [r14 currnetChatContact];
                    rax = [rax retain];
                    r14 = [[rax m_nsUsrName] retain];
                    [rax release];
                    r12 = [[MMServiceCenter defaultCenter] retain];
                    objc_unsafeClaimAutoreleasedReturnValue([[[r12 getService:[MessageService class]] retain] SendTextMessage:r15 toUsrName:r14 msgText:r13 atUserList:stack[-64]]);
                    [rax release];
                    [r12 release];
                    [r14 release];
                    [r15 release];
                    r14 = 0x1;
                    r12 = stack[-64];
                    r13 = r13;
            }
    }
    else {
            rax = [[NSString alloc] initWithFormat:@"ERROR: Text is empty, can't send"];
            stack[0] = "-[MMMessageSendLogic sendTextMessageWithString:mentionedUsers:]";
            [MMLogger logWithMMLogLevel:0x2 module:"ComposeInputView" file:0x103e0e162 line:0x10c func:stack[0] message:rax];
            [rax release];
            r14 = 0x0;
    }
    [r13 release];
    [r12 release];
    rax = r14 & 0xff;
    return rax;
}
```

## 7. 编写 frida 脚本

```js
console.log("init success");

function SendTextMessage(wxid, msg) {
    var message = ObjC.chooseSync(ObjC.classes.MessageService)[0]
    var username = ObjC.classes.CUtility.GetCurrentUserName();
    console.log(username)
    console.log("Type of arg[0] -> " + message)
    var toUsrName = ObjC.classes.NSString.stringWithString_(wxid);
    var msgText = ObjC.classes.NSString.stringWithString_(msg);
    message["- SendTextMessage:toUsrName:msgText:atUserList:"](username, toUsrName, msgText, null);
}

SendTextMessage("filehelper","主动调用发送信息！")
```

将以上文本保存 js 文件，然后执行以下命令：

```
frida 微信 --debug --runtime=v8 --no-pause -l test.js
```

我们就可以看到微信上发送了一条消息：

[图]

## 8. 消息监听

上面我们实现了微信消息的篡改及主动发送功能。那么我们再去看看微信是如何接到消息信息的！每当有人或者群给我们发送消息的时候，电脑或手机上一般都会提示通知，那么通知的英文是什么？notify，翻译就是通知的意思。我们碰碰运气看看能不能找到相关字样。还是在 MessageService 里面我们找到了：

```objc
- (void)notifyAddMsgOnMainThread:(id)arg1 msgData:(id)arg2;
```

这个方法。如何去确定它到底是不是呢？还是继续用 frida 去进行验证。

执行上述命令：

```
frida-trace -m "-[MessageService notify*]" 微信
```

```
$ frida-trace -m "-[MessageService notify*]" 微信
Instrumenting...
-[MessageService notifyModMsgOnMainThread:msgData:]: Loaded handler at ".../notifyModMsgOnMainThread_msgData_.js"
-[MessageService notifyAppMsgUploadProgress:msgData:uploadedBytes:totalBytes:]: Loaded handler at ".../notifyAppMsgUpl....js"
-[MessageService notifyVideoMsgUploadProgress:msgData:uploadedBytes:totalBytes:]: Loaded handler at ".../notifyVideoMs....js"
-[MessageService notifyNewMsgNotificationOnMainThread:msgData:]: Loaded handler at ".../notifyNewMsgNotificationOnMain....js"
-[MessageService notifyChatSyncMsgsOnMainThread:msgList:]: Loaded handler at ".../notifyChatSyncMsgsOnMainThread_msgLi....js"
-[MessageService notifyChatSyncMessagesMergedOnMainThread:]: Loaded handler at ".../notifyChatSyncMessagesMergedOnMain....js"
-[MessageService notifyRevokePatMsgOnMainThread:n64MsgId:]: Loaded handler at ".../notifyRevokePatMsgOnMainThread_n64M....js"
-[MessageService notifyAddRevokePromptMsgOnMainThread:msgData:]: Loaded handler at ".../notifyAddRevokePromptMsgOnMain....js"
-[MessageService notifyDelMsgOnMainThread:msgData:isRevoke:]: Loaded handler at ".../notifyDelMsgOnMainThread_msgData_....js"
-[MessageService notifyMsgDeletedForSessionOnMainThread:]: Loaded handler at ".../notifyMsgDeletedForSessionOnMainThre....js"
-[MessageService notifyDelAllMsgOnMainThread:]: Loaded handler at ".../notifyDelAllMsgOnMainThread_.js"
-[MessageService notifyAddMsgListForSessionOnMainThread:]: Loaded handler at ".../notifyAddMsgListForSessionOnMainThre....js"
-[MessageService notifyUnreadCntChangeOnMainThread:]: Loaded handler at ".../notifyUnreadCntChangeOnMainThread_.js"
-[MessageService notifyMsgResendOnMainThread:msgData:]: Loaded handler at ".../notifyMsgResendOnMainThread_msgData_.js"
-[MessageService notifyImgMsgUploadProgress:msgData:uploadedBytes:totalBytes:]: Loaded handler at ".../notifyImgMsgUpl....js"
-[MessageService notifyAppMsgDownloadProgress:msgData:downloadedBytes:totalBytes:]: Loaded handler at ".../notifyAppMs....js"
-[MessageService notifyUIAndSessionOnMainThread:withMsg:]: Loaded handler at ".../notifyUIAndSessionOnMainThread_withM....js"
-[MessageService notifyAddMsgOnMainThread:msgData:]: Loaded handler at ".../notifyAddMsgOnMainThread_msgData_.js"
Started tracing 18 functions. Press Ctrl+C to stop.
```

我们可以看到有不少的方法被 hook 了，但是没事。我们用微信发送一个消息给自己或者其他人都可以，看看输出：

```
/* TID 0x307 */  157082 ms  -[MessageService notifyAddMsgOnMainThread:0x6503cfa934d442eb msgData:0x7fd903c9fa00]
/* TID 0x31e17 */ 157092 ms  -[MessageService notifyUnreadCntChangeOnMainThread:0x6503cfa934d442eb]
/* TID 0xb5c27 */ 157228 ms  -[MessageService notifyModMsgOnMainThread:0x6503cfa934d442eb msgData:0x7fd903c9fa00]
```

我们可以看到三层相关的调用，那么我们就先看第一个 notifyAddMsgOnMainThread，修改下 js 文件：

```js
onEnter(log, args, state) {
    log(`-[MessageService notifyAddMsgOnMainThread:${args[2]} msgData:${args[3]}]`);
},
```

以我们上面的经验很快就可以看出这个应该就是消息接收的方法，msgData 就是我们所需要的消息内容。那么我们还是得继续验证。把参数都打印出来看看。修改添加如下 js：

```js
console.log("Type of arg[2] -> " + new ObjC.Object(args[2]).$className)
console.log("Type of arg[3] -> " + new ObjC.Object(args[3]).$className)
```

这两句话是为了输出 2 个参数的类型。然后也修改下 frida 命令执行：

```
frida-trace -m "-[MessageService notifyAddMsgOnMainThread*]" 微信
```

```
$ frida-trace -m "-[MessageService notifyAddMsgOnMainThread*]" 微信
Instrumenting...
-[MessageService notifyAddMsgOnMainThread:msgData:]: Loaded handler at ".../notifyAddMsgOnMainThread_msgData_.js"
Started tracing 1 function. Press Ctrl+C to stop.
Type of arg[2] -> NSTaggedPointerString
Type of arg[3] -> MessageData

/* TID 0x307 */
 2170 ms  -[MessageService notifyAddMsgOnMainThread:0x6503cfa934d442eb msgData:0x7fd90401c960]
```

可以看到第一个参数是 String，第二个参数是 MessageData。

MessageData 是消息的结构体，那么我们就去头文件中搜索一下这个 MessageData：

```
# n @ localhost in ~/vscodewsp/wechat/dump [7:46:01] C:1
$ ll -l|grep MessageData
-rw-r--r--  1 n  staff   2.5K  2 15 19:19 FTSFileMessageData.h
-rw-r--r--  1 n  staff   2.0K  2 15 19:19 FTSMessageData.h
-rw-r--r--  1 n  staff   794B  2 15 19:19 IMessageDataExt-Protocol.h
-rw-r--r--  1 n  staff   6.2K  2 15 19:19 MMChatMessageDataSource.h
-rw-r--r--  1 n  staff    25K  2 15 19:19 MessageData.h
-rw-r--r--  1 n  staff   550B  2 15 19:19 MessageDataGroup.h
-rw-r--r--  1 n  staff   2.9K  2 15 19:19 MessageDataPackedInfo.h
-rw-r--r--  1 n  staff   262B  2 15 19:19 NSPasteboard-MessageData.h
```

可以看到是有 MessageData 这个文件的，那么我们打开看看：

```objc
@interface MessageData : NSObject <NSPasteboardItemDataProvider, IAppMsgPathMgr, IMsgExtendOperation, NSCopying, WCTTableCoding, WCTColumnCoding> {
    unsigned int mesLocalID;
    long long mesSvrID;
    NSString *fromUsrName;
    NSString *toUsrName;
    unsigned int messageType;
    NSString *msgContent;
    NSString *msgVoiceText;
    unsigned int m_uiVoiceToTextStatus;
    unsigned int msgStatus;
    unsigned int msgImgStatus;
    NSString *msgRealChatUsr;
    NSString *msgPushContent;
    unsigned int m_uiTranslateStatus;
    NSString *msgSource;
    unsigned int mesDes;
    unsigned int msgSeq;
    BOOL bForward;
    NSData *m_dtThumbnail;
    unsigned int msgCreateTime;
    unsigned int m_uiSendTime;
    unsigned int m_uiDownloadStatus;
    id <IMsgExtendOperation> m_extendInfoWithMsgType;
    id <IMsgExtendOperation> m_extendInfoWithFromUsr;
    BOOL isAutoIncrement;
    BOOL m_bShouldShowAll;
    BOOL m_bIsMultiForwardMessage;
    BOOL m_shouldReloadOriginal;
    BOOL m_bHasOriginalMessage;
    unsigned int IntRes1;
    unsigned int IntRes2;
    unsigned int m_uiFileUploadStatus;
    unsigned int m_uiOriginalImgHeight;
    unsigned int m_uiOriginalImgWidth;
    unsigned int m_uiSrcCreateTime;
    unsigned int _m_nsMsgCrc32;
    unsigned int _m_uiUploadedBytes;
    unsigned int _m_uiDownloadedBytes;
    unsigned int _m_uiTotalBytes;
    int _m_nCdnServerRetCode;
    unsigned int _m_uiResendMessageCount;
    long long lastInsertedRowID;
    NSString *StrRes1;
    NSString *StrRes2;
    MMTranslateResult *m_nsTranslationResult;
    NSString *m_nsFilePath;
    NSString *m_nsVideoPath;
    NSString *m_nsVideoThumbPath;
    NSString *dataMd5;
    MessageData *m_refMessageData;
    MessageDataPackedInfo *m_packedInfo;
    NSString *m_nsSrcUserName;
    NSString *m_nsSrcNickName;
    NSString *m_nsAtUserList;
    NSString *_m_nsImgFileName;
    NSString *_m_nsBigFileErrMsg;
    SecondMsgNode *_secondMsgNode;
    MessageData *_referHostMsg;
}
```

看各个属性名应该没问题，就是他。那么我们直接修改 js 代码进行输出试试：

```js
var MessageData = new ObjC.Object(args[3]).$ivars;
console.log("fromUsrName -> " + MessageData.fromUsrName)
console.log("toUsrName -> " + MessageData.toUsrName)
console.log("msgContent -> " + MessageData.msgContent)
```

运行：

```
frida-trace -m "-[MessageService notifyAddMsgOnMainThread*]" 微信
```

```
-[MessageService notifyAddMsgOnMainThread:msgData:]: Loaded handler at ".../notifyAddMsgOnMainThread_msgData_.js"
Started tracing 1 function. Press Ctrl+C to stop.
Type of arg[2] -> NSTaggedPointerString
Type of arg[3] -> MessageData
fromUsrName -> wxid_pk1reltk63i822
toUsrName -> filehelper
msgContent -> 消息监听测试

/* TID 0x307 */
14909 ms  -[MessageService notifyAddMsgOnMainThread:0x6503cfa934d442eb msgData:0x7fd904426980]
```

如上我们可以看到成功接收到别人发送的消息内容。

## 文章完结

作者其他文章：
- [求助] 为啥我发的帖子不显示，一直 [待验证]
- [原创] MacOS-微信登录二维码获取
- [原创] MacOS微信逆向分析-Frida（本文）

---

## 回复（共 25 条）

**2 楼 · lyghost · 2021-2-16 09:01**（+1）
分析的很详细，支持一波

**3 楼 · rushmaster · 2021-2-18 11:01**
牛逼class

**4 楼 · Roland_ · 2021-2-18 17:28**
牛逼

**5 楼 · MsScotch · 2021-2-19 09:41**
MARK

**6 楼 · Editor · 2021-2-19 10:08**
感谢分享！

**7 楼 · guangzisam · 2021-2-21 13:11**
虽然只 1 个函数，但是是最重要的发消息。引导思路特别好

**8 楼 · 尐进 · 2021-2-22 09:51**
mark

**9 楼 · tank小王子 · 2021-2-22 10:29**
很详细，多谢分享。

**10 楼 · saloyun · 2021-2-24 19:12**（最后于 2021-2-24 19:34 被 saloyun 编辑）
。。。

**11 楼 · datongge · 2021-3-3 20:57**
[表情]

**13 楼 · mb_wzofwafl · 2021-3-20 22:37**
文章写的非常浅显易懂，给作者点个赞

**14 楼 · CzAdmin · 2021-9-14 18:41**
不错！支持！

**15 楼 · 浪荡男同学 · 2022-1-12 14:47**（最后于 2022-1-14 16:58 编辑）
你好，我这边使用 `frida-trace -m "-[MessageService Send*]" 微信`，一直提示 `Failed to attach: timeout was reached`。是什么原因呢。网上找了一圈没有找到解决方法。是否需要启用 mac 端的 frida-server。
更新重装最新的 frida 版本，问题得到解决。

**16 楼 · 卡鲁秋 · 2022-1-12 23:57**
关键是作者的思路

**17 楼 · hackbs · 2022-1-14 20:10**
mark 了

**18 楼 · mb_gbqpugmm · 2022-3-4 17:58**
learn

**19 楼 · hook她的心 · 2022-3-6 17:44**（+1）
`var MessageData = new ObjC.Object(args[3]).$ivars;`
大佬能解释一下这个 `$ivars` 怎么得出来的嘛？

**20 楼 · 胡家二少 · 2022-5-10 19:04**
https://frida.re/docs/javascript-api/#objc
`$ivars`: object mapping each instance variable name to its current value, allowing you to read and write each through access and assignment

**21 楼 · 胡家二少 · 2022-5-10 19:05**
> hook她的心：var MessageData = new ObjC.Object(args[3]).`$ivars`; 大佬能解释一下这个 `$ivars` 怎么得出来的嘛？

https://frida.re/docs/javascript-api/#objc
`$ivars`: object mapping each instance variable name to its current value, allowing you to read and write each through access and assignment

**24 楼 · ATrueMan · 2025-5-13 19:36**
study

**25 楼 · 紫雾风情 · 2025-5-14 08:59**
最新版的微信貌似不可以了

（12、22、23 楼在原帖中不存在或已删除）

---

## 赞赏记录

| 时间 | 参与人 | 留言 |
|---|---|---|
| 2026-9-7 | 铭信 | — |
| 2026-6-19 | zhongdong | — |
| 2025-12-10 | 心游尘世外 | 为你点赞！ |
| 2025-11-17 | 一路南寻 | 感谢你的贡献，论坛因你而更加精彩！ |
| 2025-9-5 | 飘零丶 | 为你点赞！ |
| 2025-7-25 | yaosunwen | 感谢你分享这么好的资源！ |
| 2025-5-8 | 東陽不列山 | 为你点赞！ |
| 2024-10-12 | 嫉妒的死远点 | 感谢你的贡献，论坛因你而更加精彩！ |
| 2023-12-5 | killsu | 为你点赞~ |
| 2023-6-21 | Black貓①呺 | 为你点赞~ |
| 2023-1-14 | PLEBFE | 为你点赞~ |
| 2022-3-10 | nevinhappy | 为你点赞~ |
| 2021-7-28 | 闪星星 | 为你点赞~ |
| 2021-3-30 | ydshk | 为你点赞~ |
| 2021-3-21 | KeiVi233 | 为你点赞~ |
| 2021-3-3 | 风雪不归途 | 为你点赞~ |
| 2021-2-25 | demoscene | 为你点赞~ |
| 2021-2-22 | 尐进 | 为你点赞~ |
| 2021-2-19 | Editor | 为你点赞~ |
| 2021-2-18 | Roland_ | 为你点赞~ |

打赏记录（共 3 次，+22.00 雪花）：
- 闪星星 +1.00 · 2021/07/28 · 助人为乐～
- mb_wzofwafl +20.00 · 2021/03/20 · 感谢分享～
- demoscene +1.00 · 2021/02/25

---

*转写完成于 2026-10-29，全文取自登录后导出的 PDF，内容完整。PDF 中的截图未随文字一并导出，以 [图] 标注位置。*
