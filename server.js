import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

/* =========================================================
   CONFIGURAÇÃO
========================================================= */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

const PORT = process.env.PORT || 10000;

const SUPABASE_URL =
  process.env.SUPABASE_URL;

const SUPABASE_KEY =
  process.env.SUPABASE_SECRET_KEY ||
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  process.env.SUPABASE_ANON_KEY;

const OPENROUTER_API_KEY =
  process.env.OPENROUTER_API_KEY;

const TABLE = 'ocorrencias_mandu';

const OPENROUTER_URL =
  'https://openrouter.ai/api/v1/chat/completions';

/*
 * Roteador gratuito da OpenRouter.
 *
 * Não deixar chave de API no frontend.
 */

const AI_MODEL = 'openrouter/free';

/* =========================================================
   SUPABASE
========================================================= */

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

/* =========================================================
   EXPRESS
========================================================= */

app.disable('x-powered-by');

app.use(
  express.json({
    /*
     * Não limitamos artificialmente a quantidade
     * de ocorrências.
     *
     * O limite existe somente para evitar requisições
     * absurdamente grandes que possam derrubar o servidor.
     */
    limit: '5mb'
  })
);

app.use(
  express.urlencoded({
    extended: false,
    limit: '1mb'
  })
);

/* =========================================================
   FRONTEND
========================================================= */

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

/* =========================================================
   FUNÇÕES AUXILIARES
========================================================= */

function textoSeguro(
  valor,
  limite = 10000
) {
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
    return 'TURNO A';
  }

  if (
    hora >= 14 &&
    hora < 22
  ) {
    return 'TURNO B';
  }

  return 'TURNO C';
}

function horaAtual() {
  return new Intl.DateTimeFormat(
    'pt-BR',
    {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }
  ).format(new Date());
}

function normalizarOcorrencia(item) {
  return {
    id: item.id,
    hora: item.hora || '',
    frente:
      item.frente || 'GERAL',
    texto:
      item.texto || '',
    turno:
      item.turno || '',
    unidade:
      item.unidade || 'MANDU',
    created_at:
      item.created_at || null
  };
}

/* =========================================================
   STATUS
========================================================= */

app.get(
  '/api/status',
  async (req, res) => {

    let supabaseStatus =
      'ERRO';

    if (supa) {

      try {

        const { error } =
          await supa
            .from(TABLE)
            .select('id')
            .limit(1);

        supabaseStatus =
          error
            ? 'ERRO'
            : 'OK';

      } catch {

        supabaseStatus =
          'ERRO';
      }

    } else {

      supabaseStatus =
        'NÃO CONFIGURADO';
    }

    res.json({
      status: 'online',
      servidor: 'OK',
      supabase:
        supabaseStatus,
      openrouter:
        OPENROUTER_API_KEY
          ? 'OK'
          : 'NÃO CONFIGURADO',
      modelo: AI_MODEL,
      unidade: 'MANDU',
      timestamp:
        new Date().toISOString()
    });
  }
);

/* =========================================================
   VERIFICAÇÕES
========================================================= */

function exigirSupabase(res) {

  if (!supa) {

    res.status(500).json({
      error:
        'Supabase não configurado no Render.'
    });

    return false;
  }

  return true;
}

function exigirIA(res) {

  if (!OPENROUTER_API_KEY) {

    res.status(500).json({
      error:
        'OPENROUTER_API_KEY não configurada no Render.'
    });

    return false;
  }

  return true;
}

/* =========================================================
   GET OCORRÊNCIAS
========================================================= */

app.get(
  '/api/ocorrencias',
  async (req, res) => {

    if (!exigirSupabase(res)) {
      return;
    }

    try {

      const {
        data,
        error
      } = await supa
        .from(TABLE)
        .select(
          'id,hora,frente,texto,turno,unidade,created_at'
        )
        .order(
          'created_at',
          {
            ascending: false
          }
        );

      if (error) {

        console.error(
          'Erro Supabase GET:',
          error
        );

        return res.status(500).json({
          error:
            'Erro ao carregar ocorrências.'
        });
      }

      res.json(
        (data || [])
          .map(normalizarOcorrencia)
      );

    } catch (erro) {

      console.error(
        'Erro /api/ocorrencias:',
        erro
      );

      res.status(500).json({
        error:
          'Erro interno ao carregar ocorrências.'
      });
    }
  }
);

/* =========================================================
   POST OCORRÊNCIA
========================================================= */

app.post(
  '/api/ocorrencias',
  async (req, res) => {

    if (!exigirSupabase(res)) {
      return;
    }

    try {

      const texto =
        textoSeguro(
          req.body?.texto,
          10000
        );

      if (!texto) {

        return res.status(400).json({
          error:
            'Digite uma ocorrência.'
        });
      }

      const hora =
        textoSeguro(
          req.body?.hora,
          20
        ) || horaAtual();

      const frente =
        frenteSegura(
          req.body?.frente
        );

      const turno =
        textoSeguro(
          req.body?.turno,
          30
        ) || turnoAtual();

      const unidade =
        textoSeguro(
          req.body?.unidade,
          30
        ) || 'MANDU';

      const novaOcorrencia = {
        hora,
        frente,
        texto,
        turno,
        unidade
      };

      const {
        data,
        error
      } = await supa
        .from(TABLE)
        .insert(
          novaOcorrencia
        )
        .select(
          'id,hora,frente,texto,turno,unidade,created_at'
        )
        .single();

      if (error) {

        console.error(
          'Erro Supabase INSERT:',
          error
        );

        return res.status(500).json({
          error:
            'Erro ao salvar ocorrência.'
        });
      }

      res.status(201).json(
        normalizarOcorrencia(data)
      );

    } catch (erro) {

      console.error(
        'Erro POST ocorrência:',
        erro
      );

      res.status(500).json({
        error:
          'Erro interno ao salvar ocorrência.'
      });
    }
  }
);

/* =========================================================
   PUT OCORRÊNCIA
========================================================= */

app.put(
  '/api/ocorrencias/:id',
  async (req, res) => {

    if (!exigirSupabase(res)) {
      return;
    }

    try {

      const id =
        textoSeguro(
          req.params.id,
          100
        );

      if (!id) {

        return res.status(400).json({
          error:
            'ID inválido.'
        });
      }

      const alteracao = {};

      /*
       * Só altera o que foi enviado.
       *
       * Assim editar o texto não apaga
       * a hora ou a frente.
       */

      if (
        req.body?.texto !== undefined
      ) {

        const texto =
          textoSeguro(
            req.body.texto,
            10000
          );

        if (!texto) {

          return res.status(400).json({
            error:
              'O texto da ocorrência não pode ficar vazio.'
          });
        }

        alteracao.texto =
          texto;
      }

      if (
        req.body?.hora !== undefined
      ) {

        alteracao.hora =
          textoSeguro(
            req.body.hora,
            20
          );
      }

      if (
        req.body?.frente !== undefined
      ) {

        alteracao.frente =
          frenteSegura(
            req.body.frente
          );
      }

      if (
        Object.keys(alteracao)
          .length === 0
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
        .update(alteracao)
        .eq('id', id)
        .select(
          'id,hora,frente,texto,turno,unidade,created_at'
        )
        .single();

      if (error) {

        console.error(
          'Erro Supabase UPDATE:',
          error
        );

        return res.status(500).json({
          error:
            'Erro ao atualizar ocorrência.'
        });
      }

      res.json(
        normalizarOcorrencia(data)
      );

    } catch (erro) {

      console.error(
        'Erro PUT ocorrência:',
        erro
      );

      res.status(500).json({
        error:
          'Erro interno ao atualizar ocorrência.'
      });
    }
  }
);

/* =========================================================
   DELETE UMA OCORRÊNCIA
========================================================= */

app.delete(
  '/api/ocorrencias/:id',
  async (req, res) => {

    if (!exigirSupabase(res)) {
      return;
    }

    try {

      const id =
        textoSeguro(
          req.params.id,
          100
        );

      if (!id) {

        return res.status(400).json({
          error:
            'ID inválido.'
        });
      }

      const {
        error
      } = await supa
        .from(TABLE)
        .delete()
        .eq('id', id);

      if (error) {

        console.error(
          'Erro Supabase DELETE:',
          error
        );

        return res.status(500).json({
          error:
            'Erro ao excluir ocorrência.'
        });
      }

      res.json({
        ok: true
      });

    } catch (erro) {

      console.error(
        'Erro DELETE ocorrência:',
        erro
      );

      res.status(500).json({
        error:
          'Erro interno ao excluir ocorrência.'
      });
    }
  }
);

/* =========================================================
   DELETE TODAS AS OCORRÊNCIAS
========================================================= */

app.delete(
  '/api/ocorrencias',
  async (req, res) => {

    if (!exigirSupabase(res)) {
      return;
    }

    try {

      const {
        error
      } = await supa
        .from(TABLE)
        .delete()
        .neq(
          'id',
          '00000000-0000-0000-0000-000000000000'
        );

      if (error) {

        console.error(
          'Erro Supabase DELETE ALL:',
          error
        );

        return res.status(500).json({
          error:
            'Erro ao limpar ocorrências.'
        });
      }

      res.json({
        ok: true
      });

    } catch (erro) {

      console.error(
        'Erro limpar ocorrências:',
        erro
      );

      res.status(500).json({
        error:
          'Erro interno ao limpar ocorrências.'
      });
    }
  }
);

/* =========================================================
   PREPARAR OCORRÊNCIAS PARA IA
========================================================= */

/*
 * ATENÇÃO:
 *
 * Aqui NÃO existe mais:
 *
 * .slice(0, 120)
 *
 * Portanto, todas as ocorrências enviadas
 * pelo frontend serão consideradas.
 */

function prepararOcorrenciasIA(
  ocorrencias
) {

  if (
    !Array.isArray(ocorrencias)
  ) {
    return [];
  }

  return ocorrencias
    .map(item => ({

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
        )

    }))
    .filter(
      item => item.texto
    );
}

/* =========================================================
   AGRUPAMENTO POR FRENTE
========================================================= */

/*
 * Fazemos o agrupamento no servidor.
 *
 * Isso ajuda a IA e também garante que a estrutura
 * das informações chegue organizada.
 */

function agruparPorFrente(
  ocorrencias
) {

  const grupos = {};

  for (
    const ocorrencia of ocorrencias
  ) {

    const frente =
      ocorrencia.frente ||
      'GERAL';

    if (!grupos[frente]) {
      grupos[frente] = [];
    }

    grupos[frente].push(
      ocorrencia
    );
  }

  return grupos;
}

function gerarContextoPorFrente(
  ocorrencias
) {

  const grupos =
    agruparPorFrente(
      ocorrencias
    );

  return Object.entries(
    grupos
  )
    .map(
      (
        [frente, itens]
      ) => {

        const lista =
          itens
            .map(
              (item, index) =>
                `${index + 1}. [${item.hora || '-'}] ${item.texto}`
            )
            .join('\n');

        return `
FRENTE ${frente}

${lista}
        `.trim();

      }
    )
    .join('\n\n');
}

/* =========================================================
   PROMPT PRINCIPAL DA IA
========================================================= */

const SYSTEM_IA = `
Você é o copiloto operacional do CTT Diário de Turno da unidade MANDU.

Sua função é transformar as ocorrências reais do turno em uma
mensagem objetiva, organizada e pronta para ser enviada no
grupo de WhatsApp da gerência.

REGRA PRINCIPAL:

Analise SOMENTE as informações fornecidas.

NÃO invente:
- números;
- produção;
- capacidades;
- disponibilidade;
- causas;
- equipamentos;
- tempos;
- metas;
- pessoas;
- fatos;
- ações que não estejam sustentadas pelas ocorrências.

Quando fizer uma sugestão sua, identifique como SUGESTÃO.

A mensagem deve ter linguagem:
- profissional;
- técnica;
- direta;
- gerencial;
- objetiva;
- adequada para WhatsApp.

NÃO faça introdução longa.

NÃO escreva explicações sobre como você analisou.

NÃO diga que você é uma IA.

NÃO use linguagem acadêmica.

NÃO repita a mesma informação várias vezes.

IMPORTANTE:

As ocorrências devem ser organizadas POR FRENTE.

Cada frente deve possuir seus próprios tópicos.

Quando uma informação não estiver vinculada a uma frente específica,
utilize a categoria GERAL.

Estrutura obrigatória:

*📋 DIÁRIO DE TURNO — MANDU*

*FRENTE 501*
• Ocorrência relevante...
• Ocorrência relevante...

*FRENTE 502*
• Ocorrência relevante...
• Ocorrência relevante...

E assim por diante somente para as frentes que possuem ocorrências.

Depois das frentes, faça:

*⚠️ PONTOS DE ATENÇÃO*
• ...

*🚨 RISCOS / IMPACTOS*
• ...

*🎯 AÇÕES / ACOMPANHAMENTOS*
• ...

Se não houver informação suficiente para alguma dessas categorias,
não invente.

Pode escrever:

• Sem ponto adicional identificado nas ocorrências registradas.

A mensagem deve estar pronta para COPIAR E COLAR no WhatsApp.

Use *asteriscos* para negrito no WhatsApp.

Exemplo:

*FRENTE 503*
• 02 trações em manutenção, conforme registro do turno.
• Ponto de atenção para continuidade operacional.

Não transforme sugestão em fato.

Priorize fatos registrados e impactos claramente relacionados
às ocorrências.

Se houver ocorrências repetidas sobre o mesmo assunto,
consolide-as em um único tópico, mantendo a informação importante.

Se houver horários diferentes que sejam importantes,
preserve-os.

Se uma frente tiver muitas ocorrências,
priorize as mais relevantes e consolide as semelhantes.

O objetivo é gerar uma comunicação gerencial curta,
clara e acionável.
`;

/* =========================================================
   CHAMADA OPENROUTER
========================================================= */

async function chamarIA(
  messages,
  opcoes = {}
) {

  if (!OPENROUTER_API_KEY) {

    throw new Error(
      'OPENROUTER_API_KEY não configurada no Render.'
    );
  }

  const {
    maxTokens = 1200,
    temperature = 0.1
  } = opcoes;

  /*
   * NÃO existe limite artificial de quantidade
   * de ocorrências aqui.
   *
   * O limite abaixo é apenas para evitar mensagens
   * absurdamente gigantes no histórico da conversa.
   */

  const mensagensProcessadas =
    Array.isArray(messages)
      ? messages
          .map(msg => ({

            role:
              msg?.role === 'system'
                ? 'system'
                : msg?.role === 'assistant'
                  ? 'assistant'
                  : 'user',

            content:
              textoSeguro(
                msg?.content,
                100000
              )

          }))
          .filter(
            msg => msg.content
          )
      : [];

  const body = {

    model:
      AI_MODEL,

    messages:
      mensagensProcessadas,

    temperature,

    max_completion_tokens:
      Math.min(
        Math.max(
          Number(maxTokens) || 1200,
          200
        ),
        2500
      ),

    /*
     * Raciocínio mínimo.
     *
     * A prioridade aqui é resposta operacional rápida.
     */

    reasoning: {
      effort: 'minimal'
    }

  };

  let ultimoErro = null;

  /*
   * Máximo de duas tentativas.
   *
   * Evita ficar martelando o pool gratuito.
   */

  for (
    let tentativa = 1;
    tentativa <= 2;
    tentativa++
  ) {

    try {

      const resposta =
        await fetch(
          OPENROUTER_URL,
          {

            method: 'POST',

            headers: {

              Authorization:
                `Bearer ${OPENROUTER_API_KEY}`,

              'Content-Type':
                'application/json',

              'HTTP-Referer':
                'https://ocorrencias-mandu.onrender.com',

              'X-Title':
                'CTT Diário de Turno - MANDU'

            },

            body:
              JSON.stringify(body)

          }
        );

      let dados = {};

      try {

        dados =
          await resposta.json();

      } catch {

        dados = {};

      }

      /* -----------------------------------------
         SUCESSO
      ----------------------------------------- */

      if (resposta.ok) {

        const mensagem =
          dados
            ?.choices
            ?.at(0)
            ?.message;

        let conteudo =
          mensagem?.content;

        /*
         * Alguns modelos podem retornar partes.
         */

        if (
          Array.isArray(
            conteudo
          )
        ) {

          conteudo =
            conteudo
              .map(parte => {

                if (
                  typeof parte ===
                  'string'
                ) {
                  return parte;
                }

                return (
                  parte?.text ||
                  ''
                );

              })
              .join('');

        }

        if (
          !conteudo &&
          typeof dados
            ?.choices
            ?.at(0)
            ?.text ===
            'string'
        ) {

          conteudo =
            dados
              .choices
              .at(0)
              .text;
        }

        if (
          !conteudo &&
          typeof dados
            ?.output_text ===
            'string'
        ) {

          conteudo =
            dados.output_text;
        }

        conteudo =
          textoSeguro(
            conteudo,
            50000
          );

        if (conteudo) {
          return conteudo;
        }

        /*
         * Não exibimos reasoning puro.
         */

        if (
          mensagem?.reasoning ||
          mensagem?.reasoning_details
        ) {

          throw new Error(
            'A IA utilizou raciocínio, mas não retornou resposta final.'
          );
        }

        throw new Error(
          'A IA não retornou conteúdo.'
        );
      }

      /* -----------------------------------------
         ERRO
      ----------------------------------------- */

      const erro =
        dados?.error || {};

      const mensagemErro =
        erro?.message ||
        `OpenRouter retornou HTTP ${resposta.status}`;

      const limitSource =
        erro
          ?.metadata
          ?.limit_source ||
        '';

      const rateLimitUpstream =
        resposta.status === 429 &&
        (
          limitSource ===
            'upstream_provider_shared_pool' ||

          String(
            mensagemErro
          )
            .toLowerCase()
            .includes(
              'temporarily rate-limited upstream'
            )
        );

      /*
       * Retry apenas para rate limit
       * do provedor gratuito.
       */

      if (
        rateLimitUpstream &&
        tentativa === 1
      ) {

        console.warn(
          'OpenRouter: provedor gratuito temporariamente limitado. Tentando novamente...'
        );

        const retryAfter =
          Number(
            resposta
              .headers
              .get(
                'retry-after'
              )
          );

        const espera =
          Number.isFinite(
            retryAfter
          )
            ? Math.min(
                Math.max(
                  retryAfter * 1000,
                  700
                ),
                3000
              )
            : 1200;

        await new Promise(
          resolve =>
            setTimeout(
              resolve,
              espera
            )
        );

        continue;
      }

      ultimoErro =
        new Error(
          mensagemErro
        );

      console.error(
        'Erro OpenRouter:',
        JSON.stringify(
          {
            status:
              resposta.status,

            mensagem:
              mensagemErro,

            limit_source:
              limitSource
          },
          null,
          2
        )
      );

      break;

    } catch (erro) {

      ultimoErro =
        erro;

      /*
       * Pequeno retry para erro de rede.
       */

      if (
        tentativa === 1 &&
        (
          erro?.name ===
            'TypeError' ||

          String(
            erro?.message || ''
          )
            .toLowerCase()
            .includes(
              'fetch'
            )
        )
      ) {

        console.warn(
          'Falha de rede ao chamar OpenRouter. Tentando novamente...'
        );

        await new Promise(
          resolve =>
            setTimeout(
              resolve,
              800
            )
        );

        continue;
      }

      break;
    }
  }

  throw (
    ultimoErro ||
    new Error(
      'Não foi possível obter resposta da IA.'
    )
  );
}

/* =========================================================
   ORGANIZAR TURNO
========================================================= */

app.post(
  '/organizar-ia',
  async (req, res) => {

    if (!exigirIA(res)) {
      return;
    }

    try {

      const ocorrencias =
        prepararOcorrenciasIA(
          req.body?.ocorrencias
        );

      if (
        !ocorrencias.length
      ) {

        return res.status(400).json({
          error:
            'Não há ocorrências suficientes para organizar o turno.'
        });
      }

      /*
       * Mantemos a ordem em que chegaram
       * para preservar a sequência operacional.
       */

      const contexto =
        gerarContextoPorFrente(
          ocorrencias
        );

      const total =
        ocorrencias.length;

      const frentes =
        [
          ...new Set(
            ocorrencias.map(
              item =>
                item.frente
            )
          )
        ];

      const messages = [

        {
          role:
            'system',

          content:
            SYSTEM_IA
        },

        {

          role:
            'user',

          content: `
Organize as ocorrências completas do turno.

UNIDADE: MANDU

TOTAL DE OCORRÊNCIAS: ${total}

FRENTES IDENTIFICADAS:
${frentes.join(', ')}

OCORRÊNCIAS AGRUPADAS POR FRENTE:

${contexto}

Gere agora a mensagem FINAL para o grupo da gerência.

A mensagem deve:

- separar claramente cada frente;
- colocar as ocorrências daquela frente em tópicos;
- consolidar ocorrências repetidas;
- destacar pontos de atenção;
- destacar riscos e impactos;
- destacar ações e acompanhamentos;
- usar *negrito* no padrão WhatsApp;
- ser objetiva;
- estar pronta para copiar e colar.

NÃO coloque comentários fora da mensagem.

NÃO explique o que você fez.

ENTREGUE SOMENTE A MENSAGEM FINAL.
`
        }

      ];

      const resumo =
        await chamarIA(
          messages,
          {
            maxTokens: 1800,
            temperature: 0.1
          }
        );

      res.json({
        resumo
      });

    } catch (erro) {

      console.error(
        'Erro /organizar-ia:',
        erro
      );

      const mensagem =
        erro?.message ||
        'Erro ao organizar o turno com IA.';

      const status =
        mensagem
          .toLowerCase()
          .includes(
            'rate'
          )
          ? 429
          : 500;

      res.status(status).json({
        error:
          mensagem
      });
    }
  }
);

/* =========================================================
   CHAT OPERACIONAL
========================================================= */

app.post(
  '/chat-ia',
  async (req, res) => {

    if (!exigirIA(res)) {
      return;
    }

    try {

      const ocorrencias =
        prepararOcorrenciasIA(
          req.body?.ocorrencias
        );

      const pergunta =
        textoSeguro(
          req.body?.pergunta,
          5000
        );

      const historico =
        Array.isArray(
          req.body?.historico
        )
          ? req.body.historico
              .slice(-10)
              .map(msg => ({

                role:
                  msg?.role ===
                  'assistant'
                    ? 'assistant'
                    : 'user',

                content:
                  textoSeguro(
                    msg?.content,
                    10000
                  )

              }))
              .filter(
                msg =>
                  msg.content
              )
          : [];

      if (!pergunta) {

        return res.status(400).json({
          error:
            'Digite uma pergunta.'
        });
      }

      if (
        !ocorrencias.length
      ) {

        return res.status(400).json({
          error:
            'Ainda não existem ocorrências suficientes para uma análise.'
        });
      }

      const contexto =
        gerarContextoPorFrente(
          ocorrencias
        );

      const messages = [

        {

          role:
            'system',

          content: `
${SYSTEM_IA}

Você está respondendo perguntas sobre o turno inteiro.

Analise todas as frentes.

Pode analisar:
- problemas repetidos;
- riscos;
- manutenção;
- transporte;
- colhedoras;
- trações;
- ciclo;
- rendimento;
- continuidade operacional;
- necessidade de acompanhamento;
- plano de ação;
- possíveis deslocamentos de recursos.

Não determine uma decisão como fato.

Quando recomendar alguma ação,
identifique como SUGESTÃO.

Se uma decisão depender de dados que
não foram fornecidos, diga quais dados
precisam ser confirmados.

Nunca invente capacidade,
produtividade, distância,
quantidade de equipamentos
ou disponibilidade.
`
        },

        ...historico,

        {

          role:
            'user',

          content: `
OCORRÊNCIAS COMPLETAS DO TURNO:

${contexto}

PERGUNTA DO GESTOR:

${pergunta}

Responda diretamente.

Se possível, entregue:

1. LEITURA DO CENÁRIO
2. IMPACTO OPERACIONAL
3. SUGESTÃO DE AÇÃO
4. O QUE CONFIRMAR

Se não houver dados suficientes,
diga claramente.
`
        }

      ];

      const resposta =
        await chamarIA(
          messages,
          {
            maxTokens: 1200,
            temperature: 0.15
          }
        );

      res.json({
        resposta
      });

    } catch (erro) {

      console.error(
        'Erro /chat-ia:',
        erro
      );

      res.status(500).json({
        error:
          erro?.message ||
          'Erro ao consultar a IA.'
      });
    }
  }
);

/* =========================================================
   404 API
========================================================= */

app.use(
  '/api',
  (req, res) => {

    res.status(404).json({
      error:
        'Rota da API não encontrada.'
    });
  }
);

/* =========================================================
   ERRO GLOBAL
========================================================= */

app.use(
  (
    erro,
    req,
    res,
    next
  ) => {

    console.error(
      'Erro global:',
      erro
    );

    if (
      res.headersSent
    ) {
      return next(erro);
    }

    res.status(500).json({
      error:
        'Erro interno do servidor.'
    });
  }
);

/* =========================================================
   START
========================================================= */

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
      'Organização: por frente + mensagem WhatsApp'
    );
  }
);
