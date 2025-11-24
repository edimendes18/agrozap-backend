const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const { GoogleGenerativeAI } = require("@google/generative-ai");
require('dotenv').config();

const app = express();
app.use(bodyParser.json());

// --- PEGAR AS CHAVES DO AMBIENTE ---
// Porta: o Railway define a porta automaticamente na variável PORT.
// Se rodar localmente, usa a porta 8080.
const PORT = process.env.PORT || 8080;

// As variáveis de ambiente podem ter nomes diferentes dependendo de como foram configuradas.
// Aqui verificamos ambas as possibilidades (inglês ou português) para garantir que funcione.
const VERIFY_TOKEN =
  process.env.VERIFY_TOKEN || process.env.VERIFICAR_TOKEN;

const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN; // Token de acesso do WhatsApp

// ID do número de telefone: Pode ser PHONE_NUMBER_ID ou ID_DO_NUMERO_DE_TELEFONE
const PHONE_NUMBER_ID =
  process.env.PHONE_NUMBER_ID || process.env.ID_DO_NUMERO_DE_TELEFONE;

// Chave da API do Google: Pode ser GOOGLE_API_KEY ou CHAVE_API_DO_GOOGLE
const GOOGLE_API_KEY =
  process.env.GOOGLE_API_KEY || process.env.CHAVE_API_DO_GOOGLE;

// --- LOGS PARA DEBUG (DEPURAÇÃO) ---
// Isso ajuda a ver no console do Railway se as chaves foram carregadas corretamente.
// !! converte o valor para booleano (true se existe, false se não existe).
// Assim, não expomos as senhas nos logs, apenas confirmamos se elas estão lá.
console.log("Configuração carregada:");
console.log(" - PORTA:", PORT);
console.log(" - VERIFY_TOKEN:", !!VERIFY_TOKEN); // Deve ser true
console.log(" - WHATSAPP_TOKEN:", !!WHATSAPP_TOKEN); // Deve ser true
console.log(" - PHONE_NUMBER_ID:", !!PHONE_NUMBER_ID); // Deve ser true
console.log(" - GOOGLE_API_KEY:", !!GOOGLE_API_KEY); // Deve ser true

// --- CONFIGURAR A IA DO GOOGLE ---
// Inicializa a IA com a chave da API.
// Se a chave não existir, usa uma string vazia (o que causará erro na função perguntarParaIA, mas evita crash na inicialização).
const genAI = new GoogleGenerativeAI(GOOGLE_API_KEY || "chave_faltando");

// Define o modelo a ser usado. 'gemini-1.5-flash' é rápido e eficiente.
// Se der erro 404 (modelo não encontrado), tente mudar para 'gemini-pro'.
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// --- FUNÇÃO QUE PENSA (IA) ---
// Recebe o texto do usuário e envia para o Gemini.
async function perguntarParaIA(textoUsuario) {
  // Verifica se a chave da API está configurada.
  if (!GOOGLE_API_KEY) {
    return "⚠️ Erro: Falta a chave do Google no Railway (CHAVE_API_DO_GOOGLE ou GOOGLE_API_KEY).";
  }

  try {
    // Define o comportamento do assistente (prompt do sistema).
    const prompt = `
      Você é o AgroZap, um assistente agronômico especialista em Café.
      Responda de forma curta, técnica mas amigável (use emojis).
      Se a pergunta não for sobre café ou agronomia, responda educadamente que só entende de café.
      Pergunta do produtor: "${textoUsuario}"
    `;
    
    // Gera a resposta usando o modelo.
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const texto = response.text();

    // Verifica se a resposta veio vazia.
    if (!texto || !texto.trim()) {
      return "Companheiro, não consegui montar uma resposta agora. Tenta reformular a pergunta 😊";
    }

    return texto;
  } catch (error) {
    // Loga o erro detalhado no console para facilitar a correção.
    console.error("Erro na IA:", {
      message: error.message,
      stack: error.stack
    });
    return "Companheiro, minha inteligência travou momentaneamente. Tente de novo em alguns segundos.";
  }
}

// --- ROTA DA PORTA DA FRENTE (Health Check) ---
// Rota raiz para verificar se o servidor está rodando.
// Importante para plataformas como Railway e Render saberem que o app está saudável.
app.get('/', (req, res) => {
  res.send('<h1>🌱 AgroZap (Flash) está VIVO!</h1><p>Servidor rodando corretamente.</p>');
});

// --- ROTA DE VERIFICAÇÃO DO WHATSAPP (Webhook Verification) ---
// O Facebook chama essa rota para confirmar que o webhook é seu.
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  // Verifica se o token enviado pelo Facebook bate com o seu VERIFY_TOKEN.
  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log("✅ Conexão do Webhook verificada com sucesso!");
    res.status(200).send(challenge);
  } else {
    console.error("❌ Falha na verificação do Webhook. Token incorreto.");
    res.sendStatus(403); // Forbidden (Proibido)
  }
});

// --- ROTA DE RECEBIMENTO DE MENSAGENS (Webhook Event) ---
// O Facebook envia as mensagens recebidas para essa rota via POST.
app.post('/webhook', async (req, res) => {
  const body = req.body;

  // Verifica se é um evento vindo de um objeto 'page' ou 'whatsapp_business_account' (aqui geralmente vem como 'whatsapp_business_account', mas verificamos a estrutura).
  if (body.object) {
    // Navega pela estrutura complexa do JSON do WhatsApp para achar a mensagem.
    if (
      body.entry &&
      body.entry[0].changes &&
      body.entry[0].changes[0].value.messages &&
      body.entry[0].changes[0].value.messages[0]
    ) {
      const message = body.entry[0].changes[0].value.messages[0];
      const from = message.from; // Número de quem enviou a mensagem
      const type = message.type; // Tipo da mensagem (text, audio, image, etc.)

      console.log(`📩 Mensagem recebida de ${from}. Tipo: ${type}`);

      // Tenta marcar a mensagem como lida (check azul).
      // Usamos .catch() para que, se falhar (ex: token expirado), não trave o resto do robô.
      markAsRead(message.id).catch((e) => console.log("Aviso: Não foi possível marcar como lida."));

      let resposta = "";

      // Processa apenas mensagens de texto por enquanto.
      if (type === 'text') {
        const texto = message.text.body;
        console.log(`   Conteúdo: "${texto}"`);
        
        // Envia o texto para a IA e aguarda a resposta.
        resposta = await perguntarParaIA(texto);
      } 
      // Se for áudio (futuramente você pode implementar transcrição).
      else if (type === 'audio') {
        resposta = "🎙️ Recebi seu áudio! (Ainda estou aprendendo a ouvir, por enquanto só leio texto).";
      }
      // Outros tipos (imagem, vídeo, localização, etc.).
      else {
        resposta = "Por enquanto só entendo texto, companheiro! Mande sua dúvida escrita.";
      }

      // Envia a resposta de volta para o usuário no WhatsApp.
      await sendWhatsAppMessage(from, resposta);
    }
    // Retorna 200 OK para o Facebook saber que recebemos a notificação.
    res.sendStatus(200);
  } else {
    // Se não for um evento conhecido, retorna 404.
    res.sendStatus(404);
  }
});

// --- FUNÇÃO PARA ENVIAR MENSAGEM NO WHATSAPP ---
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
          'Content-Type': 'application/json'
        }
      }
    );
    console.log(`📤 Resposta enviada para ${to}`);
  } catch (err) {
    // Log detalhado do erro para facilitar a identificação (ex: token expirado, número não autorizado).
    console.error('❌ ERRO AO ENVIAR ZAP:', err.response ? err.response.data : err.message);
  }
}

// --- FUNÇÃO PARA MARCAR MENSAGEM COMO LIDA ---
async function markAsRead(id) {
  await axios.post(
    `https://graph.facebook.com/v17.0/${PHONE_NUMBER_ID}/messages`,
    {
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: id,
    },
    { 
      headers: { 'Authorization': `Bearer ${WHATSAPP_TOKEN}` } 
    }
  );
}

// --- INICIAR O SERVIDOR ---
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 AgroZap rodando na porta ${PORT}`);
});
