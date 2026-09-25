// El modelo del coach: OpenAI GPT 6 Luna a través del OpenAIModel de Strands.
// En e2e (E2E_FAKE_AI=1) Vite aliasa este fichero a e2e/fakes/model.ts. Este fallback
// evita gastar tokens si el alias no se aplica y este módulo llega a cargarse.
import { OpenAIModel } from '@strands-agents/sdk/models/openai'

import { env } from '../lib/env'

const fakeAi = process.env.E2E_FAKE_AI === '1' || env('E2E_FAKE_AI') === '1'

export const MODEL_ID = fakeAi ? 'fake-model' : env('OPENAI_MODEL', 'gpt-6-luna')!

export const model = fakeAi
  ? (await import('../../e2e/fakes/model')).model
  : new OpenAIModel({
      modelId: MODEL_ID,
      apiKey: env('OPENAI_API_KEY'),
    })
