import Router from '@koa/router'
import * as ctrl from '../../controllers/hermes/runtime-versions'
import { requireSuperAdmin } from '../../middleware/user-auth'

export const runtimeVersionRoutes = new Router()

runtimeVersionRoutes.get('/api/hermes/runtime-versions', requireSuperAdmin, ctrl.status)
runtimeVersionRoutes.get('/api/hermes/runtime-versions/jobs', requireSuperAdmin, ctrl.jobs)
runtimeVersionRoutes.get('/api/hermes/runtime-versions/jobs/:id', requireSuperAdmin, ctrl.job)
runtimeVersionRoutes.post('/api/hermes/runtime-versions/active-runtime', requireSuperAdmin, ctrl.activateRuntime)
runtimeVersionRoutes.post('/api/hermes/runtime-versions/active-ui', requireSuperAdmin, ctrl.activateUi)
runtimeVersionRoutes.post('/api/hermes/runtime-versions/runtime/download', requireSuperAdmin, ctrl.downloadRuntime)
runtimeVersionRoutes.post('/api/hermes/runtime-versions/ui/download', requireSuperAdmin, ctrl.downloadUi)
runtimeVersionRoutes.delete('/api/hermes/runtime-versions/runtime/:version', requireSuperAdmin, ctrl.deleteRuntime)
runtimeVersionRoutes.delete('/api/hermes/runtime-versions/ui/:version', requireSuperAdmin, ctrl.deleteUi)
