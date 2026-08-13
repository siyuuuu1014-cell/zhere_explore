import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { calculateBasePrice } from '../pricing.mjs';

const EMPTY = () => ({
  users: [], sessions: [], researchSubjects: [], researchConsents: [], researchSessions: [],
  worldStates: {}, assets: [], publicAssets: [], publicDemands: [], publicResponses: [], publicRecords: [],
  reports: [], events: [], passwordResets: [], bids: [], transactions: [], basePrices: [],
});
const TRANSIENT_FILE_ERRORS = new Set(['EACCES', 'EBUSY', 'EMFILE', 'ENFILE', 'EPERM']);
const FILE_RETRY_DELAYS_MS = [20, 60, 140, 300, 600];

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function retryTransientFileOperation(operation) {
  let lastError;
  for (let attempt = 0; attempt <= FILE_RETRY_DELAYS_MS.length; attempt += 1) {
    try { return await operation(); }
    catch (error) {
      lastError = error;
      if (!TRANSIENT_FILE_ERRORS.has(error?.code) || attempt === FILE_RETRY_DELAYS_MS.length) throw error;
      await wait(FILE_RETRY_DELAYS_MS[attempt]);
    }
  }
  throw lastError;
}

export class LocalRepository {
  constructor(dataDir) {
    this.dataDir = dataDir;
    this.storeFile = path.join(dataDir, 'store.json');
    this.mediaDir = path.join(dataDir, 'media');
    this.writeQueue = Promise.resolve();
  }

  async init() {
    await fs.mkdir(this.mediaDir, { recursive: true });
    try { await retryTransientFileOperation(() => fs.access(this.storeFile)); }
    catch (error) {
      if (error?.code !== 'ENOENT') throw error;
      await this.#write(EMPTY());
    }
    await this.#cleanupStaleTemps();
  }

  async #read() {
    try {
      const json = await retryTransientFileOperation(() => fs.readFile(this.storeFile, 'utf8'));
      return JSON.parse(json);
    } catch (error) {
      if (error?.code === 'ENOENT') return EMPTY();
      throw error;
    }
  }

  async #write(store) {
    const temp = `${this.storeFile}.${randomUUID()}.tmp`;
    const serialized = JSON.stringify(store, null, 2);
    await fs.mkdir(this.dataDir, { recursive: true });
    try {
      try {
        await retryTransientFileOperation(() => fs.writeFile(temp, serialized, { encoding: 'utf8', flag: 'w' }));
        await retryTransientFileOperation(() => fs.rename(temp, this.storeFile));
      } catch (error) {
        if (!TRANSIENT_FILE_ERRORS.has(error?.code)) throw error;
        await retryTransientFileOperation(() => fs.writeFile(this.storeFile, serialized, 'utf8'));
      }
    } finally {
      await fs.rm(temp, { force: true }).catch(() => {});
    }
  }

  async #cleanupStaleTemps() {
    const entries = await fs.readdir(this.dataDir, { withFileTypes: true }).catch(() => []);
    const prefix = `${path.basename(this.storeFile)}.`;
    const now = Date.now();
    await Promise.all(entries
      .filter((entry) => entry.isFile() && entry.name.startsWith(prefix) && entry.name.endsWith('.tmp'))
      .map(async (entry) => {
        const target = path.join(this.dataDir, entry.name);
        const stat = await fs.stat(target).catch(() => null);
        if (stat && now - stat.mtimeMs > 30000) await fs.rm(target, { force: true }).catch(() => {});
      }));
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

  async ensureResearchSubject(userId, { sourceSystem = 'web_game', createdAt = new Date().toISOString(), subjectId = '' } = {}) {
    return this.#mutate((store) => {
      store.researchSubjects ||= [];
      const existing = store.researchSubjects.find((subject) => subject.user_id === userId);
      if (existing) return existing;
      const subject = {
        subject_id: subjectId || `rs-${randomUUID()}`, user_id: userId, source_system: sourceSystem,
        status: 'active', created_at: createdAt, updated_at: createdAt,
      };
      store.researchSubjects.push(subject);
      return subject;
    });
  }

  async getResearchSubject(userId) {
    return ((await this.#read()).researchSubjects || []).find((subject) => subject.user_id === userId) || null;
  }

  async recordResearchConsent(record) {
    return this.#mutate((store) => {
      store.researchConsents ||= [];
      const existing = store.researchConsents.find((consent) => consent.consent_id === record.consent_id);
      if (existing) return existing;
      store.researchConsents.push(record);
      return record;
    });
  }

  async listResearchConsents(userId) {
    return ((await this.#read()).researchConsents || []).filter((consent) => consent.user_id === userId);
  }

  async createResearchSession(record) {
    return this.#mutate((store) => {
      store.researchSessions ||= [];
      const existing = store.researchSessions.find((session) => session.session_id === record.session_id);
      if (existing) return existing;
      store.researchSessions.push(record);
      return record;
    });
  }

  async endResearchSession(sessionId, endedAt = new Date().toISOString(), endReason = 'logout') {
    return this.#mutate((store) => {
      const session = (store.researchSessions || []).find((item) => item.session_id === sessionId);
      if (!session) return null;
      session.ended_at ||= endedAt;
      session.end_reason ||= endReason;
      return session;
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

  async cleanupExpiredSessions(now = new Date().toISOString()) {
    const cutoff = Date.parse(now);
    return this.#mutate((store) => {
      const expired = (store.sessions || []).filter((session) => Date.parse(session.expiresAt) <= cutoff);
      if (!expired.length) return 0;
      const expiredIds = new Set(expired.map((session) => session.id));
      for (const researchSession of store.researchSessions || []) {
        if (!expiredIds.has(researchSession.session_id) || researchSession.ended_at) continue;
        const loginSession = expired.find((session) => session.id === researchSession.session_id);
        researchSession.ended_at = loginSession?.expiresAt || now;
        researchSession.end_reason = 'session-expired';
      }
      store.sessions = (store.sessions || []).filter((session) => !expiredIds.has(session.id));
      return expired.length;
    });
  }

  async saveWorldState(userId, state, expectedVersion = null) {
    return this.#mutate((store) => {
      const previous = store.worldStates[userId];
      const currentVersion = Number(previous?.version || 0);
      if (expectedVersion != null && Number(expectedVersion) !== currentVersion) {
        const error = new Error('world-state-conflict');
        error.code = 'world-state-conflict';
        error.current = previous || { userId, version: 0, state: null, updatedAt: null };
        throw error;
      }
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
    return { ok: true, storage: 'local', users: store.users.length, events: (store.events || []).length, checkedAt: new Date().toISOString() };
  }

  async getResearchHealth(userId) {
    const store = await this.#read();
    const subject = (store.researchSubjects || []).find((item) => item.user_id === userId) || null;
    const events = (store.events || []).filter((event) => event.actor_id === userId);
    const lastEvent = events.at(-1) || null;
    return {
      subjectReady: Boolean(subject), subjectId: subject?.subject_id || null,
      eventCount: events.length, lastEventAt: lastEvent?.created_at || null,
      consentRecordCount: (store.researchConsents || []).filter((consent) => consent.user_id === userId).length,
    };
  }

  async listPublicAssets({ includeDeleted = false } = {}) {
    return ((await this.#read()).publicAssets || []).filter((asset) => includeDeleted || (asset.status === 'published' && asset.moderationStatus !== 'hidden'));
  }

  async listPublicAssetsByOwner(ownerId, { includeDeleted = false } = {}) {
    return (await this.listPublicAssets({ includeDeleted })).filter((asset) => asset.ownerId === ownerId);
  }

  async getPublicAsset(assetId) {
    return ((await this.#read()).publicAssets || []).find((asset) => asset.id === assetId && asset.status === 'published' && asset.moderationStatus !== 'hidden') || null;
  }

  async getPublicAssetCore(assetId) {
    return ((await this.#read()).publicAssets || []).find((asset) => asset.id === assetId) || null;
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

  async listPublicDemandsByOwner(ownerId, { includeDeleted = false } = {}) {
    return (await this.listPublicDemands({ includeDeleted })).filter((demand) => demand.ownerId === ownerId);
  }

  async getPublicDemand(demandId) {
    return (await this.listPublicDemands()).find((demand) => demand.id === demandId) || null;
  }

  async getPublicDemandCore(demandId) {
    const demand = ((await this.#read()).publicDemands || []).find((item) => item.id === demandId);
    return demand && demand.status !== 'deleted' && demand.moderationStatus !== 'hidden' ? { ...demand } : null;
  }

  async savePublicDemand(record, _options = {}) {
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

  async getPublicResponse(responseId) {
    const response = ((await this.#read()).publicResponses || []).find((item) => item.id === responseId);
    return response && response.status !== 'deleted' && response.moderationStatus !== 'hidden' ? { ...response } : null;
  }

  async createPublicResponse(record, { skipLookup = false } = {}) {
    return this.#mutate((store) => {
      store.publicResponses ||= [];
      if (!skipLookup && store.publicResponses.some((response) => response.id === record.id)) return store.publicResponses.find((response) => response.id === record.id);
      store.publicResponses.push(record);
      return record;
    });
  }

  async updatePublicResponse(responseId, ownerId, patch, { demandId = '' } = {}) {
    return this.#mutate((store) => {
      const response = (store.publicResponses || []).find((item) => item.id === responseId);
      if (!response) return null;
      if (demandId && response.demandId !== demandId) return null;
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

  async listPublicRecordsByOwner(ownerId, { includeDeleted = false } = {}) {
    return (await this.listPublicRecords({ includeDeleted })).filter((record) => record.ownerId === ownerId);
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

  async claimPublicSwap({ offerId, user, replacementAssetId, note, newRecordId, now }) {
    return this.#mutate((store) => {
      store.publicRecords ||= [];
      const offer = store.publicRecords.find((item) => item.id === offerId && item.kind === 'swap_offer');
      if (!offer || offer.status !== 'published') return null;
      if (offer.ownerId === user.id) return { ownOffer: true };
      const gainedAssetId = offer.payload?.assetId;
      if (!gainedAssetId) return null;
      if (gainedAssetId === replacementAssetId) return { sameAsset: true };
      offer.status = 'deleted';
      offer.updatedAt = now;
      offer.payload = { ...offer.payload, claimedById: user.id, claimedByName: user.nickname, claimedAt: now, replacementAssetId };
      const replacement = {
        id: newRecordId, kind: 'swap_offer', ownerId: user.id, ownerName: user.nickname,
        name: user.nickname, status: 'published', moderationStatus: 'visible',
        payload: { assetId: replacementAssetId, note, by: user.nickname, npc: false },
        createdAt: now, updatedAt: now,
      };
      store.publicRecords.push(replacement);
      return { gainedAssetId, claimed: offer, offer: replacement };
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

  async openMedia(asset, { start = 0, end = Number(asset.size || 0) - 1 } = {}) {
    const stat = await fs.stat(asset.localPath);
    const size = stat.size;
    const safeStart = Math.max(0, Math.min(Number(start) || 0, Math.max(0, size - 1)));
    const safeEnd = Math.max(safeStart, Math.min(Number(end), size - 1));
    return { stream: createReadStream(asset.localPath, { start: safeStart, end: safeEnd }), size, start: safeStart, end: safeEnd };
  }

  async createAcceptedBidTransaction({ bid, transaction, basePriceTransactionCount }) {
    return this.#mutate((store) => {
      store.bids ||= [];
      store.transactions ||= [];
      store.basePrices ||= [];

      const existingBid = store.bids.find((item) => item.user_id === bid.user_id && item.idempotency_key === bid.idempotency_key);
      const existingTransaction = existingBid && store.transactions.find((item) => item.bid_id === existingBid.bid_id);
      if (!existingBid) {
        const existingPurchase = store.transactions.find((item) => item.user_id === bid.user_id && item.material_id === bid.material_id && item.is_valid === true);
        if (existingPurchase) {
          return {
            alreadyPurchased: true,
            bid: store.bids.find((item) => item.bid_id === existingPurchase.bid_id) || null,
            transaction: existingPurchase,
            pricing: store.basePrices.find((item) => item.material_id === bid.material_id) || null,
            duplicate: false,
          };
        }
      }

      const savedBid = existingBid || bid;
      if (!existingBid) store.bids.push(savedBid);
      const savedTransaction = existingTransaction || { ...transaction, bid_id: savedBid.bid_id };
      if (!existingTransaction) store.transactions.push(savedTransaction);

      const materialTransactions = store.transactions.filter((item) => item.material_id === savedBid.material_id);
      const calculated = calculateBasePrice(materialTransactions, basePriceTransactionCount);
      const now = new Date().toISOString();
      const pricing = {
        material_id: savedBid.material_id,
        base_price: calculated.base_price,
        valid_transaction_count: calculated.valid_transaction_count,
        sample_transaction_ids: calculated.sample_transaction_ids,
        formed_at: calculated.base_price == null ? null : (store.basePrices.find((item) => item.material_id === savedBid.material_id)?.formed_at || now),
        updated_at: now,
      };
      const pricingIndex = store.basePrices.findIndex((item) => item.material_id === savedBid.material_id);
      if (pricingIndex >= 0) store.basePrices[pricingIndex] = pricing; else store.basePrices.push(pricing);
      return { bid: savedBid, transaction: savedTransaction, pricing, materialTransactions, duplicate: Boolean(existingBid && existingTransaction) };
    });
  }

  async getMaterialPricing(materialId) {
    const store = await this.#read();
    const pricing = (store.basePrices || []).find((item) => item.material_id === materialId);
    if (pricing) return pricing;
    const validCount = (store.transactions || []).filter((item) => item.material_id === materialId && item.is_valid === true).length;
    return { material_id: materialId, base_price: null, valid_transaction_count: validCount, sample_transaction_ids: [], formed_at: null, updated_at: null };
  }

  async listTransactionsForMaterial(materialId) {
    return ((await this.#read()).transactions || []).filter((item) => item.material_id === materialId);
  }

  async listPricingByUser(userId) {
    const store = await this.#read();
    const bids = (store.bids || []).filter((item) => item.user_id === userId);
    const transactions = (store.transactions || []).filter((item) => item.user_id === userId);
    const materialIds = new Set([...bids, ...transactions].map((item) => item.material_id));
    const basePrices = (store.basePrices || []).filter((item) => materialIds.has(item.material_id));
    return { bids, transactions, basePrices };
  }

  async listAllPricing() {
    const store = await this.#read();
    return { bids: store.bids || [], transactions: store.transactions || [], basePrices: store.basePrices || [] };
  }

  async listValidTransactionsForMaterials(materialIds) {
    const ids = new Set(materialIds);
    return ((await this.#read()).transactions || []).filter((transaction) => ids.has(transaction.material_id) && transaction.is_valid === true);
  }

  async setTransactionValidity(transactionId, isValid, basePriceTransactionCount) {
    return this.#mutate((store) => {
      store.transactions ||= [];
      store.basePrices ||= [];
      const transaction = store.transactions.find((item) => item.transaction_id === transactionId);
      if (!transaction) return null;
      transaction.is_valid = Boolean(isValid);
      transaction.updated_at = new Date().toISOString();
      const materialTransactions = store.transactions.filter((item) => item.material_id === transaction.material_id);
      const calculated = calculateBasePrice(materialTransactions, basePriceTransactionCount);
      const previous = store.basePrices.find((item) => item.material_id === transaction.material_id);
      const pricing = {
        material_id: transaction.material_id,
        base_price: calculated.base_price,
        valid_transaction_count: calculated.valid_transaction_count,
        sample_transaction_ids: calculated.sample_transaction_ids,
        formed_at: calculated.base_price == null ? null : (previous?.formed_at || new Date().toISOString()),
        updated_at: new Date().toISOString(),
      };
      const index = store.basePrices.findIndex((item) => item.material_id === transaction.material_id);
      if (index >= 0) store.basePrices[index] = pricing; else store.basePrices.push(pricing);
      return { transaction, pricing };
    });
  }

  async appendEvents(userId, events, researchSubjectId = null) {
    return this.#mutate((store) => {
      const existing = new Set(store.events.map((event) => event.event_id));
      const accepted = [];
      for (const event of events) {
        if (existing.has(event.event_id)) continue;
        const record = { ...event, actor_id: userId, research_subject_id: researchSubjectId || null };
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

  async listAllEvents() {
    return (await this.#read()).events;
  }

  async anonymizeUserData(userId) {
    return this.#mutate((store) => {
      const anonymousId = `anonymous-${randomUUID()}`;
      store.events = store.events.map((event) => event.actor_id === userId
        ? { ...event, actor_id: anonymousId, details: { ...event.details, actor_name: undefined, previous_name: undefined } }
        : event);
      store.assets = store.assets.map((asset) => asset.userId === userId ? { ...asset, userId: anonymousId, fileName: '匿名素材' } : asset);
      store.publicAssets = (store.publicAssets || []).map((asset) => ({
        ...asset,
        ...(asset.ownerId === userId ? { ownerId: anonymousId, ownerName: '匿名旅人', fileName: '' } : {}),
        comments: (asset.comments || []).map((comment) => comment.ownerId === userId ? { ...comment, ownerId: anonymousId, ownerName: '匿名旅人', name: '匿名旅人' } : comment),
      }));
      store.publicDemands = (store.publicDemands || []).map((demand) => ({
        ...demand,
        ...(demand.ownerId === userId ? { ownerId: anonymousId, ownerName: '匿名旅人', by: '匿名旅人' } : {}),
        assetLinkRecords: (demand.assetLinkRecords || []).map((link) => link.ownerId === userId ? { ...link, ownerId: anonymousId } : link),
      }));
      store.publicResponses = (store.publicResponses || []).map((response) => response.ownerId === userId ? { ...response, ownerId: anonymousId, ownerName: '匿名旅人', name: '匿名旅人' } : response);
      store.publicRecords = (store.publicRecords || []).map((record) => record.ownerId === userId ? { ...record, ownerId: anonymousId, ownerName: '匿名旅人', name: '匿名旅人' } : record);
      store.reports = (store.reports || []).map((report) => report.reporterId === userId ? { ...report, reporterId: null, reporterName: '匿名旅人' } : report);
      store.bids = (store.bids || []).map((bid) => bid.user_id === userId ? { ...bid, user_id: anonymousId } : bid);
      store.transactions = (store.transactions || []).map((transaction) => transaction.user_id === userId ? { ...transaction, user_id: anonymousId } : transaction);
      store.researchSubjects = (store.researchSubjects || []).map((subject) => subject.user_id === userId
        ? { ...subject, user_id: anonymousId, status: 'anonymized', updated_at: new Date().toISOString() }
        : subject);
      store.researchConsents = (store.researchConsents || []).map((consent) => consent.user_id === userId ? { ...consent, user_id: anonymousId } : consent);
      store.researchSessions = (store.researchSessions || []).map((session) => session.user_id === userId ? { ...session, user_id: anonymousId } : session);
      return { anonymousId };
    });
  }

  async createPasswordReset(record) {
    return this.#mutate((store) => { store.passwordResets.push(record); return record; });
  }
}
