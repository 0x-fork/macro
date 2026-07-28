import { Hono } from 'hono'
import { logger } from 'hono/logger'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { startSession, destroySession } from './src/session'

const SessionRequest = z.object({
  prompt: z.string().min(1),
  repoUrl: z.url(),
  // The agent_proxy chat/agent id this session belongs to, when the caller is
  // agent_proxy itself (dialing the shared runtime endpoint's `?id=` needs
  // this exact value). Omitted for the standalone dev-fixture flow, which
  // generates its own id instead.
  agentId: z.string().uuid().optional(),
})

const app = new Hono()

app.use(logger())

// Returns the session id immediately. All progress — the booting/ready/
// shutting_down lifecycle and the full ACP wire stream — goes to the
// upstream using direct tagged messages.
app.post('/session', zValidator('json', SessionRequest), (c) => {
  const { prompt, repoUrl, agentId } = c.req.valid('json')
  const sessionId = startSession({ prompt, repoUrl, agentId })
  return c.json({ sessionId }, 202)
})

app.delete('/session/:id', async (c) => {
  const ok = await destroySession(c.req.param('id'))
  return ok ? c.json({ ok: true }) : c.json({ error: 'unknown session' }, 404)
})

export default { fetch: app.fetch, port: 4000 }
