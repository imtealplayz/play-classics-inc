const { pingMongo } = require('../lib/mongodb');

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed.' });
  try {
    await pingMongo();
    return res.status(200).json({ status: 'ok', database: 'connected' });
  } catch (error) {
    const configured = Boolean(process.env.MONGODB_URI);
    console.error('Health check:', error?.name || 'Error');
    return res.status(503).json({
      status: 'not_ready',
      database: configured ? 'unavailable' : 'not_configured',
      message: configured ? 'Database connection is unavailable.' : 'MongoDB is not configured.',
    });
  }
};
