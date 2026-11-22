'use strict';
// This entry is loaded only by editor-preview.html. The public player always loads published data.
const previewInput = window.parent !== window && window.parent.editorPreviewSnapshot;
if (!previewInput) location.replace('./editor.html');
const allStories = previewInput ? [previewInput.meta] : [];
const storyData = previewInput?.data;
