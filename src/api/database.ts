import { Pool } from 'pg';
import { config } from './config.js';

export const database = new Pool({ connectionString: config.DATABASE_URL, ssl: { rejectUnauthorized: false } });
