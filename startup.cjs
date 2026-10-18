function startupSettings(app, { platform = process.platform, executable = process.execPath, directory = __dirname } = {}) {
  const options = { path: executable, args: app.isPackaged ? [] : [directory] };
  function read() {
    if (platform !== 'win32') return { supported: false, enabled: false };
    // Electron parses this lookup path as a command line, so spaces need quoting.
    const status = app.getLoginItemSettings({ ...options, path: `"${executable}"` });
    // openAtLogin looks up Electron's default entry name, not our custom entry.
    const enabled = status.launchItems.some(item => item.name === 'Life Countdown'
      && item.scope === 'user' && item.enabled && item.args.length === options.args.length
      && item.args.every((arg, index) => arg === options.args[index]));
    return { supported: true, enabled };
  }
  function set(enabled) {
    if (platform !== 'win32') throw new Error('Launch at sign-in is available on Windows.');
    if (typeof enabled !== 'boolean') throw new Error('Choose whether to launch at sign-in.');
    // Electron quotes these arguments when writing the registry command.
    app.setLoginItemSettings({ ...options, name: 'Life Countdown', openAtLogin: enabled, enabled });
    return read();
  }
  return { read, set };
}
module.exports = startupSettings;
