import './host.css';
import { startHost } from './host';

const { hostname, port, origin } = window.location;
const local = hostname === 'localhost' || hostname === '127.0.0.1';

startHost(local ? `http://localhost:${port}` : origin);
