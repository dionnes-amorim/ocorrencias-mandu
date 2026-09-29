import express from 'express';
import multer from 'multer';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenerativeAI } from '@google/generative-ai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;

const genAI = process.env.GEMINI_API_KEY ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY) : null;

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => cb(null, `rec_${Date.now()}.webm`)
});
const upload = multer({ storage });

const DATA_FILE = path.join(__dirname, 'ocorrencias.json');

function getOcorrencias() {
  if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, '[]');
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8') || '[]');
}

function saveOcorrencias(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// 1. Obter Ocorrências
app.get('/api/ocorrencias', (req, res) => {
  res.json(getOcorrencias());
});

// 2. Registrar Áudio Direto (Sem IA no Upload Simples)
app.post('/api/ocorrencias/audio', upload.single('audio'), (req, res) => {
  try {
    const newOcorrencia = {
      id: Date.now().toString(),
      titulo: 'Nova Ocorrência Gravada',
      descricao: 'Registro gravado por áudio.',
      local: 'Não especificado',
      dataHora: new Date().toLocaleString('pt-BR'),
      gravidade: 'Pendente',
      createdAt: new Date().toISOString()
    };

    const list = getOcorrencias();
    list.unshift(newOcorrencia);
    saveOcorrencias(list);

    if (req.file) fs.unlink(req.file.path, () => {});

    res.json({ success: true, item: newOcorrencia });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3. Organizar Ocorrência via Inteligência Artificial (Botão "Organizar")
app.post('/api/organizar-ia', async (req, res) => {
  try {
    const { texto } = req.body;

    if (!genAI) {
      return res.status(500).json({ success: false, error: "GEMINI_API_KEY não configurada no servidor." });
    }

    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const prompt = `Analise o seguinte relato de ocorrência e retorne EXCLUSIVAMENTE um JSON sem markdown:
    {
      "titulo": "Resumo curto",
      "local": "Local extraído ou N/A",
      "gravidade": "Baixa" | "Média" | "Alta"
    }
    Texto: "${texto}"`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    let rawText = response.text().replace(/```json/g, '').replace(/```/g, '').trim();

    const parsedData = JSON.parse(rawText);
    res.json({ success: true, data: parsedData });

  } catch (error) {
    console.error("Erro no Gemini:", error);
    res.status(500).json({ success: false, error: "Falha ao processar com a IA." });
  }
});

// 4. Editar Ocorrência
app.put('/api/ocorrencias/:id', (req, res) => {
  let list = getOcorrencias();
  const index = list.findIndex(i => i.id === req.params.id);
  if (index !== -1) {
    list[index] = { ...list[index], ...req.body };
    saveOcorrencias(list);
    return res.json({ success: true });
  }
  res.status(404).json({ error: "Item não encontrado." });
});

// 5. Excluir Ocorrência
app.delete('/api/ocorrencias/:id', (req, res) => {
  let list = getOcorrencias();
  list = list.filter(i => i.id !== req.params.id);
  saveOcorrencias(list);
  res.json({ success: true });
});

app.listen(port, () => console.log(`Rodando na porta ${port}`));
