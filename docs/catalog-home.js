'use strict';

const panel = document.querySelector('.panel');
if (episode || originalSelected) {
  const requestedRole = params.get('role');
  const storyRole = ['self','witness'].includes(requestedRole) ? requestedRole : role;
  location.replace(focusLink(episode?.id || 'dubl', storyRole) + location.hash);
} else {
  showCatalogue(panel);
}
document.querySelector('.catalog-error').remove();
