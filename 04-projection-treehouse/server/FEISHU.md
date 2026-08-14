# 飞书生产 Repository 配置

生产环境必须使用飞书 Repository。浏览器只访问本项目 `/api/*`，不能获得飞书 App Secret、tenant access token、表格 token 或云空间 token。

## 环境变量

```text
NODE_ENV=production
ZHERE_REPOSITORY=feishu
FEISHU_APP_ID=
FEISHU_APP_SECRET=
FEISHU_BITABLE_APP_TOKEN=
FEISHU_DRIVE_FOLDER_TOKEN=
FEISHU_TABLE_USERS=
FEISHU_TABLE_SESSIONS=
FEISHU_TABLE_WORLD_STATES=
FEISHU_TABLE_ASSETS=
FEISHU_TABLE_PUBLIC_ASSETS=
FEISHU_TABLE_PUBLIC_DEMANDS=
FEISHU_TABLE_PUBLIC_RESPONSES=
FEISHU_TABLE_PUBLIC_RECORDS=
FEISHU_TABLE_REPORTS=
FEISHU_TABLE_EVENTS=
FEISHU_TABLE_PASSWORD_RESETS=
FEISHU_TABLE_BIDS=
FEISHU_TABLE_TRANSACTIONS=
FEISHU_TABLE_BASE_PRICES=
FEISHU_TABLE_BASE_PRICE_VERSIONS=
FEISHU_TABLE_BID_ATTEMPTS=
FEISHU_TABLE_RESEARCH_SUBJECTS=
FEISHU_TABLE_RESEARCH_CONSENTS=
FEISHU_TABLE_RESEARCH_SESSIONS=
FEISHU_TABLE_RESEARCH_RECOMMENDATION_REQUESTS=
FEISHU_TABLE_RESEARCH_RECOMMENDATION_CANDIDATES=
FEISHU_TABLE_RESEARCH_RECOMMENDATION_IMPRESSIONS=
ZHERE_ADMIN_IDENTITIES=admin@example.com
ZHERE_PUBLIC_WRITE_LIMIT=60
ZHERE_PUBLIC_WORLD_CACHE_TTL_MS=3000
ZHERE_SLOW_REQUEST_THRESHOLD_MS=1500
FEISHU_READ_CACHE_TTL_MS=3000
ZHERE_SESSION_COOKIE_SECURE=auto
BASE_PRICE_TRANSACTION_COUNT=10
RESEARCH_CONSENT_VERSION=research-v1
```

`ZHERE_PUBLIC_WORLD_CACHE_TTL_MS` 会让不同在线用户复用同一份短时公共世界快照；任何公共内容写入成功后缓存会立即失效。`ZHERE_SLOW_REQUEST_THRESHOLD_MS` 控制服务端慢请求日志阈值，设为 `0` 可关闭。`FEISHU_READ_CACHE_TTL_MS` 控制 Repository 表读取缓存，三者都只影响性能，不改变研究数据和业务规则。

`ZHERE_SESSION_COOKIE_SECURE=auto` 会在 HTTPS（含反向代理传入 `X-Forwarded-Proto: https`）时添加 `Secure`，在本机 HTTP 调试时不添加。正式公网部署也可以显式设为 `true`。

生产模式缺少任意一项时，服务会拒绝启动，避免意外退回本地存储。

## 多维表字段

第一阶段所有字段都使用文本类型；`payload_json`、`state_json` 保存 Repository 序列化结果，后续可以在不改变业务接口的前提下逐步拆成独立字段。

### users

- `user_id`
- `identity`
- `password_hash`
- `payload_json`

### sessions

- `token_hash`
- `user_id`
- `payload_json`

### world_states

- `user_id`
- `state_json`

### assets

- `asset_id`
- `user_id`
- `file_token`
- `payload_json`

### public_assets

- `asset_id`
- `owner_id`
- `status`
- `payload_json`

素材留言保存在对应公共素材的 `payload_json.comments` 中；只有留言者本人可删除。

### public_demands

- `demand_id`
- `owner_id`
- `status`
- `payload_json`

### public_responses

- `response_id`
- `demand_id`
- `owner_id`
- `payload_json`

### public_records

- `record_id`
- `kind`
- `owner_id`
- `status`
- `payload_json`

用于保存跨用户素材关系、长椅留言、漂流瓶回应和关注等公共互动。

### reports

- `report_id`
- `reporter_id`
- `target_type`
- `target_id`
- `status`
- `payload_json`

`ZHERE_ADMIN_IDENTITIES` 使用逗号分隔管理员登录邮箱或手机号；只有这些账户能够读取举报队列、隐藏内容和更新处理状态。

### events

- `event_id`
- `actor_id`
- `research_subject_id`
- `raw_event`
- `created_at`
- `payload_json`

### research_subjects

- `subject_id`
- `user_id`
- `source_system`
- `status`
- `payload_json`

`subject_id` 是独立随机生成的研究标识；推荐与定价研究数据应使用它，而不是邮箱、手机号或可读用户名。

### research_consents

- `consent_id`
- `user_id`
- `subject_id`
- `consent_version`
- `research_allowed`
- `effective_at`
- `payload_json`

每次注册选择或设置页修改都会新增一条授权历史，不覆盖旧记录。

### research_sessions

- `session_id`
- `user_id`
- `subject_id`
- `started_at`
- `ended_at`
- `payload_json`

### password_resets

- `reset_id`
- `identity`
- `payload_json`

### bids

- `bid_id`
- `user_id`
- `material_id`
- `bid_time`
- `bid_price`
- `bid_status`
- `idempotency_key`
- `payload_json`

所有有效报价由系统直接接受。`idempotency_key` 只用于避免网络重试生成重复报价；发布者不能接受、拒绝或修改报价。

### transactions

- `transaction_id`
- `bid_id`
- `user_id`
- `material_id`
- `transaction_time`
- `bid_price`
- `transaction_price`
- `is_valid`
- `payload_json`

### base_prices

- `material_id`
- `base_price`
- `valid_transaction_count`
- `formed_at`
- `payload_json`

`base_price` 只使用按 `transaction_time` 升序排列的最早 `BASE_PRICE_TRANSACTION_COUNT` 笔有效 `transaction_price` 计算；数量不足时为 `null`。

### base_price_versions

- `material_id`
- `version`
- `base_price`
- `formed`
- `transaction_id`
- `payload_json`

不可变基础价版本历史。每笔有效成交追加一条「当时」的快照（`transaction_id` 指向触发成交，`formed=false`）；当基础价首次从 `null` 变为数值时，额外追加一条 formation 版本（`formed=true`，`transaction_id` 为空）。`version` 对每个素材严格递增。

### bid_attempts

- `event_id`
- `user_id`
- `asset_id`
- `attempt_kind`
- `payload_json`

由 `bid_attempt`、`bid_abandon`、`bid_validation_failed` 三类事件投影而来，一行一条；`attempt_kind` 保存事件类型，`payload_json` 保存 `reason`、`open_duration_ms` 等字段。

### research_recommendation_requests

- `request_id`
- `user_id`
- `subject_id`
- `payload_json`

一次推荐请求一行；`payload_json` 保存 `created_at`、`zone_slots`、`candidate_count`、`details_json`。

### research_recommendation_candidates

- `request_id`
- `asset_id`
- `payload_json`

每个推荐候选一行；`payload_json` 保存 `rank`、`zone_id`、`spawn_source`、`recommendation_score`、`chosen` 等。

### research_recommendation_impressions

- `impression_id`
- `request_id`
- `asset_id`
- `payload_json`

`impression_batch` 中嵌套的曝光被拆成一行一次；`request_id` 即推荐请求 id，`payload_json` 保存完整曝光字段。

## 研究采集状态

- 设置页读取 `/api/privacy/research-status`，显示“正常采集、等待首条事件、已暂停”状态。
- 账户数据导出包含匿名研究主体与完整授权历史。
- 管理员研究导出：`/api/admin/research/events.csv`（事件明细）、`/api/admin/research/recommendations.csv`（推荐三表 join 视图）、`/api/admin/research/snapshot`（带 sha256 前 16 位的可复现快照）、`/api/admin/research/health`（含推荐/报价/告警汇总）。
- 本地开发不要同时启动两个指向同一 `ZHERE_DATA_DIR` 的服务；需要并行实例时，为每个进程配置不同的数据目录。
- 飞书生产模式需要额外创建 `research_subjects`、`research_consents`、`research_sessions`、`research_recommendation_requests`、`research_recommendation_candidates`、`research_recommendation_impressions`、`bid_attempts`、`base_price_versions` 表，并将对应 Table ID 写入环境变量。

## 端到端验证记录

2026-08-14 已在真实飞书环境跑通全部启动检查步骤（`npm run feishu:e2e`，脚本 `scripts/feishu-e2e-verify.mjs`）：

- 注册/登录、世界状态持久化与 `409 world-state-conflict` 保护、媒体上传与元数据落库、公共素材/需求发布、跨账户点赞/标签/评论/回应/通知、举报与管理员隐藏/恢复、报价成交与重复购买拦截、事件批量落表与 `event_id` 幂等、登出与重新登录，共 11 步全部通过（业务对象测试后自动清理）。
- 五张新表在真实多维表中按行写入：推荐请求 1 行、候选 3 行、曝光 2 行（`impression_batch` 拆行）、`bid_attempts` 三类各 1 行、成交后 `base_price_versions` 追加版本行；管理员 `recommendations.csv` / `snapshot` / `health` / 定价 CSV 新列均返回预期数据。
- 运行前需在进程环境追加 QA 管理员身份：`ZHERE_ADMIN_IDENTITIES="admin@example.com,qa-e2e-admin@example.com"`（脚本使用固定身份 `qa-e2e-admin@example.com`，密码见脚本常量；仅用于验证，正式环境请从 `ZHERE_ADMIN_IDENTITIES` 移除）。
- 飞书写接口单次延迟约 2.4–4.4 秒，`ZHERE_SLOW_REQUEST_THRESHOLD_MS=1500` 会对大多数飞书写请求产生慢请求日志；若希望减少日志量，可将该值调高（如 `8000`），不影响任何数据语义。

## 飞书权限

应用需要：

- 多维表格记录读取、创建、更新和删除权限
- 云空间素材上传与下载权限
- 对目标多维表格和目标云空间文件夹的访问权限

## 启动检查

1. 在开发环境先运行 `node --test server/**/*.test.mjs`。
2. 设置全部飞书环境变量。
3. 启动 `node server/server.mjs`。
4. 访问 `/api/health`，确认 `repository` 为 `feishu` 且返回 `ok: true`。服务启动时会逐一检查全部多维表和云空间文件夹；令牌失效、表格无权限或文件夹不可访问都会阻止生产服务以“看似正常”的状态运行。
5. 注册测试账户，确认 `users`、`sessions` 生成记录。
6. 移动并刷新页面，确认 `world_states` 能恢复。
7. 上传短视频，确认云空间产生文件且 `assets` 写入 `file_token`。
8. 发布素材和需求，确认 `public_assets`、`public_demands` 产生记录。
9. 使用第二个账户留言、点赞、贴标签、建立素材关系并回应需求，确认公共快照对两个账户一致，且 `public_responses`、`public_records` 产生记录。
10. 用普通账户举报一条公共内容，再用管理员账户确认 `reports` 出现记录并能隐藏目标内容。
11. 等待 8 秒，确认 `events` 收到批量事件且重复 `event_id` 不会再次写入。

项目根目录提供 `.env.example` 作为变量清单。不要在仓库中创建包含真实密钥的 `.env`，生产环境优先使用部署平台的 Secret/环境变量管理功能。

## 失败恢复与并发说明

- 飞书 API 遇到限流、网关错误或临时服务异常时会指数退避重试；访问令牌失效时会刷新令牌后重试。
- 用户、Session、世界状态、个人素材、报价与事件等点查使用多维表格服务端筛选；公共世界快照仍按分页读取并由接口生成增量 tombstone。
- 世界状态按 `baseVersion` 校验；旧页面提交不会覆盖已经保存的新版本，客户端收到 `409 world-state-conflict` 后必须选择载入服务端进度或明确强制保留本页进度。
- 视频读取转发 HTTP Range。飞书下载接口若返回完整文件，服务端会流式跳过无关字节后再响应所需区间，避免一次性分配整段视频 Buffer。
- 同一 Node.js 进程内，对同一公共素材、需求或记录的写入会按业务键串行化，避免点赞、标签和回应互相覆盖。
- 如果部署多个 Node.js 实例，仍建议先让请求通过同一实例，或在外层增加分布式锁；飞书多维表本身不提供本项目所需的跨实例事务。
