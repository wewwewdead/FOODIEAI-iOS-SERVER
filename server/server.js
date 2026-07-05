// server/index.js
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import router from './routes/gemini.js';
import accountRouter from './routes/account.js';
import subscriptionRouter from './routes/subscription.js';
import { EXPECTED_BUNDLE_ID, BUNDLE_ID_FROM_ENV } from './lib/storeKitVerify.js';

dotenv.config();

// Startup env audit — booleans only, never values. Lets us tell at a
// glance from the Railway logs whether the deletion-related vars are
// wired up after each deploy.
console.log('[Startup] SUPABASE_URL set:', !!process.env.SUPABASE_URL);
console.log('[Startup] SUPABASE_SERVICE_ROLE_KEY set:', !!process.env.SUPABASE_SERVICE_ROLE_KEY);
// The effective bundle id IS printed (not just a boolean): a wrong value here
// silently rejects every StoreKit purchase/renewal, so it must be verifiable at
// a glance. `code default` means APP_BUNDLE_ID was not set — fine as long as the
// printed id is the real prod app id (com.thefoodieai.app).
console.log(`[Startup] APP_BUNDLE_ID: ${EXPECTED_BUNDLE_ID} (${BUNDLE_ID_FROM_ENV ? 'from env' : 'code default'})`);

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({
    origin:[
      'https://foodieai-1-g7lh.onrender.com',
      'https://www.thefoodieai.com',
      'https://thefoodieai.com',
      'http://localhost:5173'
    ],
    methods: "GET,POST,PUT,DELETE",
    credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({extended: true}))
app.use(router);
app.use(accountRouter);
app.use(subscriptionRouter);

app.get('/', (req, res) => {
  res.send('server is working')
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
