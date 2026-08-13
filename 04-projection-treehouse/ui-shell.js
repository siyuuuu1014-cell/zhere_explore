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
    if (output) output.textContent = '飞书数据正在响应，可能需要几秒；超过 30 秒会自动恢复。';
  }, 7000);
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

function openNotificationTarget(item) {
  if (item.targetType === 'asset') return showVideo(findVideoById(item.targetId));
  if (item.targetType === 'demand') return showNoteDetail(allWorldNotes().find((note) => note.id === item.targetId));
  if (item.targetType === 'record') return showSwapBox();
  showToast('这条回声对应的内容已经离开公域');
}

function showEchoBox() {
  state.notificationReadAt = new Date().toISOString();
  persist();
  updateEchoCount();
  openSheet(`
    <div class="sheet-inner echo-sheet">
      <h2 class="sheet-title" id="sheetTitle" tabindex="-1">回声盒</h2>
      <p class="sheet-subtitle">你离开时，公共世界仍在生长。这里收好需求回应、素材留言、模拟报价与交换结果；它们不会变成必须完成的任务。</p>
      <div class="echo-list">${state.notifications.length ? state.notifications.map((item) => `<button class="echo-row" type="button" data-echo-id="${escapeHtml(item.id)}"><span class="echo-seed" aria-hidden="true"></span><span><b>${escapeHtml(item.title)}</b><small>${escapeHtml(item.summary)}</small><em>${escapeHtml(new Date(item.createdAt).toLocaleString('zh-CN'))}</em></span></button>`).join('') : '<div class="empty-state"><b>盒子里还没有回声</b><p>发布一张需求、公开视频或把副本放进交换箱；其他旅人的回应会出现在这里。</p></div>'}</div>
      <div class="media-actions"><button class="paper-button" id="echoRefresh" type="button">刷新回声</button><button class="text-button" id="echoClose" type="button">回到世界</button></div>
    </div>
  `, () => {
    $$('[data-echo-id]', sheet).forEach((button) => button.addEventListener('click', () => openNotificationTarget(state.notifications.find((item) => item.id === button.dataset.echoId))));
    $('#echoRefresh').addEventListener('click', async () => { await refreshNotifications(); showEchoBox(); });
    $('#echoClose').addEventListener('click', closeSheet);
  });
}

function onboardingActive() { return state.onboarding.status === 'active'; }

function beginOnboarding() {
  state.onboarding = { ...defaultState.onboarding, status: 'active', step: 1 };
  const firstVideo = worldVideos.find((video) => video.id === 'v-sneaker-rain') || worldVideos[0];
  if (firstVideo) {
    state.wx = firstVideo.wx;
    state.wy = firstVideo.wy + 80;
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
  $('#dialogueToggle').textContent = '收起';
  $('#dialogueToggle').setAttribute('aria-expanded', 'true');
}

function openSheet(markup, setup) {
  stopMovement(true);
  closeContextWheel();
  if (sheet.hidden) sheetReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  sheetContent.innerHTML = markup;
  sheet.hidden = false;
  sheet.scrollTop = 0;
  scrim.hidden = false;
  document.body.classList.add('sheet-open');
  profileDrawer.hidden = true;
  game.inert = true;
  state.commentReplyTo = null;
  setup?.();
  requestAnimationFrame(() => $('.sheet-title', sheet)?.focus?.());
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
  const returnTarget = sheetReturnFocus;
  sheetReturnFocus = null;
  requestAnimationFrame(() => returnTarget?.isConnected && returnTarget.focus?.());
}
