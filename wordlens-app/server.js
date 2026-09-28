// WordLens backend
//  GET    /api/words          -> saved words
//  POST   /api/lookup         -> { word, context, pdf } -> easy explanation, saved
//  DELETE /api/words/:word    -> remove one
//  (features.js adds: PATCH /api/words/:word, POST /api/review/:word,
//   GET /api/pdfs, GET /api/export, POST /api/simplify)
//
// Easy explanations use an AI provider if you set a key (see README):
//   GEMINI_API_KEY (free) | GROQ_API_KEY (free) | OPENAI_API_KEY | ANTHROPIC_API_KEY
// With no key, it falls back to a plain dictionary + Hindi translation.

// Node's fetch can hang for ~10s+ on some networks when it tries IPv6 first (Google, Groq etc.).
// Prefer IPv4 so calls connect immediately.
require('dns').setDefaultResultOrder('ipv4first');
try { require('net').setDefaultAutoSelectFamily(true); } catch {}

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

// tiny .env loader (so you can just put KEY=value lines in a .env file)
try {
  fs.readFileSync(path.join(__dirname, '.env'), 'utf-8').split(/\r?\n/).forEach(line => {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  });
} catch { /* no .env file — fine */ }

const app = express();
const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'data', 'words.json');

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function readDB() { try { return JSON.parse(fs.readFileSync(DB_FILE, 'utf-8')); } catch { return {}; } }
function writeDB(d) {
  fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
  fs.writeFileSync(DB_FILE, JSON.stringify(d, null, 2));
}

async function fetchT(url, options = {}, ms = 8000) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try { return await fetch(url, { ...options, signal: c.signal }); }
  finally { clearTimeout(t); }
}

// ---------------- AI explanation ----------------
const E = process.env;
let geminiModel = '';

// Order: Gemini, Groq, OpenAI, Anthropic (first one with a key is used first)
function providers() {
  const l = [];
  if (E.GEMINI_API_KEY)    l.push('gemini');
  if (E.GROQ_API_KEY)      l.push('groq');
  if (E.OPENAI_API_KEY)    l.push('openai');
  if (E.ANTHROPIC_API_KEY) l.push('anthropic');
  return l;
}
function provider() { return providers()[0] || null; }

function buildPrompt(word, context) {
  // Hindi (Devanagari) word clicked: explain it in English instead
  const hi = /[\u0900-\u097F]/.test(word)
    ? 'NOTE: the clicked word is HINDI. Put its English meaning in "simple" and the Hindi word itself in "hindi".\n'
    : '';
  return hi + `A Hindi speaker is learning English. They clicked the word "${word}" in: "${context}"
Explain in very simple short words. "Hinglish" means Hindi written in English letters, the way Indians text (for example: "Iska matlab hai ki...").
Reply with ONLY JSON:
{"partOfSpeech":"noun/verb/adjective/...","pronunciation":"how to say it: English-letter sounds with the stressed part in CAPITALS, then the Devanagari, e.g. bi-YOND / बियॉन्ड","simple":"meaning in this text, 1-2 easy English sentences","hinglish":"the same meaning explained in easy Hinglish, 1-2 sentences","hindi":"Hindi meaning in Devanagari, 1-4 words","example":"one short easy English example sentence","exampleHinglish":"that example sentence explained in Hinglish","realWorld":"1-2 easy English sentences: a real-life situation where this word or idea appears","realWorldHinglish":"that real-life situation in easy Hinglish"}`;
}

function parseJSON(text) {
  const cleaned = String(text).replace(/```json|```/g, '').trim();
  const start = cleaned.indexOf('{'), end = cleaned.lastIndexOf('}');
  return JSON.parse(cleaned.slice(start, end + 1));
}

function geminiGenConfig() {
  const g = { responseMimeType: 'application/json', maxOutputTokens: 1000 };
  if (E.GEMINI_THINKING_LEVEL)  g.thinkingConfig = { thinkingLevel: E.GEMINI_THINKING_LEVEL };
  else if (E.GEMINI_THINKING_BUDGET !== undefined && E.GEMINI_THINKING_BUDGET !== '')
    g.thinkingConfig = { thinkingBudget: Number(E.GEMINI_THINKING_BUDGET) };
  return g;
}

// one call to one model; throws on any failure (incl. timeout)
async function callOne(p, model, prompt, ms) {
  let r, text = '';
  if (p === 'gemini') {
    r = await fetchT(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${E.GEMINI_API_KEY}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }],
                               generationConfig: geminiGenConfig() }) }, ms);
    if (!r.ok) throw new Error(`Gemini(${model}) ${r.status} ${(await r.text()).slice(0, 120)}`);
    const d = await r.json();
    text = d.candidates?.[0]?.content?.parts?.map(x => x.text || '').join('') || '';
  } else if (p === 'groq' || p === 'openai') {
    const url = p === 'groq' ? 'https://api.groq.com/openai/v1/chat/completions'
                             : 'https://api.openai.com/v1/chat/completions';
    const key = p === 'groq' ? E.GROQ_API_KEY : E.OPENAI_API_KEY;
    r = await fetchT(url, { method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
      body: JSON.stringify({ model, response_format: { type: 'json_object' }, max_tokens: 700,
                             messages: [{ role: 'user', content: prompt }] }) }, ms);
    if (!r.ok) throw new Error(`${p}(${model}) ${r.status} ${(await r.text()).slice(0, 120)}`);
    text = (await r.json()).choices?.[0]?.message?.content || '';
  } else {
    r = await fetchT('https://api.anthropic.com/v1/messages', { method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': E.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model, max_tokens: 700, messages: [{ role: 'user', content: prompt }] }) }, ms);
    if (!r.ok) throw new Error(`Anthropic(${model}) ${r.status} ${(await r.text()).slice(0, 120)}`);
    text = (await r.json()).content?.map(x => x.text || '').join('') || '';
  }
  return parseJSON(text);
}

function modelsFor(p, isFirst) {
  const forced = isFirst && E.LLM_MODEL ? [E.LLM_MODEL] : null;
  if (forced) return forced;
  if (p === 'gemini')    return [geminiModel, 'gemini-3.5-flash-lite', 'gemini-3.5-flash'];
  if (p === 'groq')      return ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant'];
  if (p === 'openai')    return ['gpt-4o-mini'];
  return ['claude-haiku-4-5-20251001'];
}

// Try each provider/model quickly; every attempt gets at most 7s, whole lookup at most ~14s.
async function aiExplain(word, context) {
  const list = providers();
  if (!list.length) return null;
  const prompt = buildPrompt(word, context);
  const deadline = Date.now() + 14000;
  let lastErr = '';
  for (let i = 0; i < list.length; i++) {
    const p = list[i];
    const models = modelsFor(p, i === 0).filter((m, k, arr) => m && arr.indexOf(m) === k);
    for (const model of models) {
      const left = deadline - Date.now();
      if (left < 1500) throw new Error(lastErr || 'AI took too long');
      try {
        const t0 = Date.now();
        const j = await callOne(p, model, prompt, Math.min(7000, left));
        console.log(`AI ok: ${p}/${model} in ${Date.now() - t0} ms`);
        if (p === 'gemini') geminiModel = model;
        return { partOfSpeech: j.partOfSpeech || '', simple: j.simple || '', hindi: j.hindi || '',
                 example: j.example || '', realWorld: j.realWorld || '',
                 pronunciation: j.pronunciation || '', hinglish: j.hinglish || '',
                 exampleHinglish: j.exampleHinglish || '', realWorldHinglish: j.realWorldHinglish || '',
                 _via: `${p}/${model}`, _ms: Date.now() - t0 };
      } catch (e) {
        lastErr = e.name === 'AbortError' ? `${p}(${model}) took too long` : String(e.message || e);
        console.error('AI attempt failed:', lastErr);
        if (/ 40[13] /.test(lastErr)) break;      // bad key / no access: skip this provider's other models
      }
    }
  }
  throw new Error(lastErr || 'AI failed');
}

// ---------------- plain fallback (no key) ----------------
async function dictionaryFallback(word) {
  const dict = (async () => {
    try {
      const r = await fetchT(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`, {}, 4000);
      if (r.ok) { const m = (await r.json())[0]?.meanings?.[0];
        return { partOfSpeech: m?.partOfSpeech || '', definition: m?.definitions?.[0]?.definition || '' }; }
    } catch {}
    return { partOfSpeech: '', definition: '' };
  })();
  const hin = (async () => {
    try {
      const r = await fetchT(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(word)}&langpair=en|hi`, {}, 4000);
      if (r.ok) return (await r.json())?.responseData?.translatedText || '';
    } catch {}
    return '';
  })();
  const [d, hindi] = await Promise.all([dict, hin]);   // both at once
  return { partOfSpeech: d.partOfSpeech, simple: d.definition, hindi, example: '', realWorld: '', pronunciation: '', hinglish: '', exampleHinglish: '', realWorldHinglish: '' };
}

// ---------------- routes ----------------
// extra features: easy/hard, revise, Anki export, per-PDF lists, simplify (see features.js)
const { keep, track } = require('./features')(app, { readDB, writeDB, providers, callOne, modelsFor, fetchT });

app.get('/api/status', (req, res) => res.json({ ai: !!provider(), providers: providers() }));

app.get('/api/words', (req, res) => {
  res.json(Object.values(readDB()).sort((a, b) => b.savedAt - a.savedAt));
});

const memCache = new Map();   // answers fetched while hovering — not "saved words" until clicked

app.post('/api/lookup', async (req, res) => {
  const { word, context, prefetch, pdf } = req.body || {};
  if (!word || typeof word !== 'string') return res.status(400).json({ error: 'word is required' });

  const key = word.toLowerCase().trim();
  const db = readDB();
  const saved = db[key];
  // reuse a saved answer, unless it's a plain fallback one and AI is now available
  if (saved && ((saved.ai && saved.hinglish) || !provider())) return res.json(prefetch ? saved : track(db, key, pdf));

  const save = entry => { if (!prefetch) { db[key] = keep(saved, entry, pdf); writeDB(db); } };

  // already fetched while hovering? answer instantly (and save now if this is a real click)
  const warm = memCache.get(key);
  if (warm) { save(warm.entry); return res.json({ ...warm.entry, level: saved?.level || 'new', via: warm.via, ms: 0 }); }

  const tStart = Date.now();
  let result = null, ai = false, error = '';
  try { result = await aiExplain(key, (context || key).slice(0, 400)); ai = !!result; }
  catch (e) { error = String(e.message || e); console.error('AI lookup failed:', error); }
  if (!result) result = await dictionaryFallback(key);

  const entry = {
    word: key,
    partOfSpeech: result.partOfSpeech,
    simple: result.simple || 'No meaning found.',
    hindi: result.hindi,
    example: result.example,
    realWorld: result.realWorld,
    pronunciation: result.pronunciation || '',
    hinglish: result.hinglish || '',
    exampleHinglish: result.exampleHinglish || '',
    realWorldHinglish: result.realWorldHinglish || '',
    context: context || '',
    ai,
    savedAt: Date.now()
  };
  if (ai) memCache.set(key, { entry, via: result._via || '' });
  save(entry);
  res.json({ ...entry, level: saved?.level || 'new', aiError: ai ? '' : (provider() ? error : ''), via: result._via || '', ms: Date.now() - tStart });
});

app.delete('/api/words/:word', (req, res) => {
  const db = readDB();
  delete db[req.params.word.toLowerCase()];
  writeDB(db);
  res.json({ ok: true });
});

async function startupCheck() {
  if (!E.GEMINI_API_KEY) return;
  const t0 = Date.now();
  try {
    const r = await fetchT(`https://generativelanguage.googleapis.com/v1beta/models?pageSize=1&key=${E.GEMINI_API_KEY}`, {}, 10000);
    console.log(r.ok ? `Gemini reachable in ${Date.now() - t0} ms` : `Gemini check failed: HTTP ${r.status} (is the key correct?)`);
  } catch (e) {
    console.log(`Gemini NOT reachable from Node after ${Date.now() - t0} ms: ${e.message}. Check internet/VPN/proxy.`);
  }
}

app.listen(PORT, () => {
  startupCheck();
  console.log(`WordLens running at http://localhost:${PORT}`);
  console.log(provider() ? `Easy explanations: ON (${providers().join(' -> ')})`
                         : 'Easy explanations: OFF — add a free API key (see README)');
});