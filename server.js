const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// serve o index.html se estiver na mesma pasta
app.use(express.static(path.join(__dirname)));

app.get('/ping', (req, res) => res.send('ok'));

app.post('/organizar-ia', async (req, res) => {
  try {
    const ocorrencias = req.body.ocorrencias || [];
    if (!ocorrencias.length) {
      return res.json({ texto: 'Sem ocorrências para organizar.' });
    }

    const listaTexto = ocorrencias.map(o => `${o.hora} ${o.frente} ${o.texto}`).join("\n");

    const prompt = `Você é assistente de turno agrícola. Organize o resumo abaixo por frente (FRENTE 501, 502, etc e GERAL).

Formato:
FRENTE 50X
- HH:MM - texto

No final, faça um total por frente.

Ocorrências:
${listaTexto}`;

    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${process.env.GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }]
      })
    });

    const j = await r.json();
    const texto = j.candidates?.[0]?.content?.parts?.[0]?.text || 'Erro Gemini: ' + JSON.stringify(j).slice(0,500);

    res.json({ texto });
  } catch (e) {
    console.error(e);
    res.status(500).json({ texto: 'Erro no servidor: ' + e.message });
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log('rodando na porta ' + PORT));
