import express from 'express';
import dotenv from 'dotenv';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const app = express();
app.use(express.json());
app.use(express.static('.'));

// Inicialização das APIs
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Rota para listar ocorrências
app.get('/api/ocorrencias', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('ocorrencias')
      .select('*')
      .order('criado_em', { ascending: false });

    if (error) throw error;
    return res.json(data);
  } catch (err) {
    console.error('Erro ao buscar ocorrências:', err);
    return res.status(500).json({ error: 'Erro ao carregar ocorrências.' });
  }
});

// Rota para processar o relato com Gemini e salvar no Supabase
app.post('/api/ocorrencias', async (req, res) => {
  try {
    const { textoOriginal } = req.body;

    if (!textoOriginal) {
      return res.status(400).json({ error: 'Texto não fornecido.' });
    }

    // Processamento do texto com o Gemini
    const prompt = `Organize e formate o seguinte relato de ocorrência de forma clara, profissional e estruturada:\n\n${textoOriginal}`;
    const result = await model.generateContent(prompt);
    const textoOrganizado = result.response.text();

    // Salva a ocorrência no Supabase
    const { data, error } = await supabase
      .from('ocorrencias')
      .insert([{ relatorio: textoOrganizado }])
      .select();

    if (error) throw error;

    return res.status(201).json({ success: true, data: data[0] });
  } catch (err) {
    console.error('Erro no processamento:', err);
    return res.status(500).json({ error: 'Falha ao processar ocorrência.' });
  }
});

// Rota para exclusão
app.delete('/api/ocorrencias/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { error } = await supabase.from('ocorrencias').delete().eq('id', id);

    if (error) throw error;

    return res.json({ success: true, id });
  } catch (err) {
    console.error('Erro ao excluir:', err);
    return res.status(500).json({ error: 'Erro ao excluir a ocorrência.' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor a rodar na porta ${PORT}`);
});
