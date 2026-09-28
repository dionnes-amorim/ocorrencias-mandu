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
    const data = await r.json();
    if(data.error) return res.json({ texto: "Erro OpenRouter: " + data.error.message });
    res.json({ texto: data.choices[0].message.content });
  } catch(e){ res.json({ texto: "Erro: " + e.message }); }
});
