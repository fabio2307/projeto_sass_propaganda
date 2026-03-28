import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
    import.meta.env.URL,
    import.meta.env.KEY
);