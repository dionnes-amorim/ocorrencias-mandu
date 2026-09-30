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

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

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
  if (valor === undefined || valor === null) {
    return '';
  }

  return String(valor)
    .replace(/\u0000/g, '')
    .trim()
    .slice(0, limite);
}

function frenteSegura(valor) {
  const frente = textoSeguro(valor, 50);

  return frente || 'GERAL';
}

function turnoAtual() {
  const hora = new Date().getHours();

  if (hora >= 6 && hora < 14) {
    return 'A';
  }

  if (hora >= 14 && hora < 22) {
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
    hora: textoSeguro(item?.hora, 20),
    frente: frenteSegura(item?.frente),
    texto: textoSeguro(item?.texto, 10000),
    turno: textoSeguro(item?.turno, 20),
    unidade: textoSeguro(item?.unidade, 50) || 'MANDU',
    created_at: item?.created_at || null
  };
}

// ======================================================
// STATUS
// ======================================================

app.get('/api/status', async (req, res) => {
  res.json({
    ok: true,
    sistema: 'CTT Diário de Turno - MANDU',
    supabase: !!supa,
    openrouter: !!OPENROUTER_API_KEY,
    modelo: AI_MODEL,
    hora: horaAtual()
  });
});

// ======================================================
// OCORRÊNCIAS - GET
// ======================================================

app.get('/api/ocorrencias', async (req, res) => {
  try {
    if (!supa) {
      return res.status(500).json({
        error: 'Supabase não configurado no Render.'
      });
    }

    const { data, error } = await supa
      .from(TABLE)
      .select('*')
      .order('created_at', {
        ascending: false
      });

    if (error) {
      console.error(
        'ERRO SUPABASE GET:',
        error
      );

      return res.status(500).json({
        error: error.message
      });
    }

    res.json(
      (data || []).map(normalizarOcorrencia)
    );

  } catch (error) {
    console.error(
      'ERRO GET OCORRÊNCIAS:',
      error
    );

    res.status(500).json({
      error: 'Erro ao carregar ocorrências.'
    });
  }
});

// ======================================================
// OCORRÊNCIAS - POST
// ======================================================

app.post('/api/ocorrencias', async (req, res) => {
  try {
    if (!supa) {
      return res.status(500).json({
        error: 'Supabase não configurado no Render.'
      });
    }

    const texto = textoSeguro(
      req.body?.texto,
      10000
    );

    if (!texto) {
      return res.status(400).json({
        error: 'Texto da ocorrência é obrigatório.'
      });
    }

    const registro = {
      hora:
        textoSeguro(req.body?.hora, 20) ||
        horaAtual(),

      frente:
        frenteSegura(req.body?.frente),

      texto,

      turno:
        textoSeguro(req.body?.turno, 20) ||
        turnoAtual(),

      unidade:
        textoSeguro(req.body?.unidade, 50) ||
        'MANDU'
    };

    const { data, error } = await supa
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
        error: error.message
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
      error: 'Erro ao salvar ocorrência.'
    });
  }
});

// ======================================================
// OCORRÊNCIAS - PUT
// ======================================================

app.put('/api/ocorrencias/:id', async (req, res) => {
  try {
    if (!supa) {
      return res.status(500).json({
        error: 'Supabase não configurado no Render.'
      });
    }

    const id = textoSeguro(
      req.params.id,
      100
    );

    const atualizacao = {};

    if (req.body?.texto !== undefined) {
      atualizacao.texto =
        textoSeguro(
          req.body.texto,
          10000
        );
    }

    if (req.body?.frente !== undefined) {
      atualizacao.frente =
        frenteSegura(
          req.body.frente
        );
    }

    if (req.body?.hora !== undefined) {
      atualizacao.hora =
        textoSeguro(
          req.body.hora,
          20
        );
    }

    if (req.body?.turno !== undefined) {
      atualizacao.turno =
        textoSeguro(
          req.body.turno,
          20
        );
    }

    if (req.body?.unidade !== undefined) {
      atualizacao.unidade =
        textoSeguro(
          req.body.unidade,
          50
        );
    }

    if (!Object.keys(atualizacao).length) {
      return res.status(400).json({
        error: 'Nenhum campo para atualizar.'
      });
    }

    const { data, error } = await supa
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
        error: error.message
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
      error: 'Erro ao atualizar ocorrência.'
    });
  }
});

// ======================================================
// OCORRÊNCIA - DELETE INDIVIDUAL
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

      const id = textoSeguro(
        req.params.id,
        100
      );

      const { error } = await supa
        .from(TABLE)
        .delete()
        .eq('id', id);

      if (error) {
        console.error(
          'ERRO SUPABASE DELETE:',
          error
        );

        return res.status(500).json({
          error: error.message
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
// LIMPAR TODAS AS OCORRÊNCIAS
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

      const { error } = await supa
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
          error: error.message
        });
      }

      res.json({
        ok: true
      });

    } catch (error) {
      console.error(
        'ERRO LIMPAR OCORRÊNCIAS:',
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
// PREPARAÇÃO PARA IA
// ======================================================

function prepararOcorrenciasIA(
  ocorrencias = []
) {
  return (ocorrencias || [])
    .map(normalizarOcorrencia)
    .filter(item => item.texto);
}

// ======================================================
// AGRUPAR POR FRENTE
// ======================================================

function agruparPorFrente(
  ocorrencias = []
) {
  const grupos = {};

  for (const item of ocorrencias) {
    const frente =
      item.frente || 'GERAL';

    if (!grupos[frente]) {
      grupos[frente] = [];
    }

    grupos[frente].push(item);
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
    return 'Nenhuma ocorrência registrada.';
  }

  return frentes
    .map(frente => {
      const linhas =
        grupos[frente]
          .map(item => {
            return `- ${item.hora || '--:--'} | ${item.texto}`;
          })
          .join('\n');

      return `FRENTE ${frente}\n${linhas}`;
    })
    .join('\n\n');
}

// ======================================================
// BUSCAR OCORRÊNCIAS
// ======================================================

async function obterOcorrenciasIA(req) {

  // Se o frontend pedir explicitamente
  // para utilizar o banco, buscamos diretamente
  // no Supabase.

  if (
    req.body?.usarBanco === true &&
    supa
  ) {
    const { data, error } = await supa
      .from(TABLE)
      .select('*')
      .order('created_at', {
        ascending: true
      });

    if (error) {
      throw new Error(
        `Erro ao consultar Supabase: ${error.message}`
      );
    }

    return prepararOcorrenciasIA(
      data || []
    );
  }

  // Compatibilidade com chamadas antigas
  // que enviam as ocorrências no body.

  return prepararOcorrenciasIA(
    req.body?.ocorrencias || []
  );
}

// ======================================================
// IA - SYSTEM PROMPT
// ======================================================

const SYSTEM_IA = `
Você é o assistente operacional do CTT Diário de Turno da unidade MANDU.

Sua função é analisar exclusivamente as informações fornecidas.

REGRAS FUNDAMENTAIS:

1. Não invente ocorrências, números, causas ou fatos.
2. Não crie informações que não estejam no contexto.
3. Quando fizer uma recomendação, deixe claro que é SUGESTÃO.
4. Não trate uma hipótese como fato.
5. Seja técnico, direto e objetivo.
6. Use linguagem adequada para comunicação operacional e gerencial.
7. Organize as informações por frente quando fizer sentido.
8. Identifique problemas repetidos.
9. Identifique riscos e impactos operacionais.
10. Aponte ações e acompanhamentos possíveis.
11. Use português do Brasil.
12. Formate mensagens para WhatsApp utilizando *asteriscos* para destaque.
13. Não utilize markdown com # para títulos.
14. Não faça textos excessivamente longos.
15. Preserve números, horários e frentes exatamente quando estiverem disponíveis.
16. Se não houver informação suficiente para responder algo, diga claramente que não há dados suficientes.

Contexto:
CTT Diário de Turno — MANDU.
Objetivo: apoiar acompanhamento operacional, continuidade, produtividade, manutenção, transporte, colheita, plantio, muda e demais ocorrências registradas no turno.
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
    options.maxTokens || 2500;

  let ultimaMensagem = null;

  for (let tentativa = 1; tentativa <= 2; tentativa++) {

    try {

      const response = await fetch(
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

          body: JSON.stringify({
            model: AI_MODEL,

            messages,

            max_tokens: maxTokens,

            temperature: 0.2,

            reasoning: {
              effort: 'minimal'
            }
          })
        }
      );

      const raw =
        await response.text();

      let data = null;

      try {
        data = JSON.parse(raw);
      } catch {
        data = null;
      }

      if (!response.ok) {

        const detalhe =
          data?.error?.message ||
          raw ||
          `HTTP ${response.status}`;

        ultimaMensagem =
          `OpenRouter HTTP ${response.status}: ${detalhe}`;

        const retryable =
          response.status === 429 ||
          response.status >= 500;

        if (
          retryable &&
          tentativa < 2
        ) {
          await new Promise(
            resolve =>
              setTimeout(
                resolve,
                1200
              )
          );

          continue;
        }

        throw new Error(
          ultimaMensagem
        );
      }

      const conteudo =
        data?.choices?.[0]?.message?.content;

      if (!conteudo) {
        throw new Error(
          'A IA não retornou conteúdo.'
        );
      }

      return String(
        conteudo
      ).trim();

    } catch (error) {

      ultimaMensagem =
        error?.message ||
        'Erro desconhecido na IA.';

      if (
        tentativa < 2 &&
        /429|fetch|network|timeout|temporarily/i
          .test(ultimaMensagem)
      ) {
        await new Promise(
          resolve =>
            setTimeout(
              resolve,
              1200
            )
        );

        continue;
      }

      throw new Error(
        ultimaMensagem
      );
    }
  }

  throw new Error(
    ultimaMensagem ||
    'Falha ao consultar a IA.'
  );
}

// ======================================================
// ORGANIZAR TURNO - ROTA EXISTENTE
// ======================================================

app.post(
  '/organizar-ia',
  async (req, res) => {

    try {

      const ocorrencias =
        await obterOcorrenciasIA(req);

      if (!ocorrencias.length) {
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

Obrigatoriamente utilize esta estrutura:

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

Depois:

*⚠️ PONTOS DE ATENÇÃO*
...

*🚨 RISCOS / IMPACTOS*
...

*🎯 AÇÕES / ACOMPANHAMENTOS*
...

Não invente informações.

Se uma frente não tiver ocorrência, não precisa criar uma seção vazia.

OCORRÊNCIAS:

${contexto}
`;

      const resultado =
        await chamarIA(
          [
            {
              role: 'system',
              content: SYSTEM_IA
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          {
            maxTokens: 2500
          }
        );

      res.json({
        texto: resultado,
        total: ocorrencias.length
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
// FECHAR TURNO
//
// IMPORTANTE:
// Aceita todas estas rotas:
//
// /fechar-turno
// /fechar-turno-ia
// /api/fechar-turno
// /api/fechar-turno-ia
//
// Isso corrige o 404 caso o index esteja usando
// qualquer uma delas.
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
      'FECHAR TURNO:',
      req.method,
      req.originalUrl
    );

    try {

      const ocorrencias =
        await obterOcorrenciasIA(req);

      if (!ocorrencias.length) {

        return res.status(400).json({
          error:
            'Não existem ocorrências para fechar o turno.'
        });
      }

      const contexto =
        gerarContextoPorFrente(
          ocorrencias
        );

      // ----------------------------------------------
      // RESUMO GERENCIAL
      // ----------------------------------------------

      const promptGerencial = `
Faça o fechamento gerencial do turno do CTT MANDU.

Utilize SOMENTE as ocorrências fornecidas.

O texto deve estar pronto para copiar e colar no WhatsApp.

Estrutura:

*📋 FECHAMENTO DE TURNO — MANDU*

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

*⚠️ PRINCIPAIS PROBLEMAS*
...

*🔁 PROBLEMAS RECORRENTES*
...

*🚨 RISCOS / IMPACTOS*
...

*🎯 AÇÕES / ACOMPANHAMENTOS*
...

Não invente dados.

OCORRÊNCIAS:

${contexto}
`;

      // ----------------------------------------------
      // RESUMO EXECUTIVO
      // ----------------------------------------------

      const promptExecutivo = `
Faça um resumo executivo extremamente direto do turno do CTT MANDU.

O objetivo é uma mensagem curta para grupo de gestão.

Formato:

*⚡ RESUMO EXECUTIVO — MANDU*

*PRINCIPAIS PONTOS*
- ...

*RISCOS*
- ...

*AÇÃO / COBRANÇA*
- ...

Utilize somente informações existentes nas ocorrências.

Não invente números, causas ou fatos.

OCORRÊNCIAS:

${contexto}
`;

      // ----------------------------------------------
      // FECHAMENTO OPERACIONAL
      // ----------------------------------------------

      const promptFechamento = `
Faça uma análise de fechamento operacional do turno.

Identifique:

1. Resumo do turno
2. Ocorrências por frente
3. Principais problemas
4. Problemas recorrentes
5. Riscos e impactos
6. Pendências
7. Plano de ação
8. Pontos que precisam ser confirmados no próximo turno

Use linguagem técnica, objetiva e operacional.

Quando fizer recomendação, identifique como SUGESTÃO.

Não invente informações.

OCORRÊNCIAS:

${contexto}
`;

      // Executa as três análises
      // sequencialmente para reduzir pressão
      // sobre o provedor gratuito.

      const gerencial =
        await chamarIA(
          [
            {
              role: 'system',
              content: SYSTEM_IA
            },
            {
              role: 'user',
              content:
                promptGerencial
            }
          ],
          {
            maxTokens: 2500
          }
        );

      const executivo =
        await chamarIA(
          [
            {
              role: 'system',
              content: SYSTEM_IA
            },
            {
              role: 'user',
              content:
                promptExecutivo
            }
          ],
          {
            maxTokens: 1500
          }
        );

      const fechamento =
        await chamarIA(
          [
            {
              role: 'system',
              content: SYSTEM_IA
            },
            {
              role: 'user',
              content:
                promptFechamento
            }
          ],
          {
            maxTokens: 2500
          }
        );

      const frentes =
        new Set(
          ocorrencias.map(
            item =>
              item.frente
          )
        );

      res.json({
        gerencial,
        executivo,
        fechamento,
        total:
          ocorrencias.length,
        frentes:
          frentes.size
      });

    } catch (error) {

      console.error(
        'ERRO FECHAR TURNO:',
        error
      );

      res.status(500).json({
        error:
          error.message ||
          'Erro ao fechar turno.'
      });
    }
  }
);

// ======================================================
// CHAT OPERACIONAL
//
// Aceita:
// /chat-ia
// /api/chat-ia
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
        await obterOcorrenciasIA(req);

      if (!ocorrencias.length) {
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

Analise o turno inteiro e responda à pergunta do usuário.

PERGUNTA:

${pergunta}

DADOS DO TURNO:

${contexto}

Regras:

- Utilize somente os dados fornecidos.
- Não invente informações.
- Se não houver dados suficientes, diga isso.
- Seja direto e operacional.
- Considere continuidade operacional.
- Considere manutenção, transporte, colheita, plantio, muda e produtividade quando houver dados.
- Identifique recorrências quando existirem.
- Para recomendações, use o marcador *SUGESTÃO:*.
- Quando citar uma frente, mantenha o número correto.
- Não transforme hipótese em fato.

Se a pergunta solicitar plano de voo, apresente ações práticas e pontos de acompanhamento.

Se perguntar sobre problemas repetidos, compare as ocorrências disponíveis.

Se perguntar onde concentrar atenção, explique quais dados sustentam essa indicação, sem inventar.
`;

      const messages = [
        {
          role: 'system',
          content: SYSTEM_IA
        },

        ...historico,

        {
          role: 'user',
          content: prompt
        }
      ];

      const resposta =
        await chamarIA(
          messages,
          {
            maxTokens: 2500
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
//
// Fica DEPOIS das rotas acima.
// ======================================================

app.use(
  '/api',
  (req, res) => {

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

    if (
      req.path.startsWith('/api/')
    ) {
      return res.status(404).json({
        error:
          'Rota da API não encontrada.',
        rota:
          req.originalUrl
      });
    }

    res.status(404).send(
      'Página não encontrada.'
    );
  }
);

// ======================================================
// TRATAMENTO GLOBAL DE ERROS
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

    if (res.headersSent) {
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
      'Raciocínio IA: mínimo'
    );

    console.log(
      'IA: organização por frente'
    );

    console.log(
      'IA: fechamento de turno'
    );

    console.log(
      'IA: chat operacional'
    );
  }
);
