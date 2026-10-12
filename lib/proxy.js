// Fetches NFT art from allowlisted hosts so the game can draw it in 3D.

/* ---------- NFT art proxy ---------- */
// NFT images live on Arweave, IPFS and similar hosts that often don't let games draw them in 3D.
// The server fetches them and passes them on, so companions can wear the real art.
const PROXY_HOSTS = /^([a-z0-9-]+\.)*(arweave\.net|ar-io\.dev|irys\.xyz|ipfs\.io|dweb\.link|nftstorage\.link|mypinata\.cloud|pinata\.cloud|cf-ipfs\.com|cloudflare-ipfs\.com|w3s\.link|shdw-drive\.genesysgo\.net|nft\.storage|githubusercontent\.com|imgur\.com|x1\.ninja)$/i;
const proxyCache = new Map(); let proxyBytes = 0;
async function proxyFetch(u){
  let url; try { url = new URL(u); } catch(e){ return { status:400 }; }
  if (url.protocol !== 'https:' || !PROXY_HOSTS.test(url.hostname)) return { status:403 };
  const hit = proxyCache.get(url.href); if (hit) return hit;
  const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), 10000);
  try {
    const r = await fetch(url.href, { signal:ctl.signal, redirect:'follow' });
    const type = (r.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (!r.ok || !/^(image\/(png|jpeg|gif|webp|svg\+xml)|application\/json|text\/plain)$/.test(type)) return { status:415 };
    const buf = Buffer.from(await r.arrayBuffer()); if (buf.length > 4*1048576) return { status:413 };
    const out = { status:200, type, buf };
    proxyCache.set(url.href, out); proxyBytes += buf.length;
    while (proxyBytes > 64*1048576){ const [k, v] = proxyCache.entries().next().value; proxyCache.delete(k); proxyBytes -= v.buf.length; }
    return out;
  } catch(e){ return { status:502 }; } finally { clearTimeout(tm); }
}

module.exports = { proxyFetch };
