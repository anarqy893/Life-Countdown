import { defaults, today, addYears, dateValue, civilNow, periodFor, calculate, countdownParts, COUNTDOWN_FORMATS, squareSegments, weeklyHours, validateSchedule } from './model.mjs';
import { HOURLY_EFFECTS, isHourlyBoundary } from './hourly.mjs';
import { timelineMarkup, fitTimeline } from './timeline.mjs';
import { MOMENT_EXAMPLES, estimateOccasions, momentsEditorMarkup, occasionResultMarkup, momentsCollectionMarkup, momentsPickerMarkup, momentsBatchMarkup, occasionBatchResultMarkup, momentsLiveMarkup, momentsLivePreviewMarkup, momentsWidgetMarkup } from './moments.mjs';

const root = document.querySelector('#app');
const isWidget = new URLSearchParams(location.search).has('widget');
if (isWidget) {
  document.documentElement.classList.add('widget-mode');
  document.body.classList.add('widget-mode');
}
const number = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 });
const integer = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const safeColor = color => /^#[0-9a-f]{6}$/i.test(color) ? color : '#9cae9a';
const clone = value => structuredClone(value);
const uid = () => crypto.randomUUID();
const fmtDate = value => new Date(dateValue(value)).toLocaleDateString(undefined, { timeZone: 'UTC', year: 'numeric', month: 'short', day: 'numeric' });
let state, page = 'overview';
let replayStep = null;
let guideHoursDraft = null;
let guideActivitiesDraft = [];
let momentDraft = null;
let momentPicker = null;
const guideStep = () => replayStep || state.onboardingStep;
const guidePending = () => guideStep() && guideStep() !== 'done';
const setupRequired = () => Boolean(state.onboardingStep && state.onboardingStep !== 'done');
let noticeTimeout;
let gridObserver;
let widgetSettingsOpen = false;
let widgetExpanded = false;
let widgetGridTransition = Promise.resolve();
let counterDragging = false;
let previousHourlyTick = new Date();
let effectAnimations = [], effectOverlay, pendingEffectPreview;
let effectPlaying = false;
let previewSequence = 0;
let effectRun = 0;

async function previewHourlyEffect(effect) {
  const sequence = ++previewSequence;
  if (widgetSettingsOpen) await toggleWidgetAppearance(false);
  if (effect === 'off') { await playHourlyEffect(effect); return; }
  // Paint the countdown view before starting its preview.
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  if (sequence === previewSequence) playHourlyEffect(effect);
}

async function playHourlyEffect(effect) {
  const run = ++effectRun;
  effectAnimations.forEach(animation => animation.cancel());
  effectOverlay?.remove();
  effectAnimations = []; effectPlaying = false;
  const widget = document.querySelector('.widget');
  const counter = widget?.querySelector('[data-clock]');
  if (!widget || !counter || !HOURLY_EFFECTS.includes(effect) || effect === 'off') {
    if (isWidget) await window.desktop.desktopEffect('off');
    return;
  }
  effectPlaying = true;
  const rect = counter.getBoundingClientRect();
  await window.desktop.desktopEffect(effect, { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 });
  if (run !== effectRun || !counter.isConnected) { if (run === effectRun) effectPlaying = false; return; }
  effectOverlay = document.createElement('span');
  effectOverlay.className = `hourly-overlay hourly-${effect}`;
  effectOverlay.setAttribute('aria-hidden', 'true');
  widget.append(effectOverlay);
  effectPlaying = true;
  const options = { duration: 2000, easing: 'ease-in-out', iterations: 3 };
  if (effect === 'pulse') {
    effectAnimations.push(effectOverlay.animate([{ opacity: 0 }, { opacity: .9, offset: .45 }, { opacity: 0 }], options));
    effectAnimations.push(counter.animate([{ filter: 'brightness(1)' }, { filter: 'brightness(1.6)', offset: .45 }, { filter: 'brightness(1)' }], options));
  } else {
    effectAnimations.push(effectOverlay.animate([
      { transform: 'translateX(-110%)', opacity: 0 },
      { transform: 'translateX(-55%)', opacity: .65, offset: .25 },
      { transform: 'translateX(55%)', opacity: .65, offset: .75 },
      { transform: 'translateX(110%)', opacity: 0 }
    ], options));
  }
  // Animate the counter container so the shine survives the digits updating each second.
  const normal = getComputedStyle(counter);
  const resting = { color: normal.color, textShadow: normal.textShadow };
  effectAnimations.push(counter.animate([
    resting,
    { color: '#b9ff87', textShadow: '0 0 5px #b9ff87, 0 0 14px #76ef65b3', offset: .45 },
    resting
  ], options));
  const currentOverlay = effectOverlay;
  Promise.allSettled(effectAnimations.map(animation => animation.finished)).then(() => {
    if (effectOverlay === currentOverlay) { effectPlaying = false; currentOverlay.remove(); }
  });
}
function checkHourlyEffect() {
  if (!isWidget) return;
  const now = new Date();
  const boundary = isHourlyBoundary(previousHourlyTick, now);
  previousHourlyTick = now;
  if (boundary) playHourlyEffect(state.hourlyEffect);
}

function notify(message) {
  const notice = document.querySelector('#notice');
  notice.textContent = message; notice.classList.add('visible');
  clearTimeout(noticeTimeout); noticeTimeout = setTimeout(() => notice.classList.remove('visible'), 3500);
}
async function save(next, message = 'Saved on this computer') {
  const previous = state;
  state = next;
  try { await window.desktop.save(next); }
  catch (error) { if (state === next) state = previous; throw error; }
  render();
  if (message) notify(message);
}
function clockMarkup(end) {
  return countdownParts(end, state.countdownFormat).map(([unit, value]) => `<span class="clock-part"><b>${state.countdownFormat === 'days' && ['minutes', 'seconds'].includes(unit) ? String(value).padStart(2, '0') : integer.format(value)}</b><small>${unit}</small></span>`).join('');
}
function clockButton(end) {
  return `<button type="button" class="countdown countdown-toggle" data-clock data-format="${state.countdownFormat}" title="Click to change format" aria-label="Countdown: click to change format">${clockMarkup(end)}</button>`;
}
function bindClock() {
  document.querySelectorAll('[data-clock]').forEach(button => button.onclick = async () => {
    const next = clone(state);
    next.countdownFormat = COUNTDOWN_FORMATS[(COUNTDOWN_FORMATS.indexOf(state.countdownFormat) + 1) % COUNTDOWN_FORMATS.length];
    try { await save(next, ''); } catch (error) { notify(error.message); }
  });
}
function updateClocks() {
  const period = periodFor(state);
  if (period) document.querySelectorAll('[data-clock]').forEach(node => { node.innerHTML = clockMarkup(period.end); });
  fitCounterStrip();
}
function fitCounterStrip() {
  if (!isWidget || !state.widgetCounterOnly) return;
  const strip = document.querySelector('.widget-minimal');
  if (strip) window.desktop.fitWidgetCounter(Math.ceil(strip.getBoundingClientRect().width));
}
function bindWidgetDragging() {
  const button = document.querySelector('.widget');
  if (!button) return;
  let start, dragged = false;
  button.onpointerdown = event => {
    if (event.button !== 0 || !event.isPrimary) return;
    const control = event.target.closest('button, input, select, textarea, a');
    if (control && !control.matches('[data-clock]')) { dragged = false; return; }
    start = { x: event.screenX, y: event.screenY };
    dragged = false; counterDragging = true;
    try { (control || button).setPointerCapture(event.pointerId); } catch {}
    window.desktop.startCounterDrag(start);
  };
  button.onpointermove = event => {
    if (!start) return;
    const point = { x: event.screenX, y: event.screenY };
    if (Math.hypot(point.x - start.x, point.y - start.y) >= 4) dragged = true;
    if (dragged) window.desktop.moveCounterDrag(point);
  };
  const finish = () => {
    if (!start) return;
    start = null; counterDragging = false;
    window.desktop.endCounterDrag();
  };
  button.onpointerup = finish;
  button.onpointercancel = finish;
  button.onlostpointercapture = finish;
  button.addEventListener('click', event => {
    if (dragged && event.detail !== 0) {
      event.preventDefault(); event.stopImmediatePropagation();
    }
    dragged = false;
  }, true);
}
function refreshTime() {
  // Recalculate from the current clock, never from a count of timer ticks.
  // Leave settings forms intact so waking the computer cannot discard edits.
  if (isWidget) {
    if (counterDragging || effectPlaying || document.activeElement?.matches('[data-opacity]')) updateClocks();
    else renderWidget();
  }
  else if (page === 'overview' || page === 'moments' && !momentDraft && !momentPicker) {
    const gridScroll = document.querySelector('.grid-wrap')?.scrollTop || 0;
    render();
    const grid = document.querySelector('.grid-wrap');
    if (grid) grid.scrollTop = gridScroll;
  }
}
function render() {
  if (isWidget) return renderWidget();
  const momentsPageScroll = document.querySelector('.guide-moments')?.parentElement.scrollTop;
  const previousLegend = document.querySelector('.legend');
  const legendScrollTop = previousLegend?.scrollTop || 0;
  const focusedGroup = previousLegend?.contains(document.activeElement) ? document.activeElement.dataset.group : null;
  if (setupRequired()) page = state.onboardingStep === 'welcome' ? 'overview' : 'guide';
  gridObserver?.disconnect();
  // The introduction remains the welcome screen even after dates have been saved.
  const period = page === 'overview' && guideStep() === 'welcome' ? null : periodFor(state);
  const splitOverview = page === 'overview' && period && state.overviewLayout !== 'classic';
  const guideGrid = page === 'guide' && ['example', 'calendar', 'allocations'].includes(guideStep());
  root.innerHTML = `<div class="layout ${!setupRequired() && !state.navigationExpanded ? 'nav-collapsed' : ''} ${setupRequired() ? 'setup-layout' : ''} ${page === 'overview' && period ? `overview-layout ${splitOverview ? 'split-overview' : ''}` : guideGrid ? 'guide-layout' : page === 'guide' ? 'guide-simple-layout' : ''}">
    ${setupRequired() ? '' : `<aside class="sidebar">
      <div class="sidebar-navigation">
      <div class="brand"><span>◷</span> Life Countdown</div>
      <div><div class="nav-label">Your time</div><nav class="period-list" aria-label="Time periods">
        <button class="period-button ${state.selected === 'life' && page === 'overview' ? 'active' : ''}" data-period="life">My life</button>
        <button class="period-button ${page === 'moments' ? 'active' : ''}" id="what-matters">What matters</button>
        ${state.periods.map(p => `<button class="period-button ${state.selected === p.id && page === 'overview' ? 'active' : ''}" data-period="${esc(p.id)}">${esc(p.name)}</button>`).join('')}
        <button class="period-button muted" id="add-period">+ Add a time period</button>
      </nav></div>
      <div><div class="nav-label">Make it yours</div><nav class="period-list" aria-label="Settings"><button class="period-button ${page === 'settings' ? 'active' : ''}" id="settings">Your time</button><button class="period-button ${page === 'appearance' ? 'active' : ''}" id="appearance">Widget appearance</button><button class="period-button ${page === 'help' ? 'active' : ''}" id="help">Help & tour</button>${guidePending() && page !== 'guide' ? '<button class="period-button" id="resume-guide">Continue setup →</button>' : ''}</nav></div>
      </div>
      <footer><p>A little perspective, every day.<br>Stored on this computer.</p>
        <button class="widget-launch" id="open-widget" aria-label="Open countdown widget">
          <svg class="widget-launch-icon" aria-hidden="true" width="28" height="28" viewBox="0 0 28 28" fill="none"><rect x="3" y="5" width="22" height="18" rx="4" stroke="currentColor" stroke-width="1.5"/><path d="M3 11h22M8 16h4m4 0h4M8 19h7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
          <span class="widget-launch-copy"><strong>Open widget</strong><small>Your countdown, nearby</small></span><span class="widget-launch-arrow" aria-hidden="true">↗</span>
        </button>
      </footer>
    </aside>`}
    <main class="content">${page === 'guide' ? guideMarkup() : page === 'help' ? helpMarkup() : page === 'appearance' ? `<header class="topline"><div><div class="eyebrow">Make it yours</div><h1>Widget appearance</h1><p class="help">Make the reminder comfortable to keep nearby.</p></div></header>${appearancePanel()}` : page === 'settings' ? settingsMarkup() : page === 'moments' ? momentsPageMarkup() : overviewMarkup(period)}</main>
  </div>`;
  if (page === 'overview' && period) arrangeOverview(splitOverview);
  arrangeNavigation();
  const legend = document.querySelector('.legend');
  if (legend) {
    legend.scrollTop = legendScrollTop;
    if (focusedGroup) [...legend.querySelectorAll('[data-group]')].find(button => button.dataset.group === focusedGroup)?.focus({ preventScroll: true });
  }
  document.querySelectorAll('[data-period]').forEach(button => button.onclick = () => navigatePage('overview', button.dataset.period));
  document.querySelector('#settings')?.addEventListener('click', () => navigatePage('settings'));
  document.querySelector('#appearance')?.addEventListener('click', () => navigatePage('appearance'));
  document.querySelector('#help')?.addEventListener('click', () => navigatePage('help'));
  document.querySelector('#what-matters')?.addEventListener('click', () => { momentDraft = null; momentPicker = null; navigatePage('moments'); });
  document.querySelector('#resume-guide')?.addEventListener('click', () => navigatePage('guide'));
  document.querySelector('#add-period')?.addEventListener('click', () => openPeriod());
  document.querySelector('#open-widget')?.addEventListener('click', () => window.desktop.openWidget());
  bindGridView();
  if (page === 'guide') bindGuide();
  else if (page === 'help') bindHelp();
  else if (page === 'appearance') bindAppearance();
  else if (page === 'moments') bindMoments(false);
  else if (page === 'settings') bindSettings();
  else {
    bindClock();
    bindLegend();
    document.querySelector('#setup')?.addEventListener('click', () => goGuide('example'));
    document.querySelector('#edit-period')?.addEventListener('click', () => openPeriod(period));
    document.querySelector('#delete-period')?.addEventListener('click', () => deletePeriod(period));
    if (document.querySelector('#grid')) drawCurrentGrid(period);
  }
  if (momentsPageScroll !== undefined && document.querySelector('.guide-moments')) {
    document.querySelector('.guide-moments').parentElement.scrollTop = momentsPageScroll;
  }
}
function arrangeOverview(split) {
  const content = document.querySelector('main.content'), header = content.querySelector('.topline');
  header.insertAdjacentHTML('beforeend', `<div class="layout-switch" role="group" aria-label="Overview layout"><button data-overview-layout="split" aria-pressed="${split}">52-week layout</button><button data-overview-layout="classic" aria-pressed="${!split}">Original layout</button></div>`);
  document.querySelectorAll('[data-overview-layout]').forEach(button => { button.onclick = async () => {
    const next = clone(state); next.overviewLayout = button.dataset.overviewLayout;
    try { await save(next, ''); } catch (error) { notify(error.message); }
  }; });
  if (!split) return;
  const summary = document.createElement('section');
  summary.className = 'overview-summary'; summary.setAttribute('aria-label', 'Countdown and time totals');
  const chart = document.createElement('section');
  chart.className = 'overview-chart'; chart.setAttribute('aria-label', 'Your weeks');
  summary.append(content.querySelector('.countdown-card'), content.querySelector('.stats'), content.querySelector(':scope > p.help'));
  chart.append(content.querySelector('.grid-view-switch'), content.querySelector('.time-chart'));
  content.append(summary, chart);
}
async function navigatePage(destination, periodId) {
  page = destination;
  const next = clone(state); next.navigationExpanded = false;
  if (periodId) { next.selected = periodId; if (periodId === 'life') next.gridView = 'allocations'; }
  try {
    if (state.navigationExpanded || periodId) await save(next, '');
    else render();
    document.querySelector('.sidebar .period-button.active')?.focus({preventScroll:true});
  } catch (error) { render(); notify(error.message); }
}
function arrangeNavigation() {
  const sidebar = document.querySelector('.sidebar');
  if (!sidebar) return;
  sidebar.insertAdjacentHTML('afterbegin', `<button class="navigation-toggle" id="navigation-toggle" aria-expanded="${Boolean(state.navigationExpanded)}" aria-label="${state.navigationExpanded ? 'Collapse' : 'Expand'} navigation" title="${state.navigationExpanded ? 'Collapse' : 'Expand'} navigation"><span aria-hidden="true">☰</span><span class="navigation-toggle-label">Collapse navigation</span></button>`);
  document.querySelector('#navigation-toggle').onclick = async () => {
    const next = clone(state); next.navigationExpanded = !state.navigationExpanded;
    try { await save(next, ''); } catch (error) { notify(error.message); }
  };
  const shortcuts = { life: 'L', 'what-matters': '♥', five: '5y', decade: '10y', settings: 'T', appearance: '◐', help: '?', 'add-period': '+' };
  sidebar.querySelectorAll('.period-button').forEach(button => {
    const label = button.textContent.trim(), key = button.dataset.period || button.id;
    button.title = label; button.setAttribute('aria-label', label);
    const shortcut = document.createElement('span'); shortcut.className = 'navigation-shortcut';
    shortcut.setAttribute('aria-hidden', 'true'); shortcut.textContent = shortcuts[key] || label.slice(0, 2);
    button.prepend(shortcut);
  });
}
async function goGuide(step) {
  if (['widget', 'done'].includes(step) && setupRequired() && !state.setupHoursConfirmed) {
    notify('Enter your sleep and work hours before finishing setup.');
    step = 'allocations';
  }
  const previousPage = page, previousReplay = replayStep;
  page = step === 'done' || step === 'welcome' ? 'overview' : 'guide';
  try {
    if (replayStep) { replayStep = step === 'done' ? null : step; render(); }
    else {
      const next = clone(state); next.onboardingStep = step;
      if (step === 'done') next.gridView = 'allocations';
      await save(next, '');
    }
    document.querySelector('main h1')?.focus({ preventScroll: true });
  } catch (error) { page = previousPage; replayStep = previousReplay; render(); notify(error.message); }
}
function profileForm(guided = false) {
  return `<form id="profile-form"><label>Birthday<input type="date" name="birthday" required max="${today()}" min="1900-01-01" value="${esc(state.birthday)}"></label><label>Reference age in years<input type="number" name="lifespan" required min="1" max="130" step="1" value="${state.lifespan}"></label><p class="help">A planning horizon you can change, rather than a prediction of how long you’ll live.</p><p class="error" role="alert"></p><button class="primary" type="submit">${guided ? 'Show my calendar' : 'Save life horizon'}</button></form>`;
}
function bindProfile(guided = false) {
  document.querySelector('#profile-form').onsubmit = async event => {
    event.preventDefault(); const form = event.currentTarget;
    try {
      const data = new FormData(form), next = clone(state);
      next.birthday = data.get('birthday'); next.lifespan = Number(data.get('lifespan'));
      dateValue(next.birthday);
      if (dateValue(next.birthday) > dateValue(today())) throw new Error('Your birthday must be today or earlier.');
      if (!Number.isInteger(next.lifespan) || next.lifespan < 1 || next.lifespan > 130) throw new Error('Choose a reference age between 1 and 130.');
      next.selected = 'life';
      if (guided && !replayStep) next.onboardingStep = 'calendar';
      await save(next, '');
      if (guided) { if (replayStep) replayStep = 'calendar'; page = 'guide'; }
      else page = 'overview';
      render();
    } catch (error) { (document.querySelector('#profile-form .error') || form.querySelector('.error')).textContent = error.message; }
  };
}
function guideActivityInputs() {
  return [...state.categories, ...guideActivitiesDraft].map(c => {
    const added = guideActivitiesDraft.some(item => item.id === c.id);
    const value = guideHoursDraft?.[c.id] ?? (replayStep || state.setupHoursConfirmed ? (scheduleAt(today()).hours[c.id] ?? 0) : '');
    const hours = `<label>${added ? 'Hours per week' : `${esc(c.name)} · hours per ${c.unit === 'night' ? 'night' : 'week'}`}<input type="number" data-guide-hours name="${esc(c.id)}" ${['sleep', 'work'].includes(c.id) ? 'required' : ''} min="0" max="${c.unit === 'night' ? 24 : 168}" step="0.1" placeholder="${c.id === 'sleep' ? 'e.g. 8' : c.id === 'work' ? 'e.g. 40' : '0'}" value="${esc(value)}" aria-describedby="guide-error-${esc(c.id)}"><span class="field-error" id="guide-error-${esc(c.id)}" data-guide-error="${esc(c.id)}" aria-live="polite"></span></label>`;
    return added ? `<div class="guide-extra-activity"><label>Activity name<input data-guide-name="${c.id}" value="${esc(c.name)}" maxlength="40" placeholder="e.g. Exercise"></label>${hours}<label>Colour<input type="color" data-guide-color="${c.id}" value="${safeColor(c.color)}"></label><button type="button" class="subtle" data-guide-remove="${c.id}" aria-label="Remove activity">×</button></div>` : hours;
  }).join('');
}
function guideMarkup() {
  const step = guideStep() === 'welcome' ? 'profile' : guideStep();
  const steps = ['example', 'profile', 'calendar', 'allocations', 'moments', 'widget'];
  const progress = `<ol class="guide-progress" aria-label="Setup progress">${['The bigger picture', 'Your dates', 'Your weeks', 'Your time', 'What matters', 'Your widget'].map((label, i) => `<li ${steps[i] === step ? 'aria-current="step"' : ''}>${i + 1}. ${label}</li>`).join('')}</ol>`;
  if (step === 'example') return `${progress}<header class="guide-header"><div class="eyebrow">Step back for a moment</div><h1 tabindex="-1">This is a whole life.</h1><p class="help">A lifetime can feel almost endless. Here it fits on one screen. Each row is a year, shown as 52 week blocks.</p></header><div class="actions guide-actions"><button data-guide-back="welcome">Back</button><button class="primary" id="guide-personalize">Where am I in this picture?</button></div>${timelineMarkup({ birthday: '2000-01-01' }, { id: 'life', start: '2000-01-01', end: '2090-01-01' }, { example: true })}`;
  if (step === 'moments') return `${progress}<section class="guide-moments"><header class="guide-header"><h1 tabindex="-1">There’s more to look forward to than a number of years.</h1><p class="help">See what your years ahead could hold when you count the experiences that matter to you.</p><p class="help moment-location-hint">You can revisit your saved reflections anytime in What matters.</p></header>${momentEntryMarkup(true)}</section>`;
  if (step === 'profile') return `${progress}<section class="guide-profile"><div class="eyebrow">Make the picture yours</div><h1 tabindex="-1">Where are you in your life?</h1><p class="help section-gap">Enter your birthday and choose a reference age. Your information stays on this computer.</p><div class="panel section-gap">${profileForm(true)}</div><button data-guide-back="example">Back</button></section>`;
  if (step === 'widget') return `${progress}<section class="guide-widget"><div class="eyebrow">Keep the perspective nearby</div><h1 tabindex="-1">There is still a life ahead of you.</h1><p class="help section-gap">What would you like to give more of it to? Keep a little perspective nearby with your desktop countdown. Show it when you’re ready, then drag it somewhere comfortable.</p><div class="widget-lessons"><p><strong>Drag to move</strong><span>Use the background or the numbers.</span></p><p><strong>Click the numbers</strong><span>Cycle through calendar time, days, weeks, hours, and seconds.</span></p><p><strong>Gear for appearance</strong><span>Adjust the background and try an optional hourly effect.</span></p></div><div class="panel section-gap"><h2>Find it beside your Windows clock</h2><p class="help section-gap">Minimizing the full app keeps it on your taskbar. Closing it leaves Life Countdown running in the system tray beside the Windows clock. The widget stays out of the taskbar. Click the green clock icon to show the widget; right-click to open the full app or quit. Look under ^ if Windows hides the icon.</p></div><div class="actions guide-actions"><button data-guide-back="moments">Back</button><button class="primary" id="guide-show-widget">Show my widget</button><button id="guide-finish">Finish setup</button></div><p class="help section-gap">You can open the widget later from the sidebar. Find more controls in Help & tour, and Windows startup in Widget appearance.</p></section>`;
  const period = periodFor({ ...state, selected: 'life' });
  const allocations = step === 'allocations';
  return `${progress}<header class="guide-header"><h1 tabindex="-1">${allocations ? 'Your everyday choices give time its shape.' : 'And this is where you are.'}</h1><p class="help">${allocations ? 'Enter your average sleep and work hours, including zero if appropriate. Watch how those commitments fill the time ahead.' : 'Grey weeks are already lived. The highlighted square is the present. What would you like to make room for? Your reference age is a planning horizon you can change.'}</p></header>
    <div class="guide-workspace"><aside class="guide-controls" aria-label="${allocations ? 'Your time allocations' : 'Read your weeks'}">
    ${allocations ? `<form id="guide-hours" class="guide-hours"><div class="guide-activity-list">${guideActivityInputs()}</div><button type="button" class="subtle guide-add-activity" id="guide-add-activity">+ Add another activity</button><p class="help" id="guide-total" role="status"></p><p class="error" role="alert"></p><div class="actions"><button type="button" data-guide-back="calendar">Back</button><button class="primary" type="submit">Save & continue</button></div></form><p class="help guide-explainer">Watch your time take shape as you enter hours.</p><details class="guide-reading"><summary>How to read this</summary><p class="help">Colours collect equivalent hours, rather than calendar weeks spent entirely on one activity. The age-equivalent ruler measures the amount of time, not when activities happen. Empty time may contain other commitments. Enjoying life, resting, and caring for others all count.</p></details>` : '<section class="guide-grid-key" aria-labelledby="guide-grid-key-title"><h2 id="guide-grid-key-title">Reading your grid</h2><dl><div><dt>The scale</dt><dd>One row is one year, with 52 week blocks across.</dd></div><div><dt><i class="guide-present-sample" aria-hidden="true"></i>You are here</dt><dd>The amber outline marks the present. Empty squares are time still ahead.</dd></div><div><dt>Possible chapters</dt><dd>The bands show paths life might take. They are examples, not predictions.</dd></div></dl></section><div class="actions guide-actions"><button data-guide-back="profile">Back</button><button class="primary" id="guide-allocate">Explore your time</button></div>'}
    </aside><div class="guide-chart">${allocations ? chartMarkup(calculate(state, period), { stable: true }) : timelineMarkup(state, period)}</div></div>`;

}
function momentEntryMarkup(guided) {
  if (guided) return momentsLiveMarkup(state, momentPicker);
  if (momentDraft) return momentsEditorMarkup(state, momentDraft, guided);
  if (momentPicker?.reviewing) return momentsBatchMarkup(state, momentPicker.items, guided);
  return momentsPickerMarkup(state, momentPicker, guided);
}
function momentsPageMarkup() {
  const editing = momentDraft || momentPicker;
  return '<header class="topline"><div><div class="eyebrow">Make room for what you love</div><h1>What matters</h1><p class="help">' + (editing ? 'Choose meaningful experiences, then make the estimates yours.' : 'Your possibilities ahead, with a horizon for each activity.') + '</p></div>' + (editing ? '' : '<button class="primary" id="add-moment">+ Add experiences</button>') + '</header>' + (editing ? momentEntryMarkup(false) : momentsCollectionMarkup(state));
}
function readMomentFields(container, previous = {}) {
  const input = name => container.querySelector('[name="' + name + '"]');
  return { id: previous.id || uid(), name: input('name').value, times: input('times').value, years: input('years').value, untilAge: input('useReferenceAge').checked ? null : input('untilAge').value };
}
function syncMomentControls(container) {
  const input = name => container.querySelector('[name="' + name + '"]');
  container.querySelector('[data-frequency-times]').textContent = Number(input('times').value) === 1 ? 'time' : 'times';
  container.querySelector('[data-frequency-years]').textContent = Number(input('years').value) === 1 ? 'year' : 'years';
  const useReference = input('useReferenceAge').checked;
  input('untilAge').disabled = useReference;
  if (useReference) input('untilAge').value = state.lifespan;
}
function validateMomentDraft(draft) {
  const entry = { ...draft, name: draft.name.trim(), times: Number(draft.times), years: Number(draft.years), untilAge: draft.untilAge == null ? null : Number(draft.untilAge) };
  if (!entry.name) throw new Error('Enter something you would like to make room for.');
  estimateOccasions(state.birthday, Number(state.lifespan), entry);
  return entry;
}
async function saveMomentEntries(entries, guided, another = false, replace = false) {
  const next = clone(state), ids = new Set(entries.map(item => item.id));
  next.moments = replace ? entries : [...(next.moments || []).filter(item => !ids.has(item.id)), ...entries];
  const previousDraft = momentDraft, previousPicker = momentPicker;
  momentDraft = null; momentPicker = null;
  try { await save(next, ''); }
  catch (error) { momentDraft = previousDraft; momentPicker = previousPicker; throw error; }
  if (guided && !another) {
    await goGuide('widget');
    notify('Saved. Revisit your reflections anytime in What matters.');
  } else { notify(entries.length === 1 ? 'Reflection saved.' : 'Reflections saved.'); }
}
function bindMoments(guided) {
  if (guided && !momentPicker) momentPicker = { items: clone(state.moments || []), expanded: false, reviewing: false };
  document.querySelector('#moment-skip')?.addEventListener('click', () => { momentDraft = null; momentPicker = null; goGuide('widget'); });
  document.querySelector('#moments-back')?.addEventListener('click', () => { momentDraft = null; momentPicker = null; render(); });
  document.querySelectorAll('[data-moment-edit]').forEach(button => button.onclick = () => {
    momentPicker = null;
    momentDraft = clone(state.moments.find(item => item.id === button.dataset.momentEdit));
    render(); document.querySelector('#moment-form input')?.focus();
  });
  document.querySelectorAll('[data-moment-remove]').forEach(button => button.onclick = async () => {
    const next = clone(state);
    next.moments = next.moments.filter(item => item.id !== button.dataset.momentRemove);
    const previousDraft = momentDraft;
    if (momentDraft?.id === button.dataset.momentRemove) momentDraft = null;
    try { await save(next, ''); }
    catch (error) { momentDraft = previousDraft; notify(error.message); }
  });
  document.querySelectorAll('#add-moment, #first-moment').forEach(button => button.onclick = () => {
    momentDraft = null; momentPicker = { items: [], expanded: false, reviewing: false };
    render(); document.querySelector('#moment-picker h2')?.scrollIntoView({block:'nearest'});
  });
  document.querySelectorAll('[data-moment-example]').forEach(button => button.onclick = () => {
    const name = MOMENT_EXAMPLES[Number(button.dataset.momentExample)];
    const index = momentPicker.items.findIndex(item => item.name === name);
    if (index >= 0) momentPicker.items.splice(index, 1);
    else momentPicker.items.push({ id: uid(), name, times: 1, years: 1, untilAge: null });
    if (guided) {
      if (index < 0 || momentPicker.openId && !momentPicker.items.some(item => item.id === momentPicker.openId)) {
        momentPicker.openId = momentPicker.items.at(-1)?.id ?? null;
      }
    }
    render(); document.querySelector('[data-moment-example="' + button.dataset.momentExample + '"]')?.focus({preventScroll:true});
  });
  document.querySelector('#moment-more-ideas')?.addEventListener('click', () => {
    momentPicker.expanded = !momentPicker.expanded;
    render(); document.querySelector('#moment-more-ideas')?.focus({preventScroll:true});
  });
  document.querySelector('#moment-review')?.addEventListener('click', () => {
    if (!momentPicker.items.length) return;
    if (momentPicker.items.length === 1) { momentDraft = momentPicker.items[0]; momentPicker = null; }
    else momentPicker.reviewing = true;
    render(); document.querySelector('form input')?.focus({preventScroll:true});
  });
  const addOwn = () => {
    momentPicker ||= { items: [], expanded: false };
    momentPicker.items.push({ id: uid(), name: '', times: 1, years: 1, untilAge: null });
    momentPicker.reviewing = true;
    momentDraft = null;
    render(); document.querySelector('.moment-batch-row:last-child [name=name]')?.focus();
  };
  document.querySelector('#moment-own')?.addEventListener('click', addOwn);
  document.querySelector('#moment-batch-own')?.addEventListener('click', addOwn);
  document.querySelector('#moment-choose-again')?.addEventListener('click', () => { momentPicker.reviewing = false; render(); });
  document.querySelectorAll('[data-batch-remove]').forEach(button => button.onclick = () => {
    momentPicker.items = momentPicker.items.filter(item => item.id !== button.dataset.batchRemove);
    if (!momentPicker.items.length) momentPicker.reviewing = false;
    render();
  });
  const live = document.querySelector('#moment-live-form');
  if (live) {
    live.querySelectorAll('[data-live-id]').forEach(row => row.ontoggle = () => {
      if (!live.isConnected || !momentPicker) return;
      momentPicker.openId = live.querySelector('[data-live-id][open]')?.dataset.liveId ?? null;
    });
    live.addEventListener('invalid', () => {
      const invalid = [...live.querySelectorAll('input')].find(input => !input.disabled && !input.validity.valid);
      const row = invalid?.closest('[data-live-id]');
      if (row) { row.open = true; momentPicker.openId = row.dataset.liveId; }
    }, true);
    const captureLive = () => {
      momentPicker.items = [...live.querySelectorAll('[data-live-id]')].map(row => readMomentFields(row, {id:row.dataset.liveId}));
    };
    live.oninput = event => {
      const row = event.target.closest('[data-live-id]');
      if (!row) return;
      syncMomentControls(row); captureLive();
      row.querySelector('summary').textContent = row.querySelector('[name=name]').value.trim() || 'Your activity';
      live.querySelector('.error').textContent = '';
      document.querySelector('#moment-live-results').innerHTML = momentsLivePreviewMarkup(state, momentPicker.items);
    };
    live.onsubmit = async event => {
      event.preventDefault(); captureLive();
      if (!momentPicker.items.length) return;
      try { await saveMomentEntries(momentPicker.items.map(validateMomentDraft), true, false, true); }
      catch (error) { live.querySelector('.error').textContent = error.message; }
    };
    document.querySelectorAll('[data-live-remove]').forEach(button => button.onclick = () => {
      momentPicker.items = momentPicker.items.filter(item => item.id !== button.dataset.liveRemove);
      if (momentPicker.openId === button.dataset.liveRemove) momentPicker.openId = momentPicker.items.at(-1)?.id ?? null;
      render(); document.querySelector('#moment-custom-form textarea')?.focus({preventScroll:true});
    });
    const custom = document.querySelector('#moment-custom-form');
    custom.oninput = () => { momentPicker.customName = custom.elements.customName.value; custom.querySelector('.error').textContent = ''; };
    custom.onsubmit = event => {
      event.preventDefault();
      const names = custom.elements.customName.value.split(/\r?\n/).map(name => name.trim()).filter(Boolean);
      if (!names.length) { custom.querySelector('.error').textContent = 'Enter an experience to add.'; return; }
      const seen = new Set(momentPicker.items.map(item => item.name.trim().toLowerCase()));
      for (const name of names) {
        if (name.length > 80) { custom.querySelector('.error').textContent = 'Keep each experience name to 80 characters or fewer.'; return; }
        if (seen.has(name.toLowerCase())) { custom.querySelector('.error').textContent = name + ' is already selected or listed twice.'; return; }
        seen.add(name.toLowerCase());
      }
      momentPicker.items.push(...names.map(name => ({id:uid(), name, times:1, years:1, untilAge:null})));
      momentPicker.openId = momentPicker.items.at(-1).id;
      momentPicker.customName = '';
      render(); document.querySelector('#moment-custom-form textarea')?.focus({preventScroll:true});
    };
  }
  const batch = document.querySelector('#moment-batch-form');
  if (batch) {
    const captureBatch = () => {
      momentPicker.items = [...batch.querySelectorAll('[data-batch-id]')].map(row => readMomentFields(row, {id:row.dataset.batchId}));
    };
    batch.oninput = event => {
      const row = event.target.closest('[data-batch-id]');
      if (!row) return;
      syncMomentControls(row); captureBatch();
      batch.querySelector('.error').textContent = '';
      row.querySelector('.moment-batch-preview').innerHTML = occasionBatchResultMarkup(state, momentPicker.items.find(item => item.id === row.dataset.batchId));
    };
    batch.onsubmit = async event => {
      event.preventDefault(); captureBatch();
      try { await saveMomentEntries(momentPicker.items.map(validateMomentDraft), guided); }
      catch (error) { batch.querySelector('.error').textContent = error.message; }
    };
  }
  const form = document.querySelector('#moment-form');
  if (!form) return;
  document.querySelector('#moment-editor-own')?.addEventListener('click', () => {
    const current = readMomentFields(form, momentDraft);
    momentPicker = { items: [current], expanded: false, reviewing: true };
    addOwn();
  });
  form.oninput = () => {
    syncMomentControls(form);
    momentDraft = readMomentFields(form, momentDraft);
    form.querySelector('.error').textContent = '';
    document.querySelector('#occasion-result').innerHTML = occasionResultMarkup(state, momentDraft);
  };
  form.onsubmit = async event => {
    event.preventDefault(); momentDraft = readMomentFields(form, momentDraft);
    try { await saveMomentEntries([validateMomentDraft(momentDraft)], guided, event.submitter?.name === 'another'); }
    catch (error) { form.querySelector('.error').textContent = error.message; }
  };
}
function bindGuide() {
  if (guideStep() === 'moments') bindMoments(true);
  document.querySelectorAll('[data-guide-back]').forEach(button => { button.onclick = () => goGuide(button.dataset.guideBack); });
  document.querySelector('#guide-allocate')?.addEventListener('click', () => goGuide('allocations'));
  document.querySelector('#guide-personalize')?.addEventListener('click', () => goGuide('profile')); 
  document.querySelector('#guide-finish')?.addEventListener('click', () => goGuide('done'));
  document.querySelector('#guide-show-widget')?.addEventListener('click', async () => {
    try { await window.desktop.openWidget(); notify('Drag your widget to a comfortable spot. It stays available in the Windows tray.'); }
    catch (error) { notify(error.message); }
  });
  if (document.querySelector('#profile-form')) bindProfile(true);
  bindLegend();
  const form = document.querySelector('#guide-hours');
  if (form) {
    function captureDraft() {
      guideHoursDraft = Object.fromEntries([...form.querySelectorAll('[data-guide-hours]')].map(input => [input.name, input.value]));
      guideActivitiesDraft.forEach(c => {
        c.name = form.querySelector('[data-guide-name="' + c.id + '"]')?.value ?? c.name;
        c.color = form.querySelector('[data-guide-color="' + c.id + '"]')?.value ?? c.color;
      });
    }
    function draft(requireComplete = false) {
      captureDraft();
      const next = clone(state), current = clone(scheduleAt(today()));
      next.categories.push(...guideActivitiesDraft.map(c => ({ ...c, name: c.name.trim() || 'New activity' })));
      if (requireComplete && guideActivitiesDraft.some(c => !c.name.trim())) throw new Error('Name your added activity or remove it before continuing.');
      if (requireComplete) validateCategories(next.categories);
      current.start = today(); current.id = state.schedules.find(s => s.start === current.start)?.id || uid();
      let invalid = false;
      for (const input of form.querySelectorAll('[data-guide-hours]')) {
        const category = next.categories.find(c => c.id === input.name);
        const empty = input.value.trim() === '' && !input.validity.badInput;
        const message = empty ? requireComplete && input.required ? 'Enter ' + category.name.toLowerCase() + ' hours, including zero if appropriate.' : ''
          : !input.checkValidity() ? 'Enter ' + category.name.toLowerCase() + ' hours between 0 and ' + input.max + '.' : '';
        form.querySelector('[data-guide-error="' + input.name + '"]').textContent = message;
        input.setAttribute('aria-invalid', String(Boolean(message)));
        if (message) invalid = true;
        current.hours[input.name] = empty ? 0 : Number(input.value);
      }
      if (invalid) throw new Error('Check the highlighted activity hours.');
      const total = validateSchedule(next.categories, current);
      next.schedules = next.schedules.filter(s => s.start !== current.start);
      next.schedules.push(current);
      return { next, total };
    }
    form.querySelector('#guide-add-activity').onclick = () => {
      captureDraft();
      const colors = ['#89b780', '#cf8cae', '#73bdc7', '#d9c677', '#b39bd3'];
      guideActivitiesDraft.push({ id: uid(), name: '', unit: 'week', color: colors.find(color => ![...state.categories, ...guideActivitiesDraft].some(c => c.color === color)) || '#b5c4ad' });
      form.querySelector('.guide-activity-list').innerHTML = guideActivityInputs();
      form.querySelector('[data-guide-name="' + guideActivitiesDraft.at(-1).id + '"]').focus();
      preview();
    };
    form.addEventListener('click', event => {
      const button = event.target.closest('[data-guide-remove]');
      if (!button) return;
      captureDraft();
      guideActivitiesDraft = guideActivitiesDraft.filter(c => c.id !== button.dataset.guideRemove);
      form.querySelector('.guide-activity-list').innerHTML = guideActivityInputs();
      preview();
    });
    function preview() {
      captureDraft();
      try {
        const { next, total } = draft();
        form.querySelector('.error').textContent = '';
        document.querySelector('#guide-total').textContent = `${number.format(total)} of 168 weekly hours allocated · ${number.format(168 - total)} not yet allocated`;
        const chart = document.querySelector('.time-chart');
        chart.outerHTML = chartMarkup(calculate(next, periodFor({ ...next, selected: 'life' })), { stable: true });
        bindLegend(); drawGrid(calculate(next, periodFor({ ...next, selected: 'life' })));
      } catch (error) { form.querySelector('.error').textContent = error.message; document.querySelector('#guide-total').textContent = 'Adjust your hours to update the preview.'; }
    }
    form.oninput = preview;
    form.onsubmit = async event => {
      event.preventDefault();
      try {
        const { next } = draft(true);
        next.setupHoursConfirmed = true;
        if (!replayStep) next.onboardingStep = 'moments';
        const activities = guideActivitiesDraft;
        guideActivitiesDraft = [];
        try { await save(next, ''); }
        catch (error) { guideActivitiesDraft = activities; throw error; }
        if (replayStep) { replayStep = 'moments'; render(); }
      } catch (error) { document.querySelector('#guide-hours .error').textContent = error.message; }
    };
    preview();
  } else if (document.querySelector('#grid')) {
    if (document.querySelector('.timeline-grid')) observeTimeline();
    else drawGrid(calculate(state, periodFor({ ...state, selected: 'life' })));
  }
}
function helpMarkup() {
  return `<header class="topline"><div><div class="eyebrow">A little guidance, anytime</div><h1>Help & tour</h1><p class="help">Explore at your own pace. Your settings stay saved when you revisit the tour.</p></div></header><div class="actions"><button class="primary" id="start-tour">${guidePending() ? 'Continue setup' : 'Take the guided tour'}</button><button data-help-page="overview">View my calendar</button><button class="danger" id="reset-app">Reset & start fresh</button></div><div class="help-topics section-gap">
    <details open><summary>Read your life timeline</summary><p>Choose Life timeline above the grid in the full app. The expanded widget instead offers Time allocations and What matters. Rows follow actual years, with age labels down the side and week numbers across the top. The final block includes the extra one or two days of that year. Hover over a square for its dates and age. Custom periods use date labels for their year-long rows.</p><p>Grey weeks are already lived; the outlined square marks the present. Chapter bands show an illustrative path through childhood, school, training, working life, and retirement. Parenting or caregiving can overlap other chapters. These examples are not your personal history or predictions.</p><p>Your reference age is a planning horizon you can change. Time continues while the app is closed, using your computer's clock.</p></details>
    <details><summary>Make room for what matters</summary><p>After allocating your time in setup, click an example bubble to immediately see its estimated dot count. Add a custom activity inline with its name and Add. Adjust How often and Until age on the left while the dots update on the right, then Save & continue. Enter 5 times every 1 year for skiing five times a year, or 1 time every 3 years for rarer trips. When adding activities from the What matters tab, More ideas reveals the full list of 24 examples, with Review selected for adding several at once. The app estimates future occasions from today until the end age for that activity. By default, it follows your reference age. Uncheck Use my reference age to set a custom Until age, such as skiing until 65. Each dot is one possible occasion; larger estimates show the first 120 dots and the remaining count. These are possibilities at your chosen frequency, not promises or scheduled events.</p><p>Skip this optional step or save several reflections. Open What matters in the sidebar to see your reflections with their estimates and dots. Add a reflection, edit its name, frequency, or end age, or remove it there. Custom end ages stay fixed when your reference age changes; these reflections do not allocate hours or change your categories.</p></details>
    <details><summary>Read your time allocations</summary><p>Choose Time allocations to see equivalent hours grouped into categories. Each full square represents 168 hours. The top axis counts equivalent weeks; My Life has an age-equivalent reference ruler on the left. Crossed grey squares show time already lived. Colours collect future sleep, work, and other entered commitments. Empty squares show time not yet allocated; that may include commitments you have not entered.</p><p>Use Show or hide categories to change the view. Checkmarks indicate visible groups; hiding one keeps its hours and totals saved. Age-equivalent labels are a reference for the amount of time shown, not the ages when these grouped activities happen. The introduction preview keeps the same overall scale as you adjust sleep, work, and other activities.</p></details>
    <details><summary>Set your time and changing schedules</summary><p>In Your time, adjust your dates, add categories, and choose their colours. Enter sleep per night and other activities per week. Hours are averages; keep categories separate and their total within 168 hours per week.</p><p>A dated schedule change preserves earlier assumptions. For retirement, add a future change with work set to zero. Editing an existing schedule corrects that assumption.</p><button data-help-page="settings">Open Your time</button></details>
    <details><summary>Explore five years, a decade, or your own period</summary><p>Select a period in the sidebar to see its grid and countdown. Add a time period for a goal or life chapter. Each period shares your categories and schedules. Click its countdown to change the time format; the widget follows your selected period.</p><button id="help-add-period">Add a time period</button></details>
    <details><summary>Move and use your widget</summary><p>Drag the background or numbers to move it. Click the numbers without dragging to change the format. Grid expands the calendar; click again or press Escape to collapse. Counter only shrinks it to a strip; use the restore button to bring the controls back. Normal and Counter only views remember separate positions.</p><p>The ↗ arrow opens the full app. In Counter only mode, restore the controls first. The widget stays above ordinary windows and recovers its position if another window covers it.</p><button data-open-widget>Show widget</button></details>
    <details><summary>Adjust appearance and hourly reminders</summary><p>The widget’s gear opens Appearance. Background opacity fades the background while keeping numbers visible. At zero, surrounding details appear on hover or focus in the normal widget. Counter only always stays minimal.</p><p>Soft pulse and Light sweep preview when selected. On the hour they play three quiet cycles; the first spreads across the monitor’s usable desktop. Missed hours aren’t replayed. Choose Off to disable them. Back or Escape returns to the countdown.</p><button data-help-page="appearance">Open Widget appearance</button></details>
    <details><summary>Find the tray, startup, and saved settings</summary><p>The full app appears on your taskbar, including when minimized. The widget stays out of the taskbar. Closing windows leaves the app running beside the Windows clock. A one-time tray notice helps you find it. Look under ^ for the green clock icon. Click to show the widget, double-click for the full app, or right-click to show, hide, open, or quit. Launching again brings back the existing widget.</p><p>Enable Launch when I sign in to Windows in Widget appearance. After setup, normal launches open only the widget. Your data stays on this computer; there is no account or cloud sync.</p></details>
    <details><summary>Why this app exists</summary><p>In the grand scheme of my life, how much does this matter? Is this how I want to spend this moment? What deserves my attention right now?</p><p>A reminder to begin something meaningful, let a small worry go, or enjoy exactly where you are. Inspired by Tim Urban’s Your Life in Weeks and 100 Blocks a Day on Wait But Why.</p></details></div>`;
}
function bindHelp() {
  document.querySelector('#reset-app').onclick = () => {
    const node = dialog('Reset & start fresh?', '<p class="help">This clears your birthday, reference age, reflections, categories, schedules, saved periods, and widget appearance and positions, then returns to the welcome screen. The widget will close.</p><p class="help section-gap">A backup of your saved entries and widget positions is created on this computer before the reset. Your Windows sign-in startup setting stays as configured.</p>', async () => {
      const fresh = await window.desktop.reset();
      state = fresh;
      replayStep = null;
      guideHoursDraft = null;
      guideActivitiesDraft = [];
      momentDraft = null; momentPicker = null;
      page = 'overview';
      render();
      notify('Reset complete. Your previous entries were backed up on this computer.');
    });
    const submit = node.querySelector('[type=submit]');
    submit.textContent = 'Reset & start fresh';
    submit.className = 'danger';
    node.querySelector('[data-cancel]').focus();
  };
  document.querySelector('#start-tour').onclick = () => {
    guideHoursDraft = null;
    guideActivitiesDraft = [];
    momentDraft = null; momentPicker = null;
    if (!guidePending()) replayStep = 'example';
    page = 'guide'; render();
  };
  document.querySelectorAll('[data-help-page]').forEach(button => { button.onclick = () => { page = button.dataset.helpPage; render(); }; });
  document.querySelector('#help-add-period').onclick = () => openPeriod();
  document.querySelectorAll('[data-open-widget]').forEach(button => { button.onclick = () => window.desktop.openWidget(); });
}
function overviewMarkup(period) {
  if (!period) return `<section class="welcome" aria-labelledby="welcome-title">
    <div class="eyebrow">A little perspective</div>
    <h1 id="welcome-title">Keep what matters in view.</h1>
    <p>It’s easy to get absorbed in today’s demands and lose sight of the life they’re adding up to.</p>
    <p>Life Countdown puts that bigger picture on your desktop. See your life in weeks, explore where your time goes, and keep a quiet reminder nearby:</p>
    <ul class="welcome-questions" aria-label="Questions to reflect on">
      <li>In the grand scheme of my life, how much does this matter?</li>
      <li>Is this how I want to spend this moment?</li>
      <li>What deserves my attention right now?</li>
    </ul>
    <p>Sometimes these questions help you begin something you’ve been putting off. Sometimes they help you let a small worry go. Sometimes they remind you to enjoy exactly where you are.</p>
    <button class="primary" id="setup">See my life in weeks</button>
  </section>`;
  const result = calculate(state, period);
  const percent = Math.min(100, result.elapsed / result.total * 100);
  return `<header class="topline"><div><div class="eyebrow">Make room for what matters</div><h1>${esc(period.name)}</h1><p class="help">${fmtDate(period.start)} — ${fmtDate(period.end)} · ${number.format(result.total / 168)} weeks</p></div>
    ${period.id === 'life' ? '' : '<div class="actions"><button class="subtle" id="edit-period">Edit period</button><button class="subtle danger" id="delete-period">Delete</button></div>'}</header>
    <section class="countdown-card" aria-label="Countdown"><div class="countdown-head"><span class="help">${result.future > 0 ? 'Time until ' + fmtDate(period.end) : 'This period has ended'}</span><span class="date-range">Click countdown to change format</span></div>${clockButton(period.end)}</section>
    <div class="stats"><div class="stat"><span class="help">Already lived</span><strong>${number.format(result.elapsed / 168)} <small>weeks</small></strong><span class="help">${number.format(percent)}% of this period</span></div><div class="stat"><span class="help">Time ahead</span><strong>${number.format(result.future / 168)} <small>weeks</small></strong><span class="help">Before your chosen end date</span></div><div class="stat"><span class="help">Time not yet allocated</span><strong>${number.format(result.remaining / 168)} <small>weeks</small></strong><span class="help">Outside your entered categories; may include other commitments.</span></div></div>
    ${gridViewMarkup()}${state.gridView === 'timeline' ? timelineMarkup(state, period) : chartMarkup(result)}
    <p class="help">${period.id === 'life' ? 'Your reference age is a planning assumption, not a prediction. ' : ''}Future allocations use your dated schedules. Sleep and work are part of life; the colours describe where time goes.</p>`;
}
function gridViewMarkup() {
  if (isWidget) return '<div class="grid-view-switch" role="group" aria-label="Widget view"><button data-widget-view="allocations" aria-pressed="' + (state.widgetGridView !== 'moments') + '">Time allocations</button><button data-widget-view="moments" aria-pressed="' + (state.widgetGridView === 'moments') + '">What matters</button></div>';
  return `<div class="grid-view-switch" role="group" aria-label="Grid view"><button data-grid-view="allocations" aria-pressed="${state.gridView !== 'timeline'}">Time allocations</button><button data-grid-view="timeline" aria-pressed="${state.gridView === 'timeline'}">Life timeline</button></div>`;
}
function bindGridView() {
  document.querySelectorAll('[data-widget-view]').forEach(button => button.onclick = async () => {
    const next = clone(state); next.widgetGridView = button.dataset.widgetView;
    try { await save(next, ''); } catch (error) { notify(error.message); }
  });
  document.querySelectorAll('[data-grid-view]').forEach(button => { button.onclick = async () => {
    const next = clone(state); next.gridView = button.dataset.gridView;
    try { await save(next, ''); } catch (error) { notify(error.message); }
  }; });
}
function observeTimeline() {
  const grid = document.querySelector('.timeline-grid');
  if (!grid) return;
  gridObserver?.disconnect();
  gridObserver = new ResizeObserver(() => fitTimeline(grid));
  gridObserver.observe(grid.closest('.grid-wrap'));
  fitTimeline(grid);
}
function drawCurrentGrid(period) {
  if (document.querySelector('.timeline-grid')) observeTimeline();
  else if (period && document.querySelector('#grid')) drawGrid(calculate(state, period));
}
function chartMarkup(result, { stable = false } = {}) {
  const ageReference = state.selected === 'life' && Boolean(state.birthday);
  return `<section class="panel time-chart ${stable ? 'stable-allocation' : ''}" data-fixed-columns="${isWidget || state.overviewLayout !== 'classic' ? 52 : ''}" data-age-reference="${ageReference ? state.lifespan : ''}" data-total-hours="${result.total}"><div class="panel-heading"><h2>Time allocations</h2><span class="help">${ageReference ? 'Age-equivalent reference · ' : ''}Each full square = 168 hours</span></div><div class="grid-wrap"><div class="allocation-board"><div class="allocation-axis-x" aria-label="Equivalent weeks across each row"></div><div class="week-grid" id="grid" role="img" aria-label="Visible week-equivalent squares, grouped by category"></div><div class="allocation-axis-y" aria-label="${ageReference ? 'Age-equivalent reference, not activity dates' : 'Equivalent weeks accumulated before each row'}"></div></div></div><p class="legend-heading">Show or hide categories</p><div class="legend">${result.groups.map(group => {
    const hidden = (state.hiddenGroups || []).includes(group.id);
    return `<button type="button" class="legend-item ${hidden ? 'legend-hidden' : ''}" data-group="${esc(group.id)}" aria-pressed="${!hidden}" title="${hidden ? 'Show' : 'Hide'} ${esc(group.name)} squares"><i class="swatch ${group.id === 'elapsed' ? 'swatch-crossed' : ''}" style="background:${safeColor(group.color)}"></i><span class="legend-copy"><strong>${hidden ? '○' : '✓'} ${esc(group.name)}${hidden ? ' · hidden' : ''}</strong><span>${number.format(group.hours / 168)} weeks · ${integer.format(group.hours)} hours</span></span></button>`;
  }).join('')}</div><p class="help note">Crossed grey: already lived. Colours: future categories. Empty outlines: unallocated. Click a legend item to remove or restore its squares; your hours stay saved. Squares group equivalent hours, rather than specific calendar weeks.</p></section>`;
}
function bindLegend() {
  document.querySelectorAll('[data-group]').forEach(button => button.onclick = async () => {
    const next = clone(state), id = button.dataset.group;
    const hidden = new Set(next.hiddenGroups || []);
    if (hidden.has(id)) hidden.delete(id); else hidden.add(id);
    next.hiddenGroups = [...hidden];
    try { await save(next, ''); } catch (error) { notify(error.message); }
  });
}
function drawGrid(result) {
  const grid = document.querySelector('#grid');
  const groups = result.groups.filter(group => !(state.hiddenGroups || []).includes(group.id));
  const total = groups.reduce((sum, group) => sum + group.hours, 0);
  const fragment = document.createDocumentFragment();
  const fullSquares = new Map();
  const hasElapsed = groups.some(group => group.id === 'elapsed');
  for (let i = 0; i < Math.ceil(total / 168); i++) {
    const segments = squareSegments(groups, i, total);
    let node;
    if (segments.length === 1 && segments[0].fraction === 1) {
      const segment = segments[0];
      let template = fullSquares.get(segment.id);
      if (!template) {
        template = document.createElement('div');
        template.className = segment.id === 'elapsed' ? 'week crossed' : 'week';
        template.style.background = safeColor(segment.color);
        template.title = `${segment.name}: ${number.format(168)} hours`;
        fullSquares.set(segment.id, template);
      }
      // Most of the thousands of cells are identical. Reuse their parsed styles
      // and formatted tooltip instead of constructing a gradient for every cell.
      node = template.cloneNode(false);
      node.title = `Square ${i + 1}\n${template.title}`;
    } else {
      node = document.createElement('div');
      node.className = 'week';
      let position = 0;
      const stops = [];
      for (const segment of segments) {
        const end = position + segment.fraction * 100;
        stops.push(`${safeColor(segment.color)} ${position}% ${end}%`); position = end;
      }
      if (position < 99.999) stops.push(`transparent ${position}% 100%`);
      node.style.background = `linear-gradient(to right, ${stops.join(',')})`;
      node.title = `Square ${i + 1}\n${segments.map(segment => `${segment.name}: ${number.format(segment.fraction * 168)} hours`).join('\n')}`;
      if (segments.every(segment => segment.id === 'elapsed')) node.classList.add('crossed');
    }
    if (hasElapsed && result.elapsed > 0 && result.future > 0 && i === Math.floor(result.elapsed / 168)) node.classList.add('current');
    fragment.append(node);
  }
  grid.replaceChildren(fragment);
  if (!total) {
    grid.style.cssText = '';
    grid.textContent = 'No weeks to display. Click a legend item below to show it.';
    grid.classList.add('grid-empty');
    return;
  }
  grid.classList.remove('grid-empty');
  gridObserver?.disconnect();
  gridObserver = new ResizeObserver(() => fitGrid(grid));
  gridObserver.observe(grid.closest('.grid-wrap'));
  fitGrid(grid);
}
function fitGrid(grid) {
  if (grid.classList.contains('timeline-grid')) { fitTimeline(grid); return; }
  const count = grid.children.length;
  if (!count || !grid.isConnected) return;
  const available = grid.closest('.grid-wrap');
  const scale = window.devicePixelRatio || 1;
  const width = Math.max(1, Math.floor((available.clientWidth - 66) * scale));
  const height = Math.max(1, Math.floor((available.clientHeight - 30) * scale));
  const fixedColumns = Number(grid.closest('.time-chart').dataset.fixedColumns);
  let gapPixels = Math.max(1, Math.floor(Math.min(count > 1000 ? 1.5 : 3, Math.sqrt(width * height / count) / scale / 3) * scale));
  let best = { columns: fixedColumns || count, size: 0 };
  // Fit using whole screen pixels so borders and spacing don't alternate in thickness.
  if (fixedColumns) gapPixels = height / Math.ceil(count / fixedColumns) < 2 ? 0 : 1;
  for (let columns = fixedColumns || 1; columns <= (fixedColumns || count); columns++) {
    const rows = Math.ceil(count / columns);
    const size = Math.floor(Math.min(24 * scale, (width - gapPixels * (columns - 1)) / columns, (height - gapPixels * (rows - 1)) / rows));
    if (size > best.size || (size === best.size && columns > best.columns)) best = { columns, size };
  }
  const size = Math.max(1, best.size) / scale;
  const gap = gapPixels / scale;
  const rows = Math.ceil(count / best.columns);
  grid.style.gridTemplateColumns = `repeat(${best.columns},${size}px)`;
  grid.style.gridAutoRows = `${size}px`;
  grid.style.gap = `${gap}px`;
  grid.style.width = `${best.columns * size + (best.columns - 1) * gap}px`;
  grid.style.height = `${rows * size + (rows - 1) * gap}px`;
  grid.style.setProperty('--grid-stroke', `${1 / scale}px`);
  grid.style.transform = 'none';
  const bounds = grid.getBoundingClientRect();
  grid.style.transform = `translate(${Math.round(bounds.left * scale) / scale - bounds.left}px,${Math.round(bounds.top * scale) / scale - bounds.top}px)`;
  const xAxis = grid.parentElement.querySelector('.allocation-axis-x');
  const yAxis = grid.parentElement.querySelector('.allocation-axis-y');
  if (xAxis && yAxis) {
    const columns = best.columns, pitch = size + gap;
    xAxis.innerHTML = [...new Set(fixedColumns ? [0, 12, 25, 38, 51] : [0, Math.floor(columns / 2), columns - 1])].map(i => `<span style="left:${i * pitch}px">${i === 0 ? 'Week 1' : i + 1}</span>`).join('');
    const interval = fixedColumns ? rows > 80 ? 10 : rows > 20 ? 5 : 1 : Math.max(1, Math.ceil(18 / pitch));
    const chart = grid.closest('.time-chart');
    const ageYears = Number(chart.dataset.ageReference), totalHours = Number(chart.dataset.totalHours);
    if (ageYears) {
      const maximum = count * 168 / totalHours * ageYears;
      const labelCount = Math.max(2, Math.floor(rows * pitch / 18));
      const step = fixedColumns ? ageYears >= 50 ? 10 : 5 : [5, 10, 20, 25, 50, 100].find(value => Math.ceil(maximum / value) <= labelCount) || 100;
      yAxis.innerHTML = Array.from({ length: Math.floor(maximum / step) + 1 }, (_, i) => {
        const age = i * step, top = Math.min(age / ageYears * totalHours / 168 / columns * pitch, Math.max(0, rows * pitch - 12));
        return `<span style="top:${top}px" title="Equivalent duration, not the age when an activity happens">Age ≈${age}</span>`;
      }).join('');
    } else {
      yAxis.innerHTML = Array.from({ length: rows }, (_, i) => i % interval ? '' : `<span style="top:${i * pitch}px">${integer.format(i * columns)} wk</span>`).join('');
    }
  }
}
function scheduleAt(date) {
  const schedules = [...state.schedules].sort((a, b) => dateValue(a.start) - dateValue(b.start));
  return schedules.filter(schedule => schedule.start <= date).at(-1) || schedules[0];
}
function opacityControls() {
  return `<label class="opacity-control">Background opacity <output data-opacity-value>${state.widgetOpacity}%</output><input aria-label="Widget background opacity" type="range" min="0" max="100" step="1" value="${state.widgetOpacity}" data-opacity></label>`;
}
function appearancePanel() {
  return `<section class="panel" style="grid-column:1 / -1"><div class="panel-heading"><h2>Floating countdown</h2><button class="subtle" data-open-widget>Open widget ↗</button></div>${opacityControls()}<p class="help section-gap">The numbers stay fully visible. At 0%, only the countdown shows; hover over it to reveal controls. Drag the background or numbers to move the widget. Click its numbers to cycle through countdown formats.</p><div class="startup-setting"><label class="startup-label"><input type="checkbox" id="launch-at-login" disabled> Launch when I sign in to Windows</label><p class="help" id="startup-status" role="status">Checking Windows startup setting…</p><p class="help">After setup, only the widget opens. Use its arrow button to open the full app. Turn this off anytime to stop automatic launch.</p></div></section>`;
}
function applyWidgetOpacity(opacity) {
  const widget = document.querySelector('.widget');
  if (!widget) return;
  widget.style.setProperty('--widget-opacity', opacity / 100);
  widget.classList.toggle('clock-only', opacity === 0);
  document.querySelectorAll('[data-opacity]').forEach(input => { input.value = opacity; });
  document.querySelectorAll('[data-opacity-value]').forEach(output => { output.textContent = `${opacity}%`; });
}
function bindAppearance() {
  const startupSection = document.querySelector('.startup-setting');
  if (startupSection && !document.querySelector('[data-hourly-effect]')) startupSection.insertAdjacentHTML('beforebegin', hourlyControls());
  const chooseEffect = async effect => {
    const next = clone(state); next.hourlyEffect = effect;
    try {
      await save(next, '');
      await window.desktop.previewEffect(next.hourlyEffect);
    } catch (error) { notify(error.message); }
  };
  document.querySelectorAll('[data-hourly-effect]').forEach(select => {
    select.onchange = () => chooseEffect(select.value);
  });
  document.querySelectorAll('[data-effect-choice]').forEach(button => {
    button.onclick = () => chooseEffect(button.dataset.effectChoice);
  });
  const startup = document.querySelector('#launch-at-login');
  const startupStatus = document.querySelector('#startup-status');
  if (startup) {
    const showStartup = result => {
      startup.checked = result.enabled;
      startup.disabled = !result.supported;
      startupStatus.textContent = result.enabled ? 'On · the widget will open after Windows sign-in.' : 'Off · launch using your desktop shortcut.';
    };
    window.desktop.readStartup().then(result => {
      if (startup.isConnected) showStartup(result);
    }).catch(error => { if (startup.isConnected) startupStatus.textContent = error.message; });
    startup.onchange = async () => {
      const enabled = startup.checked;
      startup.disabled = true;
      try {
        const result = await window.desktop.setStartup(enabled);
        showStartup(result);
        if (result.enabled !== enabled) startupStatus.textContent = 'Windows did not apply the change. Check Settings → Apps → Startup.';
      } catch (error) {
        startup.checked = !enabled; startup.disabled = false;
        startupStatus.textContent = error.message;
      }
    };
  }
  document.querySelectorAll('[data-open-widget]').forEach(button => { button.onclick = () => window.desktop.openWidget(); });
  document.querySelectorAll('[data-opacity]').forEach(input => {
    input.oninput = () => {
      const value = Number(input.value);
      document.querySelectorAll('[data-opacity-value]').forEach(output => { output.textContent = `${value}%`; });
      if (isWidget) applyWidgetOpacity(value);
      window.desktop.previewOpacity(value);
    };
    input.onchange = async () => {
      const next = clone(state); next.widgetOpacity = Number(input.value);
      try { await save(next, ''); } catch (error) { notify(error.message); }
    };
  });
}
function hourlyControls() {
  if (isWidget) return `<fieldset class="hourly-controls hourly-choices"><legend>Hourly visual effect</legend><div class="effect-choices" role="group" aria-label="Hourly visual effect">${[['off','Off'],['pulse','Soft pulse'],['sweep','Light sweep']].map(([value,label]) => `<button type="button" data-effect-choice="${value}" aria-pressed="${state.hourlyEffect === value}">${label}</button>`).join('')}</div></fieldset>`;
  return `<div class="hourly-controls"><label>Hourly visual effect<select data-hourly-effect aria-label="Hourly visual effect">${[['off','Off'],['pulse','Soft pulse'],['sweep','Light sweep']].map(([value,label]) => `<option value="${value}" ${state.hourlyEffect === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label><p class="help">${isWidget ? 'Selecting an effect closes these controls and previews it on the widget.' : 'Selecting an effect shows the widget and previews it. Choose Off to disable hourly reminders.'}</p></div>`;
}
function settingsMarkup() {
  const schedules = [...state.schedules].sort((a, b) => dateValue(a.start) - dateValue(b.start));
  const current = scheduleAt(today());
  return `<header class="topline"><div><div class="eyebrow">Make it yours</div><h1>Your time</h1><p class="help">Your assumptions, your colours. Change them as life changes.</p></div></header><div class="settings-grid">
    <section class="panel"><div class="panel-heading"><h2>Your life horizon</h2></div>${profileForm()}</section>
    <section class="panel"><div class="panel-heading"><h2>Your categories</h2><button class="subtle" id="add-category">+ Add</button></div><p class="help" style="margin-bottom:16px">Choose a colour, name your category, and enter its hours in the number box.</p><form id="category-form">${state.categories.map(category => `<div class="category-row"><label>Colour<input aria-label="${esc(category.name)} colour" type="color" value="${safeColor(category.color)}" data-color="${esc(category.id)}"></label><label>Category name<input aria-label="Category name" maxlength="40" required value="${esc(category.name)}" data-name="${esc(category.id)}"></label><label>Hours per ${category.unit === 'night' ? 'night' : 'week'}<input aria-label="${esc(category.name)} hours per ${category.unit === 'night' ? 'night' : 'week'}" type="number" min="0" max="${category.unit === 'night' ? 24 : 168}" step="0.1" required value="${current.hours[category.id] || 0}" data-hours="${esc(category.id)}"></label></div>`).join('')}<label>These hours apply from<input type="date" name="applies" required value="${today()}"></label><p class="help" id="category-total"></p><p class="error" role="alert"></p><button class="primary" type="submit">Save categories & hours</button></form><p class="help section-gap">Changing hours keeps earlier schedules intact. Set a category to zero when it no longer takes time.</p></section>
    <section class="panel" style="grid-column:1 / -1"><div class="panel-heading"><h2>Schedules over time</h2><button class="primary subtle" id="add-schedule">+ Schedule change</button></div><p class="help">Each schedule applies from its start date until the next change. The earliest schedule is the baseline. Only future time is allocated into category colours.</p><div class="section-gap">${schedules.map((schedule, index) => `<div class="schedule-row"><div><h3>${index === 0 ? 'Baseline · ' : 'From '}${fmtDate(schedule.start)}</h3><p>${state.categories.map(category => `${esc(category.name)} ${number.format(schedule.hours[category.id] || 0)} h/${category.unit === 'night' ? 'night' : 'week'}`).join(' · ')}</p></div><div class="schedule-buttons"><button class="subtle" data-edit-schedule="${esc(schedule.id)}">Edit</button>${schedules.length > 1 ? `<button class="subtle danger" data-delete-schedule="${esc(schedule.id)}">Remove</button>` : ''}</div></div>`).join('')}</div><p class="help section-gap">Hours are averages, spread across each week. Keep categories separate so hours don’t overlap. You can model retirement with a future schedule containing zero work hours.</p></section></div>`;
}
function bindSettings() {
  bindAppearance();
  bindProfile();
  document.querySelector('#category-form').onsubmit = async event => {
    event.preventDefault(); const form = event.currentTarget;
    try {
      const next = clone(state);
      next.categories.forEach(category => {
        category.name = form.querySelector(`[data-name="${category.id}"]`).value.trim();
        category.color = form.querySelector(`[data-color="${category.id}"]`).value;
        if (!category.name) throw new Error('Give each category a name.');
      });
      validateCategories(next.categories);
      const start = form.elements.applies.value;
      dateValue(start);
      const hours = Object.fromEntries(next.categories.map(category => [category.id, Number(form.querySelector(`[data-hours="${category.id}"]`).value)]));
      const existing = next.schedules.find(schedule => schedule.start === start);
      const changed = { id: existing?.id || uid(), start, hours };
      validateSchedule(next.categories, changed);
      const previous = scheduleAt(start);
      if (next.categories.some(category => hours[category.id] !== Number(previous.hours[category.id] || 0))) {
        next.schedules = next.schedules.filter(schedule => schedule.id !== changed.id);
        next.schedules.push(changed);
      }
      await save(next);
    } catch (error) { form.querySelector('.error').textContent = error.message; }
  };
  const categoryForm = document.querySelector('#category-form');
  function showCategoryTotal() {
    const draft = { hours: Object.fromEntries(state.categories.map(category => [category.id, Number(categoryForm.querySelector(`[data-hours="${category.id}"]`).value)])) };
    const total = state.categories.reduce((sum, category) => sum + weeklyHours(category, draft), 0);
    const target = document.querySelector('#category-total');
    target.textContent = `${number.format(total)} of 168 weekly hours allocated · ${number.format(Math.max(0, 168 - total))} unallocated`;
    target.className = total > 168 ? 'error' : 'help';
  }
  categoryForm.elements.applies.onchange = () => {
    if (!categoryForm.elements.applies.value) return;
    const schedule = scheduleAt(categoryForm.elements.applies.value);
    for (const category of state.categories) categoryForm.querySelector(`[data-hours="${category.id}"]`).value = schedule.hours[category.id] || 0;
    showCategoryTotal();
  };
  categoryForm.addEventListener('input', showCategoryTotal);
  showCategoryTotal();
  document.querySelector('#add-category').onclick = openCategory;
  document.querySelector('#add-schedule').onclick = () => openSchedule();
  document.querySelectorAll('[data-edit-schedule]').forEach(button => button.onclick = () => openSchedule(state.schedules.find(schedule => schedule.id === button.dataset.editSchedule)));
  document.querySelectorAll('[data-delete-schedule]').forEach(button => button.onclick = () => {
    const schedule = state.schedules.find(s => s.id === button.dataset.deleteSchedule);
    confirmAction('Remove schedule?', `The earlier schedule will continue through this date. This changes your estimates.`, async () => {
      const next = clone(state); next.schedules = next.schedules.filter(s => s.id !== schedule.id); await save(next);
    });
  });
}
function validateCategories(categories) {
  if (new Set(categories.map(c => c.name.toLowerCase())).size !== categories.length) throw new Error('Give each category a different name.');
  if (new Set(categories.map(c => c.color.toLowerCase())).size !== categories.length) throw new Error('Choose a different colour for each category.');
}
function dialog(title, markup, onSubmit) {
  document.querySelector('dialog')?.remove();
  const node = document.createElement('dialog'); node.className = 'dialog';
  node.innerHTML = `<h2>${esc(title)}</h2><form>${markup}<p class="error" role="alert"></p><div class="actions"><button type="button" data-cancel>Cancel</button><button class="primary" type="submit">Save</button></div></form>`;
  document.body.append(node);
  node.querySelector('[data-cancel]').onclick = () => { node.close(); node.remove(); };
  node.addEventListener('close', () => node.remove());
  node.querySelector('form').onsubmit = async event => {
    event.preventDefault(); const button = node.querySelector('[type=submit]'); button.disabled = true;
    try { await onSubmit(new FormData(event.currentTarget), event.currentTarget); node.close(); node.remove(); }
    catch (error) { node.querySelector('.error').textContent = error.message; button.disabled = false; }
  };
  node.showModal(); return node;
}
function confirmAction(title, description, action) {
  const node = dialog(title, `<p class="help">${esc(description)}</p>`, action);
  node.querySelector('[type=submit]').textContent = 'Remove';
}
function openCategory() {
  dialog('Add a time category', `<label>Name<input name="name" required maxlength="40" placeholder="e.g. Commuting"></label><div class="form-row"><label>Colour<input type="color" name="color" value="${['#cf8cae','#73bdc7','#d9c677','#b39bd3','#89b780'].find(color => !state.categories.some(c => c.color === color)) || '#ffffff'}"></label><label>Enter hours per<select name="unit"><option value="week">Week</option><option value="night">Night (daily average)</option></select></label></div><p class="help">The category starts with zero hours. Edit or add a schedule to allocate time to it.</p>`, async data => {
    const next = clone(state), name = data.get('name').trim();
    if (!name) throw new Error('Enter a name.');
    next.categories.push({ id: uid(), name, color: data.get('color'), unit: data.get('unit') });
    validateCategories(next.categories); await save(next);
  });
}
function openSchedule(existing) {
  const schedules = [...state.schedules].sort((a, b) => dateValue(a.start) - dateValue(b.start));
  const baseline = schedules.filter(s => s.start <= today()).at(-1) || schedules[0];
  const schedule = existing || { id: uid(), start: today(), hours: clone(baseline.hours) };
  const node = dialog(existing ? 'Edit schedule' : 'Change your schedule', `<label>Applies from<input type="date" name="start" value="${schedule.start}" required></label>${state.categories.map(category => `<label>${esc(category.name)} · hours per ${category.unit === 'night' ? 'night' : 'week'}<input name="${esc(category.id)}" type="number" min="0" max="${category.unit === 'night' ? 24 : 168}" step="0.1" required value="${schedule.hours[category.id] || 0}"></label>`).join('')}<p class="help" id="schedule-total"></p><p class="help">Enter averages with no overlapping hours. A new dated schedule preserves earlier assumptions. Editing an existing one corrects that schedule.</p>`, async data => {
    const next = clone(state), changed = { id: schedule.id, start: data.get('start'), hours: {} };
    for (const category of next.categories) changed.hours[category.id] = Number(data.get(category.id));
    validateSchedule(next.categories, changed);
    if (next.schedules.some(s => s.id !== changed.id && s.start === changed.start)) throw new Error('A schedule already starts on this date. Edit that schedule or choose a different date.');
    next.schedules = next.schedules.filter(s => s.id !== changed.id); next.schedules.push(changed);
    await save(next);
  });
  function showTotal() {
    const data = new FormData(node.querySelector('form'));
    const draft = { hours: Object.fromEntries(state.categories.map(c => [c.id, Number(data.get(c.id))])) };
    const total = state.categories.reduce((sum, c) => sum + weeklyHours(c, draft), 0);
    const target = node.querySelector('#schedule-total');
    target.textContent = `${number.format(total)} / 168 hours allocated · ${number.format(Math.max(0, 168 - total))} hours unallocated`;
    target.className = total > 168 ? 'error' : 'help';
  }
  node.addEventListener('input', showTotal); showTotal();
}
function openPeriod(existing) {
  const period = existing || { name: '', start: today(), end: addYears(today(), 5) };
  const node = dialog(existing ? 'Edit time period' : 'A new window into your life', `<label>Name<input name="name" required maxlength="60" value="${esc(period.name)}" placeholder="e.g. My next chapter"></label><div class="actions"><button type="button" class="subtle" data-years="5">Next 5 years</button><button type="button" class="subtle" data-years="10">Next decade</button></div><div class="form-row"><label>Start date<input name="start" type="date" value="${period.start}" required></label><label>End date<input name="end" type="date" value="${period.end}" required></label></div><p class="help">The countdown ends at the start of the end date. Periods share your categories and schedules. Presets use today as a fixed start date.</p>`, async data => {
    const next = clone(state);
    const changed = { id: existing?.id || uid(), name: data.get('name').trim(), start: data.get('start'), end: data.get('end') };
    if (!changed.name) throw new Error('Enter a name.');
    const duration = dateValue(changed.end) - dateValue(changed.start);
    if (duration <= 0) throw new Error('The end date must be after the start date.');
    if (duration > 150 * 366 * 86400000) throw new Error('Choose a period of 150 years or less.');
    next.periods = next.periods.filter(p => p.id !== changed.id); next.periods.push(changed);
    next.selected = changed.id; page = 'overview'; await save(next);
  });
  node.querySelectorAll('[data-years]').forEach(button => button.onclick = () => {
    const form = node.querySelector('form'); form.elements.start.value = today();
    form.elements.end.value = addYears(today(), Number(button.dataset.years));
    if (!form.elements.name.value) form.elements.name.value = Number(button.dataset.years) === 5 ? 'Next five years' : 'Next decade';
  });
}
function deletePeriod(period) {
  confirmAction('Delete this period?', `Remove “${period.name}” from your saved periods? Your categories and schedules will stay saved.`, async () => {
    const next = clone(state); next.periods = next.periods.filter(p => p.id !== period.id); next.selected = 'life'; await save(next);
  });
}
function toggleWidgetGrid(expanded = !widgetExpanded) {
  // Serialize rapid clicks/Escape so an older frame cannot reveal a newer resize.
  widgetGridTransition = widgetGridTransition.then(async () => {
    let presentation;
    try {
      presentation = await window.desktop.prepareWidgetExpanded(expanded);
      widgetExpanded = presentation.expanded;
      widgetSettingsOpen = false;
      renderWidget();
      // Allow resize observers and a paint at the final bounds before revealing.
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    } catch (error) { notify(error.message); }
    finally {
      if (presentation) await window.desktop.presentWidget(presentation.id);
    }
  }).catch(error => notify(error.message));
  return widgetGridTransition;
}
async function toggleCounterOnly(enabled) {
  try {
    await window.desktop.setWidgetCounterOnly(enabled);
    widgetExpanded = false;
    widgetSettingsOpen = false;
    const next = clone(state); next.widgetCounterOnly = enabled;
    await save(next, '');
  } catch (error) {
    await window.desktop.setWidgetCounterOnly(state.widgetCounterOnly);
    notify(error.message);
  }
}
async function toggleWidgetAppearance(open) {
  widgetSettingsOpen = open;
  renderWidget();
}
function renderWidgetAppearance() {
  root.innerHTML = `<section class="widget widget-appearance-view ${widgetExpanded ? 'widget-expanded' : ''}"><header class="appearance-header"><strong>Appearance</strong><button id="back-to-countdown" aria-label="Back to countdown">Back ↩</button></header>${opacityControls()}${hourlyControls()}</section>`;
  document.querySelector('#back-to-countdown').onclick = () => toggleWidgetAppearance(false);
  applyWidgetOpacity(state.widgetOpacity);
  bindAppearance();
  bindWidgetDragging();
}
function renderWidget() {
  const momentsScroll = document.querySelector('.widget-moments-list')?.scrollTop || 0;
  gridObserver?.disconnect();
  const period = periodFor(state);
  if (widgetSettingsOpen) { renderWidgetAppearance(); return; }
  if (state.widgetCounterOnly) {
    root.innerHTML = `<section class="widget widget-minimal">${period ? clockButton(period.end) : '<span class="help">Choose a period in the app</span>'}<button id="restore-widget" class="restore-widget" title="Restore full widget" aria-label="Restore full widget">⤢</button></section>`;
    document.querySelector('#restore-widget').onclick = () => toggleCounterOnly(false);
    applyWidgetOpacity(state.widgetOpacity);
    bindClock();
    bindWidgetDragging();
    fitCounterStrip();
    return;
  }
  root.innerHTML = widgetExpanded ? `<section class="widget widget-expanded"><header class="widget-top widget-grid-toolbar"><strong title="${state.widgetGridView === 'moments' ? 'Your saved experiences' : period ? 'To ' + fmtDate(period.end) : ''}">${state.widgetGridView === 'moments' ? 'What matters' : esc(period?.name || 'Life Countdown')}</strong>${period ? gridViewMarkup() : ''}<div><button id="show-grid" title="Collapse grid (Escape)" aria-expanded="true" aria-controls="widget-grid">Collapse</button><button id="widget-settings-toggle" title="Appearance" aria-label="Widget settings" aria-expanded="false">&#9881;</button><button id="show-main" title="Open full app" aria-label="Open main window">&#8599;</button><button id="close-widget" title="Close widget" aria-label="Close widget">&#10005;</button></div></header><div id="widget-grid" class="widget-grid">${period ? state.widgetGridView === 'moments' ? momentsWidgetMarkup(state) : chartMarkup(calculate(state, period)) : '<p class="help">Open the app to choose a time period.</p>'}</div></section>` : `<section class="widget">
    <div class="widget-top widget-detail"><p class="eyebrow">Life Countdown</p><div>
      <button id="show-grid" title="${widgetExpanded ? 'Collapse' : 'Expand'} weeks grid" aria-expanded="${widgetExpanded}" aria-controls="widget-grid">Grid ${widgetExpanded ? '▴' : '▾'}</button>
      <button id="widget-settings-toggle" title="Appearance" aria-label="Widget settings" aria-expanded="${widgetSettingsOpen}">⚙</button>
      <button id="show-main" aria-label="Open main window">↗</button><button id="close-widget" aria-label="Close widget">✕</button>
    </div></div>
    <div class="widget-title-row widget-detail"><h2>${esc(period?.name || 'Set up your life calendar')}</h2>${period ? `<span class="widget-end-date">To ${fmtDate(period.end)}</span>` : ''}</div>
    ${period ? `${clockButton(period.end)}<div class="widget-bar widget-detail">${calculate(state, period).groups.filter(group => !(state.hiddenGroups || []).includes(group.id)).map(group => `<span style="background:${safeColor(group.color)};flex:${group.hours}"></span>`).join('')}</div>` : '<p class="help widget-detail">Open the app to choose a time period.</p>'}
  </section>`;
  document.querySelector('#show-main').onclick = () => window.desktop.showMain();
  const minimalButton = document.createElement('button');
  minimalButton.id = 'counter-only';
  minimalButton.textContent = 'Counter only';
  minimalButton.title = 'Show only the countdown and a restore button';
  minimalButton.onclick = () => toggleCounterOnly(true);
  document.querySelector('#widget-settings-toggle').before(minimalButton);
  const closeButton = document.querySelector('#close-widget');
  if (widgetExpanded) {
    closeButton.title = 'Back to counter';
    closeButton.setAttribute('aria-label', 'Collapse grid to counter');
  }
  closeButton.onclick = () => widgetExpanded ? toggleWidgetGrid(false) : window.desktop.closeWidget();
  document.querySelector('#show-grid').onclick = () => toggleWidgetGrid();
  document.querySelector('#widget-settings-toggle').onclick = () => toggleWidgetAppearance(!widgetSettingsOpen);
  applyWidgetOpacity(state.widgetOpacity);
  bindClock();
  bindAppearance();
  bindWidgetDragging();
  if (widgetExpanded && period) {
    bindGridView();
    bindLegend();
    drawCurrentGrid(period);
    document.querySelector('#widget-manage-experiences')?.addEventListener('click', () => window.desktop.showMain('moments'));
    const momentsList = document.querySelector('.widget-moments-list');
    if (momentsList) momentsList.scrollTop = momentsScroll;
  }
}

try {
  state = await window.desktop.read() || defaults();
  state.widgetCounterOnly = state.widgetCounterOnly === true;
  if (isWidget) {
    await window.desktop.setWidgetCounterOnly(state.widgetCounterOnly);
    widgetExpanded = await window.desktop.getWidgetExpanded();
  }
  if (!COUNTDOWN_FORMATS.includes(state.countdownFormat)) state.countdownFormat = 'calendar';
  if (!HOURLY_EFFECTS.includes(state.hourlyEffect)) state.hourlyEffect = 'off';
  if (!Number.isFinite(state.widgetOpacity)) state.widgetOpacity = 85;
  state.widgetOpacity = Math.max(0, Math.min(100, state.widgetOpacity));
  if (!Array.isArray(state.hiddenGroups)) state.hiddenGroups = [];
  if (!['timeline', 'allocations'].includes(state.gridView) || !isWidget && state.selected === 'life') state.gridView = 'allocations';
  if (!['allocations', 'moments'].includes(state.widgetGridView)) state.widgetGridView = 'allocations';
  if (state.onboardingStep === 'widget' && !state.setupHoursConfirmed) state.onboardingStep = 'allocations';
  // Validate persisted calculation inputs before drawing anything.
  state.schedules.forEach(schedule => validateSchedule(state.categories, schedule));
  if (!isWidget) {
    if (!state.birthday && !state.onboardingStep) state.onboardingStep = 'welcome';
    if (guidePending() && guideStep() !== 'welcome') page = 'guide';
    else if (!state.birthday) page = 'overview';
  }
  render();
  window.desktop.onChange(next => { state = next; render(); });
  window.desktop.onNavigate(destination => {
    if (!isWidget && destination === 'moments' && !setupRequired()) { momentDraft = null; momentPicker = null; navigatePage('moments'); }
  });
  window.desktop.onClockRefresh(() => { previousHourlyTick = new Date(); refreshTime(); });
  window.desktop.onEffectPreview(effect => {
    if (!state) pendingEffectPreview = effect;
    else previewHourlyEffect(effect);
  });
  if (isWidget) { window.desktop.widgetReady(); if (pendingEffectPreview) previewHourlyEffect(pendingEffectPreview); }
  window.desktop.onOpacityPreview(applyWidgetOpacity);
  window.addEventListener('focus', refreshTime);
  window.addEventListener('resize', () => {
    const grid = document.querySelector('#grid');
    if (grid) fitGrid(grid);
  });
  window.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    if (isWidget && widgetSettingsOpen) toggleWidgetAppearance(false);
    else if (isWidget && widgetExpanded) toggleWidgetGrid(false);
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) refreshTime();
  });
  setInterval(() => { updateClocks(); checkHourlyEffect(); }, 1000);
  setInterval(refreshTime, 60000);
} catch (error) {
  root.innerHTML = `<main class="content"><h1>Couldn’t open your calendar</h1><p class="error section-gap">${esc(error.message)}</p><p class="help section-gap">Your saved settings have been left intact. Close and reopen the app to try again.</p></main>`;
}
