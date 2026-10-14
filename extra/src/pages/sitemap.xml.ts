import comics from '../data/comics.json';
export const prerender = true;
const escapeXML = (s: string) => s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]!));
export function GET({ site }: { site: URL }) {
  const paths = ['/', '/archive/', '/about/', ...comics.map(c => '/strips/' + c.slug + '/')];
  const xml = '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
    paths.map(p => '<url><loc>' + escapeXML(new URL(p, site).href) + '</loc></url>').join('') +
    '</urlset>';
  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
}
