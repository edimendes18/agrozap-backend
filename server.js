// server.js
// ---------------- AGROZAP BACKEND + GEMINI 1.5 FLASH ----------------

const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const { GoogleGenerativeAI } = require("@google/generative-ai");
require('dotenv').config();

const app = express();
app.use(bodyParser.json());

// ---------------- VARIÁVEIS DE AMBIENTE ----------------
const PORT = process.env.PORT || 3000;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;

// ---------------- CONFIG GEMINI ----------------
if (!GOOGLE_API_KEY) {
  console.error("⚠️ Falta GOOGLE_API_KEY no .env / Railway");
}

const genAI = new GoogleGenerativeAI(GOOGLE_API_KEY || "chave_faltando");

// modelo padrão (novo e rápido)
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// ---------------- FUNÇÃO DE IA ----------------
async function perguntarParaIA(textoUsuario) {
  if (!GOOGLE_API_KEY) {
    return "⚠️ Erro: Falta a chave do Google no Railway.";
  }

  try {
    const prompt = `
      Você é o AgroZap, um agrônomo virtual especialista em Café.
      Responda de forma curta, técnica mas amigável (use emojis).
      Se perguntarem de veneno, diga que não pode receitar e mande procurar um agrônomo.
      Pergunta do produtor: "${textoUsuario}"
    `;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    if (!text || text.trim() === "") {
      return "Companheiro, não consegui formular uma resposta agora. Tenta reformular a pergunta 😊";
    }

    return text;

  } catch (error) {
    console.error("Erro na IA:", {
      name: error.name,
      message: error.message,
      status: error.status,
      cause: error.cause,
    });

    return "Companheiro, tive um problema técnico momentâneo com a IA. Tente perguntar de novo em alguns segundos. 🤖⚙️";
  }
}

// ---------------- ROTA RAIZ (TESTE RÁPIDO) ----------------
app.get('/', (req, res) => {
  res.send('<h1>🌱 AgroZap com Gemini 1.5 Flash está rodando!</h1>');
});

// ---------------- WEBHOOK GET (VERIFICAÇÃO WHATSAPP) ----------------
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log("✅ Webhook do WhatsApp verificado com sucesso!");
    res.status(200).send(challenge);
  } else {
    console.log("❌ Falha na verificação do webhook.");
    res.sendStatus(403);
  }
});

// ---------------- WEBHOOK POST (RECEBE MENSAGENS) ----------------
app.post('/webhook', async (req, res) => {
  const body = req.body;

  if (body.object) {
    try {
      const changes = body.entry?.[0]?.changes?.[0]?.value;
      const messages = changes?.messages;

      if (messages && messages[0]) {
        const message = messages[0];
        const from = message.from;
        const type = message.type;

        // marca como lido (não trava se der erro)
        markAsRead(message.id).catch(e => console.log("Erro ao marcar como lido:", e.message));

        let resposta = "";

        if (type === 'text') {
          const texto = message.text.body;
          console.log(`📩 Mensagem recebida de ${from}: ${texto}`);
          resposta = await perguntarParaIA(texto);
        } else if (type === 'audio') {
          resposta = "🎙️ Recebi seu áudio! (Nesta versão o áudio ainda não está ativado).";
        } else {
          resposta = "Por enquanto só entendo texto, companheiro! ✍️";
        }

        await sendWhatsAppMessage(from, resposta);
      }

      res.sendStatus(200);
    } catch (err) {
      console.error("Erro ao processar webhook:", err);
      res.sendStatus(500);
    }
  } else {
    res.sendStatus(404);
  }
});

// ---------------- FUNÇÃO PARA ENVIAR MENSAGEM NO WHATSAPP ----------------
async function sendWhatsAppMessage(to, text) {
  try {
    await axios.post(
      `https://graph.facebook.com/v17.0/${PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: 'whatsapp',
        to: to,
        text: { body: text },
      },
      {
        headers: {
          'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
          'Content-Type': 'application/json',
        },
      }
    );
    console.log(`✅ Resposta enviada para ${to}`);
  } catch (err) {
    console.error(
      'Erro ao enviar zap (Status 400):',
      err.response ? JSON.stringify(err.response.data) : err.message
    );
  }
}

// ---------------- FUNÇÃO PARA MARCAR MENSAGEM COMO LIDA ----------------
async function markAsRead(id) {
  try {
    await axios.post(
      `https://graph.facebook.com/v17.0/${PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: 'whatsapp',
        status: 'read',
        message_id: id,
      },
      {
        headers: {
          'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
          'Content-Type': 'application/json',
        },
      }
    );
  } catch (err) {
    console.error('Erro ao marcar como lido:', err.response ? err.response.data : err.message);
  }
}

// ---------------- INICIAR SERVIDOR ----------------
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚜 AgroZap rodando na porta ${PORT}`);
});
