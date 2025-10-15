import React, { useEffect, useMemo, useRef, useState } from 'react'
import { MapContainer, TileLayer, Marker, Popup, Circle, useMapEvents, useMap } from 'react-leaflet'
import L from 'leaflet'
import { io } from 'socket.io-client'

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080'
const WS_URL = import.meta.env.VITE_WS_URL || 'http://localhost:8080'

const pinIcon = new L.Icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

function useGeolocation() {
  const [pos, setPos] = useState({ lat: 40.0, lng: -74.0 });
  const [error, setError] = useState(null);
  useEffect(() => {
    if (!navigator.geolocation) {
      setError('Geolocation not supported by your browser');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      p => {
        setPos({ lat: p.coords.latitude, lng: p.coords.longitude });
        setError(null);
      },
      err => {
        setError('Unable to get your location. Using default location.');
        console.error('Geolocation error:', err);
      },
      { enableHighAccuracy: true, timeout: 5000 }
    )
  }, []);
  return { pos, error };
}

function ClickToSet({ onSet }) {
  useMapEvents({
    click(e) {
      onSet(e.latlng);
    }
  });
  return null;
}

function MapViewController({ center }) {
  const map = useMap();
  const hasMovedRef = useRef(false);

  useEffect(() => {
    // Only fly to user location on first load, not on every center change
    if (!hasMovedRef.current && center.lat !== 40.0 && center.lng !== -74.0) {
      map.flyTo([center.lat, center.lng], 13);
      hasMovedRef.current = true;
    }
  }, [center, map]);

  return null;
}

const quickReportTypes = [
  { type: 'hazard', icon: '⚠️', title: 'Hazard', color: '#ef4444' },
  { type: 'traffic', icon: '🚦', title: 'Traffic', color: '#f59e0b' },
  { type: 'police', icon: '🚓', title: 'Police', color: '#3b82f6' },
  { type: 'weather', icon: '🌧️', title: 'Weather', color: '#6366f1' },
  { type: 'event', icon: '📅', title: 'Event', color: '#8b5cf6' },
  { type: 'other', icon: '📍', title: 'Other', color: '#6b7280' }
];

export default function App() {
  const { pos: center, error: geoError } = useGeolocation();
  const [alerts, setAlerts] = useState([]);
  const [form, setForm] = useState({ title: '', type: 'hazard', radius_m: 250, ttl_minutes: 120 });
  const [pin, setPin] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [filterType, setFilterType] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [quickReportMode, setQuickReportMode] = useState(false);
  const socketRef = useRef(null);

  useEffect(() => {
    socketRef.current = io(WS_URL, { transports: ['websocket'] });

    socketRef.current.on('connect', () => {
      console.log('WebSocket connected');
      setError(null);
    });

    socketRef.current.on('alert:new', a => {
      setAlerts(prev => [a, ...prev]);
    });

    socketRef.current.on('alert:resolved', ({ id }) => {
      setAlerts(prev => prev.filter(a => a.id !== id));
    });

    socketRef.current.on('connect_error', (err) => {
      console.error('WebSocket connection error:', err);
      setError('Connection lost. Trying to reconnect...');
    });

    socketRef.current.on('disconnect', () => {
      setError('Disconnected from server');
    });

    return () => {
      socketRef.current?.disconnect();
    }
  }, []);

  async function fetchAlerts(lat, lng, type = '') {
    setLoading(true);
    setError(null);
    try {
      const url = new URL(`${API_BASE}/api/alerts`);
      url.searchParams.set('lat', lat);
      url.searchParams.set('lng', lng);
      url.searchParams.set('radius', 5000);
      if (type) url.searchParams.set('type', type);

      const res = await fetch(url.toString());
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();
      if (data.ok) {
        setAlerts(data.alerts);
      } else {
        throw new Error(data.error || 'Failed to fetch alerts');
      }
    } catch (err) {
      console.error('Error fetching alerts:', err);
      setError('Failed to load alerts. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchAlerts(center.lat, center.lng, filterType);
  }, [center.lat, center.lng, filterType]);

  async function submitAlert() {
    if (!pin) return;
    setLoading(true);
    setError(null);
    try {
      const body = {
        title: form.title,
        type: form.type,
        description: form.description || '',
        lat: pin.lat,
        lng: pin.lng,
        radius_m: Number(form.radius_m),
        ttl_minutes: Number(form.ttl_minutes)
      };
      const res = await fetch(`${API_BASE}/api/alerts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (!res.ok) {
        if (res.status === 429) {
          throw new Error('Rate limit exceeded. Please wait before posting again.');
        }
        throw new Error(`HTTP ${res.status}`);
      }

      const data = await res.json();
      if (data.ok) {
        setForm({ title: '', type: 'hazard', radius_m: 500, ttl_minutes: 120, description: '' });
        setPin(null);
      } else {
        throw new Error(data.error || 'Failed to create alert');
      }
    } catch (err) {
      console.error('Error creating alert:', err);
      setError(err.message || 'Failed to create alert. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function resolveAlert(alertId) {
    try {
      const res = await fetch(`${API_BASE}/api/alerts/${alertId}/resolve`, {
        method: 'PATCH'
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data = await res.json();
      if (!data.ok) {
        throw new Error(data.error || 'Failed to resolve alert');
      }
    } catch (err) {
      console.error('Error resolving alert:', err);
      setError(err.message || 'Failed to resolve alert. Please try again.');
    }
  }

  function startQuickReport(type) {
    const typeInfo = quickReportTypes.find(t => t.type === type);
    setForm({
      title: typeInfo.title + ' Alert',
      type: type,
      radius_m: 250,
      ttl_minutes: 120,
      description: ''
    });
    setQuickReportMode(true);
    setShowAdvanced(false);
  }

  async function submitQuickReport() {
    if (!pin) {
      setError('Please tap the map to set alert location');
      return;
    }
    await submitAlert();
    setQuickReportMode(false);
  }

  return (
    <div style={{display:'grid', gridTemplateColumns:'360px 1fr', height:'100vh', fontFamily:'system-ui, sans-serif'}}>
      <div style={{padding:'12px', borderRight:'1px solid #ddd', overflow:'auto'}}>
        <h2>Community Signal</h2>
        {(error || geoError) && (
          <div style={{padding:'8px', background:'#fee', color:'#c33', borderRadius:4, fontSize:14, marginBottom:8}}>
            {error || geoError}
          </div>
        )}

        {!quickReportMode ? (
          <>
            <h3 style={{marginTop:0, marginBottom:8}}>Quick Report</h3>
            <p style={{fontSize:14, margin:'0 0 12px', color:'#666'}}>Tap icon → Tap map → Done</p>
            <div style={{display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:8, marginBottom:16}}>
              {quickReportTypes.map(qt => (
                <button
                  key={qt.type}
                  onClick={() => startQuickReport(qt.type)}
                  style={{
                    padding:'12px',
                    background: qt.color,
                    color:'white',
                    border:'none',
                    borderRadius:8,
                    cursor:'pointer',
                    fontSize:24,
                    display:'flex',
                    flexDirection:'column',
                    alignItems:'center',
                    gap:4
                  }}
                  title={`Report ${qt.title}`}
                >
                  <span>{qt.icon}</span>
                  <span style={{fontSize:11}}>{qt.title}</span>
                </button>
              ))}
            </div>

            <details>
              <summary style={{cursor:'pointer', fontWeight:600, marginBottom:8}}>Custom Report</summary>
              <div style={{display:'grid', gap:'8px', marginTop:8}}>
                <input placeholder="Title" value={form.title} onChange={e=>setForm({...form, title:e.target.value})}/>
                <select value={form.type} onChange={e=>setForm({...form, type:e.target.value})}>
                  <option value="hazard">Hazard</option>
                  <option value="traffic">Traffic</option>
                  <option value="police">Police</option>
                  <option value="weather">Weather</option>
                  <option value="event">Event</option>
                  <option value="other">Other</option>
                </select>
                <textarea placeholder="Description (optional)" rows={3} value={form.description||''} onChange={e=>setForm({...form, description:e.target.value})}></textarea>

                <details>
                  <summary style={{cursor:'pointer', fontSize:13, color:'#666'}}>Advanced Options</summary>
                  <div style={{display:'grid', gap:8, marginTop:8}}>
                    <label>Radius (m): <input type="number" value={form.radius_m} onChange={e=>setForm({...form, radius_m:e.target.value})}/></label>
                    <label>TTL (minutes): <input type="number" value={form.ttl_minutes} onChange={e=>setForm({...form, ttl_minutes:e.target.value})}/></label>
                  </div>
                </details>

                <button disabled={!pin || !form.title || loading} onClick={submitAlert}>
                  {loading ? 'Posting...' : 'Post Alert'}
                </button>
                {pin && <div style={{fontSize:12, color:'#555'}}>Pin at lat {pin.lat.toFixed(4)}, lng {pin.lng.toFixed(4)}</div>}
              </div>
            </details>
          </>
        ) : (
          <div style={{background:'#f9fafb', padding:12, borderRadius:8, border:'2px solid #3b82f6'}}>
            <div style={{display:'flex', alignItems:'center', gap:8, marginBottom:12}}>
              <span style={{fontSize:32}}>{quickReportTypes.find(t => t.type === form.type)?.icon}</span>
              <div style={{flex:1}}>
                <div style={{fontWeight:600, fontSize:16}}>{form.title}</div>
                <div style={{fontSize:12, color:'#666'}}>Tap map to set location</div>
              </div>
            </div>

            <textarea
              placeholder="Add details (optional)"
              rows={2}
              value={form.description||''}
              onChange={e=>setForm({...form, description:e.target.value})}
              style={{width:'100%', marginBottom:8, padding:8, borderRadius:4, border:'1px solid #ddd'}}
            ></textarea>

            {pin && (
              <div style={{fontSize:12, color:'#555', marginBottom:8, display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                <span>📍 Location set</span>
                <button
                  onClick={() => setPin(null)}
                  style={{
                    padding:'2px 8px',
                    fontSize:11,
                    background:'transparent',
                    color:'#ef4444',
                    border:'1px solid #ef4444',
                    borderRadius:4,
                    cursor:'pointer'
                  }}
                >
                  Clear Pin
                </button>
              </div>
            )}

            <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:8}}>
              <button
                onClick={() => {setQuickReportMode(false); setPin(null);}}
                style={{padding:8, background:'#6b7280', color:'white', border:'none', borderRadius:4, cursor:'pointer'}}
              >
                Cancel
              </button>
              <button
                disabled={!pin || loading}
                onClick={submitQuickReport}
                style={{
                  padding:8,
                  background: pin ? '#10b981' : '#d1d5db',
                  color:'white',
                  border:'none',
                  borderRadius:4,
                  cursor: pin ? 'pointer' : 'not-allowed',
                  fontWeight:600
                }}
              >
                {loading ? 'Posting...' : pin ? 'Post Alert' : 'Set Location'}
              </button>
            </div>
          </div>
        )}

        <h3 style={{marginTop:16}}>Nearby Alerts</h3>
        <div style={{marginBottom:8}}>
          <label style={{fontSize:14}}>Filter by type: </label>
          <select value={filterType} onChange={e=>setFilterType(e.target.value)} style={{fontSize:14}}>
            <option value="">All</option>
            <option value="hazard">Hazard</option>
            <option value="traffic">Traffic</option>
            <option value="police">Police</option>
            <option value="weather">Weather</option>
            <option value="event">Event</option>
            <option value="other">Other</option>
          </select>
        </div>
        {loading && <div style={{fontSize:14, color:'#666'}}>Loading...</div>}
        <div style={{display:'grid', gap:'8px'}}>
          {alerts.map(a=> (
            <div key={a.id} style={{border:'1px solid #ddd', borderRadius:8, padding:8}}>
              <div style={{display:'flex', justifyContent:'space-between', alignItems:'start'}}>
                <div style={{flex:1}}>
                  <div style={{fontWeight:600}}>{a.title} <span style={{fontSize:12, color:'#666'}}>({a.type})</span></div>
                  <div style={{fontSize:12, color:'#666'}}>Radius {a.radius_m}m • {new Date(a.created_at).toLocaleString()}</div>
                  {a.description && <div style={{marginTop:4, fontSize:14}}>{a.description}</div>}
                </div>
                <button
                  onClick={() => resolveAlert(a.id)}
                  style={{
                    marginLeft:8,
                    padding:'4px 8px',
                    fontSize:12,
                    background:'#10b981',
                    color:'white',
                    border:'none',
                    borderRadius:4,
                    cursor:'pointer'
                  }}
                  title="Mark as resolved"
                >
                  ✓ Clear
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <MapContainer center={[40.0, -74.0]} zoom={13} style={{height:'100%', width:'100%'}}>
          <TileLayer
            attribution='&copy; OpenStreetMap contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <MapViewController center={center} />
          <ClickToSet onSet={setPin} />
          {pin && (
            <>
              <Marker position={[pin.lat, pin.lng]} icon={pinIcon}>
                <Popup>New alert location</Popup>
              </Marker>
              <Circle
                center={[pin.lat, pin.lng]}
                radius={Number(form.radius_m) || 500}
                pathOptions={{color: '#0ea5e9', fillColor: '#0ea5e9', fillOpacity: 0.2}}
              />
            </>
          )}
          {alerts.map(a => (
            <React.Fragment key={a.id}>
              <Marker position={[a.lat, a.lng]} icon={pinIcon}>
                <Popup>
                  <strong>{a.title}</strong><br/>
                  {a.type} • radius {a.radius_m}m<br/>
                  {a.description}
                </Popup>
              </Marker>
              <Circle
                center={[a.lat, a.lng]}
                radius={a.radius_m}
                pathOptions={{color: '#f59e0b', fillColor: '#f59e0b', fillOpacity: 0.15}}
              />
            </React.Fragment>
          ))}
        </MapContainer>
      </div>
    </div>
  )
}
