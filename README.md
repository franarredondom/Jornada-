# Jornada+

Jornada+ es una aplicación para registrar jornadas laborales, horas extra y turnos nocturnos. Permite mantener un historial personal, calcular montos estimados y exportar la información a Excel.

## Funcionalidades principales

- Registro e inicio de sesión con JWT.
- Jornada normal con horario de ingreso, salida y colación.
- Horas extra normales y de feriado, con motivo opcional.
- Turno nocturno con cuatro horas extra automáticas al 50 %.
- Cálculo de valor hora desde sueldo mensual y horas semanales pactadas.
- Resumen semanal, historial editable y exportación a Excel.

## Tecnologías

- React, Vite y TypeScript para el cliente.
- Fastify y PostgreSQL para la API.
- Supabase como base de datos y Render/Vercel para el despliegue.

## Desarrollo local

```bash
npm install
npm run dev
```

En una segunda terminal, inicia la API:

```bash
npm run api:dev
```

Configura las variables de entorno usando `.env.example` como referencia. Nunca subas el archivo `.env` al repositorio.
