# CrossFlow - Live GPS Map & Automated Crossing Tracker

A fully automated, API-driven level crossing status tracker and navigation map designed for commuters traveling between Pavoorchatram and Tenkasi. It tracks train crossings, predicts gate closing windows, integrates live weather reports, and displays your live GPS position alongside moving train markers on a real-time dark-themed navigation map.

---

## ⚡ Key Features

1. **Fully Automated Gates:** No manual reporting needed! Gate statuses (LC-83, LC-82, and LC-84) are calculated in real-time based on predicted train arrivals.
2. **Live dark Navigation Map:** Features an integrated **Leaflet.js** map styled with CartoDB Dark Matter. It draws the rail track polyline and shows real-time locations.
3. **Mobile GPS Geolocation:** Uses the HTML5 Geolocation API (`navigator.geolocation.watchPosition`) to follow your precise coordinates as a blue pulsing marker on the map while you drive or ride.
4. **Active Train Tracking:** Shows a moving train marker (`🚂 [Train No]`) along the rail track. The coordinates are calculated either by matching live station updates from RapidAPI or by interpolating along the tracks based on schedules.
5. **Full 17-Train Masterlist:** Preloaded with the official schedule from `Revised Trains .xlsx`, covering all regular daily runs, express trains (Palaruvi, Erode, Sengottai Passengers), weekly superfast runs (Tambaram SF), and festival specials.
6. **Hands-free Audio Alerts:** Speaks gate status announcements aloud (using browser Speech Synthesis) so you can keep your eyes on the road.

---

## ⚙️ How to Configure RapidAPI Credentials

To connect the application to real live train running statuses:
1. Go to [RapidAPI.com](https://rapidapi.com/) and search for an Indian Railways or IRCTC API (such as **irctc1**).
2. Subscribe to the API (most offer a free tier with 50-100 free requests per month).
3. Open the `.env` file in this project directory:
   ```env
   RAPIDAPI_KEY=your_actual_rapidapi_key_here
   RAPIDAPI_HOST=irctc1.p.rapidapi.com
   ```
4. Replace `your_actual_rapidapi_key_here` with your API key and restart the server.
5. *Note: If this key is missing or invalid, the app will fallback to the scheduled timetable (on-time tracking) without generating any fake delays.*

---

## 🚀 How to Run the App

### 1. Install Dependencies
Make sure you've installed packages:
```bash
npm install
```

### 2. Start the Server
Start the Express server:
```bash
npm start
```
The server runs on `http://localhost:3000`.

### 3. Share and Use on the Road (Access from anywhere)
Since you are riding/driving and need to access the app on your phone, you can expose your local port securely to the internet for free using **Localtunnel** or **Ngrok**:

#### Using Localtunnel (Easiest, no account required):
1. In a new terminal window, run:
   ```bash
   npx localtunnel --port 3000
   ```
2. Copy the generated public link (e.g., `https://cold-goats-jump.loca.lt`) and open it on your phone's browser.
3. Bookmark the link or add it to your home screen!

---

## 🔊 Audio & GPS Requirement Note
- Open the app link on your phone.
- **Grant Location Permissions** when prompted by the browser to enable the live navigation map.
- **Tap/click anywhere on the screen once** after loading. Browsers block speech audio until there is an initial user interaction.
- Ensure your phone is connected to your helmet speaker, car Bluetooth, or headphones.
