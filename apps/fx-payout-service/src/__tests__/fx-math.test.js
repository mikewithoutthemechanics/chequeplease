import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { convertMinor, grossForDays, daysToTenths } from '../fx-math.js';
import { MockQuoteProvider } from '../mock-quotes.js';

describe('fx-math (integer minor units, no floats)', () => {
  test('EUR->PHP conversion is exact half-up', () => {
    // EUR 100.00 = 10000 cents * 58.42 = 584200 dest minor
    assert.equal(convertMinor(10000n, '58.42').toString(), '584200');
  });
  test('1:1 currency returns same amount', () => {
    assert.equal(convertMinor(5000n, '1').toString(), '5000');
  });
  test('rejects float-style invalid rates', () => {
    assert.throws(() => convertMinor(100n, 'abc'), /Invalid FX rate/);
    assert.throws(() => convertMinor(0n, '58.42'), /> 0/);
  });
  test('grossForDays keeps integer math (15.5 days x EUR 120/day)', () => {
    // 12000 cents * 15.5 = 186000
    assert.equal(grossForDays(12000, '15.5').toString(), '186000');
    assert.equal(daysToTenths('30').toString(), '300');
  });
});

describe('mock quotes', () => {
  test('locks a 30-min quote for supported corridors', () => {
    const q = new MockQuoteProvider();
    const locked = q.lockQuote({ source: 'EUR', dest: 'PHP', sourceAmountMinor: 10000 });
    assert.equal(locked.rate, '58.42');
    assert.ok(locked.quoteId.startsWith('mock_'));
    assert.throws(() => q.lockQuote({ source: 'EUR', dest: 'XXX', sourceAmountMinor: 1 }), /No mock rate/);
  });
});
