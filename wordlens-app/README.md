# WordLens

Click any word while reading a PDF → its meaning (English definition) appears in the right panel and is saved automatically, so you can revise it later.

## How to run (5-minute setup)

1. You need Node.js installed (v18 or higher). Check with:
   ```
   node -v
   ```
   If it's not installed, get it from [nodejs.org](https://nodejs.org).

2. Open a terminal in this folder and install the dependencies:
   ```
   npm install
   ```

3. Start the server:
   ```
   npm start
   ```

4. Open in your browser: **http://localhost:3000**

5. Drag and drop your PDF (or click to choose one) and start reading. Click any word you don't know.

All saved words are stored in the `data/words.json` file. This is your own "backend database": you can delete, back up, or edit it.


## Simple-language explanations (AI): 2-minute setup

Without a key, the app only shows the dictionary's definition, which can be hard to understand. With a key, every word also gets:
the meaning in simple words, a Hindi translation, an example sentence, and "where you see it in real life".

1. Create a FREE key (either one):
   - Gemini: https://aistudio.google.com/apikey
   - Groq: https://console.groq.com/keys
2. In the project folder, copy the `.env.example` file and name the copy `.env`.
3. In `.env`, paste your key after the matching line (you only need to fill in one line), for example `GEMINI_API_KEY=abc123...`
4. Restart the server (`Ctrl + C`, then `npm start`). The terminal will show: `Easy explanations: ON (gemini)`.

If a word shows "AI could not answer", either the key is wrong or you've used up the free limit. When that happens, the app falls back to the dictionary answer.
Older saved words (saved without AI) are explained again by the AI automatically the next time you click them.

## How it works

- **Frontend** (`public/index.html`): renders the PDF in the browser with `pdf.js`, extracts the text, and makes every word clickable.
- **Backend** (`server.js`): when a word is clicked, it fetches the meaning from two FREE APIs:
  - [dictionaryapi.dev](https://dictionaryapi.dev): English definition (no signup, no key)
  - [mymemory.translated.net](https://mymemory.translated.net): Hindi translation (no signup, no key)
  - It saves the result to `data/words.json`, so the next time the same word comes up, the meaning shows instantly from the cache with no extra API call.

## Want better (AI-powered, context-aware) meanings?

The current setup is free, but it gives generic dictionary meanings and doesn't look at the context. If you want the meaning to match the sentence it appears in (like we built earlier in chat), there is commented-out OpenAI/ChatGPT code inside the `lookupWord()` function in `server.js`. Uncomment it and add your API key:

```bash
export OPENAI_API_KEY=sk-...   # Mac/Linux
setx OPENAI_API_KEY "sk-..."   # Windows
```

If you want a free tier, you can plug any free-tier LLM API (Groq, Gemini's free tier, or Anthropic's own) into the same spot instead of OpenAI. Just change the fetch call's URL, headers, and body to match that provider.

## Ideas for extending it

- Click support for Hindi/Devanagari words too (right now only English words are detected)
- A "Quiz me" button that turns saved words into flashcards for revision
- Separate saved-word lists for different PDFs

## AI slow? Run this first

```
node diagnose.js
```
In about a minute, this tells you whether the delay comes from your internet/IPv6 or from Gemini's "thinking", and it prints the correct lines to add to `.env`.
