const OpenAI = require('openai');
const logger = require('../utils/logger');
const { searchSimilarChunks } = require('./embeddingService');

const SMALL_TALK = {
  'hi': 'Hello! 👋 How can I help you today?',
  'hello': 'Hello! 👋 How can I help you today?',
  'hey': 'Hey there! 👋 How can I assist you?',
  'hii': 'Hello! 👋 How can I help you today?',
  'hai': 'Hello! 👋 How can I help you today?',
  'thanks': "You're welcome! 😊 Is there anything else I can help you with?",
  'thank you': "You're welcome! 😊 Is there anything else I can help you with?",
  'thank u': "You're welcome! 😊 Feel free to ask if you need anything else.",
  'thankyou': "You're welcome! 😊 Feel free to ask if you need anything else.",
  'bye': 'Goodbye! 👋 Have a great day!',
  'goodbye': 'Goodbye! 👋 Have a great day!',
  'ok': 'Got it! Let me know if you have any questions. 😊',
  'okay': 'Got it! Let me know if you have any questions. 😊',
  'k': 'Got it! 😊',
  'got it': 'Great! Let me know if you need anything else. 😊',
  'good morning': 'Good morning! ☀️ How can I help you today?',
  'good afternoon': 'Good afternoon! 😊 How can I help you today?',
  'good evening': 'Good evening! 🌙 How can I help you today?',
  'how are you': "I'm doing great, thank you! 😊 How can I assist you today?",
  'how r u': "I'm doing great! 😊 How can I help you today?",
};

const ESCALATION_RESPONSE = "I don't have enough information to answer that accurately. I'm connecting you with a human support agent who can help you right away. Please wait a moment...";

function getSmallTalkResponse(message) {
  const cleaned = message.toLowerCase().trim().replace(/[.,!?]/g, '');
  if (SMALL_TALK[cleaned]) return SMALL_TALK[cleaned];
  const words = cleaned.split(/\s+/);
  if (words.length <= 2) {
    for (const [key, response] of Object.entries(SMALL_TALK)) {
      if (cleaned === key || cleaned.startsWith(key)) return response;
    }
  }
  return null;
}

function isEscalationNeeded(userMessage) {
  if (!userMessage) return false;
  const msg = userMessage.toLowerCase();
  const escalationKeywords = [
    'connect me to a human',
    'talk to support',
    'speak with an agent',
    'transfer me to support',
    'human agent',
    'real person',
    'talk to human'
  ];
  return escalationKeywords.some(keyword => msg.includes(keyword));
}

class AIService {
  constructor() {
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }

  async generateGreeting({ userName, timeOfDay }) {
    const greetings = {
      morning: `Hi ${userName || 'there'}! How can I help you today?`,
      afternoon: `Hi ${userName || 'there'}! How can I assist you?`,
      evening: `Hi ${userName || 'there'}! How can I help you?`,
      day: `Hello ${userName || 'there'}! How can I help you today?`
    };
    return greetings[timeOfDay] || greetings.day;
  }

  async generateResponse({ userMessage, conversationHistory, knowledgeBaseContext }) {
    try {
      // ── Step 1: Small talk check ──────────────────
      const smallTalk = getSmallTalkResponse(userMessage);
      if (smallTalk) {
        return {
          response: smallTalk,
          suggestions: this.generateSuggestions(userMessage, smallTalk),
          model: 'small-talk',
          confidence: 1.0,
          tokensUsed: 0,
          sources: [],
          needsEscalation: false
        };
      }

      // ── Step 2: Search Knowledge Base (RAG) ──────
      let relevantChunks = [];
      let sources = [];
      try {
        const chunks = await searchSimilarChunks(userMessage, 5);
        relevantChunks = chunks.map(c => c.content);
        sources = chunks
          .filter(c => c.source_url)
          .map(c => ({ title: c.title, url: c.source_url, similarity: c.similarity }));
        logger.info(`🔍 RAG: Found ${relevantChunks.length} relevant chunks for: "${userMessage}"`);
      } catch (err) {
        logger.warn('RAG search failed, using general knowledge:', err.message);
      }

      const hasKBContent = relevantChunks.length > 0 &&
        relevantChunks.some(chunk => chunk && chunk.trim().length > 50);

      // ── Step 3: Build system prompt ───────────────
      const systemPrompt = hasKBContent
        ? `You are KnowBridge Support Assistant. Answer ONLY using the context provided below.

STRICT RULES:
1. ONLY use information from the context below. Do NOT use your training data.
2. If context does not contain the answer, say EXACTLY: "I don't have that information in my knowledge base. Our support team will assist you shortly."
3. Never say "typically", "usually", "generally" - only state what's in context.
4. Use **bold** for key terms. Keep answers concise and direct.

Context from Knowledge Base:
---
${relevantChunks.slice(0, 5).join('\n\n')}
---

Answer ONLY from the context above.`
        : `You are KnowBridge Support Assistant. You help users with questions about KnowBridge CRM.

RULES:
1. Give helpful, direct answers about KnowBridge features
2. Use **bold** for key terms
3. Keep answers 2-4 sentences
4. If you truly don't know something specific, say: "I don't have that specific information in my knowledge base."
5. NEVER say "I found articles" or suggest external links`;

      const messages = [{ role: 'system', content: systemPrompt }];

      // Add conversation history (last 6 messages)
      conversationHistory.slice(-6).forEach(msg => {
        messages.push({
          role: msg.sender_type === 'user' ? 'user' : 'assistant',
          content: msg.content
        });
      });

      messages.push({ role: 'user', content: userMessage });

      // Check for manual handover request BEFORE calling OpenAI
      const needsEscalation = isEscalationNeeded(userMessage);

      // If escalation needed, bypass OpenAI and return immediate handover
      if (needsEscalation) {
        logger.info(`🔔 Escalation triggered for message: "${userMessage}"`);
        return {
          response: ESCALATION_RESPONSE,
          suggestions: [],
          model: 'rule-based',
          confidence: 1.0,
          tokensUsed: 0,
          sources: [],
          needsEscalation: true
        };
      }

      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages,
        temperature: hasKBContent ? 0.0 : 0.4,
        max_tokens: 1000,
        presence_penalty: 0.6,
        frequency_penalty: 0.3
      });

      let response = completion.choices[0].message.content.trim();

      logger.info(`✅ AI Response (RAG: ${hasKBContent}, Escalate: ${needsEscalation}, tokens: ${completion.usage.total_tokens})`);

      return {
        response,
        suggestions: needsEscalation ? [] : this.generateSuggestions(userMessage, response),
        model: 'gpt-4o-mini',
        confidence: hasKBContent ? 0.95 : 0.75,
        tokensUsed: completion.usage.total_tokens,
        sources,
        needsEscalation
      };

    } catch (error) {
      logger.error('AI response generation failed:', error);
      throw error;
    }
  }

  generateSuggestions(userMessage, aiResponse) {
    const lowerMsg = userMessage.toLowerCase();
    if (lowerMsg.includes('lead') || lowerMsg.includes('inquiry'))
      return ["How do I add a new student lead?", "Can I import leads from Excel?", "How to track follow-ups?"];
    if (lowerMsg.includes('fee') || lowerMsg.includes('payment'))
      return ["How to generate invoices?", "Set up payment reminders", "Track pending fees"];
    if (lowerMsg.includes('admission') || lowerMsg.includes('enroll'))
      return ["How to enroll new students?", "Manage admission documents", "Configure admission forms"];
    if (lowerMsg.includes('sms') || lowerMsg.includes('email') || lowerMsg.includes('whatsapp'))
      return ["Send bulk SMS to students", "Create email templates", "Set up WhatsApp notifications"];
    if (lowerMsg.includes('report') || lowerMsg.includes('analytics'))
      return ["View enrollment analytics", "Generate revenue reports", "Export data to Excel"];
    if (lowerMsg.includes('price') || lowerMsg.includes('cost') || lowerMsg.includes('plan'))
      return ["Compare all pricing plans", "How to upgrade my plan?", "Is there a free trial?"];
    return ["What is KnowBridge?", "Show me pricing plans", "How to get started?"];
  }

  async shouldEscalate({ userMessage, conversationHistory }) {
    try {
      // Requirement 1C: Do not hand over on the first message
      if (!conversationHistory || conversationHistory.length === 0) {
        return false;
      }

      const messages = [
        {
          role: 'system',
          content: `Determine if user needs human support. Respond ONLY "YES" or "NO".
ESCALATE if: user asks for human/agent, frustrated/angry, billing dispute, account issue.
DO NOT escalate if: general questions, how-to, pricing.`
        },
        {
          role: 'user',
          content: `Messages:\n${conversationHistory.slice(-3).map(m => `${m.sender_type}: ${m.content}`).join('\n')}\nLatest: ${userMessage}`
        }
      ];

      const completion = await this.openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages,
        temperature: 0.3,
        max_tokens: 10
      });

      return completion.choices[0].message.content.trim().toUpperCase() === 'YES';
    } catch (error) {
      logger.error('Escalation check failed:', error);
      return false;
    }
  }

  async retryResponse({ originalMessage, originalResponse, conversationHistory, userFeedback }) {
    try {
      let context = '';
      try {
        const chunks = await searchSimilarChunks(originalMessage, 5);
        if (chunks.length > 0) context = chunks.map(c => c.content).join('\n\n');
      } catch (e) {}

      const messages = [
        {
          role: 'system',
          content: context
            ? `Improve your answer using this context:\n---\n${context}\n---\nBe clearer and more helpful.`
            : `The user gave negative feedback. Generate a clearer, more helpful answer.`
        },
        {
          role: 'user',
          content: `Original question: ${originalMessage}\nPrevious answer: ${originalResponse}\nFeedback: ${userFeedback || 'Not helpful'}\n\nProvide a better answer:`
        }
      ];

      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages,
        temperature: 0.5,
        max_tokens: 400
      });

      return {
        response: completion.choices[0].message.content.trim(),
        model: 'gpt-4o-mini',
        confidence: 0.8,
        tokensUsed: completion.usage.total_tokens,
        needsEscalation: false
      };
    } catch (error) {
      logger.error('Retry response failed:', error);
      throw error;
    }
  }
}

module.exports = new AIService();
