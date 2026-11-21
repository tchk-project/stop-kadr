'use strict';

for (const fragment of document.querySelectorAll('.review-fragment')) {
  const button = fragment.querySelector('button');
  const quote = fragment.querySelector('mark');
  let pinned = false;
  function show(open) {
    quote.hidden = !open;
    button.setAttribute('aria-expanded',String(open));
  }
  button.hidden = false;
  show(false);
  fragment.addEventListener('pointerenter',event => { if (event.pointerType === 'mouse') show(true); });
  fragment.addEventListener('pointerleave',() => { if (!pinned) show(false); });
  button.addEventListener('focus',() => show(true));
  button.addEventListener('blur',() => { if (!pinned) show(false); });
  button.addEventListener('click',() => { pinned = !pinned; show(pinned); });
  document.addEventListener('keydown',event => { if (event.key === 'Escape') { pinned = false; show(false); } });
}
