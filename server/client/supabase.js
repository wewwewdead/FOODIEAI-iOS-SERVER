import { createClient } from '@supabase/supabase-js'
import dotenv from "dotenv"

dotenv.config();

let client = null;

function getClient() {
    if (client) return client;
    const url = process.env.SUPABASE_URL;
    const key = process.env.SERVICE_KEY;
    if (!url || !key || !url.startsWith('http')) {
        throw new Error('Supabase is not configured: set SUPABASE_URL and SERVICE_KEY env vars.');
    }
    client = createClient(url, key);
    return client;
}

const supabase = new Proxy({}, {
    get(_target, prop) {
        return getClient()[prop];
    }
});

export default supabase
