const tests = [];
let currentSuite = null;

export function describe(name, fn) {
  currentSuite = name;
  fn();
  currentSuite = null;
}

export function it(name, fn) {
  tests.push({ suite: currentSuite, name, fn });
}

export function assertEqual(actual, expected, msg = '') {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${msg} expected ${e}, got ${a}`);
}

export function assertThrows(fn, matcher) {
  try { fn(); } catch (err) {
    if (matcher && !String(err.message).includes(matcher)) {
      throw new Error(`expected error containing "${matcher}", got "${err.message}"`);
    }
    return;
  }
  throw new Error('expected function to throw');
}

export async function assertRejects(promise, matcher) {
  try { await promise; } catch (err) {
    if (matcher && !String(err.message).includes(matcher)) {
      throw new Error(`expected rejection containing "${matcher}", got "${err.message}"`);
    }
    return;
  }
  throw new Error('expected promise to reject');
}

export async function runAll(root) {
  let pass = 0, fail = 0;
  for (const t of tests) {
    const row = document.createElement('div');
    row.className = 'test-row';
    row.textContent = `${t.suite ? t.suite + ' › ' : ''}${t.name}`;
    root.appendChild(row);
    try {
      await t.fn();
      row.classList.add('pass');
      row.textContent = '✓ ' + row.textContent;
      pass++;
    } catch (err) {
      row.classList.add('fail');
      row.textContent = '✗ ' + row.textContent + ' — ' + err.message;
      console.error(err);
      fail++;
    }
  }
  const summary = document.createElement('div');
  summary.className = 'summary';
  summary.textContent = `${pass} passed, ${fail} failed`;
  root.appendChild(summary);
}
