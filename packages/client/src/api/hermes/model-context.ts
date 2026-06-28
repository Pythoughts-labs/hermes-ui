import { request } from '../client'

export interface ModelContext {
  id: number
  provider: string
  model: string
  context_limit: number
}

/**
 * Query the model-context configuration for the given provider and model.
 */
export async function getModelContext(provider: string, model: string): Promise<ModelContext | null> {
  try {
    const res = await request<{ data: ModelContext }>(
      `/api/hermes/model-context?provider=${encodeURIComponent(provider)}&model=${encodeURIComponent(model)}`
    )
    return res.data
  } catch (err: any) {
    if (err.status === 404) return null
    throw err
  }
}

/**
 * Set the model-context configuration (UPSERT: update if exists, insert otherwise).
 */
export async function setModelContext(
  provider: string,
  model: string,
  contextLimit: number
): Promise<ModelContext> {
  const res = await request<{ success: boolean; data: ModelContext }>(
    `/api/hermes/model-context/${encodeURIComponent(provider)}/${encodeURIComponent(model)}`,
    {
      method: 'PUT',
      body: JSON.stringify({ provider, model, context_limit: contextLimit }),
    }
  )
  return res.data
}
