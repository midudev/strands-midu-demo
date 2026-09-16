// El modelo del coach: OpenAI GPT 5.6 Luna a través del OpenAIModel de Strands.
import { OpenAIModel } from '@strands-agents/sdk/models/openai'

import { env } from '../lib/env'

export const MODEL_ID = env('OPENAI_MODEL', 'gpt-5.6-luna')!

export const model = new OpenAIModel({
  modelId: MODEL_ID,
  apiKey: env('OPENAI_API_KEY'),
})
