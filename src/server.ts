import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import Fastify from 'fastify';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { config } from './api/config.js';
import { database } from './api/database.js';
import { requireUser } from './api/auth.js';

const app = Fastify({ logger: true });
await app.register(cors, { origin: config.CORS_ORIGIN });
await app.register(jwt, { secret: config.JWT_SECRET });

const credentials = z.object({ email: z.string().email().transform((value) => value.toLowerCase()), password: z.string().min(8) });
const registerBody = credentials.extend({ fullName: z.string().trim().min(2).max(120) });
const profileBody = z.object({ monthlySalary: z.coerce.number().min(0).max(999999999), weeklyHours: z.coerce.number().min(1).max(60), timezone: z.string().min(1).max(80).default('America/Santiago') });
const overtimeBody = z.object({ startsAt: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), endsAt: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), kind: z.enum(['normal', 'holiday']), reason: z.string().trim().min(1).max(500) }).refine((value) => value.endsAt > value.startsAt, { message: 'La hora de término debe ser posterior al inicio.' });
const workDayBody = z.object({ checkIn: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), checkOut: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), breakMinutes: z.coerce.number().int().min(0).max(720), overtime: z.array(overtimeBody).default([]) }).refine((value) => value.checkOut > value.checkIn, { message: 'La salida debe ser posterior al ingreso.' });
const dateParam = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) });

app.get('/health', async () => {
  await database.query('SELECT 1');
  return { status: 'ok', database: 'connected' };
});

app.post('/api/auth/register', async (request, reply) => {
  const input = registerBody.parse(request.body);
  const passwordHash = await bcrypt.hash(input.password, 12);
  try {
    const result = await database.query<{ id: string; email: string; full_name: string }>('INSERT INTO users (email, password_hash, full_name) VALUES ($1, $2, $3) RETURNING id, email, full_name', [input.email, passwordHash, input.fullName]);
    const user = result.rows[0];
    await database.query('INSERT INTO profiles (user_id) VALUES ($1)', [user.id]);
    return reply.code(201).send({ user: { id: user.id, email: user.email, fullName: user.full_name }, token: app.jwt.sign({ userId: user.id, email: user.email }) });
  } catch (error: unknown) {
    if ((error as { code?: string }).code === '23505') return reply.code(409).send({ message: 'Ya existe una cuenta con ese correo.' });
    throw error;
  }
});

app.post('/api/auth/login', async (request, reply) => {
  const input = credentials.parse(request.body);
  const result = await database.query<{ id: string; email: string; full_name: string; password_hash: string }>('SELECT id, email, full_name, password_hash FROM users WHERE email = $1', [input.email]);
  const user = result.rows[0];
  if (!user || !(await bcrypt.compare(input.password, user.password_hash))) return reply.code(401).send({ message: 'Correo o contraseña incorrectos.' });
  return { user: { id: user.id, email: user.email, fullName: user.full_name }, token: app.jwt.sign({ userId: user.id, email: user.email }) };
});

app.get('/api/profile', { preHandler: requireUser }, async (request) => {
  const result = await database.query('SELECT u.full_name AS "fullName", u.email, p.monthly_salary AS "monthlySalary", p.weekly_hours AS "weeklyHours", p.timezone FROM users u JOIN profiles p ON p.user_id = u.id WHERE u.id = $1', [request.user.userId]);
  return result.rows[0];
});

app.patch('/api/profile', { preHandler: requireUser }, async (request) => {
  const input = profileBody.parse(request.body);
  const result = await database.query('UPDATE profiles SET monthly_salary = $1, weekly_hours = $2, timezone = $3, updated_at = now() WHERE user_id = $4 RETURNING monthly_salary AS "monthlySalary", weekly_hours AS "weeklyHours", timezone', [input.monthlySalary, input.weeklyHours, input.timezone, request.user.userId]);
  return result.rows[0];
});

app.put('/api/work-days/:date', { preHandler: requireUser }, async (request) => {
  const { date } = dateParam.parse(request.params);
  const input = workDayBody.parse(request.body);
  const client = await database.connect();
  try {
    await client.query('BEGIN');
    const day = await client.query<{ id: string }>('INSERT INTO work_days (user_id, work_date, check_in, check_out, break_minutes) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (user_id, work_date) DO UPDATE SET check_in = EXCLUDED.check_in, check_out = EXCLUDED.check_out, break_minutes = EXCLUDED.break_minutes, updated_at = now() RETURNING id', [request.user.userId, date, input.checkIn, input.checkOut, input.breakMinutes]);
    const workDayId = day.rows[0].id;
    await client.query('DELETE FROM overtime_entries WHERE work_day_id = $1', [workDayId]);
    for (const entry of input.overtime) await client.query('INSERT INTO overtime_entries (work_day_id, starts_at, ends_at, kind, reason) VALUES ($1, $2, $3, $4, $5)', [workDayId, entry.startsAt, entry.endsAt, entry.kind, entry.reason]);
    await client.query('COMMIT');
    return { id: workDayId, date, ...input };
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
});

app.get('/api/work-days', { preHandler: requireUser }, async (request) => {
  const query = z.object({ from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).parse(request.query);
  const result = await database.query('SELECT w.id, w.work_date AS date, w.check_in AS "checkIn", w.check_out AS "checkOut", w.break_minutes AS "breakMinutes", COALESCE(json_agg(json_build_object(\'id\', o.id, \'startsAt\', o.starts_at, \'endsAt\', o.ends_at, \'kind\', o.kind, \'reason\', o.reason) ORDER BY o.starts_at) FILTER (WHERE o.id IS NOT NULL), \'[]\') AS overtime FROM work_days w LEFT JOIN overtime_entries o ON o.work_day_id = w.id WHERE w.user_id = $1 AND w.work_date BETWEEN $2 AND $3 GROUP BY w.id ORDER BY w.work_date DESC', [request.user.userId, query.from, query.to]);
  return result.rows;
});

app.setErrorHandler((error, _request, reply) => {
  if (error instanceof z.ZodError) return reply.code(400).send({ message: 'Datos inválidos.', details: error.flatten() });
  app.log.error(error);
  return reply.code(500).send({ message: 'Ocurrió un error inesperado.' });
});

app.listen({ port: config.PORT, host: '0.0.0.0' }).catch((error) => { app.log.error(error); process.exit(1); });
