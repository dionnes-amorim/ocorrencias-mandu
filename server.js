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
// CONFIGURAÇÕES
// ======================================================

const SUPABASE_URL = process.env.SUPABASE_URL;

const SUPABASE_KEY =
  process.env.SUPABASE_SECRET_KEY ||
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  process.env.SUPABASE_ANON_KEY;

const OPENROUTER_API_KEY =
  process.env.OPENROUTER_API_KEY;

const TABLE = 'ocorrencias_mandu';

const OPENROUTER_URL =
  'https://openrouter.ai/api/v1/chat/completions';

const AI_MODEL = 'openrouter/free';

// ======================================================
// SUPABASE
// ======================================================

let supa = null;

if (SUPABASE_URL && SUPABASE_KEY) {
  supa = createClient(
    SUPABASE_URL,
    SUPABASE_KEY,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false
      }
    }
  );
}

// ======================================================
// EXPRESS
// ======================================================

app.disable('x-powered-by');

app.use(
  express.json({
    limit: '5mb'
  })
);

app.use(
  express.urlencoded({
    extended: false,
    limit: '1mb'
  })
);

app.use(
  express.static(__dirname, {
    maxAge: '1h'
  })
);

app.get('/', (req, res) => {
  res.sendFile(
    path.join(__dirname, 'index.html')
  );
});

// ======================================================
// FUNÇÕES AUXILIARES
// ======================================================

function textoSeguro(valor, limite = 10000) {
  if (
    valor === undefined ||
    valor === null
  ) {
    return '';
  }

  return String(valor)
    .replace(/\u0000/g, '')
    .trim()
    .slice(0, limite);
}

function frenteSegura(valor) {
  const frente =
    textoSeguro(valor, 50);

  return frente || 'GERAL';
}

function turnoAtual() {
  const hora =
    new Date().getHours();

  if (
    hora >= 6 &&
    hora < 14
  ) {
    return 'A';
  }

  if (
    hora >= 14 &&
    hora < 22
  ) {
    return 'B';
  }

  return 'C';
}

function horaAtual() {
  return new Date().toLocaleTimeString(
    'pt-BR',
    {
      hour: '2-digit',
      minute: '2-digit'
    }
  );
}

function normalizarOcorrencia(item) {
  return {
    id: item?.id || null,

    hora:
      textoSeguro(
        item?.hora,
        20
      ),

    frente:
      frenteSegura(
        item?.frente
      ),

    texto:
      textoSeguro(
        item?.texto,
        10000
      ),

    turno:
      textoSeguro(
        item?.turno,
        20
      ),

    unidade:
      textoSeguro(
        item?.unidade,
        50
      ) || 'MANDU',

    created_at:
      item?.created_at || null
  };
}

// ======================================================
// STATUS
// ======================================================

app.get(
  '/api/status',
  async (req, res) => {

    res.json({
      ok: true,

      sistema:
        'CTT Diário de Turno - MANDU',

      supabase:
        !!supa,

      openrouter:
        !!OPENROUTER_API_KEY,

      modelo:
        AI_MODEL,

      hora:
        horaAtual()
    });
  }
);

// ======================================================
// GET OCORRÊNCIAS
// ======================================================

app.get(
  '/api/ocorrencias',
  async (req, res) => {

    try {

      if (!supa) {
        return res.status(500).json({
          error:
            'Supabase não configurado no Render.'
        });
      }

      const {
        data,
        error
      } = await supa
        .from(TABLE)
        .select('*')
        .order(
          'created_at',
          {
            ascending: false
          }
        );

      if (error) {

        console.error(
          'ERRO SUPABASE GET:',
          error
        );

        return res.status(500).json({
          error:
            error.message
        });
      }

      res.json(
        (data || [])
          .map(
            normalizarOcorrencia
          )
      );

    } catch (error) {

      console.error(
        'ERRO GET OCORRÊNCIAS:',
        error
      );

      res.status(500).json({
        error:
          'Erro ao carregar ocorrências.'
      });
    }
  }
);

// ======================================================
// POST OCORRÊNCIA
// ======================================================

app.post(
  '/api/ocorrencias',
  async (req, res) => {

    try {

      if (!supa) {
        return res.status(500).json({
          error:
            'Supabase não configurado no Render.'
        });
      }

      const texto =
        textoSeguro(
          req.body?.texto,
          10000
        );

      if (!texto) {
        return res.status(400).json({
          error:
            'Texto da ocorrência é obrigatório.'
        });
      }

      const registro = {

        hora:
          textoSeguro(
            req.body?.hora,
            20
          ) || horaAtual(),

        frente:
          frenteSegura(
            req.body?.frente
          ),

        texto,

        turno:
          textoSeguro(
            req.body?.turno,
            20
          ) || turnoAtual(),

        unidade:
          textoSeguro(
            req.body?.unidade,
            50
          ) || 'MANDU'
      };

      const {
        data,
        error
      } = await supa
        .from(TABLE)
        .insert(registro)
        .select()
        .single();

      if (error) {

        console.error(
          'ERRO SUPABASE INSERT:',
          error
        );

        return res.status(500).json({
          error:
            error.message
        });
      }

      res.status(201).json(
        normalizarOcorrencia(data)
      );

    } catch (error) {

      console.error(
        'ERRO POST OCORRÊNCIA:',
        error
      );

      res.status(500).json({
        error:
          'Erro ao salvar ocorrência.'
      });
    }
  }
);

// ======================================================
// PUT OCORRÊNCIA
// ======================================================

app.put(
  '/api/ocorrencias/:id',
  async (req, res) => {

    try {

      if (!supa) {
        return res.status(500).json({
          error:
            'Supabase não configurado no Render.'
        });
      }

      const id =
        textoSeguro(
          req.params.id,
          100
        );

      const atualizacao = {};

      if (
        req.body?.texto !== undefined
      ) {
        atualizacao.texto =
          textoSeguro(
            req.body.texto,
            10000
          );
      }

      if (
        req.body?.frente !== undefined
      ) {
        atualizacao.frente =
          frenteSegura(
            req.body.frente
          );
      }

      if (
        req.body?.hora !== undefined
      ) {
        atualizacao.hora =
          textoSeguro(
            req.body.hora,
            20
          );
      }

      if (
        req.body?.turno !== undefined
      ) {
        atualizacao.turno =
          textoSeguro(
            req.body.turno,
            20
          );
      }

      if (
        req.body?.unidade !== undefined
      ) {
        atualizacao.unidade =
          textoSeguro(
            req.body.unidade,
            50
          );
      }

      if (
        !Object.keys(
          atualizacao
        ).length
      ) {
        return res.status(400).json({
          error:
            'Nenhum campo para atualizar.'
        });
      }

      const {
        data,
        error
      } = await supa
        .from(TABLE)
        .update(atualizacao)
        .eq('id', id)
        .select()
        .single();

      if (error) {

        console.error(
          'ERRO SUPABASE UPDATE:',
          error
        );

        return res.status(500).json({
          error:
            error.message
        });
      }

      res.json(
        normalizarOcorrencia(data)
      );

    } catch (error) {

      console.error(
        'ERRO PUT OCORRÊNCIA:',
        error
      );

      res.status(500).json({
        error:
          'Erro ao atualizar ocorrência.'
      });
    }
  }
);

// ======================================================
// DELETE OCORRÊNCIA
// ======================================================

app.delete(
  '/api/ocorrencias/:id',
  async (req, res) => {

    try {

      if (!supa) {
        return res.status(500).json({
          error:
            'Supabase não configurado no Render.'
        });
      }

      const id =
        textoSeguro(
          req.params.id,
          100
        );

      const {
        error
      } = await supa
        .from(TABLE)
        .delete()
        .eq('id', id);

      if (error) {

        console.error(
          'ERRO SUPABASE DELETE:',
          error
        );

        return res.status(500).json({
          error:
            error.message
        });
      }

      res.json({
        ok: true
      });

    } catch (error) {

      console.error(
        'ERRO DELETE OCORRÊNCIA:',
        error
      );

      res.status(500).json({
        error:
          'Erro ao excluir ocorrência.'
      });
    }
  }
);

// ======================================================
// LIMPAR OCORRÊNCIAS
// ======================================================

app.delete(
  '/api/ocorrencias',
  async (req, res) => {

    try {

      if (!supa) {
        return res.status(500).json({
          error:
            'Supabase não configurado no Render.'
        });
      }

      const {
        error
      } = await supa
        .from(TABLE)
        .delete()
        .not(
          'id',
          'is',
          null
        );

      if (error) {

        console.error(
          'ERRO SUPABASE LIMPAR:',
          error
        );

        return res.status(500).json({
          error:
            error.message
        });
      }

      res.json({
        ok: true
      });

    } catch (error) {

      console.error(
        'ERRO LIMPAR:',
        error
      );

      res.status(500).json({
        error:
          'Erro ao limpar ocorrências.'
      });
    }
  }
);

// ======================================================
// PREPARAR OCORRÊNCIAS PARA IA
// ======================================================

function prepararOcorrenciasIA(
  ocorrencias = []
) {

  return (
    ocorrencias || []
  )
    .map(
      normalizarOcorrencia
    )
    .filter(
      item => item.texto
    );
}

// ======================================================
// AGRUPAR POR FRENTE
// ======================================================

function agruparPorFrente(
  ocorrencias = []
) {

  const grupos = {};

  for (
    const item of ocorrencias
  ) {

    const frente =
      item.frente ||
      'GERAL';

    if (
      !grupos[frente]
    ) {
      grupos[frente] = [];
    }

    grupos[frente].push(
      item
    );
  }

  return grupos;
}

// ======================================================
// CONTEXTO POR FRENTE
// ======================================================

function gerarContextoPorFrente(
  ocorrencias = []
) {

  const grupos =
    agruparPorFrente(
      ocorrencias
    );

  const frentes =
    Object.keys(grupos)
      .sort();

  if (!frentes.length) {
    return (
      'Nenhuma ocorrência registrada.'
    );
  }

  return frentes
    .map(frente => {

      const linhas =
        grupos[frente]
          .map(item => {

            return (
              `- ${item.hora || '--:--'} | ${item.texto}`
            );
          })
          .join('\n');

      return (
        `FRENTE ${frente}\n${linhas}`
      );
    })
    .join('\n\n');
}

// ======================================================
// OBTER OCORRÊNCIAS PARA IA
// ======================================================

async function obterOcorrenciasIA(
  req
) {

  console.log(
    'IA - obterOcorrenciasIA:',
    'usarBanco =',
    req.body?.usarBanco,
    'supa =',
    !!supa
  );

  if (
    req.body?.usarBanco === true &&
    supa
  ) {

    console.log(
      'IA - buscando ocorrências no Supabase...'
    );

    const {
      data,
      error
    } = await supa
      .from(TABLE)
      .select('*')
      .order(
        'created_at',
        {
          ascending: true
        }
      );

    if (error) {

      console.error(
        'IA - ERRO SUPABASE:',
        error
      );

      throw new Error(
        `Erro ao consultar Supabase: ${error.message}`
      );
    }

    const resultado =
      prepararOcorrenciasIA(
        data || []
      );

    console.log(
      'IA - ocorrências encontradas:',
      resultado.length
    );

    return resultado;
  }

  const resultado =
    prepararOcorrenciasIA(
      req.body?.ocorrencias || []
    );

  console.log(
    'IA - ocorrências recebidas pelo body:',
    resultado.length
  );

  return resultado;
}

// ======================================================
// SYSTEM IA
// ======================================================

const SYSTEM_IA = `
Você é o assistente operacional do CTT Diário de Turno da unidade MANDU.

Sua função é analisar exclusivamente as informações fornecidas.

REGRAS:

1. Não invente ocorrências.
2. Não invente números.
3. Não invente causas.
4. Não invente horários.
5. Não invente ações como se já tivessem acontecido.
6. Diferencie fato de sugestão.
7. Quando recomendar alguma ação, utilize *SUGESTÃO:*.
8. Seja técnico, direto e objetivo.
9. Use português do Brasil.
10. Utilize linguagem adequada para comunicação operacional e gerencial.
11. Organize por frente quando fizer sentido.
12. Identifique problemas repetidos somente quando realmente aparecerem nos dados.
13. Identifique riscos somente com base nos dados.
14. Não faça conclusões sem evidência.
15. Formate o resultado para WhatsApp.
16. Utilize *asteriscos* para destaques.
`;

// ======================================================
// CHAMAR OPENROUTER
// ======================================================

async function chamarIA(
  messages,
  options = {}
) {

  if (!OPENROUTER_API_KEY) {

    throw new Error(
      'OPENROUTER_API_KEY não configurada no Render.'
    );
  }

  const maxTokens =
    options.maxTokens || 3000;

  const timeoutMs =
    options.timeoutMs || 30000;

  const maxTentativas =
    options.maxTentativas || 1;

  console.log(
    'IA - iniciando chamada OpenRouter...',
    'modelo =',
    AI_MODEL,
    'timeout =',
    `${timeoutMs}ms`,
    'maxTokens =',
    maxTokens,
    'reasoning = none'
  );

  let ultimoErro =
    'Erro desconhecido na IA.';

  for (
    let tentativa = 1;
    tentativa <= maxTentativas;
    tentativa++
  ) {

    const controller =
      new AbortController();

    let timeout = null;

    try {

      console.log(
        `IA - tentativa ${tentativa}/${maxTentativas}`
      );

      timeout =
        setTimeout(
          () => {

            console.error(
              'IA - TIMEOUT: abortando requisição OpenRouter.'
            );

            controller.abort();

          },
          timeoutMs
        );

      const response =
        await fetch(
          OPENROUTER_URL,
          {
            method: 'POST',

            headers: {
              'Authorization':
                `Bearer ${OPENROUTER_API_KEY}`,

              'Content-Type':
                'application/json',

              'HTTP-Referer':
                'https://ocorrencias-mandu.onrender.com',

              'X-Title':
                'CTT Diário de Turno - MANDU'
            },

            body:
              JSON.stringify({
                model:
                  AI_MODEL,

                messages,

                max_tokens:
                  maxTokens,

                temperature:
                  0.2,

                // DESLIGA O RACIOCÍNIO.
                // Isso evita que modelos gratuitos
                // gastem todo o limite pensando e
                // retornem content = null.
                reasoning: {
                  effort:
                    'none'
                }
              }),

            signal:
              controller.signal
          }
        );

      console.log(
        'IA - resposta HTTP recebida:',
        response.status
      );

      const raw =
        await response.text();

      if (!raw) {

        throw new Error(
          'OpenRouter retornou uma resposta vazia.'
        );
      }

      let data = null;

      try {

        data =
          JSON.parse(raw);

      } catch {

        console.error(
          'IA - resposta não é JSON:',
          raw.slice(0, 1500)
        );

        throw new Error(
          'OpenRouter retornou uma resposta inválida.'
        );
      }

      console.log(
        'IA - HTTP:',
        response.status
      );

      if (
        !response.ok
      ) {

        const detalhe =
          data?.error?.message ||
          raw.slice(0, 1000) ||
          `HTTP ${response.status}`;

        ultimoErro =
          `OpenRouter HTTP ${response.status}: ${detalhe}`;

        console.error(
          'IA - ERRO:',
          ultimoErro
        );

        throw new Error(
          ultimoErro
        );
      }

      const escolha =
        data?.choices?.[0];

      const conteudo =
        escolha
          ?.message
          ?.content;

      console.log(
        'IA - modelo utilizado:',
        data?.model || 'desconhecido'
      );

      console.log(
        'IA - finish_reason:',
        escolha?.finish_reason || 'não informado'
      );

      console.log(
        'IA - content:',
        conteudo
          ? `${String(conteudo).length} caracteres`
          : 'VAZIO'
      );

      /*
       * Alguns modelos de raciocínio podem retornar
       * content vazio/null quando atingem o limite
       * antes de produzir a resposta.
       *
       * NÃO usamos o campo "reasoning" como resposta,
       * pois ele é raciocínio interno do modelo.
       */

      if (
        typeof conteudo !== 'string' ||
        !conteudo.trim()
      ) {

        const finishReason =
          escolha?.finish_reason ||
          'desconhecido';

        throw new Error(
          `A IA não gerou uma resposta final. Motivo: ${finishReason}.`
        );
      }

      console.log(
        'IA - resposta recebida com sucesso:',
        conteudo.length,
        'caracteres'
      );

      return conteudo.trim();

    } catch (error) {

      ultimoErro =
        error?.name === 'AbortError'
          ? `Tempo limite de ${Math.round(timeoutMs / 1000)} segundos excedido ao consultar a IA.`
          : (
              error?.message ||
              'Erro desconhecido na IA.'
            );

      console.error(
        `IA - tentativa ${tentativa} falhou:`,
        ultimoErro
      );

      if (
        tentativa < maxTentativas
      ) {

        await new Promise(
          resolve =>
            setTimeout(
              resolve,
              1500
            )
        );

        continue;
      }

      throw new Error(
        ultimoErro
      );

    } finally {

      if (timeout) {
        clearTimeout(timeout);
      }

    }
  }

  throw new Error(
    ultimoErro
  );
}

// ======================================================
// ORGANIZAR TURNO
// ======================================================

app.post(
  '/organizar-ia',
  async (req, res) => {

    console.log(
      'ORGANIZAR IA:',
      req.method,
      req.originalUrl
    );

    try {

      const ocorrencias =
        await obterOcorrenciasIA(
          req
        );

      if (
        !ocorrencias.length
      ) {

        return res.status(400).json({
          error:
            'Não existem ocorrências para organizar.'
        });
      }

      const contexto =
        gerarContextoPorFrente(
          ocorrencias
        );

      const prompt = `
Organize as ocorrências abaixo em uma mensagem profissional para WhatsApp.

Utilize esta estrutura:

*📋 DIÁRIO DE TURNO — MANDU*

*FRENTE 501*
...

*FRENTE 502*
...

*FRENTE 503*
...

*FRENTE 504*
...

*FRENTE 505*
...

*FRENTE 506*
...

*⚠️ PONTOS DE ATENÇÃO*
...

*🚨 RISCOS / IMPACTOS*
...

*🎯 AÇÕES / ACOMPANHAMENTOS*
...

Não invente informações.

OCORRÊNCIAS:

${contexto}
`;

      const resultado =
        await chamarIA(
          [
            {
              role: 'system',
              content:
                SYSTEM_IA
            },

            {
              role: 'user',
              content:
                prompt
            }
          ],
          {
            maxTokens: 2200,
            timeoutMs: 30000,
            maxTentativas: 1
          }
        );

      res.json({
        texto:
          resultado,

        total:
          ocorrencias.length
      });

    } catch (error) {

      console.error(
        'ERRO ORGANIZAR IA:',
        error
      );

      res.status(500).json({
        error:
          error.message ||
          'Erro ao organizar turno.'
      });
    }
  }
);

// ======================================================
// RESUMO EXECUTIVO IA
// ======================================================

app.post(
  [
    '/resumo-executivo-ia',
    '/api/resumo-executivo-ia'
  ],

  async (req, res) => {

    console.log(
      '======================================'
    );

    console.log(
      'RESUMO EXECUTIVO IA:',
      req.method,
      req.originalUrl
    );

    try {

      const ocorrencias =
        await obterOcorrenciasIA(
          req
        );

      console.log(
        'RESUMO EXECUTIVO - total:',
        ocorrencias.length
      );

      if (
        !ocorrencias.length
      ) {

        return res.status(400).json({
          error:
            'Não existem ocorrências para gerar o resumo executivo.'
        });
      }

      const contexto =
        gerarContextoPorFrente(
          ocorrencias
        );

      const prompt = `
Gere um RESUMO EXECUTIVO do turno do CTT MANDU.

O texto será enviado para um grupo de gestão pelo WhatsApp.

Seja extremamente direto.

Utilize somente as ocorrências fornecidas.

Não invente:
- números;
- causas;
- horários;
- ações;
- resultados;
- informações não presentes nos dados.

Utilize exatamente esta estrutura:

*⚡ RESUMO EXECUTIVO — MANDU*

*PRINCIPAIS PONTOS*
- Liste os principais fatos operacionais identificados.

*RISCOS / IMPACTOS*
- Liste somente riscos ou impactos sustentados pelas ocorrências.

*AÇÕES / COBRANÇAS*
- Liste acompanhamentos necessários.
- Quando for recomendação, use *SUGESTÃO:*.

*FRENTES DE ATENÇÃO*
- Informe as frentes que possuem ocorrências relevantes e explique objetivamente o motivo.

DADOS DO TURNO:

${contexto}
`;

      console.log(
        'RESUMO EXECUTIVO - chamando IA...'
      );

      const resultado =
        await chamarIA(
          [
            {
              role: 'system',
              content:
                SYSTEM_IA
            },

            {
              role: 'user',
              content:
                prompt
            }
          ],
          {
            maxTokens: 1600,
            timeoutMs: 30000,
            maxTentativas: 1
          }
        );

      console.log(
        'RESUMO EXECUTIVO - IA respondeu:',
        resultado.length,
        'caracteres'
      );

      console.log(
        '======================================'
      );

      return res.json({

        texto:
          resultado,

        executivo:
          resultado,

        total:
          ocorrencias.length

      });

    } catch (error) {

      console.error(
        'ERRO RESUMO EXECUTIVO IA:',
        error
      );

      return res.status(500).json({

        error:
          error?.message ||
          'Erro ao gerar resumo executivo.'

      });
    }
  }
);

// ======================================================
// FECHAR TURNO
// ======================================================

app.post(
  [
    '/fechar-turno',
    '/fechar-turno-ia',
    '/api/fechar-turno',
    '/api/fechar-turno-ia'
  ],

  async (req, res) => {

    console.log(
      '======================================'
    );

    console.log(
      'FECHAR TURNO:',
      req.method,
      req.originalUrl
    );

    console.log(
      'FECHAR TURNO - BODY:',
      JSON.stringify(
        req.body
      ).slice(
        0,
        1500
      )
    );

    try {

      const ocorrencias =
        await obterOcorrenciasIA(
          req
        );

      console.log(
        'FECHAR TURNO - total:',
        ocorrencias.length
      );

      if (
        !ocorrencias.length
      ) {

        return res.status(400).json({
          error:
            'Não existem ocorrências para fechar o turno.'
        });
      }

      const contexto =
        gerarContextoPorFrente(
          ocorrencias
        );

      console.log(
        'FECHAR TURNO - contexto gerado:',
        contexto.length,
        'caracteres'
      );

      const prompt = `
Faça o FECHAMENTO COMPLETO do turno do CTT MANDU.

IMPORTANTE:

- Utilize SOMENTE as ocorrências fornecidas.
- Não invente informações.
- Não invente números.
- Não invente causas.
- Não invente ações já realizadas.
- Recomendações devem ser marcadas como *SUGESTÃO:*.
- O texto deve ser profissional, técnico e direto.
- O resultado será utilizado no WhatsApp.

RETORNE EXATAMENTE NESTA ESTRUTURA:

===== GERENCIAL =====

*📋 FECHAMENTO DE TURNO — MANDU*

*FRENTES COM OCORRÊNCIAS*
- Informe somente as frentes que possuem ocorrências.

*⚠️ PRINCIPAIS PROBLEMAS*
- ...

*🔁 PROBLEMAS RECORRENTES*
- ...

*🚨 RISCOS / IMPACTOS*
- ...

*🎯 AÇÕES / ACOMPANHAMENTOS*
- ...


===== EXECUTIVO =====

*⚡ RESUMO EXECUTIVO — MANDU*

*PRINCIPAIS PONTOS*
- ...

*RISCOS*
- ...

*AÇÕES / COBRANÇAS*
- ...


===== FECHAMENTO =====

*🧠 FECHAMENTO OPERACIONAL*

*RESUMO DO TURNO*
...

*OCORRÊNCIAS POR FRENTE*
...

*PRINCIPAIS PROBLEMAS*
...

*PROBLEMAS RECORRENTES*
...

*RISCOS / IMPACTOS*
...

*PENDÊNCIAS*
...

*PLANO DE AÇÃO*
...

*PONTOS PARA O PRÓXIMO TURNO*
...


DADOS DO TURNO:

${contexto}
`;

      console.log(
        'FECHAR TURNO - chamando IA...'
      );

      const resposta =
        await chamarIA(
          [
            {
              role: 'system',
              content:
                SYSTEM_IA
            },

            {
              role: 'user',
              content:
                prompt
            }
          ],
          {
            maxTokens: 2600,
            timeoutMs: 30000,
            maxTentativas: 1
          }
        );

      console.log(
        'FECHAR TURNO - IA respondeu:',
        resposta.length,
        'caracteres'
      );

      let gerencial =
        resposta;

      let executivo =
        resposta;

      let fechamento =
        resposta;

      const marcadorGerencial =
        '===== GERENCIAL =====';

      const marcadorExecutivo =
        '===== EXECUTIVO =====';

      const marcadorFechamento =
        '===== FECHAMENTO =====';

      if (
        resposta.includes(
          marcadorGerencial
        ) &&
        resposta.includes(
          marcadorExecutivo
        ) &&
        resposta.includes(
          marcadorFechamento
        )
      ) {

        const inicioGerencial =
          resposta.indexOf(
            marcadorGerencial
          ) +
          marcadorGerencial.length;

        const inicioExecutivo =
          resposta.indexOf(
            marcadorExecutivo
          );

        const inicioFechamento =
          resposta.indexOf(
            marcadorFechamento
          );

        gerencial =
          resposta
            .slice(
              inicioGerencial,
              inicioExecutivo
            )
            .trim();

        executivo =
          resposta
            .slice(
              inicioExecutivo +
                marcadorExecutivo.length,
              inicioFechamento
            )
            .trim();

        fechamento =
          resposta
            .slice(
              inicioFechamento +
                marcadorFechamento.length
            )
            .trim();
      }

      const frentes =
        new Set(
          ocorrencias.map(
            item =>
              item.frente
          )
        );

      console.log(
        'FECHAR TURNO - concluído.'
      );

      console.log(
        'FECHAR TURNO - frentes:',
        frentes.size
      );

      console.log(
        '======================================'
      );

      return res.json({

        gerencial,

        executivo,

        fechamento,

        texto:
          fechamento,

        total:
          ocorrencias.length,

        frentes:
          frentes.size

      });

    } catch (error) {

      console.error(
        '======================================'
      );

      console.error(
        'ERRO FECHAR TURNO:'
      );

      console.error(
        error
      );

      console.error(
        'MENSAGEM:',
        error?.message
      );

      console.error(
        '======================================'
      );

      return res.status(500).json({

        error:
          error?.message ||
          'Erro ao fechar turno.'

      });
    }
  }
);

// ======================================================
// CHAT OPERACIONAL
// ======================================================

app.post(
  [
    '/chat-ia',
    '/api/chat-ia'
  ],

  async (req, res) => {

    console.log(
      'CHAT IA:',
      req.method,
      req.originalUrl
    );

    try {

      const pergunta =
        textoSeguro(
          req.body?.pergunta,
          5000
        );

      if (!pergunta) {

        return res.status(400).json({
          error:
            'Digite uma pergunta.'
        });
      }

      const ocorrencias =
        await obterOcorrenciasIA(
          req
        );

      if (
        !ocorrencias.length
      ) {

        return res.status(400).json({
          error:
            'Não existem ocorrências registradas para analisar.'
        });
      }

      const contexto =
        gerarContextoPorFrente(
          ocorrencias
        );

      const historico =
        Array.isArray(
          req.body?.historico
        )
          ? req.body.historico
              .slice(-10)
              .map(item => ({
                role:
                  item?.role === 'user'
                    ? 'user'
                    : 'assistant',

                content:
                  textoSeguro(
                    item?.content,
                    5000
                  )
              }))
          : [];

      const prompt = `
Você está no CHAT OPERACIONAL do CTT MANDU.

Responda à pergunta do usuário utilizando os dados do turno.

PERGUNTA:

${pergunta}

DADOS DO TURNO:

${contexto}

REGRAS:

- Utilize somente os dados fornecidos.
- Não invente informações.
- Se não houver dados suficientes, diga isso.
- Seja direto e operacional.
- Identifique recorrências quando existirem.
- Identifique riscos somente quando houver evidência.
- Recomendações devem ser marcadas como *SUGESTÃO:*.
- Não transforme hipótese em fato.

Se o usuário pedir plano de voo, apresente ações práticas.

Se perguntar sobre problemas repetidos, compare as ocorrências.

Se perguntar qual frente precisa de atenção, explique quais dados sustentam a análise.
`;

      const resposta =
        await chamarIA(
          [
            {
              role: 'system',
              content:
                SYSTEM_IA
            },

            ...historico,

            {
              role: 'user',
              content:
                prompt
            }
          ],
          {
            maxTokens: 1800,
            timeoutMs: 30000,
            maxTentativas: 1
          }
        );

      res.json({

        resposta,

        total:
          ocorrencias.length

      });

    } catch (error) {

      console.error(
        'ERRO CHAT IA:',
        error
      );

      res.status(500).json({
        error:
          error.message ||
          'Erro no chat operacional.'
      });
    }
  }
);

// ======================================================
// 404 API
// ======================================================

app.use(
  '/api',
  (req, res) => {

    console.error(
      'API 404:',
      req.method,
      req.originalUrl
    );

    res.status(404).json({

      error:
        'Rota da API não encontrada.',

      rota:
        req.originalUrl

    });
  }
);

// ======================================================
// 404 GERAL
// ======================================================

app.use(
  (req, res) => {

    console.error(
      '404:',
      req.method,
      req.originalUrl
    );

    res.status(404).send(
      'Página não encontrada.'
    );
  }
);

// ======================================================
// ERRO GLOBAL
// ======================================================

app.use(
  (
    error,
    req,
    res,
    next
  ) => {

    console.error(
      'ERRO GLOBAL:',
      error
    );

    if (
      res.headersSent
    ) {
      return next(error);
    }

    res.status(500).json({
      error:
        error?.message ||
        'Erro interno do servidor.'
    });
  }
);

// ======================================================
// START
// ======================================================

app.listen(
  PORT,
  () => {

    console.log(
      `CTT Diário de Turno MANDU rodando na porta ${PORT}`
    );

    console.log(
      `Supabase: ${
        supa
          ? 'OK'
          : 'NÃO CONFIGURADO'
      }`
    );

    console.log(
      `OpenRouter: ${
        OPENROUTER_API_KEY
          ? 'OK'
          : 'NÃO CONFIGURADO'
      }`
    );

    console.log(
      `Modelo IA: ${AI_MODEL}`
    );

    console.log(
      'Raciocínio IA: DESATIVADO'
    );

    console.log(
      'IA: organização por frente'
    );

    console.log(
      'IA: resumo executivo'
    );

    console.log(
      'IA: fechamento de turno'
    );

    console.log(
      'IA: chat operacional'
    );
  }
);
