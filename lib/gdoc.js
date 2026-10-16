// Google ドキュメント URL からテキストを取得する
// ドキュメントは「リンクを知っている全員が閲覧可」に設定されている必要がある

export function extractDocId(url) {
  const m = String(url).match(/docs\.google\.com\/document\/(?:u\/\d+\/)?d\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : null;
}

export async function fetchGoogleDocText(url) {
  const id = extractDocId(url);
  if (!id) throw new Error('GoogleドキュメントのURL形式が正しくありません');

  let res;
  try {
    res = await fetch(`https://docs.google.com/document/d/${id}/export?format=txt`, { redirect: 'follow' });
  } catch {
    throw new Error('Googleドキュメントに接続できませんでした。ネットワークを確認するか、テキストを貼り付けてください');
  }
  const type = res.headers.get('content-type') || '';
  if (!res.ok || type.includes('text/html')) {
    throw new Error('Googleドキュメントを取得できませんでした。共有設定を「リンクを知っている全員（閲覧者）」にしてください');
  }
  const text = (await res.text()).replace(/^﻿/, '').trim();
  if (!text) throw new Error('Googleドキュメントが空です');
  return text;
}
