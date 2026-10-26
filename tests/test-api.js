/**
 * Venue Vista - Automated Test Suite
 * Tests all core subsystems:
 * 1. Database schema & Relational integrity
 * 2. Venue management & Layout engine
 * 3. Events catalog & multi-tier pricing
 * 4. Interactive seating generation & status mapping
 * 5. Atomic seat hold & TTL reservation engine
 * 6. Concurrency lock & anti-double booking protection
 * 7. Promo code engine (percentage, fixed discount, thresholds)
 * 8. End-to-end checkout & verifiable digital pass issuance
 * 9. Gate QR Scanner access control & duplicate pass detection
 * 10. Box office analytics & CSV/JSON audit export
 */

const assert = require('node:assert');
const db = require('../db');

async function runTests() {
  console.log('========================================================');
  console.log(' 🎭 STARTING VENUE VISTA CORE TEST SUITE');
  console.log('========================================================');

  try {
    // 1. Venues
    console.log('[1/10] Testing Venue Management Layer...');
    const venues = db.getVenues();
    assert.ok(Array.isArray(venues), 'Venues must be an array');
    assert.ok(venues.length >= 3, 'Must have at least 3 seeded entertainment venues');
    const royalTheatre = venues.find(v => v.id === 'ven_proscenium');
    assert.ok(royalTheatre, 'Royal Proscenium Theatre must exist');
    assert.strictEqual(royalTheatre.type, 'theatre');
    console.log(`  ✓ Found ${venues.length} venues. Verified: "${royalTheatre.name}" (${royalTheatre.city})`);

    // 2. Events & Multi-Tier Pricing
    console.log('[2/10] Testing Events Catalog & Multi-Tier Pricing...');
    const events = db.getEvents();
    assert.ok(events.length >= 3, 'Must have at least 3 seeded events');
    const hamilton = db.getEventById('evt_hamilton');
    assert.ok(hamilton, 'Hamilton event must exist');
    assert.strictEqual(hamilton.title, 'Hamilton: An American Musical');
    assert.ok(Array.isArray(hamilton.tiers), 'Event must have tiers');
    assert.ok(hamilton.tiers.length >= 4, 'Hamilton must have at least 4 seating tiers');
    console.log(`  ✓ Event "${hamilton.title}" verified with ${hamilton.tiers.length} pricing tiers`);

    // 3. Seating Engine
    console.log('[3/10] Testing Seating Layout & Status Matrix...');
    const seats = db.getEventSeats('evt_hamilton');
    assert.ok(Array.isArray(seats));
    assert.ok(seats.length > 50, 'Seating chart must generate complete seat inventory');
    const availableSeats = seats.filter(s => s.status === 'available');
    assert.ok(availableSeats.length > 0, 'Must have available seats for booking');
    console.log(`  ✓ Generated ${seats.length} total seats across sections. Available: ${availableSeats.length}`);

    // 4. Atomic Seat Hold (8-minute TTL)
    console.log('[4/10] Testing Atomic Seat Hold Engine...');
    const targetSeat = availableSeats[0];
    const holdToken = 'test_token_' + Date.now();
    const holdResult = db.holdSeats('evt_hamilton', [targetSeat.id], holdToken, 8);
    assert.strictEqual(holdResult.success, true);
    assert.strictEqual(holdResult.holdToken, holdToken);
    assert.ok(holdResult.expiresAt > Date.now());
    console.log(`  ✓ Successfully held seat ${targetSeat.id} with holdToken ${holdToken}`);

    // 5. Anti-Double Booking Concurrency Lock
    console.log('[5/10] Testing Anti-Double-Booking Concurrency Lock...');
    let conflictCaught = false;
    try {
      db.holdSeats('evt_hamilton', [targetSeat.id], 'competing_buyer_token', 8);
    } catch (err) {
      conflictCaught = true;
      assert.ok(err.message.includes('currently held by another buyer'));
    }
    assert.strictEqual(conflictCaught, true, 'Competing hold must be rejected');
    console.log('  ✓ Competing hold blocked: concurrent booking prevented!');

    // 6. Promo Code Engine
    console.log('[6/10] Testing Promo Code Validation Engine...');
    const validPromo = db.validatePromo('VISTAPRO', 100);
    assert.strictEqual(validPromo.valid, true);
    assert.strictEqual(validPromo.discount, 15);

    const invalidPromo = db.validatePromo('NONEXISTENT_CODE', 100);
    assert.strictEqual(invalidPromo.valid, false);

    const minAmountPromo = db.validatePromo('VIPENTERTAINMENT', 50); // min is 100
    assert.strictEqual(minAmountPromo.valid, false);
    console.log('  ✓ Promo code discounts, thresholds, and invalid rejection validated');

    // 7. Checkout & Verifiable Pass Generation
    console.log('[7/10] Testing Checkout & Verifiable Digital Pass Issuance...');
    const checkoutResult = db.processCheckout({
      eventId: 'evt_hamilton',
      seatIds: [targetSeat.id],
      holdToken: holdToken,
      buyer: {
        name: 'Alexander Sterling',
        email: 'a.sterling@theatrelive.com',
        phone: '+1 (555) 019-2834'
      },
      promoCode: 'VISTAPRO',
      paymentMethod: 'Mastercard'
    });
    assert.strictEqual(checkoutResult.success, true);
    assert.ok(checkoutResult.order.id);
    assert.strictEqual(checkoutResult.order.tickets.length, 1);
    const issuedPass = checkoutResult.order.tickets[0];
    assert.ok(issuedPass.id.startsWith('TKT-'));
    assert.ok(issuedPass.qr_code_payload.includes(issuedPass.id));
    console.log(`  ✓ Order created: ${checkoutResult.order.id} | Issued Pass: ${issuedPass.id} (QR Payload embedded)`);

    // 8. Gate Pass Access Control & Anti-Fraud Detection
    console.log('[8/10] Testing Gate Access Scanner & Anti-Fraud Duplicate Detection...');
    // First scan -> Success
    const scan1 = db.scanTicket(issuedPass.id, 'Turnstile Scanner A');
    assert.strictEqual(scan1.status, 'SUCCESS');
    assert.strictEqual(scan1.valid, true);

    // Second scan -> Duplicate alert
    const scan2 = db.scanTicket(issuedPass.id, 'Turnstile Scanner B');
    assert.strictEqual(scan2.status, 'ALREADY_REDEEMED');
    assert.strictEqual(scan2.valid, false);
    assert.ok(scan2.message.includes('Already scanned'));

    // Unknown ticket -> Invalid
    const scan3 = db.scanTicket('TKT-FAKE-CODE-999', 'Turnstile Scanner C');
    assert.strictEqual(scan3.status, 'INVALID_TICKET');
    assert.strictEqual(scan3.valid, false);
    console.log('  ✓ Gate scanner validated: 1st Scan Granted, 2nd Duplicate Flagged, Fake Ticket Rejected');

    // 9. Gate Real-Time Stats
    console.log('[9/10] Testing Gate Attendance & Roster Metrics...');
    const gateStats = db.getGateStats('evt_hamilton');
    assert.ok(gateStats.totalIssued > 0);
    assert.ok(gateStats.checkedInCount > 0);
    assert.ok(Array.isArray(gateStats.bySection));
    assert.ok(Array.isArray(gateStats.recentLogs));
    console.log(`  ✓ Gate stats: ${gateStats.checkedInCount}/${gateStats.totalIssued} checked in (${gateStats.checkInPct}%)`);

    // 10. Sales & Box Office Analytics & Export
    console.log('[10/10] Testing Sales Analytics & CSV Audit Export...');
    const analytics = db.getAnalytics('evt_hamilton');
    assert.ok(analytics.kpis.grossRevenue > 0);
    assert.ok(analytics.kpis.ticketsSold > 0);
    assert.ok(analytics.byTier.length > 0);
    assert.ok(analytics.timeline.length > 0);

    const exportData = db.getExportData('orders', 'evt_hamilton');
    assert.ok(Array.isArray(exportData));
    assert.ok(exportData.length > 0);
    assert.ok(exportData[0].order_id);
    console.log(`  ✓ Executive Analytics verified: Gross Revenue $${analytics.kpis.grossRevenue.toLocaleString()} across ${analytics.kpis.ticketsSold} tickets sold`);

    console.log('\n========================================================');
    console.log(' 🌟 ALL 10 TESTS PASSED WITH 100% SUCCESS!');
    console.log('========================================================\n');
    process.exit(0);
  } catch (err) {
    console.error('\n❌ TEST FAILED:', err);
    process.exit(1);
  }
}

runTests();
