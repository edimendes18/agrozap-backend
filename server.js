/**
 * AGROZAP CAFE - VERSAO INICIANTE (GOOGLE GEMINI)
 */

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

// Configurar a Inteligencia do Google
const genAI = new GoogleGenerativeAI(GOOGLE_API_KEY || "chave_faltando");
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash"});

// --- FUNCAO QUE PENSA (IA) ---
async function perguntarParaIA(textoUsuario) {
  if (!GOOGLE_API_KEY) return "Erro: Falta a chave do Google no Railway.";

  try {
    const prompt = `
      Voce é o AgroZap, um agronomo virtual especialista em Cafe.
      Responda de forma curta, tecnica mas amigavel.
      Se perguntarem de veneno, diga que nao pode receitar e mande procurar um agronomo.
      Pergunta do produtor: "${textoUsuario}"
    `;
    
    const result = await model.generateContent(prompt);
    const response = await result.response;
    return response.text();
  } catch (error) {
    console.error("Erro na IA:", error);
    return "Desculpe companheiro, minha inteligencia travou momentaneamente.";
  }
}

// --- ROTA DE VERIFICACAO ---
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log("Conexao verificada!");
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
      const from = message.from;
      const type = message.type;

      await markAsRead(message.id);

      let resposta = "";

      if (type === 'text') {
        const texto = message.text.body;
        console.log(`Mensagem recebida de ${from}: ${texto}`);
        resposta = await perguntarParaIA(texto);
      } 
      else if (type === 'audio') {
        resposta = "Recebi seu audio! (Nesta versao de teste eu ainda nao transcrevo, mas sei que voce mandou audio).";
      }
      else {
        resposta = "Por enquanto so entendo texto, companheiro!";
      }

      await sendWhatsAppMessage(from, resposta);
    }
    res.sendStatus(200);
  } else {
    res.sendStatus(404);
  }
});

// --- FUNCOES DE ENVIO ---
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
    console.error('Erro ao enviar zap:', err.message);
  }
}

async function markAsRead(id) {
  try {
    await axios.post(`https://graph.facebook.com/v17.0/${PHONE_NUMBER_ID}/messages`, {
      messaging_product: 'whatsapp', status: 'read', message_id: id,
    }, { headers: { 'Authorization': `Bearer ${WHATSAPP_TOKEN}` } });
  } catch (e) {}
}

app.listen(PORT, () => console.log(`AgroZap rodando na porta ${PORT}`));
