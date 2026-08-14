// Extracted from prototype.js. Loaded as a classic script to share the game runtime.
// Entry screens, auth forms, legal modal and registration validation. Must load
// AFTER prototype.js because its top-level wiring uses $, $$ and the entry DOM.

let entryDirtyTargetPage = null;
let entryDirtyReturnFocus = null;

function applyEntryPage(page) {
  $$('.entry-page').forEach((node) => node.classList.toggle('is-active', node.dataset.entryPage === page));
  $('#entryBack').hidden = page === 'welcome';
  const route = page === 'forgot' ? 'forgot-password' : page;
  const path = page === 'welcome' ? appBasePath : `${appBasePath}#/${route}`;
  history.replaceState({}, '', path);
}

function closeEntryDirtyGuard() {
  $('.entry-dirty-guard', entry)?.setAttribute('hidden', '');
  $('.entry-book').inert = false;
  $('.entry-book').removeAttribute('aria-hidden');
}

function showEntryDirtyGuard(targetPage) {
  entryDirtyTargetPage = targetPage;
  entryDirtyReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  let guard = $('.entry-dirty-guard', entry);
  if (!guard) {
    guard = document.createElement('section');
    guard.className = 'dirty-sheet-guard entry-dirty-guard';
    guard.setAttribute('role', 'alertdialog');
    guard.setAttribute('aria-modal', 'true');
    guard.setAttribute('aria-labelledby', 'entryDirtyTitle');
    guard.innerHTML = `
      <div class="dirty-sheet-paper">
        <p class="purchase-success-kicker">输入保护</p>
        <h2 id="entryDirtyTitle">这页还有没填完的内容</h2>
        <p>继续编辑会保留当前输入；放弃后才会切换页面。</p>
        <div class="media-actions">
          <button class="primary-button" data-entry-dirty-continue type="button">继续编辑</button>
          <button class="paper-button" data-entry-dirty-discard type="button">放弃并切换</button>
        </div>
      </div>`;
    guard.addEventListener('keydown', (event) => trapFocusWithin(event, guard));
    entry.append(guard);
    $('[data-entry-dirty-continue]', guard).addEventListener('click', () => {
      const returnFocus = entryDirtyReturnFocus;
      entryDirtyTargetPage = null;
      entryDirtyReturnFocus = null;
      closeEntryDirtyGuard();
      requestAnimationFrame(() => returnFocus?.isConnected && returnFocus.focus?.());
    });
    $('[data-entry-dirty-discard]', guard).addEventListener('click', () => {
      const page = entryDirtyTargetPage;
      const current = $('.entry-page.is-active', entry);
      if (current) delete current.dataset.dirty;
      entryDirtyTargetPage = null;
      entryDirtyReturnFocus = null;
      closeEntryDirtyGuard();
      if (page) applyEntryPage(page);
    });
  } else {
    guard.removeAttribute('hidden');
  }
  $('.entry-book').inert = true;
  $('.entry-book').setAttribute('aria-hidden', 'true');
  $('[data-entry-dirty-continue]', guard)?.focus();
}

function showEntryPage(page) {
  const current = $('.entry-page.is-active', entry);
  if (current?.matches('form') && current.dataset.dirty === 'true' && current.dataset.entryPage !== page) {
    showEntryDirtyGuard(page);
    return;
  }
  applyEntryPage(page);
}

const ENTRY_LEGAL_COPY = {
  terms: {
    title: 'Zhere 使用条款',
    intro: '本说明适用于当前网页测试版。创建角色即表示你理解这里是用于探索、创作和算法研究的模拟游戏环境。',
    sections: [
      ['使用资格', '使用者须年满 16 周岁，并使用本人可接收通知的邮箱或手机号创建账户。请妥善保管密码，不要冒用他人身份。'],
      ['公共世界与个人空间', '公共素材、需求和回应属于公共世界内容；其他玩家可以看见并按规则互动。你只能长期改造自己的小屋，不能删除或改变他人的公共内容。'],
      ['模拟报价与副本', '报价使用独立的模拟价格单位，不是真实支付，不扣除灵感币，也不能提现或兑换。报价成功获得的是一次视频素材授权对应的个人副本；公共原素材不会被移除。'],
      ['内容责任', '请勿上传违法、侵权、欺诈、骚扰、泄露隐私或不适合公共展示的内容。平台可以隐藏、限制或删除违规内容，并保留必要的操作记录。'],
      ['测试版变更', '测试期间功能、地图和规则可能调整。涉及研究授权、数据删除和虚拟价格含义的关键规则会保持明确提示。'],
    ],
  },
  privacy: {
    title: 'Zhere 隐私说明',
    intro: '我们只按页面已说明的目的处理账户、游戏进度、视频资产和研究事件数据。研究授权可以随时关闭，关闭后账户和游戏进度仍然保留。',
    sections: [
      ['收集哪些数据', '包括账户标识与加密密码、角色资料、游戏进度、上传的视频文件与描述、公开素材和需求、评论回应、曝光观看、收藏标签、模拟报价、成交与副本布置等事件。'],
      ['为什么收集', '数据用于提供登录与跨设备进度、保存公共内容、保障安全，以及在你自愿授权后研究推荐算法与智能定价方法。真实密码不会以明文保存。'],
      ['保存与可见范围', '数据默认长期保存。公开发布的素材、需求、回应和昵称可被其他玩家看到；邮箱、手机号、密码哈希和研究主体标识不会作为公共资料展示。'],
      ['你的选择', '你可以在“数据与隐私”中退出研究、导出个人数据或申请匿名化。退出研究不会删除账户；匿名化后账户访问会被撤销，历史研究记录不再保留直接身份。'],
      ['数据提供范围', '研究数据不提供给第三方训练模型。服务端可使用飞书多维表格与云空间保存业务和视频数据，浏览器不会持有飞书 App Secret。'],
    ],
  },
};

let entryLegalReturnFocus = null;
function openEntryLegal(kind) {
  const content = ENTRY_LEGAL_COPY[kind];
  if (!content) return;
  entryLegalReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  $('#entryLegalContent').innerHTML = `<h2 id="entryLegalTitle">${content.title}</h2><p>${content.intro}</p>${content.sections.map(([title, body]) => `<section><h3>${title}</h3><p>${body}</p></section>`).join('')}<p class="entry-note">版本日期：2026 年 8 月 13 日。如正式上线前法律文本更新，以注册页面展示的最新版本为准。</p>`;
  $('#entryLegal').hidden = false;
  $('.entry-book').inert = true;
  $('.entry-book').setAttribute('aria-hidden', 'true');
  $('#entryLegalClose').focus();
}

function closeEntryLegal() {
  $('#entryLegal').hidden = true;
  $('.entry-book').inert = false;
  $('.entry-book').removeAttribute('aria-hidden');
  entryLegalReturnFocus?.focus?.();
  entryLegalReturnFocus = null;
}

function registrationFieldError(name, form) {
  const input = form.elements[name];
  const value = String(input?.value || '').trim();
  if (name === 'identity') {
    if (!value) return '请填写邮箱或手机号。';
    if (!(/^1[3-9]\d{9}$/.test(value) || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))) return '请填写完整邮箱或中国大陆 11 位手机号。';
  }
  if (name === 'nickname' && (value.length < 1 || value.length > 16)) return '昵称需要 1–16 个字符。';
  if (name === 'spaceName' && (value.length < 1 || value.length > 24)) return '小屋名称需要 1–24 个字符。';
  if (name === 'password' && String(input?.value || '').length < 8) return '密码至少需要 8 位。';
  if (name === 'confirmPassword') {
    if (!input?.value) return '请再次输入密码。';
    if (input.value !== form.elements.password.value) return '两次密码不一致。';
  }
  return '';
}

function validateRegistrationField(name, form = $('#registerForm')) {
  const input = form.elements[name];
  const error = registrationFieldError(name, form);
  const output = $(`#${name}Error`);
  if (output) output.textContent = error;
  input?.classList.toggle('is-invalid', Boolean(error));
  input?.classList.toggle('is-valid', !error && Boolean(String(input.value || '').trim()));
  input?.setAttribute('aria-invalid', String(Boolean(error)));
  return !error;
}

$$('[data-entry-target]').forEach((button) => button.addEventListener('click', () => showEntryPage(button.dataset.entryTarget)));
$('#entryBack').addEventListener('click', () => showEntryPage('welcome'));
$$('[data-legal]').forEach((button) => button.addEventListener('click', () => openEntryLegal(button.dataset.legal)));
$('#entryLegalClose').addEventListener('click', closeEntryLegal);
$('#entryLegal').addEventListener('click', (event) => { if (event.target === $('#entryLegal')) closeEntryLegal(); });
['identity', 'nickname', 'spaceName', 'password', 'confirmPassword'].forEach((name) => {
  const input = $('#registerForm').elements[name];
  input.addEventListener('blur', () => validateRegistrationField(name));
  input.addEventListener('input', () => {
    if (input.classList.contains('is-invalid') || name === 'confirmPassword') validateRegistrationField(name);
    if (name === 'password' && $('#registerForm').elements.confirmPassword.value) validateRegistrationField('confirmPassword');
  });
});
['#registerForm', '#loginForm', '#forgotForm'].forEach((selector) => {
  const form = $(selector);
  if (!form) return;
  form.addEventListener('input', (event) => {
    if (event.target.matches('input, textarea, select')) form.dataset.dirty = 'true';
  });
});
$('#guestButton').addEventListener('click', async () => {
  const button = $('#guestButton');
  setPendingButton(button, true, '正在准备公域…');
  const noticeTimer = delayedAuthNotice(button);
  try {
    if (!serviceSessionAvailable) {
      const result = await window.ZhereService.guest();
      if (result.state) Object.assign(state, normalizeState(result.state));
      state.rawEvents = Array.isArray(result.events) ? result.events.slice(-RAW_EVENT_CAP) : [];
      applyPublicWorld(result.publicWorld, { render: false });
      applyPricingPurchases(result.purchases);
      state.notifications = result.notifications || [];
    }
    serviceSessionAvailable = true;
    persist();
    enterWorld('server-guest');
    hydrateSessionExtras().then(() => migrateLegacyPublicContent());
  } catch (error) {
    showToast(error.message || '服务端暂时不可用');
  } finally {
    clearTimeout(noticeTimer);
    setPendingButton(button, false);
  }
});
$('#loginForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.checkValidity()) return $('#loginError').textContent = '请填写有效账户和至少 8 位密码。';
  const submit = form.querySelector('[type="submit"]');
  setPendingButton(submit, true, '正在验证身份…');
  $('#loginError').textContent = '';
  const noticeTimer = delayedAuthNotice(submit, $('#loginError'));
  try {
    const data = new FormData(form);
    const result = await window.ZhereService.login({ identity: data.get('identity'), password: data.get('password') });
    serviceSessionAvailable = true;
    if (result.state) Object.assign(state, normalizeState(result.state));
    state.rawEvents = Array.isArray(result.events) ? result.events.slice(-RAW_EVENT_CAP) : [];
    if (result.user) {
      state.profile.nickname = result.user.nickname || state.profile.nickname;
      state.profile.username = result.user.username || state.profile.username;
      state.profile.spaceName = result.user.spaceName || state.profile.spaceName;
      state.research = Boolean(result.user.research);
    }
    persist();
    logEvent('login', { method: 'password' });
    enterWorld('server-login');
    hydrateSessionExtras().then(() => migrateLegacyPublicContent());
  } catch (error) {
    $('#loginError').textContent = error.message || '登录失败，请稍后重试。';
  } finally {
    clearTimeout(noticeTimer);
    setPendingButton(submit, false);
  }
});
$('#registerForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  const fieldNames = ['identity', 'nickname', 'spaceName', 'password', 'confirmPassword'];
  const invalidField = fieldNames.find((name) => !validateRegistrationField(name, form));
  if (invalidField) {
    $('#registerError').textContent = '请先修改上方标出的格式问题。';
    form.elements[invalidField].focus();
    return;
  }
  if (!data.get('age')) { $('#registerError').textContent = '需要确认已满 16 周岁才能创建角色。'; form.elements.age.focus(); return; }
  if (!data.get('terms')) { $('#registerError').textContent = '请先阅读并同意使用条款与隐私说明。'; form.elements.terms.focus(); return; }
  const submit = form.querySelector('[type="submit"]');
  setPendingButton(submit, true, '正在创建角色并准备公域…');
  $('#registerError').textContent = '';
  const noticeTimer = delayedAuthNotice(submit, $('#registerError'));
  try {
    const result = await window.ZhereService.register({
      identity: data.get('identity'), nickname: data.get('nickname'), spaceName: data.get('spaceName'),
      password: data.get('password'), confirmPassword: data.get('confirmPassword'), ageConfirmed: data.get('age') === 'on',
      agreeTerms: data.get('terms') === 'on', research: data.get('research') === 'on',
    });
    serviceSessionAvailable = true;
    if (result.state) Object.assign(state, normalizeState(result.state));
    state.rawEvents = Array.isArray(result.events) ? result.events.slice(-RAW_EVENT_CAP) : [];
    applyPublicWorld(result.publicWorld, { render: false });
    applyPricingPurchases(result.purchases);
    state.notifications = result.notifications || [];
    state.profile.nickname = data.get('nickname') || state.profile.nickname;
    state.profile.username = result.user?.username || state.profile.username;
    state.profile.spaceName = data.get('spaceName') || state.profile.spaceName;
    state.research = data.get('research') === 'on';
    persist();
    logEvent('register', { consent_research: state.research });
    enterWorld('server-register');
    hydrateSessionExtras().then(() => migrateLegacyPublicContent());
  } catch (error) {
    $('#registerError').textContent = error.message || '注册失败，请稍后重试。';
  } finally {
    clearTimeout(noticeTimer);
    setPendingButton(submit, false);
  }
});
$('#forgotForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  try {
    await window.ZhereService.forgotPassword({ identity: data.get('identity'), note: data.get('note') });
    showEntryPage('welcome');
    showToast('人工重置申请已提交；当前不会自动发送邮件或短信');
  } catch (error) { showToast(error.message || '提交失败，请稍后重试'); }
});

$('#entryLegal').addEventListener('keydown', (event) => trapFocusWithin(event, $('#entryLegal')));

const initialEntryRoute = location.hash.replace('#/', '');
if (['login', 'register', 'forgot-password'].includes(initialEntryRoute)) showEntryPage(initialEntryRoute === 'forgot-password' ? 'forgot' : initialEntryRoute);
