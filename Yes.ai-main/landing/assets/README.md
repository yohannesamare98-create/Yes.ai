This folder is reserved for static assets referenced by the landing page —
images, favicons, downloadable files, etc.

Nothing currently lives here: the landing page's only graphic (the YES.AI
logo mark) is inline SVG directly in index.html, and fonts load from Google
Fonts via <link> tags, so there was nothing to move here during the
reorganization into landing/{index.html, css/, js/, assets/}.

Drop files here and reference them from index.html as `assets/filename.ext`
(relative path, same pattern as css/style.css and js/main.js).
