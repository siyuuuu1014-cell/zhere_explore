import { randomUUID } from 'node:crypto';

const RETRYABLE_CODES = new Set([99991400, 1254290, 1061045]);
const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export class FeishuRepository {
  constructor(config) {
    this.config = config;
    this.token = null;
    this.tokenExpiresAt = 0;
    this.locks = new Map();
  }

  async init() {
    const required = [this.config.appId, this.config.appSecret, this.config.bitableAppToken, this.config.driveFolderToken, ...Object.values(this.config.tables)];
    if (required.some((value) => !value)) throw new Error('Feishu configuration is incomplete.');
    await this.healthCheck();
  }

  async #withLock(key, operation) {
    const previous = this.locks.get(key) || Promise.resolve();
    const next = previous.catch(() => {}).then(operation);
    this.locks.set(key, next);
    try { return await next; } finally { if (this.locks.get(key) === next) this.locks.delete(key); }
  }

  async #accessToken() {
    if (this.token && Date.now() < this.tokenExpiresAt) return this.token;
    let response; let body;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      try {
        response = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
          method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(12000),
          body: JSON.stringify({ app_id: this.config.appId, app_secret: this.config.appSecret }),
        });
        body = await response.json();
        if (response.ok && !body.code) break;
        if (response.status < 500 && response.status !== 429) throw new Error(`Feishu auth failed: ${body.msg || response.status}`);
      } catch (error) {
        if (attempt === 3) throw error;
      }
      await wait(250 * (2 ** attempt) + Math.floor(Math.random() * 120));
    }
    if (!response?.ok || body?.code) throw new Error(`Feishu auth failed: ${body?.msg || response?.status || 'network-error'}`);
    this.token = body.tenant_access_token;
    this.tokenExpiresAt = Date.now() + Math.max(60, body.expire - 120) * 1000;
    return this.token;
  }

  async #request(path, options = {}) {
    let lastError;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        const token = await this.#accessToken();
        const response = await fetch(`https://open.feishu.cn/open-apis${path}`, {
          ...options, signal: options.signal || AbortSignal.timeout(15000),
          headers: { authorization: `Bearer ${token}`, ...(options.body instanceof FormData ? {} : { 'content-type': 'application/json' }), ...options.headers },
        });
        const body = await response.json().catch(() => ({}));
        if (response.ok && !body.code) return body.data;
        if (response.status === 401 || body.code === 99991663) { this.token = null; this.tokenExpiresAt = 0; }
        const retryable = response.status === 429 || response.status >= 500 || RETRYABLE_CODES.has(Number(body.code));
        const error = new Error(`Feishu request failed: ${body.msg || response.status}`);
        error.status = response.status; error.feishuCode = body.code;
        if (!retryable) throw error;
        lastError = error;
        const retryAfter = Number(response.headers.get('retry-after')) * 1000;
        await wait(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 300 * (2 ** attempt) + Math.floor(Math.random() * 160));
      } catch (error) {
        lastError = error;
        if (error.status && error.status < 500 && error.status !== 429 && !RETRYABLE_CODES.has(Number(error.feishuCode))) throw error;
        if (attempt < 4) await wait(300 * (2 ** attempt) + Math.floor(Math.random() * 160));
      }
    }
    throw lastError || new Error('Feishu request failed after retries.');
  }

  #tablePath(table) {
    return `/bitable/v1/apps/${this.config.bitableAppToken}/tables/${this.config.tables[table]}/records`;
  }

  async #records(table) {
    const records = [];
    let pageToken = '';
    do {
      const query = new URLSearchParams({ page_size: '500' });
      if (pageToken) query.set('page_token', pageToken);
      const data = await this.#request(`${this.#tablePath(table)}?${query}`);
      records.push(...(data.items || []));
      pageToken = data.has_more ? data.page_token : '';
    } while (pageToken);
    return records;
  }

  async #find(table, field, value) {
    return (await this.#records(table)).find((record) => this.#plain(record.fields?.[field]) === value) || null;
  }

  #plain(value) {
    if (Array.isArray(value)) return value.map((entry) => typeof entry === 'object' ? entry.text || entry.name || '' : entry).join('');
    if (value && typeof value === 'object') return value.text || value.name || String(value);
    return value == null ? '' : String(value);
  }

  async #create(table, fields) {
    const data = await this.#request(this.#tablePath(table), { method: 'POST', body: JSON.stringify({ fields }) });
    return data.record;
  }

  async #update(table, recordId, fields) {
    const data = await this.#request(`${this.#tablePath(table)}/${recordId}`, { method: 'PUT', body: JSON.stringify({ fields }) });
    return data.record;
  }

  async healthCheck() {
    await this.#accessToken();
    await Promise.all(Object.keys(this.config.tables).map((table) => this.#request(`${this.#tablePath(table)}?page_size=1`)));
    const folder = await this.#request(`/drive/explorer/v2/folder/${encodeURIComponent(this.config.driveFolderToken)}/meta`);
    return { ok: true, storage: 'feishu', folder: folder?.name || '', checkedAt: new Date().toISOString() };
  }

  #decodeUser(record) {
    if (!record) return null;
    const fields = record.fields;
    return { ...JSON.parse(this.#plain(fields.payload_json) || '{}'), id: this.#plain(fields.user_id), identity: this.#plain(fields.identity), passwordHash: this.#plain(fields.password_hash), _recordId: record.record_id };
  }

  async findUserByIdentity(identity) { return this.#decodeUser(await this.#find('users', 'identity', identity)); }
  async getUser(id) { return this.#decodeUser(await this.#find('users', 'user_id', id)); }
  async createUser(user) {
    const record = await this.#create('users', { user_id: user.id, identity: user.identity, password_hash: user.passwordHash || '', payload_json: JSON.stringify(user) });
    return { ...user, _recordId: record.record_id };
  }
  async updateUser(user) {
    const record = user._recordId ? { record_id: user._recordId } : await this.#find('users', 'user_id', user.id);
    if (!record) return null;
    await this.#update('users', record.record_id, { identity: user.identity, password_hash: user.passwordHash || '', payload_json: JSON.stringify(user) });
    return user;
  }
  async createSession(session) { await this.#create('sessions', { token_hash: session.tokenHash, user_id: session.userId, payload_json: JSON.stringify(session) }); return session; }
  async getSession(tokenHash) { const record = await this.#find('sessions', 'token_hash', tokenHash); return record ? JSON.parse(this.#plain(record.fields.payload_json)) : null; }
  async deleteSession(tokenHash) { const record = await this.#find('sessions', 'token_hash', tokenHash); if (record) await this.#request(`${this.#tablePath('sessions')}/${record.record_id}`, { method: 'DELETE' }); }
  async deleteSessionsByUser(userId) {
    const records = (await this.#records('sessions')).filter((record) => this.#plain(record.fields?.user_id) === userId);
    for (const record of records) await this.#request(`${this.#tablePath('sessions')}/${record.record_id}`, { method: 'DELETE' });
  }
  async getWorldState(userId) { const record = await this.#find('worldStates', 'user_id', userId); return record ? { ...JSON.parse(this.#plain(record.fields.state_json)), _recordId: record.record_id } : null; }
  async saveWorldState(userId, state) {
    const previous = await this.getWorldState(userId);
    const next = { userId, version: (previous?.version || 0) + 1, state, updatedAt: new Date().toISOString() };
    const fields = { user_id: userId, state_json: JSON.stringify(next) };
    if (previous?._recordId) await this.#update('worldStates', previous._recordId, fields); else await this.#create('worldStates', fields);
    return next;
  }
  async saveMedia({ userId, assetId, title, description, fileName, mime, bytes }) {
    const form = new FormData();
    form.set('file_name', fileName);
    form.set('parent_type', 'explorer');
    form.set('parent_node', this.config.driveFolderToken);
    form.set('size', String(bytes.length));
    form.set('file', new Blob([bytes], { type: mime }), fileName);
    const drive = await this.#request('/drive/v1/files/upload_all', { method: 'POST', body: form });
    const asset = { id: assetId, userId, title, description, fileName, mime, size: bytes.length, storageKey: drive.file_token, createdAt: new Date().toISOString() };
    await this.#create('assets', { asset_id: assetId, user_id: userId, file_token: drive.file_token, payload_json: JSON.stringify(asset) });
    return asset;
  }
  async getMedia(assetId) { const record = await this.#find('assets', 'asset_id', assetId); return record ? JSON.parse(this.#plain(record.fields.payload_json)) : null; }
  async listMediaByUser(userId) { return (await this.#records('assets')).map((record) => JSON.parse(this.#plain(record.fields.payload_json) || '{}')).filter((asset) => asset.userId === userId); }
  async listPublicAssets({ includeDeleted = false } = {}) { return (await this.#records('publicAssets')).map((record) => JSON.parse(this.#plain(record.fields.payload_json) || '{}')).filter((asset) => includeDeleted || (asset.status === 'published' && asset.moderationStatus !== 'hidden')); }
  async getPublicAsset(assetId) { return (await this.listPublicAssets()).find((asset) => asset.id === assetId) || null; }
  async savePublicAsset(record) {
    const existing = await this.#find('publicAssets', 'asset_id', record.id);
    if (existing) {
      const previous = JSON.parse(this.#plain(existing.fields.payload_json) || '{}');
      if (previous.ownerId !== record.ownerId) throw new Error('public-asset-owner-conflict');
      await this.#update('publicAssets', existing.record_id, { owner_id: record.ownerId, status: record.status, payload_json: JSON.stringify({ ...previous, ...record }) });
      return { ...previous, ...record };
    }
    await this.#create('publicAssets', { asset_id: record.id, owner_id: record.ownerId, status: record.status, payload_json: JSON.stringify(record) });
    return record;
  }
  async updatePublicAsset(assetId, ownerId, patch) {
    return this.#withLock(`asset:${assetId}`, async () => {
      const existing = await this.#find('publicAssets', 'asset_id', assetId);
      if (!existing) return null;
      const asset = JSON.parse(this.#plain(existing.fields.payload_json) || '{}');
      if (asset.ownerId !== ownerId) return false;
      Object.assign(asset, patch, { version: Number(asset.version || 0) + 1, updatedAt: new Date().toISOString() });
      await this.#update('publicAssets', existing.record_id, { status: asset.status, payload_json: JSON.stringify(asset) });
      return asset;
    });
  }
  async setPublicAssetReaction(assetId, userId, liked) {
    return this.#withLock(`asset:${assetId}`, async () => {
      const existing = await this.#find('publicAssets', 'asset_id', assetId);
      if (!existing) return null;
      const asset = JSON.parse(this.#plain(existing.fields.payload_json) || '{}');
      const likedBy = new Set(asset.likedBy || []);
      if (liked) likedBy.add(userId); else likedBy.delete(userId);
      asset.likedBy = [...likedBy]; asset.likes = asset.likedBy.length;
      asset.version = Number(asset.version || 0) + 1; asset.updatedAt = new Date().toISOString();
      await this.#update('publicAssets', existing.record_id, { payload_json: JSON.stringify(asset) });
      return asset;
    });
  }
  async setPublicAssetTag(assetId, userId, tag, active) {
    return this.#withLock(`asset:${assetId}`, async () => {
      const existing = await this.#find('publicAssets', 'asset_id', assetId);
      if (!existing) return null;
      const asset = JSON.parse(this.#plain(existing.fields.payload_json) || '{}');
      asset.tagRecords ||= [];
      let record = asset.tagRecords.find((item) => item.tag === tag);
      if (!record && active) { record = { tag, userIds: [] }; asset.tagRecords.push(record); }
      if (record) { const users = new Set(record.userIds || []); if (active) users.add(userId); else users.delete(userId); record.userIds = [...users]; }
      asset.tagRecords = asset.tagRecords.filter((item) => item.userIds.length);
      asset.tags = asset.tagRecords.map((item) => item.tag);
      asset.version = Number(asset.version || 0) + 1; asset.updatedAt = new Date().toISOString();
      await this.#update('publicAssets', existing.record_id, { payload_json: JSON.stringify(asset) });
      return asset;
    });
  }
  async createPublicAssetComment(assetId, record) {
    return this.#withLock(`asset:${assetId}`, async () => {
      const existing = await this.#find('publicAssets', 'asset_id', assetId);
      if (!existing) return null;
      const asset = JSON.parse(this.#plain(existing.fields.payload_json) || '{}');
      if (asset.status !== 'published') return null;
      asset.comments ||= [];
      const duplicate = asset.comments.find((comment) => comment.id === record.id);
      if (duplicate) return duplicate;
      asset.comments.push(record);
      asset.version = Number(asset.version || 0) + 1; asset.updatedAt = new Date().toISOString();
      await this.#update('publicAssets', existing.record_id, { payload_json: JSON.stringify(asset) });
      return record;
    });
  }
  async deletePublicAssetComment(assetId, commentId, ownerId) {
    return this.#withLock(`asset:${assetId}`, async () => {
      const existing = await this.#find('publicAssets', 'asset_id', assetId);
      if (!existing) return null;
      const asset = JSON.parse(this.#plain(existing.fields.payload_json) || '{}');
      const comment = (asset.comments || []).find((item) => item.id === commentId);
      if (!comment || comment.ownerId !== ownerId) return false;
      asset.comments = (asset.comments || []).filter((item) => item.id !== commentId && item.parentId !== commentId);
      asset.version = Number(asset.version || 0) + 1; asset.updatedAt = new Date().toISOString();
      await this.#update('publicAssets', existing.record_id, { payload_json: JSON.stringify(asset) });
      return true;
    });
  }
  async updatePublicAssetComment(assetId, commentId, ownerId, text) {
    return this.#withLock(`asset:${assetId}`, async () => {
      const existing = await this.#find('publicAssets', 'asset_id', assetId);
      if (!existing) return null;
      const asset = JSON.parse(this.#plain(existing.fields.payload_json) || '{}');
      const comment = (asset.comments || []).find((item) => item.id === commentId);
      if (!comment || comment.ownerId !== ownerId) return false;
      comment.text = text; comment.editedAt = new Date().toISOString();
      asset.version = Number(asset.version || 0) + 1; asset.updatedAt = comment.editedAt;
      await this.#update('publicAssets', existing.record_id, { payload_json: JSON.stringify(asset) });
      return comment;
    });
  }
  async listPublicDemands({ includeDeleted = false } = {}) {
    const [demands, responses] = await Promise.all([this.#records('publicDemands'), this.#records('publicResponses')]);
    const decodedResponses = responses.map((record) => JSON.parse(this.#plain(record.fields.payload_json) || '{}')).filter((response) => includeDeleted || (response.status !== 'deleted' && response.moderationStatus !== 'hidden'));
    return demands.map((record) => JSON.parse(this.#plain(record.fields.payload_json) || '{}')).filter((demand) => includeDeleted || (demand.status !== 'deleted' && demand.moderationStatus !== 'hidden')).map((demand) => ({ ...demand, responses: decodedResponses.filter((response) => response.demandId === demand.id) }));
  }
  async getPublicDemand(demandId) { return (await this.listPublicDemands()).find((demand) => demand.id === demandId) || null; }
  async savePublicDemand(record) {
    const existing = await this.#find('publicDemands', 'demand_id', record.id);
    if (existing) {
      const previous = JSON.parse(this.#plain(existing.fields.payload_json) || '{}');
      if (previous.ownerId !== record.ownerId) throw new Error('public-demand-owner-conflict');
      await this.#update('publicDemands', existing.record_id, { owner_id: record.ownerId, status: record.status, payload_json: JSON.stringify({ ...previous, ...record }) });
      return { ...previous, ...record };
    }
    await this.#create('publicDemands', { demand_id: record.id, owner_id: record.ownerId, status: record.status, payload_json: JSON.stringify(record) });
    return record;
  }
  async deletePublicDemand(demandId, ownerId) {
    const existing = await this.#find('publicDemands', 'demand_id', demandId);
    if (!existing) return false;
    const demand = JSON.parse(this.#plain(existing.fields.payload_json) || '{}');
    if (demand.ownerId !== ownerId) return false;
    demand.status = 'deleted'; demand.updatedAt = new Date().toISOString();
    await this.#update('publicDemands', existing.record_id, { status: 'deleted', payload_json: JSON.stringify(demand) });
    return true;
  }
  async createPublicResponse(record) {
    const existing = await this.#find('publicResponses', 'response_id', record.id);
    if (existing) return JSON.parse(this.#plain(existing.fields.payload_json) || '{}');
    await this.#create('publicResponses', { response_id: record.id, demand_id: record.demandId, owner_id: record.ownerId, payload_json: JSON.stringify(record) });
    return record;
  }
  async updatePublicResponse(responseId, ownerId, patch) {
    return this.#withLock(`response:${responseId}`, async () => {
      const existing = await this.#find('publicResponses', 'response_id', responseId);
      if (!existing) return null;
      const response = JSON.parse(this.#plain(existing.fields.payload_json) || '{}');
      if (response.ownerId !== ownerId) return false;
      Object.assign(response, patch, { updatedAt: new Date().toISOString() });
      await this.#update('publicResponses', existing.record_id, { payload_json: JSON.stringify(response) });
      return response;
    });
  }
  async savePublicRecord(record) {
    return this.#withLock(`record:${record.id}`, async () => {
      const existing = await this.#find('publicRecords', 'record_id', record.id);
      if (existing) {
        const previous = JSON.parse(this.#plain(existing.fields.payload_json) || '{}');
        if (previous.ownerId !== record.ownerId) return false;
        const updated = { ...previous, ...record, updatedAt: new Date().toISOString() };
        await this.#update('publicRecords', existing.record_id, { kind: updated.kind, owner_id: updated.ownerId, status: updated.status, payload_json: JSON.stringify(updated) });
        return updated;
      }
      await this.#create('publicRecords', { record_id: record.id, kind: record.kind, owner_id: record.ownerId, status: record.status, payload_json: JSON.stringify(record) });
      return record;
    });
  }
  async listPublicRecords({ includeDeleted = false } = {}) {
    return (await this.#records('publicRecords')).map((record) => JSON.parse(this.#plain(record.fields.payload_json) || '{}')).filter((record) => includeDeleted || (record.status !== 'deleted' && record.moderationStatus !== 'hidden'));
  }
  async deletePublicRecord(recordId, ownerId) {
    return this.#withLock(`record:${recordId}`, async () => {
      const existing = await this.#find('publicRecords', 'record_id', recordId);
      if (!existing) return null;
      const record = JSON.parse(this.#plain(existing.fields.payload_json) || '{}');
      if (record.ownerId !== ownerId) return false;
      record.status = 'deleted'; record.updatedAt = new Date().toISOString();
      await this.#update('publicRecords', existing.record_id, { status: 'deleted', payload_json: JSON.stringify(record) });
      return true;
    });
  }
  async createReport(record) {
    await this.#create('reports', { report_id: record.id, reporter_id: record.reporterId, target_type: record.targetType, target_id: record.targetId, status: record.status, payload_json: JSON.stringify(record) });
    return record;
  }
  async listReports() { return (await this.#records('reports')).map((record) => JSON.parse(this.#plain(record.fields.payload_json) || '{}')); }
  async updateReport(reportId, patch) {
    const existing = await this.#find('reports', 'report_id', reportId);
    if (!existing) return null;
    const report = { ...JSON.parse(this.#plain(existing.fields.payload_json) || '{}'), ...patch, updatedAt: new Date().toISOString() };
    await this.#update('reports', existing.record_id, { status: report.status, payload_json: JSON.stringify(report) });
    return report;
  }
  async moderatePublicTarget(targetType, targetId, moderationStatus) {
    const table = { asset: 'publicAssets', demand: 'publicDemands', response: 'publicResponses', record: 'publicRecords' }[targetType];
    const idField = { asset: 'asset_id', demand: 'demand_id', response: 'response_id', record: 'record_id' }[targetType];
    if (table) {
      const existing = await this.#find(table, idField, targetId);
      if (!existing) return null;
      const payload = JSON.parse(this.#plain(existing.fields.payload_json) || '{}');
      payload.moderationStatus = moderationStatus; payload.updatedAt = new Date().toISOString();
      await this.#update(table, existing.record_id, { payload_json: JSON.stringify(payload) });
      return payload;
    }
    if (targetType === 'comment') {
      for (const assetRecord of await this.#records('publicAssets')) {
        const asset = JSON.parse(this.#plain(assetRecord.fields.payload_json) || '{}');
        const comment = (asset.comments || []).find((item) => item.id === targetId);
        if (!comment) continue;
        comment.moderationStatus = moderationStatus; comment.updatedAt = new Date().toISOString();
        asset.updatedAt = comment.updatedAt;
        await this.#update('publicAssets', assetRecord.record_id, { payload_json: JSON.stringify(asset) });
        return comment;
      }
    }
    return null;
  }
  async readMedia(asset) {
    let lastStatus = 0;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const token = await this.#accessToken();
      try {
        const response = await fetch(`https://open.feishu.cn/open-apis/drive/v1/files/${encodeURIComponent(asset.storageKey)}/download`, {
          headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20000),
        });
        lastStatus = response.status;
        if (response.ok) return Buffer.from(await response.arrayBuffer());
        if (response.status === 401) { this.token = null; this.tokenExpiresAt = 0; }
        if (response.status !== 429 && response.status < 500) break;
      } catch (error) {
        if (attempt === 4) throw error;
      }
      await wait(350 * (2 ** attempt) + Math.floor(Math.random() * 160));
    }
    throw new Error(`Feishu media download failed: ${lastStatus || 'network-error'}`);
  }
  async appendEvents(userId, events) {
    const existing = new Set((await this.#records('events')).map((record) => this.#plain(record.fields?.event_id)));
    const unique = events.filter((event) => !existing.has(event.event_id));
    if (!unique.length) return [];
    const path = `${this.#tablePath('events')}/batch_create`;
    for (let index = 0; index < unique.length; index += 500) {
      const records = unique.slice(index, index + 500).map((event) => ({ fields: { event_id: event.event_id, actor_id: userId, raw_event: event.raw_event, created_at: event.created_at, payload_json: JSON.stringify({ ...event, actor_id: userId, derived_signals: {} }) } }));
      await this.#request(path, { method: 'POST', body: JSON.stringify({ records }) });
    }
    return unique.map((event) => event.event_id);
  }
  async recentEvents(userId, limit = 200) { return (await this.#records('events')).map((record) => JSON.parse(this.#plain(record.fields.payload_json) || '{}')).filter((event) => event.actor_id === userId).slice(-limit); }
  async allEvents(userId) { return (await this.#records('events')).map((record) => JSON.parse(this.#plain(record.fields.payload_json) || '{}')).filter((event) => event.actor_id === userId); }
  async anonymizeUserData(userId) {
    const eventRecords = await this.#records('events');
    for (const record of eventRecords) {
      const event = JSON.parse(this.#plain(record.fields.payload_json) || '{}');
      if (event.actor_id !== userId) continue;
      event.details = { ...event.details, actor_name: undefined, previous_name: undefined };
      await this.#update('events', record.record_id, { payload_json: JSON.stringify(event) });
    }
    const assetRecords = await this.#records('assets');
    for (const record of assetRecords) {
      const asset = JSON.parse(this.#plain(record.fields.payload_json) || '{}');
      if (asset.userId !== userId) continue;
      asset.fileName = '匿名素材';
      await this.#update('assets', record.record_id, { payload_json: JSON.stringify(asset) });
    }
    for (const table of ['publicAssets', 'publicDemands', 'publicResponses', 'publicRecords']) {
      const records = await this.#records(table);
      for (const record of records) {
        const payload = JSON.parse(this.#plain(record.fields.payload_json) || '{}');
        if (payload.ownerId !== userId) continue;
        payload.ownerName = '匿名旅人';
        if (table === 'publicAssets') {
          payload.fileName = '';
          payload.comments = (payload.comments || []).map((comment) => comment.ownerId === userId ? { ...comment, ownerName: '匿名旅人', name: '匿名旅人' } : comment);
        }
        if (table === 'publicDemands') payload.by = '匿名旅人';
        if (table === 'publicResponses') payload.name = '匿名旅人';
        if (table === 'publicRecords') payload.name = '匿名旅人';
        await this.#update(table, record.record_id, { payload_json: JSON.stringify(payload) });
      }
    }
    const reportRecords = await this.#records('reports');
    for (const record of reportRecords) {
      const payload = JSON.parse(this.#plain(record.fields.payload_json) || '{}');
      if (payload.reporterId !== userId) continue;
      payload.reporterId = null; payload.reporterName = '匿名旅人';
      await this.#update('reports', record.record_id, { reporter_id: '', payload_json: JSON.stringify(payload) });
    }
    return true;
  }
  async createPasswordReset(record) { await this.#create('passwordResets', { reset_id: record.id || randomUUID(), identity: record.identity, payload_json: JSON.stringify(record) }); return record; }
}
