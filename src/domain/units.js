// 대형 수치 단위 포맷터(a~zz, 702단위). 게임 상태와 무관한 순수 함수만 둔다.
// plan/index.html의 unitSuffix/formatUnit(1041~1077행)을 그대로 이식했다.

function unitSuffix(group) {
  if (group <= 0) return '';
  if (group <= 26) return String.fromCharCode(96 + group);
  const offset = Math.min(group, 52) - 27;
  return String.fromCharCode(97 + Math.floor(offset / 26)) + String.fromCharCode(97 + (offset % 26));
}

export function formatUnit(input) {
  let value = typeof input === 'bigint' ? input : BigInt(Math.floor(Number(input) || 0));
  const negative = value < 0n;
  if (negative) value = -value;
  if (value < 1000n) return `${negative ? '-' : ''}${value}`;
  let divisor = 1n;
  let scaled = value;
  let group = 0;
  while (scaled >= 1000n && group < 52) {
    scaled /= 1000n;
    divisor *= 1000n;
    group += 1;
  }
  if (group === 52 && scaled >= 1000n) return `${negative ? '-' : ''}999az+`;
  let whole = value / divisor;
  let precision = whole >= 100n ? 0 : whole >= 10n ? 1 : 2;
  let factor = precision === 0 ? 1n : precision === 1 ? 10n : 100n;
  let rounded = (value * factor + divisor / 2n) / divisor;
  if (rounded >= 1000n * factor && group < 52) {
    group += 1;
    divisor *= 1000n;
    whole = value / divisor;
    precision = whole >= 100n ? 0 : whole >= 10n ? 1 : 2;
    factor = precision === 0 ? 1n : precision === 1 ? 10n : 100n;
    rounded = (value * factor + divisor / 2n) / divisor;
  }
  const integerPart = rounded / factor;
  const decimalPart = precision ? (rounded % factor).toString().padStart(precision, '0').replace(/0+$/, '') : '';
  return `${negative ? '-' : ''}${integerPart}${decimalPart ? `.${decimalPart}` : ''}${unitSuffix(group)}`;
}
