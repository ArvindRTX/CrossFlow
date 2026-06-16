require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { configure, trackTrain } = require('irctc-connect');

// Configure irctc-connect if API key is provided
const irctcApiKey = process.env.IRCTC_API_KEY;
if (irctcApiKey && irctcApiKey !== 'your_api_key_here') {
  configure(irctcApiKey);
}

// Initialize Supabase Client (Vercel Production)
const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
let supabase = null;
if (supabaseUrl && supabaseKey) {
  supabase = createClient(supabaseUrl, supabaseKey);
}


const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Coordinates of key stations on the Sengottai-Tirunelveli Rail Line (West to East)
const STATION_COORDS = {
  'SCT': [8.9814, 77.2583], // Sengottai
  'TSI': [8.9585, 77.3117], // Tenkasi Junction
  'PCM': [8.9068, 77.4082], // Pavoorchatram
  'KIB': [8.7995, 77.4580], // Kizha Ambur
  'ASD': [8.7061, 77.4578], // Ambasamudram
  'SMD': [8.6806, 77.5645], // Cheranmahadevi
  'TEN': [8.7292, 77.6974]  // Tirunelveli Junction
};

// Railway Track Polyline for path rendering & interpolation
const RAILWAY_TRACK = [
  STATION_COORDS['SCT'],
  STATION_COORDS['TSI'],
  [8.9412, 77.3885], // Keelapuliyur Crossing (LC-82) point
  STATION_COORDS['PCM'],
  STATION_COORDS['KIB'],
  STATION_COORDS['ASD'],
  STATION_COORDS['SMD'],
  STATION_COORDS['TEN']
];

// Expanded 17-train masterlist loaded from 'Revised Trains .xlsx'
const TRAIN_MASTERLIST = [
  // Westbound / DOWN trains (Tirunelveli to Sengottai)
  { number: '16792', name: 'Palaruvi Express', time: '03:10', type: 'Express', direction: 'DOWN', origin: 'TEN', dest: 'SCT', depTime: '02:20', arrTime: '03:30', runningDays: [0, 1, 2, 3, 4, 5, 6] },
  { number: '06657', name: 'Tirunelveli - Sengottai Passenger Spl', time: '07:30', type: 'Passenger', direction: 'DOWN', origin: 'TEN', dest: 'SCT', depTime: '06:40', arrTime: '07:50', runningDays: [0, 1, 2, 3, 4, 5, 6] },
  { number: '20683', name: 'Tambaram - Sengottai SF Express', time: '09:48', type: 'Superfast', direction: 'DOWN', origin: 'TEN', dest: 'SCT', depTime: '08:58', arrTime: '10:08', runningDays: [2, 4, 6] },
  { number: '06685', name: 'Tirunelveli - Sengottai Passenger Spl', time: '13:50', type: 'Passenger', direction: 'DOWN', origin: 'TEN', dest: 'SCT', depTime: '13:00', arrTime: '14:10', runningDays: [0, 1, 2, 3, 4, 5, 6] },
  { number: '06687', name: 'Tirunelveli - Sengottai Express Spl', time: '15:50', type: 'Passenger', direction: 'DOWN', origin: 'TEN', dest: 'SCT', depTime: '15:00', arrTime: '16:10', runningDays: [0, 1, 2, 3, 4, 5, 6] },
  { number: '16845', name: 'Erode - Sengottai Express', time: '21:30', type: 'Express', direction: 'DOWN', origin: 'TEN', dest: 'SCT', depTime: '20:40', arrTime: '21:50', runningDays: [0, 1, 2, 3, 4, 5, 6] },
  { number: '06030', name: 'Tirunelveli - Mettupalayam Special', time: '20:07', type: 'Special', direction: 'DOWN', origin: 'TEN', dest: 'SCT', depTime: '19:17', arrTime: '20:27', runningDays: [0] },
  { number: '06025', name: 'Erode - Sengottai Holiday Special', time: '10:52', type: 'Special', direction: 'DOWN', origin: 'TEN', dest: 'SCT', depTime: '10:02', arrTime: '11:12', runningDays: [] },
  { number: '06121', name: 'MGR Chennai Central - Kottayam Special', time: '05:48', type: 'Special', direction: 'DOWN', origin: 'TEN', dest: 'SCT', depTime: '04:58', arrTime: '06:08', runningDays: [3] },
  
  // Eastbound / UP trains (Sengottai to Tirunelveli)
  { number: '16846', name: 'Sengottai - Erode Express', time: '05:38', type: 'Express', direction: 'UP', origin: 'SCT', dest: 'TEN', depTime: '05:18', arrTime: '06:28', runningDays: [0, 1, 2, 3, 4, 5, 6] },
  { number: '06682', name: 'Sengottai - Tirunelveli Passenger Spl', time: '07:08', type: 'Passenger', direction: 'UP', origin: 'SCT', dest: 'TEN', depTime: '06:48', arrTime: '07:58', runningDays: [0, 1, 2, 3, 4, 5, 6] },
  { number: '06658', name: 'Sengottai - Tirunelveli Passenger Spl', time: '15:08', type: 'Passenger', direction: 'UP', origin: 'SCT', dest: 'TEN', depTime: '14:48', arrTime: '15:58', runningDays: [0, 1, 2, 3, 4, 5, 6] },
  { number: '20684', name: 'Sengottai - Tambaram SF Express', time: '17:52', type: 'Superfast', direction: 'UP', origin: 'SCT', dest: 'TEN', depTime: '17:32', arrTime: '18:42', runningDays: [1, 3, 5] },
  { number: '16791', name: 'Palaruvi Express', time: '23:48', type: 'Express', direction: 'UP', origin: 'SCT', dest: 'TEN', depTime: '23:28', arrTime: '00:38', runningDays: [0, 1, 2, 3, 4, 5, 6] },
  { number: '06036', name: 'Velankanni - Tambaram AC Special', time: '18:48', type: 'Special', direction: 'UP', origin: 'SCT', dest: 'TEN', depTime: '18:28', arrTime: '19:38', runningDays: [4] },
  { number: '06026', name: 'Sengottai - Podanur Holiday Special', time: '21:08', type: 'Special', direction: 'UP', origin: 'SCT', dest: 'TEN', depTime: '20:48', arrTime: '21:58', runningDays: [] },
  { number: '06058', name: 'Tirunelveli - Tambaram Special', time: '19:38', type: 'Special', direction: 'UP', origin: 'SCT', dest: 'TEN', depTime: '19:18', arrTime: '20:28', runningDays: [] }
];

let lastMorningUpdateDate = '';

let cache = {
  gates: {
    'lc-83': { id: 'lc-83', name: 'Pavoorchatram Highway Gate (LC-83)', location: 'Pavoorchatram Highway (SH-39)', status: 'open', lastUpdated: Date.now(), source: 'Auto-Prediction' },
    'lc-82': { id: 'lc-82', name: 'Keelapuliyur Gate (LC-82)', location: 'Keelapuliyur Road', status: 'open', lastUpdated: Date.now(), source: 'Auto-Prediction' },
    'lc-84': { id: 'lc-84', name: 'Tenkasi Junction East (LC-84)', location: 'Tenkasi Railway Station Road', status: 'open', lastUpdated: Date.now(), source: 'Auto-Prediction' }
  },
  weather: { temp: 28, precipitation: 0.0, condition: 'Clear', lastUpdated: Date.now() },
  trains: TRAIN_MASTERLIST.map((t, idx) => ({
    id: `train-${idx}`,
    ...t,
    delay: 0,
    statusText: 'On Time',
    predictedArrival: t.time,
    currentCoords: null,
    currentStation: ''
  })),
  systemLogs: [
    { text: 'CrossFlow Prediction Engine and GPS Mapper Initialized.', timestamp: Date.now() }
  ]
};

// Load state from Supabase or local database.json fallback
async function loadState() {
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('state')
        .select('data')
        .eq('id', 1)
        .single();
      if (data && data.data) {
        cache = data.data;
        console.log('[CrossFlow Log] State loaded successfully from Supabase.');
        return;
      }
      if (error && error.code !== 'PGRST116') {
        console.error('[Supabase Error] Load failed:', error.message);
      }
    } catch (err) {
      console.error('[Supabase Error] Load failed:', err);
    }
  }

  try {
    const dbPath = path.join(__dirname, 'database.json');
    if (fs.existsSync(dbPath)) {
      const raw = fs.readFileSync(dbPath, 'utf8');
      cache = JSON.parse(raw);
      console.log('[CrossFlow Log] State loaded successfully from local file database.json.');
    }
  } catch (err) {
    console.warn('[CrossFlow Warning] Local state load failed, using default cache:', err.message);
  }
}

// Save state to Supabase or local database.json fallback
async function saveState() {
  if (supabase) {
    try {
      const { error } = await supabase
        .from('state')
        .upsert({ id: 1, data: cache, updated_at: new Date() });
      if (error) {
        console.error('[Supabase Error] Save failed:', error.message);
      } else {
        console.log('[CrossFlow Log] State saved successfully to Supabase.');
      }
    } catch (err) {
      console.error('[Supabase Error] Save failed:', err);
    }
  } else {
    try {
      const dbPath = path.join(__dirname, 'database.json');
      fs.writeFileSync(dbPath, JSON.stringify(cache, null, 2));
      console.log('[CrossFlow Log] State saved successfully to local file database.json.');
    } catch (err) {
      console.error('[CrossFlow Error] Local state save failed:', err.message);
    }
  }
}

// Weather coordinates: Pavoorchatram
const LAT = 8.9036;
const LON = 77.4095;

// Fetch Live Weather
async function updateWeather() {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}&current=temperature_2m,precipitation,weather_code`;
    const response = await fetch(url);
    if (!response.ok) throw new Error('Weather API error');
    
    const data = await response.json();
    const current = data.current;
    
    cache.weather.temp = Math.round(current.temperature_2m);
    cache.weather.precipitation = current.precipitation;
    cache.weather.lastUpdated = Date.now();
    
    const code = current.weather_code;
    if (code === 0) cache.weather.condition = 'Clear';
    else if (code >= 1 && code <= 3) cache.weather.condition = 'Partly Cloudy';
    else if (code >= 51 && code <= 67) cache.weather.condition = 'Drizzle/Rain';
    else if (code >= 80 && code <= 82) cache.weather.condition = 'Rain Showers';
    else cache.weather.condition = 'Cloudy';

    addSystemLog(`Live weather updated: ${cache.weather.temp}°C, ${cache.weather.condition}.`);
  } catch (error) {
    console.error('Failed to update weather:', error);
    addSystemLog('Weather API update failed, using cached details.');
  }
}

// Helper to parse delay in minutes from irctc-connect status/delay strings
function parseDelayMinutes(delayStr) {
  if (!delayStr) return 0;
  if (typeof delayStr === 'number') return delayStr;
  
  const str = String(delayStr).toLowerCase();
  if (str.includes('on time') || str.trim() === '') return 0;
  
  const hrPart = str.match(/(\d+)\s*(hr|hour|h)/);
  const minPart = str.match(/(\d+)\s*(min|minute|m)/);
  
  let parsedHr = hrPart ? parseInt(hrPart[1], 10) : 0;
  let parsedMin = minPart ? parseInt(minPart[1], 10) : 0;
  
  if (!hrPart && !minPart) {
    const numMatch = str.match(/(\d+)/);
    if (numMatch) {
      parsedMin = parseInt(numMatch[1], 10);
    }
  }
  
  return parsedHr * 60 + parsedMin;
}

// Fetch live train status from irctc-connect
async function fetchTrainDelay(trainNo) {
  const apiKey = process.env.IRCTC_API_KEY;

  if (!apiKey || apiKey === 'your_api_key_here') {
    return { delay: 0, currentStation: '' }; // Bypassed
  }

  try {
    const today = new Date();
    const dd = String(today.getDate()).padStart(2, '0');
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const yyyy = today.getFullYear();
    const formattedDate = `${dd}-${mm}-${yyyy}`;

    const result = await trackTrain(trainNo, formattedDate);

    if (!result || !result.success || !result.data) {
      const errMsg = result ? String(result.error) : 'No response';
      if (errMsg.includes('Train data not available') || errMsg.includes('does not run')) {
        console.log(`[CrossFlow Info] Train ${trainNo} is not scheduled to run today (Data not available).`);
      } else {
        console.warn(`irctc-connect trackTrain failed for train ${trainNo}:`, errMsg);
      }
      return { delay: 0, currentStation: '' };
    }

    const data = result.data;
    const currentStation = data.currentStationCode || '';
    let delayMinutes = 0;

    // 1. Try to find the station matching currentStationCode in timeline
    if (data.timeline && Array.isArray(data.timeline)) {
      const currentPoint = data.timeline.find(point => point.stationCode === currentStation);
      if (currentPoint) {
        const arrDelay = currentPoint.arrival ? parseDelayMinutes(currentPoint.arrival.delay) : 0;
        const depDelay = currentPoint.departure ? parseDelayMinutes(currentPoint.departure.delay) : 0;
        delayMinutes = Math.max(arrDelay, depDelay);
      } else {
        // 2. If not found, check the last passed station in timeline
        const passedPoints = data.timeline.filter(point => point.status === 'passed');
        if (passedPoints.length > 0) {
          const lastPassed = passedPoints[passedPoints.length - 1];
          const arrDelay = lastPassed.arrival ? parseDelayMinutes(lastPassed.arrival.delay) : 0;
          const depDelay = lastPassed.departure ? parseDelayMinutes(lastPassed.departure.delay) : 0;
          delayMinutes = Math.max(arrDelay, depDelay);
        }
      }
    }

    // 3. Fallback: Parse statusNote if delay is still 0
    if (delayMinutes === 0 && data.statusNote) {
      const note = data.statusNote.toLowerCase();
      if (note.includes('late') || note.includes('delay') || note.includes('delayed')) {
        const match = note.match(/(\d+)\s*(min|minute|m)/);
        if (match) {
          delayMinutes = parseInt(match[1], 10);
        } else {
          const hrMatch = note.match(/(\d+)\s*(hr|hour|h)/);
          if (hrMatch) {
            delayMinutes = parseInt(hrMatch[1], 10) * 60;
          }
        }
      }
    }

    return { delay: delayMinutes, currentStation, liveTimeline: data ? data.timeline : null };
  } catch (error) {
    console.error(`Error calling irctc-connect for train ${trainNo}:`, error);
    return { delay: 0, currentStation: '', liveTimeline: null };
  }
}

// Interpolate Coordinates along the track based on percentage completed
function interpolateCoords(track, pct) {
  if (track.length === 0) return null;
  if (pct <= 0) return track[0];
  if (pct >= 1) return track[track.length - 1];
  
  const totalSegments = track.length - 1;
  const segmentIdx = Math.floor(pct * totalSegments);
  const segmentPct = (pct * totalSegments) - segmentIdx;
  
  const p1 = track[segmentIdx];
  const p2 = track[segmentIdx + 1];
  
  const lat = p1[0] + (p2[0] - p1[0]) * segmentPct;
  const lng = p1[1] + (p2[1] - p1[1]) * segmentPct;
  
  return [lat, lng];
}

// Convert time string "HH:MM" to minutes since midnight
function timeToMins(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

// Helper to check if a train is scheduled to run near the current time (within 45m before and 15m after crossing)
function isTrainActiveForQuery(train, currentMinutes) {
  const crossingMins = timeToMins(train.time);
  let diff = crossingMins - currentMinutes;
  
  // Handle 24-hour wrap around
  if (diff < -12 * 60) diff += 24 * 60;
  if (diff > 12 * 60) diff -= 24 * 60;
  
  return (diff >= -15 && diff <= 45);
}

// Update coordinates of all trains purely using scheduled timetable (Uses 0 API calls)
function updateAllTrainPositionsScheduled() {
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  for (let train of cache.trains) {
    // Re-calculate predicted arrival based on its existing delay (preserves live synced delays)
    const baseMins = timeToMins(train.time);
    let totalArrivalMins = baseMins + train.delay;
    
    let pHour = Math.floor(totalArrivalMins / 60) % 24;
    let pMin = totalArrivalMins % 60;
    train.predictedArrival = `${pHour.toString().padStart(2, '0')}:${pMin.toString().padStart(2, '0')}`;

    // Interpolate coordinates along the track
    const depMins = timeToMins(train.depTime);
    const arrMins = timeToMins(train.arrTime) + train.delay;

    let isRunning = false;
    let duration = arrMins - depMins;
    if (duration < 0) duration += 24 * 60;

    let elapsed = currentMinutes - depMins;
    if (elapsed < 0) elapsed += 24 * 60;

    if (elapsed >= 0 && elapsed <= duration) {
      isRunning = true;
    }

    let trainCoords = null;
    if (isRunning) {
      let pct = elapsed / duration;
      
      // Calculate normalized track progress (trackPct: 0 = SCT, 1 = TEN)
      let trackPct = (train.direction === 'DOWN') ? (1 - pct) : pct;

      // Ensure trackPct stays bounded
      if (trackPct < 0) trackPct = 0;
      if (trackPct > 1) trackPct = 1;

      // Live Level Crossing Snapping/Constraint logic
      let hasCrossedLC83 = false;
      let hasCrossedLC82 = false;
      let hasCrossedLC84 = false;
      const hasLiveTimeline = train.liveTimeline && Array.isArray(train.liveTimeline) && train.liveTimeline.length > 0;

      if (hasLiveTimeline) {
        const pcmPoint = train.liveTimeline.find(p => p.stationCode === 'PCM');
        if (pcmPoint && pcmPoint.status === 'passed') {
          hasCrossedLC83 = true;
          if (train.direction === 'UP') {
            hasCrossedLC82 = true;
          }
        }
        
        const tsiPoint = train.liveTimeline.find(p => p.stationCode === 'TSI');
        if (tsiPoint && tsiPoint.status === 'passed') {
          hasCrossedLC84 = true;
          if (train.direction === 'DOWN') {
            hasCrossedLC82 = true;
          }
        }

        // Apply snaps based on crossing status and direction
        if (train.direction === 'UP') {
          if (hasCrossedLC83) {
            if (trackPct < 0.4323) trackPct = 0.4373;
          } else {
            if (trackPct >= 0.4323) trackPct = 0.4273;
            
            if (hasCrossedLC82) {
              if (trackPct < 0.2857) trackPct = 0.2907;
            } else {
              if (trackPct >= 0.2857) trackPct = 0.2807;
              
              if (hasCrossedLC84) {
                if (trackPct < 0.1542) trackPct = 0.1592;
              } else {
                if (trackPct >= 0.1542) trackPct = 0.1492;
              }
            }
          }
        } else {
          // DOWN train (moves East to West, trackPct decreases)
          if (hasCrossedLC84) {
            if (trackPct > 0.1542) trackPct = 0.1492;
          } else {
            if (trackPct <= 0.1542) trackPct = 0.1592;
            
            if (hasCrossedLC82) {
              if (trackPct > 0.2857) trackPct = 0.2807;
            } else {
              if (trackPct <= 0.2857) trackPct = 0.2907;
              
              if (hasCrossedLC83) {
                if (trackPct > 0.4323) trackPct = 0.4273;
              } else {
                if (trackPct <= 0.4323) trackPct = 0.4373;
              }
            }
          }
        }
      }

      trainCoords = interpolateCoords(RAILWAY_TRACK, trackPct);
      train.currentStation = train.currentStation === 'Stationary' || train.currentStation === '' ? 'In Transit' : train.currentStation;
    } else {
      // If we have live coordinates (e.g. from morning sync), use them
      if (train.liveCoords) {
        trainCoords = train.liveCoords;
        train.currentStation = train.liveStation || 'Stationary';
      } else {
        // Fallback to origin or destination station coordinates
        let beforeDeparture = false;
        let diffDep = depMins - currentMinutes;
        if (diffDep < 0) diffDep += 24 * 60;
        let diffArr = currentMinutes - arrMins;
        if (diffArr < 0) diffArr += 24 * 60;
        
        if (diffDep < diffArr) {
          beforeDeparture = true;
        }
        
        if (beforeDeparture) {
          trainCoords = STATION_COORDS[train.origin] || null;
          train.currentStation = `Stationary at ${train.origin}`;
        } else {
          trainCoords = STATION_COORDS[train.dest] || null;
          train.currentStation = `Stationary at ${train.dest}`;
        }
      }
    }

    train.currentCoords = trainCoords;
  }

  recalculateGateStates();
}

// Automatically update active trains running on the schedule (limited to 7 AM – 9 PM window)
async function updateActiveTrainsLive() {
  const now = new Date();
  const currentHour = now.getHours();
  const currentMinutes = currentHour * 60 + now.getMinutes();

  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yyyy = now.getFullYear();
  const formattedDate = `${dd}-${mm}-${yyyy}`;

  // Enforce 7 AM to 9 PM active tracking window
  if (currentHour < 7 || currentHour >= 21) {
    addSystemLog('[Schedule Polling] Outside 7 AM - 9 PM active tracking window. Skipping auto-poll.');
    return;
  }

  // 1. Run morning sync once a day at/after 7:00 AM for ALL trains to update initial coordinates & delays
  if (lastMorningUpdateDate !== formattedDate) {
    addSystemLog(`[Morning Sync] Starting daily initial live sync for all ${cache.trains.length} trains...`);
    lastMorningUpdateDate = formattedDate;
    
    // Perform in background to avoid blocking the current loop execution
    (async () => {
      const dayOfWeek = now.getDay();
      for (let train of cache.trains) {
        try {
          // Check if train is scheduled to run on this day of the week
          const runsToday = train.runningDays && train.runningDays.includes(dayOfWeek);
          if (!runsToday) {
            addSystemLog(`[Morning Sync] Skipping train ${train.number} (${train.name}) - not scheduled to run today.`);
            continue;
          }

          addSystemLog(`[Morning Sync] Querying initial status for train ${train.number} (${train.name})...`);
          const apiResult = await fetchTrainDelay(train.number);
          train.delay = apiResult.delay;
          train.statusText = apiResult.delay === 0 ? 'On Time' : `${apiResult.delay} mins late`;
          if (apiResult.currentStation && STATION_COORDS[apiResult.currentStation]) {
            train.liveCoords = STATION_COORDS[apiResult.currentStation];
            train.liveStation = apiResult.currentStation;
            train.currentCoords = train.liveCoords;
            train.currentStation = train.liveStation;
          }
          train.liveTimeline = apiResult.liveTimeline;
        } catch (e) {
          console.error(`Error during morning sync for train ${train.number}:`, e);
        }
        // Wait 1 second between API requests to respect rate limits
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      addSystemLog('[Morning Sync] Daily initial live sync completed.');
      // Re-trigger schedule positions calculation to project them on map
      updateAllTrainPositionsScheduled();
    })();
  }

  addSystemLog('[Schedule Polling] Running active train status check...');
  
  const dayOfWeek = now.getDay();
  for (let train of cache.trains) {
    // Only poll active trains if scheduled to run today
    const runsToday = train.runningDays && train.runningDays.includes(dayOfWeek);
    if (!runsToday) continue;

    const depMins = timeToMins(train.depTime);
    let arrMins = timeToMins(train.arrTime);
    
    // Handle midnight wrap-around for train run duration
    let duration = arrMins - depMins;
    if (duration < 0) duration += 24 * 60;
    
    let elapsed = currentMinutes - depMins;
    if (elapsed < 0) elapsed += 24 * 60;

    const isActive = elapsed >= 0 && elapsed <= duration;
    
    if (isActive) {
      addSystemLog(`[Schedule Polling] Querying live status for active train ${train.number} (${train.name})...`);
      const apiResult = await fetchTrainDelay(train.number);
      
      train.delay = apiResult.delay;
      train.statusText = apiResult.delay === 0 ? 'On Time' : `${apiResult.delay} mins late`;
      if (apiResult.currentStation && STATION_COORDS[apiResult.currentStation]) {
        train.liveCoords = STATION_COORDS[apiResult.currentStation];
        train.liveStation = apiResult.currentStation;
        train.currentCoords = train.liveCoords;
        train.currentStation = train.liveStation;
      }
      train.liveTimeline = apiResult.liveTimeline;
      addSystemLog(`[Schedule Polling] Updated train ${train.number} delay: ${train.delay} mins.`);
    }
  }
}

// Manually refresh all currently active trains (ignores the 7 AM - 9 PM restriction)
async function refreshActiveTrainsManual() {
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  const dayOfWeek = now.getDay();
  for (let train of cache.trains) {
    // Only query if scheduled to run today
    const runsToday = train.runningDays && train.runningDays.includes(dayOfWeek);
    if (!runsToday) continue;

    const depMins = timeToMins(train.depTime);
    let arrMins = timeToMins(train.arrTime);
    
    let duration = arrMins - depMins;
    if (duration < 0) duration += 24 * 60;
    
    let elapsed = currentMinutes - depMins;
    if (elapsed < 0) elapsed += 24 * 60;

    const isActive = elapsed >= 0 && elapsed <= duration;
    
    if (isActive) {
      addSystemLog(`[Manual Sync] Querying live status for active train ${train.number} (${train.name})...`);
      const apiResult = await fetchTrainDelay(train.number);
      
      train.delay = apiResult.delay;
      train.statusText = apiResult.delay === 0 ? 'On Time' : `${apiResult.delay} mins late`;
      if (apiResult.currentStation && STATION_COORDS[apiResult.currentStation]) {
        train.liveCoords = STATION_COORDS[apiResult.currentStation];
        train.liveStation = apiResult.currentStation;
        train.currentCoords = train.liveCoords;
        train.currentStation = train.liveStation;
      }
      train.liveTimeline = apiResult.liveTimeline;
    }
  }
}


// Recalculate level crossing gates states
function recalculateGateStates() {
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  let lc83Status = 'open';
  let lc82Status = 'open';
  let lc84Status = 'open';

  let activeReason = '';

  cache.trains.forEach(train => {
    const [pHour, pMin] = train.predictedArrival.split(':').map(Number);
    const crossingMinutes = pHour * 60 + pMin;

    // Determine if the train has already physically crossed the gate based on its live status
    let hasCrossedLC83 = false;
    let hasCrossedLC82 = false;
    let hasCrossedLC84 = false;

    if (train.liveTimeline && Array.isArray(train.liveTimeline)) {
      const pcmPoint = train.liveTimeline.find(p => p.stationCode === 'PCM');
      if (pcmPoint && pcmPoint.status === 'passed') {
        hasCrossedLC83 = true;
        if (train.direction === 'UP') {
          hasCrossedLC82 = true;
        }
      }
      
      const tsiPoint = train.liveTimeline.find(p => p.stationCode === 'TSI');
      if (tsiPoint && tsiPoint.status === 'passed') {
        hasCrossedLC84 = true;
        if (train.direction === 'DOWN') {
          hasCrossedLC82 = true;
        }
      }
    }

    // Check crossing windows relative to Pavoorchatram gate LC-83
    // LC-83 (Pavoorchatram Highway Gate):
    const lc83CloseStart = crossingMinutes - 15;
    const lc83CautionStart = crossingMinutes - 20;
    const lc83OpenTime = crossingMinutes + 3; // Open 3 mins after train crosses

    if (!hasCrossedLC83) {
      if (currentMinutes >= lc83CloseStart && currentMinutes < lc83OpenTime) {
        lc83Status = 'closed';
        activeReason = `Train ${train.number} (${train.name})`;
      } else if (currentMinutes >= lc83CautionStart && currentMinutes < lc83CloseStart) {
        if (lc83Status !== 'closed') {
          lc83Status = 'caution';
          activeReason = `Train ${train.number} expected shortly`;
        }
      }
    }

    // LC-82 (Keelapuliyur Gate) - UP passes 5m before, DOWN passes 5m after
    const isUp = train.direction === 'UP';
    const lc82Offset = isUp ? -5 : 5;
    const lc82Crossing = crossingMinutes + lc82Offset;
    
    if (!hasCrossedLC82) {
      if (currentMinutes >= (lc82Crossing - 15) && currentMinutes < (lc82Crossing + 3)) {
        lc82Status = 'closed';
      } else if (currentMinutes >= (lc82Crossing - 20) && currentMinutes < (lc82Crossing - 15)) {
        if (lc82Status !== 'closed') lc82Status = 'caution';
      }
    }

    // LC-84 (Tenkasi Junction East Gate) - UP passes 10m before, DOWN passes 10m after
    const lc84Offset = isUp ? -10 : 10;
    const lc84Crossing = crossingMinutes + lc84Offset;

    if (!hasCrossedLC84) {
      if (currentMinutes >= (lc84Crossing - 15) && currentMinutes < (lc84Crossing + 3)) {
        lc84Status = 'closed';
      } else if (currentMinutes >= (lc84Crossing - 20) && currentMinutes < (lc84Crossing - 15)) {
        if (lc84Status !== 'closed') lc84Status = 'caution';
      }
    }
  });

  const old83 = cache.gates['lc-83'].status;
  if (old83 !== lc83Status) {
    if (lc83Status === 'closed') {
      addSystemLog(`📢 AUTO-ALERT: Pavoorchatram gate LC-83 is CLOSED for ${activeReason}.`);
    } else if (lc83Status === 'caution') {
      addSystemLog(`⚠️ AUTO-ALERT: Pavoorchatram gate LC-83 is CLOSING SOON.`);
    } else {
      addSystemLog(`✅ AUTO-ALERT: Pavoorchatram gate LC-83 is now OPEN.`);
    }
  }

  cache.gates['lc-83'].status = lc83Status;
  cache.gates['lc-83'].lastUpdated = Date.now();

  cache.gates['lc-82'].status = lc82Status;
  cache.gates['lc-82'].lastUpdated = Date.now();

  cache.gates['lc-84'].status = lc84Status;
  cache.gates['lc-84'].lastUpdated = Date.now();
}

// Helper to push system notifications/logs
function addSystemLog(text) {
  const log = {
    id: Date.now().toString(),
    text,
    timestamp: Date.now()
  };
  cache.systemLogs.unshift(log);
  if (cache.systemLogs.length > 50) {
    cache.systemLogs.pop();
  }
  console.log(`[CrossFlow Log] ${text}`);
}

// API: Retrieve dynamic status
app.get('/api/status', async (req, res) => {
  await loadState();
  res.json({
    gates: cache.gates,
    weather: cache.weather,
    trains: cache.trains,
    logs: cache.systemLogs
  });
});

// API: Manual force update / poll trigger
app.post('/api/refresh', async (req, res) => {
  addSystemLog('Manual status refresh triggered by user.');
  await loadState();
  await updateWeather();
  await refreshActiveTrainsManual();
  updateAllTrainPositionsScheduled();
  await saveState();
  res.json({ success: true, cache });
});

// API: Vercel Cron Job Trigger (Secured with CRON_SECRET)
app.get('/api/cron/update', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  console.log('[Cron Job] Running active train and weather updates...');
  await loadState();
  await updateWeather();
  await updateActiveTrainsLive();
  updateAllTrainPositionsScheduled();
  await saveState();

  res.json({ success: true, message: 'Cron updates processed.' });
});

// Run background loops & load state
(async () => {
  await loadState();
  
  updateWeather();
  setInterval(updateWeather, 15 * 60 * 1000); // Poll weather (Free)

  // Run active train polling loop every 3 minutes (Restricted to 7 AM - 9 PM, filtered by schedule)
  updateActiveTrainsLive();
  setInterval(updateActiveTrainsLive, 3 * 60 * 1000);

  // Run schedule updates (Free, 0 API calls)
  updateAllTrainPositionsScheduled();
  setInterval(updateAllTrainPositionsScheduled, 60000); // Interpolate track positions every 60s
})();

// Start server
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`CrossFlow server running on http://localhost:${PORT}`);
});

// Export app for Vercel serverless deployment
module.exports = app;
