// Lokaler PeerJS-Vermittlungsserver für die Ende-zu-Ende-Tests (statt des öffentlichen Servers).
import { PeerServer } from 'peer';

const port = Number(process.env.PEER_PORT ?? 9000);
PeerServer({ port, host: '127.0.0.1', path: '/' }, () => console.log(`PeerServer läuft auf Port ${port}`));
