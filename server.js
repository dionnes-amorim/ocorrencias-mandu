import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import OpenAI from 'openai';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// Permite requisições do seu front-end (evita erro de CORS)
app.use(cors());
app.use(express.json());

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Rota para verificação de status
app.get('/', (req, res) => {
  res.send('Servidor do Diário de Turno MANDU está rodando perfeitamente!');
});

// Rota POST exatamente na raiz solicitada pelo front-end (/organizar-ia)
app.post('/organizar-ia', async (req, res) => {
  try {
    const { ocorrencias } = req.body;

    if (!ocorrencias || !Array.isArray(ocorrencias) || ocorrencias.length === 0) {
      return res.status(400).json({ texto: 'Nenhuma ocorrência foi enviada para organização.' });
    }

    const prompt = `Você é um assistente encarregado de organizar o Diário de Turno da Usina MANDU.
Abaixo está uma lista de ocorrências registradas ao longo do turno.

Sua tarefa:
1. Agrupar as ocorrências por FRENTE DE TRABALHO (ex: FRENTE 501, FRENTE 502, GERAL, etc.).
2. Ordenar cronologicamente o horário das ocorrências em cada frente.
3. Resumir e formatar o texto de forma limpa, profissional e legível para repasse de turno no WhatsApp.

Ocorrências recebidas:
${JSON.stringify(ocorrencias, null, 2)}`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
    });

    const textoOrganizado = response.choices[0].message.content;
    return res.json({ texto: textoOrganizado });

  } catch (error) {
    console.error('Erro na IA:', error);
    return res.status(500).json({ 
      texto: 'Erro ao processar resumo com a IA: ' + (error.message || 'Erro desconhecido no servidor.') 
    });
  }
});

app.listen(port, () => {
  console.log(`Servidor rodando na porta ${port}`);
});
