// Settings read from environment variables.

const RPC = process.env.X1_RPC || 'https://rpc.mainnet.x1.xyz';
const PUBLIC_URL = (process.env.PUBLIC_URL || 'http://localhost:8787').replace(/\/$/, '');
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';
const DATA_DIR = process.env.DATA_DIR || './data';
const STORE_FILE = process.env.STORE_FILE || require('path').join(DATA_DIR, 'profiles.json');
const MAX_TX = 1232;
const FIELD_ORDER = ['level', 'rank', 'kills', 'headshots', 'best_wave', 'perks', 'fingerprint', 'updated'];

module.exports = { ALLOWED_ORIGIN, DATA_DIR, FIELD_ORDER, MAX_TX, PUBLIC_URL, RPC, STORE_FILE };
