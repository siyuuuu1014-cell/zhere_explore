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
ZHERE_ADMIN_IDENTITIES=admin@example.com
ZHERE_PUBLIC_WRITE_LIMIT=60
```

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
- `raw_event`
- `created_at`
- `payload_json`

### password_resets

- `reset_id`
- `identity`
- `payload_json`

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

## 失败恢复与并发说明

- 飞书 API 遇到限流、网关错误或临时服务异常时会指数退避重试；访问令牌失效时会刷新令牌后重试。
- 同一 Node.js 进程内，对同一公共素材、需求或记录的写入会按业务键串行化，避免点赞、标签和回应互相覆盖。
- 如果部署多个 Node.js 实例，仍建议先让请求通过同一实例，或在外层增加分布式锁；飞书多维表本身不提供本项目所需的跨实例事务。
