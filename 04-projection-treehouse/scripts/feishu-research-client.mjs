export async function createFeishuResearchClient(config) {
  const response = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ app_id: config.appId, app_secret: config.appSecret }), signal: AbortSignal.timeout(12000),
  });
  const auth = await response.json().catch(() => ({}));
  if (!response.ok || auth.code) throw new Error(`飞书鉴权失败：${auth.msg || response.status}`);
  async function request(path, options = {}) {
    const result = await fetch(`https://open.feishu.cn/open-apis${path}`, {
      ...options, signal: AbortSignal.timeout(options.timeoutMs || 20000),
      headers: { authorization: `Bearer ${auth.tenant_access_token}`, 'content-type': 'application/json', ...options.headers },
    });
    const body = await result.json().catch(() => ({}));
    if (!result.ok || body.code) throw new Error(`飞书请求失败 [${body.code || result.status}]：${body.msg || result.status}`);
    return body.data || {};
  }
  async function list(path, pageSize = 100) {
    const items = []; let pageToken = '';
    do {
      const query = new URLSearchParams({ page_size: String(pageSize) });
      if (pageToken) query.set('page_token', pageToken);
      const data = await request(`${path}?${query}`); items.push(...(data.items || []));
      pageToken = data.has_more ? data.page_token : '';
    } while (pageToken);
    return items;
  }
  return { request, list };
}

export function feishuFieldValue(field, value) {
  if (value == null || value === '') return field.type === 2 ? null : field.type === 5 ? null : '';
  if (field.type === 2) return Number(value);
  if (field.type === 5) { const timestamp = typeof value === 'number' ? value : Date.parse(value); return Number.isFinite(timestamp) ? timestamp : null; }
  if (field.type === 7) return value === true || value === 'true';
  return typeof value === 'string' ? value : JSON.stringify(value);
}
