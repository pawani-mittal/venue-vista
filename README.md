# 🎭 Venue Vista: Event Pro Ticketing & Venue Management

> **Industry Domain:** Media & Entertainment (Arena Concerts, Broadway/West End Musical Theatre, Stand-up Comedy Clubs, Film Festivals & Symphony Orchestras)  
> **Architecture:** Zero-dependency Full-Stack Application built with **Node.js 22**, native **SQLite (`node:sqlite DatabaseSync`)**, Vector SVG Seating Engine, Real-Time Server-Sent Events (SSE), and Web Audio Access Control.

---

## 🌟 Overview

**Venue Vista** is an enterprise-grade ticketing and venue management platform engineered specifically for the **Media & Entertainment** industry. It solves the critical operational challenges faced by live event producers, venue operators, box office staff, and entertainment consumers:

1. **Interactive Vector Seating Charts**: Dynamic multi-tier SVG seating plans with smooth Pan & Zoom, section isolation, and live seat statuses (Available, Selected, Held in Cart, Sold Out, ADA Accessible, Restricted View).
2. **Venue Layout Designer**: An interactive venue layout builder that allows venue managers to design proscenium arches, 360° arena stages, cabaret tables, configure section geometries, rows, and seats, and automatically publish bookable seating inventories.
3. **Atomic Seat Holding & Anti-Double-Booking**: An in-memory + SQLite transactional hold engine that reserves seats for 8 minutes during checkout, preventing concurrent double-booking conflicts across buyers.
4. **Checkout & Verifiable Digital Passes**: Complete booking flow with promo code engine, entertainment tax & service fee calculation, and instant issuance of printable digital ticket passes featuring pure-JavaScript **SVG QR Codes** and anti-counterfeit barcodes.
5. **Front-of-House Gate Access Scanner**: Real-time turnstile scanner simulation with camera viewfinder, Web Audio API sound synthesis (distinct affirmative chimes vs. duplicate fraud warning buzzes), and live attendance analytics.
6. **Executive Box Office Sales Analytics**: Real-time KPI cards (Gross Revenue, Yield, Tickets Sold, Occupancy %), Section Revenue Bar Charts, Seating Occupancy Heatmaps, Sales Velocity Timelines, and One-Click CSV / JSON Data Export.

---

## 🚀 Quick Start

Venue Vista is designed to run out of the box with **zero external npm dependencies** using Node.js 22's built-in SQLite database engine:

### 1. Launch the Server
```bash
npm start
# or: node --no-warnings server.js
```
The application will launch immediately at:
👉 **`http://localhost:3000`**

### 2. Run the Automated Test Suite
```bash
npm test
# or: node --no-warnings tests/test-api.js
```
Executes the comprehensive 10-point test suite covering database schema, atomic seat holds, concurrency conflict rejection (409), promo validation, checkout, gate scanning, and analytics export.

### 3. Reset Demo Data
You can reset the database at any time using:
```bash
npm run seed
# or click the "⟳ Reset Demo" button in the web navigation bar
```

---

## 🏛️ System Architecture

```
venue-vista/
├── package.json               # NPM configuration & scripts
├── server.js                  # Native HTTP Server, REST API & SSE Live Stream
├── db.js                      # Node 22 native SQLite schema, models & seed data
├── venue_vista.sqlite         # SQLite database file (WAL mode enabled)
├── tests/
│   └── test-api.js            # Automated integration & verification test suite
├── public/
│   ├── index.html             # Application shell & modal interfaces
│   ├── css/
│   │   └── app.css            # Media & Entertainment dark UI design system
│   └── js/
│       ├── qrcode.js          # Pure JS Model 2 SVG QR Code generator (zero deps)
│       ├── api.js             # REST API client & SSE event source
│       ├── seating-chart.js   # Interactive SVG seating chart with pan/zoom
│       ├── seating-builder.js # Venue designer & section layout builder
│       ├── scanner.js         # Box office gate pass scanner & Web Audio feedback
│       ├── analytics.js       # Sales charts, seating heatmaps & CSV export
│       └── app.js             # Master controller & state management
└── README.md                  # System manual and API documentation
```

---

## 🎬 Core Modules & Features

### 1. Interactive Seating Chart Engine (`seating-chart.js`)
- **Stage Lighting Gradient**: Dynamic SVG lighting cones that focus attention on the proscenium or arena hydraulic stage.
- **Micro-State Hover Tooltips**: Real-time hover cards displaying section name, row letter, seat number, tier badge, price breakdown, and perks (e.g. VIP express entry, backstage laminate).
- **Cart Reservation Timer**: Dynamic 8-minute countdown timer with auto-release if the customer abandons their reservation.
- **Real-Time Synchronization (SSE)**: Live Server-Sent Events notify all connected browsers whenever seats are held, released, or purchased.

### 2. Venue Layout Designer (`seating-builder.js`)
- Design custom layouts for Theatres, Arenas, and Comedy Clubs.
- Add and configure sections, row counts, seat spacing, and visual coordinates.
- Real-time total capacity calculation and instant publishing to the live catalog.
- Includes pre-built architectural templates:
  - **The Majestic Royal Theatre** (Proscenium Stalls, Royal Boxes, Dress Circle, Balcony)
  - **Apex Pulse Arena** (360° Stage, VIP Diamond Pit, Floor Reserved, Club Level)
  - **The Velvet Lounge** (Spotlight Stage, Front Banquettes, Mezzanine Tables, Bar Rail)

### 3. Front-of-House Gate QR Scanner (`scanner.js`)
- Box office turnstile scanning view with camera crosshairs and sweeping red laser line animation.
- **Web Audio API Sound Engine**:
  - `SUCCESS`: Dual harmonious sine chimes (880Hz → 1320Hz) granting admission.
  - `ALREADY_REDEEMED`: Low sawtooth buzzer (180Hz) flagging duplicate ticket fraud.
  - `INVALID_TICKET`: Triple descending alert tone for unrecognized passes.
- Live gate statistics: Tickets issued vs. checked-in count, turnstile progress meter, and recent scan logs.

### 4. Sales & Box Office Analytics (`analytics.js`)
- **High-level KPIs**: Gross Revenue, Net Ticket Revenue, Facility Fees, Average Order Value (AOV), and Sell-Out %.
- **Revenue by Section**: SVG Bar Chart showing yields across orchestra, pit, and balcony tiers.
- **Seating Occupancy Heatmap**: Color-coded heat density grid highlighting high-demand sections.
- **Sales Velocity**: Timeline chart showing daily transaction velocity leading up to showtime.
- **Audit Export**: Export complete orders or attendee rosters directly to CSV or JSON.

---

## 📡 REST API Reference

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health` | System health check and uptime status |
| `GET` | `/api/venues` | List all entertainment venues |
| `POST` | `/api/venues` | Create a new venue layout from designer |
| `GET` | `/api/events` | List events with genre, status, and search filters |
| `GET` | `/api/events/:id` | Get detailed event profile with pricing tiers |
| `POST` | `/api/events` | Create new event and generate seating inventory |
| `GET` | `/api/events/:id/seats` | Retrieve real-time seat inventory and statuses |
| `POST` | `/api/events/:id/hold` | Atomically hold seats for 8 minutes |
| `POST` | `/api/events/:id/release-hold` | Release held seats back to available pool |
| `POST` | `/api/promos/validate` | Validate discount promo codes |
| `POST` | `/api/events/:id/checkout` | Process transaction, issue verifiable QR passes |
| `POST` | `/api/tickets/scan` | Turnstile gate scanner pass validation |
| `GET` | `/api/events/:id/gate-stats` | Gate check-in count and section attendance |
| `GET` | `/api/analytics` | Executive box office KPIs and timeline metrics |
| `GET` | `/api/analytics/export` | Download CSV or JSON data export |
| `POST` | `/api/reset-demo` | Reset sample database to fresh seed state |

---

## 🎟️ Active Demo Promo Codes

Try these promo codes during checkout:
- **`VISTAPRO`**: 15% discount on all orders over $50
- **`VIPENTERTAINMENT`**: 25% discount on all orders over $100
- **`EARLYBIRD`**: $20 flat discount on orders over $80
- **`PRESSPASS`**: 50% media discount

---

## 📄 License
MIT License. Built for enterprise Media & Entertainment ticketing and venue management.
