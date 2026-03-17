// --- State ---
let links = [];

// --- Init ---
document.addEventListener('DOMContentLoaded', () => {
    fetchLinks();
    
    // Search filter
    document.getElementById('searchInput').addEventListener('input', (e) => {
        renderLinks(e.target.value);
    });

    // Forms
    document.getElementById('linkForm').addEventListener('submit', handleLinkSubmit);
    document.getElementById('geoForm').addEventListener('submit', handleGeoSubmit);
});

// --- API Calls ---
async function fetchLinks() {
    try {
        const res = await fetch('/api/links');
        links = await res.json();
        
        // Update stats
        document.getElementById('totalLinksCount').innerText = links.length;
        const totalClicks = links.reduce((sum, link) => sum + link.click_count, 0);
        document.getElementById('totalClicksCount').innerText = totalClicks;
        
        renderLinks();
    } catch (error) {
        showToast('Failed to load links', 'error');
    }
}

async function handleLinkSubmit(e) {
    e.preventDefault();
    const id = document.getElementById('linkId').value;
    const isEdit = !!id;
    
    const payload = {
        default_url: document.getElementById('defaultUrl').value,
        slug: document.getElementById('customSlug').value,
        title: document.getElementById('linkTitle').value,
        description: document.getElementById('linkDescription').value,
        thumbnail_url: document.getElementById('linkThumbnail').value,
        is_wa_redirect: document.getElementById('linkWaRedirect').checked
    };

    const url = isEdit ? `/api/links/${id}` : '/api/links';
    const method = isEdit ? 'PUT' : 'POST';

    try {
        const res = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        if (!res.ok) {
            const data = await res.json();
            throw new Error(data.error || 'Server error');
        }
        
        showToast(isEdit ? 'Link updated!' : 'Link created!');
        closeModal('createModal');
        fetchLinks();
    } catch (error) {
        showToast(error.message, 'error');
    }
}

async function deleteLink(id) {
    if (!confirm('Are you sure you want to delete this link?')) return;
    
    try {
        const res = await fetch(`/api/links/${id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Failed to delete');
        
        showToast('Link deleted');
        fetchLinks();
    } catch (error) {
        showToast(error.message, 'error');
    }
}

async function handleGeoSubmit(e) {
    e.preventDefault();
    const linkId = document.getElementById('geoLinkId').value;
    const country = document.getElementById('geoCountry').value;
    const targetUrl = document.getElementById('geoTargetUrl').value;

    try {
        const res = await fetch(`/api/links/${linkId}/geo`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ country_code: country, target_url: targetUrl })
        });
        
        if (!res.ok) throw new Error('Failed to add rule');
        
        document.getElementById('geoTargetUrl').value = '';
        fetchLinks().then(() => {
            // Re-render modal
            const updatedLink = links.find(l => l.id === linkId);
            renderGeoRules(updatedLink);
        });
        showToast('Geo rule added');
    } catch (error) {
        showToast(error.message, 'error');
    }
}

async function deleteGeoRule(linkId, geoId) {
    try {
        const res = await fetch(`/api/links/${linkId}/geo/${geoId}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Failed to delete rule');
        
        fetchLinks().then(() => {
            const updatedLink = links.find(l => l.id === linkId);
            renderGeoRules(updatedLink);
        });
        showToast('Geo rule deleted');
    } catch (error) {
        showToast(error.message, 'error');
    }
}

// --- Render UI ---
function renderLinks(searchTerm = '') {
    const tbody = document.getElementById('linksTableBody');
    tbody.innerHTML = '';
    
    let filtered = links;
    if (searchTerm) {
        const term = searchTerm.toLowerCase();
        filtered = links.filter(l => 
            l.slug.toLowerCase().includes(term) || 
            l.default_url.toLowerCase().includes(term)
        );
    }
    
    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-center py-8 text-gray">No links found.</td></tr>`;
        return;
    }
    
    filtered.forEach(link => {
        // Change prefix to wa.me as requested by user
        const shortUrl = `wa.me/${link.slug}`;
        const date = new Date(link.created_at).toLocaleDateString();
        
        // Count string
        let badges = '';
        if (link.geoRules && link.geoRules.length > 0) {
            badges += `<div class="badge mt-2">${link.geoRules.length} Geo Rules</div> `;
        }
        if (link.is_wa_redirect) {
            badges += `<div class="badge mt-2" style="background: rgba(37, 211, 102, 0.2); color: #25d366;"><i class="ri-whatsapp-line"></i> WA Redirect</div>`;
        }

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>
                <div style="font-weight: 600;">/${link.slug}</div>
                <div class="text-sm mt-2">${date}</div>
            </td>
            <td>
                <div style="max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                    <a href="${link.default_url}" target="_blank" class="text-gray">${link.default_url}</a>
                </div>
                ${badges}
            </td>
            <td>
                <div style="font-weight: 600; font-size: 16px;">${link.click_count}</div>
            </td>
            <td>
                ${link.title ? `<div class="text-sm"><b>OG:</b> ${link.title}</div>` : '<div class="text-sm text-gray">No Custom Meta</div>'}
            </td>
            <td>
                <div class="actions-row">
                    <button class="btn-icon" title="Copy URL" onclick="copyToClipboard('${shortUrl}')">
                        <i class="ri-file-copy-line"></i>
                    </button>
                    <button class="btn-icon" title="Analytics" onclick="openAnalytics('${link.id}')">
                        <i class="ri-bar-chart-fill"></i>
                    </button>
                    <button class="btn-icon" title="Geo Rules" onclick="openGeoModal('${link.id}')">
                        <i class="ri-earth-line"></i>
                    </button>
                    <button class="btn-icon" title="Edit" onclick="editLink('${link.id}')">
                        <i class="ri-pencil-line"></i>
                    </button>
                    <button class="btn-icon danger" title="Delete" onclick="deleteLink('${link.id}')">
                        <i class="ri-delete-bin-line"></i>
                    </button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function renderGeoRules(link) {
    const tbody = document.getElementById('geoRulesTableBody');
    tbody.innerHTML = '';
    
    if (!link.geoRules || link.geoRules.length === 0) {
        tbody.innerHTML = `<tr><td colspan="3" class="text-center text-gray py-4">No geo rules configured for this link.</td></tr>`;
        return;
    }
    
    link.geoRules.forEach(rule => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><div class="badge">${rule.country_code}</div></td>
            <td>
                <div style="max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                    ${rule.target_url}
                </div>
            </td>
            <td>
                <button class="btn-icon danger" onclick="deleteGeoRule('${link.id}', '${rule.id}')">
                    <i class="ri-delete-bin-line"></i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// --- Modals & Interactions ---
function openModal(id) {
    if(id === 'createModal') {
        document.getElementById('linkForm').reset();
        document.getElementById('linkId').value = '';
        document.getElementById('saveLinkBtn').innerText = 'Create Link';
        document.querySelector('#createModal h2').innerText = 'Create Shortlink';
    }
    document.getElementById(id).classList.add('active');
}

function closeModal(id) {
    document.getElementById(id).classList.remove('active');
}

function editLink(id) {
    const link = links.find(l => l.id === id);
    if(!link) return;
    
    document.getElementById('linkId').value = link.id;
    document.getElementById('defaultUrl').value = link.default_url;
    document.getElementById('customSlug').value = link.slug;
    document.getElementById('linkTitle').value = link.title || '';
    document.getElementById('linkDescription').value = link.description || '';
    document.getElementById('linkThumbnail').value = link.thumbnail_url || '';
    document.getElementById('linkWaRedirect').checked = !!link.is_wa_redirect;
    
    document.getElementById('saveLinkBtn').innerText = 'Update Link';
    document.querySelector('#createModal h2').innerText = 'Edit Shortlink';
    
    openModal('createModal');
}

function openGeoModal(id) {
    const link = links.find(l => l.id === id);
    if(!link) return;
    
    document.getElementById('geoLinkId').value = link.id;
    renderGeoRules(link);
    openModal('geoModal');
}

async function openAnalytics(id) {
    openModal('analyticsModal');
    
    try {
        const res = await fetch(`/api/links/${id}/analytics`);
        const data = await res.json();
        
        document.getElementById('analyticsTotalClicks').innerText = data.total_clicks;
        
        // Country Breakdown
        const clist = document.getElementById('countryBreakdownList');
        clist.innerHTML = '';
        
        if (data.country_breakdown.length === 0) {
            clist.innerHTML = '<div class="text-gray text-center py-4">No clicks yet</div>';
        } else {
            const maxVal = Math.max(...data.country_breakdown.map(c => c.count));
            data.country_breakdown.slice(0, 5).forEach(c => {
                const pct = (c.count / maxVal) * 100;
                clist.innerHTML += `
                    <div class="country-item">
                        <div style="width: 120px;">${c.country}</div>
                        <div class="country-bar"><div class="country-fill" style="width: ${pct}%"></div></div>
                        <div style="font-weight: 600;">${c.count}</div>
                    </div>
                `;
            });
        }
        
        // Recent Clicks
        const tbody = document.getElementById('recentClicksTableBody');
        tbody.innerHTML = '';
        
        if (data.recent_clicks.length === 0) {
            tbody.innerHTML = `<tr><td colspan="4" class="text-center text-gray py-4">No clicks recorded.</td></tr>`;
        } else {
            data.recent_clicks.forEach(click => {
                const date = new Date(click.created_at).toLocaleString();
                tbody.innerHTML += `
                    <tr>
                        <td class="text-sm">${date}</td>
                        <td>${click.country || 'Unknown'}</td>
                        <td class="text-sm text-gray">${click.ip}</td>
                        <td class="text-sm" style="max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${click.user_agent}</td>
                    </tr>
                `;
            });
        }
        
    } catch (error) {
        showToast('Failed to load analytics', 'error');
        closeModal('analyticsModal');
    }
}

function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        showToast('URL Copied to clipboard!');
    }).catch(() => {
        showToast('Failed to copy', 'error');
    });
}

function showToast(msg, type = 'success') {
    const toast = document.getElementById('toast');
    toast.innerText = msg;
    toast.className = `toast show ${type === 'error' ? 'error' : ''}`;
    
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}
