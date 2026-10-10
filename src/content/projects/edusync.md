---
title: "EduSync · 学校多媒体设备互联系统"
published: 2025-09-14
draft: false
order: 80
description: "面向学校多媒体设备（老式 Windows 台式机、希沃一体机）的互联系统：实时机况检测、服务端远程介入与教学资源多端共享。"
image: "https://opengraph.githubassets.com/1/Lixixy/EduSync"
status: "developing"
tags:
  - Vue
  - Python
  - 校园
link:
  - label: "GitHub"
    icon: "fa7-brands:github"
    value: "https://github.com/Lixixy/EduSync"
---

## 项目简介

一套面向**学校多媒体设备**的互联系统。

目前学校主流多媒体设备（老式 Windows 台式机、希沃一体机等）配套的第一方软件生态，主要还是以「本机」为中心做教学资源管理与课堂互动；EduSync 通过**中心化的调配管理**，让学校信息人员能统一掌握设备机况、必要时远程介入处理，并把教学资源共享到各个终端。

> 仓库托管在 [Lixixy/EduSync](https://github.com/Lixixy/EduSync)。

## 核心功能

### 一、实时的设备运行状况检测

终端持续向中心服务器上报自身的使用信息，服务器集中处理后在后台给管理员展示。

### 二、服务器远程介入终端

管理员可在服务端后台下发远程指令（例如远程停止进程），优化多媒体设备的日常运维。

### 三、教育资源多端共享

把老师常用的学科课件与讲义上传到服务器后台，终端可一键下载所需课件，无需物理介质。

## 进度

- [x] 多媒体设备状态采集
- [x] 实时上传设备状态
- [x] 服务器数据库设计
- [ ] 多媒体设备状态可视化
- [ ] 教育资源平台可视化
- [ ] 教育资源平台数据库设计
- [ ] 多端教育资源文件流传逻辑
