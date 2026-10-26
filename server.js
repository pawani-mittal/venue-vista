/**
 * Venue Vista - High Performance Native Full-Stack Server
 * Features:
 * - REST API with comprehensive ticketing & venue management endpoints
 * - Real-time Server-Sent Events (SSE) for concurrent seat locking
 * - Optimized static file serving with caching & MIME support
 * - CSV/JSON box office data export
 */

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const url = require('node:url');
const db = require('./db');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

// Track active SSE subscribers per event
const sseClients = new Map(); // eventId -> Set of response objects

function notifySeatSubscribers(eventId, data) {
  const clients = sseClients.get(eventId);
  if (!clients || clients.size === 0) return;
  const payload = `data: ${JSON.stringify(data)}\n\n`;
  for (const client of clients) {
    try {
      client.write(payload);
    } catch {
      clients.delete(client);
    }
  }
}

// MIME types table
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2'
};

// Request body helper
function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 5 * 1024 * 1024) { // 5MB limit
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        reject(new Error('Invalid JSON format: ' + err.message));
      }
    });
    req.on('error', reject);
  });
}

// Send JSON response helper
function sendJson(res, statusCode, data) {
  const payload = JSON.stringify(data);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Cache-Control': 'no-cache'
  });
  res.end(payload);
}

// Send Error response helper
function sendError(res, statusCode, message) {
  sendJson(res, statusCode, { error: true, message });
}

// Main HTTP Server Request Router
const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  const method = req.method;

  // Handle CORS Preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400'
    });
    return res.end();
  }

  try {
    // ----------------------------------------------------
    // API ROUTES
    // ----------------------------------------------------

    // Health check
    if (pathname === '/api/health' && method === 'GET') {
      return sendJson(res, 200, {
        status: 'online',
        system: 'Venue Vista Event Pro Engine',
        version: '1.0.0',
        timestamp: new Date().toISOString()
      });
    }

    // Venues
    if (pathname === '/api/venues' && method === 'GET') {
      const venues = db.getVenues();
      return sendJson(res, 200, { venues });
    }

    if (pathname.startsWith('/api/venues/') && method === 'GET') {
      const venueId = pathname.split('/')[3];
      const venue = db.getVenueById(venueId);
      if (!venue) return sendError(res, 404, 'Venue not found');
      return sendJson(res, 200, { venue });
    }

    if (pathname === '/api/venues' && method === 'POST') {
      const body = await parseJsonBody(req);
      if (!body.name) return sendError(res, 400, 'Venue name is required');
      const venue = db.createVenue(body);
      return sendJson(res, 201, { venue, message: 'Venue created successfully' });
    }

    // Events list & filter
    if (pathname === '/api/events' && method === 'GET') {
      const events = db.getEvents(parsedUrl.query);
      return sendJson(res, 200, { events });
    }

    // Event details
    if (pathname.match(/^\/api\/events\/[a-zA-Z0-9_-]+$/) && method === 'GET') {
      const eventId = pathname.split('/')[3];
      const event = db.getEventById(eventId);
      if (!event) return sendError(res, 404, 'Event not found');
      return sendJson(res, 200, { event });
    }

    // Create event
    if (pathname === '/api/events' && method === 'POST') {
      const body = await parseJsonBody(req);
      if (!body.title || !body.venue_id || !body.event_date) {
        return sendError(res, 400, 'Title, venue, and event date are required');
      }
      const event = db.createEvent(body);
      return sendJson(res, 201, { event, message: 'Event created and seats generated' });
    }

    // Update event
    if (pathname.match(/^\/api\/events\/[a-zA-Z0-9_-]+$/) && method === 'PUT') {
      const eventId = pathname.split('/')[3];
      const body = await parseJsonBody(req);
      const updated = db.updateEvent(eventId, body);
      return sendJson(res, 200, { event: updated, message: 'Event updated' });
    }

    // Delete event
    if (pathname.match(/^\/api\/events\/[a-zA-Z0-9_-]+$/) && method === 'DELETE') {
      const eventId = pathname.split('/')[3];
      db.deleteEvent(eventId);
      return sendJson(res, 200, { success: true, message: 'Event deleted' });
    }

    // Get event seats
    if (pathname.match(/^\/api\/events\/[a-zA-Z0-9_-]+\/seats$/) && method === 'GET') {
      const eventId = pathname.split('/')[3];
      const seats = db.getEventSeats(eventId);
      return sendJson(res, 200, { seats });
    }

    // Live SSE stream for real-time seat lock synchronization
    if (pathname.match(/^\/api\/events\/[a-zA-Z0-9_-]+\/live-stream$/) && method === 'GET') {
      const eventId = pathname.split('/')[3];
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*'
      });
      res.write(': connected\n\n');

      if (!sseClients.has(eventId)) {
        sseClients.set(eventId, new Set());
      }
      sseClients.get(eventId).add(res);

      req.on('close', () => {
        const clients = sseClients.get(eventId);
        if (clients) {
          clients.delete(res);
          if (clients.size === 0) sseClients.delete(eventId);
        }
      });
      return;
    }

    // Hold seats
    if (pathname.match(/^\/api\/events\/[a-zA-Z0-9_-]+\/hold$/) && method === 'POST') {
      const eventId = pathname.split('/')[3];
      const body = await parseJsonBody(req);
      try {
        const holdResult = db.holdSeats(eventId, body.seatIds, body.holdToken, body.ttlMinutes || 8);
        notifySeatSubscribers(eventId, { type: 'SEATS_HELD', seatIds: body.seatIds, holdToken: holdResult.holdToken });
        return sendJson(res, 200, holdResult);
      } catch (err) {
        return sendError(res, 409, err.message);
      }
    }

    // Release held seats
    if (pathname.match(/^\/api\/events\/[a-zA-Z0-9_-]+\/release-hold$/) && method === 'POST') {
      const eventId = pathname.split('/')[3];
      const body = await parseJsonBody(req);
      const result = db.releaseHold(eventId, body.seatIds, body.holdToken);
      notifySeatSubscribers(eventId, { type: 'SEATS_RELEASED', seatIds: body.seatIds });
      return sendJson(res, 200, result);
    }

    // Promo code validation
    if (pathname === '/api/promos/validate' && method === 'POST') {
      const body = await parseJsonBody(req);
      const result = db.validatePromo(body.code, Number(body.subtotal) || 0);
      return sendJson(res, 200, result);
    }

    // Checkout & Order creation
    if (pathname.match(/^\/api\/events\/[a-zA-Z0-9_-]+\/checkout$/) && method === 'POST') {
      const eventId = pathname.split('/')[3];
      const body = await parseJsonBody(req);
      try {
        const orderResult = db.processCheckout({
          eventId,
          seatIds: body.seatIds,
          holdToken: body.holdToken,
          buyer: body.buyer,
          promoCode: body.promoCode,
          paymentMethod: body.paymentMethod || 'Credit Card'
        });
        notifySeatSubscribers(eventId, { type: 'SEATS_SOLD', seatIds: body.seatIds });
        return sendJson(res, 200, orderResult);
      } catch (err) {
        return sendError(res, 400, err.message);
      }
    }

    // Order lookup
    if (pathname.startsWith('/api/orders/') && method === 'GET') {
      const orderId = pathname.split('/')[3];
      const order = db.getOrderById(orderId);
      if (!order) return sendError(res, 404, 'Order not found');
      return sendJson(res, 200, { order });
    }

    // Gate Pass Scanner
    if (pathname === '/api/tickets/scan' && method === 'POST') {
      const body = await parseJsonBody(req);
      if (!body.payloadOrId) {
        return sendError(res, 400, 'Ticket ID or QR payload is required');
      }
      const scanResult = db.scanTicket(body.payloadOrId, body.device || 'Mobile Gate Scanner 1');
      return sendJson(res, 200, scanResult);
    }

    // Gate stats
    if (pathname.match(/^\/api\/events\/[a-zA-Z0-9_-]+\/gate-stats$/) && method === 'GET') {
      const eventId = pathname.split('/')[3];
      const stats = db.getGateStats(eventId);
      return sendJson(res, 200, stats);
    }

    // Analytics
    if (pathname === '/api/analytics' && method === 'GET') {
      const analytics = db.getAnalytics(parsedUrl.query.eventId);
      return sendJson(res, 200, analytics);
    }

    // Export CSV / JSON
    if (pathname === '/api/analytics/export' && method === 'GET') {
      const exportType = parsedUrl.query.type || 'orders';
      const eventId = parsedUrl.query.eventId || null;
      const format = parsedUrl.query.format || 'csv';
      const data = db.getExportData(exportType, eventId);

      if (format === 'json') {
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Content-Disposition': `attachment; filename="venue-vista-${exportType}-${Date.now()}.json"`
        });
        return res.end(JSON.stringify(data, null, 2));
      }

      // Format as CSV
      if (data.length === 0) {
        res.writeHead(200, { 'Content-Type': 'text/csv' });
        return res.end('No data found');
      }

      const headers = Object.keys(data[0]);
      const csvRows = [headers.join(',')];
      for (const row of data) {
        const values = headers.map(header => {
          const val = row[header] === null || row[header] === undefined ? '' : String(row[header]);
          const escaped = val.replace(/"/g, '""');
          return `"${escaped}"`;
        });
        csvRows.push(values.join(','));
      }

      res.writeHead(200, {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="venue-vista-${exportType}-${Date.now()}.csv"`
      });
      return res.end(csvRows.join('\n'));
    }

    // Reset Seed Demo Data
    if (pathname === '/api/reset-demo' && method === 'POST') {
      db.seedDatabase(true);
      return sendJson(res, 200, { success: true, message: 'Venue Vista demo data successfully refreshed!' });
    }

    // ----------------------------------------------------
    // STATIC FILE SERVING
    // ----------------------------------------------------
    let filePath = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname);

    // Prevent directory traversal
    if (!filePath.startsWith(PUBLIC_DIR)) {
      return sendError(res, 403, 'Forbidden');
    }

    fs.stat(filePath, (err, stats) => {
      if (err || !stats.isFile()) {
        // Fallback to index.html for Single Page Application navigation
        const fallbackPath = path.join(PUBLIC_DIR, 'index.html');
        fs.readFile(fallbackPath, (readErr, content) => {
          if (readErr) {
            return sendError(res, 404, 'File not found');
          }
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(content);
        });
        return;
      }

      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';

      fs.readFile(filePath, (fileErr, content) => {
        if (fileErr) {
          return sendError(res, 500, 'Error reading file');
        }
        res.writeHead(200, {
          'Content-Type': contentType,
          'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600'
        });
        res.end(content);
      });
    });

  } catch (globalErr) {
    console.error('Server error:', globalErr);
    return sendError(res, 500, 'Internal Server Error: ' + globalErr.message);
  }
});

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`\n======================================================`);
    console.log(` 🎭 VENUE VISTA - Event Pro Ticketing & Venue System`);
    console.log(` Domain: Media & Entertainment`);
    console.log(` Server live on: http://localhost:${PORT}`);
    console.log(` REST API: http://localhost:${PORT}/api/events`);
    console.log(` Analytics: http://localhost:${PORT}/api/analytics`);
    console.log(`======================================================\n`);
  });
}

module.exports = server;
