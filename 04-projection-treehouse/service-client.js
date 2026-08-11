(function () {
  'use strict';

  const API = '/api';
  const EVENT_DB = 'zhere-service-queue';
  const EVENT_STORE = 'events';
  const CRITICAL_EVENTS = new Set(['register', 'login', 'logout', 'publish_asset', 'upload_to_bag', 'bid_raise', 'bid_win', 'bid_lose', 'research_consent_change', 'deletion_request']);
  const pendingEvents = new Map();
  let authenticated = false;
  let currentUser = null;
  let stateTimer = null;
  let pendingState = null;
  let flushingEvents = null;

  class ServiceError extends Error {
    constructor(message, code, status) {
      super(message);
      this.name = 'ServiceError';
      this.code = code;
      this.status = status;
    }
  }

  async function request(path, options = {}) {
    const response = await fetch(`${API}${path}`, {
      credentials: 'same-origin',
      ...options,
      headers: options.body instanceof FormData ? options.headers : { 'content-type': 'application/json', ...options.headers },
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new ServiceError(body.error?.message || '服务暂时不可用。', body.error?.code || 'request-failed', response.status);
    return body;
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

  async function flushState({ keepalive = false } = {}) {
    clearTimeout(stateTimer);
    stateTimer = null;
    if (!authenticated || !pendingState) return null;
    const state = pendingState;
    pendingState = null;
    try {
      return await request('/world-state', { method: 'PUT', body: JSON.stringify({ state }), keepalive });
    } catch (error) {
      pendingState = state;
      throw error;
    }
  }

  function saveState(state, { immediate = false } = {}) {
    pendingState = state;
    if (!authenticated) return Promise.resolve(null);
    clearTimeout(stateTimer);
    if (immediate) return flushState();
    stateTimer = setTimeout(() => flushState().catch(() => {}), 650);
    return Promise.resolve(null);
  }

  async function bootstrap() {
    await restoreEvents().catch(() => {});
    const session = await request('/auth/session');
    authenticated = session.authenticated;
    currentUser = session.user;
    if (!authenticated) return { authenticated: false, user: null, state: null, events: [] };
    await discardForeignEvents().catch(() => {});
    const [world, recent, publicWorld] = await Promise.all([request('/world-state'), request('/events/recent'), loadPublicWorld()]);
    flushEvents().catch(() => {});
    return { authenticated: true, user: currentUser, state: world.state, version: world.version, events: recent.events || [], publicWorld };
  }

  async function authenticate(path, payload) {
    const body = await request(path, { method: 'POST', body: JSON.stringify(payload) });
    authenticated = true;
    currentUser = body.user;
    await discardForeignEvents().catch(() => {});
    const [world, recent, publicWorld] = await Promise.all([request('/world-state'), request('/events/recent'), loadPublicWorld()]);
    flushEvents().catch(() => {});
    return { ...body, state: world.state, version: world.version, events: recent.events || [], publicWorld };
  }

  async function logout() {
    await flushState({ keepalive: true }).catch(() => {});
    await flushEvents({ keepalive: true }).catch(() => {});
    await request('/auth/logout', { method: 'POST', body: '{}' });
    authenticated = false;
    currentUser = null;
  }

  async function uploadMedia({ assetId, title, description, file }) {
    const form = new FormData();
    form.set('assetId', assetId);
    form.set('title', title);
    form.set('description', description || '');
    form.set('file', file, file.name);
    return request('/media', { method: 'POST', body: form });
  }

  async function forgotPassword(payload) {
    return request('/auth/forgot-password', { method: 'POST', body: JSON.stringify(payload) });
  }

  async function updateResearchConsent(active) {
    const result = await request('/privacy/consent', { method: 'PUT', body: JSON.stringify({ active: Boolean(active) }) });
    currentUser = result.user;
    return result;
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
    updateAsset: (assetId, payload) => request(`/public/assets/${encodeURIComponent(assetId)}`, { method: 'PATCH', body: JSON.stringify(payload) }),
    deleteAsset: (assetId) => request(`/public/assets/${encodeURIComponent(assetId)}`, { method: 'DELETE', body: '{}' }),
    setAssetReaction: (assetId, liked) => request(`/public/assets/${encodeURIComponent(assetId)}/reaction`, { method: 'PUT', body: JSON.stringify({ liked }) }),
    setAssetTag: (assetId, tag, active) => request(`/public/assets/${encodeURIComponent(assetId)}/tags/${encodeURIComponent(tag)}`, { method: 'PUT', body: JSON.stringify({ active }) }),
    commentOnAsset: (assetId, payload) => request(`/public/assets/${encodeURIComponent(assetId)}/comments`, { method: 'POST', body: JSON.stringify(payload) }),
    updateAssetComment: (assetId, commentId, text) => request(`/public/assets/${encodeURIComponent(assetId)}/comments/${encodeURIComponent(commentId)}`, { method: 'PATCH', body: JSON.stringify({ text }) }),
    deleteAssetComment: (assetId, commentId) => request(`/public/assets/${encodeURIComponent(assetId)}/comments/${encodeURIComponent(commentId)}`, { method: 'DELETE', body: '{}' }),
    createDemand: (payload) => request('/public/demands', { method: 'POST', body: JSON.stringify(payload) }),
    updateDemand: (demandId, payload) => request(`/public/demands/${encodeURIComponent(demandId)}`, { method: 'PATCH', body: JSON.stringify(payload) }),
    deleteDemand: (demandId) => request(`/public/demands/${encodeURIComponent(demandId)}`, { method: 'DELETE', body: '{}' }),
    respondToDemand: (demandId, payload) => request(`/public/demands/${encodeURIComponent(demandId)}/responses`, { method: 'POST', body: JSON.stringify(payload) }),
    updateDemandResponse: (demandId, responseId, payload) => request(`/public/demands/${encodeURIComponent(demandId)}/responses/${encodeURIComponent(responseId)}`, { method: 'PATCH', body: JSON.stringify(payload) }),
    deleteDemandResponse: (demandId, responseId) => request(`/public/demands/${encodeURIComponent(demandId)}/responses/${encodeURIComponent(responseId)}`, { method: 'DELETE', body: '{}' }),
    setDemandLink: (demandId, assetId, active = true) => request(`/public/demands/${encodeURIComponent(demandId)}/links`, { method: 'PUT', body: JSON.stringify({ assetId, active }) }),
    saveRecord: (payload) => request('/public/records', { method: 'POST', body: JSON.stringify(payload) }),
    deleteRecord: (recordId) => request(`/public/records/${encodeURIComponent(recordId)}`, { method: 'DELETE', body: '{}' }),
    report: (payload) => request('/public/reports', { method: 'POST', body: JSON.stringify(payload) }),
  };

  const admin = {
    reports: () => request('/admin/reports'),
    updateReport: (reportId, status) => request(`/admin/reports/${encodeURIComponent(reportId)}`, { method: 'PATCH', body: JSON.stringify({ status }) }),
    moderate: (targetType, targetId, hidden) => request(`/admin/moderation/${encodeURIComponent(targetType)}/${encodeURIComponent(targetId)}`, { method: 'PUT', body: JSON.stringify({ hidden }) }),
  };

  setInterval(() => flushEvents().catch(() => {}), 8000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') { flushState({ keepalive: true }).catch(() => {}); flushEvents({ keepalive: true }).catch(() => {}); } });
  window.addEventListener('pagehide', () => {
    queueMicrotask(() => {
      if (!authenticated) return;
      if (pendingState && navigator.sendBeacon) navigator.sendBeacon(`${API}/world-state`, new Blob([JSON.stringify({ state: pendingState })], { type: 'application/json' }));
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
    saveState,
    flushState,
    events: { enqueue: enqueueEvent, flush: flushEvents },
    media: { upload: uploadMedia, url: (assetId) => `${API}/media/${encodeURIComponent(assetId)}` },
    publicWorld,
    admin,
    privacy: { updateConsent: updateResearchConsent, exportData: exportAccountData, anonymize: anonymizeAccount },
    isAuthenticated: () => authenticated,
    user: () => currentUser,
  };
})();
