export default async function handler(req, res) {
  const { email } = req.body;

  // aqui você vai conectar no Supabase via service role
  // (depois te passo se quiser completo)

  // ideia:
  // 1. pegar 1 código onde assigned = false
  // 2. marcar como assigned = true
  // 3. retornar código

  return res.json({ code: 'EXEMPLO123' });
}
