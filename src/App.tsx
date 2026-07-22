import { FormEvent, useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';

type ExtraType = 'normal' | 'holiday';
type ExtraHour = { id: string | number; start: string; end: string; reason: string; type: ExtraType };
type DayRecord = { id: string; date: string; checkIn: string; checkOut: string; breakMinutes: number; nightShift: boolean; regular: number; overtime: number; overtimeUnits: number; extras: ExtraHour[] };
type DayDraft = Pick<DayRecord, 'checkIn' | 'checkOut' | 'breakMinutes' | 'nightShift' | 'extras'>;
type Credentials = { email: string; password: string; fullName?: string };

const apiUrl = import.meta.env.VITE_API_URL ?? (import.meta.env.PROD ? 'https://jornada-fs8e.onrender.com' : 'http://localhost:3000');
const today = () => new Date().toISOString().slice(0, 10);
const time = (value: string) => value.slice(0, 5);
export const isTime = (value: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
export const asHours = (start: string, end: string) => {
  const [startHour, startMinute] = start.split(':').map(Number);
  const [endHour, endMinute] = end.split(':').map(Number);
  const startTotal = startHour * 60 + startMinute;
  let endTotal = endHour * 60 + endMinute;
  if (endTotal <= startTotal) endTotal += 24 * 60;
  return (endTotal - startTotal) / 60;
};
const money = (amount: number) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(amount);
export const isDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T12:00:00`).getTime());
const displayDate = (date: string) => new Intl.DateTimeFormat('es-CL', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${isDate(date) ? date : today()}T12:00:00`));
export const weekKey = (date: string) => { const value = new Date(`${isDate(date) ? date : today()}T12:00:00`); value.setDate(value.getDate() - ((value.getDay() || 7) - 1)); return value.toISOString().slice(0, 10); };

async function request<T>(path: string, options: RequestInit = {}, token?: string): Promise<T> {
  const response = await fetch(`${apiUrl}${path}`, { ...options, headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error('Error de API', { path, status: response.status, response: body, payload: options.body });
    const fields = Object.entries(body.details?.fieldErrors ?? {}).flatMap(([field, messages]) => (messages as string[]).map((message) => `${field}: ${message}`));
    const form = body.details?.formErrors?.[0];
    throw new Error(fields[0] ?? form ?? body.message ?? 'No fue posible conectar con el servidor.');
  }
  return body as T;
}

function Access({ onAccess }: { onAccess: (credentials: Credentials, registering: boolean) => Promise<void> }) {
  const [isRegistering, setIsRegistering] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setLoading(true);
    const form = new FormData(event.currentTarget);
    try { await onAccess({ email: String(form.get('email')), password: String(form.get('password')), fullName: String(form.get('fullName') ?? '') }, isRegistering); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'No fue posible continuar.'); }
    finally { setLoading(false); }
  }
  return <main className="access"><section className="access-intro"><p className="eyebrow">JORNADA+</p><h1>Tu tiempo,<br /><span>bien registrado.</span></h1><p>Registra tu jornada, calcula horas extra y mantén tu historial laboral en un solo lugar.</p></section><section className="access-card"><p className="eyebrow">{isRegistering ? 'CREAR CUENTA' : 'BIENVENIDO/A'}</p><h2>{isRegistering ? 'Comencemos' : 'Inicia sesión'}</h2><form onSubmit={submit}><label>Correo electrónico<input name="email" type="email" placeholder="tu@correo.com" required /></label>{isRegistering && <label>Nombre completo<input name="fullName" placeholder="Cómo quieres aparecer" required /></label>}<label>Contraseña<input name="password" type="password" placeholder="••••••••" minLength={8} required /></label>{error && <p className="form-error">{error}</p>}<button className="primary full" disabled={loading} type="submit">{loading ? 'Conectando…' : isRegistering ? 'Crear cuenta' : 'Entrar a mi registro'}</button></form><p className="switch">{isRegistering ? '¿Ya tienes cuenta?' : '¿Aún no tienes cuenta?'} <button type="button" onClick={() => { setIsRegistering(!isRegistering); setError(''); }}>{isRegistering ? 'Inicia sesión' : 'Créala aquí'}</button></p></section></main>;
}

export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem('jornada_token') ?? '');
  const [showProfile, setShowProfile] = useState(true);
  const [monthlySalary, setMonthlySalary] = useState(0);
  const [salaryInput, setSalaryInput] = useState('');
  const [weeklyHours, setWeeklyHours] = useState(42);
  const [checkIn, setCheckIn] = useState('21:00');
  const [checkOut, setCheckOut] = useState('06:00');
  const [workDate, setWorkDate] = useState(today);
  const [breakMinutes, setBreakMinutes] = useState(60);
  const [nightShift, setNightShift] = useState(false);
  const [extras, setExtras] = useState<ExtraHour[]>([]);
  const [records, setRecords] = useState<DayRecord[]>([]);
  const [drafts, setDrafts] = useState<Record<string, DayDraft>>({});
  const [newExtra, setNewExtra] = useState({ start: '18:00', end: '19:00', reason: '', customReason: '', type: 'normal' as ExtraType });
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);

  const hourlyRate = weeklyHours ? (monthlySalary / 30 * 7) / weeklyHours : 0;
  const regularHours = Math.max(0, asHours(checkIn, checkOut) - breakMinutes / 60);
  const overtimeHours = useMemo(() => extras.reduce((sum, item) => sum + asHours(item.start, item.end), 0), [extras]);
  const nightBonusHours = nightShift ? 4 : 0;
  const overtimeAmount = useMemo(() => extras.reduce((sum, item) => sum + asHours(item.start, item.end) * hourlyRate * (item.type === 'holiday' ? 2 : 1.5), 0) + nightBonusHours * hourlyRate * 1.5, [extras, hourlyRate, nightBonusHours]);
  const currentWeek = weekKey(workDate);
  const weekRecords = records.filter((record) => weekKey(record.date) === currentWeek);
  const weekRegularHours = weekRecords.reduce((sum, record) => sum + record.regular, 0);
  const weekOvertimeHours = weekRecords.reduce((sum, record) => sum + record.overtime + (record.nightShift ? 4 : 0), 0);
  const historyRegularHours = records.reduce((sum, record) => sum + record.regular, 0);
  const historyOvertimeHours = records.reduce((sum, record) => sum + record.overtime + (record.nightShift ? 4 : 0), 0);
  const historyAmount = records.reduce((sum, record) => sum + (record.overtimeUnits + (record.nightShift ? 6 : 0)) * hourlyRate, 0);

  function mapRecord(day: { id: string; date: string; checkIn: string; checkOut: string; breakMinutes: number; nightShift: boolean; overtime: Array<{ id: string; startsAt: string; endsAt: string; kind: ExtraType; reason: string }> }): DayRecord {
    const date = String(day.date).slice(0, 10);
    const extras = day.overtime.map((item) => ({ id: item.id, start: time(item.startsAt), end: time(item.endsAt), type: item.kind, reason: item.reason }));
    return { id: day.id, date, checkIn: time(day.checkIn), checkOut: time(day.checkOut), breakMinutes: day.breakMinutes, nightShift: day.nightShift, regular: Math.max(0, asHours(time(day.checkIn), time(day.checkOut)) - day.breakMinutes / 60), overtime: extras.reduce((sum, item) => sum + asHours(item.start, item.end), 0), overtimeUnits: extras.reduce((sum, item) => sum + asHours(item.start, item.end) * (item.type === 'holiday' ? 2 : 1.5), 0), extras };
  }
  async function loadData(activeToken = token) {
    if (!activeToken) return;
    setLoading(true);
    try {
      const [profile, days] = await Promise.all([
        request<{ monthlySalary: number; weeklyHours: number }>('/api/profile', {}, activeToken),
        request<Parameters<typeof mapRecord>[0][]>('/api/work-days?from=2000-01-01&to=2100-12-31', {}, activeToken),
      ]);
      const savedSalary = Number(profile.monthlySalary);
      setMonthlySalary(savedSalary); setSalaryInput(savedSalary ? String(savedSalary) : ''); setWeeklyHours(Number(profile.weeklyHours)); setRecords(days.map(mapRecord));
    } catch (cause) { setNotice(cause instanceof Error ? cause.message : 'No fue posible cargar tus datos.'); }
    finally { setLoading(false); }
  }
  useEffect(() => { void loadData(); }, [token]);
  useEffect(() => {
    const draft = drafts[workDate];
    if (draft) { setCheckIn(draft.checkIn); setCheckOut(draft.checkOut); setBreakMinutes(draft.breakMinutes); setNightShift(draft.nightShift); setExtras(draft.extras); return; }
    const record = records.find((item) => item.date === workDate);
    if (!record) { setCheckIn('21:00'); setCheckOut('06:00'); setBreakMinutes(60); setNightShift(false); setExtras([]); return; }
    setCheckIn(record.checkIn); setCheckOut(record.checkOut); setBreakMinutes(record.breakMinutes); setNightShift(record.nightShift); setExtras(record.extras);
  }, [workDate, records, drafts]);

  async function authenticate(credentials: Credentials, registering: boolean) {
    const data = await request<{ token: string }>(registering ? '/api/auth/register' : '/api/auth/login', { method: 'POST', body: JSON.stringify(registering ? credentials : { email: credentials.email, password: credentials.password }) });
    localStorage.setItem('jornada_token', data.token); setToken(data.token); setNotice('');
  }
  function logout() { localStorage.removeItem('jornada_token'); setToken(''); setRecords([]); }
  function addExtra() {
    if (asHours(newExtra.start, newExtra.end) === 0) { setNotice('Agrega un horario válido para la hora extra.'); return; }
    const reason = newExtra.reason === 'Otro' ? newExtra.customReason.trim() || 'Otro' : newExtra.reason || 'Sin motivo especificado';
    const updatedExtras = [...extras, { id: crypto.randomUUID(), start: newExtra.start, end: newExtra.end, type: newExtra.type, reason }];
    setExtras(updatedExtras);
    setDrafts((current) => ({ ...current, [workDate]: { checkIn, checkOut, breakMinutes, nightShift, extras: updatedExtras } }));
    setNewExtra({ start: newExtra.end, end: newExtra.end, reason: '', customReason: '', type: 'normal' });
    void saveDay(updatedExtras, 'Hora extra añadida y guardada.');
  }
  function changeWorkDate(nextDate: string) {
    if (!isDate(nextDate)) return;
    setDrafts((current) => ({ ...current, [workDate]: { checkIn, checkOut, breakMinutes, nightShift, extras } }));
    setWorkDate(nextDate);
  }
  function editRecord(record: DayRecord) {
    changeWorkDate(record.date);
    setNotice(`Editando la jornada del ${displayDate(record.date)}. Guarda los cambios al terminar.`);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  async function deleteRecord(record: DayRecord) {
    if (!window.confirm(`¿Eliminar la jornada del ${displayDate(record.date)}? Esta acción no se puede deshacer.`)) return;
    const previousRecords = records;
    setRecords((current) => current.filter((item) => item.id !== record.id));
    try {
      await request(`/api/work-days/${record.date}`, { method: 'DELETE' }, token);
      setDrafts((current) => { const { [record.date]: _removed, ...remaining } = current; return remaining; });
      setNotice(`Jornada del ${displayDate(record.date)} eliminada.`);
    } catch (cause) { setRecords(previousRecords); setNotice(cause instanceof Error ? cause.message : 'No fue posible eliminar la jornada.'); }
  }
  function exportHistory() {
    const rows = records.map((record) => ({
      Fecha: record.date,
      'Horario normal': `${record.checkIn} - ${record.checkOut}`,
      'Horas normales': Number(record.regular.toFixed(2)),
      'Horas extra por horario': Number(record.overtime.toFixed(2)),
      'Turno nocturno (4h)': record.nightShift ? 'Sí' : 'No',
      'Total horas extra': Number((record.overtime + (record.nightShift ? 4 : 0)).toFixed(2)),
      'Monto extra estimado (CLP)': Math.round((record.overtimeUnits + (record.nightShift ? 6 : 0)) * hourlyRate),
      Detalle: record.extras.map((extra) => `${extra.start}-${extra.end} (${extra.reason})`).join(' · '),
    }));
    const workbook = XLSX.utils.book_new();
    const historySheet = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(workbook, historySheet, 'Jornadas');
    const totalsSheet = XLSX.utils.json_to_sheet([{ 'Horas normales': Number(historyRegularHours.toFixed(2)), 'Horas extra': Number(historyOvertimeHours.toFixed(2)), 'Monto extra estimado (CLP)': Math.round(historyAmount) }]);
    XLSX.utils.book_append_sheet(workbook, totalsSheet, 'Totales');
    XLSX.writeFile(workbook, `Jornada+-historial-${today()}.xlsx`);
  }
  async function saveProfile() { try { const salary = Number(salaryInput || 0); setMonthlySalary(salary); await request('/api/profile', { method: 'PATCH', body: JSON.stringify({ monthlySalary: salary, weeklyHours, timezone: 'America/Santiago' }) }, token); setSalaryInput(salary ? String(salary) : ''); setNotice('Perfil de pago guardado.'); } catch (cause) { setNotice(cause instanceof Error ? cause.message : 'No fue posible guardar el perfil.'); } }
  async function saveDay(dayExtras: ExtraHour[] | unknown = extras, successMessage = 'Jornada guardada correctamente.') {
    try {
      const entries = Array.isArray(dayExtras) ? dayExtras : extras;
      const cleanCheckIn = time(checkIn);
      const cleanCheckOut = time(checkOut);
      const overtime = entries.map((item) => ({ startsAt: time(String(item.start)), endsAt: time(String(item.end)), kind: item.type === 'holiday' ? 'holiday' : 'normal', reason: String(item.reason ?? '').trim() }));
      setLoading(true);
      setNotice('Guardando jornada…');
      await request(`/api/work-days/${workDate}`, { method: 'PUT', body: JSON.stringify({ checkIn: cleanCheckIn, checkOut: cleanCheckOut, breakMinutes, nightShift, overtime }) }, token);
      setDrafts((current) => { const { [workDate]: _saved, ...remaining } = current; return remaining; });
      await loadData(); setNotice(successMessage);
    } catch (cause) { setNotice(cause instanceof Error ? cause.message : 'No fue posible guardar la jornada.'); }
    finally { setLoading(false); }
  }
  if (!token) return <Access onAccess={authenticate} />;

  return <main className="app-shell"><header><div><p className="eyebrow">TU CONTROL PERSONAL</p><h1>Jornada<span>+</span></h1></div><nav><button type="button" onClick={() => setShowProfile(!showProfile)}>Mi perfil</button><button className="profile" type="button" onClick={logout}>Salir</button></nav></header>
    {notice && <p className="notice">{notice}</p>}
    {showProfile && <section className="profile-panel"><div><p className="eyebrow">CONFIGURACIÓN DE PAGO</p><h3>¿Cuánto vale tu hora?</h3><p>Estos datos se guardan en tu perfil y actualizan tus cálculos.</p></div><div className="salary-fields"><label>Sueldo mensual base (CLP)<input type="text" inputMode="numeric" placeholder="Ej.: 710000" value={salaryInput} onChange={(event) => { const digits = event.target.value.replace(/\D/g, ''); setSalaryInput(digits.replace(/^0+(?=\d)/, '')); setMonthlySalary(Number(digits || 0)); }} /></label><label>Horas semanales pactadas<input type="number" min="1" max="60" value={weeklyHours} onChange={(event) => setWeeklyHours(Number(event.target.value))} /></label><div className="rate"><span>VALOR HORA BASE</span><strong>{money(hourlyRate)}</strong></div><button className="primary profile-save" type="button" onClick={saveProfile}>Guardar perfil</button></div></section>}
    <section className="hero"><div><p className="eyebrow">REGISTRO DIARIO</p><h2>Registra tu jornada</h2><p>Guarda sólo tu jornada normal si no hiciste horas extra. Los bloques extra siempre son opcionales.</p><label className="date-picker">Fecha de la jornada<input type="date" value={workDate} onChange={(event) => changeWorkDate(event.target.value)} /></label></div><div className="total-card"><span>PAGO EXTRA DEL DÍA</span><strong>{money(overtimeAmount)}</strong><small>{(overtimeHours + nightBonusHours).toFixed(1)} h extra</small></div></section>
    <section className="grid"><article className="card"><div className="card-heading"><h3>Jornada normal</h3><span>Registro diario</span></div><div className="fields three-columns"><label>Ingreso<input type="time" value={checkIn} onChange={(event) => setCheckIn(event.target.value)} /></label><label>Salida<input type="time" value={checkOut} onChange={(event) => setCheckOut(event.target.value)} /></label><label>Colación (min)<input type="number" min="0" max="720" value={breakMinutes} onChange={(event) => setBreakMinutes(Number(event.target.value))} /></label></div><label className="night-check"><input type="checkbox" checked={nightShift} onChange={(event) => setNightShift(event.target.checked)} /><span><b>Trabajo nocturno</b> Suma automáticamente 4 horas extra al 50%.</span></label><p className="calculation">Total trabajado: <b>{regularHours.toFixed(1)} horas</b></p></article>
      <article className="card"><div className="card-heading"><h3>Agregar hora extra</h3><span>Opcional</span></div><div className="fields extra-fields"><label>Desde<input type="time" value={newExtra.start} onChange={(event) => setNewExtra({ ...newExtra, start: event.target.value })} /></label><label>Hasta<input type="time" value={newExtra.end} onChange={(event) => setNewExtra({ ...newExtra, end: event.target.value })} /></label><label>Tipo<select value={newExtra.type} onChange={(event) => setNewExtra({ ...newExtra, type: event.target.value as ExtraType })}><option value="normal">Normal (+50%)</option><option value="holiday">Feriado (+100%)</option></select></label><label className="reason">Motivo (opcional)<select value={newExtra.reason} onChange={(event) => setNewExtra({ ...newExtra, reason: event.target.value })}><option value="">Sin especificar</option><option value="Reunión">Reunión</option><option value="Conducción">Conducción</option><option value="Retiro de material">Retiro de material</option><option value="Cierre de mes">Cierre de mes</option><option value="Otro">Otro</option></select></label>{newExtra.reason === 'Otro' && <label className="custom-reason">Especificar<input placeholder="Describe el motivo" value={newExtra.customReason} onChange={(event) => setNewExtra({ ...newExtra, customReason: event.target.value })} /></label>}<button className="primary" type="button" onClick={addExtra}>Añadir</button></div></article></section>
    <section className="card registered"><div className="card-heading"><h3>Horas extra de este día</h3><span>{extras.length + (nightShift ? 1 : 0)} conceptos</span></div>{nightShift && <p className="night-entry"><b>Trabajo nocturno</b><span>4.0 h extra al 50%</span><strong>{money(4 * hourlyRate * 1.5)}</strong></p>}{extras.length === 0 && !nightShift ? <p className="empty">No hay horas extra. Puedes guardar únicamente tu jornada normal.</p> : <ul>{extras.map((extra) => <li key={extra.id}><div><b>{extra.start} — {extra.end} · {extra.type === 'holiday' ? 'Feriado (+100%)' : 'Normal (+50%)'}</b><span>{extra.reason}</span></div><strong>{money(asHours(extra.start, extra.end) * hourlyRate * (extra.type === 'holiday' ? 2 : 1.5))}</strong><button type="button" onClick={() => setExtras((current) => current.filter((item) => item.id !== extra.id))}>Quitar</button></li>)}</ul>}<button className="save" disabled={loading} type="button" onClick={saveDay}>{loading ? 'Guardando…' : 'Guardar jornada del día'}</button></section>
    <section className="weekly-summary"><div><p className="eyebrow">SEMANA DEL {displayDate(currentWeek)}</p><h3>Resumen de horas trabajadas</h3></div><div><span>Horas normales</span><strong>{weekRegularHours.toFixed(1)} h</strong></div><div><span>Horas extra</span><strong>{weekOvertimeHours.toFixed(1)} h</strong></div><div><span>Total semana</span><strong>{(weekRegularHours + weekOvertimeHours).toFixed(1)} h</strong></div></section>
    <section className="history"><div className="card-heading"><div><p className="eyebrow">HISTORIAL</p><h3>Jornadas guardadas</h3></div><span>{records.length} guardados</span></div>{records.length === 0 ? <p className="empty">Al guardar tu primera jornada aparecerá aquí.</p> : <ul>{records.map((record) => <li key={record.id}><div className="history-details"><b>{displayDate(record.date)}</b><span>{record.regular.toFixed(1)} h normales · {(record.overtime + (record.nightShift ? 4 : 0)).toFixed(1)} h extra{record.nightShift ? ' · incluye nocturno' : ''}</span></div><strong>{money((record.overtimeUnits + (record.nightShift ? 6 : 0)) * hourlyRate)}</strong><div className="history-actions"><button type="button" onClick={() => editRecord(record)}>Editar</button><button type="button" onClick={() => void deleteRecord(record)}>Eliminar</button></div></li>)}</ul>}</section>
    <section className="history-total"><div><p className="eyebrow">TOTAL DEL HISTORIAL</p><h3>Resumen acumulado</h3></div><div><span>Horas normales</span><strong>{historyRegularHours.toFixed(1)} h</strong></div><div><span>Horas extra</span><strong>{historyOvertimeHours.toFixed(1)} h</strong></div><div><span>Monto extra estimado</span><strong>{money(historyAmount)}</strong></div><button className="export" type="button" disabled={records.length === 0} onClick={exportHistory}>Exportar a Excel</button></section>
  </main>;
}
