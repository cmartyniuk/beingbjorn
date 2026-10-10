import http from 'node:http';
import fs from 'node:fs/promises';
const html = await fs.readFile(new URL('../tools/panels.html', import.meta.url));
http.createServer((req,res) => {res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html);}).listen(4322,'127.0.0.1',() => console.log('Panel tool: http://localhost:4322'));
