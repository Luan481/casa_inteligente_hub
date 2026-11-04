'use client';

import { useEffect, useState } from 'react';
import { Activity, ArrowDownToLine, ArrowUpRight, ChevronRight, Cpu, Droplets, House, LayoutDashboard, Radio, Ruler, Thermometer, Wifi } from 'lucide-react';
import { connectMQTT, type MQTTStatus } from '@/services/mqtts';
import { createSimulatedSensorData, startSensorSimulation } from '@/services/sensorSimulation';
import type { SensorData } from '@/types/SensorData';

type Reading = { data: SensorData; time: number };
type Metric = 'temperatura' | 'umidade' | 'distancia';
const initialMode = process.env.NEXT_PUBLIC_SENSOR_MODE === 'simulation' || (!process.env.NEXT_PUBLIC_MQTT_URL && !process.env.NEXT_PUBLIC_HIVEMQ_HOST) ? 'simulation' : 'real';
const statusLabels: Record<MQTTStatus, string> = { connecting: 'Conectando', connected: 'MQTT conectado', reconnecting: 'Reconectando', disconnected: 'MQTT desconectado', error: 'Erro de conexão' };
const metrics = {
  temperatura: { label: 'Temperatura', unit: '°C', icon: Thermometer, sensor: 'DHT22', color: 'orange' },
  umidade: { label: 'Umidade', unit: '%', icon: Droplets, sensor: 'DHT22', color: 'blue' },
  distancia: { label: 'Distância', unit: 'cm', icon: Ruler, sensor: 'Ultrassônico', color: 'purple' },
} as const;
const number = (value: number) => value.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const time = (value: number) => new Date(value).toLocaleTimeString('pt-BR');

export default function Dashboard() {
  const [mode, setMode] = useState<'real' | 'simulation'>(initialMode);
  const [status, setStatus] = useState<MQTTStatus>('connecting');
  const [history, setHistory] = useState<Reading[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [invalidMessage, setInvalidMessage] = useState<string | null>(null);
  const [metric, setMetric] = useState<Metric>('temperatura');
  const [now, setNow] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const simulated = mode === 'simulation';
  const latest = history.at(-1);
  const data = latest?.data ?? (simulated ? createSimulatedSensorData(0) : null);
  const stale = !simulated && !!latest && (now - latest.time > 15000 || status !== 'connected');

  useEffect(() => {
    const clock = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(clock);
  }, []);

  useEffect(() => {
    const receive = (data: SensorData) => {
      setHistory((previous) => [...previous.slice(-59), { data, time: Date.now() }]);
      setInvalidMessage(null);
    };
    if (mode === 'simulation') {
      receive(createSimulatedSensorData(0));
      return startSensorSimulation(receive);
    }
    // A conexão só é carregada no navegador e é encerrada ao trocar a fonte.
    return connectMQTT({
      onStatus: (value) => { setStatus(value); if (value === 'connected') setError(null); },
      onMessage: receive,
      onError: (value) => setError(value.message),
      onInvalidMessage: (value) => setInvalidMessage(value.message),
    });
  }, [mode, attempt]);

  function changeMode(next: 'real' | 'simulation') {
    if (next === mode) return;
    setHistory([]); setError(null); setInvalidMessage(null); setStatus('connecting'); setMode(next);
  }

  function exportReadings() {
    const rows = ['fonte,recebido_em,temperatura_c,umidade_percentual,distancia_cm,movimento', ...history.map(({ data: d, time: t }) => [mode, new Date(t).toISOString(), d.temperatura, d.umidade, d.distancia, d.movimento].join(','))];
    const url = URL.createObjectURL(new Blob(['\uFEFF' + rows.join('\r\n')], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = `casa-sensores-${mode}.csv`; link.click(); URL.revokeObjectURL(url);
  }

  const values = history.map((item) => item.data[metric]);
  const min = Math.min(...values); const max = Math.max(...values);
  const padding = Math.max((max - min) * 0.3, 1);
  const low = min - padding; const high = max + padding;
  const points = values.map((v, i) => `${40 + i / Math.max(values.length - 1, 1) * 720},${190 - (v - low) / (high - low) * 155}`).join(' ');

  return <div className="shell">
    <aside className="sidebar">
      <a href="#overview" className="brand"><span className="brand-icon"><House size={23} /></span><span>casa<span className="brand-light"> inteligente</span><small>SEU ESPAÇO, CONECTADO.</small></span></a>
      <div className="workspace"><span className="home-icon"><House size={19} /></span><div>Minha casa<small>Central de monitoramento</small></div><ChevronRight size={16} /></div>
      <p className="nav-label">PRINCIPAL</p>
      <nav aria-label="Navegação principal"><a className="active" href="#overview"><LayoutDashboard size={18} />Visão geral<span className="nav-dot" /></a><a href="#sensors"><Radio size={18} />Sensores</a><a href="#history"><Activity size={18} />Histórico da sessão</a><a href="#connection"><Wifi size={18} />Conexão</a></nav>
      <div className="sidebar-bottom"><div className="device-icon"><Cpu size={22} /></div><strong>Uma casa mais inteligente.</strong><p>Todos os seus sensores.<br />Uma só visão.</p><span className="version">CASA HUB <span>v1.0</span></span></div>
    </aside>
    <div className="main-wrap">
      <header className="topbar"><div><span className="breadcrumb">Minha casa</span><ChevronRight size={14} /><span>Visão geral</span></div><span className="topbar-right"><span className="dot" /> Monitoramento ESP32</span></header>
      <main id="overview">
        <div className="page-heading"><div><p className="eyebrow">CONECTE. ACOMPANHE. CUIDE.</p><h1>Sua casa, em tempo real<span>.</span></h1><p>Um olhar para tudo o que acontece no seu ambiente.</p></div><button className="button secondary" onClick={exportReadings} disabled={!history.length}><ArrowDownToLine size={16} />Exportar leituras</button></div>
        <section className="source-bar" aria-label="Fonte das leituras"><div><span className={`dot ${simulated ? 'amber' : status === 'connected' ? '' : 'gray'}`} /><strong>{simulated ? 'Simulação ativa' : statusLabels[status]}</strong><span className="source-description">{simulated ? 'Explore o painel com dados fictícios a cada 2 segundos.' : 'Leituras recebidas pelo tópico dos sensores.'}</span></div><div className="segmented"><button aria-pressed={simulated} className={simulated ? 'selected' : ''} onClick={() => changeMode('simulation')}>Simulação</button><button aria-pressed={!simulated} className={!simulated ? 'selected' : ''} onClick={() => changeMode('real')}>Dados reais</button></div></section>
        {error && <div className="notice error" role="alert">{error} <button onClick={() => { setError(null); setStatus('connecting'); setAttempt((v) => v + 1); }}>Tentar novamente</button></div>}
        {invalidMessage && <div className="notice error" role="alert">{invalidMessage}</div>}
        {stale && <div className="notice" role="status">Sem atualização recente. Exibindo a última mensagem válida recebida.</div>}
        {!simulated && !latest && <div className="notice" role="status">{status === 'connected' ? 'Conectado ao broker. Aguardando leituras do ESP32.' : 'Aguardando conexão e leituras dos sensores.'}</div>}
        <section id="sensors" className="sensor-grid" aria-label="Sensores">
          {(Object.keys(metrics) as Metric[]).map((key) => { const m = metrics[key]; const Icon = m.icon; return <article key={key} className="sensor-card"><div className="card-top"><span className={`icon-box ${m.color}`}><Icon size={21} /></span><span className="sensor-model">{m.sensor}</span></div><h2>{m.label}</h2><div className="sensor-value">{data ? number(data[key]) : '—'}<span>{m.unit}</span></div><div className="card-bottom"><span className={`dot ${!data || stale ? 'gray' : ''}`} />{!data ? 'Aguardando leitura' : simulated ? 'Leitura simulada' : stale ? 'Última leitura recebida' : 'Leitura recebida'}</div></article>; })}
          
        </section>
        <div className="details-grid">
          <section id="history" className="panel chart-panel"><div className="panel-heading"><div><h2>O ambiente ao longo do tempo</h2><p>Até 60 leituras recebidas nesta sessão</p></div><span className="pill">{simulated ? 'Simulação' : 'Dados reais'}</span></div><div className="chart-controls"><div className="chart-tabs" aria-label="Grandeza do gráfico">{(Object.keys(metrics) as Metric[]).map((key) => <button key={key} aria-pressed={key === metric} onClick={() => setMetric(key)} className={key === metric ? 'chosen' : ''}>{metrics[key].label}</button>)}</div><span>{metrics[metric].unit}</span></div><div className="chart">{history.length > 1 ? <svg viewBox="0 0 800 225" role="img" aria-label={`Gráfico de ${metrics[metric].label.toLowerCase()} com ${history.length} leituras; mínimo ${number(min)}, máximo ${number(max)} ${metrics[metric].unit}`}><defs><linearGradient id="chart-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#26ce7b" stopOpacity=".22" /><stop offset="100%" stopColor="#26ce7b" stopOpacity="0" /></linearGradient></defs>{[35, 85, 135, 190].map((y, i) => <g key={y}><line x1="40" x2="760" y1={y} y2={y} stroke="#24403c" strokeDasharray="4 6" /><text x="2" y={y + 4} fill="#8ba39c" fontSize="11">{number(high - i / 3 * (high - low))}</text></g>)}<polygon points={`40,200 ${points} 760,200`} fill="url(#chart-fill)" /><polyline points={points} fill="none" stroke="#38d994" strokeWidth="2.5" strokeLinejoin="round" /></svg> : <div className="empty-chart"><Activity size={28} /><p>Aguardando mais leituras para desenhar o gráfico.</p></div>}</div><div className="chart-footer"><span>{history[0] ? time(history[0].time) : 'Início da sessão'}</span><span>{latest ? time(latest.time) : 'Aguardando dados'}</span></div></section>
          <section id="connection" className="panel connection-panel"><div className="panel-heading"><div><h2>Central de conexão</h2><p>Do sensor até a sua tela</p></div><Wifi size={19} /></div><div className="connection-visual"><span className="cpu-ring"><Cpu size={36} /></span><span className={`connection-tag ${simulated ? 'demo' : ''}`}>{simulated ? 'Modo demonstração' : statusLabels[status]}</span></div><dl><div><dt>Dispositivo</dt><dd>ESP32</dd></div><div><dt>Fonte</dt><dd>{simulated ? 'Simulação local' : 'MQTT · WebSocket'}</dd></div><div><dt>Tópico</dt><dd>{process.env.NEXT_PUBLIC_MQTT_TOPIC || 'casa/sensores'}</dd></div><div><dt>Último recebimento</dt><dd>{latest ? time(latest.time) : '—'}</dd></div></dl><p className="connection-note">{simulated ? 'Os dados são gerados neste navegador. Nenhuma mensagem é publicada no broker.' : 'A conexão com o broker não confirma que o ESP32 está online. O horário indica o recebimento da mensagem.'}</p></section>
        </div>
        <section className="session-panel panel"><div className="panel-heading"><div><h2>Últimas leituras</h2><p>{simulated ? 'Dados fictícios para explorar o painel' : 'Mensagens válidas recebidas do broker'}</p></div><span className="reading-count">{history.length} nesta sessão <ArrowUpRight size={15} /></span></div><div className="table-scroll"><table><thead><tr><th>Recebida às</th><th>Temperatura</th><th>Umidade</th><th>Distância</th></tr></thead><tbody>{history.slice(-5).reverse().map((r, i) => <tr key={`${r.time}-${i}`}><td>{time(r.time)}</td><td>{number(r.data.temperatura)} °C</td><td>{number(r.data.umidade)} %</td><td>{number(r.data.distancia)} cm</td></tr>)}{!history.length && <tr><td colSpan={4} className="empty-row">As leituras aparecerão aqui quando forem recebidas.</td></tr>}</tbody></table></div></section>
        <footer><span><House size={14} /> Casa inteligente</span><span>{simulated ? 'Dados de demonstração' : 'Monitoramento via MQTT'}<span className="footer-separator">·</span>Histórico mantido somente nesta sessão</span></footer>
      </main>
    </div>
  </div>;
}
