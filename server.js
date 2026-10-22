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
// CONFIG - MODELOS REAIS QUE FUNCIONAM
// ======================================================
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_ANON_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const TABLE = 'ocorrencias_mandu';

// NUNCA use 3.8 - não existe. Ordem: melhor -> mais barato
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

// ======================================================
app.disable('x-powered-by');
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));
app.use(express.static(__dirname, { maxAge: '1h' }));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// ======================================================
// HELPERS
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
// FORMATAÇÃO WHATSAPP - CORRIGIDA
// ======================================================
function normalizarPublicacaoIA(texto) {
  let t = String(texto || '')
    .replace(/\r\n/g, '\n')
    .replace(/```[\s\S]*?```/g, '') // remove bloco codigo inteiro
    .replace(/```/g, '')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/\*{2,}/g, '*')
    .replace(/^[ \t]*[•●▪◦]\s*/gm, '- ')
    .replace(/[ \t]+$/gm, '');

  // Garante que título fique isolado
  t = t.replace(/\n*(\*[^\n]+\*)\n*/g, '\n\n$1\n\n');
  // Garante que cada tópico comece em linha nova
  t = t.replace(/(?<!\n)- /g, '\n- ');
  // Remove 3+ quebras
  t = t.replace(/\n{3,}/g, '\n\n');
  // Limpa inicio/fim
  t = t.trim();

  // Força linha em branco entre blocos de títulos
  const linhas = t.split('\n').map(l => l.trimEnd());
  return linhas.join('\n').trim();
}

// ======================================================
// OCORRENCIAS CORE
// ======================================================
function prepararOcorrenciasIA(ocorrencias = []) {
  return (ocorrencias || []).map(normalizarOcorrencia).filter(i => i.texto);
}
function agruparPorFrente(ocorrencias = []) {
  const g = {};
  for (const item of ocorrencias) {
    const f = item.frente || 'GERAL';
    if (!g[f]) g[f] = [];
    g[f].push(item);
  }
  return g;
}
function gerarContextoPorFrente(ocorrencias = []) {
  const grupos = agruparPorFrente(ocorrencias);
  const frentes = Object.keys(grupos).sort();
  if (!frentes.length) return 'Nenhuma ocorrência registrada.';
  return frentes.map(frente => {
    const linhas = grupos[frente].map(i => `- ${i.hora || '--:--'} | ${i.texto}`).join('\n');
    return `FRENTE ${frente}\n${linhas}`;
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
// GEMINI - CONFIG CORRETA
// ======================================================
const SYSTEM_IA = `
Você é o assistente operacional do CTT Diário de Turno MANDU - Tereos.

REGRAS DURAS:
1. Não invente ocorrência, número, horário, causa.
2. Diferencie FATO, ANÁLISE e *SUGESTÃO:*.
3. Português Brasil, técnico e direto.
4. Saída PRONTA PARA WHATSAPP.
5. Use apenas *um asterisco* para negrito. NUNCA **.
6. Use "-" para tópicos, cada tópico em uma linha.
7. Deixe 1 linha em branco entre blocos/títulos.
8. Nunca use bloco de código, # ou =====.
9. Se não houver evidência, diga "Não há evidência suficiente nos registros".
10. Siga EXATAMENTE a estrutura que for pedida no prompt do usuário.
`;

function obterConfigPensamento(nivel) {
  if (nivel === 'high') return { thinkingConfig: { thinkingBudget: 4096 } };
  if (nivel === 'low') return { thinkingConfig: { thinkingBudget: 1024 } };
  return { thinkingConfig: { thinkingBudget: 2048 } }; // medium
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
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: options.temperature ?? 0.25,
            maxOutputTokens,
            ...obterConfigPensamento(thinkingLevel)
          }
        }),
        signal: controller.signal
      });
      const raw = await res.text();
      let data; try { data = JSON.parse(raw); } catch { throw new Error(`JSON inválido ${modelo}`); }
      if (!res.ok) {
        const msg = data?.error?.message || raw.slice(0, 800);
        if ([400, 401, 403].includes(res.status)) throw new Error(msg);
        ultimoErro = `${modelo} HTTP ${res.status}: ${msg}`;
        continue;
      }
      const texto = extrairTextoGemini(data);
      if (!texto) { ultimoErro = `${modelo} vazio`; continue; }
      return { texto: normalizarPublicacaoIA(texto), modelo };
    } catch (e) {
      ultimoErro = e.name === 'AbortError' ? `Timeout ${modelo}` : e.message;
      if (String(ultimoErro).includes('API_KEY') || String(ultimoErro).includes('403') || String(ultimoErro).includes('400')) throw new Error(ultimoErro);
    } finally { clearTimeout(timeout); }
  }
  throw new Error(ultimoErro);
}

// ======================================================
// ROTAS API
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
  } catch (e) { res.status(500).json({ error: 'Erro ao carregar' }); }
});

// IMPORTANTE: limpar ANTES da rota com :id para não conflitar
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
    const registro = {
      hora: textoSeguro(req.body?.hora, 20) || horaAtual(),
      frente: frenteSegura(req.body?.frente),
      texto,
      turno: textoSeguro(req.body?.turno, 20) || turnoAtual(),
      unidade: textoSeguro(req.body?.unidade, 50) || 'MANDU'
    };
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
// IA - ROTAS UNIFICADAS
// ======================================================

app.post('/organizar-ia', async (req, res) => {
  try {
    const ocorrencias = await obterOcorrenciasIA(req);
    if (!ocorrencias.length) return res.status(400).json({ error: 'Sem ocorrências' });
    const contexto = gerarContextoPorFrente(ocorrencias);
    const prompt = `${SYSTEM_IA}
MODO: ORGANIZAÇÃO DO TURNO.

Organize em mensagem profissional para WhatsApp.

ESTRUTURA OBRIGATÓRIA (respeite as quebras):

*📋 DIÁRIO DE TURNO — MANDU*

*FRENTE XXX*
- Resumo objetivo e impacto

*⚠️ PONTOS DE ATENÇÃO*
- Somente o que exige atenção

*🚨 RISCOS / IMPACTOS*
- Somente riscos sustentados

*🎯 AÇÕES / ACOMPANHAMENTOS*
- Cada linha com ação
- Recomendação use "- *SUGESTÃO:*"

REGRAS FORMATAÇÃO WHATSAPP:
- 1 linha em branco entre cada bloco
- Cada tópico em linha separada
- Não invente frente
- Só *asterisco simples*

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
MODO: RESUMO EXECUTIVO - MUITO CURTO.

*⚡ RESUMO DAS MANUTENÇÕES/LOGÍSTICAS — MANDU*

*CRÍTICO*
- Principal problema

*IMPACTO*
- Consequência

*DECISÃO / ACOMPANHAMENTO*
- O que acompanhar
- Use "- *SUGESTÃO:*" se for recomendação

Seja curto, max 8 linhas. Sem lista por frente.

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
MODO: ANÁLISE GERENCIAL DETALHADA

ESTRUTURA FIXA:

*📋 ANÁLISE DE MANUTENÇÃO/LOGÍSTICA — MANDU*


*VISÃO GERAL DO TURNO*
- Leitura geral
- Condição principal

*FRENTES COM OCORRÊNCIAS*
- Cada frente relevante com efeito

*⚠️ PRINCIPAIS PROBLEMAS*
- Problemas com impacto

*🔁 PROBLEMAS RECORRENTES*
- Só se repetiu, se não houver informe

*🚨 RISCOS / IMPACTOS*
- Impactos sustentados

*🎯 PRIORIDADES DE ATUAÇÃO*
- Ordenado por criticidade

*AÇÕES / ACOMPANHAMENTOS*
- Ações necessárias, *SUGESTÃO:* quando recomendação

FORMATAÇÃO: 1 linha em branco entre blocos, cada tópico em linha separada, só * simples.

DADOS:
${contexto}`;

    const gerencial = await chamarIA(promptGerencial, { maxOutputTokens: 10000, timeoutMs: 60000, thinkingLevel: 'high', temperature: 0.25 });

    const promptExecutivo = `${SYSTEM_IA}
MODO: RESUMO EXECUTIVO FINAL - CURTO

*⚡ RESUMO TURNO — MANDU*


*CRÍTICO*
- Principal ponto

*IMPACTO*
- Principal consequência

*DECISÃO / ACOMPANHAMENTO*
- Decisão necessária, *SUGESTÃO:* se recomendação

*FRENTE CRÍTICA*
- Só a frente crítica

Max 8 tópicos.

DADOS:
${contexto}`;

    const executivo = await chamarIA(promptExecutivo, { maxOutputTokens: 3000, timeoutMs: 40000, thinkingLevel: 'medium', temperature: 0.2 });

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
MODO: CHAT OPERACIONAL - Responda só o perguntado, proporcional.

PERGUNTA: ${pergunta}

HISTÓRICO:
${historico}

DADOS:
${contexto}`;

    const r = await chamarIA(prompt, { maxOutputTokens: 4000, timeoutMs: 45000, thinkingLevel: 'medium', temperature: 0.25 });
    res.json({ resposta: r.texto, total: ocorrencias.length, modelo: r.modelo });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.use('/api', (req, res) => res.status(404).json({ error: 'Rota API não encontrada', rota: req.originalUrl }));
app.use((req, res) => res.status(404).send('Página não encontrada'));

app.listen(PORT, () => {
  console.log(`CTT MANDU na porta ${PORT} | Supabase: ${!!supa ? 'OK' : 'OFF'} | Gemini: ${!!GEMINI_API_KEY ? 'OK' : 'OFF'} | Principal: ${GEMINI_MODELS[0]}`);
});
