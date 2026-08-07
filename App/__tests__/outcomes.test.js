const {
  validateOutcome, outcomeRequiresBarcode, isSuccessOutcome, getOutcome,
} = require('../src/services/outcomes');
const { validateProof, ProofError } = require('../src/services/api');

describe('services/outcomes - required evidence rules', () => {
  test('delivered requires a recipient name', () => {
    expect(validateOutcome('delivered', {}).ok).toBe(false);
    expect(validateOutcome('delivered', { recipientName: 'Lerato' }).ok).toBe(true);
  });

  test('partial requires a delivered quantity below the total', () => {
    expect(validateOutcome('partially_delivered', { recipientName: 'A', deliveredQty: 0, totalQty: 3 }).ok).toBe(false);
    expect(validateOutcome('partially_delivered', { recipientName: 'A', deliveredQty: 3, totalQty: 3 }).ok).toBe(false);
    expect(validateOutcome('partially_delivered', { recipientName: 'A', deliveredQty: 2, totalQty: 3 }).ok).toBe(true);
  });

  test('damaged goods requires a photo', () => {
    expect(validateOutcome('damaged_goods', {}).ok).toBe(false);
    expect(validateOutcome('damaged_goods', { evidence: { uri: 'x' } }).ok).toBe(true);
  });

  test('other requires an explanation', () => {
    expect(validateOutcome('other', {}).ok).toBe(false);
    expect(validateOutcome('other', { notes: 'gate locked, no answer' }).ok).toBe(true);
  });

  test('simple failures need no extra evidence', () => {
    expect(validateOutcome('customer_unavailable', {}).ok).toBe(true);
    expect(validateOutcome('access_problem', {}).ok).toBe(true);
  });

  test('barcode requirement + success classification', () => {
    expect(outcomeRequiresBarcode('delivered')).toBe(true);
    expect(outcomeRequiresBarcode('partially_delivered')).toBe(true);
    expect(outcomeRequiresBarcode('customer_unavailable')).toBe(false);
    expect(isSuccessOutcome('delivered')).toBe(true);
    expect(isSuccessOutcome('partially_delivered')).toBe(true);
    expect(isSuccessOutcome('customer_unavailable')).toBe(false);
    expect(getOutcome('customer_unavailable').defaultReattempt).toBe(true);
  });
});

describe('services/api - proof gate respects the outcome', () => {
  const route = {
    current_stop_index: 0,
    stops: [{ id: 'S1', barcode: 'ORD-1', lat: -26.1, lng: 28.0 }],
  };
  const atStop = { lat: -26.1, lng: 28.0 };

  test('a failure outcome skips the barcode gate but still needs proximity', () => {
    // No scanned barcode, but a failure outcome — should pass with location.
    expect(() => validateProof(route, { outcome: 'customer_unavailable', driverLocation: atStop })).not.toThrow();
  });

  test('a failure outcome still enforces the geofence', () => {
    expect(() => validateProof(route, { outcome: 'customer_unavailable', driverLocation: { lat: -26.2, lng: 28.1 } }))
      .toThrow(ProofError);
  });

  test('a delivered outcome still requires the matching barcode', () => {
    expect(() => validateProof(route, { outcome: 'delivered', driverLocation: atStop }))
      .toThrow(/scanned package barcode/i);
    expect(() => validateProof(route, { outcome: 'delivered', scannedBarcode: 'ORD-1', driverLocation: atStop }))
      .not.toThrow();
  });
});
