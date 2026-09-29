const express = require('express');
const cors = require('cors');
const path = require('path');
const app = express();

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.static(__dirname));

// no topo
// const OPENROUTER...

// dentro do /organizar-ia
const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`, {
  method:'POST',
  headers:{'Content-Type':'application/json'},
  body: JSON.stringify({
    contents: [{ parts: [{ text: "Organize por frente este turno:\n" + ocorrencias.map(o=>`${o.hora} ${o.frente} ${o.texto}`).join("\n") }] }]
  })
});
const j = await r.json();
const texto = j.candidates?.[0]?.content?.parts?.[0]?.text || 'Erro Gemini';
res.json({ texto });

app.get('/organizar-ia', (req,res)=> res.json({ ok: true, msg: "POST aqui" }));
app.get('/', (req,res)=> res.sendFile(path.join(__dirname,'index.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, ()=> console.log('rodando na porta '+PORT));
