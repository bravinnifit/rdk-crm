const axios = require('axios');
const { createClient } = require('@supabase/supabase-js'); // Corrigido aqui

exports.handler = async (event, context) => {
    // Usamos as variáveis do Netlify para segurança total
    const { 
        SUPABASE_URL, 
        SUPABASE_SERVICE_ROLE_KEY, 
        BLING_CLIENT_ID, 
        BLING_CLIENT_SECRET, 
        BLING_REFRESH_TOKEN 
    } = process.env;

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    try {
        // 1. RENOVA O TOKEN DO BLING
        const auth = Buffer.from(`${BLING_CLIENT_ID}:${BLING_CLIENT_SECRET}`).toString('base64');
        const tokenRes = await axios.post('https://www.bling.com.br/Api/v3/oauth/token', 
            `grant_type=refresh_token&refresh_token=${BLING_REFRESH_TOKEN}`, 
            { headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' } }
        );
        
        const accessToken = tokenRes.data.access_token;

        // 2. BUSCA PEDIDOS RECENTES (Últimas 24h)
        const pedidosRes = await axios.get('https://www.bling.com.br/Api/v3/pedidos/vendas?pagina=1&limite=50', {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });

        const pedidos = pedidosRes.data.data || [];
        let processados = 0;

        for (const p of pedidos) {
            const vId = p.vendedor?.id?.toString();
            if (!vId) continue;

            // Insere/Atualiza Afiliado
            await supabase.from('afiliados').upsert({ 
                bling_vendedor_id: vId,
                nome_real: p.vendedor.nome || 'Novo Afiliado',
                status_ativacao: 'Pendente de Cadastro'
            }, { onConflict: 'bling_vendedor_id', ignoreDuplicates: true });

            // Insere/Atualiza Venda
            await supabase.from('vendas_consolidadas').upsert({
                id_pedido_bling: p.id.toString(),
                fk_bling_vendedor_id: vId,
                valor_venda: p.total,
                status_pedido: p.situacao.valor || 'Em aberto',
                data_venda: p.data,
                canal_venda: 'TikTok Shop'
            });
            processados++;
        }

        return {
            statusCode: 200,
            body: JSON.stringify({ message: `Sincronizado com sucesso! ${processados} pedidos processados.` })
        };

    } catch (error) {
        console.error(error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: "Erro na sincronização", details: error.message })
        };
    }
};
