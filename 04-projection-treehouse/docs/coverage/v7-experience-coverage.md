# v7 体验设计覆盖表（开放公域重构）

> 依据《Zhere 开放世界玩法与数据采集设计补充说明 V7》。世界为树林与海岸共存的开放大世界，不设定单一主题区域。原型位置：`04-projection-treehouse`，键位 WASD/E/F/G/B/N/Space/ESC。

## P0 · 世界基础

| v7 要求 | 原型位置 | 当前行为 |
|---|---|---|
| 开放世界移动 | 全域 | WASD/点击，镜头跟随，无边界；海面减速 |
| 公共视频随机生成 | 森林/山坡/城镇/商业街/海岸/海面 6 区 | 56 段视频池，按日期种子 + 分区槽位生成，附 spawn_source |
| 任意地点发布视频 | 背包（B） | 示例素材或共创台上传 → 在脚下发布；记录 publish_asset（位置/区域/上下文/时间） |
| 公共视频播放 | 视频详情 | 播放/暂停/占位片段，watch_time 记录停留时长 |
| 点赞 | 视频详情 / F 快捷 | like/unlike；视频角标显示赞数 |
| 收藏 | 视频详情 / 抽屉 | favorite/unfavorite/favorite_revisit；明确收藏≠购买 |
| 评论与回复 | 视频详情 | comment + comment_reply_start |
| 基础曝光事件 | 渲染层 + 8 秒批 | impression_batch：asset_id/zone_id/spawn_source/rank/score/visibility_duration/distance_to_player |
| 个人小窝 | 西侧木门 | 副本摆放上限 12；地毯自定义；刷新恢复 |
| 视频副本机制 | 竞价 → 口袋 → 小窝 | 只有竞价成功产生副本；摆放/移动/收回分别记录 |
| 接近/绕开信号 | 靠近检测 | approach（首次靠近）、avoid（靠近未看即离开） |

## P1 · 竞价

| v7 要求 | 原型位置 | 当前行为 |
|---|---|---|
| 原地虚拟竞价 | 任意视频旁（G） | 不跳转竞价大厅；轻量面板 |
| 有限预算 | HUD | 500 灵感币，出价即扣，无现金价值 |
| 独立报价 | 报价面板 | 输入完整报价；确认后记录 bid_submit，并由系统直接接受 |
| 价格世界化表达 | 竞价植物 | 植物随热度长高，开花即落幕；无数值表单主界面 |
| 报价成交并获得副本 | 报价回执 | accepted Bid → 有效 Transaction + copy_acquired，原片保留 |
| NPC | 慢半拍的鹿 | 仅在底价之下跟价，始终标记 NPC |
| 副本带回小窝 | 小窝（F/点击） | copy_placed_home / copy_moved_home / copy_removed_home；>24h 记录 copy_long_term_kept |

## P2 · 需求

| v7 要求 | 原型位置 | 当前行为 |
|---|---|---|
| 任意地点发布个人需求 | N | 纸条出现在脚下位置，世界可见对象 |
| 任意地点发布模拟商业需求 | N（类型选择） | 明显模拟声明，不形成真实交易 |
| 需求引用当前视频 | 视频旁按 N | 自动写入 refAsset，记录 demand_asset_link |
| 视频连接到需求 | 视频详情 | 「把这段连接到一张纸条」记录 demand_asset_link |
| 素材响应需求 | 纸条详情 | demand_response（文字回应） |
| 纸条浏览 | 公告树 | 搜索纸条/视频、打开、定位 |

## P3 · 探索装置（优先项）

| 装置 | 行为 | 原始事件 |
|---|---|---|
| 山坡望远镜 | 随机看到远处/低曝光内容，可走过去或换方向 | telescope_open / random_exposure / telescope_follow |
| 漂流瓶 | 打开得一句话/视频指引/标签/纸条方向；可回复、扔回、带走 | bottle_exposure / bottle_open / bottle_keep / bottle_return / bottle_reply |
| 标签植物 | 拔下携带，F 贴到视频旁 | tag_pluck / tag_add(source=tag_plant) / tag_remove |
| 看海长椅 | 坐下看海、读上一位留言、留一句 | bench_sit / bench_reply |
| 胶片晾衣绳 | 三槽挂副本、左右挪动/互换/取下 | line_change（含三槽顺序） |
| 双面放映墙 | 左右各放一段，并置播放、互换、取下 | wall_pair_view / wall_swap |
| 混剪桌 | 最多三段排成 A→B→C 顺序，保存为小窝组合 | mix_change / mix_save |
| 交换箱 | 留下一枚副本 + 一句话，带走别人留下的一枚 | exchange_take / substitution |
| 咖啡店/宠物店橱窗 | 放副本进模拟商业店铺窗口、换或取下 | business_scene_place / business_scene_remove |
| 空白画框 | 放一段或留一句话→世界纸条 | environment_match / publish_demand(source=blank_frame) |
| 无名处 | 给森林或山坡中没名字的地方起名/改名/忘掉 | free_semantic_cluster |
| 视频光环 | 按视频场景类别(海岸/城市/商业/山林/城镇)渲染环境色 | —（纯视觉效果） |

## 纯娱乐对象（无推荐数据目的）

海岸海鸥（漂移动画）、镇上散步的猫（点击会叫）、可开关的路灯、岸边贝壳纹理。对应事件标记为 play_only_*，不进入偏好派生。

## 世界自发事件

回声水洼异象保留为可忽略邀请（恢复/接受/忽略/搅一搅），记录 world_event_response。

## 数据与隐私约束

- 所有事件带 event_id / raw_event / details / experiment_id=‘open-world-v1’ / experiment_group=‘mixed-biome’，derived_signals 恒为空（派生后算）。
- rawEvents 本地容量 600 条；曝光为批量事件。
- 抽屉保留数据与隐私面板：研究开关、导出、匿名化删除请求。

## 生产实现时必须替换的模拟层

| 当前模拟 | 生产要求 |
|---|---|
| localStorage 世界状态 | 所有长期数据经服务端 Feishu Repository |
| 本地 rawEvents | 内存缓冲 + IndexedDB 暂存，5-15 秒批量提交、幂等重试 |
| CSS 视频占位 | 飞书云空间视频，按可见性懒加载 |
| 日期种子随机视频 | 服务端推荐：兴趣/新鲜度/社交/低曝光补偿/区域语义/实验组动态选取槽位 |
| 无 NPC 跟价和发布者定价 | 服务端独立 Bid / Transaction / BasePrice 记录 |
| 任意账户可进入 | 服务端认证、Session、16+ 校验 |

## 仍需外部条件

飞书凭证与云目录、正式视频素材、法律文本、伦理审批信息、生产部署、推荐权重与实验规则。

## 不实现

真实支付与授权、实时多人同步、任务中心与排行榜、NPC 冒充真人、强制事件或未完成压力。
