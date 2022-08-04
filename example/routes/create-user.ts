/**
 * Example express handler
 */

import { userCmd } from '../command/user'

// Wrap in your own try-catch logic
// If you throw in your command handler, this will throw as well
export const createUser = async (req, res) => {
  // Command handlers return the updated aggregate
  const user = await userCmd.create(req.body.email, { name: req.body.name })

  res.json({ success: true, id: user.aggregateId })
}
