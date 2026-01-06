// Cloudflare Worker to store data in KV
// Deploy this to Cloudflare Workers and connect a KV namespace

export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        const path = url.pathname;
        
        // CORS headers
        const corsHeaders = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
        };

        if (request.method === 'OPTIONS') {
            return new Response(null, { headers: corsHeaders });
        }

        try {
            if (path === '/artworks') {
                if (request.method === 'POST') {
                    const data = await request.json();
                    await env.ART_DATA.put('artworks', JSON.stringify(data));
                    return new Response(JSON.stringify({ success: true }), {
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                    });
                } else {
                    const data = await env.ART_DATA.get('artworks');
                    return new Response(data || '[]', {
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                    });
                }
            }

            if (path === '/poetry') {
                if (request.method === 'POST') {
                    const data = await request.json();
                    await env.ART_DATA.put('poetry', JSON.stringify(data));
                    return new Response(JSON.stringify({ success: true }), {
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                    });
                } else {
                    const data = await env.ART_DATA.get('poetry');
                    return new Response(data || '[]', {
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                    });
                }
            }

            if (path === '/site-content') {
                if (request.method === 'POST') {
                    const data = await request.json();
                    await env.ART_DATA.put('site-content', JSON.stringify(data));
                    return new Response(JSON.stringify({ success: true }), {
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                    });
                } else {
                    const data = await env.ART_DATA.get('site-content');
                    return new Response(data || '{}', {
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                    });
                }
            }

            return new Response('Not Found', { status: 404, headers: corsHeaders });
        } catch (error) {
            return new Response(JSON.stringify({ error: error.message }), {
                status: 500,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }
    }
};

