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
    uploadToFileIo(blob, fileName).catch(() => null),
    uploadToCatbox(blob, fileName).catch(() => null),
    uploadToZero(blob, fileName).catch(() => null)
  ]);

  res.status(200).json({ fileio, catbox, zero });
}

async function uploadToFileIo(blob, fileName) {
  const fd = new FormData();
  fd.append('file', blob, fileName);
  const r = await fetch('https://file.io', { method: 'POST', body: fd });
  const data = await r.json();
  if (!data || !data.success || !data.link) throw new Error('fileio failed');
  return data.link;
}

async function uploadToCatbox(blob, fileName) {
  const fd = new FormData();
  fd.append('reqtype', 'fileupload');
  fd.append('fileToUpload', blob, fileName);
  const r = await fetch('https://catbox.moe/user/api.php', { method: 'POST', body: fd });
  const text = (await r.text()).trim();
  if (!text.startsWith('http')) throw new Error('catbox failed');
  return text;
}

async function uploadToZero(blob, fileName) {
  const fd = new FormData();
  fd.append('file', blob, fileName);
  const r = await fetch('https://0x0.st', {
    method: 'POST',
    body: fd,
    headers: { 'User-Agent': 'oo-uploader/1.0' }
  });
  const text = (await r.text()).trim();
  if (!text.startsWith('http')) throw new Error('0x0 failed');
  return text;
}
