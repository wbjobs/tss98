import { Router, type Request, type Response } from 'express'
import { v4 as uuidv4 } from 'uuid'
import db from '../db.js'

const router = Router()

router.post('/', (req: Request, res: Response): void => {
  const { timestamp, audioDuration, result, confidence, action, inferenceTime, modelVersion } = req.body
  if (!timestamp || audioDuration == null || !result || confidence == null || inferenceTime == null || !modelVersion) {
    res.status(400).json({ success: false, error: 'Missing required fields' })
    return
  }
  const id = uuidv4()
  db.prepare(`
    INSERT INTO recognition_logs (id, timestamp, audio_duration, result, confidence, action, inference_time, model_version)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, timestamp, audioDuration, result, confidence, action ?? null, inferenceTime, modelVersion)
  const log = db.prepare('SELECT * FROM recognition_logs WHERE id = ?').get(id)
  res.status(201).json({ success: true, data: log })
})

router.get('/', (req: Request, res: Response): void => {
  const page = Math.max(1, parseInt(req.query.page as string) || 1)
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20))
  const offset = (page - 1) * limit

  const total = db.prepare('SELECT COUNT(*) as count FROM recognition_logs').get() as { count: number }
  const logs = db.prepare('SELECT * FROM recognition_logs ORDER BY timestamp DESC LIMIT ? OFFSET ?').all(limit, offset)

  res.json({
    success: true,
    data: {
      logs,
      pagination: {
        page,
        limit,
        total: total.count,
        totalPages: Math.ceil(total.count / limit),
      },
    },
  })
})

router.get('/stats', (_req: Request, res: Response): void => {
  const totalResult = db.prepare('SELECT COUNT(*) as count FROM recognition_logs').get() as { count: number }
  const totalRecognitions = totalResult.count

  const avgResult = db.prepare('SELECT AVG(inference_time) as avg FROM recognition_logs').get() as { avg: number | null }
  const avgInferenceTime = avgResult.avg ?? 0

  const successResult = db.prepare("SELECT COUNT(*) as count FROM recognition_logs WHERE result != '_unknown_' AND result != 'unknown'").get() as { count: number }
  const successRate = totalRecognitions > 0 ? successResult.count / totalRecognitions : 0
  const unrecognizedRate = totalRecognitions > 0 ? 1 - successRate : 0

  const topCommands = db.prepare(`
    SELECT result, COUNT(*) as count
    FROM recognition_logs
    WHERE result != '_unknown_' AND result != 'unknown'
    GROUP BY result
    ORDER BY count DESC
    LIMIT 10
  `).all() as { result: string; count: number }[]

  res.json({
    success: true,
    data: {
      totalRecognitions,
      avgInferenceTime,
      successRate,
      unrecognizedRate,
      topCommands,
    },
  })
})

router.delete('/', (_req: Request, res: Response): void => {
  db.prepare('DELETE FROM recognition_logs').run()
  res.json({ success: true, message: 'All logs cleared' })
})

export default router
