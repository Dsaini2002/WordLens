# WordLens

PDF padhte waqt kisi bhi word pe click karo → uska meaning (English definition + Hindi) right panel mein aa jaata hai, aur automatically save ho jaata hai taaki baad mein revise kar sako.

## Chalane ka tareeka (5 minute setup)

1. Node.js install hona chahiye (v18 ya usse upar). Check karo:
   ```
   node -v
   ```
   Agar nahi hai, [nodejs.org](https://nodejs.org) se install kar lo.

2. Is folder mein terminal khol kar dependencies install karo:
   ```
   npm install
   ```

3. Server start karo:
   ```
   npm start
   ```

4. Browser mein kholo: **http://localhost:3000**

5. Apni PDF drag-drop karo ya click karke choose karo, aur padhna shuru karo. Jo word na aaye, usko click karo.

Saare saved words `data/words.json` file mein store hote hain — yeh tumhara apna "backend database" hai, isko delete/backup/edit kar sakte ho.


## Aasaan bhasha mein explanation (AI) — 2 minute setup

Bina key ke app sirf dictionary wali mushkil definition dikhata hai. Key lagane par har word ke liye milta hai:
matlab aasaan words mein, Hindi, ek example sentence, aur "real life mein kahan dikhta hai".

1. Ek FREE key banao (koi ek):
   - Gemini: https://aistudio.google.com/apikey
   - Groq: https://console.groq.com/keys
2. Project folder mein `.env.example` file ko copy karke naam `.env` rakho.
3. `.env` mein apni key us line ke aage paste karo (sirf ek line bharni hai), jaise `GEMINI_API_KEY=abc123...`
4. Server dobara chalao (`Ctrl + C`, phir `npm start`). Terminal mein dikhega: `Easy explanations: ON (gemini)`.

Agar kisi word par "AI could not answer" dikhe, to key galat hai ya free limit poori ho gayi hai. Us waqt app dictionary wale jawab par wapas aa jaata hai.
Purane saved words (bina AI wale) agli baar click karne par apne aap AI se dobara samjhaye jaate hain.

## Kaise kaam karta hai

- **Frontend** (`public/index.html`): PDF ko `pdf.js` se browser mein hi render karta hai, text nikaal kar har word ko clickable bana deta hai.
- **Backend** (`server.js`): jab word click hota hai, do FREE APIs se meaning fetch karta hai:
  - [dictionaryapi.dev](https://dictionaryapi.dev) — English definition (no signup, no key)
  - [mymemory.translated.net](https://mymemory.translated.net) — Hindi translation (no signup, no key)
  - Result ko `data/words.json` mein save kar deta hai, so agli baar wahi word milte hi turant (cached) meaning dikha deta hai, dobara API call nahi lagti.

## Behtar (AI-powered, context-aware) meanings chahiye?

Abhi wala setup free hai lekin generic dictionary meaning deta hai (context nahi padhta). Agar tum chahte ho ki meaning us sentence ke context ke hisab se ho (jaise humne pehle chat mein banaya tha), to `server.js` ke andar `lookupWord()` function mein comment kiya hua OpenAI/ChatGPT wala code hai — usko uncomment karo aur apni API key daal do:

```bash
export OPENAI_API_KEY=sk-...   # Mac/Linux
setx OPENAI_API_KEY "sk-..."   # Windows
```

Free tier ke liye OpenAI ki jagah koi bhi free-tier LLM API (Groq, Gemini free tier, ya Anthropic ka apna) bhi wahi jagah plug kar sakte ho — bas fetch call ka URL/headers/body us provider ke hisab se badal dena.

## Aage badha sakte ho

- Hindi/Devanagari text ke words ke liye bhi click-support (abhi sirf English words detect hote hain)
- Ek "quiz me" button jo saved words se flashcard revision bana de
- Multiple PDFs ke liye alag-alag saved-word lists

## AI slow hai? Pehle yeh chalao

```
node diagnose.js
```
Yeh 1 minute mein bata deta hai ki deri internet/IPv6 ki wajah se hai ya Gemini ke "thinking" ki wajah se, aur `.env` mein daalne ki sahi lines print karta hai.
