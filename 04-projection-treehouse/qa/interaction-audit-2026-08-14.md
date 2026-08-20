# 交互全量测试报告（2026-08-14）

本轮对新增模块与全量按键/点击交互做了两层审计：静态接线审计 + 无头浏览器运行时注入测试。

## 结论

**0 项失败**。静态审计 0 问题；浏览器交互审计 31 项检查全部通过（1 项无头环境限制下的移动检查记为警告，非缺陷）。

## 发现并修复的真实缺陷（2 个）

### 1. `#videoStatus` 接口为空导致播放键抛错（严重）
- **现象**：`togglePlayback` 无守卫地写 `$('#videoStatus').textContent`，但视频详情从未创建该元素 → 每次点击「播放/暂停」都会抛 `TypeError: Cannot set properties of null`，占位视频的播放状态切换完全不可用。
- **修复**：`prototype.js` 视频详情在 `.video-frame` 后补 `<p class="video-status" id="videoStatus" aria-live="polite"></p>`。
- **验证**：审计项 `key:space-play` 在真实浏览器中点击播放无抛错。

### 2. `#plantTagButton` 接口为空（死代码）
- **现象**：视频详情里有绑定代码（`if (plantTagButton)` 守卫），但标记从未被渲染——玩家携带标签时在详情页找不到「贴上」入口，只能靠 F 键。
- **修复**：详情快捷操作行在 `state.carryTag` 时条件渲染「贴上携带的标签」按钮。
- **验证**：静态审计 undefinedRefs 归零。

## 静态接线审计（`npm run audit:wiring`）

- 15 个客户端脚本加载顺序与清单一致（含 3 个 P2.4 新模块）；
- `$('#id')` 引用 0 个未定义（此前历史死引用 `echoSpinner/onboardingRibbon` 为 JS 动态创建，审计已支持 `.id=` 模式识别）；
- HTML/文案宣传的全部按键（WASD/E/F/G/B/N/P/Q/J/H/R/T/?/Space/Esc）均有 keydown 分支；
- P2.4 整合点（renderWorld 三调用、nearestTarget 三类型）就位。

## 浏览器运行时审计（`interaction-audit.html` + `qa/interaction-audit.js`）

同窗口驱动（服务端 CSP `script-src 'self'` 禁内联、`frame-ancestors 'none'` 禁 iframe，故采用 index.html 副本 + 外部审计脚本方案），覆盖：

- **按键**：Q 行动盘 / B 背包 / J 手账 / ? 图鉴 / P 发布 / N 纸条 / T 标签 全部正确开面板；H 回地块 + R 休息过天 + 返回公域；E 打开视频详情（含 videoStatus）；Space 播放切换无抛错；F 点赞切换；G 竞价面板。
- **点击**：地标/资源/标签植物/区域事件标记/视频（远距寻路目标设置）全部生效。
- **P2.4 新面板**：5 个区域事件标记渲染；区域事件面板打开 + 选择持久化；4 个动态地点渲染 + 面板打开 + 条目跳转；NPC 条件满足后出现 + 对话面板（含 NPC 标记）+ 剧情推进 step 1→2。
- 全程无 window error。

## 已知环境限制（非缺陷）

- 无头浏览器 RAF 节流：移动位移与「近距点击立即打开」路径依赖 rAF，在无头环境不触发，已在审计中以警告记录；真实浏览器中无此问题（历史 playability-report 已实测 WASD 移动）。

## 审计资产

- `scripts/static-wiring-audit.mjs` — 静态审计（进程内可跑，无需浏览器）
- `interaction-audit.html` — QA 页面（index.html 副本 + 审计脚本，index.html 变更时需同步）
- `qa/interaction-audit.js` — 浏览器按键/点击注入测试

---

# 补充：UX 深度排查轮（2026-08-18）

在交互审计基础上追加四项排查：静态资源完整性、控制台错误、三视口 HUD 几何重叠、已知 critique 遗留项。**结论：0 项失败**（交互 32 项 ×2 轮全过、三视口 0 重叠、控制台 881 行零错误、54/54 服务端测试）。

## 本轮发现并修复的 UX 问题

### 3. 横屏短屏 dock×dialogue 重叠（844×390）
- **根因**：宽度 ≤820px 块中 `body[data-hud-state="near|moving"] .dialogue:not(...)` 的高特异性满宽规则（0,3,1）压过 `@media (orientation: landscape) and (max-height: 500px)` 的分区规则（0,1,0），导致 844×390（视口 814×295）下对话与右下行动栏相交 1580px²。这是 P2 审计原始横屏失败在 ≤820px 宽度下的残余形态。
- **修复**：landscape 短屏块内追加同特异性覆盖（宽度回到 50vw 左右分区、折叠态按钮样式同步）。
- **验证**：三视口（390×844 / 844×390 / 780×390）几何测量全部 0 重叠。

### 4. 公共世界同步失败不可见（critique 遗留项）
- **根因**：`syncPublicWorld` 失败仅 `console.warn`，玩家对同步中断无感知。
- **修复**：失败时显示 15 秒节流 toast「公共世界暂时没有同步上，稍后会自动重试」，仅在进入世界后提示、不刷屏。

## 排查确认无问题的项目
- 页面引用的全部静态资源（脚本/CSS/插画/demo 视频）200；
- 过天后世界内容刷新链路完整（休息→回公域经 `exitCottage → renderWorld` 刷新区域事件与动态地点）；
- 入口页按钮热区 44px、书页完整落在视口内；`worldEventChoices`/`npcStories` 等新状态初始化完整。

## 实现归属说明

P2.4 三个客户端模块与 `prototype.js` 整合点最终保留后台实施子代理落盘的版本：**区域事件按真实日历日轮换**（`worldClock`/`daySeed` 键控，而非家园休息日），与数据层及服务端事件契约一致，经全量审计确认；审计断言已同步为 `occurrenceDay` 键控。`qa/interaction-audit.html` 为废弃的 iframe 旧方案残留（受服务端 CSP 限制不可用），已替换为废弃说明占位。
