import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://hpdnfhfpobmrwgxprrhb.supabase.co';
const SUPABASE_KEY = 'sb_publishable_lD6JDJoXUv4SFxI3s1AcPQ_jSZwjkqX';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
