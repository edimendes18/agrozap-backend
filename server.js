const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const { GoogleGenerativeAI } = require("@google/generative-ai");
require('dotenv').config();

const app = express();
app.use(bodyParser.json());

// --- PEGAR AS CHAVES DO AMBIENTE ---
// Porta: se o Railway mandar uma, usa; senão usa 8080 localmente
const PORT = process.env.PORT || 8080;

// Aceita tanto nomes em inglês quanto em português (como estão no Railway)
const VERIFY_TOKEN =
  process.env.VERIFY_TOKEN || process.env.VERIFICAR_TOKEN;

const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN; // já está igual

const PHONE_NUMBER_ID =
  process.env.PHONE_NUMBER_ID || process.env.ID_DO_NUMERO_DE_TELEFONE;

const GOOGLE_API_KEY =
  process.env.GOOGLE_API_KEY || process.env.CHAVE_API_DO_GOOGLE;

// Logs simples pra ajudar debug (não mostram o valor, só se existe)
console.log("Configuração carregada:");
console.log(" - VERIFY_TOKEN:", !!VERIFY_TOKEN);
console.log(" - WHATSAPP_TOKEN:", !!WHATSAPP_TOKEN);
console.log(" - PHONE_NUMBER_ID:", !!PHONE_NUMBER_ID);
console.log(" - GOOGLE_API_KEY:", !!GOOGLE_API_KEY);

// --- CONFIGURAR A IA DO GOOGLE ---
// Usando 'gemini-1.5-flash' (modelo rápido). Se der 404 depois, teste "gemini-1.0-pro".
const genAI = new GoogleGenerativeAI(GOOGLE_API_KEY || "chave_faltando");
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// --- FUNÇÃO QUE PENSA (IA) ---
async function perguntarParaIA(textoUsuario) {
  if (!GOOGLE_API_KEY) {
    return "⚠️ Erro: Falta a chave do Google no Railway (CHAVE_API_DO_GOOGLE).";
  }

  try {
    const prompt = `
      Você é o AgroZap, um assistente agronômico especialista em Café.
      Responda de forma curta, técnica mas amigável (use emojis).
      Pergunta do produtor: "${textoUsuario}"
    `;
    
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const texto = response.text();

    if (!texto || !texto.trim()) {
      return "Companheiro, não consegui montar uma resposta agora. Tenta reformular a pergunta 😊";
    }

    return texto;
  } catch (error) {
    console.error("Erro na IA:", {
      name: e
