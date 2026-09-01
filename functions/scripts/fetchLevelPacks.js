'use strict';
const http = require('http');
const fs = require('fs');

function get(u, n = 0) {
  return new Promise((res, rej) => {
    http.get(u, (r) => {
      if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location && n < 5) {
        const loc = r.headers.location.startsWith('http')
          ? r.headers.location
          : new URL(r.headers.location, u).href;
        r.resume();
        return get(loc, n + 1).then(res, rej);
      }
      let d = '';
      r.on('data', (c) => { d += c; });
      r.on('end', () => res({ url: u, final: u, code: r.statusCode, len: d.length, body: d }));
    }).on('error', rej);
  });
}

(async () => {
  const idx = await get('http://www.sneezingtiger.com/sokoban/levels.html');
  const links = [...idx.body.matchAll(/href="([^"]*Text\.html)"/gi)].map((m) => m[1]);
  const wanted = links.filter((x) => /sasquatch|microban|mas/i.test(x));
  console.log('wanted', wanted);
  for (const rel of wanted) {
    const u = rel.startsWith('http') ? rel : new URL(rel, 'http://www.sneezingtiger.com/sokoban/').href;
    const r = await get(u);
    const levels = (r.body.match(/Level\s+\d+/gi) || []).length;
    console.log(rel, r.code, r.len, 'levels', levels);
    if (levels > 10) {
      const name = rel.split('/').pop().replace(/Text\.html$/i, '');
      fs.writeFileSync(`${name}_raw.html`, r.body);
      console.log('saved', name);
    }
  }
})();
