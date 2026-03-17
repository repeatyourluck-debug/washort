import express from 'express';
import { nanoid } from 'nanoid';
import db from '../db.js';

const router = express.Router();

// Get all links with their stats
router.get('/links', (req, res) => {
  try {
    const links = db.prepare('SELECT * FROM links ORDER BY created_at DESC').all();
    
    // Attach geo rules and click counts for each link
    const enrichedLinks = links.map(link => {
      const geoRules = db.prepare('SELECT * FROM geo_rules WHERE link_id = ?').all(link.id);
      return { ...link, geoRules };
    });
    
    res.json(enrichedLinks);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch links' });
  }
});

// Get single link details
router.get('/links/:id', (req, res) => {
  try {
    const link = db.prepare('SELECT * FROM links WHERE id = ?').get(req.params.id);
    if (!link) return res.status(404).json({ error: 'Link not found' });
    
    const geoRules = db.prepare('SELECT * FROM geo_rules WHERE link_id = ?').all(link.id);
    res.json({ ...link, geoRules });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch link' });
  }
});

// Create new shortlink
router.post('/links', (req, res) => {
  const { slug, default_url, title, description, thumbnail_url, is_wa_redirect } = req.body;
  
  if (!default_url) {
    return res.status(400).json({ error: 'Default URL is required' });
  }

  const finalSlug = slug ? slug.trim() : nanoid(6);
  const id = nanoid(10);
  
  try {
    const stmt = db.prepare(`
      INSERT INTO links (id, slug, default_url, title, description, thumbnail_url, is_wa_redirect)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      id, 
      finalSlug, 
      default_url, 
      title || null, 
      description || null, 
      thumbnail_url || null,
      is_wa_redirect ? 1 : 0
    );
    
    res.status(201).json({ 
      id, 
      slug: finalSlug, 
      default_url,
      title,
      description,
      thumbnail_url,
      is_wa_redirect: !!is_wa_redirect
    });
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({ error: 'Slug already exists' });
    }
    console.error(error);
    res.status(500).json({ error: 'Failed to create link' });
  }
});

// Update link
router.put('/links/:id', (req, res) => {
  const { slug, default_url, title, description, thumbnail_url, is_wa_redirect } = req.body;
  const { id } = req.params;
  
  try {
    const stmt = db.prepare(`
      UPDATE links 
      SET slug = ?, default_url = ?, title = ?, description = ?, thumbnail_url = ?, is_wa_redirect = ?
      WHERE id = ?
    `);
    
    const result = stmt.run(
      slug, 
      default_url, 
      title || null, 
      description || null, 
      thumbnail_url || null, 
      is_wa_redirect ? 1 : 0, 
      id
    );
    if (result.changes === 0) return res.status(404).json({ error: 'Link not found' });
    
    res.json({ message: 'Link updated successfully' });
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({ error: 'Slug already exists' });
    }
    console.error(error);
    res.status(500).json({ error: 'Failed to update link' });
  }
});

// Delete link
router.delete('/links/:id', (req, res) => {
  try {
    const result = db.prepare('DELETE FROM links WHERE id = ?').run(req.params.id);
    if (result.changes === 0) return res.status(404).json({ error: 'Link not found' });
    
    res.json({ message: 'Link deleted' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to delete link' });
  }
});

// Add Geo Rule
router.post('/links/:id/geo', (req, res) => {
  const { country_code, target_url } = req.body;
  const link_id = req.params.id;
  const id = nanoid(10);
  
  if (!country_code || !target_url) {
    return res.status(400).json({ error: 'Country code and target URL are required' });
  }

  try {
    const stmt = db.prepare(`
      INSERT INTO geo_rules (id, link_id, country_code, target_url)
      VALUES (?, ?, ?, ?)
    `);
    stmt.run(id, link_id, country_code.toUpperCase(), target_url);
    res.status(201).json({ id, link_id, country_code: country_code.toUpperCase(), target_url });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to add geo rule' });
  }
});

// Delete Geo Rule
router.delete('/links/:id/geo/:geoId', (req, res) => {
  try {
    const result = db.prepare('DELETE FROM geo_rules WHERE id = ? AND link_id = ?')
      .run(req.params.geoId, req.params.id);
      
    if (result.changes === 0) return res.status(404).json({ error: 'Rule not found' });
    res.json({ message: 'Rule deleted' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to delete geo rule' });
  }
});

// Get Analytics
router.get('/links/:id/analytics', (req, res) => {
  try {
    const link = db.prepare('SELECT click_count FROM links WHERE id = ?').get(req.params.id);
    if (!link) return res.status(404).json({ error: 'Link not found' });

    const recentClicks = db.prepare(`
      SELECT country, ip, user_agent, created_at 
      FROM clicks 
      WHERE link_id = ? 
      ORDER BY created_at DESC 
      LIMIT 100
    `).all(req.params.id);

    const countryBreakdown = db.prepare(`
      SELECT IFNULL(country, 'Unknown') as country, COUNT(*) as count 
      FROM clicks 
      WHERE link_id = ? 
      GROUP BY country 
      ORDER BY count DESC
    `).all(req.params.id);

    res.json({
      total_clicks: link.click_count,
      country_breakdown: countryBreakdown,
      recent_clicks: recentClicks
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

export default router;
