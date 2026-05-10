import { createClient } from '@supabase/supabase-js'
import dotenv from "dotenv"

dotenv.config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SERVICE_KEY
)
 export default supabase
