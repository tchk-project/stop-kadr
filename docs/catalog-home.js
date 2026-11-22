'use strict';

const panel = document.querySelector('.panel');
if (episode || originalSelected) {
  location.replace(focusLink(episode?.id || 'dubl', role) + location.hash);
} else {
  showCatalogue(panel);
}
document.querySelector('.catalog-error').remove();
