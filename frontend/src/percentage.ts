/** Keep percentage labels readable without changing the stored or submitted value. */
export function formatPercentage(value: string): string {
  const number = Number(value);
  const display =
    value.trim() && Number.isFinite(number)
      ? String(Number(number.toFixed(2)))
      : value;
  return `${display}%`;
}
