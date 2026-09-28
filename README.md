<div align="center">

# WordLens

**Read any PDF. Click any word. Understand it instantly.**

Click a word while reading and get a simple-English explanation, Hinglish, Hindi, pronunciation and a real-life example in a side panel. Every lookup is saved, so you can revise later with spaced repetition.

![Node.js](https://img.shields.io/badge/Node.js-%E2%89%A518-3C873A?logo=node.js&logoColor=white)
![License](https://img.shields.io/badge/license-MIT-blue)
![PRs](https://img.shields.io/badge/PRs-welcome-7CB8FF)

<!-- Add a screenshot or GIF here: ![WordLens demo](docs/demo.gif) -->

</div>

---

## Table of Contents

- [Features](#features)
- [Quick Start](#quick-start)
- [AI Setup](#ai-setup)
- [Configuration](#configuration)
- [How It Works](#how-it-works)
- [Project Structure](#project-structure)
- [API](#api)
- [Privacy](#privacy)
- [Troubleshooting](#troubleshooting)
- [Known Limitations](#known-limitations)
- [Roadmap](#roadmap)
- [Contributing](#contributing)
- [License](#license)

## Features

**Reading**
- PDFs are rendered in the browser with [pdf.js](https://mozilla.github.io/pdf.js/). The file is never uploaded anywhere.
- Every English and Hindi (Devanagari) word is clickable.
- Hover prefetch: the meaning starts loading while your mouse rests on a word, so the click feels instant.
- Tough-word preview: the longest words in the PDF are listed at the top so you can learn them before you read.
- Light and dark theme, adjustable font size. Both are remembered.

**Understanding**
- Context-aware meaning: the whole sentence around the word is sent to the AI, so the explanation fits that sentence.
- Easy English, Hinglish, Hindi, pronunciation, an example and a real-life situation for each word.
- Select a sentence or paragraph (3+ words) to get it explained in easy English, Hinglish and Hindi.
- Listen button reads a word aloud (English or Hindi) using the browser's speech engine.
- Works without any key: falls back to a plain dictionary plus Hindi translation.

**Remembering**
- Every looked-up word is saved automatically.
- Mark words as Easy or Hard. Hard words get an orange underline in the text.
- Revise tab: spaced repetition (Leitner boxes), hard words first.
- Separate word list per PDF, with a progress bar.
- Export to Anki (CSV).

## Quick Start

Requires [Node.js](https://nodejs.org) v18 or newer.

```bash
npm install
npm start
```

Open **http://localhost:3000**, then choose **Open the reader** (`app.html`) and drop in a PDF.

## AI Setup

Without a key you get dictionary definitions only. With a free key you get the full easy explanations.

1. Create a free key:
   - Gemini: <https://aistudio.google.com/apikey>
   - Groq: <https://console.groq.com/keys>
2. Copy `.env.example` to `.env` and fill one line:
   ```env
   GEMINI_API_KEY=your_key_here
   ```
3. Restart the server. You should see:
   ```
   Easy explanations: ON (gemini)
   ```

If a provider fails or times out, WordLens automatically tries the next model and then the next provider, and finally the dictionary fallback.

## Configuration

Set these in `.env`. All are optional except one AI key if you want AI explanations.

| Variable | Purpose |
|---|---|
| `GEMINI_API_KEY` | Google Gemini (free tier) |
| `GROQ_API_KEY` | Groq (free tier) |
| `OPENAI_API_KEY` | OpenAI |
| `ANTHROPIC_API_KEY` | Anthropic |
| `LLM_MODEL` | Force a specific model for the first provider |
| `GEMINI_THINKING_BUDGET` / `GEMINI_THINKING_LEVEL` | Tune Gemini "thinking" time (lower is faster) |
| `PORT` | Server port (default `3000`) |

Provider order is Gemini, Groq, OpenAI, Anthropic. The first one with a key is tried first.

## How It Works

```
 Browser (pdf.js)  --click word + sentence-->  server.js  --> AI provider (optional)
                                                   |     --> dictionaryapi.dev + MyMemory (fallback)
 <-- meaning card ---------------------------------+
                                                   v
                                           data/words.json
```

- **Frontend** (`public/app.html`): renders the PDF, rebuilds lines into paragraphs, and makes each word clickable.
- **Backend** (`server.js`): builds the prompt, calls the AI with timeouts and fallbacks, caches answers and saves words.
- **Extra features** (`features.js`): easy/hard levels, spaced repetition, Anki export, per-PDF lists and the sentence simplifier.

## Project Structure

```
wordlens/
├── public/
│   ├── index.html      # Landing page
│   ├── app.html        # PDF reader
│   ├── style.css       # Reader styles (dark + light theme)
│   └── landing.css     # Landing page styles
├── data/
│   └── words.json      # Saved words (created automatically)
├── server.js           # Express server, AI calls, lookup, caching
├── features.js         # Levels, revision, export, simplify
├── diagnose.js         # Speed and connectivity check
├── .env.example        # Template for API keys
└── package.json
```

## API

| Method | Route | Description |
|---|---|---|
| `GET` | `/api/words` | All saved words |
| `POST` | `/api/lookup` | `{ word, context, pdf }` returns and saves an explanation |
| `PATCH` | `/api/words/:word` | Set `level`: `easy`, `hard` or `new` |
| `DELETE` | `/api/words/:word` | Remove a word |
| `POST` | `/api/review/:word` | `{ good }` updates the review schedule |
| `POST` | `/api/simplify` | `{ text }` explains a passage in easy words |
| `GET` | `/api/pdfs` | PDF names with word counts |
| `GET` | `/api/export?pdf=` | Anki CSV (enable "Allow HTML" when importing) |
| `GET` | `/api/status` | Whether AI is configured |

## Privacy

- The PDF itself stays in your browser.
- When you click a word, that word and its surrounding sentence are sent to your chosen AI provider (and to dictionaryapi.dev / MyMemory in fallback mode). If that matters for your document, do not use sensitive files, or leave the keys empty to use dictionary-only mode.
- Your saved words live in `data/words.json` on your machine. Do not commit it or `.env` to GitHub (add both to `.gitignore`).

## Troubleshooting

**AI is slow.** Run `node diagnose.js`. It tells you whether the delay is network/IPv6 or Gemini's "thinking" time and prints the `.env` lines to fix it.

**"AI could not answer".** The key is wrong or the free quota is used up. The app falls back to the dictionary answer.

**No words in the "This PDF" list.** Words saved before per-PDF tracking are only in "All PDFs". Click them again in the PDF to link them.

## Known Limitations

- Scanned PDFs (images without text) are not supported yet.
- Paragraphs are rebuilt from text positions, so complex layouts (multi-column, tables) may read out of order.
- Storage is a single JSON file, which is fine for personal use but not for many users.
- The server has no login, so run it locally only.

## Roadmap

- [ ] OCR for scanned PDFs
- [ ] Multi-column layout detection
- [ ] Progress and statistics export
- [ ] Optional SQLite storage
- [ ] Tests for the paragraph builder and review scheduler

## Contributing

1. Fork the repository
2. Create a branch: `git checkout -b feature/your-feature`
3. Commit: `git commit -m "Add your feature"`
4. Push and open a Pull Request

Please open an issue first for larger changes.

## License

MIT. See `LICENSE`.
