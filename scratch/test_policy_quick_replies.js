require('dotenv').config();
const ragKnowledgeAgent = require('../services/agents/ragKnowledgeAgent');

async function testPolicyQuickReplies() {
  console.log('Testing policy quick replies for wrong size exchange...');
  const res = await ragKnowledgeAgent.handlePolicyAndKnowledge({
    query: 'áo mình mua về bị giao sai size rồi thì có cách nào giải quyết không shop'
  });
  console.log('\n--- REPLY ---');
  console.log(res.reply);
  console.log('\n--- DYNAMIC QUICK REPLIES ---');
  console.log(res.followUp?.quickReplies);
  process.exit(0);
}

testPolicyQuickReplies();
