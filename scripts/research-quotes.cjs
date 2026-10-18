const fs = require('node:fs');
const path = require('node:path');
const directory = path.join(__dirname, '../artifacts/quote-research');
fs.mkdirSync(directory, { recursive: true });
function clean(html) {
  return html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ').replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([\da-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
    .replace(/[\u200b\u00ad]/g, '').replace(/\s+/g, ' ').trim();
}
async function get(url) {
  const filename = path.join(directory, Buffer.from(url).toString('base64url') + '.json');
  if (fs.existsSync(filename)) return JSON.parse(fs.readFileSync(filename, 'utf8'));
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status}: ${url}`);
  const text = clean(await response.text());
  const result = { url, text };
  fs.writeFileSync(filename, JSON.stringify(result));
  return result;
}
async function main() {
  const jobs = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  for (let i = 0; i < jobs.length; i += 4) {
    const results = await Promise.allSettled(jobs.slice(i, i + 4).map(async job => {
      const source = await get(job.url);
      if (!job.find) return { url: source.url, text: source.text.slice(source.text.indexOf('mw-content-text') + 1, 18000) };
      return { url: source.url, matches: job.find.map(term => {
        const position = source.text.toLowerCase().indexOf(term.toLowerCase());
        return { term, passage: position < 0 ? 'NOT FOUND' : source.text.slice(Math.max(0, position - 100), position + 950) };
      }) };
    }));
    for (const result of results) console.log(JSON.stringify(result.status === 'fulfilled' ? result.value : { error: String(result.reason) }));
  }
}
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { get, clean };
