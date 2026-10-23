// Loads the Supabase SDK (ES module) and hands its factory to the classic app scripts.
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/+esm';
window.createSupabaseClient = createClient;
