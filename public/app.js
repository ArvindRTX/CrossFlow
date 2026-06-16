// Application State
let state = {
  gates: {},
  weather: { temp: 28, precipitation: 0.0, condition: 'Clear', lastUpdated: Date.now() },
  trains: [],
  logs: []
};

let previousGateStatus = {}; // To detect status changes for audio/push notifications
let isSpeechEnabled = true;
let syncInterval = null;
let lastSyncTimestamp = null;

// Leaflet Map objects
let map = null;
let userMarker = null;
let gateMarkers = {};
let trainMarkers = {};
let trackLine = null;

// Coordinates coordinates database for rendering
const GATE_LOCATIONS = {
  'lc-83': { name: 'Pavoorchatram (LC-83)', coords: [8.9036, 77.4095] },
  'lc-82': { name: 'Keelapuliyur (LC-82)', coords: [8.9412, 77.3885] },
  'lc-84': { name: 'Tenkasi East (LC-84)', coords: [8.9568, 77.3178] }
};

// Sengottai-Tirunelveli Rail coordinates for polyline track
const RAILWAY_TRACK_COORDS = [
  [8.9814, 77.2583], // Sengottai
  [8.9585, 77.3117], // Tenkasi Jn
  [8.9412, 77.3885], // Keelapuliyur Crossing (LC-82)
  [8.9068, 77.4082], // Pavoorchatram
  [8.7995, 77.4580], // Kizha Ambur
  [8.7061, 77.4578], // Ambasamudram
  [8.6806, 77.5645], // Cheranmahadevi
  [8.7292, 77.6974]  // Tirunelveli Jn
];

// Weather Emojis mapping
const WEATHER_EMOJIS = {
  'Clear': '☀️',
  'Partly Cloudy': '⛅',
  'Cloudy': '☁️',
  'Drizzle/Rain': '🌧️',
  'Rain Showers': '🌦️'
};

document.addEventListener('DOMContentLoaded', () => {
  // Setup Voice Announcement Toggle
  const voiceToggleBtn = document.getElementById('voice-alert-toggle');
  const storedVoiceSetting = localStorage.getItem('crossflow_voice');
  if (storedVoiceSetting !== null) {
    isSpeechEnabled = storedVoiceSetting === 'true';
    if (!isSpeechEnabled) {
      voiceToggleBtn.classList.remove('active');
    }
  }

  voiceToggleBtn.addEventListener('click', () => {
    isSpeechEnabled = !isSpeechEnabled;
    localStorage.setItem('crossflow_voice', isSpeechEnabled);
    if (isSpeechEnabled) {
      voiceToggleBtn.classList.add('active');
      speak("Voice alerts enabled.");
    } else {
      voiceToggleBtn.classList.remove('active');
    }
  });

  // Setup Manual Sync Button
  const refreshBtn = document.getElementById('refresh-btn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', triggerManualSync);
  }

  // Ask for notification permission
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }

  // Initialize Map
  initMap();

  // Initialize Geolocation tracking
  initGeolocation();

  // Initial Fetch & Start Sync Loop (Every 30 seconds for status polling)
  syncState();
  syncInterval = setInterval(syncState, 30000);

  // Periodic UI Updates for countdown timers and relative sync time (Every second)
  setInterval(() => {
    updateTrainScheduleCountdowns();
    updateRelativeSyncTime();
  }, 1000);
});

// Initialize Leaflet Map
function initMap() {
  try {
    // Center map around Pavoorchatram
    map = L.map('map').setView([8.92, 77.36], 12);

    // Load CartoDB Dark Matter tiles
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 20
    }).addTo(map);

    // Draw the Railway tracks polyline (dashed cyan line)
    trackLine = L.polyline(RAILWAY_TRACK_COORDS, {
      color: '#0ea5e9',
      weight: 3,
      dashArray: '8, 8',
      opacity: 0.6
    }).addTo(map);

    // Plot Level Crossings as circle markers
    Object.keys(GATE_LOCATIONS).forEach(gateId => {
      const gate = GATE_LOCATIONS[gateId];
      const marker = L.circleMarker(gate.coords, {
        radius: 10,
        fillColor: '#10b981', // green initially
        color: '#ffffff',
        weight: 1.5,
        fillOpacity: 0.8
      }).addTo(map);
      
      marker.bindPopup(`<strong>${gate.name}</strong><br>Status: Syncing...`);
      gateMarkers[gateId] = marker;
    });

    // Listen for zoom changes to dynamically adjust overlapping markers
    map.on('zoomend', () => {
      updateMapTrainMarkers();
    });

  } catch (error) {
    console.error('Error initializing Leaflet map:', error);
  }
}

// Watch user location using HTML5 Geolocation API
function initGeolocation() {
  if (navigator.geolocation) {
    navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude, accuracy } = position.coords;
        const latlng = [latitude, longitude];

        if (!userMarker) {
          // Create user location dot
          userMarker = L.circleMarker(latlng, {
            radius: 8,
            fillColor: '#3b82f6', // blue dot
            color: '#ffffff',
            weight: 2,
            fillOpacity: 0.9
          }).addTo(map);
          userMarker.bindPopup('Your Location (GPS)');
          
          // Pan map to user location on first match
          map.panTo(latlng);
        } else {
          userMarker.setLatLng(latlng);
        }
      },
      (error) => {
        console.warn('Geolocation access failed:', error.message);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      }
    );
  } else {
    console.warn('Geolocation is not supported by this browser.');
  }
}

// Sync data with local backend server
async function syncState() {
  try {
    const response = await fetch('/api/status');
    if (!response.ok) throw new Error('API server down');

    const data = await response.json();
    state.gates = data.gates;
    state.weather = data.weather;
    state.trains = data.trains;
    state.logs = data.logs;

    // Detect state alterations for speech synthesizer
    detectGateChanges();

    // Render components
    updateDashboardUI();

    lastSyncTimestamp = Date.now();
    updateRelativeSyncTime();
    document.getElementById('connection-status').innerText = 'Online API Sync';
    document.getElementById('connection-status').className = 'indicator-green';
  } catch (error) {
    console.error('State sync failed:', error);
    lastSyncTimestamp = null;
    updateRelativeSyncTime();
    const connStatus = document.getElementById('connection-status');
    connStatus.innerText = 'Offline Mode';
    connStatus.className = 'status-text-mini status-closed';
  }
}

// Trigger manual refresh via API
async function triggerManualSync() {
  const refreshBtn = document.getElementById('refresh-btn');
  if (refreshBtn) {
    refreshBtn.disabled = true;
    refreshBtn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="btn-icon-s spin-icon">
        <path d="M23 4v6h-6M1 20v-6h6"/>
        <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
      </svg>
      Syncing...
    `;
  }

  try {
    const response = await fetch('/api/refresh', { method: 'POST' });
    if (response.ok) {
      speak("Updating live crossing predictions and local weather data.");
      await syncState();
    }
  } catch (e) {
    console.error(e);
  } finally {
    if (refreshBtn) {
      refreshBtn.disabled = false;
      refreshBtn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="btn-icon-s">
          <path d="M23 4v6h-6M1 20v-6h6"/>
          <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
        </svg>
        Sync Now
      `;
    }
  }
}

// Detect changes and read alerts aloud
function detectGateChanges() {
  Object.keys(state.gates).forEach(gateId => {
    const gate = state.gates[gateId];
    const newStatus = gate.status;
    const oldStatus = previousGateStatus[gateId];

    if (oldStatus !== undefined && oldStatus !== newStatus) {
      const gateShortName = gateId === 'lc-83' ? 'Pavoorchatram' : gateId === 'lc-82' ? 'Keela-puliyur' : 'Tenkasi East';
      let statusPhrase = newStatus === 'caution' ? 'is closing soon' : `is now ${newStatus}`;
      const changeMsg = `Alert: ${gateShortName} Gate ${statusPhrase}.`;
      
      speak(changeMsg);
      showBrowserNotification(gate.name, `State updated to: ${newStatus.toUpperCase()}`);
    }
    
    previousGateStatus[gateId] = newStatus;
  });
}

// Browser push notification helper
function showBrowserNotification(title, message) {
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(title, { body: message });
  }
}

// Speech Synthesizer alert
function speak(text) {
  if (!isSpeechEnabled) return;
  if (window.speechSynthesis) {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.0;
    utterance.volume = 1.0;
    
    const voices = window.speechSynthesis.getVoices();
    const indVoice = voices.find(v => v.lang.includes('EN-IN') || v.name.includes('India'));
    if (indVoice) utterance.voice = indVoice;
    
    window.speechSynthesis.speak(utterance);
  }
}

// Render UI Components
function updateDashboardUI() {
  // 1. Update Weather Widget
  const weather = state.weather;
  document.getElementById('weather-temp').innerText = `${weather.temp}°C`;
  document.getElementById('weather-desc').innerText = weather.condition;
  document.getElementById('weather-icon').innerText = WEATHER_EMOJIS[weather.condition] || '☀️';

  // 2. Update Gate Cards & Map Markers
  Object.keys(state.gates).forEach(gateId => {
    const gate = state.gates[gateId];
    const statusTextEl = document.getElementById(`status-text-${gateId}`);
    
    if (statusTextEl) {
      statusTextEl.innerText = gate.status.toUpperCase();
      statusTextEl.className = 'status-large-text'; // reset
      statusTextEl.classList.add(`status-${gate.status}`);

      // Update quick display in header (LC-83)
      if (gateId === 'lc-83') {
        const quickDot = document.getElementById('quick-lc-83-dot');
        const quickText = document.getElementById('quick-lc-83-text');
        quickDot.className = `status-indicator-dot ${gate.status}`;
        quickText.innerText = gate.status;
        quickText.className = `status-text-mini status-${gate.status}`;
      }

      // Update Map Marker for this gate
      const marker = gateMarkers[gateId];
      if (marker) {
        const color = gate.status === 'open' ? '#10b981' : (gate.status === 'closed' ? '#ef4444' : '#f59e0b');
        marker.setStyle({ fillColor: color });
        marker.setPopupContent(`<strong>${GATE_LOCATIONS[gateId].name}</strong><br>Status: <strong style="color:${color}">${gate.status.toUpperCase()}</strong>`);
      }
    }
  });

  // 3. Update Train Locations on Map
  updateMapTrainMarkers();

  // 4. Render Console Logs
  renderConsoleLogs();
}

// Render moving train markers on the Map
function updateMapTrainMarkers() {
  if (!map) return;

  // Track currently active train IDs to remove obsolete markers later
  const activeTrainIds = new Set();
  const zoom = map.getZoom();

  // Group trains by their coordinates to find overlaps
  const coordinateGroups = {};
  state.trains.forEach(train => {
    if (train.currentCoords && Array.isArray(train.currentCoords)) {
      activeTrainIds.add(train.id);
      
      const key = `${train.currentCoords[0].toFixed(5)},${train.currentCoords[1].toFixed(5)}`;
      if (!coordinateGroups[key]) {
        coordinateGroups[key] = [];
      }
      coordinateGroups[key].push(train);
    }
  });

  // Render each group with dynamic zoom-scaled coordinates offsets
  for (let key in coordinateGroups) {
    const group = coordinateGroups[key];
    group.forEach((train, index) => {
      let latlng = [...train.currentCoords];

      if (group.length > 1) {
        // Distribute overlapping markers in a small circle around the base coordinate
        const angle = (2 * Math.PI * index) / group.length;
        // Scale offset radius exponentially with zoom level to maintain visible separation (approx 30px on screen)
        const baseRadius = 0.0003;
        const radius = baseRadius * Math.pow(2, Math.max(0, 13 - zoom));
        latlng[0] += Math.sin(angle) * radius;
        latlng[1] += Math.cos(angle) * radius;
      }

      const isUp = train.direction === 'UP';
      const arrowHtml = isUp 
        ? `<span style="color:#0ea5e9; margin-left:2px; font-size:8px;">▶</span>` 
        : `<span style="color:#0ea5e9; margin-right:2px; font-size:8px;">◀</span>`;
      const trainLabelHtml = isUp
        ? `<span>🚂</span><span>${train.number}</span>${arrowHtml}`
        : `${arrowHtml}<span>🚂</span><span>${train.number}</span>`;

      const trainIcon = L.divIcon({
        className: 'custom-train-marker',
        html: `<div style="background-color:#1e293b; border:1px solid #0ea5e9; border-radius:4px; padding:2px 6px; font-size:10px; font-weight:bold; color:white; white-space:nowrap; display:flex; align-items:center; gap:2px; box-shadow:0 2px 6px rgba(0,0,0,0.4);">${trainLabelHtml}</div>`,
        iconSize: [60, 20],
        iconAnchor: [30, 10]
      });

      if (!trainMarkers[train.id]) {
        const marker = L.marker(latlng, { icon: trainIcon }).addTo(map);
        marker.bindPopup(`<strong>${train.name} (${train.number})</strong><br>Type: ${train.type}<br>Next Crossing: ${train.predictedArrival}<br>Status: ${train.statusText}<br>Location: ${train.currentStation}`);
        trainMarkers[train.id] = marker;
      } else {
        // Smoothly move existing marker and update icon/popup
        trainMarkers[train.id].setLatLng(latlng);
        trainMarkers[train.id].setIcon(trainIcon);
        trainMarkers[train.id].setPopupContent(`<strong>${train.name} (${train.number})</strong><br>Type: ${train.type}<br>Next Crossing: ${train.predictedArrival}<br>Status: ${train.statusText}<br>Location: ${train.currentStation}`);
      }
    });
  }

  // Remove markers of trains that are no longer active/transit
  Object.keys(trainMarkers).forEach(trainId => {
    if (!activeTrainIds.has(trainId)) {
      trainMarkers[trainId].remove();
      delete trainMarkers[trainId];
    }
  });
}

// Update countdown calculations and train details
function updateTrainScheduleCountdowns() {
  if (state.trains.length === 0) return;

  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  // Calculate ETA differences for all trains first
  const trainsWithEta = state.trains.map(train => {
    const [tHour, tMin] = train.predictedArrival.split(':').map(Number);
    const trainMinutes = tHour * 60 + tMin;
    
    let diff = trainMinutes - currentMinutes;
    if (diff <= 0) {
      diff += 24 * 60; // 24 hours later
    }
    return { ...train, etaMinutes: diff };
  });

  // Sort chronologically by next expected crossing (ascending order of etaMinutes)
  trainsWithEta.sort((a, b) => a.etaMinutes - b.etaMinutes);

  const nextTrain = trainsWithEta[0];

  const trainRowsHTML = trainsWithEta.map(train => {
    const etaText = formatEtaString(train.etaMinutes);
    const isImminent = train.etaMinutes <= 20;

    return `
      <div class="train-row ${isImminent ? 'imminent' : ''}">
        <div class="train-row-info">
          <span class="train-row-name">${train.name} (${train.number})</span>
          <span class="train-row-type">${train.type} | Delay: ${train.statusText}</span>
        </div>
        <div class="train-row-time">
          <span>${train.predictedArrival}</span>
          <span class="train-row-eta">${etaText}</span>
        </div>
      </div>
    `;
  }).join('');

  document.getElementById('train-table-body').innerHTML = trainRowsHTML;

  // Update Next approaching Train banner
  if (nextTrain) {
    document.getElementById('next-train-name').innerText = `${nextTrain.name} (${nextTrain.number})`;
    document.getElementById('next-train-time').innerText = `Scheduled at ${nextTrain.time} | Expected crossing at ${nextTrain.predictedArrival}`;
    document.getElementById('next-train-countdown').innerText = formatEtaString(nextTrain.etaMinutes);
    
    // Predicted gate closure window
    const [tHour, tMin] = nextTrain.predictedArrival.split(':').map(Number);
    let openMin = tMin + 3;
    let openHour = tHour;
    if (openMin >= 60) { openMin -= 60; openHour += 1; }
    
    let closeMin = tMin - 15;
    let closeHour = tHour;
    if (closeMin < 0) { closeMin += 60; closeHour -= 1; }

    const pad = (n) => n.toString().padStart(2, '0');
    document.getElementById('predicted-closure-window').innerText = `${pad(closeHour % 24)}:${pad(closeMin)} - ${pad(openHour % 24)}:${pad(openMin)}`;

    // Toggle main alerts banner visibility
    const alertBanner = document.getElementById('top-alert-banner');
    const alertText = document.getElementById('alert-banner-text');

    if (nextTrain.etaMinutes <= 15) {
      alertBanner.classList.remove('hidden');
      alertText.innerText = `⚠️ Gate Closure Warning: ${nextTrain.name} crossing expected in ${nextTrain.etaMinutes} mins!`;
    } else {
      alertBanner.classList.add('hidden');
    }
  }

  // Update API tag indicators
  const sourceEl = document.getElementById('train-api-source');
  if (sourceEl) {
    sourceEl.innerText = state.logs.some(l => l.text.includes('Successful') || l.text.includes('delay is')) ? 'Live RapidAPI' : 'Scheduled Timetable';
  }
}

// Format eta
function formatEtaString(totalMins) {
  if (totalMins <= 0) return 'Passing now';
  if (totalMins < 60) return `in ${totalMins}m`;
  const hrs = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  return `in ${hrs}h ${mins}m`;
}

// Render system log board
function renderConsoleLogs() {
  const container = document.getElementById('system-logs-container');
  if (!container) return;

  const logsHTML = state.logs.map(log => {
    const timeStr = new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    let logClass = 'chat-message alert';

    return `
      <div class="${logClass}" style="align-self: stretch; max-width: 100%; border-radius: 6px;">
        <span class="chat-sender" style="color: var(--primary-blue)">[System Monitor]</span>
        <span class="chat-text" style="font-family: monospace; font-size: 0.75rem;">${log.text}</span>
        <span class="chat-time">${timeStr}</span>
      </div>
    `;
  }).join('');

  container.innerHTML = logsHTML;
}

// Update the dynamic sync text showing seconds elapsed since last sync
function updateRelativeSyncTime() {
  const syncTimeEl = document.getElementById('sync-time');
  if (!syncTimeEl) return;

  if (lastSyncTimestamp === null) {
    syncTimeEl.innerText = 'Sync failed. Retrying...';
    return;
  }

  const secondsElapsed = Math.floor((Date.now() - lastSyncTimestamp) / 1000);
  if (secondsElapsed <= 1) {
    syncTimeEl.innerText = 'Last synchronized: Just now';
  } else if (secondsElapsed === 1) {
    syncTimeEl.innerText = 'Last synchronized: 1 second ago';
  } else {
    syncTimeEl.innerText = `Last synchronized: ${secondsElapsed} seconds ago`;
  }
}
