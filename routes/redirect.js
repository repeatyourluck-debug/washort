import express from 'express';
import fetch from 'node-fetch';
import db from '../db.js';

const router = express.Router();

// Fallback image if custom thumbnail is not provided
const DEFAULT_THUMBNAIL = 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=2564&auto=format&fit=crop';

router.get('/:slug', async (req, res) => {
  const { slug } = req.params;

  try {
    // 1. Look up slug in DB
    const linkQuery = db.prepare('SELECT * FROM links WHERE slug = ?').get(slug);
    
    // Serve our 404 page or simple text if link is invalid
    if (!linkQuery) {
      return res.status(404).send(`
        <html>
          <head>
            <title>Link Not Found</title>
            <style>
              body { font-family: 'Inter', sans-serif; background: #0f172a; color: white; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
              .box { background: #1e293b; padding: 40px; border-radius: 16px; text-align: center; border: 1px solid #334155; }
              h1 { margin: 0 0 10px 0; color: #f87171; }
              p { margin: 0; color: #94a3b8; }
            </style>
          </head>
          <body>
            <div class="box">
              <h1>Link Not Found</h1>
              <p>The shortlink you are looking for does not exist.</p>
            </div>
          </body>
        </html>
      `);
    }

    // Prepare default config
    let finalUrl = linkQuery.default_url;
    let visitorCountry = null;
    let visitorIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'] || 'Unknown';

    // In local dev, IPv6 loopback comes up as ::1, let's substitute a test IP for geolocation testing if requested
    // You can force an IP for testing by sending ?test_ip=x.x.x.x
    if (req.query.test_ip) {
      visitorIp = req.query.test_ip;
    } else if (visitorIp === '::1' || visitorIp === '127.0.0.1') {
      // Use Google's DNS IP just for local testing, otherwise geolocation fails
      visitorIp = '8.8.8.8'; 
    }

    // Clean IP list if it's comma-separated (from proxies)
    if (visitorIp && visitorIp.includes(',')) {
      visitorIp = visitorIp.split(',')[0].trim();
    }

    // 2. Detect visitor country via ip-api.com
    try {
      const geoResp = await fetch(`http://ip-api.com/json/${visitorIp}?fields=countryCode`);
      if (geoResp.ok) {
        const geoData = await geoResp.json();
        if (geoData.countryCode) {
          visitorCountry = geoData.countryCode;
        }
      }
    } catch (err) {
      console.error('Geo detection failed:', err.message);
    }

    // 3. Check geo_rules for matching country
    if (visitorCountry) {
      const rule = db.prepare('SELECT target_url FROM geo_rules WHERE link_id = ? AND country_code = ?')
        .get(linkQuery.id, visitorCountry.toUpperCase());
        
      if (rule && rule.target_url) {
        finalUrl = rule.target_url;
      }
    }

    // 4. Log the click
    try {
      db.prepare(`
        INSERT INTO clicks (link_id, country, ip, user_agent)
        VALUES (?, ?, ?, ?)
      `).run(linkQuery.id, visitorCountry, visitorIp, userAgent);
      
      db.prepare(`
        UPDATE links SET click_count = click_count + 1 WHERE id = ?
      `).run(linkQuery.id);
    } catch (dbErr) {
      console.error('Click logging failed:', dbErr);
      // Proceed with redirect even if logging fails
    }

    // 5. Ensure final URL is absolute
    if (!finalUrl.startsWith('http://') && !finalUrl.startsWith('https://')) {
      finalUrl = 'https://' + finalUrl;
    }

    // 6. Return HTML based on redirect style
    const title = linkQuery.title || `Shortlink - ${slug}`;
    const description = linkQuery.description || `Click to continue to ${finalUrl}`;
    const thumbnail = linkQuery.thumbnail_url || DEFAULT_THUMBNAIL;
    
    let htmlResponse = '';

    if (linkQuery.is_wa_redirect) {
      // WhatsApp style holding page
      htmlResponse = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>WhatsApp</title>
        <meta name="title" content="${title}">
        <meta name="description" content="${description}">
        <meta property="og:type" content="website">
        <meta property="og:url" content="${req.protocol}://${req.get('host')}/${slug}">
        <meta property="og:title" content="${title}">
        <meta property="og:description" content="${description}">
        <meta property="og:image" content="${thumbnail}">
        
        <meta http-equiv="refresh" content="2;url=${finalUrl}">
        <style>
          body { 
            margin: 0; padding: 0; 
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            background-color: #f0f2f5; 
            display: flex; flex-direction: column; align-items: center; justify-content: center; 
            height: 100vh;
          }
          .icon-wrapper {
            width: 80px; height: 80px;
            background-color: #25D366;
            border-radius: 50%;
            display: flex; align-items: center; justify-content: center;
            margin-bottom: 24px;
            box-shadow: 0 4px 12px rgba(37, 211, 102, 0.4);
            animation: pulse 2s infinite;
          }
          .icon-wrapper svg {
            width: 48px; height: 48px; fill: white;
          }
          h1 { color: #41525d; font-size: 24px; font-weight: 500; margin: 0 0 10px 0; }
          .progress-bar {
            width: 200px; height: 4px; background-color: #e9edef; border-radius: 4px; overflow: hidden;
            margin-top: 20px;
          }
          .progress {
            width: 0%; height: 100%; background-color: #00a884;
            animation: load 2s linear forwards;
          }
          @keyframes pulse {
            0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(37, 211, 102, 0.7); }
            70% { transform: scale(1); box-shadow: 0 0 0 15px rgba(37, 211, 102, 0); }
            100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(37, 211, 102, 0); }
          }
          @keyframes load {
            100% { width: 100%; }
          }
          .text-muted { color: #667781; font-size: 14px; margin-top: 20px; text-decoration: none; }
          .text-muted:hover { text-decoration: underline; }
        </style>
      </head>
      <body>
        <div class="icon-wrapper">
          <svg viewBox="0 0 24 24">
            <path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.252.38 2.456 1.05 3.513l-.865 3.161 3.238-.849c1.01.621 2.164.949 3.344.95h.001c3.181 0 5.768-2.586 5.768-5.766s-2.587-5.775-5.768-5.775zm3.225 7.94c-.177.306-.975.603-1.346.619-.368.016-.838.077-2.39-1.04-1.256-.902-2.103-2.257-2.348-2.585-.245-.327-.564-.972-.258-1.504.149-.258.33-.497.534-.727.151-.17.29-.271.438-.564.148-.293.075-.548-.037-.773-.112-.224-.962-2.313-1.317-3.167-.348-.838-.698-.724-.961-.737-.251-.012-.538-.016-.826-.016s-.754.108-1.148.536c-.394.428-1.498 1.464-1.498 3.57 0 2.106 1.534 4.143 1.748 4.428.214.285 3.016 4.607 7.306 6.46 1.02.441 1.815.704 2.434.901 1.023.326 1.956.28 2.688.17.818-.124 2.516-1.028 2.871-2.022.355-.993.355-1.844.249-2.022-.105-.178-.394-.285-.82-.499z"></path>
          </svg>
        </div>
        <h1>Loading...</h1>
        <div class="progress-bar"><div class="progress"></div></div>
        <a href="${finalUrl}" class="text-muted">Click here if not redirected</a>
        <script>
          setTimeout(function() {
            window.location.href = "${finalUrl}";
          }, 2000);
        </script>
      </body>
      </html>
      `;
    } else {
      // Standard instant redirect
      htmlResponse = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        
        <!-- Primary Meta Tags -->
        <title>${title}</title>
        <meta name="title" content="${title}">
        <meta name="description" content="${description}">
        
        <!-- Open Graph / Facebook -->
        <meta property="og:type" content="website">
        <meta property="og:url" content="${req.protocol}://${req.get('host')}/${slug}">
        <meta property="og:title" content="${title}">
        <meta property="og:description" content="${description}">
        <meta property="og:image" content="${thumbnail}">
        
        <!-- Twitter -->
        <meta property="twitter:card" content="summary_large_image">
        <meta property="twitter:url" content="${req.protocol}://${req.get('host')}/${slug}">
        <meta property="twitter:title" content="${title}">
        <meta property="twitter:description" content="${description}">
        <meta property="twitter:image" content="${thumbnail}">

        <!-- Instant Redirect -->
        <meta http-equiv="refresh" content="0;url=${finalUrl}">
        
        <style>
          body { 
            font-family: 'Inter', system-ui, -apple-system, sans-serif; 
            background: #0f172a; 
            color: white; 
            min-height: 100vh;
            margin: 0;
            display: flex; 
            flex-direction: column;
            align-items: center; 
            justify-content: center; 
          }
          .spinner {
            width: 40px;
            height: 40px;
            border: 4px solid rgba(255,255,255,0.1);
            border-left-color: #38bdf8;
            border-radius: 50%;
            animation: spin 1s linear infinite;
            margin-bottom: 20px;
          }
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
          a {
            color: #38bdf8;
            text-decoration: none;
            margin-top: 10px;
          }
          a:hover {
            text-decoration: underline;
          }
        </style>
      </head>
      <body>
        <div class="spinner"></div>
        <div>Redirecting you to the destination...</div>
        <a href="${finalUrl}">Click here if you are not redirected</a>
        
        <script>
          setTimeout(function() {
            window.location.href = "${finalUrl}";
          }, 500);
        </script>
      </body>
      </html>
      `;
    }

    res.send(htmlResponse);

  } catch (error) {
    console.error('Redirect Error:', error);
    res.status(500).send('Internal Server Error');
  }
});

export default router;
