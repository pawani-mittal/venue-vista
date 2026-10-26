/**
 * Venue Vista - Database Layer
 * Built with Node.js 22 native SQLite (node:sqlite DatabaseSync)
 * Provides ACID transactional ticket bookings, seat holding, and analytics
 */

const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');

// On Vercel / serverless platforms, only /tmp is writable
const isVercel = Boolean(process.env.VERCEL || process.env.NOW_REGION || process.env.AWS_LAMBDA_FUNCTION_NAME);
const DB_FILE = isVercel ? path.join('/tmp', 'venue_vista.sqlite') : path.join(__dirname, 'venue_vista.sqlite');

if (isVercel) {
  const seedFile = path.join(__dirname, 'venue_vista.sqlite');
  try {
    if (fs.existsSync(seedFile) && !fs.existsSync(DB_FILE)) {
      fs.copyFileSync(seedFile, DB_FILE);
    }
  } catch (err) {
    console.warn('Could not copy seed DB to /tmp:', err);
  }
}

const db = new DatabaseSync(DB_FILE);

// Enable foreign key constraints, WAL journal mode, and busy timeout
db.exec('PRAGMA foreign_keys = ON;');
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA busy_timeout = 5000;');

/**
 * Initialize all database tables
 */
function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS venues (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      city TEXT NOT NULL,
      address TEXT NOT NULL,
      capacity INTEGER NOT NULL,
      layout_config TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      venue_id TEXT NOT NULL,
      title TEXT NOT NULL,
      subtitle TEXT,
      genre TEXT NOT NULL,
      banner_url TEXT,
      accent_color TEXT DEFAULT '#6366f1',
      event_date TEXT NOT NULL,
      doors_open TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'on_sale',
      description TEXT,
      age_restriction TEXT DEFAULT 'All Ages',
      created_at TEXT NOT NULL,
      FOREIGN KEY (venue_id) REFERENCES venues(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS ticket_tiers (
      id TEXT PRIMARY KEY,
      event_id TEXT NOT NULL,
      name TEXT NOT NULL,
      price REAL NOT NULL,
      fee REAL NOT NULL DEFAULT 5.00,
      color TEXT NOT NULL,
      section_ids TEXT NOT NULL,
      perks TEXT,
      total_allocation INTEGER NOT NULL,
      FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS seats (
      id TEXT PRIMARY KEY,
      event_id TEXT NOT NULL,
      section_id TEXT NOT NULL,
      section_name TEXT NOT NULL,
      row_label TEXT NOT NULL,
      seat_number INTEGER NOT NULL,
      tier_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'available',
      hold_token TEXT,
      hold_expires_at INTEGER,
      price REAL NOT NULL,
      is_accessible INTEGER DEFAULT 0,
      restricted_view INTEGER DEFAULT 0,
      x REAL NOT NULL,
      y REAL NOT NULL,
      FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
      FOREIGN KEY (tier_id) REFERENCES ticket_tiers(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      event_id TEXT NOT NULL,
      buyer_name TEXT NOT NULL,
      buyer_email TEXT NOT NULL,
      buyer_phone TEXT,
      subtotal REAL NOT NULL,
      service_fee REAL NOT NULL,
      tax REAL NOT NULL,
      discount REAL DEFAULT 0,
      promo_code TEXT,
      total_amount REAL NOT NULL,
      payment_method TEXT NOT NULL,
      payment_status TEXT NOT NULL DEFAULT 'paid',
      created_at TEXT NOT NULL,
      FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS tickets (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      event_id TEXT NOT NULL,
      seat_id TEXT,
      section_name TEXT NOT NULL,
      row_label TEXT NOT NULL,
      seat_number INTEGER NOT NULL,
      tier_name TEXT NOT NULL,
      price REAL NOT NULL,
      qr_code_payload TEXT NOT NULL,
      checked_in INTEGER DEFAULT 0,
      checked_in_at TEXT,
      checked_in_by TEXT,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
      FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS promo_codes (
      code TEXT PRIMARY KEY,
      discount_percent REAL DEFAULT 0,
      fixed_discount REAL DEFAULT 0,
      min_order_amount REAL DEFAULT 0,
      max_uses INTEGER DEFAULT 1000,
      current_uses INTEGER DEFAULT 0,
      valid_until TEXT,
      is_active INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS gate_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id TEXT,
      event_id TEXT NOT NULL,
      scan_result TEXT NOT NULL,
      message TEXT,
      scanned_at TEXT NOT NULL,
      scanner_device TEXT DEFAULT 'Station Alpha 1'
    );
  `);
}

// Initialize tables immediately
initSchema();

// Periodically clean up expired seat holds
function cleanExpiredHolds() {
  try {
    const now = Date.now();
    const stmt = db.prepare(`
      UPDATE seats 
      SET status = 'available', hold_token = NULL, hold_expires_at = NULL 
      WHERE status = 'held' AND hold_expires_at < ?
    `);
    stmt.run(now);
  } catch (err) {
    // Gracefully handle any transient lock
  }
}

// Run cleanup every 15 seconds without blocking process exit
const holdCleanupTimer = setInterval(cleanExpiredHolds, 15000);
if (holdCleanupTimer.unref) {
  holdCleanupTimer.unref();
}

// --- VENUE REPOSITORY ---

function getVenues() {
  return db.prepare('SELECT * FROM venues ORDER BY name ASC').all();
}

function getVenueById(id) {
  return db.prepare('SELECT * FROM venues WHERE id = ?').get(id);
}

function createVenue(data) {
  const id = data.id || 'ven_' + crypto.randomUUID().slice(0, 8);
  const stmt = db.prepare(`
    INSERT INTO venues (id, name, type, city, address, capacity, layout_config, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    id,
    data.name,
    data.type || 'theatre',
    data.city || 'Los Angeles, CA',
    data.address || '100 Entertainment Blvd',
    data.capacity || 250,
    typeof data.layout_config === 'string' ? data.layout_config : JSON.stringify(data.layout_config || {}),
    new Date().toISOString()
  );
  return getVenueById(id);
}

// --- EVENT REPOSITORY ---

function getEvents(filters = {}) {
  let query = `
    SELECT e.*, v.name as venue_name, v.city as venue_city, v.type as venue_type,
           COUNT(DISTINCT s.id) as total_seats,
           SUM(CASE WHEN s.status = 'sold' THEN 1 ELSE 0 END) as sold_seats,
           MIN(t.price) as min_price,
           MAX(t.price) as max_price
    FROM events e
    JOIN venues v ON e.venue_id = v.id
    LEFT JOIN seats s ON s.event_id = e.id
    LEFT JOIN ticket_tiers t ON t.event_id = e.id
    WHERE 1=1
  `;
  const params = [];

  if (filters.genre && filters.genre !== 'All') {
    query += ' AND e.genre = ?';
    params.push(filters.genre);
  }

  if (filters.status && filters.status !== 'All') {
    query += ' AND e.status = ?';
    params.push(filters.status);
  }

  if (filters.search) {
    query += ' AND (e.title LIKE ? OR v.name LIKE ? OR e.description LIKE ?)';
    const searchWild = `%${filters.search}%`;
    params.push(searchWild, searchWild, searchWild);
  }

  query += ' GROUP BY e.id ORDER BY e.event_date ASC';

  const events = db.prepare(query).all(...params);

  return events.map(ev => {
    const total = ev.total_seats || 0;
    const sold = ev.sold_seats || 0;
    const occupancy = total > 0 ? Math.round((sold / total) * 100) : 0;
    return {
      ...ev,
      occupancy_pct: occupancy
    };
  });
}

function getEventById(id) {
  cleanExpiredHolds();
  const event = db.prepare(`
    SELECT e.*, v.name as venue_name, v.city as venue_city, v.address as venue_address, v.type as venue_type, v.layout_config
    FROM events e
    JOIN venues v ON e.venue_id = v.id
    WHERE e.id = ?
  `).get(id);

  if (!event) return null;

  const tiers = db.prepare('SELECT * FROM ticket_tiers WHERE event_id = ? ORDER BY price DESC').all(id);
  const parsedTiers = tiers.map(t => ({
    ...t,
    section_ids: JSON.parse(t.section_ids || '[]'),
    perks: JSON.parse(t.perks || '[]')
  }));

  const stats = db.prepare(`
    SELECT 
      COUNT(*) as total_seats,
      SUM(CASE WHEN status = 'available' THEN 1 ELSE 0 END) as available_seats,
      SUM(CASE WHEN status = 'held' THEN 1 ELSE 0 END) as held_seats,
      SUM(CASE WHEN status = 'sold' THEN 1 ELSE 0 END) as sold_seats,
      SUM(CASE WHEN status = 'sold' THEN price ELSE 0 END) as gross_revenue
    FROM seats
    WHERE event_id = ?
  `).get(id);

  return {
    ...event,
    tiers: parsedTiers,
    stats: {
      total: stats?.total_seats || 0,
      available: stats?.available_seats || 0,
      held: stats?.held_seats || 0,
      sold: stats?.sold_seats || 0,
      revenue: stats?.gross_revenue || 0,
      occupancy_pct: stats?.total_seats > 0 ? Math.round(((stats.sold_seats || 0) / stats.total_seats) * 100) : 0
    }
  };
}

function createEvent(data) {
  const id = data.id || 'evt_' + crypto.randomUUID().slice(0, 8);
  const now = new Date().toISOString();

  db.exec('BEGIN TRANSACTION');
  try {
    const insertEvent = db.prepare(`
      INSERT INTO events (id, venue_id, title, subtitle, genre, banner_url, accent_color, event_date, doors_open, status, description, age_restriction, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insertEvent.run(
      id,
      data.venue_id,
      data.title,
      data.subtitle || '',
      data.genre || 'Concert',
      data.banner_url || '',
      data.accent_color || '#6366f1',
      data.event_date,
      data.doors_open || '19:00',
      data.status || 'on_sale',
      data.description || '',
      data.age_restriction || 'All Ages',
      now
    );

    // Get venue layout to generate seats
    const venue = getVenueById(data.venue_id);
    const layout = typeof venue.layout_config === 'string' ? JSON.parse(venue.layout_config) : venue.layout_config;

    // Insert tiers
    const tiers = data.tiers && data.tiers.length > 0 ? data.tiers : [
      { id: 'tier_' + crypto.randomUUID().slice(0, 6), name: 'VIP Premium Experience', price: 180, fee: 12, color: '#f59e0b', section_ids: ['sec_vip'], perks: ['Front row priority', 'Lounge bar access', 'Complimentary VIP laminate'] },
      { id: 'tier_' + crypto.randomUUID().slice(0, 6), name: 'Orchestra Center', price: 95, fee: 8, color: '#6366f1', section_ids: ['sec_orch'], perks: ['Prime audio acoustic line', 'Fast-track gate'] },
      { id: 'tier_' + crypto.randomUUID().slice(0, 6), name: 'Balcony & Mezzanine', price: 55, fee: 5, color: '#10b981', section_ids: ['sec_balc'], perks: ['Standard theater admission'] }
    ];

    const insertTier = db.prepare(`
      INSERT INTO ticket_tiers (id, event_id, name, price, fee, color, section_ids, perks, total_allocation)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const t of tiers) {
      const tierId = t.id || 'tier_' + crypto.randomUUID().slice(0, 6);
      t.id = tierId;
      insertTier.run(
        tierId,
        id,
        t.name,
        t.price,
        t.fee || 5,
        t.color || '#6366f1',
        JSON.stringify(t.section_ids || []),
        JSON.stringify(t.perks || []),
        t.total_allocation || 100
      );
    }

    // Populate seats from layout
    if (layout && Array.isArray(layout.sections)) {
      const insertSeat = db.prepare(`
        INSERT INTO seats (id, event_id, section_id, section_name, row_label, seat_number, tier_id, status, price, is_accessible, restricted_view, x, y)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const section of layout.sections) {
        // Find matching tier
        const matchingTier = tiers.find(t => (t.section_ids || []).includes(section.id)) || tiers[tiers.length - 1];
        const rows = section.rows || 5;
        const seatsPerRow = section.seats_per_row || 10;
        const startX = section.x || 100;
        const startY = section.y || 100;
        const rowSpacing = section.row_spacing || 26;
        const seatSpacing = section.seat_spacing || 24;

        for (let r = 0; r < rows; r++) {
          const rowChar = String.fromCharCode(65 + r); // A, B, C...
          for (let s = 1; s <= seatsPerRow; s++) {
            const seatId = `${id}-${section.id}-${rowChar}-${s}`;
            const seatX = startX + (s - 1) * seatSpacing;
            const seatY = startY + r * rowSpacing;
            const isAccessible = (r === 0 && (s === 1 || s === seatsPerRow)) ? 1 : 0;
            const isRestricted = (r === rows - 1 && (s === 1 || s === seatsPerRow)) ? 1 : 0;

            insertSeat.run(
              seatId,
              id,
              section.id,
              section.name,
              rowChar,
              s,
              matchingTier.id,
              'available',
              matchingTier.price,
              isAccessible,
              isRestricted,
              seatX,
              seatY
            );
          }
        }
      }
    }

    db.exec('COMMIT');
    return getEventById(id);
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

function updateEvent(id, data) {
  const fields = [];
  const params = [];

  const allowedFields = ['title', 'subtitle', 'genre', 'banner_url', 'accent_color', 'event_date', 'doors_open', 'status', 'description', 'age_restriction'];
  for (const f of allowedFields) {
    if (data[f] !== undefined) {
      fields.push(`${f} = ?`);
      params.push(data[f]);
    }
  }

  if (fields.length === 0) return getEventById(id);

  params.push(id);
  db.prepare(`UPDATE events SET ${fields.join(', ')} WHERE id = ?`).run(...params);
  return getEventById(id);
}

function deleteEvent(id) {
  return db.prepare('DELETE FROM events WHERE id = ?').run(id);
}

// --- SEAT MANAGEMENT & REAL-TIME HOLD ENGINE ---

function getEventSeats(eventId) {
  cleanExpiredHolds();
  return db.prepare(`
    SELECT s.*, t.name as tier_name, t.color as tier_color, t.fee as tier_fee
    FROM seats s
    JOIN ticket_tiers t ON s.tier_id = t.id
    WHERE s.event_id = ?
    ORDER BY s.section_id, s.row_label, s.seat_number
  `).all(eventId);
}

/**
 * Atomic hold on one or more seats for 8 minutes
 */
function holdSeats(eventId, seatIds, clientHoldToken = null, ttlMinutes = 8) {
  cleanExpiredHolds();
  if (!seatIds || seatIds.length === 0) {
    throw new Error('No seats provided to hold');
  }

  const holdToken = clientHoldToken || 'hld_' + crypto.randomUUID().slice(0, 12);
  const expiresAt = Date.now() + (ttlMinutes * 60 * 1000);

  db.exec('BEGIN TRANSACTION');
  try {
    // Check if any seat is already sold or held by someone else
    const placeholders = seatIds.map(() => '?').join(',');
    const checkStmt = db.prepare(`
      SELECT id, status, hold_token, row_label, seat_number, section_name
      FROM seats 
      WHERE event_id = ? AND id IN (${placeholders})
    `);
    const seats = checkStmt.all(eventId, ...seatIds);

    if (seats.length !== seatIds.length) {
      throw new Error('One or more selected seats do not exist');
    }

    for (const seat of seats) {
      if (seat.status === 'sold') {
        throw new Error(`Seat ${seat.section_name} Row ${seat.row_label}-${seat.seat_number} is already sold`);
      }
      if (seat.status === 'held' && seat.hold_token !== holdToken) {
        throw new Error(`Seat ${seat.section_name} Row ${seat.row_label}-${seat.seat_number} is currently held by another buyer`);
      }
    }

    // Lock seats
    const updateStmt = db.prepare(`
      UPDATE seats 
      SET status = 'held', hold_token = ?, hold_expires_at = ?
      WHERE event_id = ? AND id IN (${placeholders})
    `);
    updateStmt.run(holdToken, expiresAt, eventId, ...seatIds);

    db.exec('COMMIT');

    return {
      success: true,
      holdToken,
      expiresAt,
      seatIds,
      remainingSeconds: Math.round((expiresAt - Date.now()) / 1000)
    };
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

/**
 * Release held seats back to available pool
 */
function releaseHold(eventId, seatIds = null, holdToken) {
  if (!holdToken) return { released: 0 };

  let query = "UPDATE seats SET status = 'available', hold_token = NULL, hold_expires_at = NULL WHERE event_id = ? AND hold_token = ?";
  const params = [eventId, holdToken];

  if (seatIds && seatIds.length > 0) {
    const placeholders = seatIds.map(() => '?').join(',');
    query += ` AND id IN (${placeholders})`;
    params.push(...seatIds);
  }

  const info = db.prepare(query).run(...params);
  return { released: info.changes };
}

// --- PROMO CODE VALIDATION ---

function validatePromo(code, subtotal) {
  if (!code) return { valid: false, discount: 0, message: 'No promo code provided' };
  
  const promo = db.prepare(`
    SELECT * FROM promo_codes 
    WHERE code = ? AND is_active = 1
  `).get(code.toUpperCase().trim());

  if (!promo) {
    return { valid: false, discount: 0, message: 'Invalid promo code' };
  }

  if (promo.valid_until && new Date(promo.valid_until) < new Date()) {
    return { valid: false, discount: 0, message: 'Promo code has expired' };
  }

  if (promo.current_uses >= promo.max_uses) {
    return { valid: false, discount: 0, message: 'Promo code maximum usage reached' };
  }

  if (subtotal < promo.min_order_amount) {
    return { valid: false, discount: 0, message: `Minimum order amount of $${promo.min_order_amount.toFixed(2)} required` };
  }

  let discount = 0;
  if (promo.discount_percent > 0) {
    discount = (subtotal * promo.discount_percent) / 100;
  } else if (promo.fixed_discount > 0) {
    discount = Math.min(subtotal, promo.fixed_discount);
  }

  return {
    valid: true,
    code: promo.code,
    discount: Number(discount.toFixed(2)),
    message: promo.discount_percent > 0 ? `${promo.discount_percent}% off applied!` : `$${promo.fixed_discount} discount applied!`
  };
}

// --- CHECKOUT & ORDER COMPLETION ENGINE ---

function processCheckout({
  eventId,
  seatIds,
  holdToken,
  buyer,
  promoCode = null,
  paymentMethod = 'Credit Card'
}) {
  cleanExpiredHolds();

  if (!seatIds || seatIds.length === 0) {
    throw new Error('No seats provided for checkout');
  }

  if (!buyer || !buyer.name || !buyer.email) {
    throw new Error('Buyer full name and email are required');
  }

  db.exec('BEGIN TRANSACTION');
  try {
    const placeholders = seatIds.map(() => '?').join(',');
    const seatsStmt = db.prepare(`
      SELECT s.*, t.name as tier_name, t.fee as tier_fee
      FROM seats s
      JOIN ticket_tiers t ON s.tier_id = t.id
      WHERE s.event_id = ? AND s.id IN (${placeholders})
    `);
    const seats = seatsStmt.all(eventId, ...seatIds);

    if (seats.length !== seatIds.length) {
      throw new Error('Seats count mismatch or seat no longer available');
    }

    // Verify each seat is held by this holdToken OR is currently available
    for (const seat of seats) {
      if (seat.status === 'sold') {
        throw new Error(`Seat ${seat.section_name} Row ${seat.row_label}-${seat.seat_number} is already sold`);
      }
      if (seat.status === 'held' && holdToken && seat.hold_token !== holdToken) {
        throw new Error(`Seat ${seat.section_name} Row ${seat.row_label}-${seat.seat_number} hold has expired or belongs to another session`);
      }
    }

    // Calculate totals
    let subtotal = 0;
    let serviceFees = 0;
    for (const seat of seats) {
      subtotal += seat.price;
      serviceFees += (seat.tier_fee || 5.00);
    }

    let discount = 0;
    if (promoCode) {
      const promoResult = validatePromo(promoCode, subtotal);
      if (promoResult.valid) {
        discount = promoResult.discount;
        // Increment promo uses
        db.prepare('UPDATE promo_codes SET current_uses = current_uses + 1 WHERE code = ?').run(promoCode.toUpperCase().trim());
      }
    }

    const tax = Number(((subtotal - discount) * 0.0825).toFixed(2)); // 8.25% entertainment tax
    const totalAmount = Number((subtotal + serviceFees + tax - discount).toFixed(2));

    const orderId = 'VV-' + Math.floor(100000 + Math.random() * 900000);
    const nowIso = new Date().toISOString();

    // Insert Order
    db.prepare(`
      INSERT INTO orders (id, event_id, buyer_name, buyer_email, buyer_phone, subtotal, service_fee, tax, discount, promo_code, total_amount, payment_method, payment_status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'paid', ?)
    `).run(
      orderId,
      eventId,
      buyer.name,
      buyer.email,
      buyer.phone || '',
      subtotal,
      serviceFees,
      tax,
      discount,
      promoCode ? promoCode.toUpperCase() : null,
      totalAmount,
      paymentMethod,
      nowIso
    );

    // Mark seats as sold
    db.prepare(`
      UPDATE seats 
      SET status = 'sold', hold_token = NULL, hold_expires_at = NULL 
      WHERE event_id = ? AND id IN (${placeholders})
    `).run(eventId, ...seatIds);

    // Generate individual tickets with unique verifiable QR code payload
    const insertTicket = db.prepare(`
      INSERT INTO tickets (id, order_id, event_id, seat_id, section_name, row_label, seat_number, tier_name, price, qr_code_payload, checked_in)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
    `);

    const generatedTickets = [];
    for (const seat of seats) {
      const ticketId = 'TKT-' + crypto.randomUUID().slice(0, 8).toUpperCase();
      const qrPayload = JSON.stringify({
        v: 1,
        tid: ticketId,
        eid: eventId,
        oid: orderId,
        sec: seat.section_name,
        r: seat.row_label,
        s: seat.seat_number,
        name: buyer.name
      });

      insertTicket.run(
        ticketId,
        orderId,
        eventId,
        seat.id,
        seat.section_name,
        seat.row_label,
        seat.seat_number,
        seat.tier_name,
        seat.price,
        qrPayload
      );

      generatedTickets.push({
        id: ticketId,
        order_id: orderId,
        event_id: eventId,
        seat_id: seat.id,
        section_name: seat.section_name,
        row_label: seat.row_label,
        seat_number: seat.seat_number,
        tier_name: seat.tier_name,
        price: seat.price,
        qr_code_payload: qrPayload,
        checked_in: 0
      });
    }

    db.exec('COMMIT');

    const event = db.prepare('SELECT title, event_date, doors_open, banner_url FROM events WHERE id = ?').get(eventId);
    const venue = db.prepare('SELECT name, city, address FROM venues WHERE id = (SELECT venue_id FROM events WHERE id = ?)').get(eventId);

    return {
      success: true,
      order: {
        id: orderId,
        eventId,
        eventTitle: event?.title,
        eventDate: event?.event_date,
        doorsOpen: event?.doors_open,
        venueName: venue?.name,
        venueAddress: `${venue?.address}, ${venue?.city}`,
        buyerName: buyer.name,
        buyerEmail: buyer.email,
        subtotal,
        serviceFees,
        tax,
        discount,
        totalAmount,
        paymentMethod,
        createdAt: nowIso,
        tickets: generatedTickets
      }
    };
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

function getOrderById(orderId) {
  const order = db.prepare(`
    SELECT o.*, e.title as event_title, e.event_date, e.doors_open, v.name as venue_name, v.address as venue_address, v.city as venue_city
    FROM orders o
    JOIN events e ON o.event_id = e.id
    JOIN venues v ON e.venue_id = v.id
    WHERE o.id = ?
  `).get(orderId);

  if (!order) return null;

  const tickets = db.prepare('SELECT * FROM tickets WHERE order_id = ?').all(orderId);
  return {
    ...order,
    tickets
  };
}

// --- GATE SCANNER & ACCESS CONTROL ---

function scanTicket(payloadOrId, device = 'Scanner-Alpha') {
  let ticketId = payloadOrId;

  // Try parsing JSON payload if scanned from camera QR
  try {
    const parsed = JSON.parse(payloadOrId);
    if (parsed.tid) ticketId = parsed.tid;
  } catch {
    // raw ticket ID string
  }

  const nowIso = new Date().toISOString();

  const ticket = db.prepare(`
    SELECT t.*, e.title as event_title, e.event_date, o.buyer_name, o.buyer_email
    FROM tickets t
    JOIN events e ON t.event_id = e.id
    JOIN orders o ON t.order_id = o.id
    WHERE t.id = ? OR t.qr_code_payload = ?
  `).get(ticketId, payloadOrId);

  if (!ticket) {
    db.prepare(`
      INSERT INTO gate_logs (ticket_id, event_id, scan_result, message, scanned_at, scanner_device)
      VALUES (?, 'unknown', 'INVALID_TICKET', 'Ticket code not recognized in system', ?, ?)
    `).run(ticketId, nowIso, device);

    return {
      status: 'INVALID_TICKET',
      valid: false,
      message: 'Invalid ticket pass. No matching record found.',
      timestamp: nowIso
    };
  }

  if (ticket.checked_in === 1) {
    db.prepare(`
      INSERT INTO gate_logs (ticket_id, event_id, scan_result, message, scanned_at, scanner_device)
      VALUES (?, ?, 'ALREADY_REDEEMED', ?, ?, ?)
    `).run(ticket.id, ticket.event_id, `Pass already scanned at ${ticket.checked_in_at}`, nowIso, device);

    return {
      status: 'ALREADY_REDEEMED',
      valid: false,
      message: `Already scanned at ${new Date(ticket.checked_in_at).toLocaleTimeString()}`,
      ticket: {
        id: ticket.id,
        buyerName: ticket.buyer_name,
        section: ticket.section_name,
        seat: `Row ${ticket.row_label}-${ticket.seat_number}`,
        tier: ticket.tier_name,
        checkedInAt: ticket.checked_in_at
      },
      timestamp: nowIso
    };
  }

  // Mark ticket as checked in
  db.prepare(`
    UPDATE tickets 
    SET checked_in = 1, checked_in_at = ?, checked_in_by = ?
    WHERE id = ?
  `).run(nowIso, device, ticket.id);

  db.prepare(`
    INSERT INTO gate_logs (ticket_id, event_id, scan_result, message, scanned_at, scanner_device)
    VALUES (?, ?, 'SUCCESS', 'Access granted', ?, ?)
  `).run(ticket.id, ticket.event_id, nowIso, device);

  return {
    status: 'SUCCESS',
    valid: true,
    message: 'Access granted. Welcome to the venue!',
    ticket: {
      id: ticket.id,
      buyerName: ticket.buyer_name,
      eventTitle: ticket.event_title,
      section: ticket.section_name,
      seat: `Row ${ticket.row_label}-${ticket.seat_number}`,
      tier: ticket.tier_name,
      vip: ticket.tier_name.toLowerCase().includes('vip'),
      checkedInAt: nowIso
    },
    timestamp: nowIso
  };
}

function getGateStats(eventId) {
  const stats = db.prepare(`
    SELECT 
      COUNT(*) as total_issued,
      SUM(CASE WHEN checked_in = 1 THEN 1 ELSE 0 END) as checked_in_count,
      SUM(CASE WHEN checked_in = 0 THEN 1 ELSE 0 END) as pending_count
    FROM tickets
    WHERE event_id = ?
  `).get(eventId);

  const bySection = db.prepare(`
    SELECT section_name, 
           COUNT(*) as total,
           SUM(CASE WHEN checked_in = 1 THEN 1 ELSE 0 END) as checked_in
    FROM tickets
    WHERE event_id = ?
    GROUP BY section_name
  `).all(eventId);

  const recentLogs = db.prepare(`
    SELECT g.*, t.section_name, t.row_label, t.seat_number, o.buyer_name
    FROM gate_logs g
    LEFT JOIN tickets t ON g.ticket_id = t.id
    LEFT JOIN orders o ON t.order_id = o.id
    WHERE g.event_id = ?
    ORDER BY g.id DESC
    LIMIT 20
  `).all(eventId);

  const total = stats?.total_issued || 0;
  const checkedIn = stats?.checked_in_count || 0;

  return {
    totalIssued: total,
    checkedInCount: checkedIn,
    pendingCount: stats?.pending_count || 0,
    checkInPct: total > 0 ? Math.round((checkedIn / total) * 100) : 0,
    bySection,
    recentLogs
  };
}

// --- SALES & BOX OFFICE ANALYTICS ---

function getAnalytics(eventId = null) {
  let eventFilter = '';
  const params = [];
  if (eventId && eventId !== 'all') {
    eventFilter = 'WHERE o.event_id = ?';
    params.push(eventId);
  }

  // High level KPIs
  const kpis = db.prepare(`
    SELECT 
      COUNT(DISTINCT o.id) as total_orders,
      COALESCE(SUM(o.total_amount), 0) as gross_revenue,
      COALESCE(SUM(o.subtotal), 0) as ticket_revenue,
      COALESCE(SUM(o.service_fee), 0) as total_fees,
      COALESCE(SUM(o.discount), 0) as total_discounts,
      COALESCE(AVG(o.total_amount), 0) as average_order_value,
      COUNT(t.id) as total_tickets_sold
    FROM orders o
    LEFT JOIN tickets t ON o.id = t.order_id
    ${eventFilter}
  `).get(...params);

  // Revenue by Seating Tier
  let tierFilter = '';
  const tierParams = [];
  if (eventId && eventId !== 'all') {
    tierFilter = 'WHERE t.event_id = ?';
    tierParams.push(eventId);
  }
  const byTier = db.prepare(`
    SELECT t.tier_name, 
           COUNT(*) as tickets_sold,
           SUM(t.price) as revenue
    FROM tickets t
    ${tierFilter}
    GROUP BY t.tier_name
    ORDER BY revenue DESC
  `).all(...tierParams);

  // Revenue by Section
  const bySection = db.prepare(`
    SELECT t.section_name, 
           COUNT(*) as tickets_sold,
           SUM(t.price) as revenue
    FROM tickets t
    ${tierFilter}
    GROUP BY t.section_name
    ORDER BY tickets_sold DESC
  `).all(...tierParams);

  // Sales Timeline (Orders grouped by date)
  let timelineFilter = '';
  const timeParams = [];
  if (eventId && eventId !== 'all') {
    timelineFilter = 'WHERE event_id = ?';
    timeParams.push(eventId);
  }
  const timeline = db.prepare(`
    SELECT substr(created_at, 1, 10) as sale_date,
           COUNT(*) as order_count,
           SUM(total_amount) as daily_revenue
    FROM orders
    ${timelineFilter}
    GROUP BY substr(created_at, 1, 10)
    ORDER BY sale_date ASC
  `).all(...timeParams);

  // Top Performing Events
  const topEvents = db.prepare(`
    SELECT e.id, e.title, e.genre, v.name as venue_name,
           COUNT(DISTINCT o.id) as orders_count,
           COUNT(t.id) as tickets_sold,
           COALESCE(SUM(o.total_amount), 0) as total_revenue
    FROM events e
    JOIN venues v ON e.venue_id = v.id
    LEFT JOIN orders o ON e.id = o.event_id
    LEFT JOIN tickets t ON o.id = t.order_id
    GROUP BY e.id
    ORDER BY total_revenue DESC
  `).all();

  // Promo code performance
  const promos = db.prepare(`
    SELECT p.code, p.discount_percent, p.fixed_discount, p.current_uses,
           COALESCE(SUM(o.discount), 0) as total_savings,
           COALESCE(SUM(o.total_amount), 0) as driven_revenue
    FROM promo_codes p
    LEFT JOIN orders o ON p.code = o.promo_code
    GROUP BY p.code
  `).all();

  // Total capacity and venue occupancy
  let seatStatsQuery = "SELECT COUNT(*) as total_capacity, SUM(CASE WHEN status = 'sold' THEN 1 ELSE 0 END) as sold_count FROM seats";
  const seatStatsParams = [];
  if (eventId && eventId !== 'all') {
    seatStatsQuery += ' WHERE event_id = ?';
    seatStatsParams.push(eventId);
  }
  const seatStats = db.prepare(seatStatsQuery).get(...seatStatsParams);

  const capacity = seatStats?.total_capacity || 0;
  const soldCount = seatStats?.sold_count || 0;
  const overallOccupancy = capacity > 0 ? Math.round((soldCount / capacity) * 100) : 0;

  return {
    kpis: {
      totalOrders: kpis?.total_orders || 0,
      grossRevenue: Number((kpis?.gross_revenue || 0).toFixed(2)),
      ticketRevenue: Number((kpis?.ticket_revenue || 0).toFixed(2)),
      totalFees: Number((kpis?.total_fees || 0).toFixed(2)),
      totalDiscounts: Number((kpis?.total_discounts || 0).toFixed(2)),
      aov: Number((kpis?.average_order_value || 0).toFixed(2)),
      ticketsSold: kpis?.total_tickets_sold || 0,
      totalCapacity: capacity,
      occupancyPct: overallOccupancy
    },
    byTier,
    bySection,
    timeline,
    topEvents,
    promos
  };
}

// Export data for audit/CSV
function getExportData(type = 'orders', eventId = null) {
  if (type === 'attendees') {
    let q = `
      SELECT t.id as ticket_id, o.id as order_id, e.title as event_title, o.buyer_name, o.buyer_email,
             t.section_name, t.row_label, t.seat_number, t.tier_name, t.price, t.checked_in, t.checked_in_at
      FROM tickets t
      JOIN orders o ON t.order_id = o.id
      JOIN events e ON t.event_id = e.id
    `;
    const p = [];
    if (eventId && eventId !== 'all') {
      q += ' WHERE t.event_id = ?';
      p.push(eventId);
    }
    q += ' ORDER BY o.created_at DESC';
    return db.prepare(q).all(...p);
  } else {
    let q = `
      SELECT o.id as order_id, e.title as event_title, o.buyer_name, o.buyer_email, o.subtotal,
             o.service_fee, o.tax, o.discount, o.promo_code, o.total_amount, o.payment_method, o.created_at
      FROM orders o
      JOIN events e ON o.event_id = e.id
    `;
    const p = [];
    if (eventId && eventId !== 'all') {
      q += ' WHERE o.event_id = ?';
      p.push(eventId);
    }
    q += ' ORDER BY o.created_at DESC';
    return db.prepare(q).all(...p);
  }
}

// --- DATABASE SEEDING ---

function seedDatabase(force = false) {
  const existingVenues = db.prepare('SELECT COUNT(*) as count FROM venues').get();
  if (existingVenues.count > 0 && !force) {
    return;
  }

  // Clear existing data if force
  if (force) {
    db.exec(`
      DELETE FROM gate_logs;
      DELETE FROM tickets;
      DELETE FROM orders;
      DELETE FROM seats;
      DELETE FROM ticket_tiers;
      DELETE FROM events;
      DELETE FROM venues;
      DELETE FROM promo_codes;
    `);
  }

  // 1. Venues
  const venue1 = {
    id: 'ven_proscenium',
    name: 'The Majestic Royal Theatre',
    type: 'theatre',
    city: 'London & West End',
    address: '42 Shaftesbury Avenue',
    capacity: 220,
    layout_config: {
      style: 'theatre',
      stage: { label: 'PROSCENIUM MAIN STAGE', width: 620, height: 44 },
      sections: [
        { id: 'sec_orch', name: 'Royal Stalls (Orchestra)', rows: 5, seats_per_row: 14, x: 80, y: 100, row_spacing: 28, seat_spacing: 34, tier_match: 'VIP Orchestra' },
        { id: 'sec_box_l', name: 'Royal Private Box Left', rows: 2, seats_per_row: 4, x: 10, y: 120, row_spacing: 32, seat_spacing: 30, tier_match: 'Royal Box Suite' },
        { id: 'sec_box_r', name: 'Royal Private Box Right', rows: 2, seats_per_row: 4, x: 580, y: 120, row_spacing: 32, seat_spacing: 30, tier_match: 'Royal Box Suite' },
        { id: 'sec_circle', name: 'Grand Dress Circle', rows: 4, seats_per_row: 16, x: 50, y: 260, row_spacing: 28, seat_spacing: 33, tier_match: 'Dress Circle Prime' },
        { id: 'sec_balc', name: 'Upper Balcony Tier', rows: 3, seats_per_row: 18, x: 20, y: 395, row_spacing: 28, seat_spacing: 32, tier_match: 'Balcony General' }
      ]
    }
  };

  const venue2 = {
    id: 'ven_skyline_arena',
    name: 'Apex Pulse Arena',
    type: 'arena',
    city: 'Los Angeles, CA',
    address: '1111 S Figueroa St',
    capacity: 260,
    layout_config: {
      style: 'arena',
      stage: { label: '360° HYDRAULIC ARENA STAGE', width: 580, height: 50 },
      sections: [
        { id: 'sec_pit', name: 'Diamond VIP Pit (Standing/Front)', rows: 3, seats_per_row: 16, x: 60, y: 100, row_spacing: 30, seat_spacing: 32, tier_match: 'VIP Diamond Experience' },
        { id: 'sec_floor', name: 'Floor Reserved Lower', rows: 4, seats_per_row: 18, x: 30, y: 210, row_spacing: 28, seat_spacing: 32, tier_match: 'Floor Reserved Tier' },
        { id: 'sec_club', name: 'Club Executive Level', rows: 4, seats_per_row: 20, x: 10, y: 340, row_spacing: 28, seat_spacing: 30, tier_match: 'Club Tier Seating' }
      ]
    }
  };

  const venue3 = {
    id: 'ven_velvet_club',
    name: 'The Velvet Underground Jazz & Comedy Lounge',
    type: 'club',
    city: 'New York, NY',
    address: '130 W 3rd St, Greenwich Village',
    capacity: 110,
    layout_config: {
      style: 'cabaret',
      stage: { label: 'SPOTLIGHT ACOUSTIC STAGE', width: 440, height: 40 },
      sections: [
        { id: 'sec_stage_tables', name: 'VIP Front Banquette Tables', rows: 3, seats_per_row: 10, x: 90, y: 100, row_spacing: 35, seat_spacing: 40, tier_match: 'Front Table VIP' },
        { id: 'sec_cocktail', name: 'Cocktail Mezzanine Tables', rows: 4, seats_per_row: 12, x: 50, y: 230, row_spacing: 32, seat_spacing: 38, tier_match: 'Mezzanine Cocktail' },
        { id: 'sec_bar', name: 'High-Top Bar Rail', rows: 2, seats_per_row: 16, x: 20, y: 380, row_spacing: 30, seat_spacing: 34, tier_match: 'Bar Rail Admission' }
      ]
    }
  };

  createVenue(venue1);
  createVenue(venue2);
  createVenue(venue3);

  // 2. Events & Tiers
  const now = new Date();
  const dateEvent1 = new Date(now.getTime() + 5 * 24 * 3600 * 1000).toISOString().split('T')[0];
  const dateEvent2 = new Date(now.getTime() + 14 * 24 * 3600 * 1000).toISOString().split('T')[0];
  const dateEvent3 = new Date(now.getTime() + 21 * 24 * 3600 * 1000).toISOString().split('T')[0];

  const evt1 = createEvent({
    id: 'evt_hamilton',
    venue_id: 'ven_proscenium',
    title: 'Hamilton: An American Musical',
    subtitle: 'Revival Gala Tour - All-Star West End Cast',
    genre: 'Broadway Musical',
    banner_url: 'https://images.unsplash.com/photo-1507676184212-d03ab07a01bf?auto=format&fit=crop&w=1200&q=80',
    accent_color: '#eab308',
    event_date: `${dateEvent1} 19:30`,
    doors_open: '18:30',
    status: 'on_sale',
    description: 'Experience the revolutionary hip-hop, jazz, and R&B musical chronicle of Alexander Hamilton. Featuring spectacular multi-tiered staging, full live orchestra, and world-class vocal performances.',
    age_restriction: 'Recommended 10+',
    tiers: [
      { id: 'tier_ham_box', name: 'Royal Box Suite & Champagne', price: 245.00, fee: 18.00, color: '#f59e0b', section_ids: ['sec_box_l', 'sec_box_r'], perks: ['Private VIP Butler service', 'Complimentary Vintage Champagne', 'Souvenir Cast Album Book'] },
      { id: 'tier_ham_orch', name: 'Royal Stalls (VIP Orchestra)', price: 145.00, fee: 12.00, color: '#8b5cf6', section_ids: ['sec_orch'], perks: ['Front 5 rows sightline', 'Dedicated theater express gate'] },
      { id: 'tier_ham_circle', name: 'Dress Circle Prime', price: 95.00, fee: 8.00, color: '#06b6d4', section_ids: ['sec_circle'], perks: ['Acoustically balanced center view'] },
      { id: 'tier_ham_balc', name: 'Upper Balcony Tier', price: 58.00, fee: 6.00, color: '#10b981', section_ids: ['sec_balc'], perks: ['Standard theater admission'] }
    ]
  });

  const evt2 = createEvent({
    id: 'evt_neon_odyssey',
    venue_id: 'ven_skyline_arena',
    title: 'Neon Odyssey: World Arena Tour 2026',
    subtitle: 'The Weeknd with Holographic Daft Punk Tribute',
    genre: 'Rock/Pop',
    banner_url: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=1200&q=80',
    accent_color: '#ec4899',
    event_date: `${dateEvent2} 20:00`,
    doors_open: '18:30',
    status: 'selling_fast',
    description: 'A mind-bending sonic and visual stadium spectacle featuring 360-degree laser arrays, live synth-wave orchestra, and electrifying mega hits.',
    age_restriction: 'All Ages',
    tiers: [
      { id: 'tier_neon_pit', name: 'Diamond VIP Pit + Soundcheck Pass', price: 290.00, fee: 22.00, color: '#ec4899', section_ids: ['sec_pit'], perks: ['Pre-show artist soundcheck entry', 'VIP Diamond Laminate', 'Exclusive Tour Merch Pack'] },
      { id: 'tier_neon_floor', name: 'Floor Reserved Tier A', price: 135.00, fee: 10.00, color: '#3b82f6', section_ids: ['sec_floor'], perks: ['Direct floor-level sightlines'] },
      { id: 'tier_neon_club', name: 'Club Executive Level', price: 85.00, fee: 8.00, color: '#10b981', section_ids: ['sec_club'], perks: ['In-seat beverage delivery available'] }
    ]
  });

  const evt3 = createEvent({
    id: 'evt_comedy_night',
    venue_id: 'ven_velvet_club',
    title: 'Late Night Unfiltered: Comedy Gala',
    subtitle: 'Hasan Minhaj & Special Guest Headliners Live',
    genre: 'Stand-up Comedy',
    banner_url: 'https://images.unsplash.com/photo-1585699324551-f6c309eedeca?auto=format&fit=crop&w=1200&q=80',
    accent_color: '#f97316',
    event_date: `${dateEvent3} 21:00`,
    doors_open: '20:00',
    status: 'on_sale',
    description: 'An intimate evening of high-octane wit, storytelling, and comedy mastery in New York’s premiere underground lounge. Two drink minimum applies.',
    age_restriction: '21+ Only',
    tiers: [
      { id: 'tier_com_stage', name: 'Stage Banquette VIP Table', price: 95.00, fee: 8.00, color: '#f97316', section_ids: ['sec_stage_tables'], perks: ['Front row table service', 'Meet & Greet photo with performers'] },
      { id: 'tier_com_cocktail', name: 'Cocktail Mezzanine Seating', price: 55.00, fee: 5.00, color: '#8b5cf6', section_ids: ['sec_cocktail'], perks: ['Reserved cocktail table seating'] },
      { id: 'tier_com_bar', name: 'High-Top Bar Rail', price: 38.00, fee: 4.00, color: '#06b6d4', section_ids: ['sec_bar'], perks: ['General admission bar rail stool'] }
    ]
  });

  // 3. Promo Codes
  const insertPromo = db.prepare(`
    INSERT INTO promo_codes (code, discount_percent, fixed_discount, min_order_amount, max_uses, current_uses, valid_until, is_active)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1)
  `);
  insertPromo.run('VISTAPRO', 15, 0, 50, 500, 12, '2027-12-31');
  insertPromo.run('VIPENTERTAINMENT', 25, 0, 100, 100, 4, '2027-12-31');
  insertPromo.run('EARLYBIRD', 0, 20, 80, 250, 8, '2027-12-31');
  insertPromo.run('PRESSPASS', 50, 0, 0, 50, 2, '2027-12-31');

  // 4. Seed realistic orders and tickets for evt_hamilton and evt_neon_odyssey so analytics has rich data
  const sampleBuyers = [
    { name: 'Elena Rostova', email: 'elena.rostova@example.com', phone: '+1 (555) 234-5678' },
    { name: 'Marcus Sterling', email: 'm.sterling@mediaventure.com', phone: '+1 (555) 876-5432' },
    { name: 'Chloe Montgomery', email: 'chloe.m@entertainment.net', phone: '+1 (555) 345-6789' },
    { name: 'David Vance', email: 'dvance@hollywoodrecords.com', phone: '+1 (555) 901-2345' },
    { name: 'Aria Takahashi', email: 'aria.t@soundstage.io', phone: '+1 (555) 456-7890' },
    { name: 'Julian Mercer', email: 'julian@curtaincall.org', phone: '+1 (555) 678-9012' }
  ];

  // Fetch some seats for Hamilton
  const hamSeats = db.prepare("SELECT id FROM seats WHERE event_id = 'evt_hamilton' ORDER BY row_label ASC, seat_number ASC LIMIT 28").all();
  
  // Book seats in batches
  for (let i = 0; i < sampleBuyers.length; i++) {
    const buyer = sampleBuyers[i];
    const seatsToBook = hamSeats.slice(i * 4, (i + 1) * 4).map(s => s.id);
    if (seatsToBook.length > 0) {
      try {
        const orderResult = processCheckout({
          eventId: 'evt_hamilton',
          seatIds: seatsToBook,
          holdToken: null,
          buyer,
          promoCode: i === 0 ? 'VISTAPRO' : null,
          paymentMethod: i % 2 === 0 ? 'Apple Pay' : 'Visa •••• 4242'
        });

        // Pre-checkin some tickets for gate scanner demonstration
        if (i === 0 && orderResult.order?.tickets?.[0]) {
          const t1 = orderResult.order.tickets[0];
          scanTicket(t1.id, 'Main Lobby Gate Scanner 1');
        }
        if (i === 1 && orderResult.order?.tickets?.[0]) {
          const t2 = orderResult.order.tickets[0];
          scanTicket(t2.id, 'VIP Express Lane Alpha');
        }
      } catch (err) {
        console.error('Seed order error:', err);
      }
    }
  }

  // Also seed some orders for Neon Odyssey
  const neonSeats = db.prepare("SELECT id FROM seats WHERE event_id = 'evt_neon_odyssey' ORDER BY row_label ASC, seat_number ASC LIMIT 24").all();
  for (let i = 0; i < 3; i++) {
    const buyer = sampleBuyers[i + 2];
    const seatsToBook = neonSeats.slice(i * 6, (i + 1) * 6).map(s => s.id);
    if (seatsToBook.length > 0) {
      try {
        processCheckout({
          eventId: 'evt_neon_odyssey',
          seatIds: seatsToBook,
          holdToken: null,
          buyer,
          promoCode: i === 1 ? 'EARLYBIRD' : null,
          paymentMethod: 'Mastercard •••• 8812'
        });
      } catch (err) {
        console.error('Seed neon order error:', err);
      }
    }
  }
}

// Seed upon module load if empty
seedDatabase(false);

module.exports = {
  db,
  getVenues,
  getVenueById,
  createVenue,
  getEvents,
  getEventById,
  createEvent,
  updateEvent,
  deleteEvent,
  getEventSeats,
  holdSeats,
  releaseHold,
  cleanExpiredHolds,
  validatePromo,
  processCheckout,
  getOrderById,
  scanTicket,
  getGateStats,
  getAnalytics,
  getExportData,
  seedDatabase
};
