import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.disable('x-powered-by');

app.use(cors());

app.use(express.json({
limit: '5mb'
}));

app.use(express.urlencoded({
extended: false,
limit: '1mb'
}));

app.use(express.static(__dirname, {
maxAge: '1h'
}));

const PORT = process.env.PORT || 10000;

const SUPABASE_URL = process.env.SUPABASE_URL;

const SUPABASE_KEY =
process.env.SUPABASE_SECRET_KEY ||
process.env.SUPABASE_PUBLISHABLE_KEY ||
process.env.SUPABASE_ANON_KEY;

const GEMINI_KEY = process.env.GEMINI_API_KEY;

const TABLE = 'ocorrencias_mandu';

const MODELS = [
'gemini-3.8-flash',
'gemini-flash-latest',
'gemini-2.5-flash',
'gemini-2.5-flash-lite',
'gemini-flash-lite-latest'
];

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

app.get('/', (req, res) => {
res.sendFile(
path.join(__dirname, 'index.html')
);
});

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

```
hora: textoSeguro(
  item?.hora,
  20
),

frente: frenteSegura(
  item?.frente
),

texto: textoSeguro(
  item?.texto,
  10000
),

turno: textoSeguro(
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
```

};
}

app.get('/api/status', async (req, res) => {
res.json({
ok: true,
sistema: 'CTT Diário de Turno - MANDU',
supabase: !!supa,
gemini: !!GEMINI_KEY,
modelos: MODELS,
hora: horaAtual()
});
});

app.get('/api/ocorrencias', async (req, res) => {
try {
if (!supa) {
return res.status(500).json({
error:
'Supabase não configurado no Render.'
});
}

```
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
    error: error.message
  });
}

return res.json(
  (data || []).map(
    normalizarOcorrencia
  )
);
```

} catch (error) {
console.error(
'ERRO GET OCORRÊNCIAS:',
error
);

```
return res.status(500).json({
  error:
    'Erro ao carregar ocorrências.'
});
```

}
});

app.post('/api/ocorrencias', async (req, res) => {
try {
if (!supa) {
return res.status(500).json({
error:
'Supabase não configurado no Render.'
});
}

```
const texto = textoSeguro(
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
    error: error.message
  });
}

return res
  .status(201)
  .json(
    normalizarOcorrencia(data)
  );
```

} catch (error) {
console.error(
'ERRO POST OCORRÊNCIA:',
error
);

```
return res.status(500).json({
  error:
    'Erro ao salvar ocorrência.'
});
```

}
});

app.put('/api/ocorrencias/:id', async (req, res) => {
try {
if (!supa) {
return res.status(500).json({
error:
'Supabase não configurado no Render.'
});
}

```
const id = textoSeguro(
  req.params.id,
  100
);

const atualizacao = {};

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
    error: error.message
  });
}

return res.json(
  normalizarOcorrencia(data)
);
```

} catch (error) {
console.error(
'ERRO PUT OCORRÊNCIA:',
error
);

```
return res.status(500).json({
  error:
    'Erro ao atualizar ocorrência.'
});
```

}
});

app.delete('/api/ocorrencias/:id', async (req, res) => {
try {
if (!supa) {
return res.status(500).json({
error:
'Supabase não configurado no Render.'
});
}

```
const id = textoSeguro(
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
    error: error.message
  });
}

return res.json({
  ok: true
});
```

} catch (error) {
console.error(
'ERRO DELETE OCORRÊNCIA:',
error
);

```
return res.status(500).json({
  error:
    'Erro ao excluir ocorrência.'
});
```

}
});

app.delete('/api/ocorrencias', async (req, res) => {
try {
if (!supa) {
return res.status(500).json({
error:
'Supabase não configurado no Render.'
});
}

```
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
    error: error.message
  });
}

return res.json({
  ok: true
});
```

} catch (error) {
console.error(
'ERRO LIMPAR:',
error
);

```
return res.status(500).json({
  error:
    'Erro ao limpar ocorrências.'
});
```

}
});

function prepararOcorrenciasIA(
ocorrencias = []
) {
return (ocorrencias || [])
.map(normalizarOcorrencia)
.filter(item => item.texto);
}

function agruparPorFrente(
ocorrencias = []
) {
const grupos = {};

for (const item of ocorrencias) {
const frente =
item.frente || 'GERAL';

```
if (!grupos[frente]) {
  grupos[frente] = [];
}

grupos[frente].push(item);
```

}

return grupos;
}

function gerarContextoPorFrente(
ocorrencias = []
) {
const grupos =
agruparPorFrente(
ocorrencias
);

const frentes =
Object.keys(grupos).sort();

if (!frentes.length) {
return 'Nenhuma ocorrência registrada.';
}

return frentes
.map(frente => {
const linhas =
grupos[frente]
.map(
item =>
`- ${item.hora || '--:--'} | ${item.texto}`
)
.join('\n');

```
  return `FRENTE ${frente}\n${linhas}`;
})
.join('\n\n');
```

}

async function obterOcorrenciasIA(req) {
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
} = await supa
.from(TABLE)
.select('*')
.order(
'created_at',
{
ascending: true
}
);

```
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
  'IA - banco:',
  resultado.length
);

return resultado;
```

}

const resultado =
prepararOcorrenciasIA(
req.body?.ocorrencias || []
);

console.log(
'IA - body:',
resultado.length
);

return resultado;
}

const SYSTEM_IA = `
Você é a inteligência operacional do CTT Diário de Turno da unidade MANDU.

Atue como um analista operacional sênior.

Sua função é analisar ocorrências de CTT, logística, colheita, frentes, caminhões, cavalos, carretas, manutenção, carregamento, descarga, pátio, moagem, tecnologia e demais eventos operacionais.

NÃO seja apenas um resumidor.

Faça análise operacional.

Cruze ocorrências quando houver relação evidente.

Procure:

* concentração de problemas;
* repetição;
* evolução ao longo do turno;
* relação entre indisponibilidade e impacto;
* gargalos;
* risco de quebra operacional;
* frentes que exigem atenção;
* problemas que merecem cobrança;
* ações que podem reduzir impacto.

REGRAS ABSOLUTAS:

1. Nunca invente informação.
2. Nunca invente número.
3. Nunca invente horário.
4. Nunca invente causa.
5. Nunca invente ação realizada.
6. Nunca transforme hipótese em fato.
7. Diferencie fato de análise.
8. Diferencie análise de recomendação.
9. Toda recomendação deve usar *SUGESTÃO:*.
10. Se não houver dados suficientes, diga isso.
11. Não repita a mesma informação várias vezes.
12. Priorize impacto operacional.
13. Seja tecnicamente consistente.
14. Use português do Brasil.
15. A resposta deve estar pronta para WhatsApp.

FORMATAÇÃO:

Use títulos no formato:
*TÍTULO*

Use tópicos no formato:

* informação

Use negrito no formato:
*Frente 501*

Use recomendação:
*SUGESTÃO:* acompanhar...

NUNCA use:
**texto**
***texto***
blocos de código.

Use somente UM asterisco de cada lado para negrito.

Não coloque explicações sobre seu próprio raciocínio.

Não diga que você é uma IA.

Não escreva introduções desnecessárias.
`;

function normalizarPublicacaoIA(texto) {
let resultado = String(
texto || ''
);

resultado = resultado
.replace(/\r\n/g, '\n')
.replace(/\r/g, '\n');

resultado = resultado.replace(
/```(?:javascript|js|text|markdown|md)?/gi,
''
);

resultado = resultado.replace(
/```/g,
''
);

resultado = resultado.replace(
/**([^*\n]+)**/g,
'*$1*'
);

resultado = resultado.replace(
/*{3,}/g,
'*'
);

resultado = resultado.replace(
/*\s+([^*\n]+)\s+*/g,
'*$1*'
);

resultado = resultado.replace(
/^#{1,6}\s*/gm,
''
);

resultado = resultado.replace(
/^={3,}.*$/gm,
''
);

resultado = resultado.replace(
/^-{5,}$/gm,
''
);

resultado = resultado.replace(
/•/g,
'-'
);

resultado = resultado.replace(
/ +([,.;:!?])/g,
'$1'
);

resultado = resultado.replace(
/\n{3,}/g,
'\n\n'
);

return resultado.trim();
}

function gerarThinkingConfig(
modelo,
nivel
) {
const model =
String(
modelo || ''
).toLowerCase();

if (
model.includes('3.8') ||
model.includes('3.7') ||
model.includes('3.6') ||
model.includes('3.5') ||
model.includes('3.')
) {
return {
thinkingConfig: {
thinkingLevel:
nivel
}
};
}

const budgets = {
low: 1024,
medium: 4096,
high: 8192
};

return {
thinkingConfig: {
thinkingBudget:
budgets[nivel] || 4096
}
};
}

async function chamarGemini(
prompt,
options = {}
) {
if (!GEMINI_KEY) {
throw new Error(
'GEMINI_API_KEY não configurada no Render.'
);
}

const thinking =
options.thinking || 'medium';

const maxOutputTokens =
options.maxOutputTokens || 5000;

const timeoutMs =
options.timeoutMs || 30000;

let lastError =
'nenhum modelo respondeu';

for (const MODEL of MODELS) {
const controller =
new AbortController();

```
const timeout =
  setTimeout(
    () =>
      controller.abort(),
    timeoutMs
  );

try {
  console.log(
    '--------------------------------------'
  );

  console.log(
    'GEMINI tentando:',
    MODEL
  );

  console.log(
    'Thinking:',
    thinking
  );

  console.log(
    'Max tokens:',
    maxOutputTokens
  );

  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_KEY}`;

  const thinkingConfig =
    gerarThinkingConfig(
      MODEL,
      thinking
    );

  const body = {
    contents: [
      {
        parts: [
          {
            text:
              `${SYSTEM_IA}\n\n${prompt}`
          }
        ]
      }
    ],

    generationConfig: {
      temperature: 0.35,
      maxOutputTokens,
      ...thinkingConfig
    }
  };

  const r =
    await fetch(
      url,
      {
        method: 'POST',

        headers: {
          'Content-Type':
            'application/json'
        },

        signal:
          controller.signal,

        body:
          JSON.stringify(body)
      }
    );

  clearTimeout(timeout);

  const data =
    await r.json();

  console.log(
    'GEMINI HTTP:',
    r.status
  );

  const candidate =
    data?.candidates?.[0];

  const parts =
    candidate?.content?.parts ||
    [];

  const textos =
    parts
      .filter(
        part =>
          typeof part?.text ===
          'string' &&
          part?.thought !== true
      )
      .map(
        part =>
          part.text
      );

  const text =
    textos
      .join('\n')
      .trim();

  if (r.ok && text) {
    console.log(
      'GEMINI FUNCIONOU:',
      MODEL
    );

    console.log(
      'Finish:',
      candidate?.finishReason ||
      'não informado'
    );

    return {
      texto: text,
      modelo_usado: MODEL
    };
  }

  lastError =
    data?.error?.message ||
    candidate?.finishReason ||
    'sem resposta';

  console.log(
    `Falhou ${MODEL}: ${lastError}`
  );

  const erroLower =
    String(
      lastError
    ).toLowerCase();

  if (
    erroLower.includes(
      'api key'
    ) ||
    erroLower.includes(
      'permission'
    ) ||
    erroLower.includes(
      'unauthorized'
    ) ||
    erroLower.includes(
      'invalid argument'
    )
  ) {
    break;
  }

} catch (error) {
  clearTimeout(timeout);

  lastError =
    error.name === 'AbortError'
      ? `timeout ${Math.round(
          timeoutMs / 1000
        )}s`
      : error.message;

  console.log(
    `Pulou ${MODEL}: ${lastError}`
  );
}
```

}

throw new Error(
'Todos os modelos Gemini falharam. Último erro: ' +
lastError
);
}

app.post('/organizar-ia', async (req, res) => {
try {
const ocorrencias =
await obterOcorrenciasIA(req);

```
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
```

ORGANIZE O DIÁRIO DE TURNO DO CTT MANDU.

Analise as ocorrências antes de escrever.

Agrupe problemas relacionados.

Não simplesmente copie cada ocorrência.

Quando várias ocorrências representam o mesmo problema, consolide.

Quando existir evolução do problema, mostre a evolução.

ESTRUTURA:

*📋 DIÁRIO DE TURNO — MANDU*

*FRENTE 501*

* informações relevantes

*FRENTE 502*

* informações relevantes

*FRENTE 503*

* informações relevantes

*FRENTE 504*

* informações relevantes

*FRENTE 505*

* informações relevantes

*FRENTE 506*

* informações relevantes

Inclua somente frentes com informação relevante.

Depois:

*⚠️ PONTOS DE ATENÇÃO*

* pontos relevantes

*🚨 RISCOS / IMPACTOS*

* impactos sustentados pelos dados

*🎯 AÇÕES / ACOMPANHAMENTOS*

* ações registradas ou recomendações

Use *SUGESTÃO:* para recomendações.

Não invente informações.

DADOS:

${contexto}
`;

```
const resposta =
  await chamarGemini(
    prompt,
    {
      thinking: 'medium',
      maxOutputTokens: 5000,
      timeoutMs: 30000
    }
  );

return res.json({
  texto:
    normalizarPublicacaoIA(
      resposta.texto
    ),

  total:
    ocorrencias.length,

  modelo_usado:
    resposta.modelo_usado
});
```

} catch (error) {
console.error(
'ERRO ORGANIZAR IA:',
error
);

```
return res.status(500).json({
  error:
    error.message
});
```

}
});

app.post(
[
'/resumo-executivo-ia',
'/api/resumo-executivo-ia'
],
async (req, res) => {
try {
const ocorrencias =
await obterOcorrenciasIA(req);

```
  if (!ocorrencias.length) {
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
```

FAÇA O RESUMO EXECUTIVO FINAL DO TURNO DO CTT MANDU.

Este texto será enviado diretamente para a gestão.

NÃO faça relatório.

NÃO descreva todas as ocorrências.

NÃO faça uma versão reduzida do relatório gerencial.

Faça uma síntese para DECISÃO.

Selecione somente aquilo que realmente importa.

PRIORIDADE:

1. criticidade;
2. impacto;
3. frente crítica;
4. decisão ou acompanhamento.

MÁXIMO: 5 tópicos.

ESTRUTURA:

*⚡ RESUMO EXECUTIVO — MANDU*

*CRÍTICO*

* principal ponto crítico
* segundo ponto somente se realmente relevante

*IMPACTO*

* consequência operacional mais importante

*DECISÃO / ATENÇÃO*

* o que exige acompanhamento, ação ou cobrança

Se não houver criticidade:

*CRÍTICO*

* Sem ocorrência crítica identificada no turno.

Não faça introdução.

Não faça conclusão.

Não liste todas as frentes.

Não repita detalhes secundários.

Use *SUGESTÃO:* somente para recomendações.

DADOS:

${contexto}
`;

```
  const resposta =
    await chamarGemini(
      prompt,
      {
        thinking: 'medium',
        maxOutputTokens: 2500,
        timeoutMs: 30000
      }
    );

  const resultado =
    normalizarPublicacaoIA(
      resposta.texto
    );

  return res.json({
    texto: resultado,
    executivo: resultado,
    total: ocorrencias.length,
    modelo_usado:
      resposta.modelo_usado
  });

} catch (error) {
  console.error(
    'ERRO RESUMO EXECUTIVO:',
    error
  );

  return res.status(500).json({
    error:
      error.message
  });
}
```

}
);

app.post(
[
'/fechar-turno',
'/fechar-turno-ia',
'/api/fechar-turno',
'/api/fechar-turno-ia'
],
async (req, res) => {
try {
const ocorrencias =
await obterOcorrenciasIA(req);

```
  if (!ocorrencias.length) {
    return res.status(400).json({
      error:
        'Não existem ocorrências para analisar o turno.'
    });
  }

  const contexto =
    gerarContextoPorFrente(
      ocorrencias
    );

  const promptGerencial = `
```

FAÇA UMA ANÁLISE GERENCIAL COMPLETA DO TURNO DO CTT MANDU.

Aqui você deve ser detalhado.

Não quero apenas um resumo.

Quero análise operacional.

Avalie:

1. concentração dos problemas;
2. frentes mais afetadas;
3. problemas recorrentes;
4. evolução das ocorrências;
5. relações entre ocorrências;
6. impactos operacionais;
7. riscos;
8. prioridades;
9. acompanhamentos;
10. recomendações.

Sempre diferencie:

FATO:
O que foi registrado.

IMPACTO:
Consequência sustentada pelos registros.

ANÁLISE:
Interpretação técnica sustentada pelos dados.

SUGESTÃO:
Recomendação baseada na análise.

ESTRUTURA:

*📋 ANÁLISE GERENCIAL — MANDU*

*VISÃO GERAL DO TURNO*

* leitura analítica da operação

*FRENTES COM OCORRÊNCIAS*

* análise de cada frente relevante
* cruzamento de ocorrências quando houver relação

*PRINCIPAIS PROBLEMAS*

* priorizados por relevância operacional

*PROBLEMAS RECORRENTES*

* somente recorrências reais

*RISCOS / IMPACTOS*

* impactos sustentados pelos dados

*PONTOS DE ATENÇÃO*

* o que precisa continuar sendo acompanhado

*AÇÕES / ACOMPANHAMENTOS*

* ações registradas como realizadas somente quando isso estiver nos dados
* novas recomendações usando *SUGESTÃO:*

SEJA DETALHADO.

Não seja repetitivo.

Não invente.

Não crie causas.

Não crie números.

Não transforme hipótese em fato.

DADOS:

${contexto}
`;

```
  console.log(
    'GERENCIAL - análise profunda'
  );

  const gerencial =
    await chamarGemini(
      promptGerencial,
      {
        thinking: 'high',
        maxOutputTokens: 9000,
        timeoutMs: 45000
      }
    );

  const promptExecutivo = `
```

FAÇA O RESUMO EXECUTIVO FINAL DO TURNO DO CTT MANDU.

Este texto será enviado diretamente para a gestão.

Não faça uma versão reduzida do relatório gerencial.

Faça uma síntese para DECISÃO.

Selecione somente aquilo que realmente importa.

PRIORIDADE:

1. criticidade;
2. impacto;
3. frente crítica;
4. decisão ou acompanhamento.

MÁXIMO: 5 tópicos.

ESTRUTURA:

*⚡ RESUMO EXECUTIVO — MANDU*

*CRÍTICO*

* principal ponto crítico
* outro somente se realmente relevante

*IMPACTO*

* impacto operacional mais importante

*DECISÃO / ATENÇÃO*

* o que exige acompanhamento
* o que exige ação ou cobrança

Não faça introdução.

Não faça conclusão.

Não liste todas as frentes.

Não repita detalhes secundários.

Não transforme recomendação em fato.

Use *SUGESTÃO:* para recomendação.

DADOS:

${contexto}
`;

```
  console.log(
    'EXECUTIVO - síntese para decisão'
  );

  const executivo =
    await chamarGemini(
      promptExecutivo,
      {
        thinking: 'medium',
        maxOutputTokens: 2500,
        timeoutMs: 30000
      }
    );

  const gerencialFinal =
    normalizarPublicacaoIA(
      gerencial.texto
    );

  const executivoFinal =
    normalizarPublicacaoIA(
      executivo.texto
    );

  const frentes =
    new Set(
      ocorrencias
        .map(
          item =>
            item.frente
        )
        .filter(Boolean)
    );

  return res.json({
    gerencial:
      gerencialFinal,

    executivo:
      executivoFinal,

    fechamento: '',

    texto:
      gerencialFinal,

    total:
      ocorrencias.length,

    frentes:
      frentes.size,

    modeloGerencial:
      gerencial.modelo_usado,

    modeloExecutivo:
      executivo.modelo_usado
  });

} catch (error) {
  console.error(
    'ERRO FECHAR TURNO:',
    error
  );

  return res.status(500).json({
    error:
      error.message ||
      'Erro ao gerar análise do turno.'
  });
}
```

}
);

app.post(
[
'/chat-ia',
'/api/chat-ia'
],
async (req, res) => {
try {
const pergunta =
textoSeguro(
req.body?.pergunta,
5000
);

```
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
          .slice(-8)
          .map(item => ({
            role:
              item?.role === 'user'
                ? 'user'
                : 'assistant',

            content:
              textoSeguro(
                item?.content,
                4000
              )
          }))
      : [];

  const historicoTexto =
    historico.length
      ? `
```

HISTÓRICO RECENTE:

${historico
.map(
item =>
`${item.role.toUpperCase()}: ${item.content}`
)
.join('\n')}
`
: '';

```
  const prompt = `
```

CHAT OPERACIONAL DO CTT MANDU.

PERGUNTA:

${pergunta}

DADOS DO TURNO:

${contexto}

${historicoTexto}

REGRAS:

Responda SOMENTE o que foi perguntado.

A resposta deve ter tamanho proporcional à pergunta.

PERGUNTA SIMPLES:
Resposta curta, preferencialmente em 1 a 3 linhas.

PERGUNTA COMPARATIVA:
Mostre somente a comparação solicitada.

PERGUNTA "QUAL FRENTE":
Informe a frente e o motivo objetivo.

PERGUNTA "POR QUÊ":
Explique somente o que os dados sustentam.

PERGUNTA "O QUE FAZER":
Apresente recomendações práticas e priorizadas.

PERGUNTA SOBRE RECORRÊNCIA:
Mostre somente os problemas realmente recorrentes.

PERGUNTA SOBRE PLANO DE VOO:
Apresente ações práticas e priorizadas.

PERGUNTA SOBRE RESUMO:
Entregue um resumo curto e objetivo.

NÃO faça resumo completo do turno se isso não foi solicitado.

NÃO copie todas as ocorrências.

NÃO repita informações.

NÃO faça introdução.

NÃO faça conclusão genérica.

NÃO invente.

Use WhatsApp.

Títulos:
*TÍTULO*

Tópicos:

* informação

Recomendação:
*SUGESTÃO:* ação

Use somente UM asterisco de cada lado.

Nunca use **.

Nunca use ***.

Nunca use blocos de código.

A resposta precisa estar pronta para copiar e mandar no WhatsApp.
`;

```
  const resposta =
    await chamarGemini(
      prompt,
      {
        thinking: 'medium',
        maxOutputTokens: 3500,
        timeoutMs: 30000
      }
    );

  return res.json({
    resposta:
      normalizarPublicacaoIA(
        resposta.texto
      ),

    total:
      ocorrencias.length,

    modelo_usado:
      resposta.modelo_usado
  });

} catch (error) {
  console.error(
    'ERRO CHAT IA:',
    error
  );

  return res.status(500).json({
    error:
      error.message ||
      'Erro no chat operacional.'
  });
}
```

}
);

app.post('/api/chat', async (req, res) => {
try {
const prompt =
textoSeguro(
req.body?.prompt,
12000
);

```
if (!prompt) {
  return res.status(400).json({
    error:
      'prompt vazio'
  });
}

const resposta =
  await chamarGemini(
    prompt,
    {
      thinking: 'medium',
      maxOutputTokens: 3500,
      timeoutMs: 30000
    }
  );

return res.json({
  resposta:
    normalizarPublicacaoIA(
      resposta.texto
    ),

  modelo_usado:
    resposta.modelo_usado
});
```

} catch (error) {
console.error(
'ERRO /api/chat:',
error
);

```
return res.status(503).json({
  error:
    error.message
});
```

}
});

app.use('/api', (req, res) => {
console.error(
'API 404:',
req.method,
req.originalUrl
);

res.status(404).json({
error:
'Rota da API não encontrada.',

```
rota:
  req.originalUrl
```

});
});

app.use((req, res) => {
console.error(
'404:',
req.method,
req.originalUrl
);

res.status(404).send(
'Página não encontrada.'
);
});

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

```
if (res.headersSent) {
  return next(error);
}

res.status(500).json({
  error:
    error?.message ||
    'Erro interno do servidor.'
});
```

}
);

app.listen(
PORT,
() => {
console.log(
'======================================'
);

```
console.log(
  'CTT DIÁRIO DE TURNO — MANDU'
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
    GEMINI_KEY
      ? 'OK'
      : 'NÃO CONFIGURADO'
  }`
);

console.log(
  'Modelos Gemini:'
);

MODELS.forEach(
  modelo =>
    console.log(
      ` - ${modelo}`
    )
);

console.log(
  'Raciocínio: ATIVADO'
);

console.log(
  'Gerencial: HIGH'
);

console.log(
  'Executivo: MEDIUM'
);

console.log(
  'Chat: MEDIUM'
);

console.log(
  '======================================'
);
```

}
);
