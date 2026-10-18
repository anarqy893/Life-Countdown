export const DAY = 86400000;
export const WEEK_HOURS = 168;
export const today = () => new Date().toLocaleDateString('en-CA');

// Treat dates as civil calendar dates so daylight-saving shifts don't change a week's size.
export function dateValue(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) throw new Error('Enter a valid date.');
  const [y, m, d] = value.split('-').map(Number);
  const result = Date.UTC(y, m - 1, d);
  if (new Date(result).toISOString().slice(0, 10) !== value) throw new Error('Enter a valid date.');
  return result;
}
export function civilNow(date = new Date()) {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), date.getHours(), date.getMinutes(), date.getSeconds(), date.getMilliseconds());
}
export function addYears(value, years) {
  const date = new Date(dateValue(value));
  const year = date.getUTCFullYear() + years;
  const month = date.getUTCMonth();
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(date.getUTCDate(), lastDay))).toISOString().slice(0, 10);
}
export function defaults() {
  const start = today();
  return {
    version: 1, birthday: '', lifespan: 90, selected: 'life', onboardingStep: 'welcome', setupHoursConfirmed: false, gridView: 'allocations', overviewLayout: 'split', navigationExpanded: false, countdownFormat: 'seconds', widgetOpacity: 85, widgetCounterOnly: false, hourlyEffect: 'off', hiddenGroups: [],
    moments: [], widgetGridView: 'allocations', widgetSelected: 'life', setupWidgetPulseShown: false,
    categories: [
      { id: 'sleep', name: 'Sleep', color: '#859def', unit: 'night' },
      { id: 'work', name: 'Work', color: '#e9aa72', unit: 'week' }
    ],
    schedules: [{ id: 'initial', start, hours: { sleep: 0, work: 0 } }],
    periods: [
      { id: 'five', name: 'Next five years', start, end: addYears(start, 5) },
      { id: 'decade', name: 'Next decade', start, end: addYears(start, 10) }
    ]
  };
}
export function weeklyHours(category, schedule) {
  return Number(schedule.hours[category.id] || 0) * (category.unit === 'night' ? 7 : 1);
}
export function validateSchedule(categories, schedule) {
  dateValue(schedule.start);
  let total = 0;
  for (const category of categories) {
    const raw = schedule.hours[category.id] ?? 0;
    if (!Number.isFinite(Number(raw)) || Number(raw) < 0) throw new Error('Hours must be zero or greater.');
    total += weeklyHours(category, schedule);
  }
  if (total > WEEK_HOURS + 1e-8) throw new Error(`This schedule assigns ${total.toFixed(1)} hours. A week has only 168 hours.`);
  return total;
}
export function periodFor(state) {
  if (state.selected === 'life') {
    if (!state.birthday) return null;
    return { id: 'life', name: 'My life', start: state.birthday, end: addYears(state.birthday, Number(state.lifespan)) };
  }
  return state.periods.find(period => period.id === state.selected) || null;
}
export function widgetPeriodFor(state) {
  return periodFor({ ...state, selected: state.widgetSelected || 'life' }) || periodFor({ ...state, selected: 'life' });
}
export function calculate(state, period, now = civilNow()) {
  const start = dateValue(period.start), end = dateValue(period.end);
  if (end <= start) throw new Error('The end date must be after the start date.');
  const cursor = Math.max(start, Math.min(now, end));
  const elapsed = (cursor - start) / DAY * 24;
  const future = (end - cursor) / DAY * 24;
  const totals = Object.fromEntries(state.categories.map(category => [category.id, 0]));
  const schedules = [...state.schedules].sort((a, b) => dateValue(a.start) - dateValue(b.start));
  if (!schedules.length) throw new Error('Add at least one schedule.');
  schedules.forEach(schedule => validateSchedule(state.categories, schedule));
  // The earliest schedule supplies the baseline before its date if a period starts earlier.
  for (let i = 0; i < schedules.length; i++) {
    const segmentStart = i === 0 ? cursor : Math.max(cursor, dateValue(schedules[i].start));
    const segmentEnd = Math.min(end, i + 1 < schedules.length ? dateValue(schedules[i + 1].start) : end);
    if (segmentEnd <= segmentStart) continue;
    const weeks = (segmentEnd - segmentStart) / DAY / 7;
    for (const category of state.categories) totals[category.id] += weeklyHours(category, schedules[i]) * weeks;
  }
  const assigned = Object.values(totals).reduce((sum, hours) => sum + hours, 0);
  const remaining = Math.max(0, future - assigned);
  const groups = [
    { id: 'elapsed', name: 'Already lived', color: '#747b75', hours: elapsed },
    ...state.categories.map(category => ({ ...category, hours: totals[category.id] })),
    { id: 'unallocated', name: 'Unallocated', color: '#fffdf5', hours: remaining }
  ];
  return { start, end, elapsed, future, total: elapsed + future, groups, remaining };
}
export function countdown(end, now = civilNow()) {
  const seconds = Math.max(0, Math.floor((dateValue(end) - now) / 1000));
  return { days: Math.floor(seconds / 86400), hours: Math.floor(seconds / 3600) % 24, minutes: Math.floor(seconds / 60) % 60, seconds: seconds % 60 };
}

export const COUNTDOWN_FORMATS = ['calendar', 'days', 'weeks', 'hours', 'seconds'];
export function countdownParts(end, format = 'calendar', now = civilNow()) {
  const target = dateValue(end);
  const remaining = Math.max(0, target - now);
  const clock = countdown(end, now);
  if (format === 'days') return Object.entries(clock);
  if (format === 'weeks') return [['weeks', Math.floor(clock.days / 7)], ['days', clock.days % 7]];
  if (format === 'hours') return [['hours', Math.floor(remaining / 3600000)]];
  if (format === 'seconds') return [['seconds', Math.floor(remaining / 1000)]];
  if (!remaining) return [['years', 0], ['months', 0], ['days', 0]];
  const start = new Date(now), finish = new Date(target);
  let months = (finish.getUTCFullYear() - start.getUTCFullYear()) * 12 + finish.getUTCMonth() - start.getUTCMonth();
  function anchor(offset) {
    const first = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + offset, 1));
    const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
    return Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), Math.min(start.getUTCDate(), last), start.getUTCHours(), start.getUTCMinutes(), start.getUTCSeconds(), start.getUTCMilliseconds());
  }
  while (months > 0 && anchor(months) > target) months--;
  return [['years', Math.floor(months / 12)], ['months', months % 12], ['days', Math.floor((target - anchor(months)) / DAY)]];
}

export function squareSegments(groups, index, total) {
  const from = index * WEEK_HOURS, to = Math.min(from + WEEK_HOURS, total);
  let position = 0;
  const segments = [];
  for (const group of groups) {
    const next = position + group.hours;
    const overlap = Math.max(0, Math.min(to, next) - Math.max(from, position));
    if (overlap > 1e-7) segments.push({ ...group, fraction: overlap / WEEK_HOURS });
    position = next;
  }
  return segments;
}
