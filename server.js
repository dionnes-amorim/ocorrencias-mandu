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

// Inicializa o SDK Oficial do Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// Configuração de upload de áudios temporários
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, `audio_${Date.now()}${path.extname(file.originalname) || '.webm'}`);
  }
});

const upload = multer({ storage });

// Persistência local em JSON
const DATA_FILE = path.join(__dirname, 'ocorrencias.json');

function getOcorrencias() {
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify([]));
  }
  const data = fs.readFileSync(DATA_FILE, 'utf-8');
  return JSON.parse(data || '[]');
}

function saveOcorrencias(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// REST API Endpoints

// 1. Listar Ocorrências
app.get('/api/ocorrencias', (req, res) => {
  const ocorrencias = getOcorrencias();
  res.json(ocorrencias);
});

// 2. Processar Áudio com Gemini IA
app.post('/api/transcribe-occurrences', upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Nenhum arquivo de áudio foi enviado.' });
    }

    const audioPath = req.file.path;
    const audioBuffer = fs.readFileSync(audioPath);
    const base64Audio = audioBuffer.toString('base64');

    const prompt = `Analise este áudio contendo a narração ou descrição de uma ocorrência. 
    Extraia e retorne EXCLUSIVAMENTE um objeto JSON válido no seguinte formato sem marcações de markdown adicionais:
    {
      "titulo": "Título resumo da ocorrência",
      "descricao": "Transcrição e descrição detalhada do relato do áudio",
      "local": "Local citado ou N/A se não mencionado",
      "dataHora": "Data e hora citada ou a data/hora atual se não informada",
      "gravidade": "Alta" | "Média" | "Baixa"
    }`;

    // Obter o modelo e gerar resposta multimodal
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const result = await model.generateContent([
      prompt,
      {
        inlineData: {
          mimeType: req.file.mimetype || 'audio/webm',
          data: base64Audio
        }
      }
    ]);

    const response = await result.response;
    let textResponse = response.text() || '';
    textResponse = textResponse.replace(/```json/g, '').replace(/```/g, '').trim();

    let extractedData;
    try {
      extractedData = JSON.parse(textResponse);
    } catch (e) {
      extractedData = {
        titulo: "Ocorrência Gravada",
        descricao: textResponse || "Não foi possível estruturar o texto do áudio.",
        local: "Não identificado",
        dataHora: new Date().toLocaleString('pt-BR'),
        gravidade: "Média"
      };
    }

    const newOcorrencia = {
      id: Date.now().toString(),
      ...extractedData,
      createdAt: new Date().toISOString()
    };

    const list = getOcorrencias();
    list.unshift(newOcorrencia);
    saveOcorrencias(list);

    // Limpa o arquivo temporário
    fs.unlink(audioPath, () => {});

    res.json({ success: true, item: newOcorrencia });

  } catch (error) {
    console.error('Erro no processamento da IA:', error);
    res.status(500).json({ error: 'Falha ao processar o áudio com a IA.', details: error.message });
  }
});

// 3. Editar Ocorrência
app.put('/api/ocorrencias/:id', (req, res) => {
  const { id } = req.params;
  const updatedData = req.body;
  
  let list = getOcorrencias();
  const index = list.findIndex(item => item.id === id);

  if (index === -1) {
    return res.status(404).json({ error: 'Ocorrência não encontrada.' });
  }

  list[index] = { ...list[index], ...updatedData };
  saveOcorrencias(list);

  res.json({ success: true, item: list[index] });
});

// 4. Excluir Ocorrência
app.delete('/api/ocorrencias/:id', (req, res) => {
  const { id } = req.params;
  let list = getOcorrencias();
  list = list.filter(item => item.id !== id);
  saveOcorrencias(list);

  res.json({ success: true });
});

app.listen(port, () => {
  console.log(`Servidor rodando em http://localhost:${port}`);
});
