// 아주 얇은 DOM 헬퍼. 프레임워크 없이 querySelector 축약형과 토스트만 제공한다.
export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

export function createToast() {
  const el = $('#toast');
  let timer = null;
  return {
    show(message) {
      el.textContent = message;
      el.classList.add('show');
      clearTimeout(timer);
      timer = setTimeout(() => el.classList.remove('show'), 2200);
    }
  };
}
