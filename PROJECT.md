# Life Countdown — project concept

## Purpose

A desktop app that makes the brevity of life visible through a grid of weeks and a live countdown. Inspired by Tim Urban’s “Your Life in Weeks” on Wait But Why.

The app should help you see both how much time has passed and how your remaining time is allocated. No coding knowledge should be needed to use it.

## What we agreed

- Start with Life in Weeks. Leave the separate “100 Blocks a Day” exercise for later.
- Provide a whole-life view based on a birthday and an editable reference lifespan. This is a chosen planning horizon, not a prediction of death.
- Cross off elapsed time in grey.
- Each square represents one week’s worth of time: 168 hours. Future hours are added up by category and shown as grouped, coloured squares. A sleep square represents sleep accumulated over many nights, not a specific calendar week spent entirely asleep.
- Give every category its own editable colour. Include sleep and work initially, and allow custom categories such as commuting, chores, caregiving, or exercise.
- Leave unallocated time as empty squares. It is only the remainder after the categories entered, not necessarily leisure time.
- Use a light, paper-like background for the grid with outlined squares, inspired by the original chart. Unallocated squares are white and empty; elapsed squares are grey and crossed; category squares use their individual colours. Keep the surrounding app dark.
- Show a legend with hours and equivalent weeks for each category. Partially filled squares preserve accuracy.
- Accept average sleep hours per night and average weekly hours for other categories. Calculate sleep’s weekly total automatically.
- Support changing habits and work schedules. A dated schedule change updates projections from that date onward and retains earlier assumptions. These are estimates, not automatic activity tracking.
- Prevent allocations exceeding 168 hours per week. Categories should represent separate time; do not count the same hours twice.
- Allow named periods such as the next five years, a decade, “my forties,” or custom start/end dates. Each has a grid and countdown.
- All periods share the same categories and dated schedules.
- Provide an optional compact, always-on-top countdown window that can be moved around the monitor.
- Keep a system tray icon beside the Windows clock. The widget stays out of the taskbar; the full app has a taskbar button, including while minimized. A quiet, one-time tray notice introduces the icon when the app first runs without the full window. Tray menu: Show widget, Hide widget, Open full app, Quit Life Countdown. Clicking the icon shows the widget; double-clicking opens the full app. Closing all windows keeps the tray running; Quit exits completely. Repeated launches restore the existing widget instead of creating duplicate tray instances.
- Before setup, launch only the main window with a sidebar-free guided introduction with an illustrative life and chapters, required dates, a personal chronological timeline, required sleep/work inputs with a live allocation preview, and widget introduction. Save progress and resume unfinished setup. After setup is finished, launch only the widget from both the desktop shortcut and Windows sign-in. Keep saved widget mode and formatting. Open the full app on demand using the widget’s arrow button (restore the full widget first if in Counter only mode). Include a Launch when I sign in to Windows checkbox that reads the real Windows startup status and enables or disables automatic launch.
- Click the countdown in any window to cycle through years/months/days (default), days/hours/minutes/seconds, weeks/days, total hours, and total seconds. The seconds counter updates every second. Remember the choice and keep all windows synchronized. Calendar units use actual month lengths.
- Give the floating widget a background-opacity slider behind a gear button, leaving the numbers fully visible. At 0%, hide its surrounding details until hover/focus. Remember the opacity. The main life grid remains readable on its normal background.
- Include a separate Counter only mode: shrink the widget to a short strip showing only the interactive countdown and a small restore button. Do not reveal other details on hover in this mode. Keep format cycling, background opacity, and always-on-top behaviour. Remember the mode and restore the normal widget with the restore button. Drag the strip’s background to move it.
- Offer optional hourly visual effects behind the gear button: Off (initial default), Soft pulse, and Light sweep. Selecting an effect immediately previews it on the actual widget; there is no separate Preview button. Save the selection. Play three quiet two-second animation cycles on the hour, including in Counter only mode, without sound or notifications. Do not replay hours missed while asleep, closed, or after a clock change.
- Repeat either hourly effect three times, with a two-second cycle (about six seconds total). The countdown numbers brighten with a soft green glow on each repetition, then return to their normal colour. Keep the shine continuous as the digits update, including in Counter only mode. Previews use the same three repetitions.
- On the first repetition only, a soft green wave spreads from the countdown numbers across the widget's monitor. Pulse uses a narrow ring; sweep uses a broader light band. Keep the following two repetitions on the widget. The temporary transparent desktop layer passes clicks through, never takes focus, and disappears after two seconds. Preview uses the same effect, including in Counter only mode.
- Keep the desktop wave inside the monitor's work area, leaving the Windows taskbar clear. Use an ordinary always-on-top layer that cannot enter fullscreen, so starting and ending the effect does not trigger fullscreen taskbar behaviour.
- The gear button replaces the countdown contents with compact Appearance controls inside the same widget. Never open a separate settings window or change the widget’s native size or position. Fit the opacity slider, inline effect choices and Back in the existing space without scrolling. Back or Escape returns to the countdown. Selecting an effect returns to the countdown before the animation plays. Settings and countdown share the same background opacity, updated live by the slider; hovering does not change that opacity. Text and controls remain fully visible.
- In Counter only mode, dragging the numbers moves the native window; a click without dragging cycles the format. Fit the window width to the counter’s actual text on format changes and time updates, with the restore button directly beside it. Keep the widget within the monitor’s work area.
- Automatically save separate positions for the normal widget and Counter only view. Restore each position when switching modes and launching the app, including Windows sign-in. Keep saved positions inside an available monitor's work area after display changes. Expanding the grid must not overwrite the normal widget position.
- Drag any widget background, title, date, or countdown numbers to move it, in normal, expanded, settings, and Counter only views. Exclude buttons, links, and settings inputs from dragging. A click on the countdown still cycles its format; a drag moves it without changing the format.
- Constrain native dragging in normal and expanded-grid widget modes to the monitor’s usable desktop area too. All edges must stay on screen and outside the taskbar, regardless of which edge hosts the taskbar. When moving across monitors, use the monitor under the pointer and fit the widget if needed.
- Keep the current widget size on large monitors. On smaller screens, preserve its logical size while fitting expanded grids to the available workspace. Limit the full app’s initial and minimum dimensions to the monitor’s usable area. Check 1920×1080 at 100%, 125%, and 150% Windows scaling; the layout must fit without grid scrolling.
- Click legend items to remove or restore each group’s squares, including sleep, work, and custom categories. Hidden groups stay in the legend with their original totals. This changes the view, not the saved schedule or unallocated-time calculation. Remember visibility and share it across views. Refit the remaining squares without scrolling.
- The widget’s Grid button expands the same window into one connected countdown-and-grid panel in the widget’s dark theme. Clicking Grid again or pressing Escape collapses it and restores its compact size and position. The expanded grid stays open while using its legend; hovering does not open or close it. Fit the expanded window within the monitor’s work area and use the same background opacity as the compact widget, including fully transparent at zero. Keep the squares, text, and controls visible.
- Save settings locally and restore them when the app reopens.
- Count time while the app is closed, the computer is asleep, or the computer is powered off. Recalculate from saved dates and the computer’s current clock when reopening. Refresh the countdown, grid, and totals on wake, unlock, and returning to the app. No internet connection is required; accuracy relies on the computer clock being correct.

## How the grid works

For the selected period, first mark elapsed hours in grey. Divide the future portion into coloured groups using the schedules that apply to those dates. The remaining hours form empty squares.

For example, during a full week:

| Category | Input | Hours | Equivalent weeks |
| --- | --- | ---: | ---: |
| Sleep | 8 hours per night | 56 | 0.3333 |
| Work | 40 hours per week | 40 | 0.2381 |
| Unallocated | Calculated remainder | 72 | 0.4286 |

Grouped colours deliberately do not map categories to chronological positions. Calendar dates determine the totals, while the grouped grid makes those totals visible.

Use real start/end dates for calculations rather than assuming every year is exactly 52 weeks. Allow a fractional final square. Totals are based on average hours over calendar days, including partial days, rather than an exact sleep/work timetable.

## First implementation

A local Electron desktop app with a life overview, editable categories, dated schedules, saved periods, and a separate countdown widget. No account, subscription, cloud connection, or health data is needed.

Implementation choices to try: a dark interface, a colour legend, and a draggable native widget window. The overview fits the window without scrolling: automatically choose the row count and square size to make all weeks visible, keeping squares as large as the available space permits. Refit when the window is resized. These can change after trying the app.

## Later possibilities

- Retirement schedules, holidays, or recurring schedule exceptions with easier setup.
- Compare an unsaved “what if?” schedule against the current one.
- Choose more than one countdown for the widget or cycle through favourites.
- A packaged Windows installer.
- Explore “100 Blocks a Day” as a separate view after the weeks experience feels right.

## Inspiration

- [Your Life in Weeks](https://waitbutwhy.com/2014/05/life-weeks.html): the original chronological life grid.
- [100 Blocks a Day](https://waitbutwhy.com/2016/10/100-blocks-day.html): a related daily exercise; outside the first version.

Our grouped time-category calculation extends the original life grid idea. We are creating our own interface and graphics.

## Guided introduction and timeline

First use keeps navigation hidden until dates and sleep/work hours are entered and setup is finished. Zero hours are valid. Setup resumes on reopening; the widget cannot bypass preliminary steps. The introduction shows an illustrative life, then the personal present, then the shape of everyday commitments. Life timeline and Time allocations are separate, synchronized views in the main app and expanded widget. Timeline rows use actual year boundaries, age/date axes, exact hover dates, and 52 equal-sized week blocks per year with extra days included in the final block. Chapter bands are illustrative examples with an overlapping parenting/caregiving lane. Allocation grids keep their wide layout. Their top axis counts equivalent weeks; My Life uses an explicitly labelled age-equivalent reference ruler on the left. These references do not imply activity dates. My Life defaults to allocations. Individual setup inputs preview independently, and additional weekly activities can be added before continuing.

## Switchable overview layouts

The default 52-week layout uses collapsed navigation, a left column for countdown and totals, and the grid on the right. Allocation column count and reference-axis labels remain stable across window sizes; only square size changes. A top-right Original layout switch preserves the previous full navigation, stacked cards, and adaptive wide grid. Both layouts and navigation expansion are saved preferences.
