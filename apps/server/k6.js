

import { check, group, sleep } from 'k6';
import http from 'k6/http';

// ─── CONFIGURAÇÃO ─────────────────────────────────────────────
// Troque pelo IP da máquina onde o servidor está rodando
const BASE_URL = 'http://localhost:3333';

export const options = {
    vus: 100,        // 100 usuários virtuais simultâneos
    duration: '60s', // durante 60 segundos

    // Metas de performance (thresholds)
    thresholds: {
        http_req_duration: [
            'p(95)<2000', // 95% das requisições em menos de 2s
            'p(99)<2000', // 99% das requisições em menos de 2s
            'avg<500',    // média abaixo de 500ms
        ],
        http_req_failed: ['rate<0.01'], // menos de 1% de erros
        http_reqs: ['rate>=100'],       // mínimo 100 req/s
    },
};

// ─── DADOS GLOBAIS (compartilhados entre VUs) ──────────────────
// IDs reais do banco — preencha após rodar o setup()
// Você pode pegar esses IDs rodando o setup manualmente primeiro
let ADMIN_TOKEN = '';
let USER_TOKEN = '';
let LISTING_ALUGUEL_ID = '';
let LISTING_VENDA_ID = '';
let BOOKING_ID = '';
let OFFER_ID = '';
let USER_ID_TO_SUSPEND = '';

// ─── SETUP — Roda UMA VEZ antes dos testes ────────────────────
// Cria dados base: usuário, admin, imóveis para os testes
export function setup() {
    const headers = { 'Content-Type': 'application/json' };

    // 1. Cadastrar usuário de teste (hóspede/comprador)
    const uniqueEmail = `testuser_${Date.now()}@zhivago.com`;
    const registerRes = http.post(
        `${BASE_URL}/auth/register`,
        JSON.stringify({
            name: 'Usuário Teste K6',
            email: uniqueEmail,
            password: 'senha123',
            phone: '31999999999',
        }),
        { headers }
    );
    check(registerRes, { '[SETUP] Cadastro OK (201)': (r) => r.status === 201 });
    const userData = JSON.parse(registerRes.body);
    const userToken = userData.token;
    const userId = userData.user?.id;

    // 2. Login como ADMIN (usuário criado pelo seed do Prisma)
    const adminLoginRes = http.post(
        `${BASE_URL}/auth/login`,
        JSON.stringify({
            email: 'fabiodemelo123s@outlook.com',
            password: 'eusoulost11',
        }),
        { headers }
    );
    check(adminLoginRes, { '[SETUP] Login Admin OK (200)': (r) => r.status === 200 });
    const adminToken = JSON.parse(adminLoginRes.body).token;

    // 3. Criar imóvel de ALUGUEL via admin (ou usuário comum — ambos criam com PENDING)
    const listingAluguelRes = http.post(
        `${BASE_URL}/listings`,
        JSON.stringify({
            name: 'Casa K6 Aluguel Temporada',
            description: 'Imóvel criado pelo script K6 para testes',
            price: 250,
            type: 'casa',
            category: 'aluguel',
            billingCycle: 'noite',
            location: 'Belo Horizonte, MG',
            bedrooms: 3,
            bathrooms: 2,
            parking: 1,
        }),
        { headers: { ...headers, Authorization: `Bearer ${adminToken}` } }
    );
    check(listingAluguelRes, { '[SETUP] Imóvel aluguel criado': (r) => r.status === 201 });
    const listingAluguelId = JSON.parse(listingAluguelRes.body).id;

    // 4. Aprovar o imóvel de aluguel (só admin pode)
    if (listingAluguelId) {
        const approveRes = http.patch(
            `${BASE_URL}/admin/listings/${listingAluguelId}/approve`,
            null,
            { headers: { Authorization: `Bearer ${adminToken}` } }
        );
        check(approveRes, { '[SETUP] Imóvel aluguel aprovado': (r) => r.status === 200 });
    }

    // 5. Criar imóvel de VENDA
    const listingVendaRes = http.post(
        `${BASE_URL}/listings`,
        JSON.stringify({
            name: 'Apartamento K6 Venda',
            description: 'Apto criado pelo K6 para testar propostas',
            price: 450000,
            type: 'apartamento',
            category: 'venda',
            location: 'São Paulo, SP',
            bedrooms: 2,
            bathrooms: 1,
            parking: 1,
        }),
        { headers: { ...headers, Authorization: `Bearer ${adminToken}` } }
    );
    check(listingVendaRes, { '[SETUP] Imóvel venda criado': (r) => r.status === 201 });
    const listingVendaId = JSON.parse(listingVendaRes.body).id;

    // Aprovar imóvel de venda
    if (listingVendaId) {
        http.patch(
            `${BASE_URL}/admin/listings/${listingVendaId}/approve`,
            null,
            { headers: { Authorization: `Bearer ${adminToken}` } }
        );
    }

    // 6. Criar uma reserva base para testes de approve/reject/cancel
    let bookingId = '';
    if (listingAluguelId) {
        const bookingRes = http.post(
            `${BASE_URL}/listings/${listingAluguelId}/bookings`,
            JSON.stringify({
                startDate: '2026-08-10T14:00:00.000Z',
                endDate: '2026-08-15T12:00:00.000Z',
            }),
            { headers: { ...headers, Authorization: `Bearer ${userToken}` } }
        );
        bookingId = JSON.parse(bookingRes.body)?.booking?.id ?? '';
    }

    // 7. Criar uma oferta base para testes de approve/reject
    let offerId = '';
    if (listingVendaId) {
        const offerRes = http.post(
            `${BASE_URL}/listings/${listingVendaId}/offers`,
            JSON.stringify({ value: 430000, paymentMethod: 'financing' }),
            { headers: { ...headers, Authorization: `Bearer ${userToken}` } }
        );
        offerId = JSON.parse(offerRes.body)?.id ?? '';
    }

    // 8. Criar usuário alvo para teste de suspensão
    const suspendEmail = `suspend_target_${Date.now()}@zhivago.com`;
    const suspendRegRes = http.post(
        `${BASE_URL}/auth/register`,
        JSON.stringify({ name: 'Alvo Suspensão', email: suspendEmail, password: 'senha123' }),
        { headers }
    );
    const suspendUserId = JSON.parse(suspendRegRes.body)?.user?.id ?? '';

    console.log('✅ Setup concluído.');
    console.log(`   USER TOKEN: ${userToken?.slice(0, 20)}...`);
    console.log(`   ADMIN TOKEN: ${adminToken?.slice(0, 20)}...`);
    console.log(`   LISTING ALUGUEL ID: ${listingAluguelId}`);
    console.log(`   LISTING VENDA ID: ${listingVendaId}`);
    console.log(`   BOOKING ID: ${bookingId}`);
    console.log(`   OFFER ID: ${offerId}`);

    return {
        userToken,
        adminToken,
        userId,
        listingAluguelId,
        listingVendaId,
        bookingId,
        offerId,
        suspendUserId,
    };
}

// ─── CENÁRIO PRINCIPAL (roda para cada VU a cada iteração) ────
export default function (data) {
    const headers = { 'Content-Type': 'application/json' };
    const authHeaders = { ...headers, Authorization: `Bearer ${data.userToken}` };
    const adminHeaders = { ...headers, Authorization: `Bearer ${data.adminToken}` };

    // ── GRUPO 1: AUTENTICAÇÃO ────────────────────────────────────
    group('1. Autenticação', () => {

        // Cenário 1 — Cadastro único (e-mail único por VU + timestamp)
        group('Cadastro único', () => {
            const email = `vu_${__VU}_${Date.now()}@zhivago.com`;
            const res = http.post(
                `${BASE_URL}/auth/register`,
                JSON.stringify({ name: 'VU Teste', email, password: 'senha123' }),
                { headers }
            );
            check(res, { '[1.1] Cadastro retorna 201': (r) => r.status === 201 });
        });

        // Cenário 2 — Login JWT válido
        group('Login JWT', () => {
            const res = http.post(
                `${BASE_URL}/auth/login`,
                JSON.stringify({ email: 'fabiodemelo123s@outlook.com', password: 'eusoulost11' }),
                { headers }
            );
            check(res, {
                '[1.2] Login retorna 200': (r) => r.status === 200,
                '[1.2] Resposta tem token': (r) => JSON.parse(r.body).token !== undefined,
            });
        });

        // Cenário 3 — Login inválido → deve retornar 401
        group('Login inválido → 401', () => {
            const res = http.post(
                `${BASE_URL}/auth/login`,
                JSON.stringify({ email: 'naoexiste@zhivago.com', password: 'senhaerrada' }),
                { headers }
            );
            check(res, { '[1.3] Login inválido retorna 401': (r) => r.status === 401 });
        });

        // Cenário 4 — Recuperação de senha (e-mail inexistente deve responder igual)
        group('Recuperação de senha', () => {
            const res = http.post(
                `${BASE_URL}/auth/forgot-password`,
                JSON.stringify({ email: 'qualquer@zhivago.com' }),
                { headers }
            );
            check(res, {
                '[1.4] Forgot-password retorna 200': (r) => r.status === 200,
                '[1.4] Resposta genérica (message uniformity)': (r) =>
                    JSON.parse(r.body).message !== undefined,
            });
        });

        // Cenário 5 — GET /auth/me com token válido
        group('Auth me', () => {
            const res = http.get(`${BASE_URL}/auth/me`, { headers: authHeaders });
            check(res, { '[1.5] /auth/me retorna 200': (r) => r.status === 200 });
        });

    });

    sleep(0.5);

    // ── GRUPO 2: IMÓVEIS & ADMIN ──────────────────────────────────
    group('2. Imóveis & Admin', () => {

        // Cenário 6 — Listar imóveis aprovados (público)
        group('Listar imóveis', () => {
            const res = http.get(`${BASE_URL}/listings`);
            check(res, { '[2.1] GET /listings retorna 200': (r) => r.status === 200 });
        });

        // Cenário 7 — Detalhe do imóvel
        group('Detalhe do imóvel', () => {
            if (!data.listingAluguelId) return;
            const res = http.get(`${BASE_URL}/listings/${data.listingAluguelId}`);
            check(res, { '[2.2] GET /listings/:id retorna 200': (r) => r.status === 200 });
        });

        // Cenário 8 — Admin: listar todos os imóveis (PENDING incluso)
        group('Admin listar imóveis', () => {
            const res = http.get(`${BASE_URL}/admin/listings`, { headers: adminHeaders });
            check(res, { '[2.3] GET /admin/listings retorna 200': (r) => r.status === 200 });
        });

        // Cenário 9 — Admin: estatísticas gerais
        group('Admin stats', () => {
            const res = http.get(`${BASE_URL}/admin/stats`, { headers: adminHeaders });
            check(res, { '[2.4] GET /admin/stats retorna 200': (r) => r.status === 200 });
        });

        // Cenário 10 — Admin: rota protegida sem JWT → deve retornar 401/403
        group('/admin sem JWT → 401 ou 403', () => {
            const res = http.get(`${BASE_URL}/admin/stats`); // sem token
            check(res, {
                '[2.5] /admin sem JWT bloqueado': (r) => r.status === 401 || r.status === 403,
            });
        });

    });

    sleep(0.5);

    // ── GRUPO 3: RESERVAS ─────────────────────────────────────────
    group('3. Reservas', () => {

        // Cenário 11 — Criar reserva em datas livres → 201
        group('Datas livres → 201', () => {
            if (!data.listingAluguelId) return;

            // Cada VU usa datas diferentes para não colidir
            const startDay = 20 + (__VU % 5);
            const endDay = startDay + 2;
            const res = http.post(
                `${BASE_URL}/listings/${data.listingAluguelId}/bookings`,
                JSON.stringify({
                    startDate: `2026-09-${String(startDay).padStart(2, '0')}T14:00:00.000Z`,
                    endDate: `2026-09-${String(endDay).padStart(2, '0')}T12:00:00.000Z`,
                }),
                { headers: authHeaders }
            );
            check(res, { '[3.1] Reserva em data livre retorna 201': (r) => r.status === 201 });
        });

        // Cenário 12 — Conflito de datas → deve retornar 400 ou 409
        group('Conflito de datas → 400/409', () => {
            if (!data.listingAluguelId) return;

            // Tenta criar reserva nas mesmas datas duas vezes seguidas
            const body = JSON.stringify({
                startDate: '2026-08-10T14:00:00.000Z',
                endDate: '2026-08-15T12:00:00.000Z',
            });

            // Primeira criação pode dar 201 ou 400 (se já existir)
            http.post(`${BASE_URL}/listings/${data.listingAluguelId}/bookings`, body, { headers: authHeaders });

            // Segunda tentativa nas mesmas datas → conflito
            const res2 = http.post(
                `${BASE_URL}/listings/${data.listingAluguelId}/bookings`,
                body,
                { headers: authHeaders }
            );
            check(res2, {
                '[3.2] Conflito de datas bloqueado (400 ou 409)': (r) =>
                    r.status === 400 || r.status === 409,
            });
        });

        // Cenário 13 — Listar reservas confirmadas do imóvel
        group('Listar reservas do imóvel', () => {
            if (!data.listingAluguelId) return;
            const res = http.get(`${BASE_URL}/listings/${data.listingAluguelId}/bookings`);
            check(res, { '[3.3] GET bookings retorna 200': (r) => r.status === 200 });
        });

        // Cenário 14 — Aprovar reserva existente
        group('Confirmar reserva', () => {
            if (!data.bookingId) return;
            const res = http.patch(
                `${BASE_URL}/bookings/${data.bookingId}/approve`,
                null,
                { headers: adminHeaders }
            );
            // 200 = aprovado, 403 = sem permissão (esperado se admin não é dono)
            check(res, {
                '[3.4] Aprovar reserva: 200 ou 403': (r) => r.status === 200 || r.status === 403,
            });
        });

        // Cenário 15 — Cancelamento pelo hóspede
        group('Cancelamento pelo hóspede', () => {
            if (!data.listingAluguelId) return;

            // Criar uma reserva nova para cancelar
            const createRes = http.post(
                `${BASE_URL}/listings/${data.listingAluguelId}/bookings`,
                JSON.stringify({
                    startDate: `2026-10-0${(__VU % 5) + 1}T14:00:00.000Z`,
                    endDate: `2026-10-0${(__VU % 5) + 3}T12:00:00.000Z`,
                }),
                { headers: authHeaders }
            );

            const bookingId = JSON.parse(createRes.body)?.booking?.id;
            if (!bookingId) return;

            const cancelRes = http.patch(
                `${BASE_URL}/bookings/${bookingId}/cancel`,
                null,
                { headers: authHeaders }
            );
            check(cancelRes, { '[3.5] Cancelar reserva retorna 200': (r) => r.status === 200 });
        });

    });

    sleep(0.5);

    // ── GRUPO 4: OFERTAS DE COMPRA ────────────────────────────────
    group('4. Ofertas', () => {

        // Cenário 16 — Enviar proposta para imóvel de venda
        group('Proposta enviada → 201', () => {
            if (!data.listingVendaId) return;
            const res = http.post(
                `${BASE_URL}/listings/${data.listingVendaId}/offers`,
                JSON.stringify({ value: 440000 + __VU * 1000, paymentMethod: 'cash' }),
                { headers: authHeaders }
            );
            check(res, {
                '[4.1] Criar oferta retorna 201 ou 400': (r) =>
                    r.status === 201 || r.status === 400, // 400 se SOLD
            });
        });

        // Cenário 17 — Imóvel SOLD → não aceita nova proposta
        group('Imóvel SOLD → 400', () => {
            // Tenta criar oferta no imóvel de venda que pode já estar SOLD
            if (!data.listingVendaId) return;
            const res = http.post(
                `${BASE_URL}/listings/${data.listingVendaId}/offers`,
                JSON.stringify({ value: 999999, paymentMethod: 'cash' }),
                { headers: authHeaders }
            );
            // Deve ser 201 (ainda disponível) ou 400 (SOLD)
            check(res, {
                '[4.2] Proposta em imóvel SOLD → 400 ou 201': (r) =>
                    r.status === 400 || r.status === 201,
            });
        });

        // Cenário 18 — Aceitar oferta (owner/admin) → imóvel vai para SOLD automaticamente
        group('Aceitar oferta → SOLD automático', () => {
            if (!data.offerId) return;
            const res = http.patch(
                `${BASE_URL}/offers/${data.offerId}/approve`,
                null,
                { headers: adminHeaders }
            );
            check(res, {
                '[4.3] Aceitar oferta: 200 ou 403': (r) => r.status === 200 || r.status === 403,
            });
        });

        // Cenário 19 — Recusar oferta
        group('Recusar oferta', () => {
            if (!data.listingVendaId) return;

            // Cria nova oferta para recusar
            const createRes = http.post(
                `${BASE_URL}/listings/${data.listingVendaId}/offers`,
                JSON.stringify({ value: 300000, paymentMethod: 'installment' }),
                { headers: authHeaders }
            );

            const offerId = JSON.parse(createRes.body)?.id;
            if (!offerId) return;

            const rejectRes = http.patch(
                `${BASE_URL}/offers/${offerId}/reject`,
                null,
                { headers: adminHeaders }
            );
            check(rejectRes, {
                '[4.4] Recusar oferta: 200 ou 403': (r) => r.status === 200 || r.status === 403,
            });
        });

    });

    sleep(0.5);

    // ── GRUPO 5: SEGURANÇA ────────────────────────────────────────
    group('5. Segurança', () => {

        // Cenário 20 — Rota admin sem JWT → 401 ou 403
        group('/admin sem JWT → 401/403', () => {
            const res = http.get(`${BASE_URL}/admin/users`);
            check(res, {
                '[5.1] /admin/users sem token bloqueado': (r) => r.status === 401 || r.status === 403,
            });
        });

        // Cenário 21 — Rota admin com token de usuário comum → 403
        group('/admin com token de usuário → 403', () => {
            const res = http.get(`${BASE_URL}/admin/users`, { headers: authHeaders });
            check(res, {
                '[5.2] /admin/users com user token → 403': (r) => r.status === 403,
            });
        });

        // Cenário 22 — Suspensão de usuário pelo admin
        group('Suspensão de usuário', () => {
            if (!data.suspendUserId) return;
            const res = http.patch(
                `${BASE_URL}/admin/users/${data.suspendUserId}/status`,
                JSON.stringify({ status: 'SUSPENDED' }),
                { headers: adminHeaders }
            );
            check(res, {
                '[5.3] Suspender usuário: 200': (r) => r.status === 200,
            });
        });

        // Cenário 23 — Login com conta SUSPENDED → 403
        group('Login conta BANNED → 403', () => {
            // Criar e banir um usuário temporário
            const email = `banned_${__VU}_${Date.now()}@zhivago.com`;
            const regRes = http.post(
                `${BASE_URL}/auth/register`,
                JSON.stringify({ name: 'Conta Banir', email, password: 'senha123' }),
                { headers }
            );
            const bannedUserId = JSON.parse(regRes.body)?.user?.id;

            if (bannedUserId) {
                // Bane o usuário
                http.patch(
                    `${BASE_URL}/admin/users/${bannedUserId}/status`,
                    JSON.stringify({ status: 'BANNED' }),
                    { headers: adminHeaders }
                );

                // Tenta logar com conta banida
                const loginRes = http.post(
                    `${BASE_URL}/auth/login`,
                    JSON.stringify({ email, password: 'senha123' }),
                    { headers }
                );
                check(loginRes, {
                    '[5.4] Login conta BANNED → 403': (r) => r.status === 403,
                });
            }
        });

        // Cenário 24 — Message Uniformity: e-mail inexistente retorna 401 (mesmo que senha errada)
        group('Message Uniformity', () => {
            const resEmailErrado = http.post(
                `${BASE_URL}/auth/login`,
                JSON.stringify({ email: 'naoexiste_nunca@zhivago.com', password: 'qualquer' }),
                { headers }
            );
            const resSenhaErrada = http.post(
                `${BASE_URL}/auth/login`,
                JSON.stringify({ email: 'fabiodemelo123s@outlook.com', password: 'senhaerrada' }),
                { headers }
            );
            check(resEmailErrado, { '[5.5a] E-mail inex. → 401': (r) => r.status === 401 });
            check(resSenhaErrada, { '[5.5b] Senha errada → 401': (r) => r.status === 401 });
        });

        // Cenário 25 — Tentar editar imóvel de outro usuário → 403
        group('Editar imóvel alheio → 403', () => {
            if (!data.listingAluguelId) return;
            const res = http.put(
                `${BASE_URL}/listings/${data.listingAluguelId}`,
                JSON.stringify({ name: 'Invasão', price: 1 }),
                { headers: authHeaders } // usuário comum, não é dono
            );
            check(res, {
                '[5.6] Editar imóvel alheio → 403': (r) => r.status === 403,
            });
        });

    });

    sleep(0.5);

    // ── GRUPO 6: HEALTH & PERFORMANCE ────────────────────────────
    group('6. Health & Performance', () => {

        // Cenário 26 — Health check da API
        group('Health check', () => {
            const res = http.get(`${BASE_URL}/hello`);
            check(res, {
                '[6.1] /hello retorna 200': (r) => r.status === 200,
                '[6.1] Latência < 200ms': (r) => r.timings.duration < 200,
            });
        });

        // Dashboard financeiro do usuário
        group('Dashboard financeiro', () => {
            const res = http.get(`${BASE_URL}/users/me/stats`, { headers: authHeaders });
            check(res, { '[6.2] /users/me/stats retorna 200': (r) => r.status === 200 });
        });

        // Minhas viagens (bookings do hóspede)
        group('Minhas viagens', () => {
            const res = http.get(`${BASE_URL}/users/me/bookings`, { headers: authHeaders });
            check(res, { '[6.3] /users/me/bookings retorna 200': (r) => r.status === 200 });
        });

        // Reservas recebidas (anfitrião)
        group('Reservas recebidas', () => {
            const res = http.get(`${BASE_URL}/users/me/received-bookings`, { headers: authHeaders });
            check(res, { '[6.4] /users/me/received-bookings retorna 200': (r) => r.status === 200 });
        });

    });

    sleep(1);
}

// ─── TEARDOWN — Roda UMA VEZ depois dos testes ────────────────
export function teardown(data) {
    console.log('🏁 Teste finalizado.');
    console.log(`   Imóvel aluguel testado: ${data.listingAluguelId}`);
    console.log(`   Imóvel venda testado: ${data.listingVendaId}`);
}