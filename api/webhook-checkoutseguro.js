import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(request) {
  try {
    const body = await request.json();

    console.log('WEBHOOK TICTO RECEBIDO:', JSON.stringify(body, null, 2));

    // 🔥 AJUSTE AQUI DEPOIS COM O JSON REAL
    const email =
      body?.customer?.email ||
      body?.buyer?.email ||
      body?.email;

    if (!email) {
      return new Response(JSON.stringify({ error: 'Sem email' }), { status: 400 });
    }

    // ativa acesso
    const { error } = await sb.rpc('activate_access_by_email', {
      email_input: email,
      days: 30,
      limit_per_day: 10
    });

    if (error) {
      console.error(error);
      return new Response(JSON.stringify({ error }), { status: 500 });
    }

    return new Response(JSON.stringify({ success: true, email }), { status: 200 });

  } catch (err) {
    console.error('ERRO WEBHOOK:', err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
