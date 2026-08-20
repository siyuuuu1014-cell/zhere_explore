# 工程脚本

脚本通过项目根目录的 `package.json` 暴露。请在本项目目录执行命令。

## 只读检查

- `npm run audit:wiring`：检查静态脚本顺序、引用和覆盖情况。
- `npm run feishu:schema:audit`：审查飞书表结构。
- `npm run pricing:data:audit`：审查定价数据质量。
- `npm run research:data:health`：检查研究数据健康状态。
- `npm run feishu:recommendation:tables:audit`：审查推荐研究表。
- `npm run research:recommendation:sync:audit`：预览推荐研究数据同步。

## 验证与运行

- `npm test`：运行服务端及数据契约测试。
- `npm run feishu:e2e`：执行飞书端到端验证。
- `npm run test:live-interactions`：执行真实交互冒烟验证。
- `npm run test:browser-proxy`：启动浏览器测试代理。

## 会修改数据的命令

以下命令会写入飞书或修复数据，执行前应确认当前 `.env` 指向的环境：

- `npm run feishu:schema:migrate`
- `npm run pricing:data:repair`
- `npm run account:reconcile`
- `npm run feishu:recommendation:tables:create`
- `npm run research:recommendation:sync`

脚本的参数与实现以 `package.json` 和对应 `.mjs` 文件为准。
