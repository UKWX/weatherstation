import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { routes } from './routes';

export const app = express();
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(routes);
