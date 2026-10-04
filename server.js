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

const GEMINI_API_KEY =
  process.env.GEMINI_API_KEY;

const TABLE = 'ocorrencias_mandu';

// Modelos em ordem de prioridade.
// O primeiro é o modelo principal de análise.
// Os demais funcionam como fallback.
const GEMINI_MODELS = [
  'gemini-3.8-flash',
  'gemini-flash-latest',
  'gemini-flash-lite-latest',
  'gemini-2.5-flash-lite'
];

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
// NORMALIZAÇÃO DA RESPOSTA DA IA
// ======================================================

function normalizarPublicacaoIA(texto) {

  return String(texto || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')

    // Remove qualquer bloco de código
    .replace(/```(?:text|markdown|md|plaintext|txt)?/gi, '')
    .replace(/```/g, '')

    // Remove headings Markdown
    .replace(/^#{1,6}\s*/gm, '')

    // Corrige asteriscos duplicados
    .replace(/\*{2,}/g, '*')

    // Remove linhas feitas apenas com "="
    .replace(/^={3,}.*$/gm, '')

    // Normaliza bullets
    .replace(/^[ \t]*[•●▪◦]\s*/gm, '- ')

    // Evita excesso de linhas vazias
    .replace(/\n{3,}/g, '\n\n')

    .trim();
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

      gemini:
        !!GEMINI_API_KEY,

      modelos:
        GEMINI_MODELS,

      modelo_principal:
        GEMINI_MODELS[0],

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

OBJETIVO:
Transformar registros operacionais em informação útil para decisão, acompanhamento e comunicação de turno.

REGRAS ABSOLUTAS:

1. Não invente ocorrências.
2. Não invente números.
3. Não invente horários.
4. Não invente causas.
5. Não invente resultados.
6. Não invente ações já realizadas.
7. Não transforme hipótese em fato.
8. Diferencie claramente fato, análise e recomendação.
9. Quando recomendar alguma ação, utilize *SUGESTÃO:*.
10. Identifique recorrência somente quando o problema aparecer mais de uma vez nos dados.
11. Priorize problemas pelo impacto operacional demonstrado.
12. Relacione causa e efeito somente quando houver evidência nos dados.
13. Quando não houver informação suficiente, diga que não há evidência suficiente.
14. Não repita informações sem necessidade.
15. Português do Brasil.
16. Linguagem técnica, natural e operacional.
17. Resultado pronto para WhatsApp.
18. Use somente um asterisco para negrito: *TEXTO*.
19. Nunca utilize **TEXTO**.
20. Não use blocos de código.
21. Use "-" para tópicos.
22. Evite textos genéricos.
23. Seja proporcional ao que foi perguntado.
24. Se a pergunta for simples, responda de forma simples.
25. Se a análise for gerencial, aprofunde a análise.
26. Se for executivo, priorize decisão e criticidade.
`;

// ======================================================
// CONFIGURAÇÃO DE RACIOCÍNIO GEMINI
// ======================================================

function obterConfigPensamento(modelo, nivel) {

  // Gemini 3.x utiliza thinkingLevel.
  if (
    modelo.includes('3.8') ||
    modelo.includes('flash-latest')
  ) {

    return {
      thinkingConfig: {
        thinkingLevel:
          nivel || 'medium'
      }
    };
  }

  // Para modelos 2.5, usamos orçamento de pensamento.
  if (
    modelo.includes('2.5')
  ) {

    const budget =
      nivel === 'high'
        ? 4096
        : nivel === 'low'
          ? 1024
          : 2048;

    return {
      thinkingConfig: {
        thinkingBudget:
          budget
      }
    };
  }

  return {};
}

// ======================================================
// EXTRAIR TEXTO FINAL DO GEMINI
// ======================================================

function extrairTextoGemini(data) {

  const partes =
    data?.candidates?.[0]?.content?.parts || [];

  const textos =
    partes
      .filter(part => {

        if (
          !part ||
          typeof part.text !== 'string'
        ) {
          return false;
        }

        // Nunca expõe pensamento interno.
        if (
          part.thought === true
        ) {
          return false;
        }

        return true;
      })
      .map(
        part => part.text
      );

  return textos
    .join('\n')
    .trim();
}

// ======================================================
// CHAMAR GEMINI
// ======================================================

async function chamarIA(
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
    4000;

  const timeoutMs =
    options.timeoutMs ||
    45000;

  const thinkingLevel =
    options.thinkingLevel ||
    'medium';

  console.log(
    'IA - iniciando chamada Gemini...',
    'modelos =',
    GEMINI_MODELS.join(', '),
    'timeout =',
    `${timeoutMs}ms`,
    'maxOutputTokens =',
    maxOutputTokens,
    'thinking =',
    thinkingLevel
  );

  let ultimoErro =
    'Erro desconhecido na IA.';

  for (
    const modelo of GEMINI_MODELS
  ) {

    const controller =
      new AbortController();

    let timeout = null;

    try {

      console.log(
        'IA - tentando modelo:',
        modelo
      );

      timeout =
        setTimeout(
          () => {

            console.error(
              'IA - TIMEOUT:',
              modelo
            );

            controller.abort();

          },
          timeoutMs
        );

      const url =
        `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${GEMINI_API_KEY}`;

      const generationConfig = {

        temperature:
          options.temperature ?? 0.3,

        maxOutputTokens,

        ...obterConfigPensamento(
          modelo,
          thinkingLevel
        )
      };

      const response =
        await fetch(
          url,
          {
            method: 'POST',

            headers: {
              'Content-Type':
                'application/json'
            },

            body:
              JSON.stringify({

                contents: [
                  {
                    parts: [
                      {
                        text:
                          prompt
                      }
                    ]
                  }
                ],

                generationConfig

              }),

            signal:
              controller.signal
          }
        );

      console.log(
        'IA - resposta HTTP:',
        modelo,
        response.status
      );

      const raw =
        await response.text();

      if (!raw) {

        throw new Error(
          `Gemini ${modelo} retornou resposta vazia.`
        );
      }

      let data = null;

      try {

        data =
          JSON.parse(raw);

      } catch {

        throw new Error(
          `Gemini ${modelo} retornou JSON inválido.`
        );
      }

      if (
        !response.ok
      ) {

        const detalhe =
          data?.error?.message ||
          raw.slice(0, 1000) ||
          `HTTP ${response.status}`;

        ultimoErro =
          `Gemini ${modelo} HTTP ${response.status}: ${detalhe}`;

        console.error(
          'IA - erro:',
          ultimoErro
        );

        /*
         * Se for erro de autenticação,
         * não adianta tentar outros modelos.
         */
        if (
          response.status === 400 ||
          response.status === 401 ||
          response.status === 403
        ) {

          throw new Error(
            ultimoErro
          );
        }

        /*
         * 404, 429 e erros de capacidade
         * tentam o próximo modelo.
         */
        continue;
      }

      const resposta =
        extrairTextoGemini(
          data
        );

      console.log(
        'IA - candidato encontrado:',
        !!data?.candidates?.[0]
      );

      console.log(
        'IA - finishReason:',
        data?.candidates?.[0]?.finishReason ||
        'não informado'
      );

      console.log(
        'IA - texto final:',
        resposta
          ? `${resposta.length} caracteres`
          : 'VAZIO'
      );

      if (
        !resposta
      ) {

        ultimoErro =
          `Gemini ${modelo} não gerou uma resposta final.`;

        console.error(
          'IA - resposta vazia no modelo:',
          modelo
        );

        continue;
      }

      console.log(
        'IA - sucesso com modelo:',
        modelo
      );

      return {
        texto:
          normalizarPublicacaoIA(
            resposta
          ),

        modelo
      };

    } catch (error) {

      ultimoErro =
        error?.name === 'AbortError'
          ? `Tempo limite de ${Math.round(timeoutMs / 1000)} segundos excedido ao consultar o Gemini.`
          : (
              error?.message ||
              'Erro desconhecido na IA.'
            );

      console.error(
        `IA - modelo ${modelo} falhou:`,
        ultimoErro
      );

      /*
       * Erro de autenticação/configuração:
       * não faz sentido continuar tentando.
       */
      if (
        String(ultimoErro)
          .includes('HTTP 400') ||
        String(ultimoErro)
          .includes('HTTP 401') ||
        String(ultimoErro)
          .includes('HTTP 403')
      ) {

        throw new Error(
          ultimoErro
        );
      }

      // Continua para o próximo modelo.
      continue;

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
${SYSTEM_IA}

MODO: ORGANIZAÇÃO DO TURNO.

Organize as ocorrências abaixo em uma mensagem profissional para WhatsApp.

O objetivo é transformar os registros brutos em um diário de turno claro, sem perder informações importantes.

Analise:
- ocorrências por frente;
- sequência dos eventos quando os horários permitirem;
- problemas relevantes;
- recorrências comprovadas;
- riscos e impactos;
- acompanhamentos necessários.

Não transforme todas as ocorrências em texto longo.
Agrupe informações semelhantes.
Não repita a mesma ocorrência.

Utilize esta estrutura:

*📋 DIÁRIO DE TURNO — MANDU*

Para cada frente que realmente possuir ocorrências relevantes:

*FRENTE XXX*
- Resumo objetivo das ocorrências e impacto operacional.

Depois:

*⚠️ PONTOS DE ATENÇÃO*
- Somente os pontos que exigem atenção operacional.

*🚨 RISCOS / IMPACTOS*
- Somente riscos sustentados pelos dados.

*🎯 AÇÕES / ACOMPANHAMENTOS*
- Acompanhamentos necessários.
- Recomendações devem utilizar *SUGESTÃO:*.

REGRAS:
- Não crie frentes sem ocorrência.
- Não invente informações.
- Não use **asteriscos**.
- Use somente *asteriscos simples*.
- Use "-" nos tópicos.
- Não use bloco de código.
- Não coloque introdução ou conclusão fora da estrutura.
- Mantenha linguagem natural e pronta para WhatsApp.

OCORRÊNCIAS:

${contexto}
`;

      const resultado =
        await chamarIA(
          prompt,
          {
            maxOutputTokens:
              6000,

            timeoutMs:
              45000,

            thinkingLevel:
              'high',

            temperature:
              0.25
          }
        );

      res.json({

        texto:
          resultado.texto,

        total:
          ocorrencias.length,

        modelo:
          resultado.modelo

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
${SYSTEM_IA}

MODO: RESUMO EXECUTIVO.

Gere um resumo executivo MUITO CURTO do turno do CTT MANDU.

O texto será enviado diretamente para um grupo de gestão.

NÃO faça um relatório completo.

O gestor precisa entender rapidamente:
- qual é o principal problema;
- qual é o impacto;
- qual frente exige atenção;
- qual decisão ou acompanhamento é necessário.

Priorize criticidade e decisão.

Ignore informações secundárias.

Não repita ocorrências.

Utilize no máximo 3 blocos principais.

Estrutura:

*⚡ RESUMO EXECUTIVO — MANDU*

*CRÍTICO*
- Principal fato ou problema do turno.

*IMPACTO*
- Consequência operacional sustentada pelos dados.

*DECISÃO / ACOMPANHAMENTO*
- O que precisa ser acompanhado ou decidido.
- Se for recomendação, use *SUGESTÃO:*.

Se não houver problema crítico, deixe isso claro.

REGRAS:
- Seja realmente curto.
- Não faça lista extensa.
- Não crie uma seção para cada frente.
- Não invente informações.
- Não invente causas.
- Não invente números.
- Não invente ações.
- Não use **asteriscos**.
- Use somente *asteriscos simples*.
- Use "-" nos tópicos.
- Não use bloco de código.

DADOS DO TURNO:

${contexto}
`;

      const resultado =
        await chamarIA(
          prompt,
          {
            maxOutputTokens:
              3000,

            timeoutMs:
              40000,

            thinkingLevel:
              'medium',

            temperature:
              0.2
          }
        );

      return res.json({

        texto:
          resultado.texto,

        executivo:
          resultado.texto,

        total:
          ocorrencias.length,

        modelo:
          resultado.modelo

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
// ANÁLISE DO TURNO — GERENCIAL + EXECUTIVO
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
      'ANÁLISE DO TURNO:',
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
${SYSTEM_IA}

MODO: ANÁLISE GERENCIAL.

Faça uma análise aprofundada do turno do CTT MANDU.

Aqui a análise deve ser MAIS DETALHADA.

O objetivo é apoiar uma liderança operacional a entender:
- o que aconteceu;
- onde aconteceu;
- sequência dos problemas;
- problemas de maior impacto;
- recorrências;
- relação entre eventos quando houver evidência;
- impactos operacionais;
- prioridades de atuação;
- acompanhamentos necessários.

Analise os dados criticamente.
Não apenas copie as ocorrências.

IMPORTANTE:

Quando houver uma sequência temporal clara, use-a para explicar o problema.

Quando houver repetição de um problema, identifique como recorrência.

Quando houver relação entre eventos, somente estabeleça relação se os dados sustentarem.

Quando não houver evidência suficiente, diga:
"Não há evidência suficiente nos registros para confirmar a causa."

Não invente causa.

Utilize exatamente esta estrutura:

*📋 ANÁLISE GERENCIAL — MANDU*
----------------------------------
*VISÃO GERAL DO TURNO*
- Faça uma leitura geral do comportamento operacional.
- Destaque a principal condição observada.

*FRENTES COM OCORRÊNCIAS*
- Analise cada frente relevante.
- Explique o que ocorreu e o efeito operacional.

*⚠️ PRINCIPAIS PROBLEMAS*
- Priorize os problemas mais relevantes.
- Não apenas liste; explique o impacto quando houver evidência.

*🔁 PROBLEMAS RECORRENTES*
- Liste somente problemas realmente repetidos.
- Se não houver recorrência, informe isso.

*🚨 RISCOS / IMPACTOS*
- Relacione os impactos operacionais sustentados pelos registros.

*🎯 PRIORIDADES DE ATUAÇÃO*
- Ordene os pontos que merecem atenção.
- Priorize pelo impacto e criticidade.

*AÇÕES / ACOMPANHAMENTOS*
- Liste ações ou acompanhamentos necessários.
- Não trate recomendação como ação realizada.
- Use *SUGESTÃO:* quando for recomendação.

REGRAS DE FORMATAÇÃO:

- Não use **asteriscos**.
- Use somente *asteriscos simples*.
- Use "-" para tópicos.
- Não use blocos de código.
- Não use títulos com =====.
- Não escreva explicações fora da estrutura.
- Seja técnico e natural.
- Não seja genérico.
- Não invente informações.

DADOS DO TURNO:

${contexto}
`;

      console.log(
        'ANÁLISE - gerando GERENCIAL...'
      );

      const gerencial =
        await chamarIA(
          promptGerencial,
          {
            maxOutputTokens:
              12000,

            timeoutMs:
              60000,

            thinkingLevel:
              'high',

            temperature:
              0.25
          }
        );

      console.log(
        'ANÁLISE - GERENCIAL:',
        gerencial.modelo,
        gerencial.texto.length,
        'caracteres'
      );

      // ==================================================
      // EXECUTIVO
      // ==================================================

      const promptExecutivo = `
${SYSTEM_IA}

MODO: RESUMO EXECUTIVO FINAL.

Converta a análise dos registros em uma visão MUITO CURTA para decisão da gestão.

Não faça uma segunda análise gerencial.

O objetivo é responder rapidamente:

1. Qual é o principal problema?
2. Qual é o impacto?
3. Qual frente exige atenção?
4. Qual decisão ou acompanhamento é necessário?

Se houver vários problemas, selecione somente os mais críticos.

Utilize:

*⚡ RESUMO EXECUTIVO — MANDU*
-----------------------------------
*CRÍTICO*
- Principal ponto do turno.

*IMPACTO*
- Principal consequência operacional.

*DECISÃO / ACOMPANHAMENTO*
- Principal decisão, cobrança ou acompanhamento necessário.
- Use *SUGESTÃO:* somente quando for recomendação.

*FRENTE CRÍTICA*
- Informe somente a frente que realmente merece atenção prioritária.
- Se houver empate ou mais de uma frente crítica, informe somente as necessárias.

REGRAS:

- Seja extremamente curto.
- Máximo aproximado de 6 a 8 tópicos.
- Não copie todo o turno.
- Não invente informações.
- Não invente causas.
- Não invente números.
- Não invente ações realizadas.
- Não use **asteriscos**.
- Use somente *asteriscos simples*.
- Use "-" para tópicos.
- Não use bloco de código.

DADOS DO TURNO:

${contexto}
`;

      console.log(
        'ANÁLISE - gerando EXECUTIVO...'
      );

      const executivo =
        await chamarIA(
          promptExecutivo,
          {
            maxOutputTokens:
              3500,

            timeoutMs:
              45000,

            thinkingLevel:
              'medium',

            temperature:
              0.2
          }
        );

      console.log(
        'ANÁLISE - EXECUTIVO:',
        executivo.modelo,
        executivo.texto.length,
        'caracteres'
      );

      // ==================================================
      // CONTAGEM DE FRENTES
      // ==================================================

      const frentes =
        new Set(
          ocorrencias
            .map(
              item => item.frente
            )
            .filter(Boolean)
        );

      console.log(
        'ANÁLISE - concluída.'
      );

      return res.json({

        gerencial:
          gerencial.texto,

        executivo:
          executivo.texto,

        fechamento:
          '',

        texto:
          gerencial.texto,

        total:
          ocorrencias.length,

        frentes:
          frentes.size,

        modelo_gerencial:
          gerencial.modelo,

        modelo_executivo:
          executivo.modelo

      });

    } catch (error) {

      console.error(
        '======================================'
      );

      console.error(
        'ERRO ANÁLISE DO TURNO:',
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

      const historicoTexto =
        historico.length
          ? historico
              .map(item =>
                `${item.role === 'user' ? 'USUÁRIO' : 'ASSISTENTE'}: ${item.content}`
              )
              .join('\n')
          : 'Sem histórico anterior.';

      const prompt = `
${SYSTEM_IA}

MODO: CHAT OPERACIONAL.

Responda SOMENTE ao que o usuário perguntou.

Não gere relatório completo se a pergunta não pedir isso.

A resposta deve ter tamanho proporcional à pergunta.

EXEMPLOS DE COMPORTAMENTO:

Se perguntar algo simples:
- responda em 1 a 3 linhas.

Se perguntar "qual frente está mais crítica?":
- indique a frente;
- apresente o motivo;
- cite somente os dados relevantes.

Se perguntar "quais problemas se repetiram?":
- liste somente os problemas recorrentes.

Se perguntar "qual é o problema da Frente X?":
- responda somente sobre a Frente X.

Se perguntar "faça um resumo":
- faça um resumo curto em tópicos.

Se perguntar "faça um plano de voo":
- apresente ações práticas e priorizadas;
- recomendações devem usar *SUGESTÃO:*.

Se perguntar sobre comparação:
- compare somente os dados disponíveis.

Se perguntar algo que não pode ser respondido pelos registros:
- diga que não há informação suficiente.

NÃO:
- invente informações;
- repita todo o contexto;
- gere texto desnecessário;
- faça introdução genérica;
- encerre com "espero ter ajudado";
- transforme hipótese em fato.

FORMATAÇÃO WHATSAPP:

- Use *asteriscos simples* para destaque.
- Nunca use **asteriscos duplos**.
- Use "-" para tópicos.
- Não use bloco de código.
- Não use títulos Markdown com #.
- Responda em português do Brasil.
- Seja natural, técnico e direto.

PERGUNTA DO USUÁRIO:

${pergunta}

HISTÓRICO RECENTE:

${historicoTexto}

DADOS DO TURNO:

${contexto}
`;

      const resposta =
        await chamarIA(
          prompt,
          {
            maxOutputTokens:
              4000,

            timeoutMs:
              45000,

            thinkingLevel:
              'medium',

            temperature:
              0.25
          }
        );

      res.json({

        resposta:
          resposta.texto,

        total:
          ocorrencias.length,

        modelo:
          resposta.modelo

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
      `Gemini: ${
        GEMINI_API_KEY
          ? 'OK'
          : 'NÃO CONFIGURADO'
      }`
    );

    console.log(
      `Modelo principal: ${GEMINI_MODELS[0]}`
    );

    console.log(
      `Modelos de fallback: ${GEMINI_MODELS.slice(1).join(', ')}`
    );

    console.log(
      'Raciocínio IA: ATIVADO'
    );

    console.log(
      'IA: organização por frente'
    );

    console.log(
      'IA: resumo executivo curto'
    );

    console.log(
      'IA: análise gerencial detalhada'
    );

    console.log(
      'IA: chat operacional resumido'
    );
  }
);
