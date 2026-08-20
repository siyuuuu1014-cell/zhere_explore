# 推荐研究九表：飞书建表与游戏数据投影规范

> 实现状态：已提供幂等建表与异步投影脚本。先运行 `npm run feishu:recommendation:tables:audit`，再运行 `npm run feishu:recommendation:tables:create`；把输出的 9 个 Table ID 写入 `.env`，最后运行 `npm run research:recommendation:sync:audit` 与 `npm run research:recommendation:sync`。

## 1. 来源与目标

本规范以飞书文档 `Recommendation System Design` 第 3 部分的九张嵌入表为最终字段格式依据，并用 `D:\dev\projects\datasets_collection\data\recommendation` 下 9 张 CSV 校验字段完整性。目标不是把九张表横向拼成一张宽表，而是在飞书中建立九张相互关联的研究表，并由当前游戏的账户、公共素材、个人需求、商业需求、互动事件、推荐曝光和报价交易持续生成数据。

统一规则：

- 文档标记为 UUID 的标识符生成稳定 RFC 4122 UUID；同一业务对象跨表使用同一个研究 UUID。
- String、JSON 数组和长文本使用飞书「文本」。
- Int 强制为非负整数；Float / Float64 强制为有限数字；所有率限定在 `[0, 1]`。
- 时间使用「日期」。
- Boolean / Bool 使用真正布尔值和飞书「复选框」，禁止写入字符串 `"true"` 或数字 `1`。
- `content_type` 仅允许 `published_prompt`、`published_commerce`、`published_asset`。
- 所有表额外增加 `schema_version`、`snapshot_at`；四张行为聚合表再增加 `first_interacted_at`、`last_interacted_at`。
- `user_id` 在研究导出层应使用匿名研究主体 ID，不直接使用邮箱、手机号或登录账号。
- 原始逐次行为继续保存在 `events`、`research_recommendation_*`、`bids`、`transactions`；九张表是可重复生成的研究投影/快照，不替代原始事实表。

## 2. 关联关系

```text
hybrid_user_profile.user_id
  ├─ published_asset.user_id
  ├─ published_prompt.user_id
  ├─ published_commerce.user_id
  ├─ u2a_behavior.user_id
  ├─ u2p_behavior.user_id
  ├─ u2c_behavior.user_id
  └─ u2u_behavior.user_id_A / user_id_B

published_asset.asset_id
  ├─ u2a_behavior.asset_id
  ├─ u2p_behavior.asset_id（用于回应需求的素材）
  ├─ u2c_behavior.asset_id（用于回应商业合作的素材）
  └─ content_features.target_id（content_type=published_asset）

published_prompt.prompt_id
  ├─ u2p_behavior.prompt_id
  ├─ published_asset.prompt_id
  └─ content_features.target_id（content_type=published_prompt）

published_commerce.commerce_id
  ├─ u2c_behavior.commerce_id
  └─ content_features.target_id（content_type=published_commerce）
```

## 3. 九张飞书表

### hybrid_user_profile

用户画像与派生统计快照。当前游戏来源：`users`、`world_states`、`events`、`public_*`、`bids`、`transactions`。

| 字段 | 飞书类型 | 含义/项目来源 |
|---|---|---|
| user_id | 文本（主键） | 匿名研究主体 ID |
| is_active_old | 复选框 | 老用户且在活跃窗口内 |
| is_high_potential_new | 复选框 | 新用户高潜标记 |
| user_segment | 文本 | 用户分群 |
| hybrid_recommend | 文本 | 当前推荐策略及版本的 JSON 描述（项目扩展字段） |
| segment_updated_at | 日期 | 分群更新时间 |
| name | 文本 | 研究层昵称，不保存登录身份 |
| birthday | 日期 | 当前游戏未采集，默认留空 |
| level | 数字 | 当前成长等级 |
| gender | 文本 | 当前游戏未采集，默认留空 |
| intro | 文本 | 角色简介 |
| latitude | 数字 | 不建议由浏览器精确采集；默认留空 |
| longitude | 数字 | 不建议由浏览器精确采集；默认留空 |
| location | 文本 | 用户主动填写的宽泛地区；当前默认留空 |
| designation | 文本 | 职业/身份；当前默认留空 |
| experience | 文本 | 经验描述；当前默认留空 |
| goodat | 文本 | 擅长方向；可由兴趣、标签和发布内容派生 |
| purchase | 文本 | 已购买素材 ID JSON 数组 |
| assets | 文本 | 已上传素材 ID JSON 数组 |
| works | 文本 | 合作过的企业/商业项目 JSON 数组 |
| prompt | 文本 | 已发布个人需求 ID JSON 数组 |
| commerce | 文本 | 已发布商业需求 ID JSON 数组 |
| rate | 数字 | 用户综合质量/信誉评分；需版本化计算 |
| register_at | 日期 | 注册时间 |
| fans_count | 数字 | 被关注数 |
| follow_count | 数字 | 关注数 |
| liked_count | 数字 | 获赞或点赞累计，需在口径中固定其一 |
| fav_count | 数字 | 收藏累计 |
| comment_count | 数字 | 评论累计 |
| shared_count | 数字 | 分享累计 |
| updated_at | 日期 | 画像业务更新时间 |
| schema_version | 文本 | 投影结构版本 |
| snapshot_at | 日期 | 本次快照生成时间 |

### published_asset

公开视频素材快照。当前游戏来源：`assets`、`public_assets`、`bids`、`transactions`、`base_prices` 和互动事件。

| 字段 | 类型 | 含义 |
|---|---|---|
| asset_id | 文本（主键） | 素材 ID |
| user_id | 文本 | 发布者匿名研究主体 ID |
| prompt_id | 文本 | 素材回应的个人需求 ID，可空 |
| created_at | 日期 | 发布时间 |
| buyer | 文本 | 已获得一次授权的用户 ID JSON 数组 |
| amount | 数字 | 参考集语义不明确；暂保留，项目侧建议定义为有效授权次数 |
| pricing | 数字 | 当前素材价格信号/最新有效成交价 |
| average_pricing | 数字 | 有效成交均价；达到 N 笔后的基础价可单独关联 |
| average_rate | 数字 | 素材平均评分；当前无评分 UI 时留空 |
| title | 文本 | 标题 |
| description | 文本 | 描述 |
| theme | 文本 | 主题/主要标签 |
| latitude | 数字 | 素材地点纬度；当前未采集时留空 |
| longitude | 数字 | 素材地点经度；当前未采集时留空 |
| location | 文本 | 素材地点文本 |
| size | 文本 | 画面比例，如 16:9、9:16 |
| duration | 数字 | 时长（秒） |
| definition | 文本 | 分辨率，如 1080p、4K |
| like_count | 数字 | 点赞数 |
| fav_count | 数字 | 收藏数 |
| comment_count | 数字 | 评论数 |
| share_count | 数字 | 分享数 |
| view_count | 数字 | 有效曝光/打开次数，需固定统计口径 |
| schema_version | 文本 | 投影结构版本 |
| snapshot_at | 日期 | 快照时间 |

### published_prompt

个人素材需求快照。当前游戏来源：`public_demands` 中 `type=personal` 的记录及其回应/互动。

| 字段 | 类型 | 含义 |
|---|---|---|
| prompt_id | 文本（主键） | 个人需求 ID |
| user_id | 文本 | 发布者匿名研究主体 ID |
| rate | 数字 | 需求/发布者评分；当前无评分 UI 时留空 |
| participants | 文本 | 回应用户 ID JSON 数组 |
| title | 文本 | 标题 |
| description | 文本 | 描述 |
| latitude | 数字 | 纬度；默认留空 |
| longitude | 数字 | 经度；默认留空 |
| location | 文本 | 地点文本 |
| theme | 文本 | 主题 |
| duration | 数字 | 所需时长（秒） |
| size | 文本 | 所需画面比例 |
| definition | 文本 | 所需分辨率 |
| pricing | 数字 | 需求报价/预算，使用灵感币单位并作为定价信号 |
| created_at | 日期 | 发布时间 |
| start | 日期 | 开始时间 |
| stime | 文本 | 兼容参考集的开始时刻；项目内以完整 start_at 为准 |
| end | 日期 | 结束时间 |
| etime | 文本 | 兼容参考集的结束时刻；项目内以完整 end_at 为准 |
| complete | 复选框 | 是否关闭/完成 |
| like_count | 数字 | 点赞数 |
| fav_count | 数字 | 收藏数 |
| comment_count | 数字 | 评论/回应数 |
| share_count | 数字 | 分享数 |
| view_count | 数字 | 有效曝光/详情打开次数 |
| schema_version | 文本 | 投影结构版本 |
| snapshot_at | 日期 | 快照时间 |

### published_commerce

商业合作需求快照。当前游戏来源：`public_demands` 中 `type=commerce` 的记录。

| 字段 | 类型 | 含义 |
|---|---|---|
| commerce_id | 文本（主键） | 商业需求 ID |
| user_id | 文本 | 发布者匿名研究主体 ID |
| organization | 文本 | 公司名称 |
| activity | 文本 | 活动名称 |
| place | 文本 | 所在地区/地点 |
| budget | 数字 | 预算，使用灵感币并作为定价信号 |
| context | 文本 | 合作描述/背景 |
| jds | 文本 | 工作任务/合作内容 |
| requirements | 文本 | 技能要求 |
| range | 文本 | 合作范围 |
| created_at | 日期 | 发布时间 |
| start | 日期 | 开始日期 |
| stime | 文本 | 开始时刻兼容字段 |
| end | 日期 | 结束日期 |
| etime | 文本 | 结束时刻兼容字段 |
| complete | 复选框 | 是否完成/关闭 |
| like_count | 数字 | 点赞数 |
| fav_count | 数字 | 收藏数 |
| comment_count | 数字 | 回应数 |
| share_count | 数字 | 分享数 |
| view_count | 数字 | 曝光/打开数 |
| schema_version | 文本 | 投影结构版本 |
| snapshot_at | 日期 | 快照时间 |

### u2a_behavior

用户—素材累计关系，一行一个 `user_id + asset_id`。

| 字段 | 类型 | 含义 |
|---|---|---|
| behavior_id | UUID（主键） | `user_id + asset_id` 的稳定研究 UUID（项目扩展字段） |
| user_id | UUID | 匿名研究主体 ID |
| asset_id | UUID | 素材 ID |
| view | Boolean | 是否发生过有效查看 |
| like | Boolean | 当前是否点赞 |
| fav | Boolean | 当前是否收藏 |
| share | Boolean | 是否发生过分享 |
| comment | String | 关联评论 ID 的 JSON 字符串；评论正文保留在原始事实表 |
| rate | 数字 | 用户评分；当前无评分 UI 时留空 |
| buy | Boolean | 用户是否存在有效购买授权 |
| sell | Boolean | 发布者是否产生过有效授权售出 |
| first_interacted_at | 日期 | 首次互动时间 |
| last_interacted_at | 日期 | 最近互动时间 |
| schema_version | 文本 | 投影结构版本 |
| snapshot_at | 日期 | 快照时间 |

### u2p_behavior

用户—个人需求累计关系，一行一个 `user_id + prompt_id`。

| 字段 | 类型 | 含义 |
|---|---|---|
| behavior_id | 文本（主键） | 稳定哈希 |
| user_id | 文本 | 匿名研究主体 ID |
| prompt_id | 文本 | 个人需求 ID |
| view | Boolean | 是否有效浏览 |
| comment | String | 关联评论/回应 ID 的 JSON 字符串 |
| like | Boolean | 当前是否点赞 |
| fav | Boolean | 当前是否收藏 |
| share | Boolean | 是否分享 |
| rate | 数字 | 用户评分；当前无评分 UI 时留空 |
| asset_id | 文本 | 用来回应该需求的素材 ID |
| first_interacted_at | 日期 | 首次互动时间 |
| last_interacted_at | 日期 | 最近互动时间 |
| schema_version | 文本 | 投影结构版本 |
| snapshot_at | 日期 | 快照时间 |

### u2c_behavior

用户—商业需求累计关系，一行一个 `user_id + commerce_id`，字段及类型与 `u2p_behavior` 相同，仅 `prompt_id` 替换为 `commerce_id`。

| 字段 | 类型 |
|---|---|
| behavior_id | 文本（主键） |
| user_id | 文本 |
| commerce_id | 文本 |
| view | Boolean |
| comment | 文本 |
| like | Boolean |
| fav | Boolean |
| share | Boolean |
| rate | 数字 |
| asset_id | 文本 |
| first_interacted_at | 日期 |
| last_interacted_at | 日期 |
| schema_version | 文本 |
| snapshot_at | 日期 |

### u2u_behavior

用户—用户关系，一行一个有方向的 `user_id_A + user_id_B`。

| 字段 | 类型 | 含义 |
|---|---|---|
| behavior_id | 文本（主键） | 有方向关系稳定哈希 |
| user_id_A | 文本 | 行为发起者匿名研究主体 ID |
| user_id_B | 文本 | 行为接收者匿名研究主体 ID |
| follow | Boolean | 当前关注状态 |
| message | String | 关联已提交消息 ID 的 JSON 字符串；不采集未提交输入 |
| first_interacted_at | 日期 | 首次互动时间 |
| last_interacted_at | 日期 | 最近互动时间 |
| schema_version | 文本 | 投影结构版本 |
| snapshot_at | 日期 | 快照时间 |

### content_features

素材、个人需求和商业需求的内容级聚合特征，一行一个 `content_type + target_id`。

| 字段 | 类型 | 含义 |
|---|---|---|
| feature_id | UUID（主键） | `content_type + target_id` 稳定研究 UUID（项目扩展字段） |
| target_id | UUID | 内容 ID |
| content_type | 文本 | `published_asset` / `published_prompt` / `published_commerce` |
| tags | 文本 | 标签 JSON 数组或规范化分隔文本 |
| purchase_rate | Float64 | 近 72 小时 `PurchaseCount / (ViewCount + 5)` |
| like_rate | Float64 | 近 72 小时 `(LikeCount + 1) / (ViewCount + 100)` |
| fav_rate | Float64 | 近 72 小时 `(FavoriteCount + 0.5) / (ViewCount + 100)` |
| comment_rate | Float64 | 近 72 小时评论/浏览比，限制在 `[0,1]` |
| share_rate | Float64 | 近 72 小时分享/浏览比，限制在 `[0,1]` |
| updated_at | 日期 | 特征业务更新时间 |
| schema_version | 文本 | 特征计算版本 |
| snapshot_at | 日期 | 快照生成时间 |

## 4. 当前项目覆盖情况

| 研究表 | 当前可直接生成 | 仍需补充 |
|---|---|---|
| hybrid_user_profile | 注册时间、昵称、成长、兴趣、发布/购买/互动计数、关注关系 | 生日、性别、地区、职业等当前不采集；建议继续留空，除非产品明确增加自愿填写入口 |
| published_asset | 素材、发布者、标题描述、时长、比例、分辨率、互动与成交 | 地理字段、用户评分 |
| published_prompt | 个人需求全部核心字段、回应、预算、时间 | 独立点赞/收藏/分享 UI 与评分 |
| published_commerce | 商业需求全部核心字段、预算、技能、合作描述与时间 | 独立点赞/收藏/分享 UI 与评分 |
| u2a_behavior | 曝光、打开、播放、点赞、收藏、评论、购买、发布者关系 | 分享与评分 UI |
| u2p_behavior | 查看、回应素材、评论式回应 | 需求点赞、收藏、分享与评分 UI |
| u2c_behavior | 查看、回应素材、评论式回应 | 商业需求点赞、收藏、分享与评分 UI |
| u2u_behavior | follow/unfollow 事件及公共互动 | 当前没有完整私信系统；不应把未提交输入作为 message |
| content_features | 素材标签与各类互动计数 | 明确 rate 的分母、时间窗、平滑规则和特征版本 |

## 5. 不应直接混用的字段

- `published_asset.pricing`、`u2a_behavior.rate`、`published_prompt.pricing` 与现有 `bid_price`、`transaction_price`、`base_price` 含义不同，必须分别保存。
- `content_features.*_rate` 的样例值存在大于 1 的情况，因此它们不能未经定义就解释为概率；项目实现时应命名并记录特征计算版本。
- `hybrid_user_profile.purchase/assets/works/prompt/commerce` 是快照列表，不可替代 Transaction、Asset、Demand 等事实表。
- 精确经纬度、生日和性别不是推荐算法的必要前提；当前游戏没有收集时应保留空值，不应暗中推断。

## 6. 飞书建议表名与环境变量

| 飞书表名 | 环境变量 |
|---|---|
| rec_hybrid_user_profile | FEISHU_TABLE_REC_HYBRID_USER_PROFILE |
| rec_published_asset | FEISHU_TABLE_REC_PUBLISHED_ASSET |
| rec_published_prompt | FEISHU_TABLE_REC_PUBLISHED_PROMPT |
| rec_published_commerce | FEISHU_TABLE_REC_PUBLISHED_COMMERCE |
| rec_u2a_behavior | FEISHU_TABLE_REC_U2A_BEHAVIOR |
| rec_u2p_behavior | FEISHU_TABLE_REC_U2P_BEHAVIOR |
| rec_u2c_behavior | FEISHU_TABLE_REC_U2C_BEHAVIOR |
| rec_u2u_behavior | FEISHU_TABLE_REC_U2U_BEHAVIOR |
| rec_content_features | FEISHU_TABLE_REC_CONTENT_FEATURES |

## 7. 执行边界

在飞书真正创建表前，需要确定一次：仅创建空表并接入当前游戏后续数据，还是同时把参考 CSV 的历史全量数据导入飞书。历史导入会显著增加记录数量和飞书 API 调用量，而且参考数据与游戏真实用户 ID 不属于同一命名空间，不能默认混入正式采集数据。
