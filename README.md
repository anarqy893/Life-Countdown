# Life Countdown

A Windows desktop app with a life-in-weeks grid, coloured time allocations, saved periods, and an optional always-on-top countdown widget.

Read [PROJECT.md](PROJECT.md) for the complete concept and decisions from our brainstorming.

## Run

Install [Node.js](https://nodejs.org/) if needed, then open a terminal in this folder:

```powershell
npm.cmd install
npm.cmd start
```

Or double-click **Start Life Countdown.cmd** after dependencies are installed.

## Use

On first use, a focused introduction opens without the navigation sidebar. It shows an illustrative life with labelled chapters, then asks for your birthday and reference age, shows your personal chronological timeline, offers an optional reflection on future occasions for something you love, and requires sleep and work hours (zero is allowed) with a live allocation preview. The widget introduction comes last; opening the widget is optional. Each input previews independently while the other is blank. Use + Add another activity for additional weekly commitments, with editable names, hours, and colours. Required sleep and work entries are checked when continuing. Normal navigation appears after setup is complete. Setup progress is saved; reopening resumes the unfinished step. After finishing, normal launches open **only the widget**, including the desktop shortcut and Windows sign-in. Existing profiles keep their settings and can explore **Help & tour** whenever they want.

Use **Your time** for dates, categories, and dated schedules. Use **Widget appearance** for opacity, hourly effects, and Windows startup. **Help & tour** explains the grid, periods, widget controls, tray, and saved settings, with a guided tour you can revisit without resetting your calendar. To open the full app from the widget, use its **arrow button** (restore the controls first in Counter only mode).

To start the widget when you sign in to Windows, open **Widget appearance** and check **Launch when I sign in to Windows**. The status beneath the checkbox confirms whether Windows has enabled startup. Uncheck it to stop automatic launch. This setting is stored in Windows and does not require the app to keep running after you enable it.

1. Open **Your time**, enter your birthday and reference age, and save.
2. Enter your typical sleep and work hours in the number boxes beside the category names, choose when they apply, and click **Save categories & hours**.
3. Add custom categories, then enter their hours in the same panel.
4. Add a dated schedule change when your habits change. For retirement, set work to zero from the relevant date.
5. Switch between My life and your saved periods. Add a custom date range for a life chapter such as your forties.
6. Open the countdown widget to keep the selected period above your other windows. Drag its background or countdown numbers to move it; buttons keep their usual actions.

Choose **Life timeline** or **Time allocations** above the grid in the full app. The expanded widget has its own remembered toggle between **Time allocations** and **What matters**, independent of the main app’s grid selection. The timeline uses age labels and weeks within each actual year; custom periods use row start dates. Timeline years have 52 equal-sized week blocks, with the extra one or two days included in the final block. Exact hover dates and calculations retain every day. Hover for dates and age. Chapter bands are illustrative examples, including overlapping parenting/caregiving, rather than assumed personal milestones. The sidebar collapses after selecting a tab or time period. Use its menu button on any page to expand it again; compact buttons retain labels on hover and for assistive technology. The default **52-week layout** places the countdown and totals to the left of the grid. Allocation grids keep 52 columns as the window resizes; square size changes instead. Use **Original layout** at the top right to restore the previous stacked cards and adaptive wide grid. Both layouts label the top axis in equivalent weeks, and the chosen layout is remembered. For My Life, the left ruler shows approximate age-equivalent references: a scale for the amount of time shown, not the ages when grouped activities happen. My Life opens on Time allocations; the timeline remains available explicitly.

New users start with total seconds, ticking every second. Click the countdown numbers to cycle through years/months/days, days/hours/minutes/seconds, weeks/days, total hours, and total seconds. The choice is saved and shared by all windows; existing preferences are preserved.

The widget reasserts its position above other windows after showing, restoring, waking, unlocking, and display changes. A once-per-second check also recovers when another topmost window covers it, without taking keyboard focus. This applies to normal, Counter only, Appearance, and expanded grid views. **Hide widget** keeps it hidden until you explicitly show it again.

Adjust **Background opacity** in **Widget appearance**, or click the widget’s **gear button** to reveal the slider. This fades only the widget’s background; the numbers stay visible. At 0%, the surrounding details hide until you hover over the countdown. Drag the widget’s background or countdown numbers to move it; buttons keep their usual actions.

Click **Counter only** in the widget to shrink it to a short strip with just the countdown and a small **⤢ restore button**. Click that button to bring back the normal widget. Hovering does not reveal extra details in this mode. Click the countdown to change its format, or drag the numbers to move the widget. Dragging does not change the format. The strip automatically fits the current format’s width, keeping the restore button beside the numbers. The mode is remembered when you reopen the widget.

Click the widget’s **Grid** button for a grid-focused view in the same window, using nearly the full usable monitor height. A compact toolbar replaces the large counter and colour bar, leaving room for larger squares. Allocation grids keep 52 columns even when the main app uses Original layout. A compact legend on the right scrolls independently for extra categories; detailed totals and explanations remain in the full app. Switch to **What matters** for a compact, scrollable view of saved experiences, colour-coded dots, counts, frequencies, and individual end ages. **Manage experiences** opens What matters directly in the full app. With no saved experiences, this view explains where to add them. Click **Collapse** or press **Escape** to restore the compact size and position. The expanded view stays inside the work area and shares the counter’s background opacity. Hovering does not open or dismiss it.

The normal widget and **Counter only** view each remember their own position automatically, including after closing the app or restarting Windows. Switching views restores that view’s last position. If a monitor is disconnected or the screen size changes, the widget is brought back inside the available desktop. Opening the grid does not overwrite these saved positions.

Life Countdown lives in the **system tray beside the Windows clock**, with a small green clock icon. The widget stays out of the taskbar. The full app has a taskbar button and stays there when minimized. Closing the full app removes its taskbar button while leaving the tray available. A quiet, one-time Windows tray notice explains where to find the app when it first runs without the full window; clicking the notice opens the full app. Click the tray icon to show the widget, or right-click it for **Show widget**, **Hide widget**, **Open full app**, and **Quit Life Countdown**. Double-clicking opens the full app. Closing a window leaves the app available in the tray; use **Quit Life Countdown** to exit completely. Launching the app again brings back the existing widget. If Windows places the icon in the hidden-icons menu, look under **^** beside the clock and drag it into the visible tray if desired.

The widget’s **gear button** swaps the countdown for compact Appearance controls inside the same widget. Its size and position stay unchanged. **Back** or **Escape** returns to the countdown.

Settings and countdown use the same background opacity. Moving the slider updates that background immediately; hovering does not change it. Text and controls stay fully visible.

For an hourly visual reminder, choose **Hourly visual effect → Soft pulse** or **Light sweep** in Appearance. Choosing an effect switches back to the countdown and previews it unobstructed. The saved effect repeats three times on each hour (about six seconds total), including in Counter only mode, without sound. Missed hours after sleep or shutdown are not replayed. Choose **Off** to disable it. The same controls are available in **Widget appearance**.

The first repetition spreads a soft green wave from the countdown numbers across that monitor’s usable desktop, leaving the Windows taskbar clear. The next two repetitions stay on the widget, with the numbers shining green each time. The desktop wave lets clicks pass through and does not take keyboard focus. Preview shows the same sequence.

Click any **legend item** to remove its squares; click again to restore them. Hidden groups remain listed, with detailed totals available in the full app. Hiding a group changes only what is displayed: it does not delete hours or turn them into unallocated time. Visibility is saved and shared between the main grid, expanded widget, and widget’s colour bar.

Each square is 168 hours. The chart uses a light background with outlined squares: crossed grey squares for elapsed time, coloured squares for categories, and white empty squares for unallocated time. These groups show equivalent weeks, not a chronological timetable. Boundary squares can contain portions of adjacent categories.

Sleep is entered per night and converted to a weekly average. All projections average hours across calendar days. The reference lifespan is an assumption, not a prediction. New periods use fixed start/end dates and share the same schedules.

Settings are stored locally in Electron’s user-data directory, normally `%APPDATA%\life-countdown\life-countdown.json`. The app does not send your settings to a server. Closing the main window leaves an open widget running; closing all windows leaves the app in the system tray. Use the tray menu to quit.

Time continues to count while the app is closed or the computer is asleep or powered off. The app calculates from saved dates and the current computer clock, and refreshes on wake, unlock, and returning to the app. No internet connection is required; keep the computer’s clock correct.

This version runs from the project folder. A packaged Windows installer is a possible future improvement.

The widget keeps the same logical size across screen resolutions; Windows display scaling determines its physical pixel size. Expanded grids adapt to available space, and the full app’s starting size is limited to the monitor’s work area. Simulated 1920×1080 checks cover 100%, 125%, and 150% scaling. Run `node launch.cjs tests/display.cjs 1.25` to repeat the 125% check; use `1` or `1.5` for the other scales.

## Check calculations

To test the complete first-use experience again, open **Help & tour → Reset & start fresh**. Confirm the reset to clear entries, reset widget appearance and positions, close the widget, and return to the welcome screen. Cancel keeps everything unchanged. A backup is saved before resetting under `%APPDATA%\life-countdown\backups`, containing the previous settings and widget positions. The Windows sign-in startup setting stays as configured.

```powershell
npm.cmd test
```

To exercise the desktop interface with separate test settings:

```powershell
npm.cmd run test:desktop
```

Run `npm.cmd run test:topmost` on Windows to check native window stacking, focus preservation, wake/unlock recovery, display changes, widget modes, and hiding/reopening with isolated test settings.

This checks setup, category editing, schedule validation, saved periods, persistence, and widget synchronization. It also saves a screenshot to `artifacts/preview.png` using sample data.

Run `npm.cmd run test:onboarding` for first-use, required entry validation, setup recovery, independent main/widget view choices, optional widget, settings separation, and tour replay checks. Use `node launch.cjs tests/onboarding.cjs 1.25` or `1.5` for scaling checks, and append `resume` to check unfinished setup at startup. Screenshots are saved under `artifacts/onboarding-*.png`.

Run `npm.cmd run test:layout` to check fixed columns and age labels across resizing, collapsible navigation, switching back to the original layout, and saved preferences. Append `1.25` or `1.5` using `node launch.cjs tests/layout.cjs 1.25` for scaling checks. Comparison screenshots are saved as `artifacts/layout-52-week-*.png` and `artifacts/layout-original-*.png`.

In the 52-week overview, the activity legend sits to the right of the grid and scrolls independently for longer lists. Activity names wrap, and toggling visibility preserves the list position and keyboard focus. The original layout keeps its legend below the grid.

In the widget Appearance controls, hourly effects use three inline buttons: Off, Soft pulse, and Light sweep. They stay inside the widget and do not open a dropdown over the opacity slider. All three choices return to the countdown. Soft pulse and Light sweep preview immediately; Off stops the effect.

### Meaningful occasions

The optional **What matters** setup step follows **Your weeks**. Signup uses two columns: six curated example bubbles, inline custom entry, and editable assumptions on the left; live dot counts on the right. Selecting a bubble immediately previews once a year until your reference age. Enter custom names one per line and press Add to include several on the same screen. Adjust How often using both fields (for example, 5 times every 1 year or 1 time every 3 years); time/times and year/years follow the entered values. Save & continue saves the selected activities together. Skip for now leaves existing saved reflections intact.

The **What matters** sidebar tab keeps the full 24-example picker, with More ideas and Review selected when adding activities. Add your own opens a batch editor even for a custom-only selection. Use Add your own again for more rows, set individual frequencies and end ages, and Save all together. An individual editor also has Add another experience, which keeps its entered values while moving into batch entry. Saved activities share one panel with matching Edit and Remove controls. Each dot represents one possible future occasion; counts above 120 show the remaining total alongside. Estimates start today, use each activity’s end age and chosen frequency, and round down. They do not infer past experiences or scheduled dates. A single note explains the dots, with details under How estimates work.

Each activity has an Until age field. Use my reference age is selected by default, so existing and new activities follow your selected life horizon. Uncheck it to choose a custom age (1–130), which stays fixed until edited. Changing your birthday updates all estimates; changing your reference age updates activities using the default. Reflections stay separate from My life and time allocations. They are saved locally, included in reset backups, and cleared by Reset & start fresh.
