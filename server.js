import express from 'express';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
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

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;


// =========================================================
// VALIDAÇÃO
// =========================================================

if (!SUPABASE_URL) {
  console.error('ERRO: SUPABASE_URL não configurada.');
}

if (!SUPABASE_KEY) {
  console.error(
    'ERRO: SUPABASE_SECRET_KEY, SUPABASE_PUBLISHABLE_KEY ou SUPABASE_ANON_KEY não configurada.'
  );
}

if (!GEMINI_API_KEY) {
  console.warn(
    'AVISO: GEMINI_API_KEY não configurada. A IA ficará indisponível.'
  );
}


// =========================================================
// CLIENTES
// =========================================================

const supabase = SUPABASE_URL && SUPABASE_KEY
  ? createClient(
      SUPABASE_URL,
      SUPABASE_KEY
    )
  : null;


const ai = GEMINI_API_KEY
  ? new GoogleGenAI({
      apiKey: GEMINI_API_KEY
    })
  : null;


// =========================================================
// HEALTH CHECK
// =========================================================

app.get('/api/status', async (req, res) => {

  return res.json({
    online: true,
    supabase: Boolean(supabase),
    gemini: Boolean(ai),
    timestamp: new Date().toISOString()
  });

});


// =========================================================
// GET - OCORRÊNCIAS
// =========================================================

app.get('/api/ocorrencias', async (req, res) => {

  try {

    if (!supabase) {

      return res.status(500).json({
        error: 'Supabase não configurado no servidor.'
      });

    }


    const {
      data,
      error
    } = await supabase
      .from('ocorrencias')
      .select('id, titulo, relatorio, criado_em')
      .order(
        'criado_em',
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
          'Erro ao carregar ocorrências no banco.'
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
        'Erro interno ao carregar ocorrências.'
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
      textoOriginal,
      titulo
    } = req.body;


    const texto =
      typeof textoOriginal === 'string'
        ? textoOriginal.trim()
        : '';


    const tituloFinal =
      typeof titulo === 'string' &&
      titulo.trim()
        ? titulo.trim()
        : 'Ocorrência';


    if (!texto) {

      return res.status(400).json({
        error:
          'O relato é obrigatório.'
      });

    }


    if (texto.length > 10000) {

      return res.status(400).json({
        error:
          'O relato ultrapassa o limite permitido de 10.000 caracteres.'
      });

    }


    // =====================================================
    // PROCESSAMENTO COM IA
    // =====================================================

    let relatoFormatado = texto;


    if (ai) {

      try {

        const prompt = `
Você é responsável por organizar registros operacionais.

Transforme o relato abaixo em um texto formal, profissional, objetivo e bem estruturado.

Regras:
- Não invente informações.
- Não altere números, horários, nomes ou fatos.
- Preserve todas as informações importantes.
- Corrija erros de português.
- Organize o texto para facilitar a leitura.
- Não coloque título.
- Entregue somente o relato final.

Relato original:

${texto}
`;


        const response =
          await ai.models.generateContent({

            model:
              'gemini-2.5-flash',

            contents:
              prompt

          });


        const textoIA =
          response.text?.trim();


        if (textoIA) {

          relatoFormatado =
            textoIA;

        }

      } catch (aiError) {

        console.warn(
          'IA indisponível. Salvando texto original.',
          aiError?.message || aiError
        );

      }

    }


    // =====================================================
    // SALVAR NO SUPABASE
    // =====================================================

    const {
      data,
      error
    } = await supabase
      .from('ocorrencias')
      .insert({

        titulo:
          tituloFinal,

        relatorio:
          relatoFormatado,

        criado_em:
          new Date().toISOString()

      })
      .select(
        'id, titulo, relatorio, criado_em'
      )
      .single();


    if (error) {

      console.error(
        'Erro Supabase INSERT:',
        error
      );

      return res.status(500).json({
        error:
          'Erro ao salvar ocorrência no banco.'
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
        'Erro interno ao salvar ocorrência.'
    });

  }

});


// =========================================================
// DELETE - EXCLUIR
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
          'ID da ocorrência não informado.'
      });

    }


    const {
      error
    } = await supabase
      .from('ocorrencias')
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
          'Erro ao excluir ocorrência no banco.'
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
