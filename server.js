import express from 'express';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const app = express();
app.use(express.json());
app.use(express.static('.'));

// Inicialização das APIs
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Rota para processar o texto/áudio gravado com o Gemini e salvar no Supabase
app.post('/api/ocorrencias', async (req, res) => {
  try {
    const { textoOriginal } = req.body;

    if (!textoOriginal) {
      return res.status(400).json({ error: 'Texto não fornecido.' });
    }

    // Processamento do texto com a IA (Gemini) para organização
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `Organize e formate o seguinte relato de ocorrência de forma clara, profissional e estruturada (mantenha os fatos principais):\n\n${textoOriginal}`,
    });

    const textoOrganizado = response.text;

    // Salva a ocorrência processada no Supabase
    const { data, error } = await supabase
      .from('ocorrencias')
      .insert([{ relatorio: textoOrganizado, criado_em: new Date() }])
      .select();

    if (error) throw error;

    return res.status(201).json({ success: true, data: data[0] });
  } catch (err) {
    console.error('Erro no processamento:', err);
    return res.status(500).json({ error: 'Falha ao processar ocorrência.' });
  }
});

// Rota para exclusão no Supabase
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
  console.log(`Servidor rodando na porta ${PORT}`);
});
