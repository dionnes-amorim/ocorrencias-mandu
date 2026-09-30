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

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

const TABLE = 'ocorrencias_mandu';


// =========================================================
// CLIENTE SUPABASE
// =========================================================

const supabase =
  SUPABASE_URL && SUPABASE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_KEY)
    : null;


// =========================================================
// LOG INICIAL
// =========================================================

console.log('==========================================');
console.log('CTT DIÁRIO DE TURNO - MANDU');
console.log('==========================================');
console.log('Supabase:', Boolean(supabase));
console.log('OpenRouter:', Boolean(OPENROUTER_API_KEY));
console.log('Tabela:', TABLE);
console.log('Porta:', PORT);
console.log('==========================================');


// =========================================================
// STATUS
// =========================================================

app.get('/api/status', (req, res) => {

  res.json({
    online: true,
    supabase: Boolean(supabase),
    openrouter: Boolean(OPENROUTER_API_KEY),
    tabela: TABLE,
    timestamp: new Date().toISOString()
  });

});


// =========================================================
// ORGANIZAR TURNO COM OPENROUTER
// =========================================================

app.post('/organizar-ia', async (req, res) => {

  try {

    // -------------------------------------------------------
    // VERIFICAR OPENROUTER
    // -------------------------------------------------------

    if (!OPENROUTER_API_KEY) {

      return res.status(500).json({
        texto:
          'OPENROUTER_API_KEY não configurada no Render.'
      });

    }


    // -------------------------------------------------------
    // RECEBER OCORRÊNCIAS
    // -------------------------------------------------------

    const ocorrencias = Array.isArray(req.body?.ocorrencias)
      ? req.body.ocorrencias
      : [];


    if (ocorrencias.length === 0) {

      return res.status(400).json({
        texto:
          'Nenhuma ocorrência foi enviada para organização.'
      });

    }


    // -------------------------------------------------------
    // PREPARAR DADOS
    // -------------------------------------------------------

    const material = ocorrencias
      .map((o) => {

        const hora =
          typeof o.hora === 'string'
            ? o.hora.trim()
            : '--:--';

        const frente =
          typeof o.frente === 'string'
            ? o.frente.trim()
            : 'GERAL';

        const texto =
          typeof o.texto === 'string'
            ? o.texto.trim()
            : '';

        const turno =
          typeof o.turno === 'string'
            ? o.turno.trim()
            : '';

        const unidade =
          typeof o.unidade === 'string'
            ? o.unidade.trim()
            : 'MANDU';

        return [
          `Horário: ${hora}`,
          `Frente: ${frente}`,
          `Turno: ${turno || 'Não informado'}`,
          `Unidade: ${unidade}`,
          `Ocorrência: ${texto}`
        ].join('\n');

      })
      .filter(Boolean)
      .join('\n\n');


    // -------------------------------------------------------
    // PROMPT
    // -------------------------------------------------------

    const prompt = `
Você é responsável por organizar o Diário de Turno do CTT da unidade Mandu.

Transforme as ocorrências operacionais abaixo em um relatório profissional, objetivo e fácil de ler.

REGRAS:

- Não invente informações.
- Não invente números.
- Não invente horários.
- Não invente causas.
- Não invente ações.
- Não invente equipamentos.
- Não invente pessoas.
- Não altere os números das frentes.
- Preserve os fatos registrados.
- Corrija erros de português.
- Corrija erros óbvios de transcrição.
- Agrupe ocorrências da mesma frente.
- Mantenha os horários.
- Destaque manutenção, parada, indisponibilidade, atraso ou risco somente quando essas informações estiverem registradas.
- Não transforme possibilidade em fato.
- Não faça previsões.
- Não faça julgamentos sobre a operação.
- Use linguagem técnica e profissional.
- Seja objetivo.
- Não explique o que você fez.
- Entregue somente o relatório.

FORMATO:

CTT - DIÁRIO DE TURNO | MANDU

[Frente]
- HH:MM — ocorrência.

[Outra Frente]
- HH:MM — ocorrência.

[GERAL]
- HH:MM — ocorrência.

Se houver informações relevantes, ao final:

PONTOS DE ATENÇÃO
- ponto operacional relevante.

Só inclua pontos de atenção que estejam claramente presentes nas ocorrências.

OCORRÊNCIAS:

${material}
`;


    // -------------------------------------------------------
    // CHAMADA OPENROUTER
    // -------------------------------------------------------

    console.log(
      `Enviando ${ocorrencias.length} ocorrência(s) para OpenRouter...`
    );


    const resposta = await fetch(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        method: 'POST',

        headers: {
          Authorization: `Bearer ${OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',

          'HTTP-Referer':
            'https://ocorrencias-mandu.onrender.com',

          'X-Title':
            'CTT Diário de Turno - Mandu'
        },

        body: JSON.stringify({

          model:
            'google/gemma-4-31b-it:free',

          messages: [
            {
              role: 'user',
              content: prompt
            }
          ],

          temperature: 0.2,

          max_tokens: 2000

        })
      }
    );


    // -------------------------------------------------------
    // LER RESPOSTA
    // -------------------------------------------------------

    const data = await resposta.json();


    console.log(
      'Status OpenRouter:',
      resposta.status
    );


    if (!resposta.ok) {

      console.error(
        'Resposta de erro OpenRouter:',
        JSON.stringify(data)
      );


      return res.status(500).json({
        texto:
          'Erro OpenRouter: ' +
          (
            data?.error?.message ||
            JSON.stringify(data?.error) ||
            'erro desconhecido'
          )
      });

    }


    // -------------------------------------------------------
    // EXTRAIR TEXTO
    // -------------------------------------------------------

    const texto =
      data?.choices?.[0]?.message?.content?.trim() ||
      data?.choices?.[0]?.text?.trim() ||
      '';


    if (!texto) {

      console.error(
        'OpenRouter respondeu sem texto:',
        JSON.stringify(data)
      );


      return res.status(500).json({
        texto:
          'A IA respondeu, mas não retornou texto. Verifique os logs do Render.'
      });

    }


    console.log(
      'Relatório gerado com sucesso.'
    );


    return res.json({
      success: true,
      texto
    });


  } catch (error) {

    console.error(
      'ERRO /organizar-ia:',
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


    const { data, error } =
      await supabase
        .from(TABLE)
        .select('*')
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


    return res.json(data || []);


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
        typeof turno === 'string' &&
        turno.trim()
          ? turno.trim()
          : null,

      unidade:
        typeof unidade === 'string' &&
        unidade.trim()
          ? unidade.trim()
          : 'MANDU'

    };


    const { data, error } =
      await supabase
        .from(TABLE)
        .insert([registro])
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
      success: true,
      data
    });


  } catch (error) {

    console.error(
      'Erro POST /api/ocorrencias:',
      error
    );


    return res.status(500).json({
      error:
        'Erro interno do servidor.'
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


    const { id } = req.params;


    if (!id) {

      return res.status(400).json({
        error:
          'ID não informado.'
      });

    }


    const { error } =
      await supabase
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


    return res.json({
      success: true,
      id
    });


  } catch (error) {

    console.error(
      'Erro DELETE:',
      error
    );


    return res.status(500).json({
      error:
        'Erro interno do servidor.'
    });

  }

});


// =========================================================
// ERRO GLOBAL
// =========================================================

app.use((err, req, res, next) => {

  console.error(
    'Erro não tratado:',
    err
  );


  return res.status(500).json({
    error:
      'Erro interno do servidor.'
  });

});


// =========================================================
// SERVIDOR
// =========================================================

app.listen(PORT, () => {

  console.log(
    `Servidor rodando na porta ${PORT}`
  );

});
