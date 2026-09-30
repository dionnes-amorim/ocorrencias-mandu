const express = require('express');
const path = require('path');
require('dotenv').config();

const { createClient } = require('@supabase/supabase-js');

const app = express();

const PORT = process.env.PORT || 3000;

const TABLE = 'ocorrencias_mandu';

/* =========================================================
   VARIÁVEIS DO RENDER
========================================================= */

const SUPABASE_URL =
  process.env.SUPABASE_URL;

const SUPABASE_KEY =
  process.env.SUPABASE_SECRET_KEY ||
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  process.env.SUPABASE_ANON_KEY;

const OPENROUTER_API_KEY =
  process.env.OPENROUTER_API_KEY;

/* =========================================================
   VALIDAÇÃO
========================================================= */

if (!SUPABASE_URL) {
  console.error(
    'ERRO: SUPABASE_URL não configurada no Render.'
  );
}

if (!SUPABASE_KEY) {
  console.error(
    'ERRO: nenhuma chave do Supabase configurada no Render.'
  );
}

if (!OPENROUTER_API_KEY) {
  console.error(
    'ERRO: OPENROUTER_API_KEY não configurada no Render.'
  );
}

/* =========================================================
   SUPABASE
========================================================= */

const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);

/* =========================================================
   MIDDLEWARE
========================================================= */

app.use(express.json({
  limit: '1mb'
}));

/*
  O index.html pode ficar na raiz do projeto.
  O servidor entrega apenas o arquivo inicial na rota "/".
*/

app.get('/', (req, res) => {

  res.sendFile(
    path.join(__dirname, 'index.html')
  );

});

/* =========================================================
   STATUS
========================================================= */

app.get('/api/status', async (req, res) => {

  try {

    const { error } =
      await supabase
        .from(TABLE)
        .select('id')
        .limit(1);

    if (error) {
      throw error;
    }

    res.json({
      ok: true,
      supabase: true,
      ia: Boolean(OPENROUTER_API_KEY),
      tabela: TABLE
    });

  } catch (error) {

    console.error(
      'Erro status:',
      error
    );

    res.status(500).json({
      ok: false,
      error: error.message
    });

  }

});

/* =========================================================
   LISTAR OCORRÊNCIAS
========================================================= */

app.get('/api/ocorrencias', async (req, res) => {

  try {

    const { data, error } =
      await supabase
        .from(TABLE)
        .select('*')
        .order('created_at', {
          ascending: false
        });

    if (error) {
      throw error;
    }

    res.json(data || []);

  } catch (error) {

    console.error(
      'Erro ao buscar ocorrências:',
      error
    );

    res.status(500).json({
      error:
        'Não foi possível carregar as ocorrências.'
    });

  }

});

/* =========================================================
   CRIAR OCORRÊNCIA
========================================================= */

app.post('/api/ocorrencias', async (req, res) => {

  try {

    const {
      hora,
      frente,
      texto,
      turno,
      unidade
    } = req.body;

    if (!texto || !String(texto).trim()) {

      return res.status(400).json({
        error:
          'O texto da ocorrência é obrigatório.'
      });

    }

    const registro = {

      hora:
        hora ||
        new Date().toLocaleTimeString(
          'pt-BR',
          {
            hour: '2-digit',
            minute: '2-digit'
          }
        ),

      frente:
        frente ||
        'GERAL',

      texto:
        String(texto).trim(),

      turno:
        turno || null,

      unidade:
        unidade || 'MANDU'

    };

    const { data, error } =
      await supabase
        .from(TABLE)
        .insert(registro)
        .select()
        .single();

    if (error) {
      throw error;
    }

    res.status(201).json(data);

  } catch (error) {

    console.error(
      'Erro ao inserir ocorrência:',
      error
    );

    res.status(500).json({
      error:
        'Não foi possível salvar a ocorrência.'
    });

  }

});

/* =========================================================
   EDITAR OCORRÊNCIA
========================================================= */

app.put('/api/ocorrencias/:id', async (req, res) => {

  try {

    const { id } = req.params;

    const {
      hora,
      frente,
      texto
    } = req.body;

    if (!texto || !String(texto).trim()) {

      return res.status(400).json({
        error:
          'O texto da ocorrência é obrigatório.'
      });

    }

    const alteracao = {

      hora:
        hora ||
        null,

      frente:
        frente ||
        'GERAL',

      texto:
        String(texto).trim()

    };

    const { data, error } =
      await supabase
        .from(TABLE)
        .update(alteracao)
        .eq('id', id)
        .select()
        .single();

    if (error) {
      throw error;
    }

    res.json(data);

  } catch (error) {

    console.error(
      'Erro ao editar ocorrência:',
      error
    );

    res.status(500).json({
      error:
        'Não foi possível editar a ocorrência.'
    });

  }

});

/* =========================================================
   EXCLUIR UMA OCORRÊNCIA
========================================================= */

app.delete('/api/ocorrencias/:id', async (req, res) => {

  try {

    const { id } = req.params;

    const { error } =
      await supabase
        .from(TABLE)
        .delete()
        .eq('id', id);

    if (error) {
      throw error;
    }

    res.json({
      ok: true
    });

  } catch (error) {

    console.error(
      'Erro ao excluir ocorrência:',
      error
    );

    res.status(500).json({
      error:
        'Não foi possível excluir a ocorrência.'
    });

  }

});

/* =========================================================
   NOVO TURNO — LIMPAR TUDO
========================================================= */

app.delete('/api/ocorrencias', async (req, res) => {

  try {

    /*
      UUID impossível de ser usado pela aplicação.
      O filtro permite que o Supabase aceite a operação
      de exclusão de todos os registros.
    */

    const { error } =
      await supabase
        .from(TABLE)
        .delete()
        .neq(
          'id',
          '00000000-0000-0000-0000-000000000000'
        );

    if (error) {
      throw error;
    }

    res.json({
      ok: true,
      message:
        'Turno limpo com sucesso.'
    });

  } catch (error) {

    console.error(
      'Erro ao limpar turno:',
      error
    );

    res.status(500).json({
      error:
        'Não foi possível limpar o turno.'
    });

  }

});

/* =========================================================
   FUNÇÃO DE CHAMADA À IA
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
    maxTokens = 700,
    temperature = 0.1,
    reasoningEffort = 'minimal'
  } = opcoes;

  /*
    Mantemos o modelo configurado no servidor.
    Nenhuma informação de autenticação vai para o navegador.
  */

  const AI_MODEL =
    'google/gemma-4-26b-a4b-it:free';

  const resposta =
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
            'CTT Diário de Turno - MANDU'

        },

        body: JSON.stringify({

          model:
            AI_MODEL,

          messages,

          temperature,

          max_completion_tokens:
            maxTokens,

          reasoning: {
            effort:
              reasoningEffort
          }

        })

      }
    );

  const dados =
    await resposta.json();

  if (!resposta.ok) {

    console.error(
      'Erro OpenRouter:',
      JSON.stringify(
        dados,
        null,
        2
      )
    );

    throw new Error(
      dados?.error?.message ||
      `OpenRouter retornou HTTP ${resposta.status}`
    );

  }

  const conteudo =
    dados?.choices?.[0]?.message?.content;

  if (
    conteudo === null ||
    conteudo === undefined ||
    conteudo === ''
  ) {

    throw new Error(
      'A IA não retornou conteúdo.'
    );

  }

  return conteudo;

}

/* =========================================================
   ORGANIZAR TURNO
========================================================= */

app.post('/organizar-ia', async (req, res) => {

  try {

    const ocorrencias =
      Array.isArray(req.body?.ocorrencias)
        ? req.body.ocorrencias
        : [];

    if (!ocorrencias.length) {

      return res.status(400).json({
        error:
          'Nenhuma ocorrência foi enviada.'
      });

    }

    /*
      Contexto enxuto para acelerar a resposta.
    */

    const contexto =
      ocorrencias
        .map(item => {

          return [
            item.hora || '',
            item.frente || 'GERAL',
            item.texto || ''
          ].join(' | ');

        })
        .join('\n');

    const systemPrompt = `Você é o copiloto operacional do CTT Diário de Turno da unidade MANDU.

Sua função é organizar ocorrências operacionais reais de um turno.

Analise somente as informações fornecidas.

Não invente números, capacidades, causas ou fatos que não estejam nas ocorrências.

Quando algo for uma sugestão sua, deixe claro que é sugestão.

Organize a resposta de forma objetiva e útil para gestão operacional.

Priorize:
1. principais ocorrências;
2. problemas recorrentes;
3. riscos para continuidade;
4. impactos operacionais;
5. pontos que precisam de acompanhamento;
6. ações recomendadas para o próximo período.

Se houver informações suficientes, agrupe ocorrências relacionadas.

Não faça textos longos desnecessariamente.`;

    const userPrompt =
      `OCORRÊNCIAS DO TURNO:

${contexto}

Organize este turno em um resumo operacional objetivo.`;

    const resumo =
      await chamarIA(
        [
          {
            role: 'system',
            content: systemPrompt
          },
          {
            role: 'user',
            content: userPrompt
          }
        ],
        {
          maxTokens: 850,
          temperature: 0.1,
          reasoningEffort: 'minimal'
        }
      );

    res.json({
      resumo
    });

  } catch (error) {

    console.error(
      'Erro /organizar-ia:',
      error
    );

    res.status(500).json({
      error:
        error.message ||
        'Erro ao organizar turno com IA.'
    });

  }

});

/* =========================================================
   CHAT GERAL DO TURNO
========================================================= */

app.post('/chat-ia', async (req, res) => {

  try {

    const {
      ocorrencias = [],
      pergunta,
      historico = []
    } = req.body || {};

    if (
      !Array.isArray(ocorrencias) ||
      !ocorrencias.length
    ) {

      return res.status(400).json({
        error:
          'Não existem ocorrências para analisar.'
      });

    }

    if (
      !pergunta ||
      !String(pergunta).trim()
    ) {

      return res.status(400).json({
        error:
          'Digite uma pergunta.'
      });

    }

    /*
      Contexto enxuto.
      Isso evita mandar dados desnecessários para a IA.
    */

    const contexto =
      ocorrencias
        .map(item => {

          return [
            item.hora || '',
            item.frente || 'GERAL',
            item.texto || ''
          ].join(' | ');

        })
        .join('\n');

    /*
      Mantém somente o histórico recente.
    */

    const historicoSeguro =
      Array.isArray(historico)
        ? historico
            .filter(item =>
              item &&
              (
                item.role === 'user' ||
                item.role === 'assistant'
              ) &&
              typeof item.content === 'string'
            )
            .slice(-8)
        : [];

    const systemPrompt = `Você é um copiloto operacional do CTT da unidade MANDU.

Você está analisando TODAS as ocorrências de um turno.

Seu objetivo é ajudar a equipe a tomar decisões operacionais melhores com base no que foi registrado.

Você pode analisar:

- problemas repetidos;
- causas aparentes quando estiverem registradas;
- riscos;
- gargalos;
- produtividade;
- transporte;
- ciclo do malhador;
- colhedoras;
- trações;
- frentes;
- manutenção;
- logística;
- organização do próximo turno;
- necessidade de acompanhamento;
- possíveis ações preventivas;
- pontos que podem ser escalados.

REGRAS IMPORTANTES:

1. Use somente os fatos disponíveis nas ocorrências.
2. Não invente números.
3. Não invente capacidade de máquinas.
4. Não invente disponibilidade.
5. Não afirme uma causa como fato se ela não estiver registrada.
6. Diferencie claramente FATO de SUGESTÃO.
7. Quando faltar informação para uma conclusão, diga qual informação falta.
8. Seja objetivo e operacional.
9. Não fique repetindo as ocorrências literalmente.
10. Quando possível, transforme os registros em ações práticas.
11. Considere o turno como um todo, e não apenas uma frente.
12. Se a pergunta envolver deslocar uma colhedora, tração ou recurso, apresente a lógica operacional e os dados que deveriam ser confirmados antes da movimentação.
13. Se a pergunta envolver redução de ciclo, analise os registros relacionados a carregamento, transporte, espera, descarga, retorno e disponibilidade.
14. Se a pergunta envolver recorrência, identifique padrões presentes nas ocorrências.
15. Não tome decisões no lugar do gestor. Apresente a análise e as opções operacionais sustentadas pelos dados.`;

    const messages = [

      {
        role: 'system',
        content: systemPrompt
      },

      {
        role: 'user',
        content:
          `CONTEXTO COMPLETO DO TURNO:

${contexto}`
      }

    ];

    /*
      Adiciona histórico recente.
    */

    for (const item of historicoSeguro) {

      messages.push({
        role: item.role,
        content: item.content
      });

    }

    messages.push({
      role: 'user',
      content:
        `PERGUNTA ATUAL:

${String(pergunta).trim()}`
    });

    const resposta =
      await chamarIA(
        messages,
        {
          maxTokens: 750,
          temperature: 0.15,
          reasoningEffort: 'minimal'
        }
      );

    res.json({
      resposta
    });

  } catch (error) {

    console.error(
      'Erro /chat-ia:',
      error
    );

    res.status(500).json({
      error:
        error.message ||
        'Erro ao consultar a IA.'
    });

  }

});

/* =========================================================
   ERRO GLOBAL
========================================================= */

app.use(
  (err, req, res, next) => {

    console.error(
      'Erro não tratado:',
      err
    );

    res.status(500).json({
      error:
        'Erro interno do servidor.'
    });

  }
);

/* =========================================================
   INICIAR SERVIDOR
========================================================= */

app.listen(
  PORT,
  () => {

    console.log(
      `CTT Diário de Turno MANDU rodando na porta ${PORT}`
    );

    console.log(
      `Supabase: ${Boolean(SUPABASE_URL && SUPABASE_KEY) ? 'OK' : 'NÃO CONFIGURADO'}`
    );

    console.log(
      `OpenRouter: ${Boolean(OPENROUTER_API_KEY) ? 'OK' : 'NÃO CONFIGURADO'}`
    );

  }
);
