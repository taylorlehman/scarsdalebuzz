// CONNECT YOUR AGENT PAGE
// Agent picker + copy buttons. The MCP URL follows the current origin so the
// staging site shows the staging server.

document.addEventListener('DOMContentLoaded', () => {
    const yearElement = document.getElementById('year');
    if (yearElement) yearElement.textContent = new Date().getFullYear();

    const isLocal = ['localhost', '127.0.0.1'].includes(window.location.hostname) || window.location.protocol === 'file:';
    const mcpUrl = isLocal ? 'https://scarsdalebuzz.com/mcp' : `${window.location.origin}/mcp`;
    document.querySelectorAll('.mcp-url').forEach((el) => { el.textContent = mcpUrl; });

    // --- Copy buttons ---
    const copyText = (text, button) => {
        navigator.clipboard.writeText(text).then(() => {
            const original = button.textContent;
            button.textContent = 'Copied!';
            setTimeout(() => { button.textContent = original; }, 1800);
        }).catch(() => {
            window.prompt('Copy this:', text);
        });
    };

    document.querySelectorAll('[data-copy-url]').forEach((button) => {
        button.addEventListener('click', () => copyText(mcpUrl, button));
    });

    // Every code block gets its own copy button.
    document.querySelectorAll('.code-block').forEach((block) => {
        block.className = 'code-block bg-[#1A1A1A] text-[#F9F8F4] rounded-sm overflow-hidden';
        const pre = block.querySelector('pre');
        pre.className += ' px-4 pb-4 overflow-x-auto whitespace-pre';

        const bar = document.createElement('div');
        bar.className = 'flex justify-end px-2 pt-2';
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = 'Copy';
        button.className = 'text-[11px] tracking-wide uppercase text-[#CCC] border border-[#444] px-2 py-1 rounded-sm hover:text-white hover:border-[#888] transition-colors cursor-pointer';
        button.addEventListener('click', () => copyText(pre.textContent, button));
        bar.appendChild(button);
        block.insertBefore(bar, pre);
    });

    // --- Agent picker ---
    const tabs = Array.from(document.querySelectorAll('[role="tab"][data-agent]'));
    const agents = tabs.map((t) => t.dataset.agent);

    const select = (agent, { updateHash = true } = {}) => {
        if (!agents.includes(agent)) agent = agents[0];
        tabs.forEach((tab) => {
            const active = tab.dataset.agent === agent;
            tab.setAttribute('aria-selected', String(active));
            tab.tabIndex = active ? 0 : -1;
            document.getElementById(tab.getAttribute('aria-controls')).classList.toggle('hidden', !active);
        });
        if (updateHash) history.replaceState(null, '', `#${agent}`);
    };

    tabs.forEach((tab, i) => {
        tab.addEventListener('click', () => select(tab.dataset.agent));
        tab.addEventListener('keydown', (e) => {
            if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
            const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
            select(next.dataset.agent);
            next.focus();
        });
    });

    // Deep links: connect.html#codex
    select(window.location.hash.slice(1), { updateHash: false });
    window.addEventListener('hashchange', () => select(window.location.hash.slice(1), { updateHash: false }));
});
