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
// RECONSTRUÇÃO DEFINITIVA - NÃO DEIXA EMBolar
// ======================================================
const TRACOS = '------------------------------------------------------------------------------------------------';

function limparLinha(l){
  let s = String(l||'').trim();
  if(!s) return '';
  // Remove lixo tipo "* *⚠️" ou "* *🔁" ou "*"
  if(/^\*+\s*[⚠️🚨🎯🔁📋⚡]*\s*\*+$/.test(s)) return '';
  if(/^\*+\s*[⚠️🚨🎯🔁📋⚡]\s*$/.test(s)) return '';
  if(/^\*+$/.test(s)) return '';
  s = s.replace(/^\*+\s*/,'').replace(/\s*\*+$/,''); // tira asterisco sobrando no começo/fim
  s = s.replace(/^[•●▪◦]\s*/,'').replace(/^\-\s*/,'').trim();
  s = s.replace(/\*{2,}/g,'').trim();
  if(s.length < 3) return '';
  return s;
}

function reconstruirGerencial(textoBruto){
  let raw = String(textoBruto||'')
    .replace(/\r/g,'\n')
    .replace(/-{5,}/g,'\n')
    .replace(/```[\s\S]*?```/g,'');

  // Força quebra em todo título conhecido
  raw = raw.replace(/\*?\s*📋[^\n]*MANDU[^\n]*\*?/gi, '\nCABECALHO_MANDU\n');
  raw = raw.replace(/\*?\s*VISÃO GERAL DO TURNO[^\n]*\*?/gi, '\nTITULO_VISAO\n');
  raw = raw.replace(/\*?\s*FRENTES COM OCORRÊNCIAS[^\n]*\*?/gi, '\nTITULO_FRENTES\n');
  raw = raw.replace(/\*?\s*⚠️?\s*PRINCIPAIS PROBLEMAS[^\n]*\*?/gi, '\nTITULO_PRINCIPAIS\n');
  raw = raw.replace(/\*?\s*🔁?\s*PROBLEMAS RECORRENTES[^\n]*\*?/gi, '\nTITULO_RECORRENTES\n');
  raw = raw.replace(/\*?\s*🚨?\s*RISCOS\s*\/\s*IMPACTOS[^\n]*\*?/gi, '\nTITULO_RISCOS\n');
  raw = raw.replace(/\*?\s*🎯?\s*PRIORIDADES DE ATUAÇÃO[^\n]*\*?/gi, '\nTITULO_PRIORIDADES\n');
  raw = raw.replace(/\*?\s*AÇÕES\s*\/\s*ACOMPANHAMENTOS[^\n]*\*?/gi, '\nTITULO_ACOES\n');
  // Executivos que vieram grudados no final
  raw = raw.replace(/\*?\s*CRÍTICO[^\n]*\*?/gi, '\nTITULO_CRITICO_EXEC\n');
  raw = raw.replace(/\*?\s*IMPACTO[^\n]*\*?/gi, '\nTITULO_IMPACTO_EXEC\n');
  raw = raw.replace(/\*?\s*FRENTE CRÍTICA[^\n]*\*?/gi, '\nTITULO_FRENTE_CRITICA_EXEC\n');

  const partes = raw.split('\n');
  const blocos = {
    visao: [], frentes: [], principais: [], recorrentes: [], riscos: [], prioridades: [], acoes: []
  };
  let atual = null;

  for(let linha of partes){
    let l = linha.trim();
    if(!l) continue;
    if(l === 'CABECALHO_MANDU'){ atual = null; continue; }
    if(l === 'TITULO_VISAO'){ atual = 'visao'; continue; }
    if(l === 'TITULO_FRENTES'){ atual = 'frentes'; continue; }
    if(l === 'TITULO_PRINCIPAIS'){ atual = 'principais'; continue; }
    if(l === 'TITULO_RECORRENTES'){ atual = 'recorrentes'; continue; }
    if(l === 'TITULO_RISCOS'){ atual = 'riscos'; continue; }
    if(l === 'TITULO_PRIORIDADES'){ atual = 'prioridades'; continue; }
    if(l === 'TITULO_ACOES'){ atual = 'acoes'; continue; }
    if(l.startsWith('TITULO_')){ atual = null; continue; } // ignora executivo dentro do gerencial

    let limpo = limparLinha(l);
    if(!limpo) continue;
    if(!atual){
      // Se ainda não tem bloco, joga na visão
      if(!blocos.visao.length) atual = 'visao';
      else continue;
    }
    blocos[atual].push(limpo);
  }

  // Monta saída no padrão que você exigiu
  let out = `*📋 ANÁLISE DE MANUTENÇÃO/LOGÍSTICA — MANDU*\n${TRACOS}`;
  
  if(blocos.visao.length){
    out += `\n*VISÃO GERAL DO TURNO*\n` + blocos.visao.map(b=>`- ${b}`).join('\n');
  }
  if(blocos.frentes.length){
    out += `\n\n*FRENTES COM OCORRÊNCIAS*\n` + blocos.frentes.map(b=>{
      if(b.toLowerCase().startsWith('frente')) return `- ${b}`;
      return `- ${b}`;
    }).join('\n');
  }
  if(blocos.principais.length){
    out += `\n\n*⚠️ PRINCIPAIS PROBLEMAS*\n` + blocos.principais.map(b=>`- ${b}`).join('\n');
  }
  if(blocos.recorrentes.length){
    out += `\n\n*🔁 PROBLEMAS RECORRENTES*\n` + blocos.recorrentes.map(b=>`- ${b}`).join('\n');
  }else{
    out += `\n\n*🔁 PROBLEMAS RECORRENTES*\n- Não há recorrência evidenciada nos registros.`;
  }
  if(blocos.riscos.length){
    out += `\n\n*🚨 RISCOS / IMPACTOS*\n` + blocos.riscos.map(b=>`- ${b}`).join('\n');
  }
  if(blocos.prioridades.length){
    out += `\n\n*🎯 PRIORIDADES DE ATUAÇÃO*\n` + blocos.prioridades.map(b=>`- ${b}`).join('\n');
  }
  if(blocos.acoes.length){
    out += `\n\n*AÇÕES / ACOMPANHAMENTOS*\n` + blocos.acoes.map(b=>{
      if(b.toLowerCase().startsWith('sugestão') || b.toLowerCase().startsWith('sugestao')) return `- *SUGESTÃO:* ${b.replace(/sugestão:\s*/i,'')}`;
      if(b.includes('SUGESTÃO:') || b.includes('*SUGESTÃO:*')) return `- ${b.replace(/\*SUGESTÃO:\*\s*/,'*SUGESTÃO:* ')}`;
      return `- ${b}`;
    }).join('\n');
  }

  return out;
}

function reconstruirExecutivo(textoBruto){
  let raw = String(textoBruto||'').replace(/\r/g,'\n').replace(/-{5,}/g,'\n').replace(/```[\s\S]*?```/g,'');
  raw = raw.replace(/\*?\s*⚡[^\n]*MANDU[^\n]*\*?/gi, '\nCABECALHO_EXEC\n');
  raw = raw.replace(/\*?\s*RESUMO TURNO[^\n]*\*?/gi, '\nCABECALHO_EXEC\n');
  raw = raw.replace(/\*?\s*RESUMO[^\n]*MANDU[^\n]*\*?/gi, '\nCABECALHO_EXEC\n');
  raw = raw.replace(/\*?\s*CRÍTICO[^\n]*\*?/gi, '\nTITULO_CRITICO\n');
  raw = raw.replace(/\*?\s*IMPACTO[^\n]*\*?/gi, '\nTITULO_IMPACTO\n');
  raw = raw.replace(/\*?\s*DECISÃO[^\n]*\*?/gi, '\nTITULO_DECISAO\n');
  raw = raw.replace(/\*?\s*FRENTE CRÍTICA[^\n]*\*?/gi, '\nTITULO_FRENTE_CRITICA\n');

  const partes = raw.split('\n');
  const blocos = { critico: [], impacto: [], decisao: [], frente: [] };
  let atual = null;
  for(let linha of partes){
    let l = linha.trim(); if(!l) continue;
    if(l==='CABECALHO_EXEC'){ atual=null; continue; }
    if(l==='TITULO_CRITICO'){ atual='critico'; continue; }
    if(l==='TITULO_IMPACTO'){ atual='impacto'; continue; }
    if(l==='TITULO_DECISAO'){ atual='decisao'; continue; }
    if(l==='TITULO_FRENTE_CRITICA'){ atual='frente'; continue; }
    let limpo = limparLinha(l); if(!limpo) continue;
    if(!atual) continue;
    blocos[atual].push(limpo);
  }

  let out = `*⚡ RESUMO TURNO — MANDU*\n${TRACOS}`;
  if(blocos.critico.length) out += `\n*CRÍTICO*\n` + blocos.critico.map(b=>`- ${b}`).join('\n');
  if(blocos.impacto.length) out += `\n\n*IMPACTO*\n` + blocos.impacto.map(b=>`- ${b}`).join('\n');
  if(blocos.decisao.length) out += `\n\n*DECISÃO / ACOMPANHAMENTO*\n` + blocos.decisao.map(b=>{
    if(b.toLowerCase().includes('sugestão')) return `- *SUGESTÃO:* ${b.replace(/.*sugestão:\s*/i,'')}`;
    return `- ${b}`;
  }).join('\n');
  if(blocos.frente.length) out += `\n\n*FRENTE CRÍTICA*\n` + blocos.frente.map(b=>`- ${b}`).join('\n');
  return out;
}

function normalizarPublicacaoIA(texto, tipo='gerencial'){
  if(!texto) return '';
  const upper = String(texto).toUpperCase();
  if(tipo==='executivo' || upper.includes('RESUMO TURNO') || (upper.includes('CRÍTICO') && upper.includes('IMPACTO') && upper.includes('DECISÃO'))){
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
REGRAS: Não invente. Use * simples. Use "-" tópicos.
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
    const prompt=`${SYSTEM_IA}\nMODO: DIÁRIO\nOCORRÊNCIAS:\n${contexto}`;
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
MODO: ANÁLISE GERENCIAL MINUCIOSA - MANTENHA HORÁRIOS

Gere nos blocos exatos, na ordem:
*VISÃO GERAL DO TURNO*
*FRENTES COM OCORRÊNCIAS*
*⚠️ PRINCIPAIS PROBLEMAS*
*🔁 PROBLEMAS RECORRENTES*
*🚨 RISCOS / IMPACTOS*
*🎯 PRIORIDADES DE ATUAÇÃO*
*AÇÕES / ACOMPANHAMENTOS*

Cada bloco com tópicos "- " separados, detalhado com horários.
DADOS:
${contexto}`;

    const gerencial=await chamarIA(promptGerencial,{maxOutputTokens:12000,timeoutMs:60000,thinkingLevel:'high',temperature:0.25},'gerencial');

    const promptExecutivo=`${SYSTEM_IA}
MODO: RESUMO EXECUTIVO FINAL
Blocos: *CRÍTICO* *IMPACTO* *DECISÃO / ACOMPANHAMENTO* *FRENTE CRÍTICA*
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
