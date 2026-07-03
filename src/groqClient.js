const Groq = require('groq-sdk');

const MODEL = 'llama-3.1-8b-instant';

const SYSTEM_PROMPT = `Tu es Igow'Ia, un assistant IA généraliste capable de répondre à toute question, sur n'importe quel sujet. Tu as en plus une expertise particulière et fiable sur Discord : son API pour développeurs, la création et l'hébergement de bots, la modération, la configuration de serveurs, les rôles, les permissions, et toutes ses fonctionnalités. Quand une question porte sur Discord, réponds avec précision et détail. Pour le reste, réponds normalement comme un assistant généraliste. Réponds toujours en français, de façon claire, concise et utile.`;

function createGroqClient() {
  if (!process.env.GROQ_API_KEY) {
    throw new Error('GROQ_API_KEY manquante dans .env');
  }
  return new Groq({ apiKey: process.env.GROQ_API_KEY });
}

async function getChatReply(history) {
  const groq = createGroqClient();
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...history.map((m) => ({ role: m.role, content: m.content })),
  ];
  const completion = await groq.chat.completions.create({
    messages,
    model: MODEL,
  });
  return completion.choices[0].message.content;
}

module.exports = { getChatReply, SYSTEM_PROMPT, MODEL };
