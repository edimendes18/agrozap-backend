const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const { GoogleGenerativeAI } = require("@google/generative-ai");
require('dotenv').config();

const app = express();
app.use(bodyParser.json());

// --- PEGAR AS CHAVES DO AMBIENTE ---
const PORT = process.env.PORT || 3000;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;

// Configurar a Inteligência do Google
// MUDANÇA CRÍTICA: Usando 'gemini-1.5-flash' que é o padrão atual
const genAI = new GoogleGenerativeAI(GOOGLE_API_KEY || "chave_faltando");
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash"});

// --- FUNÇÃO QUE PENSA (IA) ---
async function perguntarParaIA(textoUsuario) {
  if (!GOOGLE_API_KEY) return "⚠️ Erro: Falta a chave do Google no Railway.";

  try {
    const prompt = `
      Você é o AgroZap, um assistente agronômico especialista em Café.
      Responda de forma curta, técnica mas amigável (use emojis).
      Pergunta do produtor: "${textoUsuario}"
    `;
    
    const result = await model.generateContent(prompt);
    const response = await result.response;
    return response.text();
  } catch (error) {
    console.error("Erro na IA:", error);
    return "Companheiro, minha inteligência travou momentaneamente. Tente de novo em alguns segundos.";
  }
}

// --- ROTA DA PORTA DA FRENTE ---
app.get('/', (req, res) => {
  res.send('<h1>🌱 AgroZap (Flash) está VIVO!</h1>');
});

// --- ROTA DE VERIFICAÇÃO DO WHATSAPP ---
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log("✅ Conexão verificada!");
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// --- ROTA DE MENSAGENS ---
app.post('/webhook', async (req, res) => {
  const body = req.body;

  if (body.object) {
    if (body.entry && body.entry[0].changes && body.entry[0].changes[0].value.messages) {
      const message = body.entry[0].changes[0].value.messages[0];
      const from = message.from; // Quem mandou
      
      // Ignora mensagens de status (leitura/entrega) para não dar erro
      if (!message.text && !message.audio) {
        res.sendStatus(200);
        return;
      }

      // Marca como lido sem travar
      markAsRead(message.id).catch(() => {});

      let resposta = "";

      if (message.type === 'text') {
        const texto = message.text.body;
        console.log(`Mensagem recebida de ${from}: ${texto}`);
        resposta = await perguntarParaIA(texto);
      } 
      else {
        resposta = "Por enquanto só entendo texto, companheiro!";
      }

      await sendWhatsAppMessage(from, resposta);
    }
    res.sendStatus(200);
  } else {
    res.sendStatus(404);
  }
});

// --- FUNÇÕES DE ENVIO ---
async function sendWhatsAppMessage(to, text) {
  try {
    await axios.post(`https://graph.facebook.com/v17.0/${PHONE_NUMBER_ID}/messages`, {
      messaging_product: 'whatsapp',
      to: to,
      text: { body: text },
    }, {
      headers: { 
        'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });
  } catch (err) {
    // Se der erro de número bloqueado, vai aparecer aqui no log
    console.error('ERRO ZAP (Provavelmente número não autorizado):', err.response ? err.response.data : err.message);
  }
}

async function markAsRead(id) {
  await axios.post(`https://graph.facebook.com/v17.0/${PHONE_NUMBER_ID}/messages`, {
    messaging_product: 'whatsapp', status: 'read', message_id: id,
  }, { headers: { 'Authorization': `Bearer ${WHATSAPP_TOKEN}` } });
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`AgroZap rodando na porta ${PORT}`);
});
