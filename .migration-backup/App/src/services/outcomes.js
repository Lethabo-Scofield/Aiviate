// Delivery-outcome catalogue and the required-evidence rules for each.
//
// Pure (no RN/Expo imports) so the rules are unit-testable and shared by the
// capture UI (to gate the submit button) and the completion payload.
//
// Two validation layers work together:
//   - validateProof (services/api.js): barcode match (success outcomes only) +
//     geofence proximity — enforced at completion time.
//   - validateOutcome (here): the outcome-specific required fields (recipient,
//     quantities, damage photo, "other" explanation).

export const OUTCOME_KEYS = {
  DELIVERED: 'delivered',
  PARTIALLY_DELIVERED: 'partially_delivered',
  CUSTOMER_UNAVAILABLE: 'customer_unavailable',
  INCORRECT_ADDRESS: 'incorrect_address',
  CUSTOMER_REJECTED: 'customer_rejected',
  DAMAGED_GOODS: 'damaged_goods',
  ACCESS_PROBLEM: 'access_problem',
  OTHER: 'other',
};

// kind: 'success' | 'partial' | 'fail' — drives colour + which fields show.
// requiresBarcode: the client-side barcode gate applies (proof of the package).
export const OUTCOMES = [
  { key: 'delivered', label: 'Delivered', kind: 'success', icon: 'checkmark-circle',
    requiresBarcode: true, requiresRecipient: true },
  { key: 'partially_delivered', label: 'Partially delivered', kind: 'partial', icon: 'remove-circle',
    requiresBarcode: true, requiresRecipient: true, requiresQuantity: true },
  { key: 'customer_unavailable', label: 'Customer unavailable', kind: 'fail', icon: 'person-remove',
    defaultReattempt: true },
  { key: 'incorrect_address', label: 'Incorrect address', kind: 'fail', icon: 'location',
    defaultReattempt: true },
  { key: 'customer_rejected', label: 'Customer rejected', kind: 'fail', icon: 'hand-left' },
  { key: 'damaged_goods', label: 'Damaged goods', kind: 'fail', icon: 'alert-circle',
    requiresPhoto: true },
  { key: 'access_problem', label: 'Access problem', kind: 'fail', icon: 'lock-closed',
    defaultReattempt: true },
  { key: 'other', label: 'Other', kind: 'fail', icon: 'ellipsis-horizontal',
    requiresExplanation: true },
];

export const getOutcome = (key) => OUTCOMES.find((o) => o.key === key) || null;

export const isSuccessOutcome = (key) => {
  const o = getOutcome(key);
  return !!o && (o.kind === 'success' || o.kind === 'partial');
};

export const outcomeRequiresBarcode = (key) => !!getOutcome(key)?.requiresBarcode;

// Validate the outcome-specific fields. Returns { ok, error }.
// payload: { recipientName, notes, deliveredQty, totalQty, evidence, ... }
export function validateOutcome(key, payload = {}) {
  const o = getOutcome(key);
  if (!o) return { ok: false, error: 'Select a delivery outcome.' };

  if (o.requiresRecipient && !String(payload.recipientName || '').trim()) {
    return { ok: false, error: "Enter the recipient's name." };
  }
  if (o.requiresQuantity) {
    const delivered = Number(payload.deliveredQty);
    const total = Number(payload.totalQty);
    if (!Number.isFinite(delivered) || delivered < 1) {
      return { ok: false, error: 'Enter how many items were delivered.' };
    }
    if (Number.isFinite(total) && delivered >= total) {
      return { ok: false, error: 'Delivered quantity must be less than the total for a partial delivery.' };
    }
  }
  if (o.requiresPhoto && !payload.evidence) {
    return { ok: false, error: 'A photo is required for this outcome.' };
  }
  if (o.requiresExplanation && !String(payload.notes || '').trim()) {
    return { ok: false, error: 'Add a short explanation.' };
  }
  return { ok: true };
}

export default { OUTCOMES, OUTCOME_KEYS, getOutcome, isSuccessOutcome, outcomeRequiresBarcode, validateOutcome };
