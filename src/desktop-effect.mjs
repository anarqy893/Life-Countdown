const canvas = document.querySelector('canvas');
const ctx = canvas.getContext('2d');
window.desktopEffect.onStart(({ effect, origin, duration }) => {
  const width = innerWidth, height = innerHeight, scale = devicePixelRatio;
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  ctx.scale(scale, scale);
  canvas.dataset.effect = effect;
  canvas.dataset.origin = JSON.stringify(origin);
  const reach = Math.max(...[[0, 0], [width, 0], [0, height], [width, height]]
    .map(([x, y]) => Math.hypot(x - origin.x, y - origin.y)));
  const band = Math.max(65, reach * (effect === 'sweep' ? .12 : .045));
  const start = performance.now();
  function frame(now) {
    const progress = Math.min(1, (now - start) / duration);
    ctx.clearRect(0, 0, width, height);
    if (progress >= 1) { window.desktopEffect.done(); return; }
    // One outward wave, softly appearing at the counter and fading beyond the farthest corner.
    const radius = (reach + band) * (1 - Math.pow(1 - progress, 1.6));
    const opacity = Math.min(1, progress / .1) * Math.min(1, (1 - progress) / .25);
    const inner = Math.max(0, radius - band);
    const gradient = ctx.createRadialGradient(origin.x, origin.y, inner, origin.x, origin.y, radius + band);
    gradient.addColorStop(0, 'rgba(118,239,101,0)');
    gradient.addColorStop(.48, `rgba(185,255,135,${opacity * (effect === 'sweep' ? .19 : .24)})`);
    gradient.addColorStop(.56, `rgba(208,255,174,${opacity * .28})`);
    gradient.addColorStop(1, 'rgba(118,239,101,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
});
