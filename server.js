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
 * IMPORTANTE:
 * Não coloque nenhuma chave diretamente neste arquivo.
 *
 * Tudo deve ficar nas Environment Variables do Render.
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
    limit: '1mb'
  })
);

app.use(
  express.urlencoded({
    extended: false,
    limit: '100kb'
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

function textoSeguro(valor, limite = 2000) {
  if (valor === undefined || valor === null) {
    return '';
  }

  return String(valor)
    .replace(/\u0000/g, '')
    .trim()
    .slice(0, limite);
}

function frenteSegura(valor) {
  const frente = textoSeguro(valor, 30);

  return frente || 'GERAL';
}

function turnoAtual() {
  const hora = new Date().getHours();

  if (hora >= 6 && hora < 14) {
    return 'TURNO A';
  }

  if (hora >= 14 && hora < 22) {
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
    frente: item.frente || 'GERAL',
    texto: item.texto || '',
    turno: item.turno || '',
    unidade: item.unidade || 'MANDU',
    created_at: item.created_at || null
  };
}

/* =========================================================
   STATUS
========================================================= */

app.get('/api/status', async (req, res) => {
  let supabaseStatus = 'ERRO';

  if (supa) {
    try {
      const { error } = await supa
        .from(TABLE)
        .select('id')
        .limit(1);

      supabaseStatus =
        error ? 'ERRO' : 'OK';

    } catch {
      supabaseStatus = 'ERRO';
    }
  } else {
    supabaseStatus = 'NÃO CONFIGURADO';
  }

  res.json({
    status: 'online',
    servidor: 'OK',
    supabase: supabaseStatus,
    openrouter: OPENROUTER_API_KEY
      ? 'OK'
      : 'NÃO CONFIGURADO',
    modelo: AI_MODEL,
    unidade: 'MANDU',
    timestamp: new Date().toISOString()
  });
});

/* =========================================================
   VERIFICAÇÃO DE CONFIGURAÇÃO
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

app.get('/api/ocorrencias', async (req, res) => {
  if (!exigirSupabase(res)) {
    return;
  }

  try {
    const { data, error } = await supa
      .from(TABLE)
      .select(
        'id,hora,frente,texto,turno,unidade,created_at'
      )
      .order(
        'created_at',
        {
          ascending: false
        }
      )
      .limit(500);

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
      (data || []).map(normalizarOcorrencia)
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
});

/* =========================================================
   POST OCORRÊNCIA
========================================================= */

app.post('/api/ocorrencias', async (req, res) => {
  if (!exigirSupabase(res)) {
    return;
  }

  try {
    const texto = textoSeguro(
      req.body?.texto,
      2000
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
      .insert(novaOcorrencia)
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
});

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
          error: 'ID inválido.'
        });
      }

      /*
       * IMPORTANTE:
       * Só altera o que realmente foi enviado.
       *
       * Assim, ao editar somente o texto,
       * não perdemos hora nem frente.
       */

      const alteracao = {};

      if (
        req.body?.texto !== undefined
      ) {
        const texto = textoSeguro(
          req.body.texto,
          2000
        );

        if (!texto) {
          return res.status(400).json({
            error:
              'O texto da ocorrência não pode ficar vazio.'
          });
        }

        alteracao.texto = texto;
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
        Object.keys(alteracao).length === 0
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
          error: 'ID inválido.'
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
   DELETE TODAS
========================================================= */

app.delete(
  '/api/ocorrencias',
  async (req, res) => {

    if (!exigirSupabase(res)) {
      return;
    }

    try {
      /*
       * UUID impossível de existir.
       * Mantemos o filtro porque o Supabase
       * exige uma condição no DELETE.
       */

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
   PREPARAÇÃO DO CONTEXTO DA IA
========================================================= */

function prepararOcorrenciasIA(
  ocorrencias,
  limite = 120
) {
  if (!Array.isArray(ocorrencias)) {
    return [];
  }

  return ocorrencias
    .slice(0, limite)
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
          600
        )
    }))
    .filter(item => item.texto);
}

/* =========================================================
   PROMPT BASE
========================================================= */

const SYSTEM_IA = `
Você é o copiloto operacional do CTT Diário de Turno da unidade MANDU.

Analise somente os dados fornecidos.

NÃO invente:
- números;
- capacidades;
- disponibilidade;
- causas;
- produção;
- metas;
- tempos;
- equipamentos;
- pessoas;
- fatos.

Quando fizer uma sugestão, deixe claro que é SUGESTÃO.

Responda de forma:
- objetiva;
- técnica;
- direta;
- curta;
- prática;
- orientada à operação.

Priorize:
1. principais ocorrências;
2. problemas repetidos;
3. riscos;
4. impacto operacional;
5. pontos de atenção;
6. ação recomendada.

Não repita desnecessariamente as ocorrências.

Não faça introduções longas.

Use títulos curtos e bullets quando ajudar.

Pense como um copiloto operacional apoiando a tomada de decisão do gestor.
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
    maxTokens = 600,
    temperature = 0.1
  } = opcoes;

  /*
   * Limita o tamanho das mensagens.
   * Isso reduz custo, latência e consumo de contexto.
   */

  const mensagensProcessadas =
    Array.isArray(messages)
      ? messages
          .slice(-10)
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
                12000
              )
          }))
          .filter(msg => msg.content)
      : [];

  /*
   * MÍNIMO DE RACIOCÍNIO.
   *
   * effort=minimal reduz o espaço dedicado
   * a raciocínio nos modelos compatíveis.
   *
   * Não usamos include_reasoning.
   * Portanto o frontend recebe somente a resposta.
   */

  const body = {
    model: AI_MODEL,

    messages: mensagensProcessadas,

    temperature,

    max_completion_tokens:
      Math.min(
        Math.max(
          Number(maxTokens) || 600,
          100
        ),
        1200
      ),

    reasoning: {
      effort: 'minimal'
    }
  };

  let ultimaResposta = null;
  let ultimoErro = null;

  /*
   * No máximo 2 tentativas.
   *
   * A segunda tentativa só acontece
   * para rate limit do provedor upstream.
   */

  for (
    let tentativa = 1;
    tentativa <= 2;
    tentativa++
  ) {

    try {

      const resposta = await fetch(
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

      ultimaResposta = resposta;

      let dados = {};

      try {
        dados =
          await resposta.json();
      } catch {
        dados = {};
      }

      if (resposta.ok) {

        const mensagem =
          dados?.choices?.[0]?.message;

        let conteudo =
          mensagem?.content;

        /*
         * Alguns modelos podem retornar content
         * como array de partes.
         */

        if (
          Array.isArray(conteudo)
        ) {
          conteudo =
            conteudo
              .map(parte => {
                if (
                  typeof parte === 'string'
                ) {
                  return parte;
                }

                return parte?.text || '';
              })
              .join('');
        }

        /*
         * Fallback para APIs compatíveis.
         */

        if (
          !conteudo &&
          typeof dados?.choices?.[0]
            ?.text === 'string'
        ) {
          conteudo =
            dados.choices[0].text;
        }

        if (
          !conteudo &&
          typeof dados?.output_text === 'string'
        ) {
          conteudo =
            dados.output_text;
        }

        conteudo =
          textoSeguro(
            conteudo,
            12000
          );

        if (conteudo) {
          return conteudo;
        }

        /*
         * Se o modelo retornou apenas reasoning
         * e nenhum conteúdo final, não mostramos
         * o raciocínio ao usuário.
         */

        const temReasoning =
          Boolean(
            mensagem?.reasoning ||
            mensagem?.reasoning_details
          );

        if (temReasoning) {
          throw new Error(
            'A IA utilizou raciocínio, mas não retornou resposta final.'
          );
        }

        throw new Error(
          'A IA não retornou conteúdo.'
        );
      }

      const erro =
        dados?.error || {};

      const mensagemErro =
        erro?.message ||
        `OpenRouter retornou HTTP ${resposta.status}`;

      const limitSource =
        erro?.metadata?.limit_source ||
        '';

      const upstream429 =
        resposta.status === 429 &&
        (
          limitSource ===
            'upstream_provider_shared_pool' ||

          String(mensagemErro)
            .toLowerCase()
            .includes(
              'temporarily rate-limited upstream'
            )
        );

      /*
       * Rate limit upstream:
       * espera um pouco e tenta novamente.
       */

      if (
        upstream429 &&
        tentativa === 1
      ) {

        console.warn(
          'OpenRouter: provedor gratuito temporariamente limitado. Tentando novamente...'
        );

        const retryAfter =
          Number(
            resposta.headers.get(
              'retry-after'
            )
          );

        const espera =
          Number.isFinite(retryAfter)
            ? Math.min(
                Math.max(
                  retryAfter * 1000,
                  700
                ),
                2500
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

      ultimoErro = erro;

      /*
       * Se foi erro de rede, tenta mais uma vez.
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

  if (ultimoErro) {
    throw ultimoErro;
  }

  throw new Error(
    'Não foi possível obter resposta da IA.'
  );
}

/* =========================================================
   ORGANIZAR TURNO COM IA
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
          req.body?.ocorrencias,
          120
        );

      if (!ocorrencias.length) {
        return res.status(400).json({
          error:
            'Não há ocorrências suficientes para organizar o turno.'
        });
      }

      /*
       * Colocamos em ordem cronológica
       * para facilitar a leitura da IA.
       */

      const ordemCronologica =
        [...ocorrencias].reverse();

      const contexto =
        ordemCronologica
          .map((item, index) => {

            return [
              `${index + 1}.`,
              `Hora: ${item.hora || '-'}`,
              `Frente: ${item.frente}`,
              `Ocorrência: ${item.texto}`
            ].join(' | ');

          })
          .join('\n');

      const messages = [

        {
          role: 'system',
          content: SYSTEM_IA
        },

        {
          role: 'user',

          content: `
Organize o turno abaixo.

UNIDADE: MANDU

OCORRÊNCIAS:
${contexto}

Entregue um resumo gerencial curto.

Formato preferencial:

RESUMO DO TURNO
- ...

PONTOS DE ATENÇÃO
- ...

RISCOS
- ...

AÇÕES RECOMENDADAS
- ...

Não invente informações.
`
        }

      ];

      const resumo =
        await chamarIA(
          messages,
          {
            maxTokens: 650,
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
        error: mensagem
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
          req.body?.ocorrencias,
          120
        );

      const pergunta =
        textoSeguro(
          req.body?.pergunta,
          2000
        );

      const historico =
        Array.isArray(
          req.body?.historico
        )
          ? req.body.historico
              .slice(-8)
              .map(msg => ({
                role:
                  msg?.role === 'assistant'
                    ? 'assistant'
                    : 'user',

                content:
                  textoSeguro(
                    msg?.content,
                    3000
                  )
              }))
              .filter(
                msg => msg.content
              )
          : [];

      if (!pergunta) {
        return res.status(400).json({
          error:
            'Digite uma pergunta.'
        });
      }

      if (!ocorrencias.length) {
        return res.status(400).json({
          error:
            'Ainda não existem ocorrências suficientes para uma análise.'
        });
      }

      const contexto =
        [...ocorrencias]
          .reverse()
          .map((item, index) => {

            return [
              `${index + 1}.`,
              `[${item.hora || '-'}]`,
              `[${item.frente}]`,
              item.texto
            ].join(' ');

          })
          .join('\n');

      const messages = [

        {
          role: 'system',
          content: `
${SYSTEM_IA}

Você está respondendo perguntas sobre o turno inteiro.

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

ATENÇÃO:

Não determine uma decisão como fato.

Quando recomendar alguma ação, escreva como sugestão.

Se uma decisão depender de dados que não foram fornecidos,
diga quais dados precisam ser confirmados.

Nunca invente capacidade, produtividade, distância,
quantidade de equipamentos ou disponibilidade.
`
        },

        ...historico,

        {
          role: 'user',

          content: `
OCORRÊNCIAS DO TURNO:

${contexto}

PERGUNTA DO GESTOR:

${pergunta}

Responda diretamente à pergunta.

Se possível, entregue:
1. leitura do cenário;
2. impacto operacional;
3. sugestão de ação;
4. o que precisa ser confirmado.

Se não houver dados suficientes, diga claramente.
`
        }

      ];

      const resposta =
        await chamarIA(
          messages,
          {
            maxTokens: 750,
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

      const mensagem =
        erro?.message ||
        'Erro ao consultar a IA.';

      res.status(500).json({
        error: mensagem
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
   TRATAMENTO GLOBAL DE ERROS
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
  }
);
