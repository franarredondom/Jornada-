import type { FastifyRequest } from 'fastify';

export async function requireUser(request: FastifyRequest) {
  await request.jwtVerify();
}
