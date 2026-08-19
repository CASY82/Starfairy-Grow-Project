import { $ } from './dom.js';

let pendingResolve = null;

export function confirmAction({ title = '일괄 강화 확인', message, confirmLabel = '강화하기' }) {
  if (pendingResolve) pendingResolve(false);
  $('#confirmActionTitle').textContent = title;
  $('#confirmActionMessage').textContent = message;
  $('#confirmActionAccept').textContent = confirmLabel;
  $('#confirmActionSheet').classList.add('open');
  return new Promise(resolve => { pendingResolve = resolve; });
}

export function initConfirmAction() {
  const sheet = $('#confirmActionSheet');
  const finish = accepted => {
    sheet.classList.remove('open');
    const resolve = pendingResolve;
    pendingResolve = null;
    if (resolve) resolve(accepted);
  };
  $('#confirmActionAccept').addEventListener('click', () => finish(true));
  $('#confirmActionCancel').addEventListener('click', () => finish(false));
  sheet.addEventListener('click', event => { if (event.target === sheet) finish(false); });
}
