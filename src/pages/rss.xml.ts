import comics from '../data/comics.json';
export const prerender = true;
const escapeXML = (s: string) => s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]!));
export function GET({ site }: { site: URL }) {
  const absolute = (p: string) => new URL(p, site).href;
  const items = [...comics].reverse().map(c => {
    const url = absolute('/strips/' + c.slug + '/');
    const text = (c.transcript || c.panels.map(p => p.alt).join('\n\n')) + (c.aphorism ? '\n\n' + c.aphorism : '');
    const html = '<p>' + escapeXML(c.alt) + '</p><p><img src="' + escapeXML(absolute(c.full)) +
      '" alt="' + escapeXML(c.alt) + '" /></p>' +
      text.split(/\n\s*\n/).map(p => '<p>' + escapeXML(p) + '</p>').join('') +
      '<p><a href="' + escapeXML(url) + '">Read on beingbjorn.com</a></p>';
    return '<item><title>' + escapeXML(c.title) + '</title><link>' + escapeXML(url) +
      '</link><guid isPermaLink="true">' + escapeXML(url) + '</guid><description>' +
      escapeXML(html) + '</description></item>';
  }).join('');
  const xml = '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel>' +
    '<title>It’s Not Easy Being Bjorn</title><link>' + escapeXML(site.href) +
    '</link><description>New strips from It’s Not Easy Being Bjorn.</description><language>en</language>' +
    '<atom:link href="' + escapeXML(absolute('/rss.xml')) + '" rel="self" type="application/rss+xml"/>' +
    items + '</channel></rss>';
  return new Response(xml, { headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' } });
}
