import { describe, it, assertEqual } from './harness.js';
import { parseHash } from '../js/router.js';

describe('parseHash', () => {
  it('empty and / both → home', () => {
    assertEqual(parseHash(''), { name: 'home', params: {} });
    assertEqual(parseHash('#/'), { name: 'home', params: {} });
  });
  it('#/drivers → drivers', () => {
    assertEqual(parseHash('#/drivers'), { name: 'drivers', params: {} });
  });
  it('#/drivers/42 → driverDetail with id 42', () => {
    assertEqual(parseHash('#/drivers/42'), { name: 'driverDetail', params: { id: 42 } });
  });
  it('#/kids → kids', () => {
    assertEqual(parseHash('#/kids'), { name: 'kids', params: {} });
  });
  it('unknown → home', () => {
    assertEqual(parseHash('#/garbage'), { name: 'home', params: {} });
  });
});
