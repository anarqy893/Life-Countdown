import { DAY, addYears, dateValue, civilNow } from './model.mjs';

// Illustrative chapters, never inferred personal history or predicted life events.
export const CHAPTERS = [
  { name: 'Childhood', from: 0, to: 5, color: '#c6b4df' },
  { name: 'Primary school', from: 5, to: 12, color: '#a7c8e5' },
  { name: 'Secondary school', from: 12, to: 18, color: '#91b4d0' },
  { name: 'Further education / training', from: 18, to: 22, color: '#b8cba0' },
  { name: 'Early working life', from: 22, to: 30, color: '#e0c484' },
  { name: 'Working life', from: 30, to: 65, color: '#d3ad7a' },
  { name: 'Retirement', from: 65, to: Infinity, color: '#a6c8b5' }
];

export function ageAt(birthday, timestamp) {
  if (!birthday || timestamp < dateValue(birthday)) return null;
  let age = new Date(timestamp).getUTCFullYear() - new Date(dateValue(birthday)).getUTCFullYear();
  if (dateValue(addYears(birthday, age)) > timestamp) age--;
  return age;
}

export function timelineRows(state, period, now = civilNow()) {
  const end = dateValue(period.end), start = dateValue(period.start);
  if (end <= start) throw new Error('The end date must be after the start date.');
  const rows = [];
  for (let year = 0; dateValue(addYears(period.start, year)) < end; year++) {
    const from = dateValue(addYears(period.start, year));
    const to = Math.min(end, dateValue(addYears(period.start, year + 1)));
    const age = ageAt(state.birthday, from);
    const cells = [];
    for (let week = 0; week < 52 && from + week * 7 * DAY < to; week++) {
      // Keep a 52-column calendar. The last block includes the year's extra days.
      const cellStart = from + week * 7 * DAY, cellEnd = week === 51 ? to : Math.min(to, cellStart + 7 * DAY);
      cells.push({ start: cellStart, end: cellEnd, fraction: (cellEnd - cellStart) / (7 * DAY),
        elapsed: Math.max(0, Math.min(1, (now - cellStart) / (cellEnd - cellStart))),
        current: cellStart <= now && now < cellEnd, age: ageAt(state.birthday, cellStart) });
    }
    rows.push({ from, to, age, year, cells });
  }
  return rows;
}

const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const date = value => new Date(value).toISOString().slice(0, 10);

export function timelineMarkup(state, period, { example = false, personalChapters = true } = {}) {
  const rows = timelineRows(state, period), life = period.id === 'life';
  const chapters = life && personalChapters;
  const currentRow = rows.findIndex(row => row.cells.some(cell => cell.current));
  const currentAge = ageAt(state.birthday, civilNow());
  const cells = rows.map(row => {
    const chapter = CHAPTERS.find(c => row.age >= c.from && row.age < c.to);
    return row.cells.map((cell, index) => {
      const percent = example ? 0 : cell.elapsed * 100;
      const color = example ? chapter?.color || '#fffdf5' : '#fffdf5';
      const endAge = ageAt(state.birthday, cell.end - 1);
      const title = `${date(cell.start)} to ${date(cell.end)} (end excluded)${cell.age === null ? '' : ` · Age ${cell.age}${endAge !== cell.age ? `–${endAge}` : ''}`} · ${((cell.end - cell.start) / DAY)} days`;
      return `<span class="week timeline-cell ${!example && cell.elapsed === 1 ? 'crossed' : ''} ${!example && cell.current ? 'current' : ''}" style="grid-row:${row.year + 1};grid-column:${index + 1};--week-fraction:${cell.fraction};background:linear-gradient(to right,#747b75 ${percent}%,${color} ${percent}%)" title="${escape(title)}"></span>`;
    }).join('');
  }).join('');
  const labels = rows.map((row, index) => {
    const show = index % 5 === 0 || index === rows.length - 1 && index % 5 > 2;
    const label = life ? `Age ${row.age}` : new Date(row.from).toLocaleDateString(undefined, { year: 'numeric', month: 'short', timeZone: 'UTC' });
    return `<span class="timeline-age ${index % 10 === 0 ? 'major' : ''}" style="--row:${index}" title="${escape(label)}" aria-label="${escape(label)}">${show ? escape(label) : ''}</span>`;
  }).join('');
  const rails = chapters ? `<div class="chapter-rails" aria-label="Illustrative life chapters">${CHAPTERS.filter(c => c.from < rows.length).map(c => `<div class="chapter-band" style="--from:${c.from};--span:${Math.min(c.to, rows.length) - c.from};--chapter-color:${c.color}" title="${escape(c.name)} · illustrative ages ${c.from}–${Math.min(c.to, rows.length)}"><span>${escape(c.name)}</span><small>${c.from}–${Math.min(c.to, rows.length)}</small></div>`).join('')}<div class="caregiving-band" style="--from:28;--span:${Math.max(0, Math.min(60, rows.length) - 28)}" ${rows.length <= 28 ? 'hidden' : ''}>Parenting / caregiving<small>Optional, overlapping chapter · example ages 28–60</small></div></div>` : '';
  return `<section class="panel time-chart timeline-chart ${chapters ? 'with-chapters' : ''}" data-timeline-example="${example}">
    <div class="panel-heading"><h2>${example ? 'A whole life, in weeks' : 'Life timeline'}</h2><span class="timeline-status">${example ? 'Example: a 90-year planning horizon' : currentRow >= 0 ? `You are here${currentAge === null ? '' : ` · age ${currentAge}`}` : civilNow() >= dateValue(period.end) ? 'This period has ended' : 'This period is ahead'}</span></div>
    <div class="grid-wrap timeline-wrap"><div class="timeline-board" style="--rows:${rows.length}">
      <div class="timeline-axis-x" aria-label="Week blocks within each year">${[1, 13, 26, 39, 52].map(w => `<span style="--column:${w - 1}">${w}</span>`).join('')}</div>
      <div class="timeline-axis-y" aria-label="${life ? 'Age at the start of each row' : 'Start date of each year-long row'}">${labels}</div>
      <div class="week-grid timeline-grid" id="grid" role="img" aria-label="Chronological weeks, ${life ? 'one age year per row' : 'one year per row from the period start'}, with exact dates on hover">${cells}</div>${rails}
    </div></div>
    <p class="help timeline-key">${example ? 'Each coloured chapter is one possible path. People follow different paths, and chapters can overlap.' : 'Crossed grey: already lived · outlined amber: the present · empty: time ahead.'}</p>
    <p class="help timeline-note">${chapters ? 'Chapter bands are illustrative examples, not your personal history or predicted future. ' : ''}Each row has 52 week blocks. Its last block includes the extra 1 or 2 days of that year. Hover for dates${state.birthday ? ' and age' : ''}.</p>
  </section>`;
}

export function fitTimeline(grid) {
  const board = grid.closest('.timeline-board'), wrap = board.parentElement;
  const rows = Number(board.style.getPropertyValue('--rows'));
  const chapters = Boolean(board.querySelector('.chapter-rails'));
  const scale = devicePixelRatio || 1;
  const gap = (wrap.clientHeight - 28) / rows >= 2 / scale ? 1 / scale : 0;
  const reserve = chapters ? (parseFloat(getComputedStyle(board).getPropertyValue('--chapter-width')) || 280) + 20 : 0;
  const cell = Math.max(1 / scale, Math.floor(Math.min(14, (wrap.clientHeight - 28) / rows - gap, (wrap.clientWidth - 65 - reserve) / 52 - gap) * scale) / scale);
  board.style.setProperty('--cell', `${cell}px`);
  board.style.setProperty('--gap', `${gap}px`);
  grid.style.setProperty('--grid-stroke', `${.5 / scale}px`);
  const interval = cell + gap < 2.5 ? 10 : 5;
  board.querySelectorAll('.timeline-age').forEach((label, index) => {
    label.textContent = index % interval === 0 || index === rows - 1 && index % interval > interval / 2 ? label.getAttribute('aria-label') : '';
  });
  board.classList.toggle('timeline-compact', cell + gap < 3);
}
