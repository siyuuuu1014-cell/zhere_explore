(function () {
  'use strict';

  const API = '/api';
  const EVENT_DB = 'zhere-service-queue';
  const EVENT_STORE = 'events';
  const CRITICAL_EVENTS = new Set(['register', 'login', 'logout', 'publish_asset', 'upload_to_bag', 'bid_submit', 'bid_accepted', 'research_consent_change', 'deletion_request', 'feedback']);
  const pendingEvents = new Map();
  let authenticated = false;
  let currentUser = null;
  let stateTimer = null;
  let pendingState = null;
  let flushingState = null;
  let flushingEvents = null;
  let worldVersion = 0;
  let worldConflict = null;
  let authEpoch = 0;

  class ServiceError extends Error {
    constructor(message, code, status, details = null) {
      super(message);
      this.name = 'ServiceError';
      this.code = code;
      this.status = status;
      this.details = details;
    }
  }

  async function request(path, options = {}) {
    const { timeoutMs = options.body instanceof FormData ? 45_000 : 12_000, retries: requestedRetries, ...fetchOptions } = options;
    const method = String(fetchOptions.method || 'GET').toUpperCase();
    const retries = requestedRetries ?? (method === 'GET' ? 1 : 0);
    let lastError;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        const response = await fetch(`${API}${path}`, {
          credentials: 'same-origin',
          ...fetchOptions,
          signal: fetchOptions.signal || AbortSignal.timeout(timeoutMs),
          headers: fetchOptions.body instanceof FormData ? fetchOptions.headers : { 'content-type': 'application/json', ...fetchOptions.headers },
        });
        const body = await response.json().catch(() => ({}));
        if (response.ok) return body;
        const error = new ServiceError(body.error?.message || '服务暂时不可用。', body.error?.code || 'request-failed', response.status, body.conflict || body.error?.details || null);
        if (attempt >= retries || (response.status < 500 && response.status !== 429)) throw error;
        lastError = error;
      } catch (error) {
        const timedOut = error?.name === 'TimeoutError' || error?.name === 'AbortError';
        lastError = timedOut ? new ServiceError('服务器响应超时，请稍后重试。', 'request-timeout', 0) : error;
        if (attempt >= retries || (!timedOut && error instanceof ServiceError && error.status < 500 && error.status !== 429)) throw lastError;
      }
      await new Promise((resolve) => setTimeout(resolve, 350 * (attempt + 1)));
    }
    throw lastError;
  }

  function openEventDb() {
    return new Promise((resolve, reject) => {
      const operation = indexedDB.open(EVENT_DB, 1);
      operation.onupgradeneeded = () => operation.result.createObjectStore(EVENT_STORE, { keyPath: 'event_id' });
      operation.onsuccess = () => resolve(operation.result);
      operation.onerror = () => reject(operation.error);
    });
  }

  async function storeEvent(event) {
    const db = await openEventDb();
    await new Promise((resolve, reject) => {
      const transaction = db.transaction(EVENT_STORE, 'readwrite');
      transaction.objectStore(EVENT_STORE).put(event);
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
    });
    db.close();
  }

  async function deleteEvents(ids) {
    if (!ids.length) return;
    const db = await openEventDb();
    await new Promise((resolve, reject) => {
      const transaction = db.transaction(EVENT_STORE, 'readwrite');
      ids.forEach((id) => transaction.objectStore(EVENT_STORE).delete(id));
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
    });
    db.close();
  }

  async function restoreEvents() {
    const db = await openEventDb();
    const events = await new Promise((resolve, reject) => {
      const operation = db.transaction(EVENT_STORE).objectStore(EVENT_STORE).getAll();
      operation.onsuccess = () => resolve(operation.result || []);
      operation.onerror = () => reject(operation.error);
    });
    db.close();
    events.forEach((event) => pendingEvents.set(event.event_id, event));
  }

  async function discardForeignEvents() {
    if (!currentUser?.id) return;
    const foreignIds = [...pendingEvents.values()]
      .filter((event) => event.queue_user_id && event.queue_user_id !== currentUser.id)
      .map((event) => event.event_id);
    foreignIds.forEach((id) => pendingEvents.delete(id));
    await deleteEvents(foreignIds);
  }

  async function flushEvents({ keepalive = false } = {}) {
    if (!authenticated || !pendingEvents.size) return { accepted: [] };
    if (flushingEvents) return flushingEvents;
    const batch = [...pendingEvents.values()].slice(0, 100);
    const payload = batch.map(({ queue_user_id, ...event }) => event);
    flushingEvents = request('/events/batch', { method: 'POST', body: JSON.stringify({ events: payload }), keepalive })
      .then(async (result) => {
        const ids = [...new Set([...(result.acknowledged || result.accepted || []), ...(result.rejected_ids || [])])];
        ids.forEach((id) => pendingEvents.delete(id));
        await deleteEvents(ids);
        return result;
      })
      .finally(() => { flushingEvents = null; });
    return flushingEvents;
  }

  function enqueueEvent(event, { critical = CRITICAL_EVENTS.has(event.raw_event) } = {}) {
    const queuedEvent = { ...event, queue_user_id: currentUser?.id || null };
    pendingEvents.set(event.event_id, queuedEvent);
    storeEvent(queuedEvent).catch(() => {});
    if (critical || pendingEvents.size >= 20) queueMicrotask(() => flushEvents().catch(() => {}));
  }

  async function flushState({ keepalive = false, force = false } = {}) {
    clearTimeout(stateTimer);
    stateTimer = null;
    if (!authenticated) return null;
    if (flushingState) {
      await flushingState;
      return pendingState && !worldConflict ? flushState({ keepalive, force }) : null;
    }
    if (!pendingState) return null;
    const state = pendingState;
    pendingState = null;
    const operation = request('/world-state', { method: 'PUT', body: JSON.stringify({ state, baseVersion: worldVersion, force }), keepalive });
    flushingState = operation;
    try {
      const result = await operation;
      worldVersion = Number(result.version || worldVersion);
      worldConflict = null;
      return result;
    } catch (error) {
      // A newer snapshot queued while this request was in flight must win.
      pendingState ||= state;
      if (error.code === 'world-state-conflict') {
        worldConflict = error.details;
        window.dispatchEvent(new CustomEvent('zhere:world-state-conflict', { detail: worldConflict }));
      }
      throw error;
    } finally {
      if (flushingState === operation) flushingState = null;
    }
  }

  function saveState(state, { immediate = false } = {}) {
    pendingState = state;
    if (!authenticated) return Promise.resolve(null);
    if (worldConflict && !immediate) return Promise.resolve(null);
    clearTimeout(stateTimer);
    if (immediate) return flushState();
    stateTimer = setTimeout(() => flushState().catch(() => {}), 650);
    return Promise.resolve(null);
  }

  async function bootstrap() {
    const epoch = authEpoch;
    await restoreEvents().catch(() => {});
    const session = await request('/auth/session');
    if (epoch !== authEpoch) return { authenticated: false, superseded: true, user: null, state: null, events: [] };
    authenticated = session.authenticated;
    currentUser = session.user;
    if (!authenticated) return { authenticated: false, user: null, state: null, events: [] };
    await discardForeignEvents().catch(() => {});
    const hasBundledState = Object.prototype.hasOwnProperty.call(session, 'state');
    const [world, recent] = hasBundledState
      ? [{ state: session.state, version: session.version || 0 }, { events: session.events || [] }]
      : await Promise.all([request('/world-state'), request('/events/recent')]);
    if (epoch !== authEpoch) return { authenticated: false, superseded: true, user: null, state: null, events: [] };
    worldVersion = Number(world.version || 0);
    flushEvents().catch(() => {});
    return { authenticated: true, user: currentUser, state: world.state, version: world.version, events: recent.events || [] };
  }

  async function authenticate(path, payload) {
    authEpoch += 1;
    // Feishu-backed registration also creates research identity, consent and
    // session rows. Keep the client timeout above that transactional envelope.
    const body = await request(path, { method: 'POST', body: JSON.stringify(payload), timeoutMs: 30_000 });
    authenticated = true;
    currentUser = body.user;
    await discardForeignEvents().catch(() => {});
    const hasBundledState = Object.prototype.hasOwnProperty.call(body, 'state');
    const [world, recent] = hasBundledState
      ? [{ state: body.state, version: body.version || 0 }, { events: body.events || [] }]
      : await Promise.all([request('/world-state'), request('/events/recent')]);
    worldVersion = Number(world.version || 0);
    flushEvents().catch(() => {});
    return { ...body, state: world.state, version: world.version, events: recent.events || [] };
  }

  async function loadSessionExtras() {
    if (!authenticated) return { publicWorld: null, purchases: [], notifications: [], events: [], degraded: [] };
    const results = await Promise.allSettled([
      loadPublicWorld(), request('/pricing/purchases'), request('/notifications'), request('/events/recent'),
    ]);
    const keys = ['publicWorld', 'purchases', 'notifications', 'events'];
    const degraded = results.flatMap((result, index) => result.status === 'rejected' ? [{ key: keys[index], error: result.reason }] : []);
    return {
      publicWorld: results[0].status === 'fulfilled' ? results[0].value : null,
      purchases: results[1].status === 'fulfilled' ? (results[1].value.purchases || []) : null,
      notifications: results[2].status === 'fulfilled' ? (results[2].value.notifications || []) : null,
      events: results[3].status === 'fulfilled' ? (results[3].value.events || []) : null,
      degraded,
    };
  }

  async function logout() {
    authEpoch += 1;
    const pendingFlushes = [flushState({ keepalive: true }), flushEvents({ keepalive: true })];
    authenticated = false;
    currentUser = null;
    worldVersion = 0;
    worldConflict = null;
    await Promise.allSettled(pendingFlushes);
    await request('/auth/logout', { method: 'POST', body: '{}' });
  }

  async function resolveWorldStateConflict(choice) {
    if (!worldConflict) return null;
    if (choice === 'server') {
      const conflict = worldConflict;
      pendingState = null;
      worldVersion = Number(conflict.version || 0);
      worldConflict = null;
      return conflict;
    }
    if (choice === 'local') {
      worldVersion = Number(worldConflict.version || 0);
      worldConflict = null;
      return flushState({ force: true });
    }
    return null;
  }

  async function uploadMedia({ assetId, title, description, file }) {
    const form = new FormData();
    form.set('assetId', assetId);
    form.set('title', title);
    form.set('description', description || '');
    form.set('file', file, file.name);
    return request('/media', { method: 'POST', body: form });
  }

  async function uploadAndPublishAsset({ assetId, title, description, file, wx, wy, zone }) {
    const form = new FormData();
    form.set('assetId', assetId);
    form.set('title', title);
    form.set('description', description || '');
    form.set('wx', String(wx));
    form.set('wy', String(wy));
    form.set('zone', zone || '');
    form.set('file', file, file.name);
    // A stable asset id makes a timeout-safe retry idempotent on the server.
    return request('/public/assets/upload', { method: 'POST', body: form, timeoutMs: 60_000, retries: 1 });
  }

  async function forgotPassword(payload) {
    return request('/auth/forgot-password', { method: 'POST', body: JSON.stringify(payload) });
  }

  async function updateProfile(payload) {
    const result = await request('/profile', { method: 'PUT', body: JSON.stringify(payload) });
    currentUser = result.user;
    return result;
  }

  async function updateResearchConsent(active) {
    const result = await request('/privacy/consent', { method: 'PUT', body: JSON.stringify({ active: Boolean(active) }) });
    currentUser = result.user;
    return result;
  }

  async function getResearchStatus() {
    return request('/privacy/research-status');
  }

  async function exportAccountData() {
    return request('/privacy/export');
  }

  async function anonymizeAccount() {
    await flushState({ keepalive: true }).catch(() => {});
    await flushEvents({ keepalive: true }).catch(() => {});
    const result = await request('/privacy/anonymize', { method: 'POST', body: JSON.stringify({ confirm: true }) });
    authenticated = false;
    currentUser = null;
    return result;
  }

  async function loadPublicWorld({ since = '' } = {}) {
    const combined = { ok: true, mode: since ? 'delta' : 'full', assets: [], demands: [], records: [], deletedAssetIds: [], deletedDemandIds: [], deletedRecordIds: [], refreshedAt: '' };
    let cursor = 0;
    do {
      const query = new URLSearchParams({ cursor: String(cursor), limit: '100' });
      if (since) query.set('since', since);
      const page = await request(`/public/world?${query}`);
      for (const field of ['assets', 'demands', 'records', 'deletedAssetIds', 'deletedDemandIds', 'deletedRecordIds']) combined[field].push(...(page[field] || []));
      combined.refreshedAt = combined.refreshedAt || page.refreshedAt || '';
      cursor = page.nextCursor;
    } while (cursor != null);
    return combined;
  }

  const publicWorld = {
    load: (options) => loadPublicWorld(options),
    publishAsset: (payload) => request('/public/assets', { method: 'POST', body: JSON.stringify(payload) }),
    uploadAndPublishAsset,
    updateAsset: (assetId, payload) => request(`/public/assets/${encodeURIComponent(assetId)}`, { method: 'PATCH', body: JSON.stringify(payload) }),
    deleteAsset: (assetId) => request(`/public/assets/${encodeURIComponent(assetId)}`, { method: 'DELETE', body: '{}' }),
    setAssetReaction: (assetId, liked) => request(`/public/assets/${encodeURIComponent(assetId)}/reaction`, { method: 'PUT', body: JSON.stringify({ liked }) }),
    setAssetTag: (assetId, tag, active) => request(`/public/assets/${encodeURIComponent(assetId)}/tags/${encodeURIComponent(tag)}`, { method: 'PUT', body: JSON.stringify({ active }) }),
    commentOnAsset: (assetId, payload) => request(`/public/assets/${encodeURIComponent(assetId)}/comments`, { method: 'POST', body: JSON.stringify(payload) }),
    updateAssetComment: (assetId, commentId, text) => request(`/public/assets/${encodeURIComponent(assetId)}/comments/${encodeURIComponent(commentId)}`, { method: 'PATCH', body: JSON.stringify({ text }), timeoutMs: 25_000 }),
    deleteAssetComment: (assetId, commentId) => request(`/public/assets/${encodeURIComponent(assetId)}/comments/${encodeURIComponent(commentId)}`, { method: 'DELETE', body: '{}', timeoutMs: 25_000 }),
    createDemand: (payload) => request('/public/demands', { method: 'POST', body: JSON.stringify(payload), timeoutMs: 20_000 }),
    updateDemand: (demandId, payload) => request(`/public/demands/${encodeURIComponent(demandId)}`, { method: 'PATCH', body: JSON.stringify(payload) }),
    deleteDemand: (demandId) => request(`/public/demands/${encodeURIComponent(demandId)}`, { method: 'DELETE', body: '{}' }),
    respondToDemand: (demandId, payload) => request(`/public/demands/${encodeURIComponent(demandId)}/responses`, { method: 'POST', body: JSON.stringify(payload), timeoutMs: 20_000 }),
    updateDemandResponse: (demandId, responseId, payload) => request(`/public/demands/${encodeURIComponent(demandId)}/responses/${encodeURIComponent(responseId)}`, { method: 'PATCH', body: JSON.stringify(payload), timeoutMs: 25_000 }),
    deleteDemandResponse: (demandId, responseId) => request(`/public/demands/${encodeURIComponent(demandId)}/responses/${encodeURIComponent(responseId)}`, { method: 'DELETE', body: '{}', timeoutMs: 25_000 }),
    setDemandLink: (demandId, assetId, active = true) => request(`/public/demands/${encodeURIComponent(demandId)}/links`, { method: 'PUT', body: JSON.stringify({ assetId, active }) }),
    saveRecord: (payload) => request('/public/records', { method: 'POST', body: JSON.stringify(payload) }),
    deleteRecord: (recordId) => request(`/public/records/${encodeURIComponent(recordId)}`, { method: 'DELETE', body: '{}' }),
    claimSwap: (offerId, payload) => request(`/public/swaps/${encodeURIComponent(offerId)}/claim`, { method: 'POST', body: JSON.stringify(payload) }),
    report: (payload) => request('/public/reports', { method: 'POST', body: JSON.stringify(payload) }),
  };

  const notifications = { load: () => request('/notifications') };

  const admin = {
    reports: () => request('/admin/reports'),
    updateReport: (reportId, status) => request(`/admin/reports/${encodeURIComponent(reportId)}`, { method: 'PATCH', body: JSON.stringify({ status }) }),
    moderate: (targetType, targetId, hidden) => request(`/admin/moderation/${encodeURIComponent(targetType)}/${encodeURIComponent(targetId)}`, { method: 'PUT', body: JSON.stringify({ hidden }) }),
    setTransactionValidity: (transactionId, isValid) => request(`/admin/pricing/transactions/${encodeURIComponent(transactionId)}`, { method: 'PATCH', body: JSON.stringify({ is_valid: Boolean(isValid) }) }),
    pricingExportUrl: `${API}/admin/pricing/export.csv`,
    researchExportUrl: `${API}/admin/research/events.csv`,
  };

  const pricing = {
    submitBid: (materialId, bidPrice, idempotencyKey) => request(`/pricing/materials/${encodeURIComponent(materialId)}/bids`, {
      method: 'POST', body: JSON.stringify({ bid_price: bidPrice, idempotency_key: idempotencyKey }), timeoutMs: 30_000,
    }),
    material: (materialId) => request(`/pricing/materials/${encodeURIComponent(materialId)}`),
    insight: (materialId) => request(`/pricing/materials/${encodeURIComponent(materialId)}/insight`),
    purchases: () => request('/pricing/purchases'),
  };

  setInterval(() => flushEvents().catch(() => {}), 8000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') { flushState({ keepalive: true }).catch(() => {}); flushEvents({ keepalive: true }).catch(() => {}); } });
  window.addEventListener('pagehide', () => {
    queueMicrotask(() => {
      if (!authenticated) return;
      if (pendingState && navigator.sendBeacon) navigator.sendBeacon(`${API}/world-state`, new Blob([JSON.stringify({ state: pendingState, baseVersion: worldVersion })], { type: 'application/json' }));
      if (pendingEvents.size && navigator.sendBeacon) {
        const events = [...pendingEvents.values()].slice(0, 100).map(({ queue_user_id, ...event }) => event);
        navigator.sendBeacon(`${API}/events/batch`, new Blob([JSON.stringify({ events })], { type: 'application/json' }));
      }
    });
  });

  window.ZhereService = {
    ServiceError,
    bootstrap,
    register: (payload) => authenticate('/auth/register', payload),
    login: (payload) => authenticate('/auth/login', payload),
    guest: () => authenticate('/auth/guest', {}),
    logout,
    forgotPassword,
    updateProfile,
    loadSessionExtras,
    saveState,
    flushState,
    resolveWorldStateConflict,
    events: { enqueue: enqueueEvent, flush: flushEvents },
    media: { upload: uploadMedia, url: (assetId) => `${API}/media/${encodeURIComponent(assetId)}` },
    pricing,
    publicWorld, notifications,
    admin,
    privacy: { updateConsent: updateResearchConsent, researchStatus: getResearchStatus, exportData: exportAccountData, anonymize: anonymizeAccount },
    isAuthenticated: () => authenticated,
    user: () => currentUser,
  };
})();
