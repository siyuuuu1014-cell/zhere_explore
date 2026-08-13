export function normalizeBidPrice(value) {
  const price = Number(value);
  if (!Number.isFinite(price) || price <= 0) return null;
  const minor = Math.round(price * 100);
  if (!Number.isSafeInteger(minor) || minor <= 0 || Math.abs(price * 100 - minor) > 1e-7) return null;
  return minor / 100;
}

export function calculateBasePrice(transactions, requiredCount) {
  const count = Number(requiredCount);
  if (!Number.isInteger(count) || count < 1) throw new Error('Invalid base price transaction count.');
  const valid = transactions
    .filter((transaction) => transaction.is_valid === true)
    .sort((a, b) => {
      const timeOrder = String(a.transaction_time).localeCompare(String(b.transaction_time));
      return timeOrder || String(a.transaction_id).localeCompare(String(b.transaction_id));
    });

  if (valid.length < count) {
    return { base_price: null, sample_transaction_ids: [], valid_transaction_count: valid.length };
  }

  const sample = valid.slice(0, count);
  const totalMinor = sample.reduce((sum, transaction) => sum + Math.round(Number(transaction.transaction_price) * 100), 0);
  return {
    base_price: Math.round(totalMinor / count) / 100,
    sample_transaction_ids: sample.map((transaction) => transaction.transaction_id),
    valid_transaction_count: valid.length,
  };
}
