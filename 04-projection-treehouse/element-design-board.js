(() => {
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const landmarkCopy = {
    '我的小屋': '归属 · 门灯呼吸、烟囱轻响；只有这里允许改造。',
    '公告树': '发布与索引 · 新纸条让枝叶轻摆，靠近时能看见最近留下的内容。',
    '共创工坊': '上传与制作 · 灯亮、木轮转动，桌面上的半成品说明这里正在工作。',
    '枝头望远镜': '远方发现 · 镜筒转向最近的新信号，但永远不替玩家决定方向。',
    '听风码头': '环境声音 · 风铃与芦苇先回应靠近，声音播放时码头木板轻振。',
    '海边长椅': '留言与停留 · 遗落围巾、贝壳和坐痕说明曾有人来过，不制造聊天室压力。',
    '回声水洼': '可忽略异象 · 波纹从脚边扩散，参与、改变或直接离开都不会产生待办。'
  };

  $$('[data-ambience]').forEach((button) => {
    button.addEventListener('click', () => {
      document.body.dataset.ambience = button.dataset.ambience;
      $$('[data-ambience]').forEach((item) => {
        const active = item === button;
        item.classList.toggle('is-active', active);
        item.setAttribute('aria-pressed', String(active));
      });
    });
  });
  $('[data-ambience="day"]')?.classList.add('is-active');

  $$('.landmark').forEach((button) => {
    button.addEventListener('click', () => {
      $$('.landmark').forEach((item) => item.classList.remove('is-selected'));
      button.classList.add('is-selected');
      $('#landmarkName').textContent = button.dataset.landmark;
      $('#landmarkKind').textContent = landmarkCopy[button.dataset.landmark] || button.dataset.kind;
    });
  });

  const mediaObjects = $$('.media-object');
  mediaObjects.forEach((button) => {
    button.addEventListener('click', () => {
      const next = !button.classList.contains('is-playing');
      button.classList.toggle('is-playing', next);
      button.setAttribute('aria-pressed', String(next));
      $('em', button).textContent = next ? '播放中' : '播放';
    });
  });
  $('#playAllMedia')?.addEventListener('click', (event) => {
    const next = mediaObjects.some((item) => !item.classList.contains('is-playing'));
    mediaObjects.forEach((item, index) => {
      window.setTimeout(() => {
        item.classList.toggle('is-playing', next);
        item.setAttribute('aria-pressed', String(next));
        $('em', item).textContent = next ? '播放中' : '播放';
      }, reduceMotion ? 0 : index * 90);
    });
    event.currentTarget.lastChild.textContent = next ? ' 停止播放演示' : ' 演示播放状态';
  });

  const gatherScene = $('#gatherScene');
  const gatherMessage = $('.gather-message', gatherScene);
  const gatherPlayer = $('.gather-player', gatherScene);
  const forageTargets = $$('.forage', gatherScene);
  let gatherTimer = null;
  const resetGather = () => {
    window.clearTimeout(gatherTimer);
    gatherScene.classList.remove('is-acting', 'is-rewarding');
    gatherPlayer.style.left = '';
    forageTargets.forEach((item) => item.classList.remove('is-gathering', 'is-depleted'));
    forageTargets.forEach((item) => item.classList.add('is-ready'));
    gatherMessage.textContent = '选择一种资源，查看“准备 → 动作 → 耗尽”状态。';
  };
  forageTargets.forEach((target) => {
    target.addEventListener('click', () => {
      if (target.classList.contains('is-depleted')) return;
      window.clearTimeout(gatherTimer);
      const sceneRect = gatherScene.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      const targetLeft = Math.max(25, Math.min(sceneRect.width - 90, targetRect.left - sceneRect.left + targetRect.width / 2 - 64));
      gatherPlayer.style.left = `${targetLeft}px`;
      gatherScene.classList.add('is-acting');
      target.classList.add('is-gathering');
      gatherMessage.textContent = `正在拾取${target.dataset.label}……动作发生在角色和物体之间。`;
      gatherTimer = window.setTimeout(() => {
        target.classList.remove('is-ready', 'is-gathering');
        target.classList.add('is-depleted');
        gatherScene.classList.remove('is-acting');
        gatherScene.classList.add('is-rewarding');
        $('.reward-flight span', gatherScene).textContent = `${target.dataset.label} +1`;
        gatherMessage.textContent = `${target.dataset.label}已进入背包；地面留下耗尽痕迹，两个游戏日后再生。`;
        window.setTimeout(() => gatherScene.classList.remove('is-rewarding'), 850);
      }, reduceMotion ? 30 : 560);
    });
  });
  $('#resetGather')?.addEventListener('click', resetGather);

  const phaseCopy = {
    wild: ['荒地', '杂草集中在地块边缘，中心仍能看出可清理范围。'],
    cleared: ['已经清理', '杂草消失但地表仍然偏硬，等待下一步翻土。'],
    tilled: ['已经翻土', '两条不完全平行的土沟表达可以播种的方向。'],
    planted: ['已经播种', '种子清晰可见，避免玩家误以为操作没有发生。'],
    watered: ['已经浇水', '土色变深并保留薄薄水光，不依靠文字标记。'],
    growing: ['正在生长', '幼苗高度不完全一致，让时间变化更自然。'],
    mature: ['可以收获', '作物扩大并结出动作色果实，轮廓比环境更重。']
  };
  $$('.phase-switch [data-phase]').forEach((button) => {
    button.addEventListener('click', () => {
      const phase = button.dataset.phase;
      $$('.phase-switch button').forEach((item) => {
        const active = item === button;
        item.classList.toggle('is-active', active);
        item.setAttribute('aria-pressed', String(active));
      });
      $('#homesteadStage').dataset.phase = phase;
      $('#phaseName').textContent = phaseCopy[phase][0];
      $('#phaseDescription').textContent = phaseCopy[phase][1];
    });
  });

  $$('.viewport-switch [data-viewport]').forEach((button) => {
    button.addEventListener('click', () => {
      $$('.viewport-switch button').forEach((item) => {
        const active = item === button;
        item.classList.toggle('is-active', active);
        item.setAttribute('aria-pressed', String(active));
      });
      $('#hudSpecimen').classList.toggle('is-mobile', button.dataset.viewport === 'mobile');
    });
  });

  const paperData = {
    video: [
      ['thumb-a', '风从旧招牌后面经过', '慢街 · 公共影像', '定位'],
      ['thumb-b', '潮水把天空切成两半', '芦苇岸 · 公共影像', '播放']
    ],
    commission: [
      ['thumb-b', '为树下咖啡角找一段晨光', '模拟委托 · 可忽略', '查看'],
      ['thumb-a', '需要三段有关旧物修复的影像', '模拟委托 · NPC 已标记', '查看']
    ],
    need: [
      ['thumb-b', '想找一段安静的海面', '个人需求 · 2 个回应', '查看'],
      ['thumb-a', '有没有让人想起夏末的声音', '个人需求 · 暂无回应', '定位']
    ]
  };
  const renderPaperList = (key) => {
    $('#paperList').innerHTML = paperData[key].map(([thumb, title, meta, action]) => `
      <button type="button"><i class="list-thumbnail ${thumb}"></i><span><strong>${title}</strong><small>${meta}</small></span><em>${action}</em></button>
    `).join('');
  };
  $$('.paper-tabs [data-sheet-tab]').forEach((button) => {
    button.addEventListener('click', () => {
      $$('.paper-tabs button').forEach((item) => {
        const active = item === button;
        item.classList.toggle('is-active', active);
        item.setAttribute('aria-selected', String(active));
      });
      renderPaperList(button.dataset.sheetTab);
    });
  });

  $$('.toolbelt button').forEach((button) => {
    button.addEventListener('click', () => $$('.toolbelt button').forEach((item) => {
      const active = item === button;
      item.classList.toggle('is-active', active);
      item.setAttribute('aria-pressed', String(active));
    }));
  });

  const demoToast = $('#demoToast');
  let toastTimer = null;
  $('#showToast')?.addEventListener('click', () => {
    window.clearTimeout(toastTimer);
    demoToast.hidden = false;
    toastTimer = window.setTimeout(() => { demoToast.hidden = true; }, 3200);
  });

  const sections = $$('main section[id]');
  const indexLinks = $$('.route-index a');
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (!visible) return;
      indexLinks.forEach((link) => link.classList.toggle('is-current', link.getAttribute('href') === `#${visible.target.id}`));
    }, { rootMargin: '-20% 0px -65% 0px', threshold: [0, .2, .55] });
    sections.forEach((section) => observer.observe(section));
  }
})();
