import { FormEvent, useMemo, useState } from 'react';

type ExtraType = 'normal' | 'holiday';
type ExtraHour = { id: number; start: string; end: string; reason: string; type: ExtraType };
type DayRecord = { id: number; date: string; regular: number; overtime: number; overtimeUnits: number };

const asHours = (start: string, end: string) => {
  const [startHour, startMinute] = start.split(':').map(Number);
  const [endHour, endMinute] = end.split(':').map(Number);
  return Math.max(0, (endHour * 60 + endMinute - startHour * 60 - startMinute) / 60);
};

const money = (amount: number) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(amount);
const displayDate = (date: string) => new Intl.DateTimeFormat('es-CL', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${date}T12:00:00`));
const weekKey = (date: string) => {
  const value = new Date(`${date}T12:00:00`);
  const day = value.getDay() || 7;
  value.setDate(value.getDate() - day + 1);
  return value.toISOString().slice(0, 10);
};

function Access({ onAccess }: { onAccess: () => void }) {
  const [isRegistering, setIsRegistering] = useState(false);
  function submit(event: FormEvent) { event.preventDefault(); onAccess(); }
  return <main className="access"><section className="access-intro"><p className="eyebrow">JORNADA+</p><h1>Tu tiempo,<br /><span>bien registrado.</span></h1><p>Registra tu jornada, calcula horas extra y mantén tu historial laboral en un solo lugar.</p></section><section className="access-card"><p className="eyebrow">{isRegistering ? 'CREAR CUENTA' : 'BIENVENIDO/A'}</p><h2>{isRegistering ? 'Comencemos' : 'Inicia sesión'}</h2><form onSubmit={submit}><label>Correo electrónico<input type="email" placeholder="tu@correo.com" required /></label>{isRegistering && <label>Nombre completo<input placeholder="Cómo quieres aparecer" required /></label>}<label>Contraseña<input type="password" placeholder="••••••••" minLength={8} required /></label><button className="primary full" type="submit">{isRegistering ? 'Crear cuenta' : 'Entrar a mi registro'}</button></form><p className="switch">{isRegistering ? '¿Ya tienes cuenta?' : '¿Aún no tienes cuenta?'} <button type="button" onClick={() => setIsRegistering(!isRegistering)}>{isRegistering ? 'Inicia sesión' : 'Créala aquí'}</button></p></section></main>;
}

export default function App() {
  const [authenticated, setAuthenticated] = useState(false);
  const [showProfile, setShowProfile] = useState(true);
  const [monthlySalary, setMonthlySalary] = useState(700000);
  const [weeklyHours, setWeeklyHours] = useState(42);
  const [checkIn, setCheckIn] = useState('09:00');
  const [checkOut, setCheckOut] = useState('18:00');
  const [workDate, setWorkDate] = useState('2026-07-10');
  const [breakMinutes, setBreakMinutes] = useState(60);
  const [extras, setExtras] = useState<ExtraHour[]>([]);
  const [records, setRecords] = useState<DayRecord[]>([]);
  const [saved, setSaved] = useState(false);
  const [newExtra, setNewExtra] = useState({ start: '18:00', end: '19:00', reason: '', type: 'normal' as ExtraType });

  // Fórmula de referencia chilena: remuneración semanal / horas semanales pactadas.
  const hourlyRate = (monthlySalary / 30 * 7) / weeklyHours;
  const regularHours = Math.max(0, asHours(checkIn, checkOut) - breakMinutes / 60);
  const overtimeHours = useMemo(() => extras.reduce((sum, item) => sum + asHours(item.start, item.end), 0), [extras]);
  const overtimeAmount = useMemo(() => extras.reduce((sum, item) => sum + asHours(item.start, item.end) * hourlyRate * (item.type === 'holiday' ? 2 : 1.5), 0), [extras, hourlyRate]);
  const currentWeek = weekKey(workDate);
  const weekRecords = records.filter((record) => weekKey(record.date) === currentWeek);
  const weekRegularHours = weekRecords.reduce((sum, record) => sum + record.regular, 0);
  const weekOvertimeHours = weekRecords.reduce((sum, record) => sum + record.overtime, 0);

  function addExtra() {
    if (!newExtra.reason.trim() || asHours(newExtra.start, newExtra.end) === 0) return;
    setExtras((current) => [...current, { id: Date.now(), ...newExtra, reason: newExtra.reason.trim() }]);
    setNewExtra({ start: newExtra.end, end: newExtra.end, reason: '', type: 'normal' });
    setSaved(false);
  }
  function saveDay() {
    // Guardamos horas ponderadas, no dinero: el monto siempre se recalcula con el sueldo actual.
    const overtimeUnits = extras.reduce((sum, item) => sum + asHours(item.start, item.end) * (item.type === 'holiday' ? 2 : 1.5), 0);
    const record = { id: Date.now(), date: workDate, regular: regularHours, overtime: overtimeHours, overtimeUnits };
    setRecords((current) => [record, ...current.filter((item) => item.date !== workDate)]);
    setSaved(true);
  }
  if (!authenticated) return <Access onAccess={() => setAuthenticated(true)} />;

  return <main className="app-shell"><header><div><p className="eyebrow">TU CONTROL PERSONAL</p><h1>Jornada<span>+</span></h1></div><nav><button type="button" onClick={() => setShowProfile(!showProfile)}>Mi perfil</button><button className="profile" type="button" onClick={() => setAuthenticated(false)}>FR</button></nav></header>
    {showProfile && <section className="profile-panel"><div><p className="eyebrow">CONFIGURACIÓN DE PAGO</p><h3>¿Cuánto vale tu hora?</h3><p>Usamos tu sueldo y jornada semanal pactada para estimar las horas extra. Podrás corregirlos cuando quieras.</p></div><div className="salary-fields"><label>Sueldo mensual base (CLP)<input type="number" min="0" value={monthlySalary} onChange={(event) => setMonthlySalary(Number(event.target.value))} /></label><label>Horas semanales pactadas<input type="number" min="1" max="60" value={weeklyHours} onChange={(event) => setWeeklyHours(Number(event.target.value))} /></label><div className="rate"><span>VALOR HORA BASE</span><strong>{money(hourlyRate)}</strong></div></div></section>}
    <section className="hero"><div><p className="eyebrow">REGISTRO DIARIO</p><h2>Registra tu jornada</h2><p>Guarda sólo tu jornada normal si no hiciste horas extra. Los bloques extra siempre son opcionales.</p><label className="date-picker">Fecha de la jornada<input type="date" value={workDate} onChange={(event) => { setWorkDate(event.target.value); setSaved(false); }} /></label></div><div className="total-card"><span>PAGO EXTRA DEL DÍA</span><strong>{money(overtimeAmount)}</strong><small>{overtimeHours.toFixed(1)} h extra</small></div></section>
    <section className="grid"><article className="card"><div className="card-heading"><h3>Jornada normal</h3><span>Registro diario</span></div><div className="fields three-columns"><label>Ingreso<input type="time" value={checkIn} onChange={(event) => { setCheckIn(event.target.value); setSaved(false); }} /></label><label>Salida<input type="time" value={checkOut} onChange={(event) => { setCheckOut(event.target.value); setSaved(false); }} /></label><label>Colación (min)<input type="number" min="0" max="720" value={breakMinutes} onChange={(event) => { setBreakMinutes(Number(event.target.value)); setSaved(false); }} /></label></div><p className="calculation">Total trabajado: <b>{regularHours.toFixed(1)} horas</b></p></article>
      <article className="card"><div className="card-heading"><h3>Agregar hora extra</h3><span>Opcional</span></div><div className="fields extra-fields"><label>Desde<input type="time" value={newExtra.start} onChange={(event) => setNewExtra({ ...newExtra, start: event.target.value })} /></label><label>Hasta<input type="time" value={newExtra.end} onChange={(event) => setNewExtra({ ...newExtra, end: event.target.value })} /></label><label>Tipo<select value={newExtra.type} onChange={(event) => setNewExtra({ ...newExtra, type: event.target.value as ExtraType })}><option value="normal">Normal (+50%)</option><option value="holiday">Feriado (+100%)</option></select></label><label className="reason">Motivo<input placeholder="Ej.: cierre de mes" value={newExtra.reason} onChange={(event) => setNewExtra({ ...newExtra, reason: event.target.value })} /></label><button className="primary" type="button" onClick={addExtra}>Añadir</button></div></article></section>
    <section className="card registered"><div className="card-heading"><h3>Horas extra de este día</h3><span>{extras.length} bloques</span></div>{extras.length === 0 ? <p className="empty">No hay horas extra. Puedes guardar únicamente tu jornada normal.</p> : <ul>{extras.map((extra) => <li key={extra.id}><div><b>{extra.start} — {extra.end} · {extra.type === 'holiday' ? 'Feriado (+100%)' : 'Normal (+50%)'}</b><span>{extra.reason}</span></div><strong>{money(asHours(extra.start, extra.end) * hourlyRate * (extra.type === 'holiday' ? 2 : 1.5))}</strong><button type="button" onClick={() => { setExtras((current) => current.filter((item) => item.id !== extra.id)); setSaved(false); }}>Quitar</button></li>)}</ul>}<button className="save" type="button" onClick={saveDay}>{saved ? '✓ Jornada guardada' : 'Guardar jornada del día'}</button></section>
    <section className="weekly-summary"><div><p className="eyebrow">SEMANA DEL {displayDate(currentWeek)}</p><h3>Resumen de horas trabajadas</h3></div><div><span>Horas normales</span><strong>{weekRegularHours.toFixed(1)} h</strong></div><div><span>Horas extra</span><strong>{weekOvertimeHours.toFixed(1)} h</strong></div><div><span>Total semana</span><strong>{(weekRegularHours + weekOvertimeHours).toFixed(1)} h</strong></div></section>
    <section className="history"><div className="card-heading"><div><p className="eyebrow">HISTORIAL</p><h3>Jornadas guardadas</h3></div><span>{records.length} guardados</span></div>{records.length === 0 ? <p className="empty">Al guardar tu primera jornada aparecerá aquí.</p> : <ul>{records.map((record) => <li key={record.id}><b>{displayDate(record.date)}</b><span>{record.regular.toFixed(1)} h normales · {record.overtime.toFixed(1)} h extra</span><strong>{money(record.overtimeUnits * hourlyRate)}</strong></li>)}</ul>}</section>
  </main>;
}
