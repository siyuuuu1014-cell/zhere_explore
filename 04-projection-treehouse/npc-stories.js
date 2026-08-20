// Extracted from prototype.js. Loaded as a classic script to share the game runtime.
// P2.4 可忽略 NPC 故事线：迟野与南枝两条 4 步记忆型弧线，条件触发、跨区推进、完成可回访。

const {
  NPC_STORY_DEFS,
  NPC_SPOTS,
  npcStoryConditionMet,
  stringSeed,
} = globalThis.ZhereWorldFoundation;

function npcStoryProfile() {
  return {
    openedVideos: state.growthStats.openedAssetIds.length,
    likedCount: state.likes.length,
    hasCopy: state.copies.length > 0,
    publishedDemand: allWorldNotes().filter((note) => note.owner === 'me').length,
    placedCount: state.placed.length,
    discoveredZones: state.discoveredZones.length,
  };
}

function npcDef(npcId) {
  return NPC_STORY_DEFS.find((npc) => npc.id === npcId);
}

function lastOpenedAssetTitle() {
  const latest = [...state.journalEntries]
    .filter((entry) => entry.type === 'asset')
    .sort((a, b) => new Date(b.lastVisitedAt) - new Date(a.lastVisitedAt))[0];
  return latest?.title ? `《${latest.title}》` : '你最近看过的那段影像';
}

function npcActiveStep(npcId) {
  const def = npcDef(npcId);
  const progress = state.npcStories[npcId];
  if (!def || !progress) return null;
  if (progress.completed) return { def, step: def.steps.at(-1), completed: true };
  const step = def.steps.find((item) => item.step === progress.step);
  if (!step) return null;
  if (!npcStoryConditionMet(step.conditions, npcStoryProfile())) return null;
  return { def, step, completed: false };
}

function visibleNpcNodes() {
  return NPC_STORY_DEFS.map((def) => {
    const progress = state.npcStories[def.id];
    if (!progress) return null;
    const index = progress.completed ? def.steps.length - 1 : progress.step - 1;
    const step = def.steps[index];
    const spot = NPC_SPOTS[def.id]?.[index];
    if (!step || !spot) return null;
    if (!progress.completed && !npcStoryConditionMet(step.conditions, npcStoryProfile())) return null;
    return { npcId: def.id, wx: spot[0], wy: spot[1], completed: progress.completed };
  }).filter(Boolean);
}

function renderNpcStoryNodes() {
  if (state.worldMode === 'cottage') return;
  const live = new Set();
  visibleNpcNodes().forEach(({ npcId, wx, wy, completed }) => {
    live.add(npcId);
    const def = npcDef(npcId);
    let node = $(`[data-npc="${npcId}"]`, decoLayer);
    if (!node) {
      node = document.createElement('button');
      node.type = 'button';
      node.className = 'deco npc-marker';
      node.dataset.npc = npcId;
      node.innerHTML = `<span class="npc-avatar" aria-hidden="true">${escapeHtml(def.glyph)}</span><small>NPC · ${escapeHtml(def.name)}</small>`;
      node.style.setProperty('--npc-color', def.color);
      node.addEventListener('click', (event) => {
        event.stopPropagation();
        approachWorldInteraction(node, {
          wx: Number(node.dataset.wx),
          wy: Number(node.dataset.wy),
          offsetY: 58,
          arrivalDistance: 72,
          stopDistance: 6,
          source: `npc:${npcId}`,
          label: `旅人 ${def.name}`,
          onArrival: () => showNpcEncounter(npcId),
        });
      });
      decoLayer.append(node);
    }
    node.dataset.wx = String(wx);
    node.dataset.wy = String(wy);
    node.classList.toggle('is-friend', Boolean(completed));
    node.setAttribute('aria-label', `旅人 ${def.name}（NPC），走过去聊聊`);
    placeWorldNode(node, wx, wy);
  });
  $$('[data-npc]', decoLayer).forEach((node) => { if (!live.has(node.dataset.npc)) node.remove(); });
}

function showNpcEncounter(npcId) {
  const active = npcActiveStep(npcId);
  if (!active) return;
  const { def, step, completed } = active;
  const progress = state.npcStories[npcId];
  const isLastStep = !completed && step.step === def.steps.length;
  let text = completed
    ? def.afterTexts[Math.abs(stringSeed(`${daySeed}:${npcId}`)) % def.afterTexts.length]
    : step.text;
  text = text.replaceAll('{lastAsset}', lastOpenedAssetTitle());
  const choices = completed
    ? [{ label: '聊两句就告别', reply: def.afterTexts[(Math.abs(stringSeed(`${daySeed}:${npcId}:bye`)) % def.afterTexts.length)], advance: false }]
    : step.choices;
  openSheet(`
    <div class="sheet-inner npc-encounter-sheet">
      <div class="npc-head">
        <span class="npc-avatar npc-avatar-large" aria-hidden="true">${escapeHtml(def.glyph)}</span>
        <div><p class="sheet-eyebrow">${completed ? '老朋友' : `故事线 ${step.step}/${def.steps.length}`}<span class="npc-tag">NPC</span></p><h2 class="sheet-title" id="sheetTitle" tabindex="-1">${escapeHtml(def.name)}</h2><p class="sheet-subtitle">${escapeHtml(def.title)} · 只是路过，不会给你安排任务</p></div>
      </div>
      <div class="npc-dialogue"><p>${escapeHtml(text)}</p></div>
      <div class="choice-grid">
        ${choices.map((choice) => `<button class="choice-button" type="button" data-npc-choice="${escapeHtml(choice.label)}"><b>${escapeHtml(choice.label)}</b><span>${escapeHtml(choice.reply.slice(0, 48))}${choice.reply.length > 48 ? '…' : ''}</span></button>`).join('')}
      </div>
    </div>
  `, () => {
    $('.npc-avatar-large', sheet)?.style.setProperty('--npc-color', def.color);
    $$('[data-npc-choice]', sheet).forEach((button) => button.addEventListener('click', () => {
      const choice = choices.find((item) => item.label === button.dataset.npcChoice);
      if (!choice) return;
      logEvent('npc_encounter', { npc_id: npcId, step: completed ? progress.step : step.step });
      if (completed) {
        say(choice.reply, def.name);
        closeSheet();
        return;
      }
      logEvent('npc_story_step', { npc_id: npcId, step: step.step, choice: choice.label });
      closeSheet();
      if (choice.advance) {
        progress.step = Math.min(step.step + 1, def.steps.length);
        progress.metAt = new Date().toISOString();
        say(choice.reply, def.name);
        if (isLastStep) {
          progress.completed = true;
          const reward = choice.reward || { resources: def.reward.resources, text: '' };
          Object.entries(reward.resources || def.reward.resources).forEach(([resource, amount]) => {
            state.homestead.resources[resource] = (state.homestead.resources[resource] || 0) + Number(amount);
          });
          logEvent('npc_story_completed', { npc_id: npcId });
          showToast(reward.text || '你收到了一份来自旅人的纪念。');
        } else {
          const nextStep = def.steps[step.step];
          const zoneName = (ZONE_DEFS.find((zone) => zone.id === nextStep.zone) || {}).name || '';
          showToast(zoneName ? `下次也许会在${zoneName}再遇见${def.name}。` : '下次再见。');
        }
      } else {
        say(choice.reply, def.name);
      }
      persist();
      renderWorld();
    }));
  });
}
