console.log('WEBHOOK TICTO RECEBIDO:', JSON.stringify(req.body, null, 2));

import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const PLAN_COINS = {
  cs_5moedas: 5,
  cs_20moedas: 20,
  cs_50moedas: 50,
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const secret = process.env.CS_WEBHOOK_SECRET;
    if (secret) {
      const signature =
        req.headers['x-checkoutseguro-signature'] ||
        req.headers['x-webhook-signature'];

      if (signature) {
        const bodyRaw = JSON.stringify(req.body || {});
        const hmac = crypto.createHmac('sha256', secret).update(bodyRaw).digest('hex');
        const trusted = `sha256=${hmac}`;

        if (signature !== trusted) {
          console.error('[webhook-cs] assinatura inválida');
          return res.status(401).json({ error: 'Assinatura inválida' });
        }
      }
    }

    const body = req.body || {};

    const userId =
      body.uid ||
      body.user_id ||
      body.metadata?.uid ||
      body.customer?.uid ||
      null;

    const email =
      body.email ||
      body.customer_email ||
      body.customer?.email ||
      body.metadata?.email ||
      null;

    const priceId =
      body.ref ||
      body.plan_ref ||
      body.metadata?.ref ||
      null;

    const coinsRaw =
      body.coins ||
      body.metadata?.coins ||
      null;

    const statusRaw =
      body.status ||
      body.payment_status ||
      body.situation ||
      'paid';

    const orderId =
      body.order_id ||
      body.transaction_id ||
      body.id ||
      body.payment_id ||
      null;

    const status = String(statusRaw).toLowerCase();
    const isPaid = ['paid', 'approved', 'completed', 'confirmed'].includes(status);

    if (!isPaid) {
      console.log('[webhook-cs] status ignorado:', statusRaw);
      return res.status(200).json({ received: true, skipped: true });
    }

    if (!userId) {
      console.error('[webhook-cs] userId ausente');
      return res.status(400).json({ error: 'userId ausente' });
    }

    const coinsNum = parseInt(coinsRaw, 10) || PLAN_COINS[priceId] || 0;
    if (coinsNum <= 0) {
      console.error('[webhook-cs] coins inválido:', coinsRaw, priceId);
      return res.status(400).json({ error: 'coins inválido' });
    }

    // idempotência
    if (orderId) {
      const { data: existingPayment } = await sb
        .from('payments')
        .select('id,status')
        .eq('provider_order_id', orderId)
        .maybeSingle();

      if (existingPayment?.status === 'completed') {
        console.log('[webhook-cs] pedido já processado:', orderId);
        return res.status(200).json({ received: true, duplicate: true });
      }
    }

    // busca wallet
    const { data: walletRow, error: walletErr } = await sb
      .from('wallets')
      .select('coins')
      .eq('user_id', userId)
      .maybeSingle();

    if (walletErr) {
      console.error('[webhook-cs] erro buscando wallet:', walletErr.message);
      return res.status(500).json({ error: 'Erro ao localizar wallet' });
    }

    let newBalance = coinsNum;

    if (!walletRow) {
      const { error: insertWalletErr } = await sb
        .from('wallets')
        .insert({
          user_id: userId,
          coins: coinsNum
        });

      if (insertWalletErr) {
        console.error('[webhook-cs] erro criando wallet:', insertWalletErr.message);
        return res.status(500).json({ error: 'Erro ao criar wallet' });
      }
    } else {
      newBalance = Number(walletRow.coins || 0) + coinsNum;

      const { error: updateWalletErr } = await sb
        .from('wallets')
        .update({ coins: newBalance })
        .eq('user_id', userId);

      if (updateWalletErr) {
        console.error('[webhook-cs] erro atualizando wallet:', updateWalletErr.message);
        return res.status(500).json({ error: 'Erro ao atualizar wallet' });
      }
    }

    // grava pagamento
    const paymentPayload = {
      provider: 'checkoutseguro',
      provider_order_id: orderId,
      user_id: userId,
      email: email,
      plan_ref: priceId,
      coins: coinsNum,
      amount_cents: body.amount_cents || body.amount || 0,
      status: 'completed',
      raw_payload: body,
      updated_at: new Date().toISOString()
    };

    if (orderId) {
      const { error: upsertErr } = await sb
        .from('payments')
        .upsert(paymentPayload, { onConflict: 'provider_order_id' });

      if (upsertErr) {
        console.error('[webhook-cs] erro salvando payment:', upsertErr.message);
      }
    } else {
      const { error: insertPayErr } = await sb
        .from('payments')
        .insert(paymentPayload);

      if (insertPayErr) {
        console.error('[webhook-cs] erro insert payment:', insertPayErr.message);
      }
    }

    console.log(`[webhook-cs] ${coinsNum} moedas creditadas -> ${userId}`);

    return res.status(200).json({
      received: true,
      credited: true,
      user_id: userId,
      coins: coinsNum,
      new_balance: newBalance
    });
  } catch (err) {
    console.error('[webhook-cs] erro interno:', err.message);
    return res.status(500).json({ error: 'Erro interno do webhook' });
  }
}
