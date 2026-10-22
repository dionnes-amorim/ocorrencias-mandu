import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = process.env.PORT || 10000;

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_ANON_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const TABLE = 'ocorrencias_mandu';
const GEMINI_MODELS = ['gemini-2.5-flash','gemini-2.5-flash-lite','gemini-flash-latest','gemini-flash-lite-latest','gemini-2.0-flash'];

let supa = null;
if (SUPABASE_URL && SUPABASE_KEY) {
  supa = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}
app.disable('x-powered-by');
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));
app.use(express.static(__dirname, { maxAge: '1h' }));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

function textoSeguro(v,l=10000){ if(v==null) return ''; return String(v).replace(/\u0000/g,'').trim().slice(0,l); }
function frenteSegura(v){ return textoSeguro(v,50) || 'GERAL'; }
function turnoAtual(){ const h=new Date().getHours(); if(h>=6&&h<14) return 'A'; if(h>=14&&h<22) return 'B'; return 'C'; }
function horaAtual(){ return new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}); }
function normalizarOcorrencia(item){ return { id:item?.id||null, hora:textoSeguro(item?.hora,20), frente:frenteSegura(item?.frente), texto:textoSeguro(item?.texto,10000), turno:textoSeguro(item?.turno,20), unidade:textoSeguro(item?.unidade,50)||'MANDU', created_at:item?.created_at||null }; }

// ======================================================
// NORMALIZADOR DEFINITIVO - QUEBRA TUDO NA MARRA
// ======================================================
function normalizarPublicacaoIA(texto){
  let t = String(texto||'')
    .replace(/\r\n/g,'\n')
    .replace(/```[\s\S]*?```/g,'')
    .replace(/```/g,'')
    .replace(/\*{2,}/g,'*');

  // 1. Força 96 traços em linha isolada
  t = t.replace(/-{5,}/g, '\n------------------------------------------------------------------------------------------------\n');

  // 2. Força quebra antes de TODO título que começa com *
  t = t.replace(/([^\n])\s*(\*📋[^\n]*\*|\*⚡[^\n]*\*|\*VISÃO[^\n]*\*|\*FRENTES[^\n]*\*|\*⚠️[^\n]*\*|\*🔁[^\n]*\*|\*🚨[^\n]*\*|\*🎯[^\n]*\*|\*AÇÕES[^\n]*\*|\*CRÍTICO\*|\*IMPACTO\*|\*DECISÃO[^\n]*\*|\*FRENTE CRÍTICA\*|\*PRIORIDADES[^\n]*\*)/gi, '$1\n\n$2');

  // 3. Força quebra depois dos traços
  t = t.replace(/------------------------------------------------------------------------------------------------\s*(\*[^\n]+\*)/g, '------------------------------------------------------------------------------------------------\n$1');

  // 4. Força quebra antes de cada tópico "-"
  t = t.replace(/([^\n])\s*-\s+(FATO|ANÁLISE|FRENTE|Atendimento|Alocação|Agilização|Monitoramento|Acompanhar|\d+\.|[A-ZÁÉÍÓÚ])/g, '$1\n- $2');
  t = t.replace(/([^\n])\s*-\s+\*SUGESTÃO:/gi, '$1\n- *SUGESTÃO:*');

  // 5. Garante espaço após SUGESTÃO
  t = t.replace(/\*SUGESTÃO:\*\s*/gi, '*SUGESTÃO:* ');

  // 6. Limpa 3+ quebras
  t = t.replace(/\n{3,}/g, '\n\n');

  // 7. REGRA DE OURO DO PADRÃO QUE VOCÊ QUER:
  // Título grudado no tópico: *VISÃO*\n-  (não *VISÃO*\n\n-)
  t = t.replace(/(\*[A-ZÁÉÍÓÚÂÊÔÃÇ0-9 \/\-⚠️🚨🎯🔁📋⚡]+\*)\n\n+-\s*/g, '$1\n- ');

  // 8. Remove linha vazia entre MANDU e traços e entre traços e próximo título
  t = t.replace(/(\*📋[^\n]*MANDU\*|\*⚡[^\n]*MANDU\*)\n\n+------------------------------------------------------------------------------------------------/g, '$1\n------------------------------------------------------------------------------------------------');
  t = t.replace(/------------------------------------------------------------------------------------------------\n\n+(\*)/g, '------------------------------------------------------------------------------------------------\n$1');

  return t.trim();
}

function prepararOcorrenciasIA(o=[]){ return (o||[]).map(normalizarOcorrencia).filter(i=>i.texto); }
function agruparPorFrente(o=[]){ const g={}; for(const i of o){ const f=i.frente||'GERAL'; if(!g[f]) g[f]=[]; g[f].push(i);} return g; }
function gerarContextoPorFrente(o=[]){
  const grupos=agruparPorFrente(o); const frentes=Object.keys(grupos).sort();
  if(!frentes.length) return 'Nenhuma ocorrência registrada.';
  return frentes.map(f=>{ const linhas=grupos[f].map(i=>`- ${i.hora||'--:--'} | ${i.texto}`).join('\n'); return `FRENTE ${f}\n${linhas}`; }).join('\n\n');
}
async function obterOcorrenciasIA(req){
  if(req.body?.usarBanco===true&&supa){ const {data,error}=await supa.from(TABLE).select('*').order('created_at',{ascending:true}); if(error) throw new Error(`Supabase: ${error.message}`); return prepararOcorrenciasIA(data||[]); }
  return prepararOcorrenciasIA(req.body?.ocorrencias||[]);
}

const SYSTEM_IA = `
Você é CTT MANDU - Tereos.
REGRAS INEGOCIÁVEIS:
1. NUNCA invente dado, número, horário.
2. MANTENHA horários (ex: 16:06, 17:30).
3. Análise minuciosa, não corte informação.
4. Saída PRONTA WhatsApp.
5. Use só * simples. PROIBIDO **.
6. Estrutura EXATA que for pedida, sem criar título.
7. Depois de *...MANDU* pule linha e coloque: ------------------------------------------------------------------------------------------------
8. Cada tópico em linha separada com "- ".
9. 1 linha em branco ENTRE blocos. Dentro do bloco, sem linha em branco.
`;

function obterConfigPensamento(n){ if(n==='high') return {thinkingConfig:{thinkingBudget:4096}}; if(n==='low') return {thinkingConfig:{thinkingBudget:1024}}; return {thinkingConfig:{thinkingBudget:2048}}; }
function extrairTextoGemini(d){ const p=d?.candidates?.[0]?.content?.parts||[]; return p.filter(x=>typeof x.text==='string'&&x.thought!==true).map(x=>x.text).join('\n').trim(); }
async function chamarIA(prompt,opt={}){
  if(!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY não configurada');
  const maxOutputTokens=opt.maxOutputTokens||4000; const timeoutMs=opt.timeoutMs||45000; const thinkingLevel=opt.thinkingLevel||'medium';
  let ultimo='Erro IA';
  for(const modelo of GEMINI_MODELS){
    const c=new AbortController(); const to=setTimeout(()=>c.abort(),timeoutMs);
    try{
      const url=`https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${GEMINI_API_KEY}`;
      const res=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({contents:[{parts:[{text:prompt}]}],generationConfig:{temperature:opt.temperature??0.25,maxOutputTokens,...obterConfigPensamento(thinkingLevel)}}),signal:c.signal});
      const raw=await res.text(); let data; try{data=JSON.parse(raw);}catch{throw new Error(`JSON inválido ${modelo}`);}
      if(!res.ok){ const msg=data?.error?.message||raw.slice(0,800); if([400,401,403].includes(res.status)) throw new Error(msg); ultimo=`${modelo} HTTP ${res.status}: ${msg}`; continue; }
      const texto=extrairTextoGemini(data); if(!texto){ultimo=`${modelo} vazio`; continue;}
      return {texto:normalizarPublicacaoIA(texto),modelo};
    }catch(e){ ultimo=e.name==='AbortError'?`Timeout ${modelo}`:e.message; if(String(ultimo).includes('API_KEY')||String(ultimo).includes('403')) throw new Error(ultimo); }
    finally{ clearTimeout(to); }
  }
  throw new Error(ultimo);
}

app.get('/api/status',(req,res)=>res.json({ok:true,sistema:'CTT Diário de Turno - MANDU',supabase:!!supa,gemini:!!GEMINI_API_KEY,modelos:GEMINI_MODELS,modelo_principal:GEMINI_MODELS[0],hora:horaAtual()}));
app.get('/api/ocorrencias',async(req,res)=>{ try{ if(!supa) return res.status(500).json({error:'Supabase não configurado'}); const {data,error}=await supa.from(TABLE).select('*').order('created_at',{ascending:false}); if(error) return res.status(500).json({error:error.message}); res.json((data||[]).map(normalizarOcorrencia)); }catch{res.status(500).json({error:'Erro ao carregar'});} });
app.delete('/api/ocorrencias',async(req,res)=>{ try{ if(!supa) return res.status(500).json({error:'Supabase não configurado'}); const {error}=await supa.from(TABLE).delete().not('id','is',null); if(error) return res.status(500).json({error:error.message}); res.json({ok:true}); }catch{res.status(500).json({error:'Erro ao limpar'});} });
app.post('/api/ocorrencias',async(req,res)=>{ try{ if(!supa) return res.status(500).json({error:'Supabase não configurado'}); const texto=textoSeguro(req.body?.texto,10000); if(!texto) return res.status(400).json({error:'Texto obrigatório'}); const registro={hora:textoSeguro(req.body?.hora,20)||horaAtual(),frente:frenteSegura(req.body?.frente),texto,turno:textoSeguro(req.body?.turno,20)||turnoAtual(),unidade:textoSeguro(req.body?.unidade,50)||'MANDU'}; const {data,error}=await supa.from(TABLE).insert(registro).select().single(); if(error) return res.status(500).json({error:error.message}); res.status(201).json(normalizarOcorrencia(data)); }catch{res.status(500).json({error:'Erro ao salvar'});} });
app.put('/api/ocorrencias/:id',async(req,res)=>{ try{ if(!supa) return res.status(500).json({error:'Supabase não configurado'}); const id=textoSeguro(req.params.id,100); const a={}; if(req.body?.texto!==undefined) a.texto=textoSeguro(req.body.texto,10000); if(req.body?.frente!==undefined) a.frente=frenteSegura(req.body.frente); if(req.body?.hora!==undefined) a.hora=textoSeguro(req.body.hora,20); if(req.body?.turno!==undefined) a.turno=textoSeguro(req.body.turno,20); if(req.body?.unidade!==undefined) a.unidade=textoSeguro(req.body.unidade,50); if(!Object.keys(a).length) return res.status(400).json({error:'Nada para atualizar'}); const {data,error}=await supa.from(TABLE).update(a).eq('id',id).select().single(); if(error) return res.status(500).json({error:error.message}); res.json(normalizarOcorrencia(data)); }catch{res.status(500).json({error:'Erro ao atualizar'});} });
app.delete('/api/ocorrencias/:id',async(req,res)=>{ try{ if(!supa) return res.status(500).json({error:'Supabase não configurado'}); const id=textoSeguro(req.params.id,100); const {error}=await supa.from(TABLE).delete().eq('id',id); if(error) return res.status(500).json({error:error.message}); res.json({ok:true}); }catch{res.status(500).json({error:'Erro ao excluir'});} });

app.post('/organizar-ia',async(req,res)=>{
  try{
    const ocorrencias=await obterOcorrenciasIA(req); if(!ocorrencias.length) return res.status(400).json({error:'Sem ocorrências'});
    const contexto=gerarContextoPorFrente(ocorrencias);
    const prompt=`${SYSTEM_IA}
MODO: DIÁRIO
*📋 DIÁRIO DE TURNO — MANDU*

*FRENTE XXX*
- Resumo com horários
*⚠️ PONTOS DE ATENÇÃO*
- Ponto
*🚨 RISCOS / IMPACTOS*
- Risco
*🎯 AÇÕES / ACOMPANHAMENTOS*
- Ação
- *SUGESTÃO:* Recomendação
OCORRÊNCIAS:
${contexto}`;
    const r=await chamarIA(prompt,{maxOutputTokens:6000,timeoutMs:45000,thinkingLevel:'high',temperature:0.25});
    res.json({texto:r.texto,total:ocorrencias.length,modelo:r.modelo});
  }catch(e){res.status(500).json({error:e.message});}
});

app.post(['/resumo-executivo-ia','/api/resumo-executivo-ia'],async(req,res)=>{
  try{
    const ocorrencias=await obterOcorrenciasIA(req); if(!ocorrencias.length) return res.status(400).json({error:'Sem ocorrências'});
    const contexto=gerarContextoPorFrente(ocorrencias);
    const prompt=`${SYSTEM_IA}
MODO: RESUMO EXECUTIVO CURTO
*⚡ RESUMO DAS MANUTENÇÕES/LOGÍSTICAS — MANDU*

*CRÍTICO*
- Principal problema com horário
*IMPACTO*
- Consequência
*DECISÃO / ACOMPANHAMENTO*
- Decisão
- *SUGESTÃO:* Recomendação
DADOS:
${contexto}`;
    const r=await chamarIA(prompt,{maxOutputTokens:3000,timeoutMs:40000,thinkingLevel:'medium',temperature:0.2});
    res.json({texto:r.texto,executivo:r.texto,total:ocorrencias.length,modelo:r.modelo});
  }catch(e){res.status(500).json({error:e.message});}
});

app.post(['/fechar-turno-ia','/api/fechar-turno-ia','/fechar-turno','/api/fechar-turno'],async(req,res)=>{
  try{
    const ocorrencias=await obterOcorrenciasIA(req); if(!ocorrencias.length) return res.status(400).json({error:'Sem ocorrências'});
    const contexto=gerarContextoPorFrente(ocorrencias);

    const promptGerencial=`${SYSTEM_IA}
MODO: ANÁLISE GERENCIAL MINUCIOSA - NÃO CORTE TEXTO, MANTENHA HORÁRIOS

COPIE EXATAMENTE ESTA ESTRUTURA:

*📋 ANÁLISE DE MANUTENÇÃO/LOGÍSTICA — MANDU*

*VISÃO GERAL DO TURNO*
- FATO: Leitura geral com condição principal e horários relevantes.

*FRENTES COM OCORRÊNCIAS*
- FRENTE 501: Descreva com horários ex: 16:00, 16:06 etc e impacto.
- FRENTE 502: Idem.

*⚠️ PRINCIPAIS PROBLEMAS*
- FATO: Problema detalhado com horário e frente.
- ANÁLISE: Impacto com evidência.

*🔁 PROBLEMAS RECORRENTES*
- FATO: Problemas repetidos. Se não houver: - Não há recorrência evidenciada nos registros.

*🚨 RISCOS / IMPACTOS*
- FATO/ANÁLISE: Riscos sustentados.

*🎯 PRIORIDADES DE ATUAÇÃO*
- Prioridade 1 ordenada por criticidade.

*AÇÕES / ACOMPANHAMENTOS*
- Ação necessária.
- *SUGESTÃO:* Recomendação em linha separada.

REGRAS WHATSAPP:
- Depois de *MANDU* sempre 96 traços na linha de baixo.
- 1 linha em branco ENTRE blocos.
- DENTRO do bloco sem linha em branco.
- Manter todos horários.

DADOS COM HORÁRIOS:
${contexto}`;

    const gerencial=await chamarIA(promptGerencial,{maxOutputTokens:12000,timeoutMs:60000,thinkingLevel:'high',temperature:0.25});

    const promptExecutivo=`${SYSTEM_IA}
MODO: RESUMO EXECUTIVO FINAL CURTO

*⚡ RESUMO TURNO — MANDU*

*CRÍTICO*
- Principal ponto com horário.

*IMPACTO*
- Principal consequência.

*DECISÃO / ACOMPANHAMENTO*
- Decisão.
- *SUGESTÃO:* Recomendação em linha separada.

*FRENTE CRÍTICA*
- Frente crítica.

DADOS:
${contexto}`;

    const executivo=await chamarIA(promptExecutivo,{maxOutputTokens:3500,timeoutMs:45000,thinkingLevel:'medium',temperature:0.2});

    res.json({gerencial:gerencial.texto,executivo:executivo.texto,texto:gerencial.texto,total:ocorrencias.length,frentes:new Set(ocorrencias.map(o=>o.frente)).size,modelo_gerencial:gerencial.modelo,modelo_executivo:executivo.modelo});
  }catch(e){res.status(500).json({error:e.message});}
});

app.post(['/chat-ia','/api/chat-ia'],async(req,res)=>{
  try{
    const pergunta=textoSeguro(req.body?.pergunta,5000); if(!pergunta) return res.status(400).json({error:'Digite uma pergunta'});
    const ocorrencias=await obterOcorrenciasIA(req); if(!ocorrencias.length) return res.status(400).json({error:'Sem ocorrências'});
    const contexto=gerarContextoPorFrente(ocorrencias);
    const prompt=`${SYSTEM_IA}\nMODO: CHAT\nPERGUNTA: ${pergunta}\nDADOS:\n${contexto}`;
    const r=await chamarIA(prompt,{maxOutputTokens:4000,timeoutMs:45000,thinkingLevel:'medium',temperature:0.25});
    res.json({resposta:r.texto,total:ocorrencias.length,modelo:r.modelo});
  }catch(e){res.status(500).json({error:e.message});}
});

app.use('/api',(req,res)=>res.status(404).json({error:'Rota API não encontrada',rota:req.originalUrl}));
app.use((req,res)=>res.status(404).send('Página não encontrada'));

app.listen(PORT,()=>console.log(`CTT MANDU na porta ${PORT} | Principal: ${GEMINI_MODELS[0]}`));
