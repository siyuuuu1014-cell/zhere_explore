import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { calculateBasePrice } from '../pricing.mjs';

const RETRYABLE_CODES = new Set([99991400, 1254290, 1061045]);
const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function sliceReadable(readable, start, end) {
  return Readable.from((async function* () {
    let offset = 0;
    for await (const chunkValue of readable) {
      const chunk = Buffer.from(chunkValue);
      const chunkStart = offset;
      const chunkEnd = offset + chunk.length - 1;
      offset += chunk.length;
      if (chunkEnd < start) continue;
      if (chunkStart > end) break;
      const from = Math.max(0, start - chunkStart);
      const to = Math.min(chunk.length, end - chunkStart + 1);
      if (from < to) yield chunk.subarray(from, to);
      if (chunkEnd >= end) break;
    }
  })());
}

export class FeishuRepository {
  constructor(config) {
    this.config = config;
    this.token = null;
    this.tokenExpiresAt = 0;
    this.locks = new Map();
    this.fieldTypes = new Map();
    this.recordCache = new Map();
    this.readCacheTtlMs = Math.max(0, Number(config.readCacheTtlMs ?? 3000));
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

  async #tableFieldTypes(table) {
    if (!this.fieldTypes.has(table)) {
      this.fieldTypes.set(table, (async () => {
        const types = new Map();
        let pageToken = '';
        do {
          const query = new URLSearchParams({ page_size: '100' });
          if (pageToken) query.set('page_token', pageToken);
          const data = await this.#request(`/bitable/v1/apps/${this.config.bitableAppToken}/tables/${this.config.tables[table]}/fields?${query}`);
          for (const field of data.items || []) types.set(field.field_name, Number(field.type));
          pageToken = data.has_more ? data.page_token : '';
        } while (pageToken);
        return types;
      })());
    }
    return this.fieldTypes.get(table);
  }

  async #compatibleFields(table, fields) {
    const types = await this.#tableFieldTypes(table);
    return Object.fromEntries(Object.entries(fields).map(([name, value]) => {
      const type = types.get(name);
      if (type === 1) return [name, value == null ? '' : (typeof value === 'string' ? value : String(value))];
      if (type === 2) return [name, value === '' || value == null ? null : Number(value)];
      if (type === 5) {
        if (value === '' || value == null) return [name, null];
        const timestamp = typeof value === 'number' ? value : Date.parse(value);
        return [name, Number.isFinite(timestamp) ? timestamp : null];
      }
      if (type === 7) return [name, value === true || value === 'true'];
      return [name, value];
    }));
  }

  async #loadRecords(table) {
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

  async #records(table) {
    const cached = this.recordCache.get(table);
    if (cached && cached.expiresAt > Date.now()) return cached.promise;
    const entry = {
      expiresAt: Date.now() + this.readCacheTtlMs,
      promise: this.#loadRecords(table),
    };
    this.recordCache.set(table, entry);
    try {
      return await entry.promise;
    } catch (error) {
      if (this.recordCache.get(table) === entry) this.recordCache.delete(table);
      throw error;
    }
  }

  #invalidateRecords(table) {
    this.recordCache.delete(table);
  }

  async #find(table, field, value) {
    const records = await this.#recordsMatching(table, [{ field, value }], 'and', 1);
    return records[0] || null;
  }

  async #recordsMatching(table, conditions, conjunction = 'and', limit = Infinity) {
    const records = [];
    let pageToken = '';
    do {
      const query = new URLSearchParams({ page_size: String(Math.min(500, Number.isFinite(limit) ? Math.max(1, limit - records.length) : 500)) });
      if (pageToken) query.set('page_token', pageToken);
      const body = {
        filter: {
          conjunction,
          conditions: conditions.map(({ field, value }) => ({ field_name: field, operator: 'is', value: [String(value)] })),
        },
      };
      const data = await this.#request(`${this.#tablePath(table)}/search?${query}`, { method: 'POST', body: JSON.stringify(body) });
      records.push(...(data.items || []));
      pageToken = data.has_more && records.length < limit ? data.page_token : '';
    } while (pageToken);
    return records.slice(0, limit);
  }

  async #recordsMatchingAny(table, field, values) {
    const unique = [...new Set(values.map(String).filter(Boolean))];
    const records = [];
    for (let index = 0; index < unique.length; index += 40) {
      const chunk = unique.slice(index, index + 40).map((value) => ({ field, value }));
      records.push(...await this.#recordsMatching(table, chunk, 'or'));
    }
    return records;
  }

  #plain(value) {
    if (Array.isArray(value)) return value.map((entry) => typeof entry === 'object' ? entry.text || entry.name || '' : entry).join('');
    if (value && typeof value === 'object') return value.text || value.name || String(value);
    return value == null ? '' : String(value);
  }

  async #create(table, fields) {
    const compatible = await this.#compatibleFields(table, fields);
    const data = await this.#request(this.#tablePath(table), { method: 'POST', body: JSON.stringify({ fields: compatible }) });
    this.#invalidateRecords(table);
    return data.record;
  }

  async #update(table, recordId, fields) {
    const compatible = await this.#compatibleFields(table, fields);
    const data = await this.#request(`${this.#tablePath(table)}/${recordId}`, { method: 'PUT', body: JSON.stringify({ fields: compatible }) });
    this.#invalidateRecords(table);
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
    return this.#withLock(`identity:${user.identity}`, async () => {
      if (await this.#find('users', 'identity', user.identity)) throw new Error('identity-exists');
      const record = await this.#create('users', { user_id: user.id, identity: user.identity, password_hash: user.passwordHash || '', payload_json: JSON.stringify(user) });
      return { ...user, _recordId: record.record_id };
    });
  }
  async updateUser(user) {
    const record = user._recordId ? { record_id: user._recordId } : await this.#find('users', 'user_id', user.id);
    if (!record) return null;
    await this.#update('users', record.record_id, { identity: user.identity, password_hash: user.passwordHash || '', payload_json: JSON.stringify(user) });
    return user;
  }
  async ensureResearchSubject(userId, { sourceSystem = 'web_game', createdAt = new Date().toISOString() } = {}) {
    const existing = await this.#find('researchSubjects', 'user_id', userId);
    if (existing) return JSON.parse(this.#plain(existing.fields.payload_json) || '{}');
    const subject = { subject_id: `rs-${randomUUID()}`, user_id: userId, source_system: sourceSystem, status: 'active', created_at: createdAt, updated_at: createdAt };
    await this.#create('researchSubjects', { subject_id: subject.subject_id, user_id: userId, source_system: sourceSystem, status: subject.status, payload_json: JSON.stringify(subject) });
    return subject;
  }
  async getResearchSubject(userId) {
    const record = await this.#find('researchSubjects', 'user_id', userId);
    return record ? JSON.parse(this.#plain(record.fields.payload_json) || '{}') : null;
  }
  async recordResearchConsent(record) {
    const existing = await this.#find('researchConsents', 'consent_id', record.consent_id);
    if (existing) return JSON.parse(this.#plain(existing.fields.payload_json) || '{}');
    await this.#create('researchConsents', {
      consent_id: record.consent_id, user_id: record.user_id, subject_id: record.subject_id,
      consent_version: record.consent_version, research_allowed: record.research_allowed,
      effective_at: record.effective_at, payload_json: JSON.stringify(record),
    });
    return record;
  }
  async listResearchConsents(userId) {
    return (await this.#recordsMatching('researchConsents', [{ field: 'user_id', value: userId }])).map((record) => JSON.parse(this.#plain(record.fields.payload_json) || '{}'));
  }
  async createResearchSession(record) {
    const existing = await this.#find('researchSessions', 'session_id', record.session_id);
    if (existing) return JSON.parse(this.#plain(existing.fields.payload_json) || '{}');
    await this.#create('researchSessions', {
      session_id: record.session_id, user_id: record.user_id, subject_id: record.subject_id,
      started_at: record.started_at, payload_json: JSON.stringify(record),
    });
    return record;
  }
  async endResearchSession(sessionId, endedAt = new Date().toISOString(), endReason = 'logout') {
    const existing = await this.#find('researchSessions', 'session_id', sessionId);
    if (!existing) return null;
    const record = JSON.parse(this.#plain(existing.fields.payload_json) || '{}');
    record.ended_at ||= endedAt; record.end_reason ||= endReason;
    await this.#update('researchSessions', existing.record_id, { ended_at: record.ended_at, payload_json: JSON.stringify(record) });
    return record;
  }
  async createSession(session) { await this.#create('sessions', { token_hash: session.tokenHash, user_id: session.userId, payload_json: JSON.stringify(session) }); return session; }
  async getSession(tokenHash) { const record = await this.#find('sessions', 'token_hash', tokenHash); return record ? JSON.parse(this.#plain(record.fields.payload_json)) : null; }
  async deleteSession(tokenHash) { const record = await this.#find('sessions', 'token_hash', tokenHash); if (record) { await this.#request(`${this.#tablePath('sessions')}/${record.record_id}`, { method: 'DELETE' }); this.#invalidateRecords('sessions'); } }
  async deleteSessionsByUser(userId) {
    const records = await this.#recordsMatching('sessions', [{ field: 'user_id', value: userId }]);
    for (const record of records) await this.#request(`${this.#tablePath('sessions')}/${record.record_id}`, { method: 'DELETE' });
    if (records.length) this.#invalidateRecords('sessions');
  }
  async cleanupExpiredSessions(now = new Date().toISOString()) {
    const cutoff = Date.parse(now);
    const expired = (await this.#records('sessions')).map((record) => ({
      record,
      session: JSON.parse(this.#plain(record.fields.payload_json) || '{}'),
    })).filter(({ session }) => Date.parse(session.expiresAt) <= cutoff);
    for (const { record, session } of expired) {
      if (session.id) await this.endResearchSession(session.id, session.expiresAt || now, 'session-expired').catch(() => {});
      await this.#request(`${this.#tablePath('sessions')}/${record.record_id}`, { method: 'DELETE' });
    }
    if (expired.length) this.#invalidateRecords('sessions');
    return expired.length;
  }
  async getWorldState(userId) { const record = await this.#find('worldStates', 'user_id', userId); return record ? { ...JSON.parse(this.#plain(record.fields.state_json)), _recordId: record.record_id } : null; }
  async saveWorldState(userId, state, expectedVersion = null) {
    return this.#withLock(`world:${userId}`, async () => {
      const previous = await this.getWorldState(userId);
      const currentVersion = Number(previous?.version || 0);
      if (expectedVersion != null && Number(expectedVersion) !== currentVersion) {
        const error = new Error('world-state-conflict');
        error.code = 'world-state-conflict';
        error.current = previous || { userId, version: 0, state: null, updatedAt: null };
        throw error;
      }
      const next = { userId, version: currentVersion + 1, state, updatedAt: new Date().toISOString() };
      const fields = { user_id: userId, state_json: JSON.stringify(next) };
      if (previous?._recordId) await this.#update('worldStates', previous._recordId, fields); else await this.#create('worldStates', fields);
      return next;
    });
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
  async listMediaByUser(userId) { return (await this.#recordsMatching('assets', [{ field: 'user_id', value: userId }])).map((record) => JSON.parse(this.#plain(record.fields.payload_json) || '{}')); }
  async listPublicAssets({ includeDeleted = false } = {}) { return (await this.#records('publicAssets')).map((record) => JSON.parse(this.#plain(record.fields.payload_json) || '{}')).filter((asset) => asset.id).filter((asset) => includeDeleted || (asset.status === 'published' && asset.moderationStatus !== 'hidden')); }
  async listPublicAssetsByOwner(ownerId, { includeDeleted = false } = {}) {
    return (await this.#recordsMatching('publicAssets', [{ field: 'owner_id', value: ownerId }]))
      .map((record) => JSON.parse(this.#plain(record.fields.payload_json) || '{}'))
      .filter((asset) => includeDeleted || (asset.status === 'published' && asset.moderationStatus !== 'hidden'));
  }
  async getPublicAsset(assetId) {
    const record = await this.#find('publicAssets', 'asset_id', assetId);
    if (!record) return null;
    const asset = JSON.parse(this.#plain(record.fields.payload_json) || '{}');
    return asset.status === 'published' && asset.moderationStatus !== 'hidden' ? asset : null;
  }
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
    const responsesByDemand = Map.groupBy(decodedResponses, (response) => response.demandId);
    return demands.map((record) => JSON.parse(this.#plain(record.fields.payload_json) || '{}')).filter((demand) => demand.id).filter((demand) => includeDeleted || (demand.status !== 'deleted' && demand.moderationStatus !== 'hidden')).map((demand) => ({ ...demand, responses: responsesByDemand.get(demand.id) || [] }));
  }
  async listPublicDemandsByOwner(ownerId, { includeDeleted = false } = {}) {
    const demandRecords = await this.#recordsMatching('publicDemands', [{ field: 'owner_id', value: ownerId }]);
    const demands = demandRecords.map((record) => JSON.parse(this.#plain(record.fields.payload_json) || '{}'))
      .filter((demand) => includeDeleted || (demand.status !== 'deleted' && demand.moderationStatus !== 'hidden'));
    const responses = (await this.#recordsMatchingAny('publicResponses', 'demand_id', demands.map((demand) => demand.id)))
      .map((record) => JSON.parse(this.#plain(record.fields.payload_json) || '{}'))
      .filter((response) => includeDeleted || (response.status !== 'deleted' && response.moderationStatus !== 'hidden'));
    const responsesByDemand = Map.groupBy(responses, (response) => response.demandId);
    return demands.map((demand) => ({ ...demand, responses: responsesByDemand.get(demand.id) || [] }));
  }
  async getPublicDemand(demandId) {
    const record = await this.#find('publicDemands', 'demand_id', demandId);
    if (!record) return null;
    const demand = JSON.parse(this.#plain(record.fields.payload_json) || '{}');
    if (demand.status === 'deleted' || demand.moderationStatus === 'hidden') return null;
    const responses = (await this.#recordsMatching('publicResponses', [{ field: 'demand_id', value: demandId }]))
      .map((item) => JSON.parse(this.#plain(item.fields.payload_json) || '{}'))
      .filter((response) => response.status !== 'deleted' && response.moderationStatus !== 'hidden');
    return { ...demand, responses };
  }
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
    return (await this.#records('publicRecords')).map((record) => JSON.parse(this.#plain(record.fields.payload_json) || '{}')).filter((record) => record.id).filter((record) => includeDeleted || (record.status !== 'deleted' && record.moderationStatus !== 'hidden'));
  }
  async listPublicRecordsByOwner(ownerId, { includeDeleted = false } = {}) {
    return (await this.#recordsMatching('publicRecords', [{ field: 'owner_id', value: ownerId }]))
      .map((record) => JSON.parse(this.#plain(record.fields.payload_json) || '{}'))
      .filter((record) => includeDeleted || (record.status !== 'deleted' && record.moderationStatus !== 'hidden'));
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
  async claimPublicSwap({ offerId, user, replacementAssetId, note, newRecordId, now }) {
    return this.#withLock('swapbox:global', async () => {
      const existing = await this.#find('publicRecords', 'record_id', offerId);
      if (!existing) return null;
      const offer = JSON.parse(this.#plain(existing.fields.payload_json) || '{}');
      if (offer.kind !== 'swap_offer' || offer.status !== 'published') return null;
      if (offer.ownerId === user.id) return { ownOffer: true };
      const gainedAssetId = offer.payload?.assetId;
      if (!gainedAssetId) return null;
      if (gainedAssetId === replacementAssetId) return { sameAsset: true };
      offer.status = 'deleted';
      offer.updatedAt = now;
      offer.payload = { ...offer.payload, claimedById: user.id, claimedByName: user.nickname, claimedAt: now, replacementAssetId };
      await this.#update('publicRecords', existing.record_id, { status: 'deleted', payload_json: JSON.stringify(offer) });
      const replacement = {
        id: newRecordId, kind: 'swap_offer', ownerId: user.id, ownerName: user.nickname,
        name: user.nickname, status: 'published', moderationStatus: 'visible',
        payload: { assetId: replacementAssetId, note, by: user.nickname, npc: false },
        createdAt: now, updatedAt: now,
      };
      await this.#create('publicRecords', { record_id: replacement.id, kind: replacement.kind, owner_id: replacement.ownerId, status: replacement.status, payload_json: JSON.stringify(replacement) });
      return { gainedAssetId, claimed: offer, offer: replacement };
    });
  }
  async createReport(record) {
    await this.#create('reports', { report_id: record.id, reporter_id: record.reporterId, target_type: record.targetType, target_id: record.targetId, status: record.status, payload_json: JSON.stringify(record) });
    return record;
  }
  async listReports() { return (await this.#records('reports')).map((record) => JSON.parse(this.#plain(record.fields.payload_json) || '{}')).filter((report) => report.id); }
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
  async openMedia(asset, { start = 0, end = Number(asset.size || 0) - 1 } = {}) {
    let lastStatus = 0;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const token = await this.#accessToken();
      try {
        const response = await fetch(`https://open.feishu.cn/open-apis/drive/v1/files/${encodeURIComponent(asset.storageKey)}/download`, {
          headers: { authorization: `Bearer ${token}`, range: `bytes=${start}-${end}` }, signal: AbortSignal.timeout(20000),
        });
        lastStatus = response.status;
        if (response.ok && response.body) {
          const total = Number(String(response.headers.get('content-range') || '').split('/')[1]) || Number(asset.size || 0);
          const source = Readable.fromWeb(response.body);
          const stream = response.status === 206 ? source : sliceReadable(source, start, end);
          return { stream, size: total, start, end: Math.min(end, total - 1) };
        }
        if (response.status === 401) { this.token = null; this.tokenExpiresAt = 0; }
        if (response.status !== 429 && response.status < 500) break;
      } catch (error) {
        if (attempt === 4) throw error;
      }
      await wait(350 * (2 ** attempt) + Math.floor(Math.random() * 160));
    }
    throw new Error(`Feishu media stream failed: ${lastStatus || 'network-error'}`);
  }
  async createAcceptedBidTransaction({ bid, transaction, basePriceTransactionCount }) {
    return this.#withLock(`pricing:${bid.material_id}`, async () => {
      const [existingBidRecord, existingPurchaseRecords] = await Promise.all([
        this.#find('bids', 'idempotency_key', bid.idempotency_key),
        this.#recordsMatching('transactions', [
          { field: 'user_id', value: bid.user_id }, { field: 'material_id', value: bid.material_id },
        ]),
      ]);
      const savedBid = existingBidRecord ? JSON.parse(this.#plain(existingBidRecord.fields.payload_json) || '{}') : bid;
      const existingTransactionRecord = existingBidRecord ? await this.#find('transactions', 'bid_id', savedBid.bid_id) : null;
      if (!existingBidRecord) {
        const existingPurchase = existingPurchaseRecords
          .map((record) => JSON.parse(this.#plain(record.fields.payload_json) || '{}'))
          .find((item) => item.user_id === bid.user_id && item.material_id === bid.material_id && item.is_valid === true);
        if (existingPurchase) {
          const purchaseBidRecord = await this.#find('bids', 'bid_id', existingPurchase.bid_id);
          const pricingRecord = await this.#find('basePrices', 'material_id', bid.material_id);
          return {
            alreadyPurchased: true,
            bid: purchaseBidRecord ? JSON.parse(this.#plain(purchaseBidRecord.fields.payload_json) || '{}') : null,
            transaction: existingPurchase,
            pricing: pricingRecord ? JSON.parse(this.#plain(pricingRecord.fields.payload_json) || '{}') : null,
            duplicate: false,
          };
        }
      }
      if (!existingBidRecord) {
        await this.#create('bids', {
          bid_id: bid.bid_id, user_id: bid.user_id, material_id: bid.material_id,
          bid_time: bid.bid_time, bid_price: bid.bid_price, bid_status: bid.bid_status,
          idempotency_key: bid.idempotency_key, payload_json: JSON.stringify(bid),
        });
      }

      const savedTransaction = existingTransactionRecord
        ? JSON.parse(this.#plain(existingTransactionRecord.fields.payload_json) || '{}')
        : { ...transaction, bid_id: savedBid.bid_id };
      if (!existingTransactionRecord) {
        await this.#create('transactions', {
          transaction_id: savedTransaction.transaction_id, bid_id: savedTransaction.bid_id,
          user_id: savedTransaction.user_id, material_id: savedTransaction.material_id,
          transaction_time: savedTransaction.transaction_time, bid_price: savedTransaction.bid_price,
          transaction_price: savedTransaction.transaction_price, is_valid: savedTransaction.is_valid,
          payload_json: JSON.stringify(savedTransaction),
        });
      }

      const [materialTransactionRecords, existingPricingRecord] = await Promise.all([
        this.#recordsMatching('transactions', [{ field: 'material_id', value: savedBid.material_id }]),
        this.#find('basePrices', 'material_id', savedBid.material_id),
      ]);
      const allMaterialTransactions = materialTransactionRecords
        .map((record) => JSON.parse(this.#plain(record.fields.payload_json) || '{}'))
        .filter((item) => item.material_id === savedBid.material_id);
      const calculated = calculateBasePrice(allMaterialTransactions, basePriceTransactionCount);
      const previous = existingPricingRecord ? JSON.parse(this.#plain(existingPricingRecord.fields.payload_json) || '{}') : null;
      const now = new Date().toISOString();
      const pricing = {
        material_id: savedBid.material_id,
        base_price: calculated.base_price,
        valid_transaction_count: calculated.valid_transaction_count,
        sample_transaction_ids: calculated.sample_transaction_ids,
        formed_at: calculated.base_price == null ? null : (previous?.formed_at || now),
        updated_at: now,
      };
      const pricingFields = {
        material_id: pricing.material_id, base_price: pricing.base_price ?? '',
        valid_transaction_count: pricing.valid_transaction_count, formed_at: pricing.formed_at || '',
        payload_json: JSON.stringify(pricing),
      };
      if (existingPricingRecord) await this.#update('basePrices', existingPricingRecord.record_id, pricingFields);
      else await this.#create('basePrices', pricingFields);
      return { bid: savedBid, transaction: savedTransaction, pricing, materialTransactions: allMaterialTransactions, duplicate: Boolean(existingBidRecord && existingTransactionRecord) };
    });
  }
  async getMaterialPricing(materialId) {
    const existing = await this.#find('basePrices', 'material_id', materialId);
    if (existing) return JSON.parse(this.#plain(existing.fields.payload_json) || '{}');
    const validCount = (await this.#recordsMatching('transactions', [{ field: 'material_id', value: materialId }]))
      .map((record) => JSON.parse(this.#plain(record.fields.payload_json) || '{}'))
      .filter((item) => item.material_id === materialId && item.is_valid === true).length;
    return { material_id: materialId, base_price: null, valid_transaction_count: validCount, sample_transaction_ids: [], formed_at: null, updated_at: null };
  }
  async listTransactionsForMaterial(materialId) {
    return (await this.#recordsMatching('transactions', [{ field: 'material_id', value: materialId }]))
      .map((record) => JSON.parse(this.#plain(record.fields.payload_json) || '{}'))
      .filter((item) => item.material_id === materialId);
  }
  async listPricingByUser(userId) {
    const bids = (await this.#recordsMatching('bids', [{ field: 'user_id', value: userId }])).map((record) => JSON.parse(this.#plain(record.fields.payload_json) || '{}'));
    const transactions = (await this.#recordsMatching('transactions', [{ field: 'user_id', value: userId }])).map((record) => JSON.parse(this.#plain(record.fields.payload_json) || '{}'));
    const materialIds = new Set([...bids, ...transactions].map((item) => item.material_id));
    const basePrices = (await this.#recordsMatchingAny('basePrices', 'material_id', [...materialIds])).map((record) => JSON.parse(this.#plain(record.fields.payload_json) || '{}'));
    return { bids, transactions, basePrices };
  }
  async listAllPricing() {
    const [bidRecords, transactionRecords, basePriceRecords] = await Promise.all([this.#records('bids'), this.#records('transactions'), this.#records('basePrices')]);
    return {
      bids: bidRecords.map((record) => JSON.parse(this.#plain(record.fields.payload_json) || '{}')).filter((bid) => bid.bid_id),
      transactions: transactionRecords.map((record) => JSON.parse(this.#plain(record.fields.payload_json) || '{}')).filter((transaction) => transaction.transaction_id),
      basePrices: basePriceRecords.map((record) => JSON.parse(this.#plain(record.fields.payload_json) || '{}')).filter((pricing) => pricing.material_id),
    };
  }
  async listValidTransactionsForMaterials(materialIds) {
    return (await this.#recordsMatchingAny('transactions', 'material_id', materialIds))
      .map((record) => JSON.parse(this.#plain(record.fields.payload_json) || '{}'))
      .filter((transaction) => transaction.is_valid === true);
  }
  async setTransactionValidity(transactionId, isValid, basePriceTransactionCount) {
    const existing = await this.#find('transactions', 'transaction_id', transactionId);
    if (!existing) return null;
    const transaction = JSON.parse(this.#plain(existing.fields.payload_json) || '{}');
    return this.#withLock(`pricing:${transaction.material_id}`, async () => {
      transaction.is_valid = Boolean(isValid);
      transaction.updated_at = new Date().toISOString();
      await this.#update('transactions', existing.record_id, { is_valid: transaction.is_valid, payload_json: JSON.stringify(transaction) });
      const allMaterialTransactions = (await this.#recordsMatching('transactions', [{ field: 'material_id', value: transaction.material_id }]))
        .map((record) => JSON.parse(this.#plain(record.fields.payload_json) || '{}'))
        .filter((item) => item.material_id === transaction.material_id);
      const calculated = calculateBasePrice(allMaterialTransactions, basePriceTransactionCount);
      const existingPricingRecord = await this.#find('basePrices', 'material_id', transaction.material_id);
      const previous = existingPricingRecord ? JSON.parse(this.#plain(existingPricingRecord.fields.payload_json) || '{}') : null;
      const pricing = {
        material_id: transaction.material_id, base_price: calculated.base_price,
        valid_transaction_count: calculated.valid_transaction_count,
        sample_transaction_ids: calculated.sample_transaction_ids,
        formed_at: calculated.base_price == null ? null : (previous?.formed_at || new Date().toISOString()),
        updated_at: new Date().toISOString(),
      };
      const pricingFields = { material_id: pricing.material_id, base_price: pricing.base_price ?? '', valid_transaction_count: pricing.valid_transaction_count, formed_at: pricing.formed_at || '', payload_json: JSON.stringify(pricing) };
      if (existingPricingRecord) await this.#update('basePrices', existingPricingRecord.record_id, pricingFields); else await this.#create('basePrices', pricingFields);
      return { transaction, pricing };
    });
  }
  async appendEvents(userId, events, researchSubjectId = null) {
    const existing = new Set((await this.#recordsMatchingAny('events', 'event_id', events.map((event) => event.event_id))).map((record) => this.#plain(record.fields?.event_id)));
    const unique = events.filter((event) => !existing.has(event.event_id));
    if (!unique.length) return [];
    const path = `${this.#tablePath('events')}/batch_create`;
    for (let index = 0; index < unique.length; index += 500) {
      const records = [];
      for (const event of unique.slice(index, index + 500)) {
        const fields = await this.#compatibleFields('events', { event_id: event.event_id, actor_id: userId, research_subject_id: researchSubjectId || '', raw_event: event.raw_event, created_at: event.created_at, payload_json: JSON.stringify({ ...event, actor_id: userId, research_subject_id: researchSubjectId || null }) });
        records.push({ fields });
      }
      await this.#request(path, { method: 'POST', body: JSON.stringify({ records }) });
    }
    return unique.map((event) => event.event_id);
  }
  async recentEvents(userId, limit = 200) { return (await this.#recordsMatching('events', [{ field: 'actor_id', value: userId }])).map((record) => JSON.parse(this.#plain(record.fields.payload_json) || '{}')).filter((event) => event.event_id && event.raw_event).slice(-limit); }
  async allEvents(userId) { return (await this.#recordsMatching('events', [{ field: 'actor_id', value: userId }])).map((record) => JSON.parse(this.#plain(record.fields.payload_json) || '{}')).filter((event) => event.event_id && event.raw_event); }
  async listAllEvents() { return (await this.#records('events')).map((record) => JSON.parse(this.#plain(record.fields.payload_json) || '{}')).filter((event) => event.event_id && event.raw_event); }
  async getResearchHealth(userId) {
    const [subject, eventRecords, consents] = await Promise.all([
      this.getResearchSubject(userId),
      this.#recordsMatching('events', [{ field: 'actor_id', value: userId }]),
      this.listResearchConsents(userId),
    ]);
    const events = eventRecords.map((record) => JSON.parse(this.#plain(record.fields.payload_json) || '{}'));
    const lastEvent = events.sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || ''))).at(-1) || null;
    return { subjectReady: Boolean(subject), subjectId: subject?.subject_id || null, eventCount: events.length, lastEventAt: lastEvent?.created_at || null, consentRecordCount: consents.length };
  }
  async anonymizeUserData(userId) {
    const anonymousId = `anonymous-${randomUUID()}`;
    const eventRecords = await this.#recordsMatching('events', [{ field: 'actor_id', value: userId }]);
    for (const record of eventRecords) {
      const event = JSON.parse(this.#plain(record.fields.payload_json) || '{}');
      if (event.actor_id !== userId) continue;
      event.actor_id = anonymousId;
      event.details = { ...event.details, actor_name: undefined, previous_name: undefined };
      await this.#update('events', record.record_id, { actor_id: anonymousId, payload_json: JSON.stringify(event) });
    }
    const assetRecords = await this.#recordsMatching('assets', [{ field: 'user_id', value: userId }]);
    for (const record of assetRecords) {
      const asset = JSON.parse(this.#plain(record.fields.payload_json) || '{}');
      if (asset.userId !== userId) continue;
      asset.userId = anonymousId; asset.fileName = '匿名素材';
      await this.#update('assets', record.record_id, { user_id: anonymousId, payload_json: JSON.stringify(asset) });
    }
    for (const record of await this.#records('publicAssets')) {
      const payload = JSON.parse(this.#plain(record.fields.payload_json) || '{}');
      const owns = payload.ownerId === userId;
      const comments = (payload.comments || []).map((comment) => comment.ownerId === userId ? { ...comment, ownerId: anonymousId, ownerName: '匿名旅人', name: '匿名旅人' } : comment);
      const commentsChanged = JSON.stringify(comments) !== JSON.stringify(payload.comments || []);
      if (!owns && !commentsChanged) continue;
      if (owns) { payload.ownerId = anonymousId; payload.ownerName = '匿名旅人'; payload.fileName = ''; }
      payload.comments = comments;
      await this.#update('publicAssets', record.record_id, { ...(owns ? { owner_id: anonymousId } : {}), payload_json: JSON.stringify(payload) });
    }
    for (const record of await this.#records('publicDemands')) {
      const payload = JSON.parse(this.#plain(record.fields.payload_json) || '{}');
      const owns = payload.ownerId === userId;
      const links = (payload.assetLinkRecords || []).map((link) => link.ownerId === userId ? { ...link, ownerId: anonymousId } : link);
      const linksChanged = JSON.stringify(links) !== JSON.stringify(payload.assetLinkRecords || []);
      if (!owns && !linksChanged) continue;
      if (owns) { payload.ownerId = anonymousId; payload.ownerName = '匿名旅人'; payload.by = '匿名旅人'; }
      payload.assetLinkRecords = links;
      await this.#update('publicDemands', record.record_id, { ...(owns ? { owner_id: anonymousId } : {}), payload_json: JSON.stringify(payload) });
    }
    for (const table of ['publicResponses', 'publicRecords']) {
      for (const record of await this.#records(table)) {
        const payload = JSON.parse(this.#plain(record.fields.payload_json) || '{}');
        if (payload.ownerId !== userId) continue;
        payload.ownerId = anonymousId; payload.ownerName = '匿名旅人'; payload.name = '匿名旅人';
        await this.#update(table, record.record_id, { owner_id: anonymousId, payload_json: JSON.stringify(payload) });
      }
    }
    const reportRecords = await this.#records('reports');
    for (const record of reportRecords) {
      const payload = JSON.parse(this.#plain(record.fields.payload_json) || '{}');
      if (payload.reporterId !== userId) continue;
      payload.reporterId = null; payload.reporterName = '匿名旅人';
      await this.#update('reports', record.record_id, { reporter_id: '', payload_json: JSON.stringify(payload) });
    }
    for (const table of ['bids', 'transactions']) {
      const records = await this.#records(table);
      for (const record of records) {
        const payload = JSON.parse(this.#plain(record.fields.payload_json) || '{}');
        if (payload.user_id !== userId) continue;
        payload.user_id = anonymousId;
        await this.#update(table, record.record_id, { user_id: anonymousId, payload_json: JSON.stringify(payload) });
      }
    }
    for (const table of ['researchSubjects', 'researchConsents', 'researchSessions']) {
      for (const record of await this.#recordsMatching(table, [{ field: 'user_id', value: userId }])) {
        const payload = JSON.parse(this.#plain(record.fields.payload_json) || '{}');
        payload.user_id = anonymousId;
        if (table === 'researchSubjects') { payload.status = 'anonymized'; payload.updated_at = new Date().toISOString(); }
        await this.#update(table, record.record_id, { user_id: anonymousId, ...(table === 'researchSubjects' ? { status: 'anonymized' } : {}), payload_json: JSON.stringify(payload) });
      }
    }
    return { anonymousId };
  }
  async createPasswordReset(record) { await this.#create('passwordResets', { reset_id: record.id || randomUUID(), identity: record.identity, payload_json: JSON.stringify(record) }); return record; }
}
