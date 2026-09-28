// WordLens extra features (server side): easy/hard level, spaced repetition,
// Anki export, per-PDF word lists, sentence simplifier.
// Plug in from server.js with ONE line (see README of the changes).
module.exports = function (app, { readDB, writeDB, providers, callOne, modelsFor, fetchT }) {
  const DAY = 864e5, GAP = [0, 1, 3, 7, 14, 30];      // review gaps in days, by box 0..5
  const change = (word, fn) => { const db = readDB(), e = db[String(word).toLowerCase()]; if (!e) return null; fn(e); writeDB(db); return e; };

  // keep level / review progress / pdf list when an entry is (re)saved
  const keep = (old, entry, pdf) => ({ ...entry,
    level: old?.level || 'new', box: old?.box || 0, due: old?.due || 0,
    pdfs: [...new Set([...(old?.pdfs || []), ...(pdf ? [pdf] : [])])], savedAt: Date.now() });

  // remember which PDF a (cached) word was met in
  const track = (db, key, pdf) => { const e = db[key]; if (pdf && !(e.pdfs || []).includes(pdf)) { e.pdfs = [...(e.pdfs || []), pdf]; writeDB(db); } return e; };

  app.patch('/api/words/:word', (req, res) => {
    const lv = ['easy', 'hard'].includes(req.body.level) ? req.body.level : 'new';
    const e = change(req.params.word, x => { x.level = lv; }); e ? res.json(e) : res.sendStatus(404);
  });

  // Leitner boxes: right -> next box (longer gap), wrong -> back to box 0
  app.post('/api/review/:word', (req, res) => {
    const e = change(req.params.word, x => { x.box = req.body.good ? Math.min((x.box || 0) + 1, 5) : 0; x.due = Date.now() + GAP[x.box] * DAY; });
    e ? res.json(e) : res.sendStatus(404);
  });

  app.get('/api/pdfs', (req, res) => {
    const c = {}; Object.values(readDB()).forEach(w => (w.pdfs || []).forEach(p => { c[p] = (c[p] || 0) + 1; })); res.json(c);
  });

  // Anki: File > Import, tick "Allow HTML in fields". Columns: front, back.
  app.get('/api/export', (req, res) => {
    const q = s => '"' + String(s || '').replace(/"/g, '""') + '"', pdf = req.query.pdf;
    const rows = Object.values(readDB()).filter(w => !pdf || (w.pdfs || []).includes(pdf)).map(w => [
      w.word + (w.pronunciation ? `<br><small>${w.pronunciation}</small>` : ''),
      [w.simple, w.hinglish, w.hindi, w.example && `<i>${w.example}</i>`].filter(Boolean).join('<br>')].map(q).join(','));
    res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename=wordlens-anki.csv' }).send('\ufeff' + rows.join('\n'));
  });

  // Select a sentence / paragraph -> easy English + Hinglish + Hindi
  app.post('/api/simplify', async (req, res) => {
    const text = String(req.body.text || '').slice(0, 1500);
    const prompt = `A Hindi speaker is learning English. Explain this text in very easy words. Reply with ONLY JSON: {"simple":"same meaning in very easy English","hinglish":"same meaning in easy Hinglish (Hindi written in English letters)","hindi":"Hindi translation in Devanagari"}\n\nText: ${text}`;
    let out = null, err = '';
    const list = providers();
    for (let i = 0; i < list.length && !out; i++)
      for (const m of modelsFor(list[i], i === 0)) {
        if (!m) continue;
        try { out = await callOne(list[i], m, prompt, 9000); break; } catch (e) { err = String(e.message || e); }
      }
    if (!out) {
      out = { simple: '', hinglish: '', hindi: '', note: list.length ? 'AI could not answer: ' + err.slice(0, 100) : 'Add a free API key for easy explanations.' };
      try { const r = await fetchT('https://api.mymemory.translated.net/get?q=' + encodeURIComponent(text.slice(0, 450)) + '&langpair=en|hi', {}, 4000);
        if (r.ok) out.hindi = (await r.json())?.responseData?.translatedText || ''; } catch {}
    }
    res.json(out);
  });

  return { keep, track };
};