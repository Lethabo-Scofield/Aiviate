jest.mock('expo-image-picker', () => ({
  requestCameraPermissionsAsync: jest.fn(async () => ({ granted: true })),
  launchCameraAsync: jest.fn(async () => ({ canceled: true })),
  launchImageLibraryAsync: jest.fn(async () => ({ canceled: true })),
  MediaTypeOptions: { Images: 'Images' },
}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }), { virtual: true });
jest.mock('../src/utils/haptics', () => ({ haptic: new Proxy({}, { get: () => () => {} }) }));

import React from 'react';
import renderer, { act } from 'react-test-renderer';
import DeliveryOutcomeModal from '../src/components/DeliveryOutcomeModal';

function collectText(node, out = []) {
  if (node == null) return out;
  if (typeof node === 'string') { out.push(node); return out; }
  if (Array.isArray(node)) { node.forEach((n) => collectText(n, out)); return out; }
  if (node.children) collectText(node.children, out);
  return out;
}

describe('DeliveryOutcomeModal', () => {
  const render = () => {
    let tree;
    act(() => {
      tree = renderer.create(
        <DeliveryOutcomeModal
          visible
          stop={{ address: '12 Test Ave', demand: 2, barcode: 'ORD-1' }}
          injectedBarcode={null}
          onRequestScan={() => {}}
          onClose={() => {}}
          onSubmit={() => {}}
        />
      );
    });
    return collectText(tree.toJSON()).join(' | ');
  };

  test('renders the sheet header and the stop address', () => {
    const blob = render();
    expect(blob).toContain('Delivery outcome');
    expect(blob).toContain('12 Test Ave');
  });

  test('renders the full outcome catalogue', () => {
    const blob = render();
    ['Delivered', 'Partially delivered', 'Customer unavailable', 'Incorrect address',
     'Customer rejected', 'Damaged goods', 'Access problem', 'Other']
      .forEach((label) => expect(blob).toContain(label));
  });

  test('default (delivered) shows the recipient field and the barcode-scan prompt', () => {
    const blob = render();
    expect(blob).toContain('Recipient name');
    expect(blob).toContain('Scan package barcode to confirm');
    expect(blob).toContain('Confirm delivery'); // submit label for a success outcome
  });
});
