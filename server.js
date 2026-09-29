const express = require('express');
const cors = require('cors');
const path = require('path');
const app = express();

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.static(__dirname));

app.post('/organizar-ia', async (req,res)=>{
  try {
    if(!process.env.OPENROUTER_API_KEY){
      return res.json({ texto: "Erro: OPENROUTER_API_KEY não configurada no Render" });
    }
    const ocorrencias = req.body.ocorrencias || [];
    const r = await fetch("https://openrouter.ai/api/v1/chat/completions",{
      method:"POST",
      headers:{
        "Authorization": "Bearer " + process.env.OPENROUTER_API_KEY,
        "Content-Type":"application/json",
        "HTTP-Referer": "https://ctt-mandu.onrender.com",
        "X-Title": "CTT Mandu"
      },
      body: JSON.stringify({
        model: "meta-llama/llama-3.1-8b-instruct",
        messages: [
          {role:"system", content:"Você é supervisor da CTT Mandu. Organize o diário de turno por frente 501 a 506, ordene por hora, seção PONTOS CRÍTICOS, formato WhatsApp com *negrito*."},
          {role:"user", content: "Organize:\n" + JSON.stringify(ocorrencias).slice(0,12000)}
        ]
      })
    });
    const txt = await r.text();
    let data;
    try{ data = JSON.parse(txt); } catch(e){
      return res.json({ texto: "Erro OpenRouter (não JSON): " + txt.slice(0,300) });
    }
    if(data.error) return res.json({ texto: "Erro OpenRouter: " + data.error.message });
    if(!data.choices ||!data.choices[0]) return res.json({ texto: "Erro OpenRouter: sem choices" });
    return res.json({ texto: data.choices[0].message.content });
  } catch(e){
    return res.json({ texto: "Erro backend: " + e.message });
  }
});

app.get('/organizar-ia', (req,res)=> res.json({ ok: true, msg: "POST aqui" }));
app.get('/', (req,res)=> res.sendFile(path.join(__dirname,'index.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, ()=> console.log('rodando na porta '+PORT));
