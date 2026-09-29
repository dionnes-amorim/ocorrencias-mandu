const express = require('express');
const cors = require('cors');
const path = require('path');
const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

app.post('/organizar-ia', async (req,res)=>{
  try {
    const r = await fetch("https://openrouter.ai/api/v1/chat/completions",{
      method:"POST",
      headers:{
        "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type":"application/json",
        "HTTP-Referer": "https://seu-app.onrender.com",
        "X-Title": "CTT Mandu"
      },
      body: JSON.stringify({
        model: "meta-llama/llama-3.1-8b-instruct:free",
        messages: [
          {role:"system", content:"Você é supervisor da CTT Mandu. Organize o diário de turno por frente 501 a 506, ordene por hora, seção PONTOS CRÍTICOS, formato WhatsApp com *negrito*."},
          {role:"user", content: "Organize:\n" + JSON.stringify(req.body.ocorrencias).slice(0,12000)}
        ]
      })
    });
    const text = await r.text();
    let data;
    try { data = JSON.parse(text); } catch(e){ return res.json({ texto: "Erro OpenRouter retorno: " + text.slice(0,200) }); }
    if(data.error) return res.json({ texto: "Erro OpenRouter: " + data.error.message });
    if(!data.choices ||!data.choices[0]) return res.json({ texto: "Erro OpenRouter: sem resposta" });
    res.json({ texto: data.choices[0].message.content });
  } catch(e){ res.json({ texto: "Erro: " + e.message }); }
});

app.get('/', (req,res)=> res.sendFile(path.join(__dirname,'index.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, ()=> console.log('rodando na porta '+PORT));
