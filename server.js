import express from 'express';
import dotenv from 'dotenv';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const app = express();
app.use(express.json());
app.use(express.static('.'));

// Inicialização das APIs
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_ANON_KEY || '';
const geminiApiKey = process.env.GEMINI_API_KEY || '';

const supabase = createClient(supabaseUrl, supabaseKey);
const genAI = new GoogleGenerativeAI(geminiApiKey);
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

// 1. Rota GET: Buscar todas as ocorrências
app.get('/api/ocorrencias', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('ocorrencias')
      .select('*')
      .order('criado_em', { ascending: false });

    if (error) throw error;
    return res.json(data || []);
  } catch (err) {
    console.error('Erro ao buscar ocorrências:', err);
    return res.status(500).json({ error: 'Erro ao carregar ocorrências.' });
  }
});

// 2. Rota POST: Organizar texto com Gemini e Salvar no Supabase
app.post('/api/ocorrencias', async (req, res) => {
  try {
    const { textoOriginal, titulo } = req.body;

    if (!textoOriginal) {
      return res.status(400).json({ error: 'O relato é obrigatório.' });
    }

    // Formata o relato usando a IA (Gemini)
    let relatoFormatado = textoOriginal;
    try {
      const prompt = `Organize e formate o seguinte relato de ocorrência em um texto formal, profissional e bem estruturado:\n\n${textoOriginal}`;
      const result = await model.generateContent(prompt);
      relatoFormatado = result.response.text();
    } catch (aiErr) {
      console.warn('Aviso: IA indisponível, salvando texto original.', aiErr);
    }

    // Salva no Supabase
    const { data, error } = await supabase
      .from('ocorrencias')
      .insert([
        {
          titulo: titulo || 'Ocorrência',
          relatorio: relatoFormatado,
          criado_em: new Date()
        }
      ])
      .select();

    if (error) throw error;

    return res.status(201).json({ success: true, data: data[0] });
  } catch (err) {
    console.error('Erro ao salvar ocorrência:', err);
    return res.status(500).json({ error: 'Erro interno ao salvar.' });
  }
});

// 3. Rota DELETE: Excluir ocorrência do Supabase
app.delete('/api/ocorrencias/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { error } = await supabase.from('ocorrencias').delete().eq('id', id);

    if (error) throw error;

    return res.json({ success: true, id });
  } catch (err) {
    console.error('Erro ao excluir:', err);
    return res.status(500).json({ error: 'Erro ao excluir ocorrência.' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
