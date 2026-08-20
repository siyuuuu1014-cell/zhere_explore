const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RATE_FIELDS = new Set(['purchase_rate', 'like_rate', 'fav_rate', 'comment_rate', 'share_rate']);

export function validateRecommendationProjection(schema, rows) {
  const errors = [];
  const seen = new Set();
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index]; const key = row[schema.primary];
    if (!key) errors.push(`${schema.name}[${index}].${schema.primary}: 主键不能为空`);
    else if (seen.has(key)) errors.push(`${schema.name}[${index}].${schema.primary}: 主键重复 ${key}`);
    else seen.add(key);
    for (const field of schema.fields) {
      const value = row[field.name];
      if (field.required && (value == null || value === '')) { errors.push(`${schema.name}[${index}].${field.name}: 必填`); continue; }
      if (value == null || value === '') continue;
      if (field.format === 'UUID' && (typeof value !== 'string' || !UUID.test(value))) errors.push(`${schema.name}[${index}].${field.name}: 必须是 UUID`);
      if (field.format === 'String' && typeof value !== 'string') errors.push(`${schema.name}[${index}].${field.name}: 必须是 String`);
      if (field.format === 'Boolean' && typeof value !== 'boolean') errors.push(`${schema.name}[${index}].${field.name}: 必须是 Boolean`);
      if (field.format === 'Int' && (!Number.isInteger(value) || value < 0)) errors.push(`${schema.name}[${index}].${field.name}: 必须是非负 Int`);
      if (['Float', 'Float64'].includes(field.format) && !Number.isFinite(value)) errors.push(`${schema.name}[${index}].${field.name}: 必须是有限浮点数`);
      if (['Date', 'DateTime'].includes(field.format) && Number.isNaN(Date.parse(value))) errors.push(`${schema.name}[${index}].${field.name}: 必须是有效日期`);
      if (field.enum && !field.enum.includes(value)) errors.push(`${schema.name}[${index}].${field.name}: 不在枚举 ${field.enum.join(', ')}`);
      if (RATE_FIELDS.has(field.name) && (value < 0 || value > 1)) errors.push(`${schema.name}[${index}].${field.name}: 比率必须在 [0, 1]`);
      if (['stime', 'etime'].includes(field.name) && value && !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) errors.push(`${schema.name}[${index}].${field.name}: 时间必须是 HH:mm`);
    }
  }
  return errors;
}

export function assertRecommendationProjections(schemas, projections) {
  const errors = schemas.flatMap((schema) => validateRecommendationProjection(schema, projections[schema.key] || []));
  if (errors.length) {
    const error = new Error(`推荐研究数据格式校验失败（${errors.length} 项）：\n${errors.slice(0, 30).join('\n')}`);
    error.validationErrors = errors;
    throw error;
  }
}
