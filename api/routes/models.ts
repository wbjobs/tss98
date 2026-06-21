import { Router, type Request, type Response } from 'express'
import { v4 as uuidv4 } from 'uuid'
import db from '../db.js'

const router = Router()

router.get('/latest', (_req: Request, res: Response): void => {
  const model = db.prepare('SELECT * FROM model_versions WHERE is_active = 1').get() as Record<string, unknown> | undefined
  if (!model) {
    res.status(404).json({ success: false, error: 'No active model found' })
    return
  }
  res.json({ success: true, data: model })
})

router.get('/', (_req: Request, res: Response): void => {
  const models = db.prepare('SELECT * FROM model_versions ORDER BY created_at DESC').all()
  res.json({ success: true, data: models })
})

router.post('/', (req: Request, res: Response): void => {
  const { name, version, url, inputShape, labels } = req.body
  if (!name || !version || !url || !inputShape || !labels) {
    res.status(400).json({ success: false, error: 'Missing required fields: name, version, url, inputShape, labels' })
    return
  }
  const id = uuidv4()
  const inputShapeStr = typeof inputShape === 'string' ? inputShape : JSON.stringify(inputShape)
  const labelsStr = typeof labels === 'string' ? labels : JSON.stringify(labels)
  db.prepare(`
    INSERT INTO model_versions (id, name, version, url, input_shape, labels, is_active)
    VALUES (?, ?, ?, ?, ?, ?, 0)
  `).run(id, name, version, url, inputShapeStr, labelsStr)
  const model = db.prepare('SELECT * FROM model_versions WHERE id = ?').get(id)
  res.status(201).json({ success: true, data: model })
})

router.put('/:id/activate', (req: Request, res: Response): void => {
  const { id } = req.params
  const existing = db.prepare('SELECT id FROM model_versions WHERE id = ?').get(id) as { id: string } | undefined
  if (!existing) {
    res.status(404).json({ success: false, error: 'Model not found' })
    return
  }
  const deactivate = db.prepare('UPDATE model_versions SET is_active = 0 WHERE is_active = 1')
  const activate = db.prepare('UPDATE model_versions SET is_active = 1 WHERE id = ?')
  const transaction = db.transaction(() => {
    deactivate.run()
    activate.run(id)
  })
  transaction()
  const model = db.prepare('SELECT * FROM model_versions WHERE id = ?').get(id)
  res.json({ success: true, data: model })
})

export default router
