import { createServer } from 'node:http';
import { PACKAGE_NAME as ENGINE } from '@mam/engine';

export const PACKAGE_NAME = '@mam/server';

const port = Number(process.env.PORT ?? 3000);

if (process.env.NODE_ENV !== 'test' && import.meta.url === `file://${process.argv[1]}`) {
  createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end(`${PACKAGE_NAME} (using ${ENGINE})\n`);
  }).listen(port, () => {
    console.log(`listening on http://localhost:${port}`);
  });
}
