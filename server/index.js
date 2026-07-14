import express from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';

const app = express();

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://hpdnfhfpobmrwgxprrhb.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'sb_publishable_lD6JDJoXUv4SFxI3s1AcPQ_jSZwjkqX';
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';
const PORT = process.env.PORT || 3001;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json());

const rateMap = new Map();
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 10;

function rateLimit(key) {
  const now = Date.now();
  const arr = (rateMap.get(key) || []).filter((t) => now - t < RATE_WINDOW_MS);
  if (arr.length >= RATE_MAX) return false;
  arr.push(now);
  rateMap.set(key, arr);
  return true;
}

function cleanRateMap() {
  const now = Date.now();
  for (const [key, arr] of rateMap) {
    const filtered = arr.filter((t) => now - t < RATE_WINDOW_MS);
    if (filtered.length === 0) rateMap.delete(key);
    else rateMap.set(key, filtered);
  }
}
setInterval(cleanRateMap, 5 * 60_000);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/api/settings', async (req, res) => {
  const { data, error } = await supabase
    .from('festival_settings')
    .select('title,subtitle,organizer,contact_phone,contact_email,copyright')
    .limit(1)
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.get('/api/programs', async (req, res) => {
  const { data, error } = await supabase
    .from('festival_programs')
    .select('slug,icon,title,description,tag,click_count')
    .eq('active', true)
    .order('sort_order', { ascending: true });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

app.post('/api/programs/:slug/click', async (req, res) => {
  const { slug } = req.params;
  if (!slug || slug.length > 100) return res.status(400).json({ error: 'invalid slug' });

  const { data, error } = await supabase.rpc('festival_record_click', { p_slug: slug });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ slug, click_count: data });
});

app.get('/api/stats', async (req, res) => {
  const { data, error } = await supabase.rpc('festival_click_stats');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

app.get('/api/programs/:slug/comments', async (req, res) => {
  const { slug } = req.params;
  if (!slug || slug.length > 100) return res.status(400).json({ error: 'invalid slug' });

  const { data, error } = await supabase
    .from('program_comments')
    .select('id,nickname,content,created_at')
    .eq('program_slug', slug)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

app.post('/api/programs/:slug/comments', async (req, res) => {
  const { slug } = req.params;
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';

  if (!rateLimit(`comment:${ip}`)) {
    return res.status(429).json({ error: '너무 많은 요청입니다. 잠시 후 다시 시도해주세요.' });
  }

  if (!slug || slug.length > 100) return res.status(400).json({ error: 'invalid slug' });

  const nickname = (req.body?.nickname || '익명').trim();
  const content = (req.body?.content || '').trim();

  if (nickname.length < 1 || nickname.length > 30) {
    return res.status(400).json({ error: '닉네임은 1~30자여야 합니다.' });
  }
  if (content.length < 1 || content.length > 500) {
    return res.status(400).json({ error: '댓글은 1~500자여야 합니다.' });
  }

  const { data, error } = await supabase
    .from('program_comments')
    .insert({ program_slug: slug, nickname, content })
    .select('id,nickname,content,created_at')
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

app.post('/api/inquiries', async (req, res) => {
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';

  if (!rateLimit(`inquiry:${ip}`)) {
    return res.status(429).json({ error: '너무 많은 요청입니다. 잠시 후 다시 시도해주세요.' });
  }

  const name = (req.body?.name || '').trim();
  const email = (req.body?.email || '').trim();
  const message = (req.body?.message || '').trim();

  if (name.length < 1 || name.length > 60) {
    return res.status(400).json({ error: '이름은 1~60자여야 합니다.' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: '올바른 이메일 주소를 입력해주세요.' });
  }
  if (message.length < 1 || message.length > 2000) {
    return res.status(400).json({ error: '문의 내용은 1~2000자여야 합니다.' });
  }

  const { error } = await supabase
    .from('festival_inquiries')
    .insert({ name, email, message });

  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json({ success: true });
});

app.listen(PORT, () => {
  console.log(`festival-2026 API running on port ${PORT}`);
});
