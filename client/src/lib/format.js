export function formatQty(n) {
  const num = Number(n);
  if (Number.isNaN(num)) return n;
  return Math.round(num * 1000) / 1000;
}
