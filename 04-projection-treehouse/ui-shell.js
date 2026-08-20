// Extracted from prototype.js. Loaded as a classic script to share the game runtime.

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
}

function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function showToast(message) {
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => { toast.hidden = true; }, 2400);
}

function setPendingButton(button, pending, label) {
  if (!button) return;
  if (pending) {
    button.dataset.idleLabel ||= button.textContent;
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    button.classList.add('is-pending');
    if (label) button.textContent = label;
    return;
  }
  button.disabled = false;
  button.removeAttribute('aria-busy');
  button.classList.remove('is-pending');
  if (button.dataset.idleLabel) button.textContent = button.dataset.idleLabel;
}

function resetEntryPendingButtons() {
  $$('.entry-page .is-pending').forEach((button) => setPendingButton(button, false));
}

function delayedAuthNotice(button, output) {
  return setTimeout(() => {
    if (!button?.classList.contains('is-pending')) return;
    if (output) output.textContent = '身份已经送达服务端，正在取回你的世界进度；公共内容会在进入后继续后台加载。';
    else button.textContent = '正在建立角色进度…';
  }, 3200);
}

function unreadNotifications() {
  const seenAt = Date.parse(state.notificationReadAt || 0) || 0;
  return state.notifications.filter((item) => Date.parse(item.createdAt || 0) > seenAt);
}

function updateEchoCount() {
  const count = unreadNotifications().length;
  echoCount.textContent = count > 99 ? '99+' : String(count);
  $('#echoButton').classList.toggle('has-unread', count > 0);
  $('#echoButton').setAttribute('aria-label', count ? `打开回声盒，${count} 条未读` : '打开回声盒，没有未读');
}

async function refreshNotifications({ announce = false } = {}) {
  if (!window.ZhereService?.isAuthenticated()) return;
  if (notificationSyncPromise) return notificationSyncPromise;
  const before = unreadNotifications().length;
  notificationSyncPromise = (async () => { try {
    const result = await window.ZhereService.notifications.load();
    state.notifications = result.notifications || [];
    updateEchoCount();
    const after = unreadNotifications().length;
    if (announce && after > before) showToast(`回声盒里多了 ${after - before} 条新消息`);
    lastNotificationSyncAt = Date.now();
    return result;
  } catch (error) { console.warn('Notification refresh failed', error); return null; }
  finally { notificationSyncPromise = null; } })();
  return notificationSyncPromise;
}

async function openNotificationTarget(item) {
  if (!item) return showToast('这条回声暂时找不到对应内容');
  await syncPublicWorld({ render: true });
  if (item.targetType === 'asset') {
    const video = findVideoById(item.targetId);
    if (video) return showVideo(video);
  }
  if (item.targetType === 'demand') {
    const note = allWorldNotes().find((candidate) => candidate.id === item.targetId);
    if (note) return showNoteDetail(note);
  }
  if (item.targetType === 'neighbor' && item.targetId) return showNeighbor(item.targetId);
  if (item.targetType === 'record') return showSwapBox();
  showToast('这条回声对应的内容已经离开公域');
}

function echoKindLabel(item) {
  return {
    asset_comment: '素材回应',
    demand_response: '需求回应',
    demand_link: '素材关联',
    asset_bid: '模拟报价',
    swap_claim: '交换结果',
    follow: '小窝来访',
    space_message: '门口纸条',
    content_share: '内容递送',
  }[item?.kind] || '世界回声';
}

function showEchoDetail(item) {
  if (!item) return showToast('这条回声暂时无法读取');
  const targetLabel = item.targetType === 'asset' ? '查看对应素材'
    : item.targetType === 'demand' ? '查看对应需求'
      : item.targetType === 'neighbor' && item.targetId ? '沿小径回访'
        : item.targetType === 'record' ? '打开交换箱' : '';
  logEvent('echo_detail_open', { notification_id: item.id, notification_kind: item.kind, target_type: item.targetType });
  openSheet(`
    <div class="sheet-inner echo-detail-sheet">
      <button class="text-button echo-back" id="echoDetailBack" type="button">返回回声盒</button>
      <p class="echo-detail-kind">${escapeHtml(echoKindLabel(item))}</p>
      <h2 class="sheet-title" id="sheetTitle" tabindex="-1">${escapeHtml(item.title || '一条新的回声')}</h2>
      <div class="echo-detail-message"><span class="echo-seed" aria-hidden="true"></span><p>${escapeHtml(item.summary || '这条回声没有留下更多文字。')}</p></div>
      <time class="echo-detail-time" datetime="${escapeHtml(item.createdAt || '')}">${escapeHtml(new Date(item.createdAt).toLocaleString('zh-CN'))}</time>
      <div class="media-actions">
        ${targetLabel ? `<button class="primary-button" id="echoOpenTarget" type="button">${targetLabel}</button>` : ''}
        <button class="paper-button" id="echoDetailClose" type="button">收好这条回声</button>
      </div>
    </div>
  `, () => {
    $('#echoDetailBack').addEventListener('click', showEchoBox);
    $('#echoDetailClose').addEventListener('click', closeSheet);
    $('#echoOpenTarget')?.addEventListener('click', () => openNotificationTarget(item));
  });
}

function showEchoBox() {
  state.notificationReadAt = new Date().toISOString();
  persist();
  updateEchoCount();
  openSheet(`
    <div class="sheet-inner echo-sheet">
      <h2 class="sheet-title" id="sheetTitle" tabindex="-1">回声盒</h2>
      <p class="sheet-subtitle">你离开时，公共世界仍在生长。这里收好需求回应、素材留言、模拟报价与交换结果；它们不会变成必须完成的任务。</p>
      <div class="echo-list">${state.notifications.length ? state.notifications.map((item) => `<button class="echo-row" type="button" data-echo-id="${escapeHtml(item.id)}"><span class="echo-seed" aria-hidden="true"></span><span><b>${escapeHtml(item.title)}</b><small>${escapeHtml(item.summary)}</small><em>${escapeHtml(new Date(item.createdAt).toLocaleString('zh-CN'))} · 查看详情</em></span><span class="echo-row-arrow" aria-hidden="true"></span></button>`).join('') : '<div class="empty-state"><b>盒子里还没有回声</b><p>发布一张需求、公开视频或把副本放进交换箱；其他旅人的回应会出现在这里。</p></div>'}</div>
      <div class="media-actions"><button class="paper-button" id="echoRefresh" type="button">刷新回声</button><button class="text-button" id="echoClose" type="button">回到世界</button></div>
    </div>
  `, () => {
    $$('[data-echo-id]', sheet).forEach((button) => button.addEventListener('click', () => showEchoDetail(state.notifications.find((item) => item.id === button.dataset.echoId))));
    $('#echoRefresh').addEventListener('click', async () => { await refreshNotifications(); showEchoBox(); });
    $('#echoClose').addEventListener('click', closeSheet);
  });
}

function onboardingActive() { return state.onboarding.status === 'active'; }

function beginOnboarding() {
  state.onboarding = { ...defaultState.onboarding, status: 'active', step: 1 };
  const firstVideo = worldVideos.find((video) => video.id === 'v-sneaker-rain') || worldVideos[0];
  if (firstVideo) {
    state.guidanceTarget = { wx: firstVideo.wx, wy: firstVideo.wy, label: `先观看《${firstVideo.title}》` };
  }
  persist(); renderWorld(); renderOnboarding();
  say('先不用记按键。花三分钟完成一次真实循环：看一段素材、回应一张纸条，再带着收集到的材料回家。', '木秋', [{ label: '打开第一段素材', handler: () => showVideo(firstVideo) }, { label: '跳过引导', handler: skipOnboarding }]);
}

function skipOnboarding() {
  state.onboarding.status = 'skipped'; state.guideIntroSeen = true; state.guidanceTarget = null;
  persist(); renderOnboarding(); renderWorld(); say('好，世界没有必须完成的清单。需要说明时随时打开图鉴。');
}

function advanceOnboarding(kind, payload = {}) {
  if (!onboardingActive()) return;
  const flow = state.onboarding;
  if (kind === 'watch' && flow.step === 1) {
    flow.watchedAssetId = payload.assetId || ''; flow.step = 2;
    const note = systemNotes.find((item) => item.refAsset === payload.assetId) || systemNotes[0];
    state.guidanceTarget = { wx: note.wx, wy: note.wy, label: `回应「${note.title}」` };
    say('你已经看过这段影像。现在去看看一张真实需求：可以附上刚才的视频，也可以只写一句观察。', '木秋', [{ label: '打开这张需求', handler: () => showNoteDetail(note) }, { label: '跳过引导', handler: skipOnboarding }]);
  } else if (kind === 'response' && flow.step === 2) {
    flow.respondedDemandId = payload.demandId || ''; flow.step = 3;
    state.guidanceTarget = { wx: -470, wy: 250, label: '收集一份会再生的材料' };
    say('回应已经留在公域。最后收集一份会再生的材料，再按 H 回到自己的地块。', '木秋', [{ label: '跳过引导', handler: skipOnboarding }]);
  } else if (kind === 'gather' && flow.step === 3) {
    flow.gathered = true; flow.step = 4; state.guidanceTarget = { ...objectTargets.cottage, label: '回到地块，让远行留下改变' };
    say('材料进了资源袋。按 H 回到地块，再搭建已经备齐材料的露天工作台，让远行留下第一个改变。', '木秋', [{ label: '现在回地块', handler: goToHomestead }, { label: '跳过引导', handler: skipOnboarding }]);
  } else if (kind === 'home-change' && flow.step === 4) {
    flow.homeChanged = true; flow.step = 5; flow.status = 'completed'; state.guideIntroSeen = true; state.guidanceTarget = null;
    logEvent('onboarding_completed', { watched_asset_id: flow.watchedAssetId, responded_demand_id: flow.respondedDemandId });
    say('看见了吗？公共世界里的发现没有被你拿走，但这块地记住了你的远行。接下来往任何方向走都可以。', '木秋', [{ label: '继续自由探索', handler: () => { dialogueActions.replaceChildren(); dialogue.classList.add('is-collapsed'); } }]);
    showToast('第一次远行完成，地块记住了你的改变');
  }
  persist(); renderOnboarding(); renderWorld();
}

function renderOnboarding() {
  let node = $('#onboardingRibbon');
  if (!onboardingActive()) { node?.remove(); return; }
  if (!node) { node = document.createElement('aside'); node.id = 'onboardingRibbon'; node.className = 'onboarding-ribbon'; node.setAttribute('aria-live', 'polite'); worldStage.append(node); }
  const labels = ['观看一段素材', '回应一张需求', '收集会再生的材料', '回地块留下改变'];
  node.innerHTML = `<button class="onboarding-skip" type="button">跳过</button><b>第一次远行 · ${Math.min(state.onboarding.step, 4)}/4</b><span>${escapeHtml(labels[Math.max(0, state.onboarding.step - 1)] || labels[0])}</span>`;
  $('.onboarding-skip', node).addEventListener('click', skipOnboarding);
}

function addDialogueAction(label, handler) {
  const button = document.createElement('button');
  button.className = 'small-action';
  button.textContent = label;
  button.addEventListener('click', handler);
  dialogueActions.append(button);
}

function say(text, who = '木秋', options = []) {
  speaker.textContent = who;
  dialogueText.textContent = text;
  dialogueActions.replaceChildren();
  options.forEach((option) => addDialogueAction(option.label, option.handler));
  dialogue.classList.remove('is-collapsed');
  delete dialogue.dataset.pinnedOpen;
  $('#dialogueToggle').textContent = '收起';
  $('#dialogueToggle').setAttribute('aria-expanded', 'true');
}

function openSheet(markup, setup, options = {}) {
  stopMovement(true);
  closeContextWheel();
  if (sheet.hidden) sheetReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  sheetContent.innerHTML = markup;
  delete sheet.dataset.dirty;
  const dismissible = options.dismissible !== false;
  sheet.dataset.dismissible = String(dismissible);
  const closeButton = $('#sheetClose');
  closeButton.hidden = !dismissible;
  closeButton.disabled = !dismissible;
  sheet.hidden = false;
  sheet.scrollTop = 0;
  scrim.hidden = false;
  document.body.classList.add('sheet-open');
  profileDrawer.hidden = true;
  game.inert = true;
  state.commentReplyTo = null;
  setup?.();
  if (typeof updateHudState === 'function') updateHudState();
  requestAnimationFrame(() => $('.sheet-title', sheet)?.focus?.());
}

function focusableControls(container) {
  return [...container.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')]
    .filter((node) => !node.hidden && node.getClientRects().length > 0);
}

function trapFocusWithin(event, container) {
  if (event.key !== 'Tab' || container.hidden) return;
  const controls = focusableControls(container);
  if (!controls.length) return;
  const first = controls[0];
  const last = controls.at(-1);
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

sheet.addEventListener('keydown', (event) => trapFocusWithin(event, sheet));

sheetContent.addEventListener('input', (event) => {
  const field = event.target instanceof Element ? event.target.closest('input, textarea, select') : null;
  if (!field || !field.closest('form') || field.matches('[type="hidden"], [type="button"], [type="submit"]')) return;
  sheet.dataset.dirty = 'true';
});

function requestCloseSheet() {
  if (sheet.dataset.dismissible === 'false') return;
  if (sheet.dataset.dirty !== 'true') {
    closeSheet();
    return;
  }
  let guard = $('.dirty-sheet-guard', sheet);
  if (!guard) {
    guard = document.createElement('section');
    guard.className = 'dirty-sheet-guard';
    guard.setAttribute('role', 'alertdialog');
    guard.setAttribute('aria-modal', 'true');
    guard.setAttribute('aria-labelledby', 'dirtySheetTitle');
    guard.innerHTML = `
      <div class="dirty-sheet-paper">
        <p class="purchase-success-kicker">输入保护</p>
        <h2 id="dirtySheetTitle">这页还有没有保存的内容</h2>
        <p>继续编辑会保留当前输入；放弃后才会关闭这张纸。</p>
        <div class="media-actions">
          <button class="primary-button" data-dirty-continue type="button">继续编辑</button>
          <button class="paper-button" data-dirty-discard type="button">放弃输入并关闭</button>
        </div>
      </div>`;
    sheetContent.inert = true;
    $('#sheetClose').disabled = true;
    guard.addEventListener('keydown', (event) => trapFocusWithin(event, guard));
    sheet.append(guard);
    $('[data-dirty-continue]', guard).addEventListener('click', () => {
      guard.remove();
      sheetContent.inert = false;
      $('#sheetClose').disabled = false;
      $('.sheet-title', sheet)?.focus?.();
    });
    $('[data-dirty-discard]', guard).addEventListener('click', () => {
      delete sheet.dataset.dirty;
      guard.remove();
      closeSheet();
    });
  }
  $('[data-dirty-continue]', guard)?.focus();
}

function closeSheet() {
  if (worldConflictOpen) return;
  const activeMedia = $('#videoFrame video', sheet);
  if (state.activeVideo && activeMedia) logEvent('watch_time', {
    asset_id: state.activeVideo.id,
    duration: Number((activeMedia.dataset.watchedSeconds || 0)),
    media_duration: Number.isFinite(activeMedia.duration) ? Number(activeMedia.duration.toFixed(2)) : null,
    source: activeMedia.dataset.source || null,
  });
  sheet.hidden = true;
  delete sheet.dataset.dirty;
  delete sheet.dataset.dismissible;
  $('.dirty-sheet-guard', sheet)?.remove();
  sheetContent.inert = false;
  $('#sheetClose').hidden = false;
  $('#sheetClose').disabled = false;
  scrim.hidden = true;
  document.body.classList.remove('sheet-open');
  sheetContent.replaceChildren();
  state.activeVideo = null;
  state.commentReplyTo = null;
  game.inert = false;
  if (state.activeObjectUrl) {
    URL.revokeObjectURL(state.activeObjectUrl);
    state.activeObjectUrl = null;
  }
  if (typeof updateHudState === 'function') updateHudState();
  const returnTarget = sheetReturnFocus;
  sheetReturnFocus = null;
  requestAnimationFrame(() => returnTarget?.isConnected && returnTarget.focus?.());
}

// ---- Form draft persistence (localStorage) ----
const FORM_DRAFT_STORE_KEY = 'zhere-form-drafts';

function formDraftKey(id) {
  return String(id);
}

function readFormDraftStore() {
  try {
    const raw = localStorage.getItem(FORM_DRAFT_STORE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (error) { return {}; }
}

function saveFormDraft(key, value) {
  const store = readFormDraftStore();
  store[formDraftKey(key)] = String(value ?? '').slice(0, 2000);
  try { localStorage.setItem(FORM_DRAFT_STORE_KEY, JSON.stringify(store)); } catch (error) { /* QuotaExceeded 等写入失败时静默，不打断输入 */ }
}

function loadFormDraft(key) {
  const value = readFormDraftStore()[formDraftKey(key)];
  return typeof value === 'string' ? value : '';
}

function clearFormDraft(key) {
  const store = readFormDraftStore();
  const draftKey = formDraftKey(key);
  if (!(draftKey in store)) return;
  delete store[draftKey];
  try { localStorage.setItem(FORM_DRAFT_STORE_KEY, JSON.stringify(store)); } catch (error) { /* ignore */ }
}

function isDraftableField(field) {
  if (!(field instanceof Element)) return false;
  if (field.tagName === 'TEXTAREA') return true;
  if (field.tagName !== 'INPUT') return false;
  const type = (field.type || 'text').toLowerCase();
  return !['hidden', 'submit', 'button', 'reset', 'checkbox', 'radio', 'file', 'image', 'password', 'range', 'color'].includes(type);
}

function collectFormDraft(form) {
  const values = {};
  [...form.elements].forEach((field, index) => {
    if (!isDraftableField(field)) return;
    const name = field.name || field.id || `field-${index}`;
    values[name] = field.value;
  });
  return JSON.stringify(values);
}

function restoreFormDraft(form, serialized) {
  let values;
  try { values = JSON.parse(serialized); } catch (error) { return false; }
  if (!values || typeof values !== 'object' || Array.isArray(values)) return false;
  let restored = false;
  [...form.elements].forEach((field, index) => {
    if (!isDraftableField(field)) return;
    const name = field.name || field.id || `field-${index}`;
    if (Object.prototype.hasOwnProperty.call(values, name)) {
      field.value = values[name];
      restored = true;
    }
  });
  return restored;
}

function attachFormDraft(form, key, { hint = '已恢复上次未发送的内容（本地保存）' } = {}) {
  if (!form) return;
  const draftKey = formDraftKey(key);
  const saved = loadFormDraft(draftKey);
  if (saved && restoreFormDraft(form, saved)) {
    const note = document.createElement('p');
    note.className = 'form-draft-hint';
    note.textContent = hint;
    form.before(note);
  }
  let timer = null;
  form.addEventListener('input', (event) => {
    if (!isDraftableField(event.target)) return;
    clearTimeout(timer);
    timer = setTimeout(() => saveFormDraft(draftKey, collectFormDraft(form)), 400);
  });
}
