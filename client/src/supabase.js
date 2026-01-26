import { createClient } from '@supabase/supabase-js';

// Substitua pelos dados do seu projeto Supabase
const supabaseUrl = 'https://svpochglfmkzdjlrrwkf.supabase.co'; 
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN2cG9jaGdsZm1remRqbHJyd2tmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk0NDgyNzcsImV4cCI6MjA4NTAyNDI3N30.XD-sdfeMtkjLA2z3S1aPbv6shbOZVI_av0WUsrT5uzM';

export const supabase = createClient(supabaseUrl, supabaseKey);