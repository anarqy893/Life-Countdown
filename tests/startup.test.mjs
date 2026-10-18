import test from 'node:test';
import assert from 'node:assert/strict';
import startupSettings from '../startup.cjs';

test('Windows startup handles spaces, a custom entry name, and disabled entries', () => {
  const executable = 'C:\\Apps With Spaces\\electron.exe';
  const directory = 'C:\\Life Countdown';
  let entry;
  const app = {
    isPackaged: false,
    setLoginItemSettings(options) {
      assert.equal(options.path, executable);
      assert.deepEqual(options.args, [directory], 'arguments must not contain literal quote characters');
      entry = options.openAtLogin ? { ...options, scope: 'user' } : undefined;
    },
    getLoginItemSettings(options) {
      assert.equal(options.path, `"${executable}"`, 'lookup needs a quoted executable path');
      return { openAtLogin: false, launchItems: entry ? [entry] : [] };
    }
  };
  const startup = startupSettings(app, { platform: 'win32', executable, directory });
  assert.equal(startup.read().enabled, false);
  assert.equal(startup.set(true).enabled, true, 'custom entry works even when openAtLogin is false');
  entry.enabled = false;
  assert.equal(startup.read().enabled, false, 'honor disabling through Windows settings');
  entry.enabled = true;
  entry.args = ['C:\\Another app'];
  assert.equal(startup.read().enabled, false, 'another app using Electron must not count');
  assert.equal(startup.set(false).enabled, false);
});
