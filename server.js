// Простой ИИ-репетитор: сервер на Express + Gemini API
const express = require('express');
const path = require('path');

const app = express();
app.use(express.json({ limit: '100kb' }));
app.use(express.static(path.join(__dirname, 'public')));

const KEY = process.env.GEMINI_KEY;
const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite';

// Роль ИИ — меняй под себя
const SYSTEM_PROMPT = `Ты дружелюбный ИИ-репетитор для школьников.
Объясняй просто, коротко, с примерами из жизни.
После объяснения задай один проверочный вопрос.
Если ученик ответил — скажи, верно ли, и поясни ошибку.
Отвечай на языке ученика (русский или казахский).`;

// Защита от спама: не больше 20 запросов в минуту с одного IP
const hits = new Map();
function rateLimit(req, res, next) {
  const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.ip;
  const now = Date.now();
  const list = (hits.get(ip) || []).filter(t => now - t < 60_000);
  if (list.length >= 20) return res.status(429).json({ error: 'Слишком много запросов, подожди минуту' });
  list.push(now);
  hits.set(ip, list);
  next();
}

app.post('/api/chat', rateLimit, async (req, res) => {
  if (!KEY) return res.status(500).json({ error: 'На сервере не задан GEMINI_KEY' });

  const history = Array.isArray(req.body.history) ? req.body.history.slice(-20) : [];
  const memory = Array.isArray(req.body.memory) ? req.body.memory.slice(0, 20) : [];
  if (!history.length) return res.status(400).json({ error: 'Пустое сообщение' });

  const system = SYSTEM_PROMPT +
    (memory.length ? `\n\nЧто известно об ученике:\n- ${memory.join('\n- ')}` : '');

  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': KEY },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: history.map(m => ({
            role: m.role === 'model' ? 'model' : 'user',
            parts: [{ text: String(m.text).slice(0, 4000) }]
          }))
        })
      }
    );
    const data = await r.json();
    if (!r.ok) {
      console.error(data);
      return res.status(502).json({ error: data.error?.message || 'Ошибка Gemini' });
    }
    const reply = data.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || '…';
    res.json({ reply, model: MODEL });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Сервер не смог связаться с ИИ' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Готово: http://localhost:${PORT}`));
