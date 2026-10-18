const fs = require('node:fs');
const path = require('node:path');
const artifacts = path.join(__dirname, '../artifacts');
const sources = fs.readdirSync(path.join(artifacts, 'quote-research')).map(filename => ({
  filename: filename.replace(/\.json$/, ''),
  ...JSON.parse(fs.readFileSync(path.join(artifacts, 'quote-research', filename), 'utf8'))
}));
const groups = ['quote-selections.json', 'quote-selections-extra.json']
  .flatMap(filename => JSON.parse(fs.readFileSync(path.join(artifacts, filename), 'utf8')));
const normal = value => value.normalize('NFKC').replace(/&[rl]squo;/g, "'")
  .replace(/[’']/g, '').replace(/[\u200b\u00ad]/g, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const escapeRegex = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const entries = [], errors = [], wordTotals = new Map();
for (const group of groups) {
  const source = sources.find(item => group.cache ? item.filename === group.cache : item.url === group.source && item.text.length > 50000)
    || sources.find(item => item.url === group.source);
  if (!source) { errors.push(`Missing source: ${group.cache || group.source}`); continue; }
  const sourceText = normal(source.text);
  for (const text of group.quotes) {
    const pieces = text.split(/…|\.\.\./).map(normal);
    const pattern = pieces.map(escapeRegex).join(' .*? ');
    const match = sourceText.match(new RegExp(pattern, 'u'));
    if (!match) errors.push(`${group.author}: ${text} [${group.cache || group.source}]`);
    const words = text.split(/\s+/).filter(word => /[\p{L}\p{N}]/u.test(word)).length;
    wordTotals.set(source.url, (wordTotals.get(source.url) || 0) + words);
    entries.push({ text, author: group.author, work: group.work, theme: group.theme,
      source: source.url, ...(group.translator ? { translator: group.translator } : {}),
      ...(group.context ? { context: group.context } : {}),
      verified: Boolean(match) });
  }
}
for (const [url, words] of wordTotals) if (words > 25) errors.push(`Source exceeds 25 quoted words (${words}): ${url}`);
if (entries.length !== 100) errors.push(`Expected 100 selections, got ${entries.length}`);
if (new Set(entries.map(entry => normal(entry.text))).size !== entries.length) errors.push('Duplicate quote');
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }

// Stable shuffle, with neighbouring quotes by different authors where possible.
let randomState = 20261017;
const random = () => { randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0; return randomState / 4294967296; };
for (let i = entries.length - 1; i > 0; i--) {
  const j = Math.floor(random() * (i + 1)); [entries[i], entries[j]] = [entries[j], entries[i]];
}
for (let i = 1; i < entries.length; i++) if (entries[i].author === entries[i - 1].author) {
  const j = entries.findIndex((entry, index) => index > i && entry.author !== entries[i - 1].author && entries[i].author !== entries[index + 1]?.author);
  if (j > i) [entries[i], entries[j]] = [entries[j], entries[i]];
}
// Append later selections after shuffling so existing review numbers never change.
const additionsPath = path.join(artifacts, 'quote-additions.json');
const additions = fs.existsSync(additionsPath) ? JSON.parse(fs.readFileSync(additionsPath, 'utf8')) : [];
for (const addition of additions) {
  if (!entries.some(entry => normal(entry.text) === normal(addition.text))) entries.push(addition);
}
entries.forEach((entry, index) => { entry.id = index + 1; });
const authorCount = new Set(entries.map(entry => entry.author).filter(author => author !== 'Unknown')).size;
const updateCount = text => text.replace(/\b100 (?=quotes|selections|reminders)/g, `${entries.length} `);
fs.writeFileSync(path.join(artifacts, 'quotes-reviewed.json'), JSON.stringify(entries, null, 2) + '\n');
const intro = 'A first collection for Life Countdown: finite time, attention, meaningful choices, relationships, rest, and appreciation. The original selections are short excerpts checked against the linked texts, not newly written paraphrases. Later additions identify any uncertain attribution. Initial capitals, punctuation, and line breaks are normalized for display; an ellipsis marks an internal omission. Older translations sometimes use formal language. Fictional dialogue is identified. This is a review collection; it has not been added to the app.';
const markdown = '# Life Countdown — 100 quotes for review\n\n' + intro + `\n\n100 selections · ${authorCount} authors · Checked 17 October 2026.\n\nTell me the numbers you want to keep or remove.\n\n` + entries.map(entry =>
  `### ${String(entry.id).padStart(3, '0')} · ${entry.theme}\n\n> ${entry.text}\n\n— **${entry.author}**, [${entry.work}](${entry.source})${entry.translator ? ` · Translation: ${entry.translator}` : ''}${entry.context ? `\n\n${entry.context}` : ''}\n`
).join('\n');
fs.writeFileSync(path.join(artifacts, 'QUOTES-REVIEW.md'), updateCount(markdown));
const esc = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const themes = [...new Set(entries.map(entry => entry.theme))].sort();
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Life Countdown — 100 quotes for review</title><style>
:root{color-scheme:dark;font-family:'Segoe UI',sans-serif;background:#111719;color:#e6ede9}*{box-sizing:border-box}body{margin:0}main{max-width:1120px;margin:auto;padding:46px 24px 80px}.eyebrow{color:#c4e29e;font-size:12px;letter-spacing:2px;text-transform:uppercase}h1{font-size:40px;font-weight:500;letter-spacing:-1px;margin:12px 0 16px}p{line-height:1.7;color:#afc0b7;max-width:850px}.stats{color:#c4e29e}.controls{display:flex;gap:12px;flex-wrap:wrap;margin:28px 0 14px}input,select{font:inherit;background:#1a2527;color:inherit;border:1px solid #3b4d43;border-radius:8px;padding:11px 12px}input{flex:1;min-width:200px}select{max-width:100%}.count{font-size:13px;margin-bottom:22px}#quotes{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}.quote{background:#182224;border:1px solid #34473d;border-radius:12px;padding:24px;display:flex;flex-direction:column;min-width:0}.quote[hidden]{display:none}.meta{display:flex;justify-content:space-between;gap:16px;font-size:11px;letter-spacing:.5px;color:#b7cc9d}blockquote{font-size:22px;line-height:1.5;letter-spacing:-.2px;margin:24px 0;flex:1}footer{font-size:13px;line-height:1.6;color:#b5c4ba}footer strong{display:block;color:#edf3e8;font-size:14px;font-weight:600}a{color:#c4e29e;text-underline-offset:3px}small{display:block;font-size:11px;color:#99aba2;margin-top:4px}.context{font-size:12px;color:#b9c7bf;margin:8px 0 0}#empty{display:none}@media(max-width:700px){main{padding:26px 16px}h1{font-size:30px}#quotes{grid-template-columns:1fr}.quote{padding:20px}blockquote{font-size:21px}}@media print{:root{color-scheme:light;background:white;color:black}.controls,.count{display:none}#quotes{display:block}.quote{background:white;color:black;break-inside:avoid;margin:12px 0;border-color:#ccc}blockquote{font-size:16px}footer,footer strong,small,.meta,p{color:#333}a{color:#333}}
</style></head><body><main><div class="eyebrow">Life Countdown · Quote review</div><h1>100 reminders to live thoughtfully.</h1><p>${esc(intro)}</p><p class="stats">100 selections · ${authorCount} authors · 6 themes</p><p>Each quote has a number. Tell me which numbers you want to keep or remove.</p><div class="controls"><input id="search" type="search" aria-label="Search quotes or authors" placeholder="Search quotes, authors, or works…"><select id="theme" aria-label="Filter by theme"><option value="">All themes</option>${themes.map(theme => `<option>${esc(theme)}</option>`).join('')}</select></div><p class="count" id="count" aria-live="polite">Showing all 100 quotes</p><section id="quotes">${entries.map(entry => `<article class="quote" data-theme="${esc(entry.theme)}"><div class="meta"><span>#${String(entry.id).padStart(3, '0')}</span><span>${esc(entry.theme)}</span></div><blockquote>“${esc(entry.text)}”</blockquote><footer><strong>${esc(entry.author)}</strong><a href="${esc(entry.source)}" target="_blank" rel="noopener noreferrer">${esc(entry.work)}</a>${entry.translator ? `<small>Translation: ${esc(entry.translator)}</small>` : ''}${entry.context ? `<p class="context">${esc(entry.context)}</p>` : ''}</footer></article>`).join('')}</section><p id="empty">No matching quotes. Try another word or theme.</p></main><script>
const search=document.getElementById('search'),theme=document.getElementById('theme'),cards=[...document.querySelectorAll('.quote')];
function filter(){let count=0;const query=search.value.trim().toLocaleLowerCase();for(const card of cards){const visible=(!theme.value||card.dataset.theme===theme.value)&&(!query||card.textContent.toLocaleLowerCase().includes(query));card.hidden=!visible;if(visible)count++;}document.getElementById('count').textContent='Showing '+count+' of 100 quotes';document.getElementById('empty').style.display=count?'none':'block';}search.addEventListener('input',filter);theme.addEventListener('change',filter);
</script></body></html>`;
fs.writeFileSync(path.join(artifacts, 'quotes-review.html'), updateCount(html));
console.log(`Compiled ${entries.length} quotes: ${entries.filter(entry => entry.verified).length} source-checked selections and ${entries.filter(entry => !entry.verified).length} with unverified attribution.`);
