import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  try {
    const body = req.body;

    console.log('WEBHOOK TICTO RECEBIDO:', JSON.stringify(body, null, 2));

    // tenta pegar o email de várias formas
    const email =
  body?.customer?.email ||
  body?.buyer?.email ||
  body?.client?.email ||
  body?.data?.customer?.email ||
  body?.data?.buyer?.email ||
  body?.email;

    if (!email) {
      console.log('EMAIL NÃO ENCONTRADO NO WEBHOOK');
      return res.status(400).json({ error: 'Sem email' });
    }

    console.log('EMAIL CAPTURADO:', email);

    const { error } = await sb.rpc('activate_access_by_email', {
  target_email: email,
  days: 30,
  limit_per_day: 10
});

    if (error) {
      console.error('ERRO AO ATIVAR:', error);
      return res.status(500).json({ error });
    }

    console.log('ACESSO ATIVADO PARA:', email);

    return res.status(200).json({ success: true });

  } catch (err) {
    console.error('ERRO WEBHOOK:', err);
    return res.status(500).json({ error: err.message });
  }
}
