---
name: Keylane
description: 个人固定站点登录入口的工程调度簿式界面原型
colors:
  action-orange: "#e76f41"
  action-orange-hover: "#c7532c"
  action-orange-soft: "#f8e4d9"
  nav-active-paper: "#f8e9df"
  nav-active-ink: "#9b3b1e"
  paper: "#f2f0ea"
  paper-light: "#fbfaf7"
  paper-deep: "#e9e6de"
  graphite: "#17242b"
  secondary-ink: "#59636a"
  rule: "#c8c9c4"
  success: "#246650"
  warning: "#a34222"
  focus: "#135b7a"
  white: "#ffffff"
  selection-peach: "#f3b696"
  input-border: "#aeb5b5"
  input-border-hover: "#89948f"
  keycap-border: "#d4d5d0"
  inspector-field-border: "#b9c0bd"
  quiet-border-hover: "#a4aca8"
  row-hover: "rgba(255,255,255,.48)"
  warning-border: "#d29d83"
  success-border: "#89a89b"
  danger-hover: "#812e15"
  preview-canvas: "#e2e4e0"
  preview-header: "#222d32"
  preview-control-border: "#69767a"
  preview-control-ink: "#d6dfdc"
  preview-control-hover: "#3e4c50"
  preview-stage-start: "#dcded9"
  preview-note-ink: "#435056"
typography:
  display:
    fontFamily: "Keylane Display, PingFang SC, sans-serif"
    fontSize: "24px"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "-0.045em"
  headline:
    fontFamily: "-apple-system, BlinkMacSystemFont, Segoe UI, PingFang SC, Noto Sans CJK SC, sans-serif"
    fontSize: "23px"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "-0.02em"
  title:
    fontFamily: "-apple-system, BlinkMacSystemFont, Segoe UI, PingFang SC, Noto Sans CJK SC, sans-serif"
    fontSize: "16px"
    fontWeight: 800
    lineHeight: 1.3
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, Segoe UI, PingFang SC, Noto Sans CJK SC, sans-serif"
    fontSize: "13px"
  metadata:
    fontFamily: "SFMono-Regular, Consolas, Liberation Mono, monospace"
    fontSize: "11px"
  footnote:
    fontSize: "10px"
  compact:
    fontSize: "12px"
  row-title:
    fontSize: "14px"
  subsection:
    fontSize: "15px"
  inspector-title:
    fontSize: "18px"
  compact-brand:
    fontSize: "22px"
rounded:
  field: "6px"
  action: "7px"
  surface: "9px"
  keycap: "5px"
  preview-switch-control: "8px"
  preview-switch: "12px"
  preview-frame-popup: "16px"
  preview-frame-panel: "4px"
  preview-frame-mobile: "10px"
spacing:
  tight: "8px"
  regular: "12px"
  compact-gutter: "22px"
  dashboard-gutter: "28px"
components:
  button-primary:
    backgroundColor: "{colors.action-orange}"
    textColor: "#ffffff"
    rounded: "{rounded.action}"
    padding: "0 10px"
    height: "34px"
  button-authorization:
    backgroundColor: "transparent"
    textColor: "#a83d1d"
    rounded: "{rounded.action}"
    padding: "0 10px"
    height: "34px"
  button-quiet:
    backgroundColor: "{colors.paper-light}"
    textColor: "{colors.graphite}"
    rounded: "{rounded.action}"
    padding: "0 10px"
    height: "34px"
  input-search:
    backgroundColor: "{colors.paper-light}"
    textColor: "{colors.graphite}"
    rounded: "{rounded.surface}"
    height: "44px"
  site-row:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.graphite}"
    height: "71px"
  current-page:
    backgroundColor: "{colors.paper-light}"
    textColor: "{colors.graphite}"
    rounded: "{rounded.surface}"
    padding: "11px 12px"
  nav-item-active:
    backgroundColor: "{colors.nav-active-paper}"
    textColor: "{colors.nav-active-ink}"
    rounded: "{rounded.action}"
    padding: "10px 12px"
---

# Design System: Keylane

## Overview

**Creative North Star: "工程调度簿"**

Keylane 的静态原型把固定站点呈现为可扫读的操作清单：纸面底色、石墨文字、细分隔线、行号，以及独立的凭据方式和动作列。操作密度服务于快速找到站点，橙色只强调主要动作。Popup、Side Panel 和管理页共享这套语言。

目前只有 `prototype/` 中的浏览器内交互演示。它使用虚构数据和页面内存状态；Chrome 扩展、站点访问、凭据持久化和真实登录均尚未实现。原型外层的深色标题栏及界面切换器只用于评审，不属于扩展界面。

**Key Characteristics:**

- 站点列表以行号、域名和细分隔线建立稳定扫描节奏。
- 操作橙色集中在“进入”等主动作；权限缺失使用描边“授权”。
- 窄面板先给出搜索、当前页匹配和常用站点，详细规则留在管理页。

## Colors

色彩以暖纸面和石墨文字为主体，橙色标记可立即执行的操作。

### Primary

- **操作橙** (`action-orange`)：主要按钮与品牌小图标；悬停使用 `action-orange-hover`，柔和底色使用 `action-orange-soft`。管理导航的选中态使用独立的 `nav-active-paper` 与 `nav-active-ink`。

### Neutral

- **纸面** (`paper`、`paper-light`、`paper-deep`)：分别用于主背景、输入与检查区、导航区及轻微层次。
- **石墨** (`graphite`)：标题和主要文字；`secondary-ink` 用于域名、说明和辅助计数。
- **分隔线** (`rule`)：站点行、面板边界和区段边界。

### Status

- **完成绿** (`success`)：已匹配、就绪等肯定状态；**警示褐** (`warning`)：需授权与错误；**焦点蓝** (`focus`)：键盘焦点轮廓。
- `warning-border`、`success-border` 只用于任务反馈边框；`danger-hover` 只用于删除确认动作；`selection-peach` 只用于文本选区。

### Supporting and preview colors

- `input-border`、`input-border-hover`、`inspector-field-border`、`keycap-border`、`quiet-border-hover` 支撑不同密度的控件边界；`row-hover` 是站点行悬停的半透明白色。
- 所有 `preview-*` 颜色只属于原型评审容器和界面切换器，不进入真实扩展页面。`white` 用于输入框与深色背景上的文字。

**The Action Color Rule.** 保持橙色主动作稀少且明确；权限缺失用描边动作和文字说明表达，不能仅凭颜色区分。

## Typography

品牌字使用原型内的 Keylane Display（本地 Inter 字体文件，中文回退系统字体）；正文使用系统无衬线栈，域名与行号使用等宽栈。字号层级较紧，以清晰的字重和行间距承载信息密度。

- **Display** (`typography.display`)：品牌字标。
- **Headline** (`typography.headline`)：管理页标题。
- **Title** (`typography.title`)：窄面板的区段标题。
- **Body** (`typography.body`)：按钮、列表与短说明的常用基准。
- **Metadata** (`typography.metadata`)：行号、域名和配置摘要。
- **辅助字号**：10px 用于紧凑页脚，12px 用于次级说明，14px 用于站点名称，15px 用于管理子标题，18px 用于检查器标题，22px 用于管理导航内的品牌字。它们在 frontmatter 中各有独立角色，不能任意扩展为新的字号。

**The Scan Line Rule.** 站点名称优先可读，域名与凭据方式退一级；窄面板长文本截断，不挤占动作列。

## Layout

Popup 原型宽 420px，Side Panel 原型宽 390px。两者都以顶部品牌与搜索、当前页提示、站点清单、底部管理入口组织内容。站点行最小高度 71px，使用“行号／名称与域名／凭据方式／动作”的四列网格。紧凑界面水平内边距采用 `spacing.compact-gutter`。

管理页原型宽 1180px，采用 192px 导航、弹性站点列表与 350px 规则检查器。900px 以下变为两列，检查器下移；650px 以下变为单列，导航横向排列。管理区内边距采用 `spacing.dashboard-gutter`，小屏收紧为 16px。这是网页原型的响应式呈现，不表示移动版扩展在产品范围内。

## Elevation & Depth

真实界面区域主要靠纸面色阶和边线分层。原型展示容器有 `0 18px 54px rgba(18, 31, 36, .17)` 阴影，用来从评审背景中托起示例；不要把它套到站点列表的每一行。

**The Paper Layer Rule.** 列表保持平面结构；用分隔线和背景色区分信息层级，不用逐行悬浮卡片。

## Shapes

输入框采用 `rounded.field`，动作按钮采用 `rounded.action`，搜索与当前页提示采用 `rounded.surface`，键盘提示采用 `rounded.keycap`。内部形状轻微圆角，细边框保持工具界面的秩序；橙色品牌方块与主按钮形成一致的局部强调。`preview-switch*` 和 `preview-frame*` 圆角只用于评审页外壳，不作为扩展控件默认值。

## Components

### Buttons

主要按钮为操作橙底白字，默认高度 34px，悬停转为深橙，按下向下移动 1px。授权按钮为透明底橙色描边；安静按钮为浅纸底与边线。所有可聚焦按钮使用 3px 焦点蓝轮廓，偏移 2px；禁用态降低不透明度。

### Inputs / Fields

搜索框高 44px，浅纸底、细边框，左侧搜索图标，右侧键盘提示。管理页字段使用白底、6px 圆角与明确标签；密码演示值可切换显示。焦点使用与按钮一致的蓝色轮廓。

### Navigation

管理页导航采用较深纸面底色；当前项使用浅橙底和深色文字。窄屏改为横向排列。Popup 与 Side Panel 的底部双入口保持对等位置。

### Site Rows and Status

窄面板站点行以细线分隔；行号和域名用等宽字体，主动作固定在末列。当前页匹配为带边框的独立行。执行提示有进行中、警示和完成状态；文案只说明“已填充”或“已提交”，不推断服务器认证成功。原型中的授权和执行反馈都只是模拟。

## Do's and Don'ts

### Do:

- **Do** 保持站点名称、域名、凭据方式和下一步动作在窄面板同一行中可扫读。
- **Do** 用“进入”和“授权”两种明确动作区分可操作与待授权状态。
- **Do** 将搜索、结果和规则编辑沿用同一纸面、石墨、分隔线语言。

### Don't:

- **Don't** 将原型评审页的深色标题栏当作扩展界面的一部分。
- **Don't** 把“已提交”写成“登录成功”，也不要把演示反馈写成真实执行结果。
- **Don't** 以一组独立卡片替换当前站点行清单；它会削弱快速扫读的主任务。
