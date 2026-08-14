// Extracted from prototype.js. Loaded as a classic script to share the game runtime.

function applyPricingPurchases(purchases = []) {
  const seenMaterials = new Set();
  state.pricingPurchases = (Array.isArray(purchases) ? purchases : []).filter((purchase) => {
    if (purchase?.is_valid === false || !purchase?.material_id || seenMaterials.has(purchase.material_id)) return false;
    seenMaterials.add(purchase.material_id);
    return true;
  });
  state.pricingPurchases.forEach((purchase) => {
    state.bids[purchase.material_id] = {
      bidId: purchase.bid_id,
      transactionId: purchase.transaction_id,
      lastPrice: purchase.transaction_price,
      validTransactionCount: purchase.valid_transaction_count,
      basePrice: purchase.base_price,
      requiredCount: purchase.base_price_transaction_count,
      submittedAt: purchase.transaction_time,
    };
  });
}

function purchaseForMaterial(materialId) {
  return state.pricingPurchases.find((purchase) => purchase.material_id === materialId && purchase.is_valid !== false) || null;
}

function hasPurchasedMaterial(materialId) {
  return Boolean(purchaseForMaterial(materialId));
}

async function showOwnedPurchase(video, purchase) {
  try {
    const result = await window.ZhereService.pricing.insight(video.id);
    showPurchaseSuccess(video, { ...purchase, insight: result.insight }, { alreadyOwned: true });
  } catch {
    showPurchaseSuccess(video, purchase, { alreadyOwned: true });
  }
}

function showPurchaseSuccess(video, result, { alreadyOwned = false } = {}) {
  const transaction = result?.transaction || result || {};
  const pricing = result?.pricing || {};
  const price = transaction.transaction_price ?? transaction.bid_price ?? state.bids[video.id]?.lastPrice ?? '—';
  const transactionTime = transaction.transaction_time
    ? new Date(transaction.transaction_time).toLocaleString('zh-CN', { hour12: false })
    : '已记录';
  const insight = result?.insight || null;
  const history = state.pricingPurchases.slice(-5).reverse();
  const insightMarkup = insight?.eligible ? `
    <section class="market-insight" aria-label="成交后的匿名市场反馈">
      <h3>成交后的匿名回看</h3>
      ${insight.cohort ? `<div class="market-range"><div><span>匿名报价范围</span><strong>${insight.cohort.minimum}–${insight.cohort.maximum}</strong></div><div><span>中位数</span><strong>${insight.cohort.median}</strong></div><div><span>匿名样本</span><strong>${insight.sample_count}</strong></div></div><p>这些信息只在你完成独立报价、且有效样本达到 ${insight.minimum_sample} 笔后显示，不含任何用户身份。</p>` : `<div class="status-banner">目前有 ${insight.sample_count}/${insight.minimum_sample} 笔有效匿名样本。为避免少量样本暴露他人判断，暂不显示区间；你的报价已经完整保存。</div>`}
    </section>` : '';
  openSheet(`
    <div class="sheet-inner purchase-success-sheet">
      <div class="purchase-success-mark" aria-hidden="true"><span></span></div>
      <p class="purchase-success-kicker">${alreadyOwned ? '购买记录' : '报价已直接成交'}</p>
      <h2 class="sheet-title" id="sheetTitle" tabindex="-1">${alreadyOwned ? '这段素材已经购入' : '已成功购入'}</h2>
      <p class="purchase-success-lead">《${escapeHtml(video.title)}》${alreadyOwned ? '已在你的购买记录中。' : '已经收入背包，可以立即使用。'}</p>
      <section class="purchase-receipt" aria-label="购买结果">
        <div><span>你的报价</span><strong>${escapeHtml(String(price))}</strong><small>模拟价格单位</small></div>
        <div><span>成交结果</span><strong>已接受</strong><small>${escapeHtml(transactionTime)}</small></div>
        <p>每个账户对同一素材只能购买一次。公共原素材仍保留在世界中，其他用户也可以各自报价购买。</p>
      </section>
      ${insightMarkup}
      <section class="valuation-history"><h3>我的估值足迹</h3><div>${history.map((purchase) => `<span><b>${escapeHtml(findVideoById(purchase.material_id)?.title || purchase.material_id)}</b><small>${escapeHtml(String(purchase.bid_price ?? purchase.transaction_price))} · ${new Date(purchase.transaction_time).toLocaleDateString('zh-CN')}</small></span>`).join('') || '<p>这会是第一条估值记录。</p>'}</div></section>
      <div class="purchase-success-actions">
        <button class="primary-button" id="openPurchasedBag" type="button">打开背包</button>
        <button class="paper-button" id="purchaseBack" type="button">回到视频</button>
      </div>
      <p class="purchase-success-footnote">这是模拟成交，不发生真实支付。研究用基础价格不会作为下一位用户报价前的提示。</p>
    </div>
  `, () => {
    $('#openPurchasedBag').addEventListener('click', showBag);
    $('#purchaseBack').addEventListener('click', () => showVideo(video));
  });
}

// 报价面板的关闭观察：每次打开最多产生一次 bid_abandon；成功提交或跳转「已购入」都不产生。
// Esc、遮罩和右上角关闭按钮都走 requestCloseSheet → closeSheet（把 sheet.hidden 置为 true），
// 这里用 MutationObserver 监听 hidden 变化来兜底记录放弃；bidClose 按钮则显式记录后再 showVideo。
let activeBidPanel = null;

function closeActiveBidPanel(reason) {
  if (!activeBidPanel || activeBidPanel.closed) return;
  activeBidPanel.closed = true;
  if (activeBidPanel.observer) {
    activeBidPanel.observer.disconnect();
    activeBidPanel.observer = null;
  }
  if (reason === 'abandon') {
    logEvent('bid_abandon', { asset_id: activeBidPanel.video.id, open_duration_ms: Date.now() - activeBidPanel.openedAt });
  }
}

function openBidPanel(video) {
  const publicAsset = state.publicAssets.find((asset) => asset.id === video.id);
  if (publicAsset?.owner === 'me') return showToast('发布者不能为自己发布的素材报价');
  const existingPurchase = purchaseForMaterial(video.id);
  if (existingPurchase) return showOwnedPurchase(video, existingPurchase);
  logEvent('bid_enter', { asset_id: video.id });
  const openedAt = Date.now();
  openSheet(`
    <div class="sheet-inner bid-sheet">
      <h2 class="sheet-title" id="sheetTitle" tabindex="-1">给《${escapeHtml(video.title)}》一个你自己的价格</h2>
      <p class="sheet-subtitle">没有发布者定价，也没有 NPC 跟价。你提交的完整报价会被系统直接接受，并形成一笔模拟成交；不产生真实支付，也不会扣除现有灵感币。</p>
      <form class="bid-form" id="bidForm" novalidate>
        <label for="bidPrice">你认为这段素材值多少？</label>
        <div class="bid-input-row">
          <input id="bidPrice" name="bidPrice" type="number" min="0.01" step="0.01" inputmode="decimal" autocomplete="off" required aria-describedby="bidPriceHint bidError" placeholder="输入完整报价" />
          <span>模拟价格单位</span>
        </div>
        <p id="bidPriceHint">提交前不会展示其他人的报价或基础价格，避免影响你的独立判断。</p>
        <div class="form-error" id="bidError" role="alert"></div>
        <div class="media-actions">
          <button class="primary-button" id="submitBid" type="submit">确认报价并获得副本</button>
          <button class="text-button" id="bidClose" type="button">回到视频</button>
        </div>
      </form>
      <div class="bid-rule-note">每个账户对同一素材只能报价并购买一次。确认后系统会直接接受，发布者无权干预，也不能重复购买。</div>
    </div>
  `, () => {
    const idempotencyKey = typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `bid-${Date.now()}-${Math.floor(Math.random() * Number.MAX_SAFE_INTEGER).toString(36)}`;
    // 面板成功打开后记录 bid_attempt；并挂一次性 close 观察记录 bid_abandon（最多一次）。
    activeBidPanel = { video, openedAt, closed: false, observer: null };
    const closeObserver = new MutationObserver(() => {
      if (sheet.hidden) closeActiveBidPanel('abandon');
    });
    closeObserver.observe(sheet, { attributes: true, attributeFilter: ['hidden'] });
    activeBidPanel.observer = closeObserver;
    $('#bidForm').addEventListener('submit', async (event) => {
      event.preventDefault();
      const input = $('#bidPrice');
      const errorNode = $('#bidError');
      const submit = $('#submitBid');
      const raw = input.value.trim();
      const price = Number(raw);
      if (!/^\d+(?:\.\d{1,2})?$/.test(raw) || !Number.isFinite(price) || price <= 0) {
        // 校验失败埋点：reason 使用固定常量，避免把用户输入写入研究数据。
        logEvent('bid_validation_failed', { asset_id: video.id, reason: 'invalid-price-format' });
        errorNode.textContent = '请输入大于 0、最多保留两位小数的完整报价。';
        input.focus();
        return;
      }
      errorNode.textContent = '';
      submit.disabled = true;
      submit.textContent = '正在记录报价…';
      try {
        const result = await window.ZhereService.pricing.submitBid(video.id, price, idempotencyKey);
        closeActiveBidPanel('submitted');
        const transactionId = result.transaction.transaction_id;
        state.bids[video.id] = {
          bidId: result.bid.bid_id,
          transactionId,
          lastPrice: result.transaction.transaction_price,
          validTransactionCount: result.pricing.valid_transaction_count,
          basePrice: result.pricing.base_price,
          requiredCount: result.base_price_transaction_count,
          submittedAt: result.transaction.transaction_time,
        };
        if (!hasPurchasedMaterial(video.id)) {
          state.pricingPurchases.push({
            ...result.transaction,
            bid_status: result.bid.bid_status,
            base_price: result.pricing.base_price,
            valid_transaction_count: result.pricing.valid_transaction_count,
            base_price_transaction_count: result.base_price_transaction_count,
          });
        }
        if (!state.copies.some((copy) => copy.transactionId === transactionId)) {
          state.copies.push({ assetId: video.id, transactionId, acquiredAt: Date.now() });
        }
        updateCounters();
        await window.ZhereService.saveState(serializableState(), { immediate: true });
        renderBidPlants();
        logEvent('bid_submit', { asset_id: video.id, bid_id: result.bid.bid_id, bid_price: result.bid.bid_price });
        logEvent('bid_accepted', { asset_id: video.id, bid_id: result.bid.bid_id, transaction_id: transactionId, transaction_price: result.transaction.transaction_price });
        logEvent('copy_acquired', { asset_id: video.id, transaction_id: transactionId });
        showPurchaseSuccess(video, result);
        say('报价已经直接成交，副本进了你的口袋。公共原素材仍然留在原地。', '木秋');
      } catch (error) {
        if (error.code === 'material-already-acquired') {
          closeActiveBidPanel('owned');
          try {
            const purchases = await window.ZhereService.pricing.purchases();
            applyPricingPurchases(purchases.purchases);
            const purchase = purchaseForMaterial(video.id);
            if (purchase) return showOwnedPurchase(video, purchase);
          } catch {}
          errorNode.textContent = '这段素材已经购入，不能再次报价。请在背包中查看。';
          submit.textContent = '已经购入';
          return;
        }
        errorNode.textContent = `${error.message || '报价暂时没有保存。'} 请保留当前价格并重试。`;
        submit.disabled = false;
        submit.textContent = '重试保存这次报价';
      }
    });
    $('#bidClose').addEventListener('click', () => {
      closeActiveBidPanel('abandon');
      showVideo(video);
    });
  });
  // openSheet 同步执行完 setup 后，面板已成功打开，记录 bid_attempt。
  logEvent('bid_attempt', { asset_id: video.id });
}
