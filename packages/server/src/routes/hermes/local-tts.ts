import Router from '@koa/router'
import * as ctrl from '../../controllers/hermes/local-tts'

export const localTtsRoutes = new Router()

localTtsRoutes.get('/api/hermes/tts/local/status', ctrl.getStatus)
localTtsRoutes.get('/api/hermes/tts/local/models', ctrl.listAvailableModels)
localTtsRoutes.post('/api/hermes/tts/local/download', ctrl.startDownload)
localTtsRoutes.delete('/api/hermes/tts/local/model', ctrl.removeModel)
