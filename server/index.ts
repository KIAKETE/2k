import express from 'express';
import { registerRoutes } from './routes.js';

const app = express();
app.use(express.json());

registerRoutes(app);

const PORT = Number(process.env.PORT) || 5000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 InvestHub API running on http://localhost:${PORT}`);
});
