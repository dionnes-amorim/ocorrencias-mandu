````javascript
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

const SUPABASE_URL =
  process.env.SUPABASE_URL;

const SUPABASE_KEY =
  process.env.SUPABASE_SECRET_KEY ||
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  process.env.SUPABASE_ANON_KEY;

const GEMINI_API_KEY =
  process.env.GEMINI_API_KEY;

const TABLE =
  'ocorrencias_mandu';

// Modelo principal.
// Pode ser alterado no Render através de GEMINI_MODEL.
const GEMINI_MODEL =
  process.env.GEMINI_MODEL ||
  'gemini-3.8-flash';

// Fallback caso o modelo principal
// não esteja disponível para a chave.
const GEMINI_FALLBACK_MODELS = [
  'gemini-2.5-flash',
  'gemini-3.5-flash'
];

const GEMINI_BASE_URL =
  'https://generativelanguage.googleapis.com/v1beta/models';

// ======================================================
// SUPABASE
// ======================================================

let supa = null;

if (
  SUPABASE_URL &&
  SUPABASE_KEY
) {

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

app.disable(
  'x-powered-by'
);

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
  express.static(
    __dirname,
    {
      maxAge: '1h'
    }
  )
);

app.get(
  '/',
  (req, res) => {

    res.sendFile(
      path.join(
        __dirname,
        'index.html'
      )
    );

  }
);

// ======================================================
// FUNÇÕES AUXILIARES
// ======================================================

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
    .slice(
      0,
      limite
    );
}

// ======================================================
// FRENTE
// ======================================================

function frenteSegura(
  valor
) {

  const frente =
    textoSeguro(
      valor,
      50
    );

  return (
    frente ||
    'GERAL'
  );
}

// ======================================================
// TURNO
// ======================================================

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

// ======================================================
// HORA
// ======================================================

function horaAtual() {

  return new Date()
    .toLocaleTimeString(
      'pt-BR',
      {
        hour:
          '2-digit',

        minute:
          '2-digit'
      }
    );
}

// ======================================================
// NORMALIZAR OCORRÊNCIA
// ======================================================

function normalizarOcorrencia(
  item
) {

  return {

    id:
      item?.id ||
      null,

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
      ) ||
      'MANDU',

    created_at:
      item?.created_at ||
      null

  };
}

// ======================================================
// STATUS
// ======================================================

app.get(
  '/api/status',
  async (
    req,
    res
  ) => {

    res.json({

      ok:
        true,

      sistema:
        'CTT Diário de Turno - MANDU',

      supabase:
        !!supa,

      gemini:
        !!GEMINI_API_KEY,

      modelo:
        GEMINI_MODEL,

      fallback:
        GEMINI_FALLBACK_MODELS,

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
  async (
    req,
    res
  ) => {

    try {

      if (!supa) {

        return res
          .status(500)
          .json({

            error:
              'Supabase não configurado no Render.'

          });

      }

      const {
        data,
        error
      } =
        await supa
          .from(TABLE)
          .select('*')
          .order(
            'created_at',
            {
              ascending:
                false
            }
          );

      if (error) {

        console.error(
          'ERRO SUPABASE GET:',
          error
        );

        return res
          .status(500)
          .json({

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

    } catch (
      error
    ) {

      console.error(
        'ERRO GET OCORRÊNCIAS:',
        error
      );

      res
        .status(500)
        .json({

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
  async (
    req,
    res
  ) => {

    try {

      if (!supa) {

        return res
          .status(500)
          .json({

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

        return res
          .status(400)
          .json({

            error:
              'Texto da ocorrência é obrigatório.'

          });

      }

      const registro = {

        hora:
          textoSeguro(
            req.body?.hora,
            20
          ) ||
          horaAtual(),

        frente:
          frenteSegura(
            req.body?.frente
          ),

        texto,

        turno:
          textoSeguro(
            req.body?.turno,
            20
          ) ||
          turnoAtual(),

        unidade:
          textoSeguro(
            req.body?.unidade,
            50
          ) ||
          'MANDU'

      };

      const {
        data,
        error
      } =
        await supa
          .from(TABLE)
          .insert(
            registro
          )
          .select()
          .single();

      if (error) {

        console.error(
          'ERRO SUPABASE INSERT:',
          error
        );

        return res
          .status(500)
          .json({

            error:
              error.message

          });

      }

      res
        .status(201)
        .json(
          normalizarOcorrencia(
            data
          )
        );

    } catch (
      error
    ) {

      console.error(
        'ERRO POST OCORRÊNCIA:',
        error
      );

      res
        .status(500)
        .json({

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
  async (
    req,
    res
  ) => {

    try {

      if (!supa) {

        return res
          .status(500)
          .json({

            error:
              'Supabase não configurado no Render.'

          });

      }

      const id =
        textoSeguro(
          req.params.id,
          100
        );

      const atualizacao =
        {};

      if (
        req.body?.texto !==
        undefined
      ) {

        atualizacao.texto =
          textoSeguro(
            req.body.texto,
            10000
          );

      }

      if (
        req.body?.frente !==
        undefined
      ) {

        atualizacao.frente =
          frenteSegura(
            req.body.frente
          );

      }

      if (
        req.body?.hora !==
        undefined
      ) {

        atualizacao.hora =
          textoSeguro(
            req.body.hora,
            20
          );

      }

      if (
        req.body?.turno !==
        undefined
      ) {

        atualizacao.turno =
          textoSeguro(
            req.body.turno,
            20
          );

      }

      if (
        req.body?.unidade !==
        undefined
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

        return res
          .status(400)
          .json({

            error:
              'Nenhum campo para atualizar.'

          });

      }

      const {
        data,
        error
      } =
        await supa
          .from(TABLE)
          .update(
            atualizacao
          )
          .eq(
            'id',
            id
          )
          .select()
          .single();

      if (error) {

        console.error(
          'ERRO SUPABASE UPDATE:',
          error
        );

        return res
          .status(500)
          .json({

            error:
              error.message

          });

      }

      res.json(
        normalizarOcorrencia(
          data
        )
      );

    } catch (
      error
    ) {

      console.error(
        'ERRO PUT OCORRÊNCIA:',
        error
      );

      res
        .status(500)
        .json({

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
  async (
    req,
    res
  ) => {

    try {

      if (!supa) {

        return res
          .status(500)
          .json({

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
      } =
        await supa
          .from(TABLE)
          .delete()
          .eq(
            'id',
            id
          );

      if (error) {

        console.error(
          'ERRO SUPABASE DELETE:',
          error
        );

        return res
          .status(500)
          .json({

            error:
              error.message

          });

      }

      res.json({
        ok:
          true
      });

    } catch (
      error
    ) {

      console.error(
        'ERRO DELETE OCORRÊNCIA:',
        error
      );

      res
        .status(500)
        .json({

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
  async (
    req,
    res
  ) => {

    try {

      if (!supa) {

        return res
          .status(500)
          .json({

            error:
              'Supabase não configurado no Render.'

          });

      }

      const {
        error
      } =
        await supa
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

        return res
          .status(500)
          .json({

            error:
              error.message

          });

      }

      res.json({
        ok:
          true
      });

    } catch (
      error
    ) {

      console.error(
        'ERRO LIMPAR:',
        error
      );

      res
        .status(500)
        .json({

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
      item =>
        item.texto
    );

}

// ======================================================
// AGRUPAR POR FRENTE
// ======================================================

function agruparPorFrente(
  ocorrencias = []
) {

  const grupos =
    {};

  for (
    const item
    of ocorrencias
  ) {

    const frente =
      item.frente ||
      'GERAL';

    if (
      !grupos[frente]
    ) {

      grupos[frente] =
        [];

    }

    grupos[frente]
      .push(
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
    Object.keys(
      grupos
    ).sort();

  if (
    !frentes.length
  ) {

    return (
      'Nenhuma ocorrência registrada.'
    );

  }

  return frentes
    .map(
      frente => {

        const linhas =
          grupos[frente]
            .map(
              item => {

                return (
                  `- ${item.hora || '--:--'} | ${item.texto}`
                );

              }
            )
            .join('\n');

        return (
          `FRENTE ${frente}\n${linhas}`
        );

      }
    )
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

    const {
      data,
      error
    } =
      await supa
        .from(TABLE)
        .select('*')
        .order(
          'created_at',
          {
            ascending:
              true
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
      req.body?.ocorrencias ||
      []
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
Você é a inteligência operacional do CTT Diário de Turno da unidade MANDU.

Seu papel não é apenas resumir.

Você deve analisar os dados operacionais, cruzar ocorrências, reconhecer relações de causa e efeito SOMENTE quando houver evidência suficiente, identificar repetição, prioridade, impacto e necessidade de acompanhamento.

CONTEXTO:

O sistema registra ocorrências operacionais de CTT, frentes, caminhões, cavalos, carretas, colheita, logística, manutenção, carregamento, descarga, pátio, moagem, tecnologia, apontamentos e demais eventos relacionados à operação.

PRINCÍPIOS:

1. Trabalhe exclusivamente com os dados fornecidos.
2. Nunca invente números.
3. Nunca invente horários.
4. Nunca invente causas.
5. Nunca invente ações realizadas.
6. Nunca transforme uma hipótese em fato.
7. Diferencie claramente FATO, IMPACTO e RECOMENDAÇÃO.
8. Quando recomendar algo, utilize *SUGESTÃO:*.
9. Se não houver evidência suficiente, diga que os dados não permitem concluir.
10. Procure relações entre ocorrências de uma mesma frente.
11. Procure problemas recorrentes quando houver repetição real.
12. Priorize problemas com potencial de afetar continuidade operacional, ritmo, moagem, atendimento da frente ou disponibilidade.
13. Não repita informação apenas para aumentar o tamanho do texto.
14. Responda de acordo com o nível solicitado: gerencial, executivo, chat ou organização.
15. Use português do Brasil.
16. O texto final deve ser natural para WhatsApp.
17. Use títulos com UM asterisco de cada lado.
18. Use tópicos com "-".
19. Nunca use Markdown com dois asteriscos.
20. Nunca use blocos de código.
21. Nunca coloque ===== ou linhas decorativas.
22. Não escreva observações sobre seu próprio processo de análise.

FORMATAÇÃO WHATSAPP:

Correto:
*⚠️ PRINCIPAIS PROBLEMAS*
- Frente 501 apresenta...
- Frente 503 apresenta...

Correto:
*SUGESTÃO:* Reforçar o acompanhamento...

Errado:
**PRINCIPAIS PROBLEMAS**

Errado:
***PRINCIPAIS PROBLEMAS***

Errado:
\`\`\`
texto
\`\`\`

A resposta deve estar pronta para copiar e colar no WhatsApp.
`;

// ======================================================
// NORMALIZAÇÃO DE WHATSAPP
// ======================================================

function normalizarPublicacaoIA(
  texto
) {

  let resultado =
    String(
      texto || ''
    );

  resultado =
    resultado
      .replace(
        /\r\n/g,
        '\n'
      )
      .replace(
        /\r/g,
        '\n'
      );

  // Remove blocos de código.
  resultado =
    resultado
      .replace(
        /```(?:text|markdown|md)?/gi,
        ''
      )
      .replace(
        /```/g,
        ''
      );

  // Converte Markdown forte (**texto**)
  // para o padrão WhatsApp (*texto*).
  resultado =
    resultado.replace(
      /\*\*([^*\n]+)\*\*/g,
      '*$1*'
    );

  // Remove asteriscos triplos.
  resultado =
    resultado.replace(
      /\*{3,}/g,
      '*'
    );

  // Corrige títulos que vieram como
  // ** título **
  resultado =
    resultado.replace(
      /\*\s+\*/g,
      '*'
    );

  // Remove linhas de separação.
  resultado =
    resultado.replace(
      /^={3,}.*$/gm,
      ''
    );

  resultado =
    resultado.replace(
      /^-{5,}$/gm,
      ''
    );

  // Remove espaços desnecessários antes
  // de pontuação.
  resultado =
    resultado.replace(
      / +([,.;:!?])/g,
      '$1'
    );

  // Limita excesso de linhas vazias.
  resultado =
    resultado.replace(
      /\n{3,}/g,
      '\n\n'
    );

  return resultado.trim();
}

// ======================================================
// CONFIGURAÇÃO DE THINKING
// ======================================================

function configurarThinking(
  modelo,
  nivel
) {

  const config = {};

  const model =
    String(
      modelo || ''
    ).toLowerCase();

  /*
   * Gemini 3.x:
   * thinkingLevel = MINIMAL / LOW / MEDIUM / HIGH
   *
   * Gemini 2.5:
   * thinkingLevel também é suportado
   * nas versões atuais da API.
   */

  if (
    nivel === 'alto'
  ) {

    config.thinkingConfig = {
      thinkingLevel:
        'HIGH'
    };

  } else if (
    nivel === 'medio'
  ) {

    config.thinkingConfig = {
      thinkingLevel:
        'MEDIUM'
    };

  } else {

    config.thinkingConfig = {
      thinkingLevel:
        'LOW'
    };

  }

  return config;
}

// ======================================================
// CHAMAR GEMINI
// ======================================================

async function chamarGemini(
  prompt,
  options = {}
) {

  if (!GEMINI_API_KEY) {

    throw new Error(
      'GEMINI_API_KEY não configurada no Render.'
    );

  }

  const maxOutputTokens =
    options.maxOutputTokens ||
    3000;

  const timeoutMs =
    options.timeoutMs ||
    60000;

  const thinking =
    options.thinking ||
    'medio';

  const modelos = [
    GEMINI_MODEL,
    ...GEMINI_FALLBACK_MODELS
  ].filter(
    (modelo, index, array) =>
      modelo &&
      array.indexOf(modelo) === index
  );

  let ultimoErro =
    'Erro desconhecido ao consultar Gemini.';

  for (
    const modelo
    of modelos
  ) {

    const controller =
      new AbortController();

    const timeout =
      setTimeout(
        () => {

          controller.abort();

        },
        timeoutMs
      );

    try {

      console.log(
        '======================================'
      );

      console.log(
        'GEMINI - modelo:',
        modelo
      );

      console.log(
        'GEMINI - thinking:',
        thinking
      );

      console.log(
        'GEMINI - maxOutputTokens:',
        maxOutputTokens
      );

      const url =
        `${GEMINI_BASE_URL}/${modelo}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`;

      const thinkingConfig =
        configurarThinking(
          modelo,
          thinking
        );

      const body = {

        contents: [

          {
            role:
              'user',

            parts: [

              {
                text:
                  `${SYSTEM_IA}\n\n${prompt}`
              }

            ]
          }

        ],

        generationConfig: {

          temperature:
            0.25,

          maxOutputTokens,

          ...thinkingConfig

        }

      };

      const response =
        await fetch(
          url,
          {

            method:
              'POST',

            headers: {

              'Content-Type':
                'application/json'

            },

            body:
              JSON.stringify(
                body
              ),

            signal:
              controller.signal

          }
        );

      const raw =
        await response.text();

      let data =
        null;

      try {

        data =
          JSON.parse(
            raw
          );

      } catch {

        throw new Error(
          `Gemini retornou resposta inválida: ${raw.slice(0, 1000)}`
        );

      }

      console.log(
        'GEMINI - HTTP:',
        response.status
      );

      if (!response.ok) {

        const detalhe =
          data?.error?.message ||
          raw.slice(
            0,
            1200
          ) ||
          `HTTP ${response.status}`;

        ultimoErro =
          `Gemini HTTP ${response.status}: ${detalhe}`;

        console.error(
          ultimoErro
        );

        /*
         * Se o modelo falhar por disponibilidade,
         * quota ou modelo inválido, tenta o próximo.
         */
        continue;

      }

      const candidatos =
        data?.candidates ||
        [];

      const candidate =
        candidatos[0];

      const partes =
        candidate?.content?.parts ||
        [];

      /*
       * Alguns modelos podem devolver partes
       * de pensamento e uma parte final.
       *
       * Pegamos apenas o texto destinado à resposta.
       */
      const textos =
        partes
          .filter(
            parte =>
              typeof parte?.text ===
              'string'
          )
          .map(
            parte =>
              parte.text
          );

      const conteudo =
        textos.join('')
          .trim();

      console.log(
        'GEMINI - finishReason:',
        candidate?.finishReason ||
        'não informado'
      );

      console.log(
        'GEMINI - resposta:',
        conteudo.length,
        'caracteres'
      );

      if (!conteudo) {

        ultimoErro =
          'Gemini não retornou conteúdo final.';

        continue;

      }

      console.log(
        'GEMINI - sucesso com:',
        modelo
      );

      clearTimeout(
        timeout
      );

      return {
        texto:
          conteudo,

        modelo,

        finishReason:
          candidate?.finishReason ||
          null

      };

    } catch (
      error
    ) {

      ultimoErro =
        error?.name ===
        'AbortError'

          ? `Tempo limite de ${Math.round(timeoutMs / 1000)} segundos excedido ao consultar o Gemini.`

          : (
              error?.message ||
              'Erro desconhecido ao consultar Gemini.'
            );

      console.error(
        'GEMINI - erro:',
        ultimoErro
      );

    } finally {

      clearTimeout(
        timeout
      );

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
  async (
    req,
    res
  ) => {

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

        return res
          .status(400)
          .json({

            error:
              'Não existem ocorrências para organizar.'

          });

      }

      const contexto =
        gerarContextoPorFrente(
          ocorrencias
        );

      const prompt = `
ORGANIZE O TURNO DO CTT MANDU.

Faça uma leitura operacional das ocorrências e organize uma mensagem clara para WhatsApp.

Não apenas copie as ocorrências.

Agrupe informações relacionadas.

Se houver duas ou mais ocorrências que indiquem o mesmo problema, consolide-as.

Se houver evolução de um problema ao longo do turno, apresente essa evolução.

Se uma ocorrência indicar risco operacional, destaque-o.

ESTRUTURA:

*📋 DIÁRIO DE TURNO — MANDU*

*FRENTE 501*
- Informações relevantes da frente.

*FRENTE 502*
- Informações relevantes da frente.

*FRENTE 503*
- Informações relevantes da frente.

*FRENTE 504*
- Informações relevantes da frente.

*FRENTE 505*
- Informações relevantes da frente.

*FRENTE 506*
- Informações relevantes da frente.

Não force a inclusão de frentes sem ocorrência relevante.

Ao final:

*⚠️ PONTOS DE ATENÇÃO*
- Somente pontos realmente relevantes.

*🚨 RISCOS / IMPACTOS*
- Somente riscos sustentados pelos dados.

*🎯 AÇÕES / ACOMPANHAMENTOS*
- Ações ou acompanhamentos necessários.
- Recomendações devem começar com *SUGESTÃO:*.

Se uma seção não possuir informação suficiente, não invente conteúdo.

DADOS DO TURNO:

${contexto}
`;

      const resposta =
        await chamarGemini(
          prompt,
          {
            maxOutputTokens:
              3000,

            thinking:
              'medio',

            timeoutMs:
              60000

          }
        );

      const resultado =
        normalizarPublicacaoIA(
          resposta.texto
        );

      res.json({

        texto:
          resultado,

        total:
          ocorrencias.length,

        modelo:
          resposta.modelo

      });

    } catch (
      error
    ) {

      console.error(
        'ERRO ORGANIZAR IA:',
        error
      );

      res
        .status(500)
        .json({

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
  async (
    req,
    res
  ) => {

    try {

      const ocorrencias =
        await obterOcorrenciasIA(
          req
        );

      if (
        !ocorrencias.length
      ) {

        return res
          .status(400)
          .json({

            error:
              'Não existem ocorrências para gerar o resumo executivo.'

          });

      }

      const contexto =
        gerarContextoPorFrente(
          ocorrencias
        );

      const prompt = `
GERE O RESUMO EXECUTIVO DO TURNO DO CTT MANDU.

ATENÇÃO:

Este não é um relatório gerencial.

É uma mensagem extremamente curta para decisão da gestão.

O gestor precisa entender em poucos segundos:

1. qual foi o principal problema;
2. qual frente está mais crítica;
3. qual é o impacto operacional;
4. se existe alguma ação ou cobrança necessária.

NÃO REPITA TODAS AS OCORRÊNCIAS.

NÃO FAÇA DESCRIÇÃO DETALHADA.

NÃO LISTE PROBLEMAS SECUNDÁRIOS SE NÃO FOREM RELEVANTES PARA DECISÃO.

Priorize severidade e impacto.

Utilize no máximo 6 tópicos no total.

ESTRUTURA OBRIGATÓRIA:

*⚡ RESUMO EXECUTIVO — MANDU*

*CRÍTICO*
- 1 a 3 pontos mais importantes do turno.

*DECISÃO / ATENÇÃO*
- Somente o que exige atenção ou acompanhamento da gestão.

Se não houver algo crítico, informe objetivamente:
- Sem ocorrência crítica identificada no turno.

Se houver recomendação:
*SUGESTÃO:* ...

O resultado deve ser curto o suficiente para ser enviado diretamente em um grupo de gestão pelo WhatsApp.

DADOS:

${contexto}
`;

      const resposta =
        await chamarGemini(
          prompt,
          {
            maxOutputTokens:
              1100,

            thinking:
              'medio',

            timeoutMs:
              60000

          }
        );

      const resultado =
        normalizarPublicacaoIA(
          resposta.texto
        );

      res.json({

        texto:
          resultado,

        executivo:
          resultado,

        total:
          ocorrencias.length,

        modelo:
          resposta.modelo

      });

    } catch (
      error
    ) {

      console.error(
        'ERRO RESUMO EXECUTIVO IA:',
        error
      );

      res
        .status(500)
        .json({

          error:
            error?.message ||
            'Erro ao gerar resumo executivo.'

        });

    }

  }
);

// ======================================================
// FECHAR TURNO
// GERENCIAL + EXECUTIVO
// ======================================================

app.post(
  [
    '/fechar-turno',
    '/fechar-turno-ia',
    '/api/fechar-turno',
    '/api/fechar-turno-ia'
  ],
  async (
    req,
    res
  ) => {

    try {

      const ocorrencias =
        await obterOcorrenciasIA(
          req
        );

      if (
        !ocorrencias.length
      ) {

        return res
          .status(400)
          .json({

            error:
              'Não existem ocorrências para analisar o turno.'

          });

      }

      const contexto =
        gerarContextoPorFrente(
          ocorrencias
        );

      // ==================================================
      // GERENCIAL
      // ==================================================

      const promptGerencial = `
FAÇA A ANÁLISE GERENCIAL COMPLETA DO TURNO DO CTT MANDU.

Aqui você deve ser detalhado.

O objetivo é entregar uma análise que permita à gestão entender não apenas o que aconteceu, mas também:

- onde os problemas se concentraram;
- quais problemas tiveram maior relevância;
- se houve repetição;
- como as ocorrências se relacionam;
- quais impactos operacionais são sustentados pelos dados;
- quais frentes precisam de acompanhamento;
- quais ações devem ser cobradas ou acompanhadas.

FAÇA UMA ANÁLISE, NÃO APENAS UM RESUMO.

CRUZE AS OCORRÊNCIAS.

Exemplo do raciocínio desejado:

Se uma frente apresenta várias ocorrências relacionadas a disponibilidade e posteriormente aparece uma ocorrência relacionada a impacto no atendimento, avalie a relação entre elas.

Mas só estabeleça relação causal quando houver evidência.

Diferencie:

FATO:
Aquilo que está explicitamente registrado.

IMPACTO:
Consequência sustentada pelos dados.

SUGESTÃO:
Ação recomendada pela análise.

ESTRUTURA:

*📋 ANÁLISE GERENCIAL — MANDU*

*VISÃO GERAL DO TURNO*
- Faça uma leitura geral da operação.
- Aponte concentração de problemas e principais movimentos do turno.

*FRENTES COM OCORRÊNCIAS*
- Analise cada frente relevante.
- Explique o que ocorreu.
- Relacione ocorrências quando houver evidência.
- Não faça descrição de frentes sem informação relevante.

*PRINCIPAIS PROBLEMAS*
- Priorize os problemas por relevância operacional.
- Explique o impacto de cada problema quando houver evidência.

*PROBLEMAS RECORRENTES*
- Identifique apenas recorrências reais.
- Se diferentes ocorrências representam o mesmo problema, consolide.
- Se não houver recorrência relevante, informe isso.

*RISCOS / IMPACTOS*
- Avalie os riscos para continuidade, ritmo, atendimento, disponibilidade ou operação.
- Não trate possibilidade como fato.

*PONTOS DE ATENÇÃO*
- Mostre o que precisa continuar sendo acompanhado.

*AÇÕES / ACOMPANHAMENTOS*
- Informe ações já registradas como realizadas somente se estiverem nos dados.
- Para novas recomendações, use *SUGESTÃO:*.
- Priorize ações práticas e operacionais.

REGRAS:

- Seja detalhado.
- Não seja repetitivo.
- Não invente.
- Não crie números.
- Não crie causas.
- Não crie resultados.
- Não transforme recomendação em fato.
- Não use dois asteriscos.
- Use somente *negrito WhatsApp*.
- Use "-" nos tópicos.
- Texto pronto para WhatsApp.

DADOS DO TURNO:

${contexto}
`;

      console.log(
        'GERENCIAL - Gemini com raciocínio alto'
      );

      const respostaGerencial =
        await chamarGemini(
          promptGerencial,
          {
            maxOutputTokens:
              4500,

            thinking:
              'alto',

            timeoutMs:
              90000

          }
        );

      // ==================================================
      // EXECUTIVO
      // ==================================================

      const promptExecutivo = `
FAÇA O RESUMO EXECUTIVO FINAL DO TURNO.

IMPORTANTE:

O resumo executivo NÃO deve repetir a análise gerencial.

Ele deve ser uma leitura de decisão.

O gestor deve conseguir entender a situação em poucos segundos.

Escolha somente os pontos que realmente mudam decisão ou exigem atenção.

PRIORIDADE:

1. Problema crítico.
2. Frente crítica.
3. Impacto operacional.
4. Ação ou cobrança necessária.

MÁXIMO:

- 3 pontos em CRÍTICO.
- 3 pontos em DECISÃO / ATENÇÃO.
- No máximo 6 tópicos totais.

ESTRUTURA EXATA:

*⚡ RESUMO EXECUTIVO — MANDU*

*CRÍTICO*
- Principal fato ou problema.
- Segundo ponto somente se realmente relevante.
- Terceiro somente se necessário.

*DECISÃO / ATENÇÃO*
- O que exige acompanhamento da gestão.
- O que exige ação ou cobrança.

Não inclua detalhes operacionais secundários.

Não repita horários se eles não forem importantes para decisão.

Não faça introdução.

Não faça conclusão genérica.

Não escreva "de modo geral", "diante do exposto" ou frases semelhantes.

Se não houver criticidade:

*CRÍTICO*
- Sem ocorrência crítica identificada no turno.

Se houver recomendação:

*SUGESTÃO:* ...

Texto curto, direto e pronto para WhatsApp.

DADOS:

${contexto}
`;

      console.log(
        'EXECUTIVO - Gemini com raciocínio médio'
      );

      const respostaExecutivo =
        await chamarGemini(
          promptExecutivo,
          {
            maxOutputTokens:
              1100,

            thinking:
              'medio',

            timeoutMs:
              60000

          }
        );

      const gerencialFinal =
        normalizarPublicacaoIA(
          respostaGerencial.texto
        );

      const executivoFinal =
        normalizarPublicacaoIA(
          respostaExecutivo.texto
        );

      const frentes =
        new Set(
          ocorrencias
            .map(
              item =>
                item.frente
            )
            .filter(
              Boolean
            )
        );

      return res.json({

        gerencial:
          gerencialFinal,

        executivo:
          executivoFinal,

        fechamento:
          '',

        texto:
          gerencialFinal,

        total:
          ocorrencias.length,

        frentes:
          frentes.size,

        modeloGerencial:
          respostaGerencial.modelo,

        modeloExecutivo:
          respostaExecutivo.modelo

      });

    } catch (
      error
    ) {

      console.error(
        '======================================'
      );

      console.error(
        'ERRO ANÁLISE DO TURNO:',
        error
      );

      console.error(
        '======================================'
      );

      return res
        .status(500)
        .json({

          error:
            error?.message ||
            'Erro ao gerar análise gerencial e executiva.'

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
  async (
    req,
    res
  ) => {

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

        return res
          .status(400)
          .json({

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

        return res
          .status(400)
          .json({

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
              .slice(-6)
              .map(
                item => ({

                  role:
                    item?.role ===
                    'user'
                      ? 'user'
                      : 'assistant',

                  content:
                    textoSeguro(
                      item?.content,
                      4000
                    )

                })
              )
          : [];

      const prompt = `
CHAT OPERACIONAL DO CTT MANDU.

PERGUNTA DO USUÁRIO:

${pergunta}

DADOS DO TURNO:

${contexto}

REGRAS DE RESPOSTA:

1. Responda EXATAMENTE o que foi perguntado.
2. Não faça um resumo completo do turno se a pergunta pedir apenas uma informação.
3. Seja proporcional à pergunta.
4. Se a pergunta for simples, responda em poucas linhas.
5. Se a pergunta exigir comparação, compare os dados.
6. Se perguntar "qual frente", responda com a frente e a justificativa objetiva.
7. Se perguntar "por quê", explique somente o que os dados permitem concluir.
8. Se perguntar "o que fazer", apresente ações práticas e marque recomendações com *SUGESTÃO:*.
9. Se perguntar sobre recorrência, identifique repetição real.
10. Se não houver informação suficiente, diga claramente.
11. Não invente.
12. Não repita as ocorrências completas.
13. Não faça introdução desnecessária.
14. Não faça conclusão genérica.
15. Não diga "com base nos dados fornecidos" repetidamente.
16. Responda em português do Brasil.
17. Formate para WhatsApp.
18. Use *negrito* com apenas um asterisco de cada lado.
19. Use "-" para listas.
20. Nunca use **negrito**.
21. Nunca use blocos de código.

EXEMPLO DE RESPOSTA CURTA:

*Frente 503 é a mais crítica.*
- Apresenta maior concentração de ocorrências relevantes.
- O principal impacto registrado está relacionado a [informação registrada].

EXEMPLO DE PLANO DE AÇÃO:

*SUGESTÃO:*
- Priorizar acompanhamento da Frente 503.
- Monitorar a normalização do recurso citado na ocorrência.

IMPORTANTE:

Não copie estes exemplos literalmente.

Responda somente à pergunta.

`;

      const mensagens =
        historico.length
          ? `HISTÓRICO RECENTE:\n${historico
              .map(
                item =>
                  `${item.role.toUpperCase()}: ${item.content}`
              )
              .join('\n')}\n\n${prompt}`
          : prompt;

      const resposta =
        await chamarGemini(
          mensagens,
          {
            maxOutputTokens:
              1400,

            thinking:
              'baixo',

            timeoutMs:
              60000

          }
        );

      const resultado =
        normalizarPublicacaoIA(
          resposta.texto
        );

      res.json({

        resposta:
          resultado,

        total:
          ocorrencias.length,

        modelo:
          resposta.modelo

      });

    } catch (
      error
    ) {

      console.error(
        'ERRO CHAT IA:',
        error
      );

      res
        .status(500)
        .json({

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
  (
    req,
    res
  ) => {

    console.error(
      'API 404:',
      req.method,
      req.originalUrl
    );

    res
      .status(404)
      .json({

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
  (
    req,
    res
  ) => {

    console.error(
      '404:',
      req.method,
      req.originalUrl
    );

    res
      .status(404)
      .send(
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

      return next(
        error
      );

    }

    res
      .status(500)
      .json({

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
      '======================================'
    );

    console.log(
      `CTT Diário de Turno MANDU`
    );

    console.log(
      `Porta: ${PORT}`
    );

    console.log(
      `Supabase: ${
        supa
          ? 'OK'
          : 'NÃO CONFIGURADO'
      }`
    );

    console.log(
      `Gemini: ${
        GEMINI_API_KEY
          ? 'OK'
          : 'NÃO CONFIGURADO'
      }`
    );

    console.log(
      `Modelo principal: ${GEMINI_MODEL}`
    );

    console.log(
      `Fallbacks: ${GEMINI_FALLBACK_MODELS.join(', ')}`
    );

    console.log(
      'Raciocínio: ATIVADO'
    );

    console.log(
      'Gerencial: THINKING HIGH'
    );

    console.log(
      'Executivo: THINKING MEDIUM'
    );

    console.log(
      'Chat: THINKING LOW'
    );

    console.log(
      '======================================'
    );

  }
);
````
