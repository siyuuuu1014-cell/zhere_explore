const MERGED_ARRAY_FIELDS = [
  'favorites', 'likes', 'copies', 'placed', 'published', 'notes', 'demandDrafts',
  'customTags', 'assetRelations', 'journalEntries', 'discoveredZones', 'discoveries',
  'stickers', 'journalStickers', 'homeStickers', 'bag', 'benchMessages', 'pocketWords',
  'seenZoneEventOccurrences',
];

const MERGED_OBJECT_FIELDS = [
  'bids', 'noteLinks', 'noteResponses', 'namedZones', 'worldEventChoices',
  'zoneEventChoices', 'npcStories',
];

function itemKey(item) {
  if (item == null || typeof item !== 'object') return `${typeof item}:${String(item)}`;
  for (const key of ['id', 'copyId', 'copy_id', 'entryId', 'entry_id', 'assetId', 'asset_id', 'transactionId', 'transaction_id', 'bid_id', 'zoneId', 'zone_id', 'name']) {
    if (item[key] != null && item[key] !== '') return `${key}:${String(item[key])}`;
  }
  return `json:${JSON.stringify(item)}`;
}

export function stableUnion(primary = [], secondary = []) {
  const result = [];
  const seen = new Set();
  for (const item of [...primary, ...secondary]) {
    const key = itemKey(item);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(structuredClone(item));
  }
  return result;
}

function mergeNumericMap(primary = {}, secondary = {}) {
  const result = { ...secondary, ...primary };
  for (const key of new Set([...Object.keys(primary || {}), ...Object.keys(secondary || {})])) {
    const a = Number(primary?.[key]);
    const b = Number(secondary?.[key]);
    if (Number.isFinite(a) || Number.isFinite(b)) result[key] = Math.max(Number.isFinite(a) ? a : 0, Number.isFinite(b) ? b : 0);
  }
  return result;
}

function mergeHomestead(primary = {}, secondary = {}) {
  const result = { ...structuredClone(secondary || {}), ...structuredClone(primary || {}) };
  for (const key of ['structures', 'decorations', 'plots', 'placedCopies']) {
    if (Array.isArray(primary?.[key]) || Array.isArray(secondary?.[key])) {
      result[key] = stableUnion(primary?.[key] || [], secondary?.[key] || []);
    }
  }
  for (const key of ['resources', 'inventory', 'upgrades']) {
    if (primary?.[key] || secondary?.[key]) result[key] = mergeNumericMap(primary?.[key] || {}, secondary?.[key] || {});
  }
  return result;
}

export function mergeWorldStates(primary = {}, secondary = {}, profile = {}) {
  const merged = { ...structuredClone(secondary || {}), ...structuredClone(primary || {}) };
  for (const key of MERGED_ARRAY_FIELDS) {
    if (Array.isArray(primary?.[key]) || Array.isArray(secondary?.[key])) {
      merged[key] = stableUnion(primary?.[key] || [], secondary?.[key] || []);
    }
  }
  for (const key of MERGED_OBJECT_FIELDS) {
    if (primary?.[key] || secondary?.[key]) merged[key] = { ...(secondary?.[key] || {}), ...(primary?.[key] || {}) };
  }
  merged.exposureCounts = mergeNumericMap(primary?.exposureCounts || {}, secondary?.exposureCounts || {});
  merged.wallet = Math.max(Number(primary?.wallet || 0), Number(secondary?.wallet || 0));
  merged.exploreSteps = Math.max(Number(primary?.exploreSteps || 0), Number(secondary?.exploreSteps || 0));
  merged.schemaVersion = Math.max(Number(primary?.schemaVersion || 0), Number(secondary?.schemaVersion || 0));
  merged.homestead = mergeHomestead(primary?.homestead || {}, secondary?.homestead || {});
  merged.profile = { ...(primary?.profile || {}), ...profile };
  return merged;
}

export function remapUserReferences(value, fromUserId, toUserId) {
  if (value === fromUserId) return toUserId;
  if (Array.isArray(value)) return value.map((item) => remapUserReferences(item, fromUserId, toUserId));
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, remapUserReferences(item, fromUserId, toUserId)]));
}

