const VERSION = 'v1';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-File-Name');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method === 'GET') {
    res.status(200).json({ version: VERSION });
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method not allowed' });
    return;
  }

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const buffer = Buffer.concat(chunks);

  if (buffer.length === 0) {
    res.status(400).json({ error: 'empty file' });
    return;
  }

  const rawName = req.headers['x-file-name'] || 'file';
  let fileName = 'file';
  try {
    fileName = decodeURIComponent(rawName);
  } catch (e) {
    fileName = 'file';
  }

  const blob = new Blob([buffer]);

  const [fileio, tmpfiles, transfersh] = await Promise.all([
    uploadToFileIo(blob, fileName),
    uploadToTmpfiles(blob, fileName),
    uploadToTransferSh(buffer, fileName)
  ]);

  res.status(200).json({ version: VERSION, fileio, tmpfiles, transfersh });
}

function describeError(e) {
  const parts = [String(e.message || e)];
  if (e.cause) parts.push(String(e.cause.message || e.cause));
  return parts.join(' - ');
}

async function uploadToFileIo(blob, fileName, attempt = 1) {
  try {
    const fd = new FormData();
    fd.append('file', blob, fileName);
    const r = await fetch('https://file.io/', {
      method: 'POST',
      body: fd,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; oo-uploader/1.0)',
        'Accept': 'application/json'
      },
      signal: AbortSignal.timeout(12000)
    });
    const text = await r.text();
    let data;
    try { data = JSON.parse(text); } catch { data = null; }

    if (!data || !data.success || !data.link) {
      if (attempt < 2) return uploadToFileIo(blob, fileName, attempt + 1);
      throw new Error(`rejected (${r.status}): ${text.slice(0, 150) || 'empty response'}`);
    }
    return { ok: true, link: data.link };
  } catch (e) {
    if (attempt < 2) return uploadToFileIo(blob, fileName, attempt + 1);
    console.error('fileio failed:', describeError(e));
    return { ok: false, error: describeError(e) };
  }
}

async function uploadToTmpfiles(blob, fileName) {
  try {
    const fd = new FormData();
    fd.append('file', blob, fileName);
    const r = await fetch('https://tmpfiles.org/api/v1/upload', {
      method: 'POST',
      body: fd,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; oo-uploader/1.0)' },
      signal: AbortSignal.timeout(12000)
    });
    const text = await r.text();
    let data;
    try { data = JSON.parse(text); } catch { throw new Error(`bad response (${r.status}): ${text.slice(0, 150)}`); }
    if (data.status !== 'success' || !data.data || !data.data.url) {
      throw new Error(`rejected (${r.status}): ${text.slice(0, 150)}`);
    }
    const directLink = data.data.url.replace('tmpfiles.org/', 'tmpfiles.org/dl/');
    return { ok: true, link: directLink };
  } catch (e) {
    console.error('tmpfiles failed:', describeError(e));
    return { ok: false, error: describeError(e) };
  }
}

async function uploadToTransferSh(buffer, fileName) {
  try {
    const safeName = encodeURIComponent(fileName || 'file');
    const r = await fetch(`https://transfer.sh/${safeName}`, {
      method: 'PUT',
      body: buffer,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; oo-uploader/1.0)' },
      signal: AbortSignal.timeout(12000)
    });
    const text = (await r.text()).trim();
    if (!text.startsWith('http')) throw new Error(`rejected (${r.status}): ${text.slice(0, 150)}`);
    return { ok: true, link: text };
  } catch (e) {
    console.error('transfersh failed:', describeError(e));
    return { ok: false, error: describeError(e) };
  }
}
