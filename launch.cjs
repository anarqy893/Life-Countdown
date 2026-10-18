const { spawn } = require('node:child_process');
const environment = { ...process.env };
// Coding tools can set this flag for their own Node host. Electron needs app mode.
delete environment.ELECTRON_RUN_AS_NODE;
const child = spawn(require('electron'), process.argv.length > 2 ? process.argv.slice(2) : ['.'], {
  cwd: __dirname, env: environment, stdio: 'inherit', windowsHide: false
});
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
