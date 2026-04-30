import { ChatOpenAI } from '@langchain/openai';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Shared ChatOpenAI instance used by all agents.
 * LangSmith tracing activates automatically when LANGCHAIN_TRACING_V2=true.
 */
const llm = new ChatOpenAI({
  modelName: process.env.OPENAI_MODEL || 'gpt-4o',
  temperature: 0,
  openAIApiKey: process.env.OPENAI_API_KEY,
  configuration: {
    baseURL: process.env.OPENAI_API_BASE || 'https://api.openai.com/v1',
  },
});

export default llm;
