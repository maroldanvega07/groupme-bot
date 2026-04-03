require('dotenv').config();
const express = require('express');
const axios = require('axios');

const app = express();
app.use(express.json());

const {
  GROUPME_BOT_ID,
  OPENWEBUI_URL,
  OPENWEBUI_API_KEY,
  OPENWEBUI_MODEL,
  PORT = 3001,
} = process.env;

const TRIGGER_PREFIX = '!ask';
const MAX_HISTORY_TURNS = 10; // each turn = 1 user + 1 assistant message

// Per-group conversation history: { [group_id]: [{role, content}, ...] }
const conversationHistory = {};

function getHistory(groupId) {
  if (!conversationHistory[groupId]) {
    conversationHistory[groupId] = [];
  }
  return conversationHistory[groupId];
}

function appendHistory(groupId, userMessage, assistantReply) {
  const history = getHistory(groupId);
  history.push({ role: 'user', content: userMessage });
  history.push({ role: 'assistant', content: assistantReply });

  // Keep only the last MAX_HISTORY_TURNS turns (2 messages per turn)
  const maxMessages = MAX_HISTORY_TURNS * 2;
  if (history.length > maxMessages) {
    history.splice(0, history.length - maxMessages);
  }
}

async function queryOpenWebUI(groupId, userMessage) {
  const history = getHistory(groupId);

  const messages = [
    ...history,
    { role: 'user', content: userMessage },
  ];

  const response = await axios.post(
    `${OPENWEBUI_URL}/api/chat/completions`,
    {
      model: OPENWEBUI_MODEL,
      messages,
    },
    {
      headers: {
        Authorization: `Bearer ${OPENWEBUI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    }
  );

  return response.data.choices[0].message.content;
}

async function postToGroupMe(text) {
  await axios.post('https://api.groupme.com/v3/bots/post', {
    bot_id: GROUPME_BOT_ID,
    text,
  });
}

app.post('/webhook', (req, res) => {
  // Respond 200 immediately so GroupMe doesn't retry
  res.sendStatus(200);

  const { text, sender_type, group_id } = req.body;

  // Ignore bot messages to prevent loops
  if (sender_type === 'bot') return;

  // Only handle messages with the trigger prefix
  if (!text || !text.startsWith(TRIGGER_PREFIX)) return;

  const userMessage = text.slice(TRIGGER_PREFIX.length).trim();
  if (!userMessage) return;

  // Process asynchronously after responding to GroupMe
  (async () => {
    try {
      const reply = await queryOpenWebUI(group_id, userMessage);
      appendHistory(group_id, userMessage, reply);
      await postToGroupMe(reply);
    } catch (err) {
      console.error('Error processing message:', err?.response?.data ?? err.message);
      try {
        await postToGroupMe('Sorry, I ran into an error processing your request.');
      } catch (postErr) {
        console.error('Failed to send error reply to GroupMe:', postErr.message);
      }
    }
  })();
});

app.listen(PORT, () => {
  console.log(`GroupMe bot webhook listening on port ${PORT}`);
});
