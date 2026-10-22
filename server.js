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

// ======================================================
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_ANON_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const TABLE = 'ocorrencias_mandu';

// MODELOS REAIS - NUNCA 3.8
const GEMINI_MODELS = [
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-flash-latest',
  'gemini-flash-lite-latest',
  'gemini-2.0-flash'
];

let supa = null;
if (SUPABASE_URL && SUPABASE_KEY) {
  supa = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });
}

app.disable('x-powered-by');
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));
app.use(express.static(__dirname, { maxAge: '1h' }));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// ======================================================
function textoSeguro(v, l = 10000) {
  if (v == null) return '';
  return String(v).replace(/\u0000/g, '').trim().slice(0, l);
}
function frenteSegura(v) { return textoSeguro(v, 50) || 'GERAL'; }
function turnoAtual() {
  const h = new Date().getHours();
  if (h >= 6 && h < 14) return 'A';
  if (h >= 14 && h < 22) return 'B';
  return 'C';
}
function horaAtual() { return new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); }
function normalizarOcorrencia(item) {
  return {
    id: item?.id || null,
    hora: textoSeguro(item?.hora, 20),
    frente: frenteSegura(item?.frente),
    texto: textoSeguro(item?.texto, 10000),
    turno: textoSeguro(item?.turno, 20),
    unidade: textoSeguro(item?.unidade, 50) || 'MANDU',
    created_at: item?.created_at || null
  };
}

// ======================================================
// NORMALIZAÇÃO WHATSAPP - PADRÃO OURO
// ======================================================
function normalizarPublicacaoIA(texto) {
  let t = String(texto || '')
    .replace(/\r\n/g, '\n')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/```/g, '')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/\*{2,}/g, '*')
    .replace(/^={3,}.*$/gm, '')
    .replace(/^[ \t]*[•●▪◦]\s*/gm, '- ')
    .replace(/[ \t]+$/gm, '');

  // TRAVA 1: Garante titulo + traços na linha de baixo
  t = t.replace(/(\*📋[^\n]*MANDU\*|\*⚡[^\n]*MANDU\*)[ \t]*\n*[ \t]*-*[ \t]*/gi, 
    `$1\n------------------------------------------------------------------------------------------------\n`);

  // TRAVA 2: Se vier grudado *MANDU**VISAO, separa
  t = t.replace(/(\*📋[^\n]*MANDU\*|\*⚡[^\n]*MANDU\*)(\*[A-Z])/g, 
    `$1\n------------------------------------------------------------------------------------------------\n$2`);

  // TRAVA 3: Garante 1 linha em branco ENTRE blocos, mas NÃO dentro do bloco
  // Primeiro normaliza 3+ quebras para 2
  t = t.replace(/\n{3,}/g, '\n\n');
  // Depois garante que de um tópico para o próximo título tenha quebra dupla
  t = t.replace(/([^\n])\n(\*[⚠️🚨🎯🔁📋⚡A-Z])/g, '$1\n\n$2');

  // TRAVA 4: SUGESTÃO sempre linha nova
  t = t.replace(/([^\n])\s*-\s*\*SUGESTÃO:\*/gi, '\n- *SUGESTÃO:*');
  t = t.replace(/\*SUGESTÃO:\*\s*/gi, '*SUGESTÃO:* ');
  
  // TRAVA 5: Remove quebra dupla entre título e seu primeiro tópico
  // *VISÃO GERAL DO TURNO*\n\n- FATO -> *VISÃO GERAL DO TURNO*\n- FATO
  t = t.replace(/(\*[A-ZÁÉÍÓÚÂÊÔÃÇ0-9 \/\-⚠️🚨🎯🔁📋⚡]+\*)\n\n+-\s*/g, '$1\n- ');

  return t.trim();
}

function prepararOcorrenciasIA(o = []) { return (o || []).map(normalizarOcorrencia).filter(i => i.texto); }
function agruparPorFrente(o = []) {
  const g = {}; for (const i of o) { const f = i.frente || 'GERAL'; if (!g[f]) g[f] = []; g[f].push(i); } return g;
}
function gerarContextoPorFrente(o = []) {
  const grupos = agruparPorFrente(o);
  const frentes = Object.keys(grupos).sort();
  if (!frentes.length) return 'Nenhuma ocorrência registrada.';
  return frentes.map(f => {
    const linhas = grupos[f].map(i => `- ${i.hora || '--:--'} | ${i.texto}`).join('\n');
    return `FRENTE ${f}\n${linhas}`;
  }).join('\n\n');
}
async function obterOcorrenciasIA(req) {
  if (req.body?.usarBanco === true && supa) {
    const { data, error } = await supa.from(TABLE).select('*').order('created_at', { ascending: true });
    if (error) throw new Error(`Supabase: ${error.message}`);
    return prepararOcorrenciasIA(data || []);
  }
  return prepararOcorrenciasIA(req.body?.ocorrencias || []);
}

// ======================================================
const SYSTEM_IA = `
Você é o assistente operacional do CTT Diário de Turno MANDU - Tereos.
OBJETIVO: Transformar registros em informação útil.
REGRAS ABSOLUTAS E INEGOCIÁVEIS:
1. NUNCA invente ocorrência, número, horário, causa, resultado.
2. NUNCA corte informação relevante ou horário.
3. MANTENHA os horários informados nas ocorrências (ex: 08:15, 14:30).
4. Diferencie FATO, ANÁLISE e *SUGESTÃO:*.
5. Português Brasil, técnico, natural e operacional.
6. Resultado PRONTO PARA WHATSAPP - copie e cole.
7. Use SOMENTE *um asterisco* para negrito: *TEXTO*. PROIBIDO **.
8. Use "-" para tópicos, cada tópico em uma linha.
9. PADRÃO DE BLOCO: *TÍTULO* na linha, quebra, "- tópico". Sem linha em branco dentro do bloco.
10. PADRÃO ENTRE BLOCOS: 1 linha em branco separando blocos.
11. PADRÃO MANDU: Depois de *...MANDU* SEMPRE pular linha e colocar 96 traços: ------------------------------------------------------------------------------------------------
12. NÃO use bloco de código, # ou =====.
13. Seja minucioso e detalhado na análise gerencial, não resuma demais.
14. Siga EXATAMENTE a estrutura que for pedida, sem criar títulos novos.
`;

function obterConfigPensamento(nivel) {
  if (nivel === 'high') return { thinkingConfig: { thinkingBudget: 4096 } };
  if (nivel === 'low') return { thinkingConfig: { thinkingBudget: 1024 } };
  return { thinkingConfig: { thinkingBudget: 2048 } };
}
function extrairTextoGemini(data) {
  const parts = data?.candidates?.[0]?.content?.parts || [];
  return parts.filter(p => typeof p.text === 'string' && p.thought !== true).map(p => p.text).join('\n').trim();
}
async function chamarIA(prompt, options = {}) {
  if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY não configurada');
  const maxOutputTokens = options.maxOutputTokens || 4000;
  const timeoutMs = options.timeoutMs || 45000;
  const thinkingLevel = options.thinkingLevel || 'medium';
  let ultimoErro = 'Erro IA';
  for (const modelo of GEMINI_MODELS) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${GEMINI_API_KEY}`;
      const res = await fetch(url, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: options.temperature ?? 0.25, maxOutputTokens, ...obterConfigPensamento(thinkingLevel) }
        }),
        signal: controller.signal
      });
      const raw = await res.text();
      let data; try { data = JSON.parse(raw); } catch { throw new Error(`JSON inválido ${modelo}`); }
      if (!res.ok) {
        const msg = data?.error?.message || raw.slice(0, 800);
        if ([400, 401, 403].includes(res.status)) throw new Error(msg);
        ultimoErro = `${modelo} HTTP ${res.status}: ${msg}`; continue;
      }
      const texto = extrairTextoGemini(data);
      if (!texto) { ultimoErro = `${modelo} vazio`; continue; }
      return { texto: normalizarPublicacaoIA(texto), modelo };
    } catch (e) {
      ultimoErro = e.name === 'AbortError' ? `Timeout ${modelo}` : e.message;
      if (String(ultimoErro).includes('API_KEY') || String(ultimoErro).includes('403')) throw new Error(ultimoErro);
    } finally { clearTimeout(timeout); }
  }
  throw new Error(ultimoErro);
}

// ======================================================
app.get('/api/status', (req, res) => {
  res.json({ ok: true, sistema: 'CTT Diário de Turno - MANDU', supabase: !!supa, gemini: !!GEMINI_API_KEY, modelos: GEMINI_MODELS, modelo_principal: GEMINI_MODELS[0], hora: horaAtual() });
});
app.get('/api/ocorrencias', async (req, res) => {
  try {
    if (!supa) return res.status(500).json({ error: 'Supabase não configurado' });
    const { data, error } = await supa.from(TABLE).select('*').order('created_at', { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    res.json((data || []).map(normalizarOcorrencia));
  } catch { res.status(500).json({ error: 'Erro ao carregar' }); }
});
app.delete('/api/ocorrencias', async (req, res) => {
  try {
    if (!supa) return res.status(500).json({ error: 'Supabase não configurado' });
    const { error } = await supa.from(TABLE).delete().not('id', 'is', null);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ ok: true });
  } catch { res.status(500).json({ error: 'Erro ao limpar' }); }
});
app.post('/api/ocorrencias', async (req, res) => {
  try {
    if (!supa) return res.status(500).json({ error: 'Supabase não configurado' });
    const texto = textoSeguro(req.body?.texto, 10000);
    if (!texto) return res.status(400).json({ error: 'Texto obrigatório' });
    const registro = { hora: textoSeguro(req.body?.hora, 20) || horaAtual(), frente: frenteSegura(req.body?.frente), texto, turno: textoSeguro(req.body?.turno, 20) || turnoAtual(), unidade: textoSeguro(req.body?.unidade, 50) || 'MANDU' };
    const { data, error } = await supa.from(TABLE).insert(registro).select().single();
    if (error) return res.status(500).json({ error: error.message });
    res.status(201).json(normalizarOcorrencia(data));
  } catch { res.status(500).json({ error: 'Erro ao salvar' }); }
});
app.put('/api/ocorrencias/:id', async (req, res) => {
  try {
    if (!supa) return res.status(500).json({ error: 'Supabase não configurado' });
    const id = textoSeguro(req.params.id, 100);
    const atualizacao = {};
    if (req.body?.texto !== undefined) atualizacao.texto = textoSeguro(req.body.texto, 10000);
    if (req.body?.frente !== undefined) atualizacao.frente = frenteSegura(req.body.frente);
    if (req.body?.hora !== undefined) atualizacao.hora = textoSeguro(req.body.hora, 20);
    if (req.body?.turno !== undefined) atualizacao.turno = textoSeguro(req.body.turno, 20);
    if (req.body?.unidade !== undefined) atualizacao.unidade = textoSeguro(req.body.unidade, 50);
    if (!Object.keys(atualizacao).length) return res.status(400).json({ error: 'Nada para atualizar' });
    const { data, error } = await supa.from(TABLE).update(atualizacao).eq('id', id).select().single();
    if (error) return res.status(500).json({ error: error.message });
    res.json(normalizarOcorrencia(data));
  } catch { res.status(500).json({ error: 'Erro ao atualizar' }); }
});
app.delete('/api/ocorrencias/:id', async (req, res) => {
  try {
    if (!supa) return res.status(500).json({ error: 'Supabase não configurado' });
    const id = textoSeguro(req.params.id, 100);
    const { error } = await supa.from(TABLE).delete().eq('id', id);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ ok: true });
  } catch { res.status(500).json({ error: 'Erro ao excluir' }); }
});

// ======================================================
// IA - PROMPTS COM PADRÃO TRAVADO
// ======================================================
app.post('/organizar-ia', async (req, res) => {
  try {
    const ocorrencias = await obterOcorrenciasIA(req);
    if (!ocorrencias.length) return res.status(400).json({ error: 'Sem ocorrências' });
    const contexto = gerarContextoPorFrente(ocorrencias);
    const prompt = `${SYSTEM_IA}
MODO: ORGANIZAÇÃO DO TURNO.
Estrutura OBRIGATÓRIA - copie exatamente os títulos:
*📋 DIÁRIO DE TURNO — MANDU*

*FRENTE XXX*
- Resumo com horários e impacto

*⚠️ PONTOS DE ATENÇÃO*
- Ponto 1

*🚨 RISCOS / IMPACTOS*
- Risco 1

*🎯 AÇÕES / ACOMPANHAMENTOS*
- Ação 1
- *SUGESTÃO:* Recomendação em linha separada
REGRAS: Mantenha horários. Não invente. Não corte texto importante.
OCORRÊNCIAS:
${contexto}`;
    const r = await chamarIA(prompt, { maxOutputTokens: 6000, timeoutMs: 45000, thinkingLevel: 'high', temperature: 0.25 });
    res.json({ texto: r.texto, total: ocorrencias.length, modelo: r.modelo });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post(['/resumo-executivo-ia', '/api/resumo-executivo-ia'], async (req, res) => {
  try {
    const ocorrencias = await obterOcorrenciasIA(req);
    if (!ocorrencias.length) return res.status(400).json({ error: 'Sem ocorrências' });
    const contexto = gerarContextoPorFrente(ocorrencias);
    const prompt = `${SYSTEM_IA}
MODO: RESUMO EXECUTIVO CURTO
Estrutura EXATA:
*⚡ RESUMO DAS MANUTENÇÕES/LOGÍSTICAS — MANDU*

*CRÍTICO*
- Principal problema com horário se houver

*IMPACTO*
- Consequência

*DECISÃO / ACOMPANHAMENTO*
- Decisão
- *SUGESTÃO:* Recomendação em linha separada
Max 8 linhas mas sem cortar informação crítica.
DADOS:
${contexto}`;
    const r = await chamarIA(prompt, { maxOutputTokens: 3000, timeoutMs: 40000, thinkingLevel: 'medium', temperature: 0.2 });
    res.json({ texto: r.texto, executivo: r.texto, total: ocorrencias.length, modelo: r.modelo });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post(['/fechar-turno-ia', '/api/fechar-turno-ia', '/fechar-turno', '/api/fechar-turno'], async (req, res) => {
  try {
    const ocorrencias = await obterOcorrenciasIA(req);
    if (!ocorrencias.length) return res.status(400).json({ error: 'Sem ocorrências' });
    const contexto = gerarContextoPorFrente(ocorrencias);

    const promptGerencial = `${SYSTEM_IA}
MODO: ANÁLISE GERENCIAL MINUCIOSA E DETALHADA - NÃO CORTE TEXTO

COPIE EXATAMENTE ESTA ESTRUTURA, NA ORDEM, SEM MUDAR NADA:

*📋 ANÁLISE DE MANUTENÇÃO/LOGÍSTICA — MANDU*

*VISÃO GERAL DO TURNO*
- FATO: Leitura geral do turno com condição principal observada, citando horários quando relevante.

*FRENTES COM OCORRÊNCIAS*
- FRENTE 501: Descreva ocorrências com horários (ex: 08:15 colhedora X parada...), impacto operacional.
- FRENTE 503: Idem, mantenha horários e detalhes técnicos.

*⚠️ PRINCIPAIS PROBLEMAS*
- FATO: Problema detalhado com horário e frente.
- ANÁLISE: Explique impacto quando houver evidência.

*🔁 PROBLEMAS RECORRENTES*
- Liste somente problemas repetidos em mais de uma frente ou horário. Se não houver: - Não há recorrência evidenciada nos registros.

*🚨 RISCOS / IMPACTOS*
- FATO/ANÁLISE: Riscos sustentados pelos registros, com horário se houver.

*🎯 PRIORIDADES DE ATUAÇÃO*
- Prioridade ordenada por criticidade e impacto.

*AÇÕES / ACOMPANHAMENTOS*
- Ação de acompanhamento necessário.
- *SUGESTÃO:* Recomendação sempre em linha separada, nunca grudada no texto anterior.

REGRAS RÍGIDAS DE FORMATAÇÃO WHATSAPP:
- Depois de *📋 ANÁLISE DE MANUTENÇÃO/LOGÍSTICA — MANDU* SEMPRE tem 96 traços na linha de baixo.
- 1 linha em branco ENTRE blocos (de *AÇÕES* para *RISCOS*).
- DENTRO do bloco: Título grudado no primeiro tópico, sem linha em branco. Ex:
*VISÃO GERAL DO TURNO*
- FATO: ...
- NÃO:
*VISÃO GERAL DO TURNO*

- FATO: ...
- Cada tópico em linha separada começando com "- ".
- Manter TODOS os horários informados nas ocorrências.
- Análise minuciosa, não resuma em excesso.

DADOS DO TURNO COM HORÁRIOS:
${contexto}`;

    const gerencial = await chamarIA(promptGerencial, { maxOutputTokens: 12000, timeoutMs: 60000, thinkingLevel: 'high', temperature: 0.25 });

    const promptExecutivo = `${SYSTEM_IA}
MODO: RESUMO EXECUTIVO FINAL - MUITO CURTO MAS SEM ERRO DE FORMATAÇÃO

COPIE EXATAMENTE ESTA ESTRUTURA:

*⚡ RESUMO TURNO — MANDU*

*CRÍTICO*
- Principal ponto do turno com horário se relevante.

*IMPACTO*
- Principal consequência operacional.

*DECISÃO / ACOMPANHAMENTO*
- Principal decisão ou acompanhamento.
- *SUGESTÃO:* Recomendação sempre em linha separada.

*FRENTE CRÍTICA*
- Frente que merece atenção prioritária.

REGRAS: Max 6 a 8 tópicos, mas sem cortar horário crítico. Mesma lógica de quebra do gerencial.
DADOS:
${contexto}`;

    const executivo = await chamarIA(promptExecutivo, { maxOutputTokens: 3500, timeoutMs: 45000, thinkingLevel: 'medium', temperature: 0.2 });

    res.json({
      gerencial: gerencial.texto,
      executivo: executivo.texto,
      texto: gerencial.texto,
      total: ocorrencias.length,
      frentes: new Set(ocorrencias.map(o => o.frente)).size,
      modelo_gerencial: gerencial.modelo,
      modelo_executivo: executivo.modelo
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post(['/chat-ia', '/api/chat-ia'], async (req, res) => {
  try {
    const pergunta = textoSeguro(req.body?.pergunta, 5000);
    if (!pergunta) return res.status(400).json({ error: 'Digite uma pergunta' });
    const ocorrencias = await obterOcorrenciasIA(req);
    if (!ocorrencias.length) return res.status(400).json({ error: 'Sem ocorrências' });
    const contexto = gerarContextoPorFrente(ocorrencias);
    const historico = Array.isArray(req.body?.historico) ? req.body.historico.slice(-8).map(i => `${i.role === 'user' ? 'USUÁRIO' : 'ASSISTENTE'}: ${textoSeguro(i.content, 3000)}`).join('\n') : 'Sem histórico';
    const prompt = `${SYSTEM_IA}
MODO: CHAT OPERACIONAL - Responda só o perguntado, proporcional, mantenha horários se relevante.
PERGUNTA: ${pergunta}
HISTÓRICO: ${historico}
DADOS:
${contexto}`;
    const r = await chamarIA(prompt, { maxOutputTokens: 4000, timeoutMs: 45000, thinkingLevel: 'medium', temperature: 0.25 });
    res.json({ resposta: r.texto, total: ocorrencias.length, modelo: r.modelo });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.use('/api', (req, res) => res.status(404).json({ error: 'Rota API não encontrada', rota: req.originalUrl }));
app.use((req, res) => res.status(404).send('Página não encontrada'));
app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  res.status(500).json({ error: error?.message || 'Erro interno' });
});

app.listen(PORT, () => {
  console.log(`CTT MANDU na porta ${PORT} | Supabase: ${!!supa ? 'OK' : 'OFF'} | Gemini: ${!!GEMINI_API_KEY ? 'OK' : 'OFF'} | Principal: ${GEMINI_MODELS[0]}`);
});
