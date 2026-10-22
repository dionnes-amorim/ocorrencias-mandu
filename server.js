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
// CORREÇÃO DEFINITIVA - RECONSTRÓI O TEXTO BLOCO A BLOCO
// ======================================================
const TRACOS = '------------------------------------------------------------------------------------------------';

function limparBullet(l){
  return String(l||'').replace(/^[ \t]*[-•●▪◦]+\s*/,'').replace(/\*{2,}/g,'').trim();
}

function extrairTopicos(textoBruto){
  // Quebra tudo em linhas e transforma em tópicos
  let t = String(textoBruto||'')
    .replace(/\r/g,'\n')
    .replace(/-{5,}/g,'\n')
    .replace(/```[\s\S]*?```/g,'')
    .replace(/\*{2,}/g,'*')
    .replace(/([^\n])\s*-\s+/g,'\n- ')
    .replace(/;\s*/g,';\n- ')
    .replace(/\n+/g,'\n');

  const linhas = t.split('\n').map(s=>s.trim()).filter(Boolean);
  const topicos = [];
  for(let linha of linhas){
    // Ignora títulos soltos
    if(/^\*.*\*$/.test(linha)) continue;
    if(!linha) continue;
    let b = limparBullet(linha);
    if(b.length < 3) continue;
    // Garante que começa com - 
    if(!b.startsWith('*SUGESTÃO:*') && !b.startsWith('FRENTE') && b.length > 0){
       // deixa passar
    }
    topicos.push(b);
  }
  // Transforma em lista com "- "
  return topicos.map(b=>{
    if(b.startsWith('FRENTE')) return `- ${b}`;
    if(b.startsWith('*SUGESTÃO:*')) return `- ${b}`;
    if(b.startsWith('FATO:') || b.startsWith('ANÁLISE:') || b.startsWith('Prioridade') || b.startsWith('Atendimento') || b.startsWith('Alocação') || b.startsWith('Agilização') || b.startsWith('Acompanhar') || b.startsWith('Monitoramento')){
      return `- ${b}`;
    }
    return `- ${b}`;
  });
}

function reconstruirGerencial(textoBruto){
  let txt = String(textoBruto||'');
  
  // Dicionário de blocos que queremos encontrar, na ordem
  const mapa = [
    { id: 'visao', nomes: ['VISÃO GERAL DO TURNO'], titulo: '*VISÃO GERAL DO TURNO*' },
    { id: 'frentes', nomes: ['FRENTES COM OCORRÊNCIAS'], titulo: '*FRENTES COM OCORRÊNCIAS*' },
    { id: 'principais', nomes: ['PRINCIPAIS PROBLEMAS'], titulo: '*⚠️ PRINCIPAIS PROBLEMAS*' },
    { id: 'recorrentes', nomes: ['PROBLEMAS RECORRENTES'], titulo: '*🔁 PROBLEMAS RECORRENTES*' },
    { id: 'riscos', nomes: ['RISCOS / IMPACTOS','RISCOS E IMPACTOS','RISCOS'], titulo: '*🚨 RISCOS / IMPACTOS*' },
    { id: 'prioridades', nomes: ['PRIORIDADES DE ATUAÇÃO','PRIORIDADES'], titulo: '*🎯 PRIORIDADES DE ATUAÇÃO*' },
    { id: 'acoes', nomes: ['AÇÕES / ACOMPANHAMENTOS','ACOES','ACOMPANHAMENTOS'], titulo: '*AÇÕES / ACOMPANHAMENTOS*' },
  ];

  // Encontra índices de cada título no texto bruto
  const lower = txt.toLowerCase();
  let blocosEncontrados = [];
  for(let m of mapa){
    let idx = -1;
    for(let nome of m.nomes){
      let p = lower.indexOf(nome.toLowerCase());
      if(p !== -1 && (idx === -1 || p < idx)) idx = p;
    }
    blocosEncontrados.push({ ...m, idx });
  }
  // Ordena por posição no texto
  blocosEncontrados = blocosEncontrados.filter(b=>b.idx !== -1).sort((a,b)=>a.idx-b.idx);
  
  // Se não encontrou nada, tenta pelo menos quebrar por "-"
  if(blocosEncontrados.length === 0){
    const topicos = extrairTopicos(txt);
    return `*📋 ANÁLISE DE MANUTENÇÃO/LOGÍSTICA — MANDU*\n${TRACOS}\n*VISÃO GERAL DO TURNO*\n${topicos.join('\n')}`;
  }

  let saida = `*📋 ANÁLISE DE MANUTENÇÃO/LOGÍSTICA — MANDU*\n${TRACOS}`;
  
  for(let i=0;i<blocosEncontrados.length;i++){
    const atual = blocosEncontrados[i];
    const proximo = blocosEncontrados[i+1];
    let conteudoBruto = '';
    if(proximo){
      conteudoBruto = txt.substring(atual.idx, proximo.idx);
    }else{
      conteudoBruto = txt.substring(atual.idx);
    }
    // Remove o próprio título do conteúdo
    for(let n of atual.nomes){
      conteudoBruto = conteudoBruto.replace(new RegExp(`\\*?[^\\n]*${n}[^\\n]*\\*?`,'gi'),'');
    }
    let topicos = extrairTopicos(conteudoBruto);
    if(topicos.length === 0) continue;
    
    saida += `\n\n${atual.titulo}\n${topicos.join('\n')}`;
  }
  return saida;
}

function reconstruirExecutivo(textoBruto){
  let txt = String(textoBruto||'');
  const mapa = [
    { nomes: ['CRÍTICO'], titulo: '*CRÍTICO*' },
    { nomes: ['IMPACTO'], titulo: '*IMPACTO*' },
    { nomes: ['DECISÃO','ACOMPANHAMENTO'], titulo: '*DECISÃO / ACOMPANHAMENTO*' },
    { nomes: ['FRENTE CRÍTICA','FRENTE'], titulo: '*FRENTE CRÍTICA*' },
  ];
  const lower = txt.toLowerCase();
  let blocos = [];
  for(let m of mapa){
    let idx = -1;
    for(let nome of m.nomes){
      let p = lower.indexOf(nome.toLowerCase());
      if(p !== -1 && (idx === -1 || p < idx)) idx = p;
    }
    if(idx !== -1) blocos.push({ ...m, idx });
  }
  blocos = blocos.sort((a,b)=>a.idx-b.idx);
  
  let saida = `*⚡ RESUMO TURNO — MANDU*\n${TRACOS}`;
  for(let i=0;i<blocos.length;i++){
    const atual = blocos[i];
    const prox = blocos[i+1];
    let bruto = prox ? txt.substring(atual.idx, prox.idx) : txt.substring(atual.idx);
    for(let n of atual.nomes) bruto = bruto.replace(new RegExp(`\\*?[^\\n]*${n}[^\\n]*\\*?`,'gi'),'');
    let topicos = extrairTopicos(bruto);
    if(topicos.length===0) continue;
    saida += `\n\n${atual.titulo}\n${topicos.join('\n')}`;
  }
  return saida;
}

function normalizarPublicacaoIA(texto, tipo='gerencial'){
  if(!texto) return '';
  if(tipo === 'executivo' || String(texto).toUpperCase().includes('RESUMO TURNO') || String(texto).toUpperCase().includes('RESUMO EXECUTIVO') || String(texto).toUpperCase().includes('RESUMO DAS')){
    return reconstruirExecutivo(texto);
  }
  return reconstruirGerencial(texto);
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
Você é CTT MANDU - Tereos. Seja minucioso, detalhado, mantenha horários.
REGRAS: Não invente. Português Brasil. Use * simples. Use "-" tópicos.
ESTRUTURA OBRIGATÓRIA GERENCIAL:
*VISÃO GERAL DO TURNO*
*FRENTES COM OCORRÊNCIAS*
*⚠️ PRINCIPAIS PROBLEMAS*
*🔁 PROBLEMAS RECORRENTES*
*🚨 RISCOS / IMPACTOS*
*🎯 PRIORIDADES DE ATUAÇÃO*
*AÇÕES / ACOMPANHAMENTOS*
EXECUTIVO:
*CRÍTICO*
*IMPACTO*
*DECISÃO / ACOMPANHAMENTO*
*FRENTE CRÍTICA*
`;

function obterConfigPensamento(n){ if(n==='high') return {thinkingConfig:{thinkingBudget:4096}}; if(n==='low') return {thinkingConfig:{thinkingBudget:1024}}; return {thinkingConfig:{thinkingBudget:2048}}; }
function extrairTextoGemini(d){ const p=d?.candidates?.[0]?.content?.parts||[]; return p.filter(x=>typeof x.text==='string'&&x.thought!==true).map(x=>x.text).join('\n').trim(); }
async function chamarIA(prompt,opt={}, tipo='gerencial'){
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
      return {texto:normalizarPublicacaoIA(texto, tipo),modelo};
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
    const prompt=`${SYSTEM_IA}\nMODO: DIÁRIO - seja detalhado com horários\nOCORRÊNCIAS:\n${contexto}`;
    const r=await chamarIA(prompt,{maxOutputTokens:6000,timeoutMs:45000,thinkingLevel:'high',temperature:0.25},'gerencial');
    res.json({texto:r.texto,total:ocorrencias.length,modelo:r.modelo});
  }catch(e){res.status(500).json({error:e.message});}
});

app.post(['/resumo-executivo-ia','/api/resumo-executivo-ia'],async(req,res)=>{
  try{
    const ocorrencias=await obterOcorrenciasIA(req); if(!ocorrencias.length) return res.status(400).json({error:'Sem ocorrências'});
    const contexto=gerarContextoPorFrente(ocorrencias);
    const prompt=`${SYSTEM_IA}\nMODO: RESUMO EXECUTIVO\n${contexto}`;
    const r=await chamarIA(prompt,{maxOutputTokens:3000,timeoutMs:40000,thinkingLevel:'medium',temperature:0.2},'executivo');
    res.json({texto:r.texto,executivo:r.texto,total:ocorrencias.length,modelo:r.modelo});
  }catch(e){res.status(500).json({error:e.message});}
});

app.post(['/fechar-turno-ia','/api/fechar-turno-ia','/fechar-turno','/api/fechar-turno'],async(req,res)=>{
  try{
    const ocorrencias=await obterOcorrenciasIA(req); if(!ocorrencias.length) return res.status(400).json({error:'Sem ocorrências'});
    const contexto=gerarContextoPorFrente(ocorrencias);

    const promptGerencial=`${SYSTEM_IA}
MODO: ANÁLISE GERENCIAL MINUCIOSA - MANTENHA HORÁRIOS, NÃO CORTE

Gere nos blocos exatos, na ordem:
*VISÃO GERAL DO TURNO* - com horários
*FRENTES COM OCORRÊNCIAS* - cada frente com horários ex: Às 16:00, Às 16:06
*⚠️ PRINCIPAIS PROBLEMAS*
*🔁 PROBLEMAS RECORRENTES*
*🚨 RISCOS / IMPACTOS*
*🎯 PRIORIDADES DE ATUAÇÃO*
*AÇÕES / ACOMPANHAMENTOS* com *SUGESTÃO:*

Não deixe blocos grudados. Cada bloco separado. Cada tópico em linha separada com "- ".

DADOS COM HORÁRIOS:
${contexto}`;

    const gerencial=await chamarIA(promptGerencial,{maxOutputTokens:12000,timeoutMs:60000,thinkingLevel:'high',temperature:0.25},'gerencial');

    const promptExecutivo=`${SYSTEM_IA}
MODO: RESUMO EXECUTIVO FINAL CURTO
Blocos:
*CRÍTICO*
*IMPACTO*
*DECISÃO / ACOMPANHAMENTO*
*FRENTE CRÍTICA*
DADOS:
${contexto}`;

    const executivo=await chamarIA(promptExecutivo,{maxOutputTokens:3500,timeoutMs:45000,thinkingLevel:'medium',temperature:0.2},'executivo');

    res.json({gerencial:gerencial.texto,executivo:executivo.texto,texto:gerencial.texto,total:ocorrencias.length,frentes:new Set(ocorrencias.map(o=>o.frente)).size,modelo_gerencial:gerencial.modelo,modelo_executivo:executivo.modelo});
  }catch(e){res.status(500).json({error:e.message});}
});

app.post(['/chat-ia','/api/chat-ia'],async(req,res)=>{
  try{
    const pergunta=textoSeguro(req.body?.pergunta,5000); if(!pergunta) return res.status(400).json({error:'Digite uma pergunta'});
    const ocorrencias=await obterOcorrenciasIA(req); if(!ocorrencias.length) return res.status(400).json({error:'Sem ocorrências'});
    const contexto=gerarContextoPorFrente(ocorrencias);
    const prompt=`${SYSTEM_IA}\nMODO: CHAT\nPERGUNTA: ${pergunta}\nDADOS:\n${contexto}`;
    const r=await chamarIA(prompt,{maxOutputTokens:4000,timeoutMs:45000,thinkingLevel:'medium',temperature:0.25},'gerencial');
    res.json({resposta:r.texto,total:ocorrencias.length,modelo:r.modelo});
  }catch(e){res.status(500).json({error:e.message});}
});

app.use('/api',(req,res)=>res.status(404).json({error:'Rota API não encontrada',rota:req.originalUrl}));
app.use((req,res)=>res.status(404).send('Página não encontrada'));

app.listen(PORT,()=>console.log(`CTT MANDU na porta ${PORT} | Principal: ${GEMINI_MODELS[0]}`));
