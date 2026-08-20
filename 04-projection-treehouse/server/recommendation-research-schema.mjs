const text = (name, format = 'String', options = {}) => ({ name, type: 1, format, ...options });
const number = (name, format = 'Float', options = {}) => ({ name, type: 2, format, ...options });
const date = (name, format = 'DateTime', options = {}) => ({ name, type: 5, format, ...options });
const bool = (name, options = {}) => ({ name, type: 7, format: 'Boolean', ...options });

const lineage = [text('schema_version'), date('snapshot_at')];
const behaviorLineage = [date('first_interacted_at'), date('last_interacted_at'), ...lineage];

export const RECOMMENDATION_RESEARCH_TABLES = [
  {
    key: 'hybridUserProfile', env: 'FEISHU_TABLE_REC_HYBRID_USER_PROFILE', name: 'rec_hybrid_user_profile', primary: 'user_id',
    fields: [text('user_id', 'UUID', { required: true }), bool('is_active_old'), bool('is_high_potential_new'), text('user_segment'), text('hybrid_recommend'), date('segment_updated_at'), text('name'), date('birthday'), number('level', 'Int'), text('gender'), text('intro'), number('latitude'), number('longitude'), text('location'), text('designation'), text('experience'), text('goodat'), text('purchase'), text('assets'), text('works'), text('prompt'), text('commerce'), number('rate'), date('register_at'), number('fans_count', 'Int'), number('follow_count', 'Int'), number('liked_count', 'Int'), number('fav_count', 'Int'), number('comment_count', 'Int'), number('shared_count', 'Int'), date('updated_at'), ...lineage],
  },
  {
    key: 'publishedAsset', env: 'FEISHU_TABLE_REC_PUBLISHED_ASSET', name: 'rec_published_asset', primary: 'asset_id',
    fields: [text('asset_id', 'UUID', { required: true }), text('user_id', 'UUID', { required: true }), text('prompt_id', 'UUID'), date('created_at'), text('buyer'), number('amount', 'Int'), number('pricing'), number('average_pricing'), number('average_rate'), text('title'), text('description'), text('theme'), number('latitude'), number('longitude'), text('location'), text('size'), number('duration'), text('definition'), number('like_count', 'Int'), number('fav_count', 'Int'), number('comment_count', 'Int'), number('share_count', 'Int'), number('view_count', 'Int'), ...lineage],
  },
  {
    key: 'publishedPrompt', env: 'FEISHU_TABLE_REC_PUBLISHED_PROMPT', name: 'rec_published_prompt', primary: 'prompt_id',
    fields: [text('prompt_id', 'UUID', { required: true }), text('user_id', 'UUID', { required: true }), number('rate'), text('participants'), text('title'), text('description'), number('latitude'), number('longitude'), text('location'), text('theme'), number('duration', 'Int'), text('size'), text('definition'), number('pricing'), date('created_at'), date('start', 'Date'), text('stime'), date('end', 'Date'), text('etime'), bool('complete'), number('like_count', 'Int'), number('fav_count', 'Int'), number('comment_count', 'Int'), number('share_count', 'Int'), number('view_count', 'Int'), ...lineage],
  },
  {
    key: 'publishedCommerce', env: 'FEISHU_TABLE_REC_PUBLISHED_COMMERCE', name: 'rec_published_commerce', primary: 'commerce_id',
    fields: [text('commerce_id', 'UUID', { required: true }), text('user_id', 'UUID', { required: true }), text('organization'), text('activity'), text('place'), number('budget'), text('context'), text('jds'), text('requirements'), text('range'), date('created_at'), date('start', 'Date'), text('stime'), date('end', 'Date'), text('etime'), bool('complete'), number('like_count', 'Int'), number('fav_count', 'Int'), number('comment_count', 'Int'), number('share_count', 'Int'), number('view_count', 'Int'), ...lineage],
  },
  {
    key: 'u2aBehavior', env: 'FEISHU_TABLE_REC_U2A_BEHAVIOR', name: 'rec_u2a_behavior', primary: 'behavior_id',
    fields: [text('behavior_id', 'UUID', { required: true }), text('user_id', 'UUID', { required: true }), text('asset_id', 'UUID', { required: true }), bool('view'), bool('like'), bool('fav'), bool('share'), text('comment'), number('rate'), bool('buy'), bool('sell'), ...behaviorLineage],
  },
  {
    key: 'u2pBehavior', env: 'FEISHU_TABLE_REC_U2P_BEHAVIOR', name: 'rec_u2p_behavior', primary: 'behavior_id',
    fields: [text('behavior_id', 'UUID', { required: true }), text('user_id', 'UUID', { required: true }), text('prompt_id', 'UUID', { required: true }), bool('view'), text('comment'), bool('like'), bool('fav'), bool('share'), number('rate'), text('asset_id', 'UUID'), ...behaviorLineage],
  },
  {
    key: 'u2cBehavior', env: 'FEISHU_TABLE_REC_U2C_BEHAVIOR', name: 'rec_u2c_behavior', primary: 'behavior_id',
    fields: [text('behavior_id', 'UUID', { required: true }), text('user_id', 'UUID', { required: true }), text('commerce_id', 'UUID', { required: true }), bool('view'), text('comment'), bool('like'), bool('fav'), bool('share'), number('rate'), text('asset_id', 'UUID'), ...behaviorLineage],
  },
  {
    key: 'u2uBehavior', env: 'FEISHU_TABLE_REC_U2U_BEHAVIOR', name: 'rec_u2u_behavior', primary: 'behavior_id',
    fields: [text('behavior_id', 'UUID', { required: true }), text('user_id_A', 'UUID', { required: true }), text('user_id_B', 'UUID', { required: true }), bool('follow'), text('message'), ...behaviorLineage],
  },
  {
    key: 'contentFeatures', env: 'FEISHU_TABLE_REC_CONTENT_FEATURES', name: 'rec_content_features', primary: 'feature_id',
    fields: [text('feature_id', 'UUID', { required: true }), text('target_id', 'UUID', { required: true }), text('content_type', 'String', { enum: ['published_prompt', 'published_commerce', 'published_asset'] }), text('tags'), number('purchase_rate', 'Float64'), number('like_rate', 'Float64'), number('fav_rate', 'Float64'), number('comment_rate', 'Float64'), number('share_rate', 'Float64'), date('updated_at'), ...lineage],
  },
];

export const recommendationResearchTableIds = () => Object.fromEntries(
  RECOMMENDATION_RESEARCH_TABLES.map((table) => [table.key, process.env[table.env] || '']),
);
