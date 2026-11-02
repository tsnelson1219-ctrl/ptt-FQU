import { createServer } from 'node:http';
import WebSocket, { WebSocketServer } from 'ws';

const PTT_URL = 'wss://ws.ptt.cc/bbs';
const PTT_ORIGIN = 'https://term.ptt.cc';
const MAX_QUEUED_BYTES = 64 * 1024;

const server = createServer((_request, response) => {
  response.writeHead(426, {
    'content-type': 'text/plain; charset=utf-8',
    upgrade: 'websocket',
  });
  response.end('WebSocket upgrade required');
});

const webSocketServer = new WebSocketServer({
  server,
  maxPayload: 1024 * 1024,
  perMessageDeflate: false,
  verifyClient({ req }, done) {
    const host = req.headers.host?.toLowerCase();
    const protocols = (req.headers['sec-websocket-protocol'] || '')
      .split(',')
      .map((protocol) => protocol.trim());
    let sameOrigin = false;

    try {
      const origin = new URL(req.headers.origin);
      sameOrigin =
        (origin.protocol === 'https:' || origin.protocol === 'http:') &&
        origin.host.toLowerCase() === host;
    } catch {
      sameOrigin = false;
    }

    const allowed = sameOrigin && protocols.includes('telnet');
    if (!allowed) {
      console.warn('[ptt-ws-proxy] Rejected WebSocket upgrade', {
        host,
        origin: req.headers.origin,
        protocols,
      });
    }
    done(allowed, allowed ? undefined : 403, allowed ? undefined : 'Forbidden');
  },
  handleProtocols(protocols) {
    return protocols.has('telnet') ? 'telnet' : false;
  },
});

webSocketServer.on('connection', (client, request) => {
  console.info('[ptt-ws-proxy] Browser WebSocket connected', {
    host: request.headers.host,
    origin: request.headers.origin,
  });

  const upstream = new WebSocket(PTT_URL, ['telnet'], {
    origin: PTT_ORIGIN,
    handshakeTimeout: 10000,
    perMessageDeflate: false,
  });

  let queuedBytes = 0;
  const queuedMessages = [];

  client.on('message', (data, isBinary) => {
    if (upstream.readyState === WebSocket.OPEN) {
      upstream.send(data, { binary: isBinary });
      return;
    }

    if (upstream.readyState !== WebSocket.CONNECTING) return;

    queuedBytes += data.length;
    if (queuedBytes > MAX_QUEUED_BYTES) {
      client.close(1013, 'PTT connection is not ready');
      upstream.terminate();
      return;
    }

    queuedMessages.push({ data, isBinary });
  });

  upstream.on('open', () => {
    console.info('[ptt-ws-proxy] Connected to PTT upstream');
    while (queuedMessages.length && client.readyState === WebSocket.OPEN) {
      const { data, isBinary } = queuedMessages.shift();
      upstream.send(data, { binary: isBinary });
    }
    queuedBytes = 0;
  });

  upstream.on('message', (data, isBinary) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data, { binary: isBinary });
    }
  });

  upstream.on('unexpected-response', (_request, response) => {
    console.error('[ptt-ws-proxy] PTT rejected WebSocket handshake', {
      statusCode: response.statusCode,
    });
    response.resume();
  });

  upstream.on('close', (code, reason) => {
    console.info('[ptt-ws-proxy] PTT upstream closed', { code });
    if (client.readyState !== WebSocket.OPEN) return;
    const safeCode = code === 1000 || (code >= 3000 && code <= 4999) ? code : 1011;
    client.close(safeCode, reason.length ? 'PTT disconnected' : '');
  });

  upstream.on('error', (error) => {
    console.error('[ptt-ws-proxy] PTT upstream error', {
      message: error.message,
      code: error.code,
    });
    if (client.readyState === WebSocket.OPEN) {
      client.close(1011, 'PTT connection failed');
    }
    upstream.terminate();
  });

  client.on('close', () => {
    if (upstream.readyState === WebSocket.OPEN) upstream.close();
    else upstream.terminate();
  });

  client.on('error', () => upstream.terminate());
});

export default server;
