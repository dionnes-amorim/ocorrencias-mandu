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

const TABLE = 'ocorrencias_mandu';


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
    'AVISO: GEMINI_API_KEY não configurada. A organização por IA ficará indisponível.'
  );
}


// =========================================================
// CLIENTES
// =========================================================

const supabase =
  SUPABASE_URL && SUPABASE_KEY
    ? createClient(
        SUPABASE_URL,
        SUPABASE_KEY
      )
    : null;


const ai =
  GEMINI_API_KEY
    ? new GoogleGenAI({
        apiKey: GEMINI_API_KEY
      })
    : null;


// =========================================================
// STATUS
// =========================================================

app.get('/api/status', async (req, res) => {

  return res.json({
    online: true,
    supabase: Boolean(supabase),
    gemini: Boolean(ai),
    tabela: TABLE,
    timestamp: new Date().toISOString()
  });

});


// =========================================================
// ORGANIZAR TURNO COM IA
// =========================================================

app.post('/organizar-ia', async (req, res) => {

  try {

    if (!ai) {

      return res.status(500).json({
        texto:
          'IA não configurada no servidor. Verifique a GEMINI_API_KEY no ambiente do Render.'
      });

    }


    const ocorrencias = Array.isArray(req.body?.ocorrencias)
      ? req.body.ocorrencias
      : [];


    if (!ocorrencias.length) {

      return res.status(400).json({
        texto: 'Nenhuma ocorrência foi enviada para organização.'
      });

    }


    // =====================================================
    // LIMPA E NORMALIZA OS DADOS
    // =====================================================

    const dados = ocorrencias.map((o, index) => ({

      ordem: index + 1,

      hora:
        typeof o.hora === 'string'
          ? o.hora
          : '',

      frente:
        typeof o.frente === 'string'
          ? o.frente
          : 'GERAL',

      texto:
        typeof o.texto === 'string'
          ? o.texto.trim()
          : '',

      turno:
        typeof o.turno === 'string'
          ? o.turno
          : '',

      unidade:
        typeof o.unidade === 'string'
          ? o.unidade
          : 'MANDU'

    })).filter(o => o.texto);


    if (!dados.length) {

      return res.status(400).json({
        texto: 'As ocorrências enviadas não possuem textos válidos.'
      });

    }


    // =====================================================
    // MONTA O MATERIAL PARA A IA
    // =====================================================

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
    // PROMPT OPERACIONAL
    // =====================================================

    const prompt = `
Você é um assistente responsável por organizar o Diário de Turno operacional do CTT da unidade Mandu.

Sua função é transformar as ocorrências registradas durante o turno em um relatório operacional claro, profissional e objetivo.

REGRAS IMPORTANTES:

1. Não invente nenhuma informação.
2. Não crie números que não estejam nas ocorrências.
3. Não altere horários.
4. Não altere números de frentes.
5. Não altere nomes de equipamentos ou pessoas.
6. Não invente causas, ações ou consequências.
7. Preserve todas as informações operacionais relevantes.
8. Corrija erros de português e transcrição.
9. Agrupe ocorrências relacionadas quando isso melhorar a leitura.
10. Organize preferencialmente por frente.
11. Dentro de cada frente, mantenha a sequência temporal quando possível.
12. Destaque situações de manutenção, parada, indisponibilidade, atraso, risco operacional e retomada quando essas informações estiverem presentes.
13. Não transforme uma possibilidade em fato.
14. Não faça análise que não esteja sustentada pelas ocorrências.
15. Não use linguagem exagerada.
16. O texto deve ser adequado para comunicação profissional de operação/gerência.
17. Não coloque introduções desnecessárias.
18. Não coloque explicações sobre o que você fez.
19. Entregue somente o relatório final.

FORMATO PREFERENCIAL:

CTT - DIÁRIO DE TURNO | MANDU

[Frente / área]
- HH:MM — ocorrência.
- HH:MM — ocorrência.

[Outra frente / área]
- HH:MM — ocorrência.

[GERAL]
- HH:MM — ocorrência.

Se houver informações suficientes, ao final inclua:

PONTOS DE ATENÇÃO
- ponto operacional relevante.

Mas somente inclua pontos de atenção que estejam claramente presentes nos registros.

OCORRÊNCIAS DO TURNO:

${material}
`;


    // =====================================================
    // CHAMADA GEMINI
    // =====================================================

    const response =
      await ai.models.generateContent({

        model: 'gemini-2.5-flash',

        contents: prompt

      });


    const textoIA =
      response.text?.trim();


    if (!textoIA) {

      return res.status(500).json({
        texto:
          'A IA não retornou um relatório válido.'
      });

    }


    return res.json({

      success: true,

      texto: textoIA

    });


  } catch (error) {

    console.error(
      'Erro POST /organizar-ia:',
      error
    );

    return res.status(500).json({

      texto:
        'Erro ao organizar as ocorrências com IA: ' +
        (error?.message || 'erro desconhecido')

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
    } = await supabase
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
// POST - CRIAR OCORRÊNCIA VIA API
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
        typeof hora === 'string' && hora.trim()
          ? hora.trim()
          : '--:--',

      frente:
        typeof frente === 'string' && frente.trim()
          ? frente.trim()
          : 'GERAL',

      texto:
        texto.trim(),

      turno:
        typeof turno === 'string'
          ? turno.trim()
          : null,

      unidade:
        typeof unidade === 'string' && unidade.trim()
          ? unidade.trim()
          : 'MANDU'

    };


    const {
      data,
      error
    } = await supabase
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
    } = await supabase
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
