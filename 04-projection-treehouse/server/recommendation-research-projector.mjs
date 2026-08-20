import { createHash } from 'node:crypto';

const VERSION = 'rec-projection-v2';
const json = (value) => JSON.stringify(value ?? []);
const numeric = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const stableId = (...parts) => createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 24);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function stableUuid(kind, value) {
  const source = String(value || 'system');
  if (UUID_PATTERN.test(source)) return source.toLowerCase();
  const bytes = createHash('sha256').update(`${kind}|${source}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
const clampRate = (value) => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
const iso = (value) => value ? new Date(value).toISOString() : null;
const average = (values) => values.length ? values.reduce((sum, value) => sum + numeric(value), 0) / values.length : 0;
const targetId = (event) => event.details?.asset_id || event.details?.material_id || event.details?.demand_id || event.details?.target_id || '';
const subjectId = (event, subjectByUser) => event.research_subject_id || subjectByUser.get(event.actor_id) || '';
const isOneOf = (event, names) => names.has(event.raw_event);

function lineage(snapshotAt) { return { schema_version: VERSION, snapshot_at: snapshotAt }; }

function aggregateBehavior(events, { subjectByUser, ids, idField }) {
  const rows = new Map();
  for (const event of events) {
    const target = targetId(event);
    const user = subjectId(event, subjectByUser);
    if (!target || !user || !ids.has(target)) continue;
    const key = `${user}|${target}`;
    const row = rows.get(key) || {
      behavior_id: stableId(idField, user, target), user_id: user, [idField]: target,
      view: 0, comment: 0, like: 0, fav: 0, share: 0, rate: 0,
      first_interacted_at: event.created_at, last_interacted_at: event.created_at,
    };
    if (isOneOf(event, new Set(['asset_open', 'play', 'demand_open', 'demand_view']))) row.view += 1;
    if (isOneOf(event, new Set(['comment', 'comment_reply', 'demand_response']))) {
      row.comment += 1;
      row.comment_ids ||= [];
      row.comment_ids.push(event.details?.comment_id || event.details?.response_id || event.event_id);
    }
    if (event.raw_event === 'like') row.like += 1;
    if (event.raw_event === 'unlike') row.like = Math.max(0, row.like - 1);
    if (event.raw_event === 'favorite') row.fav += 1;
    if (event.raw_event === 'unfavorite') row.fav = Math.max(0, row.fav - 1);
    if (isOneOf(event, new Set(['share', 'asset_share', 'demand_share']))) row.share = 1;
    if (isOneOf(event, new Set(['asset_rate', 'demand_rate'])) && event.details?.rate != null) row.rate = numeric(event.details.rate, row.rate);
    if (Date.parse(event.created_at) < Date.parse(row.first_interacted_at)) row.first_interacted_at = event.created_at;
    if (Date.parse(event.created_at) > Date.parse(row.last_interacted_at)) row.last_interacted_at = event.created_at;
    rows.set(key, row);
  }
  return rows;
}

export function buildRecommendationResearchProjections(input, { snapshotAt = new Date().toISOString() } = {}) {
  const users = input.users || [];
  const subjects = input.researchSubjects || [];
  const states = input.worldStates || [];
  const publicAssets = (input.publicAssets || []).filter((asset) => asset.status !== 'deleted');
  const demands = (input.publicDemands || []).filter((demand) => demand.status !== 'deleted');
  const records = input.publicRecords || [];
  const events = [...(input.events || []), ...(input.recommendationImpressions || []).map((item) => ({
    raw_event: 'impression', actor_id: '', research_subject_id: item.subject_id || '', created_at: item.created_at,
    details: { asset_id: item.asset_id, impression_id: item.impression_id },
  }))];
  const transactions = (input.pricing?.transactions || []).filter((transaction) => transaction.is_valid === true);
  const assetEventNames = new Set(['impression', 'asset_open', 'play', 'pause', 'seek', 'play_progress', 'play_complete', 'watch_time', 'like', 'unlike', 'favorite', 'unfavorite', 'comment', 'comment_reply', 'share', 'asset_share', 'asset_rate', 'bid_enter', 'bid_submit', 'bid_accepted', 'copy_acquired', 'copy_placed', 'copy_removed', 'tag_add', 'tag_remove']);
  const observedAssets = new Map(publicAssets.map((asset) => [asset.id, asset]));
  for (const event of events.filter((item) => assetEventNames.has(item.raw_event))) {
    const id = targetId(event); if (!id || observedAssets.has(id)) continue;
    observedAssets.set(id, { id, ownerId: event.details?.owner_id || '', status: 'observed', title: event.details?.asset_title || event.details?.title || '', tags: event.details?.tags || [], createdAt: event.created_at, updatedAt: event.created_at, comments: [] });
  }
  for (const transaction of transactions) if (!observedAssets.has(transaction.material_id)) observedAssets.set(transaction.material_id, { id: transaction.material_id, ownerId: '', status: 'observed', title: '', tags: [], createdAt: transaction.transaction_time, updatedAt: transaction.transaction_time, comments: [] });
  for (const record of records.filter((item) => item.kind === 'content_tag' && item.status !== 'deleted' && item.payload?.targetType === 'asset')) {
    const id = record.payload?.targetId;
    if (!id) continue;
    if (!observedAssets.has(id)) observedAssets.set(id, { id, ownerId: '', status: 'observed', title: '', tags: [], createdAt: record.createdAt, updatedAt: record.updatedAt || record.createdAt, comments: [] });
    const asset = observedAssets.get(id);
    asset.tags = [...new Set([...(asset.tags || []), record.payload?.tag].filter(Boolean))];
  }
  const assets = [...observedAssets.values()];
  const subjectByUser = new Map(subjects.map((subject) => [subject.user_id, subject.subject_id]));
  const userById = new Map(users.map((user) => [user.id, user]));
  const stateByUser = new Map(states.map((record) => [record.userId, record.state || {}]));
  const eventsByUser = new Map();
  for (const event of events) {
    const list = eventsByUser.get(event.actor_id) || [];
    list.push(event); eventsByUser.set(event.actor_id, list);
  }
  const publicSubject = (userId) => userId ? (subjectByUser.get(userId) || `missing-subject:${stableId(userId)}`) : 'system';
  const assetIds = new Set(assets.map((asset) => asset.id));
  const promptIds = new Set(demands.filter((d) => d.type !== 'commerce').map((d) => d.id));
  const commerceIds = new Set(demands.filter((d) => d.type === 'commerce').map((d) => d.id));

  const profile = subjects.map((subject) => {
    const user = userById.get(subject.user_id) || {};
    const state = stateByUser.get(subject.user_id) || {};
    const activity = eventsByUser.get(subject.user_id) || [];
    const created = user.createdAt || subject.created_at;
    const activeDays = new Set(activity.map((event) => String(event.created_at).slice(0, 10))).size;
    const ageDays = Math.max(0, (Date.parse(snapshotAt) - Date.parse(created || snapshotAt)) / 86400000);
    const purchases = transactions.filter((item) => item.user_id === subject.user_id);
    const ownedAssets = assets.filter((item) => item.ownerId === subject.user_id);
    const ownedDemands = demands.filter((item) => item.ownerId === subject.user_id);
    const follows = records.filter((item) => item.kind === 'follow' && item.ownerId === subject.user_id && item.status !== 'deleted');
    const fans = records.filter((item) => item.kind === 'follow' && (item.payload?.targetUserId === subject.user_id || item.targetId === subject.user_id) && item.status !== 'deleted');
    const ownedTargetIds = new Set([...ownedAssets.map((item) => item.id), ...ownedDemands.map((item) => item.id)]);
    const received = (names) => events.filter((event) => ownedTargetIds.has(targetId(event)) && names.has(event.raw_event)).length;
    const completedCommerce = demands.filter((item) => item.type === 'commerce' && (item.responses || []).some((response) => response.ownerId === subject.user_id)).map((item) => item.companyName || item.projectName || item.id);
    const segment = ageDays >= 30 && activeDays >= 3 ? 'active_old' : ageDays < 30 && activeDays >= 2 ? 'high_potential_new' : 'developing';
    return {
      user_id: subject.subject_id, is_active_old: segment === 'active_old' ? 1 : 0,
      is_high_potential_new: segment === 'high_potential_new' ? 1 : 0, user_segment: segment,
      hybrid_recommend: json({ rules: ['content', 'collaborative', 'exploration'], version: VERSION }),
      segment_updated_at: snapshotAt, name: user.nickname || user.username || '', birthday: null,
      level: numeric(state.level, 1), gender: '', intro: user.intro || '', latitude: null, longitude: null,
      location: state.worldMode || '', designation: '', experience: json(state.journalEntries || []),
      goodat: json(state.customTags || []), purchase: json(purchases.map((item) => item.material_id)),
      assets: json(ownedAssets.map((item) => item.id)), works: json(completedCommerce),
      prompt: json(ownedDemands.filter((item) => item.type !== 'commerce').map((item) => item.id)),
      commerce: json(ownedDemands.filter((item) => item.type === 'commerce').map((item) => item.id)),
      rate: average(activity.map((event) => event.details?.rate).filter((value) => value != null)),
      register_at: created, fans_count: fans.length, follow_count: follows.length,
      liked_count: received(new Set(['like'])), fav_count: received(new Set(['favorite'])),
      comment_count: received(new Set(['comment', 'comment_reply', 'demand_response'])), shared_count: received(new Set(['share', 'asset_share', 'demand_share'])),
      updated_at: user.updatedAt || subject.updated_at || snapshotAt, ...lineage(snapshotAt),
    };
  });

  const assetBehavior = aggregateBehavior(events, { subjectByUser, ids: assetIds, idField: 'asset_id' });
  for (const transaction of transactions) {
    if (!assetIds.has(transaction.material_id)) continue;
    const user = publicSubject(transaction.user_id); const key = `${user}|${transaction.material_id}`;
    const row = assetBehavior.get(key) || { behavior_id: stableId('asset_id', user, transaction.material_id), user_id: user, asset_id: transaction.material_id, view: 0, comment: 0, like: 0, fav: 0, share: 0, rate: 0, first_interacted_at: transaction.transaction_time, last_interacted_at: transaction.transaction_time };
    row.buy = numeric(row.buy) + 1; row.last_interacted_at = transaction.transaction_time; assetBehavior.set(key, row);
  }
  for (const asset of assets) {
    const user = publicSubject(asset.ownerId); const key = `${user}|${asset.id}`;
    const row = assetBehavior.get(key) || { behavior_id: stableId('asset_id', user, asset.id), user_id: user, asset_id: asset.id, view: 0, comment: 0, like: 0, fav: 0, share: 0, rate: 0, first_interacted_at: asset.createdAt, last_interacted_at: asset.updatedAt || asset.createdAt };
    row.sell = transactions.filter((item) => item.material_id === asset.id).length; assetBehavior.set(key, row);
  }
  const promptBehavior = aggregateBehavior(events, { subjectByUser, ids: promptIds, idField: 'prompt_id' });
  const commerceBehavior = aggregateBehavior(events, { subjectByUser, ids: commerceIds, idField: 'commerce_id' });
  for (const record of records.filter((item) => item.status !== 'deleted')) {
    const targetType = record.payload?.targetType;
    const target = record.payload?.targetId;
    const user = publicSubject(record.ownerId);
    let map; let field;
    if (targetType === 'asset' && assetIds.has(target)) { map = assetBehavior; field = 'asset_id'; }
    else if (targetType === 'demand' && promptIds.has(target)) { map = promptBehavior; field = 'prompt_id'; }
    else if (targetType === 'demand' && commerceIds.has(target)) { map = commerceBehavior; field = 'commerce_id'; }
    else continue;
    const key = `${user}|${target}`;
    const row = map.get(key) || { behavior_id: stableId(field, user, target), user_id: user, [field]: target, view: 0, comment: 0, like: 0, fav: 0, share: 0, rate: 0, first_interacted_at: record.createdAt, last_interacted_at: record.updatedAt || record.createdAt };
    if (record.kind === 'content_rating') row.rate = numeric(record.payload?.rate, row.rate);
    if (record.kind === 'content_share') row.share = 1;
    if (record.createdAt && (!row.first_interacted_at || Date.parse(record.createdAt) < Date.parse(row.first_interacted_at))) row.first_interacted_at = record.createdAt;
    if (record.updatedAt && (!row.last_interacted_at || Date.parse(record.updatedAt) > Date.parse(row.last_interacted_at))) row.last_interacted_at = record.updatedAt;
    map.set(key, row);
  }
  for (const demand of demands) for (const response of demand.responses || []) {
    const map = demand.type === 'commerce' ? commerceBehavior : promptBehavior;
    const field = demand.type === 'commerce' ? 'commerce_id' : 'prompt_id';
    const user = publicSubject(response.ownerId); const key = `${user}|${demand.id}`;
    const row = map.get(key) || { behavior_id: stableId(field, user, demand.id), user_id: user, [field]: demand.id, view: 0, comment: 0, like: 0, fav: 0, share: 0, rate: 0, first_interacted_at: response.createdAt, last_interacted_at: response.createdAt };
    row.comment += 1; row.comment_ids ||= []; row.comment_ids.push(response.id);
    row.asset_id = response.assetId || row.asset_id || ''; map.set(key, row);
  }
  const u2a = [...assetBehavior.values()].map((row) => ({ buy: 0, sell: 0, ...row, ...lineage(snapshotAt) }));
  const demandRows = (map) => [...map.values()].map((row) => ({ asset_id: '', ...row, ...lineage(snapshotAt) }));

  const publishedAsset = assets.map((asset) => {
    const tx = transactions.filter((item) => item.material_id === asset.id);
    const behavior = u2a.filter((row) => row.asset_id === asset.id);
    return { asset_id: asset.id, user_id: publicSubject(asset.ownerId), prompt_id: asset.promptId || '', created_at: asset.createdAt,
      buyer: json([...new Set(tx.map((item) => publicSubject(item.user_id)))]), amount: tx.length,
      pricing: tx.at(-1)?.transaction_price ?? null, average_pricing: average(tx.map((item) => item.transaction_price)),
      average_rate: average(behavior.map((item) => item.rate).filter(Boolean)), title: asset.title || '', description: asset.description || '',
      theme: json(asset.tags || []), latitude: null, longitude: null, location: asset.zone || '', size: asset.size || '',
      duration: numeric(asset.media_duration_sec ?? asset.durationSeconds ?? asset.dur, 0), definition: asset.resolution || asset.res || '',
      like_count: numeric(asset.likes), fav_count: behavior.reduce((sum, row) => sum + row.fav, 0), comment_count: (asset.comments || []).filter((item) => item.status !== 'deleted').length,
      share_count: behavior.reduce((sum, row) => sum + row.share, 0), view_count: behavior.reduce((sum, row) => sum + row.view, 0), ...lineage(snapshotAt) };
  });

  const demandStats = (demand) => {
    const rows = [...(demand.type === 'commerce' ? commerceBehavior : promptBehavior).values()].filter((row) => row[demand.type === 'commerce' ? 'commerce_id' : 'prompt_id'] === demand.id);
    return { like_count: rows.reduce((s, r) => s + r.like, 0), fav_count: rows.reduce((s, r) => s + r.fav, 0), comment_count: rows.reduce((s, r) => s + r.comment, 0), share_count: rows.reduce((s, r) => s + r.share, 0), view_count: rows.reduce((s, r) => s + r.view, 0) };
  };
  const publishedPrompt = demands.filter((d) => d.type !== 'commerce').map((d) => {
    const behavior = [...promptBehavior.values()].filter((row) => row.prompt_id === d.id);
    return { prompt_id: d.id, user_id: publicSubject(d.ownerId), rate: average(behavior.map((row) => row.rate).filter((value) => value > 0)), participants: json((d.responses || []).map((r) => publicSubject(r.ownerId))), title: d.title || '', description: d.description || '', latitude: null, longitude: null, location: d.zone || '', theme: d.theme || '', duration: numeric(d.durationSeconds), size: d.aspectRatio || d.format || '', definition: d.resolution || '', pricing: numeric(d.priceAmount ?? d.budget), created_at: d.createdAt, start: d.startAt || null, stime: d.startAt ? iso(d.startAt).slice(11, 16) : '', end: d.endAt || d.deadline || null, etime: d.endAt ? iso(d.endAt).slice(11, 16) : '', complete: d.status === 'closed' ? 1 : 0, ...demandStats(d), ...lineage(snapshotAt) };
  });
  const publishedCommerce = demands.filter((d) => d.type === 'commerce').map((d) => ({ commerce_id: d.id, user_id: publicSubject(d.ownerId), organization: d.companyName || d.projectName || '', activity: d.activityName || d.title || '', place: d.region || d.zone || '', budget: numeric(d.priceAmount ?? d.budget), context: d.description || '', jds: d.skillRequirements || '', requirements: d.cooperationDescription || d.description || '', range: d.cooperationScope || d.audience || '', created_at: d.createdAt, start: d.startAt || null, stime: d.startAt ? iso(d.startAt).slice(11, 16) : '', end: d.endAt || d.deadline || null, etime: d.endAt ? iso(d.endAt).slice(11, 16) : '', complete: d.status === 'closed' ? 1 : 0, ...demandStats(d), ...lineage(snapshotAt) }));

  const u2uMap = new Map();
  for (const record of records) {
    if (!['follow', 'message', 'bench_message', 'bottle_reply', 'space_message', 'content_share'].includes(record.kind)) continue;
    if (record.kind !== 'follow' && record.status === 'deleted') continue;
    const from = publicSubject(record.ownerId); const targetUser = record.targetId || record.payload?.targetUserId || record.payload?.ownerId;
    if (!targetUser) continue;
    const to = publicSubject(targetUser); const key = `${from}|${to}`;
    const row = u2uMap.get(key) || { behavior_id: stableId('u2u', from, to), user_id_A: from, user_id_B: to, follow: 0, message: 0, first_interacted_at: record.createdAt, last_interacted_at: record.updatedAt || record.createdAt };
    if (record.kind === 'follow') row.follow = record.status === 'deleted' ? 0 : 1;
    else { row.message += 1; row.message_ids ||= []; row.message_ids.push(record.id); }
    u2uMap.set(key, row);
  }
  const u2u = [...u2uMap.values()].map((row) => ({ ...row, ...lineage(snapshotAt) }));

  const featureRows = [];
  const featureCutoff = Date.parse(snapshotAt) - 72 * 60 * 60 * 1000;
  const recentEvents = events.filter((event) => Date.parse(event.created_at) >= featureCutoff);
  const recentTransactions = transactions.filter((item) => Date.parse(item.transaction_time) >= featureCutoff);
  for (const [contentType, items] of [['published_asset', assets], ['published_prompt', demands.filter((d) => d.type !== 'commerce')], ['published_commerce', demands.filter((d) => d.type === 'commerce')]]) {
    for (const item of items) {
      const targetEvents = recentEvents.filter((event) => targetId(event) === item.id);
      const count = (names) => targetEvents.filter((event) => names.has(event.raw_event)).length;
      const views = count(new Set(['asset_open', 'play', 'demand_open', 'demand_view']));
      const likes = count(new Set(['like'])); const favorites = count(new Set(['favorite']));
      const comments = count(new Set(['comment', 'comment_reply', 'demand_response']));
      const shareActors = new Set([
        ...targetEvents.filter((event) => new Set(['share', 'asset_share', 'demand_share']).has(event.raw_event)).map((event) => event.research_subject_id || event.actor_id),
        ...records.filter((record) => record.kind === 'content_share' && record.status !== 'deleted' && record.payload?.targetId === item.id && Date.parse(record.createdAt) >= featureCutoff).map((record) => record.ownerId),
      ].filter(Boolean));
      const shares = shareActors.size;
      const purchases = contentType === 'published_asset' ? recentTransactions.filter((tx) => tx.material_id === item.id).length : 0;
      featureRows.push({
        feature_id: stableId('feature', contentType, item.id), target_id: item.id, content_type: contentType,
        tags: json(item.tags || [item.theme, item.zone].filter(Boolean)),
        purchase_rate: clampRate(purchases / (views + 5)),
        like_rate: clampRate((likes + 1) / (views + 100)),
        fav_rate: clampRate((favorites + 0.5) / (views + 100)),
        comment_rate: clampRate(comments / Math.max(1, views)),
        share_rate: clampRate(shares / Math.max(1, views)),
        updated_at: snapshotAt, ...lineage(snapshotAt),
      });
    }
  }
  const remapJsonIds = (value, kind) => {
    try { return json(JSON.parse(value || '[]').map((item) => stableUuid(kind, item))); }
    catch { return json([]); }
  };
  const behaviorRows = (rows, targetField, targetKind) => rows.map((row) => ({
    ...row,
    behavior_id: stableUuid('behavior', `${row.user_id}|${row[targetField]}|${targetKind}`),
    user_id: stableUuid('user', row.user_id),
    [targetField]: stableUuid(targetKind, row[targetField]),
    asset_id: targetField === 'asset_id' ? stableUuid('asset', row.asset_id) : (row.asset_id ? stableUuid('asset', row.asset_id) : ''),
    view: Boolean(row.view), like: Boolean(row.like), fav: Boolean(row.fav), share: Boolean(row.share),
    comment: json([...new Set((row.comment_ids || []).filter(Boolean))]),
    ...(targetField === 'asset_id' ? { buy: Boolean(row.buy), sell: Boolean(row.sell) } : {}),
  }));
  const normalizedProfile = profile.map((row) => ({ ...row, user_id: stableUuid('user', row.user_id), is_active_old: Boolean(row.is_active_old), is_high_potential_new: Boolean(row.is_high_potential_new), purchase: remapJsonIds(row.purchase, 'asset'), assets: remapJsonIds(row.assets, 'asset'), prompt: remapJsonIds(row.prompt, 'prompt'), commerce: remapJsonIds(row.commerce, 'commerce') }));
  const normalizedAsset = publishedAsset.map((row) => ({ ...row, asset_id: stableUuid('asset', row.asset_id), user_id: stableUuid('user', row.user_id), prompt_id: row.prompt_id ? stableUuid('prompt', row.prompt_id) : '', buyer: remapJsonIds(row.buyer, 'user') }));
  const normalizedPrompt = publishedPrompt.map((row) => ({ ...row, prompt_id: stableUuid('prompt', row.prompt_id), user_id: stableUuid('user', row.user_id), participants: remapJsonIds(row.participants, 'user'), complete: Boolean(row.complete) }));
  const normalizedCommerce = publishedCommerce.map((row) => ({ ...row, commerce_id: stableUuid('commerce', row.commerce_id), user_id: stableUuid('user', row.user_id), complete: Boolean(row.complete) }));
  const normalizedU2u = u2u.map((row) => ({ ...row, behavior_id: stableUuid('behavior', `${row.user_id_A}|${row.user_id_B}|user`), user_id_A: stableUuid('user', row.user_id_A), user_id_B: stableUuid('user', row.user_id_B), follow: Boolean(row.follow), message: json([...new Set((row.message_ids || []).filter(Boolean))]) }));
  const normalizedFeatures = featureRows.map((row) => { const kind = row.content_type === 'published_asset' ? 'asset' : row.content_type === 'published_prompt' ? 'prompt' : 'commerce'; return { ...row, feature_id: stableUuid('feature', `${row.content_type}|${row.target_id}`), target_id: stableUuid(kind, row.target_id) }; });
  return { hybridUserProfile: normalizedProfile, publishedAsset: normalizedAsset, publishedPrompt: normalizedPrompt, publishedCommerce: normalizedCommerce, u2aBehavior: behaviorRows(u2a, 'asset_id', 'asset'), u2pBehavior: behaviorRows(demandRows(promptBehavior), 'prompt_id', 'prompt'), u2cBehavior: behaviorRows(demandRows(commerceBehavior), 'commerce_id', 'commerce'), u2uBehavior: normalizedU2u, contentFeatures: normalizedFeatures };
}
