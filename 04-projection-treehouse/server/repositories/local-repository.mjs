import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const EMPTY = () => ({ users: [], sessions: [], worldStates: {}, assets: [], publicAssets: [], publicDemands: [], publicResponses: [], publicRecords: [], reports: [], events: [], passwordResets: [] });

export class LocalRepository {
  constructor(dataDir) {
    this.dataDir = dataDir;
    this.storeFile = path.join(dataDir, 'store.json');
    this.mediaDir = path.join(dataDir, 'media');
    this.writeQueue = Promise.resolve();
  }

  async init() {
    await fs.mkdir(this.mediaDir, { recursive: true });
    try { await fs.access(this.storeFile); } catch { await this.#write(EMPTY()); }
  }

  async #read() {
    try { return JSON.parse(await fs.readFile(this.storeFile, 'utf8')); } catch { return EMPTY(); }
  }

  async #write(store) {
    const temp = `${this.storeFile}.${randomUUID()}.tmp`;
    await fs.mkdir(this.dataDir, { recursive: true });
    await fs.writeFile(temp, JSON.stringify(store, null, 2), 'utf8');
    await fs.rename(temp, this.storeFile);
  }

  async #mutate(change) {
    const operation = this.writeQueue.then(async () => {
      const store = await this.#read();
      const result = await change(store);
      await this.#write(store);
      return result;
    });
    this.writeQueue = operation.catch(() => {});
    return operation;
  }

  async findUserByIdentity(identity) {
    return (await this.#read()).users.find((user) => user.identity === identity) || null;
  }

  async getUser(id) {
    return (await this.#read()).users.find((user) => user.id === id) || null;
  }

  async createUser(user) {
    return this.#mutate((store) => {
      if (store.users.some((entry) => entry.identity === user.identity)) throw new Error('identity-exists');
      store.users.push(user);
      return user;
    });
  }

  async updateUser(user) {
    return this.#mutate((store) => {
      const index = store.users.findIndex((entry) => entry.id === user.id);
      if (index < 0) return null;
      store.users[index] = user;
      return user;
    });
  }

  async createSession(session) {
    return this.#mutate((store) => { store.sessions.push(session); return session; });
  }

  async getSession(tokenHash) {
    const store = await this.#read();
    return store.sessions.find((session) => session.tokenHash === tokenHash) || null;
  }

  async deleteSession(tokenHash) {
    return this.#mutate((store) => { store.sessions = store.sessions.filter((session) => session.tokenHash !== tokenHash); });
  }

  async deleteSessionsByUser(userId) {
    return this.#mutate((store) => { store.sessions = store.sessions.filter((session) => session.userId !== userId); });
  }

  async saveWorldState(userId, state) {
    return this.#mutate((store) => {
      const previous = store.worldStates[userId];
      const record = { userId, version: (previous?.version || 0) + 1, state, updatedAt: new Date().toISOString() };
      store.worldStates[userId] = record;
      return record;
    });
  }

  async getWorldState(userId) {
    return (await this.#read()).worldStates[userId] || null;
  }

  async saveMedia({ userId, assetId, title, description, fileName, mime, bytes }) {
    const safeId = String(assetId).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80);
    const storageKey = `${userId}-${safeId}`;
    const target = path.join(this.mediaDir, storageKey);
    await fs.writeFile(target, bytes);
    return this.#mutate((store) => {
      const asset = { id: assetId, userId, title, description, fileName, mime, size: bytes.length, storageKey, createdAt: new Date().toISOString() };
      const index = store.assets.findIndex((entry) => entry.id === assetId && entry.userId === userId);
      if (index >= 0) store.assets[index] = asset; else store.assets.push(asset);
      return asset;
    });
  }

  async getMedia(assetId) {
    const asset = (await this.#read()).assets.find((entry) => entry.id === assetId) || null;
    return asset ? { ...asset, localPath: path.join(this.mediaDir, asset.storageKey) } : null;
  }

  async listMediaByUser(userId) {
    return (await this.#read()).assets.filter((asset) => asset.userId === userId);
  }

  async healthCheck() {
    const store = await this.#read();
    return { ok: true, storage: 'local', users: store.users.length, checkedAt: new Date().toISOString() };
  }

  async listPublicAssets({ includeDeleted = false } = {}) {
    return ((await this.#read()).publicAssets || []).filter((asset) => includeDeleted || (asset.status === 'published' && asset.moderationStatus !== 'hidden'));
  }

  async getPublicAsset(assetId) {
    return ((await this.#read()).publicAssets || []).find((asset) => asset.id === assetId && asset.status === 'published' && asset.moderationStatus !== 'hidden') || null;
  }

  async savePublicAsset(record) {
    return this.#mutate((store) => {
      store.publicAssets ||= [];
      const index = store.publicAssets.findIndex((asset) => asset.id === record.id);
      if (index >= 0) {
        if (store.publicAssets[index].ownerId !== record.ownerId) throw new Error('public-asset-owner-conflict');
        store.publicAssets[index] = { ...store.publicAssets[index], ...record };
      } else store.publicAssets.push(record);
      return store.publicAssets.find((asset) => asset.id === record.id);
    });
  }

  async updatePublicAsset(assetId, ownerId, patch) {
    return this.#mutate((store) => {
      const asset = (store.publicAssets || []).find((item) => item.id === assetId);
      if (!asset) return null;
      if (asset.ownerId !== ownerId) return false;
      Object.assign(asset, patch, { version: Number(asset.version || 0) + 1, updatedAt: new Date().toISOString() });
      return asset;
    });
  }

  async setPublicAssetReaction(assetId, userId, liked) {
    return this.#mutate((store) => {
      const asset = (store.publicAssets || []).find((item) => item.id === assetId && item.status === 'published');
      if (!asset) return null;
      const likedBy = new Set(asset.likedBy || []);
      if (liked) likedBy.add(userId); else likedBy.delete(userId);
      asset.likedBy = [...likedBy];
      asset.likes = asset.likedBy.length;
      asset.version = Number(asset.version || 0) + 1;
      asset.updatedAt = new Date().toISOString();
      return asset;
    });
  }

  async setPublicAssetTag(assetId, userId, tag, active) {
    return this.#mutate((store) => {
      const asset = (store.publicAssets || []).find((item) => item.id === assetId && item.status === 'published');
      if (!asset) return null;
      asset.tagRecords ||= [];
      let record = asset.tagRecords.find((item) => item.tag === tag);
      if (!record && active) { record = { tag, userIds: [] }; asset.tagRecords.push(record); }
      if (record) {
        const users = new Set(record.userIds || []);
        if (active) users.add(userId); else users.delete(userId);
        record.userIds = [...users];
      }
      asset.tagRecords = asset.tagRecords.filter((item) => item.userIds.length);
      asset.tags = asset.tagRecords.map((item) => item.tag);
      asset.version = Number(asset.version || 0) + 1;
      asset.updatedAt = new Date().toISOString();
      return asset;
    });
  }

  async createPublicAssetComment(assetId, record) {
    return this.#mutate((store) => {
      const asset = (store.publicAssets || []).find((item) => item.id === assetId && item.status === 'published');
      if (!asset) return null;
      asset.comments ||= [];
      const existing = asset.comments.find((comment) => comment.id === record.id);
      if (existing) return existing;
      asset.comments.push(record);
      asset.updatedAt = new Date().toISOString();
      return record;
    });
  }

  async deletePublicAssetComment(assetId, commentId, ownerId) {
    return this.#mutate((store) => {
      const asset = (store.publicAssets || []).find((item) => item.id === assetId && item.status === 'published');
      if (!asset) return null;
      const comment = (asset.comments || []).find((item) => item.id === commentId);
      if (!comment || comment.ownerId !== ownerId) return false;
      asset.comments = (asset.comments || []).filter((item) => item.id !== commentId && item.parentId !== commentId);
      asset.updatedAt = new Date().toISOString();
      return true;
    });
  }

  async updatePublicAssetComment(assetId, commentId, ownerId, text) {
    return this.#mutate((store) => {
      const asset = (store.publicAssets || []).find((item) => item.id === assetId && item.status === 'published');
      if (!asset) return null;
      const comment = (asset.comments || []).find((item) => item.id === commentId);
      if (!comment || comment.ownerId !== ownerId) return false;
      comment.text = text;
      comment.editedAt = new Date().toISOString();
      asset.version = Number(asset.version || 0) + 1;
      asset.updatedAt = comment.editedAt;
      return comment;
    });
  }

  async listPublicDemands({ includeDeleted = false } = {}) {
    const store = await this.#read();
    return (store.publicDemands || []).filter((demand) => includeDeleted || (demand.status !== 'deleted' && demand.moderationStatus !== 'hidden')).map((demand) => ({
      ...demand,
      responses: (store.publicResponses || []).filter((response) => response.demandId === demand.id && (includeDeleted || (response.status !== 'deleted' && response.moderationStatus !== 'hidden'))),
    }));
  }

  async getPublicDemand(demandId) {
    return (await this.listPublicDemands()).find((demand) => demand.id === demandId) || null;
  }

  async savePublicDemand(record) {
    return this.#mutate((store) => {
      store.publicDemands ||= [];
      const index = store.publicDemands.findIndex((demand) => demand.id === record.id);
      if (index >= 0) {
        if (store.publicDemands[index].ownerId !== record.ownerId) throw new Error('public-demand-owner-conflict');
        store.publicDemands[index] = { ...store.publicDemands[index], ...record };
      } else store.publicDemands.push(record);
      return store.publicDemands.find((demand) => demand.id === record.id);
    });
  }

  async deletePublicDemand(demandId, ownerId) {
    return this.#mutate((store) => {
      const demand = (store.publicDemands || []).find((item) => item.id === demandId);
      if (!demand || demand.ownerId !== ownerId) return false;
      demand.status = 'deleted';
      demand.updatedAt = new Date().toISOString();
      return true;
    });
  }

  async createPublicResponse(record) {
    return this.#mutate((store) => {
      store.publicResponses ||= [];
      if (store.publicResponses.some((response) => response.id === record.id)) return store.publicResponses.find((response) => response.id === record.id);
      store.publicResponses.push(record);
      return record;
    });
  }

  async updatePublicResponse(responseId, ownerId, patch) {
    return this.#mutate((store) => {
      const response = (store.publicResponses || []).find((item) => item.id === responseId);
      if (!response) return null;
      if (response.ownerId !== ownerId) return false;
      Object.assign(response, patch, { updatedAt: new Date().toISOString() });
      return response;
    });
  }

  async savePublicRecord(record) {
    return this.#mutate((store) => {
      store.publicRecords ||= [];
      const index = store.publicRecords.findIndex((item) => item.id === record.id);
      if (index >= 0) {
        if (store.publicRecords[index].ownerId !== record.ownerId) return false;
        store.publicRecords[index] = { ...store.publicRecords[index], ...record, updatedAt: new Date().toISOString() };
      } else store.publicRecords.push(record);
      return store.publicRecords.find((item) => item.id === record.id);
    });
  }

  async listPublicRecords({ includeDeleted = false } = {}) {
    return ((await this.#read()).publicRecords || []).filter((record) => includeDeleted || (record.status !== 'deleted' && record.moderationStatus !== 'hidden'));
  }

  async deletePublicRecord(recordId, ownerId) {
    return this.#mutate((store) => {
      const record = (store.publicRecords || []).find((item) => item.id === recordId);
      if (!record) return null;
      if (record.ownerId !== ownerId) return false;
      record.status = 'deleted'; record.updatedAt = new Date().toISOString();
      return true;
    });
  }

  async createReport(record) {
    return this.#mutate((store) => { store.reports ||= []; store.reports.push(record); return record; });
  }

  async listReports() { return (await this.#read()).reports || []; }

  async updateReport(reportId, patch) {
    return this.#mutate((store) => {
      const report = (store.reports || []).find((item) => item.id === reportId);
      if (!report) return null;
      Object.assign(report, patch, { updatedAt: new Date().toISOString() });
      return report;
    });
  }

  async moderatePublicTarget(targetType, targetId, moderationStatus) {
    return this.#mutate((store) => {
      let target = null;
      if (targetType === 'asset') target = (store.publicAssets || []).find((item) => item.id === targetId);
      if (targetType === 'demand') target = (store.publicDemands || []).find((item) => item.id === targetId);
      if (targetType === 'response') target = (store.publicResponses || []).find((item) => item.id === targetId);
      if (targetType === 'record') target = (store.publicRecords || []).find((item) => item.id === targetId);
      if (targetType === 'comment') {
        for (const asset of store.publicAssets || []) {
          target = (asset.comments || []).find((item) => item.id === targetId);
          if (target) break;
        }
      }
      if (!target) return null;
      target.moderationStatus = moderationStatus;
      target.updatedAt = new Date().toISOString();
      return target;
    });
  }

  async readMedia(asset) {
    return fs.readFile(asset.localPath);
  }

  async appendEvents(userId, events) {
    return this.#mutate((store) => {
      const existing = new Set(store.events.map((event) => event.event_id));
      const accepted = [];
      for (const event of events) {
        if (existing.has(event.event_id)) continue;
        const record = { ...event, actor_id: userId, derived_signals: {} };
        store.events.push(record);
        existing.add(record.event_id);
        accepted.push(record.event_id);
      }
      return accepted;
    });
  }

  async recentEvents(userId, limit = 200) {
    return (await this.#read()).events.filter((event) => event.actor_id === userId).slice(-limit);
  }

  async allEvents(userId) {
    return (await this.#read()).events.filter((event) => event.actor_id === userId);
  }

  async anonymizeUserData(userId) {
    return this.#mutate((store) => {
      store.events = store.events.map((event) => event.actor_id === userId
        ? { ...event, details: { ...event.details, actor_name: undefined, previous_name: undefined } }
        : event);
      store.assets = store.assets.map((asset) => asset.userId === userId ? { ...asset, fileName: '匿名素材' } : asset);
      store.publicAssets = (store.publicAssets || []).map((asset) => ({
        ...asset,
        ...(asset.ownerId === userId ? { ownerName: '匿名旅人', fileName: '' } : {}),
        comments: (asset.comments || []).map((comment) => comment.ownerId === userId ? { ...comment, ownerName: '匿名旅人', name: '匿名旅人' } : comment),
      }));
      store.publicDemands = (store.publicDemands || []).map((demand) => demand.ownerId === userId ? { ...demand, ownerName: '匿名旅人', by: '匿名旅人' } : demand);
      store.publicResponses = (store.publicResponses || []).map((response) => response.ownerId === userId ? { ...response, ownerName: '匿名旅人', name: '匿名旅人' } : response);
      store.publicRecords = (store.publicRecords || []).map((record) => record.ownerId === userId ? { ...record, ownerName: '匿名旅人', name: '匿名旅人' } : record);
      store.reports = (store.reports || []).map((report) => report.reporterId === userId ? { ...report, reporterId: null, reporterName: '匿名旅人' } : report);
      return true;
    });
  }

  async createPasswordReset(record) {
    return this.#mutate((store) => { store.passwordResets.push(record); return record; });
  }
}
