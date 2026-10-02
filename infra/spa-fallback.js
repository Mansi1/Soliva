// CloudFront Function (viewer-request, cloudfront-js-2.0), je Distribution eine eigene Kopie.
// Adressen der Seite ohne Dateiendung (/game/<seed>, /galerie) bekommen die index.html mit 200,
// Ordner (/tools/lsystem/) ihre eigene. Pfade mit Endung bleiben unverändert: Eine fehlende
// Datei gibt ein echtes 404 statt HTML, sonst scheitert ein offener Tab, der nach einem Deploy
// einen alten Chunk per import() nachlädt, an einem MIME-Fehler.
// Previews liegen unter /pr-<n>/ (BASE_PATH) und bekommen ihre eigene index.html.
// eslint-disable-next-line no-unused-vars -- CloudFront ruft handler über den Namen auf.
function handler(event) {
  var request = event.request;
  var uri = request.uri;
  if (uri.endsWith('/')) {
    request.uri = uri + 'index.html';
  } else if (uri.slice(uri.lastIndexOf('/') + 1).indexOf('.') === -1) {
    var preview = uri.match(/^\/pr-(\d+)(\/|$)/);
    request.uri = (preview ? '/pr-' + preview[1] : '') + '/index.html';
  }
  return request;
}
