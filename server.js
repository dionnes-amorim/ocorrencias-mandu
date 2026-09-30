import express from 'express';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const app = express();

app.use(express.json({ limit: '1mb' }));
app.use(express.static('.'));

// =========================================================
// CONFIGURAÇÕES
// =========================================================

const PORT = process.env.PORT || 3000;

const SUPABASE_URL = process.env.SUPABASE_URL;

const SUPABASE_KEY =
  process.env.SUPABASE_SECRET_KEY ||
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  process.env.SUPABASE_ANON_KEY;

const OPENROUTER_API_KEY =
  process.env.OPENROUTER_API_KEY;

const TABLE = 'ocorrencias_mandu';


// =========================================================
// VALIDAÇÃO
// =========================================================

if (!SUPABASE_URL) {
  console.error('ERRO: SUPABASE_URL não configurada.');
}

if (!SUPABASE_KEY) {
  console.error(
    'ERRO: chave do Supabase não configurada.'
  );
}

if (!OPENROUTER_API_KEY) {
  console.warn(
    'AVISO: OPENROUTER_API_KEY não configurada.'
  );
}


// =========================================================
// SUPABASE
// =========================================================

const supabase =
  SUPABASE_URL && SUPABASE_KEY
    ? createClient(
        SUPABASE_URL,
        SUPABASE_KEY
      )
    : null;


// =========================================================
// STATUS
// =========================================================

app.get('/api/status', (req, res) => {

  return res.json({

    online: true,

    supabase:
      Boolean(supabase),

    openrouter:
      Boolean(OPENROUTER_API_KEY),

    tabela:
      TABLE,

    timestamp:
      new Date().toISOString()

  });

});


// =========================================================
// ORGANIZAR TURNO COM OPENROUTER
// =========================================================

app.post('/organizar-ia', async (req, res) => {

  try {

    // -----------------------------------------------------
    // VERIFICA OPENROUTER
    // -----------------------------------------------------

    if (!OPENROUTER_API_KEY) {

      return res.status(500).json({

        texto:
          'OpenRouter não configurado no servidor. Verifique a OPENROUTER_API_KEY no Render.'

      });

    }


    // -----------------------------------------------------
    // RECEBE OCORRÊNCIAS
    // -----------------------------------------------------

    const ocorrencias =
      Array.isArray(req.body?.ocorrencias)
        ? req.body.ocorrencias
        : [];


    if (!ocorrencias.length) {

      return res.status(400).json({

        texto:
          'Nenhuma ocorrência foi enviada para organização.'

      });

    }


    // -----------------------------------------------------
    // NORMALIZA DADOS
    // -----------------------------------------------------

    const dados = ocorrencias

      .map((o, index) => ({

        ordem:
          index + 1,

        hora:
          typeof o.hora === 'string'
            ? o.hora.trim()
            : '',

        frente:
          typeof o.frente === 'string'
            ? o.frente.trim()
            : 'GERAL',

        texto:
          typeof o.texto === 'string'
            ? o.texto.trim()
            : '',

        turno:
          typeof o.turno === 'string'
            ? o.turno.trim()
            : '',

        unidade:
          typeof o.unidade === 'string'
            ? o.unidade.trim()
            : 'MANDU'

      }))

      .filter(o => o.texto);


    if (!dados.length) {

      return res.status(400).json({

        texto:
          'As ocorrências enviadas não possuem textos válidos.'

      });

    }


    // -----------------------------------------------------
    // MONTA OCORRÊNCIAS
    // -----------------------------------------------------

    const material = dados

      .map(o => {

        return [
          `Horário: ${o.hora || '--:--'}`,
          `Frente: ${o.frente}`,
          `Turno: ${o.turno || 'Não informado'}`,
          `Unidade: ${o.unidade || 'MANDU'}`,
          `Ocorrência: ${o.texto}`
        ].join('\n');

      })

      .join('\n\n');


    // =====================================================
    // PROMPT
    // =====================================================

    const systemPrompt = `
Você é um assistente especializado em organizar
Diários de Turno de uma operação agrícola e logística.

Sua função é transformar ocorrências operacionais
brutas em um relatório profissional para comunicação
com supervisão e gerência.

REGRAS OBRIGATÓRIAS:

- Não invente informações.
- Não invente números.
- Não invente horários.
- Não invente causas.
- Não invente ações.
- Não invente equipamentos.
- Não invente pessoas.
- Não altere números de frente.
- Preserve os fatos registrados.
- Corrija erros de português e transcrição.
- Organize as informações de forma clara.
- Agrupe ocorrências da mesma frente.
- Preserve os horários quando existirem.
- Destaque manutenção, parada, indisponibilidade,
  atraso, risco operacional e retomada quando isso
  estiver explicitamente registrado.
- Não transforme possibilidade em fato.
- Não faça previsões.
- Não faça comentários sobre a qualidade da operação.
- Use linguagem técnica, objetiva e profissional.
- Evite textos longos desnecessários.
- Não explique o processo de organização.
- Entregue somente o relatório final.

FORMATO:

CTT - DIÁRIO DE TURNO | MANDU

[Frente / área]
- HH:MM — ocorrência.

[Outra frente / área]
- HH:MM — ocorrência.

[GERAL]
- HH:MM — ocorrência.

Ao final, se existirem informações suficientes,
adicione:

PONTOS DE ATENÇÃO
- ponto relevante identificado diretamente nas ocorrências.

Não crie pontos de atenção que não estejam presentes
nos registros.
`;


    const userPrompt = `
OCORRÊNCIAS DO TURNO:

${material}
`;


    // =====================================================
    // CHAMADA OPENROUTER
    // =====================================================

    const response =
      await fetch(
        'https://openrouter.ai/api/v1/chat/completions',
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
              'CTT Diário de Turno - Mandu'

          },

          body: JSON.stringify({

            model:
              'openrouter/free',

            messages: [

              {
                role:
                  'system',

                content:
                  systemPrompt
              },

              {
                role:
                  'user',

                content:
                  userPrompt
              }

            ],

            temperature:
              0.2,

            max_tokens:
              2500

          })

        }
      );


    // =====================================================
    // LÊ RESPOSTA
    // =====================================================

    const data =
      await response.json();


    if (!response.ok) {

      console.error(
        'Erro OpenRouter:',
        JSON.stringify(data)
      );


      return res.status(500).json({

        texto:
          'Erro ao acessar a IA: ' +
          (
            data?.error?.message ||
            'erro desconhecido no OpenRouter'
          )

      });

    }


    const textoIA =
      data?.choices?.[0]?.message?.content?.trim();


    if (!textoIA) {

      console.error(
        'OpenRouter não retornou texto:',
        JSON.stringify(data)
      );


      return res.status(500).json({

        texto:
          'A IA não retornou um relatório válido.'

      });

    }


    // =====================================================
    // RETORNO PARA O INDEX
    // =====================================================

    return res.json({

      success:
        true,

      texto:
        textoIA

    });


  } catch (error) {

    console.error(
      'Erro /organizar-ia:',
      error
    );


    return res.status(500).json({

      texto:
        'Erro ao organizar as ocorrências com IA: ' +
        (
          error?.message ||
          'erro desconhecido'
        )

    });

  }

});


// =========================================================
// GET - OCORRÊNCIAS
// =========================================================

app.get('/api/ocorrencias', async (req, res) => {

  try {

    if (!supabase) {

      return res.status(500).json({

        error:
          'Supabase não configurado no servidor.'

      });

    }


    const {
      data,
      error
    } =
      await supabase

        .from(TABLE)

        .select('*')

        .order(
          'created_at',
          {
            ascending:
              false
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


    return res.json(
      data || []
    );


  } catch (error) {

    console.error(
      'Erro GET /api/ocorrencias:',
      error
    );


    return res.status(500).json({

      error:
        'Erro interno do servidor.'

    });

  }

});


// =========================================================
// POST - CRIAR OCORRÊNCIA
// =========================================================

app.post('/api/ocorrencias', async (req, res) => {

  try {

    if (!supabase) {

      return res.status(500).json({

        error:
          'Supabase não configurado no servidor.'

      });

    }


    const {
      hora,
      frente,
      texto,
      turno,
      unidade
    } = req.body;


    if (
      typeof texto !== 'string' ||
      !texto.trim()
    ) {

      return res.status(400).json({

        error:
          'O campo texto é obrigatório.'

      });

    }


    const registro = {

      hora:
        typeof hora === 'string' &&
        hora.trim()
          ? hora.trim()
          : '--:--',

      frente:
        typeof frente === 'string' &&
        frente.trim()
          ? frente.trim()
          : 'GERAL',

      texto:
        texto.trim(),

      turno:
        typeof turno === 'string'
          ? turno.trim()
          : null,

      unidade:
        typeof unidade === 'string' &&
        unidade.trim()
          ? unidade.trim()
          : 'MANDU'

    };


    const {
      data,
      error
    } =
      await supabase

        .from(TABLE)

        .insert([
          registro
        ])

        .select('*')

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


    return res.status(201).json({

      success:
        true,

      data

    });


  } catch (error) {

    console.error(
      'Erro POST /api/ocorrencias:',
      error
    );


    return res.status(500).json({

      error:
        'Erro interno ao salvar ocorrência.'

    });

  }

});


// =========================================================
// DELETE - EXCLUIR OCORRÊNCIA
// =========================================================

app.delete('/api/ocorrencias/:id', async (req, res) => {

  try {

    if (!supabase) {

      return res.status(500).json({

        error:
          'Supabase não configurado no servidor.'

      });

    }


    const {
      id
    } = req.params;


    if (!id) {

      return res.status(400).json({

        error:
          'ID não informado.'

      });

    }


    const {
      error
    } =
      await supabase

        .from(TABLE)

        .delete()

        .eq(
          'id',
          id
        );


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


    return res.json({

      success:
        true,

      id

    });


  } catch (error) {

    console.error(
      'Erro DELETE:',
      error
    );


    return res.status(500).json({

      error:
        'Erro interno ao excluir ocorrência.'

    });

  }

});


// =========================================================
// ERRO GLOBAL
// =========================================================

app.use(
  (err, req, res, next) => {

    console.error(
      'Erro não tratado:',
      err
    );


    return res.status(500).json({

      error:
        'Erro interno do servidor.'

    });

  }
);


// =========================================================
// SERVIDOR
// =========================================================

app.listen(
  PORT,
  () => {

    console.log(
      `Servidor rodando na porta ${PORT}`
    );

  }
);
