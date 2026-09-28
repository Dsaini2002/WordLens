// Run:  node diagnose.js
// Finds out WHY the AI is slow and prints the fastest settings for your .env

const fs = require('fs');
const path = require('path');
const dns = require('dns').promises;
const net = require('net');

try {
  fs.readFileSync(path.join(__dirname, '.env'), 'utf-8').split(/\r?\n/).forEach(line => {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  });
} catch {}

const KEY = process.env.GEMINI_API_KEY;
const HOST = 'generativelanguage.googleapis.com';
const since = t => Date.now() - t;
const line = (...a) => console.log(...a);

const PROMPT = `Reader clicked the word "taciturn" in: "the keeper had grown taciturn over the years"
Explain for a beginner in very simple short words. Reply with ONLY JSON:
{"partOfSpeech":"","simple":"","hindi":"","example":"","realWorld":""}`;

function tcpTest(host, family) {
  return new Promise(resolve => {
    const t = Date.now();
    const s = net.connect({ host, port: 443, family });
    const to = setTimeout(() => { s.destroy(); resolve({ ok: false, ms: since(t), err: 'no connection after 6s' }); }, 6000);
    s.on('connect', () => { clearTimeout(to); s.destroy(); resolve({ ok: true, ms: since(t) }); });
    s.on('error', e => { clearTimeout(to); resolve({ ok: false, ms: since(t), err: e.code || e.message }); });
  });
}

async function geminiCall(model, genExtra) {
  const c = new AbortController();
  const timer = setTimeout(() => c.abort(), 30000);
  const t = Date.now();
  try {
    const r = await fetch(`https://${HOST}/v1beta/models/${model}:generateContent?key=${KEY}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: c.signal,
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: PROMPT }] }],
        generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 700, ...genExtra }
      })
    });
    const headersMs = since(t);
    const body = await r.text();
    const totalMs = since(t);
    if (!r.ok) {
      let msg = body.slice(0, 140).replace(/\s+/g, ' ');
      try { msg = JSON.parse(body).error.message.slice(0, 140); } catch {}
      return { ok: false, headersMs, totalMs, err: `HTTP ${r.status}: ${msg}` };
    }
    const j = JSON.parse(body);
    const u = j.usageMetadata || {};
    return { ok: true, headersMs, totalMs, thoughts: u.thoughtsTokenCount || 0, out: u.candidatesTokenCount || 0 };
  } catch (e) {
    return { ok: false, headersMs: since(t), totalMs: since(t), err: e.name === 'AbortError' ? 'no answer in 30s' : e.message };
  } finally { clearTimeout(timer); }
}

(async () => {
  line('\n=== WordLens diagnose ===');
  line('Node version:', process.version);
  ['HTTP_PROXY', 'HTTPS_PROXY', 'http_proxy', 'https_proxy'].forEach(k => {
    if (process.env[k]) line(`NOTE: ${k} is set (${process.env[k]}) — Node fetch ignores it, that can cause trouble`);
  });
  if (!KEY) { line('\nGEMINI_API_KEY not found in .env — add it and run again.'); return; }

  // 1. DNS + raw connection speed, IPv4 vs IPv6
  line('\n[1] Network to Google');
  for (const family of [4, 6]) {
    const t = Date.now();
    try {
      const addrs = await dns.lookup(HOST, { family, all: true });
      line(`  IPv${family} DNS: ${addrs.length} address(es) in ${since(t)} ms`);
      const c = await tcpTest(addrs[0].address, family);
      line(`  IPv${family} connect: ${c.ok ? 'OK in ' + c.ms + ' ms' : 'FAILED (' + c.err + ') after ' + c.ms + ' ms'}`);
    } catch (e) { line(`  IPv${family}: not available (${e.code || e.message})`); }
  }

  // 2. Key check
  line('\n[2] API key check');
  {
    const t = Date.now();
    try {
      const r = await fetch(`https://${HOST}/v1beta/models?pageSize=1&key=${KEY}`);
      line(`  HTTP ${r.status} in ${since(t)} ms ${r.ok ? '(key works)' : '(key problem?)'}`);
    } catch (e) { line('  FAILED:', e.message); }
  }

  // 3. Real calls: each model x thinking setting
  line('\n[3] Real answers (same prompt the app uses). Slow ones can take up to 30s...');
  const models = process.env.LLM_MODEL ? [process.env.LLM_MODEL]
    : ['gemini-3.5-flash-lite', 'gemini-3.5-flash'];
  const variants = [
    { name: 'default settings',      extra: {},                                                   env: '' },
    { name: 'thinkingLevel=minimal', extra: { thinkingConfig: { thinkingLevel: 'minimal' } },     env: 'GEMINI_THINKING_LEVEL=minimal' },
    { name: 'thinkingBudget=0',      extra: { thinkingConfig: { thinkingBudget: 0 } },            env: 'GEMINI_THINKING_BUDGET=0' }
  ];
  const results = [];
  for (const model of models) {
    for (const v of variants) {
      const r = await geminiCall(model, v.extra);
      results.push({ model, v, r });
      line(`  ${model.padEnd(24)} ${v.name.padEnd(22)} ` + (r.ok
        ? `${String(r.totalMs).padStart(5)} ms   (thinking tokens: ${r.thoughts}, answer tokens: ${r.out})`
        : `FAILED after ${r.totalMs} ms -> ${r.err}`));
    }
  }

  // 4. Verdict
  const good = results.filter(x => x.r.ok).sort((a, b) => a.r.totalMs - b.r.totalMs);
  line('\n=== Result ===');
  if (!good.length) {
    line('No call worked. Read the errors above:');
    line(' - "no answer in 30s" / connect FAILED  -> internet, VPN, firewall or IPv6 problem');
    line(' - HTTP 400/403                         -> wrong key, or key has no access');
    line(' - HTTP 404                             -> that model name is retired');
    line(' - HTTP 429                             -> free limit reached, wait a minute');
    return;
  }
  const best = good[0];
  line(`Fastest: ${best.model} with "${best.v.name}" = ${best.r.totalMs} ms`);
  line('\nPut these lines in your .env:');
  line(`  GEMINI_API_KEY=${KEY.slice(0, 6)}...(your key)`);
  line(`  LLM_MODEL=${best.model}`);
  if (best.v.env) line(`  ${best.v.env}`);
  const def = results.find(x => x.model === best.model && x.v.name === 'default settings');
  if (def && def.r.ok && def.r.thoughts > 50) line('\nWhy it was slow: the model was "thinking" (' + def.r.thoughts + ' hidden tokens) before answering. The setting above turns that down.');
  if (best.r.totalMs > 4000) line('\nEven the fastest is slow, so the delay is your network to Google (see step 1). Try without VPN, or use a Groq key as well (it is very fast).');
})();
