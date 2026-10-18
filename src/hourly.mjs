export const HOURLY_EFFECTS = ['off', 'pulse', 'sweep'];

// Only a freshly observed hour boundary counts. Missed hours are never replayed.
export function isHourlyBoundary(previous, current) {
  const elapsed = current.getTime() - previous.getTime();
  const key = date => [date.getFullYear(), date.getMonth(), date.getDate(), date.getHours(), date.getTimezoneOffset()].join(':');
  return elapsed > 0 && elapsed <= 5000 && current.getMinutes() === 0 && current.getSeconds() < 5 && key(previous) !== key(current);
}
