import { addYears, dateValue, civilNow } from './model.mjs';

// A frequency-based possibility, not a schedule or a prediction of lifespan.
export function estimateOccasions(birthday, lifespan, { times, years, untilAge }, now = civilNow()) {
  times = Number(times); years = Number(years);
  if (!Number.isInteger(times) || times < 1 || times > 365 || !Number.isInteger(years) || years < 1 || years > 50) {
    throw new Error('Enter 1–365 occasions every 1–50 years, using whole numbers.');
  }
  if (!Number.isInteger(lifespan) || lifespan < 1 || lifespan > 130) throw new Error('Choose a valid reference age first.');
  const endAge = occasionEndAge(lifespan, { untilAge });
  const start = dateValue(birthday), end = dateValue(addYears(birthday, endAge));
  const cursor = Math.max(start, now);
  if (cursor >= end) return 0;
  let age = new Date(cursor).getUTCFullYear() - new Date(start).getUTCFullYear();
  if (dateValue(addYears(birthday, age)) > cursor) age--;
  const anniversary = dateValue(addYears(birthday, age));
  const nextAnniversary = dateValue(addYears(birthday, age + 1));
  const remainingYears = endAge - age - (cursor - anniversary) / (nextAnniversary - anniversary);
  return Math.max(0, Math.floor(remainingYears * times / years + 1e-9));
}

function occasionEndAge(lifespan, moment) {
  const age = moment.untilAge == null ? Number(lifespan) : Number(moment.untilAge);
  if (!Number.isInteger(age) || age < 1 || age > 130) throw new Error('Enter an until age from 1 to 130, using a whole number.');
  return age;
}

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const integer = new Intl.NumberFormat();
export const MOMENT_EXAMPLES = [
  'Swimming in the ocean', 'Seeing a faraway friend', 'Going to the cottage',
  'Skiing / snowboarding', 'Camping trips', 'Family reunions',
  'Beach trips', 'Visiting a favourite city', 'Hiking a favourite trail',
  'Canoeing / kayaking trips', 'Visiting parents', 'Weekends with siblings',
  'Birthday celebrations', 'Holiday gatherings', 'Anniversary celebrations',
  'Annual trips with friends', 'Concerts', 'Theatre shows', 'Festivals',
  'Sporting events', 'Weekend getaways', 'Special date nights',
  'Trips with your children', 'Celebrating with grandparents'
];

function frequencyLabel(moment) {
  const times = Number(moment.times), years = Number(moment.years);
  if (years === 1) return times === 1 ? 'Once a year' : times === 2 ? 'Twice a year' : `${times} times a year`;
  return `${times === 1 ? 'Once' : `${times} times`} every ${years} years`;
}
function occasionCountMarkup(count) {
  return `<div class="occasion-count" data-occasion-tone="${occasionTone(count)}"><strong>${integer.format(count)}</strong><span>${count === 1 ? 'occasion' : 'occasions'} ahead</span></div>`;
}
const occasionTone = count => count <= 12 ? 'coral' : count <= 36 ? 'amber' : 'green';
function occasionDotsMarkup(count) {
  const visible = Math.min(count, 120);
  return `<div class="occasion-dots" data-occasion-tone="${occasionTone(count)}" aria-hidden="true">${'<i></i>'.repeat(visible)}</div>${count > visible ? `<p class="help occasion-overflow">${visible} shown · ${integer.format(count - visible)} more beyond these dots.</p>` : count === 0 ? '<p class="help occasion-overflow">No full occasions at this frequency.</p>' : ''}`;
}
export function occasionResultMarkup(state, moment) {
  if (!moment?.name?.trim()) return '<div class="occasion-empty"><span class="eyebrow">Make it personal</span><h2>What would you like more of?</h2><p>Choose an example or enter something you love. Each dot will represent one possible future occasion.</p></div>';
  try {
    const count = estimateOccasions(state.birthday, Number(state.lifespan), moment);
    return `<div class="eyebrow">Possibilities ahead</div><h2 class="occasion-name">${esc(moment.name)}</h2>${occasionCountMarkup(count)}<p class="help">${frequencyLabel(moment)}, until ${moment.untilAge == null ? 'your reference age of' : 'age'} ${occasionEndAge(state.lifespan, moment)}.</p>${occasionDotsMarkup(count)}<p class="occasion-invitation">${count ? 'Which one could you make happen next?' : 'You can change the frequency or end age.'}</p><p class="help">Each dot is one possible occasion. This is an estimate from today, rounded down; plans and circumstances change.</p>`;
  } catch (error) { return `<p class="help">${esc(error.message)}</p>`; }
}

function momentFrequencyMarkup(value) {
  return '<fieldset class="moment-frequency"><legend>How often?</legend><div class="moment-frequency-inputs"><label><input name="times" aria-label="Number of occasions" type="number" min="1" max="365" step="1" required value="' + esc(value.times) + '"><span data-frequency-times>' + (Number(value.times) === 1 ? 'time' : 'times') + '</span></label><span class="moment-frequency-every">every</span><label><input name="years" aria-label="Number of years" type="number" min="1" max="50" step="1" required value="' + esc(value.years ?? 1) + '"><span data-frequency-years>' + (Number(value.years ?? 1) === 1 ? 'year' : 'years') + '</span></label></div></fieldset>';
}
function momentAgeMarkup(state, value) {
  return '<div class="moment-age-row"><label>Until age<input name="untilAge" type="number" min="1" max="130" step="1" required value="' + esc(value.untilAge ?? state.lifespan) + '" ' + (value.untilAge == null ? 'disabled' : '') + '></label><label class="moment-age-default"><input name="useReferenceAge" type="checkbox" ' + (value.untilAge == null ? 'checked' : '') + '>Use my reference age (' + state.lifespan + ')</label></div>';
}
function savedMomentsMarkup(state, guided) {
  if (!guided || !state.moments?.length) return '';
  return '<section class="moment-saved" aria-label="Saved reflections"><h2>Saved reflections</h2>' + state.moments.map(item => '<div><span>' + esc(item.name) + '</span><button class="subtle" data-moment-edit="' + esc(item.id) + '" aria-label="Edit ' + esc(item.name) + '">Edit</button><button class="subtle" data-moment-remove="' + esc(item.id) + '" aria-label="Remove ' + esc(item.name) + '">Remove</button></div>').join('') + '</section>';
}
function momentNavigationMarkup(state, guided) {
  return '<div class="actions guide-actions">' + (guided ? '<button data-guide-back="allocations">Back</button><button id="moment-skip">' + (state.moments?.length ? 'Continue' : 'Skip for now') + '</button>' : '<button id="moments-back">Back to reflections</button>') + '</div>';
}
export function momentsLivePreviewMarkup(state, items) {
  if (!items.length) return '<div class="occasion-empty"><div class="eyebrow">Make it personal</div><h2>What would you like more of?</h2><p>Click an example or add your own to see its dots straight away. Try changing the frequency or end age and watch the possibilities change.</p></div>';
  return items.map(item => `<article class="moment-live-result" data-live-preview="${esc(item.id)}"><h2>${esc(item.name.trim() || 'Your activity')}</h2><p class="help">${frequencyLabel(item)} · Until age ${esc(item.untilAge ?? state.lifespan)}</p>${occasionBatchResultMarkup(state, item)}</article>`).join('');
}
export function momentsLiveMarkup(state, picker) {
  const items = picker?.items ?? state.moments ?? [];
  const openId = picker?.openId === undefined ? items[0]?.id : picker.openId;
  return `<div class="moment-live-workspace"><div class="moment-live-controls"><section class="moment-picker panel" id="moment-picker"><h2>Try a few examples.</h2><p class="help">Start with once a year, until your reference age of ${state.lifespan}. Adjust these assumptions below.</p><div class="moment-examples" aria-label="Choose meaningful experiences">${MOMENT_EXAMPLES.slice(0, 6).map((name, index) => {
    const selected = items.some(item => item.name === name);
    return `<button type="button" class="subtle" data-moment-example="${index}" aria-pressed="${selected}">${selected ? '<span aria-hidden="true">&#10003; </span>' : ''}${esc(name)}</button>`;
  }).join('')}</div><form id="moment-custom-form"><label>Or add your own<div class="moment-custom-input"><textarea name="customName" aria-label="Your own meaningful experiences, one per line" maxlength="4000" rows="2" required placeholder="A trip with my sister&#10;Seeing my favourite band">${esc(picker?.customName || '')}</textarea><button type="submit">Add</button></div></label><p class="help moment-custom-hint">Add several at once, one experience per line.</p><p class="error" role="alert"></p></form></section><form id="moment-live-form"><div class="moment-live-fields">${items.map(item => `<details class="moment-live-item" name="signup-moment" data-live-id="${esc(item.id)}" ${item.id === openId ? 'open' : ''}><summary>${esc(item.name || 'Your activity')}</summary><div class="moment-live-item-fields"><input name="name" type="hidden" value="${esc(item.name)}">${momentFrequencyMarkup(item)}${momentAgeMarkup(state, item)}<button type="button" class="subtle" data-live-remove="${esc(item.id)}" aria-label="Remove ${esc(item.name)} from selection">Remove from selection</button></div></details>`).join('')}</div><p class="error" role="alert"></p></form><div class="actions moment-live-actions"><button data-guide-back="allocations">Back</button><button id="moment-skip">Skip for now</button><button class="primary" form="moment-live-form" type="submit" ${items.length ? '' : 'disabled'}>Save & continue</button></div></div><section class="moment-live-preview" aria-label="Live estimates"><div id="moment-live-results" aria-live="polite">${momentsLivePreviewMarkup(state, items)}</div><p class="help moment-live-note">Each dot is one possible occasion. Estimates start today and are rounded down; plans and circumstances change.</p></section></div>`;
}
export function momentsPickerMarkup(state, picker, guided) {
  const items = picker?.items || [];
  return '<section class="moment-picker panel" id="moment-picker"><h2>Choose a few things you love.</h2><p class="help">Think of the trips, traditions, and people you want to keep making room for. Choose several, then enter how often each happens: for example, 5 occasions every 1 year, or 1 every 3 years.</p><div class="moment-examples" aria-label="Choose meaningful experiences">' + MOMENT_EXAMPLES.map((name, index) => {
    const selected = items.some(item => item.name === name);
    return '<button type="button" class="subtle" data-moment-example="' + index + '" aria-pressed="' + selected + '" ' + (index >= 6 && !picker?.expanded && !selected ? 'hidden' : '') + '>' + (selected ? '<span aria-hidden="true">&#10003; </span>' : '') + esc(name) + '</button>';
  }).join('') + '</div><div class="moment-picker-options"><button class="subtle" id="moment-more-ideas" aria-expanded="' + Boolean(picker?.expanded) + '">' + (picker?.expanded ? 'Fewer ideas' : 'More ideas…') + '</button><button class="subtle" id="moment-own">+ Add your own</button></div><div class="actions"><button class="primary" id="moment-review" ' + (items.length ? '' : 'disabled') + '>Review selected (' + items.length + ')</button></div></section>' + savedMomentsMarkup(state, guided) + momentNavigationMarkup(state, guided);
}
export function momentsEditorMarkup(state, draft, guided) {
  const value = draft || { name: '', times: 1, years: 1 };
  return '<div class="moments-workspace"><div class="moments-controls"><section class="panel"><form id="moment-form"><label>Something you love<input name="name" maxlength="80" required placeholder="e.g. Swimming in the ocean" value="' + esc(value.name) + '"></label>' + momentFrequencyMarkup(value) + momentAgeMarkup(state, value) + '<p class="help">Use your reference age, or uncheck it to choose an end age for this activity.</p><p class="error" role="alert"></p><div class="actions"><button class="primary" type="submit">' + (guided ? 'Save & continue' : 'Save reflection') + '</button>' + (guided ? '<button type="submit" name="another" value="yes">Save & add another</button>' : '<button type="button" id="moment-editor-own">+ Add another experience</button>') + '</div></form></section>' + savedMomentsMarkup(state, guided) + momentNavigationMarkup(state, guided) + '</div><section class="occasion-result" id="occasion-result" role="status" aria-live="polite" aria-atomic="true">' + occasionResultMarkup(state, value) + '</section></div>';
}
export function occasionBatchResultMarkup(state, item) {
  try {
    const count = estimateOccasions(state.birthday, Number(state.lifespan), item);
    return occasionCountMarkup(count) + occasionDotsMarkup(count);
  } catch (error) { return '<p class="help">' + esc(error.message) + '</p>'; }
}
export function momentsBatchMarkup(state, items, guided) {
  return '<section class="moment-batch"><div class="moment-batch-heading"><h2>Make these estimates yours.</h2><p class="help">Enter the number of occasions and how many years between them: 5 every 1 year, or 1 every 3 years. Change individual end ages if you like.</p></div><form id="moment-batch-form"><div class="moment-batch-list">' + items.map(item => '<fieldset class="moment-batch-row" data-batch-id="' + esc(item.id) + '"><legend>' + esc(item.name || 'Your own experience') + '</legend><div class="moment-batch-fields"><label>Something you love<input name="name" maxlength="80" required value="' + esc(item.name) + '"></label>' + momentFrequencyMarkup(item) + momentAgeMarkup(state, item) + '<button type="button" class="subtle" data-batch-remove="' + esc(item.id) + '" aria-label="Remove ' + esc(item.name) + ' from selection">Remove from selection</button></div><div class="moment-batch-preview" role="status" aria-live="polite">' + occasionBatchResultMarkup(state, item) + '</div></fieldset>').join('') + '</div><p class="help">Each dot is one possible future occasion. Estimates start today, at your chosen frequency, and are rounded down.</p><p class="error" role="alert"></p><div class="actions"><button type="button" id="moment-choose-again">Back to ideas</button><button type="button" id="moment-batch-own">+ Add your own</button><button class="primary" type="submit">' + (guided ? 'Save all & continue' : 'Save all') + '</button></div></form></section>' + momentNavigationMarkup(state, guided);
}

export function momentsCollectionMarkup(state) {
  const entries = state.moments || [];
  if (!entries.length) return '<section class="moments-empty panel"><div class="eyebrow">Make room for what you love</div><h2>What would you like more of?</h2><p class="help section-gap">Ocean swims, family holidays, seeing a faraway friend. Choose something meaningful and see how many more occasions you could make room for.</p><button class="primary section-gap" id="first-moment">+ Add experiences</button></section>';
  return `<section class="moments-collection" aria-label="Your meaningful occasions">${entries.map(item => {
    const count = estimateOccasions(state.birthday, Number(state.lifespan), item);
    return `<article class="occasion-row" aria-label="${esc(item.name)}"><div class="occasion-identity"><h2>${esc(item.name)}</h2><p class="help">${frequencyLabel(item)} &middot; Until age ${occasionEndAge(state.lifespan, item)}</p></div><div class="occasion-visual">${occasionDotsMarkup(count)}</div><div class="occasion-total">${occasionCountMarkup(count)}<div class="actions occasion-actions"><button class="subtle" data-moment-edit="${esc(item.id)}" aria-label="Edit ${esc(item.name)}">Edit</button><button class="subtle" data-moment-remove="${esc(item.id)}" aria-label="Remove ${esc(item.name)}">Remove</button></div></div></article>`;
  }).join('')}</section><div class="moments-guidance"><p class="help">Each dot is one possible occasion, estimated at your chosen frequency until the age shown for that activity.</p><details><summary>How estimates work</summary><p class="help">Estimates use the time from today to each activity’s chosen end age, multiplied by your chosen frequency and rounded down. They count future possibilities, without assuming past experiences or scheduled dates. Plans and circumstances change; end ages are planning horizons. By default, activities follow your reference age as it changes. A custom end age stays fixed until you edit it. Each row shows up to 120 dots, with any remaining count stated alongside. Colours reflect the number of occasions: coral for 0–12, amber for 13–36, and green for 37 or more. They show scarcity, not urgency or the value of an experience.</p></details></div>`;
}

export function momentsWidgetMarkup(state) {
  const entries = state.moments || [];
  return `<section class="widget-moments"><div class="widget-moments-toolbar"><p class="help">One dot = one possible occasion.</p><button id="widget-manage-experiences">Manage experiences ↗</button></div><div class="widget-moments-list">${entries.length ? entries.map(item => {
    const count = estimateOccasions(state.birthday, Number(state.lifespan), item);
    return `<article class="widget-occasion-row" aria-label="${esc(item.name)}"><div class="occasion-identity"><h2>${esc(item.name)}</h2><p class="help">${frequencyLabel(item)} · Until age ${occasionEndAge(state.lifespan, item)}</p></div><div class="occasion-visual">${occasionDotsMarkup(count)}</div>${occasionCountMarkup(count)}</article>`;
  }).join('') : '<div class="occasion-empty"><h2>Make room for what you love.</h2><p>Add experiences in What matters in the full app, then see your dots and counts here.</p></div>'}</div></section>`;
}
