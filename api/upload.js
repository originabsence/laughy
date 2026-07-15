export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-File-Name');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
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

  const [fileio, catbox, zero] = await Promise.all([
    uploadToFileIo(blob, fileName),
    uploadToCatbox(blob, fileName),
    uploadToZero(blob, fileName)
  ]);

  res.status(200).json({ fileio, catbox, zero });
}

async function uploadToFileIo(blob, fileName) {
  try {
    const fd = new FormData();
    fd.append('file', blob, fileName);
    const r = await fetch('https://file.io', {
      method: 'POST',
      body: fd,
      headers: { 'User-Agent': 'oo-uploader/1.0' }
    });
    const text = await r.text();
    let data;
    try { data = JSON.parse(text); } catch { throw new Error(`bad response (${r.status}): ${text.slice(0, 150)}`); }
    if (!data.success || !data.link) throw new Error(`rejected (${r.status}): ${text.slice(0, 150)}`);
    console.error('fileio ok');
    return { ok: true, link: data.link };
  } catch (e) {
    console.error('fileio failed:', e.message || e);
    return { ok: false, error: String(e.message || e) };
  }
}

async function uploadToCatbox(blob, fileName) {
  try {
    const fd = new FormData();
    fd.append('reqtype', 'fileupload');
    fd.append('fileToUpload', blob, fileName);
    const r = await fetch('https://catbox.moe/user/api.php', {
      method: 'POST',
      body: fd,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; oo-uploader/1.0)' }
    });
    const text = (await r.text()).trim();
    if (!text.startsWith('http')) throw new Error(`rejected (${r.status}): ${text.slice(0, 150)}`);
    console.error('catbox ok');
    return { ok: true, link: text };
  } catch (e) {
    console.error('catbox failed:', e.message || e);
    return { ok: false, error: String(e.message || e) };
  }
}

async function uploadToZero(blob, fileName) {
  try {
    const fd = new FormData();
    fd.append('file', blob, fileName);
    const r = await fetch('https://0x0.st', {
      method: 'POST',
      body: fd,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; oo-uploader/1.0)'
      }
    });
    const text = (await r.text()).trim();
    if (!text.startsWith('http')) throw new Error(`rejected (${r.status}): ${text.slice(0, 150)}`);
    console.error('0x0 ok');
    return { ok: true, link: text };
  } catch (e) {
    console.error('0x0 failed:', e.message || e);
    return { ok: false, error: String(e.message || e) };
  }
}
